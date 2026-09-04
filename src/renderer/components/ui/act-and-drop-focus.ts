// src/renderer/components/ui/act-and-drop-focus.ts
//
// A DESTRUCTIVE BUTTON ACTS AND THEN DROPS FOCUS — decision d-27, the owner's
// words: *"just being a button that acts and then drops focus is how it should
// work right?"* (empyrean `034ab6c`, `docs/OVERSEER-LOG.md`).
//
// WHY THIS IS A MODULE AND NOT A FUNCTION IN ONE .tsx. It shipped inside
// `components/CollisionPalette.tsx` because it had exactly two callers, both in
// that file. The d-27 survey then found the same shape on nine more controls
// across five other files (`docs/reviews/2026-09-03-d27-blur-after-press.md`,
// "Tagged, not fixed"), and a helper five files reach into a palette component
// for is a helper with the wrong home. `focus-trap.ts` sets the precedent: the
// focus rules of this app live beside the primitives, not inside one consumer.
//
// WHY IT EXISTS AT ALL. Measured 2026-09-02 (O48b, row `[k2]` of
// `scratchpad/collision-destructive-harness.mjs`): after a real mouse click the
// `Reset`/`Clear` button KEPT keyboard focus — `document.activeElement` was that
// `<button>` — and a bare SPACE then re-fired the whole wholesale collision wipe
// with no confirmation. **Enter did not**, over the same CDP input channel,
// which is why it read as an accident rather than a design. d-27 chose the
// smallest fix over a confirmation dialog.
//
// ⚠ THE BLUR IS UNCONDITIONAL, AND IT HAPPENS BEFORE THE ACTION. Destructive
// handlers here carry silent early returns (`if (!entries.length) return`,
// `if (!engine) return`, a command constructor that returns `null` on a
// refusal), and the no-op press is EXACTLY the case where a repeat Space is
// most pointless and least noticed: the author cannot tell "already at the
// baseline" from "the click did not register". Blurring only on the path that
// wrote something would leave the defect alive in the half an author cannot
// see. Doing it FIRST — rather than after `act()` — is what makes
// "unconditional" true by construction rather than by every future edit
// remembering it, and no handler wired through this reads focus.
//
// ⚠ THE `key={i}` LIST-REMOVAL CASE IS THE SHARPEST ONE, and it is why several
// of the new callers are list rows rather than toolbar buttons. When a remove
// button lives in a list keyed by index, it does not unmount with the item it
// deleted — it stays mounted and NOW POINTS AT THE NEXT ITEM. So a repeat Space
// does not repeat the action, it RETARGETS it at the neighbour: hold Space on
// "remove layer 2" and layers 2, 3 and 4 go, one keystroke each.
//
// WHAT THIS IS NOT. Not a confirmation, not a dialog, not a toast — those were
// the options d-27 did not pick. Clicking again still works normally: a click
// focuses the button afresh, so a keyboard-only author reaches it again with
// Tab, which is the cost the decision card already priced. Ctrl+Z is
// unaffected; `LevelWorkspace`'s `isTypingTarget` lets the undo through from
// `<body>` for the same reason it exempts `<button>`.
//
// WHAT PROVES IT. The node suite cannot see React, a DOM or a click, so nothing
// in `vitest` can prove the blur runs. Rows `[k3]`-`[k7]` of
// `scratchpad/collision-destructive-harness.mjs` (the two collision buttons) and
// `scratchpad/d27-sprite-focus-harness.mjs` (six of the survey's nine) and
// `scratchpad/d27-effects-focus-harness.mjs` (the other three) press the real
// buttons in the real app. `[k7]` — a press that changes NOTHING still drops
// focus — is the row that dies under a blur-only-on-the-acting-path
// implementation, and it is the one the owner's ruling actually rests on.

import type React from 'react';

/**
 * Blur the pressed button, then run its action.
 *
 * Ordering is load-bearing: see the ⚠ block above. `act` is invoked with no
 * arguments so a caller cannot accidentally hand the (already-blurred) event on
 * to a handler that would try to read focus from it.
 */
export function actAndDropFocus(e: React.MouseEvent<HTMLButtonElement>, act: () => void): void {
  e.currentTarget.blur();
  act();
}
