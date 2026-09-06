# CURVE-ONSET — the shipped advisory rested on a finding aeon had retracted

**Date** 2026-09-06 · **Branch** `parcel/curve-onset` · **Runner** `npm test`
**Subject** `src/renderer/providers/effects-aeon.ts`'s curve advisory, and the new
`src/core/formats/effects/curve-rate.ts` it now computes from.

---

## 0. THE RULE CHANGED THREE TIMES INSIDE ABOUT AN HOUR, AND THIS IS WHICH ONE SHIPPED

The controller stated this parcel's rule three times mid-flight. Recorded as the
sequence rather than tidied, because a reader in a month needs to know which version
they are looking at:

| # | as stated to me | when | status |
|---|---|---|---|
| 1 | An **ONSET**: warn when `camX × \|Δf\|` exceeds a plane-minus-screen difference, inside the bound section's camera range. Confound OPEN, hedge accordingly. | the brief | superseded before any code was written |
| 2 | Not an onset — a **per-line RATE**. And *"they have separated them: it is rate"*, so the confound hedge now **understates** what is known and must go. | ~10 min later | **wrong**, retracted by the sender |
| 3 | Rate, yes — but the confound is **NOT** resolved. Hedge shape: *rate is the better-supported account; the two have not been separated.* | ~15 min later | **what shipped** |

**Statement 3 is the one that matches aeon's artifact**, which I had already read
before it arrived. The controller's own standing rule for the parcel was that where
his messages disagree with aeon's source, the source wins — so nothing here was
built to fit a message. What I built at statement 1's arrival was: nothing. The
first correction landed while I was still reading aeon's witnesses, so no onset-shaped
code exists and none was discarded.

The controller was right to un-retract. **aeon's committed tree says the discriminator
does not close** (§1.3), and statement 2's *"22 px garbled versus 6 px clean, and total
travel barely moves under the fix"* is **not in aeon's tree at any revision I can
reach**: aeon's own record of that comparison is the CHANGED CURVE, which moves both
quantities together. That is exactly aeon's stated reason for refusing to bank it
closed.

---

## 1. AEON'S RULE, AS I READ IT, CITED BY SYMBOL

Read through git OBJECTS in aeon at a committed revision, never through the working
tree (a live lane checkout). Two revisions are named because aeon's tip moved during
the parcel:

* **`92663a53dcb989287da6a1e8f4833a5cc47d6481`** — the refutation. Verified an
  ancestor of aeon `origin/master`.
* **`958e7fd6`** — aeon `origin/master` at 15:05Z, where I read the witnesses.
* **`bb76f04b805990c218577d47c98b494a0331ebe8`** — aeon `origin/master` at 15:22Z,
  where the drift gate parses the tables. Every quoted fact below is green against
  this tip; the gate re-reads it on every run.

### 1.1 The direction is REFUTED

`92663a53`, subject verbatim:

> merge(curve-desc): there is no engine defect, and the DIRECTION in the row's own name is refuted.

aeon `docs/witness/curve-desc-2026-09-06.md` §4, against falsifiers named before the runs:
the **ascending** mirror of the same span and `|spread|` **garbles**; the small
**descending** arm is **clean**. §7 item 5 asks Aurora by name:

> **Aurora's `curveDescendingAdvisory` needs re-pointing, not deleting** — their own §9.2
> asks for exactly that if the cause turned out bounded or direction-independent.

### 1.2 What moves is a magnitude, and there are TWO readings of it

* **RATE.** `depth_onset_probe.py`'s `band_stats`, symbol `rate_mean`, defined as
  `e / (len(seg) - 1)` where `e` is the band's excursion and `seg` its lines.
  aeon `docs/witness/depth-onset-2026-09-06.md` §5: severity is **monotone in rate** with
  art and control held fixed (1.97 px/line a mild slant, 4.0 stronger, 16.0 and 22.2
  destroyed).
