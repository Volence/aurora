import React, { useRef, useEffect, useState } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { loadObjectSprite, useClassicObjectArtStore } from '../../state/classicObjectArtStore';
import { S1_OBJECT_LIST, s1ObjectHex, s1ObjectName } from '../../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import { editObjectArt } from '../sprite/export-sprite';

const THUMB = 28;

/**
 * A row thumbnail for a linked object id (Task B1). Follows the ChunkPicker
 * ThumbCell pattern: the render effect depends ONLY on the version key
 * (`id:zone:epoch`), never on doc identity — so it re-renders when the palette
 * epoch or zone changes, not on every unrelated edit. `loadObjectSprite` reuses
 * the shared (id, palette-version) cache, so this shares canvases with the
 * viewport rather than rendering its own copy. Ids with no linked art draw
 * nothing (the caller shows the hex chip only).
 */
export const ObjectThumb = React.memo(function ObjectThumb({
  id, zone, epoch, dir,
}: {
  id: number;
  zone: string;
  epoch: number;
  dir: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, THUMB, THUMB);
    if (!dir) return;
    const doc = useClassicLevelStore.getState().doc;
    if (!doc) return;
    let cancelled = false;
    void loadObjectSprite(dir, doc, id, zone, 0, epoch).then((sprite) => {
      // bitmap.width === 0 ⇒ the cached bitmap was closed by an epoch eviction
      // between load and draw; skip rather than throw on a detached source.
      if (cancelled || !sprite || sprite.bitmap.width === 0) return;
      const c = ref.current?.getContext('2d');
      if (!c) return;
      c.imageSmoothingEnabled = false;
      // Fit the sprite into the THUMB box preserving aspect, centred.
      const scale = Math.min(THUMB / sprite.width, THUMB / sprite.height, 1);
      const w = Math.max(1, Math.round(sprite.width * scale));
      const h = Math.max(1, Math.round(sprite.height * scale));
      c.clearRect(0, 0, THUMB, THUMB);
      c.drawImage(sprite.bitmap, (THUMB - w) / 2, (THUMB - h) / 2, w, h);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, zone, epoch, dir]);
  return <canvas ref={ref} width={THUMB} height={THUMB} style={styles.thumb} />;
});

/**
 * Object library panel (Task 14 + B1 thumbnails). A scrollable list of the named
 * S1 objects (thumbnail + id + name rows). Click a row to ARM it for placement:
 * the object tool activates and the next click on the map drops a new object of
 * that id. The armed row is highlighted; clicking it again disarms.
 */
export default function ObjectLibraryPanel() {
  const status = useClassicLevelStore((s) => s.status);
  const ref = useClassicLevelStore((s) => s.ref);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  const setArmedObjectId = useClassicLevelStore((s) => s.setArmedObjectId);
  const setTool = useClassicLevelStore((s) => s.setTool);
  const dir = useClassicProjectStore((s) => s.dir);
  // Redraw thumbnails when object-art republishes (shared cache warms up).
  const [, setTick] = useState(0);
  useEffect(() => useClassicObjectArtStore.subscribe(() => setTick((n) => n + 1)), []);

  if (status !== 'ready') return null;
  const zone = ref?.zone ?? '';

  const arm = (id: number) => {
    if (armedObjectId === id) {
      setArmedObjectId(null);
      return;
    }
    setTool('object'); // arming implies the object tool is what you want next
    setArmedObjectId(id);
  };

  return (
    <div style={styles.list} role="listbox" aria-label="Object library">
      {S1_OBJECT_LIST.map(({ id, name }) => {
        const armed = armedObjectId === id;
        const linked = resolveObjectArt(id, zone) !== undefined;
        // A row is a container (role=option) holding the arm button plus, for
        // linked ids, an "Edit art" button — nested <button>s are invalid, so the
        // arm target is its own <button> sibling rather than the whole row.
        return (
          <div
            key={id}
            role="option"
            aria-selected={armed}
            style={{ ...styles.row, ...(armed ? styles.rowArmed : {}) }}
          >
            <button
              type="button"
              onClick={() => arm(id)}
              title={`Place ${name} (${s1ObjectHex(id)})`}
              style={styles.rowMain}
            >
              <span style={styles.thumbWrap}>
                {linked ? <ObjectThumb id={id} zone={zone} epoch={chunkEpoch} dir={dir} /> : null}
              </span>
              <span style={{ ...styles.hex, ...(armed ? styles.hexArmed : {}) }}>{s1ObjectHex(id)}</span>
              <span style={styles.name}>{name}</span>
            </button>
            {linked && (
              <button
                type="button"
                onClick={() => { void editObjectArt(id); }}
                title={`Edit ${s1ObjectName(id)}'s art in Sprite mode`}
                aria-label={`Edit ${name} art`}
                style={{ ...styles.editBtn, ...(armed ? styles.editBtnArmed : {}) }}
              >
                ✎
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', padding: 4, gap: 2 },
  row: {
    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
    padding: '2px 4px', background: 'transparent', border: '1px solid transparent',
    borderRadius: T.rMd, textAlign: 'left', color: T.textBase,
  },
  rowMain: {
    display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
    padding: '1px 2px', background: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'left', color: 'inherit',
  },
  editBtn: {
    flexShrink: 0, padding: '2px 6px', background: 'transparent',
    border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: 'pointer',
    color: T.textLo, fontSize: 12, lineHeight: 1,
  },
  editBtnArmed: { color: T.onAccent, borderColor: T.onAccent },
  rowArmed: { background: T.accent, borderColor: T.accent, color: T.onAccent },
  thumbWrap: {
    width: THUMB, height: THUMB, flexShrink: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  thumb: {
    width: THUMB, height: THUMB, imageRendering: 'pixelated' as const, display: 'block',
  },
  hex: {
    fontFamily: T.fontMono, fontSize: 10, color: T.textLo, width: 30, flexShrink: 0,
  },
  hexArmed: { color: T.onAccent },
  name: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
