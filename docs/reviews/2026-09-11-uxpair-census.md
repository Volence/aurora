# The UX seat pair, re-censused at master: what is true of all fifteen findings now

**Branch** `parcel/uxpair-census`, base master `5361cd67`. **Date** 2026-09-11.
**Question.** The umbrella row `UXPAIR-AURORA-RESULT` in `docs/lens-findings.jsonl` still read
`open` / `high`, and 09-09 and 09-10 worked most of the fifteen findings without updating it.
Per finding: what is true on master now?
**Method.** Every seat claim was traced to an artifact at master: a code commit (its `git show
--stat` read, so a docs-only commit could not count as a fix), the test or harness that holds
it, and the source line where the finding is still true. Ledger prose, lane-log headlines and
packet summaries are treated as claims and cited only beside the artifact they point at.
**Not done.** No emulator. No app launch, no CDP run, no build. No source or test file edited.

---

## 0. The answer

| verdict | count | findings |
|---|---|---|
| FIXED | 7 | A-F1, A-F5, B-F1, B-F2, B-F6, B-F7, B-F9 |
| FIXED, with a half PARKED, OURS | 3 | A-F2 (README + aeon toast), B-F4 (errno wording), B-F5 (`No matches` wording) |
| FIXED half + OPEN half | 1 | **B-F3**: after a dirty tab is closed, nothing on screen says unsaved work exists |
| FIXED half + PARKED ON OWNER half | 1 | **A-F4**: the seat's own Tab-then-click gesture still yields `12872`; card `NUMBERFIELD-TAB-THEN-CLICK` is open |
| REFUTED | 2 | A-F6, B-F8 (both user-facing roads measured clean; both were the debug door) |
| IN FLIGHT | 1 | A-F3, on `parcel/a-f3-art-save-width` |

