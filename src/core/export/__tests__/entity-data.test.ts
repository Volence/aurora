// The placement word's flip bits were reserved (OEF_XFLIP / OEF_YFLIP) but never
// written, because ObjectPlacement had no fields to write them from. Stage-4 plan
// 3 task 5 added `xflip`/`yflip` so the object inspector could edit them; this
// pins the bake so the two ends cannot drift apart silently.

import { describe, it, expect } from 'vitest';
import { generateEntityDataAsm } from '../entity-data';
import type { ObjectDef, ObjectPlacement } from '../../model/s4-types';

const LIBRARY: ObjectDef[] = [
  { id: 'ring', name: 'Ring', codeLabel: 'Obj_Ring', defaultSubtype: 0, properties: {} },
  { id: 'spike', name: 'Spike', codeLabel: 'Obj_Spike', defaultSubtype: 0, properties: {} },
];

const place = (over: Partial<ObjectPlacement> = {}): ObjectPlacement => ({
  x: 0x10, y: 0x20, typeId: 'ring', subtype: 0x03, ...over,
});

/** The third word of each `dc.w x, y, flags` object row. */
function flagWords(asm: string): number[] {
  return asm.split('\n')
    .filter((l) => /^\s+dc\.w \$[0-9A-F]{4}, \$[0-9A-F]{4}, \$[0-9A-F]{4}/.test(l))
    .map((l) => parseInt(l.trim().split(',')[2].trim().slice(1, 5), 16));
}

describe('generateEntityDataAsm placement flags', () => {
  it('packs type index and subtype, with no flip bits when the flips are absent', () => {
    // An act saved before flips existed omits the fields entirely — it must bake
    // byte-for-byte as it did before they were added.
    const [flags] = flagWords(generateEntityDataAsm('GHZ', 0, [], [place()], LIBRARY));
    expect(flags).toBe(0x0003);
  });

  it('leaves the bits clear for explicit false, too', () => {
    const [flags] = flagWords(
      generateEntityDataAsm('GHZ', 0, [], [place({ xflip: false, yflip: false })], LIBRARY),
    );
    expect(flags).toBe(0x0003);
  });

  it('sets OEF_XFLIP (bit 13) and OEF_YFLIP (bit 14)', () => {
    const asm = generateEntityDataAsm('GHZ', 0, [], [
      place({ x: 0x10, xflip: true }),
      place({ x: 0x20, yflip: true }),
      place({ x: 0x30, xflip: true, yflip: true }),
    ], LIBRARY);
    expect(flagWords(asm)).toEqual([0x2003, 0x4003, 0x6003]);
  });

  it('keeps the type index out of the flip bits', () => {
    // Type index rides bits 8..12; setting both flips on the SECOND type must not
    // bleed into it.
    const asm = generateEntityDataAsm('GHZ', 0, [], [
      place({ x: 0x10, typeId: 'ring' }),
      place({ x: 0x20, typeId: 'spike', subtype: 0xff, xflip: true, yflip: true }),
    ], LIBRARY);
    expect(flagWords(asm)).toEqual([0x0003, 0x61ff]);
  });
});
