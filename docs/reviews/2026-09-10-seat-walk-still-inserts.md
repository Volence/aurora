# THE DIGITS FIX IS REAL AND THE SEAT'S OWN GESTURE STILL YIELDS `12872`

**Foreground overseer measurement, 2026-09-10.** No branch, no source edit in this parcel.
**Capture:** `docs/captures/2026-09-10-seat-walk-still-inserts/` (the full run log and the
build-flavour stamp it was produced against).

---

## 0. The one thing to read if you read nothing else

> **Row 160 shipped a correct fix, and `P2d` — the one row in the sweep built to be able to
> REFUTE — is still red on the build that carries it.**
>
> The fix arms its re-select on `mousedown` **when the box is not already focused**. Seat A's
> gesture focuses `Bot` with a **Tab** and then clicks it, so at `mousedown` the box IS focused,
> the arm is never set, the click collapses the Tab's select-all to a caret, and `72` appends to
> `128`. **`12872`, on the fixed build, from the gesture the finding was filed about.**
>
> The census separates it cleanly: **A is the only variant with `focus before click: true`, and
> A is the only variant that INSERTED.** Every variant that reached the box unfocused REPLACED —
> which is the fix working, in the same run.

**This is not a regression and it is not a defect in the fix.** It is a scope the fix chose
deliberately and a premise in its own docblock that does not hold for a keyboard Tab. Both halves
are stated below.

---

## 1. What was run, and against which tree

`npm run harness:cdp-sweep-f4` (`scratchpad/cdp-sweep-f4-harness.mjs`), which last ran at
`a49cfd92` — **before** the fix commits `bb951b9f` / `f1f9cb86` / `4c0b13e0`. Re-run here against
master `33ccee18`.

```
root: /home/volence/sonic_hacks/aurora
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora
```

No run reported `BORROWED`. `ELECTRON_BIN` and `AURORA_BUILT_TREE` were both set, which is what
stops a harness silently driving another checkout's `dist/` with every path in the output still
looking right. The tree was built `VITE_AURORA_DEBUG=1 npx electron-vite build` and
`dist/build-flavour.json` stamped `"flavour": "debug"` at `2026-09-10T08:13:57Z`; the stamp is in
the capture directory beside the log.

**Result: `15/17 rows PASS · 1 FAIL · 1 UNMEASURABLE · 62.6s`**, loadavg `10.92 → 6.26`.
The FAIL is `P2d`. The UNMEASURABLE is `P3c`, which is the already-known and already-booked
finding that P3's `129px` premise is unreachable through the app's own layout — unchanged here
and not this packet's subject.

---

## 2. The census, quoted from the run that produced it

