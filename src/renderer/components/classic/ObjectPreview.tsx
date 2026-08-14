import React, { useRef, useEffect } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { loadObjectSprite } from '../../state/classicObjectArtStore';
import { objectSpriteEpoch } from '../../../core/level-classic/object-sprite-clock';

export const PREVIEW = 64;

/**
 * A composed-sprite preview of the selected object that reacts to its subtype: a
 * subtype-rule object (bridge, monitor, spikes, spring, swinging platform) re-composes
 * as you edit the Subtype field, so its full composed extent is visible before you
 * commit. Shares the same (id, subtype)-keyed cache as the viewport. Draws nothing
 * when the id has no linked art.
 *
 * Lifted out of components/classic/ObjectInspector.tsx when that panel became the
 * neutral shared/ObjectInspector — same move ObjectThumb made for the object list,
 * and for the same reason: composing S1 object art from the classic level doc is
 * irreducibly classic, so it stays here and is handed to the neutral form as the
 * classic port's `Preview`.
 */
export const ObjectPreview = React.memo(function ObjectPreview({
  id, subtype, zone, paletteEpoch, tileEpoch, dir,
}: {
  id: number; subtype: number; zone: string;
  /** Palette clock — see core/level-classic/object-sprite-clock. */
  paletteEpoch: number;
  /** Tile-pool clock; only affects LevelArt-sourced ids. */
  tileEpoch: number;
  dir: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Same per-sprite epoch the viewport refresh uses, so this preview SHARES its
  // cached bitmap instead of keying into a slot the viewport then evicts.
  const epoch = objectSpriteEpoch(id, zone, subtype, { palette: paletteEpoch, tile: tileEpoch });
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    if (!dir) return;
    const doc = useClassicLevelStore.getState().doc;
    if (!doc) return;
    let cancelled = false;
    void loadObjectSprite(dir, doc, id, zone, subtype, epoch).then((sprite) => {
      if (cancelled || !sprite || sprite.bitmap.width === 0) return;
      const c = ref.current?.getContext('2d');
      if (!c) return;
      c.imageSmoothingEnabled = false;
      const scale = Math.min(PREVIEW / sprite.width, PREVIEW / sprite.height, 2);
      const w = Math.max(1, Math.round(sprite.width * scale));
      const h = Math.max(1, Math.round(sprite.height * scale));
      c.clearRect(0, 0, PREVIEW, PREVIEW);
      c.drawImage(sprite.bitmap, (PREVIEW - w) / 2, (PREVIEW - h) / 2, w, h);
    });
    return () => { cancelled = true; };
  }, [id, subtype, zone, epoch, dir]);
  return <canvas ref={ref} width={PREVIEW} height={PREVIEW} style={previewStyle} />;
});

const previewStyle: React.CSSProperties = {
  width: PREVIEW, height: PREVIEW, imageRendering: 'pixelated', display: 'block',
  background: T.raised,
};
