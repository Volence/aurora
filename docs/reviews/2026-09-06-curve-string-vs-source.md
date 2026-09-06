# The curve advisory's travel clause: closing the gap between Aurora's own two texts

**Branch** `parcel/curve-string-vs-source`. **Scope:** one clause in one shipped sentence,
the gates that pin it, and one quoted phrase in a failure message. Nothing else.

This parcel takes the option that `docs/reviews/2026-09-06-curve-cite-witness.md` §3 named
and deliberately did not take. It ships **different wording than that packet illustrated**,
and §4 below says why.

---

## 1. The gap: two Aurora texts, not Aurora versus aeon

Before this change, the same repo said two different-strength things about the same claim.

**Aurora's SOURCE** — `src/core/formats/effects/curve-rate.ts:40-45`, the module header, the
text a maintainer reads:

> WHAT MOVED THE ARGUMENT TOWARD RATE, and it is a measurement rather than a preference: the
> first matched-rate comparison ever run (`depth-onset` §5, band 160 at 1.31x the wrap margin
> against band 112 at 0.98x, both at 4.0 px/line, each against its own per-camera control)
> finds the two **indistinguishable**. **So the excursion threshold no longer accounts for the
> visible break** even though it remains true as geometry.

**Aurora's SHIPPED STRING** — `src/renderer/providers/effects-aeon.ts`, `curveRateAdvisoryParts`'s
`mechanism`, the text an author reads:

> That is the better-supported account and it is NOT settled: aeon's other reading, the band's
> total travel against Plane B's wrap margin, **has not been separated from it**, and the
> fixture that would separate them is unbuilt.

The source says travel **lost**. The string says travel is **awaiting a verdict**. A fast
reader of the string could take it as granting travel equal standing, which our own source
says it does not have. That is the entire defect: an internal disagreement about strength,
where the weaker of the two is the one shipped to a person.

---

## 2. aeon's own sentence, read at the pin

