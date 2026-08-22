// The wave-1 effects scene editor: pick a scene, edit its layers and its
// scene-level parameters, and assign one to the active section.
//
// EVERY DECISION IS IN providers/effects-aeon, not here. The node suite cannot
// see React, so logic in this file is logic nothing in `vitest run` can check;
// this component reads stores, renders rows and hands events to pure functions.
// The only thing it decides is layout.
//
// NO PREVIEW, DELIBERATELY. Rendering what a scene DOES is a separate parcel
// governed by docs/reviews/2026-08-22-preview-posture-ruling.md, and nothing here
// starts a clock or touches MapViewport. The facet mounts the ordinary map canvas
// beside this panel so the author has the act in view while tuning; the act does
// not move.

import React from 'react';
import { T, Panel, CollapsibleSection, Select, NumberField, Chip, IconButton } from '../ui';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import type { AnyCommand } from '../../../core/editing/commands';
import type { EffectsScene, EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import {
  factorOptions, factorSelectValue, factorFromSelect, clampPackedField, clampWorldY,
  sceneListEntries, sceneRefOptions, unassignableSceneRef,
  sectionSceneCommand, createSceneCommand, deleteSceneCommand,
  addLayerCommand, removeLayerCommand, setLayerFieldCommand, setSceneFieldCommand,
  SCENE_FORM_CHOICES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_WORLD_Y_BOUNDS,
} from '../../providers/effects-aeon';

const EMPTY_LIBRARY: EffectsSceneLibrary = { scenes: [], unreadable: [], notices: [] };

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: T.s2, marginBottom: T.s2,
};
const label: React.CSSProperties = {
  fontSize: T.tXs, color: T.textLo, minWidth: 68, flexShrink: 0,
};
const note: React.CSSProperties = { fontSize: T.tXs, color: T.textLo, lineHeight: 1.5 };
const warn: React.CSSProperties = { ...note, color: T.warning };

/**
 * Run a command on the focused aeon document, or do nothing when the provider
 * decided there was nothing to do.
 *
 * The null check is the no-op guard's teeth: a `<select>` fires onChange for the
 * option already selected, and without this every such event would push an undo
 * entry that visibly does nothing.
 */
function run(command: AnyCommand | null): void {
  if (!command) return;
  const level = getActiveLevel(useProjectStore.getState());
  if (!level) return;
  executeCommand(command, level);
}

