import { describe, it, expect } from 'vitest';
import { generateAnimationAsm } from '../../src/core/export/sprite-anim-export';
import type { SpriteAnimation } from '../../src/core/export/sprite-anim-export';

describe('generateAnimationAsm — table + base form', () => {
  it('emits an offset table then per-animation blocks (dynamic duration, loop)', () => {
    const anims: SpriteAnimation[] = [
      { name: 'Walk', duration: 'dynamic', steps: [{ frame: 7 }, { frame: 8 }], control: { kind: 'loop' } },
    ];
    const asm = generateAnimationAsm('Ani_Test', anims);
    expect(asm).toBe(
      [
        'Ani_Test:',
        '\t\tdc.w Ani_Test_Walk-Ani_Test',
        '',
        'Ani_Test_Walk:',
        '\t\tdc.b DUR_DYNAMIC, 7, 8, AF_END',
        '\t\teven',
        '',
      ].join('\n'),
    );
  });

  it('emits a fixed duration and a back/change/routine/delete control', () => {
    const anims: SpriteAnimation[] = [
      { name: 'Run', duration: 4, steps: [{ frame: 1 }, { frame: 2 }], control: { kind: 'back', count: 2 } },
      { name: 'Hurt', duration: 8, steps: [{ frame: 9 }], control: { kind: 'change', animId: 0 } },
      { name: 'Adv', duration: 2, steps: [{ frame: 3 }], control: { kind: 'routine' } },
      { name: 'Gone', duration: 1, steps: [{ frame: 4 }], control: { kind: 'delete' } },
    ];
    const asm = generateAnimationAsm('Ani_X', anims);
    expect(asm).toContain('\t\tdc.b 4, 1, 2, AF_BACK, 2');
    expect(asm).toContain('\t\tdc.b 8, 9, AF_CHANGE, 0');
    expect(asm).toContain('\t\tdc.b 2, 3, AF_ROUTINE');
    expect(asm).toContain('\t\tdc.b 1, 4, AF_DELETE');
    // offset table has all four entries in order
    expect(asm.startsWith(
      'Ani_X:\n\t\tdc.w Ani_X_Run-Ani_X\n\t\tdc.w Ani_X_Hurt-Ani_X\n\t\tdc.w Ani_X_Adv-Ani_X\n\t\tdc.w Ani_X_Gone-Ani_X\n',
    )).toBe(true);
  });

  it('throws on a frame index in the control-code range (>= 0xF7)', () => {
    expect(() => generateAnimationAsm('A', [{ name: 'B', duration: 1, steps: [{ frame: 0xf7 }], control: { kind: 'loop' } }]))
      .toThrow(/frame=\d+ out of range/);
  });

  it('throws on a fixed duration above 0x7F', () => {
    expect(() => generateAnimationAsm('A', [{ name: 'B', duration: 0x80, steps: [{ frame: 0 }], control: { kind: 'loop' } }]))
      .toThrow(/duration=\d+ out of range/);
  });
});
