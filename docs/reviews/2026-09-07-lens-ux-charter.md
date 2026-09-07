# Roster C charter — the UX seat pair on Aurora

**Status: WRITTEN, NOT LAUNCHED.** The seats do not start until the hub relays oracle's
pilot notes (see *Sequencing hold*). This file is the controller's charter, authored
before the run so the seats inherit a stated frame rather than the controller's memory.

## 1. Authority, and which half of it is a relay

**The ruling is committed and was read at its revision, not from the message announcing it.**
Owner ruling 2026-09-07T22:41:35Z, recorded at empyrean `origin/main` `docs/OVERSEER.md`;
the ruling text and the owner's verbatim words are in the empyrean repo at `6a12740`,
`empyrean/docs/2026-09-07-lens-ux-seat-amendment.md`, read here at that revision. His words:
*"I think it should have one right?"* and *"I think we draft it and run on oracle, aurora,
and sigil for now"*. Roster C lands in aeon's `docs/superpowers/LENS_PROTOCOL.md`; aeon owns
that text and this charter does not restate it — read it there.

**The half that is a HUB TRANSCRIPTION, and it is anchored.** The hub (empyrean-c0) woke this
lane quoting the owner: *"we can do the lens run for ui/ux on aurora but I don't wanna fix the
79 items right noww"*. That sentence **is committed**, in the empyrean repo at `2212da9`,
`empyrean/docs/OVERSEER-LOG.md` last line, stamped 2026-09-07T22:44:41Z — verified here
firsthand: an ancestor of that repo's `origin/main`, and the commit carries the transcription
itself rather than being a docs commit standing in for one. It was committed **before** this
lane was woken, so the anchor is not a record written to justify the wake afterwards.

**Its class, stated rather than upgraded.** It is a **hub transcription of his words to the
hub session** — which is the best class available for anything he says to a session, and is
NOT the same as an act this lane witnessed. Labelled that way on purpose: this repo's rule is
that an approval is recorded with its granting act named, and the naming is worth nothing if
the name drifts upward each time the fact is repeated. What it changes: the UX pair runs; the
lens fix items stay held. Both are consistent with the committed amendment, which already says
aurora's fix items stay held and that waking it for the UX pair alone is his call.

*(This paragraph replaced one asserting the sentence was committed nowhere this lane could
read it. That was true when written and false twenty minutes later, once the hub named the
anchor. Recorded rather than quietly rewritten, because the brief two seats will inherit is
exactly where a label that outlived its justification does the most damage.)*

**Model, as the amendment requires stated before the wake:** this session is **Opus 5**
(`claude-opus-5`). The console's next-start model for this lane reads opus; they agree.

## 2. Sequencing hold — the reason the seats are not running yet

Oracle pilots the pair and owes the hub a paragraph on what the seat brief got wrong. This
lane would otherwise inherit those defects and pay for them a second time. **No seat launches
until that relay arrives.** When it does, this charter is amended in place with what changed
and why, and the amendment is committed *before* the launch, so the brief the seats ran under
is recoverable afterwards rather than reconstructed.

## 3. The pin, and why it is not in this file yet

Roster C is a **late panel** on the packet at `docs/superpowers/notes/2026-09-06-aurora-lens-sweep.md`
(branch `review/aurora-lens-sweep`, pushed). Per the amendment a late panel runs at a **NEW
pin** and the packet is amended naming the pair as late and the pin it ran at — **never
re-dated**.

**The pin is taken at launch and written here then**, not now. Master is `4cf66084` as this
charter is written and nothing is expected to move it while the fixes are held, but a pin
recorded before the run is a prediction wearing a measurement's clothes; the seats are given
the SHA that `git rev-parse` prints in the same tool call that materialises their worktrees.

## 4. The surfaces, named — because a job walked in one and judged against another is a conflation

Aurora is one window, but it is several surfaces inside it, and the amendment requires each
job to name where it is walked:

- **S1 · Home tab** — open a project, recents, per-level cards.
- **S2 · Shell** — Explorer sidebar and tab strip. A tab is a level, a sprite document, or an
  art canvas document.
- **S3 · Level tab, map canvas + facet pills** — Layout · Objects · Effects · Rings ·
  Collision · Palette · Art for aeon; Layout · Objects · Collision · Palette · Art for
  classic. All but Art share the canvas and swap the tools and right-hand panel.
