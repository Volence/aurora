# d-29 + d-30 — ask before destroying, and only when something would be lost

**Branch** `parcel/confirm-before-destroying` off `master` `b26ad20e`
**Instrument** `npm run harness:confirm-destroy` → `scratchpad/confirm-destroy-harness.mjs` (19 rows, 19/19)
**Node gate** `src/renderer/shell/__tests__/confirm-before-destroying.test.ts` (11 rows, in `npm test`)
**Date** 2026-09-04 · box uptime at the first measurement: `up 9 days, 17:24`

---

## 0. Who ruled this, and how it must be presented

Both cards were answered **by the suite hub, in the owner's place**, under a standing
delegation covering open decision cards. **This is not an owner act.** The answering
entries say so themselves and say the ruling is **explicitly overturnable on his
read-back** — `docs/decisions.jsonl`, `d-29-new-sprite-clears-undo-answered` and
`d-30-chunk-library-clear-answered`. Both entries also record that the hub ruled the
option the filing agent had recommended, so **both parties to each closure held the same
preference and neither is an independent check on the other**.

Nothing in the code, the ROADMAP or this packet attributes the choice to the owner.

| card | answer |
|---|---|
| d-29 | `guard_when_dirty` — the sprite size chips and `New □` confirm before replacing a sprite that has unsaved edits |
| d-30 | `confirm_before` — Clear in the Chunks section confirms before emptying the library |

**The shared principle, and it is the whole design: ask before destroying, *and only when
something would actually be lost*.** A clean document sees **no dialog at all**. That is
what makes this consistent with the owner's own d-27 pick — where he chose the smallest
change and *no* dialog, **because** that wipe was one Ctrl+Z away — rather than a new
pattern imposed on him.

---

## 1. What was there, re-verified before anything changed

**d-29.** `newSprite` (`src/renderer/state/spriteStore.ts:634`) is two lines:

- `activeSpriteHistory().clear()` — so unlike the collision Clear/Reset d-27 was ruled on,
  this is **not one Ctrl+Z away**;
- `set({ ...blankDoc(w, h) })`, and `blankDoc` sets `unsavedEdits: false`
  (`spriteStore.ts:277`).

That third fact is the one that makes this worse than "un-undoable": the dirty dot goes
out, so the tab-close, project-open and window-close guards — which exist precisely to
stop this loss — have **nothing left to fire on**. The buttons that call it are the size
chips in the option bar, beside tools an author uses constantly.

**d-30.** `clearChunkLibrary` (`src/renderer/providers/chunk-library-import.ts`) calls
`useProjectStore.clearChunks` (`src/renderer/state/projectStore.ts:105`), a bare zustand
`set` that never enters the undo machinery. Measured on a real click by the filing agent:
71 chunks to 0, still 0 after Ctrl+Z. Library **adds** deliberately live outside undo
history (the store says so beside `addChunks`); the removal simply inherited that path.
Nobody chose it for the removal.

Also true, from the d-30 amendment (`d-30-chunk-library-clear-measured`): a save after
clearing does **not** persist the empty library, so re-opening the project really does
recover it. **That makes the defect milder, not different** — the recovery is a step
nobody would guess from the app — and it is not used here as a reason to weaken the
confirm. It is in the dialog copy because it is true and useful at the moment of the
decision.

---

## 2. What changed

| file | change |
|---|---|
| `src/renderer/shell/new-sprite-guard.ts` | **new.** `newSpriteGuarded(w, h)` / `newSpriteWouldDestroy()` |
| `src/renderer/shell/SpriteToolOptions.tsx` | both dispatch lines route through the guard |
| `src/renderer/providers/chunk-library-import.ts` | `clearChunkLibrary` becomes async and confirms when the library is non-empty |
| `src/renderer/components/AeonChunkActions.tsx` | Clear calls the async guard, and now goes through `actAndDropFocus` |
| `src/renderer/components/__tests__/d27-act-and-drop-focus.test.ts` | spellings updated; `AeonChunkActions` **added** to `SITES` |
| `src/renderer/shell/__tests__/confirm-before-destroying.test.ts` | **new**, 11 rows |
| `scratchpad/confirm-destroy-harness.mjs` + `package.json` | **new**, registered in the same commit as the file |

### 2.1 The confirm machinery is REUSED, not built

