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
//
// ═══ THE COLUMN'S SHAPE (ROADMAP item 41) ═══
//
// Rows, labels, hints and cards all come from `column-layout`, which both
// panels in this column share; its docblock carries the measured label width
// and the one-label-per-row rule. What is decided HERE is which of these four
// sections claims a share of the column:
//
//   Scenes             CONTENT. A scene picker is one line per scene — and it
//                      really is one line now, see the button's own comment;
//                      it took ROADMAP item 45's open tail to notice it had
//                      quietly become three on aeon's prose scene names.
//                      Giving it an equal third of the column bought a 160px
//                      box (`SECTION_LIST_MIN_HEIGHT`, the FLOOR — measured)
//                      around 26px of buttons, with a scrollbar that never
//                      engaged. It keeps a cap of its own instead, so a project
//                      with thirty scenes still cannot push the rest of the
//                      column off the screen.
//   Scene              CONTENT. A form.
//   Layers             LIST — the only one. Up to eight cards, each ~100px,
//                      and the cards are the tallest data anything in this
//                      column draws (measured: 498px of natural height at five
//                      layers, in a 160px box). This is the section the
//                      column's leftover height belongs to.
//   Section assignment CONTENT. One control.
//
// THE MEASUREMENT THAT DECIDED IT (`scratchpad/effects-column-harness.mjs`, on
// the live aeon tree at 1680x1050): with three sections in this column and one
// in BgAnimBandPanel all declaring `variant="list"`, ALL THREE sat at exactly
// the 160px floor, each with its own inner scrollbar, inside a column that was
// itself overflowing by 292px. Four scrollbars, three of them 160px tall. The
// flex model was working exactly as specified; there was simply nothing left to
// divide, and dividing nothing three ways is what "messy" was.

import React from 'react';
import { T, Panel, SectionBody, CollapsibleSection, Select, NumberField, Chip, IconButton } from '../ui';
import { Field, Hint, Card } from './column-layout';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import type { AnyCommand } from '../../../core/editing/commands';
import type {
  EffectsScene, EffectsSceneLibrary, EffectsLayer,
} from '../../../core/formats/effects/scene';
import {
  factorOptions, factorSelectValue, factorFromSelect, clampPackedField, clampWorldY,
  clampVFactor, clampVCenter, clampVOffset,
  sceneListEntries, resolveSelectedScene, sceneRefOptions, unassignableSceneRef,
  sectionSceneCommand, createSceneCommand, deleteSceneCommand,
  addLayerCommand, removeLayerCommand, setLayerFieldCommand, setSceneFieldCommand,
  SCENE_FORM_CHOICES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_WORLD_Y_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_OFFSET_BOUNDS,
} from '../../providers/effects-aeon';

const EMPTY_LIBRARY: EffectsSceneLibrary = { scenes: [], unreadable: [], notices: [] };

const textInput: React.CSSProperties = {
  flex: 1, minWidth: 0, background: T.raised, color: T.textHi,
  border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: T.tSm,
  padding: `${T.s2} ${T.s3}`,
};

/**
 * A `variant="list"` section's body, WITH THE SCROLLER THE MODEL REQUIRES.
 *
 * ui/CollapsibleSection's own docblock says a list section "takes an equal share
 * of whatever the content sections leave and scrolls inside it" — the scrolling
 * half is the panel's job, and this panel never did it. Measured on the CDP
 * harness (rows 11d/11e), the consequence at eight layers with every packed
 * factor form open is 1232px of layer cards inside a 306px section, drawn with
 * `overflow: visible` straight over the SECTION ASSIGNMENT rows beneath them.
 * Not a density opinion — overlapping text.
 *
 * `minHeight: 0` comes from SectionBody, which is what lets the section's share
 * actually bind (the same line Panel needs, one level down). No number of its
 * own: the ceiling arrives from the column, exactly as ChunkGrid's and
 * ObjectList's do.
 *
 * ONE SECTION USES THIS NOW — Layers. It is the only one in this column that
 * takes a share of it (see the file docblock).
 *
 * NOTHING IN THE NODE SUITE SEES THIS. panel-scrollers.test.ts's derivation
 * walks `<CollapsibleSection><Child` inside FACET modules, and effects-facet
 * mounts `<EffectsScenePanel />` straight under `<Panel>` — so all four of this
 * panel's titled sections, the list variant included, are invisible to that
 * guard and to panel-headings' beside it. That gap is its own booking.
 */
const LIST_BODY: React.CSSProperties = { overflowY: 'auto' };

