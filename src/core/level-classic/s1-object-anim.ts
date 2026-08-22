// S1 object layout-preview animation — the pure-core half of the animated
// object previews in the classic level viewport (the animation line's Parcel 2,
// building on the transcribed object→script table in
// profiles/s1-object-anims.ts and the audit at
// docs/reviews/2026-08-20-s1-animation-audit.md).
//
// WHAT THIS DECIDES: for a PLACED object at game frame t (60/s since play
// switched on), which mappings frame (+ per-frame flips) its preview shows.
// Three pieces:
//
//   • S1_PREVIEW_ANIMS — the CURATED "which animation does the layout preview
//     play" table. Curation rules, in priority order (per-row provenance below):
//       1. the anim the object ENTERS ON SPAWN where the init code derives it
//          (an init-routine `move.b #N,obAnim` / `move.b obSubtype,obAnim`);
//       2. the object's steady in-level locomotion anim where spawn is a
//          transient wait state (badniks that immediately start moving);
//       3. otherwise anim 0 — object RAM is zeroed on spawn, so an object whose
//          code never writes obAnim runs the script table's FIRST anim.
//     Objects with no row stay static (resolvePreviewAnim → null). Named
//     exclusions are listed at the bottom of the table with reasons.
//   • buildPreviewAnim — turn the chosen script anim / sync entry into hold
//     steps using THE TIMELINE'S OWN duration convention (see stepHoldTicks).
//   • previewStepIndexAt — pure frame selection: step shown at game frame t.
//     No per-object state — every placement of an id shows the same frame at
//     the same t, which is exactly SynchroAnimate's phase-lock for the synced
//     channels (Rings) and deterministic playback for scripted anims.
//
// NEVER MUTATES anything: overlay/frame-selection only. The document, the
// object list and the sprite stores are inputs; playback writes none of them.

import type { ParsedAnim } from '../import/anim-import';
import {
  resolveObjectAnims, type ObjectAnimLink, type SyncAnimEntry,
} from '../project/profiles/s1-object-anims';

// ---------------------------------------------------------------------------
// The timeline's tick convention
// ---------------------------------------------------------------------------

/**
 * Ticks (1/60s game frames) one step holds, from its RAW script duration byte.
 *
 * THE ENGINE HOLDS EACH FRAME FOR (duration + 1) TICKS: the anim timer is
 * reloaded with the duration byte and counts D..0 before advancing. This is the
 * SAME convention the sprite timeline plays (Timeline.tsx: "Engine holds each
 * frame for (duration + 1) ticks (timer counts D..0 then advances)") and the
 * 2026-08-20 audit's 12.5%-slow bug was exactly a missed +1 — so the unit tests
 * lock this function against the shipped timeline conversion
 * (syncedTimelineAnims stores `framesPerStep - 1` as the raw byte precisely so
 * that +1 plays the true period) rather than trusting the constant here.
 */
export function stepHoldTicks(rawDuration: number): number {
  return rawDuration + 1;
}

// ---------------------------------------------------------------------------
// Curation table
// ---------------------------------------------------------------------------

/**
 * Which animation a placed object's layout preview plays.
 *   • kind 'script': index into the id's parsed `_anim` script table (anim id
 *     order, same indexing the engine's obAnim uses). `anim` may be a function
 *     of (subtype, yflip) where the engine derives obAnim from those.
 *   • kind 'sync': the named SynchroAnimate entry from the id's `sync` list.
 */
export type PreviewAnimRule =
  | { kind: 'script'; anim: number | ((subtype: number, yflip: boolean) => number) }
  | { kind: 'sync'; name: string };

const script = (anim: number | ((subtype: number, yflip: boolean) => number)): PreviewAnimRule =>
  ({ kind: 'script', anim });

/**
 * Object id → preview animation. Every citation is s1disasm `_incObj/…` unless
 * noted; "spawn default" = the file writes no obAnim before its first
 * AnimateSprite call, so the RAM-zeroed obAnim 0 (the script table's first
 * anim) is what the engine shows.
 */
