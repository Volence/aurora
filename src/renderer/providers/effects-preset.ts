// The raster BAND PRESET surface — derivations, wording and command builders.
//
// The panel (components/effects/BandPresetPanel.tsx) holds no logic and spells
// no rule: every predicate, every sentence and every option list is here, so the
// control and the advisory beside it cannot describe the same rule differently.
// That is the `tableRefParamOptions` idiom (providers/effects-aeon.ts), ruled the
// reference for this parcel.
//
// CONTRACT: empyrean contract/schema/aurora-effects-preset.schema.json, vendored
// and pinned — see core/formats/effects/preset.ts and its provenance sidecar.
// aeon docs/EDITOR_RASTER_PRESETS.md is a WORKED EXAMPLE and says so itself; the
// schema and effects_gen.py win over it, and at this landing they do not disagree.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS FILE OPENS WITH THREE LIMITS INSTEAD OF A FEATURE
// ═══════════════════════════════════════════════════════════════════════════
//
// aeon wrote their page to prevent ONE SENTENCE: "authoring effects no longer
// needs a programmer." Their accurate sentence is "an author can author a raster
// band, and a programmer wires it up in one line." The difference is not
// pedantry — it is the difference between a panel an author trusts and a panel
// that quietly promises the engine cannot deliver.
//
// So the limits below are NOT tooltips. `PRESET_LIMITS` renders as a visible
// block at the top of the section, always, and `effects-preset-wording.test.ts`
// fails if the panel stops reading it. A limit an author has to hover to find is
// a limit the panel does not really carry.
//
// ⚠ AND NOBODY HAS EVER LOOKED AT ONE OF THESE BANDS ON SCREEN. No emulator run,
// no capture, anywhere in the suite. Nothing in this file's wording may imply
// otherwise, and `NO_PREVIEW` says so in as many words rather than leaving the
// absence of a preview to be read as "preview coming soon".

import type {
  EffectsPreset, EffectsPresetBand, EffectsPresetLibrary, EffectsPresetBandOn,
} from '../../core/formats/effects/preset';
import {
  EFFECTS_PRESET_ID_PATTERN, EFFECTS_PRESET_ON_ARMS, EFFECTS_PRESET_SCHEMA,
  presetArmIssue, presetOnArms, presetArmFields, effectsPresetPath,
} from '../../core/formats/effects/preset';
import type { SetEffectsPresetCommand } from '../../core/editing/commands';

// ---------------------------------------------------------------------------
// THE THREE LIMITS — one source, read by the panel and by the wording gate
// ---------------------------------------------------------------------------

/**
 * The accurate headline, in aeon's own words.
 *
 * Quoted rather than paraphrased on purpose: a paraphrase is exactly how "a
 * programmer wires it up in one line" becomes "and then it's in the game".
 */
export const PRESET_HEADLINE =
  'An author can author a raster band. A programmer wires it up in one line.';

export interface PresetLimit {
  /** Stable key, so a test can name the one it is asserting. */
  key: 'unbound' | 'debug_chord' | 'unchecked_visibility';
  /** The short label the block leads with. */
  title: string;
  /** The limit itself. Shown in full — never truncated, never a tooltip. */
  body: string;
}

/**
 * The three limits, in the order an author meets them: what saving does NOT do,
 * then what looking at it costs, then what "it built" does NOT prove.
 *
 * EACH ONE IS A FACT WITH A NAMED OWNER, not a hedge. The point is not to make
 * the panel humble; it is to make it accurate, so an author who reads it can
 * predict what happens next. A scolding panel and a lying panel fail the same
 * author in opposite directions.
 */