/**
 * The scene picker's own ceiling, which is what lets it stop being a list
 * section (see the file docblock).
 *
 * A scene button is 11px of text plus `T.s1` of padding either side plus a 1px
 * border ≈ 24px, and the stack gaps them by `T.s1`. Six of them is
 * 6*24 + 5*2 = 154. Six is the point where a picker stops reading as "the
 * scenes in this project" and starts needing to be scanned, and it is short
 * enough that the sections beneath it stay on screen at a 13" laptop height.
 *
 * A NUMBER OF ITS OWN, and that is the trade this pass accepted. The model
 * prefers a share of the column to the fixed per-list ceiling it replaced, and
 * ui/CollapsibleSection's docblock says why that ceiling was wrong: it applied
 * always, so it cost dead space in every column with room to spare. This is not
 * that ceiling coming back — it is a cap on ONE sub-list inside a content
 * section, and the alternative is measured and worse: an equal third of a
 * column with nothing left to give IS the 160px floor, which is a fixed height
 * wearing the flex model's clothes and costs the column a scrollbar as well.
 *
 * (Named indirectly on purpose: panel-scrollers.test.ts greps the whole tree
 * for the deleted constant's identifier, prose included, so that it cannot come
 * back by being mentioned back into existence. Spelling it here would fail that
 * guard, and the guard is right to be that blunt.)
 */
const SCENE_LIST: React.CSSProperties = { overflowY: 'auto', maxHeight: 154, flexShrink: 0 };

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

/**
 * A `$defs/factor` picker — the named set plus the custom packed escape hatch.
 *
 * USED FOR A LAYER'S `fa`/`fb` AND NOTHING ELSE. It used to drive the scene's
 * `v_factor` too, which is the whole of ROADMAP item 35: that field is a
 * right-shift amount 0..15, not a packed factor, so every name this control
 * offers is a value no engine can consume there. `EffectsLayer['fa']` is the
 * type deliberately — naming the field it actually serves is what stops it
 * being re-pointed at a scalar a third time.
 */
