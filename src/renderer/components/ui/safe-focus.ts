// src/renderer/components/ui/safe-focus.ts
//
// WHICH BUTTON A CONFIRM DIALOG IS ALLOWED TO FOCUS WHEN IT OPENS.
//
// ═══ WHY THIS EXISTS, MEASURED ════════════════════════════════════════════
//
// `shell/ConfirmDialog.tsx` used to focus NOTHING, and that accident was the
// only reason the app was safe. Plant P3 of the d-27 sprite-rows packet
// (`docs/reviews/2026-09-04-d27-sprite-rows-meet-dialog.md` §4) added four
// characters of textbook accessibility practice to it —
//
//     autoFocus={b.tone === 'danger'}
//
// — and in the real app under CDP a bare SPACE, aimed at nothing, silently
// destroyed a sprite: 5 frames to 1, 40x40 to 64x64, 224 painted pixels to
// zero, the undo history cleared, AND the dirty flag reset, so the tab-close,
// project-open and window-close guards all went quiet afterwards too. Nothing
// downstream would ever have asked about the work that was lost.
//
// Card `d-31-confirm-dialog-focuses-nothing` ruled `focus_cancel_and_guard`:
// the dialog focuses its SAFE button, never the destructive one, and a check
// fails from then on if a destructive button is ever the focused one.
//
// ═══ WHY IT IS A MODULE AND NOT THREE LINES IN THE DIALOG ═════════════════
//
// Same reason `focus-trap.ts` is one, and its header says it better: the node
// suite renders no React and no DOM, so a rule written inside a .tsx is a rule
// nothing can test. The DOM half — calling .focus() on an element — genuinely
// cannot be tested here. The CHOICE half, which is where this goes wrong, is
// pure, lives here, and is pinned by `__tests__/safe-focus.test.ts`.
//
// ═══ THE CHOICE IS NOT "index 0" AND NOT "the last one" ═══════════════════
//
// Every one of the eight `ask()` call sites in `src/` today happens to end with
// `{ key: 'cancel', label: 'Cancel' }`, so `buttons.length - 1` would be right
// at all eight and would be a latent trap the moment somebody adds a ninth. The
// rule below is derived from what makes a button SAFE, not from where it sits.

/**
 * The reserved answer key. `state/confirmStore.ts` returns it for Esc, for a
 * backdrop click and for a superseded request, and every caller is written to
 * treat any unrecognised answer as this one — so it is the one key in the
 * system that is guaranteed to destroy nothing.
 */
export const SAFE_CONFIRM_KEY = 'cancel';

/** The shape this module needs. Structurally satisfied by `ConfirmButton`. */
export interface FocusableConfirmButton {
  key: string;
  tone?: 'primary' | 'danger';
}

/**
 * The component's own notion of destructive, in one place so that the dialog,
 * the guard and this module cannot drift apart from each other.
 *
 * `'danger'` is what `ConfirmDialog` renders warning-toned, and it is what every
 * discarding button in the repo carries. Deliberately NOT a label test: labels
 * are prose ("Discard & close", "Clear library", "Discard & start new") and a
 * guard keyed on them silently stops covering the site that gets reworded.
 */
export function isDestructiveButton(b: FocusableConfirmButton): boolean {
  return b.tone === 'danger';
}

/**
 * The index of the button a confirm dialog should focus when it opens, or null
 * for "focus nothing".
 *
 * 1. The reserved cancel key, if it is present and not itself toned destructive.
 * 2. Otherwise the first button that is not destructive — a request with no
 *    cancel key still gets a safe landing spot rather than a dangerous one.
 * 3. Otherwise NULL.
 *
 * ⚠ RULE 3 IS THE WHOLE POINT AND IS WHERE A REWRITE WILL GO WRONG. The
 * tempting last line is `?? 0`, or `?? buttons.length - 1`, so that "something
 * is always focused" — and for an all-destructive request either one hands the
 * Space key a destructive button, which is precisely the P3 defect arriving by
 * a different door. There is no safe button to focus in that case, so this
 * focuses nothing: strictly today's behaviour, which was safe. A dialog whose
 * every option destroys something is a design problem to fix at the call site,
 * not something to paper over here by picking one of them.
 *
 * Returning null rather than throwing keeps the caller free of a crash path in
 * a modal — the dialog still renders, Esc still cancels, and Tab still reaches
 * the buttons.
 */
export function safeFocusIndex(buttons: readonly FocusableConfirmButton[]): number | null {
  const cancel = buttons.findIndex((b) => b.key === SAFE_CONFIRM_KEY && !isDestructiveButton(b));
  if (cancel >= 0) return cancel;
  const safe = buttons.findIndex((b) => !isDestructiveButton(b));
  return safe >= 0 ? safe : null;
}
