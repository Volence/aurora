# UX seat A — my own quality test (written cold)

Written before the walk, without reading any existing version of this question.
Grounding was the application source only (`src/renderer/`): the tab shell and
close guard, the level workspace and its facets (layout / collision / objects /
rings / palette / art / effects), the tool docks and their label tables, the
history hub, the build panel and toasts. No `docs/` file was opened.

---

## 1. The question

> **If I had liked the way this looks, would it still have cost me time, certainty about my own work, or the work itself?**

Yes → finding. No → taste; drop it.

---

## 2. Why this question and not another

Three premises produced it.

**The scarce resource in this application is not clicks, it is confidence.**
Aurora edits things whose ground truth is invisible: a chunk id, a collision
byte, a band phase, a tile that will or will not be in VRAM when the ROM runs.
The person cannot look at the thing they are actually authoring; they can only
look at Aurora's account of it. Sessions are long and the work is creative,
which means a mistaken belief is not caught in the next second — it is caught an
hour later, after everything downstream of it was built on top. So any test
whose currency is only *time* or only *breakage* will miss this tool's dominant
harm, which is a person confidently continuing to work on a false picture. That
is why "certainty about my own work" sits in the sentence next to time and to
the work itself, and is not a softer sibling of them.

**Taste has a signature: it disappears when you change the observer; cost does
not.** That is the whole discriminator, and it is why the counterfactual in the
question is about *my preferences* rather than about the design. If I imagine
the version of me who is delighted by this panel, this density, this colour, and
the problem evaporates, then the problem was me. If the delighted version of me
still mis-clicks, still cannot tell whether the save landed, still collapses the
inspector for the thirtieth time — the problem is in the tool and my opinion of
it was never load-bearing. This also disciplines *how the observation gets
written*: to run the test at all I have to restate the observation as something
that happened to a person, not as an adjective about pixels. Half the taste in a
review list dies at that restatement, before the test even returns a verdict.

**The list is trusted or ignored on the basis of its worst item.** A walk that
files fifteen real findings and three preferences reads, to the person who has
to act on it, as a list of eighteen opinions — and the cheapest way for them to
handle it is to discount all eighteen. So the asymmetry is deliberate: a false
positive costs more than a false negative, because there will be more walks and
there is only one reputation for the list. I would rather lose a real finding
this round than spend the list's credibility on a preference. That choice has a
price, and §4 and §5 are where I pay it honestly rather than by quietly relaxing
the test.

The past tense is load-bearing. "Would it still **have** cost me" presumes it
already cost me — that I hit it, in the session, doing the work. An observation I
formed by reading the source, or by imagining a hypothetical novice, has not yet
been paid and does not pass on my say-so. §5 says what to do with those instead
of smuggling them in.

---

## 3. What it admits and what it excludes

### Binned as taste (and someone will argue)

- **"The effects facet is split into sub-tabs (scene / bands / raster) rather
  than one scrolling column — I want to see all of it at once."** If I liked the
  sub-tabs, nothing remains: each control was where its tab said it would be and
  I found each one first try. The argument against me is "but you have to click
  to see them all" — which is a cost only if I actually needed two of them
  simultaneously and paid for the back-and-forth. If I did, then *that specific
  round trip* is the finding, and the layout preference still isn't.
- **"Document tabs are text-only; colour-coding by document type would let me
  hit the right one faster."** If I liked the plain strip, would I still have
  paid? Only if I actually hit the wrong tab — and I read them correctly every
  time. "Colour speeds recognition" is a true general principle being used to
  launder a preference: it names a benefit I did not fail to receive.
- **The shadow of both:** each of these has a twin that *is* admitted. The test
  does not discriminate by topic — layout and colour are not off-limits — it
  discriminates by whether a cost survives my approval. Same subject, opposite
  verdict, and that is the test working rather than the test being inconsistent.

### Admitted as findings that a laxer test drops

- **A cosmetic-looking thing that cost certainty and then cost work.** The
  collision overlay and the tile grid are drawn over the same map at similar
  line weights; at one zoom level I painted a run of cells believing I was on
  the collision layer when the active tool was still a tile brush. A "is this
  just visual?" test drops this at the word *weight*. Mine admits it: a person
  who admires the overlay's styling still forms the same wrong belief, and still
  has a run of edits to undo — if they notice. All three currencies at once.
- **Pure friction with no bug in it.** Reaching a usable map width means
  collapsing the object inspector, and the inspector comes back on the next
  document — so the collapse is paid again, and again, tens of times across a
  session. Nothing is broken; every individual click is instant; a person who
  loves the layout still pays every one of them. A "did anything go wrong?" test
  files nothing here, and this is exactly the failure mode of long creative
  sessions: not the wall, the tax.
