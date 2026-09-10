# GRID-RESIZE-NOT-SAVED: REPRODUCED, and it is worse than the audit said

> **CLOSED LATER THE SAME DAY.** The residual this packet left open (the
> stranded `section_N` files, and the load-side ledger a sweep would need) is
> done: `docs/reviews/2026-09-10-resize-orphan-sweep.md`. The row named below as
> `KNOWN DEFECT, still open: a stranded section file resurrects a phantom
> section` no longer exists under that title, so grepping for it finds nothing;
> it was converted in place to `a stranded section file is swept, so no phantom
> section comes back`, with both of its commented assertions restored. The rest
> of this document stands as written.

2026-09-09. Branch `grid-resize-roundtrip`. Node/vitest only: no Electron, no
CDP, no ROM build, no emulator.

## Verdict

**REPRODUCED.** The 2026-09-09 read-only audit's hypothesis holds on every
link. It also understated the consequence: on a populated act, a widening
resize did not merely lose a setting, it **destroyed one section's data and
duplicated another**.

Fixed: `src/core/project/aeon/save.ts` now syncs the act's grid dimensions into
the raw config so `project.json` carries them.

Still open, and deliberately not fixed here: the save does not sweep the
`section_N` files the re-index strands, so a stranded file resurrects a phantom
section into a slot the resize left empty. See "The residual" below for why
that is a separate row and not three more lines.

## What was claimed, and what is true

The audit read the code and reported, without running anything:

> `set-sections` mutates the act's `gridWidth`/`gridHeight` in memory; the aeon
> save writes `project.json` from the config's raw object verbatim and nothing
> syncs the grid back (zero writers); load rebuilds the grid from the stored act
> config. So: add a column, save, reopen -> old dimensions, new `section_N`
> files orphaned.

Every link checks out:

| Link | Where | Verified |
|---|---|---|
| `set-sections` writes the MODEL only | `src/core/editing/history.ts`, the `set-sections` branch of `applyCommand` and of `undoCommand` | it assigns `level.act.gridWidth` / `gridHeight` and `level.act.sections`, nothing else |
| the save never writes the grid | `src/core/project/aeon/save.ts` | before this parcel, `gridWidth` did not appear in the file at all; `configChanged` was raised only by the tileset and BG pointer retargets, so `project.json` was not even in the plan after a pure resize |
| load rebuilds from the CONFIG | `src/core/project/aeon/load.ts` | `const totalSections = actConfig.gridWidth * actConfig.gridHeight`, and the `acts.push({...})` that follows takes `gridWidth: actConfig.gridWidth` |
| the two are different objects | `src/core/config/s4-config.ts` `S4ActConfig` vs `src/core/model/s4-types.ts` `Act` | `config.zones` aliases `config.raw.zones`, so the config side reaches `project.json`; the model side never touches it |

`set-sections` is also the command behind add / remove / move / paste, not only
the grid steppers, so any structural op that changes the grid HEIGHT was in the
same state: `addSection` in `src/core/editing/section-ops.ts` appends a row when
the grid is full.

## What the audit's reading missed

Two things, both of which only appear once the chain is executed.

**1. It is data loss, not a lost setting.** The audit stopped at "old
dimensions, new `section_N` files orphaned". Run it and the orphan is not inert.
`resizeGrid` preserves each section's `(col, row)` and changes only its flat
index, so widening a 2x2 act to 3x2 moves the bottom row from flat 2,3 to flat
3,4. The save writes the bottom row to `section_3` and `section_4`. The reopen
still enumerates 2x2, so it reads `section_0..3`:

* `section_2` on disk is the PRE-resize flat 2, which nothing overwrote;
* `section_3` on disk is the POST-resize flat 3, i.e. the same section again;
* `section_4` holds the fourth section and nothing ever reads it.

The author reopens to a grid where the third section appears twice and the
fourth is gone. The next save writes those four slots back and the fourth
section is gone from disk too. Measured markers, fixture marker `0x0100 + i` in
nametable word 0: expected `[256, 257, null, 258, 259, null]`, got
`[256, 257, 258, 258]`.