Both guards ask through **`useConfirmStore`** (`src/renderer/state/confirmStore.ts`), the
same promise-based store that **tab close** (`shell/tab-activation/sprite.ts`), **project
open** (`shell/project-open-guard.ts`), **window close** (`shell/close-guard.ts`) and
**Setup Apply** already use, rendered by the same `shell/ConfirmDialog.tsx`. That reuse is
load-bearing rather than convenient: the third ground of both rulings is that this is
**consistency with a perimeter that already exists**, and a second dialog mechanism would
have removed the ground the decision was made on. No new dialog component, no new store,
no new modal registry entry.

### 2.2 "Is there something to lose" comes from the document's own dirty state

`newSpriteWouldDestroy()` reads the **active** sprite document's `unsavedEdits` —
deliberately **not** `anySpriteDocDirty()`, which the project-open perimeter uses. That
predicate also covers **parked background** sprite documents, and `newSprite` does not
touch them: it calls `activeSpriteHistory()` and replaces the checked-out document alone.
Asking about a background tab's edits would confirm on a press that cannot lose them —
the same "dialog where nothing is at stake" the ruling exists to avoid.

For chunks the analogue is the library's own size: an empty library asks nothing.

### 2.3 Two buttons, not three — a choice made *under* the ruling, not *by* it

The other confirm doors offer Save / Discard / Cancel. These two offer only
Discard/Clear and Cancel. The document the chips replace is frequently an **untitled**
sprite with no file to save to, and a sprite checkout can refuse its own save-back
(`saveBackRefusal`), so a Save arm would need its own failure path and its own message,
and no part of d-29 asked for one. The dialog's job here is to stop the loss; Ctrl+S is
one keystroke away before pressing the chip. **Recorded as an open point (§6), not as
something the card decided.**

### 2.4 `make_it_undoable` was NOT done, and the code says why

d-30 considered and rejected making the clear undoable: it would leave undo working for
the clear and not for the **import**, and a half-working undo is worse than a consistently
absent one. The docblock on `clearChunkLibrary` and the node row *"is NOT undoable, and
that was chosen"* both pin this so a future "improvement" has to argue with the card.

### 2.5 A d-27 exemption expired, and that is why `AeonChunkActions` joins the pin list

`docs/reviews/2026-09-03-d27-disputed-six.md` **clicked** all six of d-27's excluded
controls and found the unmount claim held for exactly two, one of them
`AeonChunkActions`'s Clear: it drops focus by **unmounting**, because `hasChunks` goes
false the instant the library empties.

**The confirm consumes that premise.** On the *cancel* path the library is intact, so the
button stays mounted **and focused** — precisely the shape d-27 was ruled on. So it now
goes through `actAndDropFocus` like every other destructive control, and joins `SITES` in
the d-27 spelling pin. This is keeping an existing property, not new scope; harness row
`[k3]` measures `document.activeElement` after a real Cancel click and it is `<BODY>`.

---

## 3. Proving it — and the row that actually discriminates

### 3.1 Why a CDP harness at all

The node suite has no React, no DOM, no dialog and no click. **6,963 vitest rows go green
here while `<ConfirmDialog />` is not mounted at all** — that is not a rhetorical claim,
it is plant **P5** below, measured.

### 3.2 The 19 rows

| rows | what |
|---|---|
| `[b1] [b2]` | fixture + anti-vacuous: a real S1 sprite document, >1 frame, **clean**; the handle table found exactly `SIZE_PRESETS`; no dialog standing at boot |
| `[n0]`–`[n4]` | **DIRTY** document, preset chip: the dialog appears, names the loss and **the document is untouched while it stands**; Esc cancels; a **mouse click on Cancel** cancels; Discard proceeds |
| `[c0] [c1] [c2]` | **CLEAN** document, preset chip and `New □`: **no dialog was ever on screen** and the action still happened |
| `[n5] [n6]` | `New □` **dirty**, its own dispatch line: asks, Cancel keeps, Discard proceeds |
| `[z1]` | nothing was saved |
| `[k0]`–`[k5]` | aeon chunk library: fixture (71 chunks, Clear on screen); the dialog names the **count**; Esc keeps; mouse Cancel keeps **and the button does not keep focus**; Clear empties it; and with the library empty the button is **gone from the DOM** |

