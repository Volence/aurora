# ART-OPTIONS-BAR-HEIGHT (ROADMAP row 210): the Art options bar is one fixed-height row

Branch `parcel/art-options-bar-height`, from master `c276f527`. Bug tier. The look was ruled by
the aurora overseer on 2026-09-25 (the owner handed look calls to this lane at
2026-09-18T19:27:49Z): one row at a fixed height that does not depend on the tool, the dirty state
or the shared-tile warning; no wrap; the warning goes compact with the full sentence on hover and for
assistive tech; anything that does not fit scrolls sideways inside the bar; only the Art facet's bar
changes.

## 0. The answer

- **Repro (unfixed tree, run `repro1`, 1400x872, dpr 1):** the bar was a different height for
  almost every tool, and the composer canvas moved by up to **79px** on a tool switch. That is worse
  than row 209's figure: that packet measured two tools, and this run measured all eleven.
- **Fixed:** the bar is **44px under every tool**, at 1400x872 and at 1100 wide. The canvas is at
  `y 142` under every tool, and the bar's own New… button stays at `y 81`. The PART atl stroke
  (Tile stamp held, Collision paint picked mid-drag) now reads the same canvas rect before and after
  the switch.
- Three runs of the whole harness at the final tree: **46/46 PASS, 0 FAIL, 0 UNMEASURABLE** each.
  `npm test`: **660 files passed, 3 skipped (663); 10355 tests passed, 9 skipped (10364)**.
- **Not driven: O3**, the warning appearing on a first write. No library chunk in this project can
  show it (section 5).

## 1. The repro, with numbers

Run `repro1` (09:45:31Z to 09:46:09Z), harness blob `b62d403f` (the PART as first committed,
`3110a099`), `src on disk: identical to HEAD`, so the source was master's. It used a real click on
each rail button and read the store's tool back after each one:

| tool | bar h (1400x872) | canvas y | bar h (1100 wide) |
|---|---|---|---|
| pencil | 46 | 144 | 116 |
| eraser | 37 | 135 | 116 |
| fill | 37 | 135 | 116 |
| eyedropper | 37 | 135 | 116 |
| line | 46 | 144 | 116 |
| rect | 37 | 135 | 116 |
| select | 37 | 135 | 116 |
| dither | **116** | **214** | 116 |
| tile-stamp | 88 | 186 | 116 |
| collision | 37 | 135 | 116 |
| palette-apply | **116** | **214** | 116 |

Two more findings from the same run:
- The growing bar also let content spill out. Under Palette line at 1400x872 the row was 1167px wide
  in a 1160px bar with `overflow-x: visible`. At 1100 wide, every tool's row was wider than the bar
  (979 to 1167px of 860px), also with overflow visible.
- The warning had no `title` and no `aria-label`. Its full sentence was only the bar's own text,
  which is what made the header wrap.

## 2. The cause

`ArtOptions` (`src/renderer/workspace/facets/art-facet.tsx`) puts the doc header at the left of
`ArtToolOptions`, and both share one `OptionBar` (`src/renderer/components/ui/primitives.tsx`).
`OptionBar` uses `min-height: 32` and grows to fit on purpose (its docblock: a refusal sentence must
never be cut). Its flex items shrink, and the text inside them wraps. The controls change with the
tool (dither config, palette-line picker, stamp priority, pixel-perfect), so the free width left
for the header changes too. The header's long warning then wrapped into a different number of lines
for each tool, which is where the 37/46/88/116 steps come from.

Two partial fixes were measured and neither is enough on its own (run `mutB-nosinglerow`). With
the compact warning but the growing bar, the heights were still pencil 32, tile-stamp 37, dither and
palette-apply 46.

## 3. The change

| commit | what |
|---|---|
| `3110a099` | harness: PART `aob`, written and committed BEFORE any fix |
| `1d51b80e` | harness: prints the bar's tallest item; O3 with no all-zero chunk is a NOT DRIVEN note |
| `4f199df6` | fix, first cut: `OptionBar singleRow`, `ArtToolOptions singleRow` pass-through, `SharedTileWarning` |
| `5bce74a4` | fix: an inner row at the top plus a reserved scrollbar band, so the chips do not jump; AOB.a also asks the New… button to stay |
| `e0f5ea86` | node test: the compact warning keeps its whole sentence |

- **`OptionBar` gets `singleRow` (opt-in, default off).** It renders an outer box 44px tall
  (`1 + 30 + 12 + 1`) with `overflow-x: auto`, `overflow-y: hidden`, `scrollbar-width: thin` and
  `white-space: nowrap`. The chips sit in an inner flex row 30px tall (the ordinary bar's content
  height) at the top, with `width: max-content; min-width: 100%`, so the zoom control's
  `margin-left: auto` still reaches the right edge. The 12px band under the row holds the scrollbar:
  measured at 10px at dpr 1, plus 2px spare. The bar is therefore the same height with or without a
  scrollbar. The first cut (`4f199df6`, 48px, chips centred) did hold the bar's height, but run
  `mutE-centred` showed that the chips moved up 5px on the three tools whose row overflows. The
  inner row fixes that. The tallest Art item is 28px (the mirror button).
