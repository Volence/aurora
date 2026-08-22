// Sonic_Animate preview interpreter — a pure-function twin of the special
// (walk/run/roll/push) code path of `_incObj/01 Sonic.asm:2176`, implementing
// the semantics CONFIRMED live by docs/reviews/2026-08-21-sonic-animate-live-
// study.md (1,180/1,189 transitions explained; FixBugs=0 as built):
//
//   • hold reload  walk/run = max(0, $800 − |inertia|) >> 8   [study: every
//     distinct duration 2-8 observed exact]
//   • hold reload  roll     = max(0, $400 − |inertia|) >> 8   [72 reloads exact]
//   • hold reload  push     = max(0, $800 − |inertia|) >> 6   [STATIC reading
//     only — push was never observed live (study §Regime limits); ships citing
//     the study's static N=($800−spd)>>6]
//   • variant: run / fast-roll (Roll2) at |inertia| ≥ $600 [boundary sample at
//     exactly $600 took run]
//   • rotation (walk/run only): oct = (((xflip ? a : ~a) + $10) >> 4) & 6,
//     obFrame += d3 with walk d3 = (oct + oct>>1)×2 ∈ {0,6,12,18} and
//     run d3 = oct×2 ∈ {0,4,8,12} [fan-out confirmed at octants 0 and 2]
//   • flips (walk/run): when (adjusted angle + $10) wraps bit 7 BOTH flip
//     flags invert against the status facing; roll/push keep the plain status
//     X-flip
//   • a duration byte N holds N+1 ticks (subq.b/bpl), and a state reset
//     (anim change) advances IMMEDIATELY on the next Animate step
//
// The interpreter drives an editor preview from the editor's own clock — game
// loop/display cadence under load is a property of the running game, not of
// this function (study §Regime limits).

/** The three special code paths of Sonic_Animate (`.walkrunroll` dispatch on
 *  the script's first byte): $FF walk/run, $FE roll, $FD push. */
export type SonicSpecialMode = 'walkrun' | 'roll' | 'push';

/** Which script the interpreter is currently rendering from. */
export type SonicVariant = 'walk' | 'run' | 'roll' | 'roll2' | 'push';

/**
 * The five special script BODIES (bytes after the marker byte): frame ids
 * < $80 plus afEnd ($FF) terminators/padding. Each is exactly 7 bytes — the
 * file pads every special script to 6 frames + afEnd because the handler
 * switches variants WITHOUT resetting the position (file comment, parser-
 * validated in sonic-anim-import.ts).
 */
export interface SonicSpecialScripts {
  walk: readonly number[];
  run: readonly number[];
  roll: readonly number[];
  roll2: readonly number[];
  push: readonly number[];
}

/** The preview's scrub inputs — the object fields Sonic_Animate reads. */
export interface SonicAnimInput {
  mode: SonicSpecialMode;
  /** obInertia (signed ground speed; the formulas use |inertia|). */
  inertia: number;
  /** obAngle, one byte 0-$FF. */
  angle: number;
  /** obStatus bit 0 — facing left. */
  xflip: boolean;
}

/** Interpreter state — the object fields Sonic_Animate writes. */
export interface SonicAnimState {
  /** obAniFrame: index into the current script body. */
  aniFrame: number;
  /** obTimeFrame: ticks remaining before the next advance. */
  timeFrame: number;
  /** obFrame: the mapping frame currently displayed (rotation offset applied). */
  frame: number;
  /** obRender flip bits as the preview should draw them. */
  xFlip: boolean;
  yFlip: boolean;
  /** The script variant that produced `frame` (diagnostic; 'walk' pre-first-step). */
  variant: SonicVariant;
  /** The reload written on the last advance (frame holds reload+1 ticks). */
  hold: number;
}

/** State after an anim CHANGE (obPrevAni mismatch): obAniFrame/obTimeFrame
 *  zeroed, so the first Animate step advances immediately (study-confirmed). */
export function initialSonicAnimState(): SonicAnimState {
  return { aniFrame: 0, timeFrame: 0, frame: 0, xFlip: false, yFlip: false, variant: 'walk', hold: 0 };
}

/** Octant modifier: `(((xflip ? a : ~a) + $10) >> 4) & 6` — pre-doubled, so
 *  values are 0/2/4/6 (asm: not.b unless xflip; addi #$10; lsr #4; andi #6). */
export function sonicOctant(angle: number, xflip: boolean): number {
  const adj = ((xflip ? angle : ~angle) + 0x10) & 0xff;
  return (adj >> 4) & 6;
}

