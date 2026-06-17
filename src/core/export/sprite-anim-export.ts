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
