// IS THE USER TYPING? One answer, for every window-level key handler.
//
// There were six of them, and they did not agree. The composer's was complete
// (contenteditable, textarea, and an INPUT that is not a range/checkbox/
// button/radio); the canvas and sprite panes each held a hand-copy of it; the
// map viewport's forgot the input-type filter, so a focused RANGE slider
// counted as typing and swallowed the map's own keys; and the aeon composer's
// was `tagName === 'INPUT'` alone, which let Escape close a dialog out from
// under a textarea.
//
// The divergence is the point, not the duplication: each copy was written for
// one surface and then quietly became the rule for a different one. A shared
// predicate cannot drift, and a surface that genuinely needs a WIDER rule says
// so at its own call site (use-hand-pan's `ownsSpace` is the standing example —
// a focused BUTTON owns Space, though nobody is typing into it).

/**
 * Does this event target take text? Then the key belongs to it, not to a
 * window-level shortcut.
 *
 * The INPUT type filter is what stops a slider or a checkbox from counting: a
 * focused range input is not a text field, and treating it as one makes every
 * shortcut on that surface silently stop working while it has focus.
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT'
    && !['range', 'checkbox', 'button', 'radio', 'submit', 'reset', 'color', 'file'].includes(
      (el as HTMLInputElement).type,
    );
}
