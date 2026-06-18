import React from 'react';
import { useToastStore, type ToastType } from '../state/toastStore';

const TYPE_COLORS: Record<ToastType, { bg: string; border: string }> = {
  success: { bg: '#1e3a2f', border: '#a6e3a1' },
  info: { bg: '#1e2a3a', border: '#34D399' },
  error: { bg: '#3a1e2a', border: '#f38ba8' },
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
    color: '#E8EAF2', border: '1px solid', whiteSpace: 'nowrap' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
};
