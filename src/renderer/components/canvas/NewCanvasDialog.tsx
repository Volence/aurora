// The New Canvas dialog: name, size, constraint profile — the four values
// `createCanvasDocument` needs, and nothing else.
//
// EVERY RULE IT ENFORCES LIVES IN shell/new-canvas.ts, not here. The node suite
// renders no React, so a rule written inside this component is a rule no test
// can reach; this file collects values, renders the refusal `validateNewCanvas`
// hands back, and calls the flow. The one thing it decides for itself is WHEN to
// show a refusal (see `touched` below), which is a presentation question.
//
// The refusal is shown INLINE and the Create button is disabled with it on
// screen, rather than the button silently doing nothing: a name that fails
// `canvasNameIsSafe` is the common first attempt (people type "sky tiles"), and
// a dead button is the one response that teaches nothing.
//
// It re-lists the project's canvases when it opens, so the collision check has
// something to check against before the user commits. That listing is a HINT,
// not the guard — `createCanvasDocument` re-lists at create time and the
// guarded write refuses an existing file outright (see new-canvas.ts's header).

import React, { useCallback, useEffect, useState } from 'react';
import { T } from '../ui';
import {
  createCanvasDocument, validateNewCanvas, NEW_CANVAS_DEFAULTS, type NewCanvasField,
} from '../../shell/new-canvas';
import { listCanvasNames } from '../../state/canvas-file';
import { openProjectDir } from '../../state/open-project';
import { useToastStore } from '../../state/toastStore';
import { CANVAS_MIN_SIDE, CANVAS_MAX_SIDE } from '../../../core/art/canvas-doc';
import {
  CONSTRAINT_PROFILE_IDS, constraintProfile, type ConstraintProfileId,
} from '../../../core/art/canvas-profiles';

