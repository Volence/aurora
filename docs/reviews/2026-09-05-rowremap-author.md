# `rowRemap` authored from the UI, and it reached a ROM

**Branch** `parcel/rowremap-author` · **2026-09-05**

The editor half of aeon's item 9, the Hydrocity waterline. The anchor packet
(`docs/reviews/2026-09-05-scene-anchor-writer.md` section 6) recorded `rowRemap`
as BLOCKED end to end on two aeon/sigil declarations and took the remap OFF
again before saving. Both landed at aeon `1072a05c`. This parcel is that harness
with the retreat removed.

Headline, three parts:

1. **A row remap authored entirely through the panel is in a ROM.** `s4.bin`
   md5 `c5e18b4877c17c94a3ae0091946ecacb`, rc=0 in all four shapes, and aeon's
   own post-sigil gate names it:
   `EditorSceneBinding_OJZ_Act1_Sec2 band 1: ladder RowRemapLadder_Waterline16,
   surface plane line 96, H=16, anchor ch 0 ... varies by CURVE`.
   The remapped-band count went **1 to 2** against a pristine baseline, and the
   plane line is the number typed into the box.
2. **An author can do this unaided.** Every field has a control, the three
   `scene()` preconditions are disclosed under the row before a build runs, and
   the one Aurora cannot check is stated as a note rather than omitted. Nothing
   was hand-edited. Section 6 says where an author is still on their own.
3. **Two defects on the curve row, both on the remap's critical path, and one
   was found by a build refusing.** Route (c) - a `curve:` on the remapped strip
   - is the only route to a buildable remap needing no deform table, so every
   remap authored that way goes through the curve picker. Section 4.

---

## 1. The live aeon tree was not touched

Every read of `/home/volence/sonic_hacks/aeon` went through git objects at a
named revision (`show`, `rev-parse`, `log`, `grep <rev>`); its working tree is
another lane's and was never read as files. All authoring and building happened
in private clones (`git clone --no-hardlinks`, pinned to
`1072a05c2e6909e2a07931585e3396b0f2f5274c`) inside a miniature suite root under
the session scratchpad. The harness carries the
`siblingDefaultPathOrUnresolved('aeon')` guard that refuses to run against
aeon's default location, and it reads its override through
`checkoutOverride('aeon')` rather than off `process.env`.

Three clones, each with one job:

| clone | what it holds |
|---|---|
| `aeon` | the authored scene and **the four ROMs handed over**. Pristine baseline built first. |
| `aeon2` | the **alias poison** of section 4(a), built to a refusal. Never used for a deliverable. |
| `aeon3` | a fresh clone for the second harness pass, after the fix. |

---

## 2. The preconditions, re-derived against aeon `origin/master`

The dispatch asked which of Aurora's refusals have gone stale now that both
blockers are cleared. Re-derived from the artifacts at
`1072a05c`, not from the strings as they stand:

| what Aurora says | still real? | evidence |
|---|---|---|
| **precondition 1** - the remap needs something to vary (own live `dsb` + table, or anchor live `dsb` + table, or a `curve:`) | **REAL** | the `ensure` is intact at `engine/level/scene_dsl.emp:1986`, three arms unchanged |
| **precondition 2** - the scene must declare an `anchor:` | **REAL** | `scene_dsl.emp:1992`, unchanged |
| **precondition 3** - at most one remapped strip | **REAL** | `scene_dsl.emp:1998`; the engine keeps ONE per-frame mark |
| **precondition 4** - the game must raise `CAP_ROW_REMAP` (stated as a note, never a verdict) | **REAL, and still uncheckable from a scene file** | `row_remap_gate.py` itself says precondition 4 is "NOT GATED, and it cannot be" |
| `rowRemapBuildableToday` - **only `height_shift: 4` builds**, the other four legal shifts are refused BY NAME until item 9b | **REAL** | `tools/effects_gen.py:152` still reads `ROW_REMAP_LADDERS = {4: "RowRemapLadder_Waterline16"}`, and `engine/level/parallax_dsl.emp:396` still declares exactly one ladder function, `row_remap_ladder16()`, whose H is the module const `ROW_REMAP_H16 = 16` rather than a parameter |
| `EFFECTS_ROW_REMAP_REFUSED_KEYS` - `ladder` and `table` refused by name | **REAL** | `effects_gen.py:140` `LAYER_REFUSED_KEYS`, unchanged |

