#!/usr/bin/env python3
"""f7_frame_09_repair — rebuild the art Aeon's Sonic mapping frame $09 asks for.

WHAT THE ROW SAID AND WHAT THE BYTES SAY. The row (F7-FRAME-09-MAPPING) was
handed over as "frame $09's mapping piece list is wrong; repair the mapping".
It is not. The mapping frame is byte-faithful Sonic 3 & Knuckles data and so is
the DPLC frame that feeds it; what is missing is nineteen ART TILES that both of
them correctly name. This tool reconstructs those tiles and re-points the frame
at them, and it CHANGES NO MAPPING BYTE. The evidence, all of it re-derived on
every run rather than asserted:

  E1  The shipped mapping frame $09 is field-identical to skdisasm's
      `Map - Sonic.asm` table entry 9 (4 pieces: 3x4 @ (-5,-3), 4x2 @ (-21,-19),
      1x1 @ (11,-11), 2x2 @ (-21,-3)).
  E2  The shipped DPLC frame $09 is entry-identical to skdisasm's
      `DPLC - Sonic.asm` entry 9 with every tile base shifted by a SINGLE
      constant, 7 -- the same constant the whole tilt block $09..$10 carries, and
      each of the other tilt blocks carries its own single constant. So the
      donor sheet is S3K's frames relocated block by block.
  E3  Under that constant the donor's own art agrees with S3K's, tile for tile,
      for every frame of the block EXCEPT $09: the shape masks (which pixels are
      non-zero) match 100% for $0A..$10 and 6 of 25 for $09.
  E4  The five surviving tiles of $09's run are its LAST five. Donor tiles
      187..192 are S3K 194..199. Donor 168..186 are foreign: they are the art
      the donor's own author drew for their custom frames $C8/$C9, written ON
      TOP of S3K frame 9's tiles. Frames $C8 and $C9 load them and render clean,
      which is why the pixels look coherent and the frame does not.
  E5  S3K tiles 176..180, 182, 183, 188, 189 and 193 do not occur anywhere in
      the donor's 3,425-tile sheet under shape-mask equality. The art was
      overwritten, not moved, so it cannot be recovered by re-pointing alone.

WHAT IS RECONSTRUCTED AND WHAT IS COPIED. The donor sheet is S3K's art under a
palette-index permutation (derived here from every tile pair the DPLC tables
align, never typed). Nineteen tiles -- S3K 175..193 -- are rebuilt by applying
that permutation. The remaining six -- S3K 194..199 -- are COPIED from the
donor's own surviving bytes, not rebuilt, so the reconstruction is as small as
the evidence allows. The permutation is exact for the indices that matter: it
covers every index those nineteen tiles use, and index 5 (the one pairing the
sample never fixes) is not among them.

WHY THE WHOLE RUN IS APPENDED. The frame's 25 tiles go on the END of both art
sheets and frame $09's four DPLC entries are re-pointed IN PLACE. Entry count,
entry shape and file length are all unchanged, so no other frame's offset moves
and no other frame's bytes change. Duplicating the six surviving tiles costs
192 bytes and buys a repair with a blast radius of one frame.

Usage:
    python3 scratchpad/f7_frame_09_repair.py --out DIR [--aeon-rev REV]

Reads (revision-pinned, never the working tree): the five Aeon blobs at
`--aeon-rev` via `git show`. Reads skdisasm's `Map - Sonic.asm`,
`DPLC - Sonic.asm` and `Art/Sonic.bin` from the resolved checkout. Writes only
under `--out`. Exit 0 built, 2 could not measure.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import pathlib
import re
import struct
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from suite_paths import sibling_path, sibling_path_source  # noqa: E402

TILE = 32
FRAME = 0x09
AEON_REV_DEFAULT = "b3aef93c8ec41402383806c01086be4f15f80533"

# The five Aeon blobs, by the role each plays here.
BLOBS = {
    "mappings": "games/sonic4/data/mappings/sonic.bin",
    "dplc": "games/sonic4/data/dplc/sonic.bin",
    "dplc_opt": "games/sonic4/data/dplc/optimized/sonic.bin",
    "art": "art/uncompressed/characters/sonic.bin",
    "art_opt": "art/optimized/characters/sonic.bin",
}


class Unmeasurable(Exception):
    """A precondition this tool cannot check around. LOUD, never a soft skip."""


def git_blob(repo: pathlib.Path, rev: str, path: str) -> bytes:
    r = subprocess.run(["git", "-C", str(repo), "show", f"{rev}:{path}"],
                       capture_output=True)
    if r.returncode != 0:
        raise Unmeasurable(
            f"{path} is not in {repo} at {rev}: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout


def blob_id(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


# ------------------------------------------------------------------ blob parsing


def frame_count(blob: bytes) -> int:
    return struct.unpack_from(">H", blob, 0)[0] // 2


def dplc_entries(blob: bytes, frame: int):
    """[(count, tile_start)] in enqueue order, plus the byte offset of the block."""
    off = struct.unpack_from(">H", blob, frame * 2)[0]
    n = struct.unpack_from(">H", blob, off)[0]
    ws = struct.unpack_from(">%dH" % n, blob, off + 2)
    return off, [(((w >> 12) & 0xF) + 1, w & 0x0FFF) for w in ws]


def write_dplc_entries(blob: bytearray, frame: int, entries) -> None:
    """Rewrite one frame's entries IN PLACE. Refuses any change of length."""
    off, old = dplc_entries(bytes(blob), frame)
    if len(old) != len(entries):
        raise Unmeasurable(
            f"frame ${frame:02X} would go from {len(old)} DPLC entries to "
            f"{len(entries)}; that moves every later frame's offset and this "
            f"repair is defined as in-place")
    for i, (count, start) in enumerate(entries):
        if not 1 <= count <= 16:
            raise Unmeasurable(f"DPLC entry count {count} is outside 1..16")
        if not 0 <= start <= 0x0FFF:
            raise Unmeasurable(
                f"DPLC tile start {start} does not fit the 12-bit field "
                f"(max 4095) -- the art sheet has outgrown the format")
        struct.pack_into(">H", blob, off + 2 + 2 * i, ((count - 1) << 12) | start)


