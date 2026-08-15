// src/core/art/__tests__/canvas-profiles.test.ts
import { describe, it, expect } from 'vitest';
import {
  CONSTRAINT_PROFILES, CONSTRAINT_PROFILE_IDS, constraintProfile,
} from '../canvas-profiles';

describe('constraint profiles', () => {
  it('ships exactly the four presets the spec names, in menu order', () => {
    expect(CONSTRAINT_PROFILE_IDS).toEqual([
      'genesis-level-art', 'genesis-sprite', 'genesis-unrestricted', 'none',
    ]);
  });

  it('genesis-level-art matches spec §4.2', () => {
    const p = constraintProfile('genesis-level-art');
    expect(p.colorBitsPerChannel).toBe(3);
    expect(p.paletteLines).toBe(4);
    expect(p.lineLength).toBe(16);
    expect(p.cellPaletteRule).toBe(true);
    expect(p.spriteLimits).toBe(false);
    expect(p.grids).toEqual([8, 16, 256]);
  });

  it('genesis-sprite is one line, sprite-limited, no 256 grid', () => {
    const p = constraintProfile('genesis-sprite');
    expect(p.paletteLines).toBe(1);
    expect(p.cellPaletteRule).toBe(true);
    expect(p.spriteLimits).toBe(true);
    expect(p.grids).toEqual([8, 16]);
  });

  it('genesis-unrestricted keeps the colour space but drops the cell rule', () => {
    const p = constraintProfile('genesis-unrestricted');
    expect(p.colorBitsPerChannel).toBe(3);
    expect(p.cellPaletteRule).toBe(false);
    expect(p.spriteLimits).toBe(false);
  });

  it('none constrains nothing', () => {
    const p = constraintProfile('none');
    expect(p.cellPaletteRule).toBe(false);
    expect(p.spriteLimits).toBe(false);
    expect(p.colorBitsPerChannel).toBe(3); // the canvas still stores CRAM words
  });

  it('an unknown id falls back to none rather than throwing', () => {
    // A sidecar from a future Aurora can name a profile this build has never
    // heard of. Opening the art still has to work.
    expect(constraintProfile('made-up' as never).id).toBe('none');
  });

  it('every profile is a member of the table it claims to be in', () => {
    for (const id of CONSTRAINT_PROFILE_IDS) expect(CONSTRAINT_PROFILES[id].id).toBe(id);
  });
});
