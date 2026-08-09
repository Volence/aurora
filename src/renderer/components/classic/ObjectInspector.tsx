import React from 'react';
import { T, Select, NumberField } from '../ui';
import { useClassicLevelStore, classicSetObjects } from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import { S1_OBJECT_LIST, s1ObjectName, s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import { editObjectArt } from '../sprite/export-sprite';
import { clampInt } from './viewport-math';
import type { S1ObjectEntry } from '../../../core/formats/classic/s1-objpos';

const MAX_OBJ_X = 0xffff;
const MAX_OBJ_Y = 0x0fff;
const MAX_ID = 0x7f;

/** Commit one field change to the selected object as a single classicSetObjects. */
function patchSelected(patch: Partial<S1ObjectEntry>): void {
  const s = useClassicLevelStore.getState();
  const idx = s.selectedObjectIndex;
  if (idx == null || !s.doc || idx >= s.doc.objects.length) return;
  const next = s.doc.objects.map((o, i) => (i === idx ? { ...o, ...patch } : o));
  const res = classicSetObjects(next);
  if (!res.ok) useToastStore.getState().addToast(`Edit failed: ${res.error}`, 'error');
}

/**
 * A 2-digit hex byte input. Keeps a local text buffer so mid-edit states (empty,
 * one nibble) don't fight a controlled value; commits a valid 0..255 parse on
 * blur or Enter, and resyncs from `value` whenever the underlying byte changes
 * (e.g. selection switches to another object).
 */
function HexByteField({ value, onCommit, title }: {
  value: number; onCommit: (v: number) => void; title?: string;
}) {
  const [text, setText] = React.useState(value.toString(16).toUpperCase().padStart(2, '0'));
  React.useEffect(() => {
    setText(value.toString(16).toUpperCase().padStart(2, '0'));
  }, [value]);
  const commit = () => {
    const parsed = parseInt(text, 16);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 0xff) onCommit(parsed);
    else setText(value.toString(16).toUpperCase().padStart(2, '0')); // revert bad input
  };
  return (
    <input
      type="text" title={title} value={text} spellCheck={false} maxLength={2}
      onChange={(e) => setText(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{
        background: T.raised, color: T.textHi, border: `1px solid ${T.border}`,
        borderRadius: T.rMd, fontSize: 12, padding: `${T.s2} ${T.s3}`,
        width: 44, fontFamily: T.fontMono, textTransform: 'uppercase',
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Object inspector (Task 14). Edits the object-tool's currently-selected object:
 * id (named dropdown), subtype (hex byte), x/y (numeric), and xflip/yflip/respawn
 * (checkboxes). Every field change is ONE classicSetObjects command (whole-list
 * replace with the single object changed — Task 12's command design), so each
 * edit is one undo step. Renders nothing when there is no valid selection.
 */
export default function ObjectInspector() {
  const doc = useClassicLevelStore((s) => s.doc);
  const idx = useClassicLevelStore((s) => s.selectedObjectIndex);
  const ref = useClassicLevelStore((s) => s.ref);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  const setSelectedObjectIndex = useClassicLevelStore((s) => s.setSelectedObjectIndex);

  if (armedObjectId != null) {
    return (
      <div style={styles.hint}>
        Placing <strong style={{ color: T.textHi }}>{s1ObjectName(armedObjectId)}</strong> — click the map to
        drop it, or press Esc to cancel.
      </div>
    );
  }
  if (!doc || idx == null || idx >= doc.objects.length) {
    return <div style={styles.hint}>No object selected. Use the Object tool and click a marker.</div>;
  }
  const obj = doc.objects[idx];
  const zone = ref?.zone ?? '';
  // "Edit art" is offered only for ids that resolve linked art in THIS zone —
  // the same predicate the library thumbnails use (Task B2).
  const linked = resolveObjectArt(obj.id, zone) !== undefined;

  // Dropdown options: every named id, plus the current id if it isn't named (so
  // an unknown id round-trips instead of silently snapping to a named one).
  const ids = S1_OBJECT_LIST.map((e) => e.id);
  const options = ids.includes(obj.id) ? ids : [...ids, obj.id].sort((a, b) => a - b);

  return (
    <div style={styles.body}>
      <div style={styles.title}>
        Object #{idx} · {s1ObjectHex(obj.id)}
        <button style={styles.deselect} title="Deselect" onClick={() => setSelectedObjectIndex(null)}>✕</button>
      </div>
      <Field label="Type">
        <Select
          value={String(obj.id)}
          onChange={(v) => patchSelected({ id: Math.min(MAX_ID, Number(v)) })}
          style={{ flex: 1, minWidth: 0 }}
        >
          {options.map((id) => (
            <option key={id} value={id}>{s1ObjectHex(id)} — {s1ObjectName(id)}</option>
          ))}
        </Select>
      </Field>
      <Field label="Subtype">
        <HexByteField value={obj.subtype} onCommit={(v) => patchSelected({ subtype: v })} title="Subtype (hex byte)" />
      </Field>
      <Field label="X">
        <NumberField value={obj.x} min={0} max={MAX_OBJ_X} width={72}
          onChange={(v) => patchSelected({ x: clampInt(v, MAX_OBJ_X) })} />
      </Field>
      <Field label="Y">
        <NumberField value={obj.y} min={0} max={MAX_OBJ_Y} width={72}
          onChange={(v) => patchSelected({ y: clampInt(v, MAX_OBJ_Y) })} />
      </Field>
      <div style={styles.checks}>
        <Check label="X-flip" checked={obj.xflip} onChange={(c) => patchSelected({ xflip: c })} />
        <Check label="Y-flip" checked={obj.yflip} onChange={(c) => patchSelected({ yflip: c })} />
        <Check label="Respawn" checked={obj.respawn} onChange={(c) => patchSelected({ respawn: c })} />
      </div>
      {linked && (
        <button
          style={styles.editArt}
          title={`Open ${s1ObjectName(obj.id)}'s art + mappings in Sprite mode`}
          onClick={() => { void editObjectArt(obj.id, zone); }}
        >
          Edit art…
        </button>
      )}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label style={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8 },
  title: {
    display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600,
    color: T.textBase, fontFamily: T.fontMono,
  },
  deselect: {
    marginLeft: 'auto', background: 'transparent', border: 'none', color: T.textLo,
    cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 2,
  },
  field: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, color: T.textLo, width: 56, flexShrink: 0 },
  checks: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textBase, cursor: 'pointer' },
  hint: { padding: 10, fontSize: 11, color: T.textLo, lineHeight: 1.5 },
  editArt: {
    marginTop: 4, padding: '5px 8px', background: T.raised, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, cursor: 'pointer',
    fontSize: 11, fontWeight: 600,
  },
};
