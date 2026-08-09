import { describe, it, expect } from 'vitest';
import {
  S1_OBJECT_NAMES,
  S1_OBJECT_LIST,
  S1_INVISIBLE_OBJECT_IDS,
  s1ObjectName,
  s1ObjectHex,
  s1ObjectIsInvisible,
} from '../s1-objects';

describe('s1-objects name table', () => {
  it('names the canonical S1 objects the task calls out', () => {
    expect(s1ObjectName(0x0d)).toBe('Signpost');
    expect(s1ObjectName(0x11)).toBe('Bridge');
    expect(s1ObjectName(0x18)).toBe('Platform');
    expect(s1ObjectName(0x25)).toBe('Ring');
    expect(s1ObjectName(0x26)).toBe('Monitor');
    expect(s1ObjectName(0x41)).toBe('Spring');
  });

  it('falls back to $XX hex for an unnamed id', () => {
    expect(S1_OBJECT_NAMES[0x00]).toBeUndefined();
    expect(s1ObjectName(0x00)).toBe('$00');
    expect(s1ObjectName(0x7f)).toBe('$7F');
  });

  it('formats hex as an uppercase 2-digit $XX', () => {
    expect(s1ObjectHex(0x0d)).toBe('$0D');
    expect(s1ObjectHex(0xff)).toBe('$FF');
  });

  it('only names 7-bit ids (0x00..0x7F — the S1 object id field width)', () => {
    for (const k of Object.keys(S1_OBJECT_NAMES)) {
      const id = Number(k);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0x7f);
    }
  });

  it('flags invisible / trigger ids and names them (ghost markers)', () => {
    expect(s1ObjectIsInvisible(0x49)).toBe(true); // Waterfall Sound Effect
    expect(s1ObjectIsInvisible(0x54)).toBe(true); // Invisible Lava Marker
    expect(s1ObjectIsInvisible(0x71)).toBe(true); // Invisible Block
    expect(s1ObjectIsInvisible(0x72)).toBe(true); // Teleporter
    expect(s1ObjectIsInvisible(0x1f)).toBe(false); // Crabmeat (a real sprite)
    expect(s1ObjectIsInvisible(0x11)).toBe(false); // Bridge (a real sprite)
    // Every invisible id is named, so the ghost marker shows a NAME not just hex.
    for (const id of S1_INVISIBLE_OBJECT_IDS) {
      expect(S1_OBJECT_NAMES[id], `invisible $${id.toString(16)} must be named`).toBeDefined();
    }
  });

  it('exposes an ascending, deduped list mirroring the table', () => {
    expect(S1_OBJECT_LIST.length).toBe(Object.keys(S1_OBJECT_NAMES).length);
    for (let i = 1; i < S1_OBJECT_LIST.length; i++) {
      expect(S1_OBJECT_LIST[i].id).toBeGreaterThan(S1_OBJECT_LIST[i - 1].id);
    }
    for (const { id, name } of S1_OBJECT_LIST) {
      expect(S1_OBJECT_NAMES[id]).toBe(name);
    }
  });
});
