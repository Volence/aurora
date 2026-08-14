import React from 'react';
import { T, Select, NumberField } from '../ui';
import type {
  CommitResult, FieldValue, ObjectField, ObjectInspectorPort,
} from './object-inspector-model';

/**
 * The one object property form both engines render (stage-4 plan 3). Classic's
 * ObjectInspector was the base; aeon gains an editor it never had — its
 * "Selected Object" readout was four lines of uneditable text.
 *
 * IT IMPORTS NO STORE, deliberately, and this is the first NEUTRAL COMPONENT ON
 * THE WRITE PATH, which is where that discipline stops being tidiness. Aeon's
 * executeCommand THROWS when the focused document is not an aeon command history;
 * a direct import here would take the whole panel down on a classic click instead
 * of degrading. So every write leaves through `port.commit`, which returns
 * classic's `{ok} | {ok:false, error}` on both engines — the aeon port catches and
 * converts.
 *
 * The two engines' objects are not the same shape either: classic keys its type
 * by number and aeon by string, classic coordinates are level-global with two
 * different ceilings while aeon's are section-local, and `respawn` exists only in
 * S1. None of that is known here. The port hands over a SCHEMA of the fields its
 * engine actually has, and this renders exactly those — a field an engine lacks is
 * absent, never a disabled control that does nothing.
 */
export default function ObjectInspector({ port }: { port: ObjectInspectorPort }): React.ReactElement {
  const { selected } = port;
  return (
    // rootProps first: a port contributes behaviour (classic's facet claim — an
    // object placement is act LAYOUT data, so an edit here must not leave Ctrl+Z
    // pointed at the zone-art document), not layout.
    <div {...port.rootProps} style={selected ? styles.body : undefined}>
      {selected
        // Keyed on the selection so field buffers and any error reset when the
        // user picks a different object, rather than leaking across.
        ? <Form key={selected.key} port={port} selectionKey={selected.key} fields={selected.fields} />
        : <div style={styles.hint}>{port.emptyHint}</div>}
    </div>
  );
}

function Form({
  port, selectionKey, fields,
}: {
  port: ObjectInspectorPort;
  selectionKey: string;
  fields: Readonly<Record<string, FieldValue>>;
}): React.ReactElement {
  const [error, setError] = React.useState<string | null>(null);
  // Bumped on a rejected write so the text buffers below remount and resync from
  // the store's unchanged value — otherwise a refused edit would sit on screen
  // looking committed.
  const [revert, setRevert] = React.useState(0);

  const commit = (id: string, value: FieldValue): void => {
    const res: CommitResult = port.commit(selectionKey, { [id]: value });
    if (res.ok) {
      setError(null);
    } else {
      setError(res.error);
      setRevert((n) => n + 1);
    }
  };

  const { Preview, action, onDeselect } = port;

  return (
    <>
      <div style={styles.title}>
        {port.title}
        {onDeselect && (
          <button style={styles.deselect} title="Deselect" onClick={onDeselect}>✕</button>
        )}
      </div>
      {Preview && (
        <div style={styles.previewWrap}>
          {/* Keyed on the port's version so an art republish repaints it: the
              neutral side cannot know what invalidated the bitmap. */}
          <Preview key={port.versionKey} fields={fields} />
        </div>
      )}
      {port.schema.map((field) => (
        <FieldRow
          key={`${field.id}:${revert}`}
          field={field}
          value={fields[field.id]}
          onCommit={(v) => commit(field.id, v)}
        />
      ))}
      {error && <div style={styles.error}>{error}</div>}
      {action && (
        <button style={styles.action} title={action.title} onClick={action.run}>
          {action.label}
        </button>
      )}
    </>
  );
}

function FieldRow({
  field, value, onCommit,
}: {
  field: ObjectField;
  value: FieldValue | undefined;
  onCommit: (v: FieldValue) => void;
}): React.ReactElement {
  if (field.kind === 'bool') {
    return (
      <label style={styles.check}>
        <input type="checkbox" checked={value === true} onChange={(e) => onCommit(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  return (
    <label style={styles.field}>
      <span style={styles.label}>{field.label}</span>
      {field.kind === 'select' ? (
        <Select value={String(value ?? '')} onChange={onCommit} style={{ flex: 1, minWidth: 0 }}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ) : field.hex ? (
        <HexByteField value={Number(value ?? 0)} onCommit={onCommit} title={field.title} max={field.max} />
      ) : (
        <NumberField
          value={Number(value ?? 0)} min={field.min} max={field.max} width={72}
          title={field.title} onChange={onCommit}
        />
      )}
    </label>
  );
}

/**
 * A 2-digit hex byte input. Keeps a local text buffer so mid-edit states (empty,
 * one nibble) don't fight a controlled value; commits a valid parse on blur or
 * Enter, and resyncs from `value` whenever the underlying byte changes (e.g.
 * selection switches to another object, or a write was refused).
 */
function HexByteField({ value, onCommit, title, max }: {
  value: number; onCommit: (v: number) => void; title?: string; max: number;
}): React.ReactElement {
  const text0 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');
  const [text, setText] = React.useState(() => text0(value));
  React.useEffect(() => { setText(text0(value)); }, [value]);
  const commit = (): void => {
    const parsed = parseInt(text, 16);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= max) onCommit(parsed);
    else setText(text0(value)); // revert bad input
  };
  return (
    <input
      type="text" title={title} value={text} spellCheck={false} maxLength={2}
      onChange={(e) => setText(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={styles.hexInput}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8 },
  // No minHeight: the frame sizes to whatever the port's Preview draws. A port
  // with nothing to show must return no Preview (the block above then renders
  // nothing), not a component that draws blank — a reserved 64px box around
  // empty pixels is exactly the dead chrome this panel design forbids.
  previewWrap: {
    display: 'flex', justifyContent: 'center', padding: 4,
    background: T.raised, border: `1px solid ${T.border}`, borderRadius: T.rMd,
  },
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
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textBase, cursor: 'pointer' },
  hint: { padding: 10, fontSize: 11, color: T.textLo, lineHeight: 1.5 },
  // Inline rather than a corner toast: the failure is about the field the user
  // just left, and it is the same message on both engines because the ports
  // normalise to one result shape.
  error: {
    fontSize: 11, color: T.error, lineHeight: 1.4,
    padding: '4px 6px', background: T.raised, borderRadius: T.rMd,
  },
  action: {
    marginTop: 4, padding: '5px 8px', background: T.raised, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, cursor: 'pointer',
    fontSize: 11, fontWeight: 600,
  },
  hexInput: {
    background: T.raised, color: T.textHi, border: `1px solid ${T.border}`,
    borderRadius: T.rMd, fontSize: 12, padding: `${T.s2} ${T.s3}`,
    width: 44, fontFamily: T.fontMono, textTransform: 'uppercase',
  },
};
