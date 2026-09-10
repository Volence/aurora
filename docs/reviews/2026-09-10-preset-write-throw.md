# PRESET-WRITE-THROW-MAYBE-UNHELD: settled by deletion, and it was a real gap

2026-09-10. Branch `parcel/preset-write-throw`, off `cb714bbb`.
Node/vitest only: no Electron, no CDP, no ROM build, no emulator, and none was
needed.

Closes the lens lead `PRESET-WRITE-THROW-MAYBE-UNHELD`
(`docs/lens-findings.jsonl`), raised as an explicit LEAD rather than a finding
by the parcel written up in `docs/reviews/2026-09-10-effects-subtraction-guards.md`.
That packet's author found the gap by grep, said so, and refused to publish it
as a finding because a grep cannot tell a held guard from an unheld one. This
parcel deleted the throw.

**The verdict, in one sentence: the lead is CONFIRMED. The raster-preset
write-side throw was held by nothing at all, and it now has a row.**

## The two sites

Both in `buildAeonSavePlan`, `src/core/project/aeon/save.ts`, on the same rule
stated twice. Quoted from disk at `cb714bbb`:

**The SCENE site**, `save.ts:566-576`:

```
566	  const unreadableScenePaths = new Set(project.effectsScenes.unreadable.map(u => u.path));
567	  for (const scene of project.effectsScenes.scenes) {
568	    const path = effectsScenePath(dataRoot, scene.id);
569	    if (unreadableScenePaths.has(path)) {
570	      throw new Error(
571	        `refusing to save scene "${scene.id}": ${path} exists and could not be read as an ` +
572	        'effects scene, so writing there would destroy it. Fix or remove that file by hand, ' +
573	        'or rename the scene.',
574	      );
575	    }
576	    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsScene(scene)), compare: 'json' });
```

**The RASTER PRESET site**, `save.ts:597-607`:

```
597	  const unreadablePresetPaths = new Set(project.effectsPresets.unreadable.map(u => u.path));
598	  for (const preset of project.effectsPresets.presets) {
599	    const path = effectsPresetPath(dataRoot, preset.id);
600	    if (unreadablePresetPaths.has(path)) {
601	      throw new Error(
602	        `refusing to save preset "${preset.id}": ${path} exists and could not be read as a ` +
603	        'raster preset, so writing there would destroy it. Fix or remove that file by hand, ' +
604	        'or rename the preset.',
605	      );
606	    }
607	    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsPreset(preset)), compare: 'json' });
```

The row the lead named as covering the scene half is
`src/core/project/aeon/__tests__/aeon-effects-scenes.test.ts:287`:

```
287	      .rejects.toThrow(/broken\.json exists and could not be read/);
```

A whole-tree grep for the message text finds exactly two producers (the two
throws above) and exactly one consumer (that line), which is consistent with
the lead and, on its own, proves nothing. What follows is the deletion.

## Baseline

`npm test` on the unmutated tree at `cb714bbb`, EXIT captured on its own line:

* `EXIT=0`
* `Test Files  597 passed | 3 skipped (600)`
* `Tests  8930 passed | 9 skipped (8939)` — **zero failed**
* `failure-class: no failures in this run (600 module(s) reported).`
* `skip-report: OK. Every skip named its reason.`
* Duration 23.54s. Machine `uptime` at launch: `05:28:42 up 9:49, load average: 5.08, 7.82, 8.64`.

The 9 skips are the suite's standing opt-in rows and none was introduced here.
One of them is the main-checkout-only `sibling-root` row, which a linked
worktree structurally cannot measure; it names that in its own skip reason.

## Mutation 1 — the POSITIVE CONTROL, at the scene site

Without this, a green at the preset site is worthless: it cannot distinguish "no
row holds it" from "my method cannot see a row going red".

Applied by deleting the guard block (`sed -i '569,575d'`), then read back off
disk in the same command as the other site:

```
=== git diff --stat ===
 src/core/project/aeon/save.ts | 7 -------
 1 file changed, 7 deletions(-)
=== SCENE site now (mutated) ===
566	  const unreadableScenePaths = new Set(project.effectsScenes.unreadable.map(u => u.path));
567	  for (const scene of project.effectsScenes.scenes) {
568	    const path = effectsScenePath(dataRoot, scene.id);
569	    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsScene(scene)), compare: 'json' });
570	  }
=== PRESET site now (must be INTACT) ===
593	    if (unreadablePresetPaths.has(path)) {
594	      throw new Error(
595	        `refusing to save preset "${preset.id}": ${path} exists and could not be read as a ` +
```

