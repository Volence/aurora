# S2-DONOR-PAGE: the donor-level page (review packet, 2026-09-25)

Queue row S2-DONOR-PAGE, project REGIONS. ROADMAP row 211. Branch `parcel/s2-donor-page`, cut
from aurora master `c276f527`. Plan: `docs/superpowers/plans/2026-09-25-s2-donor-page.md`.

The owner (aeon session 2026-09-17T16:00:34Z, in aeon `docs/DEFERRED_WORK.md` under
`S2-COMPRESSED-ACT`): *"we convert the levels to our format, but then I load them on a page and
can marquee parts of it, copy it over to our layout, and paste it in as a region or something."*

## 1. Aeon revision read

Design read at aeon `origin/master` **`f4f1a32e40b6377d557f4f67fd8cec9278d5df5a`**, through git
objects only, after a fetch. Aeon moved while this parcel ran; the rows re-measured it: the
converter-blob currency row compared at `ab108383`, the fidelity rig ran at `ab108383` and again
at `3221c0c1` (final). `tools/s2_zone_convert.py` blob `ed263a94` was unchanged at all three.

### Where aeon's current text overrides the settled packet (`docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md`)

- **R12 is new**: the paste SHIFT (dst origin minus src origin) must be a multiple of 16 px. "Every
  coordinate a multiple of 8" is necessary, no longer sufficient. W1 is retired.
- **Corridors exist** (`corridors`, K1-K3) and a clip carries `severed_xover_reason` (C1's
  opt-out). The page reads and preserves both.
- **The paste half of §8 no longer matches aeon's own pipeline** (section 3 below).
- **The live aeon tree HAS `donors/s2disasm/EHZ` on this machine today**; the packet measured
  absent. Per-machine, as the packet predicted: all three states are handled, none assumed.
- Aeon's "aurora needs no new loader" is true of the file formats and false of Aurora's code:
  `loadAeonProject` starts at `project.json`, which a donor tree does not carry. The new reader is
  a thin one over parsers Aurora already had.

## 2. Slices landed (tip at the end of this packet's commit)

| Slice | Commit | What |
|---|---|---|
| Plan | `6e94bc59` | slices, proofs, the §8 contradiction |
| S1+S2 | `4eac3c86` | Donors facet: open/render a converted zone (absent/empty/present, empty state names `python3 tools/s2_zone_convert.py convert --all-six` and the root); marquee snapped outward to 8 px, clamped to `crop_tiles`, readout + census; owned fixture; vendored clip manifests; converter-blob currency row |
| S3+S4 | `79991bb1` | paste through aeon's own loader and bake, guarded write, undo/redo (Ctrl+Z routed), target pane drawn from the bake's bytes, clipact.json readout; fidelity rig; CDP harness |
| row | `73f67340` | undo-of-a-created-manifest row (red-first found the gap) |
| fixture | `3fc305e1` | fixture plants blank-sky-with-palette and flip-only collision cells (red-first found the gap) |
| harness | `12d52ea9` | a property that never arrives is that row's FAIL, not an abort |

Files: `src/core/formats/donors/{donor-tree,donor-marquee,clip-manifest-doc}.ts`,
`src/renderer/canvas/donor-compose.ts`, `src/renderer/components/donors/*`,
`src/renderer/state/{donorStore,donor-paste,donor-draft}.ts`,
`src/renderer/workspace/facets/donors-facet.tsx`, `src/main/clip-tool.ts` (+ IPC `CLIP_TOOL`,
preload), `scripts/gen-donor-fixture.mjs`, `test/fixtures/donors/`, `test/fixtures/clips/`,
`scratchpad/donor-page-harness.mjs` (`npm run harness:donor-page`), `test/live/donor-fidelity.test.ts`.

## 3. The contradiction that decided S3 (BLOCKED half, request for aeon)

Aeon's design §8 says a paste writes (1) the clip's words and both collision planes into "the
target act's section files", (2) a `regions.json` row, (3) a `clips.json` entry. Aeon's landed
rows 6 and 7 consume only (3): `tools/clip_act_bake.py` composes section files FROM the manifest
and donor trees; `tools/clip_rom_bake.py` builds region rows and presets itself (`region_plan`);
neither reads an editor act's section files, `regions.json` or `region_id` (zero hits at
`f4f1a32e`). A clip act is a re-bake of the one act slot (`S2CLIP=<id> ./build.sh`); the only
editor act is OJZ act 1, and writing Sonic 2 words into its section files would change the
canonical act and draw them through OJZ's tileset. So:

