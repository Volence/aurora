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
// ═══ THE LIMIT BLOCK IS NOT DECORATION AND IS NOT A TOOLTIP ═══
//
// `PRESET_LIMITS` renders in full, at the top of the section, always visible,
// before any control. That placement is the parcel's whole point: aeon wrote
// their page to stop one sentence ("authoring effects no longer needs a
// programmer"), and a panel that buries the correction in a hover is a panel
// that repeats it. effects-preset-wording.test.ts fails if these strings stop
// reaching the render.
//
// It is also deliberately NOT scolding. The three limits are stated as facts
// with named owners, the headline says what an author CAN do, and every control
// works. The feature is real and worth using; it is the promise that has to be
// accurate.

import React from 'react';
import { T, SectionBody, CollapsibleSection, Select, NumberField, Chip, IconButton } from '../ui';
import { Field, Hint, Card } from './column-layout';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import type { AnyCommand } from '../../../core/editing/commands';
import type {
  EffectsPresetLibrary, EffectsPresetBand, EffectsPreset, EffectsPresetCycleChannel,
  EffectsPresetPalVariant,
} from '../../../core/formats/effects/preset';
import { EFFECTS_PRESET_BAND_KEYS, presetArmFields, presetDefFields } from '../../../core/formats/effects/preset';
import {
  PRESET_HEADLINE, PRESET_LIMITS, NO_PREVIEW,
  BAND_FIELD_TITLES, armFieldTitle, armOptions, armLabel,
  bandArm, bandArmAdvisory,
  presetListEntries, resolveSelectedPreset, presetIdRefusal,
  RASTER_REF_ROW, presetRefOptions, unassignablePresetRef, sectionPresetCommand,
  createPresetCommand, deletePresetCommand,
  addBandCommand, removeBandCommand, lastBandRefusal,
  setBandFieldCommand, setBandArmCommand, setArmFieldCommand,
  parseColours, setColoursCommand, setPresetNameCommand,
  CYCLES_TITLE, CYCLES_STATE_OPTIONS, cyclesState, setCyclesStateCommand,
  addCycleChannelCommand, removeCycleChannelCommand, setCycleFieldCommand, cycleFieldTitle,
  emptyCyclesAdvisory,
  VARIANTS_TITLE, VARIANTS_STATE_OPTIONS, variantsState, setVariantsStateCommand,
  VARIANT_SLOT_OPTIONS, variantSlotState, variantSlotIndices, setVariantSlotStateCommand,
  VARIANT_FIELDS, variantFieldTitle, variantFieldSeed, setVariantFieldCommand,
  CRAM_LINES, variantLineOn, toggleVariantLineCommand,
} from '../../providers/effects-preset';
import { PresetLagDisclosure } from './PresetLagDisclosure';

