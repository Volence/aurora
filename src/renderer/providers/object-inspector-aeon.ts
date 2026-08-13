// Aeon port for the neutral shared/ObjectInspector.
//
// This is a NEW CAPABILITY, not a re-home: aeon had no object property editor at
// all. PropertiesPanel's "Selected Object" block was four lines of uneditable
// text, so type, subtype, position and flips could only be changed by deleting
// the placement and dropping a new one.
//
// The write is the interesting half. Classic's commands RETURN `{ok} |
// {ok:false, error}`; aeon's executeCommand THROWS — deliberately, so a level
// command issued while a sprite doc or a classic tab owns the focus is loud
// rather than silently unundoable. That throw is fine for an aeon-only caller
// and fatal for a shared one, so it is caught HERE (runCommit) and converted to
// classic's convention before the neutral component ever sees it. Everything
// below the hook takes its effects as arguments, so that conversion is proven in
// node without a store or a React tree.

import React from 'react';
import {
  clampPatch,
  runCommit,
  type CommitResult,
  type FieldValue,
  type ObjectField,
  type ObjectInspectorPort,
} from '../components/shared/object-inspector-model';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import type { ObjectDef, ObjectPlacement } from '../../core/model/s4-types';
import { SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import BitmapThumb from '../components/shared/BitmapThumb';

/**
 * Aeon placements are SECTION-LOCAL: both coordinates run 0..$7FF, and the
 * exporter hard-fails outside that (core/export/entity-data.ts validatePlacement).
 * Classic's are level-global with two different ceilings — clamping one engine's
 * value against the other's limit would either refuse legal placements or write
 * ones the bake rejects, which is why limits live on the schema.
 */
export const AEON_OBJECT_LIMITS = {
  x: SECTION_PIXEL_SIZE - 1,
  y: SECTION_PIXEL_SIZE - 1,
  subtype: 0xff,
} as const;

/**
 * The fields an aeon placement has. `currentTypeId` is appended to the options
 * when the project library does not declare it, so an act referencing a type that
 * was renamed or removed still round-trips instead of snapping to the first entry.
 *
 * There is no `respawn`: the engine's placement word has no bit for one. A
 * disabled control would be dead chrome, so the field is simply absent and
 * `clampPatch` drops any patch that names it.
 */
export function aeonObjectSchema(
  library: readonly ObjectDef[] | undefined,
  currentTypeId: string,
): readonly ObjectField[] {
  const options = (library ?? []).map((d) => ({ value: d.id, label: `${d.id} — ${d.name}` }));
  if (!options.some((o) => o.value === currentTypeId)) {
    options.push({ value: currentTypeId, label: currentTypeId });
  }
  return [
    { kind: 'select', id: 'typeId', label: 'Type', options },
    { kind: 'int', id: 'subtype', label: 'Subtype', min: 0, max: AEON_OBJECT_LIMITS.subtype, hex: true, title: 'Subtype (hex byte)' },
    { kind: 'int', id: 'x', label: 'X', min: 0, max: AEON_OBJECT_LIMITS.x, title: 'Section-local X (0–$7FF)' },
    { kind: 'int', id: 'y', label: 'Y', min: 0, max: AEON_OBJECT_LIMITS.y, title: 'Section-local Y (0–$7FF)' },
    // The exporter has always reserved OEF_XFLIP/OEF_YFLIP and never set them,
    // because ObjectPlacement had no fields to set them from. These close that
    // gap rather than inventing a feature.
    { kind: 'bool', id: 'xflip', label: 'X-flip' },
    { kind: 'bool', id: 'yflip', label: 'Y-flip' },
  ];
}

/** Project a placement onto the schema. Flips are optional on the model (acts
 *  saved before they existed omit them), so they surface as explicit `false`. */
export function aeonObjectFields(obj: ObjectPlacement): Record<string, FieldValue> {
  return {
    typeId: obj.typeId,
    subtype: obj.subtype,
    x: obj.x,
    y: obj.y,
    xflip: obj.xflip === true,
    yflip: obj.yflip === true,
  };
}

/** Fold a sanitized patch back into a placement. */
export function applyAeonPatch(
  obj: ObjectPlacement,
  patch: Readonly<Record<string, FieldValue>>,
): ObjectPlacement {
  const next: ObjectPlacement = { ...obj };
  if ('typeId' in patch) next.typeId = String(patch.typeId);
  if ('subtype' in patch) next.subtype = Number(patch.subtype);
  if ('x' in patch) next.x = Number(patch.x);
  if ('y' in patch) next.y = Number(patch.y);
  // Written explicitly, including false, so unticking a flip persists instead of
  // leaving a stale `true` behind.
  if ('xflip' in patch) next.xflip = Boolean(patch.xflip);
  if ('yflip' in patch) next.yflip = Boolean(patch.yflip);
  return next;
}

function samePlacement(a: ObjectPlacement, b: ObjectPlacement): boolean {
  return a.x === b.x && a.y === b.y && a.typeId === b.typeId && a.subtype === b.subtype
    && (a.xflip === true) === (b.xflip === true)
    && (a.yflip === true) === (b.yflip === true);
}

/**
 * Commit one edit as ONE `set-object` command — a whole-placement swap, so a
 * multi-field patch is a single undo step and the object keeps its index.
 *
 * `exec` is injected: in production it is `executeCommand`, which THROWS for a
 * non-aeon focused document. runCommit turns that into `{ok:false}` so the shared
 * inspector reports it instead of the throw escaping an onChange handler and
 * tearing down the panel.
 */
export function commitAeonPatch(
  exec: (cmd: AnyCommand, level: S4Level) => void,
  level: S4Level | null,
  sectionIndex: number,
  objectIndex: number,
  patch: Readonly<Record<string, FieldValue>>,
  schema: readonly ObjectField[],
): CommitResult {
  if (!level) return { ok: false, error: 'no aeon level is open' };
  const target = level.sections[sectionIndex]?.objects[objectIndex];
  if (!target) return { ok: false, error: `no object at section ${sectionIndex} index ${objectIndex}` };
  const clean = clampPatch(schema, patch);
  if (Object.keys(clean).length === 0) return { ok: true };
  const newObject = applyAeonPatch(target, clean);
  // A clamped value can land exactly where it already was. Recording that would
  // burn an undo slot on a no-op — classic's classicSetObjects guards the same way.
  if (samePlacement(target, newObject)) return { ok: true };
  return runCommit(() => exec({
    type: 'set-object',
    description: `Edit object ${newObject.typeId}`,
    sectionIndex,
    objectIndex,
    oldObject: { ...target },
    newObject,
  }, level));
}

export function useAeonObjectInspectorPort(): ObjectInspectorPort {
  const project = useProjectStore((s) => s.project);
  const objectSprites = useProjectStore((s) => s.objectSprites);
  // Subscribed, not just read through getState(): getActiveLevel resolves off
  // these, and aeon mutates its project in place — so without them a tab switch
  // would leave the form bound to the previous act's section list.
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const currentActId = useProjectStore((s) => s.currentActId);
  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  // Re-read the placement after a committed edit (history) and during an
  // in-flight drag, which mutates the object without a command.
  const historyVersion = useHistoryVersion();
  const liveEditVersion = useEditorStore((s) => s.liveEditVersion);

  const objSelection = selection?.type === 'object' ? selection : null;
  const level = getActiveLevel(useProjectStore.getState());
  const obj = objSelection
    ? level?.sections[objSelection.sectionIndex]?.objects[objSelection.index] ?? null
    : null;

  const library = project?.objectLibrary;
  const schema = React.useMemo(
    () => aeonObjectSchema(library, obj?.typeId ?? ''),
    [library, obj?.typeId],
  );

  const Preview = React.useMemo(() => {
    const C = ({ fields }: { fields: Readonly<Record<string, FieldValue>> }): React.ReactElement =>
      React.createElement(BitmapThumb, {
        bitmap: objectSprites.get(String(fields.typeId))?.bitmap ?? null,
        size: 64,
      });
    C.displayName = 'AeonObjectPreview';
    return C;
  }, [objectSprites]);

  const commit = React.useCallback((key: string, patch: Readonly<Record<string, FieldValue>>): CommitResult => {
    // Re-read rather than closing over: a blur can land after the selection
    // moved, and `key` is what proves the edit still belongs to that object.
    const sel = useEditorStore.getState().selection;
    if (!sel || sel.type !== 'object') return { ok: false, error: 'no object selected' };
    const lvl = getActiveLevel(useProjectStore.getState());
    const target = lvl?.sections[sel.sectionIndex]?.objects[sel.index];
    if (key !== aeonSelectionKey(sel.sectionIndex, sel.index, target?.typeId)) {
      return { ok: false, error: 'the selection changed before this edit committed' };
    }
    const lib = useProjectStore.getState().project?.objectLibrary;
    return commitAeonPatch(
      executeCommand, lvl, sel.sectionIndex, sel.index, patch,
      aeonObjectSchema(lib, target?.typeId ?? ''),
    );
  }, []);

  return React.useMemo((): ObjectInspectorPort => ({
    selected: obj && objSelection
      ? {
        key: aeonSelectionKey(objSelection.sectionIndex, objSelection.index, obj.typeId),
        fields: aeonObjectFields(obj),
      }
      : null,
    schema,
    commit,
    title: obj && objSelection
      ? `Object #${objSelection.index} · section ${objSelection.sectionIndex}`
      : '',
    emptyHint: 'No object selected. Use the Select tool and click an object marker.',
    versionKey: `${currentZoneId ?? ''}/${currentActId ?? ''}:${historyVersion}:${liveEditVersion}`,
    Preview,
    onDeselect: obj ? (): void => setSelection(null) : undefined,
  }), [obj, objSelection, schema, commit, currentZoneId, currentActId, historyVersion, liveEditVersion, Preview, setSelection]);
}

/** Section + index + the type it pointed at — enough to notice the section's
 *  object list shifted under a pending edit. */
function aeonSelectionKey(sectionIndex: number, index: number, typeId: string | undefined): string {
  return `${sectionIndex}:${index}:${typeId ?? ''}`;
}
