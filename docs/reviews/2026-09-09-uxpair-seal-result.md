# The sealed UX seats — result, and a defect in my own brief

**2026-09-09.** Both aurora UX seats were dispatched cold and have returned.
Artifacts: `docs/reviews/2026-09-07-lens-ux/sealed/uxa-own-test.md` (merge
`37d4c1b4`, seat tip `42965592`) and `uxb-own-test.md` (merge `f5c8f128`, seat
tip `2f1736c6`). Neither is edited; both are read here and argued about here.

## Why the seal existed

The suite is settling on one shared question for separating a real usability
finding from a matter of taste. Every reviewer asked about it so far was asked
**inside the message that told them the answer**, so every opinion on record —
including this lane's own adopted amendment — is a reaction to an incumbent
rather than an independent arrival. Sigil's two seats read the base text before
a revision reached them mid-walk. Aurora's undispatched pair was the last clean
point in the suite and would have stopped being one on the next message: the
hub's final revision arrived roughly four minutes after the second seat launched.

**A guarantee stronger than the instruction, and it was luck.** Both seats were
pinned to base `670e3821`. The commit that banked the incumbent text into this
repo (`f697a49a`, into `docs/lens-findings.jsonl`) came *after* that, so the
answer was never in either seat's tree — confirmed with
`git merge-base --is-ancestor f697a49a <seat branch>`, false for both. I pinned
that base for reproducibility, not for containment. Had I dispatched from tip an
hour later, the do-not-read instruction would have been the only thing standing
between a cold seat and the answer sitting in a file in its own worktree.
**Pin the base when you seal, and pin it for this reason.**

## The two answers

**Seat A** — *"If I had liked the way this looks, would it still have cost me
time, certainty about my own work, or the work itself?"* A counterfactual run
over the reviewer's **own preference**: strip out whether you liked it, and see
whether a cost survives.

**Seat B** — *"Can I point to an observable moment in this walk when this cost
me something — an action I had to undo or repeat, time spent hunting or looking
a fact up, a false belief I acted on, or a destructive step I avoided only by
catching myself?"* B calls it the **receipt test**, and binds it: the receipt
must be an event someone standing behind the reviewer could have watched. *"I
hesitated"* is not a receipt; *"I opened the wrong menu, closed it, opened the
other"* is.

## The result, stated carefully

**Neither seat invented the incumbent, and both landed on a different axis from
it.** The incumbent asks what the person **loses epistemically** — information
needed to act, or to know they are being misled. Both seats asked what it
**cost** them, and both anchored that cost to something observable rather than
to a judgement. They agree with each other, on that axis, more than either
agrees with the incumbent.

**And here is the caveat that has to travel with that sentence, because without
it the result is worth more than it is.** A and B are the same model, given
near-identical briefs, in the same repository, an hour apart. They are
independent **of the incumbent** — which was the whole point and is a real
property — but they are **not independent of each other** in the way two people
would be. This is two draws from one distribution, not two witnesses. The
convergence is therefore evidence that a cost-anchored reading is what this
framing of the question naturally produces; it is *not* evidence that two minds
independently found the same truth. Anyone quoting the convergence without this
paragraph is overstating it.

## The defect, and it is mine

**Seat B declared a partial contamination and it was caused by my brief.** The
do-not-grep list named the content words *"look and taste"* and *"misled"*
rather than filenames. That told B the incumbent probably turns on being misled,
and B could not un-know it. B handled it correctly and visibly: it reasoned
forward from the application instead of backward from the word, wrote the
truth-shaped test up as its alternative 3, considered it on merits and rejected
it on merits (it lost on coverage — silent about repetition cost, latency,
precision, and never-discovered features), and put the declaration in the
artifact header **and** the commit message so the caveat travels with the file.

This is the same class already banked here as *a brief's literal becomes the
violation*: **I handed them the giveaway inside the safety rule.** A prohibition
that must name what it forbids will leak whatever it names. The fix is
mechanical and costs nothing: **bar searches by naming the FILE they would find,
never the terms they would match.**

**The asymmetry is the more interesting half.** Seat A got the same leaked words
in the same list and reported *"I did not encounter the existing answer at any
point"* — a clean claim, and its artifact header says *"without reading any
existing version of this question"*. That is true as far as it goes and it is
the wrong grain: A was exposed to the same partial leak and did not weigh it.
**So B, the seat that reported contamination, is the more trustworthy of the
two, and A's clean claim is the one to discount.** Both are usable; they are not
equally cold, and the one that says it is cold is the one that is less so.

That is the clause I put in both briefs — *a contaminated answer honestly
labelled beats a contaminated answer presented as clean, because the second gets
counted as independent evidence* — firing in the data rather than in theory.
Score A **nearly cold, undeclared**; score B **nearly cold, declared**.

## What the seats add, as candidates and not as a proposal

Not a proposal to replace the incumbent. The shared text is the hub's, its final
revision is ruled, and which question the suite runs under is not this lane's
call. These are the things the cold seats hold that the incumbent does not, put
where the fold can weigh them:

1. **Repetition and time cost with no information loss.** A path that tells you
   everything and takes twelve clicks loses nobody any information. Both seats
   admit it; the incumbent, read strictly, does not.
2. **Both seats independently refused a bare yes/no.** B requires the receipt
   verbatim, incurred-vs-near-miss, whether the reviewer already knew the answer
   from source, and a count where the receipt is repetition. A requires a
   labelled *predicted, not paid* channel for harms it can reason about but did
   not incur. The incumbent's own rider — state the population and cost unit
   beside every verdict — is the same instinct, arrived at twice more.
3. **Both seats named the same structural weakness in themselves, unprompted,
   and it applies to every agent seat the suite will ever run.** An agent that
   can read the source answers from the source the questions the interface fails
   to answer — so its own cost figures are a **floor, not a measurement**, and it
   under-files discoverability worst of all, which is exactly the category an
   authoring tool's dominant harm lives in. B also flags that a bin count of zero
   is evidence the reviewer stopped applying the test, so **binned observations
   must be counted, never silently dropped.** That belongs in the walk protocol
   whichever question wins.

## What I am not doing

Not editing either sealed artifact. Not asking the hub to reopen the ruled text
on the strength of two same-model draws. Not running the walk — that waits for
oracle and sigil, per the owner's order.
