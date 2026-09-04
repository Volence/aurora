# EW-REVENDOR-RAMP — the `ramp` re-vendor, the root `oneOf`, and the sign that lives on `whole`

**Date** 2026-09-03 · **Branch** `parcel/ew-revendor-ramp` · **Base** master `8e89eecd`
**Contract** empyrean `9233883735deba44b1b547a25e491c690b136f0f`, `docs/AURORA_EFFECTS_SCHEMA.md` §7.4
**Aeon artifact behind it** `9e85baf0` (key shape), authored against engine `cf3dfb1a`

---

## 0. What was asked, and what is mine versus relayed

The brief relayed three claims from the hub and said plainly that none of them was the
hub's own measurement. I re-derived all three. **Two were right and one was incomplete** —
the incomplete one is the vectors, which the brief explicitly asked me to check rather than
assume, and it was right to ask.

| Claim, as relayed | My measurement | Verdict |
|---|---|---|
| Schema blob is `6498a862` | `git hash-object` on the vendored bytes → `6498a862ac04921456cf868c25f5bbfea8daedef` | ✅ |
| New key `ramp`, one closed object, five members | Read off the vendored schema | ✅ |
| `bands` left `required`; top-level `oneOf` | Read off the vendored schema | ✅ |
| Every pre-existing key identical | Parsed leaf diff, run here | ✅ — see §2 |
| *(the brief asked, did not claim)* did the vectors move? | **YES** — `cc3f0f96` → `d8a5f358`, 6 cases → 17 | ⚠ |

Everything below §1 is measured in this repo unless it says otherwise.

---

## 1. Step A — the re-vendor. Master was red; it is green.

Master failed the two currency gates because empyrean published a new contract. Nothing in
Aurora had regressed — that is the gate working as designed, and the re-vendor is the
remedy.

Both files were extracted **by blob id out of git objects**, never by path into the sibling
working tree, and **re-hashed with `git hash-object` on the vendored bytes** before anything
believed them:

```
schema   c1147071 -> 6498a862ac04921456cf868c25f5bbfea8daedef   31789 bytes
vectors  cc3f0f96 -> d8a5f3589d29f8a9cb8443b88c74371448c880b8   10748 bytes
```

`9233883` is an ancestor of empyrean `origin/main` (`f9fdfbe1` at re-vendoring, checked with
`git merge-base --is-ancestor`) and **both blobs resolve identically at tip**, so the pin is
current and not merely correctly cited.

### The vectors moved, and that is a departure from §7.3

§7.3 (`patch_world_ys` / `patch_motion`, 2026-09-03 earlier) published **no** vector rows and
left Aurora to write its own. §7.4 published **eleven**, and no pre-existing row moved:
a parsed diff found **142 added leaves, 0 removed, 0 changed in place**. The rows are — a
ramp-only document PASSES; and `bands`+`ramp` together, neither, `whole` 512, `frac256` 256,
a raw-integer `step`, `top` 2, `addr` 80, a `cram` arm, a **`curve` key** and a missing
`step` are each REFUSED. They run through `parseEffectsPreset` in
`test/formats/effects-preset-vectors.test.ts` like every other vector, so the MUST NOT (§5)
is gated by the contract's own row and not only by Aurora's prose.

---

## 2. Re-vendor or migration? The claim I would not take on trust

This is the claim that decides which one this is, so I measured it rather than believing the
relay. A parsed **leaf** diff of the old and new schema (every scalar, addressed by path):

```
OLD leaves 144   NEW leaves 192
REMOVED 1   ADDED 49   CHANGED-IN-PLACE 1

  removed:  required/2 = 'bands'
  changed:  title  ("... bands, cycles, variants")
                -> ("... bands, cycles, variants, patch anchors, ramp")
  added:    $defs/ramp (21)  $defs/fp16 (13)  $defs/ramp_target (11)
            oneOf/0 (1)  oneOf/1 (1)  properties/ramp (2)
```

Every pre-existing key is identical. **Re-vendor, confirmed** — but the one removal is not
cosmetic, and §3 is what it cost.

---

## 3. THE TYPE OF THE DOCUMENT CHANGED — the part that rippled

