# The save contract: five receipts, four fixes, one look decision left with the owner

**Branch** `parcel/save-contract`, base `c8652263`.
**Source** `docs/reviews/2026-09-09-uxpair-reconciliation.md` §1 C1, and the seats' own
reports: `docs/reviews/2026-09-07-lens-ux/uxa-walk.md` F2 and
`docs/reviews/2026-09-07-lens-ux/uxb-audit.md` F2 / F3 / F7 / F9.

Two UX seats walked the app on 2026-09-07 without being able to see each other and
converged on the save contract. This parcel reproduced every mechanical half of that
convergence on a live window, fixed four of them, and parks the fifth — which is a look
decision — for the owner.

---

## 0. Read this before any number below: four predicates that are not synonyms

Every claim in this packet says which of these it measured. A control that confirms one
while the instrument keys on another passes and proves nothing.

| # | Predicate | How it is read |
|---|---|---|
| **a** | **The store believes there are unsaved edits** | `window.__dbg.aeon.state().dirty` / `.dirtyActs`, and `useEditorStore` in the node suite |
| **b** | **The screen shows a marker** | a `<span>` in the tab strip a person can see |
| **c** | **A tool can read the state** | an **accessible name** (`aria-label`). A `title` is a hover and was already there, so a scan that counted it would be green over the defect |
| **d** | **The bytes on disk moved** | `statSync` inode/mtime/size on the act file inside a throwaway clone |

`dirty` and `unsaved` are the pair that bit hardest: an act can be dirty in the store,
show no marker on screen, and have a file on disk that is already correct — all three at
once, which is exactly seat B's F3.

**Shell hazard, measured in this shell rather than taken on trust.** `grep -r` here is a
shell function from a Claude Code snapshot that honours ignore files: a canary written to
`dist/_canary.txt` (proved ignored by `.gitignore:2:dist/`) returned **0 from `grep -rl`
and 1 from `command grep -rl`**. Every measurement in this packet that reads built output
used an explicit file path, and each was re-run under `command grep` and agreed. Anything
recursive under `dist/` in a future pass must use `command grep`.

---

## 1. The receipts, and what each one turned out to be

| id | Receipt, as filed | Reproduced? | Verdict |
|---|---|---|---|
| **R1** | "On a **level** surface, `Ctrl+S` is a silent no-op" (reconciliation §1) | **Re-scoped** | With the level tab **active** Ctrl+S saves: bytes move, dot clears. The no-op is real but its condition is *the active tab has no saver*, which is where seat B actually pressed it |
| **R2** | Ctrl+S produced "no toast, no error, no message of any kind" while `dirtyActs` was `["ojz/act1"]` both sides (uxb F3) | **Yes** | **FIXED** — the refusal now speaks |
| **R3** | A full-DOM scan for an unsaved marker returns `[]` on a dirty document (uxb F3) | **Yes**, in a sharper form | **FIXED** — the dot had no accessible name |
| **R4** | A level tab closes while dirty with no confirmation; the close **keeps the edit** but wipes Undo *and* Redo (uxb F2) | **Yes** | **PARTLY FIXED** — the history loss is fixed; the confirmation is a look decision, §5 |
| **R5** | Dirty never clears after undoing back to the start state (uxb F9) | **Yes** | **FIXED** |
| — | The README never states the save gesture; a successful save reports only a ~6 px dot (uxa F2) | n/a | **NOT FIXED, deliberately** — §4 |

---

## 2. How each was reproduced

All reproductions drove the built app on a private Xvfb through `spawnGuarded`, with real
`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` — never `element.click()`, never a
unit test standing in for delivery. The project opened was a **clone under `mktemp`**, and
the resolved `aeon` checkout was stamped before and after and is byte-for-byte unchanged.

The run announced its own tree, and this is the line quoted verbatim because a worktree
with no `node_modules` silently drives main aurora's `dist/` while every path in the output
looks right:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ae008371db1b1cdd2
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ae008371db1b1cdd2
NOTE  run root  … · borrowed=false · electron=<that worktree>/node_modules/.bin/electron
```

**The instrument is committed**: `scratchpad/save-contract-harness.mjs`, registered as
`npm run harness:save-contract`. It refuses up front on a borrowed run root, on a stale
build and on a plain (non-debug) build, and reports `UNMEASURED` rather than passing when
it cannot read something.

### The pre-fix state, measured (`npm run harness:save-contract` against a build with the
### fixes reverted on disk and rebuilt — 12/16 rows passed, 4 failed, 0 unmeasured)

```
FAIL [1c] R3  aria-labels matching /unsaved/i: []
              …while [{"title":"Unsaved changes. Ctrl+S to save","w":6,"h":6}] was on screen
