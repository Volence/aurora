import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { parseCharacterAnims } from '../../src/core/import/anim-import';

const SAMPLE = `
; comment
Ani_Sonic:
        dc.w Ani_Sonic_Walk-Ani_Sonic   ; ANIM_WALK
        dc.w Ani_Sonic_Wait-Ani_Sonic   ; ANIM_IDLE
Ani_Sonic_TableEnd:

Ani_Sonic_Walk:
        dc.b DUR_DYNAMIC                 ; speed-scaled
        dc.b 7, 8, 1, 2, 3, 4, 5, 6
        dc.b AF_END
        align 2
Ani_Sonic_Wait:
        dc.b 7
        dc.b $BA, $BA, $BB
        dc.b AF_BACK, 5
        align 2
`;

describe('parseCharacterAnims', () => {
  it('parses names, durations (incl. DUR_DYNAMIC), hex+dec frames, and control', () => {
    const anims = parseCharacterAnims(SAMPLE);
    expect(anims.map((a) => a.name)).toEqual(['Walk', 'Wait']);
    expect(anims[0]).toMatchObject({ name: 'Walk', duration: 'dynamic', frames: [7, 8, 1, 2, 3, 4, 5, 6], control: { kind: 'loop' } });
    expect(anims[1]).toMatchObject({ name: 'Wait', duration: 7, frames: [0xba, 0xba, 0xbb], control: { kind: 'back', count: 5 } });
  });

  it('returns [] when there is no table', () => {
    expect(parseCharacterAnims('just some text\n')).toEqual([]);
  });
});

// Integration: the real Sonic animation script.
const FILE = '/home/volence/sonic_hacks/s4_engine/data/animations/sonic_anims.asm';
(existsSync(FILE) ? describe : describe.skip)('real sonic_anims.asm', () => {
  it('parses all 11 named animations with sane frame indices', () => {
    const anims = parseCharacterAnims(readFileSync(FILE, 'utf8'));
    expect(anims).toHaveLength(11);
    expect(anims.map((a) => a.name)).toEqual([
      'Walk', 'Run', 'Roll', 'Spindash', 'Push', 'Wait', 'Balance', 'LookUp', 'Duck', 'Skid', 'GetUp',
    ]);
    const walk = anims.find((a) => a.name === 'Walk')!;
    expect(walk.frames).toEqual([7, 8, 1, 2, 3, 4, 5, 6]);
    expect(walk.control).toEqual({ kind: 'loop' });
    // every frame index is a valid mapping frame (< 0xF7) and within Sonic's 224 frames
    for (const a of anims) for (const f of a.frames) { expect(f).toBeLessThan(224); expect(f).toBeGreaterThanOrEqual(0); }
  });
});
