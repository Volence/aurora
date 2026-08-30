// Raster PRESET documents — `{dataRoot}editor/effects/presets/<preset_id>.json`.
//
// Wave-2 surface of the parallax/raster effects arc, and a DIFFERENT FILE from
// the scene documents `scene.ts` codes. The distinction is the first thing to
// get right and the easiest to get wrong:
//
//   A SCENE is a `parallax_config` — scroll factors, deform, vsplit. It lives at
//   `{dataRoot}editor/effects/<scene_id>.json` and a section points at it with
//   `sceneRef`.
//
//   A PRESET is an `EffectsPreset`, of which the raster program is one channel
//   (`ep_raster`). Its bands live HERE. **A `bands` key on a SCENE file is
//   refused**, deliberately, by the scene loader's closed-schema path — so a
//   band panel that wrote into a scene would produce a file nothing loads.
//
// CONTRACT, both halves, pinned and read through git objects (never a sibling
// working tree):
//   • empyrean `contract/schema/aurora-effects-preset.schema.json`, the
//     NORMATIVE writer-side half, vendored beside this file. Provenance and the
//     pin of record: `aurora-effects-preset.schema.provenance.json`; the gate
//     that hashes it is test/formats/effects-preset-schema-drift.test.ts.
//   • aeon `tools/EFFECTS_CONSUMER_CONTRACT.md` §2.4 — the consumer's read set,
//     which the schema pairs with.
//   • aeon `docs/EDITOR_RASTER_PRESETS.md` (read at aeon origin/master, blob
//     94db6b3a52c33d4e59011ba7043b8b9827fab38b) is a WORKED EXAMPLE and says so
//     in its own header: "This page is NOT an authority on the format." Where it
//     and the schema disagree, the schema and `effects_gen.py` win. They were
//     compared field by field at this landing and DO NOT disagree — see the
//     packet, docs/reviews/2026-08-29-band-preset-panel.md.
//
// THE STRUCTURAL IDEA IS SCENE.TS'S, UNCHANGED. Parse hands back what JSON.parse
// produced; serialize reorders by aeon's §5 canonical order and refuses to drop
// anything. A field this UI does not edit cannot be lost, because there is no
// list for it to be missing from.
//
// VALIDATION SPLIT, restated because the temptation is stronger here than it was
// for scenes. This module validates SHAPE (against the committed schema) and
// IDENTITY (stem == id, schema == 1). It validates NO NUMERIC VALUE and CLAMPS
// NOTHING — that is not an omission, it is aeon's §E.4 instruction: the
// generator forwards values verbatim so that the engine's own `ensure` fires
// with the measurement behind the rule ("band: height 1 is below this ON op's
// minimum — the ON fire costs 624 cyc against 488 available"). A clamp on this
// side replaces that sentence with silence, and authors something the author did
// not write. The schema is deliberately silent on bounds for the same reason and
// says so in its own `description`.

import type { FileAccess } from '../../project/adapter';
import { nameSome, type Notice } from '../../project/notice';
import type { JsonSchema } from './json-schema-subset';
import { validateAgainstSchema, canonicalizeBySchema } from './json-schema-subset';
import schemaJson from './aurora-effects-preset.schema.json';
import { canonicalJsonPretty } from '../canonical-json';

/** The committed contract schema, vendored byte-identical. */
export const EFFECTS_PRESET_SCHEMA = schemaJson as unknown as JsonSchema;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * The `on.cram` arm: raw CRAM colour words written from `addr`.
 *
 * `addr` is a CRAM **byte** address. `colours` is the word list, and its LENGTH
 * is also the derived restore's word count — the author is sizing two things
 * with one control, which is why the panel says so.
 */
export interface EffectsPresetCram {
  addr: number;
  colours: number[];
}

/**
 * The `on.pal_region` arm: colours streamed from a `Pal_Variant_Stage` slot.
 *
 * `slot` is the SOURCE, not the CRAM destination — the field most likely to be
 * misread, so the panel's title says it in those words. `pal_line` and `entry`
 * must AGREE with `addr` (`addr >> 5 == pal_line`, `(addr >> 1) & 15 == entry`),
 * which the engine checks and this module does not.
 */
