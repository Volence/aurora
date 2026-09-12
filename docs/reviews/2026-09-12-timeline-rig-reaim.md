# TIMELINE-HARNESS-AIM-DRIFT: the two timeline rigs, re-aimed and run

Parcel size S, branch `parcel/timeline-rig-reaim`, cut from master `d73ae428`. Harness code
only: `src/` is untouched on this branch.

**In one paragraph.** Both aims are re-pointed. Neither uses a copied string any more: one
derives from the app's source, the other from the preset contract. Every aim either harness
types into or clicks now resolves exactly one element, or stops with `aim missed: <what>;
looked in <where>`. Plants proved that stop red on disk, for both the none and the
more-than-one case. With the aims right:
- `ramp-control` runs to its tally: **22/23, three runs out of three**. Its one red row is
  classified (b).
- `raster-timeline` passes **every row the drift used to fail**: 4a, 5b, 5b2, 5cA, 5cB and all
  pixel rows, 15 of 15 through 5d. It then stops, three runs out of three, on an app behaviour
  this parcel measured and did not fix. Showing the Parallax job moves the panel's selected
  scene off the scene the harness is editing, so 6a/6b fail and row 7's control is gone.

That is (b), with evidence below. The harness does NOT reach its 25-row final tally, and no
workaround was added to make it.

## The drift, reproduced on this tree before any edit

Build: `VITE_AURORA_DEBUG=1 npm run build` in the worktree at `d73ae428`, green. Environment
on every run:

```
ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron
AURORA_BUILT_TREE=<this worktree>
AEON_DIR=<a fresh copy, one per run>
```

**The aeon fixture.** One filesystem snapshot of aeon, taken at 2026-09-12T02:39:56-04:00 with
aeon's master ref at `a38ce7c9`. It excludes `.git/`, `.claude/` (aeon's own 9.9G of
worktrees) and `.pytest_cache/`, and comes to 199M. Every run got its own `cp -a` of that
snapshot, so no run could see another's edits and none touched the live tree.

⚠ The snapshot is of the WORKING tree, so it carries a peer session's uncommitted edits.
`git status` there showed at least `ojz_act1_start.json`, `presets/aurora_ramp_witness.json`
and two `section_0.collattr*.bin` modified. The obvious clean route, `git archive` of aeon, is
refused inside an isolated worktree (git outside the worktree), and I did not route around
that.

Unmodified harnesses on that build:

- `raster-timeline`: 0a 1a 1b 2a 3a 3b 3c 4b 5a 5d PASS. 4a, 5b, 5b2, 5cA and 5cB FAIL, then
  `TypeError: Cannot read properties of undefined (reading 'line')` at its `:550`. This is
  exactly the review's list:
  `docs/captures/2026-09-12-timeline-rig-reaim/00-before-raster-timeline.log`.
- `ramp-control`: b1 PASS. f0 FAIL, with `Add chip = {...,"disabled":false,"visible":true,
  "inScroller":true,...}; raster select = null`, so the chip was fine and only the aim was
  null. Then cv-a and cv-z FAIL, and `HARNESS ERROR: the second conversion did not take`:
  `docs/captures/2026-09-12-timeline-rig-reaim/00-before-ramp-control.log`.

## The aims: old, new, and what each is read from

