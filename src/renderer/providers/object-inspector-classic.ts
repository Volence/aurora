// Classic (S1 disasm) port for the neutral shared/ObjectInspector.
//
// The schema, the field projection and the commit are pure functions taking the
// object list and the write as arguments, so the whole write path is
// node-testable without a store; the hook underneath is the only part that binds
// them to classicLevelStore. Nothing here renders markup — `Preview` is a thin
// adapter over components/classic/ObjectPreview.
//
// This file is a CLASSIC COMMAND SITE: it calls classicSetObjects, so it must
// keep claiming the layout facet (see classic-surface.ts and the guard in
// components/classic/__tests__/classic-surface.test.ts, whose enumeration moved
// here from components/classic/ObjectInspector.tsx along with the call).

import React from 'react';
import {
  clampPatch,
  runCommit,
  type CommitResult,
  type FieldValue,
  type ObjectField,
  type ObjectInspectorPort,
} from '../components/shared/object-inspector-model';
import { S1_OBJECT_LIST, s1ObjectHex, s1ObjectName } from '../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../core/project/profiles/s1-object-art';
import { useClassicLevelStore, classicSetObjects } from '../state/classicLevelStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicObjectArtStore } from '../state/classicObjectArtStore';
import { classicSurfaceProps } from '../components/classic/classic-surface';
import { editObjectArt } from '../components/sprite/export-sprite';
import { ObjectPreview } from '../components/classic/ObjectPreview';
import type { S1ObjectEntry } from '../../core/formats/classic/s1-objpos';

/**
 * S1's own field ranges. `x` and `y` differ from each other (the object word
 * packs y in 12 bits) and both differ from aeon's section-local $7FF — which is
 * exactly why the limits ride on the schema rather than living in the shared
 * component.
 */
export const CLASSIC_OBJECT_LIMITS = { x: 0xffff, y: 0x0fff, id: 0x7f, subtype: 0xff } as const;

/**
 * The fields an S1 object has. `currentId` is included in the type options even
 * when SonLVL does not name it, so an unknown id round-trips instead of silently
 * snapping to whatever named id happens to be first.
 */
export function classicObjectSchema(currentId: number): readonly ObjectField[] {
  // The S1 object word masks the id to 7 bits, so an id outside that could never
  // round-trip through the file — clamp before offering it as an option.
  const id = Math.max(0, Math.min(CLASSIC_OBJECT_LIMITS.id, Math.round(currentId)));
  const ids = S1_OBJECT_LIST.map((e) => e.id);
  const options = (ids.includes(id) ? ids : [...ids, id].sort((a, b) => a - b))
    .map((id) => ({ value: String(id), label: `${s1ObjectHex(id)} — ${s1ObjectName(id)}` }));
  return [
    { kind: 'select', id: 'id', label: 'Type', options },
    { kind: 'int', id: 'subtype', label: 'Subtype', min: 0, max: CLASSIC_OBJECT_LIMITS.subtype, hex: true, title: 'Subtype (hex byte)' },
    { kind: 'int', id: 'x', label: 'X', min: 0, max: CLASSIC_OBJECT_LIMITS.x },
    { kind: 'int', id: 'y', label: 'Y', min: 0, max: CLASSIC_OBJECT_LIMITS.y },
    { kind: 'bool', id: 'xflip', label: 'X-flip' },
    { kind: 'bool', id: 'yflip', label: 'Y-flip' },
    // Classic-only, honestly: aeon's placement word has no respawn bit, so its
    // schema simply omits this rather than showing a control that does nothing.
    { kind: 'bool', id: 'respawn', label: 'Respawn' },
  ];
}

/** Project an entry onto the schema. The numeric id becomes a string because
 *  that is what a `<select>` reads and writes; applyClassicPatch converts back. */
export function classicObjectFields(obj: S1ObjectEntry): Record<string, FieldValue> {
  return {
    id: String(obj.id),
    subtype: obj.subtype,
    x: obj.x,
    y: obj.y,
    xflip: obj.xflip,
    yflip: obj.yflip,
    respawn: obj.respawn,
  };
}

/** Fold a sanitized patch back into an entry. */
export function applyClassicPatch(
  obj: S1ObjectEntry,
  patch: Readonly<Record<string, FieldValue>>,
): S1ObjectEntry {
  const next: S1ObjectEntry = { ...obj };
  if ('id' in patch) next.id = Number(patch.id);
  if ('subtype' in patch) next.subtype = Number(patch.subtype);
  if ('x' in patch) next.x = Number(patch.x);
  if ('y' in patch) next.y = Number(patch.y);
  if ('xflip' in patch) next.xflip = Boolean(patch.xflip);
  if ('yflip' in patch) next.yflip = Boolean(patch.yflip);
  if ('respawn' in patch) next.respawn = Boolean(patch.respawn);
  return next;
}

/**
 * Commit one edit as ONE classicSetObjects — a whole-list replace with the single
 * object changed, which is the command design that makes a multi-field patch a
 * single undo step. `setObjects` is injected so the write path is testable.
 */
