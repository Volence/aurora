# Tab, then click, then type now replaces, and the click after that keeps its caret

**2026-09-13, aurora, worktree agent.** Closes `NUMBERFIELD-TAB-THEN-CLICK`, ruled FIX
(`docs/decisions.jsonl`, `NUMBERFIELD-TAB-THEN-CLICK-answered`). Branch
`fix/numberfield-tab-then-click` off master `f60526ac`. Instrument:
`scratchpad/numberfield-selection-trace-harness.mjs` (`npm run harness:numberfield-selection-trace`),
which row 160 built and this parcel extends with six arms. It follows
`docs/reviews/2026-09-10-numberfield-previous-visit.md`, whose closing list said *"Nothing about
Tab in a browser."*

## The ruling, read literally

Chosen option: *"A click re-selects whenever the box was NOT focused by a pointer -- so
tab-then-click types a fresh number like every other way into the box."* Its accepted cost:
*"after a Tab, a click that deliberately places the cursor mid-number would have that cursor
replaced by a select-all."* Rejected: *"Clicking a focused box always places a cursor, whatever
focused it."*

## The mechanism

`NumberField` re-selects on the click that brings the box into focus. It arms a ref on
`mousedown`, spends it on the first `click` by queueing `el.select()` behind a
`setTimeout(..., 0)`, and disarms on `blur` (row 160). The arm was set only when `!editing`, and
that asks *"was this box unfocused when the pointer went down?"*. **A Tab gets that answer
wrong.** After a Tab the box is already focused, so the click was never armed, and the click's own
caret took the digits: `156` + `7` became `1567`.

**The fix changes WHICH clicks are armed, and nothing about how the re-select is done.** A new ref,
`claimed`, is set by a primary press or by `onChange`, and cleared by `blur`. The click is armed
when the box is unfocused (as before) **or** focused but unclaimed. That gives one rule for every
way into the box: **the first primary click of a visit re-selects, and every click after it places
a caret.** The pointer path is unchanged, because the focusing click is still the first press. No
default action is suppressed anywhere: no `preventDefault`, so the spin button's mouseup still
stops its auto-repeat. One component, and no file outside `NumberField` changed.

## ⚠ Two readings the ruling does not spell out, ruled here and flagged for ratification

### 1. Tab in, type, THEN click mid-number: the click KEEPS its caret (arm U, row 5c)

**The call:** typing claims the visit, the same as a pointer press does. Tab, type `155`, click at
the left edge, type `7`, and the result is `7155`, not `7`.

