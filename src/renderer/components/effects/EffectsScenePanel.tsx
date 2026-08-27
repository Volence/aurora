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
  EffectsScene, EffectsSceneLibrary, EffectsLayer, EffectsPackedFactor, EffectsTableRef,
} from '../../../core/formats/effects/scene';
// THE ADVISORY NOTHING CALLED. `advisoryLayerDeformConflicts` has been a pure
// function in the codec since wave 1 with no caller anywhere — the Aurora side
// of §2.2's two-sources guard, written and then never wired. The layer card is
// its reader: see the deform row.
import { advisoryLayerDeformConflicts } from '../../../core/formats/effects/scene';
import {
  factorOptions, clampPackedField,
  factorFieldSelectValue, factorFieldFromSelect, NONE_FACTOR_VALUE,
  curveFieldValue, curveFromField, vsplitFieldValue, vsplitFromToggle, curveAdvisory, clampVSplitAt,
  LAYER_CURVE_ROW, LAYER_VSPLIT_ROW, EFFECTS_VSPLIT_AT_BOUNDS,
  clampVFactor, clampVCenter, clampVOffset,
  layerTopBounds, clampLayerTop, planeLineOf, layerCountLine, vFactorHint,
  sceneListEntries, resolveSelectedScene, sceneRefOptions, unassignableSceneRef,
  sectionSceneCommand, createSceneCommand, deleteSceneCommand,
  addLayerCommand, removeLayerCommand, setLayerFieldCommand, setSceneFieldCommand,
  layerExtrasLine,
  SCENE_FORM_CHOICES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_OFFSET_BOUNDS,
  PLANE_FACTOR_ROWS, PLANE_FACTOR_HINT,
  TABLE_REF_ROW, SCENE_DEFORM_ROWS, SCENE_DEFORM_ROW_SHARED, V_DEFORM_ROW, LAYER_DEFORM_ROW,
  tableRefFormOptions, tableRefFormOf, tableRefFromForm, tableRefParams, tableParamLabel,
  tableRefParamValue, setTableRefParam, tableRefBinPath, binPathRefusal, tableRefAdvisory,
  tableRefLabel,
  sceneDeformValue, sceneDeformFromToggle, vDeformValue, vDeformFromToggle,
  layerDeformValue, layerDeformFromToggle, layerDeformAdvisory, sceneDeformAdvisories,
  layerCurveDeformAdvisory,
  LEFT_COLUMN_MASK_ROW, leftColumnMaskOptions, leftColumnMaskValue,
  leftColumnMaskRowVisible, leftColumnMaskCommand, vDeformToggleCommand,
  clampLayerDeformField, clampAmpShift, clampDeformSpeed,
  EFFECTS_LAYER_DEFORM_BOUNDS, EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS,
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
 * USED FOR A LAYER'S `fa`/`fb` AND `curve.to`, AND NOTHING ELSE. It used to
 * drive the scene's `v_factor` too, which is the whole of ROADMAP item 35: that
 * field is a right-shift amount 0..15, not a packed factor, so every name this
 * control offers is a value no engine can consume there. `EffectsLayer['fa']`
 * is the type deliberately — naming the field it actually serves is what stops
 * it being re-pointed at a scalar a third time.
 *
 * `noneLabel` (parcel H) adds a leading none state for `curve.to`, which the
 * schema spells `"none"` | `{to: factor}` — the SAME factor space as `fb`, so
 * the picker is reused rather than cloned. `fa`/`fb` are required and never
 * pass it; the type keeps 'none' out of their onChange.
 */
function FactorField<N extends string | undefined = undefined>({ value, onChange, title, noneLabel }: {
  value: N extends string ? EffectsLayer['fa'] | 'none' : EffectsLayer['fa'];
  onChange: (f: N extends string ? EffectsLayer['fa'] | 'none' : EffectsLayer['fa']) => void;
  title: string;
  noneLabel?: N;
}) {
  type V = N extends string ? EffectsLayer['fa'] | 'none' : EffectsLayer['fa'];
  const selected = factorFieldSelectValue(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
      <Select title={title} value={selected}
              onChange={(v) => onChange(factorFieldFromSelect(v, value) as V)} style={{ flex: 1, minWidth: 128 }}>
        {noneLabel !== undefined && <option value={NONE_FACTOR_VALUE}>{noneLabel}</option>}
        {factorOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      {typeof value !== 'string' && (() => {
        // The packed triple's own fields, shown only when the factor IS packed.
        // Bounds come from the schema, so the spinner cannot offer a shift the
        // encoding has no room for.
        const packed = value as EffectsPackedFactor;
        return (
        <div style={{ display: 'flex', alignItems: 'center', gap: T.s1 }}>
          <NumberField title="s1 — first shift (15 = term zero / locked)" width={44}
            min={EFFECTS_PACKED_FACTOR_BOUNDS.s1.min} max={EFFECTS_PACKED_FACTOR_BOUNDS.s1.max}
            value={packed.s1}
            onChange={(n) => onChange({ ...packed, s1: clampPackedField('s1', n) } as V)} />
          <NumberField title="s2 — second shift (15 = single term)" width={44}
            min={EFFECTS_PACKED_FACTOR_BOUNDS.s2.min} max={EFFECTS_PACKED_FACTOR_BOUNDS.s2.max}
            value={packed.s2}
            onChange={(n) => onChange({ ...packed, s2: clampPackedField('s2', n) } as V)} />
          <Select title="op — add or subtract the second term" value={String(packed.op)}
                  onChange={(v) => onChange({ ...packed, op: v === '1' ? 1 : 0 } as V)} style={{ width: 56 }}>
            <option value="0">+</option>
            <option value="1">−</option>
          </Select>
        </div>
        );
      })()}
    </div>
  );
}

/**
 * A `$defs/tableRef` sub-form — the 256-byte curve a deform samples.
 *
 * ONE COMPONENT FOR ALL FOUR ATTACHMENTS. `deform_fg`, `deform_bg`, `v_deform`
 * and a layer's `deform.own` each point at the SAME `tableRef`, so a picker per
 * attachment would be four copies of one contract; the sub-form is passed the
 * table and told what to do with a new one.
 *
 * THE FORM LIST AND EVERY PARAMETER ROW ARE DERIVED. `tableRefFormOptions()`
 * comes from the schema's `oneOf`, and the spinners below come from the chosen
 * branch's own `required` list with its own ranges — so this renders SIX forms,
 * not the two ("a wave shape, or a file") a hand-written form would have
 * offered, and a seventh arrives by re-vendoring the schema. `zero` and `.bin`
 * declare no parameters and correctly draw none.
 *
 * ONE FIELD PER ROW, like the rest of the column (ROADMAP item 41): a generator
 * with two parameters is three rows, not a row with three controls wedged into
 * a 220px gutter.
 */
function TableRefField({ table, onChange, titlePrefix }: {
  table: EffectsTableRef;
  onChange: (t: EffectsTableRef) => void;
  titlePrefix: string;
}) {
  const form = tableRefFormOf(table);
  const binPath = tableRefBinPath(table);
  const refusal = binPath === null ? null : binPathRefusal(binPath);
  const advice = tableRefAdvisory(table);
  return (
    <>
      <Field label={TABLE_REF_ROW.label} title={TABLE_REF_ROW.title}>
        {/* The whole attachment, spelled, on the control that picks its shape —
            `sine(8, 64)`, `tables/canopy.bin`. A select showing `sine` and two
            spinners never says the call; `tableRefLabel` is the one place it is
            said, and it used to be said on the read-only extras line that the
            deform row has now replaced. */}
        <Select title={`${titlePrefix} table — ${tableRefLabel(table)}`} value={form}
          onChange={(v) => onChange(tableRefFromForm(v, table))}
          style={{ flex: 1, minWidth: 0 }}>
          {tableRefFormOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      {tableRefParams(form).map((p) => (
        // BOUNDED BY THE CLAMP, NOT THE PROPS (ROADMAP item 37) — `min`/`max`
        // here only style the spinner, and `setTableRefParam` is what actually
        // holds the value inside the branch's declared range. An UNBOUNDED
        // parameter (`focal`, `center`, `max_offset`) passes `undefined` for
        // both rather than inventing a ceiling the contract does not have.
        <Field key={p.key} label={tableParamLabel(p.key)}>
          <NumberField
            title={`${titlePrefix} ${p.key}`
              + (p.min !== null && p.max !== null ? ` (${p.min}..${p.max})` : ' — unbounded')}
            min={p.min ?? undefined} max={p.max ?? undefined} width={72}
            value={tableRefParamValue(table, p.key)}
            onChange={(n) => onChange(setTableRefParam(table, p.key, n))} />
        </Field>
      ))}
      {binPath !== null && (
        <Field label={TABLE_REF_ROW.binLabel} title={TABLE_REF_ROW.binTitle}>
          <input value={binPath} placeholder="tables/name.bin"
            title={`${titlePrefix} bin — ${TABLE_REF_ROW.binRule}`}
            onChange={(e) => onChange({ bin: e.target.value })}
            style={textInput} />
        </Field>
      )}
      {refusal !== null && <Hint under tone="warning">{refusal}</Hint>}
      {advice !== null && <Hint under tone="warning">{advice}</Hint>}
    </>
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

  // ONCE PER SCENE, NOT ONCE PER CARD. The advisory walks every layer and
  // returns `/layers/N` paths, so calling it inside the map would be N scans of
  // N layers to render N cards.
  const deformConflicts = selected ? advisoryLayerDeformConflicts(selected) : [];

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
          {/*
            SAID ON THE ROW, NOT ONLY IN THE TOOLTIP (owner feedback 2026-08-26
            pt 4). The sentinel is what decides whether the layer tops below
            are screen lines or world Ys, and both shipped scenes carry it.
          */}
          <Hint under>{vFactorHint()}</Hint>
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
          <Field label="Transition">
            <Select title="transition"
              value={typeof selected.transition === 'string' ? selected.transition : SCENE_FORM_CHOICES.transition[0]}
              onChange={(v) => run(setSceneFieldCommand(
                library, selected.id, 'transition', v as EffectsScene['transition']))}
              style={{ flex: 1, minWidth: 0 }}>
              {SCENE_FORM_CHOICES.transition.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          {/*
            ═══ DEFORM (wave 2) ═══

            The two plane rows are ONE loop over `SCENE_DEFORM_ROWS`, not two
            hand-written blocks: `deform_fg` and `deform_bg` are the same
            `$defs/sceneDeform` pointed at two planes, and the pair of them
            written out twice is exactly the copy that lets one grow a control
            the other does not have.

            OFF CLEARS THE KEY, it does not write `"none"` — setSceneFieldCommand's
            rule, and the reason it now has a none-defaulted arm at all.
          */}
          {(Object.keys(SCENE_DEFORM_ROWS) as (keyof typeof SCENE_DEFORM_ROWS)[]).map((key) => {
            const row = SCENE_DEFORM_ROWS[key];
            const shared = sceneDeformValue(selected, key);
            const write = (next: { table: EffectsTableRef; speed: number }) => run(
              setSceneFieldCommand(library, selected.id, key, { shared: next }));
            return (
              <React.Fragment key={key}>
                <Field label={row.label} title={row.title}>
                  <Select title={`${row.title}`} value={shared === null ? 'none' : 'on'}
                    onChange={(v) => run(setSceneFieldCommand(
                      library, selected.id, key, sceneDeformFromToggle(v === 'on')))}
                    style={{ width: 88 }}>
                    <option value="none">{SCENE_DEFORM_ROW_SHARED.none}</option>
                    <option value="on">{SCENE_DEFORM_ROW_SHARED.on}</option>
                  </Select>
                </Field>
                {shared !== null && (
                  <>
                    <TableRefField table={shared.table} titlePrefix={key}
                      onChange={(t) => write({ ...shared, table: t })} />
                    <Field label={tableParamLabel('speed')}>
                      <NumberField title={`${key} ${SCENE_DEFORM_ROW_SHARED.speedTitle}`} width={72}
                        value={shared.speed}
                        onChange={(n) => write({ ...shared, speed: clampDeformSpeed(n) })} />
                    </Field>
                  </>
                )}
              </React.Fragment>
            );
          })}
          <Hint under>{SCENE_DEFORM_ROW_SHARED.hint}</Hint>
          {/* THE PER-COLUMN ONE, kept visually beside the plane rows and said to
              be a different thing in its own hint: `v_deform` is per-column
              VERTICAL scroll (VDP reg $0B bit 2), not a third plane table. */}
          {(() => {
            const columns = vDeformValue(selected);
            const write = (next: { table: EffectsTableRef; speed: number; amp_shift: number }) => run(
              setSceneFieldCommand(library, selected.id, 'v_deform', { columns: next }));
            return (
              <>
                <Field label={V_DEFORM_ROW.label} title={V_DEFORM_ROW.title}>
                  {/* THE TOGGLE IS NOT setSceneFieldCommand. Turning V deform
                      OFF must take `left_column_mask` back to undeclared in the
                      SAME gesture, because the engine refuses a declared policy
                      on a scene with no per-column V deform — so a toggle that
                      cleared one key would leave the document build-refused for
                      having turned a feature off. Two keys, one command, one
                      undo step. */}
                  <Select title={V_DEFORM_ROW.title} value={columns === null ? 'none' : 'on'}
                    onChange={(v) => run(vDeformToggleCommand(library, selected.id, v === 'on'))}
                    style={{ width: 88 }}>
                    <option value="none">{V_DEFORM_ROW.none}</option>
                    <option value="on">{V_DEFORM_ROW.on}</option>
                  </Select>
                </Field>
                {columns !== null && (
                  <>
                    <TableRefField table={columns.table} titlePrefix={V_DEFORM_ROW.key}
                      onChange={(t) => write({ ...columns, table: t })} />
                    <Field label={tableParamLabel('speed')}>
                      <NumberField title={`${V_DEFORM_ROW.key} ${SCENE_DEFORM_ROW_SHARED.speedTitle}`}
                        width={72} value={columns.speed}
                        onChange={(n) => write({ ...columns, speed: clampDeformSpeed(n) })} />
                    </Field>
                    <Field label={tableParamLabel('amp_shift')}>
                      <NumberField title={V_DEFORM_ROW.ampTitle}
                        min={EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS.min}
                        max={EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS.max} width={72}
                        value={columns.amp_shift}
                        onChange={(n) => write({ ...columns, amp_shift: clampAmpShift(n) })} />
                    </Field>
                  </>
                )}
              </>
            );
          })()}
          <Hint under style={{ marginBottom: 0 }}>{V_DEFORM_ROW.hint}</Hint>
          {/* THE POLICY V DEFORM MAKES MANDATORY.
              Shown when there is a V deform to adjudicate — and ALSO whenever
              the document already declares a policy without one, which the
              build refuses and a hand-edited file can reach: hiding the row
              there would leave the author reading an advisory with no control
              to act on, which is the exact trap this row exists to close.
              `sprite_mask` is rendered DISABLED with the engine's reason: the
              schema admits the value and the engine refuses it outright, so it
              must be visible (a file can carry it) and unpickable. */}
          {leftColumnMaskRowVisible(selected) && (
            <Field label={LEFT_COLUMN_MASK_ROW.label} title={LEFT_COLUMN_MASK_ROW.title}>
              <Select title={LEFT_COLUMN_MASK_ROW.title} value={leftColumnMaskValue(selected)}
                onChange={(v) => run(leftColumnMaskCommand(library, selected.id, v))}
                style={{ flex: 1, minWidth: 0 }}>
                {leftColumnMaskOptions(selected).map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
                    {o.label}{o.disabled ? ' (engine refuses)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {leftColumnMaskRowVisible(selected)
            && <Hint under>{LEFT_COLUMN_MASK_ROW.hint}</Hint>}
          {/* WHAT THE BUILD WOULD REFUSE, said before the build says it. Four of
              aeon's five comptime deform guards are CROSS-FIELD — a table with
              no plane to sample from, a per-column scene colliding with a
              layer's split, the mandatory left_column_mask policy and its
              mirror — so no single control can carry them and the shape
              validator cannot see them either. Advice, never enforcement: sigil
              stays the rulebook (scene.ts's advisory docblock). */}
          {sceneDeformAdvisories(selected).map((a) => (
            <Hint key={a} under tone="warning" style={{ marginBottom: 0 }}>{a}</Hint>
          ))}
         </SectionBody>
        </CollapsibleSection>
      )}

      {selected && (
        <CollapsibleSection id="aeon.effects.layers" variant="list"
          title={`Layers (${selected.layers.length}/${EFFECTS_LAYER_COUNT.max} per scene)`}
          right={<IconButton icon={<span>Add</span>} label="Add layer"
            disabled={selected.layers.length >= EFFECTS_LAYER_COUNT.max}
            onClick={() => run(addLayerCommand(library, selected.id))} />}>
         <SectionBody style={LIST_BODY}>
          {/*
            THE CAP'S SCOPE, WHERE HE READS THE COUNT (owner feedback 2026-08-26
            pt 4: "why max 8 layers if they go well beyond the screen?" — asked
            when the cap was 8; empyrean `277bc15` has since raised it to 16, and
            the answer is unchanged because it was never about the number). The
            cap is MAX_PARALLAX_BANDS per SCENE; a section binds its own scene;
            and on a locked scene — every scene that exists — the layers divide
            one screen, which the field label below now says. Deliberately
            count-free: every rendered ceiling above comes from
            EFFECTS_LAYER_COUNT, so a number here could only ever disagree.
          */}
          <Hint><span title="a section can bind its own scene">{layerCountLine(selected)}</span></Hint>
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
              {/*
                THE LABEL AND THE BOUND FOLLOW THE SCENE'S SPACE (owner feedback
                2026-08-26 pt 4). On a locked scene a top is a screen/plane
                line and the engine refuses one past the plane; the schema's
                0..32767 `world_y` is the UNLOCKED arm only. `layerTopBounds`
                decides, and the drag on the canvas routes through the same
                `clampLayerTop`, so the spinner and the guide agree.
              */}
              {(() => {
                const top = layerTopBounds(selected);
                const mapped = planeLineOf(selected, layer.world_y);
                return (
                  <>
                    <Field label={top.label}>
                      <NumberField title={`Layer ${i} ${top.label} (${top.min}..${top.max})`
                          + (top.space === 'screen' ? ' — a plane line; the scene is locked' : '')}
                        min={top.min} max={top.max} width={72}
                        value={layer.world_y}
                        onChange={(n) => run(setLayerFieldCommand(
                          library, selected.id, i, 'world_y', clampLayerTop(selected, n)))} />
                    </Field>
                    {mapped.hint !== null && <Hint under tone="warning">{mapped.hint}</Hint>}
                  </>
                );
              })()}
              {/* WHICH PLANE, AND WHAT THE NUMBER IS. These read `fa` / `fb`
                  with "packed scroll factor" for a title, which is the schema's
                  word for the ENCODING and told the owner nothing (parcel D).
                  The label names the plane and its role; the one hint under
                  both says what the fraction means. "packed" lives inside
                  `FactorField`'s custom expander, with `s1`/`s2`/`op`. */}
              <Field label={PLANE_FACTOR_ROWS.fa.label} title={PLANE_FACTOR_ROWS.fa.title}>
                <FactorField title={`Layer ${i} ${PLANE_FACTOR_ROWS.fa.title}`} value={layer.fa}
                  onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fa', f))} />
              </Field>
              <Field label={PLANE_FACTOR_ROWS.fb.label} title={PLANE_FACTOR_ROWS.fb.title}>
                <FactorField title={`Layer ${i} ${PLANE_FACTOR_ROWS.fb.title}`} value={layer.fb}
                  onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fb', f))} />
              </Field>
              <Hint under style={{ marginBottom: 0 }}>{PLANE_FACTOR_HINT}</Hint>
              {/* THE CURVE (parcel H). `curve.to` is a factor in the same space
                  as fb, so it is the same picker with a none state; the hint
                  is the engine's sentence. The advisory below it is the
                  engine's own refusal (to == fb), said before the build says it. */}
              <Field label={LAYER_CURVE_ROW.label} title={LAYER_CURVE_ROW.title}>
                <FactorField title={`Layer ${i} ${LAYER_CURVE_ROW.title}`} noneLabel={LAYER_CURVE_ROW.none}
                  value={curveFieldValue(layer)}
                  onChange={(f) => run(setLayerFieldCommand(
                    library, selected.id, i, 'curve', curveFromField(f)))} />
              </Field>
              <Hint under style={{ marginBottom: 0 }}>{LAYER_CURVE_ROW.hint}</Hint>
              {(() => {
                const advice = curveAdvisory(layer);
                return advice === null ? null : <Hint under tone="warning">{advice}</Hint>;
              })()}
              {/* THE SPLIT (parcel H). none / row, and the row spinner only when
                  set. `clampVSplitAt` is the bound — NumberField's min/max only
                  style the spinner (item 37). */}
              {(() => {
                const at = vsplitFieldValue(layer);
                return (
                  <Field label={LAYER_VSPLIT_ROW.label} title={LAYER_VSPLIT_ROW.title}>
                    <Select title={`Layer ${i} ${LAYER_VSPLIT_ROW.title}`} value={at === null ? 'none' : 'at'}
                            onChange={(v) => run(setLayerFieldCommand(
                              library, selected.id, i, 'vsplit', vsplitFromToggle(v === 'at', layer)))}
                            style={{ width: 72 }}>
                      <option value="none">{LAYER_VSPLIT_ROW.none}</option>
                      <option value="at">{LAYER_VSPLIT_ROW.at}</option>
                    </Select>
                    {at !== null && (
                      <NumberField title={`Layer ${i} vsplit.at (${EFFECTS_VSPLIT_AT_BOUNDS.min}..${EFFECTS_VSPLIT_AT_BOUNDS.max})`}
                        min={EFFECTS_VSPLIT_AT_BOUNDS.min} max={EFFECTS_VSPLIT_AT_BOUNDS.max} width={72}
                        value={at}
                        onChange={(n) => run(setLayerFieldCommand(
                          library, selected.id, i, 'vsplit', { at: clampVSplitAt(n) }))} />
                    )}
                  </Field>
                );
              })()}
              <Hint under style={{ marginBottom: 0 }}>{LAYER_VSPLIT_ROW.hint}</Hint>
              {/* THE STRIP'S OWN DEFORM (wave 2). `own` overrides the scene's
                  plane-shared table for this strip alone, and it carries the
                  same `tableRef` the scene rows do — so the same sub-form.

                  TURNING IT ON IS A NO-OP ON PURPOSE: the seed puts shift_a /
                  shift_b / phase at the schema defaults of the very fields they
                  lower into, so the picture does not jump before a table is
                  chosen. `layerDeformAdvisory` is what makes that legible —
                  without it the row would look broken. */}
              {(() => {
                const own = layerDeformValue(layer);
                const write = (next: NonNullable<ReturnType<typeof layerDeformValue>>) => run(
                  setLayerFieldCommand(library, selected.id, i, 'deform', { own: next }));
                const inert = layerDeformAdvisory(layer);
                return (
                  <>
                    <Field label={LAYER_DEFORM_ROW.label} title={LAYER_DEFORM_ROW.title}>
                      <Select title={`Layer ${i} ${LAYER_DEFORM_ROW.title}`}
                        value={own === null ? 'none' : 'on'}
                        onChange={(v) => run(setLayerFieldCommand(
                          library, selected.id, i, 'deform', layerDeformFromToggle(v === 'on')))}
                        style={{ width: 88 }}>
                        <option value="none">{LAYER_DEFORM_ROW.none}</option>
                        <option value="on">{LAYER_DEFORM_ROW.on}</option>
                      </Select>
                    </Field>
                    {own !== null && (
                      <>
                        <TableRefField table={own.table} titlePrefix={`Layer ${i} deform`}
                          onChange={(t) => write({ ...own, table: t })} />
                        <Field label={tableParamLabel('shift_a')}>
                          <NumberField title={`Layer ${i} ${LAYER_DEFORM_ROW.shiftATitle}`}
                            min={EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.min}
                            max={EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max} width={72}
                            value={own.shift_a}
                            onChange={(n) => write({ ...own, shift_a: clampLayerDeformField('shift_a', n) })} />
                        </Field>
                        <Field label={tableParamLabel('shift_b')}>
                          <NumberField title={`Layer ${i} ${LAYER_DEFORM_ROW.shiftBTitle}`}
                            min={EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.min}
                            max={EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max} width={72}
                            value={own.shift_b}
                            onChange={(n) => write({ ...own, shift_b: clampLayerDeformField('shift_b', n) })} />
                        </Field>
                        <Field label={tableParamLabel('phase')}>
                          <NumberField title={`Layer ${i} ${LAYER_DEFORM_ROW.phaseTitle}`}
                            min={EFFECTS_LAYER_DEFORM_BOUNDS.phase.min}
                            max={EFFECTS_LAYER_DEFORM_BOUNDS.phase.max} width={72}
                            value={own.phase}
                            onChange={(n) => write({ ...own, phase: clampLayerDeformField('phase', n) })} />
                        </Field>
                        <Field label={tableParamLabel('speed')}>
                          <NumberField title={`Layer ${i} ${SCENE_DEFORM_ROW_SHARED.speedTitle}`}
                            width={72} value={own.speed}
                            onChange={(n) => write({ ...own, speed: clampDeformSpeed(n) })} />
                        </Field>
                      </>
                    )}
                    <Hint under style={{ marginBottom: 0 }}>{LAYER_DEFORM_ROW.hint}</Hint>
                    {inert !== null && <Hint under tone="warning">{inert}</Hint>}
                    {/* CURVE ∧ DEFORM ON ONE STRIP, which the build forbids —
                        and which is now authorable from two controls four rows
                        apart on this very card (the curve picker is parcel H's,
                        the deform toggle is wave 2's). Exactly the shape a
                        cross-field advisory exists for. */}
                    {(() => {
                      const clash = layerCurveDeformAdvisory(layer);
                      return clash === null ? null : <Hint under tone="warning">{clash}</Hint>;
                    })()}
                    {/* THE TWO-SOURCES GUARD, wired at last. §2.2: when `own` is
                        present, this layer's dsa/dsb/phase must be absent or at
                        their defaults, because both lower into the SAME record
                        fields. The card has no control for dsa/dsb/phase, so
                        this state arrives from a HAND-EDITED file — which is
                        precisely when an author has no other way to be told. */}
                    {deformConflicts.filter((c) => c.path === `/layers/${i}`).map((c) => (
                      <Hint key={c.path} under tone="warning">{c.message}</Hint>
                    ))}
                  </>
                );
              })()}
              {/* WHAT THE FILE SETS THAT THE CARD STILL CANNOT: disabled, and
                  dsa/dsb/phase. Read-only, mono, at the hint tier so it cannot
                  be mistaken for a control. curve and vsplit left this line
                  when they got controls above (parcel H); deform left it in
                  wave 2, for the same reason. Absent entirely for a plain
                  layer: no empty line. */}
              {(() => {
                const line = layerExtrasLine(layer);
                return line === null ? null : (
                  <Hint under style={{ fontFamily: T.fontMono }}>
                    <span data-testid={`layer-${i}-extras`}
                      title="Set in the scene file; read-only here">{line}</span>
                  </Hint>
                );
              })()}
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
