# `layer.drift` — the codec, the unit, and the control that was not built

**2026-08-29** · branch `effects-drift-codec` off master `4463331` · commit `94600ef`
· packet commit `<this file>`

---

## 0. The one sentence that must not be misread

**This does not reach the ROM.** aeon's `tools/effects_gen.py` **refuses the
`drift` key** until their `CAP_BAND_DRIFT` emission parcel lands (aeon's own
design says so: §7 row 10, *"`effects_gen.py` refuses unknown keys, so an unknown
`drift` key is refused before the field lands"*). A scene carrying `drift` today
**does not build**. Nothing in this parcel changes that, and nothing in it should
be read as "an author can now make a layer drift". No control was built, and §4
is why.

---

## 1. STEP 1 — what Aurora did with a `drift`-carrying scene BEFORE this parcel

This was measured first, on the tree at `4463331`, before a line was changed,
because the answer decides whether the parcel is a **fix** or a **feature**. The
harness was a throwaway vitest file that asserted nothing and printed. Verbatim
output:

```
--- INPUT (layer 0) ---
{ "dsa": 15, "dsb": 15, "fa": "FACTOR_1", "fb": "FACTOR_1_16",
  "world_y": 0, "drift": { "rate": 32 } }

--- PARSE THREW ---
ojz_act1_depth.json does not match the effects scene schema
  - /layers/0: unknown property "drift" (the schema is closed)

--- SERIALIZE THREW ---
refusing to write scene "ojz_act1_depth": it does not match the effects scene schema
  - /layers/0: unknown property "drift" (the schema is closed)

--- "none" PARSE THREW ---
ojz_act1_depth.json does not match the effects scene schema
  - /layers/1: unknown property "drift" (the schema is closed)
```

### The finding

**Aurora REFUSED the document. Loudly, at both ends, for both spellings. It did
not drop the field and it did not silently rewrite it.**

That is the good answer, and it is not the one the parcel was dispatched
expecting. `scene.ts`'s header explains why: the codec **does not enumerate
fields** — parse hands back what `JSON.parse` produced and `serialize` refuses to
drop anything — but the schema it validates against is **CLOSED**
(`unevaluatedProperties: false`), so an undeclared key is refused before any
round-trip question arises. That is the second half of §6 hazard 1, *"round-trip
what you do not understand, **or refuse the file**"*, and it was already holding.

**So this parcel is not a data-loss fix.** The typed-serializer defect the
dispatch feared — the one the section-meta sidecar and the collision-word parcel
both paid for — **does not exist in this codec**, by design, and the design was
already load-bearing.

### What the pre-parcel behaviour *was*, then

**Inert.** At library level a `drift`-carrying file did not throw at the caller;
`loadEffectsSceneLibrary` caught it, put it in `EffectsSceneLibrary.unreadable`
with a notice, kept its id out of the scene list, and the save plan skipped the
path. The author's bytes were **safe** and the scene was **unopenable**. The
parcel moves it from *refused* to *round-tripped*.

### The control that keeps that honest

A round trip that passes because the schema went open would be indistinguishable
from one that passes because `drift` is declared. `effects-drift.test.ts` carries
a negative control: an actually-undeclared key (`wobble`) must **still** be
refused at both ends, with the same message quoted above.

---

## 2. The contract, re-vendored — and the hazard in this particular re-pin

`empyrean 988638f`, `contract/schema/aurora-effects-scene.schema.json`, blob
`dd972cf0 -> 4adfbb40`. Extracted with `git show`, redirected into place, never
retyped and never reformatted. `988638f` is an ancestor of `origin/main` and
`origin/main:<path>` resolves to the **same blob**, so the pin was current at tip
rather than merely correctly cited.

**The hazard: that commit reflowed the entire file** to one key per line. Its
diff is **365 insertions / 81 deletions for a one-field change** — the shape that
invites *"looks like a reformat, ship it"* and would hide a real change inside
it.

**The two were separated by measurement, not by reading the diff.** Both
documents were extracted at their revisions and compared **as parsed values**,
key by key at every depth:

```
ADDED /$defs/layer/properties/drift = {...}
```

Exactly one difference. Nothing else in the contract moved.

### The field, from the schema itself

```json
"drift": {
  "oneOf": [
    { "const": "none" },
    { "type": "object",
      "properties": { "rate": { "type": "integer",
                                "minimum": -4096, "maximum": 4096,
                                "not": { "const": 0 } } },
      "required": ["rate"], "unevaluatedProperties": false }
  ],
  "default": "none"
}
```

Same `oneOf` shape as `curve` and `vsplit`. **The dispatch's numbers and the
schema agree on every point** — unit, bounds, the `0` refusal, `unevaluated
Properties: false`, `default: "none"`, the `oneOf` shape. Nothing had to be
resolved in the schema's favour.

### Provenance, in one machine-readable place

`src/core/formats/effects/aurora-effects-scene.schema.provenance.json`, on the
`ojz_act1_depth.provenance.json` pattern. It records the empyrean revision, the
blob, the byte count, the resolution method, the full pin history, and the
re-vendor recipe.

**The pin now lives there ONCE and the drift gate READS it.** Before this parcel
it was a `const PINNED_BLOB` in the test **plus** prose copies in `scene.ts`'s
header and `effects-scene-golden.test.ts`'s header — and `scene.ts`'s copy had
already gone **three re-pins stale** without anything going red, because nothing
hashes a comment. The prose citations remain, and now say they are prose.

### Currency — the question a pin cannot answer

New block in `effects-schema-drift.test.ts`, on the three rules
`aeon-fixture-currency.test.ts` established (`docs/reviews/2026-08-28-golden-live-tree.md`):

1. reads empyrean at a **committed revision through git objects**, never the
   sibling working tree;
2. **names** the revision in every message;
3. **skips loudly** when it cannot run.

It **measured** on this run (5ms, not skipped) and is green.

---

## 3. What the code does now

| file | change |
|---|---|
| `aurora-effects-scene.schema.json` | re-vendored by extraction at `988638f` |
| `aurora-effects-scene.schema.provenance.json` | **NEW** — the pin of record |
| `json-schema-subset.ts` | implements `not` |
| `scene.ts` | `EffectsDrift`, `EffectsLayer.drift?`, pin history |
| `scene-ui.ts` | bounds, refused value, **the factor**, both conversions, the advisory |
| `effects-aeon.ts` | `layerExtras` prints a drifting layer, read-only, in px/frame |
| `canopy_dusk.json` | carries both drift forms |
| `effects-schema-drift.test.ts` | re-pin, sidecar, `not`, currency |
| `effects-drift.test.ts` | **NEW** — 19 rows |

### `not`, and why the suite named it rather than a human

The schema spells *"0 is refused"* as a **hole in a range**, and no other keyword
in Aurora's subset can express one. The evaluator did not implement `not`, so on
re-vendoring the coverage gate went red naming it:

```
AssertionError: expected [ 'not' ] to deeply equal []
```

That is the gate working exactly as its header promises — *"a future amendment
adding `allOf`/`if`/`patternProperties` fails loudly the first time anything
validates, instead of quietly becoming a no-op."* It is now implemented, and
asserted **on the committed schema's own `rate` node** rather than on a
hand-built fragment: `0` refused with a message naming it, `±1` accepted, so it
is a hole and not a wall.

`not` **stays** in `IN_PLACE_APPLICATORS`, so `unevaluatedProperties` beside it is
still refused. Strictly it need not be (a failing subschema contributes no
annotations, and `not` succeeds only when its subschema fails), but the committed
schema never puts the two together and a refusal is the safe side of that call.

### The golden

`canopy_dusk.json` is the shape-coverage document, and `effects-scene-golden.test.ts`
**derives** "every declared layer key is exercised" from the schema — so it went
red naming `drift` too. It now carries **both** forms: layer 2 an authored rate
(`32` = S3K AIZ1's clouds, the schema's own worked corpus value), layer 3 the
`"none"` default spelled out on disk, on the `vsplit: "none"` precedent already on
that layer.

Re-emitted by **the other implementation** its own header prescribes —
`json.dumps(sort_keys=True, indent=2, ensure_ascii=False)` plus the §8 terminator
— never by `serializeEffectsScene`, so the byte round trip stays
cross-implementation evidence. Measured either side:

| | bytes | lines | sha256 | blob |
|---|---|---|---|---|
| before | 2482 | 139 | `4a498433…` | `7900bbc8…` |
| after | 2550 | 143 | `918219eb…` | `0454c57d…` |

**Exactly 4 inserted lines, 0 removed** — the two drift additions and nothing
else; the formatter reproduced the rest byte-identically.

---

## 4. The unit decision, and where the factor lives

**Aurora presents px/frame.** The schema's own description asks for it as a
SHOULD (*"an author writing 1 meaning 1 px/frame gets 1/256 px/frame; the editor
SHOULD present px/frame and multiply by 256 on export"*), aeon's design relays it
as the editor lane's call (§7.1 mitigation 2), and the lane took it.

### The factor is spelled in ONE place, and not as a literal even there

`EFFECTS_DRIFT_UNITS_PER_PIXEL` in `scene-ui.ts` is **read out of the schema's
own description**, which is where the contract chose to put it. It is derived
**twice**, from two independent sentences, on the `EFFECTS_V_FACTOR_LOCK`
precedent:

1. the worked conversion — `/\b1 px\/frame = (\d+)\b/`;
2. the bound gloss — `/\+\/-(\d+) \((\d+) px\/frame\)/`, whose units half is
   checked against `maximum` (read separately, out of the schema's numbers) and
   whose ratio must equal (1).

A schema that moves the unit and updates both still works. One that **decouples**
them fails this module's import — which takes the whole suite with it — instead
of silently rescaling every drift Aurora shows.

### How it is kept from being written twice

A test row **greps the effects source** for a bare `256` outside the derivation —
comment text and `/256` (the unit written as a fraction) excluded, code only.
Current result: `(none)`. That is the check that would have caught the second
copy; reading the file would not.

### The two directions, and the rounding

```ts
driftRateToPxPerFrame(rate) = rate / F                 // exact: F is a power of two
driftPxPerFrameToRate(px)   = sign(px·F) · round(|px·F|)   // -0 normalised to 0
```

**Half-away-from-zero, not `Math.round`.** `Math.round` breaks ties toward +∞:
it sends `+0.5` to `1` and `−0.5` to `−0`. On a signed quantity that means the
same typed magnitude survives leftward and vanishes rightward — a difference an
author would see and could not explain. The exemption in the round-trip sweep is
then **symmetric (`[-1, 1]`)**, which is itself the check on the rule.

Round-trip proven over **1,180 sampled rates** across the full range plus every
boundary. `driftPxPerFrameToRate` deliberately does **not** fold in the `0`
refusal: a conversion that sometimes returns a number and sometimes an error is
one nobody can compose.

### Refusals

Every clause **derived** from the vendored schema: bounds from `minimum`/`maximum`,
the refused value from `not.const`, integer-ness from `type`. `driftRateRefusal`
is the **sentence** half — advisory in `scene.ts`'s sense, nothing in the read or
write path calls it — and a test row runs it and the validator over the same ten
values and asserts they **never disagree**, with both verdicts shown to vary
across the sample.

Printed refusal for the excluded value:

```
- /layers/2/drift: matches none of the 2 allowed forms:
  form 1: expected the constant "none", got {"rate":0}
  form 2: /layers/2/drift/rate: 0 is refused: the schema forbids the constant 0
```

---

## 5. The control that was NOT built — and the one thing that WAS

**No control.** No spinner, no dropdown, no panel row that writes `drift`. The
reason is this lane's own open row **O13** (*"the curve dropdown still lets you
pick a ramp the build refuses"*): shipping a drift control tonight would
manufacture a second instance of that defect, and a **worse** one — O13's case
refuses only an illegal *pair*, whereas `drift` is refused for **every** value
until emission lands. The ruling is right and I did not build against it.

### The judgement call I did make, flagged as one

`layerExtras` in `effects-aeon.ts` now prints a drifting layer as
`drift 0.125 px/frame`. **This is a display, not an origination** — it writes
nothing, offers nothing, and a layer with `"none"` or no key gets no descriptor
at all.

I judged it in scope because:

* it is the exact defect that file's own section banner names — *"which is how a
  file could carry the curve the owner was looking at and the UI show nothing
  setting it"*. After this parcel a drift-carrying scene **loads**; without this
  line it loads and is completely invisible, and an author who then edits and
  saves preserves a field they never knew was there;
* it is pure and node-testable — no CDP harness was needed, which is the dispatch's
  own signal for having drifted into building the control;
* it makes the px/frame ruling **visible somewhere**, which is the only reason the
  conversion is more than a shelf-piece;
* it is three lines and one union member — additive, no reorganisation.

**If the lane disagrees, revert the `effects-aeon.ts` hunk and the last describe
block of `effects-drift.test.ts`; nothing else depends on them.**

---

## 6. Verification

`npx tsc --noEmit` — **clean** (exit 0). Note `test/` is outside tsconfig's
`include`, so this does not cover the test files; they are typechecked by vitest's
transform at run time.

`npm run test` — **408 files passed | 2 skipped (410); 5527 tests passed | 7
skipped (5534); 0 failed.** (Aggregate, from the run's own summary line. The
pre-parcel run on the re-vendored schema alone was 405 passed | 2 failed and
5501 passed | 3 failed.)

### Red-first, five plants, every one restored

| # | violation planted | what went red |
|---|---|---|
| A | `empyrean.blob` in the sidecar set to 40 zeroes | **3** — the gate, the sidecar-consistency row, and **the currency check**, printing `pinned at empyrean 988638f… (blob 0000…) / empyrean origin/main is now … (blob 4adfbb40…)`. This is what proves the currency check reads empyrean's real object and is not a tautology. |
| B | `canonicalizeBySchema` made to silently skip `drift` — *the defect this parcel exists to prevent* | **4**, and the round trip failed on `expected '…' to contain '"rate": 32'` — the **drift assertion**, before the byte compare. The vacuous shape (both sides drop it) cannot pass here. |
| C | `driftRateToPxPerFrame` halved | **5**, incl. `expected 0.0625 to be 0.125`, `expected [ -4096, -4095, … (1176) ] to deeply equal []`, and `expected 'drift 3 px/frame' to be 'drift 6 px/frame'` |
| D | the derivation's regex staled (`= ` → ` IS `) | the module **throws at import**: *"…description no longer states its unit in the shape EFFECTS_DRIFT_UNITS_PER_PIXEL derives it from … (no "1 px/frame = <n>")"*. Loud on unmeasurable, not a fallback. |
| E | `'not'` removed from `SUPPORTED_KEYWORDS` | **12**, all naming `JSON Schema keyword "not" at /layers/2/drift/rate is not implemented … Refusing to validate rather than ignoring it` |

`grep -rn "PLANTED VIOLATION" src test` after restoring returns only the
**pre-existing permanent** plants in `region-flip.test.ts` and
`reserved-tiles-real-act.test.ts`. Full suite re-run green after restoration.

### Bar 2d cause (iii) — the rows print the artifacts they judge

`effects-drift.test.ts` prints, not booleans: the **full serialized JSON** the
round trip compares; the layers after an unrelated edit; the constants as derived
from the vendored schema (`{bounds: {min:-4096,max:4096}, refused: 0,
unitsPerPixel: 256}`); the refusal message; the ten-row advisory-vs-validator
table; the bare-`256` grep result; the per-layer extras lines.

### What was not done, deliberately

**No emulator, ever** — not called, and this parcel has no runtime component
because `drift` does not reach a ROM. **No CDP harness** — nothing here touches
React or canvas; `layerExtras` is a pure function. **No sibling repo was
written**; `../empyrean` and `../aeon` were read only at committed revisions
through `git show`.

---

## 7. Open, booked, and where I think the lane may be wrong

* **The dispatch's premise, corrected.** This was framed as data loss. It was
  not: Aurora refused rather than dropped. The parcel is a **feature** — a
  contract re-pin plus acceptance — and the packet says so rather than claiming
  a fix that was not needed. §1 is the finding.
* **No ROADMAP row was added.** The board's rows are large and two other agents
  are live in this repo; editing `docs/ROADMAP.md` invites a conflict on a shared
  file. The row is the lane's to write.
* **`newEffectsLayer` does not offer drift**, correctly — a new layer carries the
  fewest keys the schema requires, and `"none"` is the default.
* **The taste bound is enforced anyway.** The schema calls ±4096 a *taste* bound,
  not a correctness one. Aurora holds it regardless, because the party that
  refuses a build is aeon and a scene Aurora wrote outside the contract's range
  would be a build failure with Aurora's name on it. If the lane wants Aurora to
  permit what the contract's range excludes, that is a contract amendment, not an
  Aurora relaxation.
* **When `CAP_BAND_DRIFT` lands**, the control is one row: a px/frame number
  field over `EFFECTS_DRIFT_RATE_BOUNDS ÷ EFFECTS_DRIFT_UNITS_PER_PIXEL`,
  `driftPxPerFrameToRate` on the way in, `driftRateRefusal` for the sentence, and
  `drift: "none"` as the cleared state. It should land **with** O13's remedy —
  *the option disabled with a reason, not merely hidden* — not before it.
* **Nothing here was seen on hardware, in an emulator, or in the running app**,
  and by design nothing could be: `drift` has no ROM path today.