* **EXCURSION.** `depth_onset_probe.py`'s `WRAP_MARGIN = PLANE_W - SCREEN_W`, with
  `duplicates = e > WRAP_MARGIN` and the comment *"from geometry only"*. Still true as
  geometry; §5.1 of `curve-desc` was **corrected** by `depth-onset` §5 as an account of
  the visible break, because the first matched-rate comparison ever run finds
  duplication at 1.31× the margin **visually indistinguishable** from no duplication at
  0.98×.

### 1.3 …and they are NOT separated

aeon `docs/DEFERRED_WORK.md`, verbatim:

> **The discriminator still does not close, and NOT for the reason the dispatch expected.**
> It is not the spans being equal — it is that `excursion = rate × span` and this scene's
> bands are 48 and 64 lines, a ratio of 4/3 …

> **THE FIXTURE THAT WOULD CLOSE IT, stated as something authorable:** one scene, two
> curve bands, spans **64 and 192**, authored to the same per-line rate.

That fixture is **unbuilt**. aeon `docs/witness/depth-onset-2026-09-06.md` §6 item 1: *"both
survive, and the rate reading has gained ground."*

### 1.4 WHERE MY DERIVATION DISAGREES WITH THE BRIEF

**The brief asked for the BOUND SECTION's camera range. Aurora cannot know it, and I
did not approximate one.** `tools/depth_onset_probe.py`'s own module docblock says why:

> a section-to-camera-x mapping is exactly the kind of thing that reads obvious and is wrong

aeon **measured** section 4's camera range (2040 / 2840 / 3840 from three warps) rather
than deriving it from the grid. Aurora has no such measurement, and a scene can be bound
to several sections at once. So `CurveRateCamera.maxCamX` is the **act's** clamp,
`actReach().travelX` = `grid × SECTION_PIXEL_SIZE − SCREEN_WIDTH`, which aeon *does*
state (`engine/level/camera.emp`, `[0, level_width − SCREEN_WIDTH]`, already transcribed
in `src/core/model/screen.ts` and `src/renderer/canvas/bg-wrap.ts`).

**This is the LOOSE direction and is deliberate.** It can warn about a camera x the bound
section never reaches. Over-warning is noise; under-warning is the defect this parcel
replaced. It is written down in `CurveRateCamera`'s docblock so nobody reads the act
figure as a section figure.

**The other disagreement with the brief is the rule's shape itself**, and the controller
had already conceded it: the advisory is built on rate, not on an onset against the wrap
margin. `PLANE_W − SCREEN_W` appears **nowhere** in Aurora's new code — the advisory
names the wrap margin in prose, with no number, because that reading is the one aeon says
no longer accounts for the visible break.

---

## 2. THE CONSTANTS, AND WHERE EACH CAME FROM

`src/core/formats/effects/curve-rate.ts` **types in exactly two numbers.**

| quantity | value | where it came from |
|---|---|---|
| `CURVE_RATE_ARMS[descsmall].excursionPx` | 176 | aeon `docs/DEFERRED_WORK.md` CURVE-DESC table + `tools/depth_onset_probe.py` docblock |
| `CURVE_RATE_ARMS[mid].excursionPx` | 353 | same two places |
| `CURVE_RATE_ARM_SPAN_LINES` | — | **DERIVED**: `SCREEN_HEIGHT` (`src/core/model/screen.ts`, itself read out of aeon `engine/system/constants.emp` by an existing test). Every sec7 arm covered the whole screen (`curve-desc` §6's rotation collapse; aeon's probe carries `LINES = 224`). |
| `CURVE_RATE_CLEAN_MAX` | — | **DERIVED**: `curveShearRate(176, SCREEN_HEIGHT)` |
| `CURVE_RATE_GARBLED_MIN` | — | **DERIVED**: `curveShearRate(353, SCREEN_HEIGHT)` — the bar |
| the excursion at a camera | — | **DERIVED**: `decodeFactorScroll`, the engine's per-term truncation, not `factorRatio` |
| the camera range | — | **DERIVED**: `actReach().travelX` |