export interface EffectsPresetPalRegion {
  addr: number;
  slot: number;
  pal_line: number;
  entry: number;
  count: number;
}

/**
 * The band's ON op. EXACTLY ONE ARM — zero, two, or an unknown arm are refused.
 *
 * Two arms would be two writes and therefore two restores, which is two bands
 * (schema `$defs.band.properties.on`). `vsram` is absent on purpose: a band's
 * restore is derived from the ON op's CRAM span, and a VSRAM op has none.
 */
export type EffectsPresetBandOn =
  | { cram: EffectsPresetCram }
  | { pal_region: EffectsPresetPalRegion };

/**
 * One band.
 *
 * ALL FOUR FIELDS REQUIRED, NONE WITH A DEFAULT, `sh` INCLUDED. That is
 * deliberate and it is the one place this codec's shape looks unfriendly: the
 * engine's `region_boundary` note is that whether an effect changes a mode
 * register is worth stating at the call site, and a JSON default would restore
 * the silence that ruling removed. So the panel writes `sh` every time.
 *
 * `sh` accepts a JSON boolean OR the integers 0/1, and this codec preserves
 * whichever the file carried rather than normalising — a normalising read would
 * put a diff on every load/save of a hand-written document.
 */
export interface EffectsPresetBand {
  /** Screen line the effect turns ON; the band's writes land on this line. */
  top: number;
  /** Screen line the effect turns OFF. The band covers `top..bot-1` inclusive. */
  bot: number;
  /** Shadow/Highlight for this band. `false`/`0` two fires; `true`/`1` three. */
  sh: boolean | 0 | 1;
  on: EffectsPresetBandOn;
}

export interface EffectsPreset {
  schema: 1;
  id: string;
  /** Display label. Writer-owned: read by nothing, dropped on lowering. */
  name?: unknown;
  bands: EffectsPresetBand[];
}

// ---------------------------------------------------------------------------
// Constants derived FROM the schema, never re-typed beside it
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
 * `^[a-z][a-z0-9_]{0,31}$`, read out of the schema rather than restated.
 *
 * The same asymmetry scene ids have: this becomes a component of the generated
 * `.emp` label `EditorRaster_<ACT>_<id>`, so Aurora's hyphenated BG-library
 * slugs are not legal here.
 */
export const EFFECTS_PRESET_ID_PATTERN =
  new RegExp(schemaNode(['properties', 'id']).pattern as string);

/** The band's required keys, in the schema's own `required` order. */
export const EFFECTS_PRESET_BAND_KEYS: readonly string[] =
  Object.freeze([...(schemaNode(['$defs', 'band']).required as string[])]);

/** The two ON arms, read off the schema's declared `on` properties. */
export const EFFECTS_PRESET_ON_ARMS: readonly string[] = Object.freeze(
  Object.keys(schemaNode(['$defs', 'band', 'properties', 'on', 'properties'])),
);

/** One arm's required field names, in the schema's `required` order. */
export function presetArmFields(arm: string): readonly string[] {
  return Object.freeze([...(schemaNode(['$defs', arm]).required as string[])]);
}

/**
 * The wave-2 vocabulary the contract has AGREED and this generator has NOT
 * BUILT: `fires`, `variants`, `cycles`.
 *
 * WHY THEY ARE WORTH SEPARATING from a plain unknown key. They are not typos —
 * they are empyrean `docs/AURORA_EFFECTS_SCHEMA.md` §7's reserved names, so an
 * author (or an agent) who read that document and wrote one of them deserves
 * "reserved, not built yet" rather than "unknown property". The schema refuses
 * them either way, because it is closed; this only improves the sentence.
 *
 * DERIVED FROM THE SCHEMA'S OWN `description`, NOT TYPED BESIDE IT, and derived
 * LOUDLY: if the sentence ever stops matching, this throws at module load rather
 * than silently returning an empty list and degrading every reserved-key refusal
 * back to "unknown property" with nothing going red. That is the whole design —
 * the failure state and the success state must not emit the same artifact.
 */
