// s1-io — the classic (Sonic 1) file ⇄ LevelDoc bridge (Task 7 of the disasm-
// project abstraction, spec §2.2/§2.3/§2.6). It turns a resolved set of on-disk
// paths into the hierarchical LevelDoc (`readS1Level`) and re-encodes a doc's
// dirty domains back into file buffers (`writeS1Level`). Pure core: it reads
// bytes through the injected FileAccess and returns buffers — no fs writes (that
// is Task 10's IPC). It never re-resolves: the adapter passes fully resolved
// paths (post REV-fallback / override) so the profile's *declared* paths are
// irrelevant here.
//
// ---------------------------------------------------------------------------
// The S1LevelState wrapper
// ---------------------------------------------------------------------------
// `readS1Level` returns an `S1LevelState`, not a bare LevelDoc. The state carries
// the LevelDoc plus read-side bookkeeping that `writeS1Level` needs but that must
// NOT pollute the editing model (LevelDoc stays clean — spec §2.2 "never
// flatten"). The bookkeeping is invariant across edits, so a caller (the adapter)
// can cache it at read time and re-pair it with the current doc at write time.
//
// The bookkeeping also carries `fileMtimes` (Task 10, spec §2.6): the read-time
// mtime of every source file, captured when the injected FileAccess supplies the
// optional `mtime`. It is the "expected" baseline for the guarded save's conflict
// check — the adapter exposes it on WriteResult and refreshes it after a
// successful write so back-to-back saves never spuriously conflict.
//
// ---------------------------------------------------------------------------
// Tile write contract (the subtle one — read this before touching tiles)
// ---------------------------------------------------------------------------
// A level's tile pool is built from one or more Nemesis art files (GHZ ships two)
// concatenated in profile order, then animated-art `.unc` slices blitted on top
// at their vram tile indices. On save we must reproduce the ORIGINAL per-file
// split exactly and we must NOT try to write animated-art slots back into `.nem`
// files (they never came from those files).
//
// Approach (implemented exactly as documented):
//   * read keeps `pristineTileFiles: {path, bytes(decoded), tileStart, tileCount}`
//     — the raw decoded tiles of each source `.nem`, and its [tileStart,+count)
//     span within the concatenated pool.
//   * read keeps `originalDisplayTiles` — a copy of the full pool AFTER anim blits
//     (i.e. exactly `doc.tiles` at read time) and `animOverlay` — the set of tile
//     indices covered by an anim blit, tagged with the source `.unc` path.
//   * writeS1Level('tiles') diffs `doc.tiles` against `originalDisplayTiles`
//     tile-by-tile. For every differing tile index T:
//       - if T is anim-overlaid  → WriteResult error 'animated art slots are not
//         editable in v1' (keyed to the anim source file); the tile is dropped.
//       - if T lies in a pristine file's span → patch that file's decoded copy at
//         (T-tileStart)*32.
//       - if T is neither (a zero-filled gap tile between base art and an anim
//         region) → WriteResult error; not representable.
//   * every pristine `.nem` file is then re-encoded (Nemesis) from its — possibly
//     patched — decoded copy and emitted. This preserves the two-file split. A
//     zero-edit save re-encodes the pristine bytes unchanged, so the self-check
//     (decode == pristine) always passes and the round-trip is decode-identical.
//
// ---------------------------------------------------------------------------
// Self-check gate
// ---------------------------------------------------------------------------
// Every buffer we would write is verified before it is emitted. Compressed and
// directly-encoded domains are re-decoded with the REAL decoder and deep-compared
// to the doc structure they came from (`emitCompressed` / `emitVerified`); the
// palette is the one exception — it is pure byte-placement (no codec), so its
// gate recomposes the written component files and compares, guarding offset/size
// consistency only. A mismatch (or a decoder throw) routes that file to `errors`
// instead of `files`, so a broken encoder can never silently corrupt a level. The
// three compressors are injectable (`codecs`) purely so tests can prove the gate
// fires; the decoders used for verification are always the real ones.