export const PRESET_LIMITS: readonly PresetLimit[] = Object.freeze([
  Object.freeze({
    key: 'unbound' as const,
    title: 'Saving does not install the band',
    body:
      'Nothing binds a preset to a section. The per-section key that would carry it ' +
      '(effectsRef) is not implemented in either repo, so a programmer binds this preset ' +
      'by hand in aeon\'s ojz_effects.emp. Until then the document costs ROM whether or ' +
      'not anything installs it.',
  }),
  Object.freeze({
    key: 'debug_chord' as const,
    title: 'Seeing it is a debug chord',
    body:
      'aeon steps a band-demo table with START held + UP to install the next program and ' +
      'START + DOWN to remove it. That table is a hand-typed dc.l list — this document ' +
      'does not add itself to it. aeon\'s build fails loudly when a preset has no row, so ' +
      'the omission is not silent, but the fix is a programmer\'s edit.',
  }),
  Object.freeze({
    key: 'unchecked_visibility' as const,
    title: 'Nothing checks that a band is visible',
    body:
      'A perfectly legal band over an unused palette entry, or one whose colour matches ' +
      'the base it repaints, builds green and shows nothing. No check anywhere in the ' +
      'pipeline catches that — not this panel, not the schema, not the build.',
  }),
]);

/**
 * Why there is no preview here, said out loud.
 *
 * An empty space where a preview would be reads as "not built yet". The truth is
 * stronger and worth stating: nobody in the suite has seen one of these bands
 * render, so there is no ground truth to preview AGAINST. A preview drawn from a
 * model nobody has checked against hardware would be the most confident wrong
 * thing on the screen.
 */
export const NO_PREVIEW =
  'No preview. A raster band has never been looked at on screen anywhere in this suite, ' +
  'so there is nothing to draw a faithful preview from — and an unfaithful one would be ' +
  'worse than none.';

// ---------------------------------------------------------------------------
// Field wording, read out of the schema rather than retyped beside it
// ---------------------------------------------------------------------------

function schemaNode(path: string[]): Record<string, unknown> {
  let node: unknown = EFFECTS_PRESET_SCHEMA;
  for (const seg of path) node = (node as Record<string, unknown>)[seg];
  if (typeof node !== 'object' || node === null) {
    throw new Error(`effects preset schema is missing ${path.join('.')}`);
  }
  return node as Record<string, unknown>;
}

/**
 * A field's `title`: the CONTRACT'S OWN `description`, verbatim.
 *
 * ═══ WHY QUOTED AND NOT WRITTEN ═══
 *
 * The schema deliberately carries no numeric bounds, and aeon's §E.4 is explicit
 * that a writer must not add any: "Do not validate ranges, and do not clamp.
 * Forward what the author typed", so the author reads the ENGINE's refusal with
 * the measurement behind it ("the ON fire costs 624 cyc against 488 available").
 * A clamp — or a range hint of my own invention — replaces that sentence with
 * silence, or worse, with a bound Aurora made up.
 *
 * What the schema DOES carry is a description per field that names the rule and
 * the engine file enforcing it. Showing that text at the point of use is the
 * honest middle: the author learns what the field means and where the refusal
 * will come from, and Aurora asserts nothing it does not own. Because it is read
 * out of the vendored bytes, it cannot drift from the contract.
 */
export function presetFieldTitle(path: string[]): string {
  const d = schemaNode(path).description;
  return typeof d === 'string' ? d : '';
}

/** The `top`/`bot`/`sh` field titles, straight from the schema. */
export const BAND_FIELD_TITLES = Object.freeze({
  top: presetFieldTitle(['$defs', 'band', 'properties', 'top']),
  bot: presetFieldTitle(['$defs', 'band', 'properties', 'bot']),
  sh: presetFieldTitle(['$defs', 'band', 'properties', 'sh']),
  on: presetFieldTitle(['$defs', 'band', 'properties', 'on']),
});

/** One arm field's title, straight from the schema. */
export function armFieldTitle(arm: string, field: string): string {
  return presetFieldTitle(['$defs', arm, 'properties', field]);
}

/** Human label for an ON arm — the schema's key, which is also what aeon lowers. */
export function armLabel(arm: string): string {
  return arm === 'pal_region' ? 'pal_region (staged variant)' : 'cram (raw colours)';
}

// ---------------------------------------------------------------------------
// The ON-arm picker — the `tableRefParamOptions` idiom, applied
// ---------------------------------------------------------------------------

