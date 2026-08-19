import { create } from 'zustand';

export type ToastType = 'success' | 'info' | 'error' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

let nextId = 0;

const EXIT_MS = 400; // must outlast ToastContainer's 0.3s toast-out animation

/**
 * How long a toast stays up before it starts exiting.
 *
 * An error is not the same length as a confirmation. Successes and infos are
 * short acknowledgements ("Saved 1 level(s)"), but the error path carries the
 * messages that have to be ACTED on — which file conflicted, which settings were
 * not written, what to do about it — and those run to several sentences. 2.2s
 * is not enough time to read one, and an unread error is the same as no error
 * at all. Click-to-dismiss (ToastContainer) is the other half of this: the
 * longer dwell is only tolerable because the user can end it early.
 *
 * A WARNING sits between the two, for the same reason from the other side. Like
 * an error it carries a sentence that has to be ACTED on — "these cells are
 * behind a loop, the engine may read a different chunk" is not an
 * acknowledgement, and 2.2s is not enough time to read it, so a warning on the
 * short dwell is a warning nobody saw. But nothing FAILED: the write landed, and
 * holding a successful gesture's aside on screen for the full ten seconds of a
 * file conflict overstates it and trains the user to swat toasts. Same bargain
 * as the error: the longer dwell is only tolerable because a click ends it.
 */
export function dwellMs(type: ToastType): number {
  if (type === 'error') return 10000;
  if (type === 'warning') return 8000;
  return 2200;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: number) => void;
  markExiting: (id: number) => void;
  /** User-initiated close (clicking the toast). Runs the same exit animation as
   *  the timeout path rather than yanking the node, so a click does not make the
   *  toasts below it jump. The original timers still fire later and no-op —
   *  markExiting and removeToast are both idempotent. */
  dismissToast: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, exiting: false }] }));
    const dwell = dwellMs(type);
    setTimeout(() => useToastStore.getState().markExiting(id), dwell);
    setTimeout(() => useToastStore.getState().removeToast(id), dwell + EXIT_MS);
  },
  dismissToast: (id) => {
    useToastStore.getState().markExiting(id);
    setTimeout(() => useToastStore.getState().removeToast(id), EXIT_MS);
  },
  markExiting: (id) => set((s) => ({
    toasts: s.toasts.map((t) => t.id === id ? { ...t, exiting: true } : t),
  })),
  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  })),
}));
