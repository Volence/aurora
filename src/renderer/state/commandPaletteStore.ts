// src/renderer/state/commandPaletteStore.ts
//
// IS THE COMMAND PALETTE OPEN? One store, so something that is not the palette
// can open it.
//
// It exists because the answer used to be unreachable. `CommandPalette` owned
// `open` in its own `useState` and the only thing that could write it was its
// own `window` keydown listener - so the palette could be reached by a chord
// and by nothing else. That is UX seat B's F6: no menu, button, badge or hint
// anywhere names the control, and a person who does not already know the chord
// never finds the feature at all. An affordance that opens it needs a way to
// say so, and this is it.
//
// PRESENCE AND CONTROL, unlike `modalStore` next door, which is deliberately
// read-only. The difference is what each is for: the modal store answers "is a
// dialog up" for components that must BEHAVE differently, and a second way to
// drive a dialog would be a defect. This one exists precisely so a button can
// open the palette, so `open` is a write.

import { create } from 'zustand';
import { modalIsOpen } from './modalStore';

interface CommandPaletteState {
  /** Is the palette on screen? */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

/**
 * Open the palette from anywhere - a button, a menu item, a status strip.
 *
 * ⚠ IT CARRIES THE SAME MODAL RULE THE CHORD DOES, and for the same reason
 * (`paletteKeyAction`'s docblock has it in full): the palette renders below the
 * dialogs, so opening it over one puts an invisible search field in focus. A
 * caller cannot reasonably be expected to remember that, and a guard that lives
 * only in the keyboard path is a guard the next caller walks straight past -
 * this repo's own consumer-side-guard lesson. Returns whether it opened, so a
 * caller that wants to know can ask rather than assume.
 */
export function openCommandPalette(): boolean {
  if (modalIsOpen()) return false;
  useCommandPaletteStore.getState().setOpen(true);
  return true;
}
