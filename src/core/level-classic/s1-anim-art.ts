// S1 animated level art — the pure-core animation clock for the classic map
// viewport's play toggle (Parcel B of docs/reviews/2026-08-21-s1-viewport-
// lenses-audit.md; every family below is transcribed from s1disasm
// `_inc/AnimateLevelGfx.asm`, read-only, with per-row provenance like
// s1-object-anims.ts).
//
// WHAT THE GAME DOES (audit §1): `AnimateLevelGfx` runs once per frame from
// V-blank and blits raw uncompressed tiles from `artunc/*.unc` into fixed VRAM
// slots. Aurora's tile pool uses the SAME index space (pool index == VRAM tile
// index == block-cell tile index — audit §2.1, s1-io blits at
// `vramTileIndex*32`), so "what the game displays at frame t" reduces to "which
// 32-byte tiles occupy which pool slots at frame t" — which is exactly what
// `animTilePatchesAt` answers.
//
// TIMER CONVENTION (audit §1): every routine does `subq.b #1,time / bpl skip`
// and reloads `#N-1` on underflow, and the v_laniX vars are ZEROED at level
// init — so every family FIRES on the very first frame (0 − 1 underflows) and
// then every N frames. All `t` below are game frames (60/s) since level start.
//
// NEVER MUTATES doc.tiles (audit §2.3): the save path hard-errors on changed
// bytes in an anim range (s1-io.ts:463-500) and playback through the doc would
// poison undo/recompose baselines. Callers compose these patches into their own
// scratch buffers at render time.
//
// Pure core: no canvas, no DOM, no fs — sources are handed in as bytes.

// ---------------------------------------------------------------------------
// Timing descriptors
// ---------------------------------------------------------------------------

export type S1AnimTiming =
  /**
   * Fixed-rate frame cycle: displayed art frame = ((t / hold | 0) + phase) %
   * frames. `phase` covers MZ lava: the routine increments-then-STORES-then-
   * blits (`AnimateLevelGfx.asm:129-138` — `addq.b #1,d0 … move.b d0,frame …
   * mulu`), so the frame on screen at t=0 is 1, not 0.
   */
  | { kind: 'cycle'; hold: number; frames: number; phase?: number }
  /** Explicit step list (frame + hold), for uneven sequences. */
  | { kind: 'sequence'; steps: readonly { frame: number; hold: number }[] }
  /**
   * The SBZ two-state-machine smoke puff (audit §1.3): an 8-state counter
   * stepping every 8 frames — states 1..7 blit 12 tiles from file offset
   * (state-1)*12, state 0 blits the file's first 6 tiles TWICE (blank sky) and
   * arms `delayFrames` of do-nothing. The delay counter and the 8-frame step
   * timer are SEQUENTIAL (delay counts down first, then the step timer), which
   * is where the +8 in smokeStateAt comes from.
   */
  | { kind: 'smoke'; delayFrames: number }
  /**
   * The MZ magma composite (audit §1.2): redrawn every 2 frames from the lava
   * surface's CURRENT frame slice ($200 bytes), 4 columns × 4 vertical tiles,
   * each column byte-shifted by the global oscillator. See magmaTileBytes.
   */
  | { kind: 'magma' };

export interface S1AnimFamily {
  id: string;
  /** Profile zone id (ZoneActRef.zone). Only ghz/mz/sbz animate — LZ/SYZ/SLZ
   *  are AniArt_none (palette cycling only, audit §1). */
  zone: 'ghz' | 'mz' | 'sbz';
  /** Project-relative source file (raw uncompressed 4bpp tiles). */
  file: string;
  /** First pool/VRAM tile slot the family occupies. */
  vramTileIndex: number;
  /** Slots occupied == tiles per art frame. */
  tileCount: number;
  timing: S1AnimTiming;
}

/**
 * The playable families — the complete AniArt_* enumeration for level play.
 * DELIBERATELY EXCLUDED (audit §2.1 trap 3): GHZ's static flower stalk and the
 * four ending-flower profile entries (cutscene-only, AniArt_Ending), the
 * giant-ring streamer (event-driven, not ambient). Provenance: s1disasm
 * `_inc/AnimateLevelGfx.asm` (file sizes verified on disk in the unit tests).
 */