**Nothing in `rowRemapPreconditions` or `rowRemapBuildableToday` has gone
stale.** They read the three comptime `ensure`s and the generator's ladder
table, and none of those moved. What moved was strictly downstream of them:

- **The head-label blocker is gone.** `effects_gen.py` now emits the deform-table
  block AFTER the bindings, so an editor-authored table no longer becomes the
  generated section's head label and sigil's `section_align::DECLARED` still
  matches. That reopens route (b); it was never a statement Aurora made.
- **The gate/guard disagreement is gone.** `row_remap_gate.py`'s visibility arm
  now treats a band as varying if a table is attached **OR**
  `CURVE_FLAG_ACTIVE_BIT` is set, which is what the comptime guard it cites
  always permitted. That reopens route (c).

**What went stale is a sentence in the anchor packet, not in the app.** Its
section 6(b) records `rowRemap` as blocked by a post-build gate; that is the
half this parcel retires. Its harness row `[7d]`, which took the remap off
before saving, is the line this parcel deletes.

---

## 3. What was authored, and why each value

`docs/captures/2026-09-05-rowremap/aurora_rowremap_waterline.json`, written by
the app; the file did not exist in the clone beforehand (row `[0a]` asserts it
rather than assuming it):

```json
{ "anchor": { "at": { "channel": 0, "dsa": 15, "dsb": 15 } },
  "id": "aurora_rowremap_waterline",
  "layers": [
    { "fa": "FACTOR_1", "fb": "FACTOR_1_8", "world_y": 0 },
    { "curve": { "to": "FACTOR_1_2" }, "fa": "FACTOR_1", "fb": "FACTOR_1_8",
      "rowRemap": { "height_shift": 4, "plane_y": 96 }, "world_y": 96 },
    { "fa": "FACTOR_1", "fb": "FACTOR_1_2", "world_y": 160 } ],
  "schema": 1, "v_factor": 15 }
```

and through aeon's own constructors
(`games/sonic4/data/generated/ojz/act1/effects_scenes.emp:48`):

```
layer(world_y: 96, fa: FACTOR_1, fb: FACTOR_1_8,
      curve: SceneCurve.To(FACTOR_1_2),
      rowRemap: SceneRemap.Ladder(RowRemapLadder_Waterline16, 96, 4))
```

- **Route (c), the curve route.** It needs no deform table, and it is the route
  the fixed gate's own end-to-end probe used. Row `[9e]` asserts the saved file
  carries no `deform_bg`, no `deform_fg` and no layer `own` table, so the remap
  is provably not leaning on one.
- **The anchor is PURE-BOUNDARY** (`dsa 15 / dsb 15`). 15 is the NO-DEFORM
  sentinel, so this is not the extreme case, it is the **permitted** one: aeon
  refuses a curve beside an anchor carrying live shifts and names the
  pure-boundary anchor as the shape that composes with curves. It is what the
  toggle seeds, and the anchor packet already proved both directions of that
  ladder on the live DOM; this parcel did not touch that field's shape.
- **⚠ THE CURVE RAMPS UPWARD, DELIBERATELY.** `fb` is Plane B at the strip's TOP
  and `curve.to` at its BOTTOM (`scene_dsl.emp:441`). aeon bisected a defect on
  a live machine today (`df3b8810`): *"a DESCENDING parallax curve garbles the
  background and an ascending one does not. Every curve shipped in this tree
  ramps upward, so nothing had ever exercised the other direction."*
  `FACTOR_1_8 -> FACTOR_1_2` goes up, and it lands on layer 2's own `fb` so the
  two strips meet without a step. Section 4(b) is what this parcel did about it.
- **`fa` is FACTOR_1 on every strip.** aeon `7ee97fe1` found a non-`FACTOR_1`
  `fa` tears the FOREGROUND, independently of the curve defect.