**Why:** the ruling's own question is scoped to *"TAB into a number box and then also click it
**before typing**"*, and the hazard it weighs is digits *"appended to the OLD number"*, silently.
Once the author has typed, the box holds their own text, which they are looking at. A click into
it is an edit of that text, exactly as click, type, click has always been (arm N's territory). Re-
selecting there would take a caret the ruling never priced, to guard against a hazard that is no
longer present.

**⚠ This is an interpretation, not the option's words.** Read literally, *"whenever the box was
NOT focused by a pointer"* would make this click REPLACE. If the overseer or the owner rules
that, the change is one line: stop setting `claimed` in `onChange`, and flip row 5c and the three
unit rows that name typing. `claimed` is set before the refusal check, so a refused keystroke
claims too. What matters is the text on screen, not whether it committed.

"Typing" here means anything that fires `onChange`: a digit, an arrow key or a spin step. A key
that changes nothing (Left, Right, Home) does not claim, so Tab, Right, click still re-selects.
That is the safe direction for the ruling's asymmetry.

### 2. Tab in, click, click again: the SECOND click keeps its caret (arm V, row 5d)

The option's literal words could also be read as *"every click in a Tab-started visit
re-selects"*. That would leave no way to place a caret with the mouse until the box is left. The
ruling's stated cost is **one gesture** (*"You lose one gesture: tab in, click to put the cursor
inside the digits, type"*), and *"like every other way into the box"* means the pointer way: first
click selects, next click places a caret. So the first click claims the box.

A **non-primary** press (right-click, X11 middle-click paste) neither re-selects nor claims, so the
next primary click still does. Row 160's primary-only rule, carried over. A middle-click paste
changes the text, so `onChange` claims it anyway.

## Red first

Arm T was committed alone (`156e8196`) and run against the unfixed build (`dist/` from
`f60526ac`, `VITE_AURORA_DEBUG=1`):

```
  T0  Tab in, NO click, type        REPLACED  ("156" + "7" -> "7")
  T   Tab in, ONE real click, type  INSERTED  ("156" + "7" -> "1567")
FAIL  [5b] NUMBERFIELD-TAB-THEN-CLICK: Tab in, one real click, type REPLACES   [load 1.98/2.54/3.61]
      "156" + "7" -> "1567" (INSERTED, caret at 3)
════ 11/12 rows PASS · 1 FAIL · 0 UNMEASURABLE · 161.0s ════
     loadavg at start 1.21 3.39 4.06 · at end 3.50 2.85 3.70
```

The Tab is a real key (`Input.dispatchKeyEvent`, `rawKeyDown`, VK 9), never `.focus()`. The arm
puts focus on the Top box with a real click, presses Tab until `activeElement` is the Bot box,
and prints the path: *"real click on Top, then 1 real Tab(s): INPUT:Screen line the effect turns
OFF..."*. T0 is the Tab path's floor, the way D is the click path's. It replaced, so the Tab itself
selects, and the click is what took the selection away.

## Before and after, per arm, one run each

**Before:** the final harness (`e3abf510`) against master's `fields.tsx` restored from
`f60526ac`, one run. **After:** the same harness against the committed fix, one run (final green
run 1 below). Never a row from one run beside a row from another.

| arm | gesture | before | after |
|---|---|---|---|
| **D** | never focused, click, type | REPLACED `7` | REPLACED `7` |
| **H** | visited, nothing typed | REPLACED `7` | REPLACED `7` |
| **I** | typed and committed | REPLACED `7` | REPLACED `7` |
| **J** | typed and refused | REPLACED `7` | REPLACED `7` |
| **K** | `.select()` only | REPLACED `7` | REPLACED `7` |
| **L** | typed, no `select()` | REPLACED `7` | REPLACED `7` |
| **M** | arm H + injected mouseup guard | REPLACED `7` | REPLACED `7` |
| **N** | second click, left edge, already focused by pointer | INSERTED `7156` (caret 0) | INSERTED `7156` (caret 0) |
| **T0** | Tab, type | REPLACED `7` | REPLACED `7` |
| **T** | **Tab, click, type** | **INSERTED `1567`** (caret 3) | **REPLACED `7`** |
| **U** | Tab, type `155`, click left edge, type | INSERTED `7155` (caret 0) | INSERTED `7155` (caret 0) |
| **V** | Tab, click, click left edge, type | INSERTED `7156` (caret 0) | INSERTED `7156` (caret 0) |
| **S** | one click on the spin arrow, unfocused | `156` -> `155` -> `155` | `156` -> `155` -> `155` |
| **SH** | spin arrow HELD, unfocused, then released | held `156` -> `151` -> `135`, released `135` -> `135` | held `156` -> `151` -> `135`, released `135` -> `135` |
| **TH** | spin arrow HELD after a Tab, then released | held `156` -> `151` -> `135`, released `135` -> `135` | held `156` -> `151` -> `135`, released `135` -> `135` |

Before: `15/16 rows PASS · 1 FAIL · 0 UNMEASURABLE · 219.0s`, loadavg at start 5.05 6.74 6.30 · at
end 3.87 5.31 5.81, the one FAIL `[5b]`. **Only T moves.** U and V inserted on master as well,
because master re-selects on no click after a Tab. That is why they needed planted mutations to
prove they can go red (below).

## The final runs, three times

```
run 1  ════ 16/16 rows PASS · 0 FAIL · 0 UNMEASURABLE · 220.5s ════
            loadavg at start 3.75 5.16 5.75 · at end 5.59 7.41 6.70
run 2  ════ 16/16 rows PASS · 0 FAIL · 0 UNMEASURABLE · 219.7s ════
            loadavg at start 6.60 7.56 6.77 · at end 4.63 6.60 6.57
run 3  ════ 16/16 rows PASS · 0 FAIL · 0 UNMEASURABLE · 219.0s ════
            loadavg at start 4.23 6.45 6.52 · at end 1.76 4.44 5.73
```

Every run: `root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ae18cf16b32156885`,
`pinned: AURORA_BUILT_TREE=` the same path, `dpr: 1`, aeon a fresh `git archive` of aeon's
`origin/master` per run. That was `dbb67085` for every run in this packet except final run 3,
which drew `cb4805b5` because aeon's master moved mid-parcel. Its rows match runs 1 and 2 value
for value, and the panel under test is Aurora's. `ELECTRON_BIN` was the main checkout's electron, and the
`root:` line confirms the worktree's own `dist/` was driven.

## Every guard row, proven red by a planted mutation

Each was planted in the committed `fields.tsx`, quoted from `git diff`, built, run, and restored with
`git checkout HEAD --`.

| mutation | planted line | red rows (one run each) |
|---|---|---|
| **M1** arm on every click | `focusingClick.current = primary;` | `[2c]` N `"156" + "7" -> "7"` REPLACED; `[5c]` U `"155" + "7" -> "7"`; `[5d]` V `"156" + "7" -> "7"`. 13/16, 219.4s, load 4.52 -> 2.92 |
| **M2** typing does not claim | the `claimed.current = true;` in `onChange` deleted | `[5c]` alone, `"155" + "7" -> "7"` REPLACED. 15/16, 221.4s, load 3.69 -> 12.57 |
| **M3** a mouseup `preventDefault` | `onMouseUp={(e) => { e.preventDefault(); }}` | `[4a]` `"156"` -> +600ms `"147"` -> +2000ms `"119"`; `[4b]` released `123` -> `95`; `[4c]` released `123` -> `95`; also `[2c]` and `[5d]` (below). 11/16, 219.1s, load 10.57 -> 4.99 |

**M3 reproduces row 160's runaway to the digit** (`156` -> `147` -> `119`), measured by a second
instrument, the held-arrow rows. While the arrow is held the value steps (`151`, `135`), and after
the release it keeps sliding (`123`, `95`). A single click would not show it, and a held arrow shows
it on both the unfocused and the tabbed-into box. **M3 also took the caret click** (`2c`, `5d`
REPLACED). That is the second cost row 160 recorded for that remedy, now observed.

Unit rows (`src/renderer/components/ui/__tests__/number-field-empty.test.ts`, a new describe of 7):
master's `fields.tsx` turned 3 red (the Tab-then-click row, the non-primary row, the blur row),
M2 turned 3 red (typing, refused typing, blur), and M1 turned 7 red (the two scope rows of
row 160's block and five of the new seven). Each of the seven has been red at least once. They ask
the SCOPE, meaning which clicks re-select, and not whether the selection survives, which is
Blink's and is asked of the browser.

## ⚠ An instrument finding: a press with no hover hit nothing

The first run of SH came back **UNMEASURABLE**. It held the arrow at arm S's exact hit on an
unfocused, never-hovered box, and the value moved 0. TH, on a focused box at the same offset, moved
21. With a `mouseMoved` to the spot first (a real pointer always hovers before it presses), the
next run's SH moved 21. The rect and the aim were identical to S's (`1254/489.40625`, aim
`1239,483`), so the hover was the only variable. Chromium shows the number spin button on hover
or focus. **That is the reading this supports, not a proof.** It may also explain why arm S's first
candidate, `x=1244`, missed in every run of this parcel (`1244:156->156` each time; row 160's
packet does not record S's candidates, so I cannot say for its runs). S tries that candidate on a
never-hovered box, and its second candidate has been hovered by the first. S is left as it is,
because its aim search is row 160's comparability.

## What a green here does NOT prove

* **Nothing about a keyboard-only claim that changes no text.** Tab, Right arrow, click re-selects
  under this fix. That is argued above and has no harness row.
* **Nothing about a right-click or middle-click after a Tab** in a browser. The node suite asks
  the scope, and no harness arm presses a non-primary button.
* **Nothing about a drag-selection** after a Tab (press, drag, release). Its press is primary, so it
  arms, and the queued re-select would replace the dragged selection with select-all. That is the
  same trade the ruling accepted for the caret, and no arm measures it.
* **The spin rows sample at 400ms, 1.2s, then 0.6s and 2.0s after the release.** A runaway slower
  than one step per 1.4s would read as stopped.
