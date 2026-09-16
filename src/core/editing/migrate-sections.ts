// MIGRATION FROM SECTIONS — editor spec §4, the pure half.
//
// An act authored under the per-section sidecars becomes a regions document
// without anyone retyping nine settings, and the two sources of truth never
// coexist on disk past the moment the author says go. This module decides WHAT
// the migration is; `commands.ts`'s `migrate-sections` carries it as one undo
// step and `providers/regions-migrate.ts` feeds it from the open project.
//
// Pure: plain data in, plain data out. No store, no React, no I/O, no model
// writes — the conventions `section-ops.ts` and `region-geometry.ts` state.
//
// ═══ WHAT §4's PROSE SAYS THAT THE LANDED CONTRACT DOES NOT ════════════════
//
// §4 was written under the PAINTER'S-ORDER model, which the owner's Q1 ruling of
// 2026-09-14T14:54:34Z overturned ("Yeah probablyy go with how we think about
// it" = A, cut right away), and the schema that landed from that ruling is
// `{schema, act, regions[]}` with ONE `rect` per region and `preset` REQUIRED
// and non-null (`core/formats/regions/aurora-regions.schema.json`). The spec
// carries supersession banners on §2.3, §2.5, §3.2 and §5.2 but NOT on §4, so
// three of §4's sentences have no referent in the document this module writes.
// Each is answered here rather than silently dropped, and each is a FINDING in
// the parcel's terms — the landed code is the measurement:
//
//   1. "`defaults`: the tuple that the most sections share … so the largest run
//      becomes the bottom layer and creates no region." THERE IS NO `defaults`
//      KEY and there is no bottom layer. Under the ruling an area no region
//      holds is UNASSIGNED — the editor paints it red and the build refuses it —
//      so a run that "creates no region" would leave a hole where a whole
//      section used to have identity. EVERY run therefore becomes a region with
//      an EXPLICIT preset. aeon's own published golden is the check on that
//      reading and not a preference of mine: `test/fixtures/regions/
//      ojz_act1.regions.json` has NINE section regions and nine explicit
//      presets, including `OJZ_Preset_Plain` on `sec8`, which is exactly the
//      modal tuple §4 would have dissolved into `defaults`.
//
//   2. "Sections with an all-null sidecar and the default preset create
//      nothing." Same reason: that section's pixels would belong to no region.
//      Such a section becomes a region whose `sceneRef` and `rasterRef` are
//      simply absent.
//
//   3. "appended AFTER the section-run regions so they paint over them exactly
//      as the hand-written table has them subtracted." There is no painting and
//      no order: a key-less row CARVES the section runs here, at migration time,
//      which is what "cut right away" means and what produces the hand table's
//      own shrunk rows (aeon's `sec1` w = 1352 and `sec2` x = 4800, the two rows
//      the night region was cut out of). The key-less regions are still appended
//      last, because that is the order §4 asks for and list order now carries no
//      meaning anyway.
//
// ═══ ONE RECT PER REGION, AND WHAT THAT COSTS A CARVE ══════════════════════
//
// §4's "rects being the union of their cells expressed as the fewest rectangles"
// assumed the superseded `rects[]` array. The landed contract gives a region ONE
// rectangle, and the engine reads it the same way: "two rows naming the same
// `rg_effects` are the same region for every engine purpose; an L-shape is two
// rows" (§2.1, from `structs.emp`'s comment block). So a run whose area is not
// one rectangle becomes SEVERAL entries with the same bindings and distinct ids
// (`sec4`, `sec4_a`, …), never one entry with a rectangle bigger than the run.
// Ids must differ because §2.5 rule 1 refuses a duplicate id; the AREA is what
// carries identity to the engine, and the suffix is an editor label.
//
// Act 1 never takes that branch — its nine presets are all different, so every
// run is one section and the night region cuts each of the two it crosses into
// exactly one surviving rectangle — which is precisely why the multi-rect case
// is under test with a fixture that DOES take it.
//
// ═══ REFUSAL, NEVER A HALF MIGRATION ═══════════════════════════════════════
//
// Every refusal below leaves `document` null and `sidecars` empty, so the
// command has nothing to apply and the author is told why. The alternative — a
// document missing one region, or sidecars cleared for an act that never got a
// document — is the exact half state the generator refuses (§2.5 rule 5), and it
// is worse than not migrating, because it is silent. A key-less row whose
// rectangle this reader could not resolve is the sharpest case: dropping it
// would hand its area to whichever section region it was cut out of and change
// the act's identity without a word.

