# d-31 — the confirm dialog focuses Cancel, and two things I was wrong about

**Parcel** D31-CONFIRM-FOCUS · **branch** `feat/d31-confirm-focus` off `d0c1a816`
· **tip** `f5b1758f` · seven commits.

Card `d-31-confirm-dialog-focuses-nothing`, ruled **`focus_cancel_and_guard`**. Not
re-litigated, and no premise of the card was found false. One premise was found
**incomplete** and is reported in §1.

---

## 0. The two things the plants told me that reading did not

Both are recorded up front because both are cases where I wrote a confident
sentence into a committed comment and a plant contradicted it.

1. **The fix did not hold at one of the six doors, and the two easiest doors to
   reach were both in the class that hides it.** The tab strip's close ✕ raises
   the dialog from `onMouseDown`; Chromium's own post-dispatch focus assignment
   then overwrote the focus the effect had just set. Traced in the running app.
   §4.

2. **The finished fix was defeated by the literal P3 edit, and I had committed a
   prediction that it would not be.** `autoFocus` landed first and the effect's
   "focus is already inside the dialog, leave it alone" early return **deferred
   to the danger button**. Four of five doors opened with Discard focused; one
   Space destroyed the sprite. §6, plant PL-A.

---

## 1. The card says six doors. There are eight `ask()` sites.

Not an error in the card's reasoning — the hazard is exactly as described — but
the perimeter is bigger than the sentence, and a guard scoped to six would have
had two silent holes. Parsed out of `src/`, not counted by eye:

| # | file | door | reached under CDP? |
|---|---|---|---|
| 1 | `renderer/shell/new-sprite-guard.ts` | the size chips **and** `New □` | **yes, both controls** |
| 2 | `renderer/providers/chunk-library-import.ts` | Clear chunks | **yes** |
| 3 | `renderer/shell/project-open-guard.ts` | project open | **yes** |
| 4 | `renderer/shell/tab-activation/sprite.ts` | tab close (sprite) | **yes** |
| 5 | `renderer/shell/tab-activation/canvas.ts` | tab close (canvas) | no |
| 6 | `renderer/shell/tab-activation/level.ts` | tab close (act switch) | no |
| 7 | `renderer/shell/close-guard.ts` | window close | no |
| 8 | `renderer/components/setup/ProjectSetupTab.tsx` | setup Apply | no |

The card's "tab close" is **three** separate sites, and `ProjectSetupTab`'s Apply
is a door the card does not name at all. All eight are covered for the *choice of
button* by §B below; four of eight are covered for the *DOM half* by the harness.

---

## 2. What was built

Three layers, and they cover different things on purpose.

**`src/renderer/components/ui/safe-focus.ts`** — the CHOICE, pure. Same split
`focus-trap.ts` already makes and for the same reason its header gives: the node
suite renders no React, so a rule inside a `.tsx` is a rule nothing can test.

Rule: the reserved `cancel` key if present and not itself toned destructive;
otherwise the first non-destructive button; otherwise **null**.

> ⚠ **Rule 3 is the load-bearing one.** The tempting last line is `?? 0` or
> `?? length - 1` so that "something is always focused" — and for an
> all-destructive request either hands the Space key a destructive button, which
> is the P3 defect through a different door. Every one of today's eight sites ends
> with `{ key: 'cancel' }`, so `length - 1` would be right at all eight and would
> be a trap the day someone adds a ninth.

**`src/renderer/shell/ConfirmDialog.tsx`** — the DOM half. Finds the button **by
key**, not by index into the DOM list; publishes `data-confirm-key` and
`data-tone` so the guard reads the component's own notion of destructive rather
than a label; restates the invariant at the `.focus()` call itself; applies twice
(§4); and refuses to defer to a danger-toned focus (§6).

**The guards.**

| layer | runner | covers | cannot see |
|---|---|---|---|
| `ui/__tests__/safe-focus.test.ts` (7) | `npm test` | which button is chosen, incl. the all-destructive case no real door produces | any DOM, any focus |
| `shell/__tests__/confirm-dialog-focus.test.ts` §A (7) | `npm test` | the dialog's wiring; **the only thing that reddens on the P3 string** | whether focus lands |
| …§B + §C canaries (9) | `npm test` | **all eight `ask()` sites**, TS-parsed, both variants of each conditional-spread door | whether focus lands |
| `scratchpad/confirm-focus-harness.mjs` (23) | `npm run harness:confirm-focus` | real `document.activeElement`, real keys, five controls / four sites | four sites it cannot reach |