def loaded_tiles(dplc: bytes, frame: int):
    _off, entries = dplc_entries(dplc, frame)
    out = []
    for count, start in entries:
        out.extend(range(start, start + count))
    return out


def loaded_bytes(art: bytes, dplc: bytes, frame: int) -> bytes:
    return b"".join(art[t * TILE:(t + 1) * TILE] for t in loaded_tiles(dplc, frame))


def mapping_pieces(blob: bytes, frame: int):
    """[(y, size, attrs, x)] -- Aeon's frame layout: 4 bbox bytes, count word,
    then 8-byte pieces of y.w / size.b / pad.b / attrs.w / x.w."""
    off = struct.unpack_from(">H", blob, frame * 2)[0]
    n = struct.unpack_from(">H", blob, off + 4)[0]
    return [struct.unpack_from(">hBBHh", blob, off + 6 + 8 * i) for i in range(n)]


# ------------------------------------------------------------------ skdisasm


def sk_mappings(path: pathlib.Path):
    """[(y, size, attrs, x)] per table entry of skdisasm's `Map - Sonic.asm`."""
    if not path.is_file():
        raise Unmeasurable(f"{path} is missing; cannot check E1")
    order, bodies, cur, in_hdr = [], {}, None, True
    for ln in path.read_text().splitlines():
        m = re.match(r"^\s*dc\.w (word_[0-9A-Fa-f]+)-Map_Sonic_", ln)
        if in_hdr and m:
            order.append(m.group(1))
            continue
        m = re.match(r"^(word_[0-9A-Fa-f]+):\s*dc\.w\s+(\d+)", ln)
        if m:
            in_hdr, cur = False, m.group(1)
            bodies[cur] = []
            continue
        m = re.match(r"^\s*dc\.b\s+(.*)$", ln)
        if m and cur is not None:
            bodies[cur].append([
                # `$E8+2` and `$F2-2` occur in this file; they are offsets, so
                # evaluate rather than parse a bare literal.
                eval(re.sub(r"\$([0-9A-Fa-f]+)", r"0x\1", tok.strip()))  # noqa: S307
                for tok in m.group(1).split(",")
            ])
    frames = []
    for lab in order:
        pieces = []
        for v in bodies.get(lab, []):
            y = v[0] - 256 if v[0] > 127 else v[0]
            x = (v[4] << 8) | v[5]
            if x > 32767:
                x -= 65536
            pieces.append((y, v[1], (v[2] << 8) | v[3], x))
        frames.append(pieces)
    if not frames:
        raise Unmeasurable(f"{path} parsed to zero frames -- re-derive the parser")
    return frames


