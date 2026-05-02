import { describe, it, expect } from 'vitest';
import { parseNametable, serializeNametable } from '../../src/core/formats/s4-nametable';

describe('s4-nametable', () => {
  it('parses big-endian words', () => {
    const data = new Uint8Array([0x80, 0x2A, 0x00, 0x01, 0x68, 0x05, 0x00, 0x00]);
    const nt = parseNametable(data, 2, 2);
    expect(nt.length).toBe(4);
    expect(nt[0]).toBe(0x802A);
    expect(nt[1]).toBe(0x0001);
    expect(nt[2]).toBe(0x6805);
    expect(nt[3]).toBe(0x0000);
  });

  it('serializes to big-endian bytes', () => {
    const nt = new Uint16Array([0x802A, 0x0001, 0x6805, 0x0000]);
    const bytes = serializeNametable(nt);
    expect(bytes.length).toBe(8);
    expect(bytes[0]).toBe(0x80);
    expect(bytes[1]).toBe(0x2A);
  });

  it('roundtrips full section (256x256)', () => {
    const nt = new Uint16Array(65536);
    nt[0] = 0xFFFF; nt[65535] = 0x1234; nt[32768] = 0x6805;
    const bytes = serializeNametable(nt);
    expect(bytes.length).toBe(131072);
    const parsed = parseNametable(bytes, 256, 256);
    expect(parsed[0]).toBe(0xFFFF);
    expect(parsed[65535]).toBe(0x1234);
    expect(parsed[32768]).toBe(0x6805);
  });
});