- **`ArtToolOptions` passes `singleRow` through, default false.** Only aeon's `ArtOptions` passes it.
- **`SharedTileWarning`** (`src/renderer/components/art/SharedTileWarning.tsx`): shows
  `⚠ shared tiles`, with `title` and `aria-label` set to `SHARED_TILE_WARNING`, the unchanged
  sentence. It has `role="note"` so the aria-label names the element (a bare span has no role that
  takes a name) and `cursor: help`. The colour and size tokens are the old `sharedWarning` style's,
  which is removed from art-facet.
- **Row 209's reserved `unsaved` box is kept.** It can no longer move the canvas (run
  `mutD-fixed-noreserve`), but it still stops Save and New… sliding right on the first write. The
  comment there says so.
- **Other `OptionBar` consumers are unaffected.** They are `ClassicMapToolOptions`, `CanvasMode`,
  `EffectsToolOptions` and `SpriteToolOptions`, plus `ArtToolOptions` under classic
  (`s1-facets.tsx`, which passes `caps` and no `singleRow`). None passes `singleRow`, and the
  non-`singleRow` branch is the old element unchanged.

## 4. The harness, every run

**Rig.** The harness's own. Every gesture is `Input.dispatchMouseEvent` or `Input.dispatchKeyEvent`.
Aims are integers, dpr and rects are printed, the Xvfb pointer is parked, and every part ends with
`no mouse event reached the page at a position this harness did not send`. Teardown uses
`spawnGuarded` + `await killTree`. Each run makes a fresh mkdtemp copy from `AEON_DIR` (itself an
rsync copy of the aeon working tree without `.git` and `.claude`), and no `/tmp/mbfix-aeon-*` copy
survived. Before every run there was a fresh `VITE_AURORA_DEBUG=1 npm run build`, with
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` and `AURORA_BUILT_TREE`
set to this worktree. Every run printed
`root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a323cc4453f3854fa` and
`pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a323cc4453f3854fa`.
**Display:** screen 1680x1050, window outer 1400x900, inner 1400x872, **dpr 1 in all 11 runs**.

**The narrower width.** `Browser.getWindowForTarget` is not served on the page target (`-32601`), so
the 1100-wide census uses the harness's fallback, `Emulation.setDeviceMetricsOverride`
(innerWidth 1100). The fallback is printed in every run, and it is not a real window resize. It is
cleared before the part ends, and each run printed `window back to 1400x872`.

**PART aob's rows.**
- AOB.0 and AOB.N.0: every tool in HEAD's `ArtToolDock` TOOLS table was armed by a real click, and
  the store read back that tool.
- AOB.a and AOB.N.a: the bar height, the canvas rect and the New… button's top are the same under
  every tool.
- AOB.b and AOB.N.b: the row fits the bar, or the bar scrolls it.
- AOB.t: `title` and `aria-label` equal HEAD's `SHARED_TILE_WARNING`.
- AOB.w: the first write to a clean chunk moves neither the bar height nor the canvas.
- AOB.s (O3): section 5.

| run | harness blob | src | parts | totals | start, end (UTC) |
|---|---|---|---|---|---|
| **repro1** | `b62d403f` | master's (HEAD `3110a099`) | aob | 5/10: **FAIL AOB.a, AOB.b, AOB.t, AOB.N.b**; AOB.s UNMEASURABLE (later made a note) | 09:45:31Z, 09:46:09Z |
| dev1 | `74c773be` | HEAD `4f199df6` (first cut) | aob | 9/9 PASS, bar 48 everywhere | 09:49:01Z, 09:49:40Z |
| dev2 | `8d731737` | HEAD `5bce74a4` | aob | 9/9 PASS, bar 44 everywhere | 09:50:55Z, 09:51:33Z |
| **red-prefix** | `8d731737` | the three fixed files at `c276f527` | aob | 5/9: **FAIL AOB.a, AOB.b, AOB.t, AOB.N.b** | 09:52:30Z, 09:53:07Z |
| **red-prefix-noreserve** | `8d731737` | the same, plus `ecaf2e28`'s art-facet hunk reversed | aob | 5/9: **FAIL AOB.a, AOB.t, AOB.w, AOB.N.b** | 09:53:20Z, 09:53:57Z |
| mutD-fixed-noreserve | `8d731737` | HEAD with only the badge reservation undone | aob | 9/9 PASS (AOB.w bar 44 to 44) | 09:54:16Z, 09:54:53Z |
| **mutE-centred** | `8d731737` | primitives.tsx at `4f199df6` (chips centred) | aob | 8/9: **FAIL AOB.a** (New… y 88.5 vs 83.5) | 09:55:03Z, 09:55:40Z |
| **mutB-nosinglerow** | `8d731737` | HEAD with `singleRow` dropped from ArtOptions | aob | 7/9: **FAIL AOB.a, AOB.N.b** | 09:55:49Z, 09:56:26Z |
| **final1** | `8d731737` | HEAD `e0f5ea86`, identical | all | **46/46 PASS, 0 FAIL, 0 UNMEASURABLE** | 09:56:35Z, 09:58:37Z |
| **final2** | `8d731737` | the same | all | **46/46 PASS, 0 FAIL, 0 UNMEASURABLE** | 09:58:46Z, 10:00:47Z |
| **final3** | `8d731737` | the same | all | **46/46 PASS, 0 FAIL, 0 UNMEASURABLE** | 10:00:48Z, 10:02:49Z |

Logs: `docs/captures/2026-09-25-art-options-bar-height/logs/`, one file per run named as above,
plus `npmtest1.log`. For every mutation, the log's `src on disk: DIFFERS FROM HEAD` lists the files
changed. Each restore was `git checkout HEAD -- <files>`, followed by an empty
`git status --porcelain --untracked-files=no`. The three finals come after the last restore and are
the baseline shown green again.

## 5. Red-first evidence, per claim row

The reds under the final harness blob (`8d731737`) re-establish repro1's reds, which ran on the
first blob (invariant 6e).

- **AOB.a (full window):**
  - red-prefix: heights `pencil 46, eraser 37, …, dither 116, tile-stamp 88, palette-apply 116`,
    canvas y 135 to 214.
  - mutB-nosinglerow (compact warning, growing bar): `32/37/46`, canvas 130 to 144.
  - mutE-centred: every bar 48 and every canvas at 146, but New… at `y 88.5` under eight tools and
    `83.5` under dither, tile-stamp and palette-apply.
  - Green in dev2 and all three finals: 44px, canvas `y 142`, New… `y 81`.
- **AOB.b (nothing cut, full window):** red-prefix FAIL. Palette-apply's row was 1167 of 1160 with
  `overflow-x: visible`. It is green in the finals, where dither 1196/1160, tile-stamp 1190/1160 and
  palette-apply 1210/1160 scroll with `auto`. It went green in red-prefix-noreserve and in mutB,
  because the overflow depends on what else sits in the bar. It is a control more than a
  discriminating row.
- **AOB.N.b (nothing cut, 1100 wide):** red in red-prefix, red-prefix-noreserve and mutB (every
  tool overflows with `visible`). Green in the finals.
- **AOB.t (full sentence reachable):** red-prefix FAIL, `title null, aria null` on
  `⚠ pixel edits to existing tiles propagate everywhere they're used`. Green in the finals:
  `"⚠ shared tiles"`, with `title` and `aria` both set to the sentence.
