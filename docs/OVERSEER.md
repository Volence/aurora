# Aurora Overseer

**Boot prompt** (paste into a fresh session started in this repo):

> You're the overseer for this repo. Read `docs/OVERSEER.md` first, then
> `../empyrean/docs/OVERSEER-PROTOCOL.md`. Work the queue. Peers may or may not be
> running — check `ListAgents`; coordinate if present, proceed solo if not.

The role, delegation discipline, review bars, and peer protocol live in the shared
protocol doc. This file is what's Aurora-specific.

## ⚠ Read the shared protocol at a COMMITTED REVISION, not through the path

*(Added 2026-08-22. This is the shared protocol's own most-upstream rule — empyrean
`baf15c28`, Boot section — recorded here because the boot sequence that would tell you
about it is the one thing that happens before you have read it.)*

```sh
git -C ../empyrean fetch -q origin && \
git -C ../empyrean show origin/main:docs/OVERSEER-PROTOCOL.md
```

`../empyrean/docs/OVERSEER-PROTOCOL.md` is **the empyrean lane's live working tree.** On
this machine every sibling repo is some peer's working directory, so reading the suite's
shared contract by path delivers it out of somebody's uncommitted edits, once per session,
as step two of boot. Boot while that lane is mid-edit and you reason from half-written
rules all session, dispatch agents under them, and bank them as contract — and **nothing
ever looks wrong**, because correct citation discipline applied to a bad source produces a
*more* convincing artifact, not a less convincing one. You go on to cite those rules
accurately and hand peers perfectly-formed anchors to rules that never existed.

Two boundaries, not glossed: `origin/main` can lag legitimately-pushed work, so this trades
an **invisible failure for a visible lag** — the right trade, but a real one. And it is the
*recovery* direction, so it takes freshly-fetched tip and **never** a pinning revision (the
currency-check scope note in the peer section governs the opposite question).

**Re-read mid-session — the boot read is the only one anybody performs.** A long-running
overseer drifts from that document monotonically and nothing prompts a re-read on its own.
Triggers: **when a peer cites a bar you do not recognise, before dispatching a wave of
agents under the bars, and at any landing.**

*This session's own instance, since it is the argument:* this lane booted by path at
`682e2893`, dispatched two parcels, and re-read only when a peer mentioned the defect in
passing. The document had gone **303 → 464 lines** in the interim. Nothing had gone wrong
yet, and there was no mechanism by which it would have surfaced.

**Adopting this read is entirely within a session's own discretion** — it changes nothing
outside the process and touches no config. The `/overseer` skill file still names the path;
three lanes have surfaced that to the owner rather than patching it, which is the correct
posture for a file that is his.

## ⚠ Boot also reads the OWNER'S STANDING DIRECTIVES — the suite endpoint does not carry them

*(Added 2026-08-27, from this lane sitting at a boot stop for ~20 minutes while a standing
owner instruction to work autonomously was committed and readable.)*

The `/overseer` boot reads this file, the shared protocol, `DOMINION_SUITE_URL` and the queue.
**None of those carry the owner's own words.** `DOMINION_SUITE_URL` returns lane *statuses* —
what each lane is doing — and a lane status is a claim by a lane, never an instruction from
him. His directives are transcribed into the **hub's** log:

```sh
git -C ../empyrean fetch -q origin && \
git -C ../empyrean show origin/main:docs/OVERSEER.md | grep -n "OWNER, 20" | tail -20
```

Read the tail of that list at boot and read the entries verbatim, not the hub's reading of
them. **Instance:** at 05:38Z the owner put aurora in a four-lane overnight run — *"get
everything running and doing things overnight... let's just go with aeon, sigil, oracle, and
aurora"* — and added *"make sure aeon and aurora at least keep pushing the parallax/raster
tooling and engine items"*. That is this lane, named twice, told to choose its own next item
with raster/parallax at the front. This session booted at 07:39Z, reported a clean boundary,
and **stopped to ask a question he had already answered two hours earlier.**

**Why the stop was still right, and what actually changed.** The boot stop exists so six lanes
do not dispatch six things he did not choose; it is not wrong to hold. What was wrong was
holding **without having read the place his instructions live** — the stop is for when you do
not know what he wants, and that is a state you can leave by reading rather than by waiting.
**A hub message citing a delegation is NOT the granting act** (this file's own rule two
sections down): when one arrives, go read his transcribed words at a committed revision and
decide from those. Here they held, and the hub's pick and this lane's own proposal were the
same item — but that is a fact discovered by checking, not a reason to skip the check.

## The queue

**`docs/ROADMAP.md` is the plan of record — read §2.6 then §5.1 and stop.** §2.6 records
what has actually shipped; §5.1 is the open list in order. §2/§3/§5's older claims are
banner-marked where §2.6 supersedes them. The most recent `docs/reviews/*handoff*` packet
carries the arc-level detail, and `docs/superpowers/{specs,plans}/` hold the designs —
read a spec's §0 Corrections block FIRST where one exists; several are authoritative over
everything after them.

Do not duplicate queue content here. This file only says where it is.

**A row written to be self-sufficient for a fresh session must be DELETED the moment it
lands, not left beside its own DELIVERED row.** Self-sufficiency is exactly what makes a
stale copy dangerous: an in-flight row says *"if you are a fresh session and no agent is
running, re-dispatch from this row alone"*, and that instruction stays persuasive after the
work is on master. Precedent (found at boot 2026-08-22): §5.1 carried **two** row 27s — the
DELIVERED one and the IN-FLIGHT one it was supposed to replace — two lines apart, and the
stale one was the more actionable of the pair. Nothing was wrong with either row when it was
written. The landing step that closes an item is *replace the row*, never *add the outcome
beside it*.

## Owner state — never record an approval whose granting act you have not seen

*(Added 2026-08-22, raised by the empyrean lane after two lanes hit it the same day by
different mechanisms; audited here and Aurora had two instances.)*

**Aurora has no Log. The queue ROW is the log**, which changes the failure's shape rather
than sparing this repo: elsewhere the defect is an owner ruling landing in a Log's middle
where head-and-tail boot reading never looks; here a row accretes its whole history in one
line, so a **stale label at the FRONT of the row survives every later correction appended
to its back.** The front is what a scanning session reads.

Both instances found in one audit:

- **Item 14 said PARKED FOR THE OWNER and was closed by a dispatched decision agent.** The
  outcome was defensible — facts re-verified firsthand, then discharged in code across the
  fence at aeon `bd31e133` — but the label claimed an authority the closure never had, and
  the half that genuinely was the owner's had been reserved by the ruling and left open.
  **A decision ratified by implementation is stronger than one asserted, and still is not
  an approval.**
- **Item 19 recorded "the owner ran the harness and confirmed it"** — reported by the
  session that wrote the sentence, leaving no repo artifact, unverifiable by any later
  session. Left in place and flagged rather than deleted or re-asserted, because the row's
  authority is its measurements, which are in-repo and were re-run.

The discipline: **before putting a question to the owner OR funding work off a settled
one, grep the item for what actually closed it, and name the granting act.** When an
overseer or an agent settles something that was parked for the owner, say so in the row —
in the same breath as the outcome, not appended below it. And when a claimed owner act
leaves no artifact, mark it unverifiable rather than laundering it into fact by repetition;
the cheap fix is to ask, because the owner is usually one sentence away.

### ⚠ THE HUB IS NOT `empyrean-ba` — address `[66e6e3]`; and the ruling behind that is CITED, NOT WITNESSED

*(2026-08-29, found by this lane. Two claims here, deliberately separated, because one is verified
and the other is not and they have different consequences.)*

**VERIFIED, and it is the one that governs your sends.** `empyrean-ba` — the session `ListAgents`
names for the empyrean repo — **swallows lane traffic**. Three reports from this lane (the O25
landing, the silent-PASSED finding, the relative-hop lesson) were each accepted by `SendMessage`
and then **held pending its user's approval, undelivered**. Nothing announced this; the sends all
returned success. Meanwhile the actual hub work IS being done and pushed: `6e296ed` (02:07Z)
through `faf9658` (12:09Z), **67 commits**, all `overseer:`-prefixed, all ancestors of empyrean
`origin/main`, timestamps converting exactly from EDT. **So send hub traffic to the session whose
display name is `Aether setup in Aurora [66e6e3]`** — a stale pre-`/clear` session title, not a
description. Its lane name is empyrean.

**THE RULING — was cited-only for about an hour, IS NOW TRANSCRIBED. Read this whole
paragraph; the first half is stale on purpose.** When this entry was first written, the quoted
words *"1. I think so"* appeared **nowhere** in empyrean `origin/main:docs/OVERSEER.md`, and the
entry recording the episode asserted the stand-down rather than transcribing him. Raised with the
hub; **they had the words and had never written them down, and they landed a late transcription
the same hour** (empyrean `origin/main`, entry dated 12:12:45Z, verified here).

**What he actually said, verbatim, and it is worth reading rather than summarising:** asked
*"The duplicate hub. `empyrean-ba` (the 7h-old dock) is still up and busy; this one is a fresh fork
Dominion started a minute ago. Which one do you want, or should I message it to stand down?"*, he
answered *"1. I think so, I haven't beeen working on something for 7 hours. 2. I don't know what
these are, can you tell me and what the 'ruling' was?"*

**So it is a real answer with his own reason attached, and it is HEDGED.** Note what part 2 shows:
he answered the duplicate-hub question — which he plainly understood, a session he had not touched
in seven hours — while saying outright that he did not know what the *other* items were. **Whether
"I think so" is a ruling or an inclination is his to confirm on waking**, and the exact time was
never captured (between 01:34Z and 02:07Z).

**The durable lesson, which outlives whichever way he settles it:** the gap was real, and the split
was right. In a file where every other owner directive is quoted verbatim, the one establishing who
directs six lanes was paraphrased — and nothing about it looked wrong. Sibling of the hub's Q-39:
**an assertion and a transcription are indistinguishable once both are prose.** The remedy that
worked was not doubting anyone; it was asking for the quote.

**And the reason to keep the two halves apart even now: the addressing decision never depended on
the ruling.** Which session does the work and which can receive are both measurable, and both were
measured. The ruling would only matter to someone acting **against** `empyrean-ba`'s standing —
his call, not a lane's.

### Push authorization — **CONFIRMED BY THE OWNER DIRECTLY 2026-08-24. The relay question is CLOSED; do not re-ask.**

He answered this lane's `d-2` in session on 2026-08-24 and chose **grant**: publish this repo's own master without asking
each time. That is the granting act this section's own rule demanded, witnessed by the session that recorded it, and it
discharges the relayed-only status below. **The conditions below still ride with it and are part of the grant.** First
exercise the same day: `58ff2ae..2448969`, seven commits, with `git ls-remote` confirming the remote actually moved rather
than reading the push's own output as proof.

**The scope paragraph below remains exactly as true as it was:** this authorizes *pushing*, not the work being pushed. It
does not release the boot stop. A lane holding for his word on WHAT to do is still holding. (Item 35 was released
separately, as `d-3`, in the same session — two answers, not one.)

The original relayed-status text is kept below unedited, because it is the record of what was believed before he answered
and it is the worked example this section teaches from.

#### Original entry — RELAYED 2026-08-23, superseded above

**The grant, as received:** standing approval to push **this repo's own master** without
asking each time. Conditions ride with it and are part of it, not gloss: **verify `origin`
actually moved** (the push is not the act, the remote moving is); **never rewrite
already-pushed history**; **never push another lane's repo**; **publication to the public
wiki site stays a separate explicit ask.**

