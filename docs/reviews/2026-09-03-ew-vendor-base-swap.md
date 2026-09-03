# EW-VENDOR-BASE-SWAP — the `base_swap` vendor, the third `oneOf` arm, and the first `multipleOf`

**Date** 2026-09-03 · **Branch** `parcel/ew-vendor-base-swap` · **Base** master `06f1ecd5` (RED)
**Contract** empyrean `5bd76ba8e6a45a7104d1ffceacdf46794312b9cf`, `docs/AURORA_EFFECTS_SCHEMA.md` §7.5
**aeon artifact behind it** shape note at `850d4c60`, which SHIPPED the key and a bound
section-6 preset **ahead of** this CR

---

## 0. What was relayed, what I derived, and where they differ

The brief said plainly that everything in its contract section was a relay and none of it was
the overseer's own measurement. I re-derived all of it. **Nothing was wrong, and two things
were incomplete in a way worth recording.**

| Claim, as relayed | My derivation | Verdict |
|---|---|---|
| Schema blob `34a83d88…` | `git hash-object` on the vendored bytes | ✅ identical |
| Vectors moved too; blob `af5b5cee…` | `git hash-object` on the vendored bytes | ✅ identical |
| Vector set is 5 positive / 19 negative | Counted from the vendored file: **24 cases, 5 pass / 19 fail** | ✅ |
| The existing 17 rows are untouched | Parsed leaf diff: 0 removed, 0 changed, 62 added, **all at `cases/17..23`** | ✅ append |
| New `base_swap`: `line` 3..223, `target` 0..65535 `multipleOf` 8192, both required | Read off the vendored schema | ✅ |
| Top-level `oneOf` gains a third arm | Read off the vendored schema | ✅ |
| "Title string extended. **Nothing else moved.**" | Parsed leaf diff: 0 removed, **1 changed in place** (the title), 17 added | ✅ |
| *(the brief asked, did not claim)* does the lag row stay green? | **YES**, measured — §6 | ✅ |
| *(nobody said)* does this force an Aurora edit? | **YES, ONE** — the first `multipleOf` | ⚠ §3 |
| *(nobody said)* does the third channel break the existing control? | **YES, THREE WAYS** | ⚠ §5 |

Everything below is measured in this repo unless it says otherwise.

---

## 1. The live consequence, shown both ways

This is the whole reason for the parcel, so it is measured rather than described. The same
probe — aeon's real shipped file through `parseEffectsPreset` — run against master's committed
codec + schema, then against this branch's:

