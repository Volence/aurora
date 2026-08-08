import { describe, it, expect } from 'vitest';
import { createDoc } from '../../src/core/art/composer-buffer';
import { paintDocCollision } from '../../src/core/art/composer-collision';

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
});