export const S1_PREVIEW_ANIMS: Readonly<Record<number, PreviewAnimRule>> = {
  0x08: script(0), // Water Splash — spawn default (no obAnim write in "08 LZ Water Splash.asm")
  0x0c: script(0), // Flapping Door — spawn default; anim 0 is the flapping loop
  0x0d: script(0), // Signpost — spawn default; anim 0 = resting Eggman plate (spin anims run only after the boss)
  0x14: script(0), // Fireball — spawn default (no obAnim write in "13, 14 MZ, SLZ Fire Balls and Maker.asm" for the child)
  // Harpoon — init copies subtype straight into obAnim: "16 LZ Harpoon.asm":25
  // (`move.b obSubtype(a0),obAnim(a0)` — 0 = sideways, 2 = upright).
  0x16: script((subtype) => subtype),
  0x1e: script(0), // Ball Hog — spawn default; anim 0 = idle hog cycle
  0x1f: script(0), // Crabmeat — spawn default; the walk/fire anims are state-driven later
  0x22: script(1), // Buzz Bomber — locomotion: Buzz_Action_Wait promotes to Move with anim 1 "flying" (:54)
  0x25: { kind: 'sync', name: 'spin' }, // Ring — the Sync2 channel spin (phase-locked across every ring)
  // Monitor — init: "26, 2E Monitors and Power-Ups.asm":62 `move.b
  // obSubtype(a0),obAnim(a0)` ("use subtype as animation ID"): each subtype's
  // anim is the shell/icon flicker (frames 0/1/2 interleaved with the icon
  // frame). Masked to the same nibble the art rule (MONITOR_FRAME) reads.
  0x26: script((subtype) => subtype & 0x0f),
  0x2a: script(0), // SBZ Small Door — spawn default = closed; "opening" (1) is proximity-triggered (:53)
  0x2b: script(0), // Chopper — spawn default; anim 0 "slow" is also its mid-leap state (:49); fast/stationary are height-driven
  0x2c: script(0), // Jaws — spawn default; anim 0 = swimming
  0x2d: script(2), // Burrobot — INIT sets drilling: "2D Badnik - Burrobot.asm":31 `move.b #2,obAnim` right after setup
  0x35: script(0), // Burning Grass — spawn default; anim 0 = burning loop
  0x3d: script(0), // GHZ Boss (Eggman) — spawn default; Ani_Eggman 0 = normal face
  0x40: script(1), // Moto Bug — locomotion: Moto_Action_Ledge promotes to Drive with anim 1 (:86); anim 0 is the transient wait
  0x43: script(2), // Roller — locomotion: rolling anim 2 (:99); it spends its level life rolling
  0x47: script(0), // Bumper — spawn default; anim 0 .idle (single frame); "hit" (1, :50) is the touch event
  0x4b: { kind: 'sync', name: 'spin' }, // Giant Ring — same Sync2 channel as the small rings (in phase with them)
  0x4c: script(0), // Lava Geyser — anim 0 ".bubble1" is the resting bubbling ("4C, 4D MZ Lava Geyser and Maker.asm":115)
  0x4e: script(0), // Wall of Lava — spawn default
  0x50: script(1), // Yadrin — locomotion: walk anim 1 (:107); anim 0 is the transient wait
  0x55: script(0), // Basaran — spawn default; anim 0 = hanging from the ceiling (its resting state)
  0x5f: script(1), // Walking Bomb — locomotion: walking anim 1 (:64); anim 0 is the transient wait
  0x60: script(0), // Orbinaut — spawn default; anim 0 = normal face with orbiting spikeballs ("angry" is a trigger)
  0x64: script(6), // Air Bubbles — INIT: "64 LZ Air Bubbles.asm":44 `move.b #6,obAnim` (.bubmaker, frames $13-$15 — the linked art's own frames)
  0x65: script(0), // Waterfall — spawn default; anim 0 = the falling-water loop
  0x69: script(2), // SBZ Spinning Platform — INIT for the spinner subtype: :47 `move.b #2,obAnim`; the linked art/maps ARE the spinner variant (Map_Spin)
  0x6c: script(0), // Vanishing Platform — spawn default; anim 0 = the vanish/appear cycle
  // Flamethrower — anim by VERTICAL FLIP: "6D SBZ Flamethrower.asm":44 `btst
  // #1,obStatus` → flipped uses the "valve" anims (2), unflipped the pipe (0).
  0x6d: script((_subtype, yflip) => (yflip ? 2 : 0)),
  0x6e: script(0), // Electrocuter — spawn default; "zap" (1, :39) fires periodically from state code
  0x6f: script(0), // Spin Platform Conveyor — anim 0 "spinning" is the steady state (:115); "still" (1) is corner-local
  0x73: script(0), // MZ Boss — Ani_Eggman spawn default
  0x75: script(0), // SYZ Boss — Ani_Eggman spawn default
  0x77: script(0), // LZ Boss — Ani_Eggman spawn default
  0x7a: script(0), // SLZ Boss — Ani_Eggman spawn default
  0x82: script(0), // SBZ Eggman cutscene — spawn default
  0x85: script(0), // FZ Eggman in ship — spawn default
  0x86: script(0), // FZ Plasma Launcher — spawn default (the launcher form the art row links)

  // NAMED EXCLUSIONS — ids with anim links that deliberately stay static:
  //   $01 Sonic — the sonani dialect (audit §1.4), owned by the sprite-timeline
  //       line; the layout preview never animates him.
  //   $17 Spiked Pole Helix — a subtype-rule COMPOSITE of up to $16 segments,
  //       each phase-shifted on the Sync1 channel (obFrame = (v_ani0_frame +
  //       helix_frame) & 7). Animating it needs per-tick piece recomposition
  //       (every segment shows a different frame each step) — deferred; the
  //       static composite stays.
  //   $37 Scattered Rings — its Sync4 channel is an ACCUMULATOR that only runs
  //       while the ring-loss timer does; a placed $37 has no loss timer, so
  //       the honest resting preview is static.
  //   $3E Prison Capsule — its one script anim is the post-stomp switch flash
  //       (frames 1,3), not a resting loop; the capsule rests static.
  //   $41 Springs — idle is a static frame per subtype (the art rule's job);
  //       both script anims are the BOUNCE event (they end in afRoutine).
  //   $42 Newtron — spawn anim 0 is ".blank" (the hidden-lurker frame $A);
  //       the rule-composed static art is the informative preview.
  //   Non-layout ids ($0A countdown, $23 missile, $38 shield, $4A SS entry,
  //   $74 boss fire, $0E/$0F/$80/$87/$8B screens) — spawned children/cutscene
  //   actors, never placed in a level layout.
};