import type { FileAccess } from '../project/adapter';
import type { DirtyDomains } from '../project/adapter';
import type { LevelAct, PaletteComponent } from '../project/profiles/s1';
import { nemesisCompress, nemesisDecompress } from '../compress/nemesis';
import { enigmaCompress, enigmaDecompress } from '../formats/classic/enigma';
import { kosinskiCompress, kosinskiDecompress } from '../formats/kosinski';
import { decodeS1Layout, encodeS1Layout } from '../formats/classic/s1-layout';
import { decodeS1Objpos, encodeS1Objpos, type S1ObjectEntry } from '../formats/classic/s1-objpos';
import { decodeS1StartPos, encodeS1StartPos } from '../formats/classic/s1-startpos';
import { decodeS1ColInd, encodeS1ColInd } from '../formats/classic/s1-colind';
import { decodeS1CollisionShapes } from '../formats/classic/s1-collision-shapes';
import {
  unpackBlockCell,
  packBlockCell,
  unpackChunkCell,
  packChunkCell,
  type BlockDef,
  type ChunkDef256,
  type LayoutGrid,
  type LevelDoc,
} from './model';

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

/**
 * Fully resolved on-disk paths for one act, aligned with the profile act's
 * arrays (tiles[i]/palette[i]/animatedArt[i]). Anim slots may be undefined when a
 * (non-gating) animated-art file did not resolve — read skips those. The adapter
 * builds this from its resolution table so s1-io never re-resolves.
 */
export interface ResolvedLevelPaths {
  tiles: string[];
  blocks: string;
  chunks: string;
  colind: string;
  fg: string;
  bg: string;
  objpos: string;
  startpos: string;
  palette: string[];
  animatedArt: (string | undefined)[];
  collisionNormal: string;
  collisionAngleMap: string;
}

/** One source art file's decoded tiles and its span within the concatenated pool. */
interface PristineTileFile {
  path: string;
  bytes: Uint8Array; // decoded 4bpp tiles, 32 bytes/tile
  tileStart: number;
  tileCount: number;
}

/** A range of pool tile indices covered by an animated-art blit. */
interface AnimOverlay {
  path: string;
  start: number; // first tile index (== vramTileIndex)
  count: number;
}

/** Read-side bookkeeping the writer needs; invariant across edits, cacheable. */
export interface S1ReadState {
  pristineTileFiles: PristineTileFile[];
  originalDisplayTiles: Uint8Array;
  animOverlay: AnimOverlay[];
  objposOriginalLength: number;
  /**
   * The object list exactly as decoded from disk, in on-disk order. Used by the
   * writer to keep a zero-edit save byte-identical even for the rare real file
   * whose entries are not strictly X-ascending (e.g. GHZ act 3 carries one 64px
   * inversion the engine's streaming loader tolerates): when `doc.objects` still
   * equals this, the writer emits the original order untouched and only sorts
   * when the list has actually changed. See the write path for the rationale.
   */
  objposOriginal: S1ObjectEntry[];
  paletteOriginals: { component: PaletteComponent; path: string; bytes: Uint8Array }[];
  paths: ResolvedLevelPaths;
  /**
   * Read-time mtime (fs.stat `mtimeMs`) of every source file we read, keyed by
   * resolved path — the "expected" side of Task 10's guarded-save conflict check
   * (spec §2.6). Populated only when the FileAccess supplies `mtime`; otherwise
   * empty (in-memory test fakes), and the guarded write treats those files as
   * having no expected mtime. Mutated in place by the adapter's updateMtimes()
   * after a successful write so subsequent saves expect the new on-disk mtimes.
   */
  fileMtimes: Record<string, number>;
}

/** LevelDoc plus the read-side bookkeeping the writer consumes. */
export interface S1LevelState {
  doc: LevelDoc;
  read: S1ReadState;
}

/** Injectable compressors — defaults are the real codecs. Decoders stay real. */
export interface S1WriteCodecs {
  nemesisCompress: (b: Uint8Array) => Uint8Array;
  enigmaCompress: (b: Uint8Array) => Uint8Array;
  kosinskiCompress: (b: Uint8Array) => Uint8Array;
}

const REAL_CODECS: S1WriteCodecs = { nemesisCompress, enigmaCompress, kosinskiCompress };

/** Pure write result: the buffers to persist, plus per-file failures. */
export interface S1WriteResult {
  files: { path: string; bytes: Uint8Array }[];
  errors: { path: string; message: string }[];
}

// ---------------------------------------------------------------------------
// Small byte helpers
// ---------------------------------------------------------------------------