- **TASTE.** The rungs (`1_8` sky, `1_8 -> 1_2` water, `1_2` below), the tops
  (0 / 96 / 160) and `plane_y: 96` are my judgement, not derived. `plane_y` was
  picked to match the strip's own top in a locked scene; aeon's own note on its
  probe says the same thing about its `plane_y 160` ("picked with no visual
  basis"), and precondition 4 - that the camera actually travels vertically
  here - is not machine-checkable by anyone. **Whether this looks like water
  needs a foreground drive.**

### The harness

`npm run harness:rowremap-author`, registered in `package.json` in the same
commit. Two passes:

| pass | clone | result |
|---|---|---|
| before the fix | `aeon` | **29/29 rows, 0 failed, 0 unmeasured**, 23 gestures all `ok` |
| after the fix | `aeon3` | **33/33 rows, 0 failed, 0 unmeasured**, 25 gestures all `ok` |

Run root printed and refused on borrowed:
`borrowed=false · pinned: AURORA_BUILT_TREE=<worktree>`, and
`build: FRESH ... dist/main/index.mjs is 117s newer than the newest of 859
.ts/.tsx under src`. Gestures are real `Input.dispatchMouseEvent` press/release
at integer client pixels, with every rect compared to its SCROLLER's box.
`<select>`s go through the native value setter plus `input`/`change`, which is
React's own path. The one non-UI step is opening the project
(`window.__dbg.aeon.open`), because aeon's only real open route is a native
folder picker CDP cannot drive; that step is not UI evidence and everything
after it is.

---

## 4. The two defects on the curve row

Both are Aurora's, both are on route (c)'s critical path, and the first was
found by a build refusing rather than by reading.

### (a) Aurora compared SPELLINGS where the engine compares VALUES

`FACTOR_LOCKED` and `FACTOR_0` are **one value with two spellings** - aeon's
`parallax_dsl.emp` declares `pub const FACTOR_0 = FACTOR_LOCKED`, both `$0FF`,
and Aurora's own `factor-decode.ts` table records it. `curveGoesNowhere` was
`JSON.stringify(to) === JSON.stringify(fb)`, so Aurora saw two factors where
aeon's guard 4 (`curve_to != fb`, on the packed numbers) saw one. The picker
greyed nothing, the advisory said nothing, and the document saved.

Poisoned into `aeon2` and built:

```
$ fb: FACTOR_0, curve: To(FACTOR_LOCKED)
error: layer(): curve: To(255) is the same factor as this layer's fb, so the
       ramp's two ends are equal and the emitted HScroll is byte-identical to
       the flat path
build rc=1        s4.bin: No such file or directory
```

> **The poison is labelled, and it is not authoring around a missing control.**
> `fb` and `curve.to` both HAVE controls and the harness drives both; the edit
> existed only to ask aeon what it does with the pair. Reachability by real
> gestures is measured separately, at `[7d]`, where fb is driven to `FACTOR_0`
> for real and the option list is read off the DOM.

The predicate now packs both operands through `factor-decode.ts` and compares
aeon's own 9-bit word. That closes a **second** miss the old docblock asserted
was impossible ("no named factor equals a packed triple by value"): a `fb`
spelled as a packed triple through the s1/s2/op spinners against the NAME of
that same factor. Two unknown values are deliberately NOT declared equal.

On screen after the fix (`[7d]`, `06b-alias-greyed.png`):

```
with fb on FACTOR_0, disabled options = ["FACTOR_LOCKED","FACTOR_0"]
title: "curve to FACTOR_LOCKED is the same factor as Plane B ..."
```

### (b) A descending curve garbles the background and nothing said so

Measured before it was fixed, which is the only reason it counts as a finding.
Harness row `[7b]` on the first pass drove the picker DOWNWARD on purpose and
asserted the rendered text said **nothing** - `!/(descend|downhill|ramps down|
garbl)/i` over `document.body.innerText` - and it PASSED
(`06-descending-curve-unremarked.png`). Row `[7a]` measured that the descending
option is offered, **enabled**, and authored without objection.

Nothing else can say it: `layer()`'s guard 4 refuses only the DEGENERATE case,
the generator does not look, and `row_remap_gate` prints a curve-only band's
plane line without gating its magnitude at all. A descending curve builds green
in all four shapes and the author finds out by looking at the screen - which is
how the owner found it.

New `curveDescendingAdvisory`, rendered as its own hint beside `curveAdvisory`
(`06-descending-curve-warned.png`, row `[7b]` inverted and green).

> **⚠ ADVICE, NEVER PREVENTION, and the reason is not taste.** The mechanism is
> UNESTABLISHED and aeon booked it that way on purpose, recording that its own
> sign derivation was a lead the code then refuted. A repo that greyed these
> options would encode a rule nobody has established, on a value the format
> admits and the engine accepts, and an author who opened a hand-authored
> descending curve could not see their own file in the list. That is
> `rowRemapPreconditions`' own posture, for its own stated reason: Aurora is not
> a fourth party inventing a rule. `curveFieldOptions` is deliberately
> unchanged, and row `[7e]` asserts it - the descending option stays enabled
> while the equal one is greyed, so the two postures are visibly different on
> one screen.

**Two hints and not one longer hint.** They say different kinds of thing:
`curveAdvisory` reports a refusal the build will make, this reports a
correlation nothing enforces. Folding them would let a reader carry the first
one's authority onto the second.

**Where the ordering comes from.** `factorRatio` in `factor-decode.ts`, derived
from the packed triple (`2^-s1 +/- 2^-s2`) and never parsed out of the name - a
value the repo already holds and already gates, not a number typed here. That
file's docblock cautions that the ratio is "for LABELS and for the agreement
test", because `decodeFactorScroll` is the real function of `camX` and rounds
per term; the caution is about using the fraction AS a scroll value, and the
question here is only which end of the ramp is larger, which is an ordering of
two operands rather than an evaluation of either. Said at the call site.

---

## 5. Gates: red-first, with the mutation shown applied

The source was restored from the **committed** blob
(`git show HEAD:src/renderer/providers/effects-aeon.ts`), `git diff --stat`
empty, and the baseline quoted from disk before anything ran:

```
$ grep -n "JSON.stringify(to) === JSON.stringify(fb)" src/renderer/providers/effects-aeon.ts
685:  return JSON.stringify(to) === JSON.stringify(fb);
$ grep -c "curveDescendingAdvisory" src/renderer/providers/effects-aeon.ts
0
```

Runner `npx vitest run src/renderer/providers/__tests__/effects-aeon.test.ts`:

| | |
|---|---|
| BEFORE (committed source, new rows) | **8 failed / 149 passed (157)** |
| AFTER (fix restored) | **157 passed (157)** |

The eight are named in the log. **The anti-vacuity twin passed on both sides**,
which is what a control does: *"does NOT fold two factors that merely look
alike"* holds a pair with the SAME RATIO and different packed values
(`1/8 + 1/16` vs `1/4 - 1/16`), the case a fraction comparison would wrongly
fold together.

### An existing gate went red on the fix, and is repaired rather than bumped

*"the picker and the advisory agree on EVERY named factor pair"* asserted
`sawDisabled === EFFECTS_FACTOR_NAMES.length` - **"one refusal per fb (the
diagonal)"**, which WAS the defect written down as an expectation. The diagonal
is the whole answer only if every name is its own factor. The count is now
derived as the sum of the squares of the alias-class sizes, so sixteen
singletons would give the old number back, plus a row asserting at least one
class really holds two names.

