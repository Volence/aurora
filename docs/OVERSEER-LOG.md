# Aurora overseer log

Not read at boot. `docs/OVERSEER.md` is the boot read and stays inside the bound; this file holds
what a booting session does not need in front of it — dated entries, and the full history of queue
rows whose `docs/lane-status.json` title states only the row's substance and its state.

Contract: `empyrean/contract/LANE_STATUS.md` rule 7 and `docs/OVERSEER-PROTOCOL.md` "The boot read
is bounded", both read at empyrean `f4d6d4b` (verified an ancestor of `origin/main` before this file
was written). The owner's words behind them, transcribed in the hub's log at that revision:
*"YYou wanna fix up the two bleeding/wasteful ones?"*

Append only. Newest last.

## Queue row histories

Moved verbatim from `docs/lane-status.json` on 2026-09-02T13:01:06Z, when rule 7 landed. Each row's title
in that file now states what the row gets the owner and where it stands; everything below is the
history of how it got there. **Nothing here was rewritten** — these are the titles as they stood.

### O45

`size: M` · LANDED 2026-09-02, row left the board · `blockedBy: None` · `project: EFFECTS-W1`

⚠ **`done` is NOT in the `state` vocabulary** (`contract/LANE_STATUS.md`: `open` / `next` / `doing` / `blocked`). This line said `state: done` when the row landed; corrected here because three lanes in three days wrote `done` into a live `lane-status.json`, and one bad enum rejects the WHOLE file — the console then serves nothing and the owner's card for that lane goes dark, silently to the lane. A landed row does not get a state, it **leaves the board** and lives in `docs/lane-log.jsonl`. Do not copy a `state:` value out of this archive into the board.

> RESCUED FROM O25 as that row was retired. O25 closed 59 fails / 3 collection deaths / 6 silent PASSes, and left this: a PARTIAL checkout fails 27 files / 135 tests because every guard tests DIRECTORY existence, not a file. ⚠ VERIFY THE OVERLAP BEFORE STARTING — O39 (merge 2b0f610d) closed the misdirection half over 22 rows and its marker check covers 'not a checkout at all' but explicitly NOT 'a real checkout missing what a row reads'. So this may be substantially covered, partly covered, or untouched; re-measure rather than assuming either way. The numbers above predate O39.

> **CLOSED 2026-09-02**, branch `fix/o45-partial-checkout-file-guards`, packet `docs/reviews/2026-09-02-o45-partial-checkout-file-guards.md`, ROADMAP §5.1 row 112. **The overlap was verified and O39 substantially covered this.** Measured by removing 46 files ONE AT A TIME from a complete s1disasm copy at a committed revision: of 243 new failing rows, 152 already name the missing file and 61 are O39's anchors; **28 misdirect — 9 distinct rows in 7 files**, and **eight of the nine share one cause**: the shared collision tables gate every act's `read()` while being `gating: false` (correctly — they have no OWNING act), so every guard that filters the profile by zone/act answered truthfully about the wrong list and ONE missing file failed 33 rows. Closed by exporting `S1_GLOBAL_REQUIRED_KEYS`, merging it into the act guard, naming the file/tree/variable in every refusal, and giving the guard module its first test — which MEASURES that constant rather than trusting it. MISDIRECT 28 -> 0, 0 rows went failed->passed or failed->gone. **Residual, stated:** 46 of 178 read paths sampled, and the shipped half is three error strings that no test drives through the UI — tagged for foreground confirmation.

### O48

`size: S` · `state: open` · `blockedBy: None` · `project: None`

> RESCUED FROM LP-1 as that row was retired, AND ITS FOLD WAS DANGLING — I wrote 'residual folded into O22's family' and then DECLINED O22, so the fold pointed at a row that will never run. One collision surface is still untested by gesture; the writers themselves are fixed and shipped. A fold is a reference, and retiring or declining its target orphans it — check folds when you close the row they point at.

### O41

`size: S` · `state: open` · `blockedBy: None` · `project: None`

> CONSEQUENCE OF O36, and it is a re-measurement not a bug: every CDP harness rect and screenshot taken BEFORE merge 3c1639f2 was measured on the owner's desktop at whatever dpr his primary monitor had, NOT on the Xvfb the harness started. Scale-invariant results survive (O15's 0.48 block-height ratio was reported as scale-invariant AT THE TIME and stands). Absolute-pixel claims do not. Sweep docs/reviews/ for absolute-px figures from CDP runs and mark them re-measure-or-retract; two banked memories already corrected. S, and mostly bookkeeping — no shipped behaviour depends on it.

### O35

`size: S` · `state: open` · `blockedBy: None` · `project: None`