export interface ArmOption {
  value: string;
  label: string;
  /** True when the ENGINE/schema refuses this value HERE, whatever else changes. */
  disabled: boolean;
  title: string;
}

/**
 * What the ON-arm picker offers.
 *
 * ═══ THE STRICTNESS QUESTION, ANSWERED RATHER THAN ASSUMED ═══
 *
 * `tableRefParamOptions`' test is the rule: DISABLE ONLY WHEN NO DOCUMENT
 * CONTENT CAN MAKE THE VALUE LEGAL; when the precondition is another control's
 * value, ADVISE instead of disabling.
 *
 * Both arms pass that test in the ACCEPTING direction — `cram` and `pal_region`
 * are each legal in every document — so NOTHING here is disabled, and that is
 * the answer, not an omission. There is no third value to grey out: `vsram` is
 * not an arm the schema declares, so it is not an option to disable, it is a
 * key that does not exist. Offering it disabled would advertise a capability the
 * contract does not have.
 *
 * WHAT IS STILL RENDERED, THOUGH, is an arm a FILE already carries that the
 * schema does not declare. A `<select>` whose current value has no option
 * silently shows a DIFFERENT one — the quiet lie `unassignableSceneRef` and
 * `leftColumnMaskOptions` both exist to stop — and here it would be worse than
 * usual: the author would see `cram` and the file would hold something else. So
 * an unknown arm appears, disabled, carrying why.
 */
export function armOptions(current: string | null): ArmOption[] {
  const options: ArmOption[] = EFFECTS_PRESET_ON_ARMS.map((arm) => ({
    value: arm,
    label: armLabel(arm),
    disabled: false,
    title: presetFieldTitle(['$defs', arm]) || armLabel(arm),
  }));
  if (current !== null && !EFFECTS_PRESET_ON_ARMS.includes(current)) {
    options.push({
      value: current,
      label: current,
      disabled: true,
      title:
        `the build refuses it: "${current}" is not an ON arm. The arms are ` +
        `${EFFECTS_PRESET_ON_ARMS.join(' and ')}.`,
    });
  }
  return options;
}

/**
 * The arm rule as an ADVISORY sentence for one band, or null.
 *
 * THE SAME DERIVATION THE CODEC REFUSES ON — `presetArmIssue`, imported, not
 * re-implemented. That is the brief's rule: the predicate and its sentence come
 * from one source both the control and the advisory read. If this file spelled
 * its own comparison, the panel could say a band is fine while the writer path
 * refuses it, which is the failure mode both halves exist to prevent.
 */
export function bandArmAdvisory(band: EffectsPresetBand): string | null {
  return presetArmIssue(band.on);
}

/** Which arm a band currently carries, or null when it carries none or many. */
export function bandArm(band: EffectsPresetBand): string | null {
  const arms = presetOnArms(band.on);
  return arms.length === 1 ? arms[0] : null;
}

// ---------------------------------------------------------------------------
// Preset list + selection
// ---------------------------------------------------------------------------

export interface PresetListEntry {
  id: string;
  /** `name` when the document has a string one, else the id — never an empty row. */
  label: string;
  bands: number;
}

export function presetListEntries(library: EffectsPresetLibrary): PresetListEntry[] {
  return library.presets.map((p) => ({
    id: p.id,
    label: (typeof p.name === 'string' && p.name !== '') ? p.name : p.id,
    bands: p.bands.length,
  }));
}

/**
 * The preset a selected id resolves to — the id if it still exists, else the
 * first preset, else nothing.
 *
 * The fallback is load-bearing for `resolveSelectedScene`'s reason: undoing a
 * create, or opening a different project, leaves a stale id in the selection,
 * and without it the whole editor below would vanish rather than land on the
 * preset that IS there.
 */
export function resolveSelectedPreset(
  library: EffectsPresetLibrary, selectedId: string | null,
): EffectsPreset | null {
  return library.presets.find((p) => p.id === selectedId) ?? library.presets[0] ?? null;
}

