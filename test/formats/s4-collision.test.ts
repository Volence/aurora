import { describe, it, expect } from 'vitest';
import { parseCollision, serializeCollision } from '../../src/core/formats/s4-collision';

describe('s4-collision', () => {
  it('parses raw collision bytes', () => {
    const data = new Uint8Array([0, 1, 2, 255]);
    const coll = parseCollision(data, 2, 2);
    expect(coll.length).toBe(4);
    expect(coll[0]).toBe(0);
    expect(coll[3]).toBe(255);
  });

  it('serializes collision (identity)', () => {
    const coll = new Uint8Array([0, 1, 2, 255]);
    const bytes = serializeCollision(coll);
    expect(bytes).toEqual(coll);
  });

  it('roundtrips full section (256x256)', () => {
    const coll = new Uint8Array(65536);
    coll[0] = 42; coll[65535] = 99;
    const bytes = serializeCollision(coll);
    expect(bytes.length).toBe(65536);
    const parsed = parseCollision(bytes, 256, 256);
    expect(parsed[0]).toBe(42);
    expect(parsed[65535]).toBe(99);
  });
});
