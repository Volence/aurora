// Effects scene definition files — `{dataRoot}editor/effects/<scene_id>.json`.
//
// Wave-1 surface 1 of the parallax/raster effects arc. One scene per file; the
// per-section pointer at it is `sceneRef` in the meta sidecar (surface 2,
// src/core/formats/section-meta.ts, already landed).
//
// CONTRACT, both halves, pinned:
//   • empyrean docs/AURORA_EFFECTS_SCHEMA.md §2 (shape), §6 (hazards), §8
//     (golden protocol) — read at empyrean 069cf59, an ancestor of c2c81e2.
//   • empyrean contract/schema/aurora-effects-scene.schema.json — the
//     machine-readable half, vendored beside this file. Its git blob hash is
//     4adfbb40d20d0f0b3fea27fe933601ec14fc442e and the vendored copy is pinned
//     against that hash by test/formats/effects-schema-drift.test.ts. The BLOB
//     hash, not a commit citation, is the load-bearing invariant: the schema
//     doc has moved twice (2f3b6fd, 069cf59) with the schema JSON byte-identical
//     underneath, so a commit pin would read as drift that is not there.
//     THAT TEST IS THE PIN OF RECORD — it is the only citation a change can go red on,
//     and this comment is prose beside it. (Said because this line CARRIED A
//     STALE HASH for two whole re-pins: it still read cab3ca58 — item 35's
//     value — after item 37 moved the blob to d4345af5 and row 56 moved it to
//     0f661b70, and nothing went red, because nothing hashes a comment. Row 59
//     corrected it to the current value rather than adding a fifth entry to a
//     history that was already wrong.)
//     PIN HISTORY, current last: 2d7a9fee (landing) → cab3ca58 (a32bcb03, CR-1:
//     `v_factor`/`v_factor_fg` lost their `$ref` to `$defs/factor` and became
//     plain integers 0..15 — see the v_factor field comment below for why that
//     was a defect and not a preference) → d4345af5 (5c930d6, `v_center` and
//     `v_offset` bounded) → 0f661b70 (277bc15, `layers` maxItems 8 → 16) →
//     dd972cf0 (0bd4753, `precision` RETIRED — the engine deleted the storage,
//     so this is a delete and not a reservation; ROADMAP row 59) →
//     4adfbb40 (988638f, `$defs.layer.properties.drift` ADDED — see EffectsDrift
//     below, and note that this re-pin's byte diff is enormous and almost
//     entirely cosmetic: the same commit reflowed the whole file one key per
//     line. Structural equality was CHECKED, not assumed — a recursive diff of
//     the two parsed documents reports exactly one difference, the added
//     `drift` node. docs/reviews/2026-08-29-drift-codec.md).
//   • aeon tools/EFFECTS_CONSUMER_CONTRACT.md §2.1/§2.3 at aeon 00607dd5 — the
//     consumer's read set, and the drift rule that governs both directions.
//
// THE ONE STRUCTURAL IDEA HERE. This codec does not enumerate fields. Parse
// hands back the object JSON.parse produced, untouched; serialize reorders keys
// using the SCHEMA's own declaration order and refuses to drop anything. That is
// the direct answer to §6 hazard 1 ("round-trip what you do not understand, or
// refuse the file") and to the failure mode the sidecar codec has to fight with
// a hostile comment at four hardcoded sites: a field the wave-1 UI does not
// edit cannot be lost here, because there is no list for it to be missing from.
//
// VALIDATION SPLIT, restated because it is easy to over-build: this module
// validates SHAPE against the committed schema and IDENTITY (stem == id,
// schema == 1). Authored VALUES are sigil's — `tools/effects_gen.py` emits .emp
// calling the same constructors the hand path uses, so every `ensure` and
// `scene_budget_enforce` fires at build time (schema doc §2 preamble, scanline
// design §7). Aurora may pre-check as ADVISORY UX; see
// advisoryLayerDeformConflicts below, which is advisory in the literal sense —
// nothing in the read or write path calls it.

import type { FileAccess } from '../../project/adapter';
import { nameSome, type Notice } from '../../project/notice';
import type { JsonSchema } from './json-schema-subset';
import {
  validateAgainstSchema,
  canonicalizeBySchema,
} from './json-schema-subset';
import schemaJson from './aurora-effects-scene.schema.json';
import { canonicalJsonPretty } from '../canonical-json';