**Scope, stated because this is the class of grant that gets restated wider:** it authorizes
**pushing, not the work being pushed.** It does not release the boot stop and it is not
approval to dispatch, to land a parcel, or to start a queue item. A lane still holding for
his word on WHAT to do is still holding.

**⚠ EPISTEMIC STATUS, per this section's own rule — read this before citing the grant.**
The ruling reached Aurora **relayed by the empyrean lane**, banked at empyrean `2bd72a03`
(verified firsthand here: reachable from their `origin/main`, `docs/OVERSEER.md` +23, and its
text **names the granting act** — he was asked directly as a consolidated suite-wide question
and chose this option over "standing for docs, ask for code" and "per-push"). That is
genuinely better than the usual relay, and it is still **an artifact of the RELAY, not of the
granting act.** This session did not witness him rule it. **So: verified as far as it goes,
and marked as relayed rather than laundered into "the owner told Aurora".** The cheap fix is
this section's own — ask, because he is usually one sentence away — and it was taken: the
confirmation was put to him in the same turn this was written. **If a later session finds his
answer recorded nowhere, treat the grant as relayed-only and ask again rather than citing
this row as the approval.**


## What the overseer implements

Aurora is a TypeScript/Electron app: features, tests and harnesses all go to agents in
worktrees. The overseer's own work is judging returned work, running the **foreground**
runtime harnesses (below — agents cannot), rulings, and landing.

## Aurora-specific review bars (beyond the protocol's)

Each has caught a real defect here.

1. **The node suite cannot see React, canvas, or a running app.** ~3,400 vitest tests
   pass while a feature is visibly broken. Anything whose behaviour is a rendered
   surface, a mouse gesture, an IPC round trip or a live emulator needs a
   `scratchpad/*-harness.mjs` driving the real app under CDP. Three defects in ten
   minutes of real use is the observed rate for UI shipped on unit tests alone.
2. **Plant a violation before believing any guard.** Guards that assert nothing are the
   dominant defect class in this repo. Red-first, restored, with the failing assertion
   quoted — and `grep` the call site first: a defect planted in the wrong function
   (there are usually two near-identical dispatch lines) survives a full build-and-run
   cycle looking convincing.
2b. **A guard can be aimed at the WRONG OBSERVABLE, and planting a violation does not test that.** Bar 2 asks whether a guard fires; it does not ask whether the guard is watching the right quantity. Both can be wrong at once, and then the plant reports green and reads as coverage. Precedent (2026-08-22, `section-column-harness.mjs`, ROADMAP row 19): `c1` — "no section paints over the one below it" — compared **border-box** positions (`a.section.bottom > b.section.top`). The defect it existed for, the 954px effects-panel shape, paints a section's *children* below its own box **while the box stays exactly where flexbox put it**. So no box-geometry assertion could ever detect it; the row was **non-functional**, not merely non-discriminating, and it had shipped with a §7 note disclosing only the weaker property. It took running the poison — which independently turned out to disarm its own judge, reporting 65/65 green — to surface it. **Two questions, asked separately: does the guard fire when the property is violated, and is the guard measuring the quantity the property is about?** The second is the one that looks already-answered. Corollary from the repair: when widening an observable, bound it — `contentBottom` walks descendants for the lowest painted pixel but **stops at any clipping box**, because descending into an `overflow: auto` list would red-flag every capped list in the app. The opposite false verdict, equally useless.

2c. **A uniqueness grep over the SOURCE does not make an assertion's MATCHER unique.** Bar 2 says grep the call site before planting. That protects against two call sites sharing a line; it does nothing about **two different errors sharing a phrase**, and the second is subtler because no grep over the code under test would ever surface it. Precedent (2026-08-22, band promotion, ROADMAP item 27): a red-first plant on *"refuses a range that reaches past the end of the blob"* came back **GREEN with its guard deleted** — the row matched `/has only \\d+ tiles/`, and the **codec's own prefix check** says *"the static tile blob has only N tiles"*. The row had been passing by catching an unrelated rule's error the whole time. Re-cut against the guard's own words plus a boundary row, it fails correctly. **When a poison comes back green, the first suspect is the assertion's matcher, not the guard** — and a matcher loose enough to catch a neighbouring error is a row that will report coverage it does not have, forever, in a suite that looks green.

2d. **RED-FIRST IS NECESSARY AND NOT SUFFICIENT — a poison that comes back GREEN has THREE
   distinct causes, and only one of them is a bad guard.** *(Added 2026-08-22 from the
   `fix/aether-unserved-methods` parcel, where 27 plants went red and **three** of the
   parcel's own new rows went green; refined with the oracle lane, who took it as a bar and
   relayed it live to an agent mid-parcel.)* Bars 2b and 2c are two of these; this row names
   the set so the diagnosis does not stop at the first one that fits.
   - **(i) The matcher is too loose** — bar 2c. One code path, but the assertion's wording
     also matches a *different rule's* error. The observable is unique to the rule; the
     assertion is not. **Fix: re-point at wording only this rule uses.**
   - **(ii) Two independent code paths produce ONE observable** *(oracle's formulation, and
     the distinction is theirs — accepted here)*. Deleting the guard under test leaves the
     **other path** holding the row green. Same symptom as (i), different cause, and the
     matcher bar sends you hunting a matcher that is fine. Instance: a row proving only
     *"it refused"*, satisfied by **both** the advertised-list pre-check and the `-32601`
     reply. **Fix: assert WHICH path ran** — that row now checks whether `emulator/status`
     was called at all.
   - **(iii) The row is measuring the WRONG QUANTITY** — bar 2b. Instance: the fixture left
     `Player_1` resolvable, so the catch the row was named after was **never entered**; it
     was measuring a different gate. **Planting a violation cannot reveal this**, because the
     row never touches the subject.
     **THE REMEDY, added 2026-08-29 from a second instance** *(found by the collision-read
     agent in its OWN harness and reported against my brief rather than quietly fixed —
     banked in its name)*: **a row must PRINT the artifact it judges, or its aim cannot be
     checked by anyone, ever.** `[a1b]` asserted "this ascii window is not all air" over a
     window that WAS entirely air: it stripped row labels with `.slice(1)` +
     `replace(/^\s*\d+ /)`, which leaves the **ones-ruler** intact, and the ruler's own
     digits satisfied *"some character is not `.`"*. It was caught by a human reading the
     printed grid and seeing it empty. The repair is the shape to copy — assert the shape by
     POSITION (the last `h` lines), count the content off the JSON not the picture, and
     cross-check that the two agree: **three rows where there was one, because "the picture is
     right" and "the picture is about the right thing" are different claims.** Corollary: a
     fixture window is **found by scanning**, never assumed — section 0's corner is genuinely
     empty, which is why this survived review.
   **The tell that separates (i) from (ii), which is the pair that gets confused:** ask
   whether the observable is unique to the rule. If it is, the assertion is too loose — (i).
   If it is not — if something else in the system can produce it — the assertion may be
   perfectly precise and still worthless — (ii).
   **Operational form** *(oracle's, and better than asking "did it fire")*: **"if this row
   went green for a reason OTHER than the rule holding, what would that reason be?"** Then
   check that specific reason, and **report the alternative green-path you ruled out** —
   naming what you eliminated is the part that survives review.

2e. **THE UNIFYING FORM FOR 2b-2d, and the three instances are all this lane's.** *(The
   class and its formulation are the empyrean hub's, ledgered by them as Q-20, a
   PROMOTION CANDIDATE — not yet in the shared protocol. Recorded here as theirs, with
   our local precedents, and it should be re-read as protocol if it ever lands there.)*
   **A check can be correctly performed, pass honestly, and assert nothing.** That is not
   a broken check — a broken check fails and gets noticed. It is a correct check aimed one
   step to the side, and its distinguishing property is that **it can only ever return
   green**, so running it produces no evidence at any volume.
   The three instances, all found here, all in different surfaces:
   - **A pinned blob answering a currency question.** A pinned blob equals itself by
     construction, so the gate passes forever and can never detect the drift it exists
     for (the schema-reconciliation scope note under bar 16).
   - **`[ -S "$socket" ]` as a liveness probe.** The inode outlives the process, so it
     reports a corpse as a server — item 36's own measurement, made by a probe written in
     this lane in the session that was checking somebody else's liveness claim.
   - **`min`/`max` on an `<input type="number">` as a bound.** They govern the spinner and
     `:invalid` and stop no typed value; `clampVFactor()` beside them does the actual work
     (item 37).
   **The mechanism, which is why this is a class and not three tips: the vacuous check is
   always EASIER TO WRITE AND EASIER TO READ than the real one, and resembles it closely
   enough that a reviewer's eye stops.** `[ -S ]` is shorter than `ss -lx`. A blob pin is
   local and deterministic where currency needs the remote. `min={0} max={15}` is inline
   at the call site where a clamp lives in another file. **The costume is always
   convenience** — so the suspicion belongs on the check that was pleasant to write.
   **FOURTH INSTANCE, 2026-08-24, MINE — produced hours after banking this class, against
   myself, while arguing about someone else's bug.** Diagnosing a ROM section collision I
   took the span from BUILD output (`ojz_bg_anim [0x3b270, 0x3d29e)`) and grepped the GOLDEN
   boundary table for bases inside it. **Zero hits**, which I reported as *"the damage is
   local to that seam"* and used to withdraw a correct prediction. The golden table has **no
   labels anywhere in `0x38000..0x40000`** — 80 sparse head-labels across a ~668 KB ROM, with
   `BgAnim_Table` at `0x27e70`, nowhere near the span. **The query could return only one
   answer whatever the truth was.** The right observable was the ordering: `BgAnim_Table` is
   label 65 of 80, so **15 labels follow it**, and that set is what "does it cascade" means.
   **The verdict was not weakly supported, it was UNSUPPORTED — and it read as a measurement
   because it had a number attached.** That sentence is the class in one line; keep it.
   ⚠ **And the companion failure, the hub's, which is the same disease with the symptom
   inverted:** their corroborating count used a wrong population (lines, not labels) AND a
   wrong sort (hex as strings) and **still produced the correct 15, by cancellation** — every
   contaminating row sorted upstream of the label, so the error lived in the prefix and
   vanished in the subtraction. **A right answer from two wrong steps, sitting inside a number
   whose job was to corroborate someone else** — which is the worst possible host, because a
   corroboration is the one claim nobody re-checks once it agrees.
   **Operational form: name the property, then ask what a GREEN result would have ruled
   out. If nothing, the gate is vacuous however correct it is.**
   ⚠ **SHARPER GENERAL FORM, and it is the sigil lane's** *(2026-08-27, given back after
   watching this bar fire on my own hour-old rule — see the assembler-banner entry under
   Quirks)*: **a vacuous check is one whose FAILURE STATE AND SUCCESS STATE EMIT THE SAME
   ARTIFACT.** That is a test you can run on a rule you just wrote, without knowing anything
   about the subject, and it is strictly easier to apply than "what would green have ruled
   out". Instance, mine: a bar reading *"this field is vacuous until sigil fixes it"* is
   itself vacuous, because the field cannot report its own repair — so following the rule
   correctly yields *they never fixed it* whether they did or not. **The place to run this
   check is on your OWN newly-written bars**, which is where nobody runs it; a rule is at its
   most convincing in the hour after you write it. Companion enumeration lesson from the same
   exchange: **enumerate across instances rather than reasoning within one.** One cross-lane
   table of `docs/lane-status.json` produced two live findings pointing OPPOSITE ways — sigil
   reporting dirt that meant nothing, aeon *having* dirt that meant nothing and blaming the
   wrong subsystem for it. Neither lane could see its own from inside its own repo. This subsumes bar 2's
   red-first plant rather than replacing it: a plant answers "does it fire", and this
   answers "could it ever have failed".
   **Note how the third one was found, because it is Q-16's discriminator firing BY
   ACCIDENT for the third time** *(the hub's observation, and it is a warning not a
   compliment)*: I went to read the mechanism bounding the SAFE field expecting to CONFIRM
   it, and found the mechanism was somewhere else entirely. Nobody was auditing the
   enumeration. **A discriminator that only fires by luck is not yet a practice** (bar 21
   in the shared protocol), and this is the instance that proves it still is not one here.

