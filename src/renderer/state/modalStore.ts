// IS A DIALOG WAITING FOR AN ANSWER? One store, so everything that needs to
// know asks the same question.
//
// It exists because the answer used to be unobtainable. Aurora's three modals
// are owned in three different places — ConfirmDialog by `confirmStore`, New
// Canvas and Import Sheet by React state private to App — so a component that
// merely wanted to behave differently while one was up (the command palette,
// which was opening invisibly underneath) had nothing to read. Guessing from
// the DOM was the alternative, and it would have been wrong the same day: the
// Import Sheet dialog carries no `role="dialog"` at all.
//
// Presence, not control: a modal REGISTERS while it is on screen and nothing
// here can open or close one. That keeps the store a fact rather than a second
// way to drive the UI.

import { useEffect } from 'react';
import { create } from 'zustand';

interface ModalState {
  /** Ids of the modals currently on screen, in the order they appeared. */
  open: string[];
  push: (id: string) => void;
  pop: (id: string) => void;
}

export const useModalStore = create<ModalState>((set) => ({
  open: [],
  // Idempotent by id: React can run an effect twice (StrictMode) without the
  // stack drifting, and a doubled entry would leave the app permanently
  // believing a dismissed dialog is still up.
  push: (id) => set((s) => (s.open.includes(id) ? {} : { open: [...s.open, id] })),
  pop: (id) => set((s) => ({ open: s.open.filter((x) => x !== id) })),
}));

/**
 * Declare that this component is a modal while `active`.
 *
 * Called unconditionally (hooks rules) with the component's own visibility, so
 * a dialog that renders null when closed still registers correctly.
 */
export function useModalPresence(id: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useModalStore.getState().push(id);
    return () => useModalStore.getState().pop(id);
  }, [id, active]);
}

/** Imperative read, for keyboard handlers outside React's render. */
export function modalIsOpen(): boolean {
  return useModalStore.getState().open.length > 0;
}