> ASK FILED WITH THE OWNER 2026-08-30 (one line, in his terminal): does the Aurora window show its icon? Under d-8's clarified2 this row counts as closed for the feature start from the moment the ask was filed, and closes for real when he answers. The measurement behind it: harness:window-icon is 4/4 + 1 UNMEASURABLE — it proves Electron DECODES the icon at the path getAppPath() resolves (512x512 matching the file's IHDR, red control on a bad path), which is NOT the claim that a window shows one. A CDP screenshot captures the PAGE not the window, Xvfb has no titlebar or WM, _NET_CLIENT_LIST is empty and getNativeWindowHandle() returns 01 00 00 00. No instrument in this environment can answer it; his eyes can, in two seconds.

### EW-TIMELINE-CLOCK

`size: M` · `state: open` · `blockedBy: FILE: aeon's P2b/anchor-mover landing (design doc status leaving 'design-only')` · `project: EFFECTS-W1`

> Raster timeline editing half, the CLOCK for moving bands — the other half of the DoD's timeline item, and genuinely gated. Needs aeon DoD item 4 (P2b moving-top + the time-driven anchor mover), which the ownership design still marks design-only. Also re-opens a ruled question: the preview is driver-faithful (camera bands preview clocklessly, only timer bands need a clock), so the clock is scoped to the anchor mover, not to the strip generally.

### EW-PERLINE

`size: L` · `state: open` · `blockedBy: FILE: aeon's dense-tier op, then the empyrean schema key` · `project: EFFECTS-W1`

> Per-line scroll authoring as a NEW field via schema CR — supersedes the A7 row's booking. Never a widened `curve` (re-verified: unevaluatedProperties:false on the object arm). Waits on aeon DoD item 6 (dense VSRAM run op under CAP_DENSE_TIER) then a CR.

### EW-7-11

`size: L` · `state: open` · `blockedBy: FILE: each of aeon's items 7-11 in turn` · `project: EFFECTS-W1`

> Controls for aeon DoD items 7-11 (vertical bob, BgAnim vertical motion, Hydrocity row remap, the three plane tricks, nametable-base swaps incl. Plane Z) — each lands as its engine item lands; priced as an aggregate L, to be split when the first one arrives. Absorbs the old row 55.

### A12

`size: L` · `state: open` · `blockedBy: aeon's DEBUG override block` · `project: LIVE-OBJECTS`

