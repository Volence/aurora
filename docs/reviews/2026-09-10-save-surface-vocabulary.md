# The save-side vocabulary: four controls, one rule, and a premise checked before it was obeyed

**Card** `d-38-save-surface-vocabulary` (`docs/decisions.jsonl`), answered
`name_what_is_true` 2026-09-09T23:20:08Z. Wording and placement were delegated to this lane.
**Branch** `worktree-agent-a84676e4e858ce9b5`, base `b64245ad`.
**Sources** `docs/reviews/2026-09-07-lens-ux/uxa-walk.md` (seat A, F2/F3),
`docs/reviews/2026-09-07-lens-ux/uxb-audit.md` (seat B, F2/F3/F7/F9),
`docs/reviews/2026-09-09-save-contract.md` (the mechanical half, and §5 where this decision was
parked), `docs/reviews/2026-09-09-chunk-undo-routing.md` §7 (the consequence that made item 4).

---

## 0. The one-line verdicts, before any detail

| item | seat finding | verdict |
|---|---|---|
| **1** a level has no Save control | uxb **F7** | **DONE.** `shell/SaveChip.tsx`, last in the level header, where the sprite header's Save already sits |
| **2** a save reports nothing but a 6 px dot | uxa **F2**, **F3** | **DONE, and the finding is re-read.** Every save path already toasted; what was missing was a message *where the person was looking*, and a classic save now names the files it wrote |
| **3** a dirty tab closes silently | uxb **F2**, **F3** | **PREMISE VERIFIED, NO PROMPT ADDED, PREMISE NOW GUARDED.** No product change |
| **4** `Discard` on a chunk discards nothing | a d-37 consequence | **DONE, renamed not removed**, with the reason renaming beat removing |

Nothing in this packet observed a rendered pixel. §1 is a source gate; everything else is held at
the store layer. That is stated once here and again per row, because a green at the store layer is
not a green on screen.

---

## 1. Item 3 first, because everything about it is conditional on a claim

The card's reason for adding no close prompt is a claim about current behaviour:

> Closing a dirty tab does NOT ask, because after this morning's fix a close destroys nothing.

If that is false, "no prompt" is not a decision, it is a defect left in place. So it was checked
against the code before item 3 was acted on, and the check is the deliverable.

### 1.1 What a dirty level-tab close actually does, read end to end

| step | code | what it touches |
|---|---|---|
| the close is requested | `requestCloseTab` in `src/renderer/shell/tab-activation/dispatch.ts` | Confirms for a **sprite-doc** tab and for a **canvas-doc** tab, both of whose documents die with the tab. **There is no level arm.** |
| a neighbour is promoted | same function | If the promoted tab is a level of a different **classic** act, `activateLevelTarget` raises the pre-existing "Unsaved changes in ..." confirm, and Cancel abandons the whole close. Aeon act switches are pointer moves over a resident project. |
| the tab leaves the strip | `closeTab` in `src/core/shell/session.ts` | Builds a new `{tabs, activeId}`. **It touches nothing else** -- no store, no document, no unload. |
| the stacks are considered | `disposeStacksForClosedTab`, same file | `if (!levelDocDirty(id, snapshot)) dispose(id)`, and the zone-art document likewise. **A dirty level keeps both.** |

So on a dirty level tab: nothing is asked, the act stays resident with its unsaved edits, and both
undo stacks survive. **The premise HOLDS.**

### 1.2 What that does not say, stated rather than left to be discovered

* A **clean** level tab still disposes its stack. That is the pre-existing, deliberate rule
  (`docs/reviews/2026-09-09-save-contract.md` R4), it is a control row in this parcel's tests, and
  it means "a close destroys nothing" is exactly true of a **dirty** close and not of every close.
  The card is about the dirty one.