**`[c1]`/`[c2]` are the rows this file exists for.** An implementation that confirms
unconditionally passes every `[n*]` row and **fails the ruling**. They are measured with a
`MutationObserver` armed **before** the press and latching, because a single sample
afterwards cannot tell *never appeared* from *appeared and closed*. Their positive control
is `[n1]`–`[n4]` **in the same run**: those report `seen=true`, so the detector
demonstrably fires.

**`[k5]` is d-30's analogue of `[c1]`, and it is an honest one.** d-30's "nothing to lose"
case is **unreachable through the UI** — `AeonChunkActions` gates the button on
`hasChunks` — so it is measured as a structural absence and the guard's own `count > 0`
arm is proved in the node suite instead. Stated in the row rather than shipped as a
fabricated click.

### 3.3 Real input, integer pixels

Every press is `Input.dispatchMouseEvent` press/release; every key is
`Input.dispatchKeyEvent`. **No `el.click()` anywhere.** Each aim is rounded to integer
client pixels **before** it is sent, verified with `elementFromPoint`, and the dpr and
derived aim are printed on every row. `dpr=1` on both green runs; the harness prints it so
a 1.35 run is legible rather than mysterious. A miss REFUSES.

The dialog's backdrop is `position: fixed; inset: 0`, so an aim at a chip while a dialog
stands lands on the backdrop and the run refuses — it is structurally impossible for this
file to silently measure a press the modal ate.

### 3.4 Red-first — five plants

Each was applied on disk, shown with `git diff --stat` naming the file, rebuilt
(`VITE_AURORA_DEBUG=1 npm run build`), run, and **restored from the committed baseline
`5b68f286`** with `git checkout 5b68f286 -- <path>` (never `git checkout --` on a dirty
tree), with `git status --short` empty afterwards.

| plant | mutation | harness | `npm test` / vitest |
|---|---|---|---|
| **P1** | `new-sprite-guard.ts`: delete the clean-document early return → **confirm always** | **17/19 — `[c1]`,`[c2]` RED**, every `[n*]` and `[k*]` green | red (1 failed) |
| **P2** | `SpriteToolOptions.tsx`: revert **only the preset-chip** line to `st().newSprite(s, s)` | **15/19 — `[n1]`–`[n4]` RED**, `[n5]`/`[n6]`/`[c*]`/`[k*]` green | red (1 failed) |
| **P3** | `SpriteToolOptions.tsx`: revert **only `New □`** | **17/19 — `[n5]`,`[n6]` RED**, `[n1]`–`[n4]`/`[c*]` green | red (1 failed) |
| **P4** | `chunk-library-import.ts`: `if (false && count > 0)` — drop the chunk confirm | **`[k1]`,`[k2]` RED**, all sprite rows green, then REFUSED (`HANDLE ABSENT: "chunkClear"` — the first click wiped the library so the button unmounted) | red (2 failed) |
| **P5** | `App.tsx`: `{false && <ConfirmDialog />}` — the dialog is never rendered | **5/19 — 14 rows RED** | **GREEN, 6963 passed, 0 failed, rc=0** |

**P1 is the plant the ruling rests on.** It reddens `[c1]` and `[c2]` and *nothing else* —
"the dialog appears" stays perfectly green while the ruling is violated. `[c1]`'s red line
reads `watcher seen=true … frames=1 64x64 → frames=1 64x64`, i.e. a dialog appeared on a
clean document and the chip did nothing.

**P2 and P3 are the two-dispatch-line pair.** They are twenty lines apart in one file and
each plant reddens only its own site's rows — the discrimination this repo loses defects
for want of.

**P5 is why the CDP harness is not redundant with the node suite.** The store parks the
request, every unit row still passes, the whole suite is green, and the app is broken: no
dialog, and the chips silently do nothing at all.

### 3.5 A green under a plant would have three explanations — none arose

