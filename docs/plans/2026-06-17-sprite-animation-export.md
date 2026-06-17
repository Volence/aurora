# Sprite Animation Export — Implementation Plan (v1, Plan 3 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. TDD: failing test → see it fail → minimal impl → see it pass → commit.

**Goal:** Generate the engine's animation-script `.asm` from a logical animation model —
offset table + per-animation duration form + the engine's real `AF_*` control/event codes.

**Architecture:** Pure `src/core/export/sprite-anim-export.ts`. A logical `SpriteAnimation`
model (name, duration, steps with optional inline event tags, terminating control). A
`generateAnimationAsm(tableLabel, anims)` emits text using the engine's symbolic constants
(`DUR_DYNAMIC`, `AF_END`, `AF_BACK`, `AF_CHANGE`, `AF_ROUTINE`, `AF_DELETE`, `AF_SOUND`,
`AF_COLLISION`, `AF_CALLBACK`, `AF_SET_FIELD`) so it assembles against `s4_engine`'s
`constants.asm`. Fail-fast on out-of-range bytes (consistent with Plans 1–2).

**Tech Stack:** TypeScript, Vitest. No deps. Output is `.asm` text (string), unit-tested on
exact output.

**Spec:** `docs/specs/2026-06-16-sprite-mode-design.md` §2.2. Per-animation duration form:
`dc.b duration, frame0, frame1, …, control_code`. Events execute inline BEFORE the frame
they annotate. `$FF` is `DUR_DYNAMIC` in the duration slot (vs `AF_END` in a control slot) —
this generator only ever puts it in the duration slot via the symbolic token. Frame bytes
must be `0x00–0xF6`. NOTE: the generator emits engine SYMBOLS; whether the text assembles is
verified later when export is wired into the build (Plan 5/integration) — these tests assert
the generated string only.

---

## File Structure
- `src/core/export/sprite-anim-export.ts` (new) — model types + `generateAnimationAsm`.
- `test/sprite/sprite-anim-export.test.ts` (new) — table + control codes + event tags + validation.

---

## Task 1: Model + base generator (duration, frames, control codes)

**Files:**
- Create: `src/core/export/sprite-anim-export.ts`
- Test: `test/sprite/sprite-anim-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/sprite/sprite-anim-export.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-anim-export.test.ts`
Expected: FAIL — cannot resolve `sprite-anim-export`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/export/sprite-anim-export.ts

/** Terminating control for an animation script. Maps to engine AF_* control codes. */
export type AnimControl =
  | { kind: 'loop' }                    // AF_END  ($FF) — restart from frame 0
  | { kind: 'back'; count: number }     // AF_BACK ($FE), count
  | { kind: 'change'; animId: number }  // AF_CHANGE ($FD), anim id
  | { kind: 'routine' }                 // AF_ROUTINE ($FC)
  | { kind: 'delete' };                 // AF_DELETE ($FB)

/** Inline event tag, executed when reached (before the frame it precedes). */
export type AnimEvent =
  | { kind: 'sound'; soundId: number }                     // AF_SOUND ($F9), id
  | { kind: 'collision'; collisionType: number }           // AF_COLLISION ($F8), type
  | { kind: 'setField'; sstOffset: number; value: number } // AF_SET_FIELD ($F7), off, val, 0
  | { kind: 'callback'; routine: string };                 // AF_CALLBACK ($FA), objroutine hi, lo, 0

export interface AnimStep {
  frame: number;        // mapping frame index, 0x00..0xF6
  events?: AnimEvent[]; // emitted inline before this frame's byte
}

export interface SpriteAnimation {
  name: string;                    // label suffix: <tableLabel>_<name>
  duration: number | 'dynamic';    // per-anim hold (0..0x7F) or DUR_DYNAMIC
  steps: AnimStep[];
  control: AnimControl;
}

function checkByte(name: string, v: number, max = 0xff): void {
  if (!Number.isInteger(v) || v < 0 || v > max) {
    throw new Error(`anim ${name}=${v} out of range [0,${max}]`);
  }
}

function durationToken(d: number | 'dynamic'): string {
  if (d === 'dynamic') return 'DUR_DYNAMIC';
  checkByte('duration', d, 0x7f);
  return String(d);
}