import type { Region, RegionRect, RegionsDocument } from '../formats/regions/document';
import { REGIONS_SCHEMA_VERSION } from '../formats/regions/document';
import type { RowInclusiveEdges } from '../formats/effects/section-wiring';
import {
  coalesceRects,
  fromInclusive,
  intersectRects,
  subtractRectFromSet,
  type Rect,
} from './region-geometry';

/** The id shape both the contract schema and the scene library use. */
const ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * The contract's shape for an `EffectsPreset` RECORD name. Checked here rather
 * than left to the codec so a descriptor that names something unexpected refuses
 * the migration with the row in it, instead of throwing inside the save.
 */
const PRESET_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * The per-section sidecar tuple the migration reads, as Aurora holds it in
 * memory (`core/formats/section-meta.ts`'s four keys, which are also
 * `Section`'s).
 *
 * `bgLayoutRef` and `paletteRef` ARE READ AND THEN DROPPED — the regions file
 * has no field for either (§2.3: aeon deleted the `Sec` fields they would have
 * fed "for having no reader"). They are named here rather than omitted because
 * the migration NULLS them too, and a field the undo has to restore must be a
 * field the plan carries.
 */
export interface SectionSidecarTuple {
  sceneRef: string | null;
  rasterRef: string | null;
  bgLayoutRef: string | null;
  paletteRef: string | null;
}

/** Every ref of one section's sidecar at null — what the migration writes. */
export function clearedSidecarTuple(): SectionSidecarTuple {
  return { sceneRef: null, rasterRef: null, bgLayoutRef: null, paletteRef: null };
}

/** True when this tuple would make `serializeSectionMeta` write a file at all. */
export function sidecarCarriesRef(t: SectionSidecarTuple): boolean {
  return t.sceneRef !== null || t.rasterRef !== null
    || t.bgLayoutRef !== null || t.paletteRef !== null;
}

/**
 * ⚠ THE NARROWER QUESTION THE STATUS LINE AND THE GENERATOR ASK: does this
 * sidecar carry a ref the generator REFUSES beside a regions document? §2.5 rule
 * 5 names `sceneRef` and `rasterRef` and only those two, so a sidecar carrying
 * nothing but a `bgLayoutRef` is not a rule-5 violation even though it is not
 * empty. The two predicates are kept apart because the migration clears BOTH
 * sets and only one of them is what the build objects to.
 */
export function sidecarCarriesIdentityRef(t: SectionSidecarTuple): boolean {
  return t.sceneRef !== null || t.rasterRef !== null;
}

/** One section as the migration sees it: its index, its tuple, its preset. */
export interface MigrationSection {
  index: number;
  sidecar: SectionSidecarTuple;
}

/**
 * A descriptor row with no section key, as the migration needs it: the preset it
 * binds and the rectangle it occupies, in aeon's own inclusive form.
 *
 * `edges` null means the reader could not resolve all four — see
 * `UnkeyedEffectsRow.edges`. It is a REFUSAL here, never a dropped row.
 */
export interface MigrationUnkeyedRow {
  preset: string;
  edges: RowInclusiveEdges | null;
  /** 1-based descriptor line, so a refusal can name the row a human can find. */
  line: number;
  constructorName: string;
}

/** Everything the migration reads. Assembled by the provider; nothing here reaches for it. */
export interface MigrationInput {
  /**
   * The regions document's `act` key, e.g. `ojz_act1`. Composed by the caller
   * from the zone and act ids; refused here when it is not a legal id, because
   * the codec would refuse the document anyway and a refusal with a reason beats
   * a thrown serialization at save time.
   */
  actKey: string;
  gridWidth: number;
  gridHeight: number;
  /** World pixels per section side — `SECTION_PIXEL_SIZE`, passed rather than imported. */
  sectionSize: number;
  /** One entry per grid cell in flat order (`row * gridWidth + col`); null for an empty slot. */
  sections: (MigrationSection | null)[];
  /**
   * `{section index: the preset record its descriptor row binds}` —
   * `SectionRasterWiring.bindings`. A section absent from this map has NO
   * preset, and `preset` is required per region, so the migration refuses.
   */
  presets: Record<number, string>;
  /**
   * Whether `presets` may be read at all: `SectionRasterWiring.descriptor.parsed`.
   * FALSE IS "I COULD NOT LOOK", never "there are no bindings" — the rule every
   * predicate in `section-wiring.ts` follows — and it refuses the migration with
   * that sentence rather than migrating nine sections to no preset.
   */
  presetsUsable: boolean;
  /** Why the descriptor could not be read, when `presetsUsable` is false. */
  presetsUnusableReason?: string;
  /** Rows the descriptor could not key: `SectionRasterWiring.unkeyedRows`. */
  unkeyed: MigrationUnkeyedRow[];
  /**
   * Rows the reader LEFT OUT because they sit inside a build condition:
   * `SectionRasterWiring.conditionalRows`. They are not migrated — that is the
   * 2026-09-16 ruling, see `ConditionalEffectsRow` — and they are here only so
   * the plan can say they were left out.
   *
   * ⚠ NOT A REFUSAL AND NOT A GAP. The amendment of 2026-09-16T09:0xZ rules the
   * conditional row and the conditional edge it mutates ONE delta with ONE
   * treatment: both excluded, both reported, neither an error. A build-only row
   * is not part of the act the author edits, so a document without it is
   * COMPLETE, and the note below has to read that way.
   *
   * Optional because a hand-built input in a test omits it; the provider always
   * sets it, and an omission means "none", which is the only thing an absent
   * list can honestly mean here — the reader never returns undefined.
   */
  conditional?: MigrationConditionalRow[];
}

/**
 * One row left out of the migration because its call sits inside a build
 * condition — `SectionRasterWiring.conditionalRows`, narrowed to what the note
 * has to name: which preset, which row, which line, and the condition verbatim.
 */
export interface MigrationConditionalRow {
  preset: string;
  /** 1-based descriptor line, so the author can find the row. */
  line: number;
  constructorName: string;
  /** The condition as the descriptor writes it, e.g. `DEBUG == 1`. Never evaluated. */
  condition: string;
}

/** One section's sidecar, before and after. `next` is always all-null. */
export interface SidecarClear {
  index: number;
  old: SectionSidecarTuple;
  next: SectionSidecarTuple;
}

/**
 * What a migration would do, or why it would not.
 *
 * `document` is null WHENEVER `refusals` is non-empty, and the two are checked
 * together by every caller: a plan is applied only when it refuses nothing.
 */
export interface MigrationPlan {
  document: RegionsDocument | null;
  /**
   * Every section whose sidecar the migration clears — INCLUDING the sections
   * whose tuple is already all-null, which carry no write and are listed so undo
   * has a complete before-picture and so a count means "sections", not "sections
   * that happened to be dirty".
   */
  sidecars: SidecarClear[];
  refusals: string[];
  /**
   * Things the author should know that are not refusals: a run swallowed whole
   * by a key-less row, a run that needed more than one rectangle, a dropped
   * `bgLayoutRef`.
   */
  notes: string[];
}

/** The act's own rectangle, from the grid. */
function actRect(input: MigrationInput): Rect {
  return {
    x: 0,
    y: 0,
    w: input.gridWidth * input.sectionSize,
    h: input.gridHeight * input.sectionSize,
  };
}

/** One grid cell's rectangle in world pixels. */
function cellRect(index: number, input: MigrationInput): Rect {
  const col = index % input.gridWidth;
  const row = Math.floor(index / input.gridWidth);
  return {
    x: col * input.sectionSize,
    y: row * input.sectionSize,
    w: input.sectionSize,
    h: input.sectionSize,
  };
}

/**
 * The tuple two sections must share to be one run: the preset AND both refs.
 *
 * `bgLayoutRef` and `paletteRef` are deliberately NOT in it. The regions file
 * cannot express either, so two sections that differ only there produce
 * identical regions, and splitting the run on a difference the document cannot
 * carry would emit two regions a reader could not tell apart.
 */
function runKey(preset: string, t: SectionSidecarTuple): string {
  return JSON.stringify([preset, t.sceneRef, t.rasterRef]);
}

/**
 * 4-CONNECTED RUNS over the section grid (§4). Flood fill, so an L of four
 * sections sharing a tuple is ONE run and two diagonal ones are two.
 *
 * Returns runs in ascending order of their lowest section index, which is also
 * the order their ids are built from, so the output is deterministic.
 */
function contiguousRuns(input: MigrationInput, keyOf: (index: number) => string | null): number[][] {
  const seen = new Set<number>();
  const runs: number[][] = [];
  const total = input.gridWidth * input.gridHeight;
  for (let start = 0; start < total; start += 1) {
    if (seen.has(start)) continue;
    const key = keyOf(start);
    if (key === null) continue;
    const run: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const at = stack.pop()!;
      run.push(at);
      const col = at % input.gridWidth;
      const row = Math.floor(at / input.gridWidth);
      const neighbours: Array<[number, number]> = [
        [col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1],
      ];
      for (const [c, r] of neighbours) {
        if (c < 0 || r < 0 || c >= input.gridWidth || r >= input.gridHeight) continue;
        const n = r * input.gridWidth + c;
        if (seen.has(n) || keyOf(n) !== key) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    runs.push(run.sort((a, b) => a - b));
  }
  return runs.sort((a, b) => a[0] - b[0]);
}

/** The contract's `name` cap. A longer name is a document the codec refuses. */
const NAME_MAX = 64;

/**
 * `Sections 0, 1, 2` — §4's name, with the run's members in ascending order.
 *
 * A run big enough to overrun the contract's 64-character `name` gets a COUNTED
 * form instead of a truncated list: a name cut mid-number would read as a
 * different set of sections, which is worse than a shorter true sentence. The
 * fallback never claims the run is a contiguous range — it is not, necessarily —
 * only how many sections it holds and which one names it.
 */
function runName(run: readonly number[]): string {
  const listed = `Sections ${run.join(', ')}`;
  if (listed.length <= NAME_MAX) return listed;
  return `${run.length} sections, from ${run[0]}`;
}

/**
 * An id for a key-less row, from the preset it binds: THE WHOLE PRESET SYMBOL,
 * lowercased, `[^a-z0-9_]` folded to `_`, a leading `_` stripped, truncated to
 * the contract pattern's 32. `OJZ_Preset_Night` gives `ojz_preset_night`.
 *
 * ⚠ THE RULE IS RULED, AND IT IS NOT §8 Q5. Empyrean
 * `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, "A KEY-LESS ROW'S ID IS ITS
 * PRESET SYMBOL, LOWERCASED - AND AEON'S `night` MOVES" (2026-09-16T09:39Z,
 * OVERTURNABLE BY ONE WORD), with the same rule in the editor spec's §4 item 3.
 * Q5 governs the `name` FIELD: its text spells ids `sec_N` in BOTH arms and
 * offers a choice between two NAME schemes, and had it governed ids it would
 * prove too much, since sec4 binds `OJZ_Preset_Depth` and a preset-derived id
 * rule renames it `depth` against aeon's golden. The owner has not spoken on
 * the id question.
 *
 * ⚠ AND DO NOT "IMPROVE" IT BY STRIPPING THE `<ACT>_Preset_` PREFIX. That
 * reproduces the golden for 8 of act 1's 10 rows including this one and then
 * silently gives `depth` for sec4 and `plain` for sec8; it is also Aurora
 * reverse-engineering a foreign namespace's internal structure, which the
 * cited-versus-minted principle forbids, and it collides, since a key-less row
 * bound to `OJZ_Preset_Sec5` would mint `sec5` on top of a section run's id.
 * The whole-preset rule has no such seam. The ruling records all three.
 *
 * ⚠ THE ID IS MINTED ONCE AND NEVER RE-DERIVED, which is the answer to the
 * ruling's own strongest objection: a stable identity is being derived from a
 * MUTABLE cited name. It is derived HERE, at migration, written into the
 * document, and read back as data ever after. A later preset rename therefore
 * leaves `ojz_preset_night` bound to some other preset -- ugly, not broken, and
 * stable, which is what `id` is for. Anything that re-derives an id from a
 * preset on a later read is a defect, not a repair; `src/core/editing/__tests__/migrate-sections.test.ts`
 * asserts the property from the other side.
 */
function idFromPreset(preset: string): string {
  const folded = preset.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+/, '').slice(0, 32);
  return folded;
}

/**
 * The readable label for a key-less row's region: the preset symbol with its
 * namespace marker taken off. `OJZ_Preset_Night` gives `Night`.
 *
 * ⚠ THIS IS A CONDITION OF THE ID RULING ABOVE, NOT A GARNISH. The ruling's own
 * sentence: "the migration writes `id: "ojz_preset_night"` AND `name: "Night"`.
 * The ugly id is acceptable precisely because nothing legible is lost -- identity
 * is for machines, the label is what the author sees on the map." A migration
 * that wrote the minted id and left the label as the raw symbol would take the
 * ruling's justification with it, so this function is load-bearing.
 *
 * WHY STRIPPING IS ALLOWED HERE AND FORBIDDEN FOR THE ID. The schema calls
 * `name` an "Author-facing label. Never read by the engine or the generator",
 * so it is not an identity and nothing binds to it: a wrong guess costs a
 * clumsy word on a panel, where a wrong id costs a failed build. The id's
 * objection to prefix-stripping was that it made a MINTED IDENTITY depend on a
 * foreign namespace's internal shape. A label already depends on it.
 *
 * AFTER THE LAST `Preset_`, NOT THE LAST `_`. Taking the final underscore
 * segment would render `OJZ_Preset_Deep_Forest` as "Forest" and lose a word
 * without saying so. This form either strips exactly the marker or keeps the
 * whole symbol, so the label is always a verbatim substring of the preset and a
 * reader can always get back to it. A symbol with no marker keeps its whole
 * self, which is a plain word more often than not.
 */
function labelFromPreset(preset: string): string {
  const marker = /Preset_/gi;
  let cut = 0;
  for (const m of preset.matchAll(marker)) cut = m.index + m[0].length;
  const tail = preset.slice(cut);
  return tail.length > 0 ? tail : preset;
}

/**
 * `_a`, `_b`, `_c`… for the second and later rectangles of one run.
 *
 * THE UNDERSCORE STAYS HERE even though it left the base id (see `runId`): it
 * is the only thing separating the suffix from the run's index, and `sec10a`
 * against `sec1` followed by `0a` is a reading nobody should have to make. It
 * is also not a cross-tool spelling — a multi-rect run is an Aurora shape aeon
 * has no row for — so nothing on the other side names it.
 */
function pieceSuffix(n: number): string {
  return `_${String.fromCharCode('a'.charCodeAt(0) + n - 1)}`;
}

/**
 * The id of one rectangle of a section run: AEON'S SPELLING, `sec<lowest index>`.
 *
 * ⚠ NO UNDERSCORE, AND THAT IS A CONTRACT SURFACE RATHER THAN A LABEL. Until
 * 2026-09-16 this emitted `sec_2` where aeon's own regions table, and the DEBUG
 * delta ruling's `ensure`, both say `sec2` — so a freshly migrated act 1 would
 * have failed aeon's build ON THE ID ALONE, with identical geometry. The
 * divergence came from empyrean's editor spec §4, which invented a second
 * spelling for an id that already had one; it is corrected there, at
 * `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` §4 item 2
 * and its note (d), and the ruling is empyrean `docs/AURORA_REGIONS_SCHEMA.md`
 * at `origin/main`, "REGION IDS ARE A CROSS-TOOL CONTRACT SURFACE, and the
 * canonical spelling is aeon's" (ruled 2026-09-16T09:2xZ, OVERTURNABLE BY ONE
 * WORD).
 *
 * The schema's `id` PATTERN does not settle it — `^[a-z][a-z0-9_]{0,31}$` admits
 * both — but its `id` DESCRIPTION does: "Used by the editor and by the
 * generator's emitted symbol names". An id that names an emitted symbol is not a
 * tool's to spell. The guard that would have caught this was never the problem:
 * keying the `ensure` on the id is deliberate, so a renamed row fails the build
 * instead of silently cutting the wrong one.
 */
function runId(lowestIndex: number, piece: number): string {
  return `sec${lowestIndex}${piece === 0 ? '' : pieceSuffix(piece)}`;
}

/**
 * PLAN THE MIGRATION. Reads §4's inputs, produces §4's document and the sidecar
 * clears that go with it, or refuses with reasons and produces neither.
 */
export function planSectionMigration(input: MigrationInput): MigrationPlan {
  const refusals: string[] = [];
  const notes: string[] = [];
  const total = input.gridWidth * input.gridHeight;

  // ── THE BUILD-ONLY ROWS, SAID FIRST AND SAID AS A COMPLETION ─────────────
  //
  // ⚠ THE WORDING IS THE POINT OF THIS BLOCK, and getting it wrong is the
  // failure the 2026-09-16 ruling names. "We could not evaluate this row,
  // sorry" sends an author to look for something of theirs to fix WHEN THERE IS
  // NOTHING OF THEIRS TO FIX AND NOTHING WAS LOST: the excluded row is a
  // build-time look-fixture, and by the ruling's own sentences — "an Aurora
  // author has no DEBUG and no release", "the document describes the game, a
  // look-fixture is not the game" — it is not part of the act they edit. So the
  // sentence says the row was left out AS INTENDED, says the document is
  // complete without it, and says there is nothing to fix. It reports Aurora's
  // decision, never Aurora's limitation.
  //
  // IT ALSO CLAIMS NO KNOWLEDGE IT DOES NOT HAVE. "Behind a build switch", never
  // "the debug row" and never "the release truth": Aurora has no DEBUG and no
  // release, so which arm ships is not a thing it can say. What it can say is
  // that the row is switched, and it quotes the switch in the descriptor's own
  // words rather than interpreting it.
  //
  // IT IS A REPRESENTED STATE, NOT AN ABSENCE: an excluded row always produces
  // this note, in every plan, refusal or not (`notes` rides both exits). A row
  // left out with nothing on screen would be a drop wearing an exclusion's
  // name, which is the thing the reader's `conditional` list exists to prevent.
  const buildOnly = input.conditional ?? [];
  if (buildOnly.length > 0) {
    const one = buildOnly.length === 1;
    const named = buildOnly
      .map((r) => `${r.preset} (${r.constructorName} at descriptor line ${r.line}, inside `
        // The reader reports an else arm as the bare word, so the sentence does
        // not print "inside `if else`" — it says which arm, in the file's words.
        + (r.condition === 'else' ? 'an `else` arm)' : `\`if ${r.condition}\`)`))
      .join('; ');
    notes.push(
      `${buildOnly.length} descriptor ${one ? 'row sits' : 'rows sit'} behind a build switch and `
      + `${one ? 'was' : 'were'} left out, as intended: ${named}. A row behind a build switch `
      + `belongs to one build of the ROM rather than to the act you edit, so your document is `
      + `complete without ${one ? 'it' : 'them'} and there is nothing to fix.`,
    );
  }

  if (!ID_PATTERN.test(input.actKey)) {
    refusals.push(
      `"${input.actKey}" is not a legal regions-document act key (${ID_PATTERN.source}), so the `
      + 'document the codec would accept cannot be built for this act',
    );
  }
  if (input.gridWidth < 1 || input.gridHeight < 1 || input.sectionSize < 1) {
    refusals.push(
      `this act's grid is ${input.gridWidth}x${input.gridHeight} sections of ${input.sectionSize} `
      + 'px, which encloses no area',
    );
  }
  if (input.sections.length !== total) {
    refusals.push(
      `this act declares a ${input.gridWidth}x${input.gridHeight} grid (${total} slots) but `
      + `carries ${input.sections.length} section slots, so which slot is which cell cannot be `
      + 'read off the flat index',
    );
  }
  if (!input.presetsUsable) {
    refusals.push(
      'the act descriptor could not be read, so no section has a preset to bind and `preset` is '
      + `required on every region: ${input.presetsUnusableReason ?? 'reason not recorded'}`,
    );
  }

  // ── The per-section reading, and every way it can be incomplete ──────────
  const tupleOf = new Map<number, { preset: string; sidecar: SectionSidecarTuple }>();
  const missingSection: number[] = [];
  const missingPreset: number[] = [];
  for (let i = 0; i < total; i += 1) {
    const section = input.sections[i] ?? null;
    if (section === null) {
      missingSection.push(i);
      continue;
    }
    const preset = input.presetsUsable ? input.presets[section.index] : undefined;
    if (preset === undefined) {
      if (input.presetsUsable) missingPreset.push(i);
      continue;
    }
    if (!PRESET_PATTERN.test(preset)) {
      refusals.push(
        `the descriptor binds section ${section.index} to "${preset}", which is not a legal `
        + `EffectsPreset record name (${PRESET_PATTERN.source}); the codec would refuse the `
        + 'document at save time',
      );
      continue;
    }
    tupleOf.set(i, { preset, sidecar: section.sidecar });
  }
  if (missingSection.length > 0) {
    refusals.push(
      `${missingSection.length} of this act's ${total} grid slots hold no section `
      + `(${missingSection.join(', ')}), so their sidecars cannot be read and their pixels would `
      + 'belong to no region',
    );
  }
  if (missingPreset.length > 0) {
    refusals.push(
      `the descriptor binds no preset to ${missingPreset.length === 1 ? 'section' : 'sections'} `
      + `${missingPreset.join(', ')}, and \`preset\` is required on every region. Aurora will `
      + 'not invent one',
    );
  }

  // ── The key-less rows, whose rectangles carve ────────────────────────────
  const carves: Array<{ rect: Rect; row: MigrationUnkeyedRow }> = [];
  for (const row of input.unkeyed) {
    if (row.edges === null || row.edges === undefined) {
      refusals.push(
        `the ${row.constructorName} row at descriptor line ${row.line} binds ${row.preset} to no `
        + 'section and Aurora could not resolve its four edges out of the descriptor, so the '
        + 'region it describes cannot be built. NO VALUE IS SUBSTITUTED: dropping the row would '
        + 'hand its area to the section regions it was cut out of',
      );
      continue;
    }
    const { x0, x1, y0, y1 } = row.edges;
    if (x1 < x0 || y1 < y0) {
      refusals.push(
        `the ${row.constructorName} row at descriptor line ${row.line} is inverted `
        + `(x ${x0}..${x1}, y ${y0}..${y1}); inclusive bounds contain no point that way`,
      );
      continue;
    }
    if (!PRESET_PATTERN.test(row.preset)) {
      refusals.push(
        `the ${row.constructorName} row at descriptor line ${row.line} binds "${row.preset}", `
        + `which is not a legal EffectsPreset record name (${PRESET_PATTERN.source})`,
      );
      continue;
    }
    const rect = fromInclusive(row.edges);
    if (intersectRects(rect, actRect(input)) === null) {
      refusals.push(
        `the ${row.constructorName} row at descriptor line ${row.line} (${rect.w}x${rect.h} at `
        + `${rect.x},${rect.y}) lies entirely outside this ${input.gridWidth}x${input.gridHeight} `
        + 'act, so the descriptor and the act disagree about the act\'s size',
      );
      continue;
    }
    carves.push({ rect, row });
  }

  if (refusals.length > 0) return { document: null, sidecars: [], refusals, notes };

  // ── One region per contiguous run, carved by the key-less rows ───────────
  const runs = contiguousRuns(input, (i) => {
    const t = tupleOf.get(i);
    return t === undefined ? null : runKey(t.preset, t.sidecar);
  });

  const regions: Region[] = [];
  const usedIds = new Set<string>();
  for (const run of runs) {
    const t = tupleOf.get(run[0])!;
    let rects: Rect[] = coalesceRects(run.map((i) => cellRect(i, input)));
    for (const carve of carves) rects = subtractRectFromSet(rects, carve.rect);
    rects = coalesceRects(rects);
    if (rects.length === 0) {
      notes.push(
        `${runName(run)} became no region: a key-less descriptor row covers every pixel of it, so `
        + `its binding (${t.preset}) has no area left to hold`,
      );
      continue;
    }
    if (rects.length > 1) {
      notes.push(
        `${runName(run)} needed ${rects.length} rectangles: the contract carries one rect per `
        + 'region, so it is that many entries sharing the same bindings (the engine reads them as '
        + 'one identity, since two rows naming the same preset are the same region to it)',
      );
    }
    rects.forEach((rect, n) => {
      const id = runId(run[0], n);
      usedIds.add(id);
      regions.push(regionOf(id, runName(run), t.preset, rect, t.sidecar));
    });
    if (t.sidecar.bgLayoutRef !== null || t.sidecar.paletteRef !== null) {
      notes.push(
        `${runName(run)}: ${[
          t.sidecar.bgLayoutRef !== null ? `bgLayoutRef "${t.sidecar.bgLayoutRef}"` : null,
          t.sidecar.paletteRef !== null ? `paletteRef "${t.sidecar.paletteRef}"` : null,
        ].filter((s) => s !== null).join(' and ')} was read and DROPPED: the regions file has no `
        + 'field for it (§2.3: aeon deleted the section fields they fed, for having no reader)',
      );
    }
  }

  // ── The key-less rows themselves, appended last (§4 item 3) ──────────────
  //
  // ⚠ TWO KEY-LESS ROWS THAT MINT ONE ID REFUSE THE MIGRATION. THERE IS NO
  // SUFFIXING SCHEME HERE, and its absence is the ruling rather than an
  // omission: empyrean `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, "A
  // KEY-LESS ROW'S ID IS ITS PRESET SYMBOL, LOWERCASED", 2026-09-16T09:39Z.
  // Two key-less rows sharing a preset are two rows Aurora cannot tell apart
  // from its own input -- `{preset, edges, line, constructorName}` carries no
  // name and no key -- so a suffix would hand one of them an identity decided by
  // the order they happen to appear in a descriptor, which is not a stable
  // identity at all. The author is the one who can say which is which, so the
  // refusal names BOTH descriptor lines and stops.
  //
  // THE SAME REFUSAL COVERS THE TRUNCATION CASE, and that is why the collision
  // is computed on the MINTED id and not on the preset: two distinct presets
  // whose lowercased symbols agree in their first 32 characters mint one id
  // through `slice(0, 32)`, with nothing about the presets themselves to warn
  // anyone. It is the same defect arriving by a quieter road.
  const minted = carves.map((carve) => ({ carve, id: idFromPreset(carve.row.preset) }));
  const byMintedId = new Map<string, typeof minted>();
  for (const m of minted) {
    const at = byMintedId.get(m.id);
    if (at === undefined) byMintedId.set(m.id, [m]);
    else at.push(m);
  }
  for (const m of minted) {
    const { carve, id } = m;
    if (!ID_PATTERN.test(id)) {
      refusals.push(
        `the ${carve.row.constructorName} row at descriptor line ${carve.row.line} binds `
        + `"${carve.row.preset}", from which no legal region id (${ID_PATTERN.source}) can be `
        + 'built, and Aurora will not name a region something the codec refuses',
      );
      continue;
    }
    const sharing = byMintedId.get(id)!;
    if (sharing.length > 1) {
      // Said ONCE for the group, by its first row: the sentence already names
      // every row in the clash, so one per row would be the same paragraph
      // twice with nothing new in the second copy.
      if (sharing[0] !== m) continue;
      refusals.push(
        `${sharing.length} descriptor rows with no section key would both be called "${id}": `
        + `${sharing.map((o) => `${o.carve.row.constructorName} at line ${o.carve.row.line} `
          + `binding ${o.carve.row.preset}`).join(', and ')}. A key-less row is named after the `
        + 'preset it binds, so two of them binding one preset have one name and nothing to tell '
        + 'them apart; Aurora will not invent a suffix, because the id it invented would depend on '
        + 'the order the rows appear in the descriptor. Give one of them a section key, or bind it '
        + 'to its own preset',
      );
      continue;
    }
    if (usedIds.has(id)) {
      refusals.push(
        `the ${carve.row.constructorName} row at descriptor line ${carve.row.line} binds `
        + `"${carve.row.preset}", which is named "${id}" -- and a section run in this act already `
        + 'has that id. Two regions with one id are one region to aeon, whose loader refuses the '
        + 'document outright, and Aurora will not invent a suffix to hide the clash',
      );
      continue;
    }
    usedIds.add(id);
    regions.push(regionOf(id, labelFromPreset(carve.row.preset), carve.row.preset, carve.rect, {
      sceneRef: null, rasterRef: null, bgLayoutRef: null, paletteRef: null,
    }));
  }

  if (refusals.length > 0) return { document: null, sidecars: [], refusals, notes };
  if (regions.length === 0) {
    refusals.push(
      'this act produced no regions at all, and `regions` is minItems 1 in the contract, so there '
      + 'is no document to write',
    );
    return { document: null, sidecars: [], refusals, notes };
  }

  const sidecars: SidecarClear[] = [];
  for (let i = 0; i < total; i += 1) {
    const section = input.sections[i];
    if (!section) continue;
    sidecars.push({
      index: section.index,
      old: { ...section.sidecar },
      next: clearedSidecarTuple(),
    });
  }

  return {
    document: { schema: REGIONS_SCHEMA_VERSION, act: input.actKey, regions },
    sidecars,
    refusals,
    notes,
  };
}

/**
 * One region entry.
 *
 * ⚠ A NULL BINDING IS WRITTEN AS AN ABSENT KEY, not as an explicit null. Both
 * are legal in the contract and mean the same thing to the generator, and the
 * panel shows them the same way; absence is what aeon's own golden writes, and a
 * migration output that a human diffs against that golden should not differ from
 * it in a way that means nothing.
 */
function regionOf(
  id: string, name: string, preset: string, rect: Rect, sidecar: SectionSidecarTuple,
): Region {
  const region: Region = { id, name, preset, rect: { ...rect } as RegionRect };
  if (sidecar.sceneRef !== null) region.sceneRef = sidecar.sceneRef;
  if (sidecar.rasterRef !== null) region.rasterRef = sidecar.rasterRef;
  return region;
}
