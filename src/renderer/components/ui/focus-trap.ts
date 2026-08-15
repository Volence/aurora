// src/renderer/components/ui/focus-trap.ts
//
// Keeping Tab inside a modal.
//
// WHY THIS IS A MODULE AND NOT FOUR LINES IN THE DIALOG. The node suite renders
// no React and no DOM, so a rule written inside a .tsx is a rule nothing can
// test — which is exactly how the New Canvas dialog shipped its first version
// with no trap at all: Tab walked straight out of the modal into the app behind
// it, and the whole suite was green. The DOM half (which elements are focusable,
// and calling .focus()) genuinely cannot be tested here. The ARITHMETIC half —
// where focus goes next, and the wrap at each end, which is where a hand-rolled
// trap actually goes wrong — is pure, lives here, and is pinned.
//
// Only the New Canvas dialog uses it today. ConfirmDialog is the obvious second
// caller (its buttons have the same problem, less painfully, since it holds no
// typed input to lose).

/**
 * The tab-order selector. Deliberately narrow — the controls Aurora's dialogs
 * actually contain — rather than the exhaustive "focusable elements" list from
 * the usual snippet: everything else in these panels is a div.
 *
 * `:not([disabled])` matters: the primary button of a form with a validation
 * error IS disabled, so it is not in the cycle, and a trap built on a stale
 * element list would send focus to something the browser refuses to focus and
 * leave it on <body> — outside the modal, which is the bug this prevents.
 */
export const FOCUSABLE_SELECTOR =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]';

/**
 * Where Tab should land, given how many focusable controls the modal has and
 * which one holds focus now.
 *
 * `current` is -1 when focus is not on any of them (the panel div itself, or
 * something outside): Tab then enters at the first control and Shift+Tab at the
 * last, which is what makes the trap RECOVER rather than only maintain — a
 * modal whose focus has escaped is otherwise stuck outside forever.
 *
 * Returns null when there is nothing to focus, so the caller lets the event
 * through rather than calling .focus() on undefined.
 */
export function nextTrapIndex(count: number, current: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  // Wrapping is the trap: the last control's Tab goes to the first, and the
  // first's Shift+Tab goes to the last. Without the wrap the browser moves focus
  // to the page behind the modal and the dialog silently stops receiving keys.
  return shift
    ? (current - 1 + count) % count
    : (current + 1) % count;
}
