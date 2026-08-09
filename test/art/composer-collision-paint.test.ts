import { describe, it, expect } from 'vitest';
import { createDoc } from '../../src/core/art/composer-buffer';
import { paintDocCollision, applyClipboardCollisionToDoc } from '../../src/core/art/composer-collision';
import type { MapClipboard } from '../../src/core/editing/map-clipboard';

describe('paintDocCollision', () => {
  it('maps an 8px tile coord to its 16px cell index', () => {
    const doc = createDoc(16, 16);
    paintDocCollision(doc, 'a', 3, 2, 0x1234);
    expect(doc.collisionA[1 * 8 + 1]).toBe(0x1234);
  });

  it('plane b targets collisionB, leaving collisionA untouched', () => {
    const doc = createDoc(16, 16);
    paintDocCollision(doc, 'b', 3, 2, 0x1234);
    expect(doc.collisionB[1 * 8 + 1]).toBe(0x1234);
    expect(doc.collisionA[1 * 8 + 1]).toBe(0);
  });

  it('a repeat write of the same word returns false', () => {
    const doc = createDoc(16, 16);
    expect(paintDocCollision(doc, 'a', 3, 2, 0x1234)).toBe(true);
    expect(paintDocCollision(doc, 'a', 3, 2, 0x1234)).toBe(false);
  });

  it('painting word 0 over a solid cell clears it and returns true', () => {
    const doc = createDoc(16, 16);
    paintDocCollision(doc, 'a', 3, 2, 0x1234);
    expect(paintDocCollision(doc, 'a', 3, 2, 0)).toBe(true);
    expect(doc.collisionA[1 * 8 + 1]).toBe(0);
  });

  it('a 3x3 doc has no backing cell for the odd trailing edge — painting it is a no-op', () => {
    const doc = createDoc(3, 3); // chunkCellCount(3,3) = 1 cell; tile (2,2) maps past it
    const before = new Uint16Array(doc.collisionA);
    expect(paintDocCollision(doc, 'a', 2, 2, 0x1234)).toBe(false);
    expect(doc.collisionA).toEqual(before);
  });
});

describe('applyClipboardCollisionToDoc', () => {
  function clip2x2(): MapClipboard {
    // 2x2-cell clipboard (4x4 tiles): distinct nonzero words per cell.
    return {
      widthTiles: 4, heightTiles: 4,
      nametable: new Uint16Array(16),
      collisionA: new Uint16Array([0x1001, 0x1002, 0x1003, 0x1004]),
      collisionB: new Uint16Array([0x2001, 0x2002, 0x2003, 0x2004]),
    };
  }

  it('pastes a 2x2-cell clipboard onto a 16x16 doc at cells 0,1,8,9 on both planes', () => {
    const doc = createDoc(16, 16); // 8x8 cells
    const changed = applyClipboardCollisionToDoc(doc, clip2x2());
    expect(changed).toBe(true);
    expect(doc.collisionA[0]).toBe(0x1001);
    expect(doc.collisionA[1]).toBe(0x1002);
    expect(doc.collisionA[8]).toBe(0x1003);
    expect(doc.collisionA[9]).toBe(0x1004);
    expect(doc.collisionB[0]).toBe(0x2001);
    expect(doc.collisionB[1]).toBe(0x2002);
    expect(doc.collisionB[8]).toBe(0x2003);
    expect(doc.collisionB[9]).toBe(0x2004);
    // Untouched cell elsewhere in the 8x8 doc stays air.
    expect(doc.collisionA[2]).toBe(0);
  });

  it('clamps an oversized clipboard to the doc bounds', () => {
    const doc = createDoc(4, 4); // 2x2 cells
    const clip: MapClipboard = {
      widthTiles: 8, heightTiles: 8, // 4x4 cells — bigger than the doc
      nametable: new Uint16Array(64),
      collisionA: new Uint16Array(16).fill(0x1234),
      collisionB: new Uint16Array(16).fill(0x5678),
    };
    const changed = applyClipboardCollisionToDoc(doc, clip);
    expect(changed).toBe(true);
    expect(doc.collisionA.length).toBe(4);
    expect(Array.from(doc.collisionA)).toEqual([0x1234, 0x1234, 0x1234, 0x1234]);
    expect(Array.from(doc.collisionB)).toEqual([0x5678, 0x5678, 0x5678, 0x5678]);
  });

  it('returns false when the clipboard content is already identical', () => {
    const doc = createDoc(16, 16);
    const clip = clip2x2();
    expect(applyClipboardCollisionToDoc(doc, clip)).toBe(true);
    expect(applyClipboardCollisionToDoc(doc, clip)).toBe(false);
  });
});
