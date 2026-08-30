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

/**
 * How many toasts the stack will PAINT at once.
 *
 * WHY A CAP AT ALL. `dwellMs` gives an error ten seconds, which is right — a
 * message that has to be acted on needs time to be read. But `addToast` has ~98
 * call sites and several of them are LOOPS (`saveAllDirty` toasts once per
 * failed document; the aeon loader used to toast once per unreadable section
 * file, sixty-three of them on a corrupt 3x3 act). Ten seconds each, stacked
 * without limit, is a wall that covers the editor — and the pressure that makes
 * someone turn the error channel off, which is a far worse outcome than any
 * single unread error.
 *
 * COALESCING AT THE PRODUCER IS THE OTHER HALF AND DOES NOT REPLACE THIS ONE.
 * `core/project/notice.ts` folds the loader's repeated same-kind failures into
 * one notice, which is the right fix for the case that has a producer to fix.
 * This cap is for the cases that do not: a save-all over many dirty documents,
 * a user holding down an action that fails, two floods from unrelated sources
 * arriving together. Coalescing bounds ONE producer; the cap bounds the screen.
 *
 * FOUR, because the stack sits above the editor's bottom edge and four rows of
 * wrapped error text is about as much as can be read before the first one
 * expires. Nothing derives from the number — it is a taste call — so anything
 * asserting against it must import THIS constant rather than spell 4.
 */
export const MAX_VISIBLE_TOASTS = 4;

/** What `toastStack` decided to paint, and an honest account of what it did not. */
export interface ToastStack {
  /** Painted, in arrival order (oldest first, newest nearest the reader). */
  visible: Toast[];
  /** Not painted. NOT dropped — counted below, and one click away. */
  hidden: Toast[];
  hiddenCount: number;
  /** How many of the hidden ones are errors. Broken out because that is the
   *  number a reader actually needs: "+59 more" and "+59 more (59 errors)" ask
   *  for very different reactions. */
  hiddenErrorCount: number;
}

/**
 * Split the live toasts into what gets painted and what gets counted.
 *
 * THE INVERSION THIS EXISTS TO AVOID: a cap that silently swallows errors is
 * strictly worse than a wall of them. Two rules keep it honest.
 *
 *   1. ERRORS ARE NEVER HIDDEN BEHIND A NON-ERROR. The visible set is the newest
 *      `max`, EXCEPT that errors are chosen first (newest first) and successes
 *      only fill what is left. So four "Saved 1 level(s)" arriving after a
 *      failure cannot push the failure off screen — which is precisely the
 *      sequence a save-all produces.
 *   2. WHAT IS NOT PAINTED IS COUNTED, from the array itself. `hiddenCount` is
 *      `hidden.length`; there is no path on which an unmeasured overflow renders
 *      as zero. `expanded` (the user clicked the overflow row) returns
 *      everything with a hidden count of zero, which is true rather than
 *      convenient.
 *
 * The chosen set is returned in ARRIVAL order, not selection order, so promoting
 * an error does not make the surviving toasts jump around under the reader's
 * eye.
 *
 * Pure, and deliberately not a store method: ToastContainer is `.tsx` and never
 * executes in the node suite, so the decision has to live somewhere the suite
 * can actually run.
 */
export function toastStack(
  toasts: readonly Toast[],
  expanded = false,
  max: number = MAX_VISIBLE_TOASTS,
): ToastStack {
  // A cap of zero would hide everything with nothing to click — the silent-drop
  // pathology this whole function exists to prevent. One is the floor.
  const cap = Math.max(1, Math.floor(max));
  if (expanded || toasts.length <= cap) {
    return { visible: [...toasts], hidden: [], hiddenCount: 0, hiddenErrorCount: 0 };
  }
  const chosen = new Set<number>();
  for (let i = toasts.length - 1; i >= 0 && chosen.size < cap; i--) {
    if (toasts[i].type === 'error') chosen.add(toasts[i].id);
  }
  for (let i = toasts.length - 1; i >= 0 && chosen.size < cap; i--) {
    if (toasts[i].type !== 'error') chosen.add(toasts[i].id);
  }
  const visible = toasts.filter((t) => chosen.has(t.id));
  const hidden = toasts.filter((t) => !chosen.has(t.id));
  return {
    visible,
    hidden,
    hiddenCount: hidden.length,
    hiddenErrorCount: hidden.filter((t) => t.type === 'error').length,
  };
}

/**
 * The overflow row's text, or null when there is no overflow.
 *
 * Says the error count out loud when there is one. Never says "0 errors" — an
 * overflow of pure acknowledgements is not something to alarm anyone about, and
 * a zero printed next to the word "error" reads as a reassurance the function
 * has not earned.
 */
export function overflowLabel(stack: ToastStack): string | null {
  if (stack.hiddenCount === 0) return null;
  const e = stack.hiddenErrorCount;
  const errors = e > 0 ? ` (${e} error${e === 1 ? '' : 's'})` : '';
  return `+${stack.hiddenCount} more${errors} — click to show all`;
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
    // Every error also goes to the console, verbatim. A toast is transient by
    // construction — it expires, it can be dismissed, and MAX_VISIBLE_TOASTS can
    // put it behind an overflow row — so the channel that has to be ACTED on
    // needs one place where the full text survives all three. Errors only:
    // mirroring acknowledgements would bury the failures in the log the same way
    // an uncapped stack buries them on screen.
    if (type === 'error') console.error(`[toast] ${message}`);
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
