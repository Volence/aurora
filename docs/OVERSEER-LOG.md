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

`size: M` · `state: done` · `blockedBy: None` · `project: EFFECTS-W1`

> DELIVERED 2026-09-03 on branch `feat/ew-timeline-clock` (`ffb4faf6`…`c1e445d1`), packet `docs/reviews/2026-09-03-ew-timeline-clock.md`, ROADMAP row 95. The block lifted when EW-CHANNELS-WRITER landed the keys in the codec and nothing authored them. Both halves shipped: the `aeon.effects.preset.anchors` section on the Colour sub-tab (seed + motion + the two ladders as selects that cannot emit an off-ladder value), and the clock — `AnchorSweepPreview`, scoped to the anchor mover alone, drawing to its own canvas with no `setState`, mounted only while a sweep is authored. ⚠ THE STRIP DOES NOT SHOW A MOVING BAND AND CANNOT: this document carries no channel↔band link (a preset `band` is `top`/`bot`/`sh`/`on`), so that picture needs a contract change, not a parcel here — flagged rather than attempted. MapViewport's zero-idle-repaint property MEASURED intact (0 repaints / 301 preview frames / 301 page ticks over 5s), with a poison-found blind spot in that row reported rather than tuned away. NO EMULATOR AND NO ROM, and the on-screen disclosure says aeon's generator still refuses the whole document, so nothing authored here builds today. Two owner calls left open: the section's `defaultCollapsed` arrival, and truncated select labels in the 280px column.

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

---

## Moved out of the boot read, second pass — closed history around live rules

Cut from `docs/OVERSEER.md` on 2026-09-02T17:21:13Z under `OVERSEER-PROTOCOL.md` "The boot read is
bounded", move (2): *closed history around a live rule moves to the log verbatim; the rule stays and
is rewritten legibly*. **Verbatim, whole blocks, nothing rewritten** — each left a short entry where
it stood, carrying the durable rule and a pointer here. The move was proved lossless by
set-difference over every non-blank line of the pre-edit `OVERSEER.md` against head + log.

### The `initialize` build-identity parcel, as it stood

*(was `docs/OVERSEER.md` lines 672-736)*

This is the CLOSED half of the parcel: the firsthand probe, oracle's three-way seam gap and its fix at oracle `843b99a`, and the `implementation`-literal correction they made to this lane. The head keeps four live rules — read `implementation` never `serverName`; `serverBuild.id` is a TREE identity and never a code identity; the retired relative-`romPath` discriminator; and the seam-has-no-author generalisation with its collapse-no-check corollary.

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
  **Superseded holding position and superseded reading moved to `docs/OVERSEER-LOG.md`** — what was
  believed about condition (2) before oracle's source was read. Both conditions are MET above.
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

### The resume/stop race, as it stood

*(was `docs/OVERSEER.md` lines 749-803)*

The closed narrative behind the row: oracle's trial-4-of-8 measurement, the enumeration of every sequencing point in this tree, and the `engine_loop`/`run_to` source trace read firsthand at oracle `7ba2faf`. The head keeps the live rules — no exposure because nothing awaits an event, breakpoints make it live so confirm the server-side fix first, the inverted `run_to` hazard and the ping-before-you-write-that-wait-loop offer, the `reached` field `bootRestore` gates on, and the hosted-path scope limit.

