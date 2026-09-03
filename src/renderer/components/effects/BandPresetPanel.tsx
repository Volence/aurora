// The RASTER BAND PRESET panel — authoring `presets/<id>.json`.
//
// A DIFFERENT DOCUMENT FROM THE SCENE PANEL ABOVE IT, in the same column on
// purpose. An author asking "what does this background do" should not have to
// switch facets to answer it, and the two documents are the scroll half and the
// raster half of one lens. But they are two files against two schemas, and this
// panel never writes into a scene: a `bands` key on a scene file is refused by
// the scene loader, deliberately.
//
// THIS COMPONENT HOLDS NO RULES. Every predicate, sentence and option list comes
// from providers/effects-preset.ts, which is the `tableRefParamOptions` idiom
// ruled the reference for this parcel. If you find yourself writing a comparison
// here, it belongs there — a rule spelled in a component is a rule the advisory
// beside it can disagree with.
//
// ═══ THE LIMIT BLOCK IS NOT DECORATION, AND IT HAS TWO HALVES ═══
//
// `LimitBlock` paints `presetLimitsShort()` — the AUTHOR-LENGTH wording — at the
// top of the section, unconditionally, before any control, and carries the
// CONTRACT wording (`PRESET_LIMITS`, verbatim) on the SAME elements' `title`,
// plus a deep link into the guide. That split is the shape, and both halves are
// load-bearing: aeon wrote their page to stop one sentence ("authoring effects
// no longer needs a programmer"), so the correction an author must ACT ON is
// painted and cannot be hover-only, while the full contract text — owed to the
// agent reply and the published tool descriptions — must stay reachable rather
// than be deleted.
//
// ⚠ DO NOT "FIX" THE HOVERS BY PAINTING THE CONTRACT TEXT. This block once
// rendered 8,059 characters before the first control in a 285px column; cutting
// the painted half to ~875 while keeping every character on the `title` IS
// EFFECTS-W1 defect 3's fix (`b8d16256`, 2026-09-02), not a regression against
// the earlier "renders in full" ruling, which that commit amended. An earlier
// version of THIS COMMENT still asserted the un-amended ruling and would have
// talked a reader into undoing it (O79).
//
// THE GATE IS band-preset-wording.test.ts, in this directory's __tests__ — NOT
// `effects-preset-wording.test.ts`, which has never existed. It holds both
// halves from both sides: 'the limits are BODY TEXT, not a title= attribute',
// 'and the contract wording is still REACHABLE, on the same elements', 'every
// contract limit has an author-length sibling — none can be dropped', and 'the
// cut is real: the PAINTED block is a fraction of the contract text'. That file
// reads SOURCE, so it cannot see a pixel; the rendered halves are held per
// element by rows [2c] and [3a]-[3e] of scratchpad/band-preset-harness.mjs
// (`npm run harness:band-preset`), which read `innerText` and `title`
// separately for exactly this reason.
//
// It is also deliberately NOT scolding. The three limits are stated as facts
// with named owners, the headline says what an author CAN do, and every control
// works. The feature is real and worth using; it is the promise that has to be
// accurate.