> OWNER-RULED 2026-08-29 ('I'm fine without live preview for now... should be its own project'): the 60fps DEBUG-override preview moves under LIVE-OBJECTS, retitled live debug and build tools. Aurora is BACK ON that project for this half only — the Aurora WRITE PATH — and aeon's override block lands first, so we are gated on them. Not started.

### O29

`size: M` · `state: open` · `blockedBy: None` · `project: None`

> ⛔ PAUSED BY THE OWNER — NOT startable, and I had this wrong an hour ago. His RESUME BRIEF at empyrean origin/main lists 'Paused projects: REGIONS (holds tall backgrounds + horizontal art streaming), LIVE-OBJECTS spawn half, SOFTWARE-RENDER' — verified at the revision, not from the relay that caught me. Starting it would be a lane overriding his pause. THE SCOPING STANDS as input for when he unpauses. ⚠ HOW I GOT IT WRONG, worth keeping: this row's blockedBy said 'NOT waiting on him', which is TRUE — no decision is pending — and I read it as STARTABLE. Those are different claims. A paused project is not awaiting a decision; it has already been decided, in the negative, for now. I cleared that prose for FORMAT an hour ago without checking what it asserted, which is how the format fix passed the fact straight through. REGIONS (scoped 2026-08-29, not started) — a named set of section cells sharing one SectionMeta, authored once, derived onto members; on a direct cell edit DETACH that ref (d-18c shape) with a visible marker in the section list, per-ref not per-section. Region = editor concept only; each member's .meta.json still written resolved, so the on-disk contract and aeon's generator are untouched. CORRECTION banked: Aurora persists THREE per-section refs (bgLayoutRef/paletteRef/sceneRef), not the five aeon named — `music` is in-memory only (one toucher, cloneSection) and presets are project-scoped. Size M, +S if music must persist first. NOT scoped: whether a region owns anything spatial. [blockedBy prose cleared 2026-08-30: it read 'NOT waiting on him. REGIONS is a declared PAUSED project in '; not a blocker, and the contract forbids owner prose in that field.]

### 4.6-sequencer

`size: L` · `state: open` · `blockedBy: None` · `project: None`

> OUT OF THIS PUSH (owner 2026-08-29T22:32:40Z: "yeah that should be out for now"). The sequencer — last of the three effects surfaces, unstarted [blockedBy prose cleared 2026-08-30: it read 'RULED OUT, not waiting on him. The owner-ratified definition'; not a blocker, and the contract forbids owner prose in that field.]

## Status-file history fields

Moved verbatim from `docs/lane-status.json` on 2026-09-02T13:01:48Z, under the same rule 7 adoption. These
ten fields were never part of `contract/LANE_STATUS.md` — predecessors bolted lane history onto the
status file, and by this morning they were **14 KB of a 24.6 KB file that Dominion reads on every
hub check**. They are landings, rulings, corrections and carried-forward lessons; none is deleted,
and none is rewritten.

**One was checked for a live ruling before it moved.** `bugTierFrozen` froze a bug tier that had to
close before `EW-TIMELINE-EDGE` could start. That gate is **discharged** — the split/edge-drag half
shipped 2026-08-30 (`docs/lane-log.jsonl`, 08:08:17Z; ROADMAP row 94), so the field is history and
not a standing ruling. Had it still been live it would have gone into `docs/OVERSEER.md` as well as
here, per `OVERSEER-PROTOCOL.md`: *"a ruling that must survive a rotation is written into
OVERSEER.md's standing-rulings or queue section AS WELL as the log, never only into the log."*
`nextAfterFeature` is likewise stale: the row it names as next landed 2026-09-02.

```json
{
  "bugTierFrozen": {
    "ruling": "empyrean origin/main d83cffd, contract/projects.json EFFECTS-W1 completionRequires.ordering.amendment",
    "at": "2026-08-30T05:11:34Z",
    "readingApplied": "The ruling says 'the set of rows open at' the timestamp. Read LITERALLY that includes EW-TIMELINE-EDGE itself, which the same ruling says to start AFTER the tier closes — a row cannot be its own precondition. So the tier is read as the BUG/SIDE rows open at that instant, excluding: feature rows (EW-*, O29 REGIONS), rows the owner parked himself (A12, 70), the sequencer (he ruled it OUT of the DoD 2026-08-29T22:32:40Z), and three rows that carried DONE in their body while sitting open (O19, LP-1, LP-3 — closed in this same write, and NOT counted, because counting finished work would have delayed the feature start for nothing).",
    "tier": [
      "O39",
      "O40",
      "O37",
      "O38",
      "O35",
      "O36",
      "O34",
      "O27",
      "O22",
      "O21",
      "O17"
    ],
    "thenStart": "EW-TIMELINE-EDGE",
    "jumpTheLine": "a row found later that BLOCKS a feature item or SHIPS WRONG OUTPUT",
    "clarified2": "empyrean origin/main 59a4943, 2026-08-30T05:13:23Z: a tier row whose remaining work is ANOTHER PARTY'S ANSWER counts as CLOSED for the purpose of starting EW-TIMELINE-EDGE once the ask is FILED; it stays open on the board and closes for real when the answer lands. Verified at the revision here, not taken from the relay. So O37 (aeon's cull-or-track) and O35 (a look only the owner can give) cannot hold the feature start hostage — BUT the clause turns on the ask being FILED, and O35's was NOT: it was an observation I had noted, not a question put to him. Filed 2026-08-30 in his terminal, one line.",
    "closed": [
      "O39",
      "O40",
      "O27",
      "O36",
      "O38",
      "O21",
      "O34",
      "O22",
      "O17"
    ],
    "remaining": [
      "O37",
      "O35"
    ],
    "note": "TIER EMPTY of this lane's work 2026-08-30. The two rows left (O37 aeon's cull-or-track answer, O35 the owner's look at the window icon) count as CLOSED for the feature start under clarified2 — asks filed, answers not ours to give. EW-TIMELINE-EDGE starts now.",
    "postFreezeNote": "O41 and O42 were found AFTER the 05:11:34Z freeze, so under d-8 they queue BEHIND EW-TIMELINE-EDGE unless they block a feature item or ship wrong output. Neither does: O41 is bookkeeping over past figures, O42 guards an invariant currently HOLDING. Both correctly queue behind the feature work — recording the test rather than the verdict, so a later session can re-apply it."
  },
  "retiredAt": {
    "at": "2026-08-30T07:55:27Z",
    "count": 28,
    "ids": [
      "O39",
      "O40",
      "O38",
      "O36",
      "O34",
      "O33",
      "O32",
      "EW-PRESET-MCP",
      "O30",
      "O31",
      "O25",
      "LP-CHUNK-ID",
      "LP-3",
      "O28",
      "O26",
      "O27",
      "LO-1",
      "O22",
      "O23",
      "O21",
      "O20",
      "O19",
      "LP-1",
      "EW-BAND",
      "O15",
      "O11",
      "O13",
      "O17"
    ],
    "why": "LANE_STATUS.md: a landed row LEAVES the queue and lives in the lane log, so the owner's Board counts WORK, not history. I had been closing rows by rewriting the title to DONE and leaving state 'open' — 28 of 46 rows, 61% of the board, were finished work inflating his count. Every one is already in docs/lane-log.jsonl, so nothing is lost. Four live residuals rescued as O45-O48 rather than retired with their hosts."
  },
  "nextAfterFeature": "EW-SECTIONMETA-RASTERREF is next when O42+O44 lands — it is on AEON's critical path and they are blocked until our SHA is on master, which outranks O48 (a residual with nothing waiting on it). The schema half of EW-ASSIGN-PRESET's blocker is now DONE; EW-ASSIGN-PRESET itself opens once aeon's generator arm lands.",
  "retiredAt2": {
    "at": "2026-09-02T08:48:03Z",
    "ids": [
      "O37",
      "O67",
      "SUITE-PATHS"
    ],
    "why": "CLOSED BY AEON'S LANDING, verified at aeon origin/master d78f9090 (not the checkout): .gitignore:18-19 negate ojz_bg_*.bin / ojz_act1_bg*.bin (commit befbae65 2026-08-30 'protect: 17 authored backgrounds existed on one disk with no history'); all 17 library bodies + _tiles + ojz_bglib.json are tracked there. The hub's 09-02 ask to re-relay was against our stale board — nothing left to send. | O67 landed 2026-09-02 at master 8f40f87c and left the queue for the lane log."
  },
  "lostRun": {
    "at": "2026-09-02T08:13:04Z",
    "what": "Both 04:39Z/04:44Z dispatches were terminated by an API session limit (429, 'session limit resets 4am America/New_York') minutes after launch, before either committed anything. Branches parcel/suite-paths and fix/o67-scene-meta-fixture sat at the pre-dispatch master 16d36182 for 3.4 hours while lane-status claimed two live agents; the hub caught it at 08:09Z, not me. Both branches deleted and re-dispatched off master 0b0951d9 with an instruction to commit early. LESSON: an agent launch is not an agent; a dispatch whose failure notification arrives while the session is idle leaves the board asserting activity that ended. Check inFlight against branch tips, not against the dispatch record."
  },
  "retiredAt3": {
    "at": "2026-09-02T09:06:29Z",
    "ids": [
      "O68"
    ],
    "why": "O68 LANDED at master 6566677d (lane-log db750c3e) and LEFT THE QUEUE for the lane log, per LANE_STATUS.md: a landed row is history, not work. Carried forward because it outlives the row — THE MEASURED PAIR IS NOT SELF-VALIDATING. My independent plant B (inert bed, announce refusal neutered) went GREEN while printing a pair whose every path was CORRECT: the wrong derivation really was wrong there, the right one really was right, the resolver really did answer the suite root. A perfectly convincing artifact of a run that measured nothing, because the resolver was never executed from the bed. The announce line naming the worktree is the ONLY discriminator in the shape. Relayed to the hub for sigil and aeon.",
    "contractAttribution": "The plant is now suite contract at empyrean 8dfb07f (verified pushed): the pair alone is consistent with an inert bed; a report quotes the pair AND the returned step-source; a source naming the main checkout fails regardless of its pair; the announce artifact is the only discriminator in the shape. Sent to sigil as one plant to run before its packet closes (neuter the returned-path assertion, confirm green). O68 landing independently verified by the hub at aurora origin/master db750c3e."
  },
  "retiredAt4": {
    "at": "2026-09-02T09:21:19Z",
    "ids": [
      "O69"
    ],
    "why": "O69 LANDED at master cbfa22cf (merge 6ad7c925 + landing repair). Bigger than briefed: 138 files, and it found THREE dead session-scratchpad defaults where the row named one, plus 8 more sites a third gate rule caught that neither half of the brief would have. Two carried-forward lessons. (1) THE MERGE SEAM HAD NO AUTHOR: both parcels were green on their own branches off the same base and git merged them cleanly, but O68 added a row reading the exported AURORA_ROOT const while O69 REPLACED that export with AURORA_DIR — 1 failed / 6261 passed on the merged tree. Neither agent could have seen it; only re-verifying on the merged tree could. Repaired and re-proved red there. (2) THE RETURNED LANE-LOG ENTRY CARRIED A FUTURE TIMESTAMP: 09:20:00Z against a 09:17:26Z clock, seconds ending :00 — the estimate signature the LANE_LOG contract names, and a reader REJECTS a future timestamp outright, so every true thing in the entry would have been lost with it. Corrected from the clock at landing. Auditing the file then showed FOUR PRIOR entries with the same shape (a :00-seconds timestamp sitting ahead of the entry after it), so this is a recurring pattern in this lane's own log, not tonight's agent slipping. Not rewritten — the file is append-only and committed."
  },
  "ratified": {
    "at": "2026-09-02T09:21:19Z",
    "what": "O69's ONE design call, ratified locally and REFERRED UPWARD as a contract question. The agent skipped the contract's precedence step 2 (EMPYREAN_SUITE_ROOT joined with the repo name) for aurora's OWN checkout, keeping it only for peers. Its reasoning, which holds: for a peer that join is a guess, but for THIS repo the module's own file location is a direct observation; and if step 2 answered for aurora too, the documented poison recipe `EMPYREAN_SUITE_ROOT=$(mktemp -d) npm test` would relocate the repo under test and every instrument would stop finding its own dist/, while from a linked worktree it would resolve to the MAIN checkout — the --show-toplevel bug arriving from the other side. Defended by a row asserting BOTH halves in one child process (the variable moves a PEER and does NOT move AURORA_DIR), the second half being the anti-vacuous control without which a subject ignoring the variable entirely would pass. ⚠ THE CONTRACT QUESTION IS NOT MINE: SUITE_PATHS.md says 'Precedence, the same in every resolver' and its title scopes it to naming ANOTHER tool's checkout, but its variable table lists AURORA_DIR beside AEON_DIR. Whether a resolver naming its OWN tree owes step 2 is cross-lane — sigil and oracle hit it next — so it went to the hub rather than being settled here."
  },
  "decisionsTaken": [
    {
      "at": "2026-09-02T09:29:44Z",
      "id": "aurora-Q4-lines-authoring",
      "what": "RULED BY THIS LANE, in my own domain, on aeon's routing (their audit aeon 297d21d5): the `lines` field STAYS AN INTEGER BITMASK on the wire; no array-of-line-numbers document form. Aeon routed the residual to me as an authoring call after the hub ruled the wire (AURORA_EFFECTS_SCHEMA 7.2 Q4).",
      "groundedIn": "The ruling is VENDORED HERE at src/core/formats/effects/aurora-effects-preset.schema.json:237 and already says the friendly form is the editor panel's job, not the wire's. CURRENCY PROVEN BY test/formats/effects-preset-schema-drift.test.ts, 14/14 — including a row matching contract/schema/aurora-effects-preset.schema.json at empyrean origin/main and a row asserting the pinned revision is PUBLISHED, not local-only.",
      "whatAeonAddedThatTheRulingDidNotCOVER": "Their residual is REVIEW legibility (a diff showing lines: 12 -> 20 with no panel present), where the ruling's sentence only answered AUTHORING legibility. Different people, different moments; nobody had separated the two. Credited to them.",
      "why": "(1) Diff legibility is a REVIEW-TOOLING problem with a zero-drift instrument (a .gitattributes textconv or a one-line decoder); an array form buys the same legibility in the wire permanently plus a translation step. (2) That translation step is where a second spelling of v_lines gets born, which is what Q4 exists to prevent — aeon's own note says the generator would need new duplicate/out-of-range refusals that exist only because of the convenience. (3) Asymmetric error cost: adding an array form later is a schema CR; removing one after documents carry it is a migration.",
      "owed": "If diff illegibility actually bites in review, THE DECODER IS MINE, not the generator's. Aeon told to name the moment rather than work around it on their side.",
      "reverses": "One word from the owner or a hub CR.",
      "myOwnCitationError": "⚠ I FIRST CITED THE WRONG GATE, and aeon had already banked it citing me. I offered '12/12 green' as the currency check; those twelve rows are effects-schema-drift.test.ts, which is the SCENE schema (its currency row names aurora-effects-scene.schema.json). The Q4 text is in the PRESET schema. Different file, different contract path. THE CONCLUSION SURVIVED ONLY BECAUSE A GATE I HAD NOT CHECKED EXISTS — right by luck, not by method. Corrected to aeon within minutes with instructions to strike the 12/12 and cite 14/14. The class is the one I spent the night policing in others: a number that reads as PROVENANCE rather than as a claim gets waved through by someone applying real scrutiny two inches away in the same sentence.",
      "sharpensRiderII": "The correction makes rider (ii) STRONGER, and this is the version to carry: there are TWO vendored schemas with TWO separate currency gates, 12 rows and 14 rows, and NEITHER measures document VALUES. Both answer only 'is our vendored copy still what empyrean publishes' plus keyword-implementation coverage of the evaluator. SHAPE lives in a third place (test/fixtures/effects/effects-preset-vectors.json, whose own header says value vectors are deliberately absent). VALUES live nowhere on our side. So the over-read risk is not one green number — it is 26 green rows across two files that together still cannot catch a period off-by-one.",
      "errorContained": "CONTAINED — the wrong gate never reached aeon's tree. My correction arrived while their amendment agent was still running, so the 12/12 existed only in its brief; they sent it the strike. They then verified the replacement FIRSTHAND at aurora cbfa22cf through git objects rather than my working directory, located the Q4 sentence by GREPPING ITS CONTENT rather than trusting the :237 line cite (their reasoning: a bare line cite goes stale on a clock nobody watches — the coordinate-rot bar, applied to my citation), and attributed the 14/14 to me AS MY MEASUREMENT while stating they have not run our suite. That is the correct honest split: they can verify the text exists, not that our gate is green.",
      "riderIIFinalForm": "Aeon re-banked rider (ii) in the sharper form and named why it is materially different: their version was 'one green number over-reads'; the version going into their spec is 'the over-reading SCALES WITH THE ROW COUNT and stays exactly as blind' — 26 green rows across two files, neither measuring document values, shape in a third place, values nowhere on our side. That is the form that survives someone quoting a bigger number next month."
    }
  ],
  "retiredAt5": {
    "at": "2026-09-02T09:45:12Z",
    "ids": [
      "O70"
    ],
    "why": "O70 LANDED at master bd214e95 (merge of b46fd966, 3bcefa3c, da6f08eb, 48df12ef). Hub ruled the split's proof shape FOR MY FORM (empyrean 2c019fd) and upheld my reading of the walk on all three points (c9bc05f), so the merge was not held. CORROBORATION SETTLED: 3bcefa3c still hashes identically to what I read before my relay went out, so the apart-row WAS in it at 09:34:19Z and the agent reached that shape independently; da6f08eb is its response to the relay. INDEPENDENT PLANT, on a different axis from the agent's five: I planted a PRIVATE COPY of the walk back into the harness — row 5 (the structural wiring row) fired, the other four stayed green, confirming the agent's own claim that only that row can see it. The lane-log timestamp was clean this time (past, real seconds) after the explicit clock instruction in the brief; the previous parcel's was 2.5 minutes in the future.",
    "correction": "⚠ I REPORTED O70 LANDED AT bd214e95 WHILE ITS AGENT COULD STILL RETURN, and it did — with the announce work. Final SHA is master 5eb051f7 (merge of 09de72ee + a042a800), 6273 passed on the merged tree. My error: a landing report is a claim about a finished parcel, and I made it at a point the agent had not finished. Told the hub to re-bank the SHA."
  }
}
```

## Moved out of the boot read

Cut from `docs/OVERSEER.md` on 2026-09-02T13:03:40Z, adopting `OVERSEER-PROTOCOL.md` "The boot read is
bounded". **Verbatim, whole blocks, nothing rewritten** — each left a pointer where it stood.
These are superseded readings, a closed episode and a historical register: what a booting
session does not need in front of it, kept because the record is the point.

### Hub addressing — the `empyrean-ba` episode

*(was `docs/OVERSEER.md` lines 136-180)*

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

### Push authorization — the original relayed entry, superseded 2026-08-24

*(was `docs/OVERSEER.md` lines 196-222)*

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

### initialize build-identity — superseded holding position and superseded reading

*(was `docs/OVERSEER.md` lines 755-763)*

  **Superseded holding position:** treat (2) as barred-by-construction with an unasserted join. Their anti-vacuity guards are present and correct, which is why this needed reading ACROSS
  the tests to find.
- **Superseded reading, kept as the record of what was believed before the source was read — condition
  (2): STRONGLY CORROBORATED, NOT PROVEN FROM OUTSIDE.** `source:"vcs"`
  and `dirty:false` are build-time captures, and the id's SHA is a **real commit, reachable from
  oracle `origin/main`** (checked here). That is good evidence it is VCS-derived rather than
  config-supplied. It is **not proof**: nothing observable on the wire can rule out a config
  override, which would need their build source read. Do not upgrade this to "proven" without
  doing that.

### write_vram / method-count freshness — superseded relayed reasoning

*(was `docs/OVERSEER.md` lines 960-969)*


  *Superseded reasoning, kept because it is the worked example of banking a relay with its limit
  rather than laundering it:* **UPDATE 2026-08-24, RELAYED BY THE ORACLE LANE AND RECORDED WITH
  THEIR STATED LIMIT — not re-measured here.** They report this specific staleness closed: `target/release/oracle-aether`
  is dated 2026-08-22 21:52, zero non-docs files changed between their `12cc17e` and their HEAD,
  and `12cc17e` banks a handshake that read **41 methods over the wire**, committed 21:54, two
  minutes after that binary was built. **Their own limit, carried rather than dropped: that is
  mtime plus a docs-only diff plus a previously-banked wire check, and they did NOT re-handshake
  it.** So the artifact is argued to be the verified one, not observed to be. The bar itself is
  untouched, and the freshness tell is still the banner read by executing.

### Decision closures made before rule 8d — the register

*(was `docs/OVERSEER.md` lines 1190-1239)*

## Decision closures made before rule 8d — CLOSED OUT OF SHAPE, DO NOT REPAIR

*(Added 2026-08-30T01:59Z. Contract: `empyrean origin/main df8939b`, `contract/DECISIONS.md`
rule 8d, read at that revision — verified reachable from here before this list was written,
not taken from the relay that announced it. Dominion's reader parses the field at dominion
`7a8a9b3`. **In force from 2026-08-30T01:58:05Z**; every id below was appended before that
instant, so none of them is a violation of anything.)*

Rule 8d asks each lane to list its pre-rule closures **once**, and says in its own words:
*"Ledgers are NOT rewritten to fit this … History that shows the drift is worth more than
history edited to look compliant. Nothing in 8d is an instruction to touch an existing
line."* So this is a **register, not a backlog**. Do not add `answered` to any of them.

**The twelve closures in `docs/decisions.jsonl` that predate the field** — each closes a
question the 8c way (an appended entry with `supersedes` set) and records its resolution in
prose rather than in `answered`:

`d-4` · `d-5` · `d-7` · `d-8` · `d-10` · `d-12` · `d-14` · `d-15-answered` ·
`d-16-hub-ruled` · `d-18c-chunk-identity-ANSWERED` · `d-19-stale-mcp-discovery-CLOSED` ·
`d-20-live-objects-scope-ANSWERED`

By 8d's `by` vocabulary, had it existed: nine `owner` (`d-4`, `d-5`, `d-7`, `d-8`, `d-10`,
`d-12`, `d-14`, `d-18c`, `d-20`), two `hub` under a standing delegation and explicitly
marked as not witnessed here (`d-15-answered`, `d-16-hub-ruled`), one `lane` executing an
owner-authorized cleanup (`d-19`).