const EMPTY_LIBRARY: EffectsPresetLibrary = { presets: [], unreadable: [], notices: [] };

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
      {PRESET_LIMITS.map((l) => (
        <div key={l.key} style={{ fontSize: T.tXs, color: T.textBase, lineHeight: 1.45 }}>
          <span style={{ color: T.textHi }}>{l.title}.</span>{' '}{l.body}
        </div>
      ))}
      <div style={{ fontSize: T.tXs, color: T.textLo, lineHeight: 1.45 }}>{NO_PREVIEW}</div>
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

  const [newId, setNewId] = React.useState('');
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [coloursText, setColoursText] = React.useState<Record<number, string>>({});
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
                    <span style={{ opacity: 0.7, flexShrink: 0 }}>
                      {e.bands} band{e.bands === 1 ? '' : 's'}
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
              {unassignablePresetRef(library, section.rasterRef) && (
                <Hint under tone="warning">
                  {unassignablePresetRef(library, section.rasterRef)}
                </Hint>
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
            <IconButton icon={<span>Delete</span>} label={`Delete preset ${selected.id}`}
              onClick={() => run(deletePresetCommand(library, selected.id))} />
          }>
          <SectionBody>
            <Field label="Name" title="name — the writer's display label. Read by nothing and
              dropped when the generator lowers this document; it exists for you, not the build.">
              <input
                value={typeof selected.name === 'string' ? selected.name : ''}
                placeholder={selected.id}
                onChange={(e) => run(setPresetNameCommand(library, selected.id, e.target.value))}
                style={textInput} />
            </Field>

            {selected.bands.map((band, i) => (
              <BandCard key={i} library={library} presetId={selected.id} index={i} band={band}
                run={run}
                lastRefusal={lastBandRefusal(selected)}
                coloursText={coloursText[i]}
                coloursRefusal={coloursRefusal[i] ?? null}
                setColoursText={(t) => setColoursText((s) => ({ ...s, [i]: t }))}
                setColoursRefusal={(r) => setColoursRefusal((s) => ({ ...s, [i]: r }))} />
            ))}

            <Chip onClick={() => run(addBandCommand(library, selected.id))}>Add band</Chip>
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
    </>
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
  return (
    <Card>
      <Field label={`Channel ${index}`}>
        <IconButton icon={<span>Remove</span>} label={`Remove cycle channel ${index}`}
          onClick={() => run(removeCycleChannelCommand(library, presetId, index))} />
      </Field>
      {/* NO min/max ON ANY SPINNER HERE EITHER — the band spinners' rule
          (aeon E.4), for the same reason: the constructor's ensure names the
          bound and the measurement; a bound here would replace it. */}
      {required.map((f) => (
        <Field key={f} label={f} title={cycleFieldTitle(f)}>
          <NumberField title={cycleFieldTitle(f)} width={72} value={Number(values[f])}
            onChange={(n) => run(setCycleFieldCommand(library, presetId, index, f, n))} />
        </Field>
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
               hand-written mask keeps whatever else it carried. Line 0 is
               offered because a file can carry it and the constructor's
               refusal is the constructor's to give. */
            <>
              {CRAM_LINES.map((line) => (
                <Chip key={line} active={variantLineOn(Number(values[f]), line)}
                  title={`CRAM line ${line} — bit ${line} of the mask`}
                  onClick={() => run(toggleVariantLineCommand(library, preset.id, index, line))}>
                  L{line}
                </Chip>
              ))}
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
  setColoursText: (t: string) => void;
  setColoursRefusal: (r: string | null) => void;
}): React.ReactElement {
  const arm = bandArm(band);
  const armAdvice = bandArmAdvisory(band);
  const options = armOptions(arm ?? (Object.keys(band.on)[0] ?? null));

  return (
    <Card>
      <Field label={`Band ${index}`}>
        {/* DISABLED WITH A REASON, NOT HIDDEN. `lastBandRefusal` is the same
            predicate `removeBandCommand` returns null on, read from one place,
            so the greyed button and the sentence under it cannot disagree. */}
        <IconButton icon={<span>Remove</span>} label={`Remove band ${index}`}
          disabled={lastRefusal !== null}
          onClick={() => run(removeBandCommand(library, presetId, index))} />
      </Field>
      {lastRefusal !== null && <Hint under>{lastRefusal}</Hint>}

      <Field label="Top" title={BAND_FIELD_TITLES.top}>
        <NumberField title={BAND_FIELD_TITLES.top} width={72} value={band.top}
          onChange={(n) => run(setBandFieldCommand(library, presetId, index, 'top', n))} />
      </Field>
      <Field label="Bot" title={BAND_FIELD_TITLES.bot}>
        <NumberField title={BAND_FIELD_TITLES.bot} width={72} value={band.bot}
          onChange={(n) => run(setBandFieldCommand(library, presetId, index, 'bot', n))} />
      </Field>
      {/* NO min/max ON EITHER SPINNER, AND THAT IS THE CONTRACT, not an
          oversight. aeon's E.4: "Do not validate ranges, and do not clamp.
          Forward what the author typed" — so the author reads the ENGINE's
          refusal, which carries the measurement behind the rule ("the ON fire
          costs 624 cyc against 488 available"). A clamp here replaces that
          sentence with silence. */}

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

      {arm !== null && presetArmFields(arm)
        .filter((f) => f !== 'colours')
        .map((f) => (
          <Field key={f} label={f} title={armFieldTitle(arm, f)}>
            <NumberField title={armFieldTitle(arm, f)} width={72}
              value={Number((band.on as unknown as Record<string, Record<string, number>>)[arm][f])}
              onChange={(n) => run(setArmFieldCommand(library, presetId, index, f, n))} />
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
                const parsed = parseColours(e.target.value);
                if (!parsed.ok) { setColoursRefusal(parsed.reason); return; }
                setColoursRefusal(null);
                run(setColoursCommand(library, presetId, index, parsed.colours));
              }}
              style={textInput} />
          </Field>
          {coloursRefusal !== null && <Hint under tone="warning">{coloursRefusal}</Hint>}
          {/* The second authored quantity, said where it is authored: the list's
              LENGTH is also the derived restore's word count, so adding a colour
              changes what the band costs and not only how it looks. */}
          <Hint under>
            {band.on.cram.colours.length} colour
            {band.on.cram.colours.length === 1 ? '' : 's'} — also the derived restore's word count.
          </Hint>
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
