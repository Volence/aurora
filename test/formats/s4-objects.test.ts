import { describe, it, expect } from 'vitest';
import { packObject, unpackObject, serializeObjectList, parseObjectList } from '../../src/core/formats/s4-objects';

describe('s4-objects', () => {
  it('roundtrips pack/unpack', () => {
    const packed = packObject(512, 176, 1, 0);
    const u = unpackObject(packed);
    expect(u.x).toBe(512);
    expect(u.y).toBe(176);
    expect(u.typeIndex).toBe(1);
    expect(u.subtype).toBe(0);
  });

  it('handles max values', () => {
    const packed = packObject(1023, 1023, 31, 31);
    const u = unpackObject(packed);
    expect(u.x).toBe(1023);
    expect(u.y).toBe(1023);
    expect(u.typeIndex).toBe(31);
    expect(u.subtype).toBe(31);
  });

  it('zero packs to zero', () => {
    expect(packObject(0, 0, 0, 0)).toBe(0);
  });

  it('serializeObjectList X-sorts and terminates', () => {
    const entries = [
      { x: 512, y: 176, typeIndex: 1, subtype: 0 },
      { x: 256, y: 96, typeIndex: 2, subtype: 3 },
    ];
    const bytes = serializeObjectList(entries);
    expect(bytes.length).toBe(12); // 2*4 + 4 terminator
    const first = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    expect(unpackObject(first).x).toBe(256); // sorted
    expect(bytes[8]).toBe(0); // terminator
  });

  it('empty list is just terminator', () => {
    const bytes = serializeObjectList([]);
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(0);
  });

  it('parseObjectList reads until terminator', () => {
    const entry = packObject(512, 176, 1, 0);
    const data = new Uint8Array(8);
    data[0] = (entry >> 24) & 0xFF; data[1] = (entry >> 16) & 0xFF;
    data[2] = (entry >> 8) & 0xFF; data[3] = entry & 0xFF;
    data[4] = 0; data[5] = 0; data[6] = 0; data[7] = 0;
    const objects = parseObjectList(data);
    expect(objects.length).toBe(1);
    expect(objects[0].x).toBe(512);
  });
});
