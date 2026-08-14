import React from 'react';
import ObjectList from '../shared/ObjectList';
import { useClassicObjectListPort } from '../../providers/object-list-classic';

/**
 * Classic's object library: a two-line adapter over the engine-neutral
 * shared/ObjectList, matching ClassicObjectInspector beside it. Everything
 * classic-shaped — the rows, the arm/disarm toggle, the thumbnails, and the
 * `classicSurfaceProps('map')` claim that keeps a placement's undo pointed at
 * the layout document — is in providers/object-list-classic.
 *
 * Same reason as the inspector for being a leaf rather than a hook call in the
 * panel column: the port subscribes to the ref, two epochs, the armed id, the
 * tool, the project dir and the object-art store's version, and that last one
 * ticks as sprite art warms up asynchronously after an act loads. Called one
 * level up it would repaint the whole right-hand column each time.
 *
 * The label is fixed rather than a prop: it is the list's accessible name, there
 * is exactly one classic surface that shows it, and a knob with one setting is a
 * field nothing consumes.
 */
export default function ClassicObjectList(): React.ReactElement {
  return <ObjectList port={useClassicObjectListPort()} label="Object library" />;
}