**So "lens fixes first" is not finished:** one finding is OPEN (B-F3's visibility half), one is
waiting on the owner (A-F4's symptom), and three wording or documentation halves are parked on
nobody. None of them loses data. The umbrella row stays `open`, lowered to `medium`.

---

## 1. The fifteen, one row each

| # | Finding (seat's words, shortened) | Verdict | Evidence at master |
|---|---|---|---|
| **A-F1** | `Open Project…` produced nothing and there is no second door | **FIXED** (the second door). The "nothing happened" half is **the rig**, not the app | Code `193c113d` (`src/shared/project-path.ts`) and `3816928c` (`OpenByPath.tsx`, `HomeTab.tsx`, `App.tsx`, `typed-path-open.ts`). Rows: `src/shared/__tests__/typed-project-path.test.ts` (15), `src/renderer/components/home/__tests__/typed-path-open.test.ts` "EVERY refusal opens NOTHING, and reports the parser own sentence", "the field is reachable in BOTH Home states, not only the empty one". On screen: `docs/reviews/2026-09-10-cdp-sweep.md` way-in 1 to 3 PASS on a **non-debug** build. Rig: `docs/reviews/2026-09-09-rig-native-dialog-blindspot.md` (12-line Electron script, no Aurora code, same hang) |
| **A-F2** | A save reports nothing; the gesture had to be guessed | **FIXED**; README half **PARKED, OURS** (§2.5) | Code `7475377e` (`SaveChip.tsx`, `save-receipt.ts`, `classic-save.ts` `savedFilesSentence`, `LevelWorkspace.tsx`) and `eb57e644` (wiring row). Rows: `src/renderer/shell/__tests__/save-surface-vocabulary.test.ts` "a Ctrl+S that writes bumps the receipt and names the tab it wrote", "names them, and counts them"; `src/renderer/state/__tests__/classic-save.test.ts` (the row `eb57e644` added). On screen: `docs/captures/2026-09-10-save-surface-verdicts/panels-harness-with-classic.log`, `S1`, `S2b` ("Ctrl+S on a dirty level tab flashes `Saved!` ON THE CHIP") and `S3c` ("a classic save's success toast NAMES the files it wrote") PASS, 20/20 |
| **A-F3** | 14 pixels in an unused tile rewrote two `.nem` files, +329 bytes | **IN FLIGHT** | Branch `parcel/a-f3-art-save-width` exists (checked out in another worktree). Cause pinned by `src/core/level-classic/__tests__/s1-art-save-width.test.ts`. Not re-derived (§2.1) |
| **A-F4** | Top commit grew the panel 120px; Bot took an appended value | Layout half **FIXED**. Symptom half **PARKED ON OWNER** | Layout: `ff789781` (`column-layout.tsx` `GroupHints`, `BandPresetPanel.tsx`); `src/renderer/components/effects/__tests__/field-group-message-placement.test.ts` (17); cdp-sweep `P1` PASS both directions. Symptom: `src/renderer/components/ui/fields.tsx` line 378 still arms on `!editing`; card `NUMBERFIELD-TAB-THEN-CLICK` open (§2.2) |
| **A-F5** | The guide's step 1 control was four scroll gestures down | **FIXED** | Code `8e3727ad` (`effects-facet.tsx`, `providers/effects-sub-tabs.ts`, `BandPresetPanel.tsx`, guide). Rows: `src/renderer/components/effects/__tests__/colour-tab-arrival.test.ts` "the preset section is the first section the tab declares", "the facet mounts the panels in the order the provider declares", "the preset section arrives OPEN". On screen: `P4` **0** gestures against the seat's 4, in the 09-10 sweep and again in the 20/20 capture |
| **A-F6** | Opening aeon over an open classic project did nothing | **REFUTED** for the UI (debug door only) | Census of 12 roads in `docs/reviews/2026-09-10-way-into-a-project.md` §2; on screen, way-in 4 PASS (a typed path to the other engine flips the facet set). The loader was hardened anyway: `4fe3f185` (`aeon-open.ts` `closeResidentClassicProject`, `debug-hooks.ts` returns the boolean); `src/renderer/state/__tests__/aeon-open-over-classic.test.ts` "openAeonProject over an open classic project ends VISIBLE" (§2.3) |
| **B-F1** | A paint stroke in the Art composer cannot be undone | **FIXED** | Code `c1826b29` (+ rows `0a8816af`): a pure doc-local document, which is the seat's `New Tile 1×1` opener, owns one stack. Code `209acd5d` (+ rows `daab0a1b`): chunk documents route onto the zone-art stack (owner ruling d-37). Rows: `src/renderer/state/__tests__/composer-doc-undo.test.ts` "takes back a doc-local stroke, and clears dirty with it"; `src/renderer/state/__tests__/chunk-doc-commit.test.ts` "[C1] one press takes back the stroke; the earlier zone-art edit survives it". On screen: `scratchpad/art-undo-path-harness.mjs` 23 pass / 0 fail, and red on revert at `A2` (the seat's gesture on the seat's canvas rect). Residuals in §2.6 |
| **B-F2** | A dirty level tab closes silently, and the close destroys Undo | Loss half **FIXED**. Prompt half **ruled, not parked** | Code `5e46c1ea` (`shell/tab-activation/dispatch.ts`). Rows: `src/renderer/shell/__tests__/save-contract.test.ts` "a DIRTY level tab keeps its stack, because the close keeps the edit", its CLEAN control; `save-surface-vocabulary.test.ts` "no dialog, the edit survives, and Undo can still take it back". On screen: `scratchpad/save-contract-harness.mjs` `[4c]` 16/16. No prompt: `d-38-save-surface-vocabulary-answered` in `docs/decisions.jsonl` chose "no dirty-close prompt" |
| **B-F3** | After that close nothing says unsaved work exists, and Ctrl+S from Home is a silent no-op | Remedy half **FIXED**. Visibility half **OPEN** | Remedy: `5e46c1ea` (`shell/dirty-tabs.ts` `unsavedElsewhereMessage`, `state/project-runtime.ts`); `save-contract.test.ts` "says what it did and where the work is when an act IS unsaved"; harness `[5a]`. Visibility: `src/renderer/shell/TabStrip.tsx` line 45, *"THE DOT IS THE ONLY PLACE THE APP SAYS "UNSAVED""* (§2.4) |
| **B-F4** | The emulator badge gives no visible response; one refusal is a raw errno | Behaviour **FIXED**, **FOREGROUND** unwitnessed. Wording half **PARKED, OURS** | Code `0cc1bfee` (`state/aetherStore.ts` `connect()` toasts). Rows: `src/renderer/state/__tests__/aether-connect-refusal-visible.test.ts` "so the refusal reaches the toast channel, carrying the producer reason verbatim", "a SUCCESSFUL connect raises no toast". Wording: `src/main/aether/client.ts` line 245 still relays the errno raw (§2.7) |
| **B-F5** | Typing in the Explorer filter deletes its only control; `No matches` misdescribes | Behaviour **FIXED**, **FOREGROUND** unwitnessed. Wording half **PARKED, OURS** | Code `050f202d` (`src/core/shell/explorer.ts` `explorerEmptyState`, `Explorer.tsx`). Rows: `src/core/shell/__tests__/explorer-empty-state.test.ts` "F5: with no project open, a filter that matches nothing STILL offers Open Project…", "and the deleted term is gone: no render condition consults the query directly". Wording: `Explorer.tsx` line 294 unchanged (§2.8) |
| **B-F6** | The command palette has no visible affordance and no conventional chord | **FIXED** | Code `e313ee3e` (`Explorer.tsx`, `command-palette-chord.ts`, `commandPaletteStore.ts`, `CommandPalette.tsx`). Rows: `src/renderer/shell/__tests__/command-palette-discovery.test.ts` "the open explorer carries a row that NAMES it without a hover", "Ctrl+Shift+P opens it, which is the press the seat made that did nothing", "every shortcut the tooltip advertises actually fires". On screen: `P6`, `P7` PASS |
| **B-F7** | A level document has no Save control; a sprite document does | **FIXED** | Code `7475377e` (`SaveChip.tsx` mounted by `LevelWorkspace.tsx`). Rows: `save-surface-vocabulary.test.ts` "and mounts it AFTER Redo, where the sprite header puts its own Save", "the chip derives enabledness from the coordinator, not a second rule". On screen: `S1` PASS (painted, hit-tests to itself), `S2b` PASS |
| **B-F8** | An unsaved art document is destroyed by a project switch (door-observed) | **REFUTED** as a UI defect (debug door only) | `src/renderer/hooks/useProject.ts` line 18 `if (!(await confirmProjectOpen())) return;` runs before line 20's `openDirectory`, and has since `f0e15731` (2026-08-16). Rows (`8c6001f5`, tests only, which is right for a refutation): `src/renderer/shell/__tests__/project-open-door-census.test.ts` "no production module reaches a project switch except through a declared door", "the user road, specifically, awaits the guard before it touches either store", "the pixels are byte-identical after Cancel" (§2.9) |
| **B-F9** | Undoing back to the start leaves the document dirty | **FIXED** | Code `5e46c1ea` (`editorStore.ts`, `core/editing/bound-edit-history.ts`, `history-factories.ts`). Rows: `save-contract.test.ts` "undoing the only edit clears dirty, and redoing it sets it again", "an edit no undo can revert keeps the act dirty however far the stack unwinds", "undoing past a save is dirty, and redoing back to the save is clean". On screen: harness `[3b]`. Classic was never broken this way: `classicLevelStore.ts` restores the dirty flags from the pre-edit snapshot on undo (`restoreDomainDirty`) |

Every code commit named above is an ancestor of `5361cd67`: each appears in `git log` from
HEAD. Each one's `--stat` was read, and each touches `src/`. None of the fix files has been
touched since its fix in a way that bears on the finding. `fields.tsx`'s one later commit,
`b3ec66f7`, is judged by line 378 as it stands at master, not by reading the diff.

---

## 2. The findings that are not simply FIXED

### 2.1 A-F3: IN FLIGHT, and one overlap the parallel parcel should know about

Not re-derived. Its cause stands where `docs/reviews/2026-09-09-uxpair-findings.md` §4 left it,
pinned by `s1-art-save-width.test.ts`, and the fix, options (b) then (c), is being built on
`parcel/a-f3-art-save-width`.

**The overlap, recorded rather than resolved:** d-38's `7475377e` already made a classic save's
success toast **name the files it wrote** (`savedFilesSentence`), and `S3c` confirmed it on a
screen. That is the file-naming half of option (c). The half it does **not** do is the half seat
A actually asked for, *"report bytes written per file after a save, and flag growth"*. There is
no size and no growth in that sentence. The in-flight parcel should build on `savedFilesSentence`
rather than beside it.

### 2.2 A-F4: fixed for every arrival except the one the seat made

Two halves.

**Layout, FIXED.** `ff789781` renders a group's messages after both of its boxes, six pairs
across four cards. `P1` measured `Bot`'s y at `492.91 → 492.91` while a `Top` refusal painted,
and the converse.

**The `12872`, PARKED ON OWNER, and this is the case the brief warned about.** Three commits
(`bb951b9f`, `f1f9cb86`, `4c0b13e0`) fixed the insert for every *unfocused* arrival, and the row
`src/renderer/components/ui/__tests__/number-field-empty.test.ts` "selects again on the click
that brings the box from unfocused to focused" holds it. **The seat's gesture was Tab, then
click.** At master, `src/renderer/components/ui/fields.tsx` line 378:

```
onMouseDown={(e) => { focusingClick.current = e.button === 0 && !editing; }}
```

A Tab has already set `editing` true, so the arm is never set. The click collapses the Tab's
select-all to a caret, and the digits append. `docs/reviews/2026-09-10-seat-walk-still-inserts.md`
measured exactly this on the fixed build: variant A was the **only** variant with `focus before
click: true`, and the only one that inserted (`P2d` FAIL). The same row file pins the scope that
keeps it so: "THE SCOPE: leaves a click inside a box that is ALREADY focused alone".

**The card is still open.** `NUMBERFIELD-TAB-THEN-CLICK` is the last line of
`docs/decisions.jsonl` (`at` 2026-09-10T08:18:57Z). No `-answered` or `-closed` id exists and
nothing `supersedes` it. The ledger's `NUMBERFIELD-INSERT-CAUSE-UNKNOWN` and
`NUMBERFIELD-FOCUSED-CLICK-INSERT` both still read `open`, which is correct.

- **Severity, from the user's side: medium.** A value outside the range is refused and says so
  (the seat's `12872` was). But the typed digits join the old number wherever the click left the
  caret, and when the joined number is **inside** the range nothing refuses it: it lands
  **silently wrong** in a field that reaches a ROM.
- **Reachable by:** ordinary UI, every `NumberField`. Measured on the band preset's `Bot`, and
  derived, not measured, for the rest (seat-walk packet §6).

### 2.3 A-F6: REFUTED, and the evidence is on a screen, not only in a store

The seat said in bold that it could not claim the UI behaves this way. It does not. Every user
road goes through `useProject.openPath`, whose `openDirectory` closes classic before it routes to
the aeon loader (`docs/reviews/2026-09-10-way-into-a-project.md` §2, 12 roads). `way-in 4` then
confirmed it on a non-debug build: a typed path to the other engine's project flipped the pills.
The seat's `undefined` was a constant the debug hook produced (`.then(() => undefined)`, removed in
`4fe3f185`), and the aeon open was masked behind classic's precedence. `aeon-open.ts` now closes
a resident classic project first, so no future caller can reproduce the mask. **Reachable by:**
`window.__dbg.aeon.open` only, and after `4fe3f185` not even there.

### 2.4 B-F3: the remedy half is fixed; the half the finding is named for is OPEN

Seat B's title is two claims. **"The remedy the app itself names stops working"** is fixed:
Ctrl+S with nothing savable active now toasts *"Ctrl+S wrote nothing. Unsaved work is open in: a
level. …"* (`shell/dirty-tabs.ts` `unsavedElsewhereMessage`, harness `[5a]`).

**"After that close, nothing on screen says unsaved work exists" is still true at master.** From
source:

- `src/renderer/shell/TabStrip.tsx` line 45, in the app's own words: *"THE DOT IS THE ONLY PLACE
  THE APP SAYS "UNSAVED""*. The dot is on the tab, and the close removes the tab.
- `tabHasDirtyDot` is read by exactly three renderers: `TabStrip.tsx`, `SaveChip.tsx` and
  `SpriteDocHeader.tsx`. The chip lives in the level header, which closes with the tab.
- `src/renderer/shell/Explorer.tsx` and `src/renderer/components/home/HomeTab.tsx` read no dirty
  state at all (`git grep -i -E "dirty|unsaved"` finds one comment in `Explorer.tsx`, a hit that
  also shows the query is live).
- `src/renderer/App.tsx` line 185 builds the window title from `Aurora`, the project and the
  active tab, and nothing else.

`5e46c1ea` gave the dot an accessible name (harness `[1c]`), but that only works while the tab is
open. With the tab closed, seat B's full-DOM scan would still return `[]`.

**Why this was read as closed.** `SAVE-SURFACE-VOCABULARY-D38` lists *"uxb F2 and F3: a dirty level
tab closes silently -- DISPOSITIONED AS RULED"*. That is F2's title applied to F3. The card
(`d-38-save-surface-vocabulary`) asked whether a dirty close should prompt. It never asked whether
unsaved work should stay visible once the tab is gone, so the ruling did not decide this half.

- **Severity, from the user's side: medium.** The cost is certainty, not data. A project switch
  still asks (`confirmProjectOpen`), and Ctrl+S from anywhere now names the unsaved kind, so
  nothing is lost silently. But until one of those gestures, the screen tells a person who closed
  a dirty tab that nothing is unsaved.
- **Reachable by:** ordinary UI. One press on a dirty level tab's close ✕.
- **Whose call:** ours. d-38's answer delegated "wording and placement" to the lane. A dirty marker
  on the Explorer level row or the Home `LEVELS` card is placement, not a new owner question.
- **FOREGROUND, one run settles the pixel:** dirty a level, close its tab, and scan the painted
  screen (not only `title`s) for any unsaved marker. Source predicts none.

### 2.5 A-F2: fixed, with two residual halves parked on nobody

The behaviour the seat paid for is fixed and was seen on a screen (`S2b`, `S3c`). **A correction
worth keeping:** the literal "no toast" was already false on the day of the walk. Classic's
`Saved N level(s)` dates to 2026-08-09 (`docs/reviews/2026-09-10-save-surface-vocabulary.md`
§3.1). The real cost was a 2.2s corner toast raised by a gesture the reader had to guess, which
never said what it wrote.

- **README half, PARKED, OURS, and the reason has lapsed.** `README.md` lines 51 to 54 give undo
  and redo chords and say *"Edits stay in memory until you save"*, but never the save gesture
  (`git grep -i "ctrl+s"` on `README.md`: no hits). It was parked "until a control existed"
  (`docs/reviews/2026-09-09-save-contract.md` §4 item 5). The control has existed since
  `7475377e`, and the d-38 packet's own §6 item 3 calls it "newly writable". **Severity low:** the
  chip's tooltip now carries `Ctrl+S`. **Reachable by:** reading the README.
- **Aeon toast half, PARKED, OURS.** `state/aeon-save.ts` line 191 still says `Project saved` with
  no file list, because its `written` holds act ids, not paths (d-38 §3.2). This is outside the
  seat's walk, whose jobs were classic. **Severity low.**

### 2.6 B-F1: fixed; what is derived rather than driven

The seat's exact opener (`New Tile 1×1`, a pencil stroke) is a pure doc-local document, and
`art-undo-path` row `A2` drives that gesture on the seat's own canvas rect, green after the fix
and red on revert. Chunk documents are covered by d-37's routing. Still **derived, not driven**,
in `docs/reviews/2026-09-09-chunk-undo-routing.md`'s own "Still derived" list: six of the seven
transforms, paste, cut, selection move, palette-apply, and the map clipboard's collision paste on
a chunk document. So is composer Redo (`docs/reviews/2026-09-09-art-undo-fix.md` §6 item 5).
None of them is a finding. They are the edge of the proof.

### 2.7 B-F4: the half that outranked the wording is fixed; the wording is parked on nobody

`0cc1bfee` makes a refused connect raise an error toast carrying the main process's sentence
verbatim, and it is held by six rows with the client **stubbed**. **No run has pressed the badge
since** (no harness file under `scratchpad/` names the refusal toast), so the fix is proven at the
store and unwitnessed on a screen: **FOREGROUND.** One run settles it: `ORACLE_SOCKET` at a short
dead path, press `Aether ◇ offline` once, and expect an error toast naming the reason.

**The wording half.** `src/main/aether/client.ts` line 245:

```
this.teardown(e ? new Error(`Aether socket error: ${e.message}`, { cause: e }) : …
```

That is still `connect ENOENT <path>` for the common case, **pressing the badge with no emulator
running**. Now it reaches a toast: it is shown, but it still says nothing about an emulator. It
was parked as *"the producer's call"* / *"the main process's call"*. **That reason does not hold.**
`src/main/` is this repo, the producer is us, and no card exists (`git grep -i "errno|ENOENT"
docs/decisions.jsonl` finds none about it). **PARKED, OURS. Severity low. Reachable by:**
ordinary UI.

### 2.8 B-F5: the control is back; the sentence beside it is parked on nobody

`050f202d` took the query term out of the button's render condition, and the pure rule's rows
include three that read `Explorer.tsx` as text, so the component cannot quietly re-derive the old
condition. **Never observed on a screen: FOREGROUND.** On a cold Home, type `zon` into `Filter…`,
and `Open Project…` must still be there.

**The wording half.** `src/renderer/shell/Explorer.tsx` line 294 still renders `No matches`, and
on the F5 screen it now renders **beside** the button (row "the F5 screen exactly: both, at once").
It was parked as "a wording call". **That reason does not hold:** no card exists, and d-38's
answer leaves wording to the lane. **PARKED, OURS. Severity low. Reachable by:** ordinary UI, three
keystrokes.

### 2.9 B-F8: REFUTED, two sub-halves by design

The seat said in bold that it had switched projects through `window.__dbg.openDir`, and that
**"a guard living in the button's own handler would be invisible to me"**. That is exactly where
the guard lives. `useProject.ts` line 18 awaits `confirmProjectOpen()` before line 20 touches a
store, and the census rows fail on any undeclared caller of the switch primitives. **The debug
door is still unguarded**: `src/renderer/debug-hooks.ts` line 1196, `open: (dir) =>
openAeonProject(dir)`. That is by design. It is `VITE_AURORA_DEBUG` only, and harnesses are its
only users. The **Untitled Sprite** that vanished had no edits, so `endDocumentSession` closing it
is the documented cross-project-write guard. **Reachable by:** debug door only.

---

## 3. FOREGROUND, each settled by one run

| # | Finding | The one run |
|---|---|---|
| F-1 | B-F3 visibility half | Dirty a level, close its tab, scan the **painted** screen for any unsaved marker. Source predicts none (§2.4) |
| F-2 | B-F4 behaviour half | Dead short `ORACLE_SOCKET`, press the badge once, and an error toast must appear naming the reason |
| F-3 | B-F5 behaviour half | Cold Home, type `zon` into `Filter…`, and `Open Project…` must still be painted |

A-F4's symptom needs no run. It was reproduced on the fixed build (`P2d` FAIL) and now waits on a
card. The other FIXED rows were each seen on a screen at least once (cdp-sweep, the 20/20
capture, `save-contract-harness`, `art-undo-path-harness`).

---

## 4. Where the brief and the tree disagree

1. **"`2026-09-10-cdp-sweep.md` (13 of 14 held)".** That count is not in the tree. The packet
   says **10 PASS · 1 DEFECT REPRODUCED · 3 UNMEASURABLE**. Two of the three UNMEASURABLE (`S2`,
   `S3`) later went PASS through the dirty-doc door (`docs/captures/2026-09-10-save-surface-verdicts/`,
   20/20), and `P3` was retired as a premise about a height. The nearest honest figure is **12 of
   14 answered green, 1 red (`P2`), 1 retired**.
2. **The umbrella row was not left alone. It was rewritten in place.** `UXPAIR-AURORA-RESULT` was
   introduced by `c8652263` (2026-09-09 12:48Z). `git blame` puts its current line on `c2b848ed`,
   and that commit's numstat on `docs/lens-findings.jsonl` is **2 added, 1 deleted**: the original
   line was replaced by a longer one carrying a `dispositions` field and a new `at`
   (23:09:58Z), while the ledger is append-only. It is the same shape as d-38's in-place edit,
   which `docs/decisions.jsonl` records reverting. This census appends and does not repair it.
3. **d-38 was answered by the hub, not the owner**, under his "answer any you can" delegation,
   and the closure row says he "can overturn it with one word". It is answered, as the brief says.
   But B-F2's no-prompt half rests on a delegated answer.
4. **"B-F4, B-F5: a parked wording half beside a fixed behaviour half".** True, but "parked"
   overstates it. Both are parked in prose only, with no card and no owner, and B-F4's stated
   reason (another party's call) is false because the main process is in this repo.
5. **B-F3 was reported closed.** `SAVE-SURFACE-VOCABULARY-D38`'s `closed` list folds it into the
   d-38 no-prompt ruling (§2.4). It is half closed.

---

## 5. Out of the fifteen, named so they are not read as covered

Seat A's predicted **P2** (tile editor opens at 5×) and **P3** (project switch unconfirmed), seat
B's near-miss **N1** and inspection hazards **H1 to H4** are not findings and were not censused.
One is answered in passing: P3's question is `confirmProjectOpen` (§2.9).

## 6. Verification

`npm test` was run once, at this branch's tip, after the ledger row was appended and committed.
Its aggregate totals are in the landing report, taken from that run, because a packet committed
before the run cannot honestly carry them.

Shell traps honoured: every absence claimed above came from `git grep` over tracked paths, and
the one grep that could have returned a false zero (`Explorer.tsx` / `HomeTab.tsx` for dirty
state) printed a hit, so the query was live.