A second row read *"curveFieldOptions disables NOTHING when fb is packed - no
named factor equals a triple"*. That generalisation was false and the row passed
only because the one triple it happened to try is not a published factor. It now
tries both kinds, each derived: a triple taken FROM the table, and an
unpublished one found by SEARCH over the 9-bit encoding rather than typed.

### Anti-vacuity in the new rows

- Direction is a **census** over all 256 ordered named pairs, with the verdict
  derived from `factorRatio` independently of the function under test, and both
  states asserted to occur - so a predicate with the sign backwards fails on
  half the space rather than on whichever example got written down.
- **Locked is the SMALLEST factor, not an off switch.** Ramping FROM it can
  never descend; ramping TO it always does, from anything that moves. Both
  directions asserted over the whole name set. Said out loud because this
  repo's other top-of-range field means OFF and a reader arriving from that one
  would expect this end excluded.
- The alias row asserts its own **premise** first - that the two names really do
  carry one packed value - so the day aeon splits them this row says so rather
  than silently testing nothing.

---

## 6. What an author would get stuck on

**Nothing stops them reaching a ROM.** Every field of this scene has a control,
and the panel discloses each precondition before a build runs. Ranked by what
would actually cost someone an afternoon:

1. **The curve's direction, until this parcel.** Section 4(b). It was the only
   thing about a curve that reached a ROM green and wrong, and route (c) is the
   only route to a buildable remap that needs no table.