⚠ **Two entries look like closures in a listing and are NOT — do not count them, and do not
"fix" them either.** Both carry `supersedes` and answer-flavoured wording, which is exactly
what a name-based scan picks up (this file's own *name, presence and behaviour are three
different claims*):

- **`d-6`** reads as an answer and is a **re-ask**: it records a ruling that arrived
  *relayed* and asks him to confirm in one word. `d-7` is the closure, and its whole point
  is that it was witnessed firsthand rather than relayed.
- **`d-18b-chunk-identity-which-default`** settles the *shape* he answered with, then asks a
  genuinely new question (which of the two behaviours is the default). `d-18c` is the
  closure.

**Classified by reading each entry's `question` and `detail`, not by its id.** Five of the
twelve have an id ending in `answered`/`ANSWERED`/`CLOSED`/`hub-ruled` and seven do not
(`d-4`, `d-5`, `d-7`, `d-8`, `d-10`, `d-12`, `d-14`), so an id-suffix scan would have found
five of twelve and missed the majority — while `d-6` and `d-18b` would have to be excluded
on their text no matter which scan found them.

**From here on, closures carry `answered`** (`at` from `date -u`, `by`, `chose` validated
against the entry's own options or `null` for a freehand answer, `said` quoted verbatim and
never linted, `did` one sentence of lane prose and linted). The field supplies the
**content** of a resolution and never the **fact** of one: the card leaves the owner's board
when this lane drops the blocker, not when the field is written.

