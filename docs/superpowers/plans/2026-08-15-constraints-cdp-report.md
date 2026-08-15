# Phase 2B — CDP verification of the constraint readouts and the clash overlay

**Result: 30 checks, 30 pass, 0 fail**, against real s1disasm data (GHZ act 1) in the built
Electron app under xvfb. Plus a planted-bug pass that fails the one check it should and nothing else.

Harness: `scratchpad/constraints-cdp-harness.mjs`. It **imports** phase 2A's
`scratchpad/canvas-cdp-harness.mjs` for launch discipline, the page-side helper bundle, input
dispatch, the project/act opener and the New Canvas dialog driver — that harness's own report
records three defects which each produced a convincing FALSE result before being caught, so a
fresh reimplementation would have started by re-earning trust this code already has. 2A's file
gained a main-module guard so importing it no longer launches Electron and drives fourteen rows
as a side effect.

```
node scratchpad/constraints-cdp-harness.mjs        # all rows, ~2 minutes
ONLY=3,4 node scratchpad/constraints-cdp-harness.mjs
```

Every mutation goes through the real UI — real swatch clicks, real pointer drags, a real `<select>`
change event, real typed input into the grid-origin fields, real Ctrl+Z. The only reads that bypass
the screen are `window.__dbg.*`, which is read-only, and they corroborate rather than replace what
was read off the canvas.

---

## What the screen actually shows

The status bar, read live off the running app:

```
clash-probe | Genesis level art | 64×64
  tiles 4 unique · 17 free in GHZ 1 · pool 948/965
  colours 1·1·0·0 / 15 per line
  colour 17 · line 1 idx 1 | 11× zoom
```

GHZ reporting **17 free tile slots** independently reproduces the figure recorded in the project
notes from an entirely different measurement path, which is worth more than either number alone.

---

## The rows

| # | Claim | Evidence |
|---|---|---|
| 1a–1d | The readouts exist, a blank canvas is one unique tile, the act is named, the pool numbers are real | `tiles 1 unique · 17 free in GHZ 1 · pool 948/965` |
| 2a–2c | A stroke raises the tile count; the colours readout moves on the painted line **and no other** | `colours 1·0·0·0` after one line-0 stroke |
| 3a–3b | Two palette lines in one 8×8 cell tint **that cell and only that cell** | red at `8,0`, nothing else |
| 3c | **No count of clashing cells anywhere** (spec §4.3) | full status bar scanned for `\d+ cells?/clashes?` — absent |
| 4a | **Line-3 art on transparency does not tint** — transparency has no line | no tint at `24,0` |
| 5a | Erasing back to one line clears the tint | `["8,0"] → []` |
| 6a, 6a2 | A one-line profile flags the line-3 cell, in **amber** (re-assign) not red (redraw) | amber at `24,0`, red empty |
| 6b | The colours readout still shows a line the profile lacks, when it is in use | `colours 1·—·—·1 / 15 per line` |
| 6c–6d | The sprite profile adds a frame readout and names the bound only when exceeded | `frame 8×8 tiles (one sprite is 4×4 max)` |
| 7a, 7c | An aligned grid reports no pixels outside it; nudging the origin puts a band outside and says so | `· 512px outside the grid` appears |
| 8a–8e | *Unconstrained* blanks every readout to `constraints —`, drops the tint, greys the Clashes chip, and rescans on re-enable | `unique=null` while off, `unique=4` after |
| 9a–9c | The overlay toggles alone: tint goes, readouts stay, and the chip takes a warning tone while hiding a real clash | border `rgb(251,191,36)` |
| 10a–10c | One stroke adds one tile, one Ctrl+Z takes the readout back, and the canvas hash proves the pixels moved too | `4→5→4`, hash `4135154060 → 1870414279` |

Screenshots in `scratchpad/shots-canvas/2b-*.png`.

---

## The planted-bug pass

The strongest verification available, per the standing lesson: reintroduce the original bug, rebuild,
watch the app fail, revert, watch it recover.

Planted in `findCellClashes` — dropping the `isTransparent` skip, so transparency counts as line 0:

```
PASS  [3a] the clashing cell is tinted
PASS  [3b] and ONLY that cell
PASS  [3c] no COUNT of clashing cells anywhere in the status bar
FAIL  [4a] line-3 art on transparency does NOT tint (transparency has no line)
```

Exactly one check fails, and it is the one the rule exists to protect. Reverted and rebuilt, all four
pass again. A checklist that only ever passes has not been tested; this one has.

---

## Findings

**F1 — the tile readout printed the internal zone slug: `17 free in ghz 1`.** A real defect, caught
only here. `ZoneActRef.zone` holds the project's lowercase slug, and the readout was rendering it
raw — on the same status bar that says "Green Hill Zone Act 1" a few inches to the left. Every unit
fixture happened to pass an already-uppercase zone, which is precisely why no test noticed: the test
data was tidier than the real data. Fixed by uppercasing at the presentation boundary, with a
regression test that feeds it the lowercase slug the store actually holds.

**F2 — nothing else.** The overlay, the two toggles, the profile gating, the transparency rule, the
grid-origin re-cut, the undo coupling and the no-count rule all behaved as specified on first
contact with the running app.

---

## Four harness defects, and what each of them had claimed

Recorded because every one of them first appeared as an **app** failure, and three of the four would
have been written up as bugs by anyone who trusted the first run.

1. **`querySelector('footer')` read the LEVEL status bar.** The classic editor's pane stays mounted
   at `display:none` while a canvas tab is active, so the first footer in the DOM is its. Ten checks
   failed with `Green Hill Zone Act 1 · 48×5 chunks` in their detail. Fixed by selecting the
   *visible* footer.

2. **A leftover canvas file made the second run's create refuse.** A canvas names a file, so
   `clash-probe` from run 1 was still on disk and run 2's create was rejected as a duplicate — the
   dialog stayed open, no tab appeared, and the run continued against a level tab reporting a screen
   of "readout failures" whose real cause was that no canvas existed. Fixed by clearing the canvas
   directory at start **and** by making `makeCanvas` prove it worked: it now checks the dialog
   closed, that swatches exist, and that the visible status bar names the canvas. *A setup step that
   cannot fail is a setup step that poisons every check after it.*

3. **The amber tint detector could not see amber.** Both tints are low-alpha over whatever is
   beneath, and cell centres are mostly transparent — so amber composites to about `(97,77,51)`,
   nowhere near its nominal `(255,176,32)`. The first detector demanded `g > 90` and saw nothing,
   which was reported as "the sprite profile flags nothing". Recalibrated against the actual
   composite: both tints lift red above blue, and only amber also lifts **green** above blue.

4. **Two checks asserted things that were never true.** Row 7 demanded the unique-tile count change
   when the grid origin moves — it need not, and did not: three separated blobs cut differently are
   still three distinct shapes plus the blank tile. Row 10 pressed Ctrl+Z once against a blob that
   `paintCell` issues as *four* drags, then reported "undo moves nothing" with three quarters of the
   paint still on screen. Both were rewritten to assert what the feature actually claims — the band
   outside the grid, and a single-gesture stroke.

The pattern across all four is the phase-1 lesson again, one level up: **the checks that failed were
the ones whose fixtures were tidier than reality.** Uppercase zone ids, a clean canvas directory, a
tint at full opacity, an undo stack of one — every one of those is an assumption that only breaks
where the code meets the running app.