- **Landed:** the paste writes `clips.json` (after aeon's loader AND bake accept the exact bytes),
  and the "section files" requirement is met through aeon's own composer: the page runs
  `clip_act_bake.py bake --out <temp>` and draws the target act from the composed
  `section_N.tiles/collattr/collattrb/zonekey.bin`. The harness reads those bytes back from disk.
- **BLOCKED (request for aeon, carried by the overseer):** rule on §8 items 1 and 2: either retire
  them (the manifest is the whole paste) or name the act tree whose section files and
  `regions.json` a clip bake would read. Until then **`region_id` is not written** (it would name a
  row in a document that does not exist); it is read absent-capable (`s2_two_clip_pins`).

## 4. Tests added, with red-first evidence

Every mutation was applied on disk (diff shown), run against the named runner, restored from the
committed HEAD on a clean tree, and the baseline re-run green. Logs: session scratch `redfirst.log`,
`redfirst-s1-rerun.log`, `harness-redfirst.log` (summarised here).

| Row file (runner) | Mutation | Result |
|---|---|---|
| `test/formats/donor-tree.test.ts` (npm test) | S1-M1 column-major stitch; M2 absence from empty listing; M3 length check off; M4 plane B from plane A; M5 crop key optional; M6 fixture key renamed; M12b painted = non-zero words; M13 solid = non-zero words | all RED on the named row. **M12 was GREEN first**: the fixture had no palette-only blank cell; fixed in `3fc305e1`, then RED. **Proof method changed midway**, so M1-M11 and S2 were re-run at `3fc305e1`: all RED again |
| `test/formats/donor-fixture-currency.test.ts` | M7 pinned converter blob altered | RED |
| `test/formats/aeon-fixture-currency.test.ts` (3 new vendored rows) | M8 region_id added to vendored pins | RED (pin + currency rows) |
| `src/renderer/canvas/__tests__/donor-compose.test.ts` | M9 VOID as zone 0; M10 lost zone key; M11 no blit | all RED |
| `test/formats/donor-marquee.test.ts` | S2-M1 inward snap; M2 no crop clamp; M3 4-px snap | all RED |
| `test/formats/clip-manifest-doc.test.ts` | S3-M1 region_id written; M2 region_id derived; M3 keys dropped; M4 non-ASCII; M5 8-px shift; M6 overlap ignored | all RED |
| `src/main/__tests__/clip-tool.test.ts` | M7 donor root; M8 candidate in project; M9 couldNotRun lost; M10 missing file skipped | all RED |
| `src/renderer/state/__tests__/donor-paste.test.ts` | M11 refusal ignored; M13 expected mtime null; M14 routing removed; **M12 mtime check removed was GREEN** (the restore path is a guarded write that conflicts by itself); new row for the DELETE path (`73f67340`), M12b RED | RED after the new row |
| `src/main/__tests__/file-io-guards.test.ts` (CLIP_TOOL classified) | M15 handler arg renamed `relative*` | RED |
| `test/live/donor-fidelity.test.ts` (opt-in) | F-M1 10-bit mask: **GREEN** (no real tile index reaches 1024: not discriminating on this data); F-M1b non-zero words RED; F-M2 palette field RED (aeon R3); F-M3 plane B RED; F-M4 keys dropped RED | as stated |
| `scratchpad/donor-page-harness.mjs` | H-M1 command text; H-M2 no blit; H-M3/M3b marquee from release point; H-M4 region_id; H-M5 routing (first run aborted by a timeout instead of naming DP.8a, fixed `12d52ea9`, H-M5b RED on DP.8a) | all RED on the expected row; baseline 13/13 after each batch |

## 5. Harness runs (final, `npm run harness:donor-page`)

AEON_DIR = an archive of aeon `origin/master` `ab108383` in session scratch; the harness makes its
own run-unique copy without `donors/`, runs the converter IN the copy, and deletes it.

| Run | root / pinned | HEAD | dpr | Rows | UTC |
|---|---|---|---|---|---|
| 1 | `root: …/agent-afb29e3ea2c27dd80`, `pinned: AURORA_BUILT_TREE=…/agent-afb29e3ea2c27dd80` | `12d52ea9` | 1 | 13/13 PASS, 0 FAIL, 0 UNMS | 10:41:53.739Z .. 10:42:09.457Z |
| 2 | same | `12d52ea9` | 1 | 13/13 PASS, 0 FAIL, 0 UNMS | 10:42:21.738Z .. 10:42:37.407Z |

Rows: DP.0 page opens by a real pill click; DP.1 absent state names the tree's own command and
the copy; DP.2 the command run, "Look again" lists the six zones read back from disk; DP.3 EHZ
drew (per section pixels iff painted; canvas getImageData share 0.323 of the crop box); DP.4 real
drag = the tree's `marqueeRect` of the back-mapped aims (`x 2064 y 160 w 1496 h 672`); DP.5 new
act by real keys; DP.6a `clips.json` on disk holds exactly the clip, no region_id; DP.6b aeon's
loader accepts the file on disk; DP.6c aeon's bake of it, read back from disk, equals the donor
cells on all three planes (47,124 cells, 10,315 painted); DP.6d target pane drew; DP.7 overlap
refused by aeon naming R10, file byte-identical; DP.8a real Ctrl+Z removes the created file; DP.8b
Redo writes identical bytes.

## 6. Fidelity rig (opt-in `AURORA_DONOR_FIDELITY=1`)

4/4 at aeon `ab108383` and at `3221c0c1`: six real zones from a `git archive` copy agree with
their own `zone.json` (painted, solid, sha256, stitch, 36+ sections); Aurora's writer is accepted
and R12 is refused by aeon; aeon's bake puts donor words and both planes at the destination byte
for byte; aeon's `s2_two_clip_pins` rewritten by Aurora is still accepted. Deviation from the
brief, deliberate: the copy is a `git archive` of a named revision rather than an rsync of the
live tree, so the result names what it measured.

## 7. npm test

`VITEST_MAX_WORKERS=4 npm test` at `12d52ea9`: rc 0; **667 files passed, 3 skipped (670); 10,418
tests passed, 13 skipped (10,431)**. Four of the 13 skips are the opt-in fidelity rig, each saying
so; the rest predate this branch.

## 8. Look choices (the overseer's call, defaults recorded)

- A new **Donors** facet after Art (a second canvas swap, by `core/shell/facets.ts`'s ordering rule).
- Canvas: donor zone on top (3/5), target clip act below (2/5, quarter-resolution bitmaps).
- Crop outside dimmed; marquee and placement in the accent colour; clips already in the act faint.
- Colour 0 transparent; line 0 from `art/palettes/SonicAndTails.bin`.
- Target acts and snap mode are buttons (no `<select>`: native popups are invisible to a headless rig).

## 9. TAGGED for the foreground

1. The pane split ratio and whether the target act deserves a facet of its own.
2. **Paste is write-through** (a write, not an unsaved edit behind the Save chip); undo writes the
   file back. Chosen because clips.json is aeon's build input and the §8 flow validates before
   writing; the alternative is a saver in the coordinator.
3. Labels of overlapping outlines draw on top of each other in the target pane.
4. Aeon's refusal text is shown verbatim, em dash included (aeon's runtime output, not Aurora prose).
5. No emulator was used; how the pasted act looks in game (`S2CLIP=<id> ./build.sh`) is untested here.

## 10. Requests for aeon

1. Rule on §8 items 1-2 (section 3).
2. `clipact.json` has no per-clip tiles/pages (the pool is act-wide) though §8 lists them per clip.
3. `tools/clip_manifest.py validate` has no machine-readable output; the page parses nothing and
   shows the text, which is fine, but a `--json` would let it mark the offending clip.

## 11. Observations not acted on

- `DELETE_FILE` gained a second, documented caller (undo of a created manifest), guarded by mtime.
- An empty `clips/<id>/` directory remains after undoing a created manifest.
- F-M1 (10-bit tile mask) is invisible to real S2 data; only the owned fixture's future growth
  past 1024 tiles would expose it.