| Harness | Control | Old aim | New aim | Derived from |
|---|---|---|---|---|
| raster-timeline | layer N vsplit toggle `<select>` (4 sites) | title prefix `Layer ${i} vsplit.at —`, typed | title prefix `Layer ${i} ` + the literal head of `LAYER_VSPLIT_ROW.title`. Today that is `Layer 1 vsplit.at: the Plane B row scrolled to from this strip down `. | `src/renderer/providers/effects-aeon.ts` (the constant) and `src/renderer/components/effects/EffectsScenePanel.tsx` (the composition `` `Layer ${i} ${LAYER_VSPLIT_ROW.title}` ``, matched exactly) |
| raster-timeline | layer N vsplit row spinner `<input>` (5 sites) | `Layer ${i} vsplit.at (`, typed (it still matched) | `Layer ${i} ` + the literal text the panel writes before `${EFFECTS_VSPLIT_AT_BOUNDS.min}` | `EffectsScenePanel.tsx` |
| raster-timeline | the scene form (holds `v_offset`) | a `div` whose `innerText` matches `/^SCENE\s*—/i` | `[data-section="aeon.effects.scene"]` | the CollapsibleSection id the app routes on (`src/renderer/providers/effects-sub-tabs.ts`) |
| ramp-control | the preset's program switch | the `<select>` in the Field row labelled `Raster` | the one `<select>` whose option VALUES are exactly the program arms | the top-level `oneOf` of `src/core/formats/effects/aurora-effects-preset.schema.json` (each branch's single `required` key): the same derivation as `EFFECTS_PRESET_PROGRAM_ARMS`, done independently |
| ramp-control | the two preset sections | header text `/^Raster band presets\b/` and `/^Preset: <id>(?!...)/` | `[data-section="aeon.effects.presets"]`, `[data-section="aeon.effects.preset.bands"]` | CollapsibleSection ids |

The derivations live in `scratchpad/lib/effects-control-aims.mjs`. A `.mjs` harness cannot
import TypeScript, so that module READS the source text with its own patterns and throws,
naming the file, if the shape it reads moves.

**The repo's stable-handle convention, used where it exists.** The convention is ids and
attributes: `data-section`, `data-effects-sub-tab` (`scratchpad/lib/effects-sections.mjs`), and
the canvas id. Where the app has no id, it is source derivation plus a node test that runs the
harness-side reading against the app's real constants, as `test/harness-effects-selectors.test.ts`
and the ramp harness's own `NS_PREMISE` do. `test/harness-effects-control-aims.test.ts` (7 rows)
pins the three derivations this parcel added:
- the toggle prefix is a prefix of `` `Layer ${i} ${LAYER_VSPLIT_ROW.title}` `` on every layer, and
  of no neighbour's (the spinner, the curve row, another layer, 1 against 10);
- the arms equal `EFFECTS_PRESET_PROGRAM_ARMS` and the `PROGRAM_ARM_OPTIONS` values;
- a moved source makes the reader refuse, naming the file;
- the strict builder gives one answer for one hit, none and two.

**Why the program switch is aimed by its options and not by `Program`.** Its label has already
moved once, and followed a change in what the list offers (the `⚠ "Program", NOT "Raster"`
comment in `BandPresetPanel.tsx`). The option set is the contract, and it moves only when the
contract does.

## Three more silent misses in the timeline harness, found by reading it against the tree

None was in the brief. All three went silent the same way: a return value nobody read.

1. **The scene-form door never opened.** `OPEN_SCENE_FORM` matched `/^SCENE\s*—/i`, and the
   header now reads `Scene: <id>`, so it returned `'no-scene-header'` and nothing read it.
   Section 8 (`v_offset`) could not have run on this app. It is now the section id, as in the
   table above. The regex came in with `1fe514f2` (2026-09-02). The 2026-09-05 selector sweep
   (`87262540`) migrated eight `Scene <dash>` sites and not this one.
2. **The closing "restore for the owner" block ran on the wrong job.** Four aims ran bare while
   the COLOUR job was showing, where no layer card is mounted. All four answered
   `'no-element'`, unwatched, so the owner's closing shot was of a strip with no splits. They
   now go through `onParallax`.
3. **`Delete scene` ran on the wrong job too**, and deleted nothing. It now goes through
   `onParallax`.

## Loud on a miss

`scratchpad/lib/strict-aim.mjs` builds every aim as an in-page expression. It returns the one
element, or throws, and each harness's `evalExpr` rethrows the exception. The message names:
- what was looked for;
- where;
- the active effects sub-tab, because the commonest miss on this column is a control on a job
  that is not showing;
- the count;
- the first three hits, when there is more than one.

Both harnesses' catch blocks now print a stop line: the tally so far, and the fails before the
stop. A stopped run therefore cannot be read as a short green one.

