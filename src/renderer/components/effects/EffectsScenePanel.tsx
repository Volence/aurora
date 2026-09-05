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
import { Field, Hint, Card, Advisory } from './column-layout';
import { actAndDropFocus } from '../ui/act-and-drop-focus';
import { deleteSceneGuarded } from '../../shell/effects-delete-guard';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import type { AnyCommand } from '../../../core/editing/commands';
import type {
  EffectsScene, EffectsSceneLibrary, EffectsLayer, EffectsPackedFactor, EffectsTableRef,
} from '../../../core/formats/effects/scene';
import type { FactorOption, FactorFieldOption } from '../../providers/effects-aeon';
// THE ADVISORY NOTHING CALLED. `advisoryLayerDeformConflicts` has been a pure
// function in the codec since wave 1 with no caller anywhere — the Aurora side
// of §2.2's two-sources guard, written and then never wired. The layer card is
// its reader: see the deform row.
import { advisoryLayerDeformConflicts } from '../../../core/formats/effects/scene';
import { actReach, bandReach, bandReachClause, verticalWrapAdvisory } from '../../canvas/bg-wrap';
import {
  factorOptions, clampPackedField,
  factorFieldSelectValue, factorFieldFromSelect, NONE_FACTOR_VALUE,
  curveFieldValue, curveFromField, curveFieldOptions,
  vsplitFieldValue, vsplitFromToggle, curveAdvisory, curveDescendingAdvisory, clampVSplitAt,
  LAYER_CURVE_ROW, LAYER_VSPLIT_ROW, EFFECTS_VSPLIT_AT_BOUNDS,
  clampVFactor, clampVCenter, clampVOffset,
  layerTopBounds, clampLayerTop, planeLineOf, fireLineAdvisory, vsplitOrderAdvisory,
  vsplitLockAdvisoryParts, sceneVsplitLockAdvisoryParts,
  layerCountLine, vFactorHint,
  sceneListEntries, resolveSelectedScene, sceneRefOptions, unassignableSceneRef,
  sectionSceneCommand, createSceneCommand,
  addLayerCommand, removeLayerCommand, setLayerFieldCommand, setSceneFieldCommand,
  layerExtrasLine,
  SCENE_FORM_CHOICES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_OFFSET_BOUNDS,
  PLANE_FACTOR_ROWS, PLANE_FACTOR_HINT, planeAFactorAdvisory,
  TABLE_REF_ROW, SCENE_DEFORM_ROWS, SCENE_DEFORM_ROW_SHARED, V_DEFORM_ROW, LAYER_DEFORM_ROW,
  tableRefFormOptions, tableRefFormOf, tableRefFromForm, tableRefParams, tableParamLabel,
  tableRefParamValue, setTableRefParam, tableRefBinPath, binPathRefusal, tableRefAdvisory,
  tableRefLabel, tableRefParamOptions, EFFECTS_DEFORM_TABLE_BYTES,
  sceneDeformValue, sceneDeformFromToggle, vDeformValue, vDeformFromToggle,
  layerDeformValue, layerDeformFromToggle, layerDeformAdvisory, sceneDeformAdvisories,
  layerCurveDeformAdvisory,
  // §9.1 — the anchored band split. ⚠ `anchorShiftOptions` is a LADDER PER
  // FIELD and the sentinel is not on it; see effects-aeon's §9.1 block before
  // reaching for a NumberField here.
  ANCHOR_ROW, anchorValue, anchorChannelOptions, anchorShiftOptions,
  anchorToggleCommand, setAnchorChannelCommand, setAnchorShiftCommand,
  anchorDeformAdvisories,
  // §9.2 - a LAYER's own deform amplitude. ⚠ SAME INVERSION, DIFFERENT OBJECT:
  // a ladder per field with the sentinel off it, and `setLayerShiftCommand`
  // throws rather than clamping. What differs from §9.1 is what OFF puts on
  // disk - these keys are optional and defaulted, so off CLEARS unless the file
  // spells it. effects-aeon's §9.2 block has the argument.
  LAYER_SHIFT_ROW, layerShiftOptions, layerShiftValue, setLayerShiftCommand,
  layerShiftAdvisories,
  LEFT_COLUMN_MASK_ROW, leftColumnMaskOptions, leftColumnMaskValue,
  leftColumnMaskRowVisible, leftColumnMaskCommand, vDeformToggleCommand,
  BOB_ROW, BOB_AMPLITUDE_OPTIONS, BOB_PERIOD_OPTIONS,
  bobEnabled, bobShiftValue, bobPeriodValue, bobLine,
  bobToggleCommand, setBobShiftCommand, setBobPeriodCommand,
  clampLayerDeformField, clampAmpShift, clampDeformSpeed,
  EFFECTS_LAYER_DEFORM_BOUNDS, EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS,
  LAYER_DRIFT_ROW, EFFECTS_DRIFT_PX_BOUNDS, EFFECTS_DRIFT_PX_STEP,
  driftPxFieldValue, driftFromToggle, driftFromPxPerFrame, driftPxPerFrameRefusal,
  // §2.7 REELS. ⚠ `EFFECTS_REEL_RATE_BOUNDS` is WHOLE PIXELS PER FRAME and the
  // drift line above is 1/256 px. Nothing on the reels path converts anything:
  // `setReelRateCommand` stores the integer the box produced, and there is no
  // `reelPxPerFrameToRate` to reach for by mistake.
  REELS_ROW, EFFECTS_REEL_RATE_BOUNDS,
  reelsEnabled, reelRatesValue, reelStripLabel, reelStripTitle, reelRateGuidance,
  reelRateWriteRefusal, reelsToggleCommand, setReelRateCommand, reelsBindingAdvisories,
  LAYER_ROW_REMAP_ROW, ROW_REMAP_HEIGHT_OPTIONS, EFFECTS_ROW_REMAP_CAPABILITY_NOTE,
  rowRemapFieldValue, rowRemapFromToggle, rowRemapWithPlaneY, rowRemapWithHeightShift,
  rowRemapPreconditions,
  vsplitVDeformAdvisoryParts,
} from '../../providers/effects-aeon';
// THE ONE CROSS-DOCUMENT QUESTION THIS PANEL ASKS. Every other reading here is a
// fact about the scene in front of the author; this one is about a preset in a
// different directory, edited in a different panel, and it is the whole point of
// the V-deform row's last line.
import { vDeformRampAdvisory } from '../../providers/effects-preset';
import {
  EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS, rowRemapPlaneYRefusal, rowRemapBuildableToday,
} from '../../../core/formats/effects/scene-ui';
import type { EffectsPresetLibrary } from '../../../core/formats/effects/preset';

const EMPTY_LIBRARY: EffectsSceneLibrary = { scenes: [], unreadable: [], notices: [], loadedPaths: [] };
/** `BandPresetPanel`'s idiom — an absent library is an empty one, never a null check at the call. */
const EMPTY_PRESETS: EffectsPresetLibrary = { presets: [], unreadable: [], notices: [], loadedPaths: [] };

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
 *
 * `options` (ROADMAP row 13) lets a CALLER narrow the list to what the engine
 * will take from THAT field, disabled-with-a-reason rather than dropped — the
 * `leftColumnMaskOptions` / `tableRefParamOptions` idiom, third instance. Only
 * the curve row passes it: `fa`/`fb` are the factor space itself and have no
 * value the engine refuses, so they keep the plain list. The none option is
 * never among them — "no curve" is always legal.
 */
