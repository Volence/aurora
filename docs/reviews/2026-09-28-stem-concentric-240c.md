# Row 240 (c): the angle mark's stem is concentric in its casing

Branch `parcel/stem-concentric-240c`, from master `c249f9b0`. ROADMAP row 240 (c), ruled by
the overseer 2026-09-28. Background: `docs/reviews/2026-09-28-device-grid-238.md` section 7.1.

## Summary

- **The ruling as built.** The stem's core is unchanged. Its casing is the core plus the bar's
  own casing margin on each side:
  - `stemWidths(coreWidth, casingWidth)` is new in `src/core/collision/collision-angle-mark.ts`;
  - core = `coreWidth * ARROW_WIDTH_SCALE`;
  - casing = `core + (casingWidth - coreWidth)`.
- **One place.** `drawAngleMark` calls `stemWidths`, and no caller changed. Every surface that
  draws the mark gets the new casing through it:
  - aeon's `OverlayRenderer`;
  - classic's `drawCollision`;
  - `collision-shape-draw.ts`, which serves MapViewport's collision-paint ghost and
    CollisionPalette's picker thumbnails and preview;
  - the legend swatch.
- **Unit tests.** `stem-concentric.test.ts` is new. It was red on the pre-fix code, and five
  existing files were updated to the ruling.
- **Suite:** 698 files: 694 passed, 1 failed, 3 skipped. 11956 tests: 11934 passed, 2
  failed, 20 skipped. `run-completeness: COMPLETE, 698 of 698`.
  - The two failures are in `test/formats/clip-tool-outputs.test.ts`. They are marked "NOT AN
    AURORA REGRESSION": aeon `70027733` (2026-09-28 12:52) moved
    `games/sonic4/data/clips/s2_woven/clips.json`, which is an input to a pinned clip fixture.
    This parcel does not touch them (section 5).
- **On screen:**
  - `harness:stragglers-239d`: 50/50. That is the 48 existing rows plus a new
    `.m.stem.margins` row at dpr 1 and 1.5, which measures the stem's two casing margins.
  - `harness:canvas-dpr-237`: 29/29.
  - Both ran against this worktree's build (section 4).
- **Not measured.** All of this ran under Xvfb, not on the owner's monitor. The real-monitor
  look stays booked for the owner, as with 237 (c).

## 1. A number in the ruling does not match the disk, and the disk wins

The ruling says the casing becomes "core + the bar's own casing margin on each side (1 CSS
px, so 4 CSS px at the stem's scale)". The brief also asks for the width to be derived from
the constants.

The derivation does not give 4:

- The bar's margin on disk is `(3 - 1.25) / 2 = 0.875` CSS px, not 1. The module's own
  docblock already says "0.875 screen px per side".
- So the derived casing is `2 + 2 x 0.875 = 3.75` CSS px.

I built the derived expression. The literal 4 would be a typed number with no source in the
constants.

Both widths meet the ruling. 3.75 and 4 both round to an even device width, so each is
concentric at every dpr.

- They draw the same device width at dpr 1, 1.25, 1.35, 1.5, 1.6, 2, 2.5 and 3.
- They differ only at dpr 4. There, 3.75 x 4 = 15 is a width tie and goes thinner, to 14.
  4 x 4 = 16.
- At dpr 4 the bar's margin is 3 device px. 3.75 gives the stem a margin of 3 (matching the
  bar); 4 would give 4.

If the overseer wants the literal 4, it is a one-line change in `stemWidths`. The tests
derive their expectations from the same constants, so they would need the same change.

## 2. Per-dpr device widths, before and after

All widths are in device px, from `deviceStrokeWidth`:

- the stem core is 2 CSS px;
- the old casing was 3 x 1.6 = 4.8 CSS px;
- the new casing is 3.75 CSS px;
- the bar is 1.25 CSS px in 3.

In the "before" columns, which side carries the extra pixel depends on where the stroke
lands. The unit sweep and the screen both measured left 1, right 2 at dpr 1, and left 2,
right 3 at dpr 1.5.