/** The committed contract schema, vendored byte-identical. */
export const EFFECTS_SCENE_SCHEMA = schemaJson as unknown as JsonSchema;

// ---------------------------------------------------------------------------
// Model (§2.1 top level, §2.2 layer, §2.3 factor, §2.4 tableRef)
//
// Optional fields are optional in the TYPE too, and absent means "the schema's
// default applies". Parse never fills a default in and serialize never writes
// one out that was not on disk: injecting defaults would turn every load/save
// of an untouched file into a diff, and would silently freeze today's default
// into files that should track the contract's.
// ---------------------------------------------------------------------------

export type EffectsFactorName =
  | 'FACTOR_LOCKED' | 'FACTOR_0' | 'FACTOR_1' | 'FACTOR_1_2' | 'FACTOR_1_4'
  | 'FACTOR_1_8' | 'FACTOR_1_16' | 'FACTOR_1_32' | 'FACTOR_3_4' | 'FACTOR_3_8'
  | 'FACTOR_3_16' | 'FACTOR_5_8' | 'FACTOR_5_16' | 'FACTOR_7_8' | 'FACTOR_7_16'
  | 'FACTOR_15_16';

/** `packed(s1:, s2:, op:)` — s1=15 term zero/locked, s2=15 single-term, op 0 add / 1 sub. */
export interface EffectsPackedFactor { s1: number; s2: number; op: 0 | 1 }

export type EffectsFactor = EffectsFactorName | EffectsPackedFactor;

/** A 256-byte signed deform/column table: a generator call, or a raw .bin. */
export type EffectsTableRef =
  | { generator: 'sine'; amplitude: number; period: number }
  | { generator: 'triangle'; amplitude: number; period: number }
  | { generator: 'zero' }
  | { generator: 'v_column_perspective'; focal: number; max_offset: number }
  | { generator: 'v_column_floor'; center: number; max_offset: number }
  | { bin: string };

export type EffectsLayerDeform =
  | 'none'
  | { own: { table: EffectsTableRef; shift_a: number; shift_b: number; phase: number; speed: number } };

export type EffectsSceneDeform =
  | 'none'
  | { shared: { table: EffectsTableRef; speed: number } };

export type EffectsCurve = 'none' | { to: EffectsFactor };
export type EffectsVSplit = 'none' | { at: number };
export type EffectsVDeform =
  | 'none'
  | { columns: { table: EffectsTableRef; speed: number; amp_shift: number } };
export type EffectsAnchor = 'none' | { at: { channel: number; dsa: number; dsb: number } };

/**
 * Time-driven drift: a constant horizontal rate added to a band's scroll every
 * frame, independent of the camera (S1 GHZ clouds, S2 WFZ/HTZ, S3K AIZ1).
 *
 * `rate` IS NOT PIXELS PER FRAME. It is 1/256 px per frame — the schema's own
 * description names the hazard ("an author writing 1 meaning 1 px/frame gets
 * 1/256 px/frame") and asks the editor to present px/frame and multiply on
 * export. Aurora takes that SHOULD: see `driftPxPerFrameToRate` /
 * `driftRateToPxPerFrame` in scene-ui.ts, which are the ONLY two places the
 * factor is applied, and `EFFECTS_DRIFT_UNITS_PER_PIXEL`, which is the only
 * place it is spelled — derived out of this schema's description, not typed.
 *
 * `0` IS NOT A VALUE. It is refused by the schema (`"not": {"const": 0}`)
 * because `Rate(0)` and `None` are indistinguishable in ROM; aeon refuses it at
 * build time too (`scene_dsl.emp` `layer()` ensure). A layer that should not
 * drift spells `"none"` or omits the key.
 *
 * NOT AUTHORABLE FROM AURORA, DELIBERATELY, and this is the whole reason there
 * is a type here and no control anywhere. aeon's `tools/effects_gen.py` REFUSES
 * the key until their `CAP_BAND_DRIFT` emission parcel lands, so a scene
 * carrying `drift` does not build today. Shipping a spinner for it would
 * originate a value the build rejects for EVERY input — the open defect ROADMAP
 * row O13 already tracks for the curve dropdown, in a worse form. What Aurora
 * owes the field now is the other thing: reading it, round-tripping it, and not
 * destroying it. See docs/reviews/2026-08-29-drift-codec.md.
 */
