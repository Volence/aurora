// Facet modules are keyed by (engine, facetId). A facet's IDENTITY — id, label,
// order — stays neutral on core FacetDescriptor (core/shell/facets.ts); this
// registry supplies only SLOTS, and slots genuinely differ per engine until each
// one converges. A module may register for several engines, so a converged facet
// is still written once.
//
// This replaces the Canvas-only facetCanvases registry (spec §3.1, which assumed
// only the Canvas differs). §3.0.1 corrected that: ~10 slot components were
// aeon-store-coupled, several calling executeCommand, which THROWS for a non-aeon
// document. Two registries could not express that, and the Canvas-only version
// fell back to aeon's module for an unregistered pair — silently rendering aeon's
// MapViewport against an empty projectStore. There is no fallback now: an
// unregistered pair resolves to null and the workspace says so.

import React, { type ComponentType } from 'react';
import type { FacetCapability } from '../../core/project/adapter';
import type { OpenEngine } from '../state/open-project';
import MapViewport from '../components/MapViewport';
import MapStatusBar from '../components/shared/MapStatusBar';
import { useAeonMapStatusPort } from '../providers/map-status-aeon';
import { MapFacetDock } from './MapFacetDock';

/** The neutral status bar bound to aeon's port. Classic gets the same bar over
 *  providers/map-status-classic.ts once it renders through this workspace. */
function AeonMapStatusBar(): React.ReactElement {
  return React.createElement(MapStatusBar, { port: useAeonMapStatusPort() });
}

export interface FacetModule {
  readonly id: FacetCapability;
  readonly Canvas: ComponentType;
  readonly ToolDock?: ComponentType;
  readonly ToolOptions?: ComponentType;
  readonly RightPanel?: ComponentType;
  readonly BottomExtra?: ComponentType;
  readonly StatusBar?: ComponentType;
  /**
   * True for the facets whose canvas is the shared map viewport — i.e. the ones
   * `viewStore.overlays` actually paints on. The workspace header shows the View
   * menu only for those; the art facet's canvas ignores overlays entirely, so a
   * toggle there would be a control that visibly does nothing.
   */
  readonly mapOverlays?: boolean;
}

const key = (engine: OpenEngine, facet: FacetCapability) => `${engine}:${facet}`;

/**
 * A composite-key store, deliberately NOT core/shell/registry's createRegistry.
 * Not because that helper cannot hold a composite key — it is generic over
 * `RegistryItem` and would happily store `{ id: 'aeon:layout', module }`. The
 * reason is that the key here is NOT a property of the thing being stored: one
 * module registers under several engines, so `id` cannot be the composite. Using
 * the helper would mean a wrapper type per entry and a `get('aeon:layout')`
 * whose string every caller has to build by hand, instead of `get(engine, facet)`.
 */
class FacetModuleRegistry {
  private modules = new Map<string, FacetModule>();

  /** Register-if-absent (HMR / repeated boot), matching the house pattern used
   *  by registerBuiltinFacets and ensureAdaptersRegistered. */
  register(engine: OpenEngine, m: FacetModule): void {
    const k = key(engine, m.id);
    if (!this.modules.has(k)) this.modules.set(k, m);
  }

  get(engine: OpenEngine | null, facet: FacetCapability): FacetModule | null {
    if (!engine) return null;
    return this.modules.get(key(engine, facet)) ?? null;
  }

  /** Test support only. */
  clear(): void { this.modules.clear(); }
}

export const facetModules = new FacetModuleRegistry();

/** Register one module for every engine that renders this facet that way. */
export function registerFacetModule(engines: readonly OpenEngine[], m: FacetModule): void {
  // An empty list registers nothing and the facet silently loses its pill —
  // indistinguishable from "not built yet" at every call site. Registration is
  // controlled startup code, so this is always a bug (core/shell/registry.ts's
  // house rule, and the reason that helper throws on a duplicate id).
  if (engines.length === 0) {
    throw new Error(`FacetModule '${m.id}' was registered for no engines`);
  }
  for (const engine of engines) facetModules.register(engine, m);
}

/** The module for an (engine, facet) pair, or null when none is registered —
 *  null rather than throwing, because a facet may legitimately have no module
 *  for an engine until that engine is re-homed. */
export function moduleFor(
  engine: OpenEngine | null, facet: FacetCapability,
): FacetModule | null {
  return facetModules.get(engine, facet);
}

/**
 * The five map-canvas facets (layout/objects/rings/collision/palette) share a
 * canvas, dock and status bar — only the right panel (and layout's bottom strip)
 * differ. Do NOT use this for the art facet, which has its own canvas/dock.
 *
 * THE DEFAULTS ARE AEON-BOUND. `Canvas` is aeon's MapViewport and `StatusBar`
 * reads `useAeonMapStatusPort()`, which resolves off `projectStore.project` —
 * null for a classic open, so it would render aeon vocabulary ('Section 0') over
 * an empty store rather than throwing. An engine reusing this shape MUST pass
 * its own `Canvas` and `StatusBar` in `slots`; that is why they are in the slots
 * object (spread last, so it overrides) rather than a positional parameter that
 * can only reach one of them.
 *
 * `ToolDock` is the exception: MapFacetDock is already engine-neutral — it reads
 * the shared `editorStore.tool`, and `toolsForFacet` resolves the button set
 * from the OPEN engine's `facetTools`. It is overridable for uniformity, not
 * because classic needs to.
 */
export function mapFacet(
  id: FacetCapability,
  // Partial, not a bare Pick: FacetModule.Canvas is required, so a bare Pick
  // would force every existing aeon call site to restate the default.
  slots: Partial<Pick<FacetModule, 'Canvas' | 'ToolDock' | 'StatusBar' | 'RightPanel' | 'BottomExtra'>>,
): FacetModule {
  return {
    id,
    Canvas: MapViewport,
    ToolDock: () => React.createElement(MapFacetDock, { facet: id }),
    StatusBar: AeonMapStatusBar,
    mapOverlays: true,
    ...slots,
  };
}
