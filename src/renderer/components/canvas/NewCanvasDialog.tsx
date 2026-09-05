// The New Canvas dialog: name, size, constraint profile — the four values
// `createCanvasDocument` needs, and nothing else.
//
// EVERY RULE IT ENFORCES LIVES IN shell/new-canvas.ts, not here. The node suite
// renders no React, so a rule written inside this component is a rule no test
// can reach; this file collects values, renders the refusal
// `newCanvasFieldErrors` hands back, and calls the flow. What it decides for
// itself is presentation: WHEN to show a refusal (see `touched`) and WHICH one
// when more than one field is wrong (see `shown`).
//
// THREE THINGS THE FIRST VERSION GOT WRONG, all found the first time it was
// rendered (Task 14, under CDP) and all invisible to a node suite:
//
//   • No focus trap — Tab walked out of the modal into the app behind it. The
//     arithmetic now lives in ui/focus-trap.ts, where it can be tested.
//   • An emptied number field showed a literal `0`, because `Number('')` is 0.
//     The sizes are held as TEXT and parsed with `parseCanvasSide`, so an empty
//     field looks empty and reads as NaN — refused with the bounds message,
//     which is the true statement about it.
//   • Enter did not submit from the number fields, because only the name input
//     had a handler. The controls are a real <form> now, so Enter submits from
//     any of them, once, natively.
//
// THE BACKDROP NO LONGER DISMISSES. It used to answer like ConfirmDialog's,
// which is right there — that dialog holds nothing but a question. This one
// holds typed input, and a click a few pixels outside it threw the name and
// sizes away silently. Esc and Cancel are both explicit and both discoverable
// (one is a visible button, the other is the universal modal reflex), so the
// cost of dropping the third way out is one extra click in the "opened it by
// accident" case. A confirm-on-backdrop was the other option and is too much
// ceremony for a form that costs seconds to refill.
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T, Z } from '../ui';
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../ui/focus-trap';
import { useModalPresence } from '../../state/modalStore';
import {
  createCanvasDocument, newCanvasFieldErrors, parseCanvasSide, NEW_CANVAS_DEFAULTS, commitReachNote,
  type NewCanvasField,
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
  // TEXT, not numbers: `Number('')` is 0, so a cleared field used to show a
  // literal 0 the user never typed. See parseCanvasSide.
  const [widthText, setWidthText] = useState(String(NEW_CANVAS_DEFAULTS.width));
  const [heightText, setHeightText] = useState(String(NEW_CANVAS_DEFAULTS.height));
  const [profileId, setProfileId] = useState<ConstraintProfileId>(NEW_CANVAS_DEFAULTS.profileId);
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Nothing is red until the user has typed or tried: an empty form that opens
  // already complaining reads as an error the user caused.
  const [touched, setTouched] = useState(false);
  // WHICH field the user last edited, so the message on screen describes what
  // they just did. Without it the display followed the create-time priority
  // (name first), and clearing the width field showed a complaint about the
  // name — a message that does not match what is on screen or what just changed.
  const [lastField, setLastField] = useState<NewCanvasField | null>(null);
  const [failure, setFailure] = useState<{ field: NewCanvasField | null; reason: string } | null>(null);
  const panelRef = useRef<HTMLFormElement>(null);

  useModalPresence('new-canvas', open);

  useEffect(() => {
    if (!open) return;
    setName('');
    setWidthText(String(NEW_CANVAS_DEFAULTS.width));
    setHeightText(String(NEW_CANVAS_DEFAULTS.height));
    setProfileId(NEW_CANVAS_DEFAULTS.profileId);
    setTouched(false); setFailure(null); setBusy(false); setLastField(null);
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

  const reachNote = commitReachNote(parseCanvasSide(widthText) ?? NaN, parseCanvasSide(heightText) ?? NaN);
  const width = parseCanvasSide(widthText);
  const height = parseCanvasSide(heightText);
  const errors = newCanvasFieldErrors({ name, width, height, profileId }, existing);
  const valid = Object.keys(errors).length === 0;

  // WHICH refusal is on screen, in priority order:
  //   1. the create flow's own (a stale listing, a failed write) — the newest
  //      fact about the same question;
  //   2. the field the user last touched, so the message matches what they just
  //      did — this is the fix for "cleared the width, was told about the name";
  //   3. otherwise the first bad field in reading order.
  const liveField = (lastField && errors[lastField] ? lastField : null)
    ?? (['name', 'width', 'height'] as NewCanvasField[]).find((f) => errors[f]) ?? null;
  const shown = failure
    ?? (touched && liveField ? { field: liveField, reason: errors[liveField]! } : null);

  const submit = useCallback(async () => {
    setTouched(true);
    setFailure(null);
    const w = parseCanvasSide(widthText);
    const h = parseCanvasSide(heightText);
    if (Object.keys(newCanvasFieldErrors({ name, width: w, height: h, profileId }, existing)).length > 0) return;
    setBusy(true);
    const result = await createCanvasDocument({ name: name.trim(), width: w, height: h, profileId });
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
  }, [name, widthText, heightText, profileId, existing, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  // EVERY bad field is marked, not only the one being explained: with one
  // message and three fields, marking just the explained one leaves the others
  // looking fine until the user fixes this one and is refused again.
  const fieldStyle = (field: NewCanvasField): React.CSSProperties => ({
    ...styles.input,
    ...(touched && (errors[field] || failure?.field === field) ? styles.inputBad : {}),
  });

  const edited = (field: NewCanvasField) => { setTouched(true); setLastField(field); setFailure(null); };

  /**
   * Tab must not leave the modal. The element list is read LIVE on each press
   * because it changes as you type — Create is disabled while the form is
   * invalid, and a disabled button is not focusable, so a list captured on open
   * would send focus to an element the browser refuses and drop it on <body>,
   * outside the dialog.
   */
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const next = nextTrapIndex(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  };

  return (
    <div style={styles.backdrop}>
      {/* A <form>, so Enter submits from ANY control — the number fields used to
          swallow it because only the name input had a key handler. onSubmit
          preventDefault keeps Electron from attempting a navigation. */}
      <form
        ref={panelRef}
        style={styles.panel}
        role="dialog"
        aria-label="New Canvas"
        onKeyDown={trapTab}
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
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
            onChange={(e) => { setName(e.target.value); edited('name'); }}
            style={fieldStyle('name')}
          />
        </label>

        <div style={styles.row}>
          <span style={styles.label}>Size</span>
          <span style={styles.sizeRow}>
            <input
              type="number" value={widthText} min={CANVAS_MIN_SIDE} max={CANVAS_MAX_SIDE}
              onChange={(e) => { setWidthText(e.target.value); edited('width'); }}
              style={{ ...fieldStyle('width'), width: 72 }}
            />
            <span style={styles.times}>×</span>
            <input
              type="number" value={heightText} min={CANVAS_MIN_SIDE} max={CANVAS_MAX_SIDE}
              onChange={(e) => { setHeightText(e.target.value); edited('height'); }}
              style={{ ...fieldStyle('height'), width: 72 }}
            />
            <span style={styles.times}>px</span>
          </span>
        </div>
        {/* UX-A1: the consequence of a sub-chunk size shows up much later, in a
            commit panel that says "nothing to commit yet" without connecting it
            to the number typed here. Said at the moment of the choice instead,
            and as information rather than a refusal — a small canvas is a fine
            place to draw something you will paste. */}
        {reachNote && <div style={styles.hint}>{reachNote}</div>}

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
          check will report. Nothing is prevented while you draw.
        </div>

        {shown && <div style={styles.error}>{shown.reason}</div>}

        <div style={styles.buttons}>
          {/* type="button" or it submits the form too. */}
          <button type="button" onClick={onClose} style={styles.button}>Cancel</button>
          <button
            type="submit"
            disabled={busy || !valid}
            style={{ ...styles.button, ...styles.primary, ...(busy || !valid ? styles.buttonOff : {}) }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.6)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal,
  },
  panel: {
    width: 460, maxWidth: '90vw', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rXl, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: 16,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  title: { fontSize: T.tBase, fontWeight: T.wSemibold, color: T.textHi },
  hint: { fontSize: T.tXs, color: T.textLo, lineHeight: 1.5 },
  code: { fontFamily: T.fontMono, color: T.textBase },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  label: { width: 60, flexShrink: 0, fontSize: T.tSm, color: T.textLo },
  sizeRow: { display: 'flex', alignItems: 'center', gap: 6 },
  times: { fontSize: T.tSm, color: T.textLo },
  input: {
    flex: 1, minWidth: 0, background: T.raised, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd,
    fontSize: T.tSm, fontFamily: T.fontUi, padding: '5px 8px',
  },
  inputBad: { borderColor: T.error },
  error: {
    fontSize: T.tXs, lineHeight: 1.5, color: T.error,
    background: 'rgba(0,0,0,0.25)', borderRadius: T.rMd, padding: '6px 8px',
  },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  button: {
    padding: '4px 12px', fontSize: T.tSm, background: T.raised, color: T.textBase,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rMd, cursor: 'pointer',
  },
  primary: { background: T.accent, borderColor: T.accent, color: T.onAccent, fontWeight: T.wSemibold },
  buttonOff: { opacity: 0.5, cursor: 'default' },
};