2. **Four of the five height options do not build**, and the picker already says
   so - the row marks the buildable one and warns under it for any other, and it
   does NOT filter the list, so an author who opened a hand-authored `shift 6`
   sees their own file. Row `[6b]` drove the list to its **last** option and
   confirmed the file stores the SHIFT (7, not 128) and that the panel says it
   does not build; `[6d]` confirmed the warning clears again.
3. **`plane_y` has no help beyond its range.** The box refuses past 511 and says
   why (`[6e]`, `[6e2]`), but nothing anywhere relates the number to the strip,
   to the anchored split, or to the art - and aeon's gate prints it without
   checking it against anything either. The seed is the strip's own top, which
   is a starting point and not a claim. **This is where an author is genuinely
   on their own**, and precondition 4 (that the camera travels vertically here)
   is not checkable by any party.
4. **The Scene section arrives COLLAPSED**, so the anchor rows are not on screen
   until it is opened. Not a defect, but it is the step that made an earlier
   run report a live control as absent.
5. **`dsa`/`dsb` on a LAYER still have no control** - unchanged, and route (a)
   is therefore still hand-edit-only. Routes (b) and (c) are both fully
   authorable, so this blocks nothing now.

---

## 7. Builds - all four shapes, with a pristine baseline first

Clone at aeon `1072a05c`, in a miniature suite root (the clone as `aeon/` plus
symlinks to the sibling repos). `tools/regenerate-level.sh` rc=0 before each
build; `SIGIL_BUILD` / `SIGIL_EMIT` from aeon's own `project.json` `buildEnv`.
**Assembler banner, captured beside the hashes** because a pinned tree is not a
pinned build: `sigil 756c7efda3dc (clean at capture - no uncommitted changes)`.

**A pristine baseline was green in all four shapes before any edit of mine**, so
every later result is attributable. Each artifact was **deleted before its
build**, so a stale file cannot pass for a fresh one.

| # | shape | baseline rc | baseline md5 | authored rc | authored md5 |
|---|---|---|---|---|---|
| 1 | `./build.sh` | **0** | `04e59d0e52992d93db9a84e299d5c9ee` | **0** | **`c5e18b4877c17c94a3ae0091946ecacb`** |
| 2 | `DEBUG=1 ./build.sh` | **0** | `595582814108dcebd4c8986a8aa3ecb9` | **0** | `fb827d48ba344994ee5205cba3601030` |
| 3 | `./build.sh demo` | **0** | `2f1d8e40a04de545613155784c0a917b` | **0** | `2f1d8e40a04de545613155784c0a917b` |
| 4 | `DEBUG=1 ./build.sh demo` | **0** | `b579a96a58bf62885e3a147966da9f7e` | **0** | `b579a96a58bf62885e3a147966da9f7e` |

**demo is byte-identical in both shapes, and that is the control this table
needs**: `demo` binds no OJZ editor scene, so a change there would have meant the
delta was not the scene. Both were deleted and rebuilt, so the identity is a
measurement and not a stale artifact. Shape 2's baseline `595582814108` also
matches the md5 aeon's own `05b8ad10` capture recorded, which is independent
corroboration that this clone is the tree that commit describes.

### The gate's own report, with its discriminating control

```
BASELINE   row_remap_gate: OK - 1 ladder(s), 1 remapped band(s)
             ParallaxConfig_OJZ_Underwater band 1: ... surface plane line 101, anchor ch 0

AUTHORED   row_remap_gate: OK - 1 ladder(s), 2 remapped band(s)
             ParallaxConfig_OJZ_Underwater band 1: ... surface plane line 101, anchor ch 0
             EditorSceneBinding_OJZ_Act1_Sec2 band 1: ladder RowRemapLadder_Waterline16,
               surface plane line 96, H=16, anchor ch 0
               varies by CURVE, not by a deform table (bc_flags carries
               CURVE_FLAG_ACTIVE_BIT). NOT magnitude-gated: the curve's travel
               across the REMAPPED lines depends on the runtime split line, which
               is not in the image. Design section 9.1 precondition 1 is
               satisfied - the source is not flat
             visibility self-test ... NULL+curve VARIES · NULL+no-curve DOES NOT ·
               unmutated VARIES - 3/3
```