**The divisor is proved rather than assumed.** `rate = excursion / (span − 1)` reproduces
**all six** rates aeon has printed. Only the narrow bands can tell it from `/span`:

| aeon's row | span | excursion | aeon printed | `/(span−1)` | `/span` |
|---|---|---|---|---|---|
| sec7 `descsmall` | 224 | 176 | 0.79 | 0.79 | 0.79 |
| sec7 `mid` | 224 | 353 | 1.58 | 1.58 | 1.58 |
| sec7 `desc` | 224 | 1060 | 4.75 | 4.75 | 4.73 |
| sec7 `asc` | 224 | 1061 | 4.76 | 4.76 | 4.74 |
| **sec4 band 112** | **48** | 348 | **7.40** | **7.40** | 7.25 |
| **sec4 band 160** | **64** | 1398 | **22.19** | **22.19** | 21.84 |

`test/formats/aeon-curve-rate-drift.test.ts` **parses those last two rows out of aeon's
own file** and asserts Aurora's arithmetic reproduces the printed figure, so nothing in
that check is typed here.

---

## 3. THE OLD SENTENCE AND THE NEW ONE, SIDE BY SIDE

### OLD (`curveDescendingAdvisory`, shipped 2026-09-05, DELETED here)

> this strip's Plane B ramps **DOWNWARD**, from `<fb>` at its top to `<to>` at its bottom.
> aeon bisected a descending parallax curve as the cause of a garbled background on a live
> machine (2026-09-05): "a DESCENDING parallax curve garbles the background and an
> ascending one does not". **The mechanism is UNESTABLISHED** and no build refuses this, so
> it is advice and not a refusal: every curve shipped in aeon's tree ramps upward. Ramp to
> a factor **above** `<fb>`, or take the curve off.

Wrong three ways by 2026-09-06: the direction is refuted; "the mechanism is
UNESTABLISHED" understates a monotone rate ladder measured against controls; and
"ramp to a factor above `<fb>`" is a remedy that would have made an ascending curve
*worse*.

### NEW (`curveRateAdvisory`), on the warn arm

> this strip's Plane B ramps from `<fb>` at its top to `<to>` at its bottom over a band
> `<N>` screen lines tall, which shears it by `<R>` px per scanline at this act's furthest
> camera x `<maxCamX>`. aeon's lowest per-line rate ever measured GARBLING a background is
> `1.58`, and this band reaches that at camera x `<onset>`, inside the range this act's
> camera covers. **[mechanism]** aeon drove this on a live machine (2026-09-06) and refuted
> the DIRECTION Aurora used to warn about: an ascending curve of the same spread garbles,
> and a small descending one does not. What severity tracks, against a curve-free control at
> fixed art, is the per-line rate. That is the better-supported account and it is NOT
> settled: aeon's other reading, the band's total travel against Plane B's wrap margin, has
> not been separated from it, and the fixture that would separate them is unbuilt. There is
> no engine defect and no build refuses this. **[remedies]** Spread the same ramp over a
> taller band, or move `<to>` closer to `<fb>`. Neither the direction of the ramp nor its
> presence is the problem, and nothing here refuses the value.

Split into `diagnosis` / `mechanism` / `remedies` on the O15 shape, so a panel can hold
the mechanism behind a disclosure without a `slice()` guessing which half an author acts
on.

---

## 4. THE TWO DISCRIMINATING CASES, AND WHAT THEY PROVE

Both are in `src/renderer/providers/__tests__/effects-aeon.test.ts`, titled
`THE DISCRIMINATOR 1` and `THE DISCRIMINATOR 2`. Each asserts **what the old rule would
have said**, using the retracted predicate restated inside the test (the function is
gone, so a bare claim about it would check nothing), and then asserts the new rule
disagrees.

| | pair | direction | camera range | OLD rule | NEW rule |
|---|---|---|---|---|---|
| **1** | `FACTOR_1_8` → `FACTOR_1_2` | **ascending** | `2 × onset` | **silent** | **WARNS** |
| **2** | `FACTOR_1_2` → `FACTOR_7_16` | **descending** | `onset / 2` | **warned** | **SILENT** |

