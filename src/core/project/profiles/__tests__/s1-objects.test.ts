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

  it('only names ids the disasm object index defines (0x00..0x8C)', () => {
    // The placeable objpos id field is 7-bit, but obID is a byte and the
    // engine's index runs to $8C (_inc/Object Pointers.asm:156 — id_TryChaos is
    // the last objptr, "; 8C") — the FZ/SBZ2 boss actors $82-$86 are named for
    // their sprite docs. Placement surfaces filter at $7F separately.
    for (const k of Object.keys(S1_OBJECT_NAMES)) {
      const id = Number(k);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0x8c);
    }
  });

  it('names the boss family from the disasm object index (SonLVL has no boss defs)', () => {
    expect(s1ObjectName(0x3d)).toBe('Eggman (GHZ Boss)'); // id_BossGreenHill, Object Pointers.asm:77
    expect(s1ObjectName(0x48)).toBe('Boss Wrecking Ball'); // id_BossBall, :88
    expect(s1ObjectName(0x73)).toBe('Eggman (MZ Boss)'); // id_BossMarble, :131
    expect(s1ObjectName(0x74)).toBe('Boss Fire'); // id_BossFire, :132
    expect(s1ObjectName(0x75)).toBe('Eggman (SYZ Boss)'); // id_BossSpringYard, :133
    expect(s1ObjectName(0x76)).toBe('Boss Block'); // id_BossBlock, :134
    expect(s1ObjectName(0x77)).toBe('Eggman (LZ Boss)'); // id_BossLabyrinth, :135
    expect(s1ObjectName(0x7a)).toBe('Eggman (SLZ Boss)'); // id_BossStarLight, :138
    expect(s1ObjectName(0x7b)).toBe('Boss Spikeball'); // id_BossSpikeball, :139
    expect(s1ObjectName(0x82)).toBe('Eggman (SBZ2 Cutscene)'); // id_ScrapEggman, :146
    expect(s1ObjectName(0x83)).toBe('Crumbling Floor (SBZ2)'); // id_FalseFloor, :147
    expect(s1ObjectName(0x84)).toBe('FZ Boss Cylinder'); // id_EggmanCylinder, :148
    expect(s1ObjectName(0x85)).toBe('Eggman (FZ Boss)'); // id_BossFinal, :149
    expect(s1ObjectName(0x86)).toBe('FZ Plasma Launcher'); // id_BossPlasma, :150
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
