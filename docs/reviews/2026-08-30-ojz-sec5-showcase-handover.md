# Handover to aeon: the OJZ act 1 section 5 raster showcase

**Date:** 2026-08-30 · **Produced against:** aeon `1cbb66603c0ffecab6b41a9a6e517dc17674f6a8`
(`origin/master`, read through `git archive` of its object store — aeon's working tree was
never opened, read or written).

Two documents, for aeon's lane to commit into their tree:

| Path (relative to the aeon repo root) | sha256 |
|---|---|
| `games/sonic4/data/editor/effects/presets/ojz_sec5_showcase.json` | `c2e9b897af1170962f290d6bf87f3e04e9ee6b0f84e1cc031038415b0d1b913f` |
| `games/sonic4/data/editor/ojz/act1/section_5.meta.json` | `b599f780cedc8896547d919e60b50b56259d6bba99c86f31c1d054578b560045` |

Both are reproducible from this repo alone: `test/handover/ojz-sec5-showcase.test.ts` drives
Aurora's real writer and asserts the bytes verbatim. Re-run with
`AURORA_SEC5_OUT=<dir> npx vitest run test/handover/ojz-sec5-showcase.test.ts` to regenerate
them at any revision.

## The documents

```json
// games/sonic4/data/editor/effects/presets/ojz_sec5_showcase.json
{
  "bands": [
    {
      "bot": 80,
      "on": {
        "cram": {
          "addr": 80,
          "colours": [
            3748
          ]
        }
      },
      "sh": false,
      "top": 32
    }
  ],
  "id": "ojz_sec5_showcase",
  "name": "OJZ act 1 section 5 - moonlit canopy void",
  "schema": 1
}
```

```json
// games/sonic4/data/editor/ojz/act1/section_5.meta.json
{
  "bgLayoutRef": null,
  "paletteRef": null,
  "rasterRef": "ojz_sec5_showcase",
  "sceneRef": null
}
```

`rasterRef` is a **string**, not an index. Aurora's own parser nulls a non-string silently
(`core/formats/section-meta.ts`), so a numeric value would present to the author as an
assignment that did not stick — demonstrated live during this parcel: `parseSectionMeta`
turns `"rasterRef": 5` into `null` with no diagnostic, and the next save then drops the key
entirely. The build's by-name refusal is the last reader that can still see that mistake.

## What the numbers are, and how they were derived

**`addr: 80` (`$50`) = CRAM line 2, entry 8.** Genesis CRAM is 4 palette lines x 16 entries x
2 bytes, line-major, so `(line, entry)` sits at `line * 32 + entry * 2`. That is the inverse
of the two agreement rules `stream_pal_region` states in `engine/effects/raster_dsl.emp`
(`addr >> 5 == pal_line`, `(addr >> 1) & 15 == entry`), and the test asserts the round trip
rather than the literal. `80 >> 5 == 2`, `(80 >> 1) & 15 == 8`, even, and line != 0.

**Entry 8 because it is half the picture.** Independently re-measured here by decoding every
4bpp tile of `editor_bg_override.json` through its 64x64 layout, honouring the flip bits and
counting only cells whose nametable word selects palette line 2. Of 262,144 plane pixels:
entry 8 = **51.53%**, entry 10 = 14.37%, entry 9 = 11.92%, entry 3 = 7.69%. That reproduces
aeon's figures to four significant figures. Entries 10 and 9 were deliberately left alone:
adding them would repaint ~26% more and start reading as a global tint, which is the thing
a band exists to disprove.

**`3748` = `$0EA4` = (R,G,B) (2,5,7), a bright cyan-azure.** CRAM line 2 entry 8 is `$0000`
today — pure black, the void behind the forest — read from
`games/sonic4/data/generated/ojz/act1/ojz_palette.bin` (file line 1 is CRAM line 2, per
`tools/inject_editor_bg.py`; the file is byte-identical to the donor
`sonic_hack/art/palettes/OJZ.bin` the build re-copies, so the copy step does not move it).
Against black it cannot be missed, and **nothing else on line 2 is blue-dominant** — the
brown ground ramp at 3-7 and the green foliage ramp at 9-15 all have `B <= G` with `B <= 3`
— so the recoloured region cannot be mistaken for an existing colour bleeding, which is what
a pure-primary stripe would cost.