function frameToken(frame: number): string {
  checkByte('frame', frame, 0xf6);
  return String(frame);
}

function controlTokens(c: AnimControl): string[] {
  switch (c.kind) {
    case 'loop': return ['AF_END'];
    case 'back': checkByte('back count', c.count); return ['AF_BACK', String(c.count)];
    case 'change': checkByte('change animId', c.animId, 0xf6); return ['AF_CHANGE', String(c.animId)];
    case 'routine': return ['AF_ROUTINE'];
    case 'delete': return ['AF_DELETE'];
  }
}

function eventTokens(e: AnimEvent): string[] {
  switch (e.kind) {
    case 'sound': checkByte('soundId', e.soundId); return ['AF_SOUND', String(e.soundId)];
    case 'collision': checkByte('collisionType', e.collisionType); return ['AF_COLLISION', String(e.collisionType)];
    case 'setField':
      checkByte('sstOffset', e.sstOffset); checkByte('setField value', e.value);
      return ['AF_SET_FIELD', String(e.sstOffset), String(e.value), '0'];
    case 'callback':
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.routine)) throw new Error(`anim callback routine "${e.routine}" is not a valid label`);
      return ['AF_CALLBACK', `objroutine(${e.routine})>>8`, `objroutine(${e.routine})&$FF`, '0'];
  }
}

/**
 * Emit the engine animation-script .asm: offset table (one dc.w per anim) + per-animation
 * blocks `dc.b duration, [events] frame, …, control`. Uses engine symbolic constants.
 * See docs/specs/2026-06-16-sprite-mode-design.md §2.2.
 */
export function generateAnimationAsm(tableLabel: string, anims: SpriteAnimation[]): string {
  const lines: string[] = [`${tableLabel}:`];
  for (const a of anims) lines.push(`\t\tdc.w ${tableLabel}_${a.name}-${tableLabel}`);
  lines.push('');
  for (const a of anims) {
    const tokens: string[] = [durationToken(a.duration)];
    for (const step of a.steps) {
      for (const ev of step.events ?? []) tokens.push(...eventTokens(ev));
      tokens.push(frameToken(step.frame));
    }
    tokens.push(...controlTokens(a.control));
    lines.push(`${tableLabel}_${a.name}:`);
    lines.push(`\t\tdc.b ${tokens.join(', ')}`);
    lines.push('\t\teven');
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-anim-export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/export/sprite-anim-export.ts test/sprite/sprite-anim-export.test.ts
git commit -m "feat(sprite): animation .asm export — table, durations, AF_* control codes"
```

---

## Task 2: Inline event tags (sound / collision / set-field / callback)

**Files:**
- Test: `test/sprite/sprite-anim-export.test.ts` (append)
- (Implementation already covers events from Task 1 — this task LOCKS the behavior with tests.
  If any assertion fails, fix the implementation, not the test.)

- [ ] **Step 1: Write the test (append)**

```ts
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
    ])).toThrow(/not a valid label/);
  });

  it('rejects an out-of-range sound id', () => {
    expect(() => generateAnimationAsm('A', [
      { name: 'C', duration: 1, steps: [{ frame: 0, events: [{ kind: 'sound', soundId: 300 }] }], control: { kind: 'loop' } },
    ])).toThrow(/soundId=300 out of range/);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-anim-export.test.ts`
Expected: PASS (Task 1's implementation already emits events; these lock it). If any fail, fix
`eventTokens`/`generateAnimationAsm`, not the tests.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all pass (Plans 1–2 + new anim tests), 0 failures.

- [ ] **Step 4: Commit**

```bash
git add test/sprite/sprite-anim-export.test.ts
git commit -m "test(sprite): lock inline event-tag emission for animation export"
```

---

## Done criteria
- Offset table + per-anim blocks emitted with engine symbols.
- All five control codes and all four event tags emit correctly; events precede their frame.
- Fail-fast on out-of-range frame (≥0xF7), duration (>0x7F), event bytes, and bad callback labels.
- `npm test` green, no regressions.

Next: Plan 4 (shared art-core extraction: `PixelCanvas` / `PixelGridDoc` / `usePixelEditingState`
from the existing Art-mode code, keeping Art mode's tests green).
