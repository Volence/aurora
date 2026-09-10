# The digits run together only when the previous visit typed nothing

**2026-09-10, aurora, foreground (overseer's own).** Instrument:
`scratchpad/numberfield-selection-trace-harness.mjs` (`npm run harness:numberfield-selection-trace`).
Continues `docs/reviews/2026-09-10-cdp-sweep.md` §3, which reproduced
`NUMBERFIELD-FOCUSED-CLICK-INSERT` and refuted its filed mechanism.

## Where this started

The sweep's census enumerated seven gestures and ruled out four candidate mechanisms — a click
on an already-focused box, the Tab, the inter-keystroke gap, a React flush race. It named no
replacement, deliberately: seven points supported a correlation and not a mechanism. Its closing
line was *the next step is an experiment rather than more reading.*

**The census varied what the hands did.** Every hypothesis reachable from it therefore had the
shape *"this gesture inserts"*. But `NumberField` calls `e.currentTarget.select()` on focus
(`src/renderer/components/ui/fields.tsx:284`), and in both arms of the minimal pair that handler
runs. So the question was never which gesture inserts — it was **what unmakes the selection
afterwards, and why only sometimes.**

## ⚠ The first version of this harness was blind, and reported clean nulls

The obvious design watches `selectionStart`/`selectionEnd` across every event between the click
and the first keystroke and names the phase where the selection dies. **Chromium does not expose
those properties on `input[type="number"]`.** The recorder logged `sel=[null,null]` at every
phase in both arms — which reads exactly like *"the selection is gone the whole time"* and is in
fact *"this instrument cannot see selections."*

Row `0g` now asserts that refusal out loud, and it is a row that goes **green when the harness
is blind** — because the claim it makes is *this element exposes no selection to read*. A
harness that cannot report its own blindness renders not-looking as a clean result. This repo's
sharpest standing bar, fired on the harness written to honour it.

**So the only observable is the outcome: the box's value after ONE keystroke.** `"7"` means the
selection was live and the digit replaced it; `"1567"` means the caret was placed and the digit
was inserted.

## The experiment

Rebuilding the census's arm G — click, blur, click again — but with a value **typed** during the
first visit produced **REPLACE where the census got INSERT**. Not a contradiction: a variable the
census never moved, because in its arm G nothing was ever typed.

So every arm below ends with the identical tail — blur, click, one keystroke — and varies only
**what the previous visit left behind**. Each arm reloads the page first, because that history is
a property of the session and arm D's whole content is *never focused*.

| arm | what the previous visit left behind | verdict |
|---|---|---|
| **D** | never focused at all — the census's floor | REPLACED |
| **H** | visited, **nothing typed** — the census's arm G | **INSERTED** |
| **I** | visited, a legal value typed and committed | REPLACED |
| **J** | visited, a **refused** value typed, zero commits | REPLACED |
| **K** | visited, `.select()` called, nothing typed | **INSERTED** |
| **L** | visited, typed with **no** `select()` call | REPLACED |
| **M** | arm H's conditions, mouseup default **prevented** | REPLACED |

**9/9 rows, loads 2.7–4.0.**

### The law

**A keystroke during the previous visit makes the next click select correctly. A visit with no
keystroke leaves the next click inserting.** Never having been focused (D) is safe; so is any
visit that typed, whether the value was accepted (I) or refused (J).

**J is what makes this a law about typing rather than about committing.** It typed a value the
panel refused, so zero commits landed and the model never moved (`Jx` asserts that premise
per-run) — and it still replaced. The boundary is not where `NumberField`'s code forks.

### ⚠ The confound this run introduced itself, found by re-reading the prep and not by a red row

Arms I and J both call `.select()` before typing, because typing over a caret would otherwise
produce a scrambled value. Arm H does not. So *"I and J replaced, H inserted"* had **two**
available causes sitting in the same prep — the typing, and the `select()` call beside it. **A
variable that rides along inside the manipulation is not controlled by varying the
manipulation**, and the first four arms could not tell them apart.

`K` and `L` are the controls: `select()` alone with no typing **inserts** (so it is not the
cause), and the realistic typed gesture with no `select()` anywhere **replaces**. Typing is the
variable, and it is now the variable rather than a candidate.

### The mechanism, and exactly how far arm M carries it

`M` runs arm H's conditions with one change: the box's `mouseup` default action is prevented. **It
replaces.** So the thing unmaking the selection is **the click's own `mouseup` default** — the
textbook cause of a select-on-focus that does not stick, and its textbook remedy.

⚠ **M proves a REMEDY, not a cause, and it is not the shipped app.** The listener is injected onto
the live element from the harness. A fix belongs in `NumberField`, where every caller gets it.
The row says so in its own text so that no reader takes a green there for a fixed component.

⚠ **And what is still unexplained is why TYPING masks it** — why a keystroke during the previous
visit should change what the next click's mouseup does. The remedy does not depend on that answer
and this packet does not guess at one. It is written here as the open half, not omitted.

## What follows

`NUMBERFIELD-FOCUSED-CLICK-INSERT` stays open, upgraded from **reproduced** to **isolated with a
named remedy**. The fix is a component change with a look-affecting edge — preventing a mouseup
default also prevents a deliberate caret placement or drag-selection inside an already-focused
box — so it should be scoped to the **focusing** click, which is the only one the defect appears
on. That is the constraint handed to whoever implements it, not a decision taken here.

---

## What the fix changed, 2026-09-10 (later the same day)

**Branch `fix/numberfield-focus-select` off master `242b10e4`.** The remedy this packet named
was implemented, **measured wrong twice**, and the shipped one is the third. That is the finding
worth carrying forward, so it is written before the result.

### The remedy moved twice, and a measurement moved it each time

| # | what was tried | digits (arms H, K) | spinner (arm S) |
|---|---|---|---|
| 1 | `preventDefault` on the focusing click's `mouseup` — **this packet's own arm M** | **FIXED** | **BROKEN** |
| 2 | `select()` inside the focusing click's `onClick` | still INSERTED | fine |
| 3 | that `select()` **queued** with `setTimeout(..., 0)` | **FIXED** | fine |

**⚠ ARM M'S REMEDY, APPLIED TO THE COMPONENT, BREAKS THE SPIN BUTTON.** Chromium's number input
carries a spin button in its UA shadow root; events from it retarget to the input, so a `mouseup`
listener on the field sees the arrow's mouseup too. The button STEPS on mousedown, which no mouseup
guard can stop, and it STOPS ITS AUTO-REPEAT in a mouseup DEFAULT handler, which Blink skips once
`preventDefault` has been called. **So the failure mode is not an inert spinner and clicking an
arrow once would not have shown it.** Measured with remedy 1 in place: one click on the down arrow
of an unfocused box took `156` to `147` within 600ms and to `119` by 2s, still sliding. The same arm
on the reverted build steps once to `155` and stops, which is what makes it a regression rather than
an instrument artefact.

**⚠ AND REMEDY 2 READS AS IF IT MUST WORK.** `click` is dispatched after `mouseup`'s default action,
so re-selecting there looks like the obvious no-suppression fix. It is not: arms H and K INSERTED
with it in place. Blink's selection update for a mouse gesture lands after the click dispatch and
inside the same task, so nothing dispatched in that task can outrun it. **The `0` in the timeout is
a task boundary, not a race against a typist.**

### What shipped

`NumberField` arms a ref on `mousedown` when `editing` is false and the button is primary, spends it
on the first `click` by queueing `el.select()`, and disarms on `blur` — which also cancels a queued
task, so a box that lost focus cannot take a selection back a tick later. An unmount cancels it too.
**It suppresses no default action at all**: the spin button's, the caret's and the X11
primary-selection paste's all run exactly as the browser intends.

`onFocus`'s `select()` stays and is now load-bearing for a case the click handler cannot reach: a
**Tab** fires no mouse event, so nothing else can select for it.

### The arms, before and after, one instrument

| arm | before | after |
|---|---|---|
| **D** never focused | REPLACED | REPLACED |
| **H** visited, nothing typed | **INSERTED** | **REPLACED** |
| **I** typed and committed | REPLACED | REPLACED |
| **J** typed and refused | REPLACED | REPLACED |
| **K** `.select()` only | **INSERTED** | **REPLACED** |
| **L** typed, no `select()` | REPLACED | REPLACED |
| **M** arm H + injected mouseup guard | REPLACED | REPLACED |
| **N** *(new)* second click inside the already-focused box | INSERTED | INSERTED |
| **S** *(new)* spin arrow on an unfocused box | steps once, stops | steps once, stops |

`10/10 rows PASS · 0 FAIL · 0 UNMEASURABLE · 135.8s`, load 6.16 to 7.81. Reverting `fields.tsx` from
the committed baseline and rebuilding puts H and K back to INSERTED and 2a and 2d back to red, with
every other row unmoved — including S, which is what proves the runaway above belonged to remedy 1.

### Three rows went red on the fixed build and every one was correct to

They asserted the DEFECT. `2a` (H and I disagree — the law), `2c` (at least one arm inserted), `2d`
(K inserted — the confound control). **Rewritten, not deleted**, each naming the pre-fix measurement
it used to make and where it lives.

**⚠ `2c` IS THE ONE THAT MATTERS**, and its job was never *the bug is present*. It was **can this run
still tell an INSERT from a REPLACE** — without which every REPLACED in the table is
indistinguishable from an instrument that has stopped seeing. A fixed build cannot supply an
inserting arm out of the defect and must not be asked to, so `2c` now asserts a gesture that MUST
STILL INSERT when the fix is correct: **arm N**, a second click at the LEFT edge of a box that is
already focused, which places a caret at index 0. That is also the capability the fix was scoped not
to take, so one row carries the discrimination and the constraint. Its red is ambiguous by
construction and the row says so in its own words.

### What a green here does NOT prove

* **Nothing about the spinner past one click and two seconds.** Arm S watches a single press; a
  held arrow, a drag off the arrow, and the keyboard arrows (`numberfield-empty-harness.mjs` 4a) are
  each a different gesture.
* **Nothing about Tab in a browser.** The Tab path is asserted only in the node suite, which has no
  default actions; the browser arms all click.
* **Arm S's aim is SEARCHED**, from the computed padding across five candidates. A future Chromium
  layout change would make it UNMEASURABLE rather than red, which the row reports as its own third
  outcome instead of folding into a pass.
* **⚠ WHY TYPING MASKS THE DEFECT IS STILL UNEXPLAINED.** The fix does not depend on the answer and
  none is invented here. It is now unfalsifiable from this harness, because no arm inserts any more
  for that reason — a later reader wanting it must run the reverted build.
