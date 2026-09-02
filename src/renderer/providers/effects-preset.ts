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
// ⚠ AND NOTHING IN THIS EDITOR HAS EVER DRAWN ONE OF THESE BANDS. Until aeon
// `4a4d3474` (2026-08-30) nobody in the suite had looked at one on screen at
// all; that commit's `docs/research/reference_captures/2026-08-30-sec5-band/`
// is the first and only measured frame — section 5, one camera position, in
// aeon's emulator, in aeon's tree. Nothing in this file's wording may imply a
// band is visible HERE, and `NO_PREVIEW` says so in as many words — citing
// that one frame, and saying no preview is built against it — rather than
// leaving the absence of a preview to be read as "preview coming soon".

import type {
  EffectsPreset, EffectsPresetBand, EffectsPresetLibrary, EffectsPresetBandOn,
  EffectsPresetCycleChannel,
} from '../../core/formats/effects/preset';
import {
  EFFECTS_PRESET_ID_PATTERN, EFFECTS_PRESET_ON_ARMS, EFFECTS_PRESET_SCHEMA,
  presetArmIssue, presetOnArms, presetArmFields, presetDefFields, effectsPresetPath,
} from '../../core/formats/effects/preset';
import type { SetEffectsPresetCommand, SetSectionRasterCommand } from '../../core/editing/commands';
// THE BINDING LIMIT IS NOT RE-TYPED HERE. `PRESET_LIMITS.unbound` below is the
// AUTHOR-FACING copy of a sentence the agent replies and the published tool
// descriptions also carry, and main/ cannot import renderer/ — so the words live
// in core/ and every audience quotes them. See raster-binding.ts's own header.
import { RASTER_SECTION_BINDING_LIMIT } from '../../core/formats/raster-binding';
// THE FIRE BOUND IS NOT RE-TYPED HERE. A band's two edges and a vsplit's fire
// are the same engine `ensure` — see the timeline block at the foot of this
// file — so the constant is imported from the one place that declares it.
import { EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX } from './effects-aeon';
// THE OPTION SHAPE IS THE SCENE SELECT'S, not a second one. `presetRefOptions`
// below is `sceneRefOptions`' mirror and feeds the same `<Select>`; giving it a
// private `{value,label}` twin would let the two per-section pickers drift in
// shape as well as in wording.
import type { FactorOption } from './effects-aeon';

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
    // ⚠ THE KEY WAS RENAMED BY RULING, not by preference: empyrean
    // docs/AURORA_EFFECTS_SCHEMA.md §3.1 (adjudicated 2026-08-30) adopted
    // `rasterRef` for the per-section preset binding and left `effectsRef`
    // reserved and unspent, because a preset document supplies only the raster
    // channel of aeon's eight-channel EffectsPreset. This limit must not go
    // back to naming `effectsRef` — an author who went looking for that key
    // would find nothing.
    //
    // AND THE STATUS HAS CHANGED SIX TIMES NOW. First the key appeared in the
    // sidecar and Aurora began round-tripping it, so "not implemented in either
    // repo" became a lie. Then `assign_section_preset` landed, so "nothing binds
    // a preset to a section" became one too — a WRITER exists, it is an agent
    // tool. Then aeon `4aa2abc0` landed the READER, so "no aeon consumer reads
    // a rasterRef" became the third lie — retired on the schedule the sentence's
    // own dated expiry set. Then ROADMAP row 93's remaining half landed the
    // per-section raster select in the section BELOW this block, so "no control
    // in the band-preset panel writes a rasterRef" became the fourth — and this
    // limit is now read by an author standing directly above the control it is
    // about, which is the placement the block was built for. Then aeon
    // `9cdf32d8` threaded the chooser FOR ONE SECTION, so "nothing calls it"
    // became the fifth lie. Then aeon `c9a462be` committed section 5's sidecar
    // carrying `ojz_sec5_showcase` — the two files this repo's own handover
    // test authored through the writer below — so "no sidecar carries the key,
    // the seam gate's arm is vacuous, no section has been exercised end to end"
    // became the sixth, retired against their `6e2495a5`. What that sixth did
    // NOT change at the time: the band had not been recorded as seen (aeon's
    // own commit said so), and this viewport still composites nothing. Then
    // aeon `4a4d3474` committed the measurement — `docs/research/
    // reference_captures/2026-08-30-sec5-band/`, CRAM line 2 entry 8 `$0EA4`
    // in-band, `$0000` outside and on the control, on their emulator — so
    // "nothing has been seen on screen" became the SEVENTH, retired against
    // their `e6405428`. The sentence cites that capture, says where it lives,
    // and says nothing of it is visible here. What the seventh did NOT change:
    // this viewport still composites nothing, and `NO_PREVIEW` below still
    // said a band had never been looked at in this suite — which was
    // NO_PREVIEW's own expiry to retire, not this limit's, and was TAGGED in
    // `core/formats/raster-binding.ts`'s header rather than reworded here.
    // (Retired 2026-08-30, O64: `NO_PREVIEW` now cites the same capture as
    // the ONE frame a preview could be checked against, and still draws none.)
    //
    // ⚠ AN EIGHTH FACT WAS ADDED 2026-08-30 (O62), NOT A CORRECTION: the seven
    // above are about how far one binding travels; this one is about the TREE
    // the select leaves behind. At aeon `027ec162` three content tests in
    // their FAST=0 build accept exactly one bound set — section 5 →
    // `ojz_sec5_showcase` — so the empty option on section 5 (the very
    // control this block renders above) produces a tree aeon's canonical
    // build refuses by name, and so does a pick on any other section. The
    // sentence says so, says FAST=1 builds it, and says nothing here prevents
    // the write. The option is NOT disabled and there is NO confirm: the
    // STANDING REFUSAL in raster-binding.ts — a gate built from one act's
    // content snapshot would be wrong for the next act and read as authority.
    // This block is the instrument, which is why it renders whether or not
    // the active section is bound (band-preset-wording pins that structure).
    //
    // ⚠ AND THE FIFTH IS A DIFFERENT SHAPE FROM THE OTHER FOUR. Each of those
    // replaced one universal claim with another. This one cannot: aeon's step 5
    // MANUFACTURED a non-uniformity that did not exist before it — section 5's
    // `preset()` calls `ojz_act1_sec_raster(sec: 5, …)` and no other section's
    // does — so any single sentence about "a bound section" is now wrong for
    // half the sections it describes. What survives is a CASE SPLIT, and it
    // names the NUMBER 5 on aeon's own drafting rule: a sentence naming the
    // number expires visibly when the number moves, while "a bound section
    // plays" would go wrong silently the first time someone binds section 6.
    //
    // The third case is why the limit still exists: binding any other section
    // writes a key nothing consumes. That is no longer SILENT — aeon's
    // `tools/effects_seam_gate.py` fails a full build naming the section — but
    // the refusal is aeon's, not this editor's, and `FAST=1` skips it.
    //
    // ⚠ NO LONGER THIS FILE'S OWN WORDS, and that is the fix rather than a
    // regression. The same sentence is now owed to three audiences — this
    // panel, `assign_section_preset`'s reply, and the published tool
    // descriptions in main/ — and `bg-binding.ts` learned the hard way that two
    // hand-written near-identical sentences is how a limit ends up stated two
    // different ways. It lives in core/formats/raster-binding.ts because main
    // must not import the renderer; the author still reads it here, in full, in
    // the block that never truncates.
    body: RASTER_SECTION_BINDING_LIMIT,
  }),
  Object.freeze({
    key: 'debug_chord' as const,
    title: 'Seeing it is a debug chord',
    // ⚠ THE REACHABILITY HALF WAS NARROWED AT aeon `4aa2abc0`, and the old
    // wording ("fails loudly when a preset has NO ROW") is now too strong: a
    // section binding counts as a second installer, so the check fires only when
    // a document has neither. Corrected here rather than left, because an author
    // who binds a preset and is then told their build will fail for a missing
    // row would go add one they do not need.
    body:
      'aeon steps a band-demo table with START held + UP to install the next program and ' +
      'START + DOWN to remove it. That table is a hand-typed dc.l list — this document ' +
      'does not add itself to it. aeon\'s build fails loudly when a preset document is ' +
      'reached by neither a table row nor a section binding (aeon 4aa2abc0), so the ' +
      'omission is not silent, but adding the row is a programmer\'s edit.',
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
 * stronger and worth stating. When this was written nobody in the suite had seen
 * one of these bands render, so there was no ground truth to preview AGAINST at
 * all. Since aeon `4a4d3474` (2026-08-30) there is exactly ONE: the README in
 * their `docs/research/reference_captures/2026-08-30-sec5-band/` records
 * "VERDICT: BAND SEEN" — CRAM line 2 entry 8 `$0EA4` at screen lines 40/56/72
 * and `$0000` at 8/20/96/150 in one frame, two private headless `oracle-aether`
 * instances byte-identical, `$0000` everywhere on a control ROM with the
 * sidecar's `rasterRef` null — and lists what it does NOT establish: the exact
 * transition lines, other CRAM entries, other camera positions, a walked
 * crossing, motion, hardware. One section, one camera position, one frame,
 * measured in aeon's emulator and committed to aeon's tree.
 *
 * What that does not change: this editor draws no band (the viewport composites
 * no `rasterRef`; nothing in Aurora has sampled CRAM), so a preview here would
 * still be a guess about a frame this editor has never produced — it could at
 * most be CHECKED against that one frame, and it is not built. A preview drawn
 * from a model checked against nothing would be the most confident wrong thing
 * on the screen; one checked against a single frame would be nearly as
 * confident and wrong everywhere that frame does not reach.
 *
 * ⚠ THIS IS NOT `RASTER_SECTION_BINDING_LIMIT`, and the two must not converge.
 * That sentence owns where a BINDING stops (and cites the same capture for
 * that); this one owns why there is nothing to preview AGAINST. It is kept
 * shorter than that limit, and a test row measures it.
 *
 * EXPIRES (2026-08-30, in the sentence itself): the captures directory leaving
 * aeon's tree or its README no longer saying what is quoted here, or a second
 * measured section or camera position — owner aeon's lane; this editor drawing
 * a band — owner Aurora. Evaluate, do not obey: re-read that README at a
 * revision (`git show origin/master:docs/research/reference_captures/
 * 2026-08-30-sec5-band/README.md`), never by path into their working tree.
 */
export const NO_PREVIEW =
  'No preview. This editor draws no band: the viewport composites no rasterRef, and ' +
  'nothing in Aurora has sampled CRAM, so there is nothing to draw a faithful preview ' +
  'from — and an unfaithful one would be worse than none. There is now ONE measured ' +
  'frame, in aeon\'s tree and not in this one: aeon 4a4d3474 (2026-08-30), ' +
  'docs/research/reference_captures/2026-08-30-sec5-band/, section 5 at one camera ' +
  'position in aeon\'s emulator, CRAM line 2 entry 8 reading $0EA4 inside the band and ' +
  '$0000 outside it and on the control. A preview here could at most be checked against ' +
  'that one frame; none is built. Expires (2026-08-30): when that directory leaves ' +
  'aeon\'s tree or its README stops saying so, or a second section or camera position is ' +
  'measured — aeon\'s lane; or when this editor draws a band — Aurora\'s.';

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

// ---------------------------------------------------------------------------
// The per-section raster binding — the select's options, label and advisory
// ---------------------------------------------------------------------------

/**
 * The row's label and its control title.
 *
 * IN THE PROVIDER, NOT THE PANEL, on this file's own rule — but note what is
 * NOT here. `title` defines the two kinds of value the control offers; it does
 * NOT restate where the binding stops. That sentence is
 * `RASTER_SECTION_BINDING_LIMIT`, rendered in full by `LimitBlock` at the top of
 * the very section this control sits in, and a second near-identical wording
 * beside the select is precisely the drift core/formats/raster-binding.ts exists
 * to prevent (bg-binding.ts learned it the expensive way). If this control ever
 * seems to need something the constant does not say, that is a change to the
 * constant, not a new sentence here.
 *
 * `unbound` is the empty option's label. `sceneRef`'s empty option reads "Act
 * default" because a section with no scene falls back to the act's own; a
 * section with no `rasterRef` falls back to nothing of Aurora's — aeon's
 * `preset()` keeps the `raster:` label a programmer typed, which is what
 * core/model/s4-types.ts calls "this section keeps its hand-authored raster
 * channel". The label names that state rather than calling it "none", because
 * "none" would read as "no raster program at all", which is a different and
 * false thing.
 */
export const RASTER_REF_ROW = Object.freeze({
  unbound: 'Hand-authored raster',
  title: 'Which raster band preset this section uses (rasterRef). '
    + "Hand-authored raster means the section keeps the raster: label aeon's effects source "
    + 'already names for it.',
});

/**
 * The `rasterRef` dropdown for one section: the unbound option plus every
 * LOADED preset.
 *
 * `sceneRefOptions`' EXACT MIRROR (providers/effects-aeon.ts), including the
 * omission: unreadable preset files are deliberately absent, because binding a
 * section to a file Aurora could not read writes a ref aeon's generator then
 * refuses BY NAME at build time. They are not silent — the load already raised a
 * notice per file, the panel counts them, and `unassignablePresetRef` below
 * reports a section already pointing at one.
 */
export function presetRefOptions(library: EffectsPresetLibrary): FactorOption[] {
  return [
    { value: '', label: RASTER_REF_ROW.unbound },
    ...presetListEntries(library).map((e) => ({ value: e.id, label: e.label })),
  ];
}

/**
 * A warning for a section whose `rasterRef` names nothing this project can
 * offer, or null.
 *
 * REACHABLE WITHOUT ANY BUG, and `unassignableSceneRef`'s reasons hold here
 * unchanged: the sidecar is hand-editable, and a preset can be deleted, renamed,
 * or left sitting in `unreadable` while a section still names it. A plain
 * `<select>` shows an unknown value by falling back to its first option, so
 * saying nothing would draw this section as "Hand-authored raster" — a quiet lie
 * about what is in the file.
 *
 * ⚠ AND HERE IT IS A LIE WITH A BUILD ATTACHED, which is the one thing this
 * differs from the scene case in. aeon's `tools/effects_gen.py` refuses an id
 * naming no preset document BY NAME and lists the ids it does know
 * (core/formats/raster-binding.ts, verified at aeon `6e2495a5`), so the author
 * who is not told here meets it as a build failure instead. There is a SECOND
 * build failure behind this one now, and it is the reason the advisory is not
 * the only safety net: `tools/effects_seam_gate.py` refuses a build where a
 * section's `rasterRef` names a perfectly good preset but that section's
 * `preset()` does not thread the chooser — which at `6e2495a5` is every section
 * except 5 (and section 5 IS bound there, since aeon `c9a462be`, so the arm has
 * a live subject it passes rather than an empty set it prints).
 */
export function unassignablePresetRef(
  library: EffectsPresetLibrary, rasterRef: string | null,
): string | null {
  if (rasterRef === null) return null;
  if (library.presets.some((p) => p.id === rasterRef)) return null;
  if (library.unreadable.some((u) => u.path.endsWith(`/${rasterRef}.json`))) {
    return `Assigned to "${rasterRef}", whose file exists but could not be read.`;
  }
  return `Assigned to "${rasterRef}", which is not a raster preset in this project.`;
}

/**
 * Assign which raster PRESET a section uses — `Section.rasterRef`.
 *
 * `sectionSceneCommand`'s EXACT MIRROR (providers/effects-aeon.ts), deliberately
 * down to the `''` sentinel: a `<select>`'s empty option and an agent's explicit
 * `null` are the SAME STATE for this key, exactly as for `sceneRef`, so both
 * arrive here as "no binding" and neither can produce a `rasterRef: ""` the
 * sidecar would then read back as null and erase. Unbinding is expressible, and
 * it is expressible the same way from both doors.
 *
 * Null when the ref is already what the caller asked for, so a re-send burns no
 * undo slot — the no-op rule the whole surface shares.
 *
 * IT DOES NOT VALIDATE THE ID, and that is the same division of labour
 * `replacePresetCommand` states: the caller knows the library and asks
 * `presetIdRefusal`-shaped questions itself. `assign_section_preset` refuses an
 * id that is not a READABLE preset before it gets here, because a ref the build
 * cannot resolve is worse than no ref.
 *
 * ⚠ THIS WRITES `rasterRef`, NEVER `effectsRef` — see the command type's
 * docblock and core/formats/section-meta.ts for the ruling. And see
 * `RASTER_SECTION_BINDING_LIMIT` for where the binding stops, which is now a
 * question of WHICH SECTION: aeon's generator reads the key and emits the
 * chooser, and at `6e2495a5` exactly one `preset()` in their `ojz_effects.emp`
 * threads it — `OJZ_Preset_Sec5`, on `sec: 5`, whose sidecar carries
 * `ojz_sec5_showcase` since their `c9a462be`. This function does not know or
 * care which section it is writing (nor should it: the limit is the surface
 * that carries that, said once), but a caller reading its result as "bound"
 * should read the limit for what "bound" buys on the section they picked.
 *
 * TWO CALLERS NOW, AND THAT IS THE POINT OF THE FUNCTION. `assign_section_preset`
 * (renderer/agent/agent-handler.ts) and the per-section raster select in
 * `BandPresetPanel` — ROADMAP row 93's remaining half, landed. The select MUST
 * come through here and MUST NOT assign `rasterRef`: this function owns the `''`
 * sentinel, so a select's empty option and an agent's explicit `null` are the
 * same unbind, and it owns the no-op rule, so neither door can disagree about
 * what counts as a change worth an undo step.
 */
export function sectionPresetCommand(
  sectionIndex: number, currentRef: string | null, value: string,
): SetSectionRasterCommand | null {
  const newRef = value === '' ? null : value;
  if (newRef === currentRef) return null;
  return {
    type: 'set-section-raster',
    description: `Section ${sectionIndex} raster preset`,
    sectionIndex,
    oldRef: currentRef,
    newRef,
  };
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

// ═══════════════════════════════════════════════════════════════════════════
// THE OTHER TWO CHANNELS — `cycles` AND `variants` (ROADMAP §5.1 row 97, 2nd half)
// ═══════════════════════════════════════════════════════════════════════════
//
// Both keys are OPTIONAL at the root and both encode THREE STATES the schema
// keeps distinct on purpose (§7.2, rulings Q2 and Q5). The controls below author
// exactly those states and never fold one into another:
//
//   cycles    ABSENT  = keep the section's hand-authored cycle (the key is not
//                       written);  null = cycling OFF;  array = the script.
//   variants  ABSENT  = every slot keeps its hand value;  present = an array
//                       whose index IS the slot — a slot the array does not
//                       reach keeps its hand value, null at an index CLEARS it,
//                       an object authors it.
//
// So `[]` is a real document for both keys and is NEVER rewritten as null or
// as absence: for `cycles` it is the generator's refusal (the schema says so, and
// `emptyCyclesAdvisory` quotes it); for `variants` it reaches no slot. A control
// that "tidied" `[]` into null on first touch would have authored "cycling OFF"
// on the author's behalf — the exact defect the brief names.
//
// NO BOUNDS AND NO CLAMPING, as for the band spinners (aeon §E.4): every value
// is forwarded verbatim, and `variants[].lines` stays the engine's integer
// bitmask on the wire (ruling Q4) even where the panel offers checkboxes.
//
// NOTHING BELOW IS CONSUMED BY THE ENGINE YET — see core/formats/effects/
// preset-lag.ts, whose sentence the panel renders above these controls.

export type CyclesState = 'absent' | 'off' | 'authored';

/** Which of the three spellings the document carries for `cycles`. */
export function cyclesState(preset: EffectsPreset): CyclesState {
  if (!('cycles' in preset) || preset.cycles === undefined) return 'absent';
  if (preset.cycles === null) return 'off';
  return 'authored';
}

export const CYCLES_TITLE = presetFieldTitle(['properties', 'cycles']);
export const VARIANTS_TITLE = presetFieldTitle(['properties', 'variants']);

/** One cycle-channel field's title, straight from the schema. */
export function cycleFieldTitle(field: string): string {
  return presetFieldTitle(['$defs', 'cycle_channel', 'properties', field]);
}

/** One variant field's title, straight from the schema. */
export function variantFieldTitle(field: string): string {
  return presetFieldTitle(['$defs', 'pal_variant', 'properties', field]);
}

/**
 * The three `cycles` options, each labelled with the spelling it WRITES, so an
 * author reading the picker reads the file. The order is the schema's own.
 */
export const CYCLES_STATE_OPTIONS: readonly { value: CyclesState; label: string }[] = Object.freeze([
  { value: 'absent', label: 'keep the section\'s hand-authored cycle (key absent)' },
  { value: 'off', label: 'off (null)' },
  { value: 'authored', label: 'authored script (array of channels)' },
]);

/**
 * The seed channel an author starts from when switching `cycles` to a script.
 *
 * ONE CHANNEL, NOT ZERO, for the reason `newPreset` seeds one band: an empty
 * `cycles` array is legal JSON and the generator's refusal, so a script born
 * empty is born refused for a reason the author had no hand in. The numbers are
 * a starting point to replace, NOT a validated or "safe" channel — Aurora does
 * not know what is safe here. `line` seeds 2 because the schema's own sentence
 * on it is "Never 0: line 0 is the character's"; `period` seeds the schema's
 * own worked number ("period 8 means a rotation every 8 frames"). `dir` is left
 * absent because it is the one field the constructor defaults.
 */
export function newCycleChannel(): EffectsPresetCycleChannel {
  return { line: 2, first: 8, count: 4, period: 8 };
}

/**
 * Author one of the three `cycles` spellings.
 *
 * `absent` DELETES the key — `p.cycles = undefined` would still serialise as
 * a key on some writers and is a fourth spelling the schema does not have.
 * Switching to `authored` from either other state seeds ONE channel; an array
 * already there is kept as it is (so re-picking the current option is a no-op
 * and burns no undo slot, through `editPresetCommand`'s guard).
 */
export function setCyclesStateCommand(
  library: EffectsPresetLibrary, id: string, state: CyclesState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} cycles: ${state}`, (p) => {
    if (state === 'absent') { delete p.cycles; return; }
    if (state === 'off') { p.cycles = null; return; }
    if (!Array.isArray(p.cycles)) p.cycles = [newCycleChannel()];
  });
}

export function addCycleChannelCommand(
  library: EffectsPresetLibrary, id: string,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Add cycle channel to ${id}`, (p) => {
    if (!Array.isArray(p.cycles)) return;
    p.cycles.push(newCycleChannel());
  });
}

/**
 * Remove one channel — DOWN TO AN EMPTY ARRAY, deliberately. The schema accepts
 * `[]` and names it the generator's refusal; refusing it here would leave a
 * file that carries `[]` un-editable, and silently writing null instead would
 * author "cycling OFF". The empty array stays on screen with
 * `emptyCyclesAdvisory` under it, and the author picks the spelling they mean.
 */
export function removeCycleChannelCommand(
  library: EffectsPresetLibrary, id: string, index: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Remove cycle channel ${index} from ${id}`, (p) => {
    if (!Array.isArray(p.cycles) || index < 0 || index >= p.cycles.length) return;
    p.cycles.splice(index, 1);
  });
}

/**
 * Set one channel field. `dir` is the only optional one: `undefined` deletes
 * it, handing the value back to the constructor's default.
 */
export function setCycleFieldCommand(
  library: EffectsPresetLibrary, id: string, index: number, field: string, value: number | undefined,
): SetEffectsPresetCommand | null {
  const { required, optional } = presetDefFields('cycle_channel');
  if (!required.includes(field) && !optional.includes(field)) return null;
  if (value === undefined && !optional.includes(field)) return null;
  return editPresetCommand(library, id, `Cycle channel ${index} ${field}`, (p) => {
    if (!Array.isArray(p.cycles)) return;
    const ch = p.cycles[index] as unknown as Record<string, unknown> | undefined;
    if (!ch) return;
    if (value === undefined) delete ch[field];
    else ch[field] = value;
  });
}

/**
 * The sentence under an EMPTY `cycles` array — the SCHEMA's own, read out of
 * the `cycles` description rather than retyped, and read loudly: if the
 * contract stops saying it, this throws at module load rather than advising
 * something the schema no longer holds.
 */
export const EMPTY_CYCLES_ADVISORY: string = (() => {
  const m = /An EMPTY array is legal JSON here[^.]*\.[^.]*\./.exec(CYCLES_TITLE);
  if (!m) {
    throw new Error('the schema\'s `cycles` description no longer carries its "An EMPTY array is '
      + 'legal JSON here" sentence — re-read the contract before advising on an empty script');
  }
  return m[0];
})();

export function emptyCyclesAdvisory(preset: EffectsPreset): string | null {
  return Array.isArray(preset.cycles) && preset.cycles.length === 0 ? EMPTY_CYCLES_ADVISORY : null;
}

export type VariantsState = 'absent' | 'present';
export type VariantSlotState = 'unreached' | 'cleared' | 'authored';

/** Whether the `variants` key is written at all. */
export function variantsState(preset: EffectsPreset): VariantsState {
  return !('variants' in preset) || preset.variants === undefined ? 'absent' : 'present';
}

export const VARIANTS_STATE_OPTIONS: readonly { value: VariantsState; label: string }[] = Object.freeze([
  { value: 'absent', label: 'every slot keeps its hand-authored value (key absent)' },
  { value: 'present', label: 'array — slot by slot below' },
]);

/**
 * The state of slot `index` as the document spells it. A slot past the end of
 * the array — and every slot when the key is absent — is `unreached`.
 */
export function variantSlotState(preset: EffectsPreset, index: number): VariantSlotState {
  const v = preset.variants;
  if (!Array.isArray(v) || index >= v.length) return 'unreached';
  return v[index] === null ? 'cleared' : 'authored';
}

/**
 * The slots the panel draws: every slot the array reaches, PLUS ONE unreached
 * slot the author can extend into. No slot COUNT is shown or enforced — the
 * schema carries none (PAL_MAX_VARIANTS is the engine's), and an over-long
 * array is the generator's refusal, named by it.
 */
export function variantSlotIndices(preset: EffectsPreset): number[] {
  const n = Array.isArray(preset.variants) ? preset.variants.length : 0;
  return Array.from({ length: n + 1 }, (_, i) => i);
}

export const VARIANT_SLOT_OPTIONS: readonly { value: VariantSlotState; label: string }[] = Object.freeze([
  { value: 'unreached', label: 'keep hand-authored value (array ends before this slot)' },
  { value: 'cleared', label: 'clear (null)' },
  { value: 'authored', label: 'author (object)' },
]);

/**
 * Write the `variants` key or delete it.
 *
 * `present` from absent writes `[]` — an array that reaches no slot. That is
 * semantically what absent means too, and the two are STILL different
 * documents: the author chose to write the key, and the file says so. Dropping
 * to `absent` deletes whatever slots were there, in ONE undo step.
 */
export function setVariantsStateCommand(
  library: EffectsPresetLibrary, id: string, state: VariantsState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} variants: ${state}`, (p) => {
    if (state === 'absent') { delete p.variants; return; }
    if (!Array.isArray(p.variants)) p.variants = [];
  });
}

