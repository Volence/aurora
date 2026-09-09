# UX seat B — my own finding/taste test, invented cold

Written before any walk, before seeing any existing version of this question, and
before reading anything under `docs/`. Grounding was `src/renderer/` only — the
component, shell and state directory listings, and `App.tsx` — enough to know
what kind of application I will be reviewing (tabs over long-lived documents,
an explorer, a level workspace, sprite and canvas modes, a build panel, a
command palette, confirm dialogs and dirty-state guards).

**One contamination to declare up front.** The dispatch that forbade me from
reading the incumbent also listed the terms I must not grep for. Two of those
terms — "look and taste" and "misled" — are content words, not filenames, and
they are a partial leak of the incumbent's vocabulary. I did not grep them and I
have not seen the incumbent. But I knew, while thinking, that some existing
answer probably turns on *being misled*. I could not un-know it. I resolved that
by reasoning from the application forward rather than from that word backward,
and by deliberately not steering away from it either — a truth-shaped test
appears below as alternative 3, considered on merits and rejected on merits, and
the reason it lost is stated. Weigh this answer as *nearly* cold, not cold.

---

## 1. The question

> **Can I point to an observable moment in this walk when this cost me something —
> an action I had to undo or repeat, time spent hunting or looking a fact up, a
> false belief I acted on, or a destructive step I avoided only by catching
> myself?**

Yes → it is a finding, file it. No → it is taste, drop it.

Call it the **receipt test**. The named clause list is part of the instrument,
not decoration: "cost me something" alone is gameable by anyone motivated
("it cost me aesthetic pleasure"), and the enumeration is what turns a mood into
a ledger. One more binding rule that makes the ledger honest:

**The receipt must be an event someone standing behind me could have watched.**
"I hesitated" is not a receipt. "I opened the tool dock menu, closed it, and
opened the other one" is. Internal states do not count; the actions they produced
do.

## 2. Why this question and not another

Three properties of Aurora drove it.

**The work is expensive and long-lived.** A person is hours into a level, with
unsaved documents in several tabs. The dominant cost in that world is not
friction, it is *work destroyed or re-done*. A test that measures anything other
than cost to the work will rank a cramped panel above a mis-targeted paint
stroke, which is exactly backwards.

**The screen is the user's only evidence about their data.** Level layout,
collision, palettes, effects — none of it is legible except through this
application. That makes the interface's claims load-bearing in a way a
consumer app's are not, and it means "false belief I acted on" has to be a
first-class entry in the ledger, not a subcase of confusion.

