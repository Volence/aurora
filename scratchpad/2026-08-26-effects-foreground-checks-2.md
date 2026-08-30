# Effects parcels H / I / J + label-column — live-app (CDP) foreground checks, pass 2, 2026-08-26

Build under test: isolated worktree at master `daf23d8` (`VITE_AURORA_DEBUG=1 npm run build`
in the worktree; `node_modules` symlinked from the main checkout; `dist/` local). All runs
under `xvfb-run`, CDP only — no emulator touched, nothing under `src/` modified, nothing
committed. `devicePixelRatio` = **1** in every run (dpr 1.35 was not seen; integer-aim
discipline is by construction again). Viewport via `Emulation.setDeviceMetricsOverride`
(`Browser.setWindowBounds` did not take at this frame); canvas rect at 1680x1050 =
`{284,74,1156x914}` in the Layout/Effects facets.

**The aeon tree opened by the new harness is a REAL copy** (`rsync -a --exclude .git`, 865 MB,
`scratchpad/fixtures/aeon-fg2-writable/`), because step 4 saves. The harness refuses the live
path outright. **The live aeon file `games/sonic4/data/editor_bg_override.json` was never
written**: md5 `85f4d47248758f9233b484ce86d829c4` before and after, `git status` clean for it,
no `git checkout` was needed or run. (The live tree shows ` M docs/lane-status.json` and
`?? games/sonic4/data/sprites/object-bindings.json` — other lanes' work, not this pass.)
The injector was resolved at `/home/volence/sonic_hacks/aeon/tools/inject_editor_bg.py` and run
over the SAVED file in the copy, exactly the way `bg-override-art-injector-gate.test.ts` runs it.

## Verdict table

| Step | Harness | Row(s) | Result | Measured |
|---|---|---|---|---|
| 1 | `effects-column` 1280x800 | **`[L1]`/`[L1b]`** | **PASS** | **1 distinct offset, spread 0px: 68px** for all 38 (L1) / 45 (L1b) labelled rows incl. every `Plane A (fg)` / `Plane B (bg)` / `Plane B curve to` / `Plane B split at` (was 68 / 111.1 / 114.3) |
| 1 | `effects-column` 1680x1050 | **`[L1]`/`[L1b]`** | **PASS** | same: 1 offset, 68px, spread 0px |
| 1 | `effects-column` both | `[H1]`/`[r1]` overflow | **PASS** | 1280: content 670px in 670px → **0px**; 1680: 920px in 920px → **0px** |
| 1 | `effects-column` both | `[L2]`/`[L2b]` "no label wrapped" | **FAIL — stale premise** | the fix WRAPS by design: `Plane B curve to` (text 42px on line 1 of 2, h=30) and `Plane B split at` (64px in 64px, h=30) are 2 lines at both frames; row 41's L2 was written when wrapping was the defect. No truncation, no overhang (see `[LX3]`) |
| 1 | `effects-foreground-2` | `[LX1]` | **PASS** | on the layer cards: 25 rows, **1 distinct offset = 68px** |
| 1 | `effects-foreground-2` | `[LX2]` `Plane A (fg)` inside the column | **PASS** | natural text **58.6px** in a **64px** column, **1 line** (h=15), overhang −5.4px, no overlap with the control; `Plane B (bg)` 61.7px, 1 line, overhang −2.3px |
| 1 | `effects-foreground-2` | `[LX2b]` dispatch premise "wraps as TWO lines" | **FAIL — premise** | `Plane A (fg)` renders as **1 line** because it fits (58.6 ≤ 64). The labels that DO wrap are `Plane B curve to` (83.4px natural → 2 lines) and `Plane B split at`. Reported, not gated |
| 1 | `effects-foreground-2` | `[LX3]` no overhang anywhere | **PASS** | widest natural text `Plane B curve to` 83.4px wraps to 2 lines inside 64px; 0 overhangs, 0 overlaps |
| 2 | `effects-foreground-2` | `[H0]`/`[H1]` | **PASS** | `ojz_act1_depth`, Layers open; layer 3 curve `<select>` = `FACTOR_3_8` (options: `__none__`, 16 named factors, `__packed__`), vsplit select = `at` (`row`), spinner = `20`; model `curve:{to:FACTOR_3_8}` `vsplit:{at:20}` |
| 2 | `effects-foreground-2` | `[H1b]` | **PASS** | `layer-3-extras` is **absent** (curve/vsplit left the extras line) |
| 2 | `effects-foreground-2` | `[H2]`/`[H2a]`/`[H2c]` | **PASS** | layer 0 arrives with no `curve`/`vsplit` keys (`{dsa:15,dsb:15,fa:FACTOR_1,fb:FACTOR_1_16,world_y:0}`); picking `FACTOR_1_4` writes `curve:{to:"FACTOR_1_4"}`; `layer-0-extras` stays **absent** (no duplicate); no advisory |
| 2 | `effects-foreground-2` | `[H3]` undo | **PASS** | one Ctrl+Z: `'curve' in layer0 === false` (key deleted, value `undefined`, never `"none"`), picker back to `__none__` |
| 2 | `effects-foreground-2` | `[H4]`/`[H4b]` `to == fb` advisory | **PASS** | choosing `FACTOR_1_16` (= layer 0's `fb`) renders `curve to FACTOR_1_16 is the same factor as Plane B — the ramp goes nowhere and the build refuses it`; Ctrl+Z deletes the key and the advisory |
| 2 | `effects-foreground-2` | `[H5]`/`[H5b]` vsplit on/off | **PASS** | `row` → `vsplit:{at:0}` (= clamp(world_y 0)) with the spinner showing `0`; `none` → key **deleted**, spinner gone |
| 2 | `effects-foreground-2` | `[H6]`/`[H6b]` | **PASS** | two Ctrl+Z walk back `{at:0}` → absent; layer 0 byte-identical to arrival; **no `"none"` string anywhere in `scenesJson()`** |
| 3 | `effects-foreground-2` | `[J1]` picker cards | **PASS** | `#art-browser-bands` holds 1 `.art-browser-band[data-band="0"]`, caption **`Band 0 · 8x4`**, title `band 0 · slots 0..31 (8x4)`, 132x85px card |
| 3 | `effects-foreground-2` | `[J2]` card arms | **PASS** | dock `View` → tool `view`; card click → **`stamp-band`**, `selectedBand()` null → **0**, card outline 2px |
| 3 | `effects-foreground-2` | `[J2c]`/`[J2b]` key `d` | **PASS** | Layout: `view` → `stamp-band` after a real `d` keydown/up; Effects: `view` → `view` (not armed) |
| 3 | `effects-foreground-2` | `[J3]`/`[J3b]` click = one pattern | **PASS** | press (2,2) aim (304,94): all 32 words `& 0x7FF === 0 + dc*4 + dr` (column-major), `& 0xF800` unchanged on all 32 (every word on this plane carries attribute bits: 4096/4096); the 28-cell ring around it untouched. e.g. `481b→4800, 501c→5004, 481d→4808, 501e→500c …` |
| 3 | `effects-foreground-2` | `[J4]` | **PASS** | one Ctrl+Z: `bgOverrideHash` 1478259114 → **1478259114**, all 32 words restored |
| 3 | `effects-foreground-2` | `[J5]`/`[J5b]` drag tiles | **PASS** | drag (304,94)→(392,134) = 12x6 cells: all 72 words match the period (8 across, 4 down) with attrs kept, **0 mismatches**; ONE Ctrl+Z → hash back to 1478259114, `canUndo` true→false (= arrival) |
| 3 | `effects-foreground-2` | `[J6]`/`[J6b]` 3-cell strip | **PASS** | strip words `5000,4004,5008` (= base+0, +4, +8), the rest of the 8x4 region untouched; Ctrl+Z → hash 1478259114 |
| 3 | `effects-foreground-2` | `[J7]` refusal | **PASS** | `setSelectedBand(null)`, tool `stamp-band`, click → 1 toast `Pick a band first: click one of the band cards in the Art panel (BG layer), then stamp. Nothing was stamped.`; hash unchanged |
| 3 | `effects-foreground-2` | **`[J7p]` PLANT** | **PASS** | `setSelectedBand(1)` (the document has ONE band): refused with the same toast, hash unchanged, no word written |
| 4 | `effects-foreground-2` | `[I1]` bank strip | **PASS** | `[data-band-bank-strip="0"]`: **8** `canvas[data-bank=0..7]`, each 64x32 backing / 48x24 css, titles `Phase 0 — the picture at rest…` / `Bank k — the band at step k…`; button aria-label **`Shift: regenerate banks 1–7`** |
| 4 | `effects-foreground-2` | `[I3]` bank 0 → Art | **PASS** | click thumb 0: Art facet, composer canvas **512x256 = 8:4** (zoom 8), `#map-canvas` unmounted |
| 4 | `effects-foreground-2` | `[I4]` stroke | **PASS** | pencil, colour 1, doc cell (3,0) (slot 12, column-major), drag (810,474)→(850,474): `tiles[12]` row 4 `[10,10,8,8,8,8,8,8]` → `[10,1,1,1,1,1,1,8]`, diff cells exactly 33..38 |
| 4 | `effects-foreground-2` | `[I4b]` coherence (in-app) | **PASS** | `bgOverrideHash()` 1478259114 → 3747028244, **non-null**: `serializeBgOverride` refuses `phases[0] != tiles[base:base+n]`, so a hash at all IS the coherence check |
| 4 | `effects-foreground-2` | **`[I5]` map repaints** | **PASS** | back on the map, covered cell 65 (1,1) slot 12, aim (296,118): pixel **`{8,9,14}` → `{16,9,14}`** (same rect) |
| 4 | `effects-foreground-2` | `[I5b]` twin cell | NOT-MEASURABLE | 7 on-screen cells carry the identical word `0x400c`, all read `{0,0,0}` before the stroke (foreground over them), none matched the covered cell's before-pixel |
| 4 | `effects-foreground-2` | `[I6]` Ctrl+Z | **PASS**, see finding F1 | tile, hash (1478259114) and map pixel (`{8,9,14}`) all restored — **but only from the Art facet**: `canUndo()` in Art right after the stroke = true, in Effects = **false**; the Effects-facet Ctrl+Z did nothing |
| 4 | `effects-foreground-2` | `[I7]`/`[I7a]` Shift | **PASS** | stroke re-applied; thumbnail pixel hashes: **banks 1–7 all change, bank 0 does not**; hash 3747028244 → 653933295, no toast |
| 4 | `effects-foreground-2` | `[I8a]` save | **PASS** | Ctrl+S (`dirtyActs ["ojz/act1"]`): file changed; `tiles[12]` carries the stroke; **`phases[0] == tiles[0:32]`**; banks 1–7 differ from the original; layout and every other tile byte-identical |
| 4 | `effects-foreground-2` | **`[I8]` injector** | **PASS — ACCEPT** | `inject_editor_bg.validate_band_coherence(anims, tiles)` over the saved file → `ACCEPT` |
| 4 | `effects-foreground-2` | `[I8p]` CONTROL | **PASS** | same gate over the saved file with `phases[0][0]` poisoned → `REFUSE band 0: phases[0] != tiles[0:32]. …` |
| 5 | `effects-foreground-2` | **`[11b]`** | **PASS** | bands section open, strip scrolled into view (`elementFromPoint` hits it), frame ON (`active:true, rect 0,0,320x224`): **repaints = 0** over 3s, rAF ticks 962/963, probe bound to the live canvas |

**Totals:** `effects-foreground-2` **47/48 + 1 NM** (run 3; run 2 was 47/49 with `[I5b]` red on
foreground occlusion, fixed to NM; run 1 44/47 on three harness premises). The only red row is
`[LX2b]`, a reported dispatch premise (below). `effects-column` **23/25** at both frames with
`[L1]`/`[L1b]` GREEN and `[L2]`/`[L2b]` red on the inverted premise.

## FAIL rows — evidence

### `[L2]`/`[L2b]` (column harness) and `[LX2b]` (dispatch) — the premise, not the layout

Row 41's `[L2]` asserts *no label is wrapped*. Parcel label-column-align's fix is a fixed
`width: LABEL_W = 64` that **wraps at spaces** (`column-layout.tsx`), so the two labels wider
than 64px now wrap, at both frames:

```
"Plane B curve to: text 42px in 64px, h=30 lineH=normal"   (first line 42px; natural 83.4px)
"Plane B split at: text 64px in 64px, h=30 lineH=normal"
```

`[LX3]` measures the thing L2 was guarding — overhang past the column / into the control —
and finds **0** over all 25 layer-card rows. `[L2]` needs re-wording to "no label overhangs its
column" if it is to be kept; the label column itself (`[L1]`) is fixed.

The dispatch's `Plane A (fg)` "wraps as two lines" does not happen because the text is
**58.6px in a 64px column** (`Plane B (bg)` 61.7px): it fits on one line. That is the intended
outcome of the rename, not a defect. Nothing wraps mid-token; nothing overhangs.

## Findings outside the rows

**F1 — a band-art stroke is undoable only from the Art facet.** After the stroke in the Art
facet, `__dbg.aeon.canUndo()` reads `true` there and `false` back in the Effects facet; Ctrl+Z
on the map facets does nothing to it, while the Shift command issued from the Effects facet
lands on the act history (undoable there). Cause by reading: `editorStore.focusedDocId()`
maps `ZONE_ART_FACETS` (incl. `art`) to `zoneArtDocId(zone)`, and `executeCommand` pushes on
`focusedHistory()`, so `set-bg-override-tiles` / `set-bg-override-phases` from the composer
go on the **zone-art doc's** stack while `set-bg-override-layout` / `regenerate-shift` go on the
**act's**. One document, two stacks, interleaved by which facet the author was in. Not a row of
parcel I ("Ctrl+Z restores" holds, from the facet the stroke was made in) — booked here for the
owner.

**F2 — Ctrl+S rewrites two unrelated files for trailing-newline normalisation.** In the copy,
the save also wrote `games/sonic4/data/editor/effects/ojz_act1_start.json` (882 → 883 bytes:
gained a final `\n`) and `games/sonic4/data/editor/ojz/act1/section_4.meta.json` (80 → 79:
lost its final `\n`), neither of which was edited. Byte-level churn only; noted because it
would show up in an aeon `git status` after a real save.

## Plants

- `[J7p]`: `selectedBand = 1` on a one-band document → refused, nothing written (proves the
  refusal reads the band list, not just null).
- `[I8p]`: the SAVED file with `phases[0][0]` poisoned → the injector REFUSES naming band 0
  (proves the ACCEPT in `[I8]` discriminates).
- `[J7]` itself (null band) is the shipped refusal path; no `__dbg` door exists to plant a bad
  layout word, so the J stamp rows were run without a word-level plant.

## Harness (new, under `scratchpad/`, copied to the main checkout's `scratchpad/`)

- `effects-foreground-2-harness.mjs` — parcels H/I/J + `[LX*]` + `[11b]`; opens
  `AEON_DIR` (default the writable copy; refuses the live tree); saves; runs the injector.
- `timed-run.sh`, `fg2-sequence.sh` (restore the copy's override → fg2 → column 1280 →
  column 1680), `fg2-save-diff.sh` (what the save wrote).
- Logs `run-fg2-{1,2,3}.log`, `run-column-{1280,1680}-fg2.log`; shots in
  `shots-effects-foreground-2/` (+ `saved-override.json`, `poisoned.json`).
- `effects-column-harness.mjs` unchanged.

## Wall-clock per harness (solo, sequential)

| Harness | secs |
|---|---|
| `effects-foreground-2` 1680x1050 | **53** (runs 1, 2, 3 — identical) |
| `effects-column` 1280x800 | 16 |
| `effects-column` 1680x1050 | 15 |

## Aeon tree

Not touched. The app opened and saved into `scratchpad/fixtures/aeon-fg2-writable/` only;
the live `editor_bg_override.json` md5 is unchanged (`85f4d472…`). No checkout was run.