§B is an AST walk, not a regex: it finds every `…ask({ buttons: [...] })`,
reconstructs each button set from the literal the door itself writes, expands
`...(cond ? [x] : [])` into **both** variants, and runs the real `safeFocusIndex`
over each. No label is typed and no site is listed. **It REFUSES on any shape it
cannot evaluate** rather than skipping it — `[canary]` rows prove all three
refusals fire.

> The no-save variant of a tab-close dialog is `[discard(danger), cancel]` — the
> harder of the two — and checking only the other one would have left it
> unmeasured. `expands the two-variant doors` asserts the expansion actually
> happened, or a collapsed expander would report coverage it does not have.

---

## 3. §A found its own trap on the first run

Written naively, **every §A row matched the new header comment instead of the
code**. `not.toContain('autoFocus')` went red on the prose warning people not to
write it, and the `.focus(` count came back **2** with one call in the file.

A guard a comment can redden is a guard a comment can also **green**, and the
second is silent. `codeOf()` now strips comments via `transpileModule` with
`jsx: Preserve`; a `[canary]` proves it drops a commented `autoFocus` and keeps a
real one, and a second proves it did not just return `''`.

---

## 4. ⚠ THE DEFECT: the tab-close door lost its focus to Chromium

The first full CDP run came back **21/23** with `[d3]`/`[d3k]` red and
`document.activeElement` on `<BODY>` at the tab-close door. Three readings, and
the first two were both wrong about the cause:

1. a **single sample** said `<BODY>` — which cannot tell "never focused" from
   "focused and clobbered";
2. a **timeline sampled from 500 ms after the release** said `<BODY>` the whole
   way — but could not see the window it started after;
3. a **split press/release timeline** plus a temporary `__ftrace` inside the
   effect settled it. The effect **ran and succeeded**:

```
["effect request=Unsaved sprite edits","panel=present","index=1",
 "target=cancel/neutral","focused; activeElement=IS-TARGET"]
```

…and a read 100 ms later said `<BODY>`.

**Cause.** `TabStrip` raises this dialog from `onMouseDown`, so `ask()` lands,
React commits and the effect focuses Cancel **all inside the mousedown dispatch**.
Chromium then performs mousedown's **default action** — assign focus from the
pressed element — and the ✕ is a `<span>`, not focusable, so focus is cleared to
`<body>` and ours is silently overwritten. The size chips and `New □` never show
this because they raise the dialog from `onClick`, *after* that default action.

**A harness covering only the two sprite doors would have called this done.** The
ruling's promise was simply not kept at one of the six doors.

**Fix.** Apply immediately (so the common case is right even if the timer never
fires) and re-assert on `setTimeout(apply, 0)` — the next **macrotask**, ordered
strictly after the default action. A microtask is not; `requestAnimationFrame`
depends on frame scheduling rather than on the thing being waited for.

The focus **timeline is now permanent** and prints automatically on any red focus
row, so the landed-vs-clobbered distinction is free next time.

---

## 5. Three harness method defects, all found by running it

None of these were the app.

1. **ENTER WAS NEVER SENT.** A CDP `keyDown` without `text` produces a keydown
   and no keypress. Blink activates a focused button on **Space at keyup** but on
   **Enter at keypress**, so the textless form works for one key and silently
   no-ops for the other. `[d1e]` read exactly like *"the app ignores Enter"*.
   This repo's synthetic-event failure in a new hat. **Both keys now carry
   `text`, and the Space rows were re-run under the tightened channel rather than
   carried over.**
2. **The tab-close door is TWO buttons, not three.** `confirmCloseSpriteDoc`
   emits Save only when `doc.s1ArtSource !== null`. I asserted `buttonCount === 3`
   off a glance at the source and went red on a correct app. The **key set** is
   checked now; the three-button discrimination moved to the project-open door,
   which really does emit Save/Discard/Cancel — and `[d4n]` **asserts** that
   rather than assuming it.
3. **`projectOpenGuard` is on `__dbg.canvas`, not `__dbg.aeon`.** It sits inside
   `CanvasProbeApi`, which is where I did not look. It aborted a run.

And a fourth, found by a plant rather than by the app:

4. **A plant must redden rows, not deadlock the run.** `[d4k]` read the guard's
   answer with `Runtime.evaluate` + `awaitPromise` on the guard's own promise.
   Under PL-D the guard is never answered, so the evaluation **never returns** —
   the run hung for ten minutes and produced no row set, which is precisely the
   one thing a red-first run exists to produce. The page now records the answer
   via `.then` and the harness reads the recorded value; `'PENDING'` is a real
   reading meaning *"the dialog was never answered"*.

---

## 6. Red-first — six plants, each applied on disk and restored from a committed baseline

Every plant: tree verified clean, applied by an **exactly-one-match** patch, `git
diff` shown, rebuilt where the CDP half was involved, run, then restored with
`git checkout --` onto a **committed** tip. Clean-tree baselines: node
**23/23**, CDP **23/23 exit 0**, before and after.

| plant | what it breaks | node suite | CDP harness |
|---|---|---|---|
| **PL-A** | the **literal P3**: `autoFocus={b.tone === 'danger'}` | **1 row** — *contains no autoFocus* | **14/23 before the §6 hardening; 23/23 after** |
| **PL-B** | `safeFocusIndex` returns index 0 | **9 rows**, incl. §B at real doors | not run (node is decisive) |
| **PL-C** | the `?? 0` fallback, all-destructive case only | **3 rows**, **zero §B rows** | not run |
| **PL-D** | the focus effect deleted — the pre-d-31 component | — | **12/23**: every focus row and every key row, all five doors |
| **PL-E** | the dialog focuses its **DANGER** button | 2 rows | **9/23** |
| **PL-F** | the post-mousedown re-assert dropped | **1 row** | **21/23 — exactly `[d3]` and `[d3k]`** |

**PL-E is the ruling's own guard clause, and it fires.** Not "something is
focused" — the row reads:

```
activeElement = <BUTTON> "Discard & start new" tone=danger
activeKey="discard" activeIsDanger=true
```

and the Space that follows reproduces the d-27 damage exactly:

```
document frames=6 40x40 cov0=370 dirty=true  →  frames=1 64x64 cov0=0 dirty=false
```

**PL-C is the honest one.** It reddens three rows and **no §B row at all**,
because no real door is all-destructive today. That is the perimeter sweep saying
truthfully that it cannot see this class, and the unit rows saying they can.

**PL-F is the site-discrimination pair in one plant.** Dropping the re-assert
reddens exactly the one door that raises the dialog from `onMouseDown` and
nothing else — which is the whole claim §4 makes.

### ⚠ PL-A is the plant that corrected me, and §6's hardening is its consequence

I predicted, in a committed comment and in the harness's own `[z2]`, that P3 on
top of the fix would leave every row green because React applies `autoFocus`
during commit and the effect runs after it. **Measured: 14/23.** `autoFocus`
landed first, and the effect's early return — *"already somewhere in the dialog,
leave it alone"* — **deferred to the danger button** and declined to act. The one
door that survived was the tab-close ✕, and only incidentally: focus there was on
`<body>` at re-assert time, so the return did not fire.

The guard had **inverted the invariant**. The rule is *"the focused element is not
a destructive button"*; a guard that yields to one states its opposite. The clause
is now `active.dataset.tone !== 'danger'` — deferring to a **safe** focus is still
right, because that is what stops it fighting a user's own Tab.

**Re-measured on the hardened component: P3 is 23/23.** So a green today means P3
is **inert, not invisible**; §A still forbids the string in `npm test` in
milliseconds, which is the faster alarm a four-character edit deserves.

### Could a green have hidden something?

No plant came back green, so the question does not arise for any of the six. It
was guarded against anyway: a **loose matcher** is ruled out because every focus
reading is element **identity** computed in-page (`document.activeElement === btn`)
and never text; a **vacuous clause** is ruled out by `dangerCount >= 1` being
inside every focus row's condition — without it, "focus is not on a danger button"
is trivially true in a dialog that has none; and **a row not reaching its subject**
is refused structurally, since every aim is verified with `elementFromPoint` before
an event is sent and a dialog's `inset: 0` backdrop makes a modal-eaten press
impossible to mistake for a measurement.

`[b3]` is the reader's **negative control**: with no dialog up, nothing in the app
holds a destructive-toned focus and there is no cancel button to be focused — so
"focus is on cancel" is a state the dialog **creates**, not the app's resting one.