**Wording of the stop line.** The first version said "the harness, not the app". Row 7 proved
that wrong: a spinner that exists only while a split exists is absent when the APP moved the
selection. The line now says an element the run needed was absent, and to check the aim first
and the app state second.

**What is deliberately NOT an aim.** Some lookups are measurements whose absence a row judges,
and these still return a value:
- row 1b's Effects pill (the row IS its presence);
- `ramp-control`'s `paintedRect` (the ns and ds rows require sentences GONE);
- the strip-rect NOTE.

Folding those into the stop would turn a correct "the sentence is gone" into a crash. Row 9c
(the blanket `no-element` sweep) stays, as a backstop that the strict aims should now leave
permanently clean.

**Also changed, not an aim.** `rep.splits[0].x` became `rep.splits[0]?.x` at the 6a, 7a/7b and
8a sites. A strip that planned no split now FAILS those rows with their detail, instead of the
TypeError the review hit. No pass condition changed (`undefined` never equals a line). 6a's
detail now also prints the strip's scene, the panel's selected scene and the fixture's layers;
that detail is what classified 6a below.

## Red first

Each plant was shown on disk (`git diff`) before its run, and restored from the committed tree
(`git checkout -- <file>`, with HEAD holding all other work) after. Afterwards `grep -c PLANTED`
was 0 in every file.

- **A: `raster-timeline`, the old copied prefix, back at step 3.**
  ```
  -        await c.evalExpr(SET_INPUT(byTitle('select', VSPLIT.select(i), VSPLIT.where), 'at')));
  +        await c.evalExpr(SET_INPUT(byTitle('select', `Layer ${i} vsplit.at —`, 'PLANTED: the pre-2026-09-12 copied prefix'), 'at')));
  ```
  → 0a..3c PASS, then `STOPPED after 7 rows (7 passed), on a MISSED AIM ...` with
  `aim missed: <select> whose title starts with "Layer 1 vsplit.at —"; looked in PLANTED: the
  pre-2026-09-12 copied prefix (active sub-tab: parallax); found 0, want exactly 1`.
  Before, this was a FAIL at 4a and a TypeError three sections later:
  `docs/captures/2026-09-12-timeline-rig-reaim/02-plant-a-zero-raster-timeline.log`.
- **B: `ramp-control`, the old `Raster` row aim.**
  ```
  +        return one('PLANTED: the <select> in the Field row labelled "Raster"', 'the preset card', rowsFor('Raster').map((r) => r.querySelector('select')));
  ```
  → b1 PASS, then `aim missed: PLANTED: the <select> in the Field row labelled "Raster"; looked
  in the preset card (active sub-tab: colour); found 0, want exactly 1`. Before, this was
  `raster select = null` and three FAILs:
  `docs/captures/2026-09-12-timeline-rig-reaim/02-plant-b-zero-ramp-control.log`.
- **C: `ramp-control`, an ambiguous aim (the more-than-one branch).**
  ```
  +        return one('PLANTED: any <select> on the page', 'the preset card', document.querySelectorAll('select'));
  ```
  → `aim missed: PLANTED: any <select> on the page; looked in the preset card (active sub-tab:
  colour); found 5, want exactly 1 [The section both bindings on this tab act on. | Section 0
  binds the preset record OJZ_Preset_Sec0, which pas | The bands of this program, lowered to one
  compose([...]). Ab]`:
  `docs/captures/2026-09-12-timeline-rig-reaim/02-plant-c-many-ramp-control.log`.
- **The node pin.** The planted `select: (i) => \`Layer ${i} vsplit.at — \`` in
  `effects-control-aims.mjs` gave exactly the targeted row red:
  `× the toggle aim is a prefix of the title the panel renders on every layer card`, with
  1 failed and 6 passed. After the restore, 7 passed.

(8c) Harness code is not bundled; node runs the file on disk, so a plant is live the moment it
is saved, and each one went red. (8e) The proof method did not change partway: all four plants
ran on the final guard code, after the stop-line rewording.

## Final runs, three of each, on the committed tree `1fe9e18e`

