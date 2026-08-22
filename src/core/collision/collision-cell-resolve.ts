import type { CollisionProfile, CollisionProfileSet } from './collision-model';
import { isKnownProfile } from './collision-model';
import { unpackCollisionCell, packCollisionCell } from './collision-cell-word';
import { flipProfile } from './collision-flip';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { Section } from '../model/s4-types';

export interface ResolvedCell {
  /** The base-bank shape index (bits 0-9 of the word). */
  shape: number;
  air: boolean;
  /** True when the shape is a real in-range base-bank profile. */
  known: boolean;
  /** The profile to DRAW — base shape mirrored by the word's flips and with the
   *  word's solidity substituted. null when air or no tables loaded. */
  profile: CollisionProfile | null;
}

/** Decode one packed cell word against the base-bank set into a drawable form. */
export function resolveCell(set: CollisionProfileSet | null, word: number): ResolvedCell {
  const c = unpackCollisionCell(word);
  if (c.shape === 0) return { shape: 0, air: true, known: false, profile: null };
  if (!isKnownProfile(set, c.shape)) {
    return { shape: c.shape, air: false, known: false, profile: null };
  }
  const base = set!.profiles[c.shape];
  const flipped = flipProfile(base, c.xFlip, c.yFlip);
  return { shape: c.shape, air: false, known: true, profile: { ...flipped, solidity: c.solidity } };
}

/** How many cell words one section's collision plane holds.
 *
 *  This is not a convenience alias — it is the SAME expression the plane's
 *  consumers index it with, so the bound and the buffer cannot drift:
 *    - `OverlayRenderer.drawCollisionOverlay` samples
 *      `(cr * 2) * SECTION_TILES_WIDE + (cc * 2)` for `cr < SECTION_TILES_HIGH / 2`
 *      and `cc < SECTION_TILES_WIDE / 2`;
 *    - `MapViewport`'s hover readout samples `cellRow * SECTION_TILES_WIDE + cellCol`
 *      over the same cell space.
 *  Both address `[0, SECTION_TILES_WIDE * SECTION_TILES_HIGH)`, whatever length
 *  the stored arrays happen to have. Call sites must pass THIS to
 *  `resolvePlaneWords`, never an array's own `.length`: deriving the bound from
 *  the very data being bounded is how a short plane stays short (and how a short
 *  plane A silently set the bound for plane B). */
export const SECTION_PLANE_WORDS = SECTION_TILES_WIDE * SECTION_TILES_HIGH;

/** Distinct length mismatches already reported, so a per-frame render path
 *  states the fault once instead of flooding the console. */
const reportedPlaneLengths = new Set<string>();

/** Test-only: forget which mismatches have been reported. */
export function resetPlaneLengthReports(): void {
  reportedPlaneLengths.clear();
}

/** A plane arrived at a length its consumers do not address. This is always a
 *  producer bug: say so, loudly and once. (The render path must not throw —
 *  `OverlayRenderer.render` draws every section's grids, rings and objects in
 *  the same call, and `MapViewport`'s hover readout runs inside a mousemove
 *  handler, so a throw here would take out far more than the bad plane.) */
function reportPlaneLength(source: 'edit' | 'engine', got: number, want: number): void {
  const key = `${source}:${got}:${want}`;
  if (reportedPlaneLengths.has(key)) return;
  reportedPlaneLengths.add(key);
  const consequence = got < want
    ? `words ${got}..${want - 1} are missing and render as air`
    : 'the tail past the addressed range is unreachable';
  console.error(
    `[COLLISION_PLANE_LENGTH] ${source} plane has ${got} cell words; this section addresses ${want} — ${consequence}. A producer wrote a plane of the wrong size.`,
  );
}

/** Unify a plane's two possible sources into one Uint16 cell-word array the
 *  overlay can iterate. Prefers the editable plane (already packed words); else
 *  packs the read-only engine baseline (raw base-bank indices, solidity 'all',
 *  no flip); else a fully-air zero array.
 *
 *  The result is always safe to index at every `0 <= i < length`. A SHORT
 *  editable plane used to be handed back verbatim, so consumers iterating the
 *  `length` they asked for read `undefined` past its end — and `undefined`
 *  unpacks to shape 0, so a missing region rendered as *air* with nothing said,
 *  while the A/B diff read `undefined !== word` as "these planes disagree" and
 *  outlined every one of those cells. It is now padded to `length` with
 *  `AIR_CELL` — the same fill this function already uses for an absent plane —
 *  and the mismatch is reported. An over-long plane is passed through untouched
 *  (harmless: consumers never index past `length`) but is still reported.
 *  Refusing the load is the LOADER's job (aeon/load.ts checks the collattr byte
 *  length against the section's own baseline); this is the last line, not the
 *  gate. */
export function resolvePlaneWords(
  edit: Uint16Array | null | undefined,
  engine: Uint8Array | null | undefined,
  length: number,
): Uint16Array {
  if (edit) {
    if (edit.length >= length) {
      if (edit.length > length) reportPlaneLength('edit', edit.length, length);
      return edit; // exact match is the hot path: no copy, no allocation
    }
    reportPlaneLength('edit', edit.length, length);
    const padded = new Uint16Array(length); // tail is AIR_CELL by construction
    padded.set(edit);
    return padded;
  }
  const out = new Uint16Array(length);
  if (engine) {
    if (engine.length !== length) reportPlaneLength('engine', engine.length, length);
    for (let i = 0; i < length; i++) {
      const idx = engine[i] ?? 0;
      out[i] = idx === 0 ? 0 : packCollisionCell({ shape: idx, xFlip: false, yFlip: false, solidity: 'all' });
    }
  }
  return out;
}

/** Lazily seed a section's editable collision planes (packing each plane's
 *  engine baseline into cell words) the first time either is touched by a
 *  write path — paint, stamp, or the agent's stamp handler. Idempotent: a
 *  plane that's already seeded is left untouched. Seeds BOTH planes even when
 *  only one is about to be written (paint's per-plane seed used to leave the
 *  other plane null until it was separately touched — seeding both up front is
 *  strictly safer, since the data is identical either way, and keeps every
 *  write path from drifting on which plane got seeded when). */
export function ensureCollisionPlanes(section: Section): void {
  const n = SECTION_PLANE_WORDS;
  if (!section.collisionEdit) section.collisionEdit = resolvePlaneWords(null, section.engineCollision, n);
  if (!section.collisionEditB) section.collisionEditB = resolvePlaneWords(null, section.engineCollisionB, n);
}