/**
 * Why this id cannot be created, or null.
 *
 * ONE WORDING for the rule, so the panel and any later agent tool cannot
 * describe it differently — `sceneIdRefusal`'s reason, and its shape.
 *
 * THE `unreadable` CHECK IS NOT DECORATIVE. Creating a preset whose id collides
 * with a file that exists and will not parse would, at save, write over that
 * file — destroying the author's broken document instead of letting them fix it.
 * The save plan throws as a backstop; this is the user-facing path that means
 * the backstop is never reached.
 */
export function presetIdRefusal(id: string, library: EffectsPresetLibrary): string | null {
  if (id === '') return 'Enter an id.';
  if (!EFFECTS_PRESET_ID_PATTERN.test(id)) {
    return `"${id}" is not a legal preset id. It must match ` +
      `${EFFECTS_PRESET_ID_PATTERN.source} — lower case, starting with a letter, up to 32 ` +
      'characters. The id becomes part of a generated .emp symbol, which is why hyphens ' +
      'and capitals are out.';
  }
  if (library.presets.some((p) => p.id === id)) {
    return `"${id}" is already a preset in this project.`;
  }
  const taken = library.unreadable.find((u) => u.path.endsWith(`/${id}.json`));
  if (taken) {
    return `"${id}" is taken by ${taken.path}, which exists but could not be read. Saving ` +
      'over it would destroy it — fix or remove that file by hand, or pick another id.';
  }
  return null;
}

/** Where this preset will be written, for the panel to show at the point of saving. */
export function presetPathFor(dataRoot: string, id: string): string {
  return effectsPresetPath(dataRoot, id);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function clonePreset(p: EffectsPreset): EffectsPreset {
  return structuredClone(p);
}

function presetCommand(
  presetId: string, description: string,
  oldPreset: EffectsPreset | null, newPreset: EffectsPreset | null,
): SetEffectsPresetCommand {
  return {
    type: 'set-effects-preset',
    description,
    // -1: act-ambient. See the command's docblock.
    sectionIndex: -1,
    presetId,
    oldPreset: oldPreset && clonePreset(oldPreset),
    newPreset: newPreset && clonePreset(newPreset),
  };
}

/**
 * A brand-new band.
 *
 * ALL FOUR FIELDS WRITTEN, `sh` INCLUDED, because there is no default to fall
 * back on in the JSON or in the engine — aeon's §E.3. The numbers are a starting
 * point an author will replace, NOT a validated or "safe" band: Aurora does not
 * know what is safe here, and a seed that pretended to would be the clamp §E.4
 * forbids wearing a different hat.
 *
 * `top`/`bot` seed 16 apart rather than 1, so a fresh band is not born tripping
 * the engine's height rule for a reason the author had no hand in. `addr` seeds
 * on palette line 2 rather than 0, because line 0 is the character's line and
 * both `stream_cram` and the derived `pal_restore` refuse it — a seed that
 * cannot build is a worse first impression than one that can.
 */
export function newBand(): EffectsPresetBand {
  return { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } };
}

/** A new, empty-but-legal preset. `bands` has one member: the schema refuses zero. */
export function newPreset(id: string, name?: string): EffectsPreset {
  const preset: EffectsPreset = { schema: 1, id, bands: [newBand()] };
  if (name !== undefined && name !== '') preset.name = name;
  return preset;
}

export type CreatePresetResult =
  | { ok: true; command: SetEffectsPresetCommand }
  | { ok: false; reason: string };

export function createPresetCommand(
  library: EffectsPresetLibrary, id: string, name?: string,
): CreatePresetResult {
  const refusal = presetIdRefusal(id, library);
  if (refusal) return { ok: false, reason: refusal };
  return { ok: true, command: presetCommand(id, `New preset ${id}`, null, newPreset(id, name)) };
}

/** Delete a preset. Null when there is no such preset to delete. */
export function deletePresetCommand(
  library: EffectsPresetLibrary, id: string,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  if (!existing) return null;
  return presetCommand(id, `Delete preset ${id}`, existing, null);
}

