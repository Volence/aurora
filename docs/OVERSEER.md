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

### This file is bounded, and shrinking it is THREE moves — the first is a MEASUREMENT

*(Suite contract: `OVERSEER-PROTOCOL.md` "The boot read is bounded" and `contract/LANE_STATUS.md`
rule 7, both at empyrean `f4d6d4b`; the three moves at empyrean `a1dcc7c`, this lane's finding
adopted back. Read them there, not from this summary.)*

`docs/OVERSEER.md` is the boot read: target ~100 KB. Dated tails and closed narrative go to
`docs/OVERSEER-LOG.md`, which nothing reads at boot. **A ruling that must survive a rotation is
written HERE as well as there, never only there.** `docs/lane-status.json`: title ≤240, ≤20 rows,
≤12 KB — assert the three in the script that writes it, don't read them back afterwards.

**Run `npm run check:lane-status` after EVERY write to that file.** The Dominion console validates the `state` enum but NOT the exactly-one-`next` rule, so a queue with zero next rows renders as `ok` and reads to your successor as a lane with nothing to do — indistinguishable from one that is genuinely idle. That happened twice in one night on 2026-09-04/05, the second time two hours after banking a note telling myself not to; a note did not hold and this check does. It also catches duplicate queue ids (a wholesale rewrite reintroducing a row you deliberately removed), unknown states, a future `updatedAt` (which makes the reader reject the whole file), and a row marked `doing` with no agent in `inFlight` while `atBoundary` is true. Edit the FIELD, never rebuild the document — then run the check, because editing in a script is exactly when the invariant slips.

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
move the wrong way under a correct fix. **Standing residual: still ~8.6 KB over, and move (3) is
where the rest of it lives.**

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

### ⚠ CUT THE CEREMONY — OWNER, 2026-09-02T18:20:19Z. It OUTRANKS every process bar in this file while EFFECTS-W1 is open

**Read it at the artifact, not from this line** — it is the bullet beginning `2026-09-02T18:20:19Z — CUT THE CEREMONY` in empyrean's `docs/OVERSEER.md`, carried by empyrean `90554f2` (verified here an ancestor of `origin/main`, and read at that revision before this line was written):

```sh
git -C ../empyrean fetch -q origin && \
git -C ../empyrean show origin/main:docs/OVERSEER.md | grep -n -A2 "18:20:19Z"
```

Deliberately a pointer and not a summary: clause 2 of the ruling is a moratorium on boot-doc growth, so restating it here would be the first thing it forbids. The two clauses this lane trips over most are (2) no new process bars and no boot-doc growth, and (3) DoD items and the bug tier only — no instrument work, no cross-lane audits, no re-measuring a peer's numbers, **unless it blocks a DoD item or ships wrong output**. Banked 2026-09-03 at the hub's ask; four other lanes hold the same pointer.

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
runtime harnesses (below — agents cannot), rulings, and landing.

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

✅ **BOTH CONDITIONS ARE MET, VERIFIED FIRSTHAND HERE 2026-08-29 — the parcel is CLOSED.** The
closed narrative (this session's own probe against a privately-spawned server, the unasserted-seam
finding and its fix at oracle `843b99a`, and the `implementation`-literal correction they made to
this lane) is in `docs/OVERSEER-LOG.md` → *"The `initialize` build-identity parcel, as it stood"*.
What stays live:
- **Read `implementation`, never `serverName`.** `implementation` (`"oracle-rs"`) names WHICH
  SERVER; `serverBuild` = `{id, source, dirty}` names WHICH BUILD; they fail **independently**,
  which was the whole ask. **`serverName` is still `"oracle-next"` and `serverVersion` still
  `0.0.0`** — a config default and a literal that has never moved. Neither can tell you which
  server answered.
