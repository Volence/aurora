# Effects parcels A–G — live-app (CDP) foreground checks, 2026-08-26

Build under test: worktree at master `e90f028`, `VITE_AURORA_DEBUG=1 npm run build` in the
worktree (`node_modules` symlinked from the main checkout; `dist/` local). Aeon tree:
`/home/volence/sonic_hacks/aeon`. All runs under `xvfb-run`, CDP only — no emulator was
touched. Nothing under `src/` was modified. Nothing committed.

Environment across every run reported here: `devicePixelRatio` came up **1** (or
0.99999998) in all 17 runs; canvas rect at 1680x1050 = `{284,106,816x742}` (lens/guides,
which do not resize the window) / `{284,106,1096x920}` (foreground harness, which sets the
viewport). No run landed at dpr 1.35, so the fractional-rect regime is **not** exercised
today — every aim was still integer and every expectation derived from the delivered pixel.

## Verdict table

| Step | Harness | Row(s) | Result | Measured |
|---|---|---|---|---|
| 1 | `effects-column` 1280x800 | `[H1]`/`[r1]` column overflow | **PASS** | content 670px in 670px → **0px** overflow, headroom 0px (×2 runs) |
| 1 | `effects-column` 1680x1050 | `[H1]`/`[r1]` column overflow | **PASS** | content 920px in 920px → **0px** overflow, headroom 0px (×2 runs) |
| 1 | `effects-column` both | `[L2]`/`[L2b]` no label truncated/wrapped | PASS | — but see L1: the label does not wrap, it *widens* |
| 1 | `effects-column` both | **`[L1]` / `[L1b]` one label-column width** | **FAIL** | 3 distinct offsets, spread **46.3px**: 68px for every other row; **111.1px** for all five `Plane A (foreground)` rows; **114.3px** for all five `Plane B (background)` rows. Identical at both frames, both runs each (23/25 gated rows, exit 1) |
| 1 | `effects-column` both | parcel C `Layers (n/8 per scene)` title | PASS (observed) | section title renders `Layers (5/8 per scene)` with the hint line `5 of 8 layers (per scene; scenes are assigned per section)`; `[i3]`/`[i4]` name it |
| 1 | `effects-foreground` | `[TB1]`/`[TB2]` parcel B tool-options bar | **PASS** | 1280x800: rendered **32px** tall (declared 32px), 1040px wide, overflow visible, scroll 1040x31 = client 1040x31, 0 descendants outside the bar. 1680x1050: **31.99px** tall, 1440px wide, scroll 1440x31 = client, 0 outside. Line text: `Promote from tile 32` · `Add blank band` · `Click + drag to pan, scroll to zoom`. **No clipping at either size.** |
| 2 | `bganim-band-lens` | whole harness with `n` arming | **PASS** | **42/43 + 1 NM** (runs 2 and 3). Original 37 rows + new `[3c]` `[13a]` `[13z]` `[13b]` `[13c]`; `[6a]` NOT-MEASURABLE as before (no blank/out-of-blob cell on this document). `[11b]` repaints=0, ticks 962 |
| 2 | `bganim-band-lens` | `[3c]` arming | PASS | `__dbg.aeon.state().tool` `view` → `mark-band` after a real `n` keydown/up with focus blurred |
| 2 | `bganim-band-lens` | **new `[13a]`** View click is a no-op | **PASS** | dock `View` armed; click on the same static cell that seeded `[4c]`: `bandLensTarget` `{"kind":"band","index":0}` → same; `bandCandidate` `{staticBase:34,cols:4,rows:2,…}` → same; marks 5 → 5 |
| 2 | `bganim-band-lens` | **new `[13b]`** Escape clears | **PASS** | zoom 1, cell 2 lit `{27,15,29}`, lens-off reference (via the `setBandLensTarget(null)` door) `{8,9,14}`; after a real Escape keypress `bandLensTarget === null` and pixel `{8,9,14}` — byte-identical |
| 2 | `bganim-band-lens` | **new `[13c]`** Hide chip clears | **PASS** | re-lit `{27,15,29}`; `Hide` chip clicked; target `null`, pixel `{8,9,14}` |
| 3 | `effects-guides` | re-aimed through `space` | **PASS** | **31/31** (runs 4 and 5), after re-aim. Space reported `"screen"` for the harness's own new scene (a new scene arrives locked, v_factor 15) |
| 3 | `effects-guides` | `[4f]` caption | **PASS** | `screen lines — locked scene` painted bottom-right of `#map-canvas`: 250 text-shaped px in the 13px strip (rows 729–734 of 742), 0 in the control strip 40px up; the app's own `toDataURL` dump `scratchpad/shots-effects-guides/4f-map-canvas.png` shows it |
| 4 | `effects-foreground` | `[SF0]`/`[SF1]`/`[SF5]` View-menu toggle | **PASS** | arrival `active:false`; View → `Screen frame (320x224)` checkbox `false→true` → `active:true, anchor {0,0}, rect {0,0,320x224}`; again `true→false` → `active:false` (both sizes, ×2 runs) |
| 4 | `effects-foreground` | `[SF2.z1]` edge drag zoom 1 | **PASS** | bottom edge aimed at client (444,330) [canvas-local (160,224)], dragged (+40,+30) px → anchor `{0,0}` → `{40,30}` = expected; view unchanged |
| 4 | `effects-foreground` | `[SF2.z2]` edge drag zoom 2 | **PASS** | aimed (684,614) [canvas-local (400,508)], dragged (+40,+30) px → anchor `{40,30}` → `{60,45}` = expected world delta (20,15); view unchanged |
| 4 | `effects-foreground` | `[SF3.z1]`/`[SF3.z2]` interior drag still pans | **PASS** | drag (−50,−40) from inside the frame: view `{0,0}` → `{50,40}` at z1, `{0,0}` → `{25,20}` (1680 run 1: `{25,19.5}`) at z2; anchor unchanged both times |
| 4 | `effects-foreground` | **`[SF4]` `[11b]` with frame ON** | **PASS** | **repaints = 0** over the 3s idle window; rAF ticks 181 (1680) / 962 (1280); probe bound to the live canvas; frame active |
| 5 | `effects-foreground` | `[LC1]`–`[LC4]` layer cards | **PASS** | `ojz_act1_depth` selected (5 layers), Layers open: `layer-3-extras` = `curve → FACTOR_3_8 · vsplit at 20`, `layer-4-extras` = `curve → FACTOR_1 · vsplit at 44`; `layer-0/1/2-extras` (and 5–7) **absent** from the DOM |