## The shim-vintage / pixel_attribution / band-lens bullet, as it stood

Moved from `docs/OVERSEER.md` on 2026-09-02T13:09:12Z under the hub's ruling (empyrean `ad03609`, taken
under the owner's 2026-09-02T03:46:15Z widening): repo precedent narrative that is not a live ruling
moves here with a pointer. **Verbatim, one block, nothing rewritten.** The head keeps the three live
rules it carried — the `pgrep -P` vintage check, the top-level `cell` shape with its rebase hazard,
and the screenshot-diff-cannot-prove-stepping finding. Everything else is closed: the 2026-08-26 pid
measurements, the ten-shim census, the two-derivation corroboration, the relay-corruption episode, the
46-method gate, and the passage its own text marked *"Original text follows for the record."*

> - **⚠ THE BULLET BELOW IS TRUE ONLY FOR A SESSION WHOSE SHIM INTERPRETER STARTED AFTER `oracle-old` `07314aa` (2026-08-25 21:09) — AND THIS SESSION'S DID NOT.** *(Raised by the oracle lane 2026-08-26; every claim below verified firsthand here before it was acted on.)* Python reads its source **at process start**, so a shim launched before that commit keeps the OLD behaviour forever: it does **not** spawn a private instance, it dials the default socket chain and **attaches to whatever holds it — which is the owner's on-screen game window.** A step, pause, reset or memory write from such a session lands in the game he is playing. **Measured here:** `/run/user/1000/oracle.sock` is held by `oracle-frontend` pid 1542676 (`--aether --x11`, the owner's player); this session's shim is pid 287509, started **Aug 25 20:29**, i.e. pre-fix, and `pgrep -P` shows it has **NO CHILD** — no private instance exists for it. Post-fix sessions look visibly different in the same `ss -lxp`: theirs carry an `oracle-aether` of their own on a `/tmp/oracle-mcp-*/oracle.sock` mkdtemp path. **The file on disk is correct; the running interpreters are not.** A session RELAUNCH picks the fix up automatically — a `/clear` does not, because the shim is on the process command line. **It already cost something once:** a lane reloaded the owner's window onto a worktree build in good faith at ~18:20Z believing it had a private instance. **So: check the vintage before trusting the bullet below, and when in doubt do not call the tool** — his window is not ours to touch. **Corroborated 2026-08-26 from a different enumeration parameter** *(bar 19's genuine-corroboration shape, flagged as such by the oracle lane)*: this lane derived the `/clear`-does-not-help half from the shim being on the **process command line**; they observed it directly — their session was `/clear`ed and **the shim's start time did not move** (pid 287372, still `Aug 25 20:29:19`). Where the shim is configured versus a before/after on an actual clear: neither derivation could share the other's parameter. They adopted `pgrep -P` as a bar (oracle `cfe3406`) and report it renders across the whole box — **ten shims, eight with no child, two owning a `/tmp/oracle-mcp-*` instance.** **THE JOIN KEY ALREADY SHIPS — do not ask for it, consume it** *(oracle, 2026-08-26, verified by them live against a spawned server on the corpus ROM rather than read off the schema)*. `emulator/pixel_attribution` returns **`cell`**, present iff `winner.layer` is `planeA`/`planeB`/`window`: ⚠ **CORRECTED 2026-08-27 — `cell` is a SIBLING of `winner` at the top level of the result, NOT hanging off it; `winner` carries only `{layer}`.** Measured here against a freshly spawned `oracle-rs` build `d285ecbc6c3a` (`docs/reviews/2026-08-27-band-lens.md`). **This one fails SILENTLY:** a consumer written to the old shape reads `winner.cell?.tile` and gets `undefined` for every pixel without throwing — this lane's own first lens run printed *"27/28 sample points on planeB"* and *"0 sample points on planeB"* in the same output because of it. Every other claim in the relayed finding is corroborated here (VRAM-absolute tiles, `tileAddr == tile*32` on an independent sample `1101 -> 0x89A0`, the rebase direction, and `cell` present for 27/27 plane-B winners). ⚠ **AND THE ATTRIBUTION IS WRONG IF YOU STOP THERE — corrected 2026-08-27 by the oracle lane and verified firsthand here before amending.** Their own bank was RIGHT: oracle `docs/OVERSEER.md` says `pixel_attribution.cell` (top-level) and their source writes `out["cell"]` at the top level (`crates/oracle-aether/src/engine.rs:2821`), with their tests and the empyrean contract schema agreeing. **The nesting was corrupted in the RELAY, between a correct record and this bank** — so a reader who goes looking for a bad record upstream will find a good one and lose the lesson. **The lesson is theirs and it is sharper than the bug:** the shape was machine-enforced in THREE places — their tests, their source, the contract — **and one sentence of prose defeated all three, because assertions do not cover claims ABOUT assertions.** Operational form, adopted: **relay the assertion's LOCATION, or send the JSON — never the shape in prose.** Fields: `{tile, tileAddr, palette, hflip, vflip, priority}` — the nametable word decoded. **`cell.tile` is VRAM-ABSOLUTE** (0..2047, and `tileAddr == tile * 32`: their 1066 -> `0x8540` checks out). **Aurora must rebase by `BG_TILE_BASE_SLOT` (1024, verified here in `bganim-consumer-contract.json`) to reach blob-local** — the same rebase and the same direction the injector applies inbound. That closes the band-lens loop from the other direction: click a dot, rebase, name the band and slot. ⚠ **THE REBASE CAN LAND OUTSIDE THE BLOB, AND THE EDITOR MUST SAY SO RATHER THAN INDEX.** Verified here on their own two samples: 1066 -> 42, inside OJZ's **320**-tile blob; **1456 -> 432, outside it** (and `BG_TILE_CAPACITY` is 448, so even in-capacity is not in-blob). Plane B can be showing engine art, another act's art, or a slot past the blob's end, and `tile < 1024` rebases NEGATIVE. **Any click-to-identify consumer must answer "not part of your background" for those** — an unchecked rebase either throws or, worse, names a slot the author does not own. This is the same two-correct-axes failure that cost an afternoon on the marquee; the space is stated in the field's own description, so there is no excuse for inferring it. ✅ **TAGGED QUESTION CLOSED 2026-08-27 — the band STEPS, proven with a control run.** (`docs/reviews/2026-08-27-band-lens.md`; instruments `scratchpad/band-lens-harness.mjs` + `scratchpad/band-step-proof.mjs`.) The gate is open: a freshly spawned server advertises **46 methods** including `get_layer_states`/`set_layer_enabled`, verified **by executing**, not by grepping their source. **The finding that matters for any future lens work: a SCREENSHOT DIFF CANNOT ANSWER WHETHER A BAND STEPS.** A band DMAs new pixels into fixed slots, so the nametable tile index never moves — 0 of 27 plane-B sample points changed tile id across 90 frames while the screenshots differed on every capture, and the screenshot is the more persuasive of the two. The quantity that answers it is **VRAM tile bytes at the band's own slots, against a control run of blob slots the band does not own**: 6 distinct band contents across 6 captures, control byte-stable throughout, which is what separates stepping from scrolling and from a wholesale art reload. Original text follows for the record. Oracle has `get_layer_states` / `set_layer_enabled` in flight and picked that parcel for exactly this case — hiding plane A to see what a band actually paints underneath. **This lane is the registered first consumer.** They will signal when it is **served and reachable through a REBUILT BINARY**, not when it merges — a distinction that repo already paid for once. Do not attempt the question before a session relaunch gives this lane a private instance. **How to check in one command:** `pgrep -P <shim pid>` — no child means no private instance means you are about to attach to whatever holds the chain.

