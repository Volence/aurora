// Renderer facet-module registry (spec §9; stage-2 watch-list #1). A facet
// module supplies the workspace's slot components for one facet id; the
// LevelWorkspace (Task 10) renders registered ∩ profile-granted (the core
// facetsFor rule) and mounts the active facet's slots in its one EditorShell.
//
// id/label/order stay on core FacetDescriptor (core/shell/facets.ts); this
// registry supplies only the renderer-side slot components — do not add a
// label/order field here to "fix" the apparent gap.

import React, { type ComponentType } from 'react';
import { createRegistry, type Registry } from '../../core/shell/registry';
import type { FacetCapability } from '../../core/project/adapter';
import MapViewport from '../components/MapViewport';
import MapStatusBar from '../shell/MapStatusBar';
import { MapFacetDock } from './MapFacetDock';

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

export const facetModules: Registry<FacetModule> = createRegistry<FacetModule>('FacetModule');

/** Idempotent (HMR / repeated boot): register-if-absent, matching the house
 *  pattern used by registerBuiltinFacets and ensureAdaptersRegistered. */
export function registerFacetModule(m: FacetModule): void {
  if (!facetModules.get(m.id)) facetModules.register(m);
}

/** The five map-canvas facets (layout/objects/rings/collision/palette) share
 *  the same Canvas, ToolDock, and StatusBar — only the right panel (and
 *  layout's bottom strip) differ. Do NOT use this for the art facet, which
 *  has its own canvas/dock. */
export function mapFacet(id: FacetCapability, slots: Pick<FacetModule, 'RightPanel' | 'BottomExtra'>): FacetModule {
  return {
    id,
    Canvas: MapViewport,
    ToolDock: () => React.createElement(MapFacetDock, { facet: id }),
    StatusBar: MapStatusBar,
    mapOverlays: true,
    ...slots,
  };
}