/**
 * Put a WHOLE preset document at `id`, creating or replacing.
 *
 * THE AGENT SURFACE'S SHAPE rather than the panel's, and the one operation this
 * file did not already carry. Every function above takes a mutator over the
 * preset that is already in the library, because a control only ever changes a
 * field of a document the author is looking at; `set_effects_preset` hands over a
 * COMPLETE document instead, for the reason `editPresetCommand` gives about
 * itself — a field-patch API would need the field enumeration this format is
 * deliberately handled without.
 *
 * Null when the document is identical to what is already there, so a re-send is
 * not an undo step. That is the same JSON comparison `editPresetCommand` makes,
 * and for the same reason: it is honest about what "changed" means (any key at
 * any depth, including ones no control shows).
 *
 * It does NOT check the id rules — `replaceSceneCommand`'s reason, unchanged: a
 * REPLACE must not be refused for an id that is obviously already in use, and a
 * CREATE's extra question (is this id taken by an UNREADABLE file?) belongs to
 * the caller, which is the only party that knows which of the two it is doing.
 * `presetIdRefusal` is that question, and the caller asks it.
 */
export function replacePresetCommand(
  library: EffectsPresetLibrary, id: string, preset: EffectsPreset,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id) ?? null;
  if (existing && JSON.stringify(existing) === JSON.stringify(preset)) return null;
  return presetCommand(id, existing ? `Replace preset ${id}` : `New preset ${id}`, existing, preset);
}

/**
 * THE ONE EDIT PATH. Every control on this surface goes through it: clone the
 * preset, let `mutate` change whatever it likes, emit a whole-document swap — or
 * null when nothing actually moved.
 *
 * A mutator over a clone rather than a `{field, value}` delta, for the reason
 * the codec states about itself: a delta API needs a field enumeration, and the
 * whole point of this format's handling is that no such list exists. The no-op
 * check is a JSON comparison of the WHOLE document, which is honest about what
 * "changed" means (any key at any depth, including ones no control shows) and
 * cheap — a preset is a handful of bands of scalars.
 *
 * The no-op guard is what stops a `<select>` re-selecting the value it already
 * has from pushing an empty undo entry.
 */
export function editPresetCommand(
  library: EffectsPresetLibrary, id: string, description: string,
  mutate: (preset: EffectsPreset) => void,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  if (!existing) return null;
  const next = clonePreset(existing);
  mutate(next);
  if (JSON.stringify(next) === JSON.stringify(existing)) return null;
  return presetCommand(id, description, existing, next);
}

export function addBandCommand(
  library: EffectsPresetLibrary, id: string,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Add band to ${id}`, (p) => { p.bands.push(newBand()); });
}

/**
 * Remove one band.
 *
 * REFUSES THE LAST ONE, and this is the one refusal on the surface. `bands` has
 * `minItems: 1`, so a zero-band document does not validate and could not be
 * written — the schema's own reason being that "a document that emits a
 * zero-band program is a document that should not exist". Returning null here
 * means the panel disables the button; `lastBandRefusal` is the sentence beside
 * it, so the disabled control and its reason come from the same place.
 */
export function removeBandCommand(
  library: EffectsPresetLibrary, id: string, index: number,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  if (!existing || index < 0 || index >= existing.bands.length) return null;
  if (existing.bands.length <= 1) return null;
  return editPresetCommand(library, id, `Remove band ${index} from ${id}`,
    (p) => { p.bands.splice(index, 1); });
}

/**
 * Why the remove button is disabled, or null when it is not.
 *
 * THE SAME PREDICATE `removeBandCommand` REFUSES ON — `bands.length <= 1` lives
 * here once and both read it, rather than the component re-comparing a length it
 * happens to know. That is the brief's rule, and it is the difference between a
 * disabled button with a reason and a disabled button with a coincidence.
 */
export function lastBandRefusal(preset: EffectsPreset): string | null {
  if (preset.bands.length > 1) return null;
  return 'A preset must have at least one band — the schema refuses an empty bands list, ' +
    'because a document that emits a zero-band program is a document that should not exist. ' +
    'Delete the preset instead.';
}

/** Set `top`, `bot` or `sh` on one band. */
export function setBandFieldCommand<K extends 'top' | 'bot' | 'sh'>(
  library: EffectsPresetLibrary, id: string, index: number, field: K, value: EffectsPresetBand[K],
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} ${field}`, (p) => {
    const band = p.bands[index];
    if (!band) return;
    band[field] = value;
  });
}

