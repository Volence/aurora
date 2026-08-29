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
import type { EffectsPresetLibrary, EffectsPresetBand } from '../../../core/formats/effects/preset';
import { EFFECTS_PRESET_BAND_KEYS, presetArmFields } from '../../../core/formats/effects/preset';
import {
  PRESET_HEADLINE, PRESET_LIMITS, NO_PREVIEW,
  BAND_FIELD_TITLES, armFieldTitle, armOptions, armLabel,
  bandArm, bandArmAdvisory,
  presetListEntries, resolveSelectedPreset, presetIdRefusal,
  createPresetCommand, deletePresetCommand,
  addBandCommand, removeBandCommand, lastBandRefusal,
  setBandFieldCommand, setBandArmCommand, setArmFieldCommand,
  parseColours, setColoursCommand, setPresetNameCommand,
} from '../../providers/effects-preset';

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
    </>
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