/** A preview animation resolved for one placement. */
export type ResolvedPreviewAnim =
  | { kind: 'script'; animIndex: number; animAsm: string }
  | { kind: 'sync'; entry: SyncAnimEntry };

/**
 * Resolve which animation this placement's preview plays, or null → static.
 * Pure lookup: curation row + the transcribed anim link (resolveObjectAnims).
 */
export function resolvePreviewAnim(
  id: number, subtype: number, yflip: boolean,
): ResolvedPreviewAnim | null {
  const rule = S1_PREVIEW_ANIMS[id];
  if (!rule) return null;
  const link: ObjectAnimLink | undefined = resolveObjectAnims(id);
  if (!link) return null;
  if (rule.kind === 'sync') {
    const entry = link.sync?.find((s) => s.name === rule.name);
    return entry ? { kind: 'sync', entry } : null;
  }
  if (!link.animAsm) return null;
  const animIndex = typeof rule.anim === 'number' ? rule.anim : rule.anim(subtype, yflip);
  return { kind: 'script', animIndex, animAsm: link.animAsm };
}

// ---------------------------------------------------------------------------
// Steps + frame selection
// ---------------------------------------------------------------------------

/** One preview step: a mappings frame (+ per-frame script flips) held for `holdTicks`. */
export interface PreviewStep {
  frame: number;
  xFlip: boolean;
  yFlip: boolean;
  holdTicks: number;
}

