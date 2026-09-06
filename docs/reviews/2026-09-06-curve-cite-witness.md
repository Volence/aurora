# The curve advisory's hedge gets an artifact, and the pointer gets a gate

**Date** 2026-09-06
**Branch** `parcel/curve-cite-witness`
**Files** `src/core/formats/effects/curve-rate.ts`, `src/renderer/providers/effects-aeon.ts`,
`test/formats/aeon-curve-rate-drift.test.ts`, this packet
**Runner** `npm test` — 521 files passed / 3 skipped (524); 7613 tests passed / 9 skipped (7622).
Baseline before the change was 7612 / 9. The suite gained exactly one row.

---

## 1. The problem, restated in one line

`curveRateAdvisory` tells an author that a curve's per-line rate is what garbles the
background, and hedges: rate is the better-supported account, and rate and span have not
been separated. The **figures** were already gated against aeon's tree
(`test/formats/aeon-curve-rate-drift.test.ts`). **How strongly the cause is held** was not
gated against anything — it lived in Aurora prose paraphrasing two aeon documents.

aeon closed that on 2026-09-06 by committing the measures and the caveat **in the same
file**, so a summary cannot carry one without the other:

> aeon `f62a3d5c`, "witness(depth): commit the A/B figures that travelled in mail with no
> revision behind them", aeon `docs/witness/depth-curve-rate-2026-09-06.md`.
> Confirmed an ancestor of aeon `origin/master` (it *is* `origin/master` at time of writing).

---

## 2. Where the citation went, and the argument for it

**Three places, deliberately not four.**

| Place | What it carries | Why |
|---|---|---|
| `CURVE_RATE_WITNESS` in `src/core/formats/effects/curve-rate.ts` | the revision and the path, as a frozen constant with a docblock | one definition, so the module header and the gate cannot cite two different things |
| the module header, and the hedge docblock in `src/renderer/providers/effects-aeon.ts` | prose naming the constant, not a second copy of the hash | a maintainer reads source; a second typed hash is a second thing to rot |
| `test/formats/aeon-curve-rate-drift.test.ts` | the executable half | a citation with nothing checking it is the defect class this parcel is about |
| **the shipped advisory string** | **nothing new** | see below |

**The shipped sentence gets no revision, and that is this repo's own prior ruling rather
than my taste.** From the Plane-A header in `src/renderer/providers/effects-aeon.ts`, on a
census deliberately kept out of a rendered string:

> the count lives in the packet, where it can carry the revision it was taken at. **A string
> in the app cannot, and would rot silently.**

That ruling was written about a census and applies unchanged to a commit hash. The two
audiences want opposite things — a hash is noise to an author and gold to a maintainer —
and this repo has a standing finding that a wall of caveats in front of a control is itself
a defect. So the author keeps the hedge's **substance**, which the advisory string already
states in full and which `src/renderer/providers/__tests__/effects-aeon.test.ts` already
asserts both halves of; the maintainer gets the **pin**, one file away, with a gate on it.

The counter-case I considered and rejected: putting aeon `docs/witness/depth-curve-rate-2026-09-06.md`
(no hash) into the advisory's `mechanism`, on the grounds that `mechanism` is the half a
disclosure may hold, so an author who opens it has already asked for depth. Rejected because
a bare peer path with no revision is the *weakest* form of the citation — it names a file in
a repo the author cannot open from the editor, and it cannot be checked by
`scripts/check-cited-paths.mjs` (peer paths are that gate's exclusion 1, for the sound
reason that an agent worktree usually has no peer checkout). It would read as rigour and
carry none.

---

## 3. THE WORDING COMPARISON, which is the finding

**Ours**, the shipped `mechanism` string (`effects-aeon.ts`), verbatim:

> …What severity tracks, against a curve-free control at fixed art, is the per-line rate.
> That is **the better-supported account** and it is **NOT settled**: aeon's other reading,
> the band's total travel against Plane B's wrap margin, **has not been separated from it**,
> and the fixture that would separate them **is unbuilt**.

**aeon's**, at `f62a3d5c`, the witness's own "WHAT THIS DOES AND DOES NOT ESTABLISH":

