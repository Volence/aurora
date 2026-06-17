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

describe('generateAnimationAsm — inline event tags', () => {
  it('emits a sound event before its frame', () => {
    const asm = generateAnimationAsm('A', [
      { name: 'Atk', duration: 3, steps: [{ frame: 1 }, { frame: 2, events: [{ kind: 'sound', soundId: 0x81 }] }], control: { kind: 'loop' } },
    ]);
    // events precede the frame they annotate: ... 1, AF_SOUND, 129, 2, AF_END
    expect(asm).toContain('\t\tdc.b 3, 1, AF_SOUND, 129, 2, AF_END');
  });

  it('emits collision and set-field events', () => {
    const asm = generateAnimationAsm('A', [
      { name: 'X', duration: 1, steps: [{ frame: 0, events: [{ kind: 'collision', collisionType: 5 }, { kind: 'setField', sstOffset: 0x3c, value: 1 }] }], control: { kind: 'loop' } },
    ]);
    // both events before frame 0: AF_COLLISION, 5, AF_SET_FIELD, 60, 1, 0, 0
    expect(asm).toContain('\t\tdc.b 1, AF_COLLISION, 5, AF_SET_FIELD, 60, 1, 0, 0, AF_END');
  });

  it('emits a callback event as objroutine hi/lo + pad', () => {
    const asm = generateAnimationAsm('A', [
      { name: 'C', duration: 1, steps: [{ frame: 0, events: [{ kind: 'callback', routine: 'Obj_Spawn_Dust' }] }], control: { kind: 'loop' } },
    ]);
    expect(asm).toContain('AF_CALLBACK, objroutine(Obj_Spawn_Dust)>>8, objroutine(Obj_Spawn_Dust)&$FF, 0');
  });

  it('rejects an invalid callback routine label', () => {
    expect(() => generateAnimationAsm('A', [
      { name: 'C', duration: 1, steps: [{ frame: 0, events: [{ kind: 'callback', routine: '3bad name' }] }], control: { kind: 'loop' } },
    ])).toThrow(/not a valid asm label/);
  });

  it('rejects an out-of-range sound id', () => {
    expect(() => generateAnimationAsm('A', [
      { name: 'C', duration: 1, steps: [{ frame: 0, events: [{ kind: 'sound', soundId: 300 }] }], control: { kind: 'loop' } },
    ])).toThrow(/soundId=300 out of range/);
  });
});

describe('generateAnimationAsm — structural validation', () => {
  const ok = { duration: 1 as const, steps: [{ frame: 0 }], control: { kind: 'loop' as const } };
  it('throws on an empty anims array', () => {
    expect(() => generateAnimationAsm('Ani_X', [])).toThrow(/anims is empty/);
  });
  it('throws on an animation with no steps', () => {
    expect(() => generateAnimationAsm('Ani_X', [{ name: 'Walk', duration: 1, steps: [], control: { kind: 'loop' } }]))
      .toThrow(/has no steps/);
  });
  it('throws on duplicate animation names', () => {
    expect(() => generateAnimationAsm('Ani_X', [{ name: 'Walk', ...ok }, { name: 'Walk', ...ok }]))
      .toThrow(/duplicate animation name "Walk"/);
  });
  it('throws on an invalid animation name', () => {
    expect(() => generateAnimationAsm('Ani_X', [{ name: 'Walk Cycle', ...ok }])).toThrow(/is not a valid asm label/);
  });
  it('throws on an invalid tableLabel', () => {
    expect(() => generateAnimationAsm('Ani-X', [{ name: 'Walk', ...ok }])).toThrow(/tableLabel .* not a valid asm label/);
  });
  it('throws when an AF_CHANGE targets an animId beyond the table', () => {
    expect(() => generateAnimationAsm('Ani_X', [{ name: 'Walk', duration: 1, steps: [{ frame: 0 }], control: { kind: 'change', animId: 3 } }]))
      .toThrow(/change animId=3 >= anims.length/);
  });
});

import { generatePerFrameAnimationAsm } from '../../src/core/export/sprite-anim-export';

describe('generatePerFrameAnimationAsm — per-frame duration form', () => {
  it('emits frame,duration pairs terminated by the control code', () => {
    const asm = generatePerFrameAnimationAsm('Ani_X', [
      { name: 'Walk', steps: [{ frame: 7, duration: 6 }, { frame: 8, duration: 4 }], control: { kind: 'loop' } },
    ]);
    expect(asm).toContain('\t\tdc.b 7, 6, 8, 4, AF_END');
  });
  it('emits events before the frame,duration pair', () => {
    const asm = generatePerFrameAnimationAsm('Ani_X', [
      { name: 'Atk', steps: [{ frame: 2, duration: 3, events: [{ kind: 'sound', soundId: 0x81 }] }], control: { kind: 'loop' } },
    ]);
    expect(asm).toContain('\t\tdc.b AF_SOUND, 129, 2, 3, AF_END');
  });
  it('shares structural validation with the per-anim form', () => {
    expect(() => generatePerFrameAnimationAsm('Ani_X', [])).toThrow(/anims is empty/);
    expect(() => generatePerFrameAnimationAsm('Ani-X', [{ name: 'W', steps: [{ frame: 0, duration: 1 }], control: { kind: 'loop' } }]))
      .toThrow(/tableLabel .* not a valid asm label/);
  });
  it('throws on a per-frame duration above 0x7F', () => {
    expect(() => generatePerFrameAnimationAsm('Ani_X', [{ name: 'W', steps: [{ frame: 0, duration: 0x80 }], control: { kind: 'loop' } }]))
      .toThrow(/duration=128 out of range/);
  });
});
