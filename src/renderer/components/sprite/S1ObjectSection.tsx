import React from 'react';
import { T, CollapsibleSection } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useSpriteStore } from '../../state/spriteStore';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import { editObjectArt } from './export-sprite';
import { ObjectThumb } from '../classic/ObjectThumb';

/**
 * The disasm's own object list, INSIDE Sprite mode (classic sessions only) — so
 * hopping between S1 objects never requires a round trip through the level
 * view's Object Library. Rows are the zone-linked objects (same registry the
 * edit-art handoff uses); clicking one opens its art + mappings in place. The
 * row whose art file is currently open is highlighted. Switching discards
 * unsaved pixel edits — editObjectArt guards that with the shared sprite discard
 * confirm (re-clicking the open row stays a no-op), so no ad hoc prompt here.
 */
export default function S1ObjectSection({ busy, onBusy }: { busy: boolean; onBusy: (b: boolean) => void }) {
  const ref = useClassicLevelStore((s) => s.ref);
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileEpoch = useClassicLevelStore((s) => s.tileEpoch);
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
    // editObjectArt owns the dirty-discard confirm (shared with sprite-doc
    // activation) and no-ops a re-click of the already-open object.
    onBusy(true);
    try { await editObjectArt(id); } finally { onBusy(false); }
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
                <ObjectThumb id={id} zone={zone} paletteEpoch={paletteEpoch} tileEpoch={tileEpoch} dir={dir} />
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
    background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: T.rMd,
    cursor: 'pointer', textAlign: 'left', color: T.textBase,
  },
  rowCurrent: { background: T.accent, borderColor: T.accent, color: T.onAccent },
  busy: { opacity: 0.6, cursor: 'default' },
  thumbWrap: { width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hex: { fontFamily: T.fontMono, fontSize: 10, color: T.textLo, width: 30, flexShrink: 0 },
  onCur: { color: T.onAccent },
  name: { fontSize: T.tXs, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { fontSize: 9, color: T.textFaint, padding: '0 8px 6px' },
};