No plant came back green. For completeness, the three causes the harness is built against:
a **loose matcher** (each row asserts the specific state — `frameW`, `frameCoverage`, the
chunk count, the observer's latch — not a substring); a **second code path** (each of the
two `newSprite` dispatch lines has its own rows, and P2/P3 show them independent); and
**never reaching the subject** (every aim prints `elementFromPoint` + `isTarget`, and
refuses on a miss — P4's `HANDLE ABSENT` is that refusal working).

### 3.6 A tooling error I made and corrected

The first plant script ran the node suite as `npx vitest run --reporter=basic`. That is
not a valid reporter in this vitest, so it exited **1 on a startup error** — and I would
have reported "the node suite caught it too" off a run that never collected a test. It was
caught by reading the log rather than the exit code. The flag was removed and **P1's node
arm was re-measured** on its own (plant applied, `npx vitest run`, restore): `1 failed |
6962 passed | 9 skipped`, the failing row being *"a CLEAN document asks nothing at all"*.
P2–P5's node arms ran under the corrected script. Recorded because an exit code read as a
measurement is exactly the false-zero shape this repo keeps paying for.

And a second one, in the other direction: every plant run used `npx vitest run`, which
**does not typecheck**. The first full `npm test` after the packet was written came back
**rc=2** on `TS2307: Cannot find module '../../../core/types'` in the new test file — a
wrong type-import path that all eleven of its rows had been passing straight through.
Repaired (`ChunkDef`/`S4Project` from `core/model/s4-types`), and it is the exact case
`package.json`'s own `//test` note exists for: *vitest strips types without checking them*.
The numbers in §4 are from the full chain, not from `vitest run`.

---

## 4. Suite totals, both run by me

| | test files | tests |
|---|---|---|
| **before** (`master` `b26ad20e`, full `npm test`, rc=0) | 490 passed / 3 skipped (493) | **6951 passed / 9 skipped (6960)** |
| **after** (full `npm test`, rc=0) | 491 passed / 3 skipped (494) | **6963 passed / 9 skipped (6972)** |

+12 tests: 11 in the new `confirm-before-destroying.test.ts`, +1 `SITES` row in the d-27
pin. `tsc --noEmit` clean (it is inside the `npm test` chain). Both runs are from a linked
worktree, where `test/support/sibling-root.test.ts` step 3 is structurally unmeasurable and
skips — so these differ from a main checkout by one pass / one skip.

**No emulator was touched.** No `mcp__oracle__*` call, no emulator MCP tool, in any run.

**Nothing was written to disk by any harness run.** No Ctrl+S, no save call; the app has
no autosave (`shell/close-guard.ts`). `s1disasm` and the `aeon` tree were **opened only**.

---

## 5. One existing instrument is now RED, and I did not touch it

`scratchpad/d27-sprite-focus-harness.mjs` rows **`[sp1-a]`, `[sp1-b]`, `[sp1-c]`,
`[sp2-a]`, `[sp2-b]`, `[sp2-c]`** press the size chips and `New □` **on a document that is
dirty at that point in its run** (the earlier `[fg]`/`[pal]`/`[can]` sections paint and
edit, and `undo` deliberately leaves `unsavedEdits` alone) and assert the document was
replaced. **d-29 consumes that premise**: those presses now raise a confirm and the
document is correctly *not* replaced until it is answered. `[sp1-d]`/`[sp2-d]` press a
clean virgin document and are unaffected.

This is the same shape as d-27's own `[k2]` retirement: a row whose premise a later ruling
consumes. **I did not edit it** — this parcel is explicitly forbidden from touching
existing files under `scratchpad/`, where another agent is live. It is **not** in the
`npm test` chain (harnesses run only via `npm run harness:*`), so nothing is silently red;
it goes red when someone runs it.

> **TAGGED for foreground follow-up:** either retire those six rows explicitly (the d-27
> `[k2]` precedent) or teach them to answer the dialog. Not doing it silently, and not
> doing it in this branch.

---

## 6. Open, and deliberately not done

1. **No Save arm on the sprite dialog** (§2.3). If an owner read-back wants Save & new,
   it needs a decision about the untitled/refusal cases; the guard is the one place to add
   it.
2. **`useSpriteStore.getState().newSprite` is still unguarded by design.** A third call
   site that wants the guard must call `newSpriteGuarded`. Pinned by the node row *"the
   store action itself is UNGUARDED"* and stated in both docblocks.
3. **`AeonChunkActions`'s Import is not guarded.** Import *adds*; it destroys nothing, and
   neither card mentions it.
4. Both rulings remain **overturnable on the owner's read-back** (§0). If he reverses
   either, the code change is a single early-return in one file per card.