* One narrow classic shape was reasoned about and **not** claimed as a refutation: closing a level
  tab for an act that is **not** the loaded one makes `levelDocDirty` false, so the zone-art stack
  can be disposed while the loaded act is dirty. Reaching it needs the loaded act to have **no tab
  open**, which `useActTabSync` normally prevents. It is filed in §6 as a question, not as a
  finding, because I did not reproduce it.

### 1.3 What was built for item 3

No product change. A guard, because the premise is what the ruling rests on: if a close starts
destroying something again, the ruling becomes wrong rather than merely unimplemented.
`save-contract.test.ts` R4 already pins the history survival on the **classic** side; the new rows
are the **aeon** side (the engine both seats were looking at) and read the two halves R4 does not:

* that **nothing is asked** (`useConfirmStore.getState().request` is null after the close), and
* that the surviving stack **works** rather than merely exists -- the row undoes through it and
  watches the palette value and the dirty flag both come back.

---

## 2. Item 1: the Save control, and where it went

**The finding.** Seat B checked the level tab's toolbar on all seven aeon facets and on the classic
Layout facet: `FG · BG · View · Undo · Redo` on six, `Undo · Redo` on Art, nothing in the status bar.
The **sprite** document one tab over reads `Undo · Redo · Save`. Seat B learned the gesture by
reading the `title` attribute of a 6 px dot; seat A, who could not see seat B, never found it and
guessed Ctrl+S three times.

**What I chose, and why.**

* **A `Save` chip, not a menu item and not a status-bar affordance.** The app's own precedent one
  tab over, rather than a new invention. `save-contract.md` §5 recommended exactly this (option B)
  for the same reason, and its enabledness rule (`canSaveActive`) already existed, so the control
  cannot disagree with the chord.
* **Placement: last, after Undo and Redo.** That is where the sprite header's Save sits, and a
  control that moves when you change document kind is one you have to find again. The test asserts
  the *agreement between the two headers*, not the level header alone, so reordering either one
  reddens it.
* **It survives the no-act state**, disabled with a tooltip, for the reason the header's own comment
  already gives about Undo/Redo: a disabled control saying "nothing to save" is a true statement,
  and dropping it would make the header jump.
* **Three tooltips, because a disabled button's tooltip is the only explanation anyone gets.**
  `Save this document (Ctrl+S). Save All is Ctrl+Shift+S` when it can write;
  `Nothing to save in this document` when nothing is dirty; and for the third case a **specific**
  sentence rather than a vague one, because on a level tab it has exactly one cause. A level tab is
  dotted by `levelDocDirty` **or** the aeon composer document, and the save routing is registered
  against the first alone (`shell/dirty-tabs.ts` says so at length), so dirty-but-unsavable means
  precisely "the unsaved work here is the art composer's", and the tooltip says that and points at
  the composer's own Save. On classic the composer branch does not apply, so the sentence is
  unreachable where it would be false.

---

## 3. Item 2: a save says so -- and a correction to how seat A's F2 should be read

### 3.1 The finding does not survive contact with the code as literally worded

Seat A: *"The **only** signal that anything happened is a ~6 px dirty dot disappearing from the tab
title. No toast, no status line, no list of files."*

Every save path in this app already toasts on success, and did on the day of the walk:

| saver | sentence | since |
|---|---|---|
| `state/aeon-save.ts` | `Project saved` (+ a `· removed ...` clause) | before the walk |
| `state/classic-save.ts` | `Saved N level(s)` | **2026-08-09**, blamed |
| `state/art-composer-save.ts` | `Saved chunk "X"` / `Added "X" to chunk library` | before the walk |
| the sprite and canvas savers | their own outcomes | before the walk |

Seat A's jobs were on a **classic** project (`objpos/ghz1.bin`, `palette/Green Hill Zone.bin`,
`artnem/8x8 - GHZ*.nem`), so `Saved 1 level(s)` was produced. Success and info toasts dwell
**2.2 s** (`state/toastStore.ts` `dwellMs`), and seat B's own report shows the rig can see a toast
(it recorded `Opened Sonic 4`).