function FactorField<N extends string | undefined = undefined>({ value, onChange, title, noneLabel, options }: {
  value: N extends string ? EffectsLayer['fa'] | 'none' : EffectsLayer['fa'];
  onChange: (f: N extends string ? EffectsLayer['fa'] | 'none' : EffectsLayer['fa']) => void;
  title: string;
  noneLabel?: N;
  options?: readonly FactorFieldOption[];
}) {
  type V = N extends string ? EffectsLayer['fa'] | 'none' : EffectsLayer['fa'];
  const selected = factorFieldSelectValue(value);
  const opts: readonly (FactorOption & { disabled?: boolean; title?: string })[]
    = options ?? factorOptions();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
      <Select title={title} value={selected}
              onChange={(v) => onChange(factorFieldFromSelect(v, value) as V)} style={{ flex: 1, minWidth: 128 }}>
        {noneLabel !== undefined && <option value={NONE_FACTOR_VALUE}>{noneLabel}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
            {o.label}{o.disabled ? ' (engine refuses)' : ''}
          </option>
        ))}
      </Select>
      {typeof value !== 'string' && (() => {
        // The packed triple's own fields, shown only when the factor IS packed.
        // Bounds come from the schema, so the spinner cannot offer a shift the
        // encoding has no room for.
        const packed = value as EffectsPackedFactor;
        return (
        <div style={{ display: 'flex', alignItems: 'center', gap: T.s1 }}>
          <NumberField title="s1: first shift (15 = term zero / locked)" width={44}
            min={EFFECTS_PACKED_FACTOR_BOUNDS.s1.min} max={EFFECTS_PACKED_FACTOR_BOUNDS.s1.max}
            value={packed.s1}
            onChange={(n) => onChange({ ...packed, s1: clampPackedField('s1', n) } as V)} />
          <NumberField title="s2: second shift (15 = single term)" width={44}
            min={EFFECTS_PACKED_FACTOR_BOUNDS.s2.min} max={EFFECTS_PACKED_FACTOR_BOUNDS.s2.max}
            value={packed.s2}
            onChange={(n) => onChange({ ...packed, s2: clampPackedField('s2', n) } as V)} />
          <Select title="op: add or subtract the second term" value={String(packed.op)}
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
        <Select title={`${titlePrefix} table: ${tableRefLabel(table)}`} value={form}
          onChange={(v) => onChange(tableRefFromForm(v, table))}
          style={{ flex: 1, minWidth: 0 }}>
          {tableRefFormOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      {tableRefParams(form).map((p) => {
        // A PICKER WHERE THE ENGINE ADMITS A SET, A SPINNER WHERE IT ADMITS A
        // RANGE (ROADMAP row 63). `period` must DIVIDE the table length, which
        // is not a bound and so is not something `min`/`max` or a clamp can
        // express — the spinner advertised 247 values the build refuses. The
        // option list is computed from the schema's own table length, and a
        // non-divisor the FILE carries is rendered disabled rather than dropped,
        // for `leftColumnMaskOptions`'s reason: a `<select>` missing its own
        // value shows a different one, which here would mean the author reading
        // a legal period while the build reads an illegal one.
        const options = tableRefParamOptions(form, p.key, tableRefParamValue(table, p.key));
        if (options !== null) {
          return (
            <Field key={p.key} label={tableParamLabel(p.key)}>
              <Select
                title={`${titlePrefix} ${p.key}: must divide the `
                  + `${EFFECTS_DEFORM_TABLE_BYTES}-byte table; the build refuses any other value`}
                value={String(tableRefParamValue(table, p.key))}
                onChange={(v) => onChange(setTableRefParam(table, p.key, Number(v)))}
                style={{ width: 88 }}>
                {options.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
                    {o.label}{o.disabled ? ' (engine refuses)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        // BOUNDED BY THE CLAMP, NOT THE PROPS (ROADMAP item 37) — `min`/`max`
        // here only style the spinner, and `setTableRefParam` is what actually
        // holds the value inside the branch's declared range. An UNBOUNDED
        // parameter (`focal`, `center`, `max_offset`) passes `undefined` for
        // both rather than inventing a ceiling the contract does not have.
        return (
          <Field key={p.key} label={tableParamLabel(p.key)}>
            <NumberField
              title={`${titlePrefix} ${p.key}`
                + (p.min !== null && p.max !== null ? ` (${p.min}..${p.max})` : ' (unbounded)')}
              min={p.min ?? undefined} max={p.max ?? undefined} width={72}
              value={tableRefParamValue(table, p.key)}
              onChange={(n) => onChange(setTableRefParam(table, p.key, n))} />
          </Field>
        );
      })}
      {binPath !== null && (
        <Field label={TABLE_REF_ROW.binLabel} title={TABLE_REF_ROW.binTitle}>
          <input value={binPath} placeholder="tables/name.bin"
            title={`${titlePrefix} bin: ${TABLE_REF_ROW.binRule}`}
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
  // THE DRIFT BOX'S REFUSAL, PER LAYER — keyed by index because the cards are
  // mapped inline in this component and a single string would paint layer 3's
  // refusal under layer 0's box. `NumberField` clears it on focus and on any
  // value that commits, so a stale sentence cannot outlive the number beside it.
  const [driftRefusal, setDriftRefusal] = React.useState<Record<number, string | null>>({});
  // THE PLANE-LINE BOX'S REFUSAL, PER LAYER — same shape and same reason as the
  // drift box's above. It matters more here: `plane_y`'s ceiling has NO
  // enforcement in aeon at all (the ensure tests >= 0 only), so this sentence is
  // the only thing between an author and a window that builds clean and points
  // nowhere.
  const [planeYRefusal, setPlaneYRefusal] = React.useState<Record<number, string | null>>({});
  // THE REEL BOXES' REFUSALS, PER STRIP — same shape as the two above, keyed by
  // STRIP INDEX, which here is a screen position (strip `i` owns screen X
  // `64i..64i+63`) rather than a list position. It matters as much as
  // `plane_y`'s: a refused reel rate is nearly always a ×256 that belongs to
  // `drift.rate`, and the `-128..127` bound this sentence explains is the only
  // place in the whole pipeline that mistake is caught today.
  const [reelRefusal, setReelRefusal] = React.useState<Record<number, string | null>>({});

  // Keep the selection on something that exists: undoing a create, or opening a
  // different project, leaves a stale id behind.
  const selected = resolveSelectedScene(library, selectedId);

  // A refusal is about ONE box on ONE scene's layer, and the map above keys it by
  // index alone — so switching scenes would otherwise paint the old scene's
  // sentence under the new scene's layer of the same number. Cleared on the
  // change rather than keyed by `${id}:${i}`, because a refusal is a transient
  // fact about what the author just typed and nothing should carry it across.
  React.useEffect(() => {
    setDriftRefusal({}); setPlaneYRefusal({}); setReelRefusal({});
  }, [selected?.id]);

  // ONCE PER SCENE, NOT ONCE PER CARD. The advisory walks every layer and
  // returns `/layers/N` paths, so calling it inside the map would be N scans of
  // N layers to render N cards.
  const deformConflicts = selected ? advisoryLayerDeformConflicts(selected) : [];

  const state = useProjectStore.getState();
  const act = state.project && state.currentActId
    ? getActiveLevel(state)?.act ?? null
    : null;
  const section = act?.sections[activeSectionIndex] ?? null;
  // HOW FAR THE CAMERA TRAVELS ACROSS THIS ACT, which is the only thing that
  // turns a parallax factor into "the background starts over HERE" (ROADMAP
  // O21). `null` with no act open: the period a factor implies is act-
  // independent, but every statement about WHERE a repeat lands needs an act,
  // and inventing one would be worse than saying nothing.
  const reach = act ? actReach(act) : null;

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
            {' '}<code>data/editor/effects/</code>. Create one below.
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
                {/* ⚠ ACTS AND THEN DROPS FOCUS (d-27, see
                    `ui/act-and-drop-focus.ts`), and this is the `key={i}`
                    LIST-REMOVAL shape — the sharper failure. The card is keyed
                    by INDEX, so after this removes layer `i` the button does
                    not go with the layer it deleted: React re-uses it for the
                    layer that slid down into slot `i`. Before the ruling it
                    kept focus, and a bare Space did not repeat the action, it
                    RETARGETED it at the neighbour — hold Space on "Remove
                    layer 2" and layers 2, 3 and 4 go, one keystroke each,
                    until the `min` floor disables the button. */}
                <IconButton icon={<span>Remove</span>} label={`Remove layer ${i}`}
                  disabled={selected.layers.length <= EFFECTS_LAYER_COUNT.min}
                  onClick={(e) => actAndDropFocus(e, () => run(removeLayerCommand(library, selected.id, i)))} />
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
                const top = layerTopBounds(selected, layer);
                const mapped = planeLineOf(selected, layer.world_y);
                // THE FIRE-LINE ADVISORY (2026-08-27). Null unless this layer
                // carries a split and so becomes a raster fire — the bound is
                // about a SUBSET of layers, not about the field's range, and
                // the provider's block says how that subset was measured. It is
                // an advisory: the spinner keeps its 0..511 and the scene still
                // saves (ROADMAP row 58).
                const fire = fireLineAdvisory(selected, layer);
                // The SECOND engine rule a split can trip, and the only other
                // one reachable from this panel: splits must descend the screen
                // (aeon scene_vsplit_fires). Advisory, never a clamp — the fix
                // involves two layers and has two spellings.
                const order = vsplitOrderAdvisory(selected, selected.layers, i);
                // WHAT NARROWED THE SPINNER'S RANGE, when something did. The
                // plane's own bound is the unnarrowed one; anything tighter is
                // the fire rule, and the author has no way to know that from a
                // pair of numbers. Compared against `layerTopBounds` with NO
                // layer, which is exactly "the bound before this layer's split
                // was considered".
                const plane = layerTopBounds(selected);
                const topNarrowed = (top.min > plane.min || top.max < plane.max)
                  ? `narrowed from ${plane.min}..${plane.max} because this layer authors a split, `
                    + `so it becomes a raster fire, and a fire's screen line is its top less `
                    + `v_offset (${selected.v_offset ?? 0}). Move the view box to move this range.`
                  : null;
                return (
                  <>
                    <Field label={top.label}>
                      {/* WHY THE RANGE IS WHAT IT IS, not just what it is
                          (2026-08-28). `(67..287)` on its own is barely better
                          than silence — it is the number the owner was already
                          looking at when he decided the editor was broken. The
                          narrowing is only mentioned when it HAS been narrowed,
                          so a plain layer's tooltip is unchanged. */}
                      <NumberField title={`Layer ${i} ${top.label} (${top.min}..${top.max})`
                          + (top.space === 'screen' ? '; a plane line, so the scene is locked' : '')
                          + (topNarrowed !== null ? `; ${topNarrowed}` : '')}
                        min={top.min} max={top.max} width={72}
                        value={layer.world_y}
                        onChange={(n) => run(setLayerFieldCommand(
                          library, selected.id, i, 'world_y', clampLayerTop(selected, n, layer)))} />
                    </Field>
                    {mapped.hint !== null && <Hint under tone="warning">{mapped.hint}</Hint>}
                    {fire !== null && <Hint under tone="warning">{fire}</Hint>}
                    {order !== null && <Hint under tone="warning">{order}</Hint>}
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
              {/* THE PLANE A ADVISORY (2026-09-05). Under the control that sets
                  it, the same shape as the fire-line and curve hints, because
                  `ojz_act1_sec7_worldwater` set fa below FACTOR_1 on two layers
                  from this exact picker and the panel said nothing — the owner
                  read it off the running game as "the fg loading wrong".
                  ADVICE, NOT A REFUSAL: aeon's layer() has no guard on fa, so
                  the option list is untouched and the scene still saves. The
                  derivation and both engine quotes live over
                  `planeAFactorAdvisory`; nothing is restated here. */}
              {(() => {
                const planeA = planeAFactorAdvisory(layer);
                return planeA === null ? null : <Hint under tone="warning">{planeA}</Hint>;
              })()}
              {/* WHERE THIS BAND'S PICTURE STARTS OVER, IN THE TOOLTIP AND NOT
                  ON THE ROW (ROADMAP O21). Plane B is 512 px wide and wraps, so
                  a band with any live factor repeats across an act — that is the
                  design (the survey's row 19: "every background layer must be
                  periodic at 512 px horizontally"), not a fault, and a visible
                  line saying so on every layer of every scene would add height
                  to this panel to report the normal case. What an author cannot
                  currently get anywhere is the NUMBER: how much camera one pass
                  costs, and how many passes this act buys. It sits on the
                  control that decides it. */}
              <Field label={PLANE_FACTOR_ROWS.fb.label} title={PLANE_FACTOR_ROWS.fb.title}>
                <FactorField title={`Layer ${i} ${PLANE_FACTOR_ROWS.fb.title}`
                    + (reach === null ? ''
                      : `, ${bandReachClause(bandReach(layer, i, reach.travelX), reach.travelX)}`)}
                  value={layer.fb}
                  onChange={(f) => run(setLayerFieldCommand(library, selected.id, i, 'fb', f))} />
              </Field>
              <Hint under style={{ marginBottom: 0 }}>{PLANE_FACTOR_HINT}</Hint>
              {/* THE CURVE (parcel H). `curve.to` is a factor in the same space
                  as fb, so it is the same picker with a none state; the hint
                  is the engine's sentence. The advisory below it is the
                  engine's own refusal (to == fb), said before the build says it.

                  THE PICKER NO LONGER OFFERS THAT REFUSAL AS A CHOICE (row 13).
                  Until this parcel an author could SELECT the one value the
                  engine rejects and only then read the sentence saying so.
                  `curveFieldOptions` greys it, with the engine's own reason on
                  the option — DISABLED, never dropped: a select missing its own
                  value shows a different one, so a file already carrying
                  `to == fb` would have drawn as `none` (the `leftColumnMask`
                  and `period` rows take the identical shape, and the reason is
                  written out over `curveFieldOptions`).

                  DERIVED, NOT COPIED: the greying and the sentence below both
                  come from `curveGoesNowhere` / `curveFlatReason`. The
                  comparison is nowhere in this component, so the option and the
                  advisory cannot come to disagree. */}
              <Field label={LAYER_CURVE_ROW.label} title={LAYER_CURVE_ROW.title}>
                <FactorField title={`Layer ${i} ${LAYER_CURVE_ROW.title}`} noneLabel={LAYER_CURVE_ROW.none}
                  options={curveFieldOptions(layer)}
                  value={curveFieldValue(layer)}
                  onChange={(f) => run(setLayerFieldCommand(
                    library, selected.id, i, 'curve', curveFromField(f)))} />
              </Field>
              <Hint under style={{ marginBottom: 0 }}>{LAYER_CURVE_ROW.hint}</Hint>
              {(() => {
                const advice = curveAdvisory(layer);
                return advice === null ? null : <Hint under tone="warning">{advice}</Hint>;
              })()}
              {/* ⚠ THE DIRECTION OF THE RAMP, which no build checks. `fb` is
                  Plane B at the strip's TOP and `curve.to` at its BOTTOM, and a
                  DESCENDING curve garbles the background - bisected on a live
                  machine 2026-09-05 (aeon df3b8810), mechanism unestablished.
                  `layer()` refuses only the DEGENERATE case above, so this is
                  the one thing about a curve that reaches a ROM green and wrong.
                  It matters most here because route (c) of the row remap's
                  precondition 1 - the only route needing no deform table - is
                  "a `curve:` on that layer", so every remap authored that way
                  comes through this picker.

                  A SECOND HINT AND NOT A LONGER FIRST ONE: the two say
                  different kinds of thing. `curveAdvisory` reports a refusal
                  the build will make; this reports a correlation nothing
                  enforces. Folding them would let a reader carry the first
                  one's authority onto the second. And the option is NOT greyed
                  - see `curveDescendingAdvisory` for why prevention would be
                  Aurora inventing a rule. */}
              {(() => {
                const down = curveDescendingAdvisory(layer);
                return down === null ? null : <Hint under tone="warning">{down}</Hint>;
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
              {/* THE TWO-WRITER RULING, UNDER THE CONTROL THAT TRIPS IT (row 80).
                  Turning this split on while the scene's Plane B tracks the
                  camera makes the whole document unbuildable. Null on a locked
                  scene — which is every scene that ships, so this hint is
                  invisible in the common case and the tests carry a locked
                  control precisely because a broken build looks identical. */}
              {/* THREE PARTS HERE TOO (ROADMAP O15) — and this is the surface
                  that renders the sentence ONCE PER SPLIT LAYER, so its height
                  multiplies. Each card owns its own disclosure state; opening
                  one card's "Why this happens" does not open the others'. */}
              {(() => {
                const lock = vsplitLockAdvisoryParts(selected, layer);
                return lock === null ? null : <Advisory under {...lock} />;
              })()}
              {/* THE RULING'S **SECOND** REFUSAL, WHICH ROW 80 NEVER REACHED.
                  aeon's `scene()` refuses a vsplit beside a `v_deform` on the
                  line after it refuses one on an unlocked plane, and until
                  2026-09-04 Aurora said so in exactly one place — the Deform
                  section's advisory list — which is the position row 80 judged
                  insufficient for the twin. Same argument, same fix: the sentence
                  goes under the control that trips it.
                  BOTH CAN SHOW AT ONCE and neither is suppressed. An unlocked
                  scene that also carries a V deform breaks two ensures, the
                  remedies differ (one moves `v_factor`, the other moves
                  `v_deform`), and choosing which of two real refusals the author
                  is allowed to see is `sceneDeformAdvisories`' guard-3 mistake. */}
              {(() => {
                const vd = vsplitVDeformAdvisoryParts(selected, layer);
                return vd === null ? null : <Advisory under {...vd} />;
              })()}
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
                    {/* THE TWO-SOURCES GUARD. §2.2: when `own` is present, this
                        layer's dsa/dsb/phase must be absent or at their
                        defaults, because both lower into the SAME record fields.

                        ⚠ IT USED TO SAY "the card has no control for
                        dsa/dsb/phase, so this state arrives from a HAND-EDITED
                        file". THAT IS NO LONGER TRUE for two of the three: the
                        two ladders below author dsa/dsb directly, so this
                        warning is now reachable by two gestures on this very
                        card - turn `own` on, then lower a plane. It sits
                        BETWEEN the `own` table above and the ladders below on
                        purpose: both of its halves are visible from it. */}
                    {deformConflicts.filter((c) => c.path === `/layers/${i}`).map((c) => (
                      <Hint key={c.path} under tone="warning">{c.message}</Hint>
                    ))}
                  </>
                );
              })()}
              {/* ═══ THIS STRIP'S OWN DEFORM AMPLITUDE, ONE LADDER PER PLANE (§9.2) ═══

                  ⚠⚠ `<select>`s, AND THAT IS THE WHOLE SAFETY ARGUMENT - the
                  same one the anchor's pair carries five hundred rows down.
                  `dsa`/`dsb` are 0..15 where **15 means NO DEFORM**, so a
                  spinner dragged toward its maximum authors "this plane does not
                  move": the opposite of the gesture, silently, with a green
                  build. The list runs least motion first, the sentinel is not on
                  it, and off is a NAMED entry at the top.

                  WHAT OFF WRITES IS NOT WHAT THE ANCHOR'S OFF WRITES, and the
                  contract decides it rather than taste: `anchor.at` requires all
                  three of its keys, so its sentinel is always spelled; these two
                  are optional with `default: 15`, so absent and 15 are one
                  document and off CLEARS the key unless the file already spells
                  it. That is `setLayerFieldCommand`'s rule, which curve, vsplit,
                  deform, drift and rowRemap have all used since parcel H, and
                  `setLayerShiftCommand` routes through that function rather than
                  restating it.

                  PLACED AFTER THE DEFORM ROW because these amplitudes sample
                  the table that row attaches (or the scene's plane-shared one),
                  and immediately after the two-sources warning, which is the
                  one state where these two controls and that one disagree. */}
              {([['dsa', LAYER_SHIFT_ROW.planeALabel],
                 ['dsb', LAYER_SHIFT_ROW.planeBLabel]] as const)
                .map(([field, label]) => (
                  <Field key={field} label={label}>
                    <Select title={`Layer ${i} ${field}`}
                      value={String(layerShiftValue(layer, field))}
                      onChange={(v) => run(setLayerShiftCommand(
                        library, selected.id, i, field, Number(v)))}
                      style={{ flex: 1, minWidth: 0 }}>
                      {/* ONE LOOP OVER THE TWO PLANES, on the anchor row's
                          reasoning: two hand-written blocks is exactly the copy
                          that lets one plane grow a rung the other has not. Each
                          ladder is built from its OWN field's bounds. */}
                      {layerShiftOptions(field).map((o) => (
                        <option key={o.shift} value={o.shift} title={o.title}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>
                ))}
              <Hint under style={{ marginBottom: 0 }}>{LAYER_SHIFT_ROW.hint}</Hint>
              {/* THE STATE NO BUILD WILL EVER REPORT: a live shift with no table
                  to sample is flat-pathed at runtime - the scene compiles, ships
                  and does not move. Warning-toned because the author asked for
                  motion and will not get it. */}
              {layerShiftAdvisories(selected, i).map((a) => (
                <Hint key={a} under tone="warning" style={{ marginBottom: 0 }}>
                  <span data-testid={`layer-${i}-shift-advisory`}>{a}</span>
                </Hint>
              ))}
              {/* DRIFT (EW-DRIFT-CTL). The one row on this card that moves the
                  strip with the camera STANDING STILL, which is why it sits
                  last: everything above it is camera-relative.

                  ═══ THE UNIT, WHICH IS THE WHOLE ROW ═══

                  The box is px/frame; the FILE is in 1/256ths of one. aeon's
                  generator does NOT convert — its own docstring says the
                  multiply "happens in AURORA'S UI, on export" and that doing
                  it there too "would apply it twice and every authored rate
                  would come out 256x too fast" — so `driftFromPxPerFrame` is
                  the single write-path caller of the single
                  `EFFECTS_DRIFT_UNITS_PER_PIXEL` multiply in this repo, and
                  nothing here re-derives that factor. (Nor does this comment
                  write it as a bare literal: `effects-drift.test.ts` greps
                  these files for one, which is the check that would catch a
                  second copy.) A unit error of that size is invisible to any
                  test that checks one direction, because every wrong value is
                  itself a legal rate; the gate is the ROUND TRIP — author,
                  export, import, and the box shows what was typed.

                  ═══ REFUSED AT THE CONTROL, AT TYPING TIME ═══

                  aeon FORWARDS `Rate(0)` and `Rate(9000)` as shape-legal and
                  lets its build `ensure` refuse them, so this box is the only
                  place an author learns the bound before a red build — the
                  owner's own complaint (EFFECTS-W1 defect 5), where the only
                  escape from an unbuildable document was to revert. `refuse`
                  withholds the commit; `min`/`max`/`step` below bind the
                  spinner and stop NO typed value.

                  NO GROUP CONTROL, deliberately. The four OJZ canopy strips
                  carry one rate because that art is a single plane cut into
                  four records and per-strip rates would shear it at a boundary
                  — an author typing one number four times, not an "apply to
                  all" that would hide that drift is per-layer. */}
              {(() => {
                const px = driftPxFieldValue(layer);
                const why = driftRefusal[i] ?? null;
                return (
                  <>
                    <Field label={LAYER_DRIFT_ROW.label} title={LAYER_DRIFT_ROW.title}>
                      <Select title={`Layer ${i} ${LAYER_DRIFT_ROW.title}`}
                        value={px === null ? 'none' : 'rate'}
                        onChange={(v) => {
                          setDriftRefusal((s) => ({ ...s, [i]: null }));
                          run(setLayerFieldCommand(
                            library, selected.id, i, 'drift', driftFromToggle(v === 'rate')));
                        }}
                        style={{ width: 88 }}>
                        <option value="none">{LAYER_DRIFT_ROW.none}</option>
                        <option value="rate">{LAYER_DRIFT_ROW.on}</option>
                      </Select>
                      {px !== null && (
                        <NumberField title={`Layer ${i} ${LAYER_DRIFT_ROW.rateTitle}`}
                          min={EFFECTS_DRIFT_PX_BOUNDS.min} max={EFFECTS_DRIFT_PX_BOUNDS.max}
                          step={EFFECTS_DRIFT_PX_STEP} width={72} value={px}
                          refuse={(n) => driftPxPerFrameRefusal(n)}
                          onRefusal={(r) => setDriftRefusal((s) => ({ ...s, [i]: r }))}
                          onChange={(n) => run(setLayerFieldCommand(
                            library, selected.id, i, 'drift', driftFromPxPerFrame(n)))} />
                      )}
                    </Field>
                    <Hint under style={{ marginBottom: 0 }}>{LAYER_DRIFT_ROW.hint}</Hint>
                    {why !== null && <Hint under tone="warning">{why}</Hint>}
                  </>
                );
              })()}
              {/* ROW REMAP (EW-9-ROWREMAP-CONTROL, empyrean 3992d16 section 2.6).
                  Last on the card, under drift, because it is the only row that
                  reorders the strip's own rows rather than moving it.

                  ═══ THE PICKER SHOWS LINES AND THE FILE STORES A SHIFT ═══

                  `height_shift` is a SHIFT — H = 1 << shift — and EVERY value
                  3..7 is legal, so an editor that exported the line count would
                  land a band four times too tall and the build would be GREEN.
                  aeon's own ensure names the trap ("If you meant 64 LINES, you
                  want 6"), and the contract asks an editor to DISPLAY 1 << shift
                  and EXPORT the shift. The option labels come from
                  ROW_REMAP_HEIGHT_OPTIONS (the one `<<` on this key in the repo)
                  and `rowRemapWithHeightShift` writes `o.shift`.

                  ═══ FOUR OF THE FIVE DO NOT BUILD, AND THE ROW SAYS SO ═══

                  Only the shift with a generated ladder builds today; aeon
                  refuses the rest BY NAME until its generator half lands. The
                  buildable option carries a suffix in the list and a warning
                  appears under the row for any other — the owner's recorded
                  complaint about this tooling is precisely a build that fails
                  after the fact ("errors during build time that I would have to
                  stop and revert"). The options are NOT filtered: the values are
                  legal, and an author who opened a hand-authored shift 6 must
                  see their own file in the list. Nothing here says "only 4":
                  `rowRemapBuildableToday` reads the state out of the contract and
                  goes quiet on its own when 9b lands.

                  ═══ THE THREE PRECONDITIONS, MET HERE OR IN A BUILD LOG ═══

                  Section 2.6 keeps them OUT of the schema and gives them to
                  aeon's generator, so nothing refuses them until a build runs —
                  but all three are functions of keys this panel is already
                  holding. They render as warnings, not refusals: the document
                  stays legal, and Aurora is not a fourth party inventing a rule.
                  The fourth condition (the game's CAP_ROW_REMAP) is NOT a
                  function of the document and is stated as a note instead of
                  being silently omitted. */}
              {(() => {
                const rr = rowRemapFieldValue(layer);
                const why = planeYRefusal[i] ?? null;
                const unbuildable = rr === null ? null : rowRemapBuildableToday(rr.height_shift);
                const unmet = selected === null ? [] : rowRemapPreconditions(selected, i);
                return (
                  <>
                    <Field label={LAYER_ROW_REMAP_ROW.label} title={LAYER_ROW_REMAP_ROW.title}>
                      <Select title={`Layer ${i} ${LAYER_ROW_REMAP_ROW.title}`}
                        value={rr === null ? 'none' : 'ladder'}
                        onChange={(v) => {
                          setPlaneYRefusal((st) => ({ ...st, [i]: null }));
                          run(setLayerFieldCommand(
                            library, selected.id, i, 'rowRemap',
                            rowRemapFromToggle(v === 'ladder', layer)));
                        }}
                        style={{ width: 88 }}>
                        <option value="none">{LAYER_ROW_REMAP_ROW.none}</option>
                        <option value="ladder">{LAYER_ROW_REMAP_ROW.on}</option>
                      </Select>
                      {rr !== null && (
                        <>
                          <NumberField title={`Layer ${i} ${LAYER_ROW_REMAP_ROW.planeYTitle}`}
                            min={EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS.min}
                            max={EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS.max}
                            width={64} value={rr.plane_y}
                            refuse={(n) => rowRemapPlaneYRefusal(n)}
                            onRefusal={(r) => setPlaneYRefusal((st) => ({ ...st, [i]: r }))}
                            onChange={(n) => run(setLayerFieldCommand(
                              library, selected.id, i, 'rowRemap', rowRemapWithPlaneY(rr, n)))} />
                          <Select title={`Layer ${i} ${LAYER_ROW_REMAP_ROW.heightTitle}`}
                            value={String(rr.height_shift)}
                            onChange={(v) => run(setLayerFieldCommand(
                              library, selected.id, i, 'rowRemap',
                              rowRemapWithHeightShift(rr, Number(v))))}
                            style={{ flex: 1, minWidth: 0 }}>
                            {ROW_REMAP_HEIGHT_OPTIONS.map((o) => (
                              <option key={o.shift} value={String(o.shift)}>{o.label}</option>
                            ))}
                          </Select>
                        </>
                      )}
                    </Field>
                    <Hint under style={{ marginBottom: 0 }}>{LAYER_ROW_REMAP_ROW.hint}</Hint>
                    {why !== null && <Hint under tone="warning">{why}</Hint>}
                    {unbuildable !== null
                      && <Hint under tone="warning">{unbuildable}</Hint>}
                    {/* THE SPAN IS NOT DECORATION. `Hint` takes {children,
                        under, tone, style} and DROPS anything else, and TS does
                        not catch a hyphenated JSX attribute on a component — so
                        `data-testid` passed to <Hint> silently never reaches the
                        DOM. It did here, and the harness's precondition rows
                        read zero nodes while the sentences were visibly on
                        screen: a testid that asserts nothing, found by driving
                        the app rather than by reading the source. The extras
                        line below already wraps for the same reason. */}
                    {unmet.map((m) => (
                      <Hint key={m} under tone="warning">
                        <span data-testid={`layer-${i}-rowremap-precondition`}>{m}</span>
                      </Hint>
                    ))}
                    {rr !== null && (
                      <Hint under>{EFFECTS_ROW_REMAP_CAPABILITY_NOTE}</Hint>
                    )}
                  </>
                );
              })()}
              {/* WHAT THE FILE SETS THAT THE CARD STILL CANNOT: disabled, and
                  dsa/dsb/phase. Read-only, mono, at the hint tier so it cannot
                  be mistaken for a control. curve and vsplit left this line
                  when they got controls above (parcel H); deform left it in
                  wave 2 and drift at EW-DRIFT-CTL, for the same reason. Absent
                  entirely for a plain layer: no empty line. */}
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

      {/* ⚠ THE SCENE FORM ARRIVES COLLAPSED, AND IT IS THE ONLY WAY THE LAYERS
          LIST ABOVE GETS A HEIGHT (EW-SHAPE-TABS; the owner's mockup draws this
          section as `Scene settings (v)`, shut, under the layer list).

          MEASURED, not preferred. The list section takes a share of what the
          CONTENT sections leave, and content sections never shrink
          (ui/CollapsibleSection). On the Parallax tab, expanded, this form is
          478px of a 742px column — so with it open the layers list is pushed
          onto its 160px floor and draws a 129px window onto a list of ~200px
          cards, which is where the cold walkthrough (§a9) and the drift parcel
          both landed. Shut, it is a 25px header and the list gets the rest.

          THE FIELDS DID NOT MOVE AND NOTHING WAS HIDDEN: one click opens it,
          and the disclosure is persisted per author (shell/panel-state), so
          this is the ARRIVAL state only. It is `defaultCollapsed`, which the
          persisted state overrides in both directions. */}
      {selected && (
        <CollapsibleSection id="aeon.effects.scene" title={`Scene: ${selected.id}`}
          defaultCollapsed
          right={<IconButton icon={<span>Delete</span>} label={`Delete scene ${selected.id}`}
            // d-27, AND THIS IS THE STRONGEST INSTANCE OF IT IN THE APP. Both
            // earlier passes excluded this button as self-unmounting; clicking
            // it (`docs/reviews/2026-09-03-d27-disputed-six.md`, `[esd-a..c]`)
            // showed the opposite with TWO scenes present: the same DOM node
            // survives, `resolveSelectedScene` falls back to `library.scenes[0]`
            // so its label silently becomes another file's, and it KEEPS
            // KEYBOARD FOCUS. A bare Space then does not re-delete the document
            // that is gone — it deletes a DIFFERENT one.
            // GUARDED (deleted-scene-returns). A save now UNLINKS the file, so
            // this button destroys an author's document rather than merely
            // dropping it from the session; `deleteSceneGuarded` asks first when
            // there is a file to lose and calls the command unchanged when there
            // is not. The blur is still first and still unconditional —
            // `actAndDropFocus` blurs before `act()`, and the confirm happens
            // inside `act()` — so d-27's subject is untouched.
            onClick={(e) => actAndDropFocus(e, () => { void deleteSceneGuarded(library, selected.id, run); })} />}>
         <SectionBody>
          <Field label="Name">
            <input value={typeof selected.name === 'string' ? selected.name : ''}
              onChange={(e) => run(setSceneFieldCommand(
                library, selected.id, 'name', e.target.value === '' ? undefined : e.target.value))}
              style={textInput} />
          </Field>
          {/*
            ONE FIELD PER ROW (ROADMAP item 41). `V center` and `V offset` used
            to share a line, and so did `Precision` and `Transition` (until row
            59 retired `Precision` outright): the second
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
              title={`v_factor: background vertical shift, ${EFFECTS_V_FACTOR_BOUNDS.min}`
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
          {/*
            THE BACKGROUND RUNS OUT OF PICTURE BEFORE THE ACT RUNS OUT OF CAMERA
            (ROADMAP O21). Plane B is 512 px tall and is blitted once at level
            load; an unlocked plane divides the camera by `2^v_factor`, so it
            covers `512 << v_factor` px of travel and then starts over. aeon
            measured that seam on the running ROM (d-31) and nothing in either
            repo checks for it.

            ⚠ IT IS SILENT ON EVERY SCENE THAT EXISTS, AND THAT IS THE DESIGN.
            Both of Aurora's scenes are `v_factor 15`, as are 18 of aeon's 20,
            and a locked plane cannot wrap. It is also silent on any unlocked
            scene whose shift has room for its act. What it catches is the one
            gesture with no feedback at all: dropping this spinner off the lock
            on a tall act, which is free to do here and silently tears the
            background in the ROM. A check that fired on every act would be
            strictly worse than the silence it replaced — the horizontal axis
            repeats on nearly every band BY DESIGN and gets a tooltip, not this.

            Advisory, never prevention (row 58): the spinner still offers every
            shift and the document still saves.
          */}
          {(() => {
            const wrap = reach === null ? null : verticalWrapAdvisory(selected, reach.travelY);
            return wrap === null ? null : <Hint under tone="warning">{wrap}</Hint>;
          })()}
          {/*
            THE TWO-WRITER RULING, ON THE FIELD THAT CAUSES IT (ROADMAP row 80).
            Moving `v_factor` off the lock while any layer carries a split makes
            the WHOLE SCENE unbuildable, and until this row nothing on screen
            said so — `fireLineAdvisory` bowed out on a comment claiming an
            advisory that did not exist. This is the scene-subject spelling; the
            layer cards carry the layer-subject one, and both compose the same
            clauses. Advisory, never prevention: the spinner still offers every
            shift the schema allows and the document still saves (row 58).
          */}
          {/*
            AND IT IS THREE PARTS, NOT ONE PARAGRAPH (ROADMAP O15). Whole and
            correct, this sentence was 21 wrapped lines — ~46% of the panel's
            visible height — and pushed `V center`, `V offset`, `Transition`,
            `Deform fg` and `Deform bg` below the fold. `Advisory` keeps the
            DIAGNOSIS (which names the guilty layers, the fact only this surface
            can state) and the REMEDIES on screen, and puts only the MECHANISM
            behind a collapsed "Why this happens". Semantic, never positional:
            the remedies are last in the sentence, so a length truncation would
            hide exactly the half an author acts on.
          */}
          {(() => {
            const lock = sceneVsplitLockAdvisoryParts(selected);
            return lock === null ? null : <Advisory under {...lock} />;
          })()}
          <Field label="V center">
            {/*
              BOUNDED BY THE CLAMP, NOT THE PROPS (ROADMAP item 37). `min`/`max`
              on a NumberField only bind the spinner; a typed value goes
              through unclamped. clampVCenter/clampVOffset read the schema's
              range, which is the range aeon refuses beyond at emit.
            */}
            <NumberField title={`v_center: the act-axis row the vertical factor pivots about, `
                + `${EFFECTS_V_CENTER_BOUNDS.min}..${EFFECTS_V_CENTER_BOUNDS.max}`}
              min={EFFECTS_V_CENTER_BOUNDS.min} max={EFFECTS_V_CENTER_BOUNDS.max} width={72}
              value={typeof selected.v_center === 'number' ? selected.v_center : 0}
              onChange={(n) => run(setSceneFieldCommand(
                library, selected.id, 'v_center', clampVCenter(n)))} />
          </Field>
          <Field label="V offset">
            <NumberField title={`v_offset: signed pixel offset added after the shift, `
                + `${EFFECTS_V_OFFSET_BOUNDS.min}..${EFFECTS_V_OFFSET_BOUNDS.max}`}
              min={EFFECTS_V_OFFSET_BOUNDS.min} max={EFFECTS_V_OFFSET_BOUNDS.max} width={72}
              value={typeof selected.v_offset === 'number' ? selected.v_offset : 0}
              onChange={(n) => run(setSceneFieldCommand(
                library, selected.id, 'v_offset', clampVOffset(n)))} />
          </Field>
          {/*
            THE VERTICAL BOB (ROADMAP row 99's first split; empyrean bc639a10,
            aeon 8c75722b). Three rows, and every one of them is shaped by the
            encoding rather than by taste — the argument is in effects-aeon's
            §2.5 block, and the short version is: both wire fields are INVERSE
            shifts, the amplitude's domain has a six-value hole in it, and its
            off value (15) is the TOP of the range while the wire byte's off (0)
            is the bottom.

            SO: OFF IS A STATE, NOT A LADDER POSITION, and the two ladders are
            `<select>`s over enumerated legal values shown in PIXELS and SECONDS.
            Not NumberFields — this panel's own `V center` comment says why a
            bounded spinner would not have helped ("min/max only bind the
            spinner; a typed value goes through unclamped"), and here an
            unclamped 0 is not merely out of range, it is the one value that
            packs to silence. A list has no state that can express it.
          */}
          {(() => {
            const on = bobEnabled(selected);
            return (
              <>
                <Field label={BOB_ROW.label} title={BOB_ROW.title}>
                  {/* TWO KEYS, ONE COMMAND, ONE UNDO STEP: turning the sway off
                      takes `bob_period` with it, because the engine ignores a
                      period at bob_shift 15 and a key nothing reads is a key
                      that will one day be read as meaning something. */}
                  <Select title={BOB_ROW.title} value={on ? 'on' : 'none'}
                    onChange={(v) => run(bobToggleCommand(library, selected.id, v === 'on'))}
                    style={{ width: 88 }}>
                    <option value="none">{BOB_ROW.off}</option>
                    <option value="on">{BOB_ROW.on}</option>
                  </Select>
                </Field>
                {!on && <Hint under>{BOB_ROW.hint}</Hint>}
                {on && (
                  <>
                    <Field label={BOB_ROW.amplitudeLabel}>
                      <Select title={BOB_ROW.amplitudeTitle} value={String(bobShiftValue(selected))}
                        onChange={(v) => run(setBobShiftCommand(library, selected.id, Number(v)))}
                        style={{ flex: 1, minWidth: 0 }}>
                        {BOB_AMPLITUDE_OPTIONS.map((o) => (
                          <option key={o.shift} value={o.shift}>{o.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={BOB_ROW.periodLabel}>
                      <Select title={BOB_ROW.periodTitle} value={String(bobPeriodValue(selected))}
                        onChange={(v) => run(setBobPeriodCommand(library, selected.id, Number(v)))}
                        style={{ flex: 1, minWidth: 0 }}>
                        {BOB_PERIOD_OPTIONS.map((o) => (
                          <option key={o.period} value={o.period}>{o.label}</option>
                        ))}
                      </Select>
                    </Field>
                    {/* WHAT IT DOES, said in the author's units on the row —
                        the same posture as vFactorHint. Neither ladder shows a
                        shift exponent anywhere on screen, deliberately. */}
                    <Hint under>{bobLine(selected)}</Hint>
                  </>
                )}
              </>
            );
          })()}
          {/*
            ═══ THE REELS (EW-REELS-PANEL; empyrean `ff3f43f` §2.7, ROADMAP row
            151) ═══

            Five 64px-wide vertical strips of the BACKGROUND, each scrolling at
            its own rate. Sits with the bob because both are scene-level motion
            of the background plane, and above `Transition` because the deform
            rows below it are the column's heaviest block.

            ⚠⚠ THE ROW DIRECTLY ABOVE THE LAYER CARDS' DRIFT BOX AUTHORS A
            DIFFERENT UNIT. `drift.rate` is 1/256 px and Aurora applies an
            x256 on export; `reels.rates` is SIGNED WHOLE PIXELS PER FRAME with
            no fixed point anywhere on the path, so a box copied from that one
            emits 768 for an intended 3. Nothing here converts: the value the
            box produces is the value `setReelRateCommand` stores. The bound on
            these spinners is the SCHEMA's, and `refuse` is what actually
            withholds a commit — `min`/`max` on an `<input type="number">` stop
            no typed value, which is EFFECTS-W1 defect 5 and the reason
            `NumberField` has a `refuse` prop at all.

            ⚠ FIVE ROWS, LABELLED BY SCREEN SPAN, IN DOCUMENT ORDER. Array order
            IS screen order — index `i` owns screen X `64i..64i+63` — and the
            contract's word for an editor that sorts this array is that it
            "silently relocates every strip". So the label column carries the
            PIXELS (`x 0–63` for the leftmost) rather than a strip number: an array
            that ever did come back reordered is then out of order on screen and
            not only in the JSON. `key={i}` is correct here for the same reason
            it is usually wrong — the index is the identity, not a list
            position — and there is deliberately no add, remove or reorder
            affordance, because the length is aeon's `REEL_BAND_COUNT` and that
            is a code shape (it sizes a RAM array and is compiled into a shift).

            ⚠ ZERO COMMITS AND READS BACK AS "stationary". Unlike `drift.rate`
            (`not: {const: 0}`), a still strip among moving ones is a real
            authored choice here; `uniqueItems` caps it at one, which is why the
            box's `refuse` asks about the candidate ARRAY.

            ⚠⚠ THE DEBUG SENTENCE IS REQUIRED AND IS NOT WRITTEN HERE. The
            effect renders in NO release build, no JSON keyword can say so, and
            the contract's own description says the editor panel must. The
            sentence is EXTRACTED from that description
            (`EFFECTS_REELS_DEBUG_NOTE`), so it cannot drift from the fact and
            goes loud if aeon ever ships the effect in release. Painted short,
            contract long on the same element — the ramp card's split.

            ⚠ AND THE BINDING NOTE IS ALWAYS ON WHILE THE WARNING IS NOT.
            `advisoryReelsBinding` is one-sided by construction and says in its
            own words that its silence is NOT a clearance; a surface that
            rendered only the warning would turn that silence into an all-clear.
            So the RULE (aeon's sentence) is permanent whenever the key is
            present and the WARNING appears only in the negative case.

            NO CAPABILITY NOTE, unlike the row-remap card's. There is no `CAP_`
            bit for reels, and the contract says a generator arm must not emit a
            check that does not exist — so there is nothing to state, and
            stating one would be Aurora inventing a gate.
          */}
          {(() => {
            const on = reelsEnabled(selected);
            const rates = reelRatesValue(selected);
            // GATED ON AN ACT BEING OPEN, `vDeformRampAdvisory`'s rule: with no
            // act there are no sections, and the advisory's own contract is that
            // an empty list means "this project has no sections" — a different
            // fact from "no section binds this scene" — so it says nothing.
            const binding = (!on || act === null)
              ? [] : reelsBindingAdvisories(selected, act.sections);
            return (
              <>
                <Field label={REELS_ROW.label} title={REELS_ROW.title}>
                  {/* OFF DELETES THE KEY. There is no `"none"` spelling for
                      `reels` — `"reels": "none"` is REFUSED by the schema — so
                      unlike the deform and row-remap toggles beside it, absent
                      is the only representation of off. */}
                  <Select title={REELS_ROW.title} value={on ? 'on' : 'none'}
                    onChange={(v) => {
                      setReelRefusal({});
                      run(reelsToggleCommand(library, selected.id, v === 'on'));
                    }}
                    style={{ width: 88 }}>
                    <option value="none">{REELS_ROW.none}</option>
                    <option value="on">{REELS_ROW.on}</option>
                  </Select>
                </Field>
                {!on && <Hint under>{REELS_ROW.hint}</Hint>}
                {on && (
                  <>
                    <Hint under tone="warning">
                      <span data-testid="reels-debug-note" title={REELS_ROW.debug.full}>
                        ⚠ {REELS_ROW.debug.short}
                      </span>
                    </Hint>
                    {rates.map((rate, i) => (
                      <React.Fragment key={i}>
                        <Field label={reelStripLabel(i)}>
                          <NumberField title={reelStripTitle(i, rate)}
                            min={EFFECTS_REEL_RATE_BOUNDS.min}
                            max={EFFECTS_REEL_RATE_BOUNDS.max}
                            width={64} value={rate}
                            refuse={(n) => reelRateWriteRefusal(selected, i, n)}
                            onRefusal={(r) => setReelRefusal((st) => ({ ...st, [i]: r }))}
                            onChange={(n) => run(
                              setReelRateCommand(library, selected.id, i, n))} />
                        </Field>
                        {(reelRefusal[i] ?? null) !== null && (
                          <Hint under tone="warning">
                            <span data-testid={`reel-${i}-refusal`}>{reelRefusal[i]}</span>
                          </Hint>
                        )}
                        {/* LEGAL, AND PROBABLY NOT WHAT YOU WANTED — the
                            contract's own UI guidance, at the HINT tier, never
                            the warning tier and never a refusal ("that is UI
                            guidance, never a refusal"). */}
                        {(() => {
                          const g = reelRateGuidance(rate);
                          return g === null ? null : (
                            <Hint under>
                              <span data-testid={`reel-${i}-guidance`}>{g}</span>
                            </Hint>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                    <Hint under>{REELS_ROW.unitHint}</Hint>
                    <Hint under>
                      <span title={REELS_ROW.binding.full}>{REELS_ROW.binding.short}</span>
                    </Hint>
                    {binding.map((m) => (
                      <Hint key={m} under tone="warning">
                        <span data-testid="reels-binding-advisory">{m}</span>
                      </Hint>
                    ))}
                  </>
                )}
              </>
            );
          })()}
          {/*
            `Precision` LIVED HERE, and it was a control for a field the engine
            had already deleted (ROADMAP row 59, owner ruling d-16). aeon retired
            `Scene.sc_precision` on 2026-08-26 with the per-cell HScroll path;
            empyrean `0bd4753` then cut the key from the shared schema, so this
            dropdown was writing a value nothing would ever read. Removed rather
            than hidden: the schema has no key, the model has no field, and
            `SCENE_FORM_CHOICES` has no entry, so there is nothing left to
            re-grow it from by accident. An old scene file that still carries
            `precision` does NOT quietly lose the key here — it is refused at
            load, by name, because the contract schema is closed. That refusal is
            the ruled behaviour and the affected population is empty; see
            scene.ts's field note and docs/reviews/2026-08-27-retire-precision.md.
          */}
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
          {/* ═══ THE WORLD-ANCHORED BAND SPLIT (§9.1) ═══

              PLACED WITH THE PLANE TABLES AND NOT WITH THE LAYER CARDS, because
              the two shifts below are only meaningful against a table one of
              the two rows above attaches: the anchor overrides `band_deform_shift_a/b`
              in every band from the split down, and those bands sample
              `deform_fg` / `deform_bg`. A row whose numbers do nothing without
              its neighbour belongs beside its neighbour.

              ⚠⚠ THE LADDERS ARE `<select>`s AND THAT IS THE WHOLE SAFETY
              ARGUMENT. `dsa`/`dsb` are 0..15 where 15 means NO DEFORM, so a
              spinner dragged toward its maximum authors "does not move" — the
              opposite of the gesture, silently, with a green build. The list
              runs least motion first, the sentinel is not on it, and off is a
              NAMED entry at the top. effects-aeon's §9.1 block has the full
              argument; `V center`'s comment fifteen rows up has the reason a
              bounded NumberField would not have been a substitute.

              TWO OFFS, TWO CONTROLS. This toggle is "no anchor at all"; the two
              ladders' off entries are "this plane takes no deform" on an anchor
              that still splits. `rowRemap` needs the second and is not
              satisfied by the first. */}
          {(() => {
            const at = anchorValue(selected);
            return (
              <>
                <Field label={ANCHOR_ROW.label} title={ANCHOR_ROW.title}>
                  <Select title={ANCHOR_ROW.title} value={at === null ? 'none' : 'on'}
                    onChange={(v) => run(anchorToggleCommand(library, selected.id, v === 'on'))}
                    style={{ width: 88 }}>
                    <option value="none">{ANCHOR_ROW.none}</option>
                    <option value="on">{ANCHOR_ROW.on}</option>
                  </Select>
                </Field>
                {at === null && <Hint under>{ANCHOR_ROW.hint}</Hint>}
                {at !== null && (
                  <>
                    <Field label={ANCHOR_ROW.channelLabel} title={ANCHOR_ROW.channelTitle}>
                      <Select title={ANCHOR_ROW.channelTitle} value={String(at.channel)}
                        onChange={(v) => run(setAnchorChannelCommand(
                          library, selected.id, Number(v)))}
                        style={{ flex: 1, minWidth: 0 }}>
                        {anchorChannelOptions().map((o) => (
                          <option key={o.channel} value={o.channel} title={o.title}>{o.label}</option>
                        ))}
                      </Select>
                    </Field>
                    {/* ONE LOOP OVER THE TWO PLANES, on the deform rows' own
                        reasoning above: two hand-written blocks is exactly the
                        copy that lets one plane grow a rung the other does not
                        have. Each ladder is built from its OWN field's bounds —
                        `anchorShiftOptions(field)` — never from a shared one. */}
                    {([['dsa', ANCHOR_ROW.planeALabel], ['dsb', ANCHOR_ROW.planeBLabel]] as const)
                      .map(([field, label]) => (
                        <Field key={field} label={label}>
                          <Select title={`anchor.at.${field}`} value={String(at[field])}
                            onChange={(v) => run(setAnchorShiftCommand(
                              library, selected.id, field, Number(v)))}
                            style={{ flex: 1, minWidth: 0 }}>
                            {anchorShiftOptions(field).map((o) => (
                              <option key={o.shift} value={o.shift} title={o.title}>{o.label}</option>
                            ))}
                          </Select>
                        </Field>
                      ))}
                    <Hint under style={{ marginBottom: 0 }}>{ANCHOR_ROW.bindingHint}</Hint>
                    {/* THE STATE NO BUILD WILL EVER REPORT. A live shift with no
                        table to sample is flat-pathed at runtime: the scene
                        compiles, ships and does not move. Warning-toned because
                        the author asked for motion and will not get it — unlike
                        the ramp note below, which is a consequence of a
                        legitimate choice. */}
                    {anchorDeformAdvisories(selected).map((a) => (
                      <Hint key={a} under tone="warning" style={{ marginBottom: 0 }}>
                        <span data-testid="anchor-deform-advisory">{a}</span>
                      </Hint>
                    ))}
                  </>
                )}
              </>
            );
          })()}
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
          {/* ═══ WHAT THIS TOGGLE JUST DID TO A DOCUMENT NOT ON SCREEN ═══

              THE AUTHORING END OF THE RAMP DEFECT. `docs/reviews/
              2026-09-03-ew-ramp-scroll-mode.md` closed the READING end: a ramp
              card now says whether its five numbers are a full-screen scroll or
              a 16-pixel sliver. It could not close the WRITING end, because the
              writing end is here — one select, on a scene, that silently narrows
              every VSRAM ramp bound to every section this scene is bound to.

              UNDER THE ROW, NOT ABOVE IT, and the placement is the opposite call
              from the ramp card's for the opposite reason. There the sentence
              had to come FIRST because it changes what the five numbers below it
              MEAN. Here it changes nothing about the three controls above it —
              the table, the speed and the amplitude do exactly what their labels
              say — so it is a consequence of the row, and a consequence reads
              after its cause.

              NEUTRAL TONE, NO WARNING COLOUR, NOT A GATE. A one-column ramp is a
              legitimate thing to author, and unlike the two advisories below
              this one it is NOT a build refusal: aeon cannot see a preset
              document, so this pairing builds green and runs. That is exactly
              why it must be said here — no build will ever say it — and exactly
              why it must not be dressed as an error. The refusals in the list
              below stay `tone="warning"`; this one does not.

              PAINTED SHORT / CONTRACT LONG on the same element, the ramp card's
              own split, so the measured aeon chain rides on the hover rather
              than in a 285px column. */}
          {(() => {
            // GATED ON THE STATE THAT HAS THE CONSEQUENCE, and on an act being
            // open. With no act there are no sections and so no bindings to
            // resolve — `BandPresetPanel` paints nothing in that state for the
            // same reason, and one panel answering where its mirror stays silent
            // is the disagreement `sectionSceneRef` exists to prevent.
            if (act === null) return null;
            if (vDeformValue(selected) === null) return null;
            const impact = vDeformRampAdvisory(
              selected.id, act.sections, act.sceneRef,
              state.project?.effectsPresets ?? EMPTY_PRESETS,
            );
            return impact === null ? null : (
              <Hint under style={{ marginBottom: 0 }}>
                <span title={impact.full}>{impact.short}</span>
              </Hint>
            );
          })()}
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

      <CollapsibleSection id="aeon.effects.assign" title="Section assignment">
       <SectionBody>
        {!section ? (
          <Hint style={{ marginBottom: 0 }}>
            Section {activeSectionIndex} is empty: nothing to assign a scene to.
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