| variant | gesture | focus before click | result |
|---|---|---|---|
| **A** | the seat's walk: `Top` → **TAB** → click `Bot` → type | **true** | **INSERTED** — `"1287"`, then `"12872"` |
| B | same, one `blur()` between the Tab and the click | false | REPLACED — `"7"`, then `"72"` |
| C | as B, no gap between keystrokes | false | REPLACED |
| D | cold click on `Bot`, no Tab at all | false | REPLACED |
| E | cold click on `Top` (the committed refusal harness's own `[5a]` conditions) | false | REPLACED |
| F | as B with a 2s settle between blur and click | false | REPLACED |
| G | `Bot` focused by a CLICK, blurred, then clicked again | false | REPLACED |

**`focus before click` is the only column that moves with the result.** That is the whole
diagnosis, and it is one run rather than two stitched together.

The run's own anti-vacuous floor holds in the same frame: `P2a` reset the band to the seat's
numbers (top 112, bot 128) before each arm, `P2c` proved a cold click on the *same two boxes*
REPLACES in this run — without which "the gesture inserts" and "the app is broken" would be the
same artifact — and `P2b` read `document.activeElement` after the Tab and before the click, so a
Tab that missed would have reported UNMEASURABLE rather than a pass. The aim was an integer client
pixel (`x 1218, y 477`, `dpr 1`) with `hitIsTarget: true`.

---

## 3. The mechanism, in the component's own words

`src/renderer/components/ui/fields.tsx`:

```
onMouseDown={(e) => { focusingClick.current = e.button === 0 && !editing; }}
```

and the derivation directly above it:

> ⚠ WHY IT IS ARMED ON `mousedown` AND NOT DONE ON EVERY CLICK. Selecting on every click would
> take a deliberate caret placement and a drag-selection INSIDE A BOX THE AUTHOR IS ALREADY IN — a
> real capability, and one the defect never touched: **the insert appears only on the click that
> brings the box from unfocused to focused.**

**That last clause is the premise, and a Tab falsifies it.** `editing` is set true on focus and
false on blur and nowhere else, so it answers *"is this box focused?"* — which is what the
docblock needs — but the capability the docblock is protecting is *"did the author place a caret
here with the pointer?"*, and those two questions come apart the moment focus arrives from the
keyboard. A Tab focuses and selects all; the subsequent click discards that selection; nothing
puts it back, because `editing` was already true when the pointer went down.

**The fix's reasoning is sound for click-then-click and inherits tab-then-click by accident.**
Arm `N` in the row-160 packet — a second click inside a box you are already in — is the capability
that was deliberately kept. The seat's gesture is indistinguishable from it *to `editing`*, and is
not the same thing to a person.

---

## 4. What this does and does not change about row 160

**Unchanged and still true:**
- Arms **H** and **K** flipped INSERTED → REPLACED, and every unfocused-arrival variant in this
  run (B, C, D, E, F, G) REPLACES. The fix does what its packet says it does.
- The spinner survives: this run did not re-measure arm S, and does not claim to.
- `FIELD-GROUP-REFLOW-F4` remains correctly closed as a layout defect; `P1c`/`P1d` pass in both
  directions in this run.

**Wrong as currently written, and corrected in this landing:**
- ROADMAP row 160's headline, `THE DIGITS ARE FIXED`, is true of the class the fix took and false
  of the gesture the finding was filed about. The row now says which.
- `docs/lens-findings.jsonl` still carried `NUMBERFIELD-FOCUSED-CLICK-INSERT` and
  `NUMBERFIELD-INSERT-CAUSE-UNKNOWN` as `open` with the cause unknown. **The cause is now known**
  and is §3. The symptom is still live, so neither row goes to `fixed`.
- The lane-log entry the owner reads says the digits bug is fixed. A correcting entry lands with
  this packet rather than an edit, because that file is append-only.

---

## 5. The remedy is a TRADE, so it is a card and not a fix

The narrow change is to arm the re-select when the box is focused but the focus **did not come
from a pointer**. It is small. It is not free:

- **Today:** tab into a field, click it, type — your digits append to the old number and you get a
  wrong value with nothing on screen saying so. This is the seat's `12872`.
- **After:** tab into a field, click it *to place a caret mid-number*, type — your caret is
  replaced by a select-all and the number is overwritten.

Both are real gestures. The asymmetry that decides it, and the recommendation on the card, is that
the first failure is **silent and produces a wrong number in a field that reaches a ROM**, while
the second is immediately visible to the person who made the gesture and costs one undo.

Filed as `docs/decisions.jsonl` → `NUMBERFIELD-TAB-THEN-CLICK`. **Not implemented here**: the
overnight instruction's gate is *small work that doesn't need decisions*, and a change to how every
numeric box in the app responds to a click is not that, however few lines it is.

---

## 6. What this packet does NOT prove

- **Nothing about the spinner.** Arm S was not re-run. Row 160's measurement of it stands on its
  own run.
- **Nothing about how common the gesture is.** One seat performed it once. That it reproduces
  deterministically says nothing about how often a person does it.
- **Nothing about `Top`.** Variant E clicked `Top` cold and replaced; no variant tabbed to `Top`.
  The mechanism in §3 is a property of the component, not of one box, so it should hold for every
  `NumberField` in the app — but that is derived, not measured, and is stated as derived.
- **Nothing about the unexplained half of row 159.** *Why typing masks the defect* is still
  unexplained and is now unfalsifiable from this instrument, exactly as row 160's packet said.