**So the honest reading of F2 is not "the app says nothing".** It is: the acknowledgement is a
2.2-second message in a corner, raised by a gesture the reader had to guess, and it does not say
what was written. All three of those are real, and two of them are what this parcel fixes. I have
NOT re-measured the toast on a running window -- see §5.

### 3.2 What was built

**(a) The confirmation lands on the control.** `state/save-receipt.ts` is a two-field store bumped
by `saveActive` / `saveAllDirty` when a save **wrote** something and nothing failed; `SaveChip`
flashes `Saved!` for 1.5 s on it.

It is a store and not a `useState` because that is the difference that matters. `SpriteDocHeader`
has carried a local flash since it was written, and a local flash can only fire for a **click** --
the person who pressed Ctrl+S, which is the gesture the dirty dot's own tooltip advertises, got
nothing on the control at all. All three gestures now land the same acknowledgement.

The condition is the **exact complement** of the `unsavedElsewhereMessage` branch beside it, so
Ctrl+S either flashes `Saved!` or explains why it wrote nothing, and never both and never neither.
A control that says `Saved!` over a save that wrote nothing would be this card's own defect in a
new place, so three CONTROL rows exist for it (routing not reached, clean app, save threw).

**(b) A classic save names the files.** Seat A's F3 is the case that wants this: 14 pixels in a tile
the panel itself called *"in 0 blocks · 0 cells"* rewrote **two** `.nem` files, `+329` bytes, with
nothing on screen naming either. The paths were in hand the whole time -- `SaveClassicResult.written`
is the guarded channel's own report of what landed, relative to the project root, which is the form
seat A had to reconstruct by hand. `savedFilesSentence` appends them, bounded through `nameSome`
(the idiom `aeon-save.ts` and the Save-All fold already use), so a big save reads `+N more` rather
than filling the screen on a 2.2 s dwell.

**Not done, deliberately:** the **aeon** toast still says `Project saved` without a file list.
`saveAeonProject`'s `written` is a list of **act ids**, not paths; naming files there means new
plumbing through the ledger writers, and it already names the thing an author most wants
(removals). Filed in §6.

---

## 4. Item 4: `Discard` on a chunk, renamed rather than removed

**The defect.** `docs/reviews/2026-09-09-chunk-undo-routing.md` §7: after d-37 a chunk document
writes through, so its strokes are in the library chunk as they are made, as recorded undoable
steps. `Discard & close` therefore throws away the **document** and not the work. A control naming a
destruction that cannot happen is the same class of defect as the silent ones fixed the same day.

**Renamed, not removed, and here is the argument.** Removing the dialog looks tidier and is wrong:
Save on a chunk document is now the **only** gesture that applies the chunk to its placements in
this act (owner ruling d-18c, the propagation in `state/art-composer-save.ts`). Delete the door and
that offer goes with it, and the author walks away leaving placements showing the old art with
nothing having mentioned it. So the door stays and stops claiming a loss.

**The predicate.** `chunkDocEditsAreRecorded` in `src/renderer/state/chunk-doc-commit.ts`, pure,
taking the library rather than reading the store. It is deliberately **not** `isChunkDocument`: a
chunk document whose library entry has been undone or cleared away has nowhere its edits can be
living, and for that one the old wording is still the true one. That is the row that keeps the
reassurance honest, and it has both a test and a mutation.

**The words I chose.**

| | buffered document (unchanged) | chunk document, entry present (new) |
|---|---|---|
| title | `Unsaved strokes in "X"` | `Chunk "X" is not applied to this act yet` |
| body | `Closing this art document discards its unsaved strokes.` | `Your edits to this chunk are already in the chunk library and Ctrl+Z takes them back, so closing throws nothing away. Saving also applies them to every placement of this chunk in this act, which nothing else does.` |
| primary | `Save & close` | `Save & close` |
| middle | `Discard & close`, tone `danger` | `Close without saving`, **no tone** |
| cancel | `Cancel` | `Cancel` |