/**
 * Switch a band's ON arm.
 *
 * REPLACES the arm rather than merging, because exactly one arm may be present
 * and the fields do not correspond: `cram` carries a colour LIST, `pal_region` a
 * staging slot and a count. Keeping the old arm's keys around "in case they come
 * back" would author a two-arm band the moment anything read the object.
 *
 * The author's old arm body is NOT lost to them — the swap is one undo step.
 */
export function setBandArmCommand(
  library: EffectsPresetLibrary, id: string, index: number, arm: string,
): SetEffectsPresetCommand | null {
  if (!EFFECTS_PRESET_ON_ARMS.includes(arm)) return null;
  return editPresetCommand(library, id, `Band ${index} ON arm`, (p) => {
    const band = p.bands[index];
    if (!band) return;
    if (bandArm(band) === arm) return;
    band.on = (arm === 'cram'
      ? { cram: { addr: 74, colours: [0] } }
      : { pal_region: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 1 } }
    ) as EffectsPresetBandOn;
  });
}

/** Set one integer field inside whichever arm the band carries. */
export function setArmFieldCommand(
  library: EffectsPresetLibrary, id: string, index: number, field: string, value: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} ${field}`, (p) => {
    const band = p.bands[index];
    if (!band) return;
    const arm = bandArm(band);
    if (arm === null) return;
    if (!presetArmFields(arm).includes(field)) return;
    const body = (band.on as unknown as Record<string, Record<string, unknown>>)[arm];
    body[field] = value;
  });
}

/**
 * Set the `cram` arm's colour list from the author's text.
 *
 * ═══ WHY A TEXT FIELD AND NOT N SPINNERS ═══
 *
 * `colours` is variable-length and its LENGTH is a second authored quantity — it
 * is also the derived restore's word count, so adding a colour changes what the
 * band costs, not only what it looks like. A row of spinners hides that; a list
 * the author edits as a list does not.
 *
 * PARSING IS SHAPE, NOT VALUE. A token that is not an integer means the panel
 * cannot build a document at all, so it refuses with `coloursRefusal` and writes
 * nothing. It does NOT range-check the integers it does parse — that is §E.4's
 * line, and the engine's own refusal carries the burst ceiling behind it.
 */
export function parseColours(text: string): { ok: true; colours: number[] } | { ok: false; reason: string } {
  const tokens = text.split(/[\s,]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return {
      ok: false,
      reason: 'Enter at least one colour word. An empty list is refused by the engine — the ' +
        'ON op would write nothing and the derived restore would have no span.',
    };
  }
  const colours: number[] = [];
  for (const t of tokens) {
    const n = /^0[xX][0-9a-fA-F]+$/.test(t) ? Number.parseInt(t, 16) : Number(t);
    if (!Number.isInteger(n)) {
      return { ok: false, reason: `"${t}" is not an integer. Colours are CRAM words — decimal, ` +
        'or 0x-prefixed hex.' };
    }
    colours.push(n);
  }
  return { ok: true, colours };
}

export function setColoursCommand(
  library: EffectsPresetLibrary, id: string, index: number, colours: number[],
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} colours`, (p) => {
    const band = p.bands[index];
    if (!band || !('cram' in band.on)) return;
    band.on.cram.colours = colours.slice();
  });
}

/** Set the writer-owned display label, or drop it when the author clears it. */
export function setPresetNameCommand(
  library: EffectsPresetLibrary, id: string, name: string,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} name`, (p) => {
    if (name === '') delete p.name;
    else p.name = name;
  });
}
