// MIGRATING AEON'S REAL ACT 1 — editor spec §7 row 7's own subject: "migrate
// act 1, assert nine or ten regions and every sidecar nulled".
//
// ═══ WHY THIS ROW EXISTS BESIDE THE SYNTHETIC ONES ═════════════════════════
//
// `aeon-migrate-sections-roundtrip.test.ts` drives the whole load/command/save
// cycle over a fixture this repository wrote, which is the only way to test the
// save plan. What it cannot say is whether the migration, run on THE ACT THE
// SPEC NAMES, produces the document aeon itself published for that act. That is
// this file: aeon's own nine section sidecars and its own act descriptor at a
// COMMITTED revision, in, and the vendored golden — aeon's hand-authored
// `regions.json` for act 1 — as the comparison.
//
// ⚠ THE COUNT IS DERIVED, NOT ASSERTED. §7 says "nine or ten regions", and §4
// says eight or nine section regions plus the night region "because act 1's nine
// presets are all different, not because the rule changed". So the expectation
// here is computed from the inputs — one region per distinct (preset, sceneRef,
// rasterRef) run, plus one per key-less row — and the golden is what says the
// computation matched aeon's own reading of the same act.
//
// ⚠ AND THE COMPARISON IS FIELD BY FIELD EXCEPT FOR ONE KEY, BY DESIGN. §4
// named the migration's ids (`sec_<lowest index>`) and names ("Sections a, b,
// c"); aeon's table says `sec0` and "Forest, upper left". THE ID HALF OF THAT
// WAS WRONG and was ruled so on 2026-09-16: an id names an emitted symbol, so it
// is a cross-tool contract surface and aeon's spelling is canonical. `id` IS NOW
// INSIDE THE FIELD-FOR-FIELD COMPARISON, both halves of it — the section runs'
// and the key-less row's — because a comparison that omits the field under
// dispute is green by construction and the omitted field was the identity one.
// That is this lane's own finding turned on itself: it is what rows 185 and 188
// paid for.
//
// `name` is the ONE stated difference that remains, and only for the section
// runs: aeon's table carries human labels ("Forest, upper left") where §4
// carries "Sections a, b, c", and nothing has ruled those must agree. The
// KEY-LESS row's name is NOT a stated difference — it is asserted against the
// golden, because the id ruling makes the readable label a CONDITION of itself.
//
// ⚠ ONE ROW OF THIS ACT IS LEFT OUT ON PURPOSE, and the last row in this file
// is about that. aeon's descriptor carries a region row written behind a build
// switch (`if DEBUG == 1`), which Aurora's textual reader cannot evaluate and
// does not try to: it EXCLUDES the row and REPORTS it, so the author's document
// describes the act and not a build of it. Ruled 2026-09-16 and amended the same
// day — the last row cites both by document and section.
//
// SKIPPED LOUDLY WITHOUT AEON, never passed: a row that cannot reach aeon's
// object database measured nothing.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';

import { siblingPathOrUnresolved, siblingPathSource } from '../support/sibling-root.mjs';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';
import { descriptorEffectsRows } from '../../src/core/formats/effects/section-wiring';
import { parseSectionMeta } from '../../src/core/formats/section-meta';
import { parseRegionsDocument } from '../../src/core/formats/regions/document';
import type { RegionRect } from '../../src/core/formats/regions/document';
import {
  planSectionMigration,
  type MigrationInput,
  type MigrationSection,
} from '../../src/core/editing/migrate-sections';
import { coverage, disjointness, type RegionPiece } from '../../src/core/editing/region-geometry';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AEON = siblingPathOrUnresolved('aeon');

/**
 * THE REVISION THIS ROW READS, a full SHA so it cannot move: aeon `807bfdd5`,
 * the revision that shipped the night region, and the same pin
 * `section-wiring.test.ts` reads act 1's descriptor at.
 *
 * ⚠ IT IS NOT THE REVISION THE VENDORED GOLDEN CAME FROM (`9772326`), and the
 * difference is measured rather than waved at — see the last row in this file.
 * `807bfdd5` is an ancestor of `9772326`; the nine sidecar blobs are IDENTICAL
 * at both (checked with `git rev-parse <rev>:<path>` on each), and the
 * descriptor differs by a build-switched extra row that arrived after the pin.
 *
 * ⚠ AND SINCE 2026-09-16 THE PAIR IS COMPARABLE FOR A STRONGER REASON. The
 * reader now EXCLUDES a row written behind a build switch (the ruling in
 * empyrean `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, cited in full on
 * the last row of this file), so the migration produces the same ten regions at
 * BOTH revisions — and the last row makes the golden comparison at `9772326`
 * itself, which is the like-for-like one. This pin is kept because the three
 * rows above it are the landed §7 row and because a second revision reading the
 * same act is a check on the first.
 */