Read at `CURVE_RATE_WITNESS`'s revision, through the peer resolver
(`test/support/sibling-root.mjs`'s `siblingPathOrUnresolved('aeon')`) and with
`git -C "$AEON_DIR" show <rev>:<path>`, never a path read into their live working tree.

* **Revision:** aeon `f62a3d5c`, subject *"witness(depth): commit the A/B figures that
  travelled in mail with no revision behind them"*.
* **Path, inside aeon:** `docs/witness/depth-curve-rate-2026-09-06.md` (the whole commit is
  that one file, 49 lines added).

Its section **"⚠ WHAT THIS DOES AND DOES NOT ESTABLISH"**, quoted from the blob and not from
any packet. Fenced rather than block-quoted because it is a **verbatim listing of another
repo's file**, markdown emphasis and all, and every relative path inside it is an *aeon* path
that resolves in *their* tree, not in this one:

```
**It supports RATE as the better account of the visible break.** The rate columns separate the
two builds decisively (66 -> 3, 22 -> 6) while the travel column does not: both stay far above
the 512 px plane width, so a reader shown only travel would conclude the change did nothing.

**IT DOES NOT SEPARATE SPAN FROM RATE AND MUST NOT BE READ AS DOING SO.** Changing a curve moves
excursion and per-line rate **together**. This is one variable moved, not two variables
separated. **The discriminating fixture is still unbuilt** and is named in
`docs/witness/curve-desc-2026-09-06.md`: one scene, two curve bands of span **64 and 192 at the
same per-line rate**.

**The travel-vs-192 model is SUPERSEDED as the account of the visible break** — it remains true
as geometry and is no longer the better-supported explanation.
```

**So aeon states three things, and the shipped string carried only the first and the third.**
The supersession — the second — is the half that was missing, and it is the half our own header
already had.

**On which VARIABLE is named:** aeon says span-versus-rate; Aurora's string says
travel-versus-rate. That is not a discrepancy, and the prior packet already worked it out from
aeon's `docs/DEFERRED_WORK.md`: `excursion = rate x span`, so with span held near-fixed the two
namings are two spellings of one open question. This parcel does **not** re-litigate that and
does not change which variable the string names.

---

## 3. What shipped

`src/renderer/providers/effects-aeon.ts`, one clause:

| | |
|---|---|
| **was** | …aeon's other reading, the band's total travel against Plane B's wrap margin, **has not been separated from it**, and the fixture that would separate them is unbuilt. |
| **now** | …aeon's other reading, the band's total travel against Plane B's wrap margin, **no longer accounts for the visible break but is still not separated from the rate**, and the fixture that would separate them is unbuilt. |

Nothing else in the sentence moved: the direction refutation, `better-supported account`,
`it is NOT settled`, `the fixture … is unbuilt`, and `no engine defect and no build refuses
this` are all byte-identical. The clause grows the sentence by **nine words**.

A maintainer-facing comment above the string now records why it reads this way, carrying
aeon's own word `SUPERSEDED` and the pin, since a comment can hold a revision and a shipped
string cannot (this repo's own prior ruling, `effects-aeon.ts`'s Plane-A header).

---

## 4. Why this wording and not the illustrated one

The prior packet illustrated: *"is superseded as the account of the visible break and still not
separated from it"*. I departed from it on two grounds — plus a third I set out to make and then
measured away, recorded below rather than quietly dropped. This is an open call rather than a
correction of that lane — it wrote the phrase as an illustration, explicitly, from a lane that
had decided not to ship it.

1. **It is our own header's phrasing, verbatim.** "No longer accounts for the visible break" is
   lifted word-for-word from `curve-rate.ts:44-45`. The defect was that the two Aurora texts
   disagreed; using the header's own words makes them **read the same** rather than merely agree
   in substance, so the next reader comparing them has nothing to adjudicate.
2. **"But" carries the concession; "and" flattens it.** The two halves are in tension — travel
   lost as the explanation, *and yet* the confound is still open — and that tension is the whole
   point of the sentence. `and` lists them; `but` marks the second as the surprise.
3. **It costs no more length, and it costs less vocabulary.** ⚠ I set out to argue this one as
   "shorter" and measured it instead of asserting it: the two clauses are **exactly the same
   size — 15 words, 81 characters each**. So length does not choose between them and this
   ground is not the reason; what it does establish is that grounds 1 and 2 are free. The
   length ruling still binds the clause as a whole — the O15 shape
   (`docs/reviews/2026-08-30-o15-advisory-shape.md`) puts `mechanism` behind a disclosure
   precisely because a wall of caveats in front of a control is itself a defect, which is why
   the omission recorded just below is an omission and not an oversight. The remaining asymmetry is
   vocabulary: "superseded" is a maintainer's word, and an author does not have to learn it to
   read "no longer accounts for the visible break".

**What I deliberately left OUT of the string:** aeon's *"it remains true as geometry"*. No author
remedy turns on it — the remedies half is entirely about rate (spread the ramp over a taller band,
or move the ends closer) — and "still not separated from the rate" already stops the sentence
reading as *travel is irrelevant*. It stays in `curve-rate.ts`'s header and in the new comment,
where the reader who needs it is.

---

## 5. Every reader of the wording, enumerated

Both an identifier grep and a quoted-string grep were run over `src`, `test`, `docs`, `scripts`
and `scratchpad`, for `better-supported`, `better supported`, `has not been separated`,
`not separated`, `no longer accounts`, `SUPERSEDED` and `travel-vs-192`, and reconciled. Generic
`superseded` hits (the confirm-store cancel reason, `server-identity`'s verdict enum, activation
generations, unrelated ROADMAP banners) are not readers of this clause and are excluded by
inspection, not by a narrower query.

| # | Reader | Kind | Action |
|---|---|---|---|
| 1 | `src/renderer/providers/effects-aeon.ts:961-964` | the shipped string | **CHANGED** |
| 2 | `src/renderer/providers/effects-aeon.ts:935-956` | new maintainer comment above it | **ADDED** |
| 3 | `src/renderer/providers/__tests__/effects-aeon.test.ts:1115-1120` | the gate, `toMatch` x3 + one negative | **CHANGED** |
| 4 | `test/formats/aeon-curve-rate-drift.test.ts:179` | question (4)'s **failure message**, which QUOTES our clause | **CHANGED (quote only)** |
| 5 | `src/core/formats/effects/curve-rate.ts:44-45` | the source docblock carrying the supersession | unchanged — this is the text the string was aligned TO |
| 6 | `test/formats/aeon-curve-rate-drift.test.ts:166-171` | question (4)'s docblock: *"rate is the BETTER-SUPPORTED account and … NOT separated from the excursion reading"* | unchanged — still literally true of the new string, both halves |
| 7 | `src/renderer/components/effects/EffectsScenePanel.tsx:797-799` | JSX comment: *"the two accounts aeon has not separated"* | unchanged — a paraphrase pointing at the docblock, not a quote of the clause, and still true |
| 8 | `docs/reviews/2026-09-06-curve-onset.md` (lines 19, 114, 175, 225-226) | the landing packet for the advisory | unchanged — a dated record of what shipped that day |
| 9 | `docs/reviews/2026-09-06-curve-cite-witness.md` (lines 15, 70-71, 78-79, 83, 97-98, 108-111) | the packet that named this option | **banner added** — its §3 says *"I record the option rather than taking it"*, which is now false as a statement of the present, so it gets a pointer here rather than an edit |
| 10 | `docs/lane-log.jsonl:347, 348` | dated ledger rows | unchanged — append-only record |

**Item 4 is the one worth naming out loud.** It sits inside question (4), the currency check, which
the prior packet argues at length must stay pointed at aeon's `docs/DEFERRED_WORK.md` at **tip**.
Its regexes (`/discriminator still does not close/i`,
`/[Ss]everity instead tracks rate monotonically/`), the revision it reads at, and the file it reads
are all untouched. Only the phrase it quotes back from **our own advisory** moved, so its failure
message names a clause that exists. That quote is prose in a message string, not an assertion, so
there is no red-first plant for it and none is claimed; it was found by grep and verified by
reading the row.

---

## 6. The gates, and the red-first proof

The hedge row (`carries none of the retracted claims in its own words`) now pins **three** phrases
rather than two, because aeon states three things:

```
expect(said).toMatch(/better-supported account/);            // rate is better supported
expect(said).toMatch(/no longer accounts for the visible break/);  // travel is SUPERSEDED
expect(said).toMatch(/still not separated from the rate/);   // the confound is OPEN
expect(said).not.toMatch(/has not been separated/);          // the retracted shape of (3)
```

Split into three rather than one long regex so an edit dropping **exactly one** of the three
cannot pass. Each phrase occurs nowhere else in the joined sentence — checked against the full
rendered string, which the failure output below prints in full — so none can be satisfied by the
diagnosis or the remedies half. The pre-existing negatives (`/DOWNWARD/`,
`/mechanism is UNESTABLISHED/i`, `/descending parallax curve garbles/i`) and `/no engine defect/`
are untouched.

**Three plants, each against the committed baseline, mutation shown on disk each time, restored
from HEAD (not from a dirty tree) between plants.** The plants ran at `c8a37880`; that commit was
afterwards amended to `4b77bdfc` to correct a claim in its own message (see §4, ground 3), and the
two trees are identical — `git diff c8a37880 4b77bdfc` is empty, only the message moved.

| plant | mutation on disk | result |
|---|---|---|
| **A** — the whole old clause back | `git diff --stat`: `src/renderer/providers/effects-aeon.ts \| 6 +++---`; diff shows `-'…no longer accounts for '` / `+'…has not been separated '` | **RED**: `expected … to match /no longer accounts for the visible br…/`, and the *Received* line printed the full advisory ending `…has not been separated from it…`, so the mutation is proven to have reached the rendered string |
| **B** — supersession kept, open-confound half reverted (`but is still not separated from the rate` → `and it has not been separated from it`) | `1 insertion(+), 1 deletion(-)`, diff line quoted | **RED**: `expected … to match /still not separated from the rate/` |
| **C** — all three positives left intact, the retracted phrase re-inserted as an extra sentence | `2 insertions(+), 1 deletion(-)`, diff shows `+ 'separate them is unbuilt. It has not been separated. …'` | **RED**: `expected … NOT to match /has not been separated/` |

Plant C matters on its own: A and B prove the positives discriminate, and only C proves the
**negative** fires rather than riding along on an earlier failure.

After each plant: `git checkout HEAD -- src/renderer/providers/effects-aeon.ts`, then
`git status --short` empty. The final restore was verified by reading the four string lines back
off disk, not by assuming.

---

## 7. Suite

Full `npm test` (the whole chain: eleven checker scripts, `check-harness-guards`, `typecheck`,
then `vitest run`), in this worktree, foreground.

| | Test Files | Tests | exit |
|---|---|---|---|
| **before** (`cadcc135`, branch point) | 521 passed, 3 skipped (524) | **7613 passed, 9 skipped (7622)** | 0 |
| **after** (`4b77bdfc`, tree-identical to `c8a37880`) | 521 passed, 3 skipped (524) | **7613 passed, 9 skipped (7622)** | 0 |

No row lost and none gained: the three new assertions live inside an existing `it`, so the row
count is identical by construction rather than by luck. The three skips are the standing ones
(`AURORA_BENCH`, the two live-warp opt-ins, the absent `s4_engine` tree, and the linked-worktree
`sibling-root` step-3 row), each naming its reason; `skip-report: OK` in both runs.

Targeted run of the three files that touch this clause —
`src/renderer/providers/__tests__/effects-aeon.test.ts`,
`test/formats/aeon-curve-rate-drift.test.ts`,
`src/core/formats/effects/__tests__/curve-rate.test.ts` — 3 files, **203 tests, 0 failed**.

---

## 8. What I left open

* **No emulator, no ROM, no runtime confirmation**, by standing constraint. Nothing here needs
  one: the change is a string and its gates, and the advisory was already advice that no build
  enforces.
* **Question (4) untouched**, deliberately, including its regexes and its tip read. It remains
  the row allowed to go red on good news, and if aeon ever builds the span-64-vs-192 fixture it
  is the row that will tell the next reader to **strengthen** this clause rather than delete it —
  now with a failure message quoting the clause that actually exists.
* **`EffectsScenePanel.tsx`'s comment** (reader 7) says "the two accounts aeon has not separated",
  which is still true and is a paraphrase rather than a quote. Left alone rather than churned; it
  is named here so a future grep does not read the omission as an oversight.
* **The two dated packets** (readers 8 and 9) are not rewritten, per this repo's convention for
  dated records. Only the one whose stated *present-tense* position this parcel reverses gets a
  banner.
