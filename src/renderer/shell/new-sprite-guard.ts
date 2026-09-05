// ASK BEFORE REPLACING A SPRITE THAT HAS UNSAVED EDITS — decision d-29,
// answered `guard_when_dirty` (`docs/decisions.jsonl`,
// `d-29-new-sprite-clears-undo-answered`).
//
// ⚠ WHO ANSWERED IT. That entry records the ruling as made BY THE SUITE HUB IN
// THE OWNER'S PLACE under a standing delegation, NOT by the owner, and says it
// is explicitly overturnable on his read-back. Read the entry, not this
// paragraph, before treating the behaviour below as settled.
//
// ═══ WHAT MADE THESE BUTTONS DIFFERENT FROM THE COLLISION WIPES ═══════════
//
// `newSprite` (state/spriteStore.ts) does three things in two lines:
//
//   1. `activeSpriteHistory().clear()` — so unlike the collision Clear/Reset
//      the owner ruled on in d-27, this is NOT one Ctrl+Z away. There is no
//      history left to undo through.
//   2. `set({ ...blankDoc(w, h) })` — every frame, every anim step, the origin
//      and the palette are replaced.
//   3. `blankDoc` sets `unsavedEdits: false`, so the tab's dirty dot goes out
//      and the guards that normally stop you losing work later — tab close
//      (shell/tab-activation/sprite.ts), project open (shell/project-open-guard
//      .ts), window close (shell/close-guard.ts) — have nothing left to fire
//      on. The loss is not merely un-undoable; it is invisible downstream.
//
// And the buttons that call it are the size chips in the sprite option bar,
// which sit beside tools an author uses constantly.
//
// ═══ WHY THE CLEAN DOCUMENT GETS NO DIALOG, AND WHY THAT IS THE DESIGN ═════
//
// The dialog is paid for ONLY in the case that can lose work. A clean document
// — a freshly opened sprite, or one already replaced — starts a new one with no
// interruption at all, which is exactly what the owner himself chose in d-27
// (`blur_after_press`: the smallest change, no dialog) for an action that was
// recoverable. This is that same rule applied to an action that is not.
//
// So a harness proving this feature has TWO discriminating rows, not one: the
// dirty document shows the dialog and Cancel keeps the work, AND the clean
// document shows NO dialog and the action proceeds. A file with only the first
// has tested a dialog, not the ruling. `scratchpad/confirm-destroy-harness.mjs`
// carries both, `[n*]` and `[c*]`.
//
// ═══ THE MACHINERY IS BORROWED, NOT BUILT ═════════════════════════════════
//
// `useConfirmStore` is the SAME promise-based store the tab-close, project-open
// and window-close doors already ask through, rendered by the same
// `shell/ConfirmDialog.tsx`. That reuse is load-bearing: the ruling's third
// ground is that this is CONSISTENCY rather than a new pattern, and a second
// dialog mechanism would remove the ground it was decided on.
//
// ═══ WHY THIS IS A MODULE AND NOT A LINE IN THE COMPONENT ═════════════════
//
// `newSprite` is dispatched from TWO near-identical lines in
// `shell/SpriteToolOptions.tsx` — the preset-chip map and the `New □` chip,
// twenty lines apart. This repo's standing way for a defect to survive a
// convincing green is a fix wired to one of two such lines; the harness gives
// each its own rows for that reason, and this module makes them share one
// implementation so there is one guard to get right.
//
// ⚠ IT IS NOT IN THE STORE. `useSpriteStore.getState().newSprite(w, h)` still
// replaces the document with no question asked — the store action is
// synchronous and unit-tested as such, and `blankDoc`'s invariant (a fresh
// sprite starts with an empty history) is deliberate. A NEW call site that
// wants the guard must call THIS, exactly as a new destructive control must
// route through `ui/act-and-drop-focus.ts` rather than blurring by hand.
//
// ═══ TWO BUTTONS, NOT THREE ═══════════════════════════════════════════════
//
// The other confirm doors offer Save / Discard / Cancel. This one offers only
// Discard and Cancel, and that is a deliberate narrowing rather than an
// oversight: the document these chips replace is frequently an UNTITLED sprite
// with no file to save to, and a sprite checkout can refuse its own save-back
// (`saveBackRefusal`). A Save arm would therefore need its own failure path and
// its own message, and no part of d-29 asked for one. The dialog's job here is
// to stop the loss; Ctrl+S remains one keystroke away before pressing the chip.
// Recorded in `docs/reviews/2026-09-04-confirm-before-destroying.md` as a
// choice made under the ruling, not by it.

import { useSpriteStore } from '../state/spriteStore';
import { useConfirmStore } from '../state/confirmStore';

/**
 * Would starting a new sprite right now destroy unsaved work?
 *
 * Reads the ACTIVE document's own `unsavedEdits` flag — deliberately NOT
 * `anySpriteDocDirty()`, which the project-open perimeter uses. That predicate
 * covers PARKED background sprite documents too, and `newSprite` does not touch
 * them: it calls `activeSpriteHistory()` and replaces the checked-out document
 * alone. Asking about a background tab's edits here would confirm on a press
 * that cannot lose them, which is the same "dialog where nothing is at stake"
 * the ruling exists to avoid.
 */
export function newSpriteWouldDestroy(): boolean {
  return useSpriteStore.getState().unsavedEdits;
}

/**
 * Start a new sprite, asking first when the current one has unsaved edits.
 *
 * Resolves true when the document was replaced, false when the author
 * cancelled (Esc, backdrop and a superseded request all answer 'cancel', so
 * anything that is not an explicit discard is treated as one).
 */
export async function newSpriteGuarded(w: number, h: number): Promise<boolean> {
  if (!newSpriteWouldDestroy()) {
    useSpriteStore.getState().newSprite(w, h);
    return true;
  }

  const answer = await useConfirmStore.getState().ask({
    title: 'Discard this sprite?',
    body: 'This sprite has unsaved edits. Starting a new one replaces every frame, '
      + 'every animation step and the palette, and clears the undo history: '
      + 'Ctrl+Z will not bring it back.',
    buttons: [
      { key: 'discard', label: 'Discard & start new', tone: 'danger' },
      { key: 'cancel', label: 'Cancel' },
    ],
  });

  if (answer !== 'discard') return false;
  useSpriteStore.getState().newSprite(w, h);
  return true;
}