export const EFFECTS_PRESET_RESERVED_KEYS: readonly string[] = (() => {
  const description = String(EFFECTS_PRESET_SCHEMA.description ?? '');
  const m = /Reserved and refused by name \(still wave-2 open\): ([a-z, ]+?)\./.exec(description);
  if (!m) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer carries the "Reserved and refused by name" ' +
      'sentence its reserved-key list is derived from. Re-read the schema and update ' +
      'EFFECTS_PRESET_RESERVED_KEYS\'s derivation — do NOT hardcode the names.',
    );
  }
  const names = m[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (names.length === 0) throw new Error('the reserved-key sentence parsed to an empty list');
  return Object.freeze(names.slice().sort());
})();

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * `{dataRoot}editor/effects/presets/` — the whole preset library.
 *
 * A SUBDIRECTORY of the scene library's directory, which is safe in both
 * directions: `loadEffectsSceneLibrary` skips any entry that does not end in
 * `.json`, so the `presets` directory entry is not mistaken for a scene, and
 * this loader never looks up a level.
 */
export function effectsPresetDir(dataRoot: string): string {
  return `${dataRoot}editor/effects/presets/`;
}

/** `{dataRoot}editor/effects/presets/<preset_id>.json`. */
export function effectsPresetPath(dataRoot: string, id: string): string {
  return `${effectsPresetDir(dataRoot)}${id}.json`;
}