`npx vitest run`, `uptime` at launch `05:29:46 up 9:50, load average: 11.57, 9.34, 9.11`:

* `EXIT=1`
* `Test Files  1 failed | 596 passed | 3 skipped (600)`
* `Tests  1 failed | 8929 passed | 9 skipped (8939)`
* Duration 20.58s

The single failure, and it fails at the property rather than at a fixture
invariant:

```
FAIL  src/core/project/aeon/__tests__/aeon-effects-scenes.test.ts > buildAeonSavePlan: the effects-scene library > refuses the whole save when an authored scene id collides with an unreadable file
AssertionError: promise resolved "{ files: [ { …(2) }, …(7) ], …(3) }" instead of rejecting
```

So the method detects this exact class of deletion, in this exact file, through
this exact runner. Restored with `git checkout cb714bbb -- src/core/project/aeon/save.ts`
— a COMMITTED baseline, not `git checkout --` on a dirty tree — and
`git status --short` came back empty.

## Mutation 2 — the RASTER PRESET site, alone

Same treatment, one site at a time (`sed -i '600,606d'`), quoted back with the
scene site in the same command:

```
=== git diff --stat ===
 src/core/project/aeon/save.ts | 7 -------
 1 file changed, 7 deletions(-)
=== PRESET site now (mutated) ===
597	  const unreadablePresetPaths = new Set(project.effectsPresets.unreadable.map(u => u.path));
598	  for (const preset of project.effectsPresets.presets) {
599	    const path = effectsPresetPath(dataRoot, preset.id);
600	    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsPreset(preset)), compare: 'json' });
601	  }
=== SCENE site now (must be INTACT) ===
569	    if (unreadableScenePaths.has(path)) {
570	      throw new Error(
571	        `refusing to save scene "${scene.id}": ${path} exists and could not be read as an ` +
```

`npx vitest run`, `uptime` at launch `05:30:22 up 9:51, load average: 14.02, 10.41, 9.49`:

* `EXIT=0`
* `Test Files  597 passed | 3 skipped (600)`
* `Tests  8930 passed | 9 skipped (8939)` — **zero failed**
* Duration 21.06s

**Nothing reddened. Identical totals to the unmutated baseline.** The guard
could be deleted from `save.ts` and the whole suite would wave it through.

The lead's grep was therefore correct in its conclusion as well as its caution:
the `rejects.toThrow` rows it found for presets are in
`src/renderer/agent/__tests__/agent-handler.effects-preset.test.ts` and assert
the AGENT TOOL's refusal, which never reaches `buildAeonSavePlan`.

Restored from `cb714bbb` again; `git status --short` empty.

## The row that was added

`src/core/project/aeon/__tests__/aeon-effects-presets.test.ts` — a new file,
two rows, committed at `b88b2cf5` as the baseline the red run then mutates from.
**Nothing in `save.ts` changed**: `git diff cb714bbb --stat -- src/core/project/aeon/save.ts`
is empty, so it is byte-identical to master.

### Why a new file rather than a row bolted onto a neighbour

Three neighbours were considered and each was wrong for a stated reason:

* `aeon-effects-scenes.test.ts` holds the scene half, but its header declares
  its own scope in prose ("the effects-scene library") and its fixtures build
  only the scene directory. A preset row there would make the file's banner a
  lie, which is the documented way this repo teaches readers to stop trusting
  banners.
* `save-removals.test.ts` has a ready-made preset fixture including a truncated
  `broken_p.json`, but its entire subject is what a save may DELETE. The
  write-side throw is a different guard, and its own packet says so.
* `save-compare-tags.test.ts` pushes presets, but is about write-skip
  comparison tags.

The new file carries its own listing `memFa` for the reason both neighbours
already state in their headers: the `aeon-load`/`aeon-save` adapter's `list()`
returns nothing unconditionally, and a preset library is loaded BY listing a
directory, so a row written against that adapter reports "no presets" for every
fixture and passes whether the caller is wired or not.

### The rows are phrased against the INSTRUMENT'S DISCRIMINATION

