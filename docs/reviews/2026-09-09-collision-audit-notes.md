# COLLISION-NEVER-AUDITED — working notes

Branch `parcel/collision-audit`, base `53ce4dfd`. These are AUDIT NOTES, not a
landing report: they are committed as they are formed so a death costs the run
and not the read.

## 1. The two figures, re-derived (do not carry the brief's)

Measured in this worktree, `find src/core/collision -type f`:

- **20 files**, **3,852 lines** (`.ts`, all of them).
- The brief's "roughly 3,010 new lines and six new files" and "about 20 files
  where an August packet recorded 14" — the 20 is right. The line total is
  3,852 today.
- **Only ONE test file lives inside the module** (`__tests__/collision-angle-mark.test.ts`,
  518 lines). The rest of the suite is out of tree, in `test/collision/` —
  22 files, 2,822 lines. Module + its tests = 3,852 + 2,822 = 6,674 lines, and
  the test:code ratio is 0.87:1. "Dense" is accurate.

## 2. The consumer set, established by imports rather than by a doc

⚠ **THE BRIEF'S FACT 1 IS DIRECTIONALLY RIGHT AND WRONG ABOUT THE FILE.**
`collision-adapter.ts` is NOT what classic imports. Its only two importers are
`adapters/s4-collision-adapter.ts` (aeon-only) and one test. Enumerated with
`grep -rn "core/collision" src/renderer/components/classic src/core/level-classic
src/core/formats/classic src/core/project`, the classic path imports exactly TWO
modules of this tree:

- `collision-render.ts` — `columnSolidRun` (classic-overlays.ts), `heightSparkline`
  (ClassicCollisionPanel.tsx)
- `collision-angle-mark.ts` — `angleMarkFromColumns`, `drawAngleMark`,
  `MIN_CELL_PX_FOR_MARK` (classic-overlays.ts), `DETAIL_CELL_PX` (its test)

So the aeon/classic SEAM is those two files and nothing else. The conclusion the
brief drew from the wrong file still holds — a defect in this tree reaches both
paths — but the seam to review is `collision-render` + `collision-angle-mark`,
not the adapter interface. Anyone acting on the original sentence would review
the wrong file and find nothing, which is the more expensive of the two errors.

Everything else in the tree is reached from the aeon road (`MapViewport`,
`OverlayRenderer`, `CollisionPalette`, `agent-handler`, `debug-hooks`,
`aeon/load.ts`, `aeon/save.ts`, `editing/*`) plus two engine-neutral consumers
(`chunk-library-import.ts`, `core/formats/chunk-mappings.ts`).

## 3. Baseline

`npm test` in this worktree at base: **552 files passed / 3 skipped (555);
8107 tests passed / 9 skipped (8116)**. Every skip named its reason
(`skip-report: OK`).

## 4. Method: mutation testing, because a green author's suite proves nothing

The brief's fact 2 says a green suite is evidence about internal consistency.
The way to turn that into evidence about correctness is to plant plausible
defects and see which the suite does not notice. Harness applies one edit,
quotes it back from disk with `git diff --stat`, runs `npx vitest run`, records
the aggregate, and restores with `git checkout --` from the COMMITTED baseline
(the tree was clean before each run).

Twenty-five mutations. **Twenty-two killed, three survived.**

Killed (defect classes the suite really does catch): `flipHeightYByte` losing its
full-block case; `facesRight` boundary; `columnSolidRun` losing its 16px clamp;
`isSolidCell` dropping the solidity half; `cancellingScanRows` floor→ceil;
`SLOPE_THRESHOLD_PX` 4→7; `withCrossover` failing to clear the old field;
`unexamined` zeroed; `resolvePlaneWords` accepting a short plane;
`scanCancellingRuns` walking every sub-row; `classifyProfile`'s solid predicate;
`isEmptyBlock` dropping a word; s4 `solidCount` off by one; the region read's
four-sub-tile mixed test dropping one comparison; `spanForTileCol` swapping
left and right; `buildBothPlanesEntries` copying the aimed plane's crossover
onto the other plane (the self-mark trap); `outwardNormalFromTangent` losing
`VERTICAL_EPS`; `packCollisionCell` widening the shape mask into the X-flip bit;
the mixed-cell crossover count sampling top-left instead of any sub-tile;
`heightSparkline` round→floor; `solidEdges` dropping `bottom` from
`sides-bottom`.

