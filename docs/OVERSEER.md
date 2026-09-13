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
git -C ../empyrean show origin/main:docs/OVERSEER.md | grep -nE "OWNER(, VERBATIM)?,? [(~]?20[0-9]{2}-"
```

⚠ **FIXED 2026-09-11: THE OLD FORM WAS `grep -n "OWNER, 20" | tail -20` AND IT MISSED EVERY CURRENT
INSTRUCTION.** The hub now heads his words `OWNER, VERBATIM, 2026-…`, which that pattern cannot match.
Measured at empyrean `origin/main` that night: 13 hits for the old form and 18 for this one, and the five
it missed included all three standing instructions then in force (the 09-10 overnight order, the 09-11
"besides seraph" go, and the 09-11 clearing rule). The file is also NEWEST-FIRST, so `tail` kept the oldest
entries. Read the WHOLE list, top first. And if it prints nothing, suspect the pattern before concluding
there are no standing words.

Read the entries verbatim, not the hub's reading of them. **Instance:** at 05:38Z the owner put aurora in a four-lane overnight run — *"get
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

### This file is bounded, and shrinking it is THREE moves — the first is a MEASUREMENT

*(Suite contract: `OVERSEER-PROTOCOL.md` "The boot read is bounded" and `contract/LANE_STATUS.md`
rule 7, both at empyrean `f4d6d4b`; the three moves at empyrean `a1dcc7c`, this lane's finding
adopted back. Read them there, not from this summary.)*

`docs/OVERSEER.md` is the boot read: target ~100 KB. Dated tails and closed narrative go to
`docs/OVERSEER-LOG.md`, which nothing reads at boot. **A ruling that must survive a rotation is
written HERE as well as there, never only there.** `docs/lane-status.json`: title ≤240, ≤20 rows,
≤12 KB — assert the three in the script that writes it, don't read them back afterwards.

**Owner, 2026-09-13T21:53:38Z, verbatim: *"cut sounds good."*** — his go to the hub's proposal that each lane cut its own `OVERSEER.md` to about 40 KB by when a rule is read (his words at empyrean `492a2ac` `docs/OVERSEER.md` line 79, the proposal at line 81, both read there).

**Run `npm run check:lane-status` after EVERY write to that file.** ⚠ **The console FAILS SOFT on everything it notices** — corrected 2026-09-10 against dominion `ff0ddd3` `server/src/laneStatus.ts`, after the hub's sweep found the two clauses below false and their root in `contract/LANE_STATUS.md` rather than here. It does NOT count `next` rows at all, so a queue with **zero** renders `ok` and reads to your successor as a lane with nothing to do — indistinguishable from one genuinely idle (verified live: my zero-`next` file rendered `ok` while this check went red). An **unknown `state`** does not reject anything either: the row becomes `unreadable` with a `stateProblem` and the file stays `ok`, so "validates the enum" — which this line used to say — sets you expecting a red you will not get. A **future `updatedAt` no longer rejects the file**: `parseLaneStatus` sets `updatedAtTrusted: false`, delivers the document, and only the AGE declines to render. **That inversion is the worse hazard, not the milder one** — a rejected file is a dark card somebody asks about; a lane that passes as healthy while one field quietly abstains is what a scanning reader reads as fine. That happened twice in one night on 2026-09-04/05, the second time two hours after banking a note telling myself not to; a note did not hold and this check does. It also catches duplicate queue ids (a wholesale rewrite reintroducing a row you deliberately removed), unknown states, a future `updatedAt`, and a row marked `doing` with no agent in `inFlight` while `atBoundary` is true. Edit the FIELD, never rebuild the document — then run the check, because editing in a script is exactly when the invariant slips.

**(1)** A bar that COPIED protocol text becomes a pointer — **but only lines a grep finds verbatim
in `origin/main:docs/OVERSEER-PROTOCOL.md`.** A bar that CITED the protocol and wrote local
precedent under it is **not** a duplicate, and the two look identical in a listing: same SHA, same
parenthetical. Measured here 2026-09-02: **3 of 125 lines** under the nine bars this file labels as
shared-protocol duplicates were verbatim. Pointer-ising the rest would delete the local half and
report compliance for it. **(2)** Closed history around a live rule moves to the LOG verbatim; the
rule stays and gets rewritten legibly. **(3)** Rewriting live repo-specific rulings interleaved
with narrative is **the owner's parcel**, not a lane's tidy-up.

⚠ **Judge by BYTES.** Unwrapping a multi-kilobyte one-line bullet raises the line count while
cutting bytes — this file went 1,238 → 1,148 lines but 121,317 → 108,607 B — so the line bound can
move the wrong way under a correct fix. **⚠ THE "STANDING RESIDUAL: STILL ~8.6 KB OVER" THIS LINE CARRIED IS SPENT — MEASURED 83,372 B ON 2026-09-12, ~16 KB UNDER THE BOUND, WITH THE CUT SINCE LANDED.** It is kept as its own worked example rather than deleted: a byte count is a PRESENT-TENSE CLAIM about a file that changes every session, it sat in the boot read being quoted as current for days after the cut that answered it, and **nothing in its wording could ever have gone stale loudly** — the same defect as a hold whose end condition lives inside its own prose. **Measure before citing any number in this file** (`wc -c docs/OVERSEER.md`), and when you add bytes here, re-measure rather than trusting this sentence — including this one.

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

### ⚠ CUT THE CEREMONY — OWNER, 2026-09-02T18:20:19Z. ⚠ ITS CONDITION HAS LAPSED — TEST IT, DO NOT ASSUME IT

**Read it at the artifact, not from this line** — it is the bullet beginning `2026-09-02T18:20:19Z — CUT THE CEREMONY` in empyrean's `docs/OVERSEER.md`, carried by empyrean `90554f2` (verified here an ancestor of `origin/main`, and read at that revision before this line was written):

```sh
git -C ../empyrean fetch -q origin && \
git -C ../empyrean show origin/main:docs/OVERSEER.md | grep -n -A2 "18:20:19Z"
```

Deliberately a pointer and not a summary: clause 2 of the ruling is a moratorium on boot-doc growth, so restating it here would be the first thing it forbids.

⚠ **CLAUSE 2 HAS LAPSED BY ITS OWN TERMS AND THIS LANE OBEYED IT ANYWAY, TONIGHT (2026-09-10).** Its text ends *"until EFFECTS-W1 ships"*, and `contract/projects.json` at empyrean `origin/main` has read `EFFECTS-W1 state = done` **since 2026-09-06**. Four days. The heading above used to state the condition and nothing tested it, which is the whole defect: **a rule whose END CONDITION lives inside its own prose keeps being obeyed long after it lapses, because the condition is a fact about ANOTHER repo's file that nothing re-reads.** Aeon hit the identical clause the same hour, independently, having quoted it as live at every boot since 09-03 (aeon `8caa9dd4`); two lanes, no contact, same dead clause. **Test the condition before citing it — one command, and it is the only honest way to read this section:**

```sh
git -C ../empyrean fetch -q origin && \
  git -C ../empyrean show origin/main:contract/projects.json | \
  python3 -c 'import json,sys; print(next(p["state"] for p in json.load(sys.stdin)["projects"] if p["id"]=="EFFECTS-W1"))'