export const S1_ANIM_FAMILIES: readonly S1AnimFamily[] = [
  // GHZ waterfall — AnimateLevelGfx.asm:43-60: reload #6-1, 2 frames (andi #1),
  // 8 tiles @ ArtTile_GHZ_Waterfall ($378). Art_GhzWater (512 B = 2×8×32).
  {
    id: 'ghz-waterfall', zone: 'ghz', file: 'artunc/GHZ Waterfall.unc',
    vramTileIndex: 0x378, tileCount: 8,
    timing: { kind: 'cycle', hold: 6, frames: 2 },
  },
  // GHZ big flower — :62-79: reload #16-1, 2 frames, 16 tiles @ $35C.
  // Art_GhzFlower1 (1024 B = 2×16×32).
  {
    id: 'ghz-flower-large', zone: 'ghz', file: 'artunc/GHZ Flower Large.unc',
    vramTileIndex: 0x35c, tileCount: 16,
    timing: { kind: 'cycle', hold: 16, frames: 2 },
  },
  // GHZ small flower — :81-108: counter masked #3 through .flowerSeq 0,1,2,1
  // (:110-111); frames 0 and 2 re-arm the timer to #128-1, frames 1 keep #8-1
  // → the uneven 272-frame cycle 0(128) 1(8) 2(128) 1(8). 12 tiles @ $36C.
  // Art_GhzFlower2 (1152 B = 3×12×32).
  {
    id: 'ghz-flower-small', zone: 'ghz', file: 'artunc/GHZ Flower Small.unc',
    vramTileIndex: 0x36c, tileCount: 12,
    timing: {
      kind: 'sequence',
      steps: [
        { frame: 0, hold: 128 },
        { frame: 1, hold: 8 },
        { frame: 2, hold: 128 },
        { frame: 1, hold: 8 },
      ],
    },
  },
  // MZ lava surface — :123-143: reload #20-1, 3 frames, 8 tiles @ $2E2; the
  // routine blits the INCREMENTED frame (see the cycle doc above) → phase 1.
  // Art_MzLava1 (768 B = 3×8×32).
  {
    id: 'mz-lava-surface', zone: 'mz', file: 'artunc/MZ Lava Surface.unc',
    vramTileIndex: 0x2e2, tileCount: 8,
    timing: { kind: 'cycle', hold: 20, frames: 3, phase: 1 },
  },
  // MZ magma — :146-176 + AniArt_MZMagma :428-573: 16 tiles @ $2D2, redrawn
  // every 2 frames from Art_MzLava2 (1536 B = 3×$200) at the LAVA SURFACE's
  // stored frame, columns shifted by v_oscillate+$A. NOTE the profile's static
  // entry uses SonLVL's pre-baked `MZ Lava.bin`; playback needs the game's own
  // 3-frame source, which is this file.
  {
    id: 'mz-magma', zone: 'mz', file: 'artunc/MZ Lava.unc',
    vramTileIndex: 0x2d2, tileCount: 16,
    timing: { kind: 'magma' },
  },
  // MZ torch — :178-198: reload #8-1, counter masked `andi.b #3` → 4 frames
  // (the code comment says 3; the mask and the 768 B = 4×6×32 file say 4 —
  // audit §1.1 measured the file). 6 tiles @ $2F2.
  {
    id: 'mz-torch', zone: 'mz', file: 'artunc/MZ Background Torch.unc',
    vramTileIndex: 0x2f2, tileCount: 6,
    timing: { kind: 'cycle', hold: 8, frames: 4 },
  },
  // SBZ smoke puff 1 — :209-256: 12 tiles @ $448, 8-frame steps, 3 s
  // (#3*60, :240) blank gap. Art_SbzSmoke (2688 B = 84 tiles = 7 smoke frames
  // × 12; the blank state reuses tiles 0..5 twice, .clearSky :243-250).
  {
    id: 'sbz-smoke-1', zone: 'sbz', file: 'artunc/SBZ Background Smoke.unc',
    vramTileIndex: 0x448, tileCount: 12,
    timing: { kind: 'smoke', delayFrames: 180 },
  },
  // SBZ smoke puff 2 — :258-291: independent copy of the same machine, 12
  // tiles @ $454, 2 s (#2*60, :288) blank gap.
  {
    id: 'sbz-smoke-2', zone: 'sbz', file: 'artunc/SBZ Background Smoke.unc',
    vramTileIndex: 0x454, tileCount: 12,
    timing: { kind: 'smoke', delayFrames: 120 },
  },
];

/** The playable families for a profile zone id ([] for non-animated zones). */
export function familiesForZone(zone: string): readonly S1AnimFamily[] {
  return S1_ANIM_FAMILIES.filter((f) => f.zone === zone);
}

/**
 * Every pool tile index a zone's PLAYABLE families occupy — the set the
 * viewport uses to find animated cells. Narrower than the profile's
 * `animatedArt` on purpose: the GHZ stalk/ending entries are static or
 * cutscene-only and must NOT animate (audit §2.1).
 */