- **S4 · Art composer** — replaces the canvas on the Art facet; tile / block / chunk.
- **S5 · Sprite document** — mappings + DPLC, whole-frame bitmap editor, animation timeline.
- **S6 · Messages** — dialogs, toasts, refusals, empty states, and the unrecognized-project
  notice. Not a panel, but it is where most of UXb's checklist lands.

## 5. UXa — the task walk

**Five jobs a newcomer would want done. The seat is given no instructions on how, and may
read `README.md` and nothing else.** Not the docs it links, not `docs/ART_SUITE.md`, not the
source. The moment the seat opens a source file to proceed, that is a **finding**, logged with
what it was trying to do and what the file told it — it is not a failure of the seat.

| # | Job | Surface | Done when |
|---|---|---|---|
| A1 | Get a project open and a level on the screen. Do it twice: once with the aeon copy, once with the classic copy. | S1 → S3 | A level is rendered in the map canvas |
| A2 | Put an object into the level and save it so the change is on disk. | S3, Objects facet | The project file on disk carries the new object |
| A3 | Change a palette colour and save it. | S3, Palette facet | The palette on disk carries the new colour |
| A4 | Author a background band — an effect on the aeon act. | S3, Effects facet (aeon only) | A band exists in the scene and is saved |
| A5 | Draw a new tile and get it into the level's art. | S3 Art pill → S4 | The tile exists in the art and is saved |

**A1 is deliberately doubled across the two adapters** because the fork between them is where
a newcomer with the wrong kind of directory lands, and the README describes both.

**What UXa logs, per job:** every stall, every guess, every moment it had to read code, and
the wall time each job burned. Findings are *"got lost here"*, **ranked by time burned**, not
by the seat's opinion of severity.

**A clean job is still reported with its step count and a screenshot per step**, so "nothing
found" is examinable rather than asserted.

**Failing to get a project loaded is the FIRST AND MOST VALUABLE FINDING, never BLOCKED.**
A2–A5 are no-ops on an empty editor. If the README does not carry a newcomer from launch to a
loaded level, the seat writes that up and then keeps going as far as it can, reporting each
later job as unreachable *and naming what stopped it*.

## 6. UXb — the heuristic audit

**Every panel, control and message walked against this fixed checklist:**

1. **Findable** — can a newcomer locate it without being told it exists?
2. **Answers back** — does acting on it produce a visible response?
3. **Consistent with its neighbours** — same word, same place, same behaviour as the controls
   beside it.
4. **Undoable** — can a mistake made here be taken back?
5. **Says what to do next** — when it refuses or errors, does the message name the remedy?

**UXb reports COVERAGE AS A CENSUS, not a sample: N of M for each surface S1–S6**, with the
inventory it built listed. A checklist audit that walked eleven of forty panels and reported
findings without saying so is the partial-coverage failure this lane has already paid for —
it earns trust and is then silently wrong in the corner nobody walked.

Each finding names the panel or the message verbatim, and which checklist item it misses.

## 7. The rig — private everything, and the parts that are already mechanised here

**Each seat gets its own git worktree at the pin, its own build, its own display, its own
port, and its own copies of the projects.** Two seats never share one of these.

- **Display.** Launch through `spawnGuarded` (`scratchpad/lib/harness-guard.mjs`) under
  `/usr/bin/xvfb-run -a -s '-screen 0 1680x1050x24'`, with `delete env.DISPLAY`. `-a` picks a
  free display, which is what makes it private. **Never `:0`** — that is the owner's screen.
- **X11 is already forced, and not by the seat's own hand.** `spawnGuarded` injects
  `--ozone-platform=x11` positionally, immediately after the Electron binary;
  `scratchpad/ozone-x11-proof.mjs` is the red-first evidence that a raw launch attaches to the
  owner's compositor instead of the Xvfb. **Launch through `spawnGuarded`, never raw** — this
  is the rule that keeps the seats off his desktop, and it is a mechanism rather than a
  promise.
- **Screen size is verified FROM INSIDE the display** and printed beside every measurement,
  derived from the numbers handed to `xvfb-run` rather than copied into a second place. A
  reading taken on a display of unknown geometry is not a reading.