Case 1 proves the rule is no longer about direction: the retracted advisory said nothing
about any ascending curve, and aeon's `asc` arm garbles. Case 2 proves it is now bounded
by reach: the retracted advisory warned about every descending pair regardless of whether
the camera could ever get there, and aeon's `descsmall` (this exact pair) is **CLEAN**.

Case 2 carries its own anti-vacuous row: the same pair **does** warn once `maxCamX` passes
the onset, so the silence is about the camera range and not about a dead predicate.

Neither onset is typed. Both come from `curveRateOnsetEstimate(...)` over
`CURVE_RATE_GARBLED_MIN`, so the fixtures move with the constants.

A third row makes the refutation a **property** rather than two examples: over all
16 × 16 named factor pairs, the advisory says the same thing about a curve and its
mirror. A direction gate cannot survive it (proved — plant 2).

The new sentence is pinned on wording **unique to it** (`px per scanline`,
`lowest per-line rate ever measured GARBLING`), and a separate row asserts the retracted
phrases are absent. The repo has shipped a row that passed against a neighbouring string
before; these cannot.

---

## 5. WHAT THE ADVISORY DELIBERATELY DOES NOT CLAIM

* **It does not claim rate is the cause.** aeon has not separated it from excursion. The
  mechanism says *"the better-supported account … NOT settled … the fixture that would
  separate them is unbuilt."*
* **It does not say the mechanism is unestablished.** That was the old text and it now
  understates a monotone severity ladder measured against per-camera controls.
* **It does not claim an engine defect.** aeon: *"there is no engine defect"*, *"Zero
  engine bytes"*, and the walker's ramp is exact in both directions (0 of 224 lines
  differing at 26 camera positions across two parcels).
* **It refuses nothing and greys nothing.** `curveFieldOptions` is untouched and a row
  asserts both a descending and an ascending option stay enabled. Escalating a retracted
  premise into a gate would be worse than the sentence being replaced.
* **Silence is never a clearance.** `CURVE_RATE_GARBLED_MIN`'s docblock lists what the
  one comparison does not cover; there is no "looks fine" string anywhere in the module.
* **It does not fire inside the unmeasured gap** between 0.79 (highest measured clean)
  and 1.58 (lowest measured garbled). aeon's onset is bracketed, never bisected.
* **It does not claim a bound section's camera range** — see §1.4.

**Loud on unmeasurable, in both directions it can be unmeasurable:**

* *band span unknown* (an unlocked scene, where the span is a per-frame quantity): the
  advisory fires carrying `rowRemapBandSpan`'s restriction **verbatim** and says *"Treat
  this curve as UNCHECKED rather than clear."*
* *camera range unknown* (no act open): it fires, says `NO ACT IS OPEN`, prints the
  **estimated** onset labelled as an estimate, and says it is *"neither a warning nor a
  clearance."* It assumes neither an unbounded range (which would silence it) nor zero
  (which would fire it always) — and a row proves it is a genuine third state by showing
  the same pair go silent under a real range below the onset.

---

## 6. PLANT PROOFS

Baseline for every restore is the committed tree (`f432e4e6` / `192065d2`); each plant
was applied to the working tree, run, then `git checkout -- <path>` and re-run.

| # | mutation (from `git diff`) | red | green after restore |
|---|---|---|---|
| 1 | `curve-rate.ts`: `/ (spanLines - 1)` → `/ spanLines` | **3 failed / 16 passed** — incl. `Aurora's rate reproduces aeon's printed rate on the NARROW bands`, which reads aeon's table | 19/19 |
| 2 | `effects-aeon.ts`: re-introduce the retracted direction gate (`return null` unless descending) | **5 failed / 178 passed** — incl. `THE DISCRIMINATOR 1` and the mirror-symmetry property | 183/183 |
| 3 | `effects-aeon.ts`: `if (camera.maxCamX === null) return null` (treat unknown as unbounded) | **2 failed / 181 passed** — `is LOUD, not silent, when no act is open` | 183/183 |
| 4 | `effects-aeon.ts`: splice the retracted sentence back into the shipped diagnosis | **2 failed / 188 passed** — the repo-wide `src/` sweep and the provider's own row | 190/190 |
| 5 | `peer-repo.ts`: remove `maxBuffer` from `git()` | **3 failed / 4 passed** — the aeon rows go red with the FALSE "ABSENT" message | 7/7 |

