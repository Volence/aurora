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
  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((toast) => {
        const colors = TYPE_COLORS[toast.type];
        return (
          <div
            key={toast.id}
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
    display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1000,
    pointerEvents: 'none',
  },
  toast: {
    padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    color: T.textHi, border: '1px solid', whiteSpace: 'nowrap' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
};