/**
 * Author one slot's spelling.
 *
 *   unreached  — the array ENDS BEFORE this slot: it and every slot after it
 *                are dropped (the only spelling of "not reached" there is).
 *   cleared    — null at the index.
 *   authored   — an object at the index, born EMPTY: every variant field is
 *                optional with a constructor default, so `{}` is a complete,
 *                legal, number-free seed. Nothing is invented for it.
 *
 * Only the slot just past the end can be extended into (the panel offers no
 * other), so the array never grows a hole of undefined.
 */
export function setVariantSlotStateCommand(
  library: EffectsPresetLibrary, id: string, index: number, state: VariantSlotState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} variant slot ${index}: ${state}`, (p) => {
    if (!Array.isArray(p.variants) || index < 0 || index > p.variants.length) return;
    if (state === 'unreached') { p.variants.length = Math.min(index, p.variants.length); return; }
    const current = p.variants[index];
    if (state === 'cleared') { p.variants[index] = null; return; }
    if (current === null || current === undefined) p.variants[index] = {};
  });
}

/** The variant fields, in the schema's order — all optional. */
export const VARIANT_FIELDS: readonly string[] = presetDefFields('pal_variant').optional;

/**
 * The value a variant field is born with when the author sets it.
 *
 * A starting point, NOT a default: the constructor's defaults are aeon's and
 * are not restated here. 0 for every shift and bias is simply the smallest
 * integer to type over. `lines` seeds every line the SCHEMA's own rule permits
 * — bit 0 clear ("Line 0 is the character's and the mask's bit for it must be
 * clear"), at least one line named — which on a four-line CRAM is lines 1–3,
 * mask %1110 = 14.
 */
export function variantFieldSeed(field: string): number {
  return field === 'lines' ? 0b1110 : 0;
}

/**
 * Set or unset one field on an authored slot. `undefined` deletes the key —
 * every field is optional, and an absent field is the constructor's default,
 * which is a different document from an explicit value that happens to equal it.
 */
export function setVariantFieldCommand(
  library: EffectsPresetLibrary, id: string, index: number, field: string, value: number | undefined,
): SetEffectsPresetCommand | null {
  if (!VARIANT_FIELDS.includes(field)) return null;
  return editPresetCommand(library, id, `Variant slot ${index} ${field}`, (p) => {
    if (!Array.isArray(p.variants)) return;
    const slot = p.variants[index] as unknown as Record<string, unknown> | null | undefined;
    if (slot === null || slot === undefined) return;
    if (value === undefined) delete slot[field];
    else slot[field] = value;
  });
}

/**
 * The CRAM lines a `lines` mask names, for the checkbox spelling: bit n ⇔ line
 * n. Four lines, because the Genesis CRAM has four; the wire value is still the
 * integer, and bits above line 3 — a hand-written file could carry them — are
 * preserved by `toggleVariantLineCommand`, which flips ONE bit and nothing else.
 */
export const CRAM_LINES: readonly number[] = Object.freeze([0, 1, 2, 3]);

export function variantLineOn(mask: number, line: number): boolean {
  return (mask & (1 << line)) !== 0;
}

export function toggleVariantLineCommand(
  library: EffectsPresetLibrary, id: string, index: number, line: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Variant slot ${index} line ${line}`, (p) => {
    if (!Array.isArray(p.variants)) return;
    const slot = p.variants[index];
    if (slot === null || slot === undefined || typeof slot.lines !== 'number') return;
    slot.lines = slot.lines ^ (1 << line);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TIMELINE'S EDITING HALF — WHAT A SPLIT IS, AND WHAT BOUNDS AN EDGE
// ═══════════════════════════════════════════════════════════════════════════
//
// ROADMAP §5.1 row 94. Everything below is DERIVED from aeon's shipped
// `engine/effects/raster_dsl.emp`, cited by the TEXT of the ensure rather than
// by a line number, because these are the rules a drag has to obey and a number
// copied out of a moving file is this repo's most-paid-for defect. Four rules,
// and they are not the same KIND of rule:
//
//   1. THE FIRE BOUND — `fire()` opens with
//        "fire: screen line {line} outside 3..223 (lines 0-2 belong to the
//         priming records)"
//      and BOTH of a band's edges go through `fire()`: `band()` returns
//      `[fire(top, ...), fire(bot, ...)]`. So `top` and `bot` are each bounded
//      3..223 — the SAME bound `EFFECTS_FIRE_LINE_MIN/MAX` already carries for
//      a vsplit's fire, imported here rather than re-typed.
//
//   2. THE ORDER RULE — `band()`'s own
//        ensure(top < bot, "band: top {top} must be above bot {bot}")
//      and the vendored schema says it twice more, on `top` and on `bot`.
//
//   3. THE GAP RULE — TWO BANDS MAY NOT SHARE A FIRE LINE, and this is the one
//      that decides what a SPLIT is. `compose` merges every fire on one screen
//      line into ONE record (`for line in 3..224 { ... }`, gathering across all
//      programs), and `raster_program` then refuses that record by name:
//        "the fire at line {n} carries the restore plus {n} other op(s) — the
//         restore's fire carries the restore ONLY ... a second stream op cannot
//         be placed in the same blanking window at all"
//      `check_intervals` says the same thing one level up ("Records must occupy
//      STRICTLY ASCENDING, DISJOINT fire-line intervals"), and names the
//      consequence: the arm gap is stored as the low byte of an $8Axx word, so
//      two records on one line make it -1, whose byte is $FF — RASTER_ARM_PARK,
//      which kills every remaining fire in the frame silently.
//
//      ⚠ SO ABUTTING BANDS DO NOT BUILD. `{top, bot: L}` beside `{top: L, bot}`
//      is a refused program, not a tight one. A split therefore leaves ONE
//      CLEAR LINE between the halves, and that line shows the base palette.
//
//      ═══ AND THAT SENTENCE IS A DATED CLAIM, NOT AN ENGINE LAW ═══
//
//      OVERLAP IS DESIGNED, NOT IMPOSSIBLE — aeon's own words, at the head of
//      `check_intervals`, and the reason this paragraph carries an expiry
//      instead of reading as physics. It shipped with ROADMAP row 94 stated as
//      a law in five places; this is the ONE statement of it in this repo, and
//      every other site quotes that sentence and points here rather than
//      re-deriving the rule. What a prohibition with no date costs is not
//      hypothetical: it is re-read by people who cannot tell "true today" from
//      "true always", and nothing ever goes red when the world moves.
//
//        • WRITTEN 2026-08-30, verified against aeon `2e976223` — their
//          `origin/master` at that moment, read with `git -C ../aeon show
//          <rev>:<path>` and never out of anyone's working tree.
//        • OWNER: aeon's lane. This is their engine rule and their design.
//          This editor does not own it, does not vote on it, and must not
//          pre-empt it.
//        • WHAT WOULD END IT: their **effects tail Part A** — "runtime
//          patchable-overlap resolution", BANKED 2026-08-17 by owner ruling
//          (demand-pull), design COMPLETE and three-times swept
//          (`docs/superpowers/specs/2026-08-17-effects-tail-design-v3.md`,
//          r3.1, zero open mechanisms). Its stated revival condition is
//          a real program that needs overlapping patchable bands — the
//          expected one being an Aurora-authored multi-band showcase, which
//          is to say: possibly a document written on THIS surface.
//        • ⚠ AND PART A LANDING WOULD NOT, BY ITSELF, LET THESE BANDS ABUT.
//          Two qualifications, both read at `2e976223`, and a reader who skips
//          them will sit waiting for the wrong event:
//            (a) Part A deletes `check_intervals`' disjointness wall for
//                PATCHABLE-vs-PATCHABLE pairs ONLY — DEFERRED_WORK.md's own
//                words are that statics stay sacrosanct via a symmetric
//                comptime scan. A preset document emits `band()` calls
//                (`tools/effects_gen.py`'s `render_band`), and `band()`'s
//                header says it is Static by construction — BOTH fires, and
//                not handable to `patchable`. So a route from a preset
//                document to a patchable fire would have to exist too, and at
//                this revision none does.
//            (b) The ensure an abutting PAIR actually reaches is not
//                `check_intervals`: `compose` merges the upper band's restore
//                and the lower band's ON onto line L as ONE record, and it is
//                `raster_program`'s restore-alone ensure (spec §4.2a, claim
//                D-B — quoted above) that refuses it. Part A does not name
//                that guard, and it is cost-founded rather than
//                bookkeeping-founded.
//        • RE-READ, at aeon's then-current master and NOT at `2e976223`, which
//          is a revision and not "now": `docs/DEFERRED_WORK.md` ("Effects tail
//          Part A" — whether it is still BANKED), `engine/effects/
//          raster_dsl.emp` (`check_intervals`' GUARD 2 block, `band()`'s
//          header, and `raster_program`'s restore-alone ensure) and
//          `tools/effects_gen.py` (`render_band` — whether a preset document
//          still lowers to a static `band()`).
//        • EVALUATE, DO NOT OBEY. If Part A ships AND a preset band can become
//          patchable, this paragraph is the lie it exists to prevent and the
//          advisory below is over-strict — fix it then, against the artifact.
//          If it is still banked, the paragraph is still true and nothing here
//          moves. Do not re-bank the prohibition without re-reading; do not
//          relax it because a design exists.
//
//      ⚠ AND THE ONE THING THIS IS NOT A LICENCE FOR. aeon's guard says it in
//      as many words: do not relax it ad hoc, because every naive relaxation
//      was proven unsound — three adjudications, 38 accepted defects, two of
//      them latent regressions a green suite would not have caught. So nothing
//      in this editor loosens on the strength of a banked design.
//      `bandCollisionAdvisory` stays exactly as strict as it is, and a session
//      that wants overlapping bands goes to aeon's design — never to this
//      file's comparisons.
//
//   4. THE OWNERSHIP RULE — `check_band_ownership`, the per-CRAM-entry
//      timeline, refuses two bands live on one entry at once:
//        "Two bands may share colours only if they do not overlap vertically"
//      Bands whose CRAM spans are DISJOINT are not constrained by it at all —
//      nesting them is legal, which is why this is an advisory and not a wall.
//
// ⚠ WHAT IS DELIBERATELY NOT HERE. The HEIGHT MINIMUM is not transcribed. It is
// `fire_cost_cycles(f_on) <= (bot - top) * RASTER_SCANLINE_CYC` — cost-keyed on
// purpose ("they re-price themselves the day the model does"), so any number
// Aurora wrote down would be a copied pin that goes stale silently. Neither is
// the S/H minimum, nor the band count. The engine's own `ensure` carries the
// measurement behind each ("the ON fire costs 624 cyc against 488 available"),
// which is aeon's §E.4 instruction to a writer and the whole reason this codec
// clamps nothing.
//
// ═══ CLAMP OR ADVISE — THE TWO RULINGS, AND THEIR JOIN ═══
//
// `effects-aeon.ts` rules that "the control that OWNS a value refuses to
// originate an illegal one and says why; every other route surfaces it rather
// than silently rewriting or blocking" — that is `clampLayerTop` plus
// `guideBoundNotice`, and a timeline drag is the same kind of gesture.
// `armOptions` above rules the other half: "DISABLE ONLY WHEN NO DOCUMENT
// CONTENT CAN MAKE THE VALUE LEGAL; when the precondition is another control's
// value, ADVISE instead of disabling."
//
// Their join, and it is exactly the 1/2 versus 3/4 line above:
//   • rules 1 and 2 are true whatever else the document says, so the DRAG
//     CLAMPS to them and says why it stopped (`bandEdgeNotice`, tone 'held').
//   • rules 3 and 4 depend on ANOTHER BAND's values, so they ADVISE
//     (`bandCollisionAdvisory`) and the drag lets the author make the mess and
//     read it named. Walling them would refuse legal programs — a nested band
//     over a disjoint CRAM span builds fine.
//
// And a SPINNER still writes what the author typed, unclamped, because §E.4 is
// about values FORWARDED to the generator and a typed number is the author's.
// A drag has no typed number: its value is where the pointer is.

/** A band's two authored edges. Both are fire lines; neither is a payload. */
export type BandEdge = 'top' | 'bot';

/**
 * The CRAM BYTE range a band's ON op writes, or null when the band carries no
 * arm this codec recognises.
 *
 * BOTH ARMS SIZE THEIR SPAN FROM A COUNT THE AUTHOR EDITS: `cram` from the
 * LENGTH of `colours`, `pal_region` from `count` — the schema says of each that
 * it "is also the derived restore's word count". Two bytes per word.
 */
export function bandCramSpan(band: EffectsPresetBand): { start: number; end: number } | null {
  if ('cram' in band.on) {
    const colours = band.on.cram.colours;
    if (!Array.isArray(colours)) return null;
    return { start: band.on.cram.addr, end: band.on.cram.addr + 2 * colours.length };
  }
  if ('pal_region' in band.on) {
    const r = band.on.pal_region;
    return { start: r.addr, end: r.addr + 2 * r.count };
  }
  return null;
}

/**
 * Every SCREEN LINE this band puts a raster fire on.
 *
 * TWO for a plain band (`[fire(top, ...), fire(bot, ...)]`) and THREE when `sh`
 * is set, because the S/H shape adds the de-mix fire: aeon's `band()` returns
 * `[f_on_sh, fire(bot - 1, [reg_sh_off()]), fire(bot, ...)]`. The extra line is
 * INSIDE the band's own interval, so it never widens the band's footprint — it
 * only matters to rule 3, where a neighbour could land on it.
 */
export function bandFireLines(band: EffectsPresetBand): number[] {
  const sh = band.sh === true || band.sh === 1;
  if (!sh) return [band.top, band.bot];
  return band.bot - 1 === band.top ? [band.top, band.bot] : [band.top, band.bot - 1, band.bot];
}

/** Rule 1, as a sentence, in the engine's own numbers. */
export const BAND_EDGE_LAW =
  `both of a band's edges are raster fires, and a fire must land on ${EFFECTS_FIRE_LINE_MIN}..`
  + `${EFFECTS_FIRE_LINE_MAX} (lines 0-${EFFECTS_FIRE_LINE_MIN - 1} belong to the priming records)`;

/** Rule 2, as a sentence. */
export const BAND_ORDER_LAW =
  'a band covers top..bot-1, so top must stay above bot — the engine refuses top >= bot';

/**
 * Rule 3, as a sentence. The one a split is shaped by.
 *
 * ⚠ THE SENTENCE IS UNCHANGED AND SO IS THE REFUSAL — but the rule it describes
 * is DATED, not physics: see the GAP RULE block above (written 2026-08-30,
 * owner aeon's lane, ends if their banked effects-tail Part A revives AND a
 * preset band can become patchable). It is left as a flat present-tense
 * statement on purpose: it is read by an AUTHOR mid-drag, who needs to know
 * what today's build does, not who is going to change it. The provenance is
 * owed to whoever edits this file, and it is one screen up.
 */
export const BAND_GAP_LAW =
  'two bands cannot fire on one screen line: compose merges same-line fires into ONE record, and '
  + "the restore's fire carries the restore ALONE — a second stream op cannot be placed in the same "
  + 'blanking window. Two records on one fire line also store an arm gap of -1, whose byte is the '
  + 'PARK word, which kills every later fire in the frame silently';

/** Rule 4, as a sentence. */
export const BAND_OVERLAP_LAW =
  'two bands may share CRAM colours only if they do not overlap vertically — whichever restore '
  + "comes first writes this frame's BASE palette over the whole span, so the outer band's tint "
  + "ends at the inner band's bottom edge";

/**
 * What a DRAG of this edge may reach — rules 1 and 2 only.
 *
 * ⚠ THE NEIGHBOURS ARE NOT IN HERE, ON PURPOSE. See the "clamp or advise" block
 * above: a neighbouring band's position is another control's value, and walling
 * an edge off with it would refuse programs the engine builds (two bands over
 * disjoint CRAM spans may nest). Rules 3 and 4 are `bandCollisionAdvisory`.
 */
export function bandEdgeBounds(
  band: EffectsPresetBand, edge: BandEdge,
): { min: number; max: number } {
  if (edge === 'top') {
    return { min: EFFECTS_FIRE_LINE_MIN, max: Math.min(EFFECTS_FIRE_LINE_MAX, band.bot - 1) };
  }
  return { min: Math.max(EFFECTS_FIRE_LINE_MIN, band.top + 1), max: EFFECTS_FIRE_LINE_MAX };
}

/** The value a drag of this edge actually writes. Rounded, then held at the bound. */
export function clampBandEdge(band: EffectsPresetBand, edge: BandEdge, value: number): number {
  const b = bandEdgeBounds(band, edge);
  return Math.max(b.min, Math.min(b.max, Math.round(value)));
}

/** `GuideBoundNotice`'s shape, for the same job on this surface. */
export interface BandEdgeNotice {
  tone: 'held';
  edge: 'min' | 'max';
  /** Which rule did the narrowing — the fire bound, or the band's other edge. */
  rule: 'fire' | 'order';
  limit: number;
  text: string;
}

/**
 * Why the edge being dragged stopped, or null when it did not.
 *
 * `requested` is the raw line the pointer is asking for. It must NOT speak when
 * nothing is wrong — `guideBoundNotice`'s requirement, and for its reason: an
 * advisory that is always on screen is read as decoration within a day and is
 * then not read at the one moment it matters.
 */
export function bandEdgeNotice(
  band: EffectsPresetBand, edge: BandEdge, requested: number,
): BandEdgeNotice | null {
  if (!Number.isFinite(requested)) return null;
  const want = Math.round(requested);
  const b = bandEdgeBounds(band, edge);
  if (want >= b.min && want <= b.max) return null;
  const which = want < b.min ? 'min' : 'max';
  const limit = which === 'min' ? b.min : b.max;
  // WHICH rule narrowed it, asked of the bounds rather than assumed from the
  // edge: `top`'s ceiling is the fire ceiling on a band whose `bot` is off the
  // bottom, and the ORDER rule's ceiling otherwise. Saying "order" there would
  // send the author to move the wrong number.
  const byFire = limit === (which === 'min' ? EFFECTS_FIRE_LINE_MIN : EFFECTS_FIRE_LINE_MAX);
  const text = byFire
    ? `held at ${limit}. ${BAND_EDGE_LAW}. The build refuses a fire outside it.`
    : `held at ${limit}. ${BAND_ORDER_LAW}. Move the other edge first to make room.`;
  return { tone: 'held', edge: which, rule: byFire ? 'fire' : 'order', limit, text };
}

/**
 * What this band collides with in the rest of the preset, or null.
 *
 * ⚠ THE 'ILLEGAL' TONE OF THE PAIR — it speaks about a DOCUMENT STATE, not about
 * a gesture, so it is true whether or not anything is being dragged. That is the
 * `v_offset` hole's lesson on the guide surface: the route that CREATES an
 * illegal state is often not the control that owns it, so the state itself has
 * to be visible with nobody asking.
 */
export function bandCollisionAdvisory(preset: EffectsPreset, index: number): string | null {
  const band = preset.bands[index];
  if (!band) return null;
  const mine = bandFireLines(band);
  const mySpan = bandCramSpan(band);
  for (let j = 0; j < preset.bands.length; j++) {
    if (j === index) continue;
    const other = preset.bands[j];
    if (!other) continue;
    // ⚠ THE PAIR IS NAMED IN INDEX ORDER, NOT IN ASKING ORDER, and that is not
    // tidiness: a collision is a fact about a PAIR, and both members are asked
    // about it. Phrased from the asker's side the two answers would be two
    // different strings saying one thing, which the strip's notice list cannot
    // de-duplicate — and an author would read one defect as two.
    const [lo, hi] = index < j ? [index, j] : [j, index];
    const shared = bandFireLines(other).find((l) => mine.includes(l));
    if (shared !== undefined) {
      return `band ${lo} and band ${hi} both fire on screen line ${shared}. ${BAND_GAP_LAW}. `
        + 'The build refuses the program.';
    }
    const theirSpan = bandCramSpan(other);
    if (mySpan === null || theirSpan === null) continue;
    const spansMeet = mySpan.start < theirSpan.end && theirSpan.start < mySpan.end;
    const linesMeet = band.top < other.bot && other.top < band.bot;
    if (spansMeet && linesMeet) {
      const first = preset.bands[lo];
      const second = preset.bands[hi];
      return `band ${lo} (lines ${first.top}..${first.bot}) and band ${hi} (lines ${second.top}..`
        + `${second.bot}) overlap vertically AND share CRAM bytes `
        + `${Math.max(mySpan.start, theirSpan.start)}..${Math.min(mySpan.end, theirSpan.end) - 1}. `
        + `${BAND_OVERLAP_LAW}. The build refuses the program.`;
    }
  }
  return null;
}

/**
 * What a split IS, said once, for the strip's hint and for the refusal.
 *
 * The one-clear-line half is not a policy choice — see rule 3 above, INCLUDING
 * its dated-claim block: the clear line is what aeon's build requires as of
 * 2026-08-30, not a law of the hardware, and the sentence an author reads stays
 * present-tense for the reason `BAND_GAP_LAW`'s docblock gives.
 */
export const BAND_SPLIT_LAW =
  'A split cuts one band into two over the same ON op, and leaves the cut line CLEAR: the upper '
  + "half's restore fires on it, and the lower half's ON op cannot share that fire. So the cut "
  + 'line shows the base palette, and a band needs at least three lines to have one to give.';

/**
 * The smallest height a band can be split at all.
 *
 * COMPUTED FROM THE TWO INEQUALITIES rather than written as 3, so it moves if
 * either of them does: the upper half needs `top < cut` and the lower half needs
 * `cut + 1 < bot`, so a legal cut exists exactly when `bot - top >= 1 + 2`.
 *
 * ⚠ THE `+ 1` IN `cut + 1` IS THE GAP RULE, AND THE GAP RULE IS DATED. It is
 * the one term here that comes from aeon rather than from arithmetic — see the
 * GAP RULE block above for its date, its owner and what would retire it. If
 * that rule ever goes, this function is where the 3 stops being 3, which is
 * exactly why the 3 was never written down.
 */
export function bandSplitMinHeight(): number {
  const shortestHead = 1;      // cut - top, at its minimum (top < cut)
  const shortestTail = 2;      // bot - cut, at its minimum (cut + 1 < bot)
  return shortestHead + shortestTail;
}

/** Why this band cannot be split, or null. */
export function bandSplitRefusal(band: EffectsPresetBand): string | null {
  const need = bandSplitMinHeight();
  if (band.bot - band.top >= need) return null;
  return `lines ${band.top}..${band.bot} is ${band.bot - band.top} line(s) tall and a split needs `
    + `${need}. ${BAND_SPLIT_LAW}`;
}

/** The line a split actually cuts on, held inside the band's legal cut range. */
export function bandSplitLine(band: EffectsPresetBand, requested: number): number {
  return Math.max(band.top + 1, Math.min(band.bot - 2, Math.round(requested)));
}

/**
 * Split one band in two at `requestedLine`. ONE undo step.
 *
 * THE LOWER HALF IS INSERTED IMMEDIATELY AFTER THE UPPER, and its ON op is a
 * structural clone of the original's — the two halves are the SAME effect over
 * two intervals, which is the only reading of "split" this format has.
 *
 * ⚠ THE ARRAY ORDER IS AUTHORING, NOT SEMANTICS, and it is worth saying which.
 * `compose` emits by SCREEN LINE (`for line in 3..224`), so the ownership walk
 * reads the two halves in line order whatever order they sit in `bands`. Array
 * order would decide that walk only for two fires ON ONE LINE — which rule 3
 * refuses anyway, at the revision the GAP RULE block above names. Adjacency
 * here is for the author reading the panel's list.
 *
 * THE BAND ID CANNOT COLLIDE, structurally: aeon derives it as
 * `band_id = top * 128 + sa`, the halves share `sa` (they share the ON op) and
 * differ in `top` by at least one, so the packed pair differs.
 */
export function splitBandCommand(
  library: EffectsPresetLibrary, id: string, index: number, requestedLine: number,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  const band = existing?.bands[index];
  if (!existing || !band) return null;
  if (bandSplitRefusal(band) !== null) return null;
  const cut = bandSplitLine(band, requestedLine);
  return editPresetCommand(library, id, `Split band ${index} of ${id} at line ${cut}`, (p) => {
    const b = p.bands[index];
    if (!b) return;
    const lower: EffectsPresetBand = {
      top: cut + 1, bot: b.bot, sh: b.sh, on: structuredClone(b.on),
    };
    b.bot = cut;
    p.bands.splice(index + 1, 0, lower);
  });
}
