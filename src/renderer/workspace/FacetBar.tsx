// The facet bar: a pill segmented control (spec §11 — tabs are page-shaped with
// a top accent; facets are pills; the two rows must never look alike). Renders
// registered-descriptors ∩ granted ∩ has-a-module-FOR-THIS-ENGINE, in descriptor
// order.
//
// The has-module filter is engine-keyed, not engine-blind: a facet the manifest
// grants but the renderer cannot serve for the open engine gets no pill, so
// there is no chrome that lands on FacetUnavailable when clicked.
//
// Nothing is in that state today — both profiles' grants are fully served (s1's
// `collision` grant, which used to be the standing example, was dropped rather
// than left unbacked). The filter is what keeps the next partly-built engine
// from showing a pill before its module exists, which is the normal way a facet
// arrives: the grant lands in the profile a task before the renderer catches up.

import React from 'react';
import { T } from '../components/ui';
import { facetsFor } from '../../core/shell/facets';
import type { FacetCapability } from '../../core/project/adapter';
import type { OpenEngine } from '../state/open-project';
import { moduleFor } from './facet-registry';
import { useWorkspaceStore } from './workspaceStore';
import { switchFacet } from './facet-tools';

export default function FacetBar(
  { tabId, granted, engine }: {
    tabId: string;
    granted: readonly FacetCapability[];
    engine: OpenEngine | null;
  },
) {
  const active = useWorkspaceStore((s) => s.facetFor(tabId));
  const visible = facetsFor(granted).filter((f) => moduleFor(engine, f.id));
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
  pill: { padding: '3px 12px', fontSize: T.tXs, border: 'none', borderRadius: 5,
    background: 'transparent', color: T.textBase, cursor: 'pointer' },
  pillActive: { background: T.surface, color: T.textHi, fontWeight: T.wSemibold },
};
