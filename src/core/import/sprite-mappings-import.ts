import type { SpriteFrame, SpritePiece } from '../model/sprite-types';

/**
 * Parse the S4 VDP-order mappings binary back into logical frames — the exact
 * inverse of serializeSpriteMappings (Plan 1). Frame count is recovered from the
 * first offset (offset table size = frameCount * 2). The stored per-frame bbox is
 * not returned (it is derived from pieces on re-serialize). Tolerant of truncation:
 * stops cleanly at a short buffer rather than throwing.
 * See docs/specs/2026-06-16-sprite-mode-design.md §2.1.
 */
export function parseSpriteMappings(bytes: Uint8Array): SpriteFrame[] {
  if (bytes.length < 2) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstOffset = dv.getUint16(0, false);
  if (firstOffset < 2 || firstOffset % 2 !== 0 || firstOffset > bytes.length) return [];

  const frameCount = firstOffset / 2;
  const frames: SpriteFrame[] = [];
  for (let f = 0; f < frameCount; f++) {
    const frameOff = dv.getUint16(f * 2, false);
    if (frameOff + 6 > bytes.length) break;
    const pieceCount = dv.getUint16(frameOff + 4, false);
    const pieces: SpritePiece[] = [];
    let o = frameOff + 6;
    for (let p = 0; p < pieceCount; p++) {
      if (o + 8 > bytes.length) break;
      const yOffset = dv.getInt16(o, false);
      const size = bytes[o + 2];
      // o+3 is the VDP link placeholder — ignored on read.
      const attrs = dv.getUint16(o + 4, false);
      const xOffset = dv.getInt16(o + 6, false);
      pieces.push({
        xOffset,
        yOffset,
        widthCells: ((size >> 2) & 3) + 1,
        heightCells: (size & 3) + 1,
        tile: attrs & 0x7ff,
        palette: (attrs >> 13) & 3,
        priority: (attrs & 0x8000) !== 0,
        yFlip: (attrs & 0x1000) !== 0,
        xFlip: (attrs & 0x0800) !== 0,
      });
      o += 8;
    }
    frames.push({ id: `f${f}`, pieces });
  }
  return frames;
}
