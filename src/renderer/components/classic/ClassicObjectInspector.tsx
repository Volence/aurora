import React from 'react';
import ObjectInspector from '../shared/ObjectInspector';
import { useClassicObjectInspectorPort } from '../../providers/object-inspector-classic';

/**
 * Classic's object inspector: a two-line adapter over the engine-neutral
 * shared/ObjectInspector, the same shape AeonObjectInspector has on the other
 * side. Everything classic-shaped is in providers/object-inspector-classic —
 * including the classicSetObjects commit, which is why THAT file (not this one)
 * is the entry in classic-surface.test.ts's COMMAND_SITES.
 *
 * The wrapper exists for the subscription, not the markup. The port reads the
 * doc, the selection, the ref, both epochs, the armed id, the tool, the project
 * dir and the object-art version — and the doc's identity churns on every
 * classic command, including undo and redo. Calling the
 * hook one level up, in the facet's panel COLUMN, re-renders the object list's
 * rows and the palette grid beside it on every one of those. In a leaf, only the
 * form that is reading the object re-renders. ChunkLibrary.tsx:12-15 is where
 * this rule is written down.
 *
 * It also makes the subscription collapsible: CollapsibleSection renders
 * `{!collapsed && children}`, so folding the inspector away UNSUBSCRIBES it. A
 * hook called one level up keeps listening to a panel nobody can see.
 */
export default function ClassicObjectInspector(): React.ReactElement {
  return <ObjectInspector port={useClassicObjectInspectorPort()} />;
}
