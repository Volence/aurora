# Re-vendor: `rowRemap.height_shift` becomes an enum, and the picker learns to read a set

**2026-09-06 · branch `parcel/revendor-scene-hshift`**

The contract retyped one key. `boundsAt()` could not read the new node and threw,
taking 71 test files down at import. The repair is not "read an enum" — it is
that the derivation must serve **every shape this key has worn**, because it has
worn three inside a week and the hub has said in the schema's own text that it
will widen again.

---

## 1. The pin, and the pin that never was

Three revisions are in play and a future reader needs all three, or `5bff4f76`
in empyrean's history reads as a step Aurora skipped.

| empyrean rev | blob | what it did | Aurora |
|---|---|---|---|
| `60d9f6a` | `7d70b3fa` | `height_shift` = `minimum 3 / maximum 7` | carried until this parcel |
| `83f5290` | `5bff4f76` | narrowed to **`const 4`** | **announced, never vendored** |
| `2e5046e` | `dea05f14` | retyped to **`enum [4]`** | **vendored here** |

`83f5290` was the pin this parcel was originally dispatched against. It was
superseded within the hour after this lane objected that a `const` cannot grow:
a consumer deriving a picker from `const 4` has nowhere to put a second rung, so
the day a second ladder lands the hub must amend the contract *and* every
consumer. `enum [4]` has the same refusal set today and a different capacity to
widen. It is recorded in the sidecar under the existing
`the_intermediate_revision_that_was_never_vendored` field, the shape the preset
sidecar already used for the same situation.

### Verification, each with the command that settled it

```
$ git -C <empyrean> merge-base --is-ancestor 2e5046e origin/main ; echo $?
0
$ git -C <empyrean> rev-parse 2e5046e:contract/schema/aurora-effects-scene.schema.json
dea05f14c87fa035989c8e7d16bfc94ba2cf5e18
$ git -C <empyrean> rev-parse origin/main:contract/schema/aurora-effects-scene.schema.json
dea05f14c87fa035989c8e7d16bfc94ba2cf5e18
$ git -C <empyrean> show 2e5046e:contract/…/aurora-effects-scene.schema.json > src/core/formats/effects/aurora-effects-scene.schema.json
$ git hash-object src/core/formats/effects/aurora-effects-scene.schema.json
dea05f14c87fa035989c8e7d16bfc94ba2cf5e18
$ sha256sum …
88056a853217d851f185d94847f775073ba546c37773b572a2461a25b4fd9a59
$ wc -c … → 27498
```

Extracted by redirection out of a git **object** at a named revision — never
retyped, never reformatted, never read from the sibling's working tree — and
re-hashed on this side before anything downstream was allowed to believe it.

### A finding about our own gate — TAGGED, not fixed

`origin/main` sat at `6daa9e35` when this was vendored. `6daa9e35` resolves the
path to the same blob **because it does not touch the path**. The last commit
that does is `2e5046e`:

```
$ git -C <empyrean> log --oneline origin/main -- contract/schema/aurora-effects-scene.schema.json | head -2
2e5046e contract: height_shift is enum [4] (buildable rungs), not const, …
83f5290 contract: rowRemap.height_shift narrowed to const 4 …
```

`test/formats/effects-schema-drift.test.ts:583` builds its remediation text as
`git -C ${empyrean} show ${tip}:${PROV.empyrean.path}`, where `tip` is the
resolved `origin/main` SHA. **Following that suggestion literally pins a
revision that does not carry the change** — a correct-looking hash that dates
the repository instead of the amendment, and the weaker citation of the two. The
sidecar's own convention has always been the last-touching commit.

Recorded here and in the sidecar's `why_this_revision_and_not_the_tip` field.
**Not fixed in this parcel, deliberately** — it is a separate concern and mixing
it in makes this diff harder to read. It belongs to the overseer.

---

## 2. The three hub claims, checked rather than trusted

### Claim 1 — TYPE CHANGE on `height_shift`. **VERIFIED, with an amendment.**

The claim as first announced (`const 4`) is not what was vendored. At `2e5046e`
the node reads:

```json
"height_shift": { "type": "integer", "enum": [4], "description": "…" }
```

`minimum` and `maximum` are gone. Confirmed by the parsed-document leaf diff
below, not by reading the text.

### Claim 2 — "description-only" on `plane_y`. **VERIFIED of the schema, REFUTED as a statement about consequences.**

The `plane_y` edit changes no keyword. But it changes a sentence Aurora *reads
back to authors*, and the hub could not see that. The old description said this
schema is **the only** enforcement of the 511 ceiling; the new one says it is
**one of two**, aeon having landed an engine-side `< 512` guard at `d593070a`,
and asks that both be kept —

> "keep both, a reader trimming the aeon ensure on this schema's authority would
> delete the only build-time guard a hand-authored scene has"

