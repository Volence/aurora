// The REGIONS DOCUMENT codec: one act's regions, read and written.
//
// WHAT THIS FILE IS. Regions part 2 makes a REGION the unit of identity and a
// SECTION carry none: part 1 deleted `Sec.sec_effects`, part 2 deletes
// `Sec.sec_bg_layout`. A region is a RECTANGLE in world pixels whose edges need
// not fall on the section grid, and this document is the editor-owned file that
// says where those rectangles are and what each one binds. It is validated
// against empyrean's contract schema, vendored beside this file at
// `aurora-regions.schema.json` with its pin of record in the provenance sidecar.
//
// WHAT IT IS NOT, and the boundary matters because a silence here would read as
// coverage. This is the FILE half only: read, validate, write. It does not draw
// regions, does not migrate a project that has none, and does not resolve a
// reference to anything. The schema is SHAPE-ONLY by the contract's own words
// ("NUMERIC BOUNDS ARE DELIBERATELY NOT RESTATED"), so a document this codec
// accepts can still name a preset record that does not exist, a layout the
// library does not hold, a rectangle outside the act, or a `bg.span` that
// disagrees with its layout. Those are the generator's checks and the editor's;
// see THE SPAN HOLE below, which is the one worth calling out by name.
//
// KEY ORDER ON WRITE: aeon's canonical form, and not this codec's own idea.
// `EFFECTS_CONSUMER_CONTRACT.md` section 5 binds every editor-owned JSON in
// aeon's tree, not only the effects documents: keys sorted alphabetically,
// RECURSIVELY, pretty-printed at indent 2, exactly one trailing newline. That is
// `canonicalJsonPretty`, which is the one place Aurora spells the rule, and
// using it here is what makes a regions file diffable against a file a Python
// tool wrote with `json.dumps(obj, sort_keys=True, indent=2)`. The alternative,
// schema-declaration order, would need the same key list maintained in two
// repos and has no answer at all for ordering across writers.
//
// REFUSES, NEVER ERASES. The schema is closed at EVERY level
// (`unevaluatedProperties: false` on the document, on a region and on `bg`), so
// an unknown key is a refusal and never a silent drop. Both directions are
// guarded, and the two guards are different instruments on purpose:
//
//   - READING, `validateAgainstSchema` refuses the document and names the
//     JSON Pointer of the offending value. The object handed back is the one
//     `JSON.parse` produced, never a rebuild from a field list, so nothing can
//     be lost between the check and the caller.
//   - WRITING, `canonicalizeBySchema` THROWS on any key the schema does not
//     declare. Its ordering no longer reaches disk (section 5's alphabetical
//     sort runs after it), but its refusal does, and that refusal is the only
//     thing standing between a serialize and a silent erasure.
//
// THE SPAN HOLE, stated plainly because no keyword can carry it. `bg.span` is
// DERIVED FROM THE REFERENCED LAYOUT AND NEVER TYPED BY HAND (part 2 section 6.2
// item 1). This layer cannot check that: deriving it needs the background layout
// library, which is a later row, and the schema can only say "an integer at
// least 1". So a `span` that disagrees with the layout `bg.layoutRef` names
// arrives here UNVALIDATED, passes, and is written back unchanged. That is a
// defect the generator must catch, and until the derivation lands in Aurora it
// is a hole, not a check. `RegionBg.span`'s own doc comment says so at the point
// of use so a reader of the type cannot miss it.

import type { JsonSchema } from '../effects/json-schema-subset';
import { validateAgainstSchema, canonicalizeBySchema } from '../effects/json-schema-subset';
import schemaJson from './aurora-regions.schema.json';
import { canonicalJsonPretty } from '../canonical-json';

/** The committed contract schema, vendored byte-identical. */
export const REGIONS_SCHEMA = schemaJson as unknown as JsonSchema;

/** The only `schema` value this codec reads or writes. */
export const REGIONS_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * A region's rectangle, in WORLD PIXELS. Edges need not fall on the section
 * grid: that is the whole point of identity by rectangle, and the shipped night
 * region straddles a section line by design.
 *
 * These are the numbers an AUTHOR types. The generator converts them to the
 * INCLUSIVE bounds the engine reads (regions v1 section 1.3(b)), so a reader of
 * this document must not assume the engine sees them unchanged.
 */
export interface RegionRect {
  x: number;
  y: number;
  /** At least 1. A region with no extent is not a region. */
  w: number;
  /** At least 1. */
  h: number;
}

/**
 * The region's background placement, which is what part 2 adds. ABSENT means
 * the region inherits the act's background, which is every region's behaviour
 * before part 2 and stays the default.
 */
export interface RegionBg {
  /**
   * A background layout library id, or the sentinel `"@act"` meaning inherit the
   * act's layout (the spelling `resolveDisplayedBg` already uses), or `null`
   * meaning the same. Read by the engine as `Region.rg_bg_layout`.
   *
   * That the id names a layout the library actually holds is NOT checked here.
   */
  layoutRef?: string | null;
  /**
   * The layout's height in pixels, read by the engine as `Region.rg_bg_span`.
   *
   * ⚠ DERIVED, NEVER TYPED BY HAND (part 2 section 6.2 item 1) AND UNVALIDATED
   * AT THIS LAYER. The editor is supposed to compute it from the layout
   * `layoutRef` resolves to; this codec has no layout library, so all it can
   * assert is the schema's "integer, at least 1". A hand-edited value that
   * disagrees with the layout passes here and is written back unchanged. The
   * generator must catch it. Tagged as a follow-up rather than implied to be
   * checked.
   */
  span?: number;
}

