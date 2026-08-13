// The Canvas slot is the ONE part of a facet that is genuinely engine-specific:
// classic's map is a chunk-id grid, aeon's is a section nametable, and no
// abstraction over both is worth building. Everything else about a facet — its
// id, label, order, and (eventually) its other slots — stays engine-neutral on
// facetModules.
//
// Deliberately NOT folded into FacetModule: a facet is one concept with one
// label and one order across engines; only its canvas differs. Keying the whole
// module by engine would duplicate that shared identity per engine.
//
// SCOPE: only the Canvas is keyed here. The other slots on FacetModule import
// aeon stores directly and several call executeCommand (spec §3.0.1), so they
// are NOT engine-neutral yet; neutralising them is a separate, per-component
// step. Registering a classic canvas alone would not make a classic facet work.

import type { ComponentType } from 'react';
import type { FacetCapability } from '../../core/project/adapter';
import type { OpenEngine } from '../state/open-project';

const key = (engine: OpenEngine, facet: FacetCapability) => `${engine}:${facet}`;

class FacetCanvasRegistry {
  private canvases = new Map<string, ComponentType>();

  /** Register-if-absent (HMR / repeated boot), matching registerFacetModule. */
  register(engine: OpenEngine, facet: FacetCapability, Canvas: ComponentType): void {
    const k = key(engine, facet);
    if (!this.canvases.has(k)) this.canvases.set(k, Canvas);
  }

  get(engine: OpenEngine | null, facet: FacetCapability): ComponentType | null {
    if (!engine) return null;
    return this.canvases.get(key(engine, facet)) ?? null;
  }

  /** Test support only. */
  clear(): void { this.canvases.clear(); }
}

export const facetCanvases = new FacetCanvasRegistry();

export function registerFacetCanvas(
  engine: OpenEngine, facet: FacetCapability, Canvas: ComponentType,
): void {
  facetCanvases.register(engine, facet, Canvas);
}

/** The canvas for an (engine, facet) pair, or null when none is registered —
 *  null rather than throwing, because a facet may legitimately have no canvas
 *  for an engine until that engine is re-homed. */
export function canvasFor(
  engine: OpenEngine | null, facet: FacetCapability,
): ComponentType | null {
  return facetCanvases.get(engine, facet);
}
