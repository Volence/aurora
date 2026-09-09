# Witnessing a real Electron `close` event reaching the window-close guard

**Row closed:** `CLOSE-GUARD-STARTS-AFTER-THE-EVENT` (medium, `docs/lens-findings.jsonl`)
**Branch:** `parcel/close-guard-witness`, cut from `master` at `670e3821`, then
**rebased onto `master` at `093ceca0`** (master moved under a parallel lane while
this ran; the only conflict was the append-only `docs/lens-findings.jsonl`, and
both sides' rows were kept — see §6)
**Date:** 2026-09-09

---

## 1. The row, and what closing it required

> WHEN A FEATURE DEPENDS ON A PLATFORM EVENT, A TEST THAT STARTS FROM THE EVENT'S
> PAYLOAD CANNOT WITNESS THE EVENT.

Oracle's drag-and-drop was correct code that was never called, and every test
passed because each one began one step after the step that never happened. Aurora's
window-close guard had the same shape on the perimeter that matters most: three
tests — `src/main/__tests__/close-handshake.test.ts`,
`src/renderer/shell/__tests__/close-guard.test.ts` and
`src/renderer/shell/__tests__/close-guard-seam.test.ts`, 32 rows between them —
drive the real state machine, the real registration, the real confirmation and the
real channel constants over a fake bus. **All of that begins after Electron's
`close` event.** They are not wrong and nothing here replaces them.

Closing the row needed a real Electron window and a real close.

## 2. What changed

| file | what |
|---|---|
| `scratchpad/close-guard-witness-harness.mjs` | new; the instrument (22 rows) |
| `package.json` | `harness:close-guard-witness` → `node scratchpad/close-guard-witness-harness.mjs` |
| `docs/lens-findings.jsonl` | superseding row, `state: fixed` |
| `docs/reviews/2026-09-09-close-guard-witness.md` | this packet |

**No product code changed.** `src/main/index.ts` and `src/main/close-handshake.ts`
are byte-identical to `master`; they were mutated four times for the red-first
proofs and restored from the committed baseline each time.

Three commits: the harness, the lens row + packet + detector control, and the
`npm test` figures. Tip SHA is recorded in the final commit's own body; run
`git log --oneline master..parcel/close-guard-witness` for the list.

## 3. How it works — and what it refuses to do

**Nothing here emits a close event.** `win.emit('close')` would be the
payload-shaped test wearing a harness costume: it would close this row while
leaving the exact gap the row names. Every close is raised by Electron itself,
from the browser process:

* **§1** — a real **Ctrl+W** through `Input.dispatchKeyEvent` (Chromium's own
  input pipeline, not `el.click()`), taken by the default menu's `close` role.
  Row `[0d]` reads that role's accelerator back out of `Menu.getApplicationMenu()`
  in the running main process: `CommandOrControl+W`. **Ctrl+W delivered on every
  clean run** — the fallback was never needed in §1.
* **§2/§3** — `win.close()` called in the **main process**: the browser-process
  close Electron's own `close` menu role performs, and the same call the guard's
  own `closeWindow` dep makes for the second, permitted close. (Ctrl+W is not used
  here: the app has a sprite tab open and a tab-close chord would be a different
  gesture.)

Which mechanism actually delivered is **detected, not assumed**, and printed on a
`TRIGGER` line in every section.

**The observer is external and additive.** It is injected into the *running* main
process over Node's `--inspect`. `require('electron')` lives in the inspector's
command-line API, not on the global object — without `includeCommandLineAPI: true`
the probe dies with `require is not defined` (measured, first run). The probe:

* registers a `close` listener **after** the app's, so `e.defaultPrevented` it
  reads is the app's decision. Row `[0b]` counts the app's own close listeners
  first, or every `defaultPrevented` below would be vacuous;
* registers `closed` and `webContents.destroyed` listeners, which are what make an
  *absence* of close events readable as "the window went without one";
* adds an `ipcMain.on(CLOSE_RESPONSE)` observer that never responds;
* wraps `webContents.send` as a pass-through that records a `CLOSE_REQUEST` going
  out. This is the only patched product object in the file.

**The trace is a file.** main's stdout dies with the process and every scenario
ends with the process quitting, so each record is `appendFileSync`'d as it happens
and read back after the app is gone.

Channel names and the 15 s answer timeout are **parsed out of
`src/shared/ipc-types.ts` and `src/main/close-handshake.ts`**, never typed into the
harness; the run refuses if either is gone.

`s1disasm` is **opened only**. The dirty fixture is made with
`__dbg.spritePaint`, in memory. No Ctrl+S is sent and no save call is made.

## 4. Which of the three paths were witnessed

Measured on one run, machine uptime 57.81 h, `dpr = 1` (printed, with the rect,
beside every aim).

### Path 2 — LET-THROUGH · **witnessed** (§1, clean)

```
installed → ask → close#1(SUSPENDED) → answer(true) → close#2(let through)
          → wc-destroyed → closed
```

`[1a]` the event arrives · `[1b]` close#1 is suspended · `[1c]` `app:close-request`
goes out and `app:close-response` comes back from *this* window's webContents ·
`[1e]` the window is really destroyed · `[1f]` **exactly two** close events, in
that order · `[1g]` the main process exits.

### Path 3 — RE-RAISE · **witnessed twice** (§1 and §3)

`[1d]` close#2 has `defaultPrevented === false`. This is the branch the
let-through path exists for and the one no payload-shaped test can reach.
`[3b]` witnesses it again **over a real dialog** — see below.

### Path 1 — BLOCK · **witnessed, with one distinction the row's wording hides**

`[2a]` a real S1 sprite document (`doc:sprite:s1:65`, 6 frames) carries
`unsavedEdits = true` and 370 painted pixels **before** the first close.

```
installed → ask → close#1(SUSPENDED) → answer(false)
          → ask → close#2(SUSPENDED) → answer(true) → close#3(let through)
          → wc-destroyed → closed
```

`[2b]` a real close over unsaved work is suspended **and the window is still
there** · `[2c]` the app's own `[role="alertdialog"]` is on screen, `aria-label
"Unsaved changes"`, buttons `["Discard & close","Cancel"]` · `[2d]` a real mouse
press on **Cancel** at client `(861,491)`, `elementFromPoint` confirmed as that
button, yields `answer(false)`, **no second close event**, the window alive, and
the painted pixels unchanged `370 → 370` · `[3a]` a second real close is suspended
and asks **again** (`pending` really released) · `[3b]` **Discard & close** at
client `(767,491)` answers a literal `true` and main's own `close()` re-raises the
event as close#3, let through · `[3c]` the window is gone.

### The `window.close()` pin · **witnessed** (§4)

`[4b]` `window.close()` from the renderer destroys the window with **zero**
BrowserWindow `close` events. Anything in Aurora that grows a close button of its
own and calls `window.close()` walks straight past this guard. This pins in place
the fact `src/main/index.ts` already states in prose.

### ⚠ A ROW THAT DOES NOT DISCRIMINATE — stated up front, not buried

**Main does not discriminate on dirtiness.** `onCloseRequested()` returns
`'suspend'` for the *first* close unconditionally: it cannot know what is unsaved.
The dirty/clean split lives entirely in the renderer's `confirmAppClose`.

So the row's "a close on a dirty document is suspended by `preventDefault()`" is
**two claims**, and only one of them is about unsaved work:

* the *suspend and ask* is unconditional and is witnessed by §1 on a **clean** app;
* the *block* — the window still standing over unsaved work — is witnessed only by
  §2, and that is the row that carries the guard's actual value.

`[1b]` and `[2b]` are therefore **not** two independent measurements of the same
property. Reading 22/22 as 22 independent claims would overstate it.

Two further non-discriminations, on the record:

* `[0b]` proves the probe is **last**, not that the listeners it counted are the
  guard's. Under MUT-D (guard never installed) the count was still 1, because
  `registerAetherBridge` registers a `close` listener of its own. `[1b]` is what
  proves the guard is there.
* `[1a]` ("a real close reaches the handler") stays green under MUT-A, MUT-B and
  MUT-C, correctly: the event *does* arrive in all three. It only discriminates
  against "no close reaches main at all".

## 5. Red-first proof

Each mutation was written to disk (`git diff` quoted), **rebuilt**
(`VITE_AURORA_DEBUG=1 npx electron-vite build`, exit 0 each time, and the built
`dist/main/index.mjs` checked for the change), run, then restored with
`git checkout --` **from the committed baseline** (tree clean apart from the
mutation) and rebuilt.

| id | mutation (on disk) | rows it turned RED |
|---|---|---|
| **MUT-A** | `src/main/index.ts`: `if (handshake.onCloseRequested() === 'suspend') e.preventDefault();` → `handshake.onCloseRequested();` (`preventDefault` count in `dist/main/index.mjs`: 1 → **0**) | `[1b] [1c] [1d] [1f] [2b]`, and §2/§3 went **UNMEASURABLE** — the window with 370 unsaved pixels was destroyed (`ask → close#1(let through) → wc-destroyed → closed`). 18 rows, 6 failed. |
| **MUT-B** | `src/main/close-handshake.ts`: `if (closing) return 'let-through';` → `return 'suspend';` (`let-through` count in dist: 1 → **0**) | `[1d] [1e] [1f] [1g] [3b] [3c]`. The re-raised close is suspended forever: `close#2(SUSPENDED)`, an app that cannot be quit. **The branch no payload-shaped test can reach.** 22 rows, 6 failed. |
| **MUT-C** | `src/main/close-handshake.ts`: `deps.askRenderer();` → `void deps.askRenderer;` | `[1c] [1d] [1f] [2c] [3a]` red plus `[2d] [3b]` UNMEASURABLE. §1 trace has **no `ask` record at all**. 21 rows, 7 failed. |
| **MUT-D** | `src/main/index.ts`: `installCloseGuard(win);` → `void installCloseGuard;` — correct code that is never called | `[1b] [1c] [1d] [1f] [2b]` red, §2/§3 UNMEASURABLE. 18 rows, 6 failed. |
| **PLANT=`wclose-control`** (detector control for the absence row) | §4 closes from the **main process** instead of calling `window.close()` in the renderer, which *does* raise the event | `[4b]` red. 22 rows, 1 failed. |

### MUT-D is the row's own thesis, demonstrated

With the guard **never installed** and the window closing over 370 pixels of
unsaved work:

```
$ npx vitest run src/main/__tests__/close-handshake.test.ts \
                 src/renderer/shell/__tests__/close-guard.test.ts \
                 src/renderer/shell/__tests__/close-guard-seam.test.ts
      Tests  32 passed (32)
```

**All 32 existing rows pass. The harness goes red on 6.** That is the coverage gap
the lens row booked, reproduced end to end.

### Why `[4b]` has a detector plant and not a product mutation

`[4b]` is an **absence**, and the behaviour it pins is Electron's routing, not our
code — there is no product edit that can make it red. So the plant is on the
detector: `PLANT=wclose-control` swaps the trigger for one that *does* raise the
event, and `[4b]` must go red. Its in-run control is `[4a]`: the `closed` listener
registered in the *same evaluate call* as the `close` listener must have fired, so
"no close event" cannot be confused with "no probe".

### Baseline restored

`git status --porcelain` clean under `src/`; a clean run after the last restore:
**22 rows, 0 failed, 21.7 s** (machine uptime 57.81 h).

## 6. `npm test`, before and after

| | exit | Test Files | Tests |
|---|---|---|---|
| before (`670e3821`) | 1 | 1 failed \| 559 passed \| 3 skipped (563) | **1 failed \| 8197 passed \| 9 skipped (8207)** |
| after, pre-rebase | **0** | 560 passed \| 3 skipped (563) | **8198 passed \| 9 skipped (8207)**, 0 failed |
| after, **rebased onto `093ceca0`** | **0** | 562 passed \| 3 skipped (565) | **8232 passed \| 9 skipped (8241)**, 0 failed |

The rebased row is larger because a parallel lane's tests landed on master in the
meantime, not because anything here grew. The harness was rebuilt and re-run on
the rebased tree: **22 rows, 0 failed, 21.9 s** (machine uptime 57.90 h), with §1
again delivered by a real Ctrl+W.

The rebase's one conflict was `docs/lens-findings.jsonl`, where both sides had
appended to an append-only ledger. **Both sides' rows were kept**, ours last; the
file parses as 192 rows and every id whose row either side touched still reads the
state its author wrote.

The single "before" failure is
`src/renderer/workspace/__tests__/facet-modules.test.ts › covers all six built
facets`, a 5000 ms **TIMEOUT** classified by the suite's own reporter as
load-manufactured. It was measured while this session was concurrently running
Electron under Xvfb; it passes in the after-run, on a quiet box, and the totals
reconcile (8197 + 1 = 8198). It is not an assertion failure and is unrelated to
this parcel.

⚠ The first "after" run failed on `check-doc-citations`, and correctly: this
packet cites **itself** in the table in §2, and until it was committed that
citation pointed at a file only this machine could open. Committing it is the
fix; the figures above are the run after the commit. It is worth recording
because a review packet that names its own path is the one document guaranteed
to trip that gate on its first run.

## 7. A harness artifact worth keeping, because it looked like a product defect

Row `[1g]` ("does the app process exit after the window goes") was **RED for three
runs**: `/proc` state `S`, still running 30 s after `closed`. It reads exactly like
a shutdown defect.

It was the instrument. An attached Node inspector session and an open renderer CDP
socket are both this harness's own additions to the process it was asking about,
and "did it exit" is precisely the question they confound. Closing both sockets
before the poll: `/proc state ABSENT (reaped)`. The row now drops the observer
first and says so in a comment.

Two smaller instrument defects found the same way and worth naming:

* the CDP client had no per-call timeout and did not reject on socket close. The
  press that answers the dialog with **Discard** destroys the renderer, so the reply
  to *that* `Input.dispatchMouseEvent` never comes — the harness hung for the rest
  of its wall clock on an `await` for a process that no longer existed, which from
  the outside looks like a product hang.
* `[1e]`/`[3c]` read the `closed` record off the snapshot that `waitForCloses`
  returned, which stops the instant the *close* record lands — before the window has
  finished going. That made both rows a race that reported "the window survived a
  let-through". Each now has its own wait.

## 8. What is left open

* **No emulator was touched** (invariant), and nothing here wants one.
* **The X11/Xvfb caveat still stands for other event families.** A real
  BrowserWindow `close` under Xvfb turned out to be fully reachable — both a real
  Ctrl+W accelerator and a browser-process `win.close()` deliver it. That does not
  generalise: `xdotool` and `wmctrl` are **not installed on this machine**, so the
  one close path this harness could *not* deliver is a window-manager
  `WM_DELETE_WINDOW` message (there is no WM under Xvfb either). The title-bar
  close is therefore still unwitnessed. `src/main/index.ts` groups it with the menu
  role and app quit as "closes the window from the browser process", which is the
  same mechanism §2/§3 drives, so the gap is narrow — but it is a gap and it is not
  claimed.
* **`app.quit()` / `before-quit`** is not exercised. §1 sees the process exit via
  `window-all-closed`, which is downstream of the close, not a separate close path.
* **Multiple windows.** The guard's foreign-answer rule (`event.sender === win.webContents`)
  is asserted only by the seam test over a fake bus; a second real BrowserWindow
  would be needed to witness it, and Aurora only ever makes one.
* `[0b]` cannot tell the guard's `close` listener from `registerAetherBridge`'s.
  Tightening it would mean naming listeners, which Node's EventEmitter does not
  support; `[1b]` covers the property.
