import React from 'react';
import {
  useToastStore, toastStack, overflowLabel, MAX_VISIBLE_TOASTS, type ToastType,
} from '../state/toastStore';
import { T, Z } from './ui';

// Backgrounds map to the nearest semantic surface token (T.raised) — the
// Empyrean palette has no per-status tinted backgrounds; the colored border
// carries the success/info/warning/error distinction.
const TYPE_COLORS: Record<ToastType, { bg: string; border: string }> = {
  success: { bg: T.raised, border: T.success },
  info: { bg: T.raised, border: T.info },
  // `T.warning`, not `T.error`: the collision panel's persistent loop warning
  // already uses that token for exactly this hazard, and painting a warning red
  // would say something failed when the write in fact landed.
  warning: { bg: T.raised, border: T.warning },
  error: { bg: T.raised, border: T.error },
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);
  const [expanded, setExpanded] = React.useState(false);
  // The expansion only MEANS anything while there is something hidden. Deriving
  // it rather than resetting the flag in an effect is what keeps a stack that
  // drained on its own from leaving the strip pointer-grabbing (see `list`
  // below) with no visible row to click.
  const expandable = toasts.length > MAX_VISIBLE_TOASTS;
  const open = expanded && expandable;
  const stack = toastStack(toasts, open);
  const overflow = overflowLabel(stack);
  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.list, ...(open ? styles.listOpen : null) }}>
      {/* The overflow row sits ABOVE the toasts, so revealing or hiding it moves
          the far edge of the stack and never the toast the reader is mid-way
          through. It states the honest count from `toastStack` — including how
          many of the hidden are errors — and clicking it shows every one. */}
      {overflow && (
        <div
          onClick={() => setExpanded(true)}
          title="Show all"
          style={{
            ...styles.toast, ...styles.overflow,
            borderColor: stack.hiddenErrorCount > 0 ? T.error : T.info,
          }}
        >
          {overflow}
        </div>
      )}
      {open && (
        <div
          onClick={() => setExpanded(false)}
          title="Collapse"
          style={{ ...styles.toast, ...styles.overflow, ...styles.sticky, borderColor: T.info }}
        >
          {`Showing all ${toasts.length}. Click to collapse`}
        </div>
      )}
      {stack.visible.map((toast) => {
        const colors = TYPE_COLORS[toast.type];
        return (
          <div
            key={toast.id}
            // Click to dismiss. See `pointerEvents` below for why this is safe.
            onClick={() => dismiss(toast.id)}
            title="Dismiss"
            style={{
              ...styles.toast,
              background: colors.bg,
              borderColor: colors.border,
              animation: toast.exiting ? 'toast-out 0.3s ease-in forwards' : 'toast-in 0.2s ease-out',
            }}
          >
            {toast.message}
          </div>
        );
      })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
    // Bounded so a long message WRAPS instead of running off both edges. The
    // container had no maxWidth and its toast had `whiteSpace: nowrap`, which is
    // invisible while every message is short: the longest string in the codebase
    // was ~50 chars. A 300-char message then rendered as one ~2000px line,
    // centred, clipped symmetrically — losing the START and the END, which for
    // an error is the subject and the instruction. `alignItems: center` keeps a
    // short toast shrink-wrapped to its own text as before, so this changes
    // nothing about the common case.
    maxWidth: 'min(560px, 90vw)', alignItems: 'center',
    display: 'flex', flexDirection: 'column', gap: 6, zIndex: Z.toast,
    // The STRIP stays click-through so it can never swallow a click aimed at the
    // editor underneath; only the toast rectangle itself takes pointer events
    // (see `toast` below). That is the narrowest surface that still allows
    // click-to-dismiss, and dismissing is the only thing a click there does —
    // there is no destructive action to swallow. Without it a long error is
    // unreadable-then-unclosable, which is the worse trade.
    pointerEvents: 'none',
  },
  // The stacking column, split out of `container` so the EXPANDED state has
  // something to scroll that is not also the fixed-position anchor.
  list: {
    display: 'flex', flexDirection: 'column', gap: 6,
    alignItems: 'center', maxWidth: '100%', pointerEvents: 'none',
  },
  listOpen: {
    // Expanding sixty toasts must not push the stack off the top of the screen,
    // so the open list scrolls. Scrolling needs the pointer, which is the one
    // moment this strip is not click-through — deliberately, because it is a
    // state the user asked for by clicking, and the collapse row one row up
    // undoes it.
    maxHeight: '70vh', overflowY: 'auto', pointerEvents: 'auto',
  },
  // The overflow / collapse rows. Same rectangle as a toast, dimmer text: it is
  // a control, not a message, and must not read as a fifth error.
  overflow: {
    background: T.raised, color: T.textLo, fontWeight: T.wMedium,
    animation: 'toast-in 0.2s ease-out',
  },
  // The way OUT of the expanded state must not be the one row that scrolls off.
  // Sixty toasts is more than a screenful by construction — that is why the list
  // scrolls at all — so a collapse row sitting at the top of the scrolled
  // content is a way out only for someone who has not scrolled yet.
  sticky: { position: 'sticky', top: 0, zIndex: 1 },
  toast: {
    padding: '6px 16px', borderRadius: 6, fontSize: T.tSm, fontWeight: T.wMedium,
    color: T.textHi, borderWidth: 1, borderStyle: 'solid',
    // No `whiteSpace: nowrap` — that is what made a long message unreadable.
    // `overflowWrap: anywhere` because the messages that get long are the ones
    // naming a FILE PATH, and a path has no reliable break opportunity.
    overflowWrap: 'anywhere', textAlign: 'left', maxWidth: '100%',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    pointerEvents: 'auto', cursor: 'pointer',
  },
};
