import { describe, it, expect } from 'vitest';
import { packObject, unpackObject, serializeObjectList, parseObjectList } from '../../src/core/formats/s4-objects';

describe('s4-objects', () => {
  it('roundtrips pack/unpack', () => {
    const packed = packObject(512, 176, 1, 0);
    const u = unpackObject(packed.x, packed.y, packed.flags);
    expect(u.x).toBe(512);
    expect(u.y).toBe(176);
    expect(u.typeIndex).toBe(1);
    expect(u.subtype).toBe(0);
  });

  it('handles max values', () => {
    const packed = packObject(0x7FF, 0x7FF, 31, 255);
    const u = unpackObject(packed.x, packed.y, packed.flags);
    expect(u.x).toBe(0x7FF);
    expect(u.y).toBe(0x7FF);
    expect(u.typeIndex).toBe(31);
    expect(u.subtype).toBe(255);
  });

  it('zero packs to zero flags', () => {
    const packed = packObject(0, 0, 0, 0);
    expect(packed.x).toBe(0);
    expect(packed.y).toBe(0);
    expect(packed.flags).toBe(0);
  });

  it('flag bits: anyY=bit15, yFlip=bit14, xFlip=bit13', () => {
    const withAnyY = packObject(0, 0, 0, 0, false, false, true);
    expect(withAnyY.flags & 0x8000).toBeTruthy();

    const withYFlip = packObject(0, 0, 0, 0, false, true, false);
    expect(withYFlip.flags & 0x4000).toBeTruthy();

    const withXFlip = packObject(0, 0, 0, 0, true, false, false);
    expect(withXFlip.flags & 0x2000).toBeTruthy();

    const unpackedAnyY = unpackObject(0, 0, withAnyY.flags);
    expect(unpackedAnyY.anyY).toBe(true);
    expect(unpackedAnyY.yFlip).toBe(false);

    const unpackedXFlip = unpackObject(0, 0, withXFlip.flags);
    expect(unpackedXFlip.xFlip).toBe(true);
  });

  it('serializeObjectList X-sorts, emits 6 bytes/entry, terminates with $FFFF word', () => {
    const entries = [
      { x: 512, y: 176, typeIndex: 1, subtype: 0 },
      { x: 256, y: 96,  typeIndex: 2, subtype: 3 },
    ];
    const bytes = serializeObjectList(entries);
    expect(bytes.length).toBe(14); // 2 * 6 + 2 terminator
    // First entry should be x=256 (sorted)
    const x0 = (bytes[0] << 8) | bytes[1];
    expect(x0).toBe(256);
    // Terminator: last two bytes are $FFFF
    expect(bytes[12]).toBe(0xFF);
    expect(bytes[13]).toBe(0xFF);
  });

  it('empty list is just $FFFF terminator (2 bytes)', () => {
    const bytes = serializeObjectList([]);
    expect(bytes.length).toBe(2);
    expect(bytes[0]).toBe(0xFF);
    expect(bytes[1]).toBe(0xFF);
  });

  it('parseObjectList reads 6-byte entries until $FFFF terminator', () => {
    const packed = packObject(512, 176, 1, 0);
    const data = new Uint8Array(8); // one entry (6 bytes) + $FFFF terminator (2 bytes)
    data[0] = (packed.x >> 8) & 0xFF;
    data[1] = packed.x & 0xFF;
    data[2] = (packed.y >> 8) & 0xFF;
    data[3] = packed.y & 0xFF;
    data[4] = (packed.flags >> 8) & 0xFF;
    data[5] = packed.flags & 0xFF;
    data[6] = 0xFF;
    data[7] = 0xFF;
    const objects = parseObjectList(data);
    expect(objects.length).toBe(1);
    expect(objects[0].x).toBe(512);
    expect(objects[0].typeIndex).toBe(1);
  });

  it('serializeObjectList roundtrips through parseObjectList', () => {
    const entries = [
      { x: 100, y: 200, typeIndex: 3, subtype: 7, xFlip: true,  yFlip: false, anyY: false },
      { x: 50,  y: 300, typeIndex: 0, subtype: 0, xFlip: false, yFlip: true,  anyY: true  },
    ];
    const bytes = serializeObjectList(entries);
    const parsed = parseObjectList(bytes);
    expect(parsed.length).toBe(2);
    // After X-sort: x=50 comes first
    expect(parsed[0].x).toBe(50);
    expect(parsed[0].yFlip).toBe(true);
    expect(parsed[0].anyY).toBe(true);
    expect(parsed[1].x).toBe(100);
    expect(parsed[1].xFlip).toBe(true);
    expect(parsed[1].typeIndex).toBe(3);
    expect(parsed[1].subtype).toBe(7);
  });
});
