// Renderer facet-module registry (spec §9; stage-2 watch-list #1). A facet
// module supplies the workspace's slot components for one facet id; the
// LevelWorkspace (Task 10) renders registered ∩ profile-granted (the core
// facetsFor rule) and mounts the active facet's slots in its one EditorShell.

import type { ComponentType } from 'react';
import { createRegistry, type Registry } from '../../core/shell/registry';
import type { FacetCapability } from '../../core/project/adapter';

export interface FacetModule {
  readonly id: FacetCapability;
  readonly Canvas: ComponentType;
  readonly ToolDock?: ComponentType;
  readonly ToolOptions?: ComponentType;
  readonly RightPanel?: ComponentType;
  readonly BottomExtra?: ComponentType;
  readonly StatusBar?: ComponentType;
}

export const facetModules: Registry<FacetModule> = createRegistry<FacetModule>('FacetModule');

/** Idempotent (HMR / repeated boot): register-if-absent, matching the house
 *  pattern used by registerBuiltinFacets and ensureAdaptersRegistered. */
export function registerFacetModule(m: FacetModule): void {
  if (!facetModules.get(m.id)) facetModules.register(m);
}
