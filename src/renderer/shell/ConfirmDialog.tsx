import React, { useEffect } from 'react';
import { T, Z } from '../components/ui';
import { useConfirmStore } from '../state/confirmStore';
import { useModalPresence } from '../state/modalStore';

/** Modal for confirmStore requests. Esc / backdrop click answer 'cancel'. */
export default function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);
  // Declares itself to the modal registry while it is on screen, so anything
  // that must behave differently under a modal (the command palette) can ask.
  useModalPresence('confirm', request !== null);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); answer('cancel'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request, answer]);

  if (!request) return null;

  return (
    <div style={styles.backdrop} onMouseDown={() => answer('cancel')}>
      <div style={styles.panel} onMouseDown={(e) => e.stopPropagation()} role="alertdialog" aria-label={request.title}>
        <div style={styles.title}>{request.title}</div>
        {request.body && <div style={styles.body}>{request.body}</div>}
        <div style={styles.buttons}>
          {request.buttons.map((b) => (
            <button
              key={b.key}
              onClick={() => answer(b.key)}
              style={{
                ...styles.button,
                ...(b.tone === 'primary' ? styles.primary : {}),
                ...(b.tone === 'danger' ? styles.danger : {}),
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.6)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal,
  },
  panel: {
    width: 420, maxWidth: '90vw', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rXl, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: 16,
  },
  title: { fontSize: T.tBase, fontWeight: T.wSemibold, color: T.textHi },
  body: { fontSize: T.tSm, color: T.textBase, marginTop: 8, whiteSpace: 'pre-line' },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  button: {
    padding: '4px 12px', fontSize: T.tSm, background: T.raised, color: T.textBase,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rMd, cursor: 'pointer',
  },
  primary: { background: T.accent, borderColor: T.accent, color: T.onAccent, fontWeight: T.wSemibold },
  danger: { color: T.warning, borderColor: T.warning },
};
