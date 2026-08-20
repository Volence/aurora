// Classic (S1 disasm) port for the neutral shared/ObjectList.
//
// The row builder is a pure function of the zone so it is node-testable; the
// hook is the only part that touches stores. Nothing here renders markup — the
// two React bits it supplies (`Thumb`, the secondary action) are thin adapters
// over components that already exist.

import React from 'react';
import type { ObjectListPort, ObjectRow } from '../components/shared/object-list-model';
import { S1_OBJECT_LIST, s1ObjectHex, s1ObjectName } from '../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../core/project/profiles/s1-object-art';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useEditorStore } from '../state/editorStore';
import { armedPlacementId } from '../state/classic-placement';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicObjectArtStore } from '../state/classicObjectArtStore';
import { classicSurfaceProps } from '../components/classic/classic-surface';
import { editObjectArt } from '../components/sprite/export-sprite';
import { ObjectThumb } from '../components/classic/ObjectThumb';

/**
 * Every named S1 object as a neutral row, id-ascending. `key` is the id in
 * decimal (the engine's own id, stringified — the badge carries the hex the user
 * reads). `hasArt` is whether the id resolves to linked art IN THIS ZONE, so a
 * zone override shows a thumbnail the base table would not.
 */
export function classicObjectRows(zone: string): ObjectRow[] {
  // Placement rows stop at $7F: the objpos id byte's bit 7 is the remember-state
  // flag, so ids past 0x7F (the FZ/SBZ2 boss actors $82-$86, named for their
  // sprite docs) are not placeable and must not be offered here.
  return S1_OBJECT_LIST.filter(({ id }) => id <= 0x7f).map(({ id, name }) => ({
    key: String(id),
    badge: s1ObjectHex(id),
    label: name,
    title: `Place ${name} (${s1ObjectHex(id)})`,
    hasArt: resolveObjectArt(id, zone) !== undefined,
  }));
}

/**
 * Arm/disarm the given row for placement.
 *
 * Arming picks the `place-object` tool; disarming drops back to `select`, which
 * is where the place-then-disarm and Esc paths also land. That second half is
 * not optional bookkeeping: leaving the tool on `place-object` with nothing
 * armed would give the user a map that silently ignores clicks.
 */
function armObject(key: string | null): void {
  const st = useClassicLevelStore.getState();
  const editor = useEditorStore.getState();
  const disarm = (): void => { st.setArmedObjectId(null); editor.setTool('select'); };
  if (key === null) return disarm();
  const id = Number(key);
  if (armedPlacementId(editor.tool, st.armedObjectId) === id) return disarm();
  editor.setTool('place-object');
  st.setArmedObjectId(id);
}

const SECONDARY_ACTION = {
  icon: '✎',
  title: (row: ObjectRow): string => `Edit ${s1ObjectName(Number(row.key))}'s art in Sprite mode`,
  run: (key: string): void => { void editObjectArt(Number(key)); },
};

export function useClassicObjectListPort(): ObjectListPort {
  const ref = useClassicLevelStore((s) => s.ref);
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileEpoch = useClassicLevelStore((s) => s.tileEpoch);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  const tool = useEditorStore((s) => s.tool);
  // Gate the highlight on the tool: switching away from place-object disarms,
  // so the row must stop reading as armed at the same moment the map does.
  const armedId = armedPlacementId(tool, armedObjectId);
  const dir = useClassicProjectStore((s) => s.dir);
  // Object art republishes asynchronously (the shared cache warms up after the
  // act loads), and the rows' thumbnails are drawn from it — so its version is
  // part of the repaint signal, not a separate forced re-render.
  const artVersion = useClassicObjectArtStore((s) => s.version);
  const zone = ref?.zone ?? '';

  const rows = React.useMemo(() => classicObjectRows(zone), [zone]);

  const Thumb = React.useMemo(() => {
    const C = ({ rowKey }: { rowKey: string }): React.ReactElement =>
      React.createElement(ObjectThumb, { id: Number(rowKey), zone, paletteEpoch, tileEpoch, dir });
    C.displayName = 'ClassicObjectThumb';
    return C;
  }, [zone, paletteEpoch, tileEpoch, dir]);

  // Arming an object is the first half of a layout edit (the placement click
  // lands on the map), so this claims the layout facet too — see
  // classic-surface.ts. Without it a Ctrl+Z after placing an object would revert
  // whatever the ART document did last.
  const rootProps = React.useMemo(() => classicSurfaceProps('map'), []);

  return React.useMemo(
    (): ObjectListPort => ({
      rows,
      selectedKey: armedId === null ? null : String(armedId),
      select: armObject,
      Thumb,
      secondaryAction: SECONDARY_ACTION,
      rootProps,
      emptyMessage: 'No objects',
      versionKey: `${zone}:${paletteEpoch}:${tileEpoch}:${artVersion}`,
    }),
    [rows, armedId, Thumb, rootProps, zone, paletteEpoch, tileEpoch, artVersion],
  );
}
