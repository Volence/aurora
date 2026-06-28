import React from 'react';
import { StatusBar, T } from '../components/ui';
import { useSpriteStore } from '../state/spriteStore';

/**
 * Sprite-mode status bar: sprite name on the left; hardware-piece / unique-tile
 * counts + zoom on the right. The decomposition counts are computed in
 * SpriteMode (which owns the frame buffer + palette) and passed in.
 */
export default function SpriteStatusBar({ pieces, tiles }: { pieces: number; tiles: number }) {
  const name = useSpriteStore((s) => s.name);
  const zoom = useSpriteStore((s) => s.zoom);

  const left = (
    <span style={{ color: T.accent, fontWeight: 600 }}>{name || 'NewSprite'}</span>
  );

  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: T.textBase }}>
      <span>{pieces} pieces</span>
      <span>{tiles} tiles</span>
      <span>{zoom}× zoom</span>
    </span>
  );

  return <StatusBar left={left} right={right} />;
}
