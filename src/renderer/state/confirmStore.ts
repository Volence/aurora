// Promise-based confirm dialog state. ask() parks a resolver in the store;
// ConfirmDialog renders the request and calls answer(key). 'cancel' is the
// reserved key returned for Esc/backdrop and for a superseded request, so
// callers can always treat unknown outcomes as cancel.

import { create } from 'zustand';

export interface ConfirmButton {
  key: string;
  label: string;
  /** 'danger' renders warning-toned (discard actions); 'primary' emerald. */
  tone?: 'primary' | 'danger';
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  buttons: ConfirmButton[];
}

interface ConfirmState {
  request: ConfirmRequest | null;
  resolver: ((key: string) => void) | null;
  ask: (request: ConfirmRequest) => Promise<string>;
  answer: (key: string) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,
  ask: (request) => {
    get().resolver?.('cancel'); // supersede any pending request
    return new Promise<string>((resolve) => set({ request, resolver: resolve }));
  },
  answer: (key) => {
    const { resolver } = get();
    if (!resolver) return;
    set({ request: null, resolver: null });
    resolver(key);
  },
}));
