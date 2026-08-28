import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { parseCharacterAnims } from '../../src/core/import/anim-import';

// ParsedAnim.frames carries per-frame flip flags since the S1 anim work; these
// dialects have none, so every frame is {index, xFlip:false, yFlip:false}.
const fr = (index: number) => ({ index, xFlip: false, yFlip: false });

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
    expect(anims[0]).toMatchObject({ name: 'Walk', duration: 'dynamic', frames: [7, 8, 1, 2, 3, 4, 5, 6].map(fr), control: { kind: 'loop' } });
    expect(anims[1]).toMatchObject({ name: 'Wait', duration: 7, frames: [0xba, 0xba, 0xbb].map(fr), control: { kind: 'back', count: 5 } });
  });

  it('returns [] when there is no table', () => {
    expect(parseCharacterAnims('just some text\n')).toEqual([]);
  });
});

// Integration: the real Sonic animation script.
//
// `s4_engine` DOES NOT EXIST on this machine (aeon replaced it), so this row has
// measured NOTHING for a long time. It used to say so with a bare
// `describe.skip`, which reads as a quiet zero in a suite total; audited
// 2026-08-28 (docs/reviews/2026-08-28-golden-live-tree.md) and made to name what
// it could not measure. It is left in place rather than deleted because the
// decision — re-point at aeon, or drop it — belongs to the sprite lane.
const FILE = '/home/volence/sonic_hacks/s4_engine/data/animations/sonic_anims.asm';
describe('real sonic_anims.asm', () => {
  it('parses all 11 named animations with sane frame indices', (ctx) => {
    if (!existsSync(FILE)) {
      ctx.skip(`SKIPPED, NOT PASSED: ${FILE} is absent — the s4_engine tree is gone from this `
        + 'machine, so this row measures nothing at all and has not for some time');
      return;
    }
    const anims = parseCharacterAnims(readFileSync(FILE, 'utf8'));
    expect(anims).toHaveLength(11);
    expect(anims.map((a) => a.name)).toEqual([
      'Walk', 'Run', 'Roll', 'Spindash', 'Push', 'Wait', 'Balance', 'LookUp', 'Duck', 'Skid', 'GetUp',
    ]);
    const walk = anims.find((a) => a.name === 'Walk')!;
    expect(walk.frames).toEqual([7, 8, 1, 2, 3, 4, 5, 6].map(fr));
    expect(walk.control).toEqual({ kind: 'loop' });
    // every frame index is a valid mapping frame (< 0xF7) and within Sonic's 224 frames
    for (const a of anims) for (const f of a.frames) { expect(f.index).toBeLessThan(224); expect(f.index).toBeGreaterThanOrEqual(0); }
  });
});
