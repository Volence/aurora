// test/formats/s4-collattr.test.ts
import { describe, it, expect } from 'vitest';
import { parseCollAttr, serializeCollAttr } from '../../src/core/formats/s4-collattr';

describe('s4-collattr', () => {
  it('round-trips the editable collision attr plane (identity bytes)', () => {
    const src = new Uint8Array([0, 1, 52, 200, 255, 0]);
    const out = parseCollAttr(serializeCollAttr(src));
    expect(Array.from(out)).toEqual(Array.from(src));
  });
  it('parse/serialize return fresh copies (no aliasing)', () => {
    const src = new Uint8Array([1, 2, 3]);
    const ser = serializeCollAttr(src); ser[0] = 9;
    expect(src[0]).toBe(1);
    const par = parseCollAttr(src); par[0] = 9;
    expect(src[0]).toBe(1);
  });
});