`bands` leaving `required` means `EffectsPreset.bands` is **optional**, and a ramp-only
document is a legal preset. That is 39 type errors across 12 files, and the fixes are not
uniform — the distinction that matters is **read** versus **mutate**:

- **Reads** became `(p.bands ?? [])` / `p.bands?.[i]`. Identical behaviour on a bands
  document; correctly empty on a ramp document.
- **Mutations** (`addBandCommand`, `removeBandCommand`, `splitBandCommand`) became
  **no-ops on a ramp document** rather than `?? []`. `{...p, bands: [...(p.bands ?? []), b]}`
  would grow a `bands` key onto a ramp preset, authoring exactly the **both-keys document
  the schema refuses** — on every band-add click, in a panel that has no idea the document
  is a ramp. A no-op is the conservative and correct behaviour for a parcel that does not
  own the control.

I chose an optional field over a discriminated union of two document types. The union would
make `preset.bands` a narrowing question at all fifty-odd read sites, most of which
legitimately mean *the bands, if any* and already handle an empty list. **The exactly-one
rule is not weakened by that choice** — it is asserted by the schema's `oneOf` on every parse
*and* every serialize, which is where a document is actually accepted or refused, and
`presetRasterChannel()` is the narrowing helper for code that must branch.

---

## 4. Step B — the root `oneOf`, measured four ways

The brief asked whether the subset validator implements a **root-level** `oneOf`, and warned
that row 117's "no edit was forced" was a different amendment and does not transfer. It does
not, so I measured. This is the first committed contract schema to put an `oneOf` at the
document root.

| Document | Required | **Measured** |
|---|---|---|
| `bands` only | pass | **ACCEPT** ✅ |
| `ramp` only | pass | **ACCEPT** ✅ |
| **both** | REFUSED | **REFUSE** — `matches 2 of the 2 allowed forms` ✅ |
| **neither** | REFUSED | **REFUSE** — `matches none of the 2 allowed forms` ✅ |

Plus: the keyword census is clean (no unimplemented keyword anywhere in the file) and
`assertSchemaSupported` walks every node, reachable or not, without throwing.

**`validateAgainstSchema` needed no edit.** The failure mode the brief named — a validator
that silently accepts a both-keys document — does not exist here. The codec refuses it too,
on the read path *and* the write path.

### But the four-way probe turned up a real defect beside the answer

**`canonicalizeBySchema` was silently skipping the undeclared-key refusal for the whole
document.** Its `oneOf` arm recursed into the winning branch and returned — and the winning
branch here is `{"required": ["bands"]}`, which declares no `properties`, so the function
fell straight through to `return value`. Measured: a document with `bogus_key: 7` at the root
came back **with the key intact**.

That refusal is the *only* thing this function still exists for (its ordering no longer
reaches disk — serializing sorts alphabetically afterwards), and its own header says as much
about the `anyOf` arm two lines above. The `oneOf` arm had the same hole and nobody had
looked.

**The hole was already open one level down**, at `$defs.band.properties.on`, which has
carried the identical `properties` + `required`-only-`oneOf` shape since `6664b61`. Invisible
there because validation refuses such a document first; **hoisting the shape to the root is
what made it worth finding**, because at the root it covers every key of every preset.

**Fix**: ask `contributesPropertyAnnotations` — the prover `assertSupported` already uses for
this exact shape — whether the winning branch can contribute property annotations. When it
provably cannot (a `required`-only arm rule), canonicalization continues with **this node's
own keywords minus the `oneOf`** instead of replacing them. A branch that *can* annotate is a
real alternative shape and still wins, unchanged.

**Red-first**: both rows failed against the **committed** baseline before the fix — the
defect was real, not a planted mutation. 22/24 green, 2 red; after the fix, 24/24.

---

## 5. Step C — the codec, and the trap that no schema can catch

### 5.1 THE fp16 SIGN RULE

**`frac256` is a MAGNITUDE. The sign lives on `whole` alone and applies to the whole value.**

```
{whole: -1, frac256: 128}  is  -1.5      NOT  -0.5
```

The obvious implementation, `whole + frac256 / 256`, yields **-0.5** — a whole pixel out,
**with both numbers still inside their declared ranges**, so no schema and no contract vector
can catch it. The engine spells it `(whole * 65536) - (frac256 * 256)` for `whole < 0`
(`raster.emp:687`): it moves *away* from zero in both directions.