- **Silence where an answer was needed.** After saving, the dirty marker clears —
  but if the build I then run consumes bytes written by a different path, the
  interface has told me the document is clean without telling me what is on
  disk for the build to read. Nothing visibly failed, so a bug-shaped test drops
  it; my test admits it because the question I needed answered ("is what I am
  about to build the thing I just made?") was not answerable from the screen,
  and liking the marker does not make it answerable.
- **Styling that is actually state.** A control rendered at a contrast that
  reads as available when it is disabled: I click it, nothing happens, I click
  again, and only on the third try do I conclude *disabled* rather than
  *unresponsive*. Filed as a styling nit by a lax test; here it is a wrong
  belief plus a measurable delay, and the enthusiast for that palette pays both.

---

## 4. Where it is weakest

This is the section I most want read.

- **It systematically under-reports harm to people who are not me.** The test's
  anchor is a cost *I* paid, and I am one observer with one set of eyes, one
  screen, one level of prior familiarity. It will bin a genuine contrast or
  colour-distinguishability failure that I personally could read; it will bin a
  target too small for a shaky hand because mine is steady; and it can register
  first-run confusion only if the walk is genuinely my first run, which is true
  at most once. This is the test's worst failure and it is structural — I cannot
  fix it by being more careful. The mitigation belongs in the report shape (§5),
  as a labelled second channel, not in the test, because loosening the test to
  admit imagined users destroys precisely the property that makes it useful.
- **The counterfactual can be run in bad faith, and it fails hardest exactly
  where I need it most.** Nothing checks my claim that "even someone who liked
  it would still have suffered." On the observations I feel mildly about I will
  run the counterfactual honestly; on the one I feel strongly about — the one
  where I actually want a check — I will find the enthusiast suffering too. A
  test whose reliability is inversely proportional to how much I care about the
  answer is a weak test, and I do not know how to close this from inside it.
- **"Time" will swallow everything if it has no floor.** Every interaction costs
  some time, so any observation can be dressed as a time cost and taste walks
  back in through the widest of the three doors. The floor I will hold myself to:
  the cost has to be one I *noticed while paying it*, or one repeated often
  enough that I noticed the repetition. If I only discovered the cost by counting
  it afterwards to justify filing, it does not pass.
- **Findings that live only in the aggregate have no moment, so they get binned
  or distorted.** "Dirtiness is communicated in four different places and no two
  agree" costs nothing identifiable at any single instant; the test demands a
  moment, so I either drop a real structural problem or I file one arbitrary
  instance of it, which undersells it as a nit. I do not have a clean answer
  here; the least-bad move is to file the instance and say in the finding that
  the instance is a sample of a pattern.
- **I am an agent, and my costs are not a person's costs.** When the interface
  fails to answer a question, I can read the source and answer it myself in
  seconds — so my "certainty" cost is systematically lower than a human's, and I
  will under-file the exact category I argued in §2 is this tool's dominant harm.
  The discipline: *I figured it out* is not *it was findable*, and if the answer
  came from anywhere but the screen, the cost was paid.

---

## 5. How a verdict should be reported

A bare yes/no is not enough, because the yes/no is the *conclusion* and every
part of the reasoning that a reader would need to overturn it lives outside the
bit. Each admitted observation should carry, beside the verdict:

1. **The moment.** What I was trying to do, and where in it this happened. This
   is the evidence for the past tense, and without it "it cost me time" is
   unfalsifiable. It is also the single most useful thing for whoever fixes it.
2. **Which currency, and roughly how much.** Time, certainty, or work — named
   explicitly, not left for the reader to infer. Magnitude in the crudest honest
   unit: a second, a minute, one edit run, thirty repetitions. This is what lets
   someone rank the list without re-walking the app, and it exposes a weak
   finding to challenge instead of hiding it behind a pass.
3. **Paid or predicted.** *Paid* = it happened to me in the session. *Predicted*
   = I believe someone would pay it but I did not. Predicted items still get
   filed — this is the channel that catches the §4 blind spot about users unlike
   me — but they are labelled, sorted below, and never counted as the same kind
   of evidence. An unlabelled prediction sitting among paid findings is the
   specific thing that makes a list stop being believed.
4. **The remedy, if I have one, marked separately as mine.** The finding is the
   cost; the fix direction is usually preference. Bundling them lets taste back
   in through the tail of a legitimate finding — "the tab strip gave me no way to
   tell which document was dirty, *so put a coloured dot on the left*" is one
   fact and one opinion sharing a sentence, and the opinion inherits the fact's
   authority. Separate lines, and the reader may take the first without the
   second.

Binned observations should be counted but not listed — "eleven observations
binned as taste" tells the reader the filter ran and roughly how hard, without
spending the list on the things it decided not to say.

---

## 6. Alternatives considered and rejected

- **"Is this a bug or a preference?"** — Rejected: it draws the line at code
  correctness, and the largest class of harm in this tool is code behaving
  exactly as written while the person cannot tell what state their work is in.
  It bins the save-silence case and every other correct-but-unknowable one, which
  is most of what I expect to find.
- **"Would most users agree with me?"** — Rejected: unfalsifiable in a
  one-person walk. It converts every observation into a poll whose results I
  invent, and I would invent them agreeing with me. It has the shape of rigour
  and none of the substance.
- **"Does the application contradict itself here?"** — Rejected as the *primary*
  test, though it stays as an evidence source. It makes consistency the
  definition of quality: it admits harmless internal disagreements nobody would
  ever notice, and it passes a tool that is uniformly, consistently bad. A tool
  that is silent about saving *everywhere* is perfectly consistent.
- **"Can I name a usability heuristic it violates?"** — Rejected, and it is the
  most dangerous of the rejects. Almost any observation can be attached to
  "visibility of system status" or "consistency and standards" after the fact, so
  the test admits everything while looking methodical. That is worse than having
  no test, because it launders taste as method and makes the laundering hard to
  challenge.
- **"Would the exact opposite choice have drawn the same complaint from an
  equally reasonable reviewer?"** — The closest runner-up, and genuinely good:
  it correctly bins palette-on-the-left, and it forces consistency findings to be
  stated as *these two disagree* rather than *move this one*. Rejected as primary
  because it is silent on magnitude — a 6px/8px gap mismatch is not reversible and
  not worth anyone's time, and this test admits it. I kept its working half by
  making the counterfactual run over *my own preferences* rather than over the
  design's mirror image, which preserves the discrimination and adds the cost
  requirement it lacked.
- **"Did it stop me from completing the task?"** — Rejected as far too strict.
  Almost nothing stops a determined user, so this files nearly empty; and a tool
  that never blocks you while taxing you continuously is the actual failure mode
  of long creative sessions, which this test is blind to by construction.