export default function NewCanvasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The two values contract 2 names by number live in new-canvas.ts, with the
  // rest of the rules, and are asserted valid there. As constants in this file
  // they were the only rules the suite could not reach.
  const [name, setName] = useState('');
  const [width, setWidth] = useState(NEW_CANVAS_DEFAULTS.width);
  const [height, setHeight] = useState(NEW_CANVAS_DEFAULTS.height);
  const [profileId, setProfileId] = useState<ConstraintProfileId>(NEW_CANVAS_DEFAULTS.profileId);
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Nothing is red until the user has typed or tried: an empty form that opens
  // already complaining reads as an error the user caused.
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<{ field: NewCanvasField | null; reason: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setWidth(NEW_CANVAS_DEFAULTS.width);
    setHeight(NEW_CANVAS_DEFAULTS.height);
    setProfileId(NEW_CANVAS_DEFAULTS.profileId);
    setTouched(false); setFailure(null); setBusy(false);
    const dir = openProjectDir();
    if (dir === null) { setExisting([]); return; }
    let live = true;
    listCanvasNames(dir)
      .then((l) => { if (live) setExisting(l.names); })
      // A listing this dialog could not read is not worth a toast: the create
      // itself re-lists and reports properly, and the write guard refuses an
      // overwrite regardless. Losing the LIVE hint is the whole cost.
      .catch(() => { if (live) setExisting([]); });
    return () => { live = false; };
  }, [open]);

  const validation = validateNewCanvas({ name, width, height, profileId }, existing);
  // The create flow's own refusal (a stale listing, a write that failed) outranks
  // the live check — it is the newer fact about the same question.
  const shown = failure ?? (touched && !validation.ok ? { field: validation.field, reason: validation.reason } : null);

  const submit = useCallback(async () => {
    setTouched(true);
    setFailure(null);
    const v = validateNewCanvas({ name, width, height, profileId }, existing);
    if (!v.ok) return;
    setBusy(true);
    const result = await createCanvasDocument({ name: name.trim(), width, height, profileId });
    setBusy(false);
    if (!result.ok) {
      setFailure({ field: result.field, reason: result.reason });
      // Also toasted: a write failure names a path and an fs error, which is
      // longer than the strip of space under a text field and worth keeping
      // after the dialog closes.
      if (result.field === null) useToastStore.getState().addToast(result.reason, 'error');
      return;
    }
    onClose();
  }, [name, width, height, profileId, existing, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const fieldStyle = (field: NewCanvasField): React.CSSProperties => ({
    ...styles.input,
    ...(shown?.field === field ? styles.inputBad : {}),
  });

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.panel} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="New Canvas">
        <div style={styles.title}>New Canvas</div>
        <div style={styles.hint}>
          A free-size drawing surface with its own 64 colours, saved under
          {' '}<code style={styles.code}>.aurora/canvas/</code> in this project.
        </div>

        <label style={styles.row}>
          <span style={styles.label}>Name</span>
          <input
            autoFocus
            value={name}
            spellCheck={false}
            placeholder="green-hill-cliffs"
            onChange={(e) => { setName(e.target.value); setTouched(true); setFailure(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            style={fieldStyle('name')}
          />
        </label>

        <div style={styles.row}>
          <span style={styles.label}>Size</span>
          <span style={styles.sizeRow}>
            <input
              type="number" value={width} min={CANVAS_MIN_SIDE} max={CANVAS_MAX_SIDE}
              onChange={(e) => { setWidth(Number(e.target.value)); setTouched(true); setFailure(null); }}
              style={{ ...fieldStyle('width'), width: 72 }}
            />
            <span style={styles.times}>×</span>
            <input
              type="number" value={height} min={CANVAS_MIN_SIDE} max={CANVAS_MAX_SIDE}
              onChange={(e) => { setHeight(Number(e.target.value)); setTouched(true); setFailure(null); }}
              style={{ ...fieldStyle('height'), width: 72 }}
            />
            <span style={styles.times}>px</span>
          </span>
        </div>

        <label style={styles.row}>
          <span style={styles.label}>Profile</span>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value as ConstraintProfileId)}
            style={styles.input}
          >
            {CONSTRAINT_PROFILE_IDS.map((id) => (
              <option key={id} value={id}>{constraintProfile(id).label}</option>
            ))}
          </select>
        </label>
        <div style={styles.hint}>
          The profile chooses which grids are offered and which rules a later
          check will report — nothing is prevented while you draw.
        </div>

        {shown && <div style={styles.error}>{shown.reason}</div>}

        <div style={styles.buttons}>
          <button onClick={onClose} style={styles.button}>Cancel</button>
          <button
            onClick={() => { void submit(); }}
            disabled={busy || !validation.ok}
            style={{ ...styles.button, ...styles.primary, ...(busy || !validation.ok ? styles.buttonOff : {}) }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.6)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  },
  panel: {
    width: 460, maxWidth: '90vw', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rXl, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  title: { fontSize: 13, fontWeight: 600, color: T.textHi },
  hint: { fontSize: 11, color: T.textLo, lineHeight: 1.5 },
  code: { fontFamily: T.fontMono, color: T.textBase },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  label: { width: 60, flexShrink: 0, fontSize: 12, color: T.textLo },
  sizeRow: { display: 'flex', alignItems: 'center', gap: 6 },
  times: { fontSize: 12, color: T.textLo },
  input: {
    flex: 1, minWidth: 0, background: T.raised, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd,
    fontSize: 12, fontFamily: T.fontUi, padding: '5px 8px', outline: 'none',
  },
  inputBad: { borderColor: T.error },
  error: {
    fontSize: 11, lineHeight: 1.5, color: T.error,
    background: 'rgba(0,0,0,0.25)', borderRadius: T.rMd, padding: '6px 8px',
  },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  button: {
    padding: '4px 12px', fontSize: 12, background: T.raised, color: T.textBase,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rMd, cursor: 'pointer',
  },
  primary: { background: T.accent, borderColor: T.accent, color: T.onAccent, fontWeight: 600 },
  buttonOff: { opacity: 0.5, cursor: 'default' },
};