/** True when the adjusted angle wraps bit 7 (`bpl .noinvert` not taken):
 *  both flip flags invert against the facing. */
function sonicAngleInverts(angle: number, xflip: boolean): boolean {
  return (((xflip ? angle : ~angle) + 0x10) & 0x80) !== 0;
}

/**
 * The reload value written to obTimeFrame on an advance — the study's
 * confirmed duration formulas (push: static reading only, see header).
 * The frame is then held reload+1 ticks (subq.b/bpl).
 */
export function sonicHoldReload(mode: SonicSpecialMode, inertia: number): number {
  const abs = Math.abs(inertia);
  if (mode === 'roll') return Math.max(0, 0x400 - abs) >> 8;
  if (mode === 'push') return Math.max(0, 0x800 - abs) >> 6;
  return Math.max(0, 0x800 - abs) >> 8;
}

/** Which script |inertia| selects within the mode (run/fast-roll at ≥ $600). */
export function sonicVariantFor(mode: SonicSpecialMode, inertia: number): SonicVariant {
  const fast = Math.abs(inertia) >= 0x600;
  if (mode === 'walkrun') return fast ? 'run' : 'walk';
  if (mode === 'roll') return fast ? 'roll2' : 'roll';
  return 'push';
}

/** `.loadframe`/`.end_FF`/`.next`: read the script at aniFrame; a frame byte
 *  displays and advances; afEnd restarts at body[0] (aniFrame becomes 1).
 *  Anything else is outside the five special scripts' shape — throw loud. */
function loadFrame(aniFrame: number, body: readonly number[], label: SonicVariant): { frame: number; aniFrame: number } {
  const b = body[aniFrame];
  if (b === undefined) throw new Error(`sonic-animate: ${label} body has no byte ${aniFrame} (script not padded?)`);
  if (b < 0x80) return { frame: b, aniFrame: aniFrame + 1 };
  if (b === 0xff) {
    const first = body[0];
    if (first === undefined || first >= 0x80) throw new Error(`sonic-animate: ${label} body[0] is not a frame`);
    return { frame: first, aniFrame: 1 };
  }
  throw new Error(`sonic-animate: ${label} byte $${b.toString(16)} at ${aniFrame} — special bodies hold only frames and afEnd`);
}

/**
 * ONE Sonic_Animate call on a special animation. Pure: returns the next state.
 * Mirrors `.walkrunroll` exactly — timer gate first; on expiry the variant,
 * cadence, flips and (walk/run) rotation offset are all recomputed from the
 * CURRENT inputs, and the script position carries across variant switches.
 */
export function stepSonicAnimate(
  s: SonicAnimState,
  input: SonicAnimInput,
  scripts: SonicSpecialScripts,
): SonicAnimState {
  // subq.b #1,obTimeFrame / bpl .delay — the hold gate.
  if (s.timeFrame - 1 >= 0) return { ...s, timeFrame: s.timeFrame - 1 };

  const hold = sonicHoldReload(input.mode, input.inertia);
  const variant = sonicVariantFor(input.mode, input.inertia);
  const body = scripts[variant];

  if (input.mode === 'walkrun') {
    const invert = sonicAngleInverts(input.angle, input.xflip);
    const oct = sonicOctant(input.angle, input.xflip);
    // walk: d0 += d0>>1 then doubled → (oct + oct>>1)×2; run: doubled → oct×2.
    const d3 = variant === 'run' ? oct * 2 : (oct + (oct >> 1)) * 2;
    const next = loadFrame(s.aniFrame, body, variant);
    return {
      aniFrame: next.aniFrame,
      timeFrame: hold,
      frame: (next.frame + d3) & 0xff, // add.b d3,obFrame
      xFlip: invert ? !input.xflip : input.xflip, // eor of both flip bits
      yFlip: invert,
      variant,
      hold,
    };
  }

  // roll and push: no rotation offset; flips are the plain status facing.
  const next = loadFrame(s.aniFrame, body, variant);
  return {
    aniFrame: next.aniFrame,
    timeFrame: hold,
    frame: next.frame,
    xFlip: input.xflip,
    yFlip: false,
    variant,
    hold,
  };
}

/**
 * The pure tick API: the displayed frame + flips after `tick`+1 Animate steps
 * from a fresh anim change, at CONSTANT inputs. tick 0 = the first displayed
 * frame (a reset state advances immediately on the next step).
 */
export function sonicPreviewAt(scripts: SonicSpecialScripts, input: SonicAnimInput, tick: number): SonicAnimState {
  let s = initialSonicAnimState();
  for (let t = 0; t <= tick; t++) s = stepSonicAnimate(s, input, scripts);
  return s;
}
