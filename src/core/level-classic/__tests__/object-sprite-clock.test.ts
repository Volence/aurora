import { describe, it, expect } from 'vitest';
import { objectSpriteDependsOnTiles, objectSpriteEpoch } from '../object-sprite-clock';

// The invalidation DECISION is pure and therefore testable in the node-only
// suite, even though the render path around it (canvas + ImageBitmap + IPC) is
// not. These lock the rule that fixed the composer freeze: a sprite is only
// invalidated by inputs it actually reads.

describe('objectSpriteDependsOnTiles', () => {
  it('is true for LevelArt-sourced ids (they draw from doc.tiles)', () => {
    expect(objectSpriteDependsOnTiles(0x18, 'ghz', 0)).toBe(true); // GHZ Platform
    expect(objectSpriteDependsOnTiles(0x1a, 'ghz', 0)).toBe(true); // Collapsing Cliff
  });

  it('is false for file-backed (.nem) ids: no in-editor edit changes their art', () => {
    expect(objectSpriteDependsOnTiles(0x1f, 'ghz', 0)).toBe(false); // Crabmeat
    expect(objectSpriteDependsOnTiles(0x26, 'ghz', 0)).toBe(false); // Monitor
  });

  it('is false for an unlinked id (there is no sprite to invalidate)', () => {
    expect(objectSpriteDependsOnTiles(0x01, 'ghz', 0)).toBe(false);
  });

  it('follows a subtype rule that overrides the art source to a file', () => {
    // Spring $41 horizontal swaps to Spring Horizontal.nem — a file link, so the
    // resolved (effective) source is what decides, not the base entry.
    expect(objectSpriteDependsOnTiles(0x41, 'ghz', 0)).toBe(false);
  });
});

describe('objectSpriteEpoch', () => {
  it('keys a file-backed sprite on the PALETTE clock alone', () => {
    // The tile clock moving must not change its key — that is the whole fix.
    expect(objectSpriteEpoch(0x1f, 'ghz', 0, { palette: 5, tile: 9 })).toBe(5);
    expect(objectSpriteEpoch(0x1f, 'ghz', 0, { palette: 5, tile: 40 })).toBe(5);
  });

  it('keys a LevelArt sprite on whichever of the two clocks is newer', () => {
    expect(objectSpriteEpoch(0x18, 'ghz', 0, { palette: 5, tile: 9 })).toBe(9);
    expect(objectSpriteEpoch(0x18, 'ghz', 0, { palette: 11, tile: 9 })).toBe(11);
  });

  it('moves a LevelArt key when EITHER clock bumps, and is stable when neither does', () => {
    const base = objectSpriteEpoch(0x18, 'ghz', 0, { palette: 5, tile: 9 });
    expect(objectSpriteEpoch(0x18, 'ghz', 0, { palette: 5, tile: 9 })).toBe(base); // stable
    expect(objectSpriteEpoch(0x18, 'ghz', 0, { palette: 5, tile: 12 })).toBeGreaterThan(base);
    expect(objectSpriteEpoch(0x18, 'ghz', 0, { palette: 12, tile: 9 })).toBeGreaterThan(base);
  });

  it('moves EVERY sprite key when the palette bumps (both art sources)', () => {
    // The correctness guard: a palette edit must still refresh object previews.
    for (const id of [0x1f, 0x18]) {
      const before = objectSpriteEpoch(id, 'ghz', 0, { palette: 5, tile: 9 });
      const after = objectSpriteEpoch(id, 'ghz', 0, { palette: 20, tile: 9 });
      expect(after).toBeGreaterThan(before);
    }
  });
});