- **THE RESUME/STOP RACE IS NOT REACHABLE FROM THIS CLIENT — AND THE DAY IT BECOMES REACHABLE IS
  NAMED** *(2026-09-02, oracle's F-RESUME-STOP-RACE relayed by the hub; answered from source here at
  master `44f17ca8` and booked at their request, because a stated position must live in a tree rather
  than in mail — shared protocol bar 20, sending side)*. **Their finding:** the halt broadcast is
  emitted from the engine thread while the `ok(resume)` reply is written by the connection thread, so
  a client that resumes and then waits for a stop can miss the stop entirely if its reply-reader
  discards events arriving before the reply. **It failed at trial 4 of 8 after three clean passes** —
  the number to remember, because a two- or three-run green on a race is exactly what this lane would
  otherwise have signed off.
  **Aurora cannot hit it, and the reason is STRUCTURAL rather than careful: we never adopted the
  pattern.** `AetherClient.onEvent` has exactly ONE non-test consumer in the tree — `bridge.ts`'s
  `c.onEvent(() => publish())`, a connection-badge refresh that discards the event's method and params
  — and **nothing anywhere awaits an event**. The dispatch loop feeds subscribers as messages arrive
  and is not coupled to the reply path, so the window their race needs does not exist. Every
  sequencing point reads a REPLY instead: `bootRestore` (`boot-restore.ts`) gates on `run_to`'s own
  `reached` field, `s1-warp.ts` says in its header it chose `run_frames` over resume-and-sleep on
  purpose, and every `resume` in `push-palette.ts` / `warp.ts` / `s1-warp.ts` / `build-run.ts` is a
  terminal `wasRunning` restore inside a `finally` with nothing awaited after it.
  ⚠ **THE PERISHABLE HALF, which is the whole reason this is written down: BREAKPOINTS MAKE IT LIVE.**
  A client that sets a breakpoint, resumes, and waits to be told it hit is precisely their shape — and
  that is the first thing Aurora would build on `breakpoint_add`, which is where oracle says the race
  still is (`breakpoints.rs` / `watchpoints.rs`, server side, booked by them). **So read this row as: no
  exposure while there is no breakpoint consumer, and the session that starts one must confirm the
  server-side fix landed BEFORE trusting a green run of its own.** Recorded as a not-currently-reachable
  finding, not as an all-clear.
  ✅ **THE `run_to` QUESTION IS ANSWERED — NO, IT DOES NOT SHARE THE SPLIT, and the answer came back
  with a caveat that INVERTS the worry.** *(Oracle, 2026-09-02, banked their side at `7ba2faf`;
  every claim below **read firsthand here** at that revision, confirmed an ancestor of their
  `origin/main` before it was written down.)*
  **Why `bootRestore` is safe, and it is a stronger property than ordering.** `engine_loop`
  (`server.rs`) handles one call at a time — `engine.dispatch(...)` and THEN `reply.send(...)`. `run_to`
  blocks *inside* dispatch: it `require_paused`es, sets `running = true`, calls `advance_until(...)`
  which does not return until the target, the frame bound, a breakpoint or a `stopAfter` watch ends the
  run, sets `running = false`, emits `stopped`, and only then builds its result. **The reply is PRODUCED
  BY the halt rather than merely correlated with it**, so having the reply means the machine is parked.
  `resume` is the opposite and is the whole race: its entire body flips a flag and returns
  (`Ok(json!({"wasRunning": self.set_free_run(true)}))`), and the halt lands later on a subsequent
  free-run step whose broadcast fires after the reply was already sent.
  ⚠ **THE INVERTED HAZARD, WHICH IS THE PART TO CARRY INTO A BREAKPOINT CONSUMER.** `run_to` calls
  `emit_stopped` **BEFORE** it builds its reply — verified here in the body's own order — so **on the
  wire the `stopped` event PRECEDES the `run_to` reply.** Our read-through-to-the-reply pattern is
  correct and unaffected (it discards the event and takes the reply). But **a client that consumed the
  reply and THEN waited for the halt event would block forever.** That is F-RESUME-STOP-RACE with the
  halves swapped, and it is exactly the loop someone reaches for when writing a first breakpoint
  consumer. **Ping the oracle lane before writing that wait loop** — their standing offer, and they will
  say whether the server-side fix has landed.
  **Also confirmed here and load-bearing for our gate:** `run_to`'s result carries
  `"reached": run.predicate_fired` — *the predicate's own verdict, never the sink's* — because a
  `stopAfter` watch can end the run too. `bootRestore` gating on `reached !== true` is therefore
  reading the right field: a watch-induced halt cannot masquerade as the target being reached.
  **SCOPE, theirs, stated rather than widened:** all of the above is the **socket / free-run driver**,
  which is the path this repo reaches. The **hosted** path — their player window through `Host::pump` —
  is a different driver and stays registered as their `F-STOPPREC-HOSTED-HALT`, where the halt is
  *inferred* from sharing one function with the measured path rather than measured. **Nothing here
  upgrades that**, and a claim about the hosted window may not cite this row.

### The built-binary enumeration parameter, as it stood

*(was `docs/OVERSEER.md` lines 896-923)*