def sk_dplc(path: pathlib.Path):
    """[(count, tile_start)] per table entry of skdisasm's `DPLC - Sonic.asm`."""
    if not path.is_file():
        raise Unmeasurable(f"{path} is missing; cannot check E2")
    order, bodies, cur, in_hdr = [], {}, None, True
    for ln in path.read_text().splitlines():
        m = re.match(r"^\s*dc\.w (word_[0-9A-Fa-f]+)-PLC_Sonic_", ln)
        if in_hdr and m:
            order.append(m.group(1))
            continue
        m = re.match(r"^(word_[0-9A-Fa-f]+):\s*dc\.w\s+(\d+)", ln)
        if m:
            in_hdr, cur = False, m.group(1)
            bodies[cur] = []
            continue
        m = re.match(r"^\s*dc\.w\s+\$([0-9A-Fa-f]+)\s*$", ln)
        if m and cur is not None:
            bodies[cur].append(int(m.group(1), 16))
    frames = [[(((w >> 12) & 0xF) + 1, w & 0x0FFF) for w in bodies.get(l, [])]
              for l in order]
    if not frames:
        raise Unmeasurable(f"{path} parsed to zero frames -- re-derive the parser")
    return frames


# ------------------------------------------------------------------ pixels


def nibbles(art: bytes, tile: int):
    o = tile * TILE
    out = []
    for k in range(TILE):
        v = art[o + k]
        out.append(v >> 4)
        out.append(v & 0xF)
    return out


def shape_mask(art: bytes, tile: int) -> int:
    """Which of a tile's 64 pixels are non-zero. Palette-independent, so it
    compares a recoloured sheet against its source."""
    m = 0
    for v in nibbles(art, tile):
        m = (m << 1) | (1 if v else 0)
    return m


def derive_permutation(art: bytes, sk_art: bytes, donor_dplc: bytes,
                       sk_plc, frames: int):
    """S3K palette index -> donor palette index, from every tile pair the two
    DPLC tables align. Returns (perm, exact, samples)."""
    na, ns = len(art) // TILE, len(sk_art) // TILE
    hist = collections.defaultdict(collections.Counter)
    seen, pairs = set(), 0
    for f in range(min(frames, len(sk_plc))):
        _off, donor = dplc_entries(donor_dplc, f)
        sk = sk_plc[f]
        if not donor or [c for c, _ in donor] != [c for c, _ in sk]:
            continue
        deltas = {s - d for (_, d), (_, s) in zip(donor, sk)}
        if len(deltas) != 1:
            continue
        for (count, d), (_, s) in zip(donor, sk):
            for k in range(count):
                i, j = d + k, s + k
                if i >= na or j >= ns or (i, j) in seen:
                    continue
                if shape_mask(art, i) != shape_mask(sk_art, j):
                    continue
                seen.add((i, j))
                pairs += 1
                for x, y in zip(nibbles(art, i), nibbles(sk_art, j)):
                    hist[y][x] += 1
    perm = {y: c.most_common(1)[0][0] for y, c in hist.items()}
    exact = {y for y, c in hist.items() if len(c) == 1}
    return perm, exact, pairs, hist