⚠ ONE MORE "SURVIVOR" THAT IS NOT A GAP, recorded so nobody re-finds it and
files it. Dropping `index >= plane.length` from `crossoverInPlane` leaves the
suite green, but the very next line (`word === undefined`) already answers for
every realistic `ArrayLike` — a typed array and a plain array both read
`undefined` past their end. The guard is unobservable defence in depth, not
untested behaviour, and a test for it would have to hand-build
`{length: 2, 5: 9}`. Not reported as a finding.

### SURVIVOR 1 — `full-block-shape.ts`, and it reaches authored data

    -    if (p && p.heights.length === 16 && p.heights.every(h => h >= 16)) return i;
    +    if (p && p.heights.length === 16 && p.heights.every(h => h >= 15)) return i;

Whole suite still **8107 passed, 0 failed**. `findFullBlockShapeId` names "the
plain solid block", and that id is STAMPED INTO AUTHORED DATA by two writers:

- `chunk-mappings.ts` `blockRefToCollisionWord` — every solid cell of every
  chunk in a donor import;
- `chunk-migrate.ts` `migrateLegacyChunkCollision` — a one-shot, load-time,
  non-idempotent rewrite of a legacy chunk's collision planes.

A bank whose first 15px-tall shape precedes its first 16px one would have every
imported solid cell seeded with a shape one pixel short of solid, and nothing in
the suite says so. `test/collision/full-block-shape.test.ts` is 38 lines and
pins the sentinel and the search order; it never asserts that the returned shape
is actually FULL.

FIXED in `test/collision/full-block-shape.test.ts`: the decoy is now one pixel
short and sits before the answer, and a new row measures the returned shape's
every column through `columnSolidRun` rather than restating the module's `>= 16`.
Red-first proof: with `h >= 15` on disk the file failed 3 of 4, and each failure
named the planted mechanism (`expected 3 to be 4` — the near-miss won;
`{y:1,h:15}` where `{y:0,h:16}` was required; `expected 2 to be +0` on a bank
with no full block).

### SURVIVOR 2 — `crossover-audit.ts` `crossoverAuditSeverity`, and it is the
### module's own headline defect

    -  if (a.cancelling > 0 || a.oneWay > 0) return 'warn';
    +  if (a.oneWay > 0) return 'warn';

Whole suite still **8108 passed, 0 failed**. A two-way pair painted at the
DEFAULT mark width is exactly `pairs > 0, oneWay == 0, cancelling > 0` —
layer-transition.ts's own words are that every two-way pair paintable at cell
width nets to nothing, "not a corner case, every one of them". So the mutated
predicate grades the defect this whole parcel exists to close as `ok`, on the
single most likely thing an author does with the feature, and
`crossoverAuditSeverity` is what `CollisionPalette` colours on and what
`paint_collision` returns to an agent.

A TEST PER COMPONENT AND NONE ACROSS THE SEAM: `crossover-span.test.ts` asserts
`audit.cancelling` and the run simulation, `crossover-audit.test.ts` asserts the
severity for one-way / self-mark / reserved, and neither ever asked what the
predicate says about a cancelling run. Each file looks complete alone.

FIXED in `test/collision/crossover-span.test.ts` on the fixtures that already
drive the shipped painters end to end: the cell-width pair asserts
`severity === 'warn'` with `oneWay`/`selfMarks`/`reserved` pinned to 0 first (the
control — `oneWay` is the other arm of the same tier), and the half-width pair
asserts `severity === 'ok'` so the first row cannot be met by a predicate that
warns on everything. Red-first proof: exactly one failure,
`expected 'ok' to be 'warn'` at the new line, with the three controls passing
above it.

### SURVIVOR 3 — `collision-angle-mark.ts` `surfaceAnchor` median

    -  const c = solid[(solid.length - 1) >> 1];
    +  const c = solid[solid.length >> 1];