export type EffectsDrift = 'none' | { rate: number };

export interface EffectsLayer {
  world_y: number;
  fa: EffectsFactor;
  fb: EffectsFactor;
  dsa?: number;
  dsb?: number;
  phase?: number;
  enabled?: boolean;
  deform?: EffectsLayerDeform;
  curve?: EffectsCurve;
  vsplit?: EffectsVSplit;
  drift?: EffectsDrift;
}

export interface EffectsScene {
  schema: 1;
  id: string;
  /** Display label. Writer-owned: the generator ignores it and must keep ignoring it. */
  name?: string;
  layers: EffectsLayer[];
  /**
   * Whole-plane Plane-B vertical scroll, as a RIGHT-SHIFT AMOUNT 0..15 — a plain
   * integer, NOT a packed `EffectsFactor`.
   *
   * TWO DIFFERENT SPACES THAT LOOKED LIKE ONE TYPE. A layer's `fa`/`fb` are
   * packed factors where locked is the byte `$0FF`; this field is a shift count
   * the engine feeds straight to `asr.w`, where locked is the sentinel **15**.
   * The contract originally `$ref`'d both to `$defs/factor` — the mistake this
   * type exists to make un-writable — and the near-miss is why it survived: a
   * `FACTOR_0` here folds to 255, a 68000 register shift is taken mod 64, and
   * `ASR.W` by 63 sign-fills, so the term collapses and the plane renders
   * *almost* like a locked one instead of failing visibly. Fixed at empyrean
   * `a32bcb03` (CR-1); Aurora followed in ROADMAP item 35. `$defs/factor` is
   * untouched and still governs `fa`, `fb` and `curve.to`, which were correct.
   */
  v_factor: number;
  v_center?: number;
  v_offset?: number;
  /** Plane-A counterpart of `v_factor`, same shift encoding. RESERVED in v1. */
  v_factor_fg?: number;
  deform_fg?: EffectsSceneDeform;
  deform_bg?: EffectsSceneDeform;
  v_deform?: EffectsVDeform;
  anchor?: EffectsAnchor;
  left_column_mask?: 'undeclared' | 'sprite_mask' | 'factor0_lock' | 'accept';
  /*
   * `precision?: 'cell' | 'line'` LIVED HERE until 2026-08-27 (ROADMAP row 59).
   * empyrean 0bd4753 retired it from the contract because aeon deleted the
   * STORAGE — see the pin history above and scene-ui.ts's note.
   *
   * AND A DOCUMENT THAT STILL CARRIES IT IS NOW REFUSED, which is worth stating
   * HERE because the paragraph above ("a field the wave-1 UI does not edit
   * cannot be lost here") reads like it promises the opposite. It does not. That
   * paragraph is about fields the SCHEMA still declares and the UI merely does
   * not edit; `precision` is no longer declared at all, and this schema is CLOSED
   * (`unevaluatedProperties: false`), so validation refuses it before any
   * round-trip question arises. The two rules compose exactly as intended: the
   * schema decides what may exist, and the codec refuses to drop anything the
   * schema allows.
   *
   * NO TOLERANT READ WAS ADDED, and the hub explicitly left that call to Aurora
   * ("a tolerant read that discards a stray `precision` is aurora's call"). The
   * population is empty — checked on the owner's live aeon tree, not assumed —
   * and a silent discard is the lossy behaviour §6 hazard 1 forbids. The refusal
   * names the file; the author deletes one line. See
   * test/formats/effects-scene.test.ts, "REFUSES a legacy scene", and
   * docs/reviews/2026-08-27-retire-precision.md.
   */
  transition?: 'smooth' | 'instant';
  budget_class?: string;
}

// ---------------------------------------------------------------------------
// Constants derived FROM the schema, never re-typed beside it
// ---------------------------------------------------------------------------

function schemaProp(path: string[]): Record<string, unknown> {
  let node: unknown = EFFECTS_SCENE_SCHEMA;
  for (const seg of path) node = (node as Record<string, unknown>)[seg];
  if (typeof node !== 'object' || node === null) {
    throw new Error(`effects scene schema is missing ${path.join('.')}`);
  }
  return node as Record<string, unknown>;
}