| dpr | stem core | casing before | margins before | casing after | margins after | bar core / casing / margin |
|---|---|---|---|---|---|---|
| 1    | 2 | 5  | 1 / 2 | 4  | 1 / 1 | 1 / 3 / 1 |
| 1.25 | 2 | 5  | 1 / 2 | 4  | 1 / 1 | 1 / 3 / 1 |
| 1.35 | 2 | 7  | 2 / 3 | 6  | 2 / 2 | 1 / 5 / 2 |
| 1.5  | 2 | 7  | 2 / 3 | 6  | 2 / 2 | 1 / 5 / 2 |
| 1.6  | 4 | 7  | 1 / 2 | 6  | 1 / 1 | 1 / 5 / 2 |
| 2    | 4 | 9  | 2 / 3 | 8  | 2 / 2 | 3 / 5 / 1 |
| 2.5  | 4 | 11 | 3 / 4 | 10 | 3 / 3 | 3 / 7 / 2 |
| 3    | 6 | 15 | 4 / 5 | 12 | 3 / 3 | 3 / 9 / 3 |
| 4    | 8 | 19 | 5 / 6 | 14 | 3 / 3 | 5 / 11 / 3 |

**The ruling's condition holds everywhere.** The stem's two margins are equal at every dpr
swept, so there is no dpr where they are unequal to report.

**Reported, not solved.** "One outline weight" is exact in CSS px, since both elements have a
0.875 CSS px margin. In device px the stem's margin and the bar's differ at three dprs,
because each width rounds on its own:

- at 1.6 the stem's margin is 1 and the bar's is 2;
- at 2 the stem's is 2 and the bar's is 1;
- at 2.5 the stem's is 3 and the bar's is 2.

Evening these out would need a new rule, or a change to the core, and the ruling forbids
both.

## 3. Tests

- **New: `src/renderer/canvas/__tests__/stem-concentric.test.ts`.**
  - It draws with the real `drawAngleMark` through the real `segmentsOnDeviceGrid`, under both
    callers' mappings:
    - aeon: `cameraDeviceMapping`, with widths divided by `zoom`;
    - classic: `getTransform()`, with widths divided by `zoomScale`.
  - The sweep:
    - dpr 1, 1.25, 1.35, 1.5, 1.6, 2, 2.5, 3 and 4;
    - 75 zooms from 0.875 to 8, covering both tiers;
    - 3 cameras;
    - a floor (vertical stem) and a wall (horizontal, double-ended stem).
  - Every expectation is derived from `deviceStrokeWidth` and the constants: casing minus core
    is even, both margins are equal, and each margin is the derived one. The test also checks
    that the stem core, the bar core and the bar casing are unchanged, and that the bar is
    still concentric.
  - A census row holds the restated 1.25 and 3 to both callers' source.
- **Updated to the ruling:**
  - `classic-marks-device-grid.test.ts`: the row that asserted the 0.5 offset now asserts a
    shared centre and equal margins.
  - `overlay-stragglers-device-grid.test.ts` (aeon site 3): now checks the ruled casing width
    and a shared centre.
  - `map-leftovers-device-grid.test.ts` (the paint ghost): now checks the ruled casing width
    and a shared centre.
  - `collision-angle-mark.test.ts`: the stem's casing minus its core equals the bar's, at both
    tiers.
  - `stroke-width-ties.test.ts`: the stem casing entry is now 15/4. It is fed along the real
    arithmetic path, `(1.25/u)*1.6 + (3/u - 1.25/u)`. dpr 4 is its exact width tie.

**Red-first.** For each step, the fix was committed, then `stemWidths`' casing line was
reverted on disk:

```
-  return { coreWidth: core, casingWidth: core + (casingWidth - coreWidth) };
+  return { coreWidth: core, casingWidth: casingWidth * ARROW_WIDTH_SCALE };
```

The file was then restored with `git restore --source=HEAD`.

- **Step 1** (the new file plus classic and aeon site 3): 48 tests red out of 363. After the
  restore, 363/363.
- **Before step 1 was committed:** the new file alone, against master's code, was 18 red out
  of 22. Those 18 are the two callers x 9 dprs, e.g. `stem casing 5, want 4` and
  `margins 1 / 2, unequal`.
- **Step 2** (the paint ghost and `collision-angle-mark.test`): 26 red out of 69 under the
  same revert, and green after the restore.

## 4. On screen (Xvfb, not the owner's monitor)