function FactorField({ value, onChange, title }: {
  value: EffectsScene['v_factor'];
  onChange: (f: EffectsScene['v_factor']) => void;
  title: string;
}) {
  const selected = factorSelectValue(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap' }}>
      <Select title={title} value={selected}
              onChange={(v) => onChange(factorFromSelect(v, value))} style={{ flex: 1, minWidth: 128 }}>
        {factorOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      {typeof value !== 'string' && (
        // The packed triple's own fields, shown only when the factor IS packed.
        // Bounds come from the schema, so the spinner cannot offer a shift the
        // encoding has no room for.
        <div style={{ display: 'flex', alignItems: 'center', gap: T.s1 }}>
          <NumberField title="s1 — first shift (15 = term zero / locked)" width={44}
            min={EFFECTS_PACKED_FACTOR_BOUNDS.s1.min} max={EFFECTS_PACKED_FACTOR_BOUNDS.s1.max}
            value={value.s1}
            onChange={(n) => onChange({ ...value, s1: clampPackedField('s1', n) })} />
          <NumberField title="s2 — second shift (15 = single term)" width={44}
            min={EFFECTS_PACKED_FACTOR_BOUNDS.s2.min} max={EFFECTS_PACKED_FACTOR_BOUNDS.s2.max}
            value={value.s2}
            onChange={(n) => onChange({ ...value, s2: clampPackedField('s2', n) })} />
          <Select title="op — add or subtract the second term" value={String(value.op)}
                  onChange={(v) => onChange({ ...value, op: v === '1' ? 1 : 0 })} style={{ width: 56 }}>
            <option value="0">+</option>
            <option value="1">−</option>
          </Select>
        </div>
      )}
    </div>
  );
}

export default function EffectsScenePanel(): React.ReactElement {
  // Re-read the library after any execute/undo/redo — a scene edit mutates the
  // project in place, so there is no store identity change to subscribe to.
  useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);

  const library = project?.effectsScenes ?? EMPTY_LIBRARY;
  const entries = sceneListEntries(library);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [newId, setNewId] = React.useState('');
  const [refusal, setRefusal] = React.useState<string | null>(null);

  // Keep the selection on something that exists: undoing a create, or opening a
  // different project, leaves a stale id behind.
  const selected = entries.some((e) => e.id === selectedId)
    ? library.scenes.find((s) => s.id === selectedId)!
    : (library.scenes[0] ?? null);

  const state = useProjectStore.getState();
  const act = state.project && state.currentActId
    ? getActiveLevel(state)?.act ?? null
    : null;
  const section = act?.sections[activeSectionIndex] ?? null;

  const create = () => {
    const result = createSceneCommand(library, newId.trim());
    if (!result.ok) { setRefusal(result.reason); return; }
    setRefusal(null);
    run(result.command);
    setSelectedId(newId.trim());
    setNewId('');
  };

  return (
    <>
      <CollapsibleSection id="aeon.effects.scenes" title="Scenes" variant="list">
        {entries.length === 0 && (
          <div style={note}>
            No effects scenes yet. A scene is one file under
            {' '}<code>data/editor/effects/</code> — create one below.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
          {entries.map((e) => (
            <button key={e.id} type="button" onClick={() => setSelectedId(e.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: `${T.s1} ${T.s2}`, font: 'inherit', fontSize: T.tXs, textAlign: 'left',
                background: selected?.id === e.id ? T.accent : T.raised,
                color: selected?.id === e.id ? T.onAccent : T.textBase,
                border: `1px solid ${selected?.id === e.id ? T.accent : T.border}`,
                borderRadius: T.rMd, cursor: 'pointer',
              }}>
              <span>{e.label}</span>
              <span style={{ opacity: 0.7 }}>{e.layers} layer{e.layers === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>

        {library.unreadable.length > 0 && (
          <div style={{ ...warn, marginTop: T.s3 }}>
            {library.unreadable.length} scene file{library.unreadable.length === 1 ? '' : 's'} in this
            project could not be read and {library.unreadable.length === 1 ? 'is' : 'are'} not listed.
            Aurora will not overwrite {library.unreadable.length === 1 ? 'it' : 'them'}.
          </div>
        )}

        <div style={{ ...row, marginTop: T.s3 }}>
          <input value={newId} placeholder="new_scene_id"
            onChange={(e) => { setNewId(e.target.value); setRefusal(null); }}
            style={{
              flex: 1, minWidth: 0, background: T.raised, color: T.textHi,
              border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: T.tSm,
              padding: `${T.s2} ${T.s3}`,
            }} />
          <Chip onClick={create} disabled={newId.trim() === ''}>New</Chip>
        </div>
        {refusal && <div style={warn}>{refusal}</div>}
      </CollapsibleSection>

      {selected && (
        <CollapsibleSection id="aeon.effects.scene" title={`Scene — ${selected.id}`}
          right={<IconButton icon={<span>Delete</span>} label={`Delete scene ${selected.id}`}
            onClick={() => run(deleteSceneCommand(library, selected.id))} />}>
          <div style={row}>
            <span style={label}>Name</span>
            <input value={typeof selected.name === 'string' ? selected.name : ''}
              onChange={(e) => run(setSceneFieldCommand(
                library, selected.id, 'name', e.target.value === '' ? undefined : e.target.value))}
              style={{
                flex: 1, minWidth: 0, background: T.raised, color: T.textHi,
                border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: T.tSm,
                padding: `${T.s2} ${T.s3}`,
              }} />
          </div>
          <div style={row}>
            <span style={label} title="Vertical scroll factor for the whole scene">V factor</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FactorField title="Scene v_factor" value={selected.v_factor}
                onChange={(f) => run(setSceneFieldCommand(library, selected.id, 'v_factor', f))} />
            </div>
          </div>
          <div style={row}>
            <span style={label}>V center</span>
            <NumberField title="v_center — the act-axis row the vertical factor pivots about"
              value={typeof selected.v_center === 'number' ? selected.v_center : 0}
              onChange={(n) => run(setSceneFieldCommand(library, selected.id, 'v_center', n))} />
            <span style={label}>V offset</span>
            <NumberField title="v_offset"
              value={typeof selected.v_offset === 'number' ? selected.v_offset : 0}
              onChange={(n) => run(setSceneFieldCommand(library, selected.id, 'v_offset', n))} />
          </div>
          <div style={row}>
            <span style={label}>Precision</span>
            <Select title="precision — wave 1 authors cell precision only ('line' is a reserved engine tier)"
              value={typeof selected.precision === 'string' ? selected.precision : SCENE_FORM_CHOICES.precision[0]}
              onChange={(v) => run(setSceneFieldCommand(
                library, selected.id, 'precision', v as EffectsScene['precision']))}>
              {SCENE_FORM_CHOICES.precision.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <span style={label}>Transition</span>
            <Select title="transition"
              value={typeof selected.transition === 'string' ? selected.transition : SCENE_FORM_CHOICES.transition[0]}
              onChange={(v) => run(setSceneFieldCommand(
                library, selected.id, 'transition', v as EffectsScene['transition']))}>
              {SCENE_FORM_CHOICES.transition.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        </CollapsibleSection>
      )}

      {selected && (
        <CollapsibleSection id="aeon.effects.layers" variant="list"
          title={`Layers (${selected.layers.length}/${EFFECTS_LAYER_COUNT.max})`}
          right={<IconButton icon={<span>Add</span>} label="Add layer"
            disabled={selected.layers.length >= EFFECTS_LAYER_COUNT.max}
            onClick={() => run(addLayerCommand(library, selected.id))} />}>
          {selected.layers.map((layer, i) => (
            <div key={i} style={{
              border: `1px solid ${T.border}`, borderRadius: T.rMd,
              padding: T.s2, marginBottom: T.s2,
            }}>
              <div style={{ ...row, marginBottom: T.s2 }}>
                <span style={label}>#{i} world_y</span>
                <NumberField title={`Layer ${i} world_y (${EFFECTS_WORLD_Y_BOUNDS.min}..${EFFECTS_WORLD_Y_BOUNDS.max})`}
                  min={EFFECTS_WORLD_Y_BOUNDS.min} max={EFFECTS_WORLD_Y_BOUNDS.max} width={72}
                  value={layer.world_y}
                  onChange={(n) => run(setLayerFieldCommand(
                    library, selected.id, i, 'world_y', clampWorldY(n)))} />
                <div style={{ flex: 1 }} />
                <IconButton icon={<span>Remove</span>} label={`Remove layer ${i}`}
                  disabled={selected.layers.length <= EFFECTS_LAYER_COUNT.min}
                  onClick={() => run(removeLayerCommand(library, selected.id, i))} />
              </div>
              <div style={row}>
                <span style={label} title="Plane A packed scroll factor">fa</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FactorField title={`Layer ${i} fa`} value={layer.fa}
                    onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fa', f))} />
                </div>
              </div>
              <div style={{ ...row, marginBottom: 0 }}>
                <span style={label} title="Plane B packed scroll factor">fb</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FactorField title={`Layer ${i} fb`} value={layer.fb}
                    onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fb', f))} />
                </div>
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection id="aeon.effects.assign" title="Section assignment">
        {!section ? (
          <div style={note}>Section {activeSectionIndex} is empty — nothing to assign a scene to.</div>
        ) : (
          <>
            <div style={row}>
              <span style={label}>Section {activeSectionIndex}</span>
              <Select title="Which effects scene this section uses (sceneRef)"
                value={section.sceneRef ?? ''} style={{ flex: 1, minWidth: 0 }}
                onChange={(v) => run(sectionSceneCommand(activeSectionIndex, section.sceneRef, v))}>
                {sceneRefOptions(library).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            {unassignableSceneRef(library, section.sceneRef) && (
              <div style={warn}>{unassignableSceneRef(library, section.sceneRef)}</div>
            )}
            <div style={note}>
              Saved to <code>section_{activeSectionIndex}.meta.json</code> as
              {' '}<code>sceneRef</code>. Act default means the act&apos;s own scene.
            </div>
          </>
        )}
      </CollapsibleSection>
    </>
  );
}

export function EffectsPanels(): React.ReactElement {
  return <Panel width={300} scroll><EffectsScenePanel /></Panel>;
}