I did not take that from the brief. `EFFECTS_PRESET_FP16_SIGNED_EXAMPLE` **parses the worked
example out of the schema's own `$defs.fp16` description** — the pair, the correct value, and
the naive value the schema names as wrong — and throws at module load if that sentence stops
matching, if the example stops being negative, or if it stops distinguishing the two readings.
The named row asserts against that derivation, not against a comment.

**Proven load-bearing.** Mutation applied to disk (`git diff --stat` → 1 file changed) and
the mutated line read back:

```
775:  return fp.whole + fp.frac256 / FP16_UNITS_PER_PIXEL;
```

→ **3 rows red**, the first saying `expected -0.5 to be -1.5`. Restored from the committed
baseline; diff empty; 24/24 green.

**A consequence worth knowing before a control is built:** because the sign is `whole`'s, the
open interval **(-1, 0) is unreachable**. There is no spelling of -0.5 — `{whole: 0,
frac256: 128}` is *+*0.5. `presetFp16FromNumber` returns **null** there rather than snapping
across the hole, on the same rule `anchorAmpRungForPeakPx` already sets in this file.

### 5.2 THE VSRAM DISPLAY LAG — `top + j + 1`

A VSRAM run's value `j` **displays on line `top + j + 1`** (the N+1 latency,
`raster.emp:602-609`), and the constructor does not compensate. A preview drawing at
`top + j` is one line high **and looks correct**.

> ⚠ **WHOSE NUMBER THAT IS — added 2026-09-04, empyrean `bfc000e`.** These
> display lines are **as read on oracle's Rust core**. oracle's legacy C++ core
> reads **both** raster tiers one line earlier on the same ROM bytes, and is
> disqualified as a referee because it disagrees with **itself** by 79–83 of 224
> rows between two identical boots — not because it is known wrong. The landing
> line is **UNPINNED** in the Rust core's own recon, and **no hardware referee
> exists on this project.** The derivation described in this section is unchanged
> and still right; what is new is that a sentence about it owes an instrument.
> See `docs/reviews/2026-09-04-lag-attribution-false.md`.

`EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG` is a named constant with the reasoning beside it, so
the control parcel cannot re-derive it wrong. It is derived from the schema's `top` sentence
and **refuses a lag of 0 loudly at module load**, because 0 is indistinguishable from "no
lag" in every rendered output.

**It is deliberately NOT applied by the codec.** A document's `top` is the engine's `top`,
written and read verbatim; the lag is a *display* fact, and applying it here would put the
compensation in the file where the generator would apply it a second time.

**Proven load-bearing, twice.** Lag forced to `0` → the loud guard throws at import and the
whole module fails to load (loudest possible). Lag forced to `2` — a plausible wrong value
that clears the guard → the row goes red with `expected 2 to be 1`. Both mutations shown on
disk, both restored from the committed baseline.

### 5.3 The span bound that JSON Schema cannot express

`top + lines <= 223` (the frame-rewind interlock) is read out of the schema's own prose,
because no JSON Schema keyword constrains two fields. **The per-field maxima are not the
contract**: `{top: 222, lines: 220}` satisfies every keyword and is refused by the engine. A
row asserts that the schema does *not* catch it — which is why the constant exists.

### 5.4 Round trip, and the control that the writer invents nothing

The byte-for-byte round trip is asserted against a **spelled-out expected string**, not
against another `serialize()` call, so it measures the bytes rather than the function
agreeing with itself. The control then proves the writer **invents no field and pads no
absent one** — specifically that `bands`, `name`, `cycles`, `variants`, `patch_world_ys` and
`patch_motion` stay unwritten — and is anti-vacuous, because the schema *declares* all of
those, so the writer had every opportunity to emit them.

A writer that defaulted `bands: []` would author the both-keys document on **every save of
every ramp preset**, and it would validate as a shape until the `oneOf` caught it.

---

## 6. Step D — the MUST NOT, recorded where the next person will hit it

**A ramp authors exactly ONE linear rate and ONE start over a span. There is no per-line
curve and there cannot be one** — `RasterRampProgram` has one `rrp_step` and one `rrp_start`
and no field that could receive a table (`raster.emp:590-591`).