const AEON_PIN = '807bfdd5c723c3eebf7fd613ef40a9709836d3cd';
/**
 * The revision the vendored golden was published at — READ FROM THE SIDECAR,
 * never typed here.
 *
 * ⚠ IT WAS A TYPED CONSTANT AND THAT COST A RED MASTER, 2026-09-16. Two parcels
 * landed the same night: one pinned this value by hand at aeon `97723264`, the
 * other legitimately re-vendored the golden to `57132017` and updated the
 * sidecar. Neither touched the other's lines, so git merged them clean and the
 * byte comparison below failed on a tree where both halves were correct.
 *
 * A typed copy of a value that lives in a machine-readable file is a SECOND
 * SOURCE OF TRUTH, and this repo already paid for that lesson and wrote it
 * down: `src/core/formats/regions/aurora-regions.schema.provenance.json`'s
 * `$why_a_sidecar_and_not_only_a_test_constant` records a pin that lived as a
 * `const` in its drift test and as prose in two more files, and went THREE
 * re-pins stale with nothing going red. The sidecar is the one place; the test
 * reads it. The re-vendor is then a one-file edit and this row follows it.
 */
const GOLDEN_PIN: string = (() => {
  const sidecar = JSON.parse(readFileSync(
    new URL('../fixtures/regions/ojz_act1.regions.provenance.json', import.meta.url), 'utf8',
  )) as { aeon?: { revision?: unknown } };
  const rev = sidecar.aeon?.revision;
  // Loud on unmeasurable: a missing or malformed pin must stop the row, never
  // silently become `undefined` and read as "nothing to compare".
  if (typeof rev !== 'string' || !/^[0-9a-f]{40}$/.test(rev)) {
    throw new Error('ojz_act1.regions.provenance.json has no 40-hex aeon.revision, so the '
      + `golden's published revision is unknown and nothing below can be checked: ${String(rev)}`);
  }
  return rev;
})();

const DESC_REL = 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp';
const metaRel = (i: number) => `games/sonic4/data/editor/ojz/act1/section_${i}.meta.json`;

/** Act 1's shape, from its own descriptor rather than from this file. */
const SECTION_SIZE = 2048;

type Open =
  | { ok: true; dir: string; sha: string }
  | { ok: false; why: string };

function openAeon(): Open {
  if (!existsSync(AEON)) {
    return {
      ok: false,
      why: `no aeon checkout at ${AEON} (resolved by: ${siblingPathSource('aeon') ?? 'unresolved'})`,
    };
  }
  const dir = peerRepo('aeon');
  if (dir === null) return { ok: false, why: `${AEON} is not a git checkout` };
  const sha = resolveRev(dir, AEON_PIN);
  if (sha === null) {
    return { ok: false, why: `${AEON_PIN} does not resolve to a commit in ${dir}` };
  }
  return { ok: true, dir, sha };
}

const aeon = openAeon();

function read(rev: string, rel: string): string | null {
  if (!aeon.ok) return null;
  const r = readAtRev(aeon.dir, rev, rel);
  return r.ok ? r.text : null;
}

/** Where the vendored copy of aeon's act 1 regions table lives in this repo. */
const GOLDEN_REL = 'test/fixtures/regions/ojz_act1.regions.json';

/** The vendored golden — aeon's own regions.json for act 1, bytes unchanged. */
function golden() {
  const path = join(process.cwd(), GOLDEN_REL);
  return parseRegionsDocument(readFileSync(path, 'utf8'), path);
}

const need = (ctx: { skip: (reason: string) => void }): boolean => {
  if (aeon.ok) return true;
  ctx.skip(`SKIPPED, NOT PASSED: ${aeon.why}. This row migrates aeon's real act 1 from its own `
    + `sidecars and act descriptor at ${AEON_PIN} and could not read them. The synthetic `
    + 'migration rows elsewhere still ran; what is unmeasured here is whether the migration '
    + "reproduces aeon's own published regions document for that act.");
  return false;
};

