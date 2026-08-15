// ONE SCAN PER GESTURE, SHARED. The readout (CanvasMode) and the clash overlay
// (CanvasHost) want the same report from the same inputs. A useMemo in each
// would scan the buffer twice, because React memoises per component instance —
// so the sharing has to happen outside React, here.
//
// A single entry is the right size. There is exactly one canvas editor showing
// exactly one document, and the inputs change together (a stroke replaces the
// buffer); a bigger cache would hold reports for documents nobody is looking at.

import type { PixelBuffer } from '../../core/art/pixel-ops';
import type { ConstraintProfile } from '../../core/art/canvas-profiles';
import type { CanvasGridOrigin } from '../../core/art/canvas-doc';
import {
  evaluateCanvasConstraints, type CanvasConstraintReport,
} from '../../core/art/canvas-constraints';

interface Entry {
  pixels: PixelBuffer; profileId: string; originX: number; originY: number;
  report: CanvasConstraintReport;
}
let entry: Entry | null = null;
let scans = 0;

/** Scan count since the last reset (tests only) — the only way to assert that
 *  the cache actually caches rather than merely returning correct answers. */
export function __constraintsScanCount(): number { return scans; }
export function __resetConstraintsCache(): void { entry = null; scans = 0; }

/**
 * The report for these inputs, scanning only when they have changed.
 *
 * The buffer is compared BY IDENTITY — canvasStore replaces it wholesale on
 * every committed gesture and never mutates in place (see `setPixels`'s
 * ownership note), so identity is exact here and a content comparison would
 * cost as much as the scan it is trying to avoid.
 *
 * The origin is compared BY VALUE. `cloneCanvasDoc` hands out a fresh
 * `{originX, originY}` on every clone, so an identity test would miss on every
 * call and scan per render while looking like a cache.
 *
 * The PALETTE is not part of the key, and does not need to be: every rule in
 * canvas-constraints.ts is about lines and entries, never about colour values
 * (see its header). Recolouring a document therefore reuses the cached report,
 * which is correct rather than merely cheap.
 */
export function cachedConstraints(input: {
  pixels: PixelBuffer; profile: ConstraintProfile; origin: CanvasGridOrigin;
}): CanvasConstraintReport {
  const { pixels, profile, origin } = input;
  if (entry
    && entry.pixels === pixels
    && entry.profileId === profile.id
    && entry.originX === origin.originX
    && entry.originY === origin.originY) {
    return entry.report;
  }
  scans++;
  const report = evaluateCanvasConstraints({ pixels, profile, origin });
  entry = {
    pixels, profileId: profile.id, originX: origin.originX, originY: origin.originY, report,
  };
  return report;
}
