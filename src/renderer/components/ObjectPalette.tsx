import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';
import { listSprites } from './sprite/export-sprite';
import { readObjectBindings, setObjectBinding } from '../object-previews';
import { T } from './ui';

interface ObjectPaletteProps {
  selectedType: number;
  onSelectType: (type: number, subtype?: number) => void;
}

export default function ObjectPalette({ selectedType, onSelectType }: ObjectPaletteProps) {
  const filterRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = React.useState('');
  const project = useProjectStore((s) => s.project);
  const selectedObjectTypeId = useEditorStore((s) => s.selectedObjectTypeId);

  const objectLibrary = project?.objectLibrary ?? [];

  // Sprite-preview binding for the selected object type.
  const [sprites, setSprites] = React.useState<string[]>([]);
  const [bindings, setBindings] = React.useState<Record<string, string>>({});
  useEffect(() => {
    if (!project) return;
    listSprites().then(setSprites).catch(() => setSprites([]));
    readObjectBindings(project.basePath).then(setBindings).catch(() => setBindings({}));
  }, [project]);

  async function assignSprite(spriteName: string) {
    if (!selectedObjectTypeId) return;
    await setObjectBinding(selectedObjectTypeId, spriteName);
    setBindings((b) => { const n = { ...b }; if (spriteName) n[selectedObjectTypeId] = spriteName; else delete n[selectedObjectTypeId]; return n; });
  }

  const matchesFilter = React.useCallback((def: { id: string; name: string }) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return def.name.toLowerCase().includes(q) || def.id.toLowerCase().includes(q);
  }, [filter]);

  const filtered = objectLibrary.filter(matchesFilter);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Object Palette</span>
        <input
          ref={filterRef}
          style={styles.filter}
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div style={styles.list}>
        {filtered.length === 0 && (
          <div style={styles.empty}>
            {objectLibrary.length === 0 ? 'No object library loaded' : 'No matches'}
          </div>
        )}
        {filtered.map((def) => (
          <button
            key={def.id}
            style={{
              ...styles.entry,
              ...(def.id === selectedObjectTypeId ? styles.entrySelected : {}),
            }}
            onClick={() => {
              useEditorStore.getState().setSelectedObjectTypeId(def.id, def.defaultSubtype);
            }}
            title={`${def.id}: ${def.codeLabel}`}
          >
            <span style={styles.entryId}>{def.id}</span>
            <span style={styles.entryName}>{def.name}</span>
          </button>
        ))}
      </div>
      {selectedObjectTypeId && (
        <div style={styles.bindRow}>
          <span style={styles.bindLabel}>Preview sprite</span>
          <select
            style={styles.bindSelect}
            value={bindings[selectedObjectTypeId] ?? ''}
            onChange={(e) => assignSprite(e.target.value)}
            title="Show this object as a sprite preview on the map"
          >
            <option value="">— none (box) —</option>
            {sprites.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6,
    borderBottom: `1px solid ${T.border}`,
  },
  filter: {
    padding: '4px 8px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 4, fontSize: 12,
  },
  list: {
    flex: 1, overflow: 'auto', padding: 4,
  },
  empty: {
    padding: 12, color: T.textLo, fontSize: 12,
  },
  entry: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '4px 8px', background: 'transparent', border: 'none',
    color: T.textHi, cursor: 'pointer', borderRadius: 4, fontSize: 12,
    textAlign: 'left' as const,
  },
  entrySelected: {
    background: T.border, outline: `1px solid ${T.accent}`,
  },
  entryId: {
    color: T.accent, fontFamily: 'monospace', fontSize: 11, flexShrink: 0, width: 40,
  },
  entryName: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  bindRow: {
    padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex',
    flexDirection: 'column', gap: 4,
  },
  bindLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: T.textLo },
  bindSelect: {
    padding: '4px 6px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 4, fontSize: 12,
  },
};