It is written in three places on purpose:

1. A boxed block in the `EffectsPresetRamp` interface doc — where a control author reads.
2. Rows in `effects-preset-ramp.test.ts` asserting a `curve` key is refused **and that the
   ramp object is still closed**, since the refusal is by closure and only holds while nobody
   widens the object.
3. The contract's own published vector row.

**The name is the enforcement.** The key is `ramp` — the tree's own spelling — and a ramp is
linear by definition, so the forbidden model is *inexpressible* rather than merely refused.
A control offering per-line values would write what the engine cannot honour: it would
validate, generate, and be silently wrong on hardware.

---

## 7. The lag re-armed — the fourth arming

The drift gate caught something the brief did not mention, and it was right to: **`ramp` is a
contract-leads-consumer key.** Measured firsthand at aeon `origin/master` `dd17f7c9`, page
blob `62ca6426`:

- the machine-checked `preset:` row is `bands, cycles, id, patch_motion, patch_world_ys,
  schema, variants` — **no `ramp`**;
- `preset-refused:` is `fires` alone;
- **`tools/effects_gen.py` contains the string `ramp` ZERO times**, in any case.

So this is the **sharper flavour**: not declined by name, absent from the vocabulary, so
`_check_keys` takes the unknown-key path and `_refuse` raises — **a preset carrying `ramp`
fails aeon's build entirely.** The panel's disclosure says exactly that, derived from
`PRESET_KEYS_AWAITING_AEON`, and the drift row now asserts the measured lag **equals** that
premise at TIP.

The engine half of item 6 shipped in August; it is the *generator* that has not been taught
the key. That distinction matters to an author: the mechanism exists and is not reachable
from a document.

`preset-lag-disclosure.test.ts` is **re-aimed, not relaxed** (its fourth), and **its poison
inverts with the premise**: stub the constant EMPTY and the leaf must fall *silent*. That is
the direction that proves the sentence can retire on the day aeon ships, instead of becoming
a permanent fixture nobody reads. One drift row's coupling rule inverts with it too, and both
directions are documented in place.

---

## 8. Numbers

| | Test Files | Tests |
|---|---|---|
| **Before** (master `8e89eecd`) | 2 failed / 472 passed / 2 skipped (476) | **2 failed** / 6578 passed / 8 skipped (6588) |
| After Step A | 474 passed / 2 skipped (476) | 6592 passed / 8 skipped (6600) |
| **After** (all steps) | 475 passed / 2 skipped (477) | **6616 passed** / 8 skipped (6624) |

`npm test` aggregate, whole repo, including `typecheck` and the seven `check:*` scripts.

**Accounting for +38 tests and 0 failures:** the 2 red rows are the currency gates, fixed by
the re-vendor. +11 are the contract's new vector rows (they run automatically — the vectors
test iterates the file). +3 are re-aimed disclosure rows. +24 are
`test/formats/effects-preset-ramp.test.ts`. Nothing was deleted or skipped to get here; the
8 skips are unchanged from before.

New file is collected by `vitest.config.ts`'s `test/**/*.test.ts` include and runs in the
`npm test` chain — 24/24 in the aggregate above.

---

## 9. What is NOT in this parcel, and one frontier it leaves open

**Not here, by instruction:** the authoring control/panel. The follow-up owns it.

**The frontier it should know about, measured:** the band-editing commands
(`addBandCommand`, `removeBandCommand`, `splitBandCommand`) are now **silent no-ops on a ramp
document**. That is the correct conservative behaviour for a codec parcel — it refuses to
author an unbuildable document — but it is **a disabled button with no sentence beside it**,
which is the shape this repo has a standing rule against. The control parcel should give it
the `lastBandRefusal` treatment: one predicate, one sentence, read by both the disabled
control and its reason.

Two facts that parcel will need and should not re-derive:
`EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG` (§5.2 — a preview is one line high without it) and
`EFFECTS_PRESET_RAMP_SPAN_MAX` (§5.3 — the per-field maxima are a valid-looking pair that
fails the build).

**Not certified.** Nothing here has seen a ROM obey `ramp`, and nothing here claims one has.
What is measured is the contract, the codec, and what aeon's generator does with the key
today — which is refuse the document.
