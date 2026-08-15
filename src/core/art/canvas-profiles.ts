// src/core/art/canvas-profiles.ts
//
// Spec §4.2's preset table as DATA. A canvas document names one; the canvas
// draws the grids it names; plan 2B evaluates the rest and shows violations.
//
// PRESETS, NOT A RULE BUILDER. Multipaint, GrafX2 and GB Studio all ship a fixed
// menu of target machines and none of them expose custom rule authoring —
// shipping a schema editor would be unusual, not standard (spec §4.2). Individual
// rules are exposed as toggles in the UI; they are still just overrides on top of
// a preset, which is why this is a table and not a class.
//
// Pure data — no evaluation lives here.

export type ConstraintProfileId =
  | 'genesis-level-art' | 'genesis-sprite' | 'genesis-unrestricted' | 'none';

export interface ConstraintProfile {
  id: ConstraintProfileId;
  label: string;
  /** Bits per RGB channel the colour space snaps to. 3 = the Genesis' 512. */
  colorBitsPerChannel: number;
  /** Palette lines available for drawing (a sprite may only use one). */
  paletteLines: number;
  lineLength: number;
  /** Entry index that is the backdrop in every line. */
  transparentIndex: number;
  /** Every 8x8 cell must draw from ONE palette line. Evaluated in 2B. */
  cellPaletteRule: boolean;
  /** Sprite-hardware limits: 4x4 tiles max, 20 sprites & 320 px per scanline,
   *  80 per frame. Evaluated in 2B. */
  spriteLimits: boolean;
  /** Grid overlay pitches, in pixels, coarsest last. */
  grids: number[];
}

const GENESIS_COLOR_BITS = 3;

export const CONSTRAINT_PROFILES: Record<ConstraintProfileId, ConstraintProfile> = {
  'genesis-level-art': {
    id: 'genesis-level-art', label: 'Genesis level art',
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 4, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: true, spriteLimits: false,
    grids: [8, 16, 256],
  },
  'genesis-sprite': {
    id: 'genesis-sprite', label: 'Genesis sprite',
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 1, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: true, spriteLimits: true,
    grids: [8, 16],
  },
  'genesis-unrestricted': {
    id: 'genesis-unrestricted', label: 'Genesis unrestricted',
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 4, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: false, spriteLimits: false,
    grids: [8, 16],
  },
  none: {
    id: 'none', label: 'No constraints',
    // The canvas still STORES CRAM words — "none" means nothing is checked, not
    // that the document changes shape.
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 4, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: false, spriteLimits: false,
    grids: [8],
  },
};

/** Menu order (spec §4.2). */
export const CONSTRAINT_PROFILE_IDS: ConstraintProfileId[] = [
  'genesis-level-art', 'genesis-sprite', 'genesis-unrestricted', 'none',
];

/**
 * The profile for an id, falling back to `none` for anything unrecognised. Takes
 * a plain `string`, not `ConstraintProfileId` — a sidecar written by a future
 * Aurora yields a string, not a member of this build's union, and the right
 * answer is to open the art unconstrained, not to refuse to open it because the
 * name doesn't type-check.
 */
export function constraintProfile(id: string): ConstraintProfile {
  return CONSTRAINT_PROFILES[id as ConstraintProfileId] ?? CONSTRAINT_PROFILES.none;
}
