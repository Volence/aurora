// src/core/art/canvas-profiles.ts
//
// Spec §4.2's preset table as DATA. A canvas document names one; the canvas
// draws the grids it names; canvas-constraints.ts evaluates the rest and the
// canvas pane shows the violations.
//
// PRESETS, NOT A RULE BUILDER. Multipaint, GrafX2 and GB Studio all ship a fixed
// menu of target machines and none of them expose custom rule authoring —
// shipping a schema editor would be unusual, not standard (spec §4.2). Individual
// rules are exposed as toggles in the UI; they are still just overrides on top of
// a preset, which is why this is a table and not a class.
//
// Pure data — no evaluation lives here. canvas-constraints.ts evaluates it.

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
  /** Every 8x8 cell must draw from ONE palette line. Evaluated by
   *  `findCellClashes` in canvas-constraints.ts. */
  cellPaletteRule: boolean;
  /** Sprite-hardware limits. 2B evaluates ONLY the 4x4-tile frame bound, as a
   *  readout — see evaluateCanvasConstraints. The per-scanline (20 sprites,
   *  320px) and per-frame (80) limits are properties of an ASSEMBLED FRAME with
   *  mappings, which a single indexed image does not have; they belong to sprite
   *  commit. Owner-confirmed departure from spec §4.2's "evaluated in 2B",
   *  2026-08-15. */
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
 *
 * The lookup is `hasOwnProperty`-gated rather than a bare index + `??`: an
 * untrusted string can name an inherited `Object.prototype` member —
 * `'toString'`, `'constructor'`, `'__proto__'`, `'valueOf'`,
 * `'hasOwnProperty'` itself — which is a real, non-nullish property of the
 * `CONSTRAINT_PROFILES` object without being a table entry. `??` does not
 * catch that: it only fires on null/undefined, and `CONSTRAINT_PROFILES.toString`
 * is a function, not undefined. Left unguarded, that function comes back typed
 * as `ConstraintProfile` and the corruption surfaces wherever the caller next
 * reads `.cellPaletteRule` or `.grids`, far from this function.
 */
export function constraintProfile(id: string): ConstraintProfile {
  return Object.prototype.hasOwnProperty.call(CONSTRAINT_PROFILES, id)
    ? CONSTRAINT_PROFILES[id as ConstraintProfileId]
    : CONSTRAINT_PROFILES.none;
}