2f. **READ THE ARTIFACT, NOT THE STORY ABOUT IT — it ended THREE disagreements in one day
   where argument ended none** *(2026-08-24, across aurora/aeon/empyrean; the arc-level
   finding of the BgAnim ROM attempt)*. Each time, two lanes reasoned carefully in opposite
   directions and **one file read settled it in a single command**:
   - *Which section was deferred?* Three lanes carried "BgAnim is the deferred one" as a
     **premise nobody ever cited, and therefore nobody ever checked**. `map.toml:73` says the
     order check keys on **head-labels**, and `BgAnim_Table` was in the list all along.
   - *What is the reserved slot for?* The comment names its subject in its **own first line**
     — `ojz_effects_editor_act1`, a different tool's section. Two of us opened that comment at
     the line we had been pointed to and missed the two lines above it.
   - *Does the collision cascade?* Neither lane's argument settled it. `map.toml:166-176`
     declares `[[anchor]] dac_banks at = 0x48000`, **hardware-pinned because the Z80's
     `SetBank` latches the LMA**, so growth is absorbed before it: **five labels shift, not
     fifteen.** Bounded re-derivation, not a full re-baseline.
   **The tell that you are about to need this: everyone agrees on a premise and nobody has
   cited a line for it.** That is not consensus, it is an uncited joint (bar 18b's shared
   frame), and the cheapest possible move is to open the file it lives in.
   **Corollary on counting defects across seats** *(aeon's, and it is right)*: a tally of who
   was wrong most often measures **exposure, not competence** — whoever sends the most
   checkable numbers generates the most caught errors. Reading it the other way punishes
   exactly the behaviour that makes the catching possible.

2g. **A GAP BETWEEN BOUNDARY LABELS IS NEVER EVIDENCE OF FREE SPACE — and a rule that
   forbids a conclusion MUST NAME THE INSTRUMENT that can reach it** *(2026-08-24; my
   formulation, adopted by the aeon lane as a repo bar at their `2625718b`)*. A boundary
   table lists a **subset** of labels, so everything between two listed entries is invisible
   in it **by construction**. Reading a gap as room is therefore not a slip — the instrument
   *cannot* answer occupancy, and it returns a clean confident number anyway.
   **Instance, three lanes, three hours, three revisions of one figure.** A ~119 KB gap
   before a hardware-pinned anchor was reported as slack, and I carried it to the owner
   twice. It is **Sonic**: `AngleTable`, `SolidityTable`, `Map_Sonic`, `DPLC_Sonic`,
   `Art_Sonic`. Measured on the image, 43.8% zero. Real free tail: **11,427 B** — and even
   that sits inside `Art_Sonic`'s allotment, so spending it shrinks what the game's most
   growth-prone art may grow into. **Only the `.lst` or the ROM image can answer this.**
   ⚠ **THE HALF THAT WAS MISSING, and why knowing the rule did not help.** Our booking
   already said *"a gap is an ALLOTMENT, never proven free space"* — and then committed the
   error two paragraphs later on a different label pair. **A prohibition without a named
   instrument leaves everyone holding the only tool they have, and using it correctly, and
   getting the wrong answer politely.** When banking a "do not conclude X from Y", the bar is
   incomplete until it says what DOES conclude X.
   **PROPAGATION COROLLARY — an arithmetic step built on someone else's number looks like
   CORROBORATION and is PROPAGATION.** I took a peer's slack figure and derived a margin from
   it with my own arithmetic. My step was sound, my number was mine, and it read to both of us
   as independent confirmation — while carrying their error intact. **Doing real work on top of
   an unverified input launders it**, and it is *more* convincing than repeating it, because
   the second party visibly computed something. **The check is on the INPUT's provenance, not
   on your own step**: before deriving from a peer's figure, ask which instrument produced it.
   (This is bar 19's echo-versus-corroboration at one remove — the parameters differed, so it
   looked independent; the *source* did not.)

2h. **TRUNCATION LEAVES NO MARK — `head -N` on a definition you then make a COMPLETENESS
   claim about** *(2026-08-24, the aeon lane's, against themselves; banked here because this
   lane reads files this way constantly)*. They claimed "exactly two length-variable fragment
   kinds", having read a 94-line type through `head -40`. There are **three**, plus a fourth
   kind their argument structurally could not reach. The conclusion survived — on a different
   check than the one presented as the rigorous half.
   **Why it belongs beside bar 16(d) rather than inside it.** A suppressed error and an empty
   world produce the same output, which is bad enough; **truncation is worse, because the
   output looks like a COMPLETE ANSWER rather than an empty one.** `2>/dev/null` destroys a
   correcting signal; `head -N` fabricates a plausible whole. There is no exit status to check
   and nothing on screen says "there was more".
   **Operational form: a window is not a document.** Before any claim of the form *"there are
   exactly N"*, *"the only X is"*, or *"nothing else does this"*, **re-read the subject
   unwindowed** — `wc -l` it, or `sed -n` the full range, or grep the whole file — and say
   which you did. Reading a window is fine; **concluding over one is not**, and the tell is
   that the sentence quantifies.

3. **Anti-vacuous rows.** A row that would pass on an empty screen, an unloaded project
   or a blank chunk proves nothing. Assert the instrument saw its subject. A stamp-ghost
   check once "passed" against `OJZ $45`, which is legitimately blank.
4. **Same-destination-two-ways for anything about state.** To ask "did X corrupt this?",
   reach the same state by a path known good and by the path under test, from ONE
   checkpoint, and diff. Then diff the known-good path against ITSELF and require zero,
   or the comparison is measuring nondeterminism.
5. **Report the regime; don't conclude past your evidence.** A row that cannot separate
   two hypotheses must say so in its own text. "Terrain snap falsified" was published
   from six samples that could not distinguish it from an unsimulated player.
6. **A suspiciously clean constant across varied inputs is evidence of a CONFOUND.**
   Two independent probes produced the same stable wrong number from two different
   confounds (unfinished falls; two warps in one boot). Vary what the confound holds
   fixed — fresh boot per sample, settle before reading — before believing it.
7. **Check the SERVER's rule before writing the call.** `require_paused` was missed three
   times in one day by reasoning about what an operation *does* instead of reading
   `oracle-next/crates/oracle-aether/src/engine.rs`. Grep the gate; do not infer it.
8. **Plans state the PROPERTY, never invented fixture numbers.** Nine defects came from
   plans carrying guessed values; the dispatches that stated the property produced zero.

9. *(Now also in the shared protocol, `43fbfc9` — kept here with its local precedent.)*
   **Check the CLASS of every SHA before it hardens into a citation.** A docs-only commit
   cited as the anchor for a code guarantee is invisible once it is in prose, and these
   citations cross repos — two other repos' contract docs pinned Aurora SHAs on
   2026-08-22. `git show --stat` it and cite the **merge** that put the code on master,
   not whatever master happened to be when you typed the message. Both of that night's
   outcomes are the precedent, and the pairing is the point: `945f5c6` (2 insertions,
   `docs/ROADMAP.md` only) went out as the anchor for a 472-line collision-plane fix and
   was wrong — the code anchor was `6fc7359` — while `a88db05`, sent the same casual way
   in the same message, was a genuine merge and held. One miss in two. **The rule polices
   citations, not reputations**: checking is the discipline, and the receiver's `--stat`
   is what caught it in both directions.
9b. **The ROADMAP row is the LAST thing to move on every item, so it is ALWAYS the freshest and best-named commit when you go to cite — and it is never the code.** This is bar 9's failure with its cause identified, and the cause is *this lane's own workflow*, which is why vigilance does not fix it. Precedent (2026-08-22, caught by the aeon overseer): a message whose **entire purpose** was converting paths into citable anchors after a push cited **three** SHAs for code guarantees — `ade34d2` for "the band model + atomic add/remove command", `df32a469` for "promotion/demotion", `d3227c4` for "canonical serialization adopted". `--stat` on all three: **`docs/ROADMAP.md | 2 +-`**, one line each (`df32a469` adds two more in `OVERSEER.md`). Zero code. The real anchors, one commit over: `d20c94d` (band model, 1507 insertions), `55be1d1` + `5e347fe` (promotion/demotion — the lossless claim lives in `55be1d1`), `0376039` + `b8e5ca5` + `f36b3a4` merged at `de04099` (canonical serialization).
   **The mechanism, not a habit:** every item here ends with a `docs(roadmap): item N …` commit, so `git log --oneline` hands you a semantically perfect-sounding line — *"item 27 landed — the last link closed"* — while the code merge sits two commits back with a duller name. **Never pick an anchor off `git log --oneline`. Ask git which commit touched the code**: `git log --format=%H -1 -- <source path>`, then `--stat` it. **If the citation and the `--stat` disagree about what kind of thing it is, the `--stat` wins.**
   **And note what did not catch it:** the reachability check passed. All four SHAs were `--is-ancestor` of the pushed tip and every claim in the message was true. **`--is-ancestor` and `--stat` are different questions, and only the first gets run by habit** — which is why a correct, freshly-verified push message is exactly where this hides.

10. *(Illustration, not a new rule — this is the shared protocol's "derived, never
   copied" bar read correctly; ruled local by the empyrean overseer, `43fbfc9`.)*
   **Derive the expectation from the thing it guards, so the two cannot drift.** The
   collattr length check reads `baseline.length * 2` from the loader's *own* fallback
   rather than pinning 131072, so the check and the fallback are the same figure by
   construction. The cleanest worked example in the repo, and the positive form of bar 8
   above (`fix/collattr-unreadable-guard`, merge `6fc7359`).
11. *(Illustration, not a new rule — the shared protocol's faithful-reporting bar applied
   under pressure; ruled local by the empyrean overseer, `43fbfc9`.)*
   **Never manufacture a stronger-looking assertion than the evidence supports.** When
   the natural assertion is weak, prove the claim another way and *say* that is what you
   did. Even-length collattr truncation is byte-identical through a round trip by
   construction (short in, same short out), so the parcel proved that half through
   loader-accepts-then-save-recertifies instead of inventing a byte delta — and stated
   so in its report. A gate that passes for the wrong reason is worse than no gate — and
   this is bar 5's discipline at the moment it is hardest to hold.

12. **Enumerate by what TOUCHES the data, not by what DEFINES it.** Two overseers
   independently counted the section-sidecar ref sites and both got 8; the real count was
   13. Both passes enumerated the *codec* — parse, serialize, the interface, the header —
   and neither asked **what else copies a `Section`**. `cloneSection`
   (`editing/section-ops.ts`) carried all four scalar refs in a hand-enumerated literal
   with no spread and **no test**: deleting `sceneRef` OR `bgLayoutRef` from it survived a
   3909-test suite, so a copy/paste silently losing a section's background or palette
   assignment was invisible. A second hardcoded enumeration at `save.ts:130` was missed
   the same way. When counting the places a field lives, grep for the TYPE and for every
   constructor/copier of it, not just for the field name in its own module.

13. *(Now shared protocol review bar 9, empyrean `c2c81e2` — kept here with its local
   precedent.)* **Never change the subject to suit the instrument.** Chromium clamps
   `performance.now()` to 100µs, and the only supported way to unclamp it is
   cross-origin isolation — i.e. editing the app's security headers. Taking that would
   have measured a *differently configured application* and reported the number as if it
   described the real one. Rejected; the answer was amortised batching instead (12
   repaints per bracket, 6× finer than the tick). A confound wearing a solution's
   clothes. When the instrument can't reach the subject, change the instrument.
14. *(Now shared protocol review bar 10, empyrean `c2c81e2` — kept here with its local
   precedent.)* **A gate whose VERDICT is right while its stated REASON is fabricated is
   more dangerous than a failing gate** — the reason is what a reader carries forward. The
   MapViewport confound row fired correctly, but its spread formula `(hi-lo)/lo` fell
   through a divide-by-zero branch and announced "medians agree to within 0.00%" about a
   set spanning 0.000→0.800ms. The verdict was sound and the justification was noise.
   Read a firing gate's *message* against its data before quoting it, and when repairing
   one, prefer a formula provably no weaker than the original (`(hi-lo)/hi` is always ≤
   the old ratio, so the bar got stricter, not looser).
15. *(Ruled local — this is the shared protocol's "derived, never copied" bar pointed at
   an instrument rather than an expectation; empyrean `c2c81e2`.)* **Measure the
   instrument's claim; don't assert it.** A resolution fix that says "I
   batched, so it should be finer" is unevidenced. The fix that landed pushes three
   workloads in a **known 1:2:4 ratio, each individually below one clock tick**, through
   the identical machinery and recovers 2.00 / 4.00 with zero residual — and separately
   reads the live clock's actual quantum. Evidenced from both ends. Any harness claiming
   a capability should demonstrate it on inputs whose true answer is known in advance.

16. *(Shared protocol, empyrean `9b604f0` — noted here because Aurora already had the
   instinct.)* **Prefer the committed artifact to the recipe that recreates it.** Before
   running a documented rebuild or recovery recipe, check whether the artifact already
   exists as a committed blob somewhere in the suite, and take the blob — verified by
   hashing the extracted bytes, never by trusting the message that pairs them. A recipe
   carried in prose is a *claim* that it still reproduces the artifact; the blob **is**
   the artifact. Local instance: the effects codec pins empyrean's schema by git **blob**
   hash (`cab3ca58…` today, `2d7a9fee…` before item 35's re-vendor;
   `test/formats/effects-schema-drift.test.ts`) rather than by commit,
   because the doc moved twice with the wire shape byte-identical underneath — a commit
   citation would have read stale twice for nothing. The same reasoning is why the
   three-way reconciliation compares **bytes**, not versions. **And the re-vendor is the
   other half of the lesson: when the pin DOES move, extract the new blob
   (`git -C ../empyrean show <rev>:<path> > <vendored>`) and re-hash it — never hand-edit
   the vendored copy to match a diff you read.**

   **Companion clause** (empyrean `e650b96`): look for the artifact at the revision that
   **pinned** it, not at the tip — a golden path is a moving pointer, and for a vintage
   artifact the tip is the one revision guaranteed not to have it. Check reachability
   (`git merge-base --is-ancestor <rev> <tip>`) before depending on a historical blob.
   *A SHA has a class; a path has a time* — and both failures look like a competent
   lookup returning a clean answer.

   ⚠ **Now the shared protocol's own Scope block** (empyrean `aadf63f`, from this repo's
   correction — the text below is the shared rule, not an Aurora fork of it).
   **Two operations here look identical and are not.**
   Do not "correct" the schema reconciliation ritual to compare at the pinning revision.
   The two are different questions:
   - **"Has the contract moved?"** — the ritual. Compare empyrean **at tip** against the
     vendored copy. Comparing at the pinning revision instead makes it **vacuous**: a
     pinned blob equals itself by construction, so the check would pass forever and
     never once detect the thing it exists to detect (bar 11's gate-that-passes-for-the-
     wrong-reason, in its most convincing costume).
   - **"What exactly did we pin?"** — recovery/inspection. That one goes to the pinning
     revision, and the companion clause governs it.

   The tip is right for the first and wrong for the second. Read which question is being
   asked before choosing the revision.

17. *(Shared protocol review bar 11, empyrean `20a8e81` — the set's first
   packaging-of-truth bar.)* **A confidently-offered weak point is a misdirection, even
   in good faith.** "Here is the assumption I think is fragile" should **raise** the bar
   on everything else in the claim, not lower it: a volunteered caveat reads as a
   certificate that the remainder got the same care, and it steers scrutiny toward the
   part the author already doubted — away from the part they didn't. Not a rule against
   caveats; a rule about what a caveat does **not** certify. Cheap check: **read the
   lines around a cited line before accepting what it proves** — a citation is a pointer
   into code that keeps executing past the line you were shown.

   **Local instance, run against an already-landed decision (2026-08-22).** The effects
   codec's no-ajv call rests entirely on one cited line: `src/renderer/index.html:6` is
   `script-src 'self'` with no `unsafe-eval`, so ajv's `new Function` codegen would pass
   every node test and throw in the app. I had accepted that by grepping the line, which
   is exactly the shape this bar warns about — an Electron app can override the page CSP
   from the main process (`onHeadersReceived`) or defeat it with `webSecurity: false`,
   both of which execute far past the line I was shown. **Checked: it holds.** That meta
   tag is the ONLY `Content-Security-Policy` in `src/`, `src/main/` sets no header
   override and no `webSecurity` flag, and `unsafe-eval` appears nowhere in the tree. The
   citation survived reading around it — which is the other reason to run this check:
   a decision that survives it is *verified*, not merely plausible, and the next session
   inherits the stronger claim.

18. *(Shared protocol, empyrean `e33531f` — bar 12 there, plus bar 8's new technique. Both
   came out of this repo's `editor_bg_override.json` arc; recorded here with that
   precedent.)* Two halves of one lesson:

   **(a) A document's universally-quantified rules bind every actor they describe, not
   just the party in its title.** The `editor_bg_override.json` ownership fork was treated
   as an open design question by **three sessions across three repos** — and it had been
   answered the whole time by `empyrean/docs/AURORA_EFFECTS_SCHEMA.md` §6 hazard 1:
   *"The general rule for **every wave-1 writer**: round-trip what you do not understand,
   or refuse the file."* Nobody cited it because the doc is titled as **Aurora's** schema,
   so its rules were read as binding Aurora. `png_to_bg_override.py` is an aeon tool and a
   writer of a document that contract owns; the rule reached it and no one looked.
   **Authoring corollary: a rule meant to bind others must name whom it binds.**

   **(b) Changing the frame means finding the load-bearing step NOBODY cited.** Bar 8 says
   mutual verification cannot catch a shared frame — this is the technique for breaking
   one. The whole prefix finding rests on the bands' DMA base being the tile blob's own
   base; three sessions cross-verified the band geometry, the slot arithmetic and the
   consumer's asserts, and **not one of us checked that step**. Had `BG_TILE_BASE_VRAM`
   (`inject_editor_bg.py:125`, hardcoded `0x8000`) and `BG_TILE_BASE_SLOT`
   (`vram_map.py:25`, `1024`) diverged, bands would land *beside* the static tiles rather
   than over them and the entire report would have been backwards. They don't —
   `1024 * 32 = $8000`, identity confirmed — but that was checked **fourth**, by the one
   session that went looking for the uncited joint. **The shared frame lives in the
   joints, not the links.**

19. **A TEST MUST NOT READ A PEER REPO'S WORKING TREE.** *(2026-08-28,
   `test/formats/effects-scene-curve-vsplit.test.ts`; packet
   `docs/reviews/2026-08-28-golden-live-tree.md`.)* **The shared protocol governs on any
   disagreement with the wording here** — this is that protocol's most upstream rule
   (*"Read this file at a COMMITTED revision, never through the filesystem path"*, and its
   operational form, *"prefer `git show <rev>:<path>` over reading a sibling's working
   file, because the first names a revision and the second silently names 'whatever is on
   disk right now'"*, read at `empyrean origin/main 2fd7b5f0`) applied to the one place
   nobody had swept: **test fixtures**. This entry adds a local instance and a shape, not a
   new rule, and never an exception to one.

   On this machine every sibling repo is some peer lane's live checkout, so a test that
   opens one by absolute path has its colour decided by that peer's uncommitted edits.
   **Precedent:** a byte-exact golden pinned
   `/home/volence/sonic_hacks/aeon/games/…/ojz_act1_depth.json`, which was ` M` and
   uncommitted; it went red when the peer deleted a `vsplit`, and surfaced as
   `TypeError: Cannot read properties of null` inside `EditHistory` — a trace naming no
   peer, no path and no repo. **Three agents and an overseer filed it as "pre-existing,
   unrelated"** without anyone asking why it failed; the suite hub found the cause.

   **The part that outlives the instance:** the test had been **green its whole life, and
   its green meant nothing verifiable** — it had no fixed thing to drift from, so its pass
   and its fail were *both* decided outside this repo. A check like this cannot detect the
   drift it exists for; it can only report the state of someone else's directory, in the
   voice of an assertion about our code.

   **The shape, when a fixture comes from a peer — separate the two questions, they need
   different instruments:**
   - *"Does our code round-trip / handle this document?"* is a property of **our** code.
     **Vendor the fixture into this repo** at a named peer revision with a
     `.provenance.json` beside it (repo, path, revision, blob id, how it was resolved,
     re-vendor command). A pinned blob is **legitimate** here: the property is about the
     behaviour, not about currency. Record the peer's **git blob id**, so the pin is
     *checkable* rather than merely copied.
   - *"Is that pin still what the peer ships?"* a pinned blob **can never answer** — it
     equals itself by construction, so a check written that way passes forever and detects
     nothing. Give it its own check that reads the peer at a **committed** revision
     (`git -C ../<peer> show <rev>:<path>`), **names that revision in its messages**,
     **fails** on drift, and **skips loudly** when it cannot run
     (`SKIPPED, NOT PASSED: … CANNOT MEASURE …`) — never silently, never green. Compare
     **content, not commit SHAs**, so the peer's ordinary commits do not turn this repo
     red. Prefix a cross-repo failure with something like *"NOT AN AURORA REGRESSION"*:
     the triage failure above was readers mistaking a cross-repo signal for an in-repo one.
   - If you judge the currency question not worth a check, **say so and record why. Do not
     leave a check that appears to cover it and does not.**

   **Two corollaries that cost the most to learn:**
   **(a) Proving it passes today is half the property.** The test must still pass when the
   peer's working tree changes — demonstrate it, e.g. by running with the peer repo
   **unreachable entirely**. A golden that passes with the peer absent cannot be reading
   the peer.
   **(b) Deleting the absolute path is not the fix, and can be worse than none.** Routing a
   read through a helper that derives the peer's location removes the literal while leaving
   the read pointed at the same live tree — a change that **looks** like this bar was met.
   Where the real fix is out of scope (this parcel left `s1disasm`'s 37 sites alone for
   exactly this reason), **report it and leave it legible.**

   **Silent skips are the same defect in its purest form.** The sweep also found two
   `describe.skip` blocks pinned to `s4_engine`, **a repo that does not exist on this
   machine** — integration checks that had measured nothing for months as a quiet zero
   inside a green total. `ctx.skip` with a message that says what could not be measured;
   `it.skip`/`describe.skip` discard the reason, and a silent skip and a pass are
   indistinguishable in a suite total.

## Editor↔engine coordination points

Protocol details Aurora depends on and did not invent. All measured; re-verify before
trusting, the repos move.

**⚠ CLASSIFY EVERY ITEM HERE AS AN ENGINE FACT OR A SERVER FACT BEFORE TRUSTING IT**
*(added 2026-08-22, from the oracle lane's implication of Aurora's own socket-chain finding)*.
Which implementation answers a bus call is decided by **whoever launched on the socket chain
first, not by any config** — so **every measurement any lane has ever banked carries an
unstated assumption about which server answered, and nothing in the transport makes that
assumption checkable.** That reaches *backwards* into this list. Until `initialize` carries a
build identity, the split is the mitigation, because the two halves have completely different
exposure:

- **ENGINE facts — unaffected by the cutover, because the server is only a window onto aeon.**
  The live-palette contract (`Pal_Base`, 96 bytes = lines 1–3, payload then flag), the warp
  mailbox, the boot-position override, DEBUG booting into debug-fly, boot zeroing all 64KB of
  work RAM, `FAST=1 ./build.sh`, and the level-staleness mtime gate. **Re-derive these against
  aeon**, and no server question arises.
- **SERVER facts — exposed, and re-verified only against the implementation you re-verify on.**
  The two-message handshake, the `require_paused` set, fresh-headless-paused-at-frame-0,
  post-`reload_rom` RAM persistence, `emulator/reset` being off-limits on the hosted build, and
  the `.lst` third-`EQU`-section parser. **Each needs the implementation named beside it.**
  Where this file states one without naming the server, treat it as measured against *an*
  implementation, not *the* implementation.
  Worked example, and the reason the split is not academic: the `require_paused` list below was
  re-derived 2026-08-22 from **oracle's Rust source at `e484ace`**. That is now stated in the
  row. It is not known to hold on the legacy C++ server, and this file previously carried it as
  though it were a property of "the bus".

**Two conditions Aurora holds oracle to on the `initialize` build-identity parcel** *(their
ask, recorded here because a consumer-side condition living only in the producing lane's queue
is the one that gets dropped in a handover — the same reason `bypassesVdpPort` is written down
below)*: **(1)** it must distinguish *implementation* (which server) from *build* (which
commit), because these fail **independently** — a 21-Aug and a 22-Aug binary differing by four
served methods are identical under `CARGO_PKG_VERSION`; **(2)** it must be
**unforgeable-by-config** — `serverName` is config-supplied today and proves nothing an
impostor could not also claim, so a value read from a config file would reproduce the exact
defect the parcel exists to fix.

✅ **BOTH SHIPPED AND MEASURED FIRSTHAND HERE 2026-08-29 — the parcel is CLOSED, and the wire now
answers what `serverName` never could.** Relayed by the oracle lane, then **verified from this
session against its OWN privately-spawned `oracle-aether`** (mkdtemp socket, never the owner's
window) rather than adopting their reading — the standing practice in this file. Probe:
`scratchpad/init-probe.mjs`.
- **Condition (1) is MET, by two SEPARATE fields that fail independently, which is the whole ask.**
  `implementation` = `"oracle-rs"` (WHICH SERVER) and `serverBuild` = `{id, source, dirty}` (WHICH
  BUILD), where `id` is `<commit SHA>+profile=release+target=x86_64-unknown-linux-gnu+features=`.
  The motivating defect is now impossible: two binaries from different commits can no longer be
  identical on the wire. **`serverName` is still `"oracle-next"` and `serverVersion` still `0.0.0`** —
  both unchanged, both still proving nothing; read `implementation`, never `serverName`.
- ⚠ **CONDITION (2) UPGRADED 2026-08-29 — barred by contract AND by a source-level test, both read
  firsthand at oracle `fee8f12` (ancestor of their `origin/main`, checked). BUT ONE JOINT IS UNASSERTED
  AND IT IS THE LOAD-BEARING ONE.** What they built is genuinely strong: `build.rs` computes the values
  at COMPILE time in two branches, and the no-git fallback emits `no-vcs+pkg=…` which cannot be mistaken
  for a SHA rather than fabricating one; `dirty` is an `Option` OMITTED under `"declared"`, so **a
  `dirty:false` on the wire can only have come from a real working-tree measurement** — the exact thing
  wire-reading could not settle. `_COMPILE_TIME_OR_NOTHING` is stronger than a test: a runtime-read
  value cannot sit in a `const` initialiser, so that failure is a BUILD error.
  **The gap, found here by reading their three tests against each other rather than one at a time —
  this file's own bar 18b, the uncited joint, in someone else's repo.** The property splits three ways
  and the join is asserted by nobody: (a) `_COMPILE_TIME_OR_NOTHING` proves the CONSTANTS are
  compile-time; (b) `neither_identity_value_is_reachable_from_configuration` proves the constant NAMES
  appear only in `build_info.rs` and `engine.rs`; (c) `initialize_names_the_implementation_and_the_build`
  proves the WIRE `serverBuild.id` is a non-empty string with a valid `source`. **Nothing asserts that
  the string on the wire IS that constant** — and `engine.rs`, the one file allowed to mention both, is
  exactly where a divergence would live. An override written there as
  `config.override.unwrap_or(SERVER_BUILD_ID)` keeps the name inside an ALLOWED file, keeps the const
  compile-time, and emits a valid non-empty string: **all three tests green.** Reported to them; the fix
  is one line per value (`assert_eq!(id, SERVER_BUILD_ID)`), and both constants are already imported in
  that test file. ✅ **CLOSED 2026-08-29 at oracle `843b99a`** (verified here: real commit, ancestor of their
  `origin/main`, and the three `assert_eq!`s read at that revision — wire `id`/`source`/`dirty` each
  pinned to their compile-time constant). **They demonstrated the gap before fixing it rather than
  accepting the argument: emitting a forged id naming no commit in existence left all 5 tests in that
  file and all 413 in the crate GREEN.** So the seam was not merely unasserted, it was undetectable —
  which is the stronger claim and neither of us had stated it. **Condition (2) is now MET.**
  ⚠ **A CORRECTION TO THIS LANE, THEIRS, AND IT IS RIGHT.** I proposed REPLACING the `implementation`
  string literal with the constant. That would have silently dropped a different claim: the literal
  pins the **registry value** (§2.1's registry has one legal spelling), the constant pins the **join**.
  They kept both. **When a check looks redundant, ask what each of the two claims is before collapsing
  them** — I was one edit from removing a pin while believing I was strengthening it.
  And they marked their own new `implementation` join row **not currently load-bearing** — the schema
  enum in `common/schema.rs` refuses a divergent value before the assertion is reached (measured by
  them, poison fails at `schema.rs:485`) — kept for when the registry gains a second value, with an
  explicit "do not cite it as a caught defect". That is this file's own say-which-rows-do-not-
  discriminate bar, applied to themselves, unprompted.
  **The generalisation worth keeping, theirs:** *a test per component and none across the seam is how
  a chain of individually sound links holds nothing* — **and a seam has no author**, which is why it
  took a reader who wrote none of the three. That is the mechanism behind this file's bar 18b, stated
  better than bar 18b states it.
  **Superseded holding position:** treat (2) as barred-by-construction with an unasserted join. Their anti-vacuity guards are present and correct, which is why this needed reading ACROSS
  the tests to find.
- **Superseded reading, kept as the record of what was believed before the source was read — condition
  (2): STRONGLY CORROBORATED, NOT PROVEN FROM OUTSIDE.** `source:"vcs"`
  and `dirty:false` are build-time captures, and the id's SHA is a **real commit, reachable from
  oracle `origin/main`** (checked here). That is good evidence it is VCS-derived rather than
  config-supplied. It is **not proof**: nothing observable on the wire can rule out a config
  override, which would need their build source read. Do not upgrade this to "proven" without
  doing that.
- ⚠ **`serverBuild.id` IS A TREE IDENTITY, NOT A CODE IDENTITY — and this bites in the obvious
  direction.** Found here while class-checking the SHA per bar 9: the id measured on the shipped
  binary resolves to a **docs-only commit** (`docs/lane-status.json`, 10 insertions / 18 deletions),
  because a build identity names *whatever HEAD was at build time*. That is CORRECT for its job and
  is exactly what staleness needs. But it means **the id changes for reasons that have nothing to do
  with the code**, so two binaries with byte-identical behaviour can report different ids. **Use it
  for "is this the same binary I measured before" (staleness). NEVER for "does this build contain
  feature X"** — that question is `capabilities` and `methods`, which exist for it. Reading a code
  guarantee off a build id is the method-count failure wearing a better costume, and it is the
  sharper form of this file's own *a provenance record is several claims that do not share a clock*.
- **The old discriminator can be retired.** This file's 2026-08-24 trick — inferring the Rust core
  from a **relative** `romPath` in argv — was a clever read of an accident. `implementation` answers
  it directly now; keep the old note only as history.

- **Aether client** (`src/main/aether/`). The socket path is SELECTED by env-var presence, not
  searched: `resolveSocketPath` (`socket-path.ts:35-50`) takes the first set-and-non-empty of
  `$ORACLE_SOCKET`, `$EXODUS_SOCKET`, `$XDG_RUNTIME_DIR/oracle.sock`, else `/tmp/oracle.sock`, and
  hands that one path to `net.connect` (`bridge.ts:119`); nothing stats or probes, and nothing
  falls through on a connect error. At a socket FILE nobody listens on the client surfaces
  `ECONNREFUSED`, at no file `ENOENT`, both naming the path (measured by
  `__tests__/socket-dead-link.test.ts`). A long path dies on `SUN_LEN`.
  **The handshake is TWO messages** — `initialize` with `clientCapabilities:{events:true}`
  then an `initialized` NOTIFICATION; subscription happens on the second, and skipping it
  gives a healthy connection that silently never receives an event. Feature-detect off
  the advertised method list, never a version.
- **`require_paused`** — **the full list, re-derived from **oracle's RUST source** at `e484ace`
  2026-08-22 (**server fact** — not known to hold on the legacy C++ server), because this row was missing four for months**: `run_frames`, `run_to`,
  `step`, `step_over`, `step_out`, `write_memory`, `write_cram`, `press`, `play_input`,
  `reload_rom`. NOT `read_memory`/`read`/`sprites`/`scanlines` (pure reads), and
  **`reset` is deliberately NOT gated** (it replaces the machine wholesale between frames).
  The four that were missing — `step`, `step_over`, `step_out`, `write_cram` — are exactly
  the ones added to the server after this row was written, which is the shape to expect:
  **a hand-copied list of someone else's gates does not grow when theirs does.** Derive it
  from their source (`grep require_paused` over `crates/oracle-aether/src/engine.rs` at a
  committed revision) rather than trusting this row; it is a snapshot and is cited here so
  its staleness is detectable. Always
  honour `pause`'s `wasRunning` — the bus is multi-client and an unconditional resume
  starts a machine somebody else stopped.
- **Live palette**: write `Pal_Base` (96 bytes = **lines 1–3 ONLY**; line 0 is the
  character palette and the engine never writes it), then set `Pal_Base_Dirty = 1`.
  Payload then flag: the per-frame compose copies the base in only when the flag says so.
  Reading "96 bytes" as four lines is the natural mistake and slides every line by one.
- **Warp mailbox** (DEBUG shape only): `Warp_Req_X`/`Warp_Req_Y` (u16 world px), then
  `Warp_Req_Flag = 1` LAST. The engine clears the flag as its ack (~20 frames) and
  publishes the CLAMPED destination back into X/Y — surface where it LANDED, not what was
  asked. Gate the feature on the symbols resolving so a release ROM greys it out.
- **The DEBUG ROM boots into debug-fly**, whose update reads only the D-pad — the player
  looks frozen and never falls. One `emulator/press` B exits it properly. Never poke the
  pad cells or `debug_flag`.
- **Builds**: `FAST=1 ./build.sh` (~1.3s) is the iteration loop — lanes skipped, loud
  not-a-ship-artifact banner, and it re-bakes stale editor data itself, which is why
  Aurora runs no re-bake of its own. The canonical build fails loud on stale editor data.
  Build the flavour matching the RUNNING ROM (`emulator/status.romPath`), or the reload
  targets a file the build never touched.
- **Level-staleness is an MTIME gate, and `editor_bg_override.json` is on its INPUT side.**
  Raised by the aeon overseer 2026-08-22 as a `project.json` hazard; verified firsthand at
  their pushed master and it is **stronger than the warning given**.
  `tools/level_staleness.py` compares `newest mtime(editor sources) > newest mtime(generated
  tree) ==> STALE` (:30), and the editor-sources list (:134-137) is the editor tree,
  **`games/<game>/data/editor_bg_override.json`**, and `project.json`. So the trap is not
  merely "a save path that rewrites `project.json` unchanged trips it on mtime alone" — the
  BgAnim composition proof writes an input **directly**, which makes the staleness failure
  **certain rather than conditional**. Run `tools/regenerate-level.sh` after the save and
  before the build.
  **Why it matters more than an extra step:** the gate hard-fails *before* a ROM is emitted,
  so a staleness stop presents as the `anims` refusal gate rejecting Aurora's bytes when it
  never judged them. Attribute the failure to a STAGE before reading it as a verdict.
  **Companion, same family as the byte-neutral CRC bar:** if the build does not run, leftover
  ROMs on disk greet you with four matching CRCs from a build that never happened. `rm -f`
  the ROMs first so existence proves freshness.
- **Boot-position override** (DEBUG shape only, aeon `a2a24eb9`, ARCH §4.12b):
  `Boot_At_X`/`Boot_At_Y` (u16 world px) + `Boot_At_Flag`, same clamp/publish-back/
  cleared-flag-ack contract as the warp mailbox, consumed by Build & Run's restore
  (`src/main/aether/boot-restore.ts`) at the run_to-the-init window below. **The
  cleared flag can be FORGED**: a write that lands before the boot clear is zeroed
  along with the flag, which reads exactly like an ack — any check of this sequence
  must verify position via an independent read, never the flag alone. The warp-retry
  fallback (pre-override DEBUG ROMs) inherits this hazard on paused machines and is
  unguarded; it vanishes as ROMs carry `Boot_At_*`.
- **Fresh headless oracle-aether is paused at frame 0** — reads before any resume see
  reset-RAM garbage; and after `reload_rom`, RAM holds the OLD session's values until
  the boot clear runs, so level-up polls must gate on `frameToken`, not on plausible
  values.
- **Boot zeroes all 64KB of work RAM.** A write to a reset-paused machine is gone
  before level init reads it, and the boot proceeds with authored values SILENTLY —
  the client looks finished having done nothing. Anything init must consume is written
  at `reload_rom → run_to <init symbol> → write, flag last → continue`, where the
  machine is stopped at the init's entry and nothing is painted yet.
- **`emulator/reset` is off-limits on the hosted build** until aeon's F-HOSTED-RESET-SRM
  closes — it bypasses the player's `.srm` flush. `reload_rom` is unaffected.
- **The MCP SHIM and the Aether SERVER are independent, and only one of them is config**
  *(established firsthand 2026-08-22, during the Rust-core cutover)*. `mcp__oracle__*` in this
  workspace runs **oracle-old's Python shim** — a *client* — which dials the same socket chain
  everything else does. **So the shim's provenance does not determine the server's.** Proven
  here end to end: an `oracle-old` shim (PID 14139, started 12:54) served every emulator call
  this session, and they all reached a **Rust `oracle-aether`** — decisive because
  `emulator/status` returned `romPath: ../aeon/s4.debug.bin`, the *relative* argv passed to the
  Rust binary from this repo's cwd, while the C++ `oracle_gui` on the same machine carries the
  **absolute** path. A legacy shim against the Rust core already works; nobody had tested it.
  Two consequences. **(a)** "Cut over `mcp__oracle__*`" is two changes, not one: which shim
  Claude launches (config, **on the process command line — a running session cannot pick it up,
  so it needs a full restart, not a `/clear`**), and which server holds the socket (whoever ran
  a process first). ⚠ **RETRACTED IN PART 2026-08-24, and the retraction is this lane's own —
  read it before repeating the sentence above.** That framing describes what a full cutover
  WOULD involve *if anyone wanted a different shim*. It is not a claim that anyone needs one,
  and it was carried to the owner by the empyrean lane as "the shim half is real and is his"
  before this lane caught it. **Nobody has argued for changing the shim**: the finding directly
  above is that the legacy shim already reaches the Rust core, so a restart is the price of a
  change with no proponent. Confirmed 2026-08-24 by reading the owner's binding read-only —
  `mcpServers.oracle` carries `"args": []` and `"env": {}`, i.e. **no socket override**, so the
  shim walks the same default chain as everything else and its provenance cannot determine which
  server answers. **Evidence about the CLIENT is not evidence about the SERVER** (banked by the
  hub as their bar 14, empyrean `2eb2737`); their own tell is worth keeping: *the config was easy
  to read and the behaviour was not, so the readable thing stood in for the measurable one.* **(b) A session can silently change which implementation it is talking to
  with no config change and no signal** — the socket chain is the only arbiter. Read the
  banner's method count, and treat it as the freshness tell it is.
- **A built binary is a third enumeration parameter, and it is the one source greps cannot
  reach** *(same day)*: `oracle-aether` release bannered **37 methods** while oracle's source
  served 41 — the binary predated four landed methods. Two lanes had derived the count from
  source by different methods and agreed; both were blind to the artifact. **A consumer
  measuring the bus against an installed binary gets the old answer with nothing announcing
  it**, so a cutover must rebuild and **verify by executing, never by grepping source**.
  ✅ **CLOSED 2026-08-24 BY EXECUTING, which is what this row demands and what the update below
  could not supply.** The oracle lane started `oracle-aether` on `/run/user/1000/oracle.sock` and
  handshook it fresh: **41 methods**, `serverName: oracle-next`, `serverVersion: 0.0.0`,
  `breakpoints=false`, `z80=false`. **Aurora then verified independently from this session rather
  than adopting their number**: `emulator/status` returned `romPath: "../aeon/s4.debug.bin"` —
  the **relative** argv only the Rust binary is given, where the C++ `oracle_gui` carries the
  absolute path — with `symbolCount: 2674`, `symbolsPath: ../aeon/s4.debug.lst`, paused at frame
  0 with `pc` at `EntryPoint`. **So the legacy Python shim reaching the Rust core is now confirmed
  against a SECOND server instance, by this lane's own 2026-08-22 discriminator, re-used to certify
  the server that discriminator was first derived against.** Note what this is NOT: the shim is the
  same one in both runs, so this is a re-confirmation, not an independent derivation.
  ⚠ **`serverName` and `serverVersion` remain unforgeable-by-nothing** — a config default and a
  literal that has never moved. **Neither can tell you which server answered**, which is exactly
  the gap Aurora's two conditions on the `initialize` build-identity parcel exist to close. The
  wire now demonstrates the gap instead of it being argued from source.
  **Loud-failure verified too, not asserted**: `emulator/write_vram` returns `-32601`,
  `"no such method: emulator/write_vram"`, with the frame/mclk envelope attached — a gap refuses
  by name and feeds the queue rather than degrading to a plausible answer.

  *Superseded reasoning, kept because it is the worked example of banking a relay with its limit
  rather than laundering it:* **UPDATE 2026-08-24, RELAYED BY THE ORACLE LANE AND RECORDED WITH
  THEIR STATED LIMIT — not re-measured here.** They report this specific staleness closed: `target/release/oracle-aether`
  is dated 2026-08-22 21:52, zero non-docs files changed between their `12cc17e` and their HEAD,
  and `12cc17e` banks a handshake that read **41 methods over the wire**, committed 21:54, two
  minutes after that binary was built. **Their own limit, carried rather than dropped: that is
  mtime plus a docs-only diff plus a previously-banked wire check, and they did NOT re-handshake
  it.** So the artifact is argued to be the verified one, not observed to be. The bar itself is
  untouched, and the freshness tell is still the banner read by executing.
- **When `write_vram` is eventually built, require `bypassesVdpPort: true` in the reply**
  *(oracle's condition, recorded here because Aurora is the consumer)*. The debug read/write
  path skips the VDP port path, FIFO and DMA entirely. **The flag is what protects an agent;
  a cautionary name only helps someone who already suspects something.** Aurora's own ask for
  it is currently a *prediction with an unreachable revival condition* — see
  `reviews/2026-08-22-oracle-instrument-gaps.md`: the probe that would justify the method
  requires the method.
- **The BgAnim DRIVER IS ALIVE, and the only thing that calls it is sonic4's BOOT STATE**
  *(ENGINE facts — re-derivable against aeon, no server question. Relayed by the hub from the
  aeon lane 2026-08-24; every claim below re-verified firsthand here at aeon `origin/master`
  before being written down, and the last one is this lane's own addition.)*
  **`BgAnim_Init` (`9B30`) and `BgAnim_Update` (`9B3C`) are both emitted** in `s4.debug.lst`.
  Aeon's OWN banked memory said BgAnim had been silently deleted and BG was dead since
  2026-07-21; they re-checked and **corrected it**. This lane's memory carried a
  near-miss of the same error, phrased as *"OJZ BG animation dead in the ROM"* — true of the
  DATA (`anims` wiped, so `BgAnim_Table: u16 = 0`, the disabled stub) and false of the CODE.
  **Dead data is not dead code**; keep the two words apart when speaking about this.
  **Call sites, enumerated over every `.emp`:** the ONLY `jbsr`s are in
  `games/sonic4/test/ojz_scroll_test.emp` — `BgAnim_Init` at `:515` and `:1159`,
  `BgAnim_Update` at `:821`. Everything else is a definition, a comment, or generated data.
  **There is no separate shipping game-loop call site.**
  **But the scroll test IS the shipping boot path, which is this lane's addition to their
  finding and it changes the risk:** `games/sonic4/config/game.emp:58-60` binds
  `const ENTRY_ID = GS_OJZ_SCROLL_TEST` and `proc entry = GameState_OJZScroll_Init`. So a ROM
  test reaches the driver by **booting** — no special entry, and "test module" understates
  what it is.
  ✅ **CLOSED 2026-08-24 — THE DRIVER TICKS EVERY FRAME ON A PLAIN `s4.bin` BOOT.** Traced by
  aeon, re-traced by the hub, and the two links carrying the actual risk re-verified firsthand
  here: `game.emp:59-60` binds `entry = GameState_OJZScroll_Init`, and
  **`GameState_OJZScroll_Update` (`:556`) contains ZERO `rts` between its head and the
  `jbsr BgAnim_Update` at `:821`** — the only exit is the `rts` at `:822` immediately after it,
  and no branch guards the call. (Mechanical middle links, taken as traced: `:549` stores
  `GameState_OJZScroll_Update` into `Game_State`; `game_loop.emp:41-42` does the per-frame
  `movea.l Game_State, a0` / `jsr (a0)` computed dispatch; `boot.emp:349` seeds it from
  `Game.entry`.)
  **So the ROM half arranges nothing — build it and watch it.** No special entry, no test build
  shape, no harness. **And if a band loads but never steps, it is NOT the wiring** — look at the
  data or the proc body, and at that point it is plausibly an engine item and therefore aeon's.
  ⚠ **`test` IN A PATH IS A KNOWN-BAD SIGNAL IN AEON'S TREE, not a description.** The sole caller
  lives in a module named `test` **and that module is the shipping boot entry**. Both wrong
  readings this cost the suite — *"the driver is dead"* and *"it needs a harness"* — come from
  that one word. Aeon's own first draft of the repaired comment said *"there is NO shipping
  game-loop call site"*: literally true, reads as *dead driver*, and they caught it before
  committing — i.e. they nearly shipped the INVERSE error into the very comment they were
  fixing. Treat `test` in an aeon path as unlabelled until checked.
  ⚠ **`engine/level/bg_anim.emp:103` reads *"call once per frame from the main loop"* — that
  is the CONTRACT THE PROC WAS WRITTEN TO, not a description of what calls it.** A reader who
  greps the definition finds a sentence that looks exactly like proof of a call site. This is
  the third perishable-claim-in-a-code-comment instance in three repos in one day (aeon's
  `effects_gen.py` SLICE 1 docstring; this repo's stage-4 spec claiming a fix that never
  landed; and now this). Not a bar yet — the hub is holding it at three and explicitly
  declined to write one from a single afternoon's instances. **If runtime work here turns up
  a fourth, tell them.**
- **`.lst` listings carry a third `EQU` section**; oracle-next's parser handles it.
  Equates can never answer address lookups in either direction.

## Instruments

- **CDP harnesses** (`scratchpad/*-harness.mjs`) are how anything visual or live is
  proven. They launch Electron under `xvfb-run` with `AURORA_DEBUG_PORT`, drive it over
  CDP, and assert. `window.__dbg` (`src/renderer/debug-hooks.ts`) is the query/door
  surface — `aeon.open`, `openDir`, `aether.*`, `classic.*`, `canvas.*`. **It only exists
  in a `VITE_AURORA_DEBUG=1 npm run build`**; a plain build has no hooks and no port.
- Reference harnesses: `collision-agent-harness` / `collision-gesture-harness` (agent +
  human paths), `live-palette-e2e-harness` (two processes, independent observer),
  `warp-tearing-harness` (same-destination-two-ways), `chunkgrid-hint-harness` (layout
  measurement).
- `object-label-harness` (2026-08-22, item 17) — the reference for **stating which rows do
  not discriminate**. 23/23 on the fix, 15/23 on master, with every instrument and
  anti-vacuous row green on master and exactly the eight claim rows red; both frames re-run
  by the overseer before landing. Its `6c` row — label containment on the 0px-clearance
  Effects facet — **passes on master too**, because the canvas edge clips the half of the
  overflow that would have failed it, so the discriminating row is Layout's `5d` instead.
  The parcel said so in the harness header and the ROADMAP row rather than reporting 23/23
  and letting a reader assume all 23 were earned. That disclosure is bar 5 at the moment it
  costs something.
- **⚠ A CDP HARNESS MUST AIM AT INTEGER CLIENT PIXELS, AND `devicePixelRatio` VARIES BETWEEN RUNS HERE** *(2026-08-26, item 43 part 1; cost a full review cycle)*. Xvfb infers a device scale factor that has been observed at **both 1 and 1.35 hours apart in the same session**, and at 1.35 the map canvas's rect is **fractional**: `rect.top = 73.99304962158203`, not 74. A harness aiming a mouse event at `rect.top + N` therefore asks for a position **that does not exist on the device pixel grid**; CDP delivers the nearest integer — the previous device row — and the app correctly resolves a coordinate one lower. **It presents as an off-by-one defect in the feature, and the feature is fine.**
  **Aim at an integer client pixel and derive every expectation from THAT integer through the app's own contract**, never from the float you wanted. `scratchpad/guide-aim-probe.mjs` is the committed instrument that measures it; `effects-guides-harness.mjs` row `4e` prints dpr, rect and derived aim so the environment is visible in the output — copy that pattern.
  **Two corollaries, and the second is the one that actually bit:**
  **(a) A harness that passes twice has proven nothing about stability** when the environment itself varies. Item 43's harness reported **28/28 from two lucky observations** and the true figure was 26/28; "unchanged" was asserted about a coincidence. Run the final number more than twice, and print the environment beside it.
  **(b) NEVER READ TWO ROWS OF ONE RUN OUT OF TWO DIFFERENT RUNS — this one is the OVERSEER's, made while reviewing exactly this defect.** I read the failing drag rows from runs 1 and 2, the canvas rect from run 3, saw an integer `top: 74`, and ruled the fractional-rect hypothesis **dead**. It was not dead; run 3 had simply come up at dpr 1 while the failing runs were at 1.35. **The stitched observation was self-consistent, cheap, and wrong**, and it sent a correct diagnosis back for rework. In a run-to-run-varying environment, a claim needs its evidence from ONE run — and the agent, who had the whole run in front of it, was right.

- **A harness must not ask the component under test whether it worked.** The palette
  harness reads `Palette_Buffer` out of the machine over a SECOND client connection.
- **Subagents NEVER touch `mcp__oracle__*`** — they deadlock. Runtime work is the
  overseer's, in the foreground, or a headless bus script.
- **⚠ THE BULLET BELOW IS TRUE ONLY FOR A SESSION WHOSE SHIM INTERPRETER STARTED AFTER `oracle-old` `07314aa` (2026-08-25 21:09) — AND THIS SESSION'S DID NOT.** *(Raised by the oracle lane 2026-08-26; every claim below verified firsthand here before it was acted on.)* Python reads its source **at process start**, so a shim launched before that commit keeps the OLD behaviour forever: it does **not** spawn a private instance, it dials the default socket chain and **attaches to whatever holds it — which is the owner's on-screen game window.** A step, pause, reset or memory write from such a session lands in the game he is playing. **Measured here:** `/run/user/1000/oracle.sock` is held by `oracle-frontend` pid 1542676 (`--aether --x11`, the owner's player); this session's shim is pid 287509, started **Aug 25 20:29**, i.e. pre-fix, and `pgrep -P` shows it has **NO CHILD** — no private instance exists for it. Post-fix sessions look visibly different in the same `ss -lxp`: theirs carry an `oracle-aether` of their own on a `/tmp/oracle-mcp-*/oracle.sock` mkdtemp path. **The file on disk is correct; the running interpreters are not.** A session RELAUNCH picks the fix up automatically — a `/clear` does not, because the shim is on the process command line. **It already cost something once:** a lane reloaded the owner's window onto a worktree build in good faith at ~18:20Z believing it had a private instance. **So: check the vintage before trusting the bullet below, and when in doubt do not call the tool** — his window is not ours to touch. **Corroborated 2026-08-26 from a different enumeration parameter** *(bar 19's genuine-corroboration shape, flagged as such by the oracle lane)*: this lane derived the `/clear`-does-not-help half from the shim being on the **process command line**; they observed it directly — their session was `/clear`ed and **the shim's start time did not move** (pid 287372, still `Aug 25 20:29:19`). Where the shim is configured versus a before/after on an actual clear: neither derivation could share the other's parameter. They adopted `pgrep -P` as a bar (oracle `cfe3406`) and report it renders across the whole box — **ten shims, eight with no child, two owning a `/tmp/oracle-mcp-*` instance.** **THE JOIN KEY ALREADY SHIPS — do not ask for it, consume it** *(oracle, 2026-08-26, verified by them live against a spawned server on the corpus ROM rather than read off the schema)*. `emulator/pixel_attribution` returns **`cell`**, present iff `winner.layer` is `planeA`/`planeB`/`window`: ⚠ **CORRECTED 2026-08-27 — `cell` is a SIBLING of `winner` at the top level of the result, NOT hanging off it; `winner` carries only `{layer}`.** Measured here against a freshly spawned `oracle-rs` build `d285ecbc6c3a` (`docs/reviews/2026-08-27-band-lens.md`). **This one fails SILENTLY:** a consumer written to the old shape reads `winner.cell?.tile` and gets `undefined` for every pixel without throwing — this lane's own first lens run printed *"27/28 sample points on planeB"* and *"0 sample points on planeB"* in the same output because of it. Every other claim in the relayed finding is corroborated here (VRAM-absolute tiles, `tileAddr == tile*32` on an independent sample `1101 -> 0x89A0`, the rebase direction, and `cell` present for 27/27 plane-B winners). ⚠ **AND THE ATTRIBUTION IS WRONG IF YOU STOP THERE — corrected 2026-08-27 by the oracle lane and verified firsthand here before amending.** Their own bank was RIGHT: oracle `docs/OVERSEER.md` says `pixel_attribution.cell` (top-level) and their source writes `out["cell"]` at the top level (`crates/oracle-aether/src/engine.rs:2821`), with their tests and the empyrean contract schema agreeing. **The nesting was corrupted in the RELAY, between a correct record and this bank** — so a reader who goes looking for a bad record upstream will find a good one and lose the lesson. **The lesson is theirs and it is sharper than the bug:** the shape was machine-enforced in THREE places — their tests, their source, the contract — **and one sentence of prose defeated all three, because assertions do not cover claims ABOUT assertions.** Operational form, adopted: **relay the assertion's LOCATION, or send the JSON — never the shape in prose.** Fields: `{tile, tileAddr, palette, hflip, vflip, priority}` — the nametable word decoded. **`cell.tile` is VRAM-ABSOLUTE** (0..2047, and `tileAddr == tile * 32`: their 1066 -> `0x8540` checks out). **Aurora must rebase by `BG_TILE_BASE_SLOT` (1024, verified here in `bganim-consumer-contract.json`) to reach blob-local** — the same rebase and the same direction the injector applies inbound. That closes the band-lens loop from the other direction: click a dot, rebase, name the band and slot. ⚠ **THE REBASE CAN LAND OUTSIDE THE BLOB, AND THE EDITOR MUST SAY SO RATHER THAN INDEX.** Verified here on their own two samples: 1066 -> 42, inside OJZ's **320**-tile blob; **1456 -> 432, outside it** (and `BG_TILE_CAPACITY` is 448, so even in-capacity is not in-blob). Plane B can be showing engine art, another act's art, or a slot past the blob's end, and `tile < 1024` rebases NEGATIVE. **Any click-to-identify consumer must answer "not part of your background" for those** — an unchecked rebase either throws or, worse, names a slot the author does not own. This is the same two-correct-axes failure that cost an afternoon on the marquee; the space is stated in the field's own description, so there is no excuse for inferring it. ✅ **TAGGED QUESTION CLOSED 2026-08-27 — the band STEPS, proven with a control run.** (`docs/reviews/2026-08-27-band-lens.md`; instruments `scratchpad/band-lens-harness.mjs` + `scratchpad/band-step-proof.mjs`.) The gate is open: a freshly spawned server advertises **46 methods** including `get_layer_states`/`set_layer_enabled`, verified **by executing**, not by grepping their source. **The finding that matters for any future lens work: a SCREENSHOT DIFF CANNOT ANSWER WHETHER A BAND STEPS.** A band DMAs new pixels into fixed slots, so the nametable tile index never moves — 0 of 27 plane-B sample points changed tile id across 90 frames while the screenshots differed on every capture, and the screenshot is the more persuasive of the two. The quantity that answers it is **VRAM tile bytes at the band's own slots, against a control run of blob slots the band does not own**: 6 distinct band contents across 6 captures, control byte-stable throughout, which is what separates stepping from scrolling and from a wholesale art reload. Original text follows for the record. Oracle has `get_layer_states` / `set_layer_enabled` in flight and picked that parcel for exactly this case — hiding plane A to see what a band actually paints underneath. **This lane is the registered first consumer.** They will signal when it is **served and reachable through a REBUILT BINARY**, not when it merges — a distinction that repo already paid for once. Do not attempt the question before a session relaunch gives this lane a private instance. **How to check in one command:** `pgrep -P <shim pid>` — no child means no private instance means you are about to attach to whatever holds the chain.
- **`mcp__oracle__*` in this session SPAWNS A PRIVATE EMULATOR by default — it is NOT the window
  the owner is watching** *(item 38, 2026-08-26; empyrean protocol §7.1 at `5ff8c9f`, the CR-SOCKET
  ruling under the owner's d-4)*. Two arrangements, and a client MUST know which it is in: **own
  instance** (the shim starts `oracle-aether <rom> --socket <private mkdtemp path>`; the env order is
  not consulted) and **attached** (path SELECTED once by the first set of `$ORACLE_SOCKET`,
  `$EXODUS_SOCKET`, `$XDG_RUNTIME_DIR/oracle.sock`, else `/tmp/oracle.sock`; no step probes).
  **So a foreground check of the owner's `oracle-frontend --aether` window needs `ORACLE_SOCKET`
  set to that window's socket** — otherwise every read is of a second, private machine and reads as
  a clean confident answer about the wrong one. Aurora's `AETHER_CONNECT` attaches by design (it
  drives the watched emulator) and reports absence rather than spawning — conformant per §7.1's
  2026-08-26 scope clause. `socket-path.ts` re-checked against §7.1 clause by clause at item 36: the
  one divergence, exported-but-empty treated as unset, is recorded in §11.19 and not ruled against.
- Emulators: `oracle-aether <rom>` headless for harnesses; `oracle-frontend <rom>
  --aether` when a human needs to SEE it. Its startup banner's method count is the
  freshness tell — a mismatch between the two binaries means one is stale, not that the
  hosted build is restricted.

## Quirks

- `npm run build` before relaunching Electron; the app serves `dist/`, not source.
- Never bare-`pkill` on a pattern that matches your own shell command line — it kills
  the shell mid-script and leaves you reading a stale log as if it were fresh.
- **Do not run `cargo` in `oracle-next`** — that pipeline is serialized and concurrent
  cargo has corrupted their evidence repeatedly. Ask that session to rebuild.
- Builds spawned from Aurora need `SIGIL_BUILD`/`SIGIL_EMIT` in the environment; a
  desktop-launched Electron inherits none of a terminal's exports, so the failure reads
  as a broken repo rather than a missing variable. `project.json` `buildEnv` is the
  durable fix.
- Aeon's tree may be live-edited by its own session. Building it from here is normal
  authoring; landing anything in it is not.

- **⚠ A PINNED AEON CHECKOUT IS NOT A PINNED BUILD — THE TOOLCHAIN IS THE UNPINNED INPUT**
  *(2026-08-27; `docs/reviews/2026-08-27-fixture-build-drift.md`, corrected at `b1c15d0`.)*
  A `git clone` of aeon at a fixed SHA, tracked tree clean throughout, built to `4b4f1b5b`
  and later to `f33b157e` — deterministically, never returning. `build.sh` takes **two
  binaries from the environment and the checkout pins neither**: `SIGIL_EMIT` (which *writes*
  `engine/sound/generated/`) and `SIGIL_BUILD` (the assembler). Both live in **sigil's live
  working tree**, an active lane that relinks them during the day; both moved inside one
  build window here. **So a cross-session CRC comparison is meaningless unless both sides
  carry the same assembler revision** — quote `build.sh`'s own `Assembler: sigil <rev>`
  banner (match on that TEXT, never a line number) beside every CRC recorded or handed out.
  Adopted by the aeon lane as their landing bar at aeon `fd6ccc8e` (verified: reachable from
  their `origin/master`, and it is an `OVERSEER.md` bar commit — the right class for a bar).
  **My first diagnosis of this was wrong and the error is the lesson:** I wrote *"the checkout
  SHIPPED gitignored artifacts"* into a committed packet **with no line cited**, and the aeon
  lane accepted it and built a careful, inapplicable `cp -r` explanation on top. A clone
  cannot carry ignored files; the reflog and `git ls-tree <sha>` each settle it in one
  command, and neither of us ran either. Bar 2f, by this file's own author, two days after
  writing it down.
  ⚠ **AND THE BANNER'S `tree:` FIELD IS VACUOUS TODAY — DO NOT RECORD IT AS A SIGNAL.**
  *(Caught by the sigil lane before this bar was banked, and verified here against the shared
  binary.)* `sigil --version` reports `tree: dirty at capture — 0 modified, 1 untracked`, and
  that **1 untracked is `docs/lane-status.json`** — permanently present, read by no build,
  incapable of changing a byte. The flag is **stuck on**, so it can only ever return one
  answer: bar 2e in the very instrument this bar was about to adopt as its defence. Its own
  `freshness:` line concedes the second half — *"tree state is a build-time snapshot; cargo
  has no trigger for uncommitted"* — so it is **stale by construction** as well as stuck.
  **The `revision:` half is load-bearing; the `tree:`/`-dirty` half is not.** Enumerated
  across the suite from here, which sigil could not see from inside their own repo:
  `docs/lane-status.json` is **tracked** in aeon, oracle, seraph and empyrean, and
  **untracked-but-ignored** here — **sigil was the only lane where it was untracked AND not
  ignored**, which was the whole cause.
  ✅ **CAUSE FIXED at sigil `e5bd4a4f`** (verified here: reachable from their `origin/master`,
  a `.gitignore` commit, and their main checkout's `git status --porcelain` is now empty).
  ⚠ **BUT THE FIELD IS NOW *STALE*, NOT FIXED, AND THE DIFFERENCE IS OPERATIONAL.** `tree:` is
  a **build-time snapshot** cargo has no trigger to refresh, so the shared binary **still
  prints `fbf60abd-dirty` today** — the cause was removed, the reported value was not. **The
  tell that the fix has actually reached the banner is a `revision:` that is NOT `fbf60abd`;
  it is NOT the dirty flag clearing.** Do not read a stale `dirty` as "sigil never fixed it",
  and do not start trusting `tree:` until a relinked binary proves it can say `clean`. Sigil
  is deliberately **not** relinking to make it true while aeon has a seven-ROM freeze pinning
  the shared binary — which is this bar's own hazard being honoured, and is the right call.
  ⚠ **THE GENERAL RULE, and it is why "quote the banner" was the wrong operational form of a
  correct rule: A PROVENANCE RECORD IS NOT ONE CLAIM, IT IS SEVERAL, AND THEY DO NOT SHARE A
  CLOCK.** `revision:` follows git refs (cargo re-captures on HEAD/refs moves); `tree:` follows
  a *build* (cargo has no trigger for uncommitted). **Same line of output, two freshnesses, and
  nothing in the formatting says so.** Adopted by the aeon lane as the headline of their own
  bar. The question it hands the next person, in place of a fact to memorise: **which
  components of this record can move, and on whose schedule?** Ask it before quoting any
  provenance field — version banners, build stamps, `--version` output, embedded SHAs.
  **Downstream consequence worth knowing** *(aeon's, from this enumeration)*: because aeon
  **tracks** that file and edits it all session, their main tree is effectively always dirty,
  which is why their golden freezes must run from a clean worktree. They had been reading that
  as a property of the freeze tooling; it is a property of the status-file convention.

- ⚠ **BEFORE BUILDING AEON, GO READ SIGIL'S `docs/OVERSEER.md` — THIS FILE DOES NOT KNOW WHETHER A RELINK HOLD IS IN FORCE, AND CANNOT.** *(2026-08-27. This row deliberately states a PROCEDURE and no STATE.)*

  ```sh
  git -C ../sigil fetch -q origin && \
  git -C ../sigil show origin/master:docs/OVERSEER.md | grep -i -A20 'relink hold'
  ```

  **Why this row carries no hashes, no dates and no "currently there is/isn't a hold": every version that did was WRONG WITHIN THE HOUR.** The sequence, all on 2026-08-27, and it is the argument:
  1. A hold was banked here with its hashes → **sigil lifted it**, and the row became a false prohibition.
  2. Replaced with a lift **receipt** carrying the verified hashes → **sigil landed and relinked all three**, and the receipt became stale numbers that read as current history. **A receipt is a present-tense claim too, and it is the worse case** — a hold announces itself as a constraint to evaluate, while a receipt reads as settled and invites no scrutiny (the sigil lane's formulation, and they proposed the date rule).
  3. Replaced with *"standing property, NOT a hold — nothing is in force"* → **aeon requested a fresh hold minutes later.** My "nothing is in force" was accurate when written and false before the message announcing it arrived.

  **Three corrections, each one level more abstract than the last, and each still a present-tense claim about somebody else's work.** The general rule, paid for three times: **a fact that can only be correct in ONE place must live in ONE place, and every other place points at it.** Sigil's doc is where a hold's existence and its hashes are current, because they are the lane that changes both. **Anything this file says about that state is a snapshot, and snapshots of another lane's live state are wrong by default.**

  **What IS durable and safe to keep here** — properties, not state: `SIGIL_BUILD` **moves routinely** (sigil lands from their main checkout and every landing relinks; three hashes moved inside one morning). **Never pin a cross-session comparison to a sigil `revision`** — it names a property of the *source*, so it is **both insensitive and prone to false alarms**: it cannot detect a relinked artifact, and it fires on a healthy one when another lane commits mid-run. One property, both failures. **Hash the binary you actually executed and quote that.** Three of sigil's four release binaries print no revision at all. ⛔ **And never run ANY `cargo` command in `/home/volence/sonic_hacks/sigil`** — the rule is about the **file, not the verb**: a `cargo test --release --workspace` relinks the identical artifact, which is what caused the 2026-08-27 incident.

## ⚠ A CROSS-REPO GREP IS SCOPED TO THE REPO IT RAN IN — and the ruling built on it inherits that scope

*(Added 2026-08-27, from the hub's `precision` ruling under the owner's overnight delegation.)*

The hub ruled `precision` removed from the shared effects schema and priced it: *"no shipped
scene file carries it (aeon origin/master grep hits only `tools/effects_gen.py` + its test)"*.
The ruling is right. **The price was wrong, because the grep enumerated aeon's tree and the
schema's other consumer is this one** — both Aurora golden fixtures carry `precision: "cell"`,
and with `unevaluatedProperties: false` a re-pin fails validation on both.

**The half that makes this worth a bar rather than a correction:** the two fixtures are not
equally fixable, and the difference is invisible from outside this repo.
`test/fixtures/effects/canopy_dusk.json` is writer-**certified** — hand-written for shape
coverage, then proven byte-identical through `serialize(parse(GOLDEN))` — so editing it is
legitimate. `writer_session_ojz.json` is writer-**originated**: it came off disk from a real
authoring session and its own `.provenance.md` says *"re-run the session — do not edit the
JSON. Editing it converts it into a second `canopy_dusk`, silently."* Its value is that it was
enumerated over the UI's affordances rather than the schema's, which is a frame nobody chose
while writing the schema. **So the obvious fix — delete the key — destroys the only property
the fixture exists for, and leaves a green suite behind.**

**Operational form: when a ruling's cost line rests on an enumeration, ask which repo the
enumeration ran in, and whether the thing being priced has consumers outside it.** A schema
has as many consumers as it has vendored copies. This is the enumerate-across-instances
lesson (bar 2e's sigil corollary) firing across repos instead of across lanes — the hub could
not see this from inside empyrean, and I could not have seen their half from inside aurora.