import React from 'react';
import { T, SectionBody, CollapsibleSection, Select, NumberField, Chip, IconButton } from '../ui';
import { Field, Hint, Card, CONTROL_INSET } from './column-layout';
import { actAndDropFocus } from '../ui/act-and-drop-focus';
// THE APP'S OWN SWATCH AND THE APP'S OWN PICKER. `GenesisColorSliders` is the
// R/G/B control both palette panels mount, and `swatchCss` is the one CRAM-word
// → CSS conversion in this tree. Neither is re-derived here: a second `>> 9 & 7`
// is how the palette panels drifted the first time (palette-grid-model's header).
import GenesisColorSliders from '../art-shared/GenesisColorSliders';
import { swatchCss } from '../art-shared/palette-grid-model';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import type { AnyCommand } from '../../../core/editing/commands';
import type {
  EffectsPresetLibrary, EffectsPresetBand, EffectsPreset, EffectsPresetCycleChannel,
  EffectsPresetPalVariant, EffectsPresetRamp, EffectsPresetBaseSwap,
} from '../../../core/formats/effects/preset';
import type { EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import {
  EFFECTS_PRESET_BAND_KEYS, EFFECTS_PRESET_BASE_SWAP_KEYS, presetArmFields, presetDefFields,
  EFFECTS_PRESET_MAX_PATCH, ANCHOR_PHASE_RANGE,
  // THE NARROWING QUESTION, ASKED ONCE. `bands` left the schema's top-level
  // `required` when `ramp` arrived and the root became a `oneOf`, so a preset
  // carries EXACTLY ONE raster program. This is the codec's helper for asking
  // which; testing `bands` for undefined here would be a second spelling of a
  // rule that lives in the contract.
  presetRasterChannel, presetFp16ToNumber,
} from '../../../core/formats/effects/preset';
import {
  PRESET_HEADLINE, presetLimitsShort, NO_PREVIEW, NO_PREVIEW_SHORT,
  BAND_FIELD_TITLES, armFieldTitle, armOptions, armLabel,
  bandArm, bandArmAdvisory,
  presetListEntries, presetListSummary, resolveSelectedPreset, presetIdRefusal,
  // ═══ THE DENSE RASTER CHANNEL (EW-RAMP-CONTROL, ROADMAP row 128) ═══
  //
  // ⚠ ONE RATE AND ONE START OVER A SPAN — there is no curve editor here, no
  // multi-point widget and no per-line table, and there must never be one:
  // `RasterRampProgram` has a single `rrp_step` and a single `rrp_start` and no
  // field that could receive a table, so a control offering per-line values
  // would author a document that validates, generates and is silently wrong on
  // hardware. `RAMP_MUST_NOT` is the contract's own statement of it, parsed out
  // of the schema, and is painted in the card below at `RAMP_MUST_NOT_SHORT`.
  //
  // Every bound, refusal and sentence is the provider's, as everything else on
  // this surface is — including the two the codec parcel left explicitly for
  // this one: the `top + lines` span (a valid-looking pair that fails the
  // build) and the VSRAM display lag (a readout one line high looks correct).
  RAMP_FIELD_TITLES, RAMP_TITLE, RAMP_KEYS, RAMP_MUST_NOT, RAMP_MUST_NOT_SHORT,
  RAMP_RATE_UNIT, RAMP_DISPLAY_LAG_NOTE,
  rampSpanRefusal, rampAddrRefusal, rampAddrGloss, rampRateRefusal, rampRateUnits,
  rampDisplayGloss, rampDriftSummary,
  setRampSpanCommand, setRampAddrCommand, setRampRateCommand,
  // ═══ WHICH OF TWO EFFECTS THIS RAMP PRODUCES (EW-RAMP-SCROLL-MODE) ═══
  //
  // A VSRAM ramp is a FULL-SCREEN scroll or a SINGLE 16-PIXEL COLUMN, and the
  // document is identical either way: VDP $0B bit 2 is raised by the SCENE
  // bound to the SECTION bound to this preset. So the answer is per-section, it
  // is derived from three documents this panel does not own, and when the bound
  // sections disagree the sentence says so and names them rather than picking
  // one. Everything about the rule — the measured aeon chain, the capability
  // conjunct, the relayed column span — is in core/formats/effects/
  // ramp-scroll-mode.ts. Nothing here restates it.
  rampScrollModeAdvisory,
  // ═══ THE BASE-SWAP CHANNEL (EW-BASE-SWAP-CONTROL, ROADMAP row 131) ═══
  //
  // TWO NUMBERS, ONE OF WHICH IS A VRAM BASE ADDRESS. Every bound, every gloss
  // and every refusal below is the provider's, reading the codec's constants,
  // which read the schema: `target` is 0..65535 AND a multiple of $2000, and an
  // unaligned value fails loudly NOWHERE — reg $02 drops the low bits silently,
  // so the author would be pointing Plane A somewhere else with nothing visibly
  // wrong. Nothing here snaps; the refusal names the legal bases either side.
  //
  // ⚠ TWO ASYMMETRIES WITH `ramp` AND A READER WILL ASSUME OTHERWISE: base_swap
  // has NO capability gate and its generated emission is NOT DEBUG-gated. Both
  // are the contract's own words, parsed (`BASE_SWAP_ASYMMETRIES`), and both are
  // PAINTED in the card.
  BASE_SWAP_FIELD_TITLES, BASE_SWAP_TITLE,
  BASE_SWAP_ASYMMETRIES, BASE_SWAP_ASYMMETRIES_SHORT, BASE_SWAP_WHAT_YOU_SEE,
  baseSwapLineRefusal, baseSwapTargetRefusal, baseSwapTargetGloss, baseSwapSummary,
  setBaseSwapLineCommand, setBaseSwapTargetCommand,
  RASTER_CHANNEL_OPTIONS, rasterChannelSwapAdvisory, setRasterChannelCommand,
  rasterEditorGap,
  bandControlsRefusal,
  RASTER_REF_ROW, presetRefOptions, unassignablePresetRef, sectionPresetCommand,
  createPresetCommand, deletePresetCommand,
  addBandCommand, removeBandCommand, lastBandRefusal, deletePresetRefusal,
  setBandFieldCommand, setBandArmCommand, setArmFieldCommand,
  parseColours, setColoursCommand, setPresetNameCommand,
  // EW-COLOUR-PICKER — defect 13's colour half. Every one of these is a
  // derivation or a sentence, and every one of them is the PROVIDER's: the
  // component below draws swatches and does not know what a CRAM line is.
  addrGloss, colourSwatchTitle, setColourCommand, cramSpanAdvisory,
  CYCLES_TITLE, CYCLES_STATE_OPTIONS, cyclesState, setCyclesStateCommand,
  addCycleChannelCommand, removeCycleChannelCommand, setCycleFieldCommand, cycleFieldTitle,
  emptyCyclesAdvisory,
  VARIANTS_TITLE, VARIANTS_STATE_OPTIONS, variantsState, setVariantsStateCommand,
  VARIANT_SLOT_OPTIONS, variantSlotState, variantSlotIndices, setVariantSlotStateCommand,
  VARIANT_FIELDS, variantFieldTitle, variantFieldSeed, setVariantFieldCommand,
  CRAM_LINES, variantLineOn, toggleVariantLineCommand,
  bandSubject, bandEdgeRefusal, variantLineRefusal, cycleFieldRefusal,
  // THE MOVING ANCHOR (row 95). Every rule, option list and sentence below is
  // the provider's, as everything else on this surface is; the ladders inside
  // those option lists are the CODEC's, derived from the schema.
  ANCHOR_SEED_TITLE, ANCHOR_MOTION_TITLE, anchorSweepFieldTitle,
  ANCHOR_SEED_OPTIONS, ANCHOR_MOTION_OPTIONS, ANCHOR_AMP_OPTIONS, ANCHOR_PERIOD_OPTIONS,
  anchorChannelIndices, anchorSeedState, anchorMotionState, anchorSeedValue, anchorSweepOf,
  anchorSeedRefusal, anchorPhaseRefusal, anchorExtendRefusal, anchorMotionWithoutSeedAdvisory,
  anchorSweepSummary,
  setAnchorSeedStateCommand, setAnchorSeedCommand, setAnchorMotionStateCommand,
  setAnchorSweepShiftCommand, setAnchorPhaseCommand,
} from '../../providers/effects-preset';
import type { AnchorSeedState, AnchorMotionState } from '../../providers/effects-preset';
import { AnchorSweepPreview } from './AnchorSweepPreview';
import { sectionRasterAdvisory, rasterChooserName } from '../../../core/formats/effects/section-wiring';
import { openGuide } from '../../state/guideStore';
import { EFFECTS_GUIDE_SLUG, GUIDE_ANCHORS } from '../guide/guides';
import { PresetLagDisclosure } from './PresetLagDisclosure';
import { RampSignLagDisclosure } from './RampSignLagDisclosure';

const EMPTY_LIBRARY: EffectsPresetLibrary = { presets: [], unreadable: [], notices: [] };
// THE SCENE LIBRARY, FOR ONE QUESTION ONLY: does the scene bound to the section
// bound to this preset carry a `v_deform`? That bit decides whether a VSRAM
// `ramp` is a full-screen scroll or a 16-pixel sliver, and it lives in a
// DIFFERENT DOCUMENT — see `rampScrollModeAdvisory`. This panel writes no scene.
const EMPTY_SCENES: EffectsSceneLibrary = { scenes: [], unreadable: [], notices: [] };

const textInput: React.CSSProperties = {
  flex: 1, minWidth: 0, background: T.raised, color: T.textHi,
  border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: T.tSm,
  padding: `${T.s2} ${T.s3}`,
};

const PRESET_LIST: React.CSSProperties = {
  overflowY: 'auto', maxHeight: 154, flexShrink: 0,
};

/**
 * The limit block.
 *
 * A LEFT RULE IN THE WARNING COLOUR, not a warning-coloured paragraph: the whole
 * block is three facts an author reads once and needs to remember, and three
 * paragraphs of alarm colour in a 300px column reads as an error state the
 * author is expected to fix. The rule marks it as one unit; the text stays at
 * body legibility.
 */
function LimitBlock(): React.ReactElement {
  return (
    <div style={{
      borderLeft: `2px solid ${T.warning}`,
      paddingLeft: T.s3,
      marginBottom: T.s3,
      display: 'flex', flexDirection: 'column', gap: T.s2,
    }}>
      <div style={{ fontSize: T.tSm, color: T.textHi }}>{PRESET_HEADLINE}</div>
      {/* ═══ THE AUTHOR'S LENGTH, WITH THE CONTRACT ONE HOVER AWAY ═══

          This block rendered 8,059 characters before the first control in a
          285px column (EFFECTS-W1 defect 3, measured) — a design memo standing
          between an author and a button. Every one of those characters is still
          reachable: `full` is the contract wording, verbatim, on this element's
          own `title`, and the guide carries it as prose. What is PAINTED is the
          two sentences an author has to act on.

          THE ORDER MATTERS AND IS UNCHANGED: what saving does not do, then what
          looking at it costs, then what "it built" does not prove. */}
      {presetLimitsShort().map((l) => (
        <div key={l.key} title={l.full}
          style={{ fontSize: T.tXs, color: T.textBase, lineHeight: 1.45 }}>
          <span style={{ color: T.textHi }}>{l.title}.</span>{' '}{l.body}
        </div>
      ))}
      <div title={NO_PREVIEW} style={{ fontSize: T.tXs, color: T.textLo, lineHeight: 1.45 }}>
        {NO_PREVIEW_SHORT}
      </div>
      {/* THE REST OF IT, WHERE THE REST OF IT BELONGS. A hover is not a place to
          read seven minutes of prose; the guide is. This is the deep link the
          walkthrough asked for on this exact card. */}
      <button type="button"
        onClick={() => openGuide(EFFECTS_GUIDE_SLUG, GUIDE_ANCHORS.rasterBand)}
        title="Open the first-run guide, at the part about raster bands."
        style={{
          alignSelf: 'flex-start', font: 'inherit', fontSize: T.tXs, color: T.accent,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left',
        }}>
        ? Read the whole note in the guide
      </button>
    </div>
  );
}

export default function BandPresetPanel(): React.ReactElement | null {
  useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  const library = project?.effectsPresets ?? EMPTY_LIBRARY;
  const entries = presetListEntries(library);
  const selectedId = useEditorStore((s) => s.selectedEffectsPresetId);
  const setSelectedId = useEditorStore((s) => s.setSelectedEffectsPresetId);
  const selected = resolveSelectedPreset(library, selectedId);
  // THE SAME STORE VALUE THE SCENE PANEL'S ASSIGNMENT ROW READS, and that is
  // what makes two per-section controls in two panels safe: `activeSectionIndex`
  // is one number in the editor store, not a second notion of "the section being
  // looked at". A panel-local copy is the two-sources-of-truth defect this
  // column has already met once (EffectsScenePanel's selected-scene id, ROADMAP
  // item 43).
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const act = getActiveLevel(useProjectStore.getState())?.act ?? null;
  const section = act?.sections[activeSectionIndex] ?? null;
  // The zone id is needed only to name the chooser function in the sentence —
  // the wiring itself was derived at load time, from aeon's files.
  const zoneId = getCurrentZone(useProjectStore.getState())?.id ?? '';
  // The delete guard's subject is the SECTIONS, not the library: a binding lives
  // in a section's sidecar, so "is anything pointing at this document" can only
  // be asked of the act.
  const deleteRefusal = (act === null || selected === null)
    ? null
    : deletePresetRefusal(act.sections, selected.id);
  const wiringAdvisory = act === null ? null : sectionRasterAdvisory(
    act.rasterWiring, activeSectionIndex, rasterChooserName(zoneId, act.id));
  // ⚠ THE SUBJECT IS THE WHOLE ACT, NOT `activeSectionIndex`. Every other
  // per-section reading on this surface is about the section the author is
  // looking at; this one is about every section that BINDS the document they are
  // looking at, which is a different set and is usually not the active one. A
  // sentence scoped to the active section would answer "what does this ramp do"
  // with a fact about a section that may not bind it at all.
  const scenes = project?.effectsScenes ?? EMPTY_SCENES;
  const rampScroll = (act === null || selected === null || selected.ramp === undefined)
    ? null
    : rampScrollModeAdvisory(act.sections, act.sceneRef, scenes, selected.id);

  const [newId, setNewId] = React.useState('');
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [coloursText, setColoursText] = React.useState<Record<number, string | undefined>>({});
  const [coloursRefusal, setColoursRefusal] = React.useState<Record<number, string | null>>({});

  function run(command: AnyCommand | null): void {
    if (!command) return;
    const level = getActiveLevel(useProjectStore.getState());
    if (!level) return;
    executeCommand(command, level);
  }

  const create = (): void => {
    const id = newId.trim();
    const result = createPresetCommand(library, id);
    if (!result.ok) { setRefusal(result.reason); return; }
    setRefusal(null);
    run(result.command);
    setSelectedId(id);
    setNewId('');
  };

  return (
    <>
      <CollapsibleSection id="aeon.effects.presets" title="Raster band presets" defaultCollapsed>
        <SectionBody>
          <LimitBlock />

          {entries.length === 0 && (
            <Hint>
              No raster presets yet. A preset is one file under
              {' '}<code>data/editor/effects/presets/</code> — create one below.
            </Hint>
          )}
          {entries.length > 0 && (
            <div style={PRESET_LIST}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
                {entries.map((e) => (
                  // One line per preset, ellipsised, with the full label on the
                  // button's title — the measurement the scene picker records:
                  // an unconstrained prose `name` wrapped to three lines in a
                  // 300px column and grew the picker at an unpredictable rate.
                  <button key={e.id} type="button" onClick={() => setSelectedId(e.id)}
                    title={`${e.label} (${e.id})`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: T.s2, padding: `${T.s1} ${T.s2}`, font: 'inherit', fontSize: T.tXs,
                      textAlign: 'left',
                      background: selected?.id === e.id ? T.accent : T.raised,
                      color: selected?.id === e.id ? T.onAccent : T.textBase,
                      border: `1px solid ${selected?.id === e.id ? T.accent : T.border}`,
                      borderRadius: T.rMd, cursor: 'pointer',
                    }}>
                    <span style={{
                      minWidth: 0, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{e.label}</span>
                    {/* `ramp`, or `N bands` — the PROVIDER's sentence. A ramp
                        document has no `bands` key at all, so a bare count
                        rendered it as "0 bands", which reads as a broken preset
                        rather than a different kind of one. */}
                    <span style={{ opacity: 0.7, flexShrink: 0 }}>
                      {presetListSummary(e)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {library.unreadable.length > 0 && (
            <Hint tone="warning" style={{ marginTop: T.s3 }}>
              {library.unreadable.length} preset file{library.unreadable.length === 1 ? '' : 's'} in
              this project could not be read and {library.unreadable.length === 1 ? 'is' : 'are'} not
              listed. Aurora will not overwrite {library.unreadable.length === 1 ? 'it' : 'them'}.
            </Hint>
          )}

          <Field label="Preset id" title="Create a preset file under data/editor/effects/presets/"
            style={{ marginTop: T.s3, marginBottom: 0 }}>
            <input value={newId} placeholder="new_preset_id"
              onChange={(e) => { setNewId(e.target.value); setRefusal(null); }}
              style={textInput} />
            <Chip onClick={create} disabled={newId.trim() === ''}>New</Chip>
          </Field>
          {refusal !== null && <Hint under tone="warning">{refusal}</Hint>}
          {/* The id rule, said BEFORE the refusal rather than only after it. The
              pattern comes from the schema via presetIdRefusal's own source, so
              a probe of the empty string is the honest way to show it without
              retyping the regex here. */}
          {refusal === null && newId.trim() !== '' && (() => {
            const why = presetIdRefusal(newId.trim(), library);
            return why === null ? null : <Hint under>{why}</Hint>;
          })()}

          {/* ═══ THE PER-SECTION BINDING (ROADMAP row 93's remaining half) ═══

              IN THIS SECTION, NOT A SECTION OF ITS OWN, AND NOT IN THE SCENE
              PANEL — and the reason is `LimitBlock`, eight rows up. What binding
              a preset does and does not do is one sentence, it renders at the
              top of THIS section, and a CollapsibleSection renders no children
              while it is shut: an author cannot reach this select without the
              limit already on screen above it. A second titled section could be
              opened on its own, and the scene panel's own "Section assignment"
              is four sections away in a different document's editor — either
              placement hands an author the control with the disclosure out of
              view, which is the failure the whole panel is shaped around.

              It also belongs beside the library it lists. The options ARE the
              preset documents in the picker above; drawn under the scene editor
              they would name files that surface never mentions, and an author
              who has just typed a new preset id would have to cross a document
              boundary the panel's own header is at pains to draw.

              ⚠ THE COST, NAMED: the two per-section refs now live in two
              panels, so "what does section N use" is answered in two places.
              They cannot disagree about WHICH section — both read
              `activeSectionIndex` from the one store — and both close with the
              same "saved to section_N.meta.json as <key>" line, so the split is
              by document rather than arbitrary.

              NO SENTENCE OF ITS OWN. The row's label and title come from
              `RASTER_REF_ROW`; the limit is `LimitBlock`'s and is not repeated.
              The only prose here is WHERE THE VALUE IS WRITTEN, which is the
              one thing no control can tell you — the scene panel's row settled
              that trade after measuring the two-sentence version at three
              lines. */}
          {!section ? (
            <Hint style={{ marginTop: T.s3, marginBottom: 0 }}>
              Section {activeSectionIndex} is empty — nothing to assign a preset to.
            </Hint>
          ) : (
            <>
              <Field label={`Section ${activeSectionIndex}`} title={RASTER_REF_ROW.title}
                style={{ marginTop: T.s3, marginBottom: 0 }}>
                {/* THROUGH `sectionPresetCommand`, NEVER `rasterRef = v`. That
                    function owns the `''` sentinel, so this select's empty
                    option and `assign_section_preset`'s explicit null are the
                    SAME unbind; it owns the no-op rule, so re-picking the
                    current value burns no undo slot; and it emits the one
                    `set-section-raster` command both arms of history know. A
                    control that assigned the field would let this panel and the
                    agent tool disagree about what an unbind even is. */}
                <Select title={RASTER_REF_ROW.title}
                  value={section.rasterRef ?? ''} style={{ flex: 1, minWidth: 0 }}
                  onChange={(v) => run(sectionPresetCommand(
                    activeSectionIndex, section.rasterRef, v))}>
                  {presetRefOptions(library).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              {unassignablePresetRef(library, section.rasterRef, activeSectionIndex) && (
                <Hint under tone="warning">
                  {unassignablePresetRef(library, section.rasterRef, activeSectionIndex)}
                </Hint>
              )}
              {/* ═══ WHAT THIS SECTION CAN ACTUALLY CARRY ═══

                  Derived per act from aeon's own act_descriptor.emp and
                  <zone>_effects.emp, never listed here — the question was
                  answered wrong three times in one day and every wrong answer
                  was a snapshot. See core/formats/effects/section-wiring.ts.

                  ⚠ IT ADVISES; IT DOES NOT GATE. The select is not disabled and
                  there is no confirm: raster-binding.ts's STANDING REFUSAL, and
                  its hardest clause — if the files cannot be READ the sentence
                  says so, because a control greyed out because a file was
                  missing is indistinguishable from one greyed out because the
                  thing is impossible.

                  IT SPEAKS ABOUT THE LEVEL, NOT ABOUT AURORA: "sections 6, 7
                  and 8 share one preset, so giving one of them a band would
                  give all three the same band" tells an author what to ask a
                  programmer for. "You cannot do that" does not. */}
              {wiringAdvisory !== null && (
                <Hint under tone="warning">{wiringAdvisory}</Hint>
              )}
              <Hint under style={{ marginBottom: 0 }}>
                Saved to <code>section_{activeSectionIndex}.meta.json</code> as
                {' '}<code>rasterRef</code>.
              </Hint>
            </>
          )}
        </SectionBody>
      </CollapsibleSection>

      {selected && (
        <CollapsibleSection
          id="aeon.effects.preset.bands"
          title={`Preset — ${selected.id}`}
          defaultCollapsed
          right={
            // GUARDED, WITH THE REASON UNDER IT (EFFECTS-W1 defect 11). This
            // deleted the document with no confirmation and left every binding
            // that named it dangling; the author then met aeon's refusal
            // through the FAST wrapper, which blames missing donor directories.
            // Same idiom as the band Remove button: `deletePresetRefusal` is the
            // ONE derivation the disabled state and the sentence both read.
            <IconButton icon={<span>Delete</span>} label={`Delete preset ${selected.id}`}
              disabled={deleteRefusal !== null}
              // d-27. Measured, not read: with two presets present this button
              // survives its own press, is RETARGETED at `library.presets[0]`
              // through `resolveSelectedPreset`'s fallback, and keeps keyboard
              // focus (`docs/reviews/2026-09-03-d27-disputed-six.md`,
              // `[bpd-a..c]`). The `disabled` guard above does NOT cover the
              // stray Space: it is derived for the SELECTED preset, so after
              // the delete it is re-derived for the new target and the author
              // gets no signal that the button under their finger changed file.
              onClick={(e) => actAndDropFocus(e, () => run(deletePresetCommand(library, selected.id)))} />
          }>
          <SectionBody>
            {deleteRefusal !== null && <Hint tone="warning">{deleteRefusal}</Hint>}
            <Field label="Name" title="name — the writer's display label. Read by nothing and
              dropped when the generator lowers this document; it exists for you, not the build.">
              <input
                value={typeof selected.name === 'string' ? selected.name : ''}
                placeholder={selected.id}
                onChange={(e) => run(setPresetNameCommand(library, selected.id, e.target.value))}
                style={textInput} />
            </Field>

            {/* ═══ WHICH RASTER PROGRAM THIS DOCUMENT CARRIES (row 128) ═══

                A `<select>` and not a pair of buttons, and not a confirm
                dialog. The panel's own precedent is the band's ON arm, which
                REPLACES an arm body on a select change and says so in one line
                ("the author's old arm body is NOT lost to them — the swap is
                one undo step"); this is the same shape one level up.

                ⚠ IT IS DESTRUCTIVE AND IT IS ONE Ctrl+Z, which is the bar it
                had to clear. `setRasterChannelCommand` goes through
                `editPresetCommand`, so the command carries the WHOLE old
                document and the whole new one and undo re-places the old one
                verbatim — every band back, in order, with its colours. That is
                why the affordance exists at all: decision cards d-29 and d-30
                are about destructive controls that are NOT one undo away.

                THE ADVISORY IS UNCONDITIONAL AND SITS UNDER IT, naming what
                the switch would discard — `deletePresetRefusal`'s ruling that
                a confirm asks "are you sure?" about a consequence the author
                cannot see, while a sentence NAMES it. */}
            <Field label="Raster" title={RAMP_TITLE}>
              <Select title={RAMP_TITLE}
                value={presetRasterChannel(selected) ?? ''}
                onChange={(v) => run(setRasterChannelCommand(library, selected.id, v))}
                style={{ flex: 1, minWidth: 0 }}>
                {RASTER_CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Hint under>{rasterChannelSwapAdvisory(selected)}</Hint>

            {(selected.bands ?? []).map((band, i) => (
              <BandCard key={i} library={library} presetId={selected.id} index={i} band={band}
                run={run}
                lastRefusal={lastBandRefusal(selected)}
                coloursText={coloursText[i]}
                coloursRefusal={coloursRefusal[i] ?? null}
                setColoursText={(t) => setColoursText((s) => ({ ...s, [i]: t }))}
                setColoursRefusal={(r) => setColoursRefusal((s) => ({ ...s, [i]: r }))} />
            ))}

            {/* ═══ THE DEAD CONTROL, WITH ITS REASON BESIDE IT ═══

                `addBandCommand` became a SILENT NO-OP on a ramp document when
                the root became a `oneOf` — correctly, because growing a `bands`
                key onto a ramp preset would author the both-keys document the
                schema refuses, on every click. But a control that goes dead
                with no sentence is this repo's standing complaint, and the
                owner has been on the receiving end of it. `bandControlsRefusal`
                is ONE predicate read by the `disabled` flag AND by the Hint, so
                the greyed chip and the reason cannot disagree. */}
            <Chip disabled={bandControlsRefusal(selected) !== null}
              title={bandControlsRefusal(selected) ?? undefined}
              onClick={() => run(addBandCommand(library, selected.id))}>Add raster band</Chip>
            {bandControlsRefusal(selected) !== null && (
              <Hint tone="warning" style={{ marginTop: T.s2 }}>{bandControlsRefusal(selected)}</Hint>
            )}

            {/* ═══ ONE EDITOR PER RASTER PROGRAM, AND A SENTENCE WHEN THERE
                IS NONE ═══

                A card is genuinely per-channel content — five spinners here,
                two there, a list of band cards above — and cannot be derived
                from the schema the way the dropdown is. What IS derived is
                whether one is MISSING: `rasterEditorGap` reads the registry of
                channels that have a card, so a fourth arm opens with a sentence
                saying its fields are not editable here instead of rendering an
                empty section under a Raster row that names it correctly. */}
            {selected.ramp !== undefined && (
              <RampCard library={library} presetId={selected.id} ramp={selected.ramp} run={run}
                scroll={rampScroll} />
            )}
            {selected.base_swap !== undefined && (
              <BaseSwapCard library={library} presetId={selected.id}
                baseSwap={selected.base_swap} run={run} />
            )}
            {rasterEditorGap(selected) !== null && (
              <Hint tone="warning">{rasterEditorGap(selected)}</Hint>
            )}
          </SectionBody>
        </CollapsibleSection>
      )}

      {/* ═══ THE OTHER TWO CHANNELS (ROADMAP row 97, second half) ═══

          A SECTION OF ITS OWN, and the reason is the fold (O15, row 102): the
          bands section is measured, and cycles + variants at full extent are
          two cards of five spinners and three of eight. Folded in above, an
          author scrolling for "Add band" would pass them every time. Split
          out, the bands section's height does not move, and this one is shut
          until asked for.

          THE DISCLOSURE IS THE FIRST THING IN THE BODY, AND IT IS SILENT
          TODAY. It said "not consumed by the engine yet" above these controls
          until 2026-09-02, when aeon MERGED EFFECTS-W1 item 5 and its
          generator began lowering both keys; the sentence is derived from the
          measured premise (core/formats/effects/preset-lag.ts), that premise is
          now empty, and the leaf renders nothing. It STAYS MOUNTED, first and
          unconditional, because that is what makes re-arming it a one-line
          edit in that file: a CollapsibleSection renders no children while
          shut, so nobody would reach a cycles select without the sentence
          again. And it is a leaf that takes no props, so no `bound`/`section`
          guard can be slipped in one level down. */}
      {selected && (
        <CollapsibleSection
          id="aeon.effects.preset.channels"
          title={`Preset — ${selected.id} — cycles, variants`}
          defaultCollapsed>
          <SectionBody>
            <PresetLagDisclosure />
            <CyclesBlock library={library} preset={selected} run={run} />
            <VariantsBlock library={library} preset={selected} run={run} />
            <Hint style={{ marginBottom: 0 }}>
              Saved to <code>data/editor/effects/presets/{selected.id}.json</code> as
              {' '}<code>cycles</code> and <code>variants</code>. An absent key is not written.
            </Hint>
          </SectionBody>
        </CollapsibleSection>
      )}

      {/* ═══ THE MOVING ANCHOR (ROADMAP row 95 / EW-TIMELINE-CLOCK) ═══

          A SECTION OF ITS OWN, on the Colour job, for the fold reason the
          cycles/variants split was made for: four channel cards, each with two
          pickers, a world Y, three sweep controls and a live preview, is the
          tallest thing this panel can draw. Folded into the bands section an
          author scrolling for "Add raster band" would pass all of it.

          ⚠ AND THE HEADER COUNTS, which the two sections above it do not. O55
          measured this facet leading with its worse door: a creation surface
          behind a shut accordion with nothing on the arrival screen saying it
          exists. A shut section whose own title reads "moving anchors (2/4)"
          says both that the feature is here and that this preset already uses
          it — the `Tile animations (n/4)` idiom, which is the one header on
          this facet that announces itself. */}
      {selected && (
        <CollapsibleSection
          id="aeon.effects.preset.anchors"
          title={`Preset — ${selected.id} — moving anchors${anchorHeaderCount(selected)}`}
          defaultCollapsed>
          <SectionBody>
            <PresetLagDisclosure />
            <AnchorChannelsBlock library={library} preset={selected} run={run} />
          </SectionBody>
        </CollapsibleSection>
      )}
    </>
  );
}

/**
 * `` (n/4)`` when this preset spells any channel, and nothing when it spells
 * none — so a preset that does not use the feature does not carry a `0/4` that
 * reads like a broken counter.
 *
 * The denominator is the schema's `maxItems`, through the codec's constant. The
 * numerator counts channels either key SPELLS — an index either array reaches —
 * because that is what an author has authored here, and an unreached channel is
 * by definition something they have not.
 */
function anchorHeaderCount(preset: EffectsPreset): string {
  const seeds = Array.isArray(preset.patch_world_ys) ? preset.patch_world_ys.length : 0;
  const motion = Array.isArray(preset.patch_motion) ? preset.patch_motion.length : 0;
  const n = Math.max(seeds, motion);
  return n === 0 ? '' : ` (${n}/${EFFECTS_PRESET_MAX_PATCH})`;
}

/**
 * The moving-anchor channels.
 *
 * ═══ THE SENTENCE THAT COMES BEFORE THE CONTROLS ═══
 *
 * O56 measured the loop feature's entire on-screen vocabulary before an author
 * interacts with it: one word, four characters, with every explanation in a
 * hover or in text that only appears after you have already understood enough to
 * click. Its first recommendation is a one-line hint present BEFORE the feature
 * is armed. This is that line, and it is why it is not a tooltip.
 */
function AnchorChannelsBlock({ library, preset, run }: {
  library: EffectsPresetLibrary; preset: EffectsPreset; run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  return (
    <>
      <Hint>
        A patch channel pins a band to a point in the LEVEL instead of to a screen line, so it
        stays with the scenery as the camera moves — and a sweep makes that point drift up and
        down on a timer. Set a world Y to place it; add a sweep to move it.
      </Hint>
      {anchorChannelIndices(preset).map((i) => (
        <AnchorChannelCard key={i} library={library} preset={preset} index={i} run={run} />
      ))}
      <Hint style={{ marginBottom: 0 }}>
        Saved to <code>data/editor/effects/presets/{preset.id}.json</code> as
        {' '}<code>patch_world_ys</code> and <code>patch_motion</code>. A short array is left
        short and an absent key is not written.
      </Hint>
    </>
  );
}

/**
 * One channel: its seed, its motion, and — when the motion is a sweep — the one
 * clock in this editor.
 *
 * THE TWO PICKERS ARE THE SAME SHAPE AS `variants`' SLOT PICKER because they are
 * the same three states, and an author who has met one has met the other. What
 * is different is `anchorExtendRefusal`: two positional arrays with independent
 * lengths means a state can be unreachable at an index the other key already
 * reaches, and the option is DISABLED with the reason under it rather than
 * silently filling the gap with a `null` the author did not author.
 */
function AnchorChannelCard({ library, preset, index, run }: {
  library: EffectsPresetLibrary; preset: EffectsPreset; index: number;
  run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  const seedState = anchorSeedState(preset, index);
  const motionState = anchorMotionState(preset, index);
  const seed = anchorSeedValue(preset, index);
  const sweep = anchorSweepOf(preset, index);
  const seedBlocked = anchorExtendRefusal(preset, 'seed', index);
  const motionBlocked = anchorExtendRefusal(preset, 'motion', index);
  const noSeed = anchorMotionWithoutSeedAdvisory(preset, index);
  const [seedRefusal, setSeedRefusal] = React.useState<string | null>(null);
  const [phaseRefusal, setPhaseRefusal] = React.useState<string | null>(null);
  return (
    <Card>
      <Field label={`Channel ${index}`} title={ANCHOR_SEED_TITLE}>
        <Select title={ANCHOR_SEED_TITLE} value={seedState} style={{ flex: 1, minWidth: 0 }}
          onChange={(v) => run(setAnchorSeedStateCommand(
            library, preset.id, index, v as AnchorSeedState))}>
          {ANCHOR_SEED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}
              disabled={seedBlocked !== null && o.value !== seedState}>{o.label}</option>
          ))}
        </Select>
      </Field>
      {seedBlocked !== null && <Hint under tone="warning">{seedBlocked}</Hint>}

      {/* THE WORLD Y. No min/max on the spinner — `refuse` is the only thing
          that withholds a commit (NumberField's own rule), and the two refusals
          it enforces are the schema's: the u16 range and the sentinel spelled
          as an integer. ⚠ NOTHING HERE MULTIPLIES. `drift.rate` is 1/256 px per
          frame and the scene panel multiplies by 256 on export; a world Y put
          through that habit lands 256 times down the level, validates clean,
          and the band silently never appears. */}
      {seedState === 'authored' && (
        <>
          <Field label="World Y" title={ANCHOR_SEED_TITLE}>
            <NumberField title={ANCHOR_SEED_TITLE} width={80} value={seed ?? 0}
              refuse={anchorSeedRefusal}
              onRefusal={setSeedRefusal}
              onChange={(n) => run(setAnchorSeedCommand(library, preset.id, index, n))} />
            <span style={{ fontSize: T.tXs, color: T.textLo }}>px, level space</span>
          </Field>
          {seedRefusal !== null && <Hint under tone="warning">{seedRefusal}</Hint>}
        </>
      )}

      <Field label="Movement" title={ANCHOR_MOTION_TITLE}>
        <Select title={ANCHOR_MOTION_TITLE} value={motionState} style={{ flex: 1, minWidth: 0 }}
          onChange={(v) => run(setAnchorMotionStateCommand(
            library, preset.id, index, v as AnchorMotionState))}>
          {ANCHOR_MOTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}
              disabled={motionBlocked !== null && o.value !== motionState}>{o.label}</option>
          ))}
        </Select>
      </Field>
      {motionBlocked !== null && <Hint under tone="warning">{motionBlocked}</Hint>}
      {/* A MOTION ON A CHANNEL WITH NO SEED SHOWS NOTHING, in the schema's own
          words. Without this the author ships a no-op and nothing in the suite
          tells them: aeon's generator lowers it without complaint. */}
      {noSeed !== null && <Hint under tone="warning">{noSeed}</Hint>}

      {sweep !== null && (
        <>
          {/* ⚠ BOTH SHIFTS ARE BASE-2 LOGARITHMS AND THESE SELECTS ARE THE
              LADDERS THEMSELVES. The schema restates their ranges "only as the
              rungs the UI must offer" and says a slider "must SNAP to a rung:
              rounding a shift instead of snapping silently doubles or halves
              the amplitude or the period, invisibly at author time". A select
              fed from `ANCHOR_AMP_OPTIONS` cannot emit an off-ladder value at
              all — there is nothing left to round. The labels are the physical
              quantity, because px and seconds are what an author judges and a
              shift is not. */}
          <Field label="Travel" title={anchorSweepFieldTitle('amp_shift')}>
            <Select title={anchorSweepFieldTitle('amp_shift')} value={String(sweep.amp_shift)}
              style={{ flex: 1, minWidth: 0 }}
              onChange={(v) => run(setAnchorSweepShiftCommand(
                library, preset.id, index, 'amp_shift', Number(v)))}>
              {ANCHOR_AMP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cycle" title={anchorSweepFieldTitle('period_shift')}>
            <Select title={anchorSweepFieldTitle('period_shift')} value={String(sweep.period_shift)}
              style={{ flex: 1, minWidth: 0 }}
              onChange={(v) => run(setAnchorSweepShiftCommand(
                library, preset.id, index, 'period_shift', Number(v)))}>
              {ANCHOR_PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {/* `phase` IS THE ONE CONTINUOUS FIELD and the one optional one:
              present → a spinner and an unset; absent → a chip that writes it.
              An absent `phase` is `anchor_sweep()`'s own default and a different
              document from an explicit 0 — the `dir` idiom, one section up. */}
          <Field label="Start at" title={anchorSweepFieldTitle('phase')}>
            {sweep.phase !== undefined ? (
              <>
                <NumberField title={anchorSweepFieldTitle('phase')} width={64}
                  value={sweep.phase}
                  refuse={anchorPhaseRefusal}
                  onRefusal={setPhaseRefusal}
                  onChange={(n) => run(setAnchorPhaseCommand(library, preset.id, index, n))} />
                <span style={{ fontSize: T.tXs, color: T.textLo }}>
                  /{ANCHOR_PHASE_RANGE.max + 1} of a cycle
                </span>
                <IconButton icon={<span>Unset</span>} label={`Unset phase on channel ${index}`}
                  onClick={() => run(setAnchorPhaseCommand(library, preset.id, index, undefined))} />
              </>
            ) : (
              <Chip title={'phase is absent — anchor_sweep() defaults it to 0. Set it to write a '
                + 'value, which is a different document from an absent field.'}
                onClick={() => run(setAnchorPhaseCommand(library, preset.id, index, 0))}>
                absent — set
              </Chip>
            )}
          </Field>
          {phaseRefusal !== null && <Hint under tone="warning">{phaseRefusal}</Hint>}
          {anchorSweepSummary(sweep) !== null && (
            <Hint under>{anchorSweepSummary(sweep)}</Hint>
          )}
          {/* THE CLOCK. Mounted only here — for a channel whose motion is an
              authored sweep — so there is no loop running when nothing is
              animating. See AnchorSweepPreview.tsx's header for why that is
              structural and what it does NOT draw. */}
          <AnchorSweepPreview sweep={sweep} channel={index} />
        </>
      )}
    </Card>
  );
}

/**
 * The `cycles` channel: one picker for the three spellings, then the script's
 * channels when there is one. The picker's options are the provider's, labelled
 * with what each WRITES, so the author reads the file from the control.
 */
function CyclesBlock({ library, preset, run }: {
  library: EffectsPresetLibrary; preset: EffectsPreset; run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  const state = cyclesState(preset);
  const emptyAdvice = emptyCyclesAdvisory(preset);
  return (
    <>
      <Field label="cycles" title={CYCLES_TITLE}>
        <Select title={CYCLES_TITLE} value={state} style={{ flex: 1, minWidth: 0 }}
          onChange={(v) => run(setCyclesStateCommand(library, preset.id, v as typeof state))}>
          {CYCLES_STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      {/* `[]` stays `[]` and says so. The advisory is the schema's own
          sentence; the array is not rewritten as null or dropped, because
          either would author a spelling the author did not pick. */}
      {emptyAdvice !== null && <Hint under tone="warning">{emptyAdvice}</Hint>}
      {Array.isArray(preset.cycles) && preset.cycles.map((ch, i) => (
        <CycleChannelCard key={i} library={library} presetId={preset.id} index={i} channel={ch} run={run} />
      ))}
      {Array.isArray(preset.cycles) && (
        <Chip onClick={() => run(addCycleChannelCommand(library, preset.id))}>Add channel</Chip>
      )}
    </>
  );
}

function CycleChannelCard({ library, presetId, index, channel, run }: {
  library: EffectsPresetLibrary; presetId: string; index: number;
  channel: EffectsPresetCycleChannel; run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  const { required, optional } = presetDefFields('cycle_channel');
  const values = channel as unknown as Record<string, number | undefined>;
  const [fieldRefusal, setFieldRefusal] = React.useState<Record<string, string | null>>({});
  return (
    <Card>
      <Field label={`Channel ${index}`}>
        {/* ⚠ ACTS AND THEN DROPS FOCUS (d-27, see `ui/act-and-drop-focus.ts`),
            and this is the `key={i}` LIST-REMOVAL shape. The card does not
            unmount with the channel it deleted: React re-uses it for the
            channel that slid down into slot `index`. Before the ruling a click
            left it focused and a bare Space did not repeat the action, it
            RETARGETED it at the neighbour.
            The purest instance of the defect on this panel — no `disabled`
            predicate, no refusal, no confirmation: the press removes and the
            schema accepts an empty `cycles` list, so nothing stopped a held
            Space walking the whole channel list away. */}
        <IconButton icon={<span>Remove</span>} label={`Remove cycle channel ${index}`}
          onClick={(e) => actAndDropFocus(e, () => run(removeCycleChannelCommand(library, presetId, index)))} />
      </Field>
      {/* STILL NO min/max — the band spinners' rule (aeon E.4), for the same
          reason: the constructor's ensure names the bound and the measurement,
          and a bound here would replace it.

          ONE FIELD HAS A RULE THE SCHEMA STATES OUTRIGHT, and it is refused:
          `line` must not be 0, because line 0 is the character's. Everything
          else is forwarded verbatim. `cycleFieldRefusal` owns the split. */}
      {required.map((f) => (
        <React.Fragment key={f}>
          <Field label={f} title={cycleFieldTitle(f)}>
            <NumberField title={cycleFieldTitle(f)} width={72} value={Number(values[f])}
              refuse={(n) => cycleFieldRefusal(presetId, index, f, n)}
              onRefusal={(r) => setFieldRefusal((s) => ({ ...s, [f]: r }))}
              onChange={(n) => run(setCycleFieldCommand(library, presetId, index, f, n))} />
          </Field>
          {fieldRefusal[f] != null && <Hint under tone="warning">{fieldRefusal[f]}</Hint>}
        </React.Fragment>
      ))}
      {/* The optional field(s): present → a spinner and an unset; absent → a
          chip that writes it. An absent `dir` is the constructor's default
          and a different document from an explicit 0. */}
      {optional.map((f) => (
        <Field key={f} label={f} title={cycleFieldTitle(f)}>
          {values[f] !== undefined ? (
            <>
              <NumberField title={cycleFieldTitle(f)} width={72} value={Number(values[f])}
                onChange={(n) => run(setCycleFieldCommand(library, presetId, index, f, n))} />
              <IconButton icon={<span>Unset</span>} label={`Unset ${f} on cycle channel ${index}`}
                onClick={() => run(setCycleFieldCommand(library, presetId, index, f, undefined))} />
            </>
          ) : (
            <Chip title={`${f} is absent — the constructor's default. Set it to write a value.`}
              onClick={() => run(setCycleFieldCommand(library, presetId, index, f, 0))}>
              absent — set
            </Chip>
          )}
        </Field>
      ))}
    </Card>
  );
}

/**
 * The `variants` channel: one picker for key-present-or-absent, then one card
 * per slot the array reaches PLUS ONE unreached slot to extend into. No slot
 * count is drawn: the schema carries none, and the generator names its own.
 */
function VariantsBlock({ library, preset, run }: {
  library: EffectsPresetLibrary; preset: EffectsPreset; run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  const state = variantsState(preset);
  return (
    <>
      <Field label="variants" title={VARIANTS_TITLE}>
        <Select title={VARIANTS_TITLE} value={state} style={{ flex: 1, minWidth: 0 }}
          onChange={(v) => run(setVariantsStateCommand(library, preset.id, v as typeof state))}>
          {VARIANTS_STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      {state === 'present' && variantSlotIndices(preset).map((i) => (
        <VariantSlotCard key={i} library={library} preset={preset} index={i} run={run} />
      ))}
    </>
  );
}

function VariantSlotCard({ library, preset, index, run }: {
  library: EffectsPresetLibrary; preset: EffectsPreset; index: number; run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  const state = variantSlotState(preset, index);
  const slot = state === 'authored' ? (preset.variants![index] as EffectsPresetPalVariant) : null;
  const values = (slot ?? {}) as Record<string, number | undefined>;
  const unset = VARIANT_FIELDS.filter((f) => values[f] === undefined);
  const [lineRefusal, setLineRefusal] = React.useState<string | null>(null);
  return (
    <Card>
      <Field label={`Slot ${index}`} title={VARIANTS_TITLE}>
        <Select title={VARIANTS_TITLE} value={state} style={{ flex: 1, minWidth: 0 }}
          onChange={(v) => run(setVariantSlotStateCommand(library, preset.id, index, v as typeof state))}>
          {VARIANT_SLOT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      {slot !== null && VARIANT_FIELDS.filter((f) => values[f] !== undefined).map((f) => (
        <Field key={f} label={f} title={variantFieldTitle(f)}>
          {f === 'lines' ? (
            /* The friendlier spelling the schema hands to the panel (ruling
               Q4): one chip per CRAM line, bit n ⇔ line n. The WIRE value is
               the integer beside them, and a toggle flips one bit only, so a
               hand-written mask keeps whatever else it carried.

               ⚠ `L0` USED TO BE A ONE-CLICK RED BUILD (EFFECTS-W1 defect 5 /
               b1). It was offered on the reasoning that "a file can carry it
               and the constructor's refusal is the constructor's to give" —
               while the tooltip ON THIS BUTTON already stated the rule. One
               click, no feedback, a build failure naming a byte offset. It is
               now refused when it would SET the bit and still allowed when it
               would CLEAR one a hand-written file carries, so the reasoning
               above stays true and the trap is gone. The refusal derivation is
               `variantLineRefusal`, in the provider, so this chip and the
               sentence under it cannot disagree. */
            <>
              {CRAM_LINES.map((line) => {
                const why = variantLineRefusal(preset.id, index, Number(values[f]), line);
                return (
                  <Chip key={line} active={variantLineOn(Number(values[f]), line)}
                    title={why ?? `CRAM line ${line} — bit ${line} of the mask`}
                    onClick={() => {
                      if (why !== null) { setLineRefusal(why); return; }
                      setLineRefusal(null);
                      run(toggleVariantLineCommand(library, preset.id, index, line));
                    }}>
                    L{line}
                  </Chip>
                );
              })}
              <span style={{ fontSize: T.tXs, color: T.textLo }}>= {Number(values[f])}</span>
            </>
          ) : (
            <NumberField title={variantFieldTitle(f)} width={72} value={Number(values[f])}
              onChange={(n) => run(setVariantFieldCommand(library, preset.id, index, f, n))} />
          )}
          <IconButton icon={<span>Unset</span>} label={`Unset ${f} on variant slot ${index}`}
            onClick={() => run(setVariantFieldCommand(library, preset.id, index, f, undefined))} />
        </Field>
      ))}
      {/* THE REFUSAL, UNDER THE CHIPS THAT PRODUCED IT. It is state and not a
          derivation because it is about a GESTURE — the document is unchanged,
          so nothing in it could carry the sentence. `Hint under` puts it in the
          field column, directly below the `L0 L1 L2 L3` row. */}
      {lineRefusal !== null && <Hint under tone="warning">{lineRefusal}</Hint>}
      {/* Every field is optional and absent means the constructor's default.
          The absent ones are one row of chips, each of which WRITES the field
          — a seed to type over, not a default Aurora claims to know. */}
      {slot !== null && unset.length > 0 && (
        <Field label="absent" title="Fields not written — each is the constructor's default until set.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: T.s1, flex: 1, minWidth: 0 }}>
            {unset.map((f) => (
              <Chip key={f} title={variantFieldTitle(f)}
                onClick={() => run(setVariantFieldCommand(library, preset.id, index, f, variantFieldSeed(f)))}>
                {f}
              </Chip>
            ))}
          </div>
        </Field>
      )}
    </Card>
  );
}

/**
 * THE COLOUR HALF OF DEFECT 13 — a swatch per entry, and a picker that is not
 * "know the packing and convert to base 10".
 *
 * ═══ WHAT THE WALKTHROUGH ACTUALLY MEASURED ═══
 *
 * a12: "To find out what a colour looks like I opened the shipped `Authored
 * probe (red / blue)` preset and read its numbers: `14` and `3584`. Those are
 * Genesis CRAM words in decimal. An author must know the BBB GGG RRR packing AND
 * convert it to base 10, by hand, in an application that has a full palette
 * editor one tab away. Nothing offers a swatch."
 *
 * ═══ THE FOUR DESIGN CALLS, AND WHY ═══
 *
 * 1. THE SWATCH IS THE APP'S EXISTING SWATCH, not a new one. 16x16, 1px border
 *    at `T.border`, `borderRadius: 2`, colour through `swatchCss` — the exact
 *    values `art-shared/PaletteGrid` draws, read off it rather than re-picked, so
 *    a colour looks the same in the panel that authors it and the editor that
 *    owns the palette. What is deliberately NOT copied is `flex: 1 1 0`: the grid
 *    divides a fixed 16 columns across its width, and this list has a length the
 *    AUTHOR chose, so a fixed 16px that wraps keeps one colour one size whether
 *    the band writes one word or twelve.
 *
 * 2. INLINE, NOT A POPOVER. The picker is `GenesisColorSliders` — the same
 *    control both palette panels use — mounted UNDER the strip, which is what
 *    `PaletteGrid` does with the same component. This column is a 300px
 *    scroller: a popover in it has to be portalled, positioned against a moving
 *    scroll offset, and dismissed, and every one of those is a way for a control
 *    to end up painted outside its scroller (measured on this surface's
 *    neighbours more than once). An inline panel cannot be anywhere but where its
 *    row is.
 *
 * 3. IT IS A SECOND WAY IN, NEVER A REPLACEMENT. The text field above is
 *    untouched and still holds the decimal list. That is the ROADMAP row 97
 *    precedent — one toggle flips one bit, the readout prints the integer — and
 *    it is also the only way the LIST'S LENGTH stays authorable: the length is a
 *    second authored quantity (it is the derived restore's word count), the text
 *    field is where it is authored, and a swatch strip that had to grow and shrink
 *    would have quietly become the length control too.
 *
 * 4. NO CHECKER ON INDEX 0. `PaletteGrid` draws entry 0 as a checker because the
 *    VDP treats it as the backdrop; here the list index is a POSITION IN THE
 *    BAND'S WRITE, not a palette entry, so index 0 of `colours` is an ordinary
 *    colour. Which entry it lands on is in the swatch's title, from the address.
 *
 * ⚠ ONE GESTURE, ONE UNDO STEP. `onChange` (per slider tick) writes NOTHING —
 * it moves a local draft, so a drag is not a hundred history entries. `onCommit`
 * (pointerup, keyup, blur) runs one `setColourCommand`. The commit fires twice
 * per drag by design, and the second is a no-op because `editPresetCommand`
 * returns null for a document that did not change.
 */
function ColourSwatches({ library, presetId, index, addr, colours, run, onEdited }: {
  library: EffectsPresetLibrary; presetId: string; index: number;
  addr: number; colours: readonly number[];
  run: (c: AnyCommand | null) => void;
  /** The list changed from HERE — drop the text field's draft so it re-reads. */
  onEdited: () => void;
}): React.ReactElement | null {
  const [sel, setSel] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<number | null>(null);
  const committed = sel === null ? 0 : (colours[sel] ?? 0);
  // Resync on a selection change or on an external write — undo/redo, an agent
  // edit, the command the release just ran — so the sliders never show a stale
  // draft over a document that has moved. PaletteGrid's own rule, same deps.
  React.useEffect(() => { setDraft(null); }, [sel, committed]);
  if (colours.length === 0) return null;
  const open = sel !== null && sel < colours.length;
  return (
    <div style={{ marginLeft: CONTROL_INSET, marginBottom: T.s2 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {colours.map((word, i) => (
          <button key={i} type="button"
            title={colourSwatchTitle(addr, i, word)}
            aria-label={`Colour ${i} of raster band ${index}`}
            data-band-colour={i}
            onClick={() => setSel((cur) => (cur === i ? null : i))}
            style={{
              width: 16, height: 16, padding: 0, boxSizing: 'border-box',
              background: swatchCss(sel === i && draft !== null ? draft : word),
              borderWidth: sel === i ? 2 : 1, borderStyle: 'solid',
              borderColor: sel === i ? T.textHi : T.border,
              borderRadius: 2, cursor: 'pointer',
            }} />
        ))}
      </div>
      {open && (
        <div style={{ marginTop: T.s2 }}>
          <GenesisColorSliders
            word={draft ?? committed}
            heading={`Colour ${sel}`}
            onChange={(w) => setDraft(w)}
            onCommit={(w) => {
              run(setColourCommand(library, presetId, index, sel!, w));
              onEdited();
            }} />
        </div>
      )}
    </div>
  );
}

function BandCard({
  library, presetId, index, band, run, lastRefusal,
  coloursText, coloursRefusal, setColoursText, setColoursRefusal,
}: {
  library: EffectsPresetLibrary;
  presetId: string;
  index: number;
  band: EffectsPresetBand;
  run: (c: AnyCommand | null) => void;
  lastRefusal: string | null;
  coloursText: string | undefined;
  coloursRefusal: string | null;
  /**
   * `undefined` DROPS the draft and lets the box read the document again — which
   * is what a swatch edit needs. Without it an author who typed in the list and
   * then picked a colour would watch the swatch change under a text box still
   * showing what they typed: one field's draft outliving an edit to the other,
   * which is the two-sources-of-truth defect this panel has met before.
   */
  setColoursText: (t: string | undefined) => void;
  setColoursRefusal: (r: string | null) => void;
}): React.ReactElement {
  const arm = bandArm(band);
  const armAdvice = bandArmAdvisory(band);
  const options = armOptions(arm ?? (Object.keys(band.on)[0] ?? null));
  // WHY THE REFUSAL OUTLIVES THE BLUR. `NumberField` resyncs its text to the
  // document when focus leaves, so an illegal number visibly snaps back — and
  // if the sentence went with it, the author would watch their value vanish
  // with no explanation, which is worse than the silence this replaces. It is
  // cleared on the box's next focus (`NumberField`'s `onFocus`), so it is never
  // stale advice about a value the author has moved on from.
  const [edgeRefusal, setEdgeRefusal] =
    React.useState<{ top: string | null; bot: string | null }>({ top: null, bot: null });

  return (
    <Card>
      <Field label={`Raster band ${index}`}>
        {/* DISABLED WITH A REASON, NOT HIDDEN. `lastBandRefusal` is the same
            predicate `removeBandCommand` returns null on, read from one place,
            so the greyed button and the sentence under it cannot disagree. */}
        {/* ⚠ AND IT ACTS AND THEN DROPS FOCUS (d-27, see
            `ui/act-and-drop-focus.ts`). Same `key={i}` list-removal shape as
            the cycle channel above: the button survives its own click and
            re-aims at the band that slid into slot `index`, so a repeat Space
            destroyed the NEIGHBOUR rather than repeating the press. The
            `disabled` above is the schema floor and not a focus guard — it
            only stops the LAST band going, which is precisely the one press
            this button was already safe on. */}
        <IconButton icon={<span>Remove</span>} label={`Remove raster band ${index}`}
          disabled={lastRefusal !== null}
          onClick={(e) => actAndDropFocus(e, () => run(removeBandCommand(library, presetId, index)))} />
      </Field>
      {lastRefusal !== null && <Hint under>{lastRefusal}</Hint>}

      {/* ═══ REFUSED AT THE CONTROL, AT TYPING TIME (EFFECTS-W1 defect 5) ═══

          STILL NO `min`/`max`, and that is not the omission it looks like: on
          `<input type="number">` those govern the SPINNER and `:invalid` and
          stop no typed value at all. `min={3}` would have let `40112` through
          exactly as before. The refusal is `refuse`, which withholds the write.

          NOT A CLAMP, so aeon's §E.4 stands: nothing here substitutes a number
          the author did not type. The value is refused, unwritten, and the
          engine's own rule is quoted back with the preset and the band named —
          see `bandEdgeRefusal`'s docblock for why the line is drawn at rules 1
          and 2 and why the order rule's message ends "move the other edge
          first". */}
      <Field label="Top" title={BAND_FIELD_TITLES.top}>
        <NumberField title={BAND_FIELD_TITLES.top} width={72} value={band.top}
          refuse={(n) => bandEdgeRefusal(band, presetId, index, 'top', n)}
          onRefusal={(r) => setEdgeRefusal({ ...edgeRefusal, top: r })}
          onChange={(n) => run(setBandFieldCommand(library, presetId, index, 'top', n))} />
      </Field>
      {edgeRefusal.top !== null && <Hint under tone="warning">{edgeRefusal.top}</Hint>}
      <Field label="Bot" title={BAND_FIELD_TITLES.bot}>
        <NumberField title={BAND_FIELD_TITLES.bot} width={72} value={band.bot}
          refuse={(n) => bandEdgeRefusal(band, presetId, index, 'bot', n)}
          onRefusal={(r) => setEdgeRefusal({ ...edgeRefusal, bot: r })}
          onChange={(n) => run(setBandFieldCommand(library, presetId, index, 'bot', n))} />
      </Field>
      {edgeRefusal.bot !== null && <Hint under tone="warning">{edgeRefusal.bot}</Hint>}

      <Field label="S/H" title={BAND_FIELD_TITLES.sh}>
        <Select title={BAND_FIELD_TITLES.sh}
          value={(band.sh === true || band.sh === 1) ? 'on' : 'off'}
          onChange={(v) => run(setBandFieldCommand(
            library, presetId, index, 'sh',
            // Preserve the document's own spelling: a file that wrote 0/1 keeps
            // integers, one that wrote a boolean keeps booleans. Normalising
            // would put a diff on every load/save of a hand-written document.
            typeof band.sh === 'number' ? (v === 'on' ? 1 : 0) : v === 'on'))}
          style={{ flex: 1, minWidth: 0 }}>
          <option value="off">off — two-fire band</option>
          <option value="on">on — three-fire S/H shape</option>
        </Select>
      </Field>

      <Field label="ON" title={BAND_FIELD_TITLES.on}>
        <Select title={BAND_FIELD_TITLES.on} value={arm ?? (Object.keys(band.on)[0] ?? '')}
          onChange={(v) => run(setBandArmCommand(library, presetId, index, v))}
          style={{ flex: 1, minWidth: 0 }}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {armAdvice !== null && <Hint under tone="warning">{armAdvice}</Hint>}

      {/* ═══ `addr` GETS A HUMAN RENDERING BESIDE THE NUMBER (a13) ═══

          The cold reader met `addr = 74` with a three-letter label and nothing
          else: "There is no 'palette line 2, entry 5' rendering of it anywhere,
          though the panel elsewhere is happy to render a line mask as L0 L1 L2
          L3 chips." That is the precedent this follows, and it follows it the
          same way ROADMAP row 97 did — THE INTEGER STAYS. The spinner is
          untouched, still carries no min/max (aeon §E.4, harness row 4e), and
          the gloss is a `<span>` after it, exactly where `World Y` puts "px,
          level space" and `Start at` puts "/256 of a cycle".

          ⚠ IT SITS IN THE CONTROL COLUMN AND COSTS THE LABEL COLUMN NOTHING.
          The label is still the schema's key at LABEL_W; the gloss is the third
          item in a row that already had two, and `line 2 · entry 5` is the
          longest ordinary case. Widening the label column was NOT an option —
          it is zero-sum against every select in this panel, measured
          (column-layout.tsx's docblock, and docs/reviews/2026-09-03-effects-
          label-widths.md).

          BOTH ARMS, because both carry `addr` and the schema calls both a CRAM
          byte address. On `pal_region` it is worth more, not less: that arm ALSO
          carries `pal_line` and `entry` as their own keys which "must AGREE with
          addr", so an author can now see the disagreement the engine would
          refuse. `addrGloss` reads the ADDRESS and never those keys — see its
          docblock for why printing the file's own claim would be a lie. */}
      {arm !== null && presetArmFields(arm)
        .filter((f) => f !== 'colours')
        .map((f) => (
          <Field key={f} label={f} title={armFieldTitle(arm, f)}>
            <NumberField title={armFieldTitle(arm, f)} width={72}
              value={Number((band.on as unknown as Record<string, Record<string, number>>)[arm][f])}
              onChange={(n) => run(setArmFieldCommand(library, presetId, index, f, n))} />
            {f === 'addr' && (
              <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 0 }}>
                {addrGloss(Number(
                  (band.on as unknown as Record<string, Record<string, number>>)[arm][f]))}
              </span>
            )}
          </Field>
        ))}

      {arm === 'cram' && 'cram' in band.on && (
        <>
          <Field label="colours" title={armFieldTitle('cram', 'colours')}>
            <input
              value={coloursText ?? band.on.cram.colours.join(' ')}
              placeholder="14 3584"
              onChange={(e) => {
                setColoursText(e.target.value);
                const parsed = parseColours(
                  e.target.value, bandSubject(presetId, index, 'colours'));
                if (!parsed.ok) { setColoursRefusal(parsed.reason); return; }
                setColoursRefusal(null);
                run(setColoursCommand(library, presetId, index, parsed.colours));
              }}
              style={textInput} />
          </Field>
          {coloursRefusal !== null && <Hint under tone="warning">{coloursRefusal}</Hint>}
          {/* ═══ THE SWATCHES (a12) ═══ */}
          <ColourSwatches library={library} presetId={presetId} index={index}
            addr={band.on.cram.addr} colours={band.on.cram.colours} run={run}
            onEdited={() => setColoursText(undefined)} />
          {/* The second authored quantity, said where it is authored: the list's
              LENGTH is also the derived restore's word count, so adding a colour
              changes what the band costs and not only how it looks. */}
          <Hint under>
            {band.on.cram.colours.length} colour
            {band.on.cram.colours.length === 1 ? '' : 's'} — also the derived restore's word count.
          </Hint>
          {/* THE TWO CONTROLS ARE JOINTLY REFUSABLE, so the sentence is under
              both of them. The length is authored above, the address below, and
              each can be reasonable while the pair is not. An ADVISORY, not a
              refusal — see `cramSpanAdvisory`. */}
          {cramSpanAdvisory(band, presetId, index) !== null && (
            <Hint under tone="warning">{cramSpanAdvisory(band, presetId, index)}</Hint>
          )}
        </>
      )}

      {/* The band's four keys, named from the schema, so an author can see that
          all four really are written every time. There is no default for any of
          them in the JSON or in the engine. */}
      <Hint under>
        Writes {EFFECTS_PRESET_BAND_KEYS.join(', ')} — all four, every time.
        No field here has a default.
        {arm !== null && ` The ON arm is ${armLabel(arm)}; exactly one arm is allowed.`}
      </Hint>
    </Card>
  );
}

/**
 * THE RAMP CARD — the dense raster channel's whole authoring surface.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ║ ONE RATE, ONE START, ONE SPAN — AND THAT IS DELIBERATELY ALL THERE IS   ║
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Five fields, because the ramp has five keys and the constructor defaults none
 * of them. THERE IS NO CURVE EDITOR HERE, no multi-point widget and no per-line
 * table, and none may ever be added: `RasterRampProgram` has a single
 * `rrp_step` and a single `rrp_start` and no field that could receive a table,
 * so a control offering per-line values would author a document that validates,
 * generates, and is then silently wrong on hardware. The contract's own
 * statement of that is painted at the top of this card (`RAMP_MUST_NOT_SHORT`)
 * with the full sentence — parsed out of the schema, not retyped — on its title.
 *
 * ⚠ THE TWO NUMBERS THAT LOOK FINE AND ARE NOT, both handled by the provider:
 *
 *   • `top` and `lines` can EACH be in range while `top + lines` is not. 222 and
 *     220 satisfy every schema keyword and the pair is refused by the engine, so
 *     `rampSpanRefusal` refuses it HERE, at typing time, with the schema's own
 *     number — not at somebody else's build.
 *   • A rate that has no spelling is REFUSED AND NOT ROUNDED. The interval
 *     between -1 and 0 is unreachable in this encoding (the sign lives on the
 *     whole part), so `-0.5` cannot be written at all; `rampRateRefusal` names
 *     the nearest values that CAN be, and nothing here snaps.
 *
 * ⚠ AND NO min/max ON ANY SPINNER, aeon's §E.4, exactly as the band card: those
 * attributes govern the arrows and `:invalid` and stop no typed value. `refuse`
 * is the only thing that withholds a commit. `step` IS set on the two rate
 * fields, and it is not a range: without it a browser snaps a fractional value
 * to a whole number on one arrow press, which would turn 0.25 into 1.
 *
 * THE LAG IS APPLIED IN EXACTLY ONE PLACE ON THIS CARD — the display readout
 * under Lines, which is a claim about SCREEN lines. The Top field is the
 * ENGINE's top and is written to the file verbatim. No stage of the engine path
 * compensates (measured by the engine lane, 2026-09-03), so the compensation is
 * ours and this is where it lives; `rampDisplaySpan`'s docblock carries the
 * whole reasoning and `RAMP_DISPLAY_LAG_NOTE` is the readout's own title.
 *
 * NO PREVIEW IS DRAWN, and that is not an oversight: nothing in this editor has
 * ever drawn a raster program, `NO_PREVIEW` says so at the top of the panel, and
 * a drawn ramp is exactly where the display lag would be most dangerous.
 */
function RampCard({ library, presetId, ramp, run, scroll }: {
  library: EffectsPresetLibrary;
  presetId: string;
  ramp: EffectsPresetRamp;
  run: (c: AnyCommand | null) => void;
  /**
   * Which of the two effects this ramp will actually produce, derived from the
   * BINDINGS by the provider. Null only when there is no act to ask.
   */
  scroll: { short: string; full: string } | null;
}): React.ReactElement {
  // WHY THE REFUSAL OUTLIVES THE BLUR — `BandCard`'s reason, unchanged:
  // `NumberField` resyncs its text to the document when focus leaves, so an
  // illegal number visibly snaps back, and if the sentence went with it the
  // author would watch their value vanish with no explanation. It is cleared on
  // the box's next focus, so it is never stale advice about a value they have
  // moved on from.
  const [why, setWhy] = React.useState<Record<string, string | null>>({});
  const said = (k: string): string | null => why[k] ?? null;
  const say = (k: string) => (r: string | null): void => setWhy((s) => ({ ...s, [k]: r }));

  return (
    <Card>
      {/* THE MUST NOT, PAINTED. `LimitBlock`'s split, for its reason: the
          contract sentence carries engine line numbers and an artifact section
          and is owed to the agent surface; what an author has to ACT ON is the
          two clauses. Both halves reach this element. */}
      <Hint tone="warning">
        <span title={RAMP_MUST_NOT}>{RAMP_MUST_NOT_SHORT}</span>
      </Hint>

      {/* THE LAG DISCLOSURE, THIRD MOUNT SITE — SILENT SINCE 2026-09-03.
          `ramp` WAS the sharper flavour (absent from aeon's vocabulary
          entirely, so a preset carrying it failed the build outright); aeon's
          page ACCEPTS it at `c7ee7075` and the premise emptied, so this leaf
          now renders nothing. IT STAYS MOUNTED ANYWAY: a mounted leaf returning
          `null` IS the retired state, and re-arming stays a one-line edit in
          `core/formats/effects/preset-lag.ts` that reaches all three sites at
          once. Unmounting it here is how the next lag misses this card.
          ⚠ MERGED, AND WITNESSED ON A PEER'S BRANCH — NOT CERTIFIED, AND NOT
          BY AURORA (updated 2026-09-03). aeon drove a running machine on THIS
          EDITOR'S OWN ramp document: the authored -1.5 px/line is in the ROM
          record and moves the picture against a four-byte control. But it is on
          `origin/parcel/aurora-ramp-witness`, which is NOT an ancestor of aeon's
          master; it is emulation, not silicon; and the first-displayed-line rule
          this card's own span readout applies is CONTESTED BY ONE LINE by that
          same run — we derive `top + 1`, they measured `top + 2` on two
          different tops. Nothing in Aurora has measured a ROM. The full record,
          including what the witness does NOT say, is in
          `core/formats/effects/preset-lag.ts`. */}
      <PresetLagDisclosure />

      {/* THE SIGN DISCLOSURE — A NARROWER FACT ONE LAYER FURTHER DOWN, AND IT
          IS NOT THE ONE ABOVE RE-ARMED. `ramp` is accepted by aeon's generator
          and a POSITIVE ramp builds and runs; what does not build is a NEGATIVE
          16.16, because `raster_ramp_program` declares `rrp_start`/`rrp_step` as
          `u32` and forwards the signed value raw. The leaf is handed the
          document's own two values and speaks only when one of them is below
          zero, so an author ramping downward sees nothing at all.
          See core/formats/effects/ramp-sign-lag.ts for the revision measured
          and the retirement condition. */}
      <RampSignLagDisclosure
        start={presetFp16ToNumber(ramp.start)} step={presetFp16ToNumber(ramp.step)} />

      {/* ═══ WHICH OF TWO COMPLETELY DIFFERENT EFFECTS THIS DOCUMENT MAKES ═══

          ABOVE THE CONTROLS, NOT BELOW THEM, and that is the whole placement
          argument: this sentence changes what every number under it MEANS. The
          same `top`/`lines`/`start`/`step` are a full-screen vertical scroll
          when the bound section's scene has no `v_deform` and a single 16-pixel
          sliver when it has one — so an author who meets it only after scrolling
          past five spinners has already authored the numbers under a guess. The
          `rampDriftSummary` at the foot is the other half of "what does this
          do" and stays there; it is arithmetic about the document, and this is a
          fact about three documents.

          NEUTRAL TONE, DELIBERATELY. Both arms are features — a one-column VSRAM
          ramp is a thing an author may want — so this is not a warning, nothing
          is disabled by it and no value is refused because of it. It is the
          legibility this card was missing, not a new rule.

          THE SPLIT IS `presetLimitsShort()`'s, for its reason: what an author
          must know is painted, and the measured aeon chain, the
          `CAP_PER_COL_VSRAM` conjunct and the relayed column span ride on this
          element's own `title`.

          ⚠ IT READS NO LINE NUMBERS. The card's display-span readout is
          CONTESTED (a real ROM rendered 5..223 where we derive 4..223, at two
          different tops); this sentence is about the HORIZONTAL extent and
          touches neither `rampDisplaySpan` nor the lag constant, so it does not
          move when that question is settled. */}
      {scroll !== null && (
        <Hint under>
          <span title={scroll.full}>{scroll.short}</span>
        </Hint>
      )}

      <Field label="Top" title={RAMP_FIELD_TITLES.top}>
        <NumberField title={RAMP_FIELD_TITLES.top} width={72} value={ramp.top}
          refuse={(n) => rampSpanRefusal(ramp, presetId, 'top', n)}
          onRefusal={say('top')}
          onChange={(n) => run(setRampSpanCommand(library, presetId, 'top', n))} />
      </Field>
      {said('top') !== null && <Hint under tone="warning">{said('top')}</Hint>}

      <Field label="Lines" title={RAMP_FIELD_TITLES.lines}>
        <NumberField title={RAMP_FIELD_TITLES.lines} width={72} value={ramp.lines}
          refuse={(n) => rampSpanRefusal(ramp, presetId, 'lines', n)}
          onRefusal={say('lines')}
          onChange={(n) => run(setRampSpanCommand(library, presetId, 'lines', n))} />
      </Field>
      {said('lines') !== null && <Hint under tone="warning">{said('lines')}</Hint>}

      {/* ═══ THE ONE PLACE THE DISPLAY LAG IS APPLIED ═══

          Two spans, said as two spans: the lines the run WRITES on (the
          document's own numbers, which is what Top above holds) and the lines a
          viewer SEES it on, which is one later. A readout that printed only the
          second would be read back as `top`; one that printed only the first
          would be a screen claim that is one line high and looks right. */}
      <Hint under>
        <span title={RAMP_DISPLAY_LAG_NOTE}>{rampDisplayGloss(ramp)}</span>
      </Hint>

      <Field label="addr" title={RAMP_FIELD_TITLES.addr}>
        <NumberField title={RAMP_FIELD_TITLES.addr} width={72} value={ramp.target.vsram.addr}
          refuse={(n) => rampAddrRefusal(ramp, presetId, n)}
          onRefusal={say('addr')}
          onChange={(n) => run(setRampAddrCommand(library, presetId, n))} />
        {/* The `addr` gloss idiom the band card set (a13) — the integer stays,
            the meaning sits beside it in the control column. It INVENTS
            NOTHING: the contract establishes 0 and 2 and says in as many words
            that an odd address's meaning is not established. */}
        <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 0 }}>
          {rampAddrGloss(ramp.target.vsram.addr)}
        </span>
      </Field>
      {said('addr') !== null && <Hint under tone="warning">{said('addr')}</Hint>}

      {/* ═══ THE TWO fp16 FIELDS, AS DECIMAL PIXELS ═══

          An author thinks in pixels of vertical scroll, not in a `{whole,
          frac256}` pair, so the boxes take a decimal and the CODEC converts.
          `presetFp16ToNumber` / `presetFp16FromNumber` are the one conversion
          and are not re-implemented here: the sign lives on `whole` and applies
          to the whole value, so `{whole: -1, frac256: 128}` is -1.5 and not
          -0.5, and a second opinion about that in a panel would be a whole pixel
          of error with both numbers still inside their declared ranges. */}
      <Field label="Start" title={RAMP_FIELD_TITLES.start}>
        <NumberField title={RAMP_FIELD_TITLES.start} width={88}
          step={RAMP_RATE_UNIT} value={presetFp16ToNumber(ramp.start)}
          refuse={(n) => rampRateRefusal(ramp, presetId, 'start', n)}
          onRefusal={say('start')}
          onChange={(n) => run(setRampRateCommand(library, presetId, 'start', n))} />
        <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 0 }}>
          {rampRateUnits('start')}
        </span>
      </Field>
      {said('start') !== null && <Hint under tone="warning">{said('start')}</Hint>}

      <Field label="Step" title={RAMP_FIELD_TITLES.step}>
        <NumberField title={RAMP_FIELD_TITLES.step} width={88}
          step={RAMP_RATE_UNIT} value={presetFp16ToNumber(ramp.step)}
          refuse={(n) => rampRateRefusal(ramp, presetId, 'step', n)}
          onRefusal={say('step')}
          onChange={(n) => run(setRampRateCommand(library, presetId, 'step', n))} />
        <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 0 }}>
          {rampRateUnits('step')}
        </span>
      </Field>
      {said('step') !== null && <Hint under tone="warning">{said('step')}</Hint>}

      {/* WHAT THE RAMP DOES, in the author's own arithmetic — and the shape that
          makes a curve unthinkable: a first value, a last value and a total is
          the whole vocabulary a linear run has, and there is nowhere in that
          sentence for a per-line list to go. */}
      <Hint under>{rampDriftSummary(ramp)}</Hint>

      <Hint under>
        Writes {RAMP_KEYS.join(', ')} — all five, every time. No field here has a default.
      </Hint>
    </Card>
  );
}

/**
 * THE BASE-SWAP CARD — the mid-frame nametable-base channel's whole surface.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ║ TWO NUMBERS, AND ONE OF THEM IS AN ADDRESS THAT LOOKS LIKE A COUNT      ║
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two fields, because the swap has two keys and the constructor defaults
 * neither. There is no third control here and there cannot be one: `$defs.
 * base_swap` is a CLOSED object of exactly `line` and `target`, so a widget
 * offering anything else would author a key the schema refuses.
 *
 * ⚠ `target` IS A RAW VRAM BYTE ADDRESS AND A BARE NUMBER BOX HIDES THAT.
 * `57344` is `$E000` is `VRAM_PLANE_B` — from the swap line down, Plane A draws
 * PLANE B's picture — and an author reading five digits in a spinner has no way
 * to know they are looking at an address at all. So the hex sits beside the box
 * (`baseSwapTargetGloss`) and the summary under it says both bases and the
 * contract's own name for the address. The panel NAMES NOTHING THE CONTRACT
 * DOES NOT: one address is named in the schema and every other legal one is
 * reported as admitted-and-unnamed, `rampAddrGloss`'s rule.
 *
 * ⚠ THE GRANULE IS REFUSED, NOT ROUNDED. `target` must be a multiple of $2000:
 * VDP reg $02 encodes only the bits above the granule and DROPS the rest
 * SILENTLY, so an unaligned value is not an error anywhere downstream — it is a
 * different address with nothing else visibly wrong. `baseSwapTargetRefusal`
 * names the two legal bases either side (COMPUTED, not typed) and nothing snaps:
 * snapping would point Plane A at another picture without telling the author.
 *
 * ⚠ AND THE TWO ASYMMETRIES WITH `ramp` ARE PAINTED, NOT LEFT TO ANALOGY. No
 * capability gate and not DEBUG-gated — a reader who has just met `ramp`'s
 * CAP_DENSE_TIER assumes both wrongly, and an assumed capability gate is what a
 * control parcel silently builds a disabled button around. The contract's own
 * statement is on the same element's `title` (`presetLimitsShort()`'s split).
 *
 * ⚠ NO min/max ON EITHER SPINNER, aeon's §E.4, exactly as the other two cards:
 * those attributes govern the arrows and `:invalid` and stop no typed value.
 * `refuse` is the only thing that withholds a commit.
 *
 * NO PREVIEW IS DRAWN. Nothing in this editor has ever drawn a raster program
 * and `NO_PREVIEW` says so at the top of the panel; what the swap LOOKS like is
 * quoted from the contract (`BASE_SWAP_WHAT_YOU_SEE`), which is aeon's measured
 * on-screen capture, rather than asserted by an editor that has not seen one.
 */
function BaseSwapCard({ library, presetId, baseSwap, run }: {
  library: EffectsPresetLibrary;
  presetId: string;
  baseSwap: EffectsPresetBaseSwap;
  run: (c: AnyCommand | null) => void;
}): React.ReactElement {
  // WHY THE REFUSAL OUTLIVES THE BLUR — `BandCard`'s reason, unchanged:
  // `NumberField` resyncs its text to the document when focus leaves, so an
  // illegal number visibly snaps back, and if the sentence went with it the
  // author would watch their value vanish with no explanation.
  const [why, setWhy] = React.useState<Record<string, string | null>>({});
  const said = (k: string): string | null => why[k] ?? null;
  const say = (k: string) => (r: string | null): void => setWhy((s) => ({ ...s, [k]: r }));

  return (
    <Card>
      {/* THE TWO ASYMMETRIES, PAINTED. `LimitBlock`'s split: the contract
          sentence carries a capability name and a ROM address and is owed to
          the agent surface; what an author has to know is that nothing here is
          gated and that what they author reaches the release ROM. */}
      <Hint tone="warning">
        <span title={BASE_SWAP_ASYMMETRIES}>{BASE_SWAP_ASYMMETRIES_SHORT}</span>
      </Hint>

      {/* THE LAG DISCLOSURE, FOURTH MOUNT SITE — AND SILENT, for a different
          reason than the ramp's. `base_swap` never opened a lag at all: aeon
          SHIPPED the key before the contract declared it (the opposite
          direction to `ramp`), so `PRESET_KEYS_AWAITING_AEON` never held it.
          IT STAYS MOUNTED ANYWAY, `RampCard`'s reason: a mounted leaf returning
          null IS the retired state, and re-arming is a one-line edit in
          `core/formats/effects/preset-lag.ts` that must reach every card.
          ⚠ CERTIFIED BY AEON, ON A BRANCH, WITH TWO STATED LIMITS — AND STILL
          NOT BY AURORA (updated 2026-09-03; the previous wording said only that
          aeon had measured the generated program in the RELEASE LISTING, which
          is now an understatement). A running machine obeys the GENERATED
          section-6 program, separated from the hand-written `OJZ_BaseSwap` demo
          three independent ways: by ADDRESS (`Raster_Program` after the crossing
          is the generated symbol, not the demo), by PATH (reached through the
          engine's own boundary crossing, not a poke), and BY CONSTRUCTION in the
          release shape (`OJZ_BaseSwap` emits zero bytes there). Footprint lines
          161..223 contiguous, 0..160 byte-identical, in BOTH shapes; and the
          boundary was DERIVED, not fitted — moving the document's line 160 to
          100 moved the measured boundary to 101, and the unmutated tree went
          cleanly red on the same ROM.
          ⚠ THE TWO LIMITS ARE LOAD-BEARING AND MUST TRAVEL WITH THE CLAIM: the
          RELEASE-shape binding is proved STATICALLY, NOT WALKED (the warp
          mailbox is DEBUG-only, so the crossing itself is witnessed only in
          DEBUG), and this is EMULATION, NOT SILICON. It is also on aeon
          `origin/parcel/sec6-baseswap-certify` `7b11f929`, which is NOT an
          ancestor of aeon's master. Nothing in Aurora has measured a ROM. */}
      <PresetLagDisclosure />

      <Field label="Line" title={BASE_SWAP_FIELD_TITLES.line}>
        <NumberField title={BASE_SWAP_FIELD_TITLES.line} width={72} value={baseSwap.line}
          refuse={(n) => baseSwapLineRefusal(baseSwap, presetId, n)}
          onRefusal={say('line')}
          onChange={(n) => run(setBaseSwapLineCommand(library, presetId, n))} />
        <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 0 }}>screen line</span>
      </Field>
      {said('line') !== null && <Hint under tone="warning">{said('line')}</Hint>}

      {/* ═══ THE ADDRESS, SHOWN AS AN ADDRESS ═══

          The `addr` gloss idiom (a13) with a second job: the integer stays in
          the box because the integer is what the file holds, and the hex — plus
          the contract's name for it when the contract has one — sits beside it
          in the control column. Without this the author is typing a decimal
          rendering of a hexadecimal VRAM constant with nothing on screen
          admitting it. */}
      <Field label="Target" title={BASE_SWAP_FIELD_TITLES.target}>
        <NumberField title={BASE_SWAP_FIELD_TITLES.target} width={88} value={baseSwap.target}
          refuse={(n) => baseSwapTargetRefusal(baseSwap, presetId, n)}
          onRefusal={say('target')}
          onChange={(n) => run(setBaseSwapTargetCommand(library, presetId, n))} />
        <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 0 }}>
          {baseSwapTargetGloss(baseSwap.target)}
        </span>
      </Field>
      {said('target') !== null && <Hint under tone="warning">{said('target')}</Hint>}

      {/* WHAT THE SWAP DOES, in the author's own numbers — the arithmetic they
          would otherwise do in their head, with the address in both bases. */}
      <Hint under>{baseSwapSummary(baseSwap)}</Hint>

      {/* WHAT THEY WILL SEE, IN THE CONTRACT'S WORDS. Aurora draws no raster
          program, so this is quoted from the schema (aeon's on-screen capture)
          rather than claimed by an editor that has measured nothing. */}
      <Hint under>
        <span title={BASE_SWAP_TITLE}>{BASE_SWAP_WHAT_YOU_SEE}</span>
      </Hint>

      <Hint under>
        Writes {EFFECTS_PRESET_BASE_SWAP_KEYS.join(', ')} — both, every time.
        No field here has a default.
      </Hint>
    </Card>
  );
}