Both harnesses were run with `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`
and `AURORA_BUILT_TREE=<this worktree>`, after `VITE_AURORA_DEBUG=1 npm run build`. The aeon
tree was the copy `AEON_DIR=/home/volence/.cache/aurora-revendor-aeon/tree`. Every run
printed:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a08afc3ccd818682d
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a08afc3ccd818682d
```

- **`harness:stragglers-239d`: 50/50 on the fix**, at dpr 1 and 1.5.
  - The `m` part's stem prediction now uses the ruled casing.
  - The new row is `<scale>.m.stem.margins`. For every pixel across the stem, on every sampled
    line, it compares against the off shot and classifies the pixel as core over casing (C),
    casing only (K) or unchanged (.). It does not use the predicted spans. Each line must parse
    as `.* K+ C+ K+ .*`, and both K runs must equal `(deviceStrokeWidth(casing) -
    deviceStrokeWidth(core)) / 2`.
  - On the fix:
    - dpr 1: `...KCCK....`, margins 1/1 on all 11 lines;
    - dpr 1.5: `...KKCCKK....`, margins 2/2 on all 16 lines.
  - Red-first: the same harness against a build with the casing line reverted:
    - dpr 1: `...KCCKK...`, margins 1/2 on all 11 lines. `s1.m.stem.margins` and
      `s1.m.stem.out` were red.
    - dpr 1.5: `...KKCCKKK...`, margins 2/3 on all 16 lines. `s1.5.m.stem.margins` and
      `s1.5.m.stem.out` were red.
    - Both runs ended 3/5 on the `m` part.
  - **The first reverted run lost its dpr 1.5 session.** It aborted with "aeon copy did not
    open": the harness's `aeon.open` call was lost to a CDP "Promise was collected" error. The
    retry at 1.5 alone opened.
  - **Against a pre-fix baseline.** I recorded a baseline from the same tree with the casing
    line reverted (`EDGE_OUT`), then compared the fix to it (`EDGE_BASELINE`), at dpr 1:
    - `s1.m.stem.id`: 11 of 88 px differ. That is one column per line, the casing's extra
      column.
    - `s1.lg.id`: **19 of 324 legend-swatch px differ.** This is by design: the swatch's
      diagonal stem is drawn at its CSS casing width, now 3.75 where it was 4.8. The row stays
      a claim, and its label now says that a baseline from before 240 (c) differs.
- **`harness:canvas-dpr-237`: 29/29.** It measures classic's ghost, drag preview and marquee,
  and the dpr listeners. It measures no angle mark.
- **Unmeasured on screen:**
  - classic's stem (only aeon's `OverlayRenderer` stem is read);
  - the paint ghost's stem;
  - dpr other than 1 and 1.5;
  - the picker thumbnails (section 6).

## 5. The two suite failures (not this parcel)

Both are in `test/formats/clip-tool-outputs.test.ts`:

- `CURRENCY ... s2_woven.clipact.json`;
- `... validate-json.cases.json`.

The detail: `games/sonic4/data/clips/s2_woven/clips.json: pinned 30e2fc14, origin/master
e0bc22db has 3d53fccd`. Aeon's `70027733` ("song bank 2: Wing Fortress and Oil Ocean ...",
2026-09-28 12:52 -0400) moved that input after master re-pinned it (`64f2c111`). The fix is a
re-vendor and re-pin parcel, which is outside this row.

The first full run, before step 2, did NOT have these failures. Its 26 reds were all mine: 24
in `map-leftovers-device-grid` and 2 in `collision-angle-mark.test`. So aeon's `origin/master`
ref moved between the two runs, most likely a fetch by another session. My diff touches
neither the clip fixtures nor the test.

## 6. Open

- **The number (section 1).** I built 3.75 CSS px, derived from the constants, where the
  ruling states 4. The two differ on screen only at dpr 4. The overseer should confirm.
- **Scope: every surface got the new casing, not only the two map overlays.** The shared path
  also serves:
  - MapViewport's collision-paint ghost (snapped; now concentric too);
  - the legend swatch (diagonal, 19 px moved);
  - CollisionPalette's picker thumbnails and big preview, which draw unsnapped in their own
    units. Their stem outline gets lighter. The casing was `markCasingWidth x 1.6`; it is now
    the stem core plus the bar's margin. For example, at a 28 px box:
    - old casing: 5.25 x 1.6 = 8.4;
    - new casing: 3.5 + 3.06 = 6.56;
    - the core is unchanged at 3.5.

  `collision-angle-mark.ts` records that the compact-tier thumbnail was once judged too faint.
  The core, which carries the arrow's weight there, is unchanged, but the dark outline around
  it is thinner. That is for the owner's eye, with the rest of the look.
- **The owner's real monitor look stays booked for the owner**, as with 237 (c).
- **ROADMAP row 240 is not edited here.** The overseer owns the row text.