Whole suite still 8107 passed. Cosmetic (moves the mark's anchor column by one
on even-width solid runs), and the 518-line angle-mark suite does not pin it.
NOT FIXED and deliberately so: for an even count of solid columns there is no
unique median, both answers are defensible, and a row asserting one of them
would be a test pinning an assumption rather than a behaviour — the exact thing
this audit was sent to find. Reported for the controller to rule on.

## 5. Findings formed so far, not yet all proven

- **`findFullBlockShapeId`'s 0 is two answers.** Docblock: "Returns 0 (air) when
  no profiles are loaded — callers must treat 0 as 'cannot migrate/seed solid
  cells'." It is ALSO 0 when profiles ARE loaded and contain no full block. Two
  of three consumers handle it: `migrateLegacyChunkCollision` returns false on 0
  (correct no-op) and `blockRefToCollisionWord` writes air. But
  `renderer/providers/chunk-library-import.ts` `importChunkFiles` does not look:
  it imports every chunk with all-air collision, calls `markDirty()`, and toasts
  `Imported N chunks -- Save to keep` as a SUCCESS. Not-looking renders as a
  clean result, at a gesture that writes the project. CONFIRMED as a silent
  path; the consumer is outside this tree, so the fix is the controller's call.
- **`flipProfile` recomputes `hasAngle` from s4's odd-byte rule** in a module
  whose own `collision-model.ts` says the encoding "is not any one game's byte
  layout" and that `hasAngle` is "decoded by the adapter". Latent today (s4 is
  the only adapter producing `CollisionProfile`). PLAUSIBLE, layering.
- **`resolveCell` / `organizePalette` alias the base bank's `heights`.**
  `flipProfile` returns the SAME object when neither flip is set, and
  `resolveCell` spreads it (`{...flipped, solidity}`) which copies the Int8Array
  REFERENCE. No consumer mutates today (checked: no `\.heights\[.*\] =` outside
  the tree). Latent.
- **`readCollisionCell` reads past a plane's end as `?? 0` = air**, in the same
  tree where `crossoverInPlane` exists precisely because folding an absent index
  to a benign value under-reports. Not reachable today —
  `aeon/load.ts readCollisionPlaneFile` rejects a `.collattr.bin` that is not
  `SECTION_PLANE_WORDS * 2` bytes, and `ensureCollisionPlanes` seeds an absent
  plane at that size. Latent; reachable the day a short plane can exist.
- **`findMatchingBlockCells`'s docblock says "Returns the painted cell first."**
  It does not — the loop pushes in scan order. No caller reads `out[0]`
  (`collisionPaintTargets` returns `primary` separately), so it is a false
  comment rather than a live defect.
- **`classic-overlays.ts` re-implements the tier gate** (`zoomScale * 16 >=
  MIN_CELL_PX_FOR_MARK`) that `drawAngleMark` already applies internally via
  `markTier`. A second copy of the rule the module was created to own. Agrees
  today.

## 6. What this audit did NOT fix, and why

- **`chunk-library-import.ts`'s silent success on a 0 full-block shape.**
  Outside this tree, and whether the right answer is a refusal, a warning toast
  or a notice is a design call about a user gesture. Recommendation: refuse the
  import when `findFullBlockShapeId` returns 0 and say which of the two reasons
  applies, because the alternative is a project saved with every imported chunk
  collisionless and no way to tell it apart from a bank that genuinely has no
  full block.
- **`surfaceAnchor`'s median on an even run.** No unique right answer; pinning
  one would be a test encoding an assumption.
- **`flipProfile` recomputing `hasAngle` from s4's odd-byte rule.** Changing it
  to carry the input's `hasAngle` through is a one-line fix, but it is a
  cross-engine contract decision and today no adapter can tell the difference.
- **Nothing that changes authored output** was touched. Both landed changes are
  test-side only; no file under `src/core/collision/` is modified on this branch.

## 7. Not yet reached

- The remaining `test/collision/` files read only for vacuity patterns, not
  line by line.
- `OverlayRenderer.ts`'s aeon collision draw (the largest consumer) read only
  around the plane-length call sites.
- No runtime confirmation attempted anywhere; no emulator touched.
