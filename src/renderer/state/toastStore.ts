import { create } from 'zustand';

export type ToastType = 'success' | 'info' | 'error';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

let nextId = 0;

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: number) => void;
  markExiting: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, exiting: false }] }));
    setTimeout(() => useToastStore.getState().markExiting(id), 2200);
    setTimeout(() => useToastStore.getState().removeToast(id), 2600);
  },
  markExiting: (id) => set((s) => ({
    toasts: s.toasts.map((t) => t.id === id ? { ...t, exiting: true } : t),
  })),
  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  })),
}));