/** One region: a rectangle, an identity binding, and optional references. */
export interface Region {
  /** Stable identity within the act. Becomes a component of emitted symbol names. */
  id: string;
  rect: RegionRect;
  /**
   * RULING Q8 (2026-09-16): the RECORD NAME of the EffectsPreset this region
   * installs, validated by the GENERATOR against the game's own effects library.
   * This is the region's total identity binding, because `Region.rg_effects` is
   * a required pointer in the engine and a preset DOCUMENT cannot express the
   * whole record.
   *
   * REQUIRED, and that is the ruling rather than a convenience: sections carry
   * no identity to fall back on since part 1 deleted `sec_effects`.
   */
  preset: string;
  /**
   * Optional id of a raster preset DOCUMENT whose program is one CHANNEL of the
   * record `preset` names. Null or absent: this region installs no raster
   * program. NOT a second home for identity.
   */
  rasterRef?: string | null;
  /**
   * Optional id of the parallax scene (a `parallax_config`) this region uses.
   *
   * THE BACKGROUND'S VERTICAL ANCHOR TRIPLE LIVES BEHIND THIS AND NOT ON THE
   * REGION: `v_center_y`, `v_offset` and `v_factor_bg` are `parallax_config`
   * fields, and `Region.rg_parallax` already names a config, so the anchor is a
   * region fact through one indirection. Part 2 adds no new field for it, and a
   * document that authors one is refused.
   */
  sceneRef?: string | null;
  bg?: RegionBg;
  /** Author-facing label, at most 64 characters. Never read by the engine or the generator. */
  name?: string;
}

/** One act's regions document. */
export interface RegionsDocument {
  /** Always 1. Absent: refused. */
  schema: number;
  /** The act this document describes, e.g. `"ojz_act1"`. */
  act: string;
  /**
   * Regions in AUTHOR order, at least one. The engine's resolution order and the
   * sliver rule are not expressed here.
   */
  regions: Region[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Every refusal this codec speaks. `issues` is the list, each entry prefixed
 * with the JSON Pointer of the offending value (or `<document>` for the root),
 * so an author is told WHERE and not only THAT.
 */
export class RegionsDocumentError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'RegionsDocumentError';
    this.issues = issues;
  }
}

/** Schema issues as `<pointer>: <message>` lines. */
function asIssueLines(value: unknown): string[] {
  return validateAgainstSchema(value, REGIONS_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Parse and validate one regions document.
 *
 * `label` is how the file is named back to the author in a refusal; it is
 * PRESENTATION ONLY and no rule is derived from it. Deliberately so: the preset
 * codec checks its `id` against the filename stem because an id becomes an .emp
 * label, and this document's `act` is not that. An identity rule invented here
 * would be a refusal Aurora speaks in the contract's name that the contract
 * never asked for, and it would also make a contract reject-vector
 * indistinguishable from a loader complaint.
 *
 * Throws `RegionsDocumentError` on anything wrong. Loud, never lenient: a
 * document the reader quietly repaired would be written back in the repaired
 * shape over the author's file.
 */
export function parseRegionsDocument(text: string, label = 'regions.json'): RegionsDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new RegionsDocumentError(
      `${label} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new RegionsDocumentError(`${label} must contain a JSON object`);
  }
  const obj = doc as Record<string, unknown>;

  // The version rule first and in its own words, for the reason preset.ts and
  // scene.ts both give: the schema's `const 1` refuses this anyway, but
  // "expected the constant 1" does not tell an author there is deliberately no
  // migration machinery to ask for.
  if (obj.schema !== REGIONS_SCHEMA_VERSION) {
    throw new RegionsDocumentError(
      `${label} declares "schema": ${JSON.stringify(obj.schema)}; the regions contract refuses `
      + `anything but ${REGIONS_SCHEMA_VERSION}. A new schema version is a contract change to `
      + 'every half of the suite, not a file the reader upgrades.',
    );
  }

  const issues = asIssueLines(obj);
  if (issues.length > 0) {
    throw new RegionsDocumentError(`${label} does not match the regions schema`, issues);
  }

  // The object `JSON.parse` produced, never a rebuild from a field list. The
  // schema is closed, so by the time control reaches here its keys ARE the
  // declared keys; handing this object back is what makes "nothing is dropped"
  // structural rather than a promise someone has to keep re-reading.
  return obj as unknown as RegionsDocument;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Serialize a regions document. Validates on the way OUT as well as in, because
 * the writer is the direction the closed schema exists for: an invalid document
 * must never reach disk, and a caller that built one in memory never went
 * through `parseRegionsDocument`.
 *
 * `canonicalizeBySchema` runs for its REFUSAL, not for its ordering: it throws
 * on any key the schema does not declare, so serializing can never silently
 * erase a field. The ordering it builds is then overwritten by section 5's
 * alphabetical sort inside `canonicalJsonPretty`, which is the form that reaches
 * disk.
 */
export function serializeRegionsDocument(doc: RegionsDocument): string {
  const issues = asIssueLines(doc);
  if (issues.length > 0) {
    throw new RegionsDocumentError(
      `refusing to write the regions document for act ${JSON.stringify(doc?.act)}: it does not `
      + 'match the regions schema',
      issues,
    );
  }
  return canonicalJsonPretty(canonicalizeBySchema(doc, REGIONS_SCHEMA));
}