> **It supports RATE as the better account of the visible break.** … **IT DOES NOT SEPARATE
> SPAN FROM RATE AND MUST NOT BE READ AS DOING SO.** … **The discriminating fixture is still
> unbuilt** … **The travel-vs-192 model is SUPERSEDED as the account of the visible break** —
> it remains true as geometry and is no longer the better-supported explanation.

### Verdict: equal in strength. They differ in which variable they NAME.

Ours names **travel/excursion** as the thing not separated from rate. The witness names
**span**. That looks like a discrepancy and is not one: aeon's own `docs/DEFERRED_WORK.md`
reconciles them explicitly, at the same tip —

> It is not the spans being equal — it is that `excursion = rate × span` and this scene's
> bands are 48 and 64 lines, a ratio of 4/3, so the two quantities stay nearly proportional…

Three quantities in one relation, so *any* two of them are confounded while the third is
held near-fixed, and the single named fixture (one scene, spans 64 and 192 at matched rate)
separates all three at once. Naming travel and naming span are two spellings of one open
question. Our own module header already carries the equation.

### The one asymmetry, stated rather than smoothed over

The witness says travel is **SUPERSEDED** as the account. Our shipped sentence says only
that rate is "the better-supported account" and that travel "has not been separated from
it" — which ranks them, but a fast reader could take it as granting travel equal standing.
Our *source* docblock does carry the supersession ("the excursion threshold no longer
accounts for the visible break even though it remains true as geometry"), so the gap is
between our source and our shipped string, not between Aurora and aeon.

**I did not change the shipped string.** Reasons, in order: (a) the difference is emphasis,
not strength, and aeon's own two artifacts use both spellings; (b) the sentence is already
long, and this repo's O15 shape puts `mechanism` behind a disclosure precisely because
length there is a cost; (c) the wording is gated
(`src/renderer/providers/__tests__/effects-aeon.test.ts` pins `/better-supported account/`
and `/has not been separated/`), so churning it costs a gate edit for a shade of emphasis.
A later lane that disagrees should change exactly one clause — "has not been separated from
it" → "is superseded as the account of the visible break and still not separated from it" —
and update those two `toMatch`es. I record the option rather than taking it.

---

## 4. The drift gate: what changed, and what deliberately did not

**Changed:** one new row, question (5). It asserts, against `CURVE_RATE_WITNESS`, that the
cited revision **resolves**, is **an ancestor of aeon `origin/master`**, that the cited
**path is present at that revision**, and that the file there holds the **numbers and the
caveat together** — a markdown table row carrying pixel measures, and the caveat sentence.

**Not changed:** question (4), the currency check, still reads aeon `docs/DEFERRED_WORK.md`
at its **tip**. The witness is not a better source for it and must not become one:

* A **dated witness file** states what was true the day it was written and is not rewritten
  when the position moves. `DEFERRED_WORK` is the index that moves.
* Question (4) is the row that is *allowed to go red on good news* — if aeon builds the
  fixture and closes the confound, it fails and tells the next reader to **strengthen** the
  sentence. Pointed at a dated witness, that row could never fire. It would be a currency
  check incapable of detecting a change in currency: the worst kind of green.

**No fact is checked twice.** (4) asks *is this still aeon's position?* — tip, mutable, can
go red on aeon. (5) asks *does the artifact we point at still exist and still hold both
halves?* — pinned revision, immutable blob, so it can only go red on **us**: a rev or path
edited into something that does not resolve, or a pin moved to a revision where the caveat
is not beside the numbers. Plus the one aeon-side failure a pin really has: the commit
being rewritten out of published history, after which the object can be collected and no
fresh clone can read what Aurora cites. That is stated in the row's own docblock so the
next reader does not have to re-derive it.

---

## 5. Plant proofs

Every plant was a mutation on disk against the **committed** baseline `3f46f4b3`, restored
with `git checkout <path>` and re-run green. Runner: `npx vitest run
test/formats/aeon-curve-rate-drift.test.ts` (8 tests green at baseline; 7 tests in this file
before the parcel).

| # | Mutation (`git diff -U0`) | Result |
|---|---|---|
| P1 | `- rev: 'f62a3d5c',` / `+ rev: 'deadbeef…deadbeef',` | **RED** — "the cited witness revision deadbeef… does not resolve in aeon, so CURVE_RATE_WITNESS is a dead pointer" |
| P2 | `- rev: 'f62a3d5c',` / `+ rev: 'beb7be98',` | **RED** — "…is no longer an ancestor of aeon origin/master." `beb7be98` is a real aeon branch tip (`bake/vertical-band-look`) confirmed NOT an ancestor, so this is a live discrimination, not a synthetic one |
| P3 | `- path: '…depth-curve-rate-2026-09-06.md',` / `+ path: 'docs/witness/curve-desc-2026-09-06.md',` | **RED** — "…does not carry the caveat, so the pin points at figures with no hedge beside them." Note the strength: the substitute is a *real aeon witness on the same subject, with px tables*, and it still reds |
| P3b | `+ path: 'docs/witness/depth-curve-rate-2026-09-07.md',` (an aeon path off by one day) | **RED** — "MEASURED: …is ABSENT at f62a3d5c…: deleted or renamed" |
| P4 | `+ path: '.gitignore',` **and** `- /DOES NOT SEPARATE SPAN FROM RATE/.test(doc.text),` / `+ /./.test(doc.text),` | **RED** — "…states no pixel measures, so it is not the numbers-and-caveat artifact this pin claims it is" |

**P4 is a two-line mutation and that is disclosed rather than buried.** The caveat assert
runs first and throws, so pointing at a caveat-free file masks the measures assert. To show
the measures assert is itself load-bearing I neutralised the caveat regex to `/./` in the
same run. The pair proves the intended property — *with the caveat check out of the way, a
file that is not the numbers artifact is still caught* — but it is an isolation technique,
not a single-variable plant, and a reader should weigh it as such.

**Pinning:** the caveat is matched on `DOES NOT SEPARATE SPAN FROM RATE`, a full clause
unique to that file. It shares no prefix with the `DEFERRED_WORK` phrasing matched by
question (4) (`discriminator still does not close`), so the prefix-collision failure this
repo has already shipped once — a gate going green on its own mutation because a new line
began with the label it matched by prefix — cannot recur here by that route.

---

## 6. What I did NOT establish

1. **I did not verify aeon's measures.** I read the four figures and the two crc32s in the
   witness; I did not rebuild either ROM or re-measure anything. The pin asserts
   *co-location and publication*, not that the numbers are right. Aurora types none of them
   (`scripts/check-prose-constants.mjs` would fail the run if it did).
2. **Nothing here says rate IS the cause.** The parcel changed where the hedge is checkable,
   not what it claims. The discriminating fixture is still unbuilt on aeon's side.
3. **The ancestry assert is currently trivial in production.** `CURVE_RATE_WITNESS.rev` *is*
   aeon `origin/master` right now, so ancestry holds by identity; it only starts
   discriminating once aeon moves past it. P2 shows it discriminates when given a real
   non-ancestor, which is the most that can be shown today.
4. **The pinned-blob content asserts cannot see aeon changing its mind.** A blob at a fixed
   revision is immutable, so (5)'s content half is a guard on *our* constants only. Every
   claim about aeon's *current* position rests on (4), against the tip.
5. **I swept for other paraphrases of the hedge and found no second shipped copy** —
   `src/renderer/components/effects/EffectsScenePanel.tsx` points at the docblock rather
   than restating it, and the only other occurrences are the gate in
   `src/renderer/providers/__tests__/effects-aeon.test.ts` and the prior packet
   `docs/reviews/2026-09-06-curve-onset.md`. That was a grep over `src/` and
   `docs/reviews/` for four phrasings, not a semantic census: a paraphrase using none of
   those words would not have been found.
6. **I did not touch anything the parallel lane owns** — no file under
   `src/renderer/providers/bg-anim-aeon.ts`, `src/core/formats/bg-override/`, or any copied
   aeon tree. aeon was read exclusively through `git -C` at committed revisions, resolved
   via `test/support/sibling-root.mjs`; nothing was written to it.