Every run printed:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-aecbd3eeb84d4b6b0
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-aecbd3eeb84d4b6b0
```

There is no `in-tree:` line for a pinned worktree run; see "What the brief got wrong". The six
logs are distinct runs: different md5s, and app PIDs 3354339, 3419034, 3515389, 3646807, 3744601
and 3915971. Xvfb gave dpr 1 on all six; 1.35 did not occur.

**`raster-timeline`** (`03-final-raster-timeline-run{1,2,3}.log`)

| Run | dpr | strip client rect / backing store | Tally |
|---|---|---|---|
| 1 | 1 | `{x:1109, y:1638.40625, w:258, h:279.828125}` / `258x280` | 15 PASS, 2 FAIL, STOPPED after 17 of 25 rows |
| 2 | 1 | same | same |
| 3 | 1 | same | same |

Rows, identical in all three runs:
- **PASS:** 0a 1a 1b 2a 3a 3b 3c **4a** 4b 5a **5b 5b2 5cA 5cB** 5d.
- **FAIL:** 6a 6b.
- **STOP at row 7:** `aim missed: <input> whose title starts with "Layer 1 vsplit.at ("; looked in
  src/renderer/components/effects/EffectsScenePanel.tsx composing LAYER_VSPLIT_ROW.title from
  src/renderer/providers/effects-aeon.ts (active sub-tab: parallax); found 0, want exactly 1`.
- **Not reached:** 7a 7b 7c 8a 8b 9a 9b 9c.

Run 3's strip is `docs/captures/2026-09-12-timeline-rig-reaim/04-run3-strip-two-splits.png`. The
timeline carries `L1 split -> B row 300 (line 96)` and `L2 split -> B row 44 (line 176)`, both
rules drawn. That is the fixture's two splits painted, which no run could show before the
re-aim.

**`ramp-control`** (`03-final-ramp-control-run{1,2,3}.log`)

| Run | dpr | viewport / strip canvas rect | Tally |
|---|---|---|---|
| 1 | 1 | `1400x872` / `{x:1109, y:2477.90625, w:258, h:279.828125}` | **22/23**, FAIL dc-b |
| 2 | 1 | same | 22/23, FAIL dc-b |
| 3 | 1 | same | 22/23, FAIL dc-b |

Rows, identical in all three runs:
- **PASS:** b1 **f0 cv-a** cv-b **cv-z** dc-a dc-c sp-a sp-b sp-c rt-a rt-b rt-c ns-a ns-b ns-c ns-d
  ds-a ds-b ds-c ds-d z.
- **FAIL:** dc-b.

Every typed aim's own NOTE also printed dpr 1.

## Rows still failing, classified

### (b) raster-timeline 6a, 6b and the row-7 stop: the selection follows the section on every remount

**Expected.** 6a: after section 6 types 120 into layer 1's top through the real spinner, the
strip's split A is on line 120.

**Observed, all three runs.** `line=undefined; strip scene=ojz_act1_start splits=[];
selected=ojz_act1_start; raster_strip_probe layers=[{"world_y":0,...},{"world_y":96,...,
"vsplit":{"at":300}},{"world_y":176,...,"vsplit":{"at":44}}]`.

The fixture is intact: its layer 1 is still at 96 with its split. But the panel's selection
and the strip are on `ojz_act1_start`, so the 120 went into THAT scene's layer 1. Row 7 then
looks for layer 1's vsplit spinner, which renders only while that layer carries a split, and
`ojz_act1_start`'s layer 1 carries none. The stop is correct: the element really is not there.

**Which step moved it.** `onParallax` now records the selection after each step of its round
trip. All three final runs, and the trace run, say:

```
before=raster_strip_probe -> parallax shown=ojz_act1_start -> scene form open=ojz_act1_start
  -> edit made=ojz_act1_start -> colour shown=ojz_act1_start
