import React, { useEffect, useRef } from 'react';
import { T, Z } from '../components/ui';
import { safeFocusIndex } from '../components/ui/safe-focus';
import { useConfirmStore } from '../state/confirmStore';
import { useModalPresence } from '../state/modalStore';

/**
 * Modal for confirmStore requests. Esc / backdrop click answer 'cancel'.
 *
 * ⚠ IT FOCUSES CANCEL ON OPEN, AND MUST NEVER FOCUS A DESTRUCTIVE BUTTON.
 * Card `d-31-confirm-dialog-focuses-nothing`, ruled `focus_cancel_and_guard`.
 * Adding `autoFocus` to the danger button here — four characters, the textbook
 * accessibility fix, and the obvious next edit — was MEASURED to make a bare
 * Space silently destroy a sprite and reset the dirty flag, so nothing
 * downstream ever asked about the loss (plant P3,
 * `docs/reviews/2026-09-04-d27-sprite-rows-meet-dialog.md` §4). The choice of
 * button is `components/ui/safe-focus.ts`, where it can be tested; read its
 * header before changing anything below.
 *
 * ACCEPTED COST, so it does not read as a regression: Enter or Space
 * immediately after this opens now CANCELS, where before it did nothing at all.
 * A fast double-press that used to be harmless now dismisses the dialog. That
 * is the ruling's chosen trade — the worst a stray keypress can do here is
 * close a dialog.
 */
export default function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Declares itself to the modal registry while it is on screen, so anything
  // that must behave differently under a modal (the command palette) can ask.
  useModalPresence('confirm', request !== null);

  /**
   * Put focus on the safe button when a request opens.
   *
   * Keyed on `request`, so it fires once per request rather than on every
   * render: re-grabbing focus on each render would fight a user who has tabbed
   * to another button, which is its own way of steering a keypress somewhere
   * the author did not aim it.
   *
   * The button is found BY KEY, not by index into the DOM list — the render
   * below is 1:1 and in order today, and a lookup that quietly depends on that
   * is a lookup that starts focusing the wrong button the day someone adds a
   * separator or reorders the row.
   */
  useEffect(() => {
    if (!request) return;
    const panel = panelRef.current;
    if (!panel) return;
    const i = safeFocusIndex(request.buttons);
    if (i === null) return; // every option destroys something: focus nothing.
    const target = Array.from(panel.querySelectorAll<HTMLButtonElement>('button[data-confirm-key]'))
      .find((el) => el.dataset.confirmKey === request.buttons[i].key);
    // ⚠ LAST LINE OF DEFENCE, and it is deliberately redundant with
    // safeFocusIndex. The invariant this component must never break is "the
    // focused element is not a destructive button", so it is restated here at
    // the one place a .focus() actually happens. If a future edit to
    // safe-focus.ts starts returning a danger index, this refuses rather than
    // arming Space with it. The pure test is what pins the function; this is
    // what makes the DOM call safe on its own terms.
    if (!target || target.dataset.tone === 'danger') return;
    target.focus();
  }, [request]);

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
      <div ref={panelRef} style={styles.panel} onMouseDown={(e) => e.stopPropagation()} role="alertdialog" aria-label={request.title}>
        <div style={styles.title}>{request.title}</div>
        {request.body && <div style={styles.body}>{request.body}</div>}
        <div style={styles.buttons}>
          {request.buttons.map((b) => (
            <button
              key={b.key}
              // Both attributes exist so that the focus effect above and the
              // d-31 guard can ask the DOM which button is which WITHOUT
              // matching a label string. `tone` is the component's own notion of
              // destructive; a guard keyed on "Discard & close" stops covering
              // the site the day it is reworded, and says nothing while it does.
              data-confirm-key={b.key}
              data-tone={b.tone ?? 'neutral'}
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