```

**What actually survives, read clause by clause at the artifact rather than taken from this summary.** The header's *outranking* scope is `while EFFECTS-W1 is open`, so the ruling **no longer outranks** the other process bars in this file. **Clause 2** (no new process bars, no rulings about rules, no boot-doc growth) carried the end condition in its own sentence and is **spent**. **Clause 3** (DoD items and the bug tier only; no instrument, ledger or cross-lane work unless it blocks a DoD item or ships wrong output) carries **no end condition of its own** and stands as an owner-applied instruction — it simply stopped outranking. And beneath all five clauses the owner's own words are undated and were never scoped to a project: *"cut anything that's arbitrarily slowing us down without an actual good reason"*. **The preference outlives the application.**

⚠ **DO NOT REBUILD THE BARS CLAUSE 2 SUSPENDED JUST BECAUSE IT LAPSED.** A moratorium ending is not an instruction to resume; it returns the question to ordinary judgement, and the reason each bar was cut is still on the record. **Worked example, this lane, the night the lapse was found:** a real defect (a fix reported as closed while the one instrument able to refute it had never run against it) invited a new gate. It was declined — on the ground that the checkable form needs a hand-filled *"when did this instrument last run"* field, and a gate that goes green on an author's belief is the shape this repo has paid for repeatedly. That reason is independent of the moratorium and is the better argument; the moratorium was cited beside it and was already dead. **Rest a refusal on the reason, not on the hold** — a hold can lapse without telling you, and a reason cannot. The two clauses this lane trips over most are (2) no new process bars and no boot-doc growth, and (3) DoD items and the bug tier only — no instrument work, no cross-lane audits, no re-measuring a peer's numbers, **unless it blocks a DoD item or ships wrong output**. Banked 2026-09-03 at the hub's ask; four other lanes hold the same pointer.

### Addressing the hub

⚠ **REPORT TO THE HUB EVERY TIME YOU FINISH A PIECE OF WORK OR STOP — OWNER, 2026-09-03T05:21:01Z**,
verbatim: *"tell the agents any time theyy finish work or stop to report to you please, loosk like
aeon's stopped right now"* (empyrean `f04afe3`, verified reachable from `origin/main` and read at
that revision here, not from the relay). A landing, a boundary, a block, an owner question, or an
agent returning and leaving nothing running — each gets one message saying what landed (SHA from
git output, never typed from memory) or why you stopped, and what you need. **Going quiet without a
message is the state he named**, and he named it while watching a lane whose board still claimed it
was working. Note what the rule is really about: `lane-status.json` already carries all of this, and
he asked anyway — a file he has to go and read is not a report.

**Send hub traffic to the lane named `empyrean`**, not to a session display name. The 2026-08-29
episode that established this — a dock session that accepted `SendMessage` and silently held three
reports undelivered, and the owner's hedged *"1. I think so"* behind it — is in
`docs/OVERSEER-LOG.md`. **The durable lesson is there too and is worth the click:** in a file where
every other owner directive is quoted verbatim, the one establishing who directs six lanes was
paraphrased, and nothing about it looked wrong. Ask for the quote.

### Say when you need a CONTEXT CLEAR — RELAYED 2026-09-09, sibling of the report-when-you-stop rule

**Relayed by the hub, transcribed:** *"Remind the agents to let us know when they need a clear."*
⚠ **RELAY, not yet in the committed record.** Checked at `origin/main:docs/OVERSEER.md` when it
arrived (tip `1530dd3`) and it is not there; the hub was asked to commit it. Acted on anyway
because it costs nothing and asks for disclosure rather than for work — **but a successor must
not read this as an owner directive witnessed here.** Same class as the entry above it, and
this file's own rule: name the granting act.

**What it asks:** do not silently run down to a compaction or drift through one. When a clear
would help, **say so in the message to the hub AND in `lane-status.json`'s `awaiting`**.

⚠ **AMENDED SAME DAY, oracle's form, which is better than the one first relayed and better than
what this lane first wrote. REPORT THE MEASUREMENT, NOT A FEELING.** The risk is **not** a
session refusing to ask out of stubbornness. It is that **a session near its limit is the least
able to judge that it is** — so the judgement is not the lane's to make. Report two numbers and
let him decide: **what fraction of the context window is gone, and what is unbanked.**

**A lane that says "I feel fine" has produced exactly the artifact nobody can check** — the same
defect as an `updatedAt` written from a session's own sense of the time rather than from the
clock, and this lane wrote one of those sentences before the amendment arrived.

⚠ **AND IF THE NUMBER IS NOT AVAILABLE, SAY THAT — never substitute the feeling it would have
replaced.** *Loud on unmeasurable*, the same bar every gate in this repo is held to.

⚠ **BUT MEASURE BEFORE CLAIMING IT IS UNAVAILABLE — THE NUMBER EXISTS AND THIS LANE FOUND IT
2026-09-09 AFTER FIRST REPORTING IT COULD NOT.** `node scratchpad/context-usage.mjs [session-id]`
(the id is the last component of this session's scratchpad path). Every assistant turn in the
session transcript carries a server-produced `usage` record, and
`input_tokens + cache_read_input_tokens + cache_creation_input_tokens` **is exactly the context
sent that turn** — a real number, produced by the server rather than by the session, monotonic
within a window, **so a large DROP in the series IS a compaction.** That is the event this rule
exists to stop a lane drifting through unnoticed, and it is now detectable rather than felt.

⚠ **DO NOT USE THE `<total_tokens>` COUNTER FOR THIS.** Measured here: it **reset upward
mid-session** (~13.65M → 15.0M). **It is a budget, not an occupancy**, and a percentage derived
from it has a confident shape and no meaning. The refusal to quote it was right; the mistake was
stopping at the refusal instead of looking for the instrument. **A missing number is a reason to
go and measure, not a licence to say nothing** — and the reverse of this file's own bar: an
instrument that cannot report its own blindness is broken, but a session that reports blindness
without checking for an instrument is doing the same thing from the other side.

⚠ **THE DENOMINATOR IS STILL NOT MEASURED.** The script prints the numerator and refuses to guess
a window size. Report the absolute number unless you know the window.

⚠ **THE ANCHOR IS A FILE AT A COMMITTED SHA, NEVER A SUMMARY**, and oracle's reason is the one to
keep: **a summary is written by the session about to stop, it is the one artifact its successor
cannot verify, and it lives only in a message where no reader can meet the contradiction.** A
path plus a SHA is re-derivable by whoever picks it up. This lane has paid for the difference: a
position that lived only in a message did not survive a `/clear`, and the successor contradicted
it an hour later.

**Why it is the sibling of the 05:21:01Z rule and not a new kind of thing:** that one says a
lane going quiet must say why; this one says a lane going *stale* must say so before it does.
Both are about the same failure — **the console shows a lane that looks fine right up until the
moment its answers stop being trustworthy.**

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

Moved to `docs/OVERSEER-LOG.md`. It is the record of what was believed before he answered, and the
worked example of banking a relay with its limit rather than laundering it into "the owner told
Aurora". The grant above is what governs.
## What the overseer implements

Aurora is a TypeScript/Electron app: features, tests and harnesses all go to agents in
worktrees. The overseer's own work is judging returned work, running the **foreground**
runtime harnesses ("Instruments" in `docs/OVERSEER-REFERENCE.md` — agents cannot), rulings, and landing.

## Read at a specific moment → `docs/OVERSEER-REFERENCE.md` and `docs/OVERSEER-REVIEW-BARS.md`

None of these is read at boot. Each is read whole, at the moment named here; every section moved to the reference file keeps its heading in this file as a one-line stub.

- **Editor↔engine coordination points** (`docs/OVERSEER-REFERENCE.md`): before any Aether/bus/emulator work, any aeon build, or writing a brief that touches those.
- **How a landing goes, and the gap it exists to close** (`docs/OVERSEER-REFERENCE.md`): before merging or landing anything.
- **Instruments** (`docs/OVERSEER-REFERENCE.md`): before running or dispatching any CDP harness, rig or emulator work.
- **Aurora-specific review bars** (`docs/OVERSEER-REVIEW-BARS.md`): when you judge returned work, land a parcel, or write a dispatch's review clause.

## Aurora-specific review bars → `docs/OVERSEER-REVIEW-BARS.md`

**Moved 2026-09-04, whole and verbatim, under the SPLIT BY WHEN A RULE IS READ amendment
(empyrean `79498f7`) and the owner's card-7 ruling.** They are read when you judge returned
work, land a parcel, or write a dispatch's review clause — never at boot, which is the test the
amendment sets.

⚠ **They are not optional and they are not history.** Each has caught a real defect here, and
several are cited by other lanes' docs. **Read `docs/OVERSEER-REVIEW-BARS.md` at the moment you
review** — a bar you have not read is the one that fires.

**Bar NUMBERS are unchanged, so every existing citation still resolves.** This repo's packets
carry ~800 references of the form *`docs/OVERSEER.md` bar N*, and they are **history — they
record what was cited at the time and are not being rewritten.** Read any such citation as
naming `docs/OVERSEER-REVIEW-BARS.md` bar N. ⚠ **A citation carrying a LINE number
(`docs/OVERSEER.md:578`) was already fragile before this move and is now wrong; resolve those
by bar number, never by line.**

## Editor↔engine coordination points

Moved whole to `docs/OVERSEER-REFERENCE.md` (same heading); read it before any Aether/bus/emulator work, any aeon build, or writing a brief that touches those.

## How a landing goes, and the gap it exists to close

Moved whole to `docs/OVERSEER-REFERENCE.md` (same heading); read it before merging or landing anything.

## Instruments

Moved whole to `docs/OVERSEER-REFERENCE.md` (same heading); read it before running or dispatching any CDP harness, rig or emulator work.

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
  *(2026-08-27; `docs/reviews/2026-08-27-fixture-build-drift.md`, corrected at `b1c15d0`. The
  episode — two CRCs off one clean checkout, the vacuous-`tree:` finding, the cause fixed at sigil
  `e5bd4a4f`, and my own uncited "the checkout SHIPPED gitignored artifacts" misdiagnosis that the
  aeon lane built on — is in `docs/OVERSEER-LOG.md` → *"The pinned-checkout / pinned-build bar, as
  it stood"*.)*
  `build.sh` takes **two binaries from the environment and the checkout pins neither**: `SIGIL_EMIT`
  (which *writes* `engine/sound/generated/`) and `SIGIL_BUILD` (the assembler). Both live in
  **sigil's live working tree**, an active lane that relinks them during the day. **So a
  cross-session CRC comparison is meaningless unless both sides carry the same assembler
  revision** — quote `build.sh`'s own `Assembler: sigil <rev>` banner (**match on that TEXT, never a
  line number**) beside every CRC recorded or handed out. Adopted by the aeon lane as their landing
  bar at aeon `fd6ccc8e`.
  ⚠ **BUT `revision:` IS THE LOAD-BEARING HALF OF THAT BANNER; THE `tree:`/`-dirty` HALF IS NOT.**
  `tree:` is a **build-time snapshot** cargo has no trigger to refresh, so it is **stale by
  construction** and can keep printing `-dirty` long after the cause was removed. **The tell that a
  fix has reached the banner is a CHANGED `revision:`; it is NOT the dirty flag clearing.** Do not
  read a stale `dirty` as a lane never having fixed it, and do not start trusting `tree:` until a
  relinked binary proves it can say `clean`.
  ⚠ **THE GENERAL RULE, and it is why "quote the banner" was the wrong operational form of a
  correct rule: A PROVENANCE RECORD IS NOT ONE CLAIM, IT IS SEVERAL, AND THEY DO NOT SHARE A
  CLOCK.** `revision:` follows git refs (cargo re-captures on HEAD/refs moves); `tree:` follows a
  *build* (cargo has no trigger for uncommitted). **Same line of output, two freshnesses, and
  nothing in the formatting says so.** Adopted by the aeon lane as the headline of their own bar.
  The question it hands the next person, in place of a fact to memorise: **which components of this
  record can move, and on whose schedule?** Ask it before quoting any provenance field — version
  banners, build stamps, `--version` output, embedded SHAs.
  **Downstream consequence worth knowing** *(aeon's)*: because aeon **tracks**
  `docs/lane-status.json` and edits it all session, their main tree is effectively always dirty,
  which is why their golden freezes must run from a clean worktree. That is a property of the
  status-file convention, not of the freeze tooling.

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

## Decision closures made before rule 8d

The twelve pre-rule closures in `docs/decisions.jsonl`, their `by` classification, and the two
entries that look like closures and are not (`d-6`, `d-18b`) are registered in
`docs/OVERSEER-LOG.md`. **It is a register, not a backlog: do not add `answered` to any of them, and
do not "fix" them.** From here on, closures carry `answered`.