## FAIL — evidence

### `[L1]`/`[L1b]` — parcel D's long labels break the label column (both frames)

`effects-column-harness` measures `firstControl.left − row.left` per labelled row. Before
parcel D the `fa`/`fb` rows were short and every row sat at the 68px floor. Now:

```
FAIL  [L1] every labelled row starts its control at ONE label-column width
      3 distinct offsets, spread 46.3px:
        "68":    Scenes/Scene id, Scene/Name, V factor, V center, V offset, Precision, Transition,
                 Layer 0..4, Screen line ×5, Section assignment/Section 0
        "111.1": Layers (5/8 per scene)/Plane A (foreground) ×5
        "114.3": Layers (5/8 per scene)/Plane B (background) ×5
```

Same numbers at 1280x800 and 1680x1050, in two runs each (`run-column-1280.log`,
`run-column-1280-b.log`, `run-column-1680.log`, `run-column-1680-b.log`). `[L2]` passes,
i.e. the label is **not** wrapped or truncated — the premise in the dispatch ("wraps inside
its 64px gutter") is not what renders: `minWidth: 68` is a floor, so the 111px label pushes
its own `<select>` right and the FACTOR selects of the layer card no longer line up with the
`Screen line` spinner above them. Visible in `scratchpad/shots-effects-column/
column-after-1280x800.png` (right column crop: `column-crop-1280.png`). Column overflow is
unaffected (0px at both frames), so parcel D's own stated acceptance (`[H1]`) holds; the
regression is in row 41's `[L1]`, which the parcel did not re-run.

## Harness changes made (all under `scratchpad/`, untracked)

- `bganim-band-lens-harness.mjs`
  - `[3c]` arms `mark-band` with a real `n` key before the first click row (parcel B), via
    `__dbg.aeon.state().tool` (there is no `__dbg.tool()`; that is the canvas-doc reader).
  - New section 13: `[13a]` View-tool click no-op, `[13z]` anti-vacuous, `[13b]` Escape,
    `[13c]` Hide chip — `[8b]`'s pixel method at zoom 1 with the lens-off byte taken from the
    `setBandLensTarget(null)` door and the verdicts from the key / the chip.
  - Selector fix: the footprint `Hint` now has TWO element children (swatch + parcel A's
    Hide chip), so `children.length <= 1` in `[7d]/[7h]/[7e]/[7g]` matched nothing (run 1:
    38/43 with those four red on a selector, not a defect). Widened to `<= 2`.
- `effects-guides-harness.mjs`
  - Spinner selector `/^Layer 0 world_y/` → `/^Layer 0 (world_y|Screen line)/` (the locked
    label). Without it `[3c]` could not set the spinner and everything downstream cascaded
    (as-is run: 3c/4c/5a/5b/5c red then a harness TypeError at 7b).
  - Re-aimed through `guides().space`: `expectY`, `worldYAt`, `expectedCanvasY`, and `[8d]`'s
    `expect2` now add `origin = space==='screen' ? view.y : 0`. **Rows needing re-aim: 4
    (`[4c]`, `[4e]`-derived drag expectation feeding `[5b]/[5c]/[5d]/[6b]`, `[8d]`) plus the
    one selector.** Only `[8d]` changes numerically (view.y=64 → drawn 400 = contract 400);
    the others have origin 0 at view.y=0 and hold with the same numbers as before. The
    remaining 26 rows hold unchanged.
  - New `[4f]` caption row (pixel shape scan of the bottom-right 13px strip + control strip +
    the canvas dumped via `toDataURL`). First predicate (exact text colour ±6) was wrong —
    the text is alpha 0.95 over the plate, so 0 exact matches on a dump that plainly shows
    the caption; fixed to the blue/green-over-red shape predicate (runs 4, 5 green).
- `effects-foreground-harness.mjs` (new): parcels B/E/G rows `[TB*]`, `[LC*]`, `[SF*]`,
  parameterised by `SCREEN=WxH`, viewport set the way the column harness does it.
- `effects-foreground-timed.sh`: the sequential timed re-run.

## Wall-clock per harness (solo, sequential, `effects-foreground-timed.sh`)

| Harness | secs |
|---|---|
| `effects-column` 1280x800 | 16 |
| `effects-column` 1680x1050 | 15 |
| `effects-guides` | 29 |
| `bganim-band-lens` | 39 (run 3, `date` bracketed) |
| `effects-foreground` 1680x1050 | 29 |
| `effects-foreground` 1280x800 | 119 (run 2; run 1 was not timed — the extra minute was in target/wait, rows identical) |

## Run ledger

| Log | Result |
|---|---|
| `run-column-1280.log`, `-b` | 23/25, L1+L1b red, overflow 0px |
| `run-column-1680.log`, `-b` | 23/25, L1+L1b red, overflow 0px |
| `run-lens-1.log` | 38/43 + 1 NM — 4 reds were the stale selector (fixed) |
| `run-lens-2.log`, `run-lens-3.log` | 42/43 + 1 NM |
| `run-guides-asis.log` | cascade failure from the renamed spinner (exit 2) |
| `run-guides-reaimed-1..3.log` | 30/31 — only `[4f]` red, on the bad predicate |
| `run-guides-reaimed-4.log`, `-5` | 31/31 |
| `run-foreground-1680.log`, `-b`; `run-foreground-1280.log`, `-b` | 18/18 each |

## Not done / caveats

- No dpr-1.35 observation happened in this session, so the integer-aim discipline is
  asserted by construction, not by a fractional-rect run.
- `[6a]` in the lens harness stays NOT-MEASURABLE on this document (as on ROADMAP row 43).
- Band scroll *direction* (parcel D's gated word) is not in scope here — it needs the ROM.
