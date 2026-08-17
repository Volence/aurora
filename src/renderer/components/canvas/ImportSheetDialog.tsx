import React, { useEffect, useRef, useState } from 'react';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { loadSheetForAct, type LoadedSheet } from '../../state/import-sheet';
import CommitPlanView from './CommitPlanView';
import { Chip, T, Z } from '../ui';
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../ui/focus-trap';
import { useModalPresence } from '../../state/modalStore';

/**
 * Import an art sheet made elsewhere and commit it into the open act.
 *
 * The dominant art-entry path in the field (research §5: SonLVL imports at every
 * tier, SonED2 takes a layout-sized image, and the documented S1 workflow is
 * build-a-sheet-externally-then-import). Aurora had a gutted stub for this and
 * nothing behind it.
 *
 * NO SIZE LIMIT, unlike opening a canvas — see import-sheet.ts. Everything after
 * the load is the same `CommitPlanView` the canvas uses, so targets, the report,
 * refusals and undo behave identically whichever way the pixels arrived.
 */
export default function ImportSheetDialog({ onClose }: { onClose: () => void }) {
  const levelDoc = useClassicLevelStore((s) => s.doc);
  const ref = useClassicLevelStore((s) => s.ref);
  const [sheet, setSheet] = useState<LoadedSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // THE ONE MODAL THAT WAS NOT ONE. This dialog had no Escape, no role, no
  // focus trap, and a backdrop click that threw away a loaded sheet and its
  // whole commit plan without asking — while its sibling New Canvas dialog had
  // all four. Same shape as that one now, for the same reason: a modal the
  // keyboard cannot reach or leave is a trap, and the two dialogs sitting side
  // by side should not behave differently.
  useModalPresence('import-sheet', true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const next = nextTrapIndex(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  };

  const pick = async () => {
    if (!levelDoc) return;
    setBusy(true);
    setError(null);
    try {
      const r = await loadSheetForAct(levelDoc);
      if ('cancelled' in r) return;
      if (!r.ok) { setError(r.error); setSheet(null); return; }
      setSheet(r.sheet);
    } finally {
      setBusy(false);
    }
  };

  return (
    // NO BACKDROP DISMISS. A stray click outside used to discard a loaded sheet
    // and the commit plan built from it — minutes of work, no confirmation, no
    // undo. The × and Escape are the two deliberate ways out, and both are
    // right there.
    <div style={styles.overlay}>
      <div
        ref={panelRef}
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Import art sheet"
        onKeyDown={trapTab}
      >
        <div style={styles.header}>
          <span style={styles.title}>Import art sheet</span>
          <button onClick={onClose} style={styles.closeBtn} title="Close">×</button>
        </div>

        <div style={styles.body}>
          {!levelDoc || !ref ? (
            <div style={styles.note}>Open a level act first — a sheet is imported into one.</div>
          ) : (
            <>
              <div style={styles.note}>
                An indexed PNG, in colours the act already has. Each 8×8 cell must draw
                from one palette line; the importer works out which.
              </div>
              <div style={styles.actions}>
                <Chip onClick={pick} disabled={busy}
                      title="Choose an indexed PNG to import into this act">
                  {busy ? 'Reading…' : sheet ? 'Choose a different sheet…' : 'Choose a PNG…'}
                </Chip>
              </div>

              {error && <div style={styles.error}>{error}</div>}

              {sheet && (
                <>
                  <div style={styles.meta}>
                    {sheet.path.split(/[\\/]/).pop()} · {sheet.pixels.width}×{sheet.pixels.height}px
                    {' · '}line{sheet.usedLines.length === 1 ? '' : 's'} {sheet.usedLines.join(', ')}
                    {sheet.snappedColours > 0
                      && ` · ${sheet.snappedColours} colour${sheet.snappedColours === 1 ? '' : 's'} snapped to the Genesis palette`}
                  </div>
                  <CommitPlanView
                    pixels={sheet.pixels}
                    palette={sheet.palette}
                    onApplied={() => setSheet(null)}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal,
  },
  dialog: {
    background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: 8,
    width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', borderBottom: `1px solid ${T.border}`,
  },
  title: { fontSize: T.tMd, fontWeight: T.wSemibold, color: T.textHi },
  closeBtn: {
    background: 'transparent', border: 'none', color: T.textLo,
    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
  },
  body: { padding: '12px 14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  note: { fontSize: T.tXs, color: T.textLo, lineHeight: 1.5 },
  meta: { fontSize: T.tXs, color: T.textBase, lineHeight: 1.5 },
  error: { fontSize: T.tXs, color: T.error, lineHeight: 1.5 },
  actions: { display: 'flex' },
};
