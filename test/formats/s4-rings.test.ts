import { describe, it, expect } from 'vitest';
import { serializeRingList, parseRingList } from '../../src/core/formats/s4-rings';
import type { RingPlacement } from '../../src/core/model/s4-types';

describe('s4-rings', () => {
  it('serializes X-sorted with dc.l 0 terminator', () => {
    const rings: RingPlacement[] = [
      { x: 160, y: 96 }, { x: 128, y: 96 }, { x: 144, y: 96 },
    ];
    const bytes = serializeRingList(rings);
    expect(bytes.length).toBe(16); // 3*4 + 4
    expect((bytes[0] << 8) | bytes[1]).toBe(128); // sorted first
    expect(bytes[12]).toBe(0); // terminator
  });

  it('empty list is just terminator', () => {
    const bytes = serializeRingList([]);
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(0);
  });

  it('parses ring list from binary', () => {
    const data = new Uint8Array([
      0x00, 0x80, 0x00, 0x60,
      0x00, 0xA0, 0x00, 0x60,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const rings = parseRingList(data);
    expect(rings.length).toBe(2);
    expect(rings[0]).toEqual({ x: 128, y: 96 });
    expect(rings[1]).toEqual({ x: 160, y: 96 });
  });
});