Plant 5 is the proof that §7's instrument fix is load-bearing rather than tidying.

**Full suite on the landed tree:** `npm test` — **521 test files passed, 3 skipped (524);
7612 tests passed, 9 skipped (7621)**. All 9 skips pre-existing and environment-gated
(`AURORA_FG_GATE_FILE`, `AURORA_BENCH`, two live-emulator rows, two absent-`s4_engine`
rows, and the main-checkout-only sibling-root row); none introduced here.

---

## 7. A DEFECT IN A SHARED INSTRUMENT, FOUND BY USING IT

`test/support/peer-repo.ts`'s private `git()` passed **no `maxBuffer`**. Node's default is
1 MiB, `execFileSync` **throws** `ENOBUFS` rather than truncating, the `catch` returned
`null`, and `readAtRev` reports `null` as:

> `MEASURED: <path> is ABSENT at <rev> (<sha>): deleted or renamed`

So **every peer file over a megabyte read as DELETED, with a message asserting the read
had succeeded** — a false negative wearing the label of a positive measurement. aeon's
aeon's `docs/DEFERRED_WORK.md` is 2,165,583 bytes and hit it the first time any row read that
file. Fixed two ways, because the size alone only moves the cliff: 64 MiB (matching
`grepAtRev`, which always passed one), and ENOBUFS now **rethrows** so a future oversized
file cannot be reported as a deletion.

**No existing row was wrong before today** — nothing in the suite had read a peer file
that large — so this is a latent trap closed, not a regression repaired.

---

## 8. WHAT I DID NOT ESTABLISH

1. **Nothing was run on a ROM or an emulator.** Standing invariant for this lane. Every
   claim here is about aeon's committed artifacts and Aurora's own arithmetic.
2. **I did not verify aeon's measurements.** I read their tables and reproduced their
   arithmetic; whether `mid` really garbles is their run, not mine.
3. **The onset is not bisected — by aeon or by me.** aeon has three points bracketing a
   derived threshold and says so. The bar Aurora compares against is the **lowest rate
   ever seen garbled**, not the transition.
4. **The unmeasured gap (0.79 … 1.58 px/line) is a silent zone.** A band landing in it
   gets no sentence. That is a deliberate choice against over-claiming, and it is a real
   coverage hole rather than a proof of safety.
5. **I did not check the advisory in the running app.** The node suite cannot see React;
   the panel wiring is compile-checked and the provider is tested, but no CDP run drove
   the Hint onto a screen. Tagged for a foreground session.
6. **`rowRemapBandSpan` is an UPPER BOUND on the span** (its own docblock says so: Step 4b
   can split a band). A larger span gives a **smaller** rate, so the advisory is quieter
   than the truth in that case. This is the safe direction for a warning that is not a
   clearance, but it means a band split at runtime could shear faster than the sentence
   says.
7. **Whether any of aeon's shipped curves are reachable in play is theirs, not settled
   here.** aeon `90d351be` measured that only section 0 of OJZ act 1 has any collision, so
   the d-15 showcase's garble is *"not 'his showcase is broken' but 'his showcase will be
   broken the day that section gets a floor'"*. Aurora's advisory says nothing about
   collision or reachability and should not be read as saying a player sees this.
8. **`CURVE_RATE_ARMS` carries two of aeon's five arms.** The other three bracket nothing
   (one control, two far past `mid`), but if aeon re-runs the bisect the transcription is
   a two-row window on a five-row table, and the drift gate only checks those two.