/** Act 1's migration input, read out of aeon at the pin. */
function act1Input(rev = AEON_PIN): MigrationInput {
  const desc = read(rev, DESC_REL);
  if (desc === null) throw new Error(`aeon:${DESC_REL} at ${rev}: not in that tree`);
  const rows = descriptorEffectsRows(desc, 'ojz');
  const count = Object.keys(rows.bindings).length;
  const sections: (MigrationSection | null)[] = [];
  for (let i = 0; i < count; i += 1) {
    // AN ABSENT SIDECAR IS ALL-NULL, which is the generator's own rule
    // (`load_section_sidecars` treats an absent file as all-null) and the load's.
    const text = read(rev, metaRel(i));
    const meta = text === null
      ? { bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null }
      : parseSectionMeta(text);
    sections.push({ index: i, sidecar: meta });
  }
  return {
    actKey: 'ojz_act1',
    // 3x3, derived from the section count the descriptor keys rather than typed.
    gridWidth: Math.round(Math.sqrt(count)),
    gridHeight: Math.round(Math.sqrt(count)),
    sectionSize: SECTION_SIZE,
    sections,
    presets: rows.bindings,
    presetsUsable: true,
    unkeyed: rows.unkeyed.map((u) => ({
      preset: u.preset, edges: u.edges ?? null, line: u.line, constructorName: u.constructorName,
    })),
    // The rows the reader left out because they sit behind a build switch. Not
    // migrated; carried so the plan can name them. Empty at `AEON_PIN`, one row
    // at `GOLDEN_PIN` — which is the whole subject of the last row in this file.
    conditional: rows.conditional.map((c) => ({
      preset: c.preset, line: c.line, constructorName: c.constructorName, condition: c.condition,
    })),
  };
}

/**
 * One `const NAME = <integer>` out of the descriptor text, or null.
 *
 * ⚠ SO NO EDGE IN THIS FILE IS A TYPED NUMBER. The act's geometry belongs to
 * aeon, and a figure retyped here would be a second home for it that goes stale
 * silently. Null when the name is absent or declared more than once, and every
 * caller asserts non-null first, so an unreadable descriptor is LOUD rather than
 * arriving as a zero.
 */
function intConst(desc: string, name: string): number | null {
  const hits = [...desc.matchAll(
    new RegExp(`^[ \\t]*(?:pub[ \\t]+)?const[ \\t]+${name}[ \\t]*=[ \\t]*(-?\\d+)\\b`, 'gm'),
  )];
  return hits.length === 1 ? Number(hits[0][1]) : null;
}

/** A region of the migrated document by id, or undefined. */
function regionById(regions: readonly { id: string; rect: RegionRect }[], id: string) {
  return regions.find((r) => r.id === id);
}

/** The INCLUSIVE right edge of a half-open rect, which is the form aeon writes. */
function rightEdge(rect: RegionRect): number {
  return rect.x + rect.w - 1;
}