/**
 * `^[a-z][a-z0-9_]{0,31}$`, read out of the schema rather than restated.
 *
 * THE ASYMMETRY THAT BITES: Aurora's BG-library ids are hyphenated slugs
 * (`makeBgId` in ../bg-library.ts emits `forest-1718000000`), and unicode is
 * legal there. Neither is legal here — a scene id becomes part of generated
 * .emp symbol names (schema doc §2 "Identity"). A ref that is a perfectly good
 * bgLayoutRef is not a legal sceneRef.
 */
export const EFFECTS_SCENE_ID_PATTERN =
  new RegExp(schemaProp(['properties', 'id']).pattern as string);

/** Per-layer defaults, read out of the schema (`$defs.layer.properties.*.default`). */
export const EFFECTS_LAYER_DEFAULTS = {
  dsa: schemaProp(['$defs', 'layer', 'properties', 'dsa']).default as number,
  dsb: schemaProp(['$defs', 'layer', 'properties', 'dsb']).default as number,
  phase: schemaProp(['$defs', 'layer', 'properties', 'phase']).default as number,
} as const;

/**
 * §2.1 "Deliberately excluded from the JSON surface". Both are byte-identity
 * bridges for hand-migrated legacy scenes; editor-authored scenes derive them
 * (-1). The consumer contract lists them under NOT read (§2.1).
 */
export const EXCLUDED_RAW_FIELDS = ['layer_mask_raw', 'v_deform_shift_raw'] as const;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** `{dataRoot}editor/effects/` — the whole editor scene library, one file per scene. */
export function effectsSceneDir(dataRoot: string): string {
  return `${dataRoot}editor/effects/`;
}

/** `{dataRoot}editor/effects/<scene_id>.json`. */
export function effectsScenePath(dataRoot: string, id: string): string {
  return `${effectsSceneDir(dataRoot)}${id}.json`;
}