Three Aurora sites still claimed sole authority, **two of them author-facing**:
`rowRemapPlaneYRefusal`'s refusal sentence, `LAYER_ROW_REMAP_ROW.planeYTitle`'s
tooltip, and `scene.ts`'s module prose. An editor telling an author the engine
will not catch something the engine now catches is a false caution, and worse, a
reader could trim the aeon guard on Aurora's word. All three corrected.

The second half of the claim — "two `parallax_dsl.emp:220` citations re-pointed
to the symbol" — **is off by one in this file**:

```
$ grep -o "parallax_dsl.emp[:0-9]*" <old>   → parallax_dsl.emp, parallax_dsl.emp:220
$ grep -o "parallax_dsl.emp[:0-9]*" <new>   → parallax_dsl.emp, parallax_dsl.emp
```

One line-cite was re-pointed here, not two. The second presumably lives in a file
Aurora does not vendor. Minor, and reported only because a count with the wrong
unit is how a claim survives three faithful relays.

### Claim 3 — "formatting preserved, 7 lines changed; diff the parsed documents". **VERIFIED both ways.**

Parsed-document leaf diff, run here on this side rather than taken from the
sending lane:

```
leaves before: 294   after: 293
added: 1   removed: 2   changed-in-place: 2
  + /$defs/layer/properties/rowRemap/oneOf/1/properties/height_shift/enum/0 = 4
  - /$defs/layer/properties/rowRemap/oneOf/1/properties/height_shift/minimum = 3
  - /$defs/layer/properties/rowRemap/oneOf/1/properties/height_shift/maximum = 7
  ~ …/rowRemap/oneOf/1/properties/plane_y/description
  ~ …/rowRemap/oneOf/1/properties/height_shift/description
```

No other key, type, range or `$ref` moved. And the *text* side of the claim:
`diff -u` yields **one hunk**, 4 lines out for 3 in — 7 lines changed — with
every other byte of the 27,498 identical. Formatting preserved as stated.

> ⚠ A caution on how NOT to check this. My first pass re-printed both documents
> with `JSON.stringify(…, null, 2)` and compared; that reported 244 lines
> differing, which is an artefact of my printer disagreeing with the schema's
> own indentation and says nothing about either document. The one-hunk line diff
> is the measurement; the re-print was noise that looked like a finding.

---

## 3. Which `TODAY ONLY` case obtained: **case 1, the clause is gone**

The new description drops `TODAY ONLY 4 BUILDS` entirely. It still names
`row_remap_ladder16()`, now without a line number.

So `EFFECTS_ROW_REMAP_BUILDABLE_SHIFT` reads `null`, every consumer stops
warning, and **not one consumer line was edited to make that happen**:
`rowRemapBuildableToday` returns `null` for every shift, the `(builds today)`
suffix renders for nobody, `ROW_REMAP_HEIGHT_OPTIONS` marks every option
buildable. The self-retiring mechanism fired exactly as its docblock said it
would. *A caution with no expiry is a false negative wearing caution's costume;
this one had an expiry and it arrived.*

### The judgement the brief asked for: the guard STAYS, dormant

The hub said the parse-and-throw cross-check could go. **I did not remove it, and
here is why.** Its premise has gone *dormant*, not *ended*.

The guard reads the clause and cross-checks it against the ladder function the
description names, through `1 << shift`, so a contract that moved one statement
and not the other fails this module's import rather than letting a control bless
an unbuildable value. The clause **returns the moment the enum widens ahead of
aeon's generator** — an `enum [4, 6]` of which only 4 has a ladder — and the
schema itself reserves that state in its own words: *"a wider range returns by
amendment the day a second ladder lands."* That is precisely when the warning is
owed again. Left wired, it arrives with no Aurora edit. Deleted, the day the
picker was supposed to grow untouched is the day this file must be reopened.

Removing a guard whose premise has genuinely ended is correct. This one's has
not.

### And what nothing catches, said plainly rather than left implied