**BEFORE** (master `06f1ecd5`'s `preset.ts` and vendored schema, both restored into place):

```
REFUSED: ojz_sec6_baseswap.json does not match the raster preset schema
  - <document>: unknown property "base_swap" (the schema is closed)
  - <document>: matches none of the 2 allowed forms:
```

**AFTER** (this branch):

```
OPENED: {"id":"ojz_sec6_baseswap",
         "name":"OJZ act 1 section 6 - mid-frame nametable base swap (EFFECTS-W1 item 11a)",
         "schema":1,"base_swap":{"line":160,"target":57344}}
```

`section_6.meta.json`'s `rasterRef` is `"ojz_sec6_baseswap"`, so that refusal was an author
unable to open section 6 at all. The standing rows live in
`test/formats/effects-preset-base-swap.test.ts` (`the shipped section-6 document opens`), read
aeon's real file, and **skip loudly with a reason** when no aeon checkout is present rather
than passing silently.

---

## 2. The vendor — blob ids, re-hashed here

Both files extracted **by blob id out of git objects**, never by path into the sibling working
tree, and **re-hashed with `git hash-object` on the vendored bytes** before anything believed
them:

```
schema   6498a862 -> 34a83d88d2f85beb2672a792dbea62114763022e   36124 bytes
vectors  d8a5f358 -> af5b5ceeb857945789033980bbd6ff764bde58cf   13327 bytes
```

`5bd76ba` is an ancestor of empyrean `origin/main` (`6da51293` at re-vendoring, after
`git fetch origin`), checked with `git merge-base --is-ancestor`, and **both blobs resolve
identically at tip** — so the pin is current, not merely correctly cited.

### The vectors moved — and so did they last time

**BOTH of 2026-09-03's CRs moved BOTH files.** `9233883` (ramp) moved the schema *and* the
vectors; `5bd76ba` (base_swap) moved both again. The one CR that moved only the schema was
`d36d704`. The lesson is now written into the vectors sidecar: **a schema ping in this suite
should be read as "probably both" until each is hashed.**

### Re-vendor or migration? Parsed leaf diffs, not the hub's word

| | OLD leaves | NEW leaves | removed | added | changed in place |
|---|---|---|---|---|---|
| schema | 192 | 209 | **0** | 17 | **1** (the title) |
| vectors | 235 | 297 | **0** | 62 | **0** |

The schema's 17 additions are all under `$defs/base_swap` (14), `oneOf/2` (1) and
`properties/base_swap` (2). The vectors' 62 additions are all at `cases/17..23`. **Every
pre-existing key is identical in both files. Re-vendor, confirmed.**

Worth stating because a reader who remembers the `ramp` vendor will expect it: **the top-level
`required` list did NOT move this time.** It went 3 → 2 when `bands` left at `9233883`; it
stays at 2 here. A raster channel arrives as an **arm**, never as a required key, because
requiring it would make every existing document illegal. The two counts move independently and
only the arm count grows — now recorded in the drift row's own comment.

---

## 3. THE ONE AURORA EDIT THIS FORCED — and it failed loudly, which is the design working

`$defs.base_swap.properties.target` carries `"multipleOf": 8192` — **the first `multipleOf` in
any committed contract schema.** `json-schema-subset.ts` did not implement the keyword, so it
did not ignore it:

```
UnsupportedSchemaError: JSON Schema keyword "multipleOf" at /base_swap/target is not
implemented by json-schema-subset.ts. Refusing to validate rather than ignoring it —
implement the keyword (and extend SUPPORTED_KEYWORDS) before the schema ships it.
```

That is the file's whole posture — *the danger of a hand-rolled validator is that it silently
ACCEPTS what the real schema rejects* — and it is why this gap announced itself instead of
becoming a no-op that passes every shape row while accepting a misaligned VRAM address.

**Implemented as a division test, not `%`.** JSON Schema 2020-12 defines the keyword as
"division by this keyword's value results in an integer"; `%` on IEEE doubles is exact only
while both operands are. Every committed use is integral so the two agree today, and the
spec's spelling is the one that keeps agreeing if a fractional granule is ever published.

**Added to `NON_ANNOTATING_KEYWORDS` as well as `ASSERTION_KEYWORDS`**: it is a pure numeric
assertion that can name no property as evaluated, so the `unevaluatedProperties` ≡
`additionalProperties` equivalence the whitelist protects is unaffected.

---

## 4. THE NINE-CASE MATRIX — the third arm measured, not inherited from two

The specific regression risk the brief named. At `9233883`, hoisting the `oneOf` to the root
exposed that **`canonicalizeBySchema` had stopped refusing undeclared keys for the whole
document**; it was fixed with the `contributesPropertyAnnotations` prover. A third arm is
exactly the change that could undo that, so **the fix is not assumed to generalise** — and the
per-arm case matters because *which branch wins depends on the document*.

| # | Document | Required | **Measured** |
|---|---|---|---|
| 1 | `bands` only | accept | **ACCEPT** ✅ |
| 2 | `ramp` only | accept | **ACCEPT** ✅ |
| 3 | `base_swap` only | accept | **ACCEPT** ✅ |
| 4 | `bands` + `ramp` | REFUSE | **REFUSE** — `matches 2 of the 3 allowed forms` ✅ |
| 5 | `bands` + `base_swap` | REFUSE | **REFUSE** ✅ |
| 6 | `ramp` + `base_swap` | REFUSE | **REFUSE** ✅ |
| 7 | all three | REFUSE | **REFUSE** ✅ |
| 8 | none | REFUSE | **REFUSE** — `matches none of the 3 allowed forms` ✅ |
| 9a | bogus key beside `bands` | REFUSE | **REFUSE** ✅ |
| 9b | bogus key beside `ramp` | REFUSE | **REFUSE** ✅ |
| 9c | bogus key beside `base_swap` | REFUSE | **REFUSE** ✅ |

Rows 1–3 are measured on `validateAgainstSchema` **and** through `parseEffectsPreset` and
`serializeEffectsPreset`; rows 4–8 on all three, because the write path is the one the schema
is closed for and a panel can build a document the reader never saw. Rows 9a–c are measured on
`canonicalizeBySchema` (the function that must throw) with a legal-document control beside
each, so a row cannot pass because the function throws on everything.

The pairs are **enumerated from the channel list, not typed out**, so a fourth channel cannot
arrive and leave a pair silently untested; an anti-vacuous row asserts the enumeration really
produced all three pairs plus the triple.

**Verdict: the `contributesPropertyAnnotations` fix holds on the third arm.** Proven, not
assumed — see §7, mutation 2.

---

## 5. THE CODEC — and three live defects the third channel opened in the existing control

### 5.1 What was added

`EffectsPresetBaseSwap`, `base_swap?` on `EffectsPreset`, `presetRasterChannel` widened to
`'bands' | 'ramp' | 'base_swap' | null`, and four constants **derived from the schema's own
bounds, never typed beside them**, each with a module-load guard:

| Constant | Value today | Guard |
|---|---|---|
| `EFFECTS_PRESET_BASE_SWAP_KEYS` | `['line','target']` | the def's own `required` |
| `EFFECTS_PRESET_BASE_SWAP_LINE_RANGE` | 3..223 | `schemaRange` throws if either bound goes non-numeric |
| `EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE` | 0..65535 | same |
| `EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE` | 8192 | throws on a non-integer or **< 2**, and if the range is not a whole number of granules |

The granule guard's floor is the interesting one: **a granule of 0 or 1 makes every address
"aligned", which is indistinguishable from no constraint at all.** That is the failure state
and the success state emitting the same artifact, which this family of parcels refuses.

**`line` is 3..223 and the ramp's `top` is 3..222.** They are both screen lines and they are
not the same range — a run needs a line after it, a single fire does not — so a row asserts the
inequality rather than leaving the next reader to assume symmetry.

### 5.2 The two asymmetries with `ramp`, stated rather than left to analogy

A reader arriving from `EffectsPresetRamp` will carry two of its properties across and **both
are wrong here**. They are in the interface docblock, in the constants block, and asserted by
rows that read the schema's own prose (so the comment cannot rot into a lie):

1. **NO CAPABILITY GATE.** `ramp` renders only where `Game.SCANLINE_CAPS` declares
   `CAP_DENSE_TIER`, and aeon must re-emit that ensure at every generated call site.
   `base_swap` has no such bit — `OP_SET_REG` dispatches unconditionally in every game.
2. **NOT DEBUG-GATED.** The generated section-6 emission is unconditional `pub` data reaching
   `s4.bin` (aeon measured `EditorRaster_OJZ_Act1_ojz_sec6_baseswap` at `$013446` in the
   *release* listing, 22 bytes identical to hand-authored `OJZ_BaseSwap`).

An assumed capability gate is exactly the kind of thing a control parcel silently builds a
disabled button around.

### 5.3 WHAT THE VALUE MEANS, which is the comment the key cannot do without

The shipped `target` is **`57344` = `$E000` = `VRAM_PLANE_B`** — seven granules up — so from
line 160 down, **Plane A draws Plane B's picture**. A reader meeting `57344` bare has no way to
know it is a VRAM base address at all. The `multipleOf 8192` is the `$2000` granule, and it is
not a rounding convenience: **reg $02 encodes only the address bits above the granule and drops
the rest silently**, so a misaligned target is a *different address* with nothing else visibly
wrong. `isBaseSwapTargetAligned` reports; there is deliberately **no snap helper**, because
snapping produces a different plane's picture without saying so.

### 5.4 ⚠ THREE LIVE DEFECTS THE VENDOR OPENED IN THE EXISTING CONTROL

Not the base_swap authoring panel — that is the follow-up, and it is not here. These are ways
the **already-shipped** raster-channel control became wrong the moment a third channel entered
`EFFECTS_PRESET_RASTER_CHANNELS`, which it does by derivation:

1. **`RASTER_CHANNEL_OPTIONS` labelled by a two-way ternary**
   (`c === 'ramp' ? … : 'bands — a sparse fire list'`), so `base_swap` rendered in the dropdown
   as **"bands — a sparse fire list"**. Now a per-channel map that throws at module load on a
   channel with no label.
2. **`setRasterChannelCommand` deleted ONE sibling key in an `if`/`else`.** With three channels
   that authors the two-key document the `oneOf` refuses — caught on serialize, but only after
   the panel had shown an editor that appeared to support both. It now deletes *every* other
   channel, and refuses a channel it cannot seed.
3. **`bandControlsRefusal` asked "is it `ramp`?"**, so it returned `null` on a `base_swap`
   document: the band controls came back to life on a preset with no `bands` key, every click a
   silent no-op with no sentence beside it. **A negative test against one sibling is wrong the
   moment there are two.** It now asks "is it `bands`?" — the positive test, right for every
   channel there will ever be.

For (2), `rasterChannelSeedRefusal` is **one predicate read by the command AND by the option's
own label**, so the dropdown entry says *"(not authorable here yet)"* rather than being
silently dead — `lastBandRefusal`'s idiom. The option is still **listed**, because the same
list is what the `Select` renders the *current* channel from: omit it and a base_swap document
shows the wrong program's name.

---

## 6. The lag row — measured, and it stays green

`base_swap` is the **opposite direction** to `ramp`: aeon **accepted before the contract
declared**. So no lag opens, and `PRESET_KEYS_AWAITING_AEON` needs no move. Verified rather
than assumed — the drift row runs and is green:

```
✓ the contract-leads-consumer lag at aeon 341e06b3 is EMPTY — aeon accepts every key
  the schema declares (retired 2026-09-03, item 6; red in both directions)
```

That row computes the lag as *every root key the schema declares that aeon's page does not
accept*, which is the wide definition (it sees a key aeon's page never mentions, not only one
refused by name). `PRESET_KEYS_AWAITING_AEON` stays `[]`. **No finding.**

---

## 7. Every gate proven red-first, against the COMMITTED baseline

All five mutations applied to disk with `git diff --stat` shown, the mutated line read back
from disk, **the FIRST run reported**, and each restored with `git checkout --` before the
next.

| # | Mutation (file changed = 1 in every case) | Mutated line on disk | **First run** |
|---|---|---|---|
| 1 | neuter the `multipleOf` assertion | `if (false && !Number.isInteger(q)) {` | **3 red** — 2 mine + the contract's own `target of 57345` vector |
| 2 | revert `canonicalizeBySchema`'s `oneOf` fix to `return canonicalizeBySchema(value, hits[0], rootSchema);` | the arm, quoted | **5 red** — **all three per-arm bogus-key rows**, plus both pre-existing ones |
| 3 | vendored schema `"multipleOf": 8192` → `1` | `137: "multipleOf": 1,` | **module fails to load** — the loudest possible; the guard's sentence is printed |
| 4 | `presetRasterChannel` forgets `base_swap` | the function, quoted | **3 red** — the channel row, the shipped-document row, the band-controls row |
| 5 | drop the third `oneOf` arm from the vendored schema | `oneOf == [{'required': ['bands']}, {'required': ['ramp']}]` | **14 red** — including the contract's own section-6 PASS vector |

Mutation 2 is the one that matters most: **each of the three per-arm rows is independently
load-bearing**, which is what makes the "measured, not inherited" claim in §4 true rather than
decorative. Mutation 5 shows the contract's own published PASS row is what proves section 6
opens — Aurora is not grading its own homework there.

The gates run in `npm test` via `vitest.config.ts`'s `test/**/*.test.ts` include
(`test/formats/effects-preset-base-swap.test.ts`, 28 rows) and the existing
`src/**/__tests__/**` include (`effects-preset-ramp-control.test.ts`, 34 rows).

---

## 8. Numbers, and the five (in fact seven) reds accounted for

| | Test Files | Tests |
|---|---|---|
| **Before** (master `06f1ecd5`) | 3 failed / 475 passed / 2 skipped (480) | **7 failed** / 6664 passed / 8 skipped (6679) |
| **After** | 479 passed / 2 skipped (481) | **0 failed** / 6708 passed / 8 skipped (6716) |

`npm test` aggregate, whole repo, including `typecheck` and the `check:*` scripts. **Exit 0.**

⚠ **The brief said five red rows; there are SEVEN.** The section-wiring failure is three rows,
not one. Row by row:

| # | Failing row | Closed by |
|---|---|---|
| 1 | drift: schema currency vs `origin/main` | the re-vendor (§2) |
| 2 | drift: aeon page vs schema — *aeon accepts a root key the schema does not declare* | the re-vendor; then re-pinned, arms 2 → 3 |
| 3 | drift: *same root vocabulary* — `base_swap` known to aeon, unknown to the schema | the re-vendor alone |
| 4 | vectors: currency vs `origin/main` | the re-vendor (§2) |
| 5 | section-wiring: `b[6]` `OJZ_Preset_Plain` → `OJZ_Preset_Sec6` | re-pin |
| 6 | section-wiring: eligible `0-5` → `0-6`, sharers `6,7,8` → `7,8` | re-pin |
| 7 | section-wiring: threaded `{Sec5:5}` → `{Sec5:5, Sec6:6}` | re-pin |

Rows 5–7 are **one aeon landing seen from three angles** — section 6 acquired its own preset
record for item 11a, so it joined the eligible set, left the sharer set, and was threaded
through the chooser. **All confirmed intended with aeon by the overseer**, re-pinned rather
than re-derived as findings, each with a comment saying which landing moved it.

**Accounting for +37 tests:** +7 the contract's new vector rows (the vectors test iterates the
file), +28 the new `effects-preset-base-swap.test.ts`, +2 new rows in
`effects-preset-ramp-control.test.ts` (§5.4's label and band-controls defects). Nothing was
deleted or skipped to get here; the 8 skips are unchanged, and one of them is the linked-worktree
`sibling-root` row that always skips here.

One collateral re-pin not in the seven: `test/formats/effects-preset-ramp.test.ts` asserted
`matches 2 of the 2 allowed forms` / `none of the 2`, which the evaluator now spells with a 3,
and asserted the channel list was `['bands','ramp']`.

---

## 9. What is NOT here

**The `base_swap` authoring control**, by instruction — the follow-up owns it. What that parcel
should know and should not re-derive:

- `rasterChannelSeedRefusal` is the seam it must fill: give `base_swap` a seed (a default
  `line` and `target`) and remove it from the refusal, and the dropdown entry stops saying
  *"not authorable here yet"* by construction. One predicate, two readers.
- `EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE` and `isBaseSwapTargetAligned` exist; **do not add
  a snap.** Rounding an author's address to the nearest granule draws a different plane's
  picture without saying so, which is the exact failure the granule makes visible.
- A control asking for `57344` in decimal is asking for a hex VRAM constant in the wrong base.
  The named addresses are what an author means.

**Not certified.** Nothing here has seen a ROM obey a *generated* `base_swap`. What is measured
is the contract, the codec, the existing control's honesty about a third channel, and that
aeon's real shipped document opens.
