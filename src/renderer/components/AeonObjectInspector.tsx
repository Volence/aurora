import React from 'react';
import ObjectInspector from './shared/ObjectInspector';
import { useAeonObjectInspectorPort } from '../providers/object-inspector-aeon';

/**
 * Aeon's object inspector: a two-line adapter over the engine-neutral
 * shared/ObjectInspector, exactly the shape AeonPropertiesPanel and ChunkLibrary
 * use. Everything aeon-shaped is in providers/object-inspector-aeon.
 *
 * The wrapper exists for the subscription, not the markup. The port subscribes
 * to `editorStore.liveEditVersion`, which is bumped ON EVERY MOUSEMOVE of an
 * object drag; called one level up in the objects facet's panel component, that
 * re-rendered the WHOLE right-hand column — the object list's ~82 rows included
 * — per mouse event. In a leaf, the drag re-renders only the form that is
 * actually reading the moving object.
 *
 * It also makes the subscription collapsible: CollapsibleSection renders
 * `{!collapsed && children}`, so folding "Selected Object" away UNSUBSCRIBES it.
 * A hook called one level up keeps listening to a panel nobody can see.
 */
export default function AeonObjectInspector(): React.ReactElement {
  return <ObjectInspector port={useAeonObjectInspectorPort()} />;
}