If the enum gains a rung aeon cannot build **and** the clause does not come back
with it, the two statements agree with each other and both are wrong: the picker
offers the rung unmarked and the author learns it from a red build. That hazard
is real, is **not covered**, and is not coverable from this schema — the ladder
set lives in aeon (`tools/effects_gen.py`'s `ROW_REMAP_LADDERS`,
`parallax_dsl.emp`'s `row_remap_ladder16()`), which Aurora does not read.
Aurora's only protection is the contract keeping the enum and the buildable set
the same thing, which is the hub's rule for this key and not something this
module can verify. Written into the code, not only here.

---

## 4. What `boundsAt` does with the new node: **it throws**, and that was measurable

The brief asked whether it throws or returns something silently wrong. It throws
(`scene-ui.ts:77`), and the shape of the fix follows from the *scale* of that:

```
Error: effects scene schema $defs.layer.properties.rowRemap.oneOf.1.properties.height_shift
       has no numeric minimum/maximum
```

Vendoring the bytes with **no code change**: 71 test files failed, and the run
dropped from 7,622 tests to 5,982 — **1,640 tests stopped existing**, because
every module importing `scene-ui.ts` failed at import. There was no
silently-wrong path and no partially-degraded control. That is why this repo
could re-derive against the amendment instead of shipping a narrowed picker
nobody noticed.

### The repair

`admittedIntegers(node, label)` / `admittedIntegersAt(...path)` in `scene-ui.ts`
read **three node shapes**:

| shape | why it is served |
|---|---|
| `enum` | the primary form now. What a *buildable set* looks like: it grows one entry at a time and need not be contiguous. |
| `const` | the singleton case of `enum`, folded in so a contract preferring the terser spelling reads the same. |
| `minimum`/`maximum` | the inclusive range. **Kept deliberately.** This schema still spells a dozen keys that way and spelled *this* key that way until `2e5046e`. |

A node carrying none of the three **throws with its path** — never `[]`, because
an empty picker on screen is indistinguishable from a UI that has not loaded.

Two structural changes follow:

* **The SET is now primary and the ENDS derive from it**, inverting the old
  order. `EFFECTS_ROW_REMAP_HEIGHT_SHIFTS = admittedIntegersAt(…)`;
  `EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS` is `{first, last}` of that list.
* **Nothing tests membership through the bounds any more.** Under a sparse enum
  like `[4, 7]` the ends and the set are different questions, and a range test
  would bless a 5 and a 6 the codec refuses — the control disagreeing with the
  format about a document Aurora itself wrote. `rowRemapHeightShiftRefusal` and
  `BUILDABLE_SHIFT`'s own sanity check both moved onto `.includes()`. The
  *sentence* still speaks in ends where it honestly can (`"3..7"` reads better
  than a list) but only when the set really is contiguous.

---

## 5. Red-first, with each mutation shown on disk

Every mutation was applied to a file, shown with `git diff`, run, and restored
with `git checkout HEAD -- <path>` from a **committed** baseline.

| mutation (on disk) | rows red |
|---|---|
| `return Object.freeze([(values as number[])[0]]);` — enum arm truncated | **2**: three-shapes, GROWS |
| `const values = listed !== undefined ? listed : null;` — const arm dropped | **1**: three-shapes |
| `return Object.freeze([]); throw new Error(…` — silent empty list | **1**: refuses-a-node |
| vendored schema `"enum": [4]` → `"enum": [4, 7]`, **plus** the pre-parcel range test restored in `rowRemapHeightShiftRefusal` | **1**, naming `control, shift 5: expected true to be false` |

### The honest limit of that last one

With the range test restored but the **real** singleton `enum [4]` on disk, all
39 rows are **green**. At a one-entry enum a range test and a membership test are
the same function — the mutation is not merely unobserved, it is
*indistinguishable*. The sparse-enum plant was the only way to make the
difference exist at all, and the row's discriminating power stays latent until
the hub widens the enum, which is exactly when it is needed. Stated so nobody
reads a red into this table that I did not get.

### The property demonstrated, not asserted

With `enum [4, 7]` planted and **no code edit**, the picker printed:

```
--- the height picker as an author sees it ---
* 16 lines (shift 4)
* 128 lines (shift 7)
--- swept 1..10; contract admits 4, 7; control and codec agree on every one ---
```

That is the parcel's central claim, run rather than argued.

### The four new rows

In `test/formats/effects-row-remap.test.ts`, all driving `admittedIntegers`
directly over nodes the live schema has not given it — because today's enum has
one entry and a great many wrong derivations produce a list of that size:

1. reads an enum, a const and a range, and sorts what it reads *(range arm
   exercised against a **real** live node, `plane_y`'s 0..511, so it cannot rot
   into decoration)*;
2. refuses a node carrying none of the three, and never answers an empty list
   *(seven planted nodes, each must throw naming its own label)*;
3. **GROWS** — a widened copy of the contract's *own* node yields the wider list;
4. refuses every integer the contract does not admit, **and the codec agrees**
   *(swept, both halves together: a row checking only the refusal function would
   pass on a control that had quietly stopped agreeing with the codec it writes
   for)*.

One existing gate changed: the `plane_y` wording row asserted the literal
`'ONLY ENFORCEMENT'`. It now **derives** which phrase to expect from the
contract's own `plane_y` description, so it moves in both directions with no
edit — including back, if the aeon guard is ever removed.

---

## 6. The `height_shift` census

Enumerated over **committed files only** with
`git ls-files -z | xargs -0 grep -n height_shift`, then read one by one. The
brief's premise was that a non-4 fixture might exist *deliberately*, to prove a
hand-authored value is representable (ROADMAP row 99), and would become
schema-illegal here.

| site | value | disposition |
|---|---|---|
| **`test/fixtures/effects/writer_session_ojz.json`** | *(none)* | **THE STOP CASE DID NOT ARISE.** The writer-originated fixture whose `.provenance.md` forbids editing carries **no `height_shift` key at all** (grep count 0, exit 1). Untouched, and reported rather than passed over — "the dangerous fixture was clean" and "I did not look" read identically in a diff. |
| `test/fixtures/effects/canopy_dusk.json` | 4 | aeon's own shipped pair. Still legal. Untouched. |
| `docs/captures/2026-09-05-rowremap/aurora_rowremap_waterline.json` | 4 | a capture. Untouched. |
| `docs/lane-log.jsonl`, `docs/reviews/2026-09-04-*.md` | 3, 6, 8 | dated records quoting the range as it stood. A ledger entry is a claim about a day; editing it to agree with today launders history. **Untouched.** |
| `scene-ui.ts` `rowRemapBuildableToday` docblock | 6 | said "`height_shift: 6` is a correct document that this schema accepts". **It is not.** Rewritten — the stale-caution class exactly, and nothing hashes a comment. |
| `row-remap-span.test.ts:204` | 7 | typed `remap(0, 7)` to make the reach advisory fire; that scene is now one the codec refuses, so the literal had quietly become an unsavable document. **Derived** as the widest admitted shift — 4 today, 7 again if the enum widens. |
| `effects-row-remap.test.ts` field-preservation row | 6, 3 | **KEPT, and annotated.** They never reach the codec; the property is that editing one field leaves the other alone, and a row fed only admitted values could not see a writer that clamped or defaulted the untouched one. "Fixing" them to 4 would delete the only rows that could catch that. |
| CDP harness banner | 6 | worked example of the unit hazard. Restated without a number. |

**No fixture, golden or committed scene document needed a key deleted, and no
refusal row was needed** — the sites that carry a non-4 value are either dated
records, or pure-function arguments that never meet the schema.

---

## 7. A second defect the re-vendor exposed

`scratchpad/row-remap-control-harness.mjs` (committed CDP instrument) built its
option list with `for (let s = HEIGHT.minimum; s <= HEIGHT.maximum; s++)`.
Against the amended node that is `undefined..undefined` and yields `[]` — a
**false zero wearing a working loop's clothes**: the banner would have printed a
blank contract line directly under the words *"ALL READ FROM THE VENDORED
SCHEMA"*. It now derives the admitted set the same three ways and throws if it
cannot.

**And a latent defect found while doing so, which this re-vendor is the first
event to expose:**

```js
const UNBUILDABLE = SHIFTS.find((s) => s !== BUILDABLE);   // BUILDABLE is now null
```

Every number differs from `null`, so this returns the **first admitted shift** —
"a shift that does not build" silently became "the shift that does", and rows
`[4a]`/`[4b]` would have picked the value already seeded and **passed on a
no-op**. Guarded explicitly. `[4a]` now announces itself *NOT RUN, NOT PASSED*
when its population is empty, and `[4b]` runs as `[4b-retired]` instead —
asserting the buildability warning is painted for **nobody**, which turns the
retirement claim into a measurement rather than losing it to a skip.

> ⚠ **TAGGED FOR FOREGROUND.** This harness drives the real Electron app under
> CDP and **was not executed here**. Its module-level derivation was checked
> against the vendored schema out-of-process (`SHIFTS [4]`, `BUILDABLE null`,
> `UNBUILDABLE undefined`) and the file passes `node --check`, but no row above
> `[1]` has been run since the re-vendor. No emulator was touched.

---

## 8. Totals

| | test files | tests |
|---|---|---|
| **before** (master, committed tree) | 1 failed, 520 passed, 3 skipped (524) | 1 failed, 7612 passed, 9 skipped (7622) |
| new schema, **no code change** | 71 failed, 450 passed, 3 skipped (524) | 9 failed, 5964 passed, 9 skipped (**5982**) |
| **after** | 521 passed, 3 skipped (524) | 7617 passed, 9 skipped (7626) |

`tsc --noEmit` exit 0. `scripts/check-peer-path-literals.mjs` exit 0 (all 5 rules
fired on their canaries).

**One test changed state:** `effects-schema-drift.test.ts › CURRENCY: matches
contract/schema/aurora-effects-scene.schema.json at empyrean origin/main`, red →
green, which is what a re-vendor is for. **Four tests added**, the derivation
rows in §5. No test was deleted, skipped or weakened.

---

## 9. The question, answered in one line

**Does the picker still grow without an Aurora edit the day the hub widens this
node again?** Yes — and it was measured, not argued: with `enum [4, 7]` planted
in the vendored schema and no source change, the picker rendered two options and
the control and the codec agreed on every integer in a swept window.
