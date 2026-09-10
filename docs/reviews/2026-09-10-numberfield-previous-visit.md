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
