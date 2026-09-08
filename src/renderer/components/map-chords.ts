/**
 * WHICH MAP SHORTCUT A KEY EVENT IS — MODIFIERS INCLUDED — decided out of
 * `.tsx` so the node suite can pin it. `MapViewport`'s keydown effect asks this
 * and acts; everything else about a branch (is there a marquee? is there
 * anything on the clipboard? is a level open?) stays in the handler, because
 * those are data questions and this is only the chord question.
 *
 * ═══ WHY THE CHORD QUESTION HAD TO LEAVE THE HANDLER ═══
 *
 * The handler carries ONE guard for modified keys, hoisted above the tool
 * letters:
 *
 *     if (e.ctrlKey || e.metaKey || e.altKey) return;   // somebody else's chord
 *
 * and its comment says "all of them, not the three that happened to be
 * noticed". It was true of everything BELOW it and false of everything above:
 * five branches dispatch before that line is reached, and each states its own
 * modifier policy, or none.
 *
 *   • Delete / Backspace tested NO modifier at all, and it is the only branch
 *     on this surface that DESTROYS data. Ctrl+Delete and Alt+Backspace both
 *     ran `delete-object` / `delete-ring` on the selection. Ctrl+Backspace is
 *     "delete the previous word" everywhere else in the OS, and Alt+Delete is a
 *     window-manager chord on this desktop, so both arrive without the author
 *     ever aiming them at the map.
 *   • `s` (save the marquee as a chunk) excluded Ctrl and Cmd and not Alt, so
 *     Alt+S opened a new document and switched facet.
 *   • F7 (warp the running game to the cursor) checked nothing.
 *   • Ctrl/Cmd+C and Ctrl/Cmd+V had no Alt exclusion.
 *
 * A policy stated five times is five things to forget once. Stated here, the
 * handler asks one question per branch and the answer for a modified key is the
 * same NO the hoisted guard already gives the keys below it.
 *
 * SHIFT IS NOT JUDGED, deliberately. The hoisted guard does not judge it
 * either: Shift is a case modifier on the letters this surface binds, and
 * Shift+Delete is an ordinary destructive key elsewhere. Excluding it here
 * would be a behaviour change nobody reported, dressed as a fix.
 */
export type MapChord = 'copy' | 'paste' | 'save-chunk' | 'warp' | 'delete';

/** The three modifier bits and the key name: what a `KeyboardEvent` carries. */
export interface ChordEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * The map shortcut this key event is, or `null` for "not one of ours" — which
 * is what every modified key that is not an explicit chord resolves to.
 *
 * `key` is compared lowercased so a Shift-held letter and a CapsLock letter
 * resolve the same way the handler's own `toLowerCase()` calls always did.
 */
export function resolveMapChord(e: ChordEvent): MapChord | null {
  // Alt belongs to the window manager and to menu mnemonics. Nothing on this
  // surface is an Alt chord, so Alt held means this event is not ours at all —
  // including the two that DO want Ctrl.
  if (e.altKey) return null;
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    // Ctrl/Cmd chords: exactly two, and both fall through in the handler when
    // there is nothing to copy or paste, so a no-op Ctrl+C still reaches the
    // browser's own text copy.
    if (key === 'c') return 'copy';
    if (key === 'v') return 'paste';
    return null;
  }
  if (key === 's') return 'save-chunk';
  if (key === 'f7') return 'warp';
  if (key === 'delete' || key === 'backspace') return 'delete';
  return null;
}