/**
 * A playable preview animation. `loopStart` is the step index playback returns
 * to after the last step:
 *   • afEnd ($FF, restart)      → 0 (the whole sequence cycles);
 *   • afBack n ($FE, go back n) → steps.length − n (the engine re-enters n
 *     frames from the end; clamped to 0);
 *   • any other control / none  → steps.length − 1 (the preview plays once and
 *     HOLDS the last frame — afChange/afRoutine/afDelete hand control to state
 *     code a layout preview does not run, so freezing is the honest rendering).
 */
export interface PreviewAnim {
  steps: PreviewStep[];
  loopStart: number;
}

/**
 * Build the preview steps for a resolved script anim. `parsed` is the id's
 * `_anim/*.asm` parsed with parseS1DisasmAnimScript — the SAME parser the
 * sprite timeline's picker loads through — indexed by the resolved animIndex.
 * Null when the index is out of range or the anim has no frames (static).
 */
export function buildScriptPreview(parsed: readonly ParsedAnim[], animIndex: number): PreviewAnim | null {
  const a = parsed[animIndex];
  if (!a || a.frames.length === 0) return null;
  const raw = a.duration === 'dynamic' ? 5 : Math.max(0, a.duration);
  const steps = a.frames.map((f) => ({
    frame: f.index, xFlip: f.xFlip, yFlip: f.yFlip, holdTicks: stepHoldTicks(raw),
  }));
  const loopStart =
    a.control?.kind === 'loop' ? 0
      : a.control?.kind === 'back' ? Math.max(0, steps.length - a.control.count)
        : steps.length - 1;
  return { steps, loopStart };
}

/**
 * Build the preview steps for a synced (SynchroAnimate) entry. Mirrors the
 * timeline conversion EXACTLY (export-sprite's syncedTimelineAnims): the true
 * period N is stored as the raw byte N−1, and stepHoldTicks plays N. The cycle
 * always loops from 0 — a sync channel is a free-running global counter.
 */
export function buildSyncPreview(entry: SyncAnimEntry): PreviewAnim | null {
  if (entry.frames.length === 0) return null;
  return {
    steps: entry.frames.map((f) => ({
      frame: f, xFlip: false, yFlip: false, holdTicks: stepHoldTicks(entry.framesPerStep - 1),
    })),
    loopStart: 0,
  };
}

/**
 * Which step a preview shows at game frame t (60/s since play switched on).
 *
 * Pure function of (anim, t) — no per-object phase, so every placement sharing
 * a strip shows the same frame at the same tick. For the synced entries that
 * IS the engine's behaviour (one global channel counter); for scripted anims
 * it is the deterministic "all spawned at t=0" reading, which keeps identical
 * badniks marching in step.
 */
export function previewStepIndexAt(anim: PreviewAnim, t: number): number {
  const n = anim.steps.length;
  if (n === 0) return 0;
  let intro = 0;
  for (let i = 0; i < anim.loopStart; i++) intro += anim.steps[i].holdTicks;
  if (t < intro) {
    // Walk the intro (played once).
    let acc = 0;
    for (let i = 0; i < anim.loopStart; i++) {
      acc += anim.steps[i].holdTicks;
      if (t < acc) return i;
    }
  }
  let cycle = 0;
  for (let i = anim.loopStart; i < n; i++) cycle += anim.steps[i].holdTicks;
  if (cycle <= 0) return n - 1; // degenerate zero-hold loop: hold the last step
  let rem = (t - intro) % cycle;
  for (let i = anim.loopStart; i < n; i++) {
    rem -= anim.steps[i].holdTicks;
    if (rem < 0) return i;
  }
  return n - 1; // unreachable — rem < cycle by construction
}

/**
 * A compact state key over a set of strips at game frame t: the current step
 * index per strip, joined. The viewport's play clock repaints only when this
 * (or the level-art key) actually changes, so a 60 Hz rAF loop costs nothing
 * on the ticks where no object stepped.
 */
export function objectAnimStateKey(strips: Iterable<[string, PreviewAnim]>, t: number): string {
  const parts: string[] = [];
  for (const [key, anim] of strips) parts.push(`${key}=${previewStepIndexAt(anim, t)}`);
  return parts.join(',');
}