The 2026-08-24 closure narrative: oracle's fresh handshake at 41 methods, this lane's independent re-verification through the relative-`romPath` discriminator, the `serverName`/`serverVersion` note that the `initialize` parcel later closed, and the loud-failure check on `write_vram`. The head keeps the bar itself — verify by EXECUTING, never by grepping source — and the banner's method count as the freshness tell.

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

  *Superseded reasoning moved to `docs/OVERSEER-LOG.md`: the 2026-08-24 relay from the oracle lane,
  recorded with their stated limit. The bar is untouched, and the freshness tell is still the banner
  read by executing.*

### The BgAnim driver, as it stood

*(was `docs/OVERSEER.md` lines 931-976)*

The 2026-08-24 closure narrative: the emitted symbols, the correction to aeon's own banked memory, the `jbsr` enumeration over every `.emp`, and the boot-path trace link by link (`game.emp:58-60` -> `GameState_OJZScroll_Update` -> `game_loop.emp:41-42` -> `boot.emp:349`). The head keeps dead-data-is-not-dead-code, build-it-and-watch-it, the not-the-wiring diagnosis, the `test`-in-an-aeon-path signal, and the bg_anim.emp:103 comment warning with its tell-them-if-there-is-a-fourth instruction.

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

### The pinned-checkout / pinned-build bar, as it stood

*(was `docs/OVERSEER.md` lines 1072-1124)*

The episode behind the bar: the clean checkout that built to two different CRCs, my own uncited "the checkout SHIPPED gitignored artifacts" misdiagnosis that the aeon lane built on, the suite-wide `docs/lane-status.json` enumeration that found sigil the only lane where it was untracked-and-unignored, the cause fixed at sigil `e5bd4a4f`, and sigil's deliberate not-relinking during aeon's seven-ROM freeze — the last of which is another lane's live state and is exactly what the row below this one says never to snapshot here. The head keeps the bar, the `revision:`-is-load-bearing / `tree:`-is-stale-by-construction split, the provenance-record general rule, and aeon's always-dirty-tree consequence.

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

## Correction: `crossover-paint` was never the O66 shape (O48d, 2026-09-02)

**O48's lane-log entry (2026-09-03T02:31:42Z) reads the `crossover-paint-harness` red as *"the
not-re-runnable-on-a-reused-copy shape already banked at O66"*. That reading is wrong, and it is
wrong in the direction that matters** — O48c already sharpened half of it; this closes the rest.
Corrected here rather than in `docs/lane-log.jsonl`, which is append-only.

- **O66's shape** (`section-raster-select`, `docs/OVERSEER.md` "FRESH COPY PER RUN IS NOW
  ENFORCED"): green on a fresh copy, degraded on a **reused** one. The fresh tree is the good state.
- **`crossover-paint`'s shape is the opposite, and worse: it could not run on a FRESH tree at all,
  and only ever went green against one somebody had already painted into.** Three states, each
  measured: on the stale scratch copy, row `[2]` red (the baseline already carried a prior run's
  crossovers) while `[2c]` passed **because** that prior paint had made the two planes differ; on a
  fresh `git archive` of aeon `origin/master`, `[2c]` red — both planes read the same word at the
  hardcoded fixture `(56,16)`; with the directory absent, `ENOENT` in `words()`, because the harness
  **depended on `../.aurora-crossover-paint` and did not create it**.
- So a reused copy was the only tree it ever passed on. The O66 remedy (materialise fresh per run)
  is still the right fix for the *second* defect, which is why the readings look alike; it does
  nothing for the first, and a lane that stopped at "reuse" would have re-materialised the tree and
  watched `[2c]` go red again.
- **The generalisation, and it is not about copies:** an anti-vacuous guard reports on the FIXTURE,
  not on the code. `[2c]` says *"a cross-plane clobber would be undetectable here"* — a fact about
  the cells chosen, which no amount of re-materialising changes. Read a red anti-vacuous row as
  naming the fixture; the one move it never licenses is relaxing the row.
- **Closed by O48d** (`fix/o48d-crossover-fixture`, packet
  `docs/reviews/2026-09-02-o48d-crossover-fixture.md`): the harness now materialises its own tree
  fresh per run from a committed aeon revision, refuses leftover crossover state loudly instead of
  scoring `[2]` red, derives plane A's fixture from the file and **authors** plane B's — measured:
  in all nine `.collattr*.bin` pairs aeon commits there is not one cell where both planes carry
  geometry and read differently, so the property `[2c]` asserts is not derivable whole from
  committed data. 15/15 on a fresh archive; `PLANT=identical-planes` puts `[2c]` back to red.