export function animatedTilesForZone(zone: string): ReadonlySet<number> {
  const set = new Set<number>();
  for (const f of familiesForZone(zone)) {
    for (let i = 0; i < f.tileCount; i++) set.add(f.vramTileIndex + i);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Frame clocks
// ---------------------------------------------------------------------------

/** Displayed art frame at game-frame t for a cycle/sequence family. */
export function stripFrameAt(timing: S1AnimTiming, t: number): number {
  if (timing.kind === 'cycle') {
    return (Math.floor(t / timing.hold) + (timing.phase ?? 0)) % timing.frames;
  }
  if (timing.kind === 'sequence') {
    const period = timing.steps.reduce((n, s) => n + s.hold, 0);
    let u = t % period;
    for (const s of timing.steps) {
      if (u < s.hold) return s.frame;
      u -= s.hold;
    }
  }
  throw new Error(`stripFrameAt: not a strip timing (${timing.kind})`);
}

/**
 * SBZ smoke machine state on screen at game-frame t: 0 = blank sky (the
 * RESTING state — what Aurora's static view shows today), 1..7 = smoke frame.
 *
 * Hand-derived timeline (from the asm; v_lani* zeroed at init): the machine
 * fires on frame 0 with counter 0 → blits BLANK and arms the delay D. The
 * delay decrements on frames 1..D; only then does the 8-frame step timer run,
 * underflowing 8 frames later — so smoke frame 1 lands at t = D+8, frame s at
 * D+8s, and the next blank at D+64, giving period D+64.
 */
export function smokeStateAt(delayFrames: number, t: number): number {
  const first = delayFrames + 8;
  if (t < first) return 0;
  const u = (t - first) % (delayFrames + 64);
  const s = Math.floor(u / 8);
  return s < 7 ? s + 1 : 0;
}

/**
 * File-tile offsets for the 12 smoke slots in a given machine state. States
 * 1..7 read 12 consecutive tiles at (state-1)*12; state 0 blits the file's
 * first 6 tiles TWICE (.clearSky, AnimateLevelGfx.asm:243-250).
 */
export function smokeSlotTiles(state: number): number[] {
  if (state === 0) return [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5];
  const base = (state - 1) * 12;
  return Array.from({ length: 12 }, (_, i) => base + i);
}

// ---------------------------------------------------------------------------
// The MZ magma oscillator (v_oscillate+$A)
// ---------------------------------------------------------------------------
//
// Faithful port of OscillateNumDo for the one channel the magma reads
// (s1disasm `_inc/Oscillatory Routines.asm`): entry at v_oscillate+$A —
// baseline value $0080 / rate 0 (:16-37), direction bit CLEAR in the init
// bitfield %1111100 → starts rising, settings frequency 2 / turnaround byte
// $20 (:91-108). Each frame: rate ± frequency, value += rate (16-bit wrap),
// then compare the value's HIGH byte against $20 to flip direction. The magma
// reads that high byte.
//
// LIVE-VERIFIED (audit addendum, 2026-08-21 overseer run): the byte sweeps
// 0..$3F as a triangle with a 360-frame period, exact — frames 4400 and 4760
// of the GHZ demo read identically. The unit tests pin period and range.

interface OscState { v: number; r: number; down: boolean }

const oscBytes: number[] = [];
let oscPeriod: number | null = null;
const oscState: OscState = { v: 0x80, r: 0, down: false };

function oscStep(s: OscState): void {
  if (!s.down) {
    s.r = (s.r + 2) & 0xffff;
    s.v = (s.v + s.r) & 0xffff;
    if (((s.v >> 8) & 0xff) >= 0x20) s.down = true; // `cmp.b value,d4 / bhi` — flip when byte reaches $20
  } else {
    s.r = (s.r - 2) & 0xffff;
    s.v = (s.v + s.r) & 0xffff; // 16-bit wrap == 68k signed add
    if (((s.v >> 8) & 0xff) < 0x20) s.down = false; // `bls` — flip when byte drops below $20
  }
}

/**
 * The oscillator byte the magma reads at game-frame t (OscillateNumDo runs in
 * the main loop BEFORE the V-blank art blit, so frame t samples the value
 * after t+1 updates from the OscillateNumInit baseline). Memoized; once the
 * state returns to the init state the sequence is served by modulo.
 */
export function mzOscByteAt(t: number): number {
  if (oscPeriod !== null) return oscBytes[t % oscPeriod];
  while (oscBytes.length <= t) {
    oscStep(oscState);
    oscBytes.push((oscState.v >> 8) & 0xff);
    if (oscState.v === 0x80 && oscState.r === 0 && !oscState.down) {
      oscPeriod = oscBytes.length; // returned to the init state → periodic from 0
      return oscBytes[t % oscPeriod];
    }
  }
  return oscBytes[t];
}

// ---------------------------------------------------------------------------
// The MZ magma composite blit
// ---------------------------------------------------------------------------

/**
 * Compose the 16 magma tiles (4 columns × 4 vertical tiles, the exact VRAM
 * write order of AniArt_MZ_Magma) from one $200-byte source frame slice and
 * the oscillator byte.
 *
 * Byte-exact model of AniArt_MZMagma (AnimateLevelGfx.asm:428-573): for
 * column c, the routine index is ((osc + 4c) * 2) & $1E — i.e. shift
 * k = (osc + 4c) & $F — and the routine copies, for each of the $20 source
 * lines ($10 bytes/line), the 4 bytes at positions k..k+3 MOD $10 (the 16
 * routines are exactly the 16 wraparound cases). Destination column c fills
 * tiles c*4..c*4+3 sequentially, 4 bytes per tile line.
 */
export function magmaTileBytes(frameSlice: Uint8Array, oscByte: number): Uint8Array {
  const out = new Uint8Array(16 * 32);
  for (let c = 0; c < 4; c++) {
    const k = (oscByte + 4 * c) & 0x0f;
    for (let line = 0; line < 32; line++) {
      const srcRow = line * 0x10;
      const dst = c * 128 + line * 4;
      for (let j = 0; j < 4; j++) {
        out[dst + j] = frameSlice[srcRow + ((k + j) & 0x0f)] ?? 0;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The clock's outputs
// ---------------------------------------------------------------------------

/**
 * Cheap redraw signature: the concatenation of every family's on-screen state
 * at game-frame t. The play loop repaints only when this changes — GHZ steps
 * at most every 6 frames, MZ every 2 (the magma), SBZ every 8.
 */
export function animStateKey(zone: string, t: number): string {
  const parts: string[] = [];
  for (const f of familiesForZone(zone)) {
    if (f.timing.kind === 'smoke') {
      parts.push(`${f.id}:${smokeStateAt(f.timing.delayFrames, t)}`);
    } else if (f.timing.kind === 'magma') {
      const te = t - (t % 2); // magma redraws on even frames (reload #2-1)
      // The shift only reads osc & $F (magmaTileBytes), so key on that — a
      // full-byte key would demand redraws that change no pixel.
      parts.push(`${f.id}:${lavaFrameAt(zone, te)}:${mzOscByteAt(te) & 0x0f}`);
    } else {
      parts.push(`${f.id}:${stripFrameAt(f.timing, t)}`);
    }
  }
  return parts.join('|');
}

/** The MZ lava-surface frame the magma is phase-locked to (v_lani0_frame). */
function lavaFrameAt(zone: string, t: number): number {
  const lava = familiesForZone(zone).find((f) => f.id === 'mz-lava-surface');
  if (!lava || lava.timing.kind === 'smoke' || lava.timing.kind === 'magma') return 0;
  return stripFrameAt(lava.timing, t);
}

export interface AnimTilePatch {
  /** First pool tile index the patch covers. */
  start: number;
  /** Raw 4bpp tile bytes (count*32) currently occupying those slots. */
  bytes: Uint8Array;
}

/**
 * The tile bytes occupying every playable animated slot at game-frame t.
 * `sources` maps a family's `file` to its raw bytes; families whose source is
 * absent are skipped (the caller decides whether that is fatal). Never touches
 * doc.tiles — callers blit these into their own scratch.
 */
export function animTilePatchesAt(
  zone: string,
  t: number,
  sources: ReadonlyMap<string, Uint8Array>,
): AnimTilePatch[] {
  const out: AnimTilePatch[] = [];
  for (const f of familiesForZone(zone)) {
    const src = sources.get(f.file);
    if (!src) continue;
    if (f.timing.kind === 'smoke') {
      const state = smokeStateAt(f.timing.delayFrames, t);
      const bytes = new Uint8Array(f.tileCount * 32);
      smokeSlotTiles(state).forEach((srcTile, i) => {
        bytes.set(src.subarray(srcTile * 32, srcTile * 32 + 32), i * 32);
      });
      out.push({ start: f.vramTileIndex, bytes });
    } else if (f.timing.kind === 'magma') {
      const te = t - (t % 2);
      const frame = lavaFrameAt(zone, te);
      const slice = src.subarray(frame * 0x200, frame * 0x200 + 0x200);
      out.push({ start: f.vramTileIndex, bytes: magmaTileBytes(slice, mzOscByteAt(te)) });
    } else {
      const frame = stripFrameAt(f.timing, t);
      const byteOff = frame * f.tileCount * 32;
      out.push({ start: f.vramTileIndex, bytes: src.slice(byteOff, byteOff + f.tileCount * 32) });
    }
  }
  return out;
}