**2. Why no fixture ever caught it.** Every act fixture in
`src/core/project/aeon/__tests__/` was 1x1, where `resizeGrid` has nowhere to put
a section that a wrong enumeration could miss. That is the gap, and it is the
reason a static claim about this was arguable at all.

## The test

`src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts`, runner
`npm test` (`vitest run`; collected by the `src/**/__tests__/**/*.test.ts`
include, confirmed by `scripts/check-test-collection.mjs`). Four rows, all
against the REAL `loadAeonProject`, the REAL `EditHistory.execute` on a real
`set-sections` command built the way `src/renderer/components/SectionGridNav.tsx`
builds it, and the REAL `buildAeonSavePlan`, with the plan's files and removals
applied to the in-memory file map between the two loads.

Expectations are derived, never observed: the expected dimensions are the
arguments handed to `resizeGrid`, and the expected file set and marker set come
from the resized grid's own occupancy.

* `a widened grid keeps its new dimensions across save and reopen`
* `a widened grid loses no section: every one comes back where the resize put it`
* `KNOWN DEFECT, still open: a stranded section file resurrects a phantom section`
* `a shrunk grid keeps its new dimensions across save and reopen`

### Red first

On the committed baseline `65bb12ec` (the test alone, no fix), with the first
shape of the file:
`Test Files 1 failed (1)`, `Tests 4 failed (4)`, 0 passed.

The two rows that mixed the loss and the orphan were then split, one row per
defect, so the claim was re-established under the new shape. The proof method
changed, so both halves are recorded:

Mutation, applied to the committed fix and quoted back from disk
(`git diff --stat` reported `src/core/project/aeon/save.ts | 3 ++-`):

```
-  if (rawActGrid
+  if (false && rawActGrid
     && (rawActGrid.gridWidth !== act.gridWidth || rawActGrid.gridHeight !== act.gridHeight)) {
     rawActGrid.gridWidth = act.gridWidth;
     rawActGrid.gridHeight = act.gridHeight;
     configChanged = true;
   }
+  void rawActGrid;
```

With that applied: `Tests 3 failed | 1 passed (4)`. The three that fail are the
three the fix owns. The fourth is the KNOWN DEFECT pin, which stays green on
purpose: it pins a defect this fix does not touch, so it must be insensitive to
it. Restored with `git checkout HEAD -- src/core/project/aeon/save.ts` from the
committed fix, green again immediately after.

## The fix

`src/core/project/aeon/save.ts`, in `buildAeonSavePlan`, beside the tileset and
BG pointer retargets: write `Act.gridWidth` / `gridHeight` into the raw
`S4ActConfig` and raise `configChanged`.

One-way (model to config), guarded by an inequality like every retarget beside
it, so an act whose grid nobody touched still adds no write. No repo-owned
escape hatch (`editorGridWidth` beside `editorTilesetPath`) because there is no
second reader to protect: unlike `tileset` and `bgLayout` the dimensions name no
file, and aeon authors its act descriptor under `games/*/data/levels/` rather
than from this key.

## The residual, and why it is its own row

The sync stops the loss. It does not sweep the stranded `section_N` files, so
after a widening resize `section_2` still sits at a flat index the resize left
EMPTY and the reopen resurrects a phantom duplicate there. That is wrong data,
not lost data, and the next save makes the phantom real.

The sweep is not a one-liner, and shipping it here would have broken a written
invariant of the file it lands in. `buildAeonSavePlan` states twice that a
load-time parse failure must not lead to destroying data, and its removal
helper `removalsFor` derives the removable set from what was LOADED, subtracting
`unreadable` a second time for exactly this reason. The save has no equivalent
knowledge for sections: `src/core/project/aeon/load.ts` pushes `null` for a slot
whose `tiles.bin` is ABSENT and for a slot whose `tiles.bin` it REFUSED to
parse, in the same `if (!loaded)` branch, and the `unreadable` record it made is
discarded along with the section. A save-side sweep therefore cannot tell "the
author emptied this slot" from "Aurora could not read this file", and deleting
on that ambiguity destroys the file a parse failure was protecting.