---

## 7. Coverage, stated rather than implied

**Reached under CDP — five controls, four of the eight `ask()` sites:** the size
chip, `New □`, the tab-close ✕, the project-open guard (via `__dbg.canvas`'s
sanctioned route, whose answer is observable as a **resolved value** rather than
inferred from what survived), and Chunks Clear in aeon.

**NOT reached, and not implied:** `close-guard.ts` (window close — needs an OS
window-close event; there is no debug hook and no in-page control),
`tab-activation/canvas.ts`, `tab-activation/level.ts`, `ProjectSetupTab.tsx`. All
four are covered for the **choice of button** by §B. What is unmeasured for them
is only the DOM half — that a `.focus()` lands — and that is one shared component,
exercised five ways.

Two rows would have gone red rather than silent if a door had vanished: `[z1]`
asserts the reached count, and `[d3n]` asserts the dialog's own `aria-label` and
key set so a mis-aimed click cannot pass.

---

## 8. Before and after, both run by me, same box

| | `npm test` | files | exit |
|---|---|---|---|
| **before** (`d0c1a816`, detached) | **7142 passed / 9 skipped (7151)** | 498 + 3 skipped | 0 |
| **after** (`f5b1758f`) | **7165 passed / 9 skipped (7174)** | 500 + 3 skipped | 0 |

**+23 rows, +2 files — exactly the two files added.** No pre-existing row changed
state.

`npm run harness:confirm-focus` on the final clean tree: **23/23, exit 0.**

Environment, printed by the runs themselves: `dpr=1` on every aim of every run
(the 1.35 case did not occur and would have been visible); Xvfb `1680x1050x24`;
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` (this
worktree has no binary of its own) and
`AURORA_BUILT_TREE=<this worktree>` — **without the pin, `runTarget`'s walk
borrows the MAIN checkout's `dist/`**, because a linked worktree is a real
checkout and an unrunnable one. `AURORA_DIR` does resolve to this worktree, so
source reads and screenshots stayed in it. `VITE_AURORA_DEBUG=1 npm run build`
before each run. No emulator tool was touched. Nothing was written to disk by any
run: every dialog this harness raises is answered **Cancel**, so unlike
`confirm-destroy-harness.mjs` it does not even empty a library in memory (`[z3]`).

Static guards on the final tree: `check-test-collection` OK (503/503),
`check-pseudo-skip` OK, `check-peer-path-literals` OK (all 5 rules fired on their
canaries), `check-cited-paths` OK, `check-object-stringify` OK,
`check-ledger-timestamps` OK, `check-python-resolver` OK, `check-harness-guards`
OK (215 clean / 215 classified).

---

## 9. The accepted cost, restated so it is not read as a regression

Enter or Space immediately after the dialog opens now **cancels**, where before it
did nothing at all. A fast double-press that used to be harmless now dismisses the
dialog. That is the ruling's chosen trade, and `[d1k]`/`[d1e]` measure both keys
doing exactly it: the dialog closes and the document is byte-identical.

`[d1k]` discriminates in **both** directions and that is deliberate. *"The dialog
closed"* fails on the pre-d-31 app, where a bare Space did nothing and the dialog
stayed up — so the row **could not have passed before the fix**. *"Nothing was
destroyed"* fails under PL-E. A row asserting only one half would be green on one
of the two broken apps.

---

## 10. Left open

1. **Four `ask()` sites have no DOM-half measurement** (§7). Reaching window close
   needs a debug hook onto `confirmAppClose`; the other three need dirtier
   fixtures. Not invented here — a hook added only to be measured is a hook, and
   `debug-hooks.ts` is explicit about which of its entries are real call paths.
2. **`focus-trap.ts` still names `ConfirmDialog` as "the obvious second caller"**
   and is still not wired to it. d-31 does not add a Tab trap; it decides where
   focus *starts*. The sentence is now less dangerous — the invariant is guarded —
   but it is still an open invitation, and whoever takes it up will be adding a
   second thing that moves focus inside this dialog. §A's `.focus(` count of 1 is
   what will notice.
3. **This rig is outside `npm test`,** like every other `.mjs` here. The layering
   in §2 is the mitigation, not a fix: §A/§B run in `npm test` and catch the
   source-visible regressions; only the harness catches a focus that lands
   somewhere unexpected.