```

It moves the instant the Parallax job mounts, before the scene-form door this parcel made
effective, and before any edit. So neither the door nor an aim moved it. Trace run:
`docs/captures/2026-09-12-timeline-rig-reaim/01-selection-trace-raster-timeline.log`.

**The mechanism, inferred from source and not instrumented inside the app.** The one writer of
`selectedEffectsSceneId` that runs without a gesture is the panel's "THE SELECTION FOLLOWS THE
SECTION" effect, in `src/renderer/components/effects/EffectsScenePanel.tsx` around lines
483-515, added by `4b9b3f6a` (2026-09-06, cold read C2). Its shape is
`React.useEffect(() => { ... setSelectedId(follow) }, [activeSectionIndex, boundSceneRef])`.
An effect runs on mount whatever its deps are, and the Effects sub-tabs UNMOUNT the panels they
hide. So every return to Parallax re-selects the active section's bound scene. The effect's own
comment states the opposite intent: "clicking another scene in the list below is never undone".

**Why this is the app and not the harness.** The harness's last recorded green, 25/25, was
through the same `onParallax` round trip on 2026-09-02 (`1fe514f2`'s message). That predates
the effect. **For an author:** create or pick a scene on Parallax, look at its timeline on
Colour, come back, and the form is on a different scene. The next value typed lands there.

Not fixed (no `src/` edits), and no workaround added. Re-selecting the fixture scene inside
`onParallax` would let 6a..9c run, and would make this harness blind to exactly this. That is
an owner call, recorded under Open.

### (b) ramp-control dc-b: the needle predates the `boundary` reword

**Expected.** The painted refusal contains `carries a ramp, not bands`, `EXACTLY ONE raster
program`, `no combinator` and `one undo step`.

**Observed, all three runs.** `"has":{"carries a ramp, not bands":true,"EXACTLY ONE raster
program":false,"no combinator":true,"one undo step":true}`, `inScroller:true`. The sentence
IS painted in its scroller and reads `... A preset holds EXACTLY ONE program: the schema's
top-level oneOf refuses a document carrying two, and the engine has no combinator that mixes
them ...`: `docs/captures/2026-09-12-timeline-rig-reaim/05-run3-dc-dead-chip.png`.

**Provenance.** `src/renderer/providers/effects-preset.ts` around line 5480. The word `raster`
left that sentence in `46bfbb58` (2026-09-04, "codec: `boundary` parses and round-trips"),
because the fourth arm, `boundary`, is not a raster program. The row's needle was not moved
with it, and the 2026-09-05 sweeps did not touch it: they migrated dash-bearing selectors, not
needles.

**Classification.** (b) as the brief defines it: the app paints something other than what the
row expects. The evidence says the difference is a DELIBERATE app wording and the row's needle
is stale. The fix is an assertion edit (re-point it at `EXACTLY ONE program`, or derive it from
the source the way `NS_*` needles are pinned). The brief forbids that edit here, so it is not
made. dc-a (the chip is disabled) and dc-c (the sentence is on the chip's title) both pass.

## Literals that remain, and why

These are all under the strict aim now, so the next rename of any of them stops with its name:
- **`raster-timeline`:** `Layer ${i} Screen line`, `v_offset:`, `input[placeholder="new_scene_id"]`,
  and the buttons `New`, `Add layer` and `Delete scene`.
- **`ramp-control`:** the Field labels `Top`, `Lines`, `addr`, `Start` and `Step`; `Add raster
  band`; `input[placeholder="new_preset_id"]`; `New`; and the `Effects` pill.

Why not derived:
- **Inline JSX, no constant.** Every one except `Screen line` is an inline JSX literal or
  attribute with no constant behind it. Deriving them would mean parsing JSX for text nodes, a
  more fragile reader than the strict aim's named stop.
- **`Screen line`** is `layerTopBounds(...).label`, a literal inside a function's union
  (`'Screen line' | 'world_y'`). The harness wants the screen arm specifically because row 4b
  pins the scene locked.
- **`v_offset:`** is the document's own key.

None of these drifted.

## What the brief got wrong

1. **"Read the run's `root:` / `in-tree:` lines."** A pinned worktree run prints `root:` and
   `pinned: AURORA_BUILT_TREE=...`. `in-tree:` is printed only when the tree has its own
   `node_modules/.bin/electron` (`scratchpad/lib/run-root.mjs`). The `pinned:` line is the one
   that confirms the worktree answered, and it is quoted above.
2. **"Keep `await killTree(child)`."** `raster-timeline` never had one: it imported `killTree`,
   never called it, and its `finally` sent a bare `process.kill(-child.pid, 'SIGTERM')` before
   `process.exit`. G5 cannot see that shape, because it looks for DROPPED `killTree` promises.
   It is now `await killTree(child)`.
3. **"Both harnesses then run to their FINAL TALLY."** `raster-timeline` does not. An app
   behaviour stops it at row 7 (the first (b) above), and reaching its tally would take a
   workaround that hides that behaviour.
4. **The four select sites were not the only dead aims.** The scene-form door, the four-aim
   restore block and the `Delete scene` click were also missing, silently.
5. **"Give it a fresh copy per run"** cannot be a clean `git archive` of aeon from an isolated
   worktree, because git outside the worktree is refused. The copies are of a filesystem
   snapshot, which includes a peer's uncommitted aeon edits, stated above.

The rest checked out against the tree:
- the line numbers (~457/610/627/631, ~487, ~702);
- the constant's whereabouts;
- the last-touch commits `87262540`/`089e90b6` (both 2026-09-05);
- the review's row lists, reproduced exactly.

## Totals

Measured in the foreground on `3bdc6d81`, which is this packet and its captures on top of all
the harness work. The commit after it only fills in this section.

| Run | Result |
|---|---|
| full `npm test` | exit 0: **Test Files 612 passed, 3 skipped (615); Tests 9244 passed, 9 skipped (9253)**, 0 failed. check-test-collection: 615 test-shaped files on disk, all 615 collected. |
| `test/harness-effects-control-aims.test.ts`, inside that run | 7 of 7 |
| `npx tsc --noEmit` | exit 0, 0 errors. That run was on `1fe9e18e`, and nothing TypeScript changed after it; the suite's own typecheck step passed again on `3bdc6d81`. |
| `check-harness-guards`, inside that run | 274 clean of 274 classified, 0 failures, 0 unmeasurable |
| `check-doc-citations` / `check-cited-paths` | OK on the committed packet: every cited capture is tracked |

No gate refused on the way. `git diff --stat d73ae428 -- src` is empty: `src/` is unchanged on
this branch.

**Commits on `parcel/timeline-rig-reaim`, oldest first:**

| Commit | Purpose |
|---|---|
| `091c5475` | the vsplit and Program aims read from source; the strict aim; the three other silent misses; the node pin |
| `115f92b5` | 6a prints the document and the selection beside the report; the stop line stops assigning blame |
| `a8b54581` | `onParallax` records which step of its round trip moved the selected scene |
| `1fe9e18e` | captures: the drift before, the selection trace, and the three planted aims |
| `3bdc6d81` | this packet, the six final logs and the two screenshots |

## Open

- **The selection-follow remount (the first (b)).** Owner ruling needed. Either the app keeps a
  scene the author made current across a sub-tab round trip, or the harness is told to
  re-select its fixture after each Parallax mount. The second makes this harness blind to the
  behaviour. Until one is ruled, 7a..9c are unmeasured on this app.
- **dc-b's needle (the second (b)).** Owner ruling on re-pointing it at the post-`boundary`
  wording, preferably derived from source.
- **Not measured, a hypothesis only.** 1fe514f2 gave `onParallax`-style round trips to
  thirteen instruments. Any of them that authors a scene and then crosses sub-tabs would meet
  the same selection move. None was run here.
- **Peers aiming at the same two controls by literal.** `boundary-control-harness.mjs`
  (`/^Program$/`), `base-swap-control-harness.mjs` (`rowFor('Program')`) and
  `curve-vsplit-reachable-harness.mjs` (`/^Layer ${i} vsplit\.at\b/`) all match today and could
  take the two libs. Out of this parcel.