`buildAeonSavePlan` rejects for several unrelated reasons. A row asserting only
that "the save plan refused" would stay green with this guard deleted if any
neighbouring refusal fired instead, and a row phrased against the defect ("the
author's file is not destroyed") would go green forever the moment anybody made
the write path safe some other way. So the throwing row pins down WHICH guard
answered and rules out every neighbour that could have:

1. **the SCENE throw at the same rule** — the fixture contains no unreadable
   scene at all, asserted with `expect(r.project.effectsScenes.unreadable).toEqual([])`,
   so that guard has nothing to fire on; and the rejection is asserted NOT to
   match `/could not be read as an effects scene/`;
2. **schema validation of the authored document** — the preset being authored is
   a real `parseEffectsPreset` result that re-serializes and re-parses to itself,
   both asserted, so the separate "invalid document in memory" refusal has
   nothing to complain about;
3. **the broken file's mere PRESENCE** — the CONTROL row builds a plan over the
   same fixture with an authored id that does NOT collide, and gets a plan: the
   authored preset is written at the path its id names, and the broken file is
   neither written over nor removed. What throws is the COLLISION.

The property assertion itself names the file and the document kind, with the
path DERIVED through the production helper `effectsPresetPath` rather than typed
by hand — a hand-spelled path keeps agreeing with itself after the writer moves
its directory:

```ts
await expect(planFor(r, files)).rejects
  .toThrow(new RegExp(`refusing to save preset "${BROKEN_ID}": `
    + `${brokenPath.replace(/[.]/g, '\\.')} exists and could not be read as a raster preset`));
```

The broken fixture is a TRUNCATION of the file's own real `presetDoc` cut at
`Math.floor(len * 0.6)` — an interrupted write rather than a stub — and the
loader's refusal is asserted rather than assumed, so a truncation that happened
to still parse would redden the row rather than pass it. The run confirms the
loader really refused it, on stderr:

```
[effects] data/editor/effects/presets/broken_p.json could not be read as a raster preset:
broken_p.json is not valid JSON: Unterminated string in JSON at position 129 (line 8 column 6)
```

## Mutation 3 — RED FIRST for the new row

Baseline committed at `b88b2cf5`; `git status --short` empty before the
mutation. Same cut as mutation 2, re-applied:

```
=== git diff --stat ===
 src/core/project/aeon/save.ts | 7 -------
 1 file changed, 7 deletions(-)
=== PRESET site now (MUTATED) ===
597	  const unreadablePresetPaths = new Set(project.effectsPresets.unreadable.map(u => u.path));
598	  for (const preset of project.effectsPresets.presets) {
599	    const path = effectsPresetPath(dataRoot, preset.id);
600	    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsPreset(preset)), compare: 'json' });
601	  }
=== SCENE site (must be INTACT) ===
569	    if (unreadableScenePaths.has(path)) {
570	      throw new Error(
```

`npx vitest run`, `uptime` at launch `05:33:28 up 9:54, load average: 5.80, 8.87, 9.13`:

* `EXIT=1`
* `Test Files  1 failed | 597 passed | 3 skipped (601)`
* `Tests  1 failed | 8931 passed | 9 skipped (8941)`
* Duration 20.39s

```
FAIL  src/core/project/aeon/__tests__/aeon-effects-presets.test.ts > buildAeonSavePlan: the raster-preset write-side refusal > refuses the save when an authored preset id collides with an unreadable preset file, and it is the RASTER PRESET guard that answers
AssertionError: promise resolved "{ files: [ { …(2) }, …(7) ], …(3) }" instead of rejecting
```

Exactly one failure, and it is the new row. **The CONTROL row stayed green**,
which is what it is for: it is a control precisely because it does nothing under
this mutation.

Restored from `b88b2cf5`.

## Mutation 4 — the new row is SITE-INDEPENDENT

A row that reddened for either site's deletion would prove the pair while
leaving open which row guards which. So the SCENE throw was deleted instead,
with the new file present:

```
=== SCENE site (MUTATED) ===
568	    const path = effectsScenePath(dataRoot, scene.id);
569	    files.push({ path, bytes: new TextEncoder().encode(serializeEffectsScene(scene)), compare: 'json' });
=== PRESET site (must be INTACT) ===
593	    if (unreadablePresetPaths.has(path)) {
594	      throw new Error(
595	        `refusing to save preset "${preset.id}": ${path} exists and could not be read as a ` +
```

`npx vitest run`, `uptime` at launch `05:34:04 up 9:54, load average: 14.80, 10.78, 9.76`:

* `EXIT=1`
* `Test Files  3 failed | 595 passed | 3 skipped (601)`
* `Tests  4 failed | 8928 passed | 9 skipped (8941)`
* Duration 34.84s

The scene row reddened and **the new preset row stayed green**, which is the
property this run exists to establish.

Three of those four failures were NOT this parcel's, and they are written up in
the next section rather than merged into a "green" — a tail excerpt would have
hidden them.

## The three extra failures: the prior packet's flake, now with its MODE measured

`docs/reviews/2026-09-10-effects-subtraction-guards.md` recorded a one-row
`npm test` flake in `test/config/prose-constant-fold.test.ts` and said
explicitly, with a warning marker, that it had NOT captured the failure text and
therefore could not say the mode was a TIMEOUT rather than an ASSERTION. This
run captured it. All three are the same:

```
FAIL  test/config/prose-constant-fold.test.ts > the real gate, over the real repo > has the DERIVED FG_PAGE_FRAMES in its table, at the value the source derives
Error: Test timed out in 5000ms.
 ❯ test/config/prose-constant-fold.test.ts:181:3

FAIL  test/config/prose-constant-fold.test.ts > the real gate, over the real repo > says on its PASSING line that it is not full coverage, with both counts
Error: Test timed out in 5000ms.
 ❯ test/config/prose-constant-fold.test.ts:194:3

FAIL  src/renderer/components/art/__tests__/art-discard-guard.test.ts > §E no door in src/ asks through a native browser dialog > no window.confirm, window.alert or window.prompt anywhere
Error: Test timed out in 5000ms.
 ❯ src/renderer/components/art/__tests__/art-discard-guard.test.ts:518:3
```

Reported durations 5246ms, 6498ms and 5273ms. So:

* the MODE is a timeout, which the prior packet listed as a mechanism it was
  consistent with and deliberately did not claim. That is now measured, not
  inferred;
* the POPULATION is wider than the one file the prior packet named — it reaches
  a second file with the same subprocess shape;
* the trigger is load. This exact tree ran green three separate times in this
  parcel (baseline, mutation 2, mutation 3) at load 5.08 to 5.80, and this run
  went red at 14.80 with the duration up from ~21s to 34.84s.

`vitest.config.ts` sets no `testTimeout`, so these rows run on vitest's default
while shelling out to a node subprocess that walks the whole repo, in parallel
with the rest of the suite.

**Why this is worth a ledger row rather than a shrug: these are GATES.** A gate
that goes red on a busy box teaches its readers to re-run rather than to read,
and every "merged tree green" in a review packet is silently a claim about the
box's load at that moment. Filed as
`SUITE-SUBPROCESS-ROWS-TIME-OUT-UNDER-LOAD` (open, medium). The ask is an
explicit `testTimeout` for the subprocess rows, sized off a measurement of how
long that gate subprocess actually takes on a loaded box — **not** off the
6498ms observed here, which is one sample of a distribution and would be a
number copied from a measurement rather than derived from one.

⚠ What is NOT established about it: I did not bisect which of the two files
introduced the exposure, did not measure the subprocess in isolation, and did
not attempt a repro at a controlled load. It is a real, reproduced-once,
mode-identified flake and no more than that.

## Final green run

Tree restored to `b88b2cf5` + this packet + the two ledger lines.
Runner: `npm test` — the 15 `check:*` gate scripts, then `npm run typecheck`,
then `vitest run`, chained with `&&`, so vitest running at all is proof the
gates and the typecheck passed. `vitest.config.ts` collects
`src/**/__tests__/**/*.test.ts`, which is how the new file is picked up, and
`scripts/check-test-collection.mjs` confirms every test-shaped file on disk is
collected — so the new file cannot be a silent zero.

Numbers for this run are in the final commit's message, recorded after the last
write rather than before it.

## What this parcel does NOT prove

* It judges the PLAN, not the file system. `buildAeonSavePlan` returns a plan;
  nothing here watches an actual write or `unlink`. The claim "the author's byte
  on disk really survived" is out of this layer's reach and belongs to the CDP
  harness family (`npm run harness:deleted-scene-returns` makes the analogous
  claim for removals).
* The new row is **ambiguous between two places the same rule can be deleted** —
  the `if (unreadablePresetPaths.has(path))` guard and the `throw` inside it —
  and goes red for either. That is correct, because they are one rule. It is NOT
  ambiguous between the two libraries: mutation 3 reddened only the preset row
  and mutation 4 only the scene row, measured separately.
* It is evidence about a GUARD, not about a live data-loss bug. The UI refuses a
  colliding id at CREATE time (`scene-ui`'s `takenSceneIds` and its preset
  counterpart), so this throw is a backstop. Whether the UI's refusal is itself
  held by a row was NOT measured here.
* Nothing was checked in a running app. No Electron, no CDP, no ROM, no
  emulator, per this parcel's standing invariants.

## For the foreground

Nothing in this parcel needs the app or the emulator, and nothing is TAGGED as
needing one. The `SUITE-SUBPROCESS-ROWS-TIME-OUT-UNDER-LOAD` row is a
source-layer fix and needs no runtime confirmation either.
