import React from 'react';
import { useToastStore, type ToastType } from '../state/toastStore';
import { T } from './ui';

// Backgrounds map to the nearest semantic surface token (T.raised) — the
// Empyrean palette has no per-status tinted backgrounds; the colored border
// carries the success/info/error distinction.
const TYPE_COLORS: Record<ToastType, { bg: string; border: string }> = {
  success: { bg: T.raised, border: T.success },
  info: { bg: T.raised, border: T.info },
  error: { bg: T.raised, border: T.error },
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((toast) => {
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
    display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1000,
    // The STRIP stays click-through so it can never swallow a click aimed at the
    // editor underneath; only the toast rectangle itself takes pointer events
    // (see `toast` below). That is the narrowest surface that still allows
    // click-to-dismiss, and dismissing is the only thing a click there does —
    // there is no destructive action to swallow. Without it a long error is
    // unreadable-then-unclosable, which is the worse trade.
    pointerEvents: 'none',
  },
  toast: {
    padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    color: T.textHi, borderWidth: 1, borderStyle: 'solid',
    // No `whiteSpace: nowrap` — that is what made a long message unreadable.
    // `overflowWrap: anywhere` because the messages that get long are the ones
    // naming a FILE PATH, and a path has no reliable break opportunity.
    overflowWrap: 'anywhere', textAlign: 'left', maxWidth: '100%',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    pointerEvents: 'auto', cursor: 'pointer',
  },
};