function beWord(b: Uint8Array, o: number): number {
  return ((b[o] << 8) | b[o + 1]) & 0xffff;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

export async function readS1Level(
  act: LevelAct,
  paths: ResolvedLevelPaths,
  fa: FileAccess,
): Promise<S1LevelState> {
  const sourceRefs: Record<string, string> = {};

  // Prefetch every file this read will touch in ONE batch round-trip (when the
  // FileAccess supports it). The classic read fans out ~18 mandatory files;
  // issuing them as individual awaits is ~18 sequential renderer→main round-trips
  // on the act-load critical path — the dominant load cost whenever IPC/fs
  // latency is non-trivial. `readMany` collapses that to one round-trip (main
  // reads concurrently) AND returns each file's mtime, so the guarded-save
  // baseline no longer needs its own per-file stat loop. `readBytes` then serves
  // decode from the prefetched buffers; without `readMany` (in-memory test fakes)
  // it falls back to per-file `fa.read`, so behavior is identical either way.
  const wantPaths: string[] = [
    ...paths.tiles,
    ...paths.animatedArt.filter((p): p is string => p !== undefined),
    paths.blocks, paths.chunks, paths.fg, paths.bg,
    paths.colind, paths.collisionNormal, paths.collisionAngleMap,
    ...paths.palette,
    paths.objpos, paths.startpos,
  ];
  const prefetch = fa.readMany ? await fa.readMany([...new Set(wantPaths)]) : null;
  const readBytes = async (p: string): Promise<Uint8Array> => {
    if (prefetch) {
      const e = prefetch.get(p);
      if (!e || e.bytes === null) {
        throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      }
      return e.bytes;
    }
    return fa.read(p);
  };

  // --- tiles: concat decoded .nem files, then blit animated art ------------
  const pristineTileFiles: PristineTileFile[] = [];
  let tileCursor = 0;
  for (let i = 0; i < act.tiles.length; i++) {
    const p = paths.tiles[i];
    const decoded = nemesisDecompress(await readBytes(p));
    const tileCount = Math.floor(decoded.length / 32);
    pristineTileFiles.push({ path: p, bytes: decoded, tileStart: tileCursor, tileCount });
    sourceRefs[`tiles.${i}`] = p;
    tileCursor += tileCount;
  }
  const baseLen = pristineTileFiles.reduce((n, f) => n + f.bytes.length, 0);

  const animOverlay: AnimOverlay[] = [];
  const blits: { destByte: number; slice: Uint8Array }[] = [];
  let poolLen = baseLen;
  for (let i = 0; i < act.animatedArt.length; i++) {
    const p = paths.animatedArt[i];
    if (p === undefined) continue; // non-gating anim file did not resolve — skip
    const a = act.animatedArt[i];
    const src = await readBytes(p);
    const slice = src.slice(a.srcTileOffset * 32, a.srcTileOffset * 32 + a.tileCount * 32);
    const destByte = a.vramTileIndex * 32;
    blits.push({ destByte, slice });
    animOverlay.push({ path: p, start: a.vramTileIndex, count: a.tileCount });
    poolLen = Math.max(poolLen, destByte + a.tileCount * 32);
    sourceRefs[`anim.${i}`] = p;
  }

  const tiles = new Uint8Array(poolLen);
  let off = 0;
  for (const f of pristineTileFiles) {
    tiles.set(f.bytes, off);
    off += f.bytes.length;
  }
  for (const b of blits) tiles.set(b.slice, b.destByte);

  // --- blocks: Enigma → 4 words each --------------------------------------
  const blockBytes = enigmaDecompress(await readBytes(paths.blocks));
  const blocks: BlockDef[] = [];
  for (let o = 0; o + 8 <= blockBytes.length; o += 8) {
    blocks.push({
      cells: [
        unpackBlockCell(beWord(blockBytes, o)),
        unpackBlockCell(beWord(blockBytes, o + 2)),
        unpackBlockCell(beWord(blockBytes, o + 4)),
        unpackBlockCell(beWord(blockBytes, o + 6)),
      ],
    });
  }
  sourceRefs.blocks = paths.blocks;

  // --- chunks: Kosinski → 256 words each ----------------------------------
  const chunkBytes = kosinskiDecompress(await readBytes(paths.chunks));
  const chunks: ChunkDef256[] = [];
  for (let o = 0; o + 512 <= chunkBytes.length; o += 512) {
    const cells = new Array(256);
    for (let c = 0; c < 256; c++) cells[c] = unpackChunkCell(beWord(chunkBytes, o + c * 2));
    chunks.push({ cells });
  }
  sourceRefs.chunks = paths.chunks;

  // --- fg / bg layouts (verbatim; may be irregular) ------------------------
  const fgL = decodeS1Layout(await readBytes(paths.fg));
  const bgL = decodeS1Layout(await readBytes(paths.bg));
  const fg: LayoutGrid = { width: fgL.width, height: fgL.height, cells: fgL.cells };
  const bg: LayoutGrid = { width: bgL.width, height: bgL.height, cells: bgL.cells };
  sourceRefs.fg = paths.fg;
  sourceRefs.bg = paths.bg;

  // --- collision: editable colind + read-only shape tables -----------------
  const colind = decodeS1ColInd(await readBytes(paths.colind));
  const shapes = decodeS1CollisionShapes(
    await readBytes(paths.collisionNormal),
    await readBytes(paths.collisionAngleMap),
  );
  sourceRefs.colind = paths.colind;
  sourceRefs['collision.normal'] = paths.collisionNormal;
  sourceRefs['collision.angleMap'] = paths.collisionAngleMap;

  // --- palette: compose components into a 64-word CRAM space ---------------
  const flat = new Uint16Array(64);
  const paletteOriginals: S1ReadState['paletteOriginals'] = [];
  for (let i = 0; i < act.palette.length; i++) {
    const c = act.palette[i];
    const p = paths.palette[i];
    const bytes = await readBytes(p);
    paletteOriginals.push({ component: c, path: p, bytes });
    for (let w = 0; w < c.length; w++) flat[c.destOffset + w] = beWord(bytes, (c.srcOffset + w) * 2);
    sourceRefs[`palette.${i}`] = p;
  }
  const palettes = [0, 1, 2, 3].map((l) => flat.slice(l * 16, l * 16 + 16));

  // --- objects / start -----------------------------------------------------
  const objposBytes = await readBytes(paths.objpos);
  const objects = decodeS1Objpos(objposBytes);
  const start = decodeS1StartPos(await readBytes(paths.startpos));
  sourceRefs.objpos = paths.objpos;
  sourceRefs.start = paths.startpos;

  const doc: LevelDoc = {
    game: 's1',
    tiles,
    blocks,
    chunks,
    fg,
    bg,
    collision: { colind, shapes },
    palettes,
    paletteSources: act.palette,
    objects,
    start,
    sourceRefs,
  };

  // Capture a read-time mtime for every source file (guarded-save baseline,
  // Task 10). sourceRefs enumerates every path we read, so one mtime per unique
  // path covers exactly the files a later write could touch. When we batch-read
  // (`prefetch`), each entry already carries its mtime — no extra round-trips.
  // Otherwise fall back to per-file `fa.mtime` (test fakes may omit it entirely,
  // in which case capture is skipped and every save is treated as a fresh write).
  const fileMtimes: Record<string, number> = {};
  if (prefetch) {
    for (const p of new Set(Object.values(sourceRefs))) {
      const m = prefetch.get(p)?.mtime;
      if (m !== undefined && m !== null) fileMtimes[p] = m;
    }
  } else if (fa.mtime) {
    for (const p of new Set(Object.values(sourceRefs))) {
      const m = await fa.mtime(p);
      if (m !== null) fileMtimes[p] = m;
    }
  }

  return {
    doc,
    read: {
      pristineTileFiles,
      originalDisplayTiles: tiles.slice(),
      animOverlay,
      objposOriginalLength: objposBytes.length,
      objposOriginal: objects.map((o) => ({ ...o })),
      paletteOriginals,
      paths,
      fileMtimes,
    },
  };
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

export function writeS1Level(
  state: S1LevelState,
  dirty: DirtyDomains,
  codecs: S1WriteCodecs = REAL_CODECS,
): S1WriteResult {
  const files: { path: string; bytes: Uint8Array }[] = [];
  const errors: { path: string; message: string }[] = [];
  const { doc, read } = state;

  /**
   * Self-check a compressed buffer: re-decode with the REAL decoder and compare
   * to the pre-compression bytes. Routes to files or errors accordingly.
   */
  const emitCompressed = (
    path: string,
    raw: Uint8Array,
    compress: (b: Uint8Array) => Uint8Array,
    decompress: (b: Uint8Array) => Uint8Array,
  ): void => {
    let enc: Uint8Array;
    try {
      enc = compress(raw);
      const dec = decompress(enc);
      if (!bytesEqual(dec, raw)) {
        errors.push({ path, message: 'self-check failed: re-decoded output differs from source' });
        return;
      }
    } catch (e) {
      errors.push({ path, message: `self-check failed: ${(e as Error).message}` });
      return;
    }
    files.push({ path, bytes: enc });
  };

  /**
   * Self-check a directly-encoded (uncompressed) buffer: re-decode with the REAL
   * decoder and confirm it matches the doc structure it came from. Same gate as
   * emitCompressed, for the domains whose encoder is not a compressor.
   */
  const emitVerified = <T>(
    path: string,
    enc: Uint8Array,
    decode: (b: Uint8Array) => T,
    matches: (decoded: T) => boolean,
    label: string,
  ): void => {
    const back = safeDecode(() => decode(enc));
    if (!back || !matches(back)) {
      errors.push({ path, message: `self-check failed: ${label} re-decode differs` });
      return;
    }
    files.push({ path, bytes: enc });
  };

  // --- tiles ---------------------------------------------------------------
  if (dirty.tiles) {
    const orig = read.originalDisplayTiles;
    const cur = doc.tiles;
    // Anim-overlaid tile-index → source path (last blit wins on overlap).
    const animOf = new Map<number, string>();
    for (const ov of read.animOverlay) {
      for (let t = ov.start; t < ov.start + ov.count; t++) animOf.set(t, ov.path);
    }
    // Work on patchable copies of each pristine file.
    const copies = read.pristineTileFiles.map((f) => ({ file: f, buf: f.bytes.slice() }));
    const findSpan = (t: number) => copies.find((c) => t >= c.file.tileStart && t < c.file.tileStart + c.file.tileCount);

    const animErrs = new Set<string>();
    let gapEdit = false;
    const tileCount = Math.floor(cur.length / 32);
    for (let t = 0; t < tileCount; t++) {
      const cs = cur.subarray(t * 32, t * 32 + 32);
      const os = orig.subarray(t * 32, t * 32 + 32); // zero-length past orig's end
      if (bytesEqual(cs, os)) continue;
      const animPath = animOf.get(t);
      if (animPath !== undefined) {
        animErrs.add(animPath);
        continue;
      }
      const span = findSpan(t);
      if (!span) {
        gapEdit = true;
        continue;
      }
      span.buf.set(cs, (t - span.file.tileStart) * 32);
    }

    for (const p of animErrs) {
      errors.push({ path: p, message: 'animated art slots are not editable in v1' });
    }
    if (gapEdit) {
      errors.push({
        path: read.pristineTileFiles[0]?.path ?? '<tiles>',
        message: 'edited tile lies outside any source art file (gap or appended tile — not writable in v1)',
      });
    }
    // Re-encode every pristine file (patched or not) — preserves the file split.
    for (const c of copies) {
      emitCompressed(c.file.path, c.buf, codecs.nemesisCompress, nemesisDecompress);
    }
  }

  // --- blocks --------------------------------------------------------------
  if (dirty.blocks) {
    const raw = new Uint8Array(doc.blocks.length * 8);
    doc.blocks.forEach((b, i) => {
      for (let w = 0; w < 4; w++) {
        const word = packBlockCell(b.cells[w]);
        raw[i * 8 + w * 2] = (word >> 8) & 0xff;
        raw[i * 8 + w * 2 + 1] = word & 0xff;
      }
    });
    emitCompressed(read.paths.blocks, raw, codecs.enigmaCompress, enigmaDecompress);
  }

  // --- chunks --------------------------------------------------------------
  if (dirty.chunks) {
    const raw = new Uint8Array(doc.chunks.length * 512);
    doc.chunks.forEach((ch, i) => {
      for (let c = 0; c < 256; c++) {
        const word = packChunkCell(ch.cells[c]);
        raw[i * 512 + c * 2] = (word >> 8) & 0xff;
        raw[i * 512 + c * 2 + 1] = word & 0xff;
      }
    });
    emitCompressed(read.paths.chunks, raw, codecs.kosinskiCompress, kosinskiDecompress);
  }

  // --- fg / bg (uncompressed; gate re-decodes to the grid) -----------------
  const layoutMatches = (g: LayoutGrid) => (b: { width: number; height: number; cells: Uint8Array }) =>
    b.width === g.width && b.height === g.height && bytesEqual(b.cells, g.cells);
  if (dirty.fg) {
    emitVerified(read.paths.fg, encodeS1Layout(doc.fg), decodeS1Layout, layoutMatches(doc.fg), 'layout');
  }
  if (dirty.bg) {
    emitVerified(read.paths.bg, encodeS1Layout(doc.bg), decodeS1Layout, layoutMatches(doc.bg), 'layout');
  }

  // --- objects -------------------------------------------------------------
  // S1 objpos tables are X-ordered on disk: the engine's object-position manager
  // (ObjPosLoad) streams entries left-to-right as the camera advances, so a
  // grossly out-of-order table would drop objects. The editing model does NOT
  // maintain sort order (the object tool appends new placements at the end), so
  // we sort HERE at write time — a STABLE sort by X (equal-X objects keep their
  // relative order).
  //
  // BUT not every real file is strictly X-ascending: GHZ act 3 carries one 64px
  // inversion the loader tolerates. Sorting it would break the byte-identical
  // zero-edit round-trip. So we sort ONLY when the object list has actually
  // changed from disk; an untouched list is emitted in its exact original order.
  // The self-check compares the re-decode against whichever list we emit.
  if (dirty.objects) {
    const emit = objectsEqual(doc.objects, read.objposOriginal)
      ? read.objposOriginal
      : [...doc.objects].sort((a, b) => a.x - b.x);
    emitVerified(
      read.paths.objpos,
      encodeS1Objpos(emit, read.objposOriginalLength),
      decodeS1Objpos,
      (b) => objectsEqual(b, emit),
      'objpos',
    );
  }

  // --- start ---------------------------------------------------------------
  if (dirty.start) {
    emitVerified(
      read.paths.startpos,
      encodeS1StartPos(doc.start),
      decodeS1StartPos,
      (b) => b.x === doc.start.x && b.y === doc.start.y,
      'startpos',
    );
  }

  // --- colind --------------------------------------------------------------
  if (dirty.colind) {
    emitVerified(
      read.paths.colind,
      encodeS1ColInd(doc.collision.colind),
      decodeS1ColInd,
      (b) => bytesEqual(b, doc.collision.colind),
      'colind',
    );
  }

  // --- palette: decompose into each component file, then recompose to verify.
  // NOTE: unlike every other domain this gate is pure byte-placement (no codec),
  // so it guards only offset/size consistency of the composition — not a codec.
  if (dirty.palette) {
    const flat = flattenPalettes(doc.palettes);
    const outByFile = new Map<string, Uint8Array>();
    for (const { component, path, bytes } of read.paletteOriginals) {
      const copy = outByFile.get(path)?.slice() ?? bytes.slice();
      for (let w = 0; w < component.length; w++) {
        const word = flat[component.destOffset + w];
        const bo = (component.srcOffset + w) * 2;
        copy[bo] = (word >> 8) & 0xff;
        copy[bo + 1] = word & 0xff;
      }
      outByFile.set(path, copy);
    }
    // Recompose from the produced buffers and compare to the doc palette.
    const recomposed = new Uint16Array(64);
    for (const { component, path } of read.paletteOriginals) {
      const b = outByFile.get(path)!;
      for (let w = 0; w < component.length; w++) {
        recomposed[component.destOffset + w] = beWord(b, (component.srcOffset + w) * 2);
      }
    }
    if (!u16Equal(recomposed, flat)) {
      for (const path of outByFile.keys()) {
        errors.push({ path, message: 'self-check failed: recomposed palette differs' });
      }
    } else {
      for (const [path, bytes] of outByFile) files.push({ path, bytes });
    }
  }

  return { files, errors };
}

// ---------------------------------------------------------------------------
// write helpers
// ---------------------------------------------------------------------------

function flattenPalettes(lines: Uint16Array[]): Uint16Array {
  const flat = new Uint16Array(64);
  for (let l = 0; l < lines.length && l < 4; l++) {
    for (let w = 0; w < 16 && w < lines[l].length; w++) flat[l * 16 + w] = lines[l][w];
  }
  return flat;
}

function u16Equal(a: Uint16Array, b: Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function objectsEqual(a: S1ObjectEntry[], b: S1ObjectEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.x !== y.x ||
      x.y !== y.y ||
      x.xflip !== y.xflip ||
      x.yflip !== y.yflip ||
      x.respawn !== y.respawn ||
      x.id !== y.id ||
      x.subtype !== y.subtype
    ) {
      return false;
    }
  }
  return true;
}

function safeDecode<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