- ⚠ **`serverBuild.id` IS A TREE IDENTITY, NOT A CODE IDENTITY.** It names *whatever HEAD was at
  build time* — the id on the shipped binary resolved to a **docs-only commit** — so two binaries
  with byte-identical behaviour can report different ids. **Use it for "is this the same binary I
  measured before" (staleness). NEVER for "does this build contain feature X"**, which is
  `capabilities` and `methods`. Reading a code guarantee off a build id is the method-count failure
  wearing a better costume, and the sharper form of *a provenance record is several claims that do
  not share a clock*.
- **The 2026-08-24 relative-`romPath` discriminator is retired** — `implementation` answers it
  directly; keep the old note only as history.
- **The generalisation worth keeping, oracle's:** *a test per component and none across the seam is
  how a chain of individually sound links holds nothing* — **and a seam has no author**, which is
  why it took a reader who wrote none of the three tests. That is the mechanism behind this file's
  bar 18b, stated better than bar 18b states it. Its corollary, paid for in the same exchange:
  **when a check looks redundant, ask what each of the two claims is before collapsing them.**

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
- **THE RESUME/STOP RACE IS NOT REACHABLE FROM THIS CLIENT — AND THE DAY IT BECOMES REACHABLE IS
  NAMED** *(2026-09-02, oracle's F-RESUME-STOP-RACE; answered from source here at master
  `44f17ca8`. The narrative — their trial-4-of-8 measurement, the `engine_loop` trace, and the
  `run_to` answer read firsthand at oracle `7ba2faf` — is in `docs/OVERSEER-LOG.md` → *"The
  resume/stop race, as it stood"*.)*
  **Their race:** the halt broadcast comes off the engine thread while `ok(resume)` is written by
  the connection thread, so a client that resumes and then waits for a stop can miss it entirely.
  **Aurora cannot hit it, and the reason is STRUCTURAL rather than careful: nothing here awaits an
  event.** `AetherClient.onEvent` has one non-test consumer (a connection-badge refresh that
  discards the event), and **every sequencing point reads a REPLY** instead.
  ⚠ **THE PERISHABLE HALF: BREAKPOINTS MAKE IT LIVE.** Set-a-breakpoint, resume, wait to be told
  is precisely their shape, and it is the first thing Aurora would build on `breakpoint_add`, which
  is where oracle says the race still is. **So: no exposure while there is no breakpoint consumer,
  and the session that starts one must confirm the server-side fix landed BEFORE trusting a green
  run of its own** — a two- or three-run green on a race is exactly what would otherwise be signed
  off. Not an all-clear.
  ⚠ **AND THE HAZARD INVERTS ON `run_to`: it calls `emit_stopped` BEFORE it builds its reply**, so
  on the wire the `stopped` event PRECEDES the `run_to` reply. Read-through-to-the-reply is correct
  and unaffected (it discards the event and takes the reply); **a client that consumed the reply and
  THEN waited for the halt event would block forever.** That is the same race with the halves
  swapped, and it is the loop someone reaches for when writing a first breakpoint consumer. **Ping
  the oracle lane before writing that wait loop** — their standing offer, and they will say whether
  the server-side fix has landed.
  **Load-bearing for our own gate:** `run_to`'s result carries `"reached": run.predicate_fired` —
  *the predicate's own verdict, never the sink's*, because a `stopAfter` watch can end the run too.
  `bootRestore` gating on `reached !== true` is therefore reading the right field.
  **SCOPE, theirs, stated rather than widened:** all of the above is the **socket / free-run
  driver**. The **hosted** path — their player window through `Host::pump` — is a different driver
  and stays registered as their `F-STOPPREC-HOSTED-HALT`. **Nothing here upgrades that, and a claim
  about the hosted window may not cite this row.**

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
  so the stop is a STAGE and not a verdict on your bytes.
  ⚠ **CORRECTED 2026-09-05, and the correction is the more useful half — this row said the stop
  "presents as the `anims` refusal gate rejecting Aurora's bytes when it never judged them", and
  that is NO LONGER TRUE.** Measured against aeon `origin/master`: the staleness stop **names
  itself**, names which arm fired, lists the author's own files and gives the remedy, all before
  anything assembles (gate at `build.sh:438`, assemble at `:775`). A cold reader called it the best
  message of the day. The thing that DID mis-attribute was the `FAST=1` re-bake banner, which used
  to be `> /dev/null` with a fixed message that guessed at the cause — **aeon fixed that on
  2026-09-02** (their own comment at the arm says so). So this row was describing a defect that was
  repaired three days before it was read, and it was relayed into a dispatch brief as fact on
  09-05. **A label outlives its justification, and a boot doc is where that costs the most.**
  Two live facts that survive the correction: `FAST=1` **auto-runs the re-bake** (the arm's own
  words: *"re-bake instead of scolding"*), so only the plain `./build.sh` refuses after a save; and
  `touch` is **NOT a remedy** — aeon's message says so, and applying it measurably lit an mtime arm
  that had been quiet.
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
  reach** *(2026-08-24, closed the same day; the two verifications and the loud-failure evidence
  are in `docs/OVERSEER-LOG.md` → *"The built-binary enumeration parameter, as it stood"*)*:
  `oracle-aether` release bannered **37 methods** while oracle's source served 41 — the binary
  predated four landed methods. Two lanes had derived the count from source by different methods
  and agreed; both were blind to the artifact. **A consumer measuring the bus against an installed
  binary gets the old answer with nothing announcing it**, so a cutover must rebuild and **verify
  by EXECUTING, never by grepping source.** **Read the startup banner's method count, and treat it
  as the freshness tell it is.**
- **When `write_vram` is eventually built, require `bypassesVdpPort: true` in the reply**
  *(oracle's condition, recorded here because Aurora is the consumer)*. The debug read/write
  path skips the VDP port path, FIFO and DMA entirely. **The flag is what protects an agent;
  a cautionary name only helps someone who already suspects something.** Aurora's own ask for
  it is currently a *prediction with an unreachable revival condition* — see
  `reviews/2026-08-22-oracle-instrument-gaps.md`: the probe that would justify the method
  requires the method.
- **The BgAnim DRIVER IS ALIVE, and it TICKS EVERY FRAME ON A PLAIN `s4.bin` BOOT** *(ENGINE
  facts — re-derivable against aeon, no server question. Closed 2026-08-24; the call-site
  enumeration and the boot-path trace, link by link, are in `docs/OVERSEER-LOG.md` → *"The BgAnim
  driver, as it stood"*.)*
  **Dead DATA is not dead CODE, and keeping the two words apart is the point of this row.** OJZ's
  BG `anims` are wiped, so `BgAnim_Table: u16 = 0` (the disabled stub) and nothing animates — but
  `BgAnim_Init`/`BgAnim_Update` are emitted and are called. Both aeon's banked memory and this
  lane's carried a version of that confusion.
  **So the ROM half arranges nothing — build it and watch it.** No special entry, no test build
  shape, no harness. **And if a band loads but never steps, it is NOT the wiring** — look at the
  data or the proc body, and at that point it is plausibly an engine item and therefore aeon's.
  ⚠ **`test` IN A PATH IS A KNOWN-BAD SIGNAL IN AEON'S TREE, not a description.** The sole caller
  lives in a module named `test` **and that module is the shipping boot entry**. Both wrong readings
  this cost the suite — *"the driver is dead"* and *"it needs a harness"* — come from that one word.
  Treat `test` in an aeon path as unlabelled until checked.
  ⚠ **`engine/level/bg_anim.emp:103` reads *"call once per frame from the main loop"* — that is the
  CONTRACT THE PROC WAS WRITTEN TO, not a description of what calls it.** A reader who greps the
  definition finds a sentence that looks exactly like proof of a call site. **The fourth instance was
  found and relayed 2026-09-03 (O47) — this instruction is SPENT; do not re-relay.** It is the
  sharpest of the set and worth knowing while reading any aeon comment: inside ONE revision
  (`e190297c`), `tools/collision_pipeline.py`'s XOVER block says the engine does not read
  `CrossoverTable`, while `tools/ojz_strip_gen.py` **prints on every bake** that it does, and
  `player_common.emp` defines `Player_LoopCrossover` and `jbsr`s it in the per-frame path. **So the
  mechanism is not "nobody re-reads a comment" — it is that the two artifacts are never met in the
  same sitting:** one is source you read while implementing, the other is runtime output you read
  while operating. A comment can be refuted in front of its own author, routinely, and survive.
- **`.lst` listings carry a third `EQU` section**; oracle-next's parser handles it.
  Equates can never answer address lookups in either direction.

## Instruments

- **CDP harnesses** (`scratchpad/*-harness.mjs`) are how anything visual or live is
  proven. They launch Electron under `xvfb-run` with `AURORA_DEBUG_PORT`, drive it over
  CDP, and assert. `window.__dbg` (`src/renderer/debug-hooks.ts`) is the query/door
  surface — `aeon.open`, `openDir`, `aether.*`, `classic.*`, `canvas.*`. **It only exists
  in a `VITE_AURORA_DEBUG=1 npm run build`**; a plain build has no hooks and no port.
- **⚠ `xvfb-run` HAS NO TRAP, SO EVERY TEARDOWN USED TO LEAK AN X DISPLAY — CLOSED 2026-08-30, and the shape is worth carrying** *(O20; `docs/reviews/2026-08-30-xvfb-display-leak.md`, ROADMAP row 103)*. Its cleanup — `kill $XVFBPID`, `xauth remove`, `rm -r "$XVFB_RUN_TMPDIR"` — sits at `/usr/bin/xvfb-run:184-192`, **after** the line that runs the command at `:180`, with no `trap` anywhere in the file. Signal the wrapper and none of it runs, and signalling the wrapper is exactly what `killTree` does — **so O16's fix for the orphaned Electron is what guaranteed this leak.** `killTree`/`killTreeSync` now reap the display, scoped by descent (never `:0`, never a live server, never a directory outside `XVFB_TMPDIR_RE`), so **a harness that uses `spawnGuarded` needs no change**. Two lessons beyond the fix: **(a) THERE WERE TWO LEAK RATES AND THE UNCOUNTED ONE WAS 17× THE COUNTED ONE** — `/tmp/xvfb-run.XXXXXX/` tempdirs leak on *every* teardown (1504 on the box) while locks and sockets leak only on an abrupt one (89/73), because a SIGTERMed Xvfb tidies up after itself; the previous session counted the two visible classes, found them small, and reported the leak contained. **(b) THE RED ROW REFUSED TO REPRODUCE, AND THAT IS HOW THE REAL SHAPE TURNED UP** — the proof asserted all three artifacts survive a graceful kill, went red on its own RED row, and the correction was the finding. Sweeping the residue is **foreground** process work; never `pkill`, and never a display this session did not start.
- **⚠ THE SHARPEST VACUOUS-CHECK INSTANCE THIS REPO HAS: A FAILURE STATE AND A SUCCESS STATE THAT EMIT THE SAME ARTIFACT** *(2026-08-30, found by the coordinator planting into O20's own guard)*. `boundSocketPaths()` returned an **empty `Set`** when `/proc/net/unix` could not be read, while the comment beside it promised the caller would treat unknown as *do not touch*. The caller could not: `bound.has(sock)` over an empty Set is `false`, and `false` is the value meaning **proceed to delete** — so an unreadable table silently **inverted a refusal into a permission**. *"I could not look"* and *"I looked and nothing is bound"* were the same value; **no caller could have distinguished them, however carefully written.** The fix is a sentinel (`null`) the caller reads as refuse-everything, never a corrected comment. **Ask of any instrument: can it report its own blindness, or does not-looking render as a clean result?** — the same family as a `[ -S socket ]` reporting a corpse as a server, and as "couldn't measure" rendering as 0. **And it was found only because a poison was planted into a guard nothing tested**: emptying `NEVER_REAP_DISPLAYS` left the proof GREEN at 16/16, because a *neighbouring* gate refused the same input. **Bar 2d cause (ii) — a row that asserts only THAT something was refused cannot tell you WHICH gate refused it, and a gate resting on a neighbour is discovered the day the neighbour moves.** Every gate now has a row asserting its own refusal reason, verified by deleting each gate in turn. ⚠ **When plant-verifying, watch for a plant that EATS ITS OWN FIXTURE** — gate 4's deleted the directory it was meant to protect, so the second run of the same plant was already green. Read the first run, never the second.
- **WHERE A PEER CHECKOUT LIVES — the suite's names, not ours** *(SUITE-PATHS, 2026-09-02; empyrean `contract/SUITE_PATHS.md` at `origin/main` `82982b7ff3c057f347d538fcf61b7c62b18ee813`; ROADMAP row 106)*. Every instrument, test and script in this repo resolves a sibling repo through **one** derivation — `test/support/sibling-root.mjs` for JavaScript, `scratchpad/lib/suite_paths.py` for the Python ones, and `run-handover.sh` spells the same steps inline. **THE VARIABLES:** a checkout is `<NAME>_DIR` — **`AEON_DIR`**, **`S1DISASM_DIR`**, **`ORACLE_DIR`**, **`EMPYREAN_DIR`**, and **`AURORA_DIR`** for THIS repo's own tree — and the directory they hang off is **`EMPYREAN_SUITE_ROOT`**. Those are the names to type and the names to put in a dispatch. `AURORA_PEER_ROOT`, `AURORA_<NAME>_REPO`, `LIVE_AEON` and `AEON_ROOT` (aeon), `S1_DIR` (s1disasm), and `AURORA_ROOT` / `AURORA_REPO` (this repo) still WORK — they are transitional aliases, and using one prints a single stderr line telling you the name to switch to. **PRECEDENCE:** the checkout variable, then `EMPYREAN_SUITE_ROOT/<name>`, then a derivation from this repo's own `--git-common-dir` (so a worktree resolves correctly), then a refusal that names what it looked for. **⚠ A VARIABLE SET TO SOMETHING ABSENT IS NOW A HARD ERROR, not a skip.** `AEON_DIR=/nonexistent/...` used to become 250 reasoned skips that looked exactly like a machine without the data; it now stops the run and names the variable. **To reproduce a machine WITHOUT the reference trees — the old `AURORA_PEER_ROOT=/nonexistent/relocated` recipe — point the variable at an EMPTY directory instead:** `EMPYREAN_SUITE_ROOT=$(mktemp -d) npm test`. Every consumer prints the resolved root **and the step that answered** before doing work against it; `node scripts/check-peer-path-literals.mjs` and `node test/support/sibling-root.mjs` both print it on demand. **⚠ `AURORA_DIR` DOES NOT FALL BACK TO `EMPYREAN_SUITE_ROOT`** *(O69, ROADMAP row 107)* — for THIS repo the resolver's own file location is a direct observation rather than a guess, and if the suite root moved aurora too, the `$(mktemp -d)` recipe above would stop every instrument finding its own `dist/` and `src/` and a linked worktree would resolve to the MAIN checkout. **THE GATE NOW RUNS THREE RULES**, named on its own output line: the sibling literal, an executable line naming an **agent session scratchpad** (`<tmpdir>/claude-<uid>/…`, gone when that session ends), and an executable line going to `process.env`/`os.environ` for a variable the resolver owns — go through `siblingPathOrUnresolved(name)`, `checkoutOverride(name)` when an override is REQUIRED, or `AURORA_DIR`. Rule 3 does not cover `.sh`, which cannot import a resolver and spells the four steps in-file. **A HARNESS THAT MUST RUN AGAINST A COPY HAS NO DEFAULT AND REFUSES** (`guard-surface-harness`, `screen-frame-guides-harness`): unset, it stops at import naming the variable; set to the live tree, the `siblingDefaultPath` guard refuses. A default that is a dead path is the worst of both — it never trips the guard, so the run gets past the refusal and dies later and further away.
- **⚠ `node_modules/.bin/electron` DOES NOT EXIST IN AN AGENT WORKTREE.** npm resolves up to the main tree for everything else — `npx electron-vite build` and `npm test` both work — so this is invisible until a harness tries to launch the app and reports **UNMEASURABLE** (correctly, not falsely green). Run with `ELECTRON_BIN=<main checkout>/node_modules/.bin/electron` — on this machine `/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`, which is an EXAMPLE and not a default — or read the row as "not measured here", never as a regression. **Since SUITE-PATHS (2026-09-02) every harness takes `ELECTRON_BIN`**, and the fallback each one uses when it is unset is the resolver's answer for `aurora/node_modules/.bin/electron` rather than a typed path, so it follows the suite if the suite moves.
- **`npm run harness:band-preset` NO LONGER NEEDS A `timeout` WRAPPER — and the exit net is not a substitute for `await killTree(child)`** *(O65, 2026-08-30, branch `parcel/o65-harness-exit`)*. The summary-then-hang measured twice that day was `killTree(child.pid)`: the helper took the ChildProcess and read `.pid` off it, so a bare number was a SILENT no-op — all 12 processes of the tree (xvfb-run, Xvfb, Electron and its zygotes) outlived the harness's own `finally`, the harness's stdout/stderr pipes to them kept its event loop alive, and only the wrapper's SIGTERM ever reaped it (via the exit net, which is why nothing was left afterwards). Now: `killTree`/`killTreeSync` accept a pid too and shout on stderr (`NOTHING KILLED`) at anything else; band-preset passes `child`; the harness exits 0 within ~20 ms of its summary line (3+3 runs, `xvfb-run.*` count and locks unchanged). **The trap found on the way:** a harness that calls `killTree(child)` WITHOUT `await` and then `process.exit()`s (section-raster-select, bg-wrap, chunk-links) had been reaping only by accident — the net saw a tree the no-op had left alive. With a real SIGTERM the wrapper dies first, the Electron escapes the tree, and the net's fresh `/proc` walk from the dead pid finds nothing: one `/tmp/xvfb-run.*` per run (measured 23→24, control 23→23). `killTree` now records its pre-signal capture in `inFlight` and the net merges it, so that shape reaps again (23→23) — but it still skips the 4 s grace, so `await killTree(child)` remains the honest spelling. `harness-guard-proof.mjs` rows k6–k8 hold all three, red-first (`npm run harness:guard-proof`). **Ruled the same day (O65 part 2): the teardown is ORDERED** — `killTree` SIGTERMs the app pids from the captured descent first, waits (bounded by the grace, zombie-aware) for them to be gone, and only then signals the wrapper's group so the X server goes last; a single group SIGTERM had raced Xvfb against the Electron and, when Xvfb won, the browser process fataled (`Signal: 5 (TRAP) si_code: SI_KERNEL`, core Timestamp == the SIGTERM instant, in 6 of 17 band-preset runs — every `SIGKILLed 5` run, no `SIGKILLed 0` run). Instrument: `coredumpctl list --since <run start>` — old order 1 core in 6 runs (the race is not on demand), new order 0 in 4 (3 band-preset + 1 section-raster-select on a fresh copy), exit 0 at 14 ms after the summary, which itself fell from 25.5 s to ~21.6 s because the app is gone in ~50 ms and `xvfb-run`'s own cleanup then releases the display (the new `cleanup: ORDERED — …` line prints both phases and the grace). Proof row k9 holds the order from outside the helper with a stand-in held 300 ms past SIGTERM under a real `xvfb-run` (a raw Aurora exits in ~20 ms, too fast to observe): red at +15 ms on the old order, 16/16 now. Run recipe unchanged. Also seen: `section-raster-select-harness.mjs` is not re-runnable on the same `AEON_DIR` copy — its own anti-vacuous row `1c` sees the `rasterRef` the previous run saved (21/23 on a reused copy, 23/23 on a fresh one); re-materialise the copy per run. **O66 (2026-08-30, branch `parcel/o66-siblings-ordered-teardown`): FRESH COPY PER RUN IS NOW ENFORCED for section-raster-select** — its Ctrl+S rewrites 25 project files (the save plan's serialisation, not a set the harness could restore), so a reused copy is REFUSED before anything launches (exit 2 at ~26 ms, `HARNESS ABORTED: LEFTOVER FROM A PRIOR RUN: …/section_0.meta.json already carries rasterRef="ghost_preset"`), never a silent 21/23; the three dropped-promise siblings (section-raster-select, bg-wrap, chunk-links) now `await killTree(child)` and print `cleanup: ORDERED` (exit 0 within ~3 ms of the summary, `SIGKILLed 0`, 0 cores over 3 runs each), and `check-harness-guards.mjs` rule **G5** (inside `npm test`) fails any file that drops a `killTree(` promise and can `process.exit()` — red on those three first, green after, red again on a planted one.
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
- **⚠ A SHIM INTERPRETER THAT STARTED BEFORE `oracle-old` `07314aa` (2026-08-25 21:09) ATTACHES TO
  WHATEVER HOLDS THE SOCKET — WHICH IS THE OWNER'S ON-SCREEN GAME WINDOW.** Python reads its source at
  process start, so such a shim keeps the old behaviour forever and a `/clear` does not help (the shim is on
  the process command line); only a session RELAUNCH picks the fix up. A step, pause, reset or memory write
  from one of those lands in the game he is playing, and it has already cost that once. **Check it in one
  command before trusting any emulator call: `pgrep -P <shim pid>` — no child means no private instance means
  you are about to attach to whatever holds the chain.** *(The 2026-08-26 measurements behind this — the pids,
  the ten-shim census, and the two independent derivations — are in `docs/OVERSEER-LOG.md`.)*
- **`emulator/pixel_attribution` returns `cell` as a SIBLING of `winner` at the TOP LEVEL of the result**,
  present iff `winner.layer` is `planeA`/`planeB`/`window`; `winner` carries only `{layer}`. **This one fails
  SILENTLY** — a consumer written to the nested shape reads `winner.cell?.tile` and gets `undefined` for every
  pixel without throwing. Fields: `{tile, tileAddr, palette, hflip, vflip, priority}`, the nametable word
  decoded. **`cell.tile` is VRAM-ABSOLUTE** (0..2047, `tileAddr == tile * 32`), so **Aurora must rebase by
  `BG_TILE_BASE_SLOT` (1024) to reach blob-local** — the same rebase and direction the injector applies inbound.
  ⚠ **THE REBASE CAN LAND OUTSIDE THE BLOB AND THE EDITOR MUST SAY SO RATHER THAN INDEX**: plane B can show
  engine art, another act's art, or a slot past the blob's end, and `tile < 1024` rebases NEGATIVE. Any
  click-to-identify consumer answers *"not part of your background"* for those. **Operational form, from how
  the nesting got corrupted: relay the assertion's LOCATION, or send the JSON — never the shape in prose.**
  *(The relay episode, and the closed 46-method gate history, are in `docs/OVERSEER-LOG.md`.)*
- **A SCREENSHOT DIFF CANNOT ANSWER WHETHER A BAND STEPS, and it is the more persuasive of the two.** A band
  DMAs new pixels into fixed slots, so the nametable tile index never moves — 0 of 27 plane-B sample points
  changed tile id across 90 frames while the screenshots differed on every capture. **The quantity that answers
  it is VRAM tile bytes at the band's own slots, against a control run of blob slots the band does not own.**
  Proven 2026-08-27 (`docs/reviews/2026-08-27-band-lens.md`; `scratchpad/band-lens-harness.mjs`,
  `scratchpad/band-step-proof.mjs`): 6 distinct band contents across 6 captures, control byte-stable throughout,
  which is what separates stepping from scrolling and from a wholesale art reload.
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