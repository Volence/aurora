// The one definition of "what the drawing config is", plus the one statement of
// which tools a tile editor may hand to the PixelEditController.
//
// WHY THIS EXISTS: `artStore.tool` is a CROSS-ENGINE SINGLETON. The store holds
// eleven tools; the controller implements eight. The other three — 'tile-stamp',
// 'collision', 'palette-apply' — are tile-space: they act on a document CELL, not
// a pixel, and aeon's composer routes them around the controller entirely through
// PixelViewport's `hostPointer` escape hatch. Nothing resets `tool` when the open
// project changes engines, so arming 'tile-stamp' on aeon's Art facet and then
// opening a classic project leaves classic's tile editor holding a tool its
// controller has no case for. Coercing once here — at the single seam every host
// builds its config through — is cheaper and harder to forget than a guard in
// every host, and it keeps the fallback identical across engines instead of each
// canvas inventing its own.
//
// `toolConfigFrom` takes a PLAIN OBJECT of the fields it needs, never the store:
// this module lives in src/core, which must not import from src/renderer (the
// layering is strictly one-way — see the note at src/core/project/adapter.ts:87 —
// and nothing enforces it mechanically, so it holds only by being written down).
// That also keeps the builder pure and node-testable, which the renderer's
// canvas-bound code is not.
//
// 'pencil' is the fallback because it is the tool the store itself starts on and
// the only one whose behaviour is fully predictable with no further state: it
// writes the selected colour at the pointer. A tile-space tool arriving here is
// a stale-selection artefact, not a user asking to draw, so the coercion should
// pick the least surprising thing rather than, say, silently no-op.

import type { ArtTool, ToolConfig } from './pixel-edit-controller';
import type { DitherPattern, MirrorMode } from './pixel-ops';

/**
 * The pixel tools a tile editor may arm — exactly the controller's `ArtTool`
 * union, as a runtime list, in tool-dock order.
 *
 * Deliberately declared `as const` and NOT annotated `readonly ArtTool[]`: the
 * annotation would widen the element type to the whole union and quietly defeat
 * the reverse drift check (`Exclude<ArtTool, this list>` would collapse to
 * `never` no matter what the list contains). Keeping the literal tuple type lets
 * __tests__/tool-config.test.ts assert BOTH directions at compile time — no
 * extra member, and no controller tool missing — and tsconfig includes `src/**`,
 * so `tsc --noEmit` fails the build on either kind of drift.
 *
 * THE LIMIT OF THAT GUARD: it pins this list against the CONTROLLER's `ArtTool`
 * only. It says nothing about the STORE's `ArtTool` (artStore.ts), which is the
 * wider union callers actually pass. If the store grows a 12th tool it compiles
 * silently here and coerces to 'pencil' — where the inline `const ctlTool:
 * CtlArtTool` this replaced would have failed to compile and forced a decision.
 * That trade is deliberate: silent-coerce is the RIGHT answer for a new
 * tile-space tool (the common case, and what the three existing ones want), and
 * typing the parameter to the store's union is impossible from core anyway under
 * the layering rule below. But a new PIXEL tool added to the store and not to
 * this list would go quietly dead, drawing pencil strokes instead. If you add a
 * pixel tool, it goes in the controller's union first — that path IS guarded.
 */
export const CLASSIC_TILE_TOOLS =
  ['pencil', 'eraser', 'fill', 'eyedropper', 'line', 'rect', 'select', 'dither'] as const;

/** True when `t` is a tool the PixelEditController can actually execute. */
export function isPixelTool(t: string): boolean {
  return (CLASSIC_TILE_TOOLS as readonly string[]).includes(t);
}

/**
 * The fields a host reads off `artStore` to describe a drawing gesture. Named
 * with the store's spelling (`selectedColor`) rather than the controller's
 * (`color`) so a caller can pass the store slice straight through; renaming that
 * one field is this builder's other job.
 */
export interface ToolConfigSource {
  tool: string;
  selectedColor: number;
  mirror: MirrorMode | null;
  ditherPattern: DitherPattern;
  ditherSecondary: number;
  pixelPerfect: boolean;
}

/**
 * Build the controller's `ToolConfig`, coercing a tile-space tool to 'pencil'.
 *
 * Every modifier passes through verbatim — the coercion touches `tool` alone, so
 * a host that swaps back to a pixel tool mid-session finds its mirror/dither
 * settings exactly as it left them.
 */
export function toolConfigFrom(source: ToolConfigSource): ToolConfig {
  return {
    tool: isPixelTool(source.tool) ? (source.tool as ArtTool) : 'pencil',
    color: source.selectedColor,
    mirror: source.mirror,
    ditherPattern: source.ditherPattern,
    ditherSecondary: source.ditherSecondary,
    pixelPerfect: source.pixelPerfect,
  };
}