The band count moved 1 to 2, `surface plane line 96` is the number typed into
the box, and `anchor ch 0` is the channel picked from the ladder - discriminated
from aeon's own shipped remap at 101. The two demo shapes take the
capability-undeclared path, as they should.

**The handed-over ROM is still this run's.** It was built from the document the
FIRST harness pass saved, on an app whose curve row has since gained two
behaviours. Row `[9h]` compares the second pass's saved bytes against the
committed capture: **561 B vs 561 B, identical**. The fix is a reader and an
advisory and it changed no authored byte.

---

## 8. Aurora suite

`npm test`, whole chain, rc=0:

```
Test Files  507 passed | 3 skipped (510)
Tests       7328 passed | 9 skipped (7337)     0 failed
tsc --noEmit: clean
check-test-collection:     510 test-shaped files on disk, all 510 collected
check-peer-path-literals:  OK - 1318 files, 5 rules, all 5 fired on the canaries
check-cited-paths:         OK - 2071 citations, both rules fired on their canaries
check-ledger-timestamps:   OK - 17 canary cases, both directions of the ratchet
check-harness-guards / check-python-resolver / skip-report: OK
```

**The delta, attributed.** The dispatch quotes master as `7322 / 8` in a main
checkout, i.e. **`7321 / 9` in a linked worktree** - `test/support/
sibling-root.test.ts`'s step-3 row skips by design there and is self-diagnosing
in the skip report. This run stands in a linked worktree, so the comparison is
against `7321 / 9`, total `7330`.

```
7328 passed - 7321 = +7        9 skipped - 9 = 0       7337 - 7330 = +7
  +7   src/renderer/providers/__tests__/effects-aeon.test.ts, 150 -> 157 `it(` rows
  ---
   7   accounted for, with nothing left over
```

No new test FILE, so the file count is master's.

### ⚠ A RIG FAULT WORTH KNOWING, because the gate caught it correctly

The first `npm test` stopped at
`check-cited-paths: COULD NOT MEASURE - the exit-0 arm is not behaving`. **It was
my rig, not the tree.** A linked worktree has no `node_modules`, and the obvious
remedy is to symlink the main checkout's - but `git check-ignore` refuses any
path beyond a symbolic link:

```
$ git check-ignore -v node_modules/__probe__
fatal: pathspec 'node_modules/__probe__' is beyond a symbolic link
rc=128
```

so the check's own "something IS ignored" self-probe, which uses `.gitignore`'s
`node_modules/` as its positive canary, could not answer. Replacing the symlink
with a real directory of per-entry symlinks fixed it. **The check behaved
exactly right**: it reported COULD NOT MEASURE rather than passing, which is the
difference between a gate and a decoration. Any future worktree agent that
symlinks `node_modules` will hit this.

---

## 9. Still owed

1. **RUNTIME CONFIRMATION IS TAGGED, NOT ATTEMPTED.** Nothing here ran under the
   emulator. Whether the remap looks like a waterline - and whether `plane_y 96`
   is anywhere near right - needs a foreground drive. The parameters are a
   content call and this item has already shipped invisible screens.
2. **`CURVE-DESCENDING-GARBLES` has no mechanism.** Aurora now discloses the
   correlation; aeon booked the cause as unestablished. If it turns out to be
   direction-independent, or to have a bound, `curveDescendingAdvisory`'s
   sentence needs re-pointing rather than deleting.
3. **The record for that defect lives only in commit prose and the hub log** -
   `df3b8810` / `05b8ad10` and empyrean's `OVERSEER-LOG.md`. There is no witness
   doc, no DEFERRED_WORK entry and no queue row, and no record of which
   ascending pair the bisect used as its control.
4. **`plane_y` relates to nothing.** Section 6, item 3. Neither Aurora nor
   aeon's gate checks it against the strip, the split or the art.
5. **`dsa`/`dsb` on a LAYER still have no control**, so route (a) stays
   hand-edit-only.
6. **`ROWREMAP-PLANEY-CEILING`** is aeon's own booking: 512..65535 packs cleanly
   into the u16 and `layer()` bounds it at 512 today. Aurora's box follows the
   schema and would need to follow it again if that widens.