describe('migrate aeon\'s act 1', () => {
  it('THE INPUT IS AEON\'S OWN, AND IT CARRIES REFS: the non-vacuous half, asserted first', (ctx) => {
    if (!need(ctx)) return;
    const input = act1Input();
    expect(input.sections).toHaveLength(9);
    // WITHOUT THIS LINE "every sidecar nulled" proves nothing: a set of sidecars
    // that never carried a ref nulls identically to one the migration cleared.
    const carrying = input.sections
      .filter((s) => s !== null && (s.sidecar.sceneRef !== null || s.sidecar.rasterRef !== null));
    expect(carrying.map((s) => s!.index),
      `aeon:${metaRel(0)}… at ${AEON_PIN} carry no sceneRef/rasterRef, so this file is reading `
      + 'the wrong files or the wrong revision').toEqual([0, 4, 5, 6, 7, 8]);
    // And the nine presets really are nine different ones, which is §4's stated
    // reason act 1 produces nine section regions and not fewer.
    expect(new Set(Object.values(input.presets)).size).toBe(9);
    // One key-less row: the night region.
    expect(input.unkeyed.map((u) => u.preset)).toEqual(['OJZ_Preset_Night']);
    expect(input.unkeyed[0].edges,
      `the reader resolved no rectangle for the night row in aeon:${DESC_REL} at ${AEON_PIN}; `
      + 'its edges are named constants and NO VALUE IS SUBSTITUTED').not.toBeNull();
  });

  it('PRODUCES TEN REGIONS: nine runs plus the night row, counted from the input', (ctx) => {
    if (!need(ctx)) return;
    const input = act1Input();
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const doc = plan.document!;

    // DERIVED: one region per distinct (preset, sceneRef, rasterRef) tuple that
    // survives the carve, plus one per key-less row. Nine tuples here because
    // act 1's nine presets are all different — §4's own reason.
    const tuples = new Set(input.sections.map((s) => JSON.stringify(
      [input.presets[s!.index], s!.sidecar.sceneRef, s!.sidecar.rasterRef],
    )));
    expect(tuples.size).toBe(9);
    expect(doc.regions).toHaveLength(tuples.size + input.unkeyed.length);

    // Exactly tiled: no overlap, no hole. The two properties aeon's whole-table
    // ensures refuse the act for.
    const pieces: RegionPiece[] = doc.regions.map((r) => ({ id: r.id, rect: r.rect }));
    expect(disjointness(pieces).overlaps).toEqual([]);
    const act = { x: 0, y: 0, w: 3 * SECTION_SIZE, h: 3 * SECTION_SIZE };
    expect(coverage(act, pieces).unassigned).toEqual([]);

    // Every sidecar listed, every one cleared, all four refs.
    expect(plan.sidecars.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const s of plan.sidecars) {
      expect(s.next, `section ${s.index}`)
        .toEqual({ sceneRef: null, rasterRef: null, bgLayoutRef: null, paletteRef: null });
    }
    // The before-picture is aeon's own, not nulls: undo has something to restore.
    expect(plan.sidecars[0].old.sceneRef).toBe('ojz_act1_start');
    expect(plan.sidecars[0].old.bgLayoutRef).not.toBeNull();
  });

  it('AND IT REPRODUCES AEON\'S OWN GOLDEN, rect for rect and binding for binding', (ctx) => {
    if (!need(ctx)) return;
    const input = act1Input();
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const mine = plan.document!.regions;
    const theirs = golden().regions;
    expect(theirs, 'the vendored golden is empty, so this comparison is against nothing')
      .toHaveLength(10);
    expect(mine).toHaveLength(theirs.length);

    // ── THE VENDORED GOLDEN IS AEON'S OWN FILE, checked and not assumed ────
    //
    // Everything below compares against `test/fixtures/regions/`, a copy. A copy
    // that has drifted would make every agreement below an agreement with
    // ourselves, so the bytes are compared to aeon's at a COMMITTED revision,
    // read through git rather than off the working tree.
    const theirBytes = read(GOLDEN_PIN, 'tools/fixtures/regions/ojz_act1.regions.json');
    expect(theirBytes, `aeon's own regions table is not at that path at ${GOLDEN_PIN}`)
      .not.toBeNull();
    expect(theirBytes, 'the vendored golden has drifted from aeon\'s file')
      .toBe(readFileSync(join(process.cwd(), GOLDEN_REL), 'utf8'));

    // BY POSITION IS LEGITIMATE HERE: §4 fixes the order (section runs in
    // ascending lowest-index order, key-less rows appended after), and aeon's
    // table is written in that same order with the night row appended as row 9.
    const strip = (r: typeof mine[number]) => ({
      // ⚠ `id` IS IN HERE, AND PUTTING IT HERE IS THE POINT OF THE ROW. Until
      // 2026-09-16 this projection carried preset, rect, sceneRef and rasterRef
      // and NOT id, while the ids were asserted separately against their own
      // literals — so the two sides could disagree about identity with every
      // row green, which is exactly what happened twice (`sec_2` against `sec2`,
      // then `ojz_preset_night` against `night`). A projection is a list of what
      // the row can see, and the field left out of it was the one in dispute.
      id: r.id,
      preset: r.preset,
      rect: r.rect,
      sceneRef: r.sceneRef ?? null,
      rasterRef: r.rasterRef ?? null,
    });
    expect(mine.map(strip)).toEqual(theirs.map(strip));

    // ── THE ID, WHICH THIS ROW USED TO RATIFY AS A DIFFERENCE ─────────────
    //
    // ⚠ THE LESSON OF THIS PARCEL, and it is worth more than the rename. Until
    // 2026-09-16 the two id lists below were asserted SIDE BY SIDE against typed
    // literals — `sec_0…` for mine, `sec0…` for aeon's — with a comment calling
    // the difference "by design". Nothing compared them TO EACH OTHER. So the
    // field under dispute was present in the file and still green, because two
    // separate assertions about one field cannot disagree with each other.
    //
    // The id is a CROSS-TOOL CONTRACT SURFACE: empyrean
    // `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, "REGION IDS ARE A
    // CROSS-TOOL CONTRACT SURFACE, and the canonical spelling is aeon's" (ruled
    // 2026-09-16T09:2xZ, OVERTURNABLE BY ONE WORD), with the spec that invented
    // the second spelling corrected at
    // `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` §4
    // item 2 and note (d). A migrated act 1 with the old spelling would have
    // failed aeon's build on the id alone, with identical geometry.
    //
    // So the section-run ids are now asserted AGAINST AEON'S, not against a
    // literal. The count of them is derived: §4 appends the key-less rows last.
    const runCount = mine.length - input.unkeyed.length;
    expect(runCount, 'every region came from a key-less row, so there is no run id to compare')
      .toBeGreaterThan(0);
    expect(mine.slice(0, runCount).map((r) => r.id),
      'the migration spells a section-run id differently from aeon, whose build `ensure` keys on it')
      .toEqual(theirs.slice(0, runCount).map((r) => r.id));

    // ── THE KEY-LESS ROW'S ID AND LABEL ARE THEIR OWN ROW, BELOW ─────────
    //
    // It used to be four more lines here. They moved so that a mutation which
    // moves the key-less id reds an assertion ABOUT the key-less id rather than
    // the whole-table projection above, which fires first and names ten rows.

    // `name` on the SECTION RUNS is NOT in this: aeon's golden carries human
    // labels and §4 carries "Sections a, b, c". Nothing has ruled they must
    // agree, so they are stated.
    expect(mine[0].name).toBe('Sections 0');
    expect(theirs[0].name).toBe('Forest, upper left');
  });

  it('THE KEY-LESS ROW: the RULED id, and the readable label that is its condition', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THIS WAS A DUAL-SPELLING ASSERTION AND IT WAS A HOLDING PATTERN. Row 188
    // installed `.toEqual([['ojz_preset_night'], ['night']])` — exact on both
    // arms — to keep an open question open and go red if either side moved
    // without the other. The question is answered: empyrean
    // `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, "A KEY-LESS ROW'S ID IS
    // ITS PRESET SYMBOL, LOWERCASED - AND AEON'S `night` MOVES" (2026-09-16T09:39Z,
    // OVERTURNABLE BY ONE WORD). Aurora's spelling won and aeon's fixture moved
    // at aeon `a977fa64`, so the two arms are ONE arm now.
    //
    // ⚠ AND NOT §8 Q5. Q5 governs the `name` FIELD, spells ids `sec_N` in BOTH
    // of its arms, and would prove too much if it governed ids: sec4 binds
    // `OJZ_Preset_Depth`, so a preset-derived id rule renames it `depth` against
    // this very golden. The owner has not spoken on the id question.
    const input = act1Input();
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const mine = plan.document!.regions;
    const theirs = golden().regions;
    const runCount = mine.length - input.unkeyed.length;
    expect(runCount, 'every region came from a key-less row, so there is no key-less row to name')
      .toBeLessThan(mine.length);
    const mineKeyless = mine.slice(runCount);
    const theirsKeyless = theirs.slice(runCount);

    // THE SPELLING FIRST, and deliberately before the comparison below. An
    // assertion that two lists agree is silent about WHICH spelling they agreed
    // on: both sides moving back to `night` together would pass it, and so would
    // a migration and a re-vendor that moved in step with nobody's ruling. This
    // line is the ruling's own answer, quoted.
    expect(mineKeyless.map((r) => r.id),
      'the migration no longer mints the RULED id for a key-less row')
      .toEqual(['ojz_preset_night']);
    // And then across the seam, which is what makes it a cross-tool check rather
    // than a restatement of `idFromPreset`.
    expect(mineKeyless.map((r) => r.id),
      'the migration spells the key-less row\'s id differently from aeon, whose golden this is')
      .toEqual(theirsKeyless.map((r) => r.id));

    // ── THE READABLE LABEL, WHICH IS A CONDITION OF THAT RULING ───────────
    //
    // "The ugly id is acceptable precisely because nothing legible is lost:
    // identity is for machines, the label is what the author reads on the map."
    // A migration that minted the id and left `name` as the raw preset symbol
    // would satisfy every line above and take the ruling's own justification
    // with it. Asserted against the GOLDEN's label, which aeon wrote before the
    // ruling and did not move with the id.
    expect(theirsKeyless.map((r) => r.name),
      'the golden carries no label on its key-less row, so this compares nothing')
      .toEqual(['Night']);
    expect(mineKeyless.map((r) => r.name),
      'the key-less region carries no readable label: the id ruling\'s condition is unmet')
      .toEqual(theirsKeyless.map((r) => r.name));
  });

  it('AT THE REVISION CARRYING THE DEBUG DELTA IT IS STILL TEN, and the left-out row is NAMED',
    (ctx) => {
      if (!need(ctx)) return;
      // ═══ THE ROW THIS PARCEL INVERTED, AND WHY IT NOW ASSERTS TEN ═════════
      //
      // Until 2026-09-16 this row asserted ELEVEN, as a disclosure: at
      // `GOLDEN_PIN` act 1's descriptor carries
      //
      //   const OJZ_E2_SNAP_ROWS: array = if DEBUG == 1 {
      //       [ ojz_region(x0: OJZ_SNAP_X0, x1: 6143, ..., effects: OJZ_Preset_NightSnap) ]
      //   } else { [] }
      //
      // and Aurora's textual reader cannot evaluate the switch, so it read that
      // row as unconditional, emitted it, and carved section 2 short.
      //
      // TEN IS CORRECT AND ELEVEN WAS THE BUG. empyrean
      // `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, "The schema stays
      // CLOSED, and the DEBUG eleventh row is a build-time delta (ruled
      // 2026-09-16T05:28:50Z)" and its "AMENDMENT 2026-09-16T09:0xZ": a row
      // behind a build switch is EXCLUDED from the author's document and
      // REPORTED, never included and never refused. Ruled by the hub in the
      // owner's place and OVERTURNABLE BY ONE WORD FROM HIM.
      //
      // ⚠ AND A COUNT ALONE CANNOT SAY THIS. The expectation below is DERIVED
      // from the input, so a reader that returns no key-less rows at all — a
      // broken regex, an unreadable file — moves the expectation with it and
      // ten comes out either way. So the row the reader must STILL FIND is
      // asserted by name first, and the row it must have LEFT OUT is asserted
      // by name too. Neither is implied by the count.
      const desc = read(GOLDEN_PIN, DESC_REL);
      expect(desc, `aeon:${DESC_REL} at ${GOLDEN_PIN} could not be read`).not.toBeNull();
      const rows = descriptorEffectsRows(desc!, 'ojz');

      // ── The key-less row that must SURVIVE: the night region, with edges ──
      expect(rows.unkeyed.map((u) => u.preset),
        'the reader found no key-less row at all, so the ten below would be ten for the wrong '
        + 'reason').toEqual(['OJZ_Preset_Night']);
      expect(rows.unkeyed[0].edges,
        'the night row\'s edges are named constants and NO VALUE IS SUBSTITUTED').not.toBeNull();

      // ── The row that must be LEFT OUT, named, with the switch verbatim ────
      expect(rows.conditional.map((c) => `${c.preset} ${c.constructorName} if ${c.condition}`),
        'the build-switched row must be REPORTED, not silently dropped')
        .toEqual(['OJZ_Preset_NightSnap ojz_region if DEBUG == 1']);
      const snapLine = rows.conditional[0].line;
      expect(desc!.split('\n')[snapLine - 1],
        'the reported line does not hold the row it claims to').toContain('OJZ_Preset_NightSnap');

    });

  it('AT THE REVISION CARRYING THE DEBUG DELTA IT MIGRATES TO TEN, sec2 whole, row NAMED on screen',
    (ctx) => {
      if (!need(ctx)) return;
      // The second half of the row above, split off so a failure here is about
      // the DOCUMENT and a failure there is about the READER. One property per
      // row is not quite reachable when every property needs the same 200 ms of
      // git reads, but two rows put the reader's three lists and the migrated
      // document on separate lines of the report.
      const desc = read(GOLDEN_PIN, DESC_REL);
      expect(desc, `aeon:${DESC_REL} at ${GOLDEN_PIN} could not be read`).not.toBeNull();
      const snapLine = descriptorEffectsRows(desc!, 'ojz').conditional[0]?.line;
      expect(snapLine, 'no build-switched row was reported, so there is nothing to be named')
        .toBeGreaterThan(0);

      // ── Ten regions, and section 2's right edge back where the grid puts it ─
      const input = act1Input(GOLDEN_PIN);
      const plan = planSectionMigration(input);
      expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
      const doc = plan.document!;
      const tuples = new Set(input.sections.map((s) => JSON.stringify(
        [input.presets[s!.index], s!.sidecar.sceneRef, s!.sidecar.rasterRef],
      )));
      expect(doc.regions).toHaveLength(tuples.size + input.unkeyed.length);

      // DERIVED FROM AEON, TWICE OVER, because this edge is the whole subject:
      // the golden's own `sec2` says where the release shape puts it, and the
      // descriptor's `OJZ_SNAP_X0` says where the DEBUG shape would have cut it.
      // Neither number is typed here.
      const theirSec2 = regionById(golden().regions, 'sec2');
      expect(theirSec2, 'the vendored golden has no sec2 to compare against').toBeDefined();
      const mySec2 = regionById(doc.regions, theirSec2!.id);
      expect(mySec2, `the migration produced no ${theirSec2!.id}`).toBeDefined();
      expect(rightEdge(mySec2!.rect),
        'section 2\'s right edge is the section grid\'s, and the golden is where aeon puts it')
        .toBe(rightEdge(theirSec2!.rect));
      const snapX0 = intConst(desc!, 'OJZ_SNAP_X0');
      expect(snapX0, `aeon:${DESC_REL} at ${GOLDEN_PIN} declares no single OJZ_SNAP_X0, so the `
        + 'DEBUG edge this row must NOT be at could not be derived').not.toBeNull();
      expect(rightEdge(mySec2!.rect),
        'section 2 is cut to the DEBUG shape: the build-switched row was migrated after all')
        .not.toBe(snapX0! - 1);

      // ── And at this revision it reproduces aeon's golden outright ─────────
      //
      // `GOLDEN_PIN` is the revision the vendored golden was published at, so
      // this is a like-for-like comparison at ONE revision — which the earlier
      // rows, reading `AEON_PIN`, could not make while the switched row was
      // being migrated.
      // `id` is in this projection for the same reason it is in the one above:
      // this is the like-for-like comparison at ONE revision, and leaving the
      // disputed field out of it is how a divergence stays green.
      const strip = (r: { id: string; preset: string; rect: RegionRect; sceneRef?: string | null;
        rasterRef?: string | null; }) => ({
        id: r.id,
        preset: r.preset, rect: r.rect, sceneRef: r.sceneRef ?? null, rasterRef: r.rasterRef ?? null,
      });
      expect(doc.regions.map(strip)).toEqual(golden().regions.map(strip));

      // ── THE SENTENCE THE AUTHOR READS, which is where this is judged ──────
      //
      // It must name the row (so it is a report and not a shrug) and must read
      // as "expected, and your document is complete" — never as an apology and
      // never as a limitation. The forbidden vocabulary is asserted because the
      // trap the ruling names is a WORDING one: "we could not evaluate this
      // row, sorry" sends an author to fix something that is not theirs.
      const note = plan.notes.find((n) => n.includes('OJZ_Preset_NightSnap'));
      expect(note, `the left-out row is not mentioned anywhere the author will see: `
        + `${JSON.stringify(plan.notes)}`).toBeDefined();
      expect(note).toContain('behind a build switch');
      expect(note).toContain('as intended');
      expect(note).toContain('there is nothing to fix');
      expect(note).toContain(`line ${snapLine}`);
      for (const apology of ['sorry', 'could not', 'cannot', 'unsupported', 'unable',
        'not supported', 'limitation', 'failed']) {
        expect(note!.toLowerCase(),
          `the note reads as a failure of Aurora's ("${apology}") when nothing of the author's `
          + 'is missing').not.toContain(apology);
      }
    });
});
