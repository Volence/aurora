// Aeon port for the neutral shared/ObjectList.
//
// Two things aeon gains here that ObjectPalette never had: thumbnails (the
// bitmaps were already sitting in projectStore.objectSprites, drawn on the map
// and nowhere else) and a working disarm — aeon's arm was sticky, with no way to
// clear the selected object type once set. Classic had both.

import React from 'react';
import type { ObjectListPort, ObjectRow } from '../components/shared/object-list-model';
import type { ObjectDef } from '../../core/model/s4-types';
import { useProjectStore } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import { resolveObjectSprite } from '../shell/explorer-data';
import { readObjectBindings, setObjectBinding } from '../object-previews';
import { listSprites } from '../components/sprite/export-sprite';
import BitmapThumb from '../components/shared/BitmapThumb';
import SpriteBindingRow from '../components/shared/SpriteBindingRow';

/**
 * The project's object library as neutral rows, in declaration order. `key` and
 * `badge` are both the string id: aeon ids are already short and human-readable,
 * so there is no second short form to show. `hasArt` is whether a sprite binding
 * RESOLVES (sidecar first, then the hand-authored `ObjectDef.sprite`) — the same
 * ranking the Explorer's Object Library uses.
 */
export function aeonObjectRows(
  library: readonly ObjectDef[] | undefined,
  bindings: Record<string, string>,
): ObjectRow[] {
  if (!library) return [];
  return library.map((def) => ({
    key: def.id,
    badge: def.id,
    label: def.name,
    title: `${def.id}: ${def.codeLabel}`,
    hasArt: resolveObjectSprite(def, bindings) !== undefined,
  }));
}

// A repaint stamp for a published Map. The rendered previews are replaced
// wholesale (setObjectSprites) rather than mutated, so identity IS the version —
// but `versionKey` is a string, and a Map has no id of its own. Stamping each
// instance once, lazily, turns identity into a stable comparable without
// retaining the map (WeakMap) or asking projectStore for a counter it does not
// keep.
const stamps = new WeakMap<object, number>();
let nextStamp = 0;

export function mapStamp(m: object): number {
  let s = stamps.get(m);
  if (s === undefined) {
    s = ++nextStamp;
    stamps.set(m, s);
  }
  return s;
}

export function useAeonObjectListPort(): ObjectListPort {
  const project = useProjectStore((s) => s.project);
  const objectSprites = useProjectStore((s) => s.objectSprites);
  const selectedObjectTypeId = useEditorStore((s) => s.selectedObjectTypeId);

  // Sprite-binding footer state. Read locally rather than from
  // projectStore.objectBindings so an assignment made here shows immediately,
  // without waiting for the previews to re-render and republish.
  const [sprites, setSprites] = React.useState<string[]>([]);
  const [bindings, setBindings] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!project) return;
    listSprites().then(setSprites).catch(() => setSprites([]));
    readObjectBindings(project.basePath).then(setBindings).catch(() => setBindings({}));
  }, [project]);

  const library = project?.objectLibrary;
  const rows = React.useMemo(() => aeonObjectRows(library, bindings), [library, bindings]);

  const select = React.useCallback((key: string | null) => {
    const store = useEditorStore.getState();
    // Toggle, matching classic: re-picking the armed row disarms it. Aeon had no
    // way to clear this at all before.
    if (key === null || store.selectedObjectTypeId === key) {
      store.setSelectedObjectTypeId(null);
      return;
    }
    const def = useProjectStore.getState().project?.objectLibrary.find((d) => d.id === key);
    store.setSelectedObjectTypeId(key, def?.defaultSubtype);
  }, []);

  const Thumb = React.useMemo(() => {
    const C = ({ rowKey }: { rowKey: string }): React.ReactElement =>
      React.createElement(BitmapThumb, { bitmap: objectSprites.get(rowKey)?.bitmap ?? null });
    C.displayName = 'AeonObjectThumb';
    return C;
  }, [objectSprites]);

  const assignSprite = React.useCallback(async (spriteName: string) => {
    const id = useEditorStore.getState().selectedObjectTypeId;
    if (!id) return;
    await setObjectBinding(id, spriteName);
    setBindings((b) => {
      const n = { ...b };
      if (spriteName) n[id] = spriteName; else delete n[id];
      return n;
    });
  }, []);

  const Footer = React.useMemo(() => {
    if (!selectedObjectTypeId) return undefined;
    const C = (): React.ReactElement =>
      React.createElement(SpriteBindingRow, {
        value: bindings[selectedObjectTypeId] ?? '',
        options: sprites,
        onChange: (next: string) => { void assignSprite(next); },
      });
    C.displayName = 'AeonSpriteBindingFooter';
    return C;
  }, [selectedObjectTypeId, bindings, sprites, assignSprite]);

  return React.useMemo(
    (): ObjectListPort => ({
      rows,
      selectedKey: selectedObjectTypeId,
      select,
      Thumb,
      Footer,
      emptyMessage: 'No object library loaded',
      versionKey: `${rows.length}:${mapStamp(objectSprites)}`,
    }),
    [rows, selectedObjectTypeId, select, Thumb, Footer, objectSprites],
  );
}
