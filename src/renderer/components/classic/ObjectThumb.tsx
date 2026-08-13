import React, { useRef, useEffect } from 'react';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { loadObjectSprite } from '../../state/classicObjectArtStore';

export const THUMB = 28;

/**
 * A row thumbnail for a linked object id (Task B1). Follows the ChunkPicker
 * ThumbCell pattern: the render effect depends ONLY on the version key
 * (`id:zone:epoch`), never on doc identity — so it re-renders when the palette
 * epoch or zone changes, not on every unrelated edit. `loadObjectSprite` reuses
 * the shared (id, palette-version) cache, so this shares canvases with the
 * viewport rather than rendering its own copy. Ids with no linked art draw
 * nothing (the caller shows the hex chip only).
 *
 * Lifted out of ObjectLibraryPanel when that panel was replaced by the neutral
 * shared/ObjectList: this is classic-specific (it resolves S1 object art through
 * the classic level doc), so it stays under components/classic and is handed to
 * the neutral list as the classic port's `Thumb`. The sprite mode's
 * S1ObjectSection renders it directly.
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
  return <canvas ref={ref} width={THUMB} height={THUMB} style={thumbStyle} />;
});

const thumbStyle: React.CSSProperties = {
  width: THUMB, height: THUMB, imageRendering: 'pixelated', display: 'block',
};
