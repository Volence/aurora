// The facet bar: a pill segmented control (spec §11 — tabs are page-shaped with
// a top accent; facets are pills; the two rows must never look alike). Renders
// registered-descriptors ∩ granted ∩ has-module, in descriptor order.

import React from 'react';
import { T } from '../components/ui';
import { facetsFor } from '../../core/shell/facets';
import type { FacetCapability } from '../../core/project/adapter';
import { facetModules } from './facet-registry';
import { useWorkspaceStore } from './workspaceStore';
import { useEditorStore } from '../state/editorStore';
import { toolForFacet } from './facet-tools';

/** Facet switch: remember per-tab facet + fix the tool to the facet's set. */
export function switchFacet(tabId: string, facet: FacetCapability): void {
  useWorkspaceStore.getState().setFacet(tabId, facet);
  useEditorStore.getState().setTool(toolForFacet(facet, useEditorStore.getState().tool));
}

export default function FacetBar({ tabId, granted }: { tabId: string; granted: readonly FacetCapability[] }) {
  const active = useWorkspaceStore((s) => s.facetFor(tabId));
  const visible = facetsFor(granted).filter((f) => facetModules.get(f.id));
  return (
    <div style={styles.bar} role="group" aria-label="Facets">
      {visible.map((f) => (
        <button key={f.id}
          style={{ ...styles.pill, ...(f.id === active ? styles.pillActive : {}) }}
          onClick={() => switchFacet(tabId, f.id)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: { display: 'inline-flex', gap: 2, padding: 2, background: T.raised, borderRadius: 7 },
  pill: { padding: '3px 12px', fontSize: 11, border: 'none', borderRadius: 5,
    background: 'transparent', color: T.textBase, cursor: 'pointer' },
  pillActive: { background: T.surface, color: T.textHi, fontWeight: 600 },
};