# ------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="directory to write the repaired blobs into")
    ap.add_argument("--aeon-rev", default=AEON_REV_DEFAULT,
                    help="the Aeon revision the base blobs are read from")
    args = ap.parse_args()

    try:
        aeon = sibling_path("aeon")
        sk_dir = sibling_path("skdisasm", "General", "Sprites", "Sonic")
        print("aeon      %s   (%s)" % (aeon, sibling_path_source("aeon")))
        print("skdisasm  %s" % sk_dir.parent.parent.parent)
        print("base revision %s" % args.aeon_rev)
        print()

        base = {}
        for role, path in BLOBS.items():
            data = git_blob(aeon, args.aeon_rev, path)
            base[role] = data
            print("base %-9s %s %8d  %s" % (role, blob_id(data), len(data), path))
        print()

        sk_map = sk_mappings(sk_dir / "Map - Sonic.asm")
        sk_plc = sk_dplc(sk_dir / "DPLC - Sonic.asm")
        sk_art = (sk_dir / "Art" / "Sonic.bin").read_bytes()
        if not sk_art:
            raise Unmeasurable("skdisasm's Sonic art is empty")

        nframes = frame_count(base["mappings"])

        # ---- E1: the mapping frame is faithful S3K, so it is not the defect.
        ours = [(y, size, attrs, x) for (y, size, _pad, attrs, x)
                in mapping_pieces(base["mappings"], FRAME)]
        theirs = sk_map[FRAME]
        if ours != theirs:
            raise Unmeasurable(
                "E1 FAILED: mapping frame $%02X is NOT skdisasm's entry %d.\n"
                "  aeon     %s\n  skdisasm %s\n"
                "The whole repair rests on the mapping being innocent. Stop and "
                "re-derive before changing any byte." % (FRAME, FRAME, ours, theirs))
        print("E1 mapping frame $%02X == skdisasm entry %d, %d pieces, field for field"
              % (FRAME, FRAME, len(ours)))

        # ---- E2: the DPLC frame is faithful S3K under one constant tile shift.
        _off, ours_d = dplc_entries(base["dplc"], FRAME)
        theirs_d = sk_plc[FRAME]
        if [c for c, _ in ours_d] != [c for c, _ in theirs_d]:
            raise Unmeasurable(
                "E2 FAILED: DPLC frame $%02X entry counts differ from skdisasm's "
                "(%s vs %s)" % (FRAME, ours_d, theirs_d))
        deltas = {s - d for (_, d), (_, s) in zip(ours_d, theirs_d)}
        if len(deltas) != 1:
            raise Unmeasurable(
                "E2 FAILED: DPLC frame $%02X does not carry a single tile shift "
                "against skdisasm (%s)" % (FRAME, sorted(deltas)))
        shift = deltas.pop()
        print("E2 dplc frame $%02X == skdisasm entry %d shifted by -%d, %d entries %s"
              % (FRAME, FRAME, shift, len(ours_d), ours_d))

        # ---- E3/E4: which of the frame's tiles survive in the shipped art.
        our_tiles = loaded_tiles(base["dplc"], FRAME)
        sk_tiles = [t + shift for t in our_tiles]
        survives = [shape_mask(base["art"], a) == shape_mask(sk_art, s)
                    for a, s in zip(our_tiles, sk_tiles)]
        first_kept = survives.index(True) if True in survives else len(survives)
        if any(survives[:first_kept]) or not all(survives[first_kept:]):
            raise Unmeasurable(
                "E4 FAILED: the surviving tiles of frame $%02X are not a suffix of "
                "its run (%s). The in-place repair assumes one contiguous "
                "overwrite; re-derive." % (FRAME, survives))
        lost = first_kept
        print("E3 frame $%02X: %d of %d tiles match skdisasm by shape mask"
              % (FRAME, sum(survives), len(survives)))
        print("E4 the first %d tiles (donor %d..%d) were overwritten; the last %d "
              "(donor %d..%d) survive"
              % (lost, our_tiles[0], our_tiles[lost - 1], len(survives) - lost,
                 our_tiles[lost], our_tiles[-1]))
        if lost == 0:
            raise Unmeasurable(
                "E3/E4: nothing is missing -- frame $%02X's art already matches "
                "skdisasm. There is nothing to repair here." % FRAME)

        # ---- E5: the lost tiles are nowhere in the sheet, so they must be rebuilt.
        present = set()
        for i in range(len(base["art"]) // TILE):
            present.add(shape_mask(base["art"], i))
        absent = [sk_tiles[k] for k in range(lost)
                  if shape_mask(sk_art, sk_tiles[k]) not in present]
        print("E5 %d of the %d lost tiles occur nowhere in the %d-tile sheet, so "
              "re-pointing alone cannot recover them"
              % (len(absent), lost, len(base["art"]) // TILE))
        if not absent:
            raise Unmeasurable(
                "E5: every lost tile still exists somewhere in the sheet. "
                "Re-pointing is then a smaller repair than rebuilding; stop and "
                "derive the re-point instead of appending art.")

        # ---- the palette permutation, derived rather than typed.
        perm, exact, pairs, hist = derive_permutation(
            base["art"], sk_art, base["dplc"], sk_plc, nframes)
        need = set()
        for k in range(lost):
            need.update(nibbles(sk_art, sk_tiles[k]))
        missing = sorted(i for i in need if i not in perm)
        if missing:
            raise Unmeasurable(
                "the derived palette permutation has no entry for skdisasm "
                "index(es) %s, which the lost tiles use. Reconstruction would be "
                "a guess at those pixels." % missing)
        worst = min((hist[y][perm[y]] / sum(hist[y].values()), y) for y in need)
        print("perm  derived from %d aligned tile pairs; %d of %d indices are "
              "unanimous; the lost tiles use %s and the weakest of those agrees "
              "%.3f%% (index %d)"
              % (pairs, len(exact), len(perm), sorted(need), 100 * worst[0], worst[1]))
        print("perm  = %s" % [perm.get(i) for i in range(16)])

        # ---- build the frame's 25 tiles: rebuild what is lost, COPY what survives.
        rebuilt = bytearray()
        for k, src in enumerate(sk_tiles):
            if k < lost:
                o = src * TILE
                for b in range(TILE):
                    v = sk_art[o + b]
                    rebuilt.append((perm[v >> 4] << 4) | perm[v & 0xF])
            else:
                a = our_tiles[k] * TILE
                rebuilt += base["art"][a:a + TILE]
        assert len(rebuilt) == len(our_tiles) * TILE

        # ---- patch both pairs: append the run, re-point the frame in place.
        out = {}
        for art_role, dplc_role in (("art", "dplc"), ("art_opt", "dplc_opt")):
            art = bytearray(base[art_role])
            dplc = bytearray(base[dplc_role])
            new_base = len(art) // TILE
            art += rebuilt
            _off, entries = dplc_entries(bytes(dplc), FRAME)
            # Re-point each entry at the appended run, keeping its count and its
            # position in the load order, so the frame loads the same 25 tiles in
            # the same order and every other frame is untouched.
            cursor, new_entries = new_base, []
            for count, _start in entries:
                new_entries.append((count, cursor))
                cursor += count
            write_dplc_entries(dplc, FRAME, new_entries)
            out[art_role] = bytes(art)
            out[dplc_role] = bytes(dplc)
            print("%-8s appended %d tiles at %d..%d; frame $%02X entries %s -> %s"
                  % (art_role, len(rebuilt) // TILE, new_base, cursor - 1, FRAME,
                     entries, new_entries))
        out["mappings"] = base["mappings"]

        # ---- the property that makes this a one-frame change, asserted not hoped.
        changed = []
        for f in range(nframes):
            for art_role, dplc_role in (("art", "dplc"), ("art_opt", "dplc_opt")):
                a = loaded_bytes(base[art_role], base[dplc_role], f)
                b = loaded_bytes(out[art_role], out[dplc_role], f)
                if a != b:
                    changed.append((f, art_role))
        want = [(FRAME, "art"), (FRAME, "art_opt")]
        if sorted(changed) != sorted(want):
            raise Unmeasurable(
                "the repair changes the tiles loaded by %s; it must change "
                "exactly %s" % (changed, want))
        print("verified: of %d frames x 2 sheets, the loaded tile bytes changed "
              "for frame $%02X only" % (nframes, FRAME))
        if out["mappings"] != base["mappings"]:
            raise Unmeasurable("the mappings blob must not change")
        # And the two sheets must still agree with each other frame by frame.
        for f in range(nframes):
            if loaded_bytes(out["art"], out["dplc"], f) != \
               loaded_bytes(out["art_opt"], out["dplc_opt"], f):
                raise Unmeasurable(
                    "frame $%02X loads different bytes from the uncompressed and "
                    "optimized pairs after the repair" % f)
        print("verified: the uncompressed and optimized pairs load identical bytes "
              "for all %d frames" % nframes)

        outdir = pathlib.Path(args.out)
        outdir.mkdir(parents=True, exist_ok=True)
        names = {
            "mappings": "mappings-sonic.bin",
            "dplc": "dplc-sonic.bin",
            "dplc_opt": "dplc-optimized-sonic.bin",
            "art": "art-uncompressed-sonic.bin",
            "art_opt": "art-optimized-sonic.bin",
        }
        print()
        for role, name in names.items():
            (outdir / name).write_bytes(out[role])
            mark = "UNCHANGED" if out[role] == base[role] else "repaired"
            print("%-9s %s %8d  %-9s %s"
                  % (role, blob_id(out[role]), len(out[role]), mark, outdir / name))
        return 0

    except Unmeasurable as e:
        print("UNMEASURABLE: %s" % e)
        return 2


if __name__ == "__main__":
    sys.exit(main())