FAIL [3b] R5  objects back to 9 (was 9 at the save);
              state {… "dirty":true,"dirtyActs":["ojz/act1"]};
              dots [{"title":"Unsaved changes. Ctrl+S to save","w":6,"h":6}]
FAIL [5a] R2  toast(s): []
              dirtyActs before ["ojz/act1"] after ["ojz/act1"]
FAIL [4c] R4  {"canUndo":false,"undoBtn":true,"redoBtn":true}; objects 10 (was 10 before the close)
```

Every other row passed **in both directions**, which is what makes them controls rather
than decoration — notably:

```
PASS [1a] a placed object makes the STORE dirty        objects 8 -> 9; dirtyActs ["ojz/act1"]
PASS [1b] and the tab strip SHOWS a marker             [{"title":"Unsaved changes…","w":6,"h":6}]
PASS [2a] R1: Ctrl+S with the level tab ACTIVE moves the bytes and clears the store
          before: ino=8781483 … size=549
          after:  ino=8785043 … size=708
PASS [4b] the close KEEPS the edit                     tabs ["Home"]; state {… "dirty":true …}
PASS [6a] aeon's own checkout is BYTE-FOR-BYTE where it was
```

### The post-fix state: **16/16 rows passed, 0 failed, 0 unmeasured**

```
PASS [1c] aria-labels matching /unsaved/i: [{"tag":"SPAN","role":"img","name":"Unsaved changes"}]
PASS [3b] state {… "dirty":false,"dirtyActs":[]}; dots []
PASS [5a] toast(s): ["Ctrl+S wrote nothing. Unsaved work is open in: a level.
                     Ctrl+Shift+S saves everything that has somewhere to go."]
PASS [4c] {"canUndo":true,"undoBtn":false,"redoBtn":true}; objects 10
```

---

## 3. What changed, and why

### R3 · The dirty dot had no name — `src/renderer/shell/TabStrip.tsx`

**Cause.** The marker was a bare 6×6 `<span>` carrying a `title` and nothing else: no
text, no role, no accessible name. A screen reader walks past it and a DOM scan finds a
decorative element. Seat B's `[]` was correct; it just under-stated the case, because it
scanned while the tab was closed and read the absence as "no marker anywhere". With the tab
**open** the scan returns exactly one hit — and it is a tooltip.

**Change.** `role="img"` + `aria-label="Unsaved changes"`, keeping the `title` (which is
what a pointer user gets, and it names the remedy). The two strings are exported constants
so a test asserts the rendered name against the one definition. **Nothing visual changed.**

The document also has **zero** `aria-live` / `role="status"` / `role="alert"` regions.
Announcing state changes is a design decision and is not made here.

### R5 · Dirty never cleared — `editorStore.ts`, `bound-edit-history.ts`, `history-factories.ts`

**Cause.** `dirtyActs[key]` is a monotone edit counter. Nothing ever walked it back, so the
dot could only be turned on; and `UndoStack` is argument-free, so an undo could not even
tell the store which direction the document had moved.

**Change.** `BoundEditHistory`'s `onCommand` now carries a direction
(`'execute' | 'undo' | 'redo'`). An undo calls a new `markUndone()` which decrements; a redo
calls `markDirty({ undoable: true })` which increments. `dirty` is now **derived** from the
map rather than asserted.

**⚠ The part that was nearly a data-loss bug, and the control that caught it.** Walking the
counter back is only sound while *every* edit since the last clean point was an undo step.
It is not: `markDirty()` is also called from mid-gesture paths that record no command at all
(a direct BG tile write in `MapViewport`, a collision stroke's other plane, a chunk library
import). Counted the same way, this sequence would have reported **clean over unsaved work**:

> place A → save → write a BG tile directly → undo A

So `markDirty()` **defaults to hard** and only `executeCommand` / `executeAmbientCommand`
opt in. A hard-dirty act is never cleared by an undo. There is a row for exactly this
(`an edit no undo can revert keeps the act dirty however far the stack unwinds`), and a
second for the other direction (`undoing past a save is dirty, and redoing back to the save
is clean`) — **that second one failed on my first implementation**, because `markDirty`
returned `dirty: true` unconditionally, so a redo that landed back on the saved point left
the dot on.

### R4 · The close destroyed the undo history — `tab-activation/dispatch.ts`

**Cause.** `disposeStacksForClosedTab` was written on a sentence that is true of a sprite
and of a canvas and **false of a level**: "a closed document's stack is unreachable". A
sprite's and a canvas's documents die with their tab. A level's does not — closing the tab
unloads nothing, the act stays resident, its unsaved edits stay unsaved, and reopening shows
them again. So for a level tab the dispose was the one destructive thing a close did.

**Change.** Keep the stack (and the zone-art stack) while `levelDocDirty` says the work it
could revert is still unsaved. A **clean** document keeps the old behaviour exactly — there
is nothing to take back and the stack is genuinely debris — and that is a row.

`src/renderer/shell/close-guard.ts`'s header claimed "every other exit door already prompts
— tab close, act switch, project open, Setup Apply". That sentence is false for a level tab
and is corrected in place rather than deleted, because two readers took it as a promise the
app was keeping.

### R2 · A save that wrote nothing said nothing — `dirty-tabs.ts`, `project-runtime.ts`

**Cause.** `saveActive` is deliberately narrow — it writes the active tab's document and
nothing else, and "a tab nothing owns (Home, Project Setup) or a clean one is a silent
no-op". The narrowness is right and is unchanged. The **silence** was wrong, because the tab
strip is simultaneously showing a dot whose tooltip names this exact gesture as the remedy.

**Change.** A new pure rule `unsavedElsewhereMessage(snapshot)` returns a sentence, or
`null` when nothing anywhere is dirty; `saveActive` toasts it **only** when it wrote nothing
and failed nothing. Ctrl+S on a clean app is as silent as it always was. It is derived from
the same snapshot the dot is, so the two cannot disagree about whether work is unsaved.

The sentence names **kinds**, not documents: the snapshot carries ids, and a message naming
`doc:canvas:sky` at a person would be worse than one that says a canvas document is unsaved.

---

## 4. What I deliberately did **not** change

1. **No Save control was added anywhere.** Seat B's F7 is real — a level document's toolbar
   is `FG · BG · View · Undo · Redo` and a sprite document's is `Undo · Redo · Save` — and
   fixing it means designing a control. **The owner has said the look is his.** §5.
2. **No success toast on a save that worked.** Seat A's F2 remedy ("a transient toast naming
   the files written") is the right idea and it is *wording plus a channel*, which is the
   same call as a control. §5.
3. **No confirmation dialog on a level-tab close.** Once the history survives, the close is
   non-destructive; a dialog on a non-destructive action is a policy choice. §5.
4. **`Ctrl+S` was NOT widened to save everything.** The comment in `save-coordinator.ts` is
   right that writing a background document the user had not finished with is a real cost.
   The fix is to say so, not to write more files.
5. **The README's missing save gesture** — a documentation change I could have made in one
   line, and did not, because the same paragraph will have to name whatever control §5
   settles on, and writing it twice is how a doc goes stale.
6. **Seat B's F8** (a project switch destroys an ephemeral art document) is a different
   door, was door-observed rather than button-observed by its own admission, and is not
   touched here.
7. **The `aria-live` question.** Adding a live region would make every state change
   *announced*, which is a behaviour a person hears. Out of scope for a mechanical pass.

---

## 5. ⚠ PARKED FOR THE OWNER — one decision, three parts, with a recommendation

**The question.** The level surface has no visible Save affordance, a successful save
reports only a 6 px dot disappearing, and a dirty level tab closes without asking. All
three are the same decision: *what does saving look like in Aurora?*

**What is already true after this parcel**, so the decision is not urgent and nothing is
being lost while it waits:

* Ctrl+S on a level tab works and writes (`[2a]`).
* The state is now readable by an assistive tool and by a DOM scan (`[1c]`).
* A Ctrl+S that writes nothing while work is unsaved says so (`[5a]`).
* A close no longer destroys anything: the edit and the undo history both survive (`[4c]`).

**Options, with costs.**

| | Option | Cost | Risk |
|---|---|---|---|
| **A** | **Nothing more.** Ctrl+S + the dot + the refusal toast. | 0 | A newcomer still has to be told the gesture; the README still does not state it |
| **B** | **A `Save` chip on the level toolbar**, mirroring the sprite document's existing `Undo · Redo · Save`. `canSaveActive()` already exists and is the exact enabledness rule the button needs. | ~20 lines, one row | It changes a toolbar the owner has looked at |
| **C** | **B, plus a success toast** naming what was written (seat A's F2 and F3 remedy: the art save that grew two `.nem` files by 329 bytes unannounced is the case that wants it). | B + a save-outcome sentence; `state/save-outcome-report.ts` already collects the outcomes | Toast volume on a Save All |
| **D** | **A confirmation on a dirty level-tab close.** | ~15 lines | ⚠ It would have to **not** offer "Discard", because nothing is discarded. A three-button dialog copied from the project-open door would be a lie |

**My recommendation: B, then C.** B is the smallest thing that ends the discoverability half
outright, it is the app's own precedent one tab over rather than a new invention, and its
enabledness rule already exists so it cannot disagree with Ctrl+S. C is what closes seat A's
"I never knew what I had written", and it is worth more on the **art** surface than on the
level one. **Not D**: after R4's fix the close is non-destructive, so a prompt would be
asking permission for something that cannot lose anything, and the honest version of that
dialog has no Discard button, which makes it a strange dialog. If a prompt is still wanted,
it should say *"this tab has unsaved work; closing keeps it"* and offer **Save & close /
Close / Cancel** — but that wording is a look call and I am not making it.

---

## 6. Verification

**Node suite** (`npm test`, which runs fourteen check scripts and a typecheck before vitest):

| | Test Files | Tests |
|---|---|---|
| **base** `c8652263` + `resolve.dedupe`, my changes stashed | 4 failed, 565 passed, 3 skipped (572) | **77 failed, 8423 passed, 9 skipped (8509)** |
| **after** | 4 failed, 566 passed, 3 skipped (573) | **77 failed, 8435 passed, 9 skipped (8521)** |

Exit code **1 at both ends**, and that has to be said plainly: **4 test files fail on this
machine at the base commit, and this parcel neither caused nor fixed them.** They are
`aether-badge-identity`, `map-device-scale`, `map-viewport-mounted` and `classic-map-wheel`,
77 rows, every one of them
`TypeError: Cannot read properties of null (reading 'useCallback')` — the same second-React-
instance defect described in §7. Measured as a control by running exactly those four files
with my changes stashed: **identical 77 failed | 6 passed**.

+12 rows, all mine, all new: `src/renderer/shell/__tests__/save-contract.test.ts`.

**Red-first, by reverting the fix on disk and rerunning** (the test file left in place):

* stash `editorStore` + `history-factories` + `bound-edit-history` + `dispatch` →
  **4 failed | 8 passed**, and the four are the three R5 rows plus the R4 dirty row. The R4
  **clean** control stayed green, which is what makes it a control.
* stash `project-runtime` alone → **1 failed | 11 passed**, the R2 row, with both its
  controls (silent when clean, silent when it wrote) still green.

**Foreground** (`npm run harness:save-contract`): **12/16 → 16/16**, quoted in §2.

---

## 7. ⚠ Found on the way in, and it blocks every CDP harness in the repo

**A build of this tree here does not render.** `VITE_AURORA_DEBUG=1 npx electron-vite build`
(vite 8.0.8) put react's module into the `project-runtime` chunk as well as into `index` and
`classicProjectStore`. `App.tsx` imports project-runtime at mount, so `useProject`'s first
`useCallback` came out of the copy react-dom had never installed a dispatcher on:

```
TypeError: Cannot read properties of null (reading 'useCallback')
  at exports.useCallback (assets/project-runtime-*.js)
  at useProject -> at App -> renderWithHooks
```

The window opens, `document.title` is `Aurora`, `#root` is **empty**, and **nothing is
logged**: the only way to see it is CDP with `Runtime.exceptionThrown` enabled. A blank app
that reads as a hung one.

Measured before claiming it, because "the build is broken" is a large claim: five
consecutive builds with **identical chunk hashes** (deterministic, not flaky); three commits
(`c8652263`, `aa64764d`, `8b606f8b` from 09-05) all duplicating, so it is not a regression of
anything recent; the plain non-debug build crashing the same way inside `index` itself; and
`resolve.dedupe` collapsing the extra copy, after which `#root` went from **0 to 8211
characters** on the same tree with the same `node_modules`.

**What I cannot explain, and am saying so rather than rounding off.**
`/home/volence/sonic_hacks/aurora` carries a `dist/` built `2026-09-09T08:07:15Z` whose
chunks have only the two copies and which paints. Its `src/`, `package.json`,
`electron.vite.config.ts` and `node_modules` tree are byte-identical to this commit's
(`diff -rq`, no output). I could not determine why that build escaped it. The dedupe is a
no-op wherever the bundler already resolved to one copy, so stating it costs that build
nothing.

Committed as `b5f6761c`, separately and first, because it is not part of the save contract —
it is the reason the save contract could be driven at all. **The 77 vitest failures in §6
are the same defect reaching the node suite**, where `resolve.dedupe` does not apply; that
half is **not fixed here** and is the strongest open follow-up in this packet.
