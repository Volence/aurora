import React from 'react';
import { T, CollapsibleSection } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useSpriteStore } from '../../state/spriteStore';
import {
  s1ArtRowGroups, groupIdsHex, type S1ArtRowGroup,
} from '../../../core/project/profiles/s1-object-presentation';
import { s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import { editObjectArt, editNamedArtDoc } from './export-sprite';
import { S1_NAMED_ART_DOCS } from '../../../core/project/profiles/s1-object-art';
import { ObjectThumb } from '../classic/ObjectThumb';

/**
 * The disasm's own object list, INSIDE Sprite mode (classic sessions only) — so
 * hopping between S1 objects never requires a round trip through the level
 * view's Object Library. Rows come from s1ArtRowGroups (the same registry the
 * edit-art handoff uses), which does two presentation jobs here:
 *
 *  • TWO SECTIONS, not one. Zone-free rows — the Ring, monitors, the bosses:
 *    art whose link no zone map redefines, loaded for every level — sit under
 *    their own "Shared objects" header instead of being filed under the open
 *    zone's ("GHZ objects" listing five Eggmen was the reported confusion).
 *    Only genuinely zone-scoped rows keep the zone's header.
 *  • LINK-IDENTITY DEDUP. Ids sharing one link object (the five zone bosses on
 *    the single EGGMAN const) collapse to one row labeled by the derived
 *    merged name ("Eggman (Boss)"), with the covered ids in the subtitle and
 *    tooltip. Clicking opens the canonical (lowest) id's doc — which is the
 *    identical art+maps set for every covered id.
 *
 * Clicking one opens its art + mappings in place. The row whose art file is
 * currently open is highlighted. Switching discards unsaved pixel edits —
 * editObjectArt guards that with the shared sprite discard confirm
 * (re-clicking the open row stays a no-op), so no ad hoc prompt here.
 */
export default function S1ObjectSection({ busy, onBusy }: { busy: boolean; onBusy: (b: boolean) => void }) {
  const ref = useClassicLevelStore((s) => s.ref);
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileEpoch = useClassicLevelStore((s) => s.tileEpoch);
  const dir = useClassicProjectStore((s) => s.dir);
  const openRelPath = useSpriteStore((s) => s.s1ArtSource?.relPath ?? null);
  const zone = ref?.zone ?? '';
  if (!zone) return null;

  const groups = s1ArtRowGroups(zone);
  if (!groups.length) return null;
  const zonal = groups.filter((g) => !g.zoneFree);
  const shared = groups.filter((g) => g.zoneFree);

  const pick = async (id: number) => {
    if (busy) return;
    // editObjectArt owns the dirty-discard confirm (shared with sprite-doc
    // activation) and no-ops a re-click of the already-open object.
    onBusy(true);
    try { await editObjectArt(id); } finally { onBusy(false); }
  };

  const rowList = (rows: S1ArtRowGroup[]) => (
    <div style={styles.list}>
      {rows.map((g) => {
        const current = openRelPath !== null && g.link.artFile.split('/').pop() === openRelPath;
        const covered = g.ids.length > 1 ? groupIdsHex(g) : null;
        const title = current
          ? `${g.label} — currently open`
          : `Open ${g.label}'s art + mappings${covered !== null ? ` (one art set shared by ${covered})` : ''}`;
        return (
          <button
            key={g.id}
            onClick={() => void pick(g.id)}
            disabled={busy}
            title={title}
            style={{ ...styles.row, ...(current ? styles.rowCurrent : {}), ...(busy ? styles.busy : {}) }}
          >
            <span style={styles.thumbWrap}>
              <ObjectThumb id={g.id} zone={zone} paletteEpoch={paletteEpoch} tileEpoch={tileEpoch} dir={dir} />
            </span>
            <span style={{ ...styles.hex, ...(current ? styles.onCur : {}) }}>{s1ObjectHex(g.id)}</span>
            <span style={styles.text}>
              <span style={styles.name}>{g.label}</span>
              {covered !== null && (
                <span style={{ ...styles.covered, ...(current ? styles.onCur : {}) }}>{covered}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {zonal.length > 0 && (
        <CollapsibleSection id="sprite.s1-objects" title={`${zone.toUpperCase()} objects`}>
          {rowList(zonal)}
          <div style={styles.hint}>art shared between objects edits together (same .nem)</div>
        </CollapsibleSection>
      )}
      {shared.length > 0 && (
        <CollapsibleSection id="sprite.s1-shared-objects" title="Shared objects">
          {rowList(shared)}
          {/* Named art docs (S1_NAMED_ART_DOCS): maps files with no object id
              of their own — Boss Items' chain anchor/debris. Zone-free like
              the rows above; no thumb (the thumb cache is object-id keyed). */}
          <div style={styles.list}>
            {Object.entries(S1_NAMED_ART_DOCS).map(([key, d]) => {
              const current = openRelPath !== null && d.link.artFile.split('/').pop() === openRelPath;
              return (
                <button
                  key={key}
                  onClick={() => { if (!busy) { onBusy(true); void editNamedArtDoc(key).finally(() => onBusy(false)); } }}
                  disabled={busy}
                  title={current ? `${d.name} — currently open`
                    : d.link.rawGrid ? `Open ${d.name}'s tile grid` : `Open ${d.name}'s art + mappings`}
                  style={{ ...styles.row, ...(current ? styles.rowCurrent : {}), ...(busy ? styles.busy : {}) }}
                >
                  <span style={styles.thumbWrap} />
                  {/* Raw-grid rows (Parcel C) have no mappings file — honest badge. */}
                  <span style={{ ...styles.hex, ...(current ? styles.onCur : {}) }}>{d.link.rawGrid ? 'tiles' : 'maps'}</span>
                  <span style={styles.text}><span style={styles.name}>{d.name}</span></span>
                </button>
              );
            })}
          </div>
          <div style={styles.hint}>art every zone loads — not {zone.toUpperCase()}-specific</div>
        </CollapsibleSection>
      )}
    </>
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
  hex: { fontFamily: T.fontMono, fontSize: T.t2xs, color: T.textLo, width: 30, flexShrink: 0 },
  onCur: { color: T.onAccent },
  text: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  name: { fontSize: T.tXs, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  /** The merged row's covered-ids subtitle ("$3D · $73 · …"). */
  covered: { fontFamily: T.fontMono, fontSize: T.t2xs, color: T.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { fontSize: T.t2xs, color: T.textFaint, padding: '0 8px 6px' },
};