/** The scene id a library filename claims, or null when it is not a scene file. */
export function sceneIdFromFileName(fileName: string): string | null {
  if (!fileName.endsWith('.json')) return null;
  return fileName.slice(0, -'.json'.length);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EffectsSceneError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'EffectsSceneError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Every object key appearing anywhere in a parsed document, for the raw-field scan. */
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
 * Parse and validate one scene definition file.
 *
 * `filenameStem` is the `<scene_id>` part of the path the text came from; the
 * identity check (§2 "Identity": the stem must equal `id`, and the generator
 * refuses a mismatch) is why it is required rather than optional. A caller with
 * no file — a paste, a test — passes the id it intends.
 *
 * Throws EffectsSceneError on anything wrong. Loud, never lenient: a scene the
 * reader "fixed up" would be written back over the author's file in that fixed
 * shape, which is the silent-erasure class the whole contract is built against.
 */
export function parseEffectsScene(text: string, filenameStem: string): EffectsScene {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new EffectsSceneError(
      `${filenameStem}.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new EffectsSceneError(`${filenameStem}.json must contain a JSON object`);
  }
  const obj = doc as Record<string, unknown>;

  // Version first, with its own words. `"schema": {"const": 1}` would reject it
  // anyway, but "expected the constant 1, got 2" does not tell an author that
  // there is deliberately no migration machinery to ask for.
  if (obj.schema !== 1) {
    throw new EffectsSceneError(
      `${filenameStem}.json declares "schema": ${JSON.stringify(obj.schema)}; wave 1 refuses ` +
      'anything but 1. There is no migration machinery in v1 (AURORA_EFFECTS_SCHEMA.md §2, ' +
      'Versioning) — a new schema version is a contract change, not a file the reader upgrades.',
    );
  }

  const issues = validateAgainstSchema(obj, EFFECTS_SCENE_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);

  // The two excluded raw fields get their reason, not just "unknown property".
  // They are REJECTED, not preserved: the schema is closed on the writer path
  // (§8), and the consumer lists them under NOT read (§2.1), so a file carrying
  // one asks for behaviour nothing in the pipeline honours. Failing at read is
  // the loud half of "round-trip what you do not understand, or refuse the
  // file" (§6 hazard 1) — preserve-and-refuse-on-write would let the file live
  // in the editor and only blow up at save, after the author had worked on it.
  const present = everyKey(obj);
  const rawHits = EXCLUDED_RAW_FIELDS.filter(f => present.has(f));
  if (rawHits.length > 0) {
    issues.push(
      `${rawHits.join(' and ')} ${rawHits.length > 1 ? 'are' : 'is'} deliberately excluded from ` +
      'the JSON surface (AURORA_EFFECTS_SCHEMA.md §2.1): byte-identity bridges for hand-migrated ' +
      'legacy scenes, which editor-authored scenes derive. A layer that should be off authors ' +
      '"enabled": false.',
    );
  }

  if (issues.length > 0) {
    throw new EffectsSceneError(`${filenameStem}.json does not match the effects scene schema`, issues);
  }

  const scene = obj as unknown as EffectsScene;

  if (scene.id !== filenameStem) {
    throw new EffectsSceneError(
      `${filenameStem}.json declares "id": ${JSON.stringify(scene.id)}; the filename stem and the ` +
      'id must match (AURORA_EFFECTS_SCHEMA.md §2, Identity — the generator refuses a mismatch).',
    );
  }

  return scene;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Serialize a scene. Validates on the way out — the writer path is the one this
 * schema is closed for (§8: "the party validating is the party publishing what
 * it writes"), so an invalid scene must never reach disk.
 *
 * KEY ORDER is aeon's §5 canonical order — alphabetical, recursively — via
 * `canonicalKeyOrder`. It used to be the schema's own `properties` order; §5's
 * scope ruling (aeon 768eb2d8) replaced that, and the reason generalizes past
 * this file: a declaration order has to be maintained identically in two repos,
 * where alphabetical is derivable by both from the data alone.
 *
 * `canonicalizeBySchema` still runs, for the OTHER thing it does: it refuses any
 * key the schema does not declare, so serializing can never silently erase a
 * field. Its ordering no longer reaches disk — the sort runs after it.
 *
 * PRETTY-PRINTED at indent 2, and that is not an oversight. §5 splits
 * COMPACTNESS by document class while DETERMINISM binds universally: a scene
 * file is a handful of scalars, so a pretty diff is genuinely more reviewable,
 * where `editor_bg_override.json` is dominated by tile arrays and minifies.
 *
 * The cost §5 names and accepts: alphabetical puts `schema` and `id` in the
 * middle of the file rather than at the top, which reads worse than contract
 * order. "A self-describing order that cannot drift is worth more than a
 * familiar one that can."
 *
 * ENDS IN EXACTLY ONE `\n` after the closing brace — the canonical file form
 * (empyrean e1ebd20, AURORA_EFFECTS_SCHEMA.md §8, ruled 2026-08-26): it is a
 * POSIX text file, aeon's own shipped instance already ends that way, and a
 * newline-less file puts "\ No newline at end of file" on every diff. Nothing
 * else about surrounding whitespace is canonical; the parser accepts a file
 * with zero or two terminators and the writer lands on one.
 */
export function serializeEffectsScene(scene: EffectsScene): string {
  const issues = validateAgainstSchema(scene, EFFECTS_SCENE_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);
  if (issues.length > 0) {
    throw new EffectsSceneError(
      `refusing to write scene ${JSON.stringify(scene?.id)}: it does not match the effects scene schema`,
      issues,
    );
  }
  // The trailing newline is the chokepoint's (canonical-json.ts jsonFileText)
  // since the §8 rule was generalised to every editor-owned JSON — not spelled
  // here, or a scene would end in two.
  return canonicalJsonPretty(canonicalizeBySchema(scene, EFFECTS_SCENE_SCHEMA));
}

// ---------------------------------------------------------------------------
// Library load (§2: an absent directory is "no editor scenes", not an error)
// ---------------------------------------------------------------------------

export interface UnreadableScene {
  /** Project-relative path of the file that could not be read. */
  path: string;
  reason: string;
}

export interface EffectsSceneLibrary {
  scenes: EffectsScene[];
  /**
   * Files that exist but could not be parsed. They are NOT scenes and NOT
   * silently dropped: a caller that later writes the library must skip these
   * paths, exactly as buildAeonSavePlan skips a section's `unreadable` files.
   */
  unreadable: UnreadableScene[];
  notices: Notice[];
}

/**
 * Load every scene in `{dataRoot}editor/effects/`.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME FACT (the rule aeon/load.ts's
 * markUnreadable already states for section sidecars). An absent directory is
 * the ordinary "this project has no editor scenes yet" and is silent — §2 says
 * so in as many words. A file that exists and will not parse is loud: it lands
 * in `unreadable` with a notice, and its id is NOT returned, so nothing can
 * round-trip a repaired-looking empty scene over the author's broken one.
 */
export async function loadEffectsSceneLibrary(
  fa: FileAccess,
  dataRoot: string,
): Promise<EffectsSceneLibrary> {
  const dir = effectsSceneDir(dataRoot);
  const scenes: EffectsScene[] = [];
  const unreadable: UnreadableScene[] = [];
  const notices: Notice[] = [];

  let present = false;
  try { present = await fa.exists(dir); } catch { present = false; }
  if (!present) return { scenes, unreadable, notices };

  const entries = (await fa.list(dir)).slice().sort();
  for (const entry of entries) {
    const stem = sceneIdFromFileName(entry);
    if (stem === null) continue; // .bin deform tables and anything else live here too
    const path = `${dir}${entry}`;
    try {
      scenes.push(parseEffectsScene(new TextDecoder().decode(await fa.read(path)), stem));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      unreadable.push({ path, reason });
      // The per-file reason, unabridged. The notice below names only the first
      // few, and this directory is a LISTING — its length is whatever the tree
      // holds, so the notice cannot be per file.
      console.warn(`[effects] ${path} could not be read as an effects scene: ${reason}`);
    }
  }

  // ONE notice for the whole directory, on the shape bgLibraryUnresolved already
  // ships. 'error' either way — the read FAILED and the scene is not in the
  // library; see core/project/notice.ts, severity is the producer's to assign,
  // and coalescing changes the count, never the channel. A single failure keeps
  // the message it always had, because one broken scene is the common case and
  // naming it outright is already right.
  if (unreadable.length === 1) {
    const only = unreadable[0];
    notices.push({
      severity: 'error',
      message:
        `${only.path} exists but could not be read as an effects scene (${only.reason}). ` +
        'Aurora is ignoring it and will NOT overwrite the file — fix it by hand and reopen.',
    });
  } else if (unreadable.length > 1) {
    notices.push({
      severity: 'error',
      message:
        `${unreadable.length} files in ${dir} exist but could not be read as effects scenes — ` +
        `${nameSome(unreadable.map((u) => u.path))}. ` +
        'Aurora is ignoring them and will NOT overwrite them — fix them by hand and reopen. ' +
        'Each file and its own reason is in the developer console.',
    });
  }

  return { scenes, unreadable, notices };
}

// ---------------------------------------------------------------------------
// Advisory only — NOT enforcement
// ---------------------------------------------------------------------------

export interface SceneAdvisory { path: string; message: string }

/**
 * The two-sources guard, as ADVICE.
 *
 * §2.2: "When `own` is present, `dsa`/`dsb`/`phase` must be absent or at their
 * defaults — they lower into the SAME record fields (two-sources guard; sigil
 * enforces with the exact reason)."
 *
 * Aurora does NOT enforce it. The contract assigns value semantics to sigil and
 * says the build gate is the rulebook; a second enforcement here would be a
 * second rulebook, free to drift from sigil's in either its condition or its
 * wording, and the first divergence would present as "the editor let me save a
 * file the build rejects" or — far worse — "the editor refused a file the build
 * accepts". What §2 does license is advisory UX ("Aurora may pre-check anything
 * it likes as advisory UX"), which is this: a pure function nothing in the read
 * or write path calls, for a UI to surface as a warning.
 *
 * The defaults it compares against are read out of the schema
 * (EFFECTS_LAYER_DEFAULTS), so even the advisory cannot drift on what "at their
 * defaults" means.
 */
export function advisoryLayerDeformConflicts(scene: EffectsScene): SceneAdvisory[] {
  const out: SceneAdvisory[] = [];
  scene.layers.forEach((layer, i) => {
    const deform = layer.deform;
    if (deform === undefined || deform === 'none' || !('own' in deform)) return;
    const clashes = (['dsa', 'dsb', 'phase'] as const)
      .filter(k => layer[k] !== undefined && layer[k] !== EFFECTS_LAYER_DEFAULTS[k]);
    if (clashes.length === 0) return;
    out.push({
      path: `/layers/${i}`,
      message:
        `deform.own is set alongside ${clashes.join('/')}; both lower into the same record fields ` +
        '(two-sources guard). sigil refuses this at build time with the exact reason — ' +
        'clear one source before building.',
    });
  });
  return out;
}