- **AOB.w (first write, the acj case):** **it does not discriminate against master.** Row 209's
  reserved badge already holds it there (red-prefix PASS, 88 to 88). It is red only with that
  reservation undone as well (red-prefix-noreserve: `bar h 46 -> 88`, canvas `144 -> 186`). Under
  the fixed tree with the reservation undone (mutD), it is green (`44 -> 44`). So the fixed height
  holds the first write by itself.
- **AOB.N.a (1100 wide, same under every tool):** **it does not discriminate.** At 1100 wide every
  tool wraps to the same height on master (116) and under mutB (46), so this row is green on every
  tree measured. It checks the fixed tree at that width and proves nothing more. A width where some
  tools wrap and others do not would make it discriminate. Not chosen here: the brief named 1100.
- **AOB.0 and AOB.N.0** are the anti-vacuous rows. The census read `pencil -> pencil`, …,
  `palette-apply -> palette-apply`, 11 distinct, in every run.
- **AOB.s (O3), NOT DRIVEN.** A library chunk opens with an atlas cell for every nonzero nametable
  word (`docFromChunk`), and OJZ's blank chunks carry nonzero words (tile 0 with palette bits). So
  the warning is already showing when the document opens, and a first write cannot make it appear.
  The run found no all-zero chunk among the project's 71 and prints `NOTE [AOB.s] NOT DRIVEN …
  neither green nor red` rather than a row or a permanent UNMEASURABLE. The part does not plant a
  chunk. The fixed height covers O3 by construction, because the warning appearing only changes
  widths inside a row that cannot wrap. That is argued, not measured.
- **PART atl (row 209, the mid-stroke switch):** its printout "canvas before the switch / after" read
  `y 186 -> 135` on row 209's tree (its dev-atl4). In final1 it read `y 142, barH 44` on both sides.

**Node row** (`src/renderer/components/art/__tests__/shared-tile-warning.test.ts`, 3 tests, committed
at `e0f5ea86` before the mutations):
- Mutation 1, `title` and `aria-label` removed from the span (diff quoted:
  `-    <span role="note" title={SHARED_TILE_WARNING} aria-label={SHARED_TILE_WARNING}` /
  `+    <span role="note"`): **2 failed | 1 passed**. The hover and assistive-tech rows are red.
- Mutation 2, the shown text back to the sentence (`-      ⚠ shared tiles` /
  `+      ⚠ {SHARED_TILE_WARNING}`): **1 failed | 2 passed**. The short-label row is red.
- Restored with `git checkout HEAD -- src/renderer/components/art/SharedTileWarning.tsx`: 3 passed.

No node test asserts the bar's CSS. The height is a browser fact, and the live rows hold it.

## 6. Suite

`VITEST_MAX_WORKERS=4 npm test` on the final tree (`e0f5ea86`, 10:02:55Z
to 10:03:57Z), exit 0. Every pre-gate passed, including `check-cited-paths OK` and
`check-harness-guards` `293 clean / 294 classified · 0 failure(s) · 1 unguarded-untracked ·
0 unmeasurable` (the same G9 probe row 209 reported). Vitest reported
**Test Files 660 passed | 3 skipped (663); Tests 10355 passed | 9 skipped (10364)**. The skip-report
line was "OK. Every skip named its reason", and failure-class reported no failures across 663
modules. Log: `docs/captures/2026-09-25-art-options-bar-height/logs/npmtest1.log`. Run again at
`c25ee5fe` (this packet, the logs and the ROADMAP row committed, so the docs gates judged them),
10:06:29Z to 10:07:48Z, exit 0, `check-doc-citations: OK`, the same totals:
`docs/captures/2026-09-25-art-options-bar-height/logs/npmtest2.log`.

## 7. Calls I made, and where the brief and the tree differed

- **The height is 44, not 32.** The ordinary bar is 32px, but the Art bar needs a scrollbar band.
  At 1400x872 three tools overflow even with the compact warning, and without a reserved band the
  scrollbar would either change the chips' position (mutE) or cut them. The canvas therefore starts
  at `y 142`: 7px lower than master's lowest position (135, under the short-bar tools) and 44px
  higher than its Tile-stamp position (186).
- **O3 is a note, not an UNMEASURABLE row.** A row that can never run in this project would leave
  the registered harness exit-1 forever. The note says NOT DRIVEN, neither green nor red, and the
  code runs the row on any project that has an all-zero chunk.
- **The brief said the pre-fix bar was 88 (Tile stamp) and 37 (Collision paint).** True, but
  incomplete: dither and palette-apply were 116, and pencil and line were 46.
- **`Browser.setWindowBounds` is not reachable** from the harness's page target, so the narrow
  census is an emulated viewport (section 4).

## 8. Observations for the overseer, not acted on

- **N1. At the owner's 1400x872, three tools scroll.** Dither, Tile stamp and Palette line need 30
  to 50px more than one row: 1196, 1190 and 1210 of 1160. The ruling allows this, but the default
  window now shows a thin scrollbar under those tools. The fastest ways to fit one row are shorter
  labels in the doc header (Save / New…), the zoom control, or moving `Priority lens` out of the
  bar. Each is a look call.
- **N2. At 1100 wide, every tool scrolls** (1022 to 1210 of 860).
- **N3. The scrollbar is visible, unlike the nearest precedent.** TabStrip, the fixed-height
  `overflow-x: auto` strip this mirrors, hides its scrollbar (`scrollbar-width: none`). I kept this one
  visible (`thin`) so content off the edge has a sign. Not swept: whether any other strip shows one.
- **N4. `ClassicArtToolDock`'s host (s1-facets) still uses the growing bar.** Whether classic's tile
  composer moves its canvas on a tool switch was not measured.
- **N5. The warning's `role="note"`** is my choice, so that the label names the element. A screen
  reader pass was not done.

## 9. TAGGED for the foreground

- The look at 1400x872 with the thin scrollbar under Dither, Tile stamp and Palette line (N1, N3).
- A real window resize to 1100 and a scale factor other than 1. Every run read dpr 1, and the
  scrollbar band's 2px spare is sized for other scale factors without being measured on one.
- O3 on a project that has an all-zero library chunk.
- Nothing here needs the emulator. None was started, attached to or read.

## 10. Commits

`3110a099`, `1d51b80e`, `4f199df6`, `5bce74a4`, `e0f5ea86`, then this packet, the logs and the
ROADMAP row (the tip is in the final report).