So the sweep needs a load-side ledger of which absent slots were absent because
Aurora could not read them. That is a real parcel. Until it lands, the residual
is pinned by the `KNOWN DEFECT, still open` row, which asserts today's
behaviour, derives the phantom's identity from the fixture rather than from an
observed value, and carries the two assertions to restore commented inside it.

## Zone.palette / set-palette-line: same family, DIFFERENT shape, its own row

The audit named this as "a second instance of the same shape". It is a second
instance of the same FAMILY (the editor mutates a model the save never writes
back) but not of the same shape, and the difference is what its fix costs.

Proven by running it, not by reading. Throwaway probe: load a project, execute a
real `set-palette-line` through `EditHistory`, build the real save plan, apply
it, reopen.

```
PROBE in-memory line1 color1: {"r":7,"g":0,"b":0}
PROBE plan paths: ["data/ojz/act1/section_0.tiles.bin","data/ojz/act1/section_0.objects.json",
                   "data/ojz/act1/section_0.rings.json","data/editor/ojz_tiles.bin","project.json"]
PROBE configChanged: true
PROBE reopened line1 color1: {"r":0,"g":0,"b":0,"a":255}
PROBE pal bin still all zero: true
AssertionError: expected { r: +0, g: +0, b: +0, a: 255 } to deeply equal { r: 7, g: +0, b: +0 }
```

The palette edit is silently discarded. But note what the plan contains: no
palette file at all. This is not a missing one-line sync into a config object
the save already rewrites. It is a missing write TARGET:

* there is no palette serializer. `src/core/formats/palette.ts` exports
  `parsePaletteLine` and `buildPalette` and nothing that goes the other way.
* there is no editor-owned palette destination. `S4ZoneConfig` in
  `src/core/config/s4-config.ts` has `editorTilesetPath` but no
  `editorPalettePath`, so the editor-destination invariant that governs
  `tileset`, `bgLayout` and `bgTiles` has no palette member to follow.
* the load reads the zone palette out of a binary named by `zoneConfig.palette`
  and mixes in a player palette from a second file, so a naive write-back would
  also have to decide which of the two an edited line 0 belongs to.

Serializer plus config field plus pointer retarget plus the line-0 question is a
parcel, not a line. Left for its own row per the brief, unfixed and unedited
here. The probe was not committed.

## Runs

* `npx vitest run src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts`
  -> `Test Files 1 passed (1)`, `Tests 4 passed (4)`.
* `npx vitest run` (whole suite) -> `Test Files 586 passed | 3 skipped (589)`,
  `Tests 8749 passed | 9 skipped (8758)`, zero failed.
* `npx tsc --noEmit` -> rc 0.

## Pre-existing red, not this parcel's

`npm test` as a CHAIN does not reach vitest: `scripts/check-doc-citations.mjs`
exits 1 on `docs/2026-09-09-audit-briefing.md:18`, which cites a lane-status
JSON file under `docs/` that is untracked in this repo. (The path is not
repeated here: this gate judges citations, so naming it would make this document
fail for the same reason.) Confirmed pre-existing by stashing this work and
re-running the gate on `b64245ad`, which also exits 1. Not touched here.

`scripts/check-ledger-timestamps.mjs` is also red, on a repeated-stamp rule in
one of the two ledgers. Same treatment: red with this work stashed, and neither
commit in this parcel touches a ledger (`git show --stat` on both lists only
`src/core/project/aeon/save.ts` and the new test file). Not touched here either.

Every other gate in the `npm test` chain passes, including
`scripts/check-test-collection.mjs` (so the new file IS executed),
`scripts/check-test-dashes.mjs`, `scripts/check-cited-paths.mjs` and
`scripts/check-pseudo-skip.mjs`.

## For the foreground

Nothing in this parcel needs the app or the emulator: the defect and the fix
both live below the renderer, and the round trip exercises the real load and the
real save-plan builder. What a foreground run WOULD add is confirmation that the
grid steppers in `src/renderer/components/SectionGridNav.tsx` reach
`applyGridOp` with the arguments this test assumes, and that a real Ctrl+S
applies the plan's `project.json` write. Both are worth one pass on a
multi-section act if the owner is at the machine anyway; neither is load-bearing
for the verdict.