Why each:

* **The title says unAPPLIED, not unSAVED.** A title is the one line a reader is guaranteed to read,
  and "unsaved" is the word that is now wrong for this document, so the distinction goes there
  rather than being left to the body.
* **The body leads with what is already safe.** The reader's question at this door is "am I about to
  lose my work", and every second spent not knowing is the cost the dialog exists to remove.
* **It names `Ctrl+Z` by its chord**, because the card's answer is that Undo is now the abandon
  gesture, and a reader who has to go looking for it has not been told.
* **`Close without saving` / `Open without saving`** is the plainest description of what the button
  does. `components/ui/safe-focus.ts` is explicit that this repo's guards key on the `danger`
  **tone** and never on labels -- *"labels are prose and a guard keyed on them silently stops
  covering the site that gets reworded"* -- so the rename costs no coverage anywhere.
* **The tone goes.** Nothing about it is destructive. `safeFocusIndex` still lands on the reserved
  `cancel` key, so d-31 is untouched, and `confirm-dialog-focus.test.ts` §B now expands this door
  into **four** button variants (Save present or not, recorded or not) and requires `cancel` in all
  four.
* **Coin-flips, called and noted:** `Close without saving` over `Close anyway` (the latter implies
  an objection was raised, and none was); `is not applied to this act yet` over `has unapplied
  edits` (the second reads as jargon); `·` rather than a dash in the classic sentence, because
  `scripts/check-src-dashes.mjs` forbids en/em dashes in text a tool shows a person and
  `aeon-save.ts` already uses `·` for the same job.

The `stale` door's recorded copy is **unreachable today** and is written out anyway rather than left
to throw: a chunk document is stale precisely when its entry has gone, which is the case
`chunkDocEditsAreRecorded` answers false for. It is filled in because `staleTarget` returns the
first of several possible targets and a `Record` with a hole is a crash waiting for that day.

---

## 5. How each item is proven, and where the proof stops

**Runner: `npx vitest run`** (the vitest leg of `npm test`; see §7 for why the whole chain could not
be the runner tonight). New file `src/renderer/shell/__tests__/save-surface-vocabulary.test.ts`,
**24 rows in four sections**, plus one row added to
`src/renderer/state/__tests__/classic-save.test.ts`.

| item | held at | rows |
|---|---|---|
| 1 | **source gate** on `LevelWorkspace.tsx` / `SaveChip.tsx` / `SpriteDocHeader.tsx` | 4 |
| 2 | **store layer** -- `useSaveReceipt.seq`, `useToastStore.toasts`, and the pure sentence | 8 + 1 wiring row |
| 3 | **store layer** -- `useConfirmStore.request`, `useEditorStore.dirty/dirtyActs`, `documentHistoryHub` | 2 |
| 4 | **store layer** -- the request the real confirm store holds, and the pure rule under it | 10 |

**⚠ NOTHING HERE OBSERVES A RENDERED PIXEL, AND TWO CONSEQUENCES FOLLOW.** The node suite has no
jsdom, no React and no DOM. So:

* **The chip is proven to be MOUNTED and to be WIRED, not to be VISIBLE or CLICKABLE.** That is the
  same limit `shell/__tests__/sprite-doc-header.test.ts` states for the header it guards.
* **The 1.5 s flash is proven to be TRIGGERED, not to be SEEN.** The receipt bump is asserted; the
  `useEffect` that turns it into `Saved!` on screen is not executed by any row.
* **Seat A's F2 was NOT re-measured on a running window.** §3.1's correction is read off the source
  and off `git log -L` on the toast line; it is not a CDP observation. A run would also settle
  whether a 2.2 s success toast is findable at all, which is the half of F2 nothing here improves.