- **Port.** A private `AURORA_DEBUG_PORT` per seat, checked free before launch (a port that
  already serves a CDP target means the seat is about to drive somebody else's app).
- **Build tree.** `ELECTRON_BIN` **and** `AURORA_BUILT_TREE` are both passed, both pointing
  where the seat means. `ELECTRON_BIN` alone names one file, not a tree: a worktree with no
  `node_modules` fails `isRunnableTree` and the harness silently drives **main aurora's
  `dist/`** while every path in the output looks right. Read the run's own `root:`/`in-tree:`
  lines — they are the only signal that says which tree answered.
- **Projects.** Each seat gets **its own copy** of an aeon project and of the s1disasm tree,
  materialised by the controller. This is a **rig fact, not a step of the walk**: the seat is
  told only that project directories exist at two paths, the way a newcomer on this machine
  would have checkouts on disk. It is told nothing about how to open one — that is job A1.
  **The live sibling trees are never touched**: `../aeon` is another lane's working tree, and
  A2–A5 all write to disk.

**Forbidden outright, and each for its own reason:**

- **The owner's display.** He is using it.
- **The shared oracle server, and the emulator MCP.** The MCP line stands unchanged from the
  protocol; a subagent on it deadlocks, and a shim started before the fix attaches to whatever
  holds the socket chain — which has been his on-screen game window.
- **`window.__dbg` as a way of DOING a job step.** The debug hooks may be read for assertions
  and used to capture screenshots. Using `aeon.open` or `openDir` to load a project would
  bypass the exact affordance job A1 exists to judge. **Every job step is a real gesture** —
  CDP `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` at integer client pixels, never
  `element.click()`, which is not a click and which the app may never listen for; a no-op
  gesture makes every later reading come off the previous screen and the row reads *not
  reproduced* forever.
- **Aiming at fractional coordinates.** `devicePixelRatio` varies run to run on this box (1
  and 1.35 observed hours apart in one session), so a rect can be fractional and an aim at
  `rect.top + N` asks for a pixel that does not exist. Aim at an integer client pixel, derive
  every expectation from that integer, and print dpr and the rect beside the aim.

## 8. Evidence

- **Every finding ships a screenshot, or the diagnostic text verbatim. No evidence, no
  finding.** A clean job ships a screenshot per step.
- Screenshots are committed on the seat's branch under
  `docs/reviews/2026-09-07-lens-ux/<seat>/`, PNG, so they survive the worktree being deleted.
  Budget: **≤ 40 per seat**; over that, the seat says what it dropped.
- Each seat closes with **what it could not drive and what would have let it** — gamepad,
  audio, a device it lacks, a surface it never reached.

## 9. Scope cuts, stated with their reasons rather than left implicit

- **Pacing, smoothness and responsiveness are OUT OF SCOPE.** A virtual display has no vsync,
  so a "feels sluggish" reading taken there answers a different question while looking like an
  answer. Those need the owner's real display and are his captures.
- **Look and taste findings** — this colour, this placement, this wording preference — are
  **captures for the owner**, parked under the standing look/taste rule, not packet findings.
  Usability findings (lost, stalled, undone by the tool, misled by a message) go into the
  packet's normal bins.
- **The playtest loop is walked only up to the point where the app asks for an emulator.**
  Build & Run and Play-from-cursor need a running oracle, and the seats may not have one. What
  the seat reports is **what the app told it when no emulator was there** — which is a
  checklist item 5 question and a good one. Nothing about whether the loop works is claimed.

## 10. Reconciliation happens at the CONTROLLER, not in the seats

The seats are **not** told about the 80 existing findings in `docs/lens-findings.jsonl`.
Telling them poisons the walk: a seat that knows a defect is booked stops discovering it and
starts confirming it. **A seat re-finding a booked row is a validity signal for the seat**,
and the controller does that reconciliation afterwards, marking each returned finding as new,
convergent-with-an-existing-row, or a duplicate.

**Convergence between UXa and UXb is the top finding class**, as elsewhere in the ritual. The
two walks are opposed on purpose — one goes at the app with a goal and no map, the other with
a map and no goal — so a defect both of them hit from opposite directions is the strongest
thing this panel can return.

## 11. What lands, and when

The seats deliver branches; no fixes are made during the run, in either seat, because the
owner's hold on the fix items is in force and because a read-only seat is what keeps the
report honest. On return: the controller verifies firsthand, the packet at
`docs/superpowers/notes/2026-09-06-aurora-lens-sweep.md` is amended naming the pair as a late
panel and the pin it ran at, the findings are appended to `docs/lens-findings.jsonl`, and the
look/taste captures go to the owner separately as captures.