export function commitClassicPatch(
  setObjects: (next: S1ObjectEntry[]) => CommitResult,
  objects: readonly S1ObjectEntry[],
  index: number,
  patch: Readonly<Record<string, FieldValue>>,
  schema: readonly ObjectField[],
): CommitResult {
  const target = objects[index];
  if (!target) return { ok: false, error: `no object at index ${index}` };
  const clean = clampPatch(schema, patch);
  // Nothing survived sanitising (a mid-edit unparseable field, or a field this
  // engine does not have): succeed without recording an empty undo step.
  if (Object.keys(clean).length === 0) return { ok: true };
  const next = objects.map((o, i) => (i === index ? applyClassicPatch(o, clean) : { ...o }));
  return runCommit(() => setObjects(next));
}

export function useClassicObjectInspectorPort(): ObjectInspectorPort {
  const doc = useClassicLevelStore((s) => s.doc);
  const idx = useClassicLevelStore((s) => s.selectedObjectIndex);
  const ref = useClassicLevelStore((s) => s.ref);
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileEpoch = useClassicLevelStore((s) => s.tileEpoch);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  const setSelectedObjectIndex = useClassicLevelStore((s) => s.setSelectedObjectIndex);
  const dir = useClassicProjectStore((s) => s.dir);
  const artVersion = useClassicObjectArtStore((s) => s.version);
  const zone = ref?.zone ?? '';

  // An armed placement outranks a selection, as it always has: while the user is
  // about to drop an object, the panel says so rather than showing a form for
  // whatever was selected before (selecting and arming are independent state, so
  // both can be set at once).
  const obj = armedObjectId == null && doc && idx != null && idx < doc.objects.length
    ? doc.objects[idx]
    : null;
  const schema = React.useMemo(() => classicObjectSchema(obj?.id ?? 0), [obj?.id]);

  // "Edit art" is offered only for ids that resolve linked art in THIS zone —
  // the same predicate the library thumbnails use.
  const linked = obj !== null && resolveObjectArt(obj.id, zone) !== undefined;

  const Preview = React.useMemo(() => {
    if (!linked) return undefined;
    const C = ({ fields }: { fields: Readonly<Record<string, FieldValue>> }): React.ReactElement =>
      React.createElement(ObjectPreview, {
        id: Number(fields.id),
        subtype: Number(fields.subtype),
        zone,
        paletteEpoch,
        tileEpoch,
        dir,
      });
    C.displayName = 'ClassicObjectPreview';
    return C;
  }, [linked, zone, paletteEpoch, tileEpoch, dir]);

  const rootProps = React.useMemo(() => classicSurfaceProps('map'), []);

  const commit = React.useCallback((key: string, patch: Readonly<Record<string, FieldValue>>): CommitResult => {
    // Re-read the store rather than closing over `doc`: a blur can land a frame
    // after the list changed, and `key` (index + identity) is what proves the
    // edit still belongs to the object the user was looking at.
    const st = useClassicLevelStore.getState();
    const i = st.selectedObjectIndex;
    const target = i == null ? undefined : st.doc?.objects[i];
    if (!st.doc || i == null || !target) return { ok: false, error: 'no object selected' };
    if (key !== classicSelectionKey(i, target)) {
      return { ok: false, error: 'the selection changed before this edit committed' };
    }
    return commitClassicPatch(classicSetObjects, st.doc.objects, i, patch, classicObjectSchema(target.id));
  }, []);

  const action = React.useMemo(() => {
    if (!linked || !obj) return undefined;
    const id = obj.id;
    return {
      label: 'Edit art…',
      title: `Open ${s1ObjectName(id)}'s art + mappings in Sprite mode`,
      run: (): void => { void editObjectArt(id); },
    };
  }, [linked, obj]);

  return React.useMemo((): ObjectInspectorPort => ({
    selected: obj && idx != null
      ? { key: classicSelectionKey(idx, obj), fields: classicObjectFields(obj) }
      : null,
    schema,
    commit,
    title: obj && idx != null ? `Object #${idx} · ${s1ObjectHex(obj.id)}` : '',
    emptyHint: armedObjectId != null
      ? `Placing ${s1ObjectName(armedObjectId)} — click the map to drop it, or press Esc to cancel.`
      : 'No object selected. Use the Object tool and click a marker.',
    versionKey: `${zone}:${paletteEpoch}:${tileEpoch}:${artVersion}`,
    Preview,
    onDeselect: obj ? (): void => setSelectedObjectIndex(null) : undefined,
    action,
    rootProps,
  }), [obj, idx, schema, commit, armedObjectId, zone, paletteEpoch, tileEpoch, artVersion, Preview, setSelectedObjectIndex, action, rootProps]);
}

/** Index plus the id it pointed at — enough to notice the list shifted under a
 *  pending edit without hashing the whole entry. */
function classicSelectionKey(index: number, obj: S1ObjectEntry | undefined): string {
  return `${index}:${obj?.id ?? -1}`;
}