**The reviewer is the contaminant.** The failure mode I most need to defend
against is not missing defects; it is my own preferences arriving dressed as
findings. Every abstract test I could write ("would a novice struggle?", "is
this good design?") is answerable by the same person whose preference is on
trial, and will be answered in that person's favour. So the test must be
anchored to something that already happened and cannot be re-litigated — the
trace of what I actually did. An observation whose entire support is a
hypothetical user has no anchor, and the hypothetical user is the single largest
laundering channel for taste in UX reviewing. The receipt test closes it by
construction: no event, no finding.

The one hypothetical it does admit — the near-miss — is admitted on a tight
leash. It is licensed only by *my own* catching myself, in this session, at a
specific control. That is still an event with a location and a timestamp. "A
novice might delete a section by accident" is not.

Reading source counts as a cost. If I had to open `src/renderer/` to learn what
a control does, that is a lookup, and lookups are on the ledger. In a tool with
no support desk, the user's version of that lookup is a forum post or an hour
lost, and it deserves to be filed.

## 3. What it deliberately bins, and what it deliberately admits

### Binned as taste — and I expect argument about all four

1. **"The Explorer's rows are cramped; two more pixels would let them breathe."**
   I clicked the row I wanted, first try, every time. No receipt. Someone will
   argue density is a real defect over a four-hour session; see §4, they are
   partly right and the test loses that case.
2. **"The tool dock belongs on the left, like every other art tool."** A
   convention argument with no event behind it. Note what the test does here
   that a convention test would not: if I had actually kept flying the cursor to
   the wrong edge and correcting, the same observation becomes a finding, on the
   receipt. The claim is binned; the *behaviour* would not have been.
3. **"Panel headers should be sentence case, not caps"** / **"the collision
   overlay accent should be warmer."** I read every one of them correctly on
   first look. Preference.
4. **"The build log is visually noisy."** I found the error line I needed
   without scrolling twice. If I had scrolled past it twice, it files.

### Admitted as findings — and a laxer look-and-feel test drops every one, because nothing on screen looks wrong

1. **A paint stroke that lands in a document other than the focused tab.** The
   screen is immaculate: correct indicator, correct highlight, correct
   everything. Twenty tiles in the wrong section and an undo run is the receipt.
   A test that asks whether the interface *looks* right can never fire on this,
   because the interface looks right; that is the defect.
2. **A marquee paste that undoes in three steps instead of one.** Beautiful UI,
   and I hammered ⌘Z past the boundary I meant and took prior work with it.
   Purely behavioural; invisible to an eye.
3. **A placement flow that drops the selected object after each placement.**
   Nothing is wrong with any single frame of it. The receipt is the count: one
   extra re-selection times four hundred placements. Repetition *is* a receipt,
   and the number is the evidence.
4. **A preview that disagrees with the built ROM** — a background band the
   editor scrolls one way and the game scrolls the other. The editor is
   attractive and confident and wrong. The receipt is the build: I acted on a
   false belief and only the ROM told me.
5. **A save-all confirmation whose count includes a document that cannot be
   dirty**, so after clicking through it I could no longer say what had been
   written. Nothing looks broken; a true belief about my own data was destroyed.

The pattern across the admitted five: **in an authoring tool the severe defects
are the ones with no visual signature at all.** Any test that triages on the
appearance of the interface is structurally blind to precisely the class that
costs the user their work.

## 4. Where it is weakest — the cases I can already see it handling badly

**Aggregate strain has no receipt.** Density, contrast, tiny hit targets,
crowded panels: over four hours these genuinely degrade a person, and no single
moment of the walk shows a cost. The test bins them and it is wrong to. The
partial mitigation — repetition counts, so a small cost paid thirty times files
on its count — only covers the ones tied to a repeated action. Pure visual
fatigue is a real class of defect that this instrument cannot see. I would not
patch the test to admit it, because the patch ("would this tire someone?") is
answerable in favour of any preference; I would rather it be a known blind spot
than a hole.

**Expert blindness inverts the anchor.** I read the source before the walk. My
receipts therefore *understate* what a first-time user pays, and they understate
it worst on discoverability — the very class most valuable in a tool with no
support channel. The lookup clause helps only when I actually had to look
something up, and having read `App.tsx` I frequently will not have to. This is
the deepest flaw: the test's anchor is a reviewer whose knowledge is atypical of
the population it is supposed to protect, and it has no correction for that
beyond the disclosure required in §5.

**A short walk under-samples rare hazards.** A destructive control with no
confirmation that I simply never went near produces no receipt, and honest
application forbids me to file it. In an application where data loss is the
top-severity class, a triage rule that structurally cannot file an un-encountered
hazard is losing exactly the wrong findings. My answer is not to loosen the
test but to route those elsewhere — see §5's separate class — because letting
inspection-based claims into the walk's ledger would reopen the hypothetical
channel the test exists to close.

**The receipt is self-reported by an interested party.** I both incur the cost
and score it. "I had to hunt for that" can be manufactured for any control I
happen to dislike. The observable-event rule is the guard, and it is a real one,
but it is a discipline rather than a mechanism, and nobody is auditing me.

**First-impression defects are binned, possibly wrongly.** A setup screen that
reads as unfinished costs no action and files nothing, yet it is plausibly the
single thing that decides whether a new user continues. The test has no opinion
on trust, only on cost, and for the first ninety seconds of a tool's life those
are different quantities.

## 5. How a verdict should be reported

A bare yes is not reportable. Every filed finding must carry, beside the verdict:

- **The receipt, verbatim** — what I did, at which control, and what it cost, in
  terms someone watching could have confirmed. This is the whole value: when my
  judgement is later doubted, the receipt is what survives the doubt.
- **Incurred or near-miss.** These are different evidentiary strengths and the
  reader must be able to discount the second class separately. A near-miss must
  also say what stopped me, since that is the thing a fix has to replace.
- **Whether I already knew the answer from source.** A receipt produced by a
  reviewer who has read the implementation systematically under-reports; if I
  did *not* have to look something up only because I had read the code that
  morning, the reader needs to know the cost figure is a floor and not a
  measurement.
- **The count, when the receipt is repetition.** "Costs an extra click" and
  "costs an extra click four hundred times" are different findings and the
  number is the finding.

Two reporting rules beyond the individual finding:

**Hazards found by inspection go in a separate list, never in the walk's
ledger.** Things I can see the code permits but did not encounter are worth
writing down and are not walk findings; mixing them in would let the
walk's authority attach to claims that have none.

**Count the binned observations; do not discard them silently.** "Forty-one
observations, nine filed" is itself a datum. It lets someone ask whether the
test is set too strict without having to take my word for how much I threw away,
and a bin count that collapses to zero is evidence the reviewer has stopped
applying the test at all.

## 6. Alternatives considered and rejected

1. **"Would a novice be confused by this?"** — Rejected as the primary laundering
   channel for preference. It is unbounded (some user can be posited to be
   confused by anything), unfalsifiable, and it is adjudicated by the person
   whose taste is on trial. Every other candidate I wrote was, in part, an
   attempt to escape this one.
2. **"Does it violate an established convention or platform guideline?"** —
   Rejected. It converts the review into a citation contest, and Aurora is a
   niche expert tool that is deliberately not the tool the convention came from.
   Worse, appealing to convention is itself a taste position wearing an
   authority costume — it feels objective precisely because someone else made
   the aesthetic choice for you.
3. **"Did the interface tell me something false, or withhold something true I
   needed at that moment?"** — The strongest loser, and it nearly won. It is a
   very good fit for an authoring tool, where the screen is the user's only
   access to their own data. It lost on coverage: it says nothing about
   repetition cost, latency, precision, or a feature I never found, and those
   are real defects here. And the receipt test already admits every lie a
   reviewer could actually *observe* — a lie I acted on is "false belief I acted
   on", a lie I caught is a near-miss, and a lie I never noticed produces no
   observation for any triage rule to sort. So the truth test is close to a
   subset of this one on the observations that exist, while being strictly
   narrower on the ones it misses.
4. **"Is it reproducible?"** — Rejected as a triage rule: reproducibility is a
   property of evidence, not of importance, and a reliably reproducible ugly
   colour is still taste. Kept, in weakened form, as a reporting requirement in
   §5.
5. **"Would someone whose taste is the opposite of mine still be hurt by this?"**
   — Good intent: it factors my preference out by construction. Rejected because
   it is still a hypothetical adjudicated by me, and I will rationalise it in
   whichever direction I already lean. Retained informally as a tiebreaker when a
   receipt is thin.
6. **"Is the cost to users greater than the cost of the fix?"** — Rejected as a
   category error. That is prioritisation, and folding it into triage lets an
   expensive fix retroactively erase a real defect. Decide what is true first;
   decide what is worth doing second, with the engineer in the room.
7. **"Did it stop me from completing the task?"** — Rejected as far too strict.
   In a creative tool there is nearly always a workaround, so almost nothing is a
   hard blocker, and a blocker test would file three findings and miss the entire
   body of work-destroying defects that are merely survivable.
