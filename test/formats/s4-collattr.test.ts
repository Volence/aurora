// test/formats/s4-collattr.test.ts
import { describe, it, expect } from 'vitest';
import { parseCollAttr, serializeCollAttr } from '../../src/core/formats/s4-collattr';

describe('s4-collattr (16-bit big-endian packed cell words)', () => {
  it('round-trips a Uint16 cell-word plane', () => {
    const src = new Uint16Array([0, 1, 0x3FF, 0x1234, 0xFFFF, 0x0400]);
    const out = parseCollAttr(serializeCollAttr(src));
    expect(Array.from(out)).toEqual(Array.from(src));
  });
  it('serializes each word big-endian (high byte first)', () => {
    const bytes = serializeCollAttr(new Uint16Array([0x1234]));
    expect(Array.from(bytes)).toEqual([0x12, 0x34]);
  });
  it('parses big-endian byte pairs back to words', () => {
    expect(Array.from(parseCollAttr(new Uint8Array([0xAB, 0xCD])))).toEqual([0xABCD]);
  });
  it('serialize returns a fresh buffer (no aliasing into the source)', () => {
    const src = new Uint16Array([1, 2, 3]);
    const ser = serializeCollAttr(src); ser[0] = 9;
    expect(src[0]).toBe(1);
  });
});