**`top: 32` / `bot: 80`: both edges on screen, with un-recoloured background above and below.**
Section 5's foreground, decoded from `section_5.tiles.bin` against `ojz_tiles.bin`, is opaque
over only 25-31% of world rows y 0-127, **completely empty** over y 128-255, and 61-81%
opaque over y 256-383 (the ground). Content stops at y 383, so the camera top is somewhere in
y 0..160; at the grounded extreme (camera top 160) screen lines 0-95 show the empty stripe,
and at the top extreme the whole frame is at least 70% open. The intersection is **screen
lines 0-95**, so both edges sit in background that is unoccluded at every camera position.
Lines 3-31 stay un-recoloured above (the fire floor is 3) and 80-95 below. The band covers
`top..bot-1` = 48 of the frame's 224 lines.

On the plane itself there was nothing to trade against: entry 8 is between 26% and 87% of
every 16-line block of the 512-line plane, so no vertical placement is starved.

## Verified against aeon's own consumer (on a scratch copy, never their tree)

`tools/` was archived at `1cbb6660` alongside the data, the two documents dropped in, and
aeon's own scripts run with `REPO` resolving to the scratch tree:

* `effects_gen.load_preset` — accepts the document (`preset ojz_sec5_showcase — 1 band(s), shape OK`).
* `effects_gen.load_section_raster_refs()` → `{5: 'ojz_sec5_showcase'}`.
* `effects_seam_gate.raster_seam_faults(...)` → **no faults**. Its section arm is no longer
  vacuous. Planting the binding on section 6 instead reproduces the case-3 refusal by name:
  *"section 6's sidecar names rasterRef 'ojz_sec5_showcase', but no preset threads
  ojz_act1_sec_raster(sec: 6)"*.
* `effects_gen.py emit` lowers the band to
  `band(top: 32, bot: 80, on: stream_cram(addr: 80, colours: [3748]), sh: 0)`, emits
  `EditorRaster_OJZ_Act1_ojz_sec5_showcase`, moves `EditorRaster_OJZ_Act1_Bindings` from
  **0 to 1**, and puts `if sec == 5 { out = EditorRaster_OJZ_Act1_ojz_sec5_showcase }` into
  the chooser.

**⚠ That closes the generator seam and nothing beyond it.** No ROM was built, no emulator was
run, no CRAM was sampled. Whether the band is visible on screen is aeon's to measure.

## Two things aeon must do when committing

1. **Re-emit the generated module.** `games/sonic4/data/generated/ojz/act1/effects_scenes.emp`
   is a committed artifact and `tools/effects_gen.py check` is a drift gate. With the two
   documents in place and the module unchanged it fails:
   *"DRIFT — ... is not what the current editor inputs generate."* Run
   `python3 tools/effects_gen.py emit` (or `tools/regenerate-level.sh`) and commit the result
   in the same commit.
2. **Order against `authored_probe`'s deletion.** A test on aeon's side asserts the repo ships
   at least one preset document, so this replacement must land *before or with* step 6's
   deletion of `authored_probe.json`.

## Two findings from driving the real save path

* **A whole-act Ctrl+S against aeon's tree rewrites 24 other JSON documents.** Classified per
  file, not counted: 22 gain only a trailing newline (Aurora's canonical file form, ruled in
  `AURORA_EFFECTS_SCHEMA.md` §8; Python's `json.dumps` emits none, so aeon's committed bytes
  predate the rule) and 2 — `section_0.meta.json`, `section_4.meta.json` — gain
  `"rasterRef": null`, which is the same state as absent. **No binary file moves**: all nine
  sections' nametables, collision and collattr re-encode byte-identically. None of the 24 is
  in this handover; they are Aurora catching aeon's older bytes up, which is aeon's call to
  take and not ours to smuggle in beside a band.
* **`RASTER_SECTION_BINDING_LIMIT`'s expiry has NOT fired and was deliberately not retired.**
  Handing files to another lane is not the same event as a sidecar existing in their tree.
  Re-read at `1cbb6660`: still exactly one `raster:` call site, still `sec: 5`, still only
  `section_0`/`section_4` sidecars and neither carrying the key. The argument, what was
  checked, and exactly what fires it are recorded in `src/core/formats/raster-binding.ts`'s
  header rather than in a lane board, because a position that lives only in a gitignored file
  does not survive a session boundary.