/** The preset id a library filename claims, or null when it is not a preset file. */
export function presetIdFromFileName(fileName: string): string | null {
  if (!fileName.endsWith('.json')) return null;
  return fileName.slice(0, -'.json'.length);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EffectsPresetError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'EffectsPresetError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// The arm rule, spelled ONCE
// ---------------------------------------------------------------------------

/**
 * Which arms a band's `on` object declares — the single derivation both the
 * codec's refusal and the panel's advisory read.
 *
 * Spelled once on purpose: the brief's rule is that a predicate and its sentence
 * come from one source both the control and the advisory read, never a
 * comparison duplicated into a component. `armIssue` below is that sentence.
 */
export function presetOnArms(on: unknown): string[] {
  if (typeof on !== 'object' || on === null || Array.isArray(on)) return [];
  return Object.keys(on as Record<string, unknown>);
}

/**
 * The exactly-one-arm rule as a sentence, or null when the band satisfies it.
 *
 * The schema's `oneOf` refuses all three of these already; this exists because
 * "matches 0 of the 2 allowed forms" does not tell an author WHY two writes
 * cannot share a band, and that reason is the whole design.
 */
export function presetArmIssue(on: unknown): string | null {
  const known = EFFECTS_PRESET_ON_ARMS;
  const arms = presetOnArms(on);
  const recognised = arms.filter(a => known.includes(a));
  const unknown = arms.filter(a => !known.includes(a));
  if (unknown.length > 0) {
    return `on carries ${unknown.map(a => `"${a}"`).join(' and ')}, which is not an ON arm. ` +
      `The arms are ${known.join(' and ')}. (vsram is deliberately not one: a band's restore ` +
      "is derived from the ON op's CRAM span, and a VSRAM op has none.)";
  }
  if (recognised.length === 0) {
    return `on declares no arm; exactly one of ${known.join(' / ')} is required. ` +
      'A band with no ON op is a band that turns nothing on.';
  }
  if (recognised.length > 1) {
    return `on declares ${recognised.length} arms (${recognised.join(' and ')}); exactly one is ` +
      'allowed. Two arms would be two writes and therefore two restores, which is two bands — ' +
      'author the second one as a second band.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Every object key appearing anywhere in a parsed document. */
function everyKey(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) { value.forEach(v => everyKey(v, out)); return out; }
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.add(k);
    everyKey(v, out);
  }
  return out;
}

/**
 * Parse and validate one preset document.
 *
 * `filenameStem` is the `<preset_id>` part of the path the text came from. The
 * identity check is required rather than optional because the id becomes a
 * symbol and the filename is how a human finds the file; aeon's loader refuses a
 * mismatch and so does this.
 *
 * Throws `EffectsPresetError` on anything wrong. Loud, never lenient — a
 * document the reader "fixed up" would be written back in the fixed shape over
 * the author's file.
 */
export function parseEffectsPreset(text: string, filenameStem: string): EffectsPreset {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new EffectsPresetError(
      `${filenameStem}.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new EffectsPresetError(`${filenameStem}.json must contain a JSON object`);
  }
  const obj = doc as Record<string, unknown>;

  // Version first, with its own words, for the reason scene.ts gives: the
  // schema's `const` would refuse it anyway, but "expected the constant 1" does
  // not tell an author there is deliberately no migration machinery to ask for.
  if (obj.schema !== 1) {
    throw new EffectsPresetError(
      `${filenameStem}.json declares "schema": ${JSON.stringify(obj.schema)}; wave 2 refuses ` +
      'anything but 1. A new schema version is a contract change to both halves, not a file ' +
      'the reader upgrades.',
    );
  }

  const issues = validateAgainstSchema(obj, EFFECTS_PRESET_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);

  // The reserved wave-2 names get their reason, not just "unknown property".
  const present = everyKey(obj);
  const reservedHits = EFFECTS_PRESET_RESERVED_KEYS.filter(k => present.has(k));
  if (reservedHits.length > 0) {
    issues.push(
      `${reservedHits.join(' and ')} ${reservedHits.length > 1 ? 'are' : 'is'} RESERVED wave-2 ` +
      'vocabulary (empyrean AURORA_EFFECTS_SCHEMA.md §7): the suite has agreed the name and ' +
      "aeon's generator has not built it. It is refused by name rather than as a typo. Adding " +
      'it is a contract change to both halves.',
    );
  }

  // The arm rule in its own words, ahead of the schema's "matches 0 of 2 forms".
  if (Array.isArray(obj.bands)) {
    obj.bands.forEach((band, i) => {
      if (typeof band !== 'object' || band === null || Array.isArray(band)) return;
      if (!('on' in (band as Record<string, unknown>))) return;
      const sentence = presetArmIssue((band as Record<string, unknown>).on);
      if (sentence) issues.push(`/bands/${i}/on: ${sentence}`);
    });
  }

  if (issues.length > 0) {
    throw new EffectsPresetError(
      `${filenameStem}.json does not match the raster preset schema`,
      // The arm sentence and the schema's oneOf message describe the same
      // defect; de-duplicate so an author is not told twice in two vocabularies.
      dedupe(issues),
    );
  }

  const preset = obj as unknown as EffectsPreset;

  if (preset.id !== filenameStem) {
    throw new EffectsPresetError(
      `${filenameStem}.json declares "id": ${JSON.stringify(preset.id)}; the filename stem and ` +
      'the id must match. The id becomes an .emp label component and the filename is how a human ' +
      "finds the file, so aeon's loader refuses a mismatch.",
    );
  }

  return preset;
}

/**
 * Drop the schema's generic `oneOf` complaint where a band already has ours.
 *
 * BOTH SPELLINGS, and the second one is easy to miss: the evaluator says
 * "matches NONE of the 2 allowed forms" for zero matches and "matches 2 of the
 * 2 allowed forms" for too many. A `\d+` alone silently covers only the
 * two-arm case, leaving a zero-arm band told off twice — which is the exact
 * shape of defect this function exists to prevent.
 */
function dedupe(issues: string[]): string[] {
  const armPaths = new Set(
    issues
      .filter(i => / on declares | which is not an ON arm/.test(i))
      .map(i => i.slice(0, i.indexOf(':'))),
  );
  return issues.filter(i => {
    const path = i.slice(0, i.indexOf(':'));
    if (!armPaths.has(path)) return true;
    return !/matches (?:none|\d+) of the \d+ allowed forms/.test(i);
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Serialize a preset. Validates on the way out — the writer path is the one this
 * schema is closed for, so an invalid document must never reach disk.
 *
 * KEY ORDER is aeon's §5 canonical order — alphabetical, RECURSIVELY, so the
 * band objects and the arm bodies sort too. That is why a serialized band reads
 * `bot, on, sh, top` rather than in the order a human would type them, and it
 * matches `json.dumps(obj, sort_keys=True, indent=2)` exactly, which is what
 * aeon's page calls normative.
 *
 * `canonicalizeBySchema` still runs for the OTHER thing it does: it throws on
 * any key the schema does not declare, so serializing can never silently erase a
 * field.
 */
export function serializeEffectsPreset(preset: EffectsPreset): string {
  const issues = validateAgainstSchema(preset, EFFECTS_PRESET_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);
  if (issues.length > 0) {
    throw new EffectsPresetError(
      `refusing to write preset ${JSON.stringify(preset?.id)}: it does not match the raster ` +
      'preset schema',
      issues,
    );
  }
  return canonicalJsonPretty(canonicalizeBySchema(preset, EFFECTS_PRESET_SCHEMA));
}

// ---------------------------------------------------------------------------
// Library load
// ---------------------------------------------------------------------------

export interface UnreadablePreset {
  /** Project-relative path of the file that could not be read. */
  path: string;
  reason: string;
}

export interface EffectsPresetLibrary {
  presets: EffectsPreset[];
  /**
   * Files that exist but will not parse. NOT presets and NOT silently dropped —
   * a caller that later writes the library must skip these paths.
   */
  unreadable: UnreadablePreset[];
  notices: Notice[];
}

/**
 * Load every preset in `{dataRoot}editor/effects/presets/`.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME FACT. An absent directory is the
 * ordinary "this project has no authored presets yet" and is silent. A file that
 * exists and will not parse is loud: it lands in `unreadable` with a notice, and
 * its id is NOT returned, so nothing can round-trip a repaired-looking empty
 * document over the author's broken one.
 */
export async function loadEffectsPresetLibrary(
  fa: FileAccess,
  dataRoot: string,
): Promise<EffectsPresetLibrary> {
  const dir = effectsPresetDir(dataRoot);
  const presets: EffectsPreset[] = [];
  const unreadable: UnreadablePreset[] = [];
  const notices: Notice[] = [];

  let present = false;
  try { present = await fa.exists(dir); } catch { present = false; }
  if (!present) return { presets, unreadable, notices };

  const entries = (await fa.list(dir)).slice().sort();
  for (const entry of entries) {
    const stem = presetIdFromFileName(entry);
    if (stem === null) continue;
    const path = `${dir}${entry}`;
    try {
      presets.push(parseEffectsPreset(new TextDecoder().decode(await fa.read(path)), stem));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      unreadable.push({ path, reason });
      // The per-file reason, unabridged — see the scene loader one file over.
      console.warn(`[effects] ${path} could not be read as a raster preset: ${reason}`);
    }
  }

  // ONE notice for the whole directory, coalesced on exactly the same terms as
  // the scene loader: 'error' either way, and a single failure keeps the message
  // it always had.
  if (unreadable.length === 1) {
    const only = unreadable[0];
    notices.push({
      severity: 'error',
      message:
        `${only.path} exists but could not be read as a raster preset (${only.reason}). ` +
        'Aurora is ignoring it and will NOT overwrite the file — fix it by hand and reopen.',
    });
  } else if (unreadable.length > 1) {
    notices.push({
      severity: 'error',
      message:
        `${unreadable.length} files in ${dir} exist but could not be read as raster presets — ` +
        `${nameSome(unreadable.map((u) => u.path))}. ` +
        'Aurora is ignoring them and will NOT overwrite them — fix them by hand and reopen. ' +
        'Each file and its own reason is in the developer console.',
    });
  }

  return { presets, unreadable, notices };
}