function FactorField({ value, onChange, title }: {
  value: EffectsLayer['fa'];
  onChange: (f: EffectsLayer['fa']) => void;
  title: string;
}) {
  const selected = factorSelectValue(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
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
  // IN THE STORE, NOT `React.useState` (ROADMAP item 43). MapViewport draws this
  // scene's layers as draggable world-Y guides, and a sibling component cannot
  // read another's local state. The behaviour here is unchanged — including the
  // stale-id fallback below, which is now `resolveSelectedScene` so that the
  // canvas resolves it the same way rather than a second way.
  const selectedId = useEditorStore((s) => s.selectedEffectsSceneId);
  const setSelectedId = useEditorStore((s) => s.setSelectedEffectsSceneId);
  const [newId, setNewId] = React.useState('');
  const [refusal, setRefusal] = React.useState<string | null>(null);

  // Keep the selection on something that exists: undoing a create, or opening a
  // different project, leaves a stale id behind.
  const selected = resolveSelectedScene(library, selectedId);

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
      <CollapsibleSection id="aeon.effects.scenes" title="Scenes">
       <SectionBody>
        {entries.length === 0 && (
          <Hint>
            No effects scenes yet. A scene is one file under
            {' '}<code>data/editor/effects/</code> — create one below.
          </Hint>
        )}
        {entries.length > 0 && (
          <div style={SCENE_LIST}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
              {entries.map((e) => (
                // ONE LINE PER SCENE, AND THAT IS A MEASUREMENT (ROADMAP item
                // 45's open tail). A scene's `name` is prose — aeon's own are
                // "OJZ act 1 depth — curved horizon over a split canopy" — and
                // in a 300px column an unconstrained label wrapped to THREE
                // lines: measured, two scenes cost 74px where two one-line rows
                // cost 50, and the picker's height grew per scene at a rate
                // nothing could predict. Ellipsis rather than a shorter label:
                // the full name is on the button's own `title`, it is the
                // section title of the selected scene one section down, and it
                // is the editable `Name` field inside it. Nothing here is the
                // only place a name is readable.
                <button key={e.id} type="button" onClick={() => setSelectedId(e.id)}
                  title={`${e.label} (${e.id})`}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: T.s2,
                    padding: `${T.s1} ${T.s2}`, font: 'inherit', fontSize: T.tXs, textAlign: 'left',
                    background: selected?.id === e.id ? T.accent : T.raised,
                    color: selected?.id === e.id ? T.onAccent : T.textBase,
                    border: `1px solid ${selected?.id === e.id ? T.accent : T.border}`,
                    borderRadius: T.rMd, cursor: 'pointer',
                  }}>
                  <span style={{
                    minWidth: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{e.label}</span>
                  <span style={{ opacity: 0.7, flexShrink: 0 }}>
                    {e.layers} layer{e.layers === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {library.unreadable.length > 0 && (
          <Hint tone="warning" style={{ marginTop: T.s3 }}>
            {library.unreadable.length} scene file{library.unreadable.length === 1 ? '' : 's'} in this
            project could not be read and {library.unreadable.length === 1 ? 'is' : 'are'} not listed.
            Aurora will not overwrite {library.unreadable.length === 1 ? 'it' : 'them'}.
          </Hint>
        )}

        {/* "Scene id", not "New": the button beside it already says New, and a
            row that reads `New … New` twice is the kind of noise this pass is
            about. The label names the thing being typed. */}
        <Field label="Scene id" title="Create a scene file under data/editor/effects/"
          style={{ marginTop: T.s3, marginBottom: 0 }}>
          <input value={newId} placeholder="new_scene_id"
            onChange={(e) => { setNewId(e.target.value); setRefusal(null); }}
            style={textInput} />
          <Chip onClick={create} disabled={newId.trim() === ''}>New</Chip>
        </Field>
        {refusal && <Hint under tone="warning" style={{ marginTop: T.s2, marginBottom: 0 }}>{refusal}</Hint>}
       </SectionBody>
      </CollapsibleSection>

      {selected && (
        <CollapsibleSection id="aeon.effects.scene" title={`Scene — ${selected.id}`}
          right={<IconButton icon={<span>Delete</span>} label={`Delete scene ${selected.id}`}
            onClick={() => run(deleteSceneCommand(library, selected.id))} />}>
         <SectionBody>
          <Field label="Name">
            <input value={typeof selected.name === 'string' ? selected.name : ''}
              onChange={(e) => run(setSceneFieldCommand(
                library, selected.id, 'name', e.target.value === '' ? undefined : e.target.value))}
              style={textInput} />
          </Field>
          {/*
            ONE FIELD PER ROW (ROADMAP item 41). `V center` and `V offset` used
            to share a line, and so did `Precision` and `Transition`: the second
            label in each pair started wherever the first control happened to
            end, so no label column could reach it. That is the half of "mixed
            label widths" that was really wrong — every FIRST label already
            agreed on 72px, measured.
          */}
          <Field label="V factor"
            title="Vertical scroll for the whole background plane, as a right-shift amount">
            {/*
              A SPINNER, NOT A FACTOR PICKER (ROADMAP item 35). `v_factor` is a
              right-shift count the engine feeds to `asr.w`; the FACTOR_* names
              this row used to offer belong to a different space and folded to a
              byte no engine reads. Bounds come from the schema so the spinner
              cannot offer a shift the engine has no room for, and the max is the
              lock sentinel, which is why it is also the new-scene default.
            */}
            <NumberField
              title={`v_factor — background vertical shift, ${EFFECTS_V_FACTOR_BOUNDS.min}`
                + `..${EFFECTS_V_FACTOR_BOUNDS.max}; `
                + `${EFFECTS_V_FACTOR_BOUNDS.max} locks the plane to v_offset`}
              min={EFFECTS_V_FACTOR_BOUNDS.min} max={EFFECTS_V_FACTOR_BOUNDS.max}
              value={selected.v_factor}
              onChange={(n) => run(setSceneFieldCommand(
                library, selected.id, 'v_factor', clampVFactor(n)))} />
          </Field>
          <Field label="V center">
            {/*
              BOUNDED BY THE CLAMP, NOT THE PROPS (ROADMAP item 37). `min`/`max`
              on a NumberField only bind the spinner; a typed value goes
              through unclamped. clampVCenter/clampVOffset read the schema's
              range, which is the range aeon refuses beyond at emit.
            */}
            <NumberField title={`v_center — the act-axis row the vertical factor pivots about, `
                + `${EFFECTS_V_CENTER_BOUNDS.min}..${EFFECTS_V_CENTER_BOUNDS.max}`}
              min={EFFECTS_V_CENTER_BOUNDS.min} max={EFFECTS_V_CENTER_BOUNDS.max} width={72}
              value={typeof selected.v_center === 'number' ? selected.v_center : 0}
              onChange={(n) => run(setSceneFieldCommand(
                library, selected.id, 'v_center', clampVCenter(n)))} />
          </Field>
          <Field label="V offset">
            <NumberField title={`v_offset — signed pixel offset added after the shift, `
                + `${EFFECTS_V_OFFSET_BOUNDS.min}..${EFFECTS_V_OFFSET_BOUNDS.max}`}
              min={EFFECTS_V_OFFSET_BOUNDS.min} max={EFFECTS_V_OFFSET_BOUNDS.max} width={72}
              value={typeof selected.v_offset === 'number' ? selected.v_offset : 0}
              onChange={(n) => run(setSceneFieldCommand(
                library, selected.id, 'v_offset', clampVOffset(n)))} />
          </Field>
          <Field label="Precision">
            <Select title="precision — wave 1 authors cell precision only ('line' is a reserved engine tier)"
              value={typeof selected.precision === 'string' ? selected.precision : SCENE_FORM_CHOICES.precision[0]}
              onChange={(v) => run(setSceneFieldCommand(
                library, selected.id, 'precision', v as EffectsScene['precision']))}
              style={{ flex: 1, minWidth: 0 }}>
              {SCENE_FORM_CHOICES.precision.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Transition" style={{ marginBottom: 0 }}>
            <Select title="transition"
              value={typeof selected.transition === 'string' ? selected.transition : SCENE_FORM_CHOICES.transition[0]}
              onChange={(v) => run(setSceneFieldCommand(
                library, selected.id, 'transition', v as EffectsScene['transition']))}
              style={{ flex: 1, minWidth: 0 }}>
              {SCENE_FORM_CHOICES.transition.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
         </SectionBody>
        </CollapsibleSection>
      )}

      {selected && (
        <CollapsibleSection id="aeon.effects.layers" variant="list"
          title={`Layers (${selected.layers.length}/${EFFECTS_LAYER_COUNT.max})`}
          right={<IconButton icon={<span>Add</span>} label="Add layer"
            disabled={selected.layers.length >= EFFECTS_LAYER_COUNT.max}
            onClick={() => run(addLayerCommand(library, selected.id))} />}>
         <SectionBody style={LIST_BODY}>
          {selected.layers.map((layer, i) => (
            // THE INDEX TITLES THE CARD; it does not prefix a field name. The
            // old first row read `#0 world_y`, which made the longest label in
            // the whole column out of a field whose name is seven characters,
            // and set the label column's width for every other row in it.
            <Card key={i}>
              <Field label={`Layer ${i}`}>
                <IconButton icon={<span>Remove</span>} label={`Remove layer ${i}`}
                  disabled={selected.layers.length <= EFFECTS_LAYER_COUNT.min}
                  onClick={() => run(removeLayerCommand(library, selected.id, i))} />
              </Field>
              <Field label="world_y">
                <NumberField title={`Layer ${i} world_y (${EFFECTS_WORLD_Y_BOUNDS.min}..${EFFECTS_WORLD_Y_BOUNDS.max})`}
                  min={EFFECTS_WORLD_Y_BOUNDS.min} max={EFFECTS_WORLD_Y_BOUNDS.max} width={72}
                  value={layer.world_y}
                  onChange={(n) => run(setLayerFieldCommand(
                    library, selected.id, i, 'world_y', clampWorldY(n)))} />
              </Field>
              <Field label="fa" title="Plane A packed scroll factor">
                <FactorField title={`Layer ${i} fa`} value={layer.fa}
                  onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fa', f))} />
              </Field>
              <Field label="fb" title="Plane B packed scroll factor">
                <FactorField title={`Layer ${i} fb`} value={layer.fb}
                  onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fb', f))} />
              </Field>
            </Card>
          ))}
         </SectionBody>
        </CollapsibleSection>
      )}

      <CollapsibleSection id="aeon.effects.assign" title="Section assignment">
       <SectionBody>
        {!section ? (
          <Hint style={{ marginBottom: 0 }}>
            Section {activeSectionIndex} is empty — nothing to assign a scene to.
          </Hint>
        ) : (
          <>
            <Field label={`Section ${activeSectionIndex}`}>
              <Select title={'Which effects scene this section uses (sceneRef). '
                + "Act default means the act's own scene."}
                value={section.sceneRef ?? ''} style={{ flex: 1, minWidth: 0 }}
                onChange={(v) => run(sectionSceneCommand(activeSectionIndex, section.sceneRef, v))}>
                {sceneRefOptions(library).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            {unassignableSceneRef(library, section.sceneRef) && (
              <Hint under tone="warning">{unassignableSceneRef(library, section.sceneRef)}</Hint>
            )}
            {/* ONE FACT, NOT TWO. This hint used to close with "Act default
                means the act's own scene", which is the DEFINITION OF AN OPTION
                in the select above it — measured, the two sentences wrapped to
                three lines (52px) where the persistence path alone takes two.
                The definition moved onto the control's own title, where a
                reader asking "what does this option mean" already looks; what
                stays on screen is the thing no control can tell you, which is
                WHERE THE VALUE IS WRITTEN. */}
            <Hint under style={{ marginBottom: 0 }}>
              Saved to <code>section_{activeSectionIndex}.meta.json</code> as
              {' '}<code>sceneRef</code>.
            </Hint>
          </>
        )}
       </SectionBody>
      </CollapsibleSection>
    </>
  );
}

export function EffectsPanels(): React.ReactElement {
  return <Panel width={300} scroll><EffectsScenePanel /></Panel>;
}
