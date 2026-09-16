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
// (`sec_4`, `sec_4_b`, …), never one entry with a rectangle bigger than the run.
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
 * An id for a key-less row, from the preset it binds.
 *
 * §8 Q5's recommendation, which the owner left standing ("Doesn't matter too
 * much"): "the preset name when the preset is explicit and `sec_N` otherwise".
 * A key-less row HAS no section list to be named after, so the preset is the
 * only thing about it an author would recognise. Lowercased and punctuation
 * folded to `_` so it satisfies the contract's id pattern, with the pattern
 * checked afterwards rather than assumed.
 */
function idFromPreset(preset: string): string {
  const folded = preset.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+/, '').slice(0, 32);
  return folded;
}

/** `a`, `b`, `c`… for the second and later rectangles of one run. */
function pieceSuffix(n: number): string {
  return `_${String.fromCharCode('a'.charCodeAt(0) + n - 1)}`;
}

/**
 * PLAN THE MIGRATION. Reads §4's inputs, produces §4's document and the sidecar
 * clears that go with it, or refuses with reasons and produces neither.
 */
export function planSectionMigration(input: MigrationInput): MigrationPlan {
  const refusals: string[] = [];
  const notes: string[] = [];
  const total = input.gridWidth * input.gridHeight;

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
      + `${missingPreset.join(', ')}, and \`preset\` is required on every region — Aurora will `
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
      const id = `sec_${run[0]}${n === 0 ? '' : pieceSuffix(n)}`;
      usedIds.add(id);
      regions.push(regionOf(id, runName(run), t.preset, rect, t.sidecar));
    });
    if (t.sidecar.bgLayoutRef !== null || t.sidecar.paletteRef !== null) {
      notes.push(
        `${runName(run)}: ${[
          t.sidecar.bgLayoutRef !== null ? `bgLayoutRef "${t.sidecar.bgLayoutRef}"` : null,
          t.sidecar.paletteRef !== null ? `paletteRef "${t.sidecar.paletteRef}"` : null,
        ].filter((s) => s !== null).join(' and ')} was read and DROPPED — the regions file has no `
        + 'field for it (§2.3: aeon deleted the section fields they fed, for having no reader)',
      );
    }
  }

  // ── The key-less rows themselves, appended last (§4 item 3) ──────────────
  for (const carve of carves) {
    let id = idFromPreset(carve.row.preset);
    if (!ID_PATTERN.test(id)) {
      refusals.push(
        `the ${carve.row.constructorName} row at descriptor line ${carve.row.line} binds `
        + `"${carve.row.preset}", from which no legal region id (${ID_PATTERN.source}) can be `
        + 'built, and Aurora will not name a region something the codec refuses',
      );
      continue;
    }
    if (usedIds.has(id)) {
      let n = 1;
      while (usedIds.has(`${id}${pieceSuffix(n)}`)) n += 1;
      id = `${id}${pieceSuffix(n)}`;
    }
    usedIds.add(id);
    regions.push(regionOf(id, carve.row.preset, carve.row.preset, carve.rect, {
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
