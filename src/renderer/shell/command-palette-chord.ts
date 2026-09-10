// src/renderer/shell/command-palette-chord.ts
//
// WHICH KEYSTROKES REACH THE COMMAND PALETTE, as a pure decision a node suite
// can execute.
//
// ═══ THE FINDING (UX seat B, F6) ═══
//
// A seat walking this app cold pressed Ctrl+P: nothing. Ctrl+Shift+P: nothing.
// Ctrl+K: the palette opened. Three presses to reach one control, and no menu,
// button, badge or hint anywhere on any screen they walked names it.
//
// ⚠ AND THE SEAT DISCLOSED THAT THE THREE IS A FLOOR, NOT A MEASUREMENT. They
// knew a palette existed at all only because they had read
// `src/renderer/shell/commands.ts` while checking something else. A person
// without that prior presses NOTHING: their cost is not two wasted keystrokes,
// it is never finding the feature. So the shortcut this file adds is the SMALL
// half of the answer; the affordance in `Explorer.tsx` that names the palette in
// plain sight, with no hover and no prior, is the half that addresses the
// finding as the seat framed it.
//
// ═══ WHY Ctrl+Shift+P AND NOT Ctrl+P ═══
//
// The seat pressed both, so both are candidates and the choice needs a reason
// rather than a coin toss.
//
//   Ctrl+Shift+P is the command palette everywhere it exists: VS Code, Atom,
//   Sublime, and every editor that copied them. It means "run a command", which
//   is exactly what this control does, and it is unbound in Aurora today.
//
//   Ctrl+P in those same editors is QUICK OPEN A FILE, a different control with
//   a different result set, and in a Chromium renderer it is also the print
//   chord. Binding it here would make the palette answer a keystroke that
//   conventionally means something else, and would put Aurora in a race with
//   the runtime for a chord neither of us clearly owns. It is left unbound, and
//   this comment is why - not an oversight.
//
// ⚠ Ctrl+K IS NOT TOUCHED. The seat's own note: people may already use it, and
// removing or moving it is not in scope. It stays the first shortcut named on
// the affordance for the same reason - it is the one anybody already has in
// their fingers.

/** What a keystroke asks of the palette. `null` is "not ours, let it through". */
export type PaletteKeyAction = 'toggle' | 'close' | null;

/** The fields of a `KeyboardEvent` this decision reads, and no others. */
export interface PaletteChordEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * The chords the palette answers, in the order they are offered to a reader.
 *
 * ONE ARRAY, READ BY BOTH SIDES. The affordance's tooltip is built from this,
 * and `paletteKeyAction` below is what actually fires, so a shortcut that is
 * advertised and a shortcut that works cannot drift apart. A label typed a
 * second time in a `title=` is precisely how "the tooltip says Ctrl+K and the
 * app answers Ctrl+J" happens, and nothing would catch it.
 */
export const PALETTE_SHORTCUTS: readonly string[] = ['Ctrl+K', 'Ctrl+Shift+P'];

/** The one shown where only one fits. Ctrl+K: the binding that already shipped. */
export const PALETTE_PRIMARY_SHORTCUT = PALETTE_SHORTCUTS[0];

/** `Run a command (Ctrl+K or Ctrl+Shift+P)` - the affordance's whole tooltip. */
export const PALETTE_AFFORDANCE_TITLE =
  `Run a command (${PALETTE_SHORTCUTS.join(' or ')})`;

/** The words on the affordance itself, so it is legible without a hover. */
export const PALETTE_AFFORDANCE_LABEL = 'Run a command';

/**
 * What this keystroke does to the palette.
 *
 * @param e         the keystroke.
 * @param open      is the palette on screen right now?
 * @param modalOpen is a dialog waiting for an answer? (`modalIsOpen()`)
 *
 * ⚠ THE MODAL RULE IS PRESERVED EXACTLY AS THE PALETTE ALREADY HAD IT, and it
 * is asymmetric on purpose: a chord may not OPEN the palette over a dialog, but
 * a palette that is already open still answers its own chords. The palette used
 * to open UNDERNEATH a dialog - it sat at z-1000 and the dialogs at 1100 - so
 * the chord was swallowed, an invisible search field took focus, and typing
 * went nowhere anybody could see. Raising it above would have been the other
 * bug: a modal that can be walked around is not modal, and the commands behind
 * it include Open Project, which is exactly what the confirm is asking about.
 */
export function paletteKeyAction(
  e: PaletteChordEvent, open: boolean, modalOpen: boolean,
): PaletteKeyAction {
  if (e.key === 'Escape') return open ? 'close' : null;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return null;
  // `key` carries the SHIFTED spelling, so a shift held over `k` arrives as
  // `K`. Both spellings were accepted before this file existed and both still
  // are: Ctrl+Shift+K opening the palette is behaviour somebody may have, and
  // this parcel changes no existing binding.
  const isK = e.key === 'k' || e.key === 'K';
  const isShiftP = e.shiftKey && (e.key === 'p' || e.key === 'P');
  if (!isK && !isShiftP) return null;
  if (!open && modalOpen) return null;
  return 'toggle';
}
