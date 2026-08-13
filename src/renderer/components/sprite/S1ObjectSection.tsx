import React from 'react';
import { T, CollapsibleSection } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useSpriteStore } from '../../state/spriteStore';
import { spriteModeCanUndo } from '../../state/sprite-undo';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import { editObjectArt } from './export-sprite';
import { ObjectThumb } from '../classic/ObjectLibraryPanel';

/**
 * The disasm's own object list, INSIDE Sprite mode (classic sessions only) — so
 * hopping between S1 objects never requires a round trip through the level
 * view's Object Library. Rows are the zone-linked objects (same registry the
 * edit-art handoff uses); clicking one opens its art + mappings in place. The
 * row whose art file is currently open is highlighted. Switching discards
 * unsaved pixel edits, so a confirm guards it while undo history is non-empty.
 */
export default function S1ObjectSection({ busy, onBusy }: { busy: boolean; onBusy: (b: boolean) => void }) {
  const ref = useClassicLevelStore((s) => s.ref);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const dir = useClassicProjectStore((s) => s.dir);
  const openRelPath = useSpriteStore((s) => s.s1ArtSource?.relPath ?? null);
  const zone = ref?.zone ?? '';
  if (!zone) return null;

  const linked = S1_OBJECT_LIST
    .map((o) => ({ ...o, link: resolveObjectArt(o.id, zone) }))
    .filter((o) => o.link !== undefined);
  if (!linked.length) return null;

  const pick = async (id: number) => {
    if (busy) return;
    if (spriteModeCanUndo() && !window.confirm(
      'Switching objects discards unsaved sprite edits (use Save art → first to keep them). Switch anyway?',
    )) return;
    onBusy(true);
    try { await editObjectArt(id, zone); } finally { onBusy(false); }
  };

  return (
    <CollapsibleSection id="sprite.s1-objects" title={`${zone.toUpperCase()} objects`}>
      <div style={styles.list}>
        {linked.map(({ id, name, link }) => {
          const current = openRelPath !== null && link!.artFile.split('/').pop() === openRelPath;
          return (
            <button
              key={id}
              onClick={() => void pick(id)}
              disabled={busy}
              title={current ? `${name} — currently open` : `Open ${name}'s art + mappings`}
              style={{ ...styles.row, ...(current ? styles.rowCurrent : {}), ...(busy ? styles.busy : {}) }}
            >
              <span style={styles.thumbWrap}>
                <ObjectThumb id={id} zone={zone} epoch={chunkEpoch} dir={dir} />
              </span>
              <span style={{ ...styles.hex, ...(current ? styles.onCur : {}) }}>{s1ObjectHex(id)}</span>
              <span style={styles.name}>{name}</span>
            </button>
          );
        })}
      </div>
      <div style={styles.hint}>art shared between objects edits together (same .nem)</div>
    </CollapsibleSection>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 2, padding: 4, maxHeight: 240, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '1px 4px',
    background: 'transparent', border: '1px solid transparent', borderRadius: T.rMd,
    cursor: 'pointer', textAlign: 'left', color: T.textBase,
  },
  rowCurrent: { background: T.accent, borderColor: T.accent, color: T.onAccent },
  busy: { opacity: 0.6, cursor: 'default' },
  thumbWrap: { width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hex: { fontFamily: T.fontMono, fontSize: 10, color: T.textLo, width: 30, flexShrink: 0 },
  onCur: { color: T.onAccent },
  name: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { fontSize: 9, color: T.textFaint, padding: '0 8px 6px' },
};