**TAGGED FOR FOREGROUND FOLLOW-UP** (one CDP pass, three questions, all cheap once a window is up):
does the level header paint a `Save` chip; does Ctrl+S on a dirty level tab flash `Saved!` on it;
and does a classic save's success toast name the files. The machine was to be kept quiet
(the owner's emulator at 98% CPU), and none of these three is a proof this parcel's *decisions*
rest on, so the run was declined rather than squeezed in. Item 3's verdict, which is the one thing
here that another decision rests on, is a **source** claim end to end and needs no window.

### 5.1 Red-first, with every mutation quoted from disk and restored from the committed baseline

Baseline for every restore is commit `7475377e`; `git status --porcelain` was clean under `src/`
after each one.

| id | mutation, as written to disk | rows it turned RED |
|---|---|---|
| **M1** | `LevelWorkspace.tsx`: `-      <SaveChip />` | 2 of §1 -- **2 failed \| 22 passed (24)** |
| **M2** | `project-runtime.ts`: `if (false && result.saved.length > 0 && ...)` | the receipt row -- **1 failed \| 23 passed** |
| **M2c** | `project-runtime.ts`: `if (true \|\| (result.saved.length > 0 && ...))` | **all three CONTROL rows** -- **3 failed \| 21 passed**. M2 alone would have left the controls vacuous, since they assert an absence |
| **M2b** | `classic-save.ts`: `savedFilesSentence` reduced to `return head;` | the three naming rows -- **3 failed \| 21 passed** |
| **M2d** | `classic-save.ts`: `-        writtenPaths.push(...outcome.written);` | the new wiring row in `classic-save.test.ts` -- **1 failed \| 21 passed (22)**. This is the mutation the pure-function rows could not see |
| **M3a** | `dispatch.ts`: `if (!levelDocDirty(id, snapshot)) dispose(id)` → `dispose(id)` | this parcel's aeon row **and** save-contract's R4 classic row -- **2 failed \| 34 passed (36)** |
| **M3b** (detector control) | `dispatch.ts`: a real `ask()` planted on the dirty level-close path -- i.e. the prompt the ruling declined | the no-dialog row -- **1 failed \| 23 passed**. `request === null` is an absence, so without this plant nothing could ever have contradicted it |
| **M4a** | `chunk-doc-commit.ts`: `return false && isChunkDocument(...) && ...` | the predicate row and the real-door row -- **2 failed \| 22 passed** |
| **M4b** | `chunk-doc-commit.ts`: `return isChunkDocument(open);` (library check dropped) | **the two CONTROL rows** -- the gone-chunk predicate and the gone-chunk door -- **2 failed \| 22 passed** |
| **M4c** | `open-document.ts`: `doorCopy` reduced to always return `DOOR_COPY` | the recorded-copy row and the real-door row -- **2 failed \| 22 passed** |

**On the matcher hazard this repo has been bitten by.** The §4 assertions are pointed at wording
**only** the recorded rule uses -- `already in the chunk library`, `Ctrl+Z`, `throws nothing away` --
none of which appears in `DOOR_COPY`, and M4c is the proof: with the branch removed the rows read
the buffered sentence and go red rather than matching it. The buffered CONTROL row asserts the
converse (`/discards/` present, `Ctrl+Z` absent), so neither copy can quietly become the other.

---

## 6. What is open

1. **`SpriteDocHeader` is not re-homed onto `SaveChip`.** It should be, and then its Ctrl+S would
   flash too. Left alone because `shell/__tests__/sprite-doc-header.test.ts` pins that header's own
   source text (`setSaveFlash`, `'Saved!'`, its two tooltips), and rewriting a guard in the same
   change that moves the code it guards is how a green stops meaning anything.
2. **The aeon success toast does not name files** (§3.2). Needs plumbing through the ledger writers.
3. **The README still does not state the save gesture.** `save-contract.md` §4 deferred it until a
   control existed; one exists now, so this is newly writable and was left for whoever owns the
   README's shape.
4. **Seat B's F9** (undoing back to the start leaves the document dirty) was explicitly out of this
   parcel and was **not** tripped over: `save-contract.md` reports it FIXED under R5, and this
   parcel's §3 row exercises it incidentally -- the undo clears `dirty` and empties `dirtyActs`.
5. **The narrow classic zone-art question in §1.2** -- can a level tab for a *non-loaded* act be
   closed while the loaded act's tab is absent? Unreproduced; a question, not a finding.
6. **One CDP pass, tagged** (§5).

---

## 7. Verification, in full, including two reds that are not mine

**`npm test` FAILS ON THIS TREE AND FAILED AT THE BASE COMMIT**, at the check chain, before vitest
is ever invoked. Both failures come from `b64245ad`, the commit immediately preceding this branch,
and neither touches a file this parcel edits:

```
check-doc-citations: FAIL, 1 citation(s) on line(s) written since 2026-09-06T00:39:36Z point at
    docs/2026-09-09-audit-briefing.md:18  docs/lane-status.json  [ABSENT]
  -- the cited file is untracked; it exists in the main checkout only.

check-ledger-timestamps: FAIL: docs/decisions.jsonl
  2026-09-09T17:12:22Z  5f63a67f then b64245ad  What should the save-side controls SAY and DO ...
  -- the d-38 card's own line, rewritten when the card was answered, so its stamp
     collides with itself; both appearances are in scope and the line is still present.
```

(Quoted inside a fence deliberately: the first of those two gates judges citations, and naming the
absent file in prose here would make this packet its third finding.)

Both are another lane's records; correcting either would mean editing a decision entry or a peer's
review, so they are **reported, not fixed**. The remaining thirteen chain scripts and
`check-harness-guards` were run individually and all pass.

**The runner used for every figure below is therefore `npm run typecheck && npx vitest run`.**

| | typecheck | Test Files | Tests |
|---|---|---|---|
| base `b64245ad` | clean | 585 passed \| 3 skipped (588) | **8745 passed \| 9 skipped (8754)**, 0 failed |
| after | clean | 586 passed \| 3 skipped (589) | **8770 passed \| 9 skipped (8779)**, 0 failed |

`+25` rows, all new and all this parcel's: 24 in
`src/renderer/shell/__tests__/save-surface-vocabulary.test.ts` and 1 in
`src/renderer/state/__tests__/classic-save.test.ts`. Two existing rows in
`src/renderer/components/art/__tests__/art-discard-guard.test.ts` were updated rather than added to:
they `toEqual` the whole `planArtDocDiscard` result, which grew a `writesThrough` key.

**No emulator was touched and no ROM was built** (standing invariant; nothing here wants one).

---

## 8. Files

| file | what |
|---|---|
| `src/renderer/shell/SaveChip.tsx` | new; the control and the flash |
| `src/renderer/state/save-receipt.ts` | new; "a save wrote something", for whichever gesture raised it |
| `src/renderer/workspace/LevelWorkspace.tsx` | mounts the chip last in the header |
| `src/renderer/state/project-runtime.ts` | `saveActive` / `saveAllDirty` note the receipt |
| `src/renderer/state/classic-save.ts` | `savedFilesSentence`; the success toast names what landed |
| `src/renderer/state/chunk-doc-commit.ts` | `chunkDocEditsAreRecorded` |
| `src/renderer/components/art/open-document.ts` | `RECORDED_COPY`, `artDocDiscardTitle`, the second conditional spread on the button list |
| `src/renderer/shell/__tests__/save-surface-vocabulary.test.ts` | new; 24 rows |
| `src/renderer/state/__tests__/classic-save.test.ts` | +1 row (the wiring) |
| `src/renderer/components/art/__tests__/art-discard-guard.test.ts` | 2 rows updated for the grown plan shape |
