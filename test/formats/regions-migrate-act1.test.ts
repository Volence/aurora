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
// ⚠ AND THE COMPARISON IS FIELD BY FIELD EXCEPT FOR TWO KEYS, BY DESIGN. §4
// names the migration's ids (`sec_<lowest index>`) and names ("Sections a, b,
// c"); aeon's golden was hand-authored with `sec0` and "Forest, upper left".
// Neither is a wire value — the engine reads no region id (§2.3) — so they are
// compared as a KNOWN difference rather than quietly excluded.
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
 * descriptor differs by a DEBUG-conditional eleventh row that arrived after the
 * pin. The golden is the RELEASE shape of that table, which is the shape this
 * pin's descriptor carries outright, so the pair is comparable — and the row
 * below states what a reader at the newer revision would get instead.
 */
const AEON_PIN = '807bfdd5c723c3eebf7fd613ef40a9709836d3cd';
/** The revision the vendored golden was published at (its provenance sidecar's `aeon.revision`). */
const GOLDEN_PIN = '97723264e3ec975e46b1c2569ad9aadb00f5074a';

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

/** The vendored golden — aeon's own regions.json for act 1, bytes unchanged. */
function golden() {
  const path = join(process.cwd(), 'test/fixtures/regions/ojz_act1.regions.json');
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
  };
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
    const plan = planSectionMigration(act1Input());
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const mine = plan.document!.regions;
    const theirs = golden().regions;
    expect(theirs, 'the vendored golden is empty, so this comparison is against nothing')
      .toHaveLength(10);
    expect(mine).toHaveLength(theirs.length);

    // BY POSITION IS LEGITIMATE HERE AND ONLY HERE: §4 fixes the order (section
    // runs in ascending lowest-index order, key-less rows appended after), and
    // aeon's table is written in that same order with the night row appended as
    // row 9. The ids differ by design, so there is no id to diff by — which is
    // why the shape of the comparison is stated rather than assumed.
    const strip = (r: typeof mine[number]) => ({
      preset: r.preset,
      rect: r.rect,
      sceneRef: r.sceneRef ?? null,
      rasterRef: r.rasterRef ?? null,
    });
    expect(mine.map(strip)).toEqual(theirs.map(strip));

    // THE KNOWN DIFFERENCE, asserted rather than excluded: ids and names. Neither
    // is a wire value — the engine reads no region id.
    expect(mine.map((r) => r.id))
      .toEqual(['sec_0', 'sec_1', 'sec_2', 'sec_3', 'sec_4', 'sec_5', 'sec_6', 'sec_7', 'sec_8',
        'ojz_preset_night']);
    expect(theirs.map((r) => r.id))
      .toEqual(['sec0', 'sec1', 'sec2', 'sec3', 'sec4', 'sec5', 'sec6', 'sec7', 'sec8', 'night']);
    expect(mine[0].name).toBe('Sections 0');
    expect(theirs[0].name).toBe('Forest, upper left');
  });

  it('⚠ AT AEON\'S LATER REVISION THE SAME READING GIVES ELEVEN REGIONS, and here is why', (ctx) => {
    if (!need(ctx)) return;
    // A MEASURED LIMIT, not a failure. At `9772326` (the revision the golden was
    // published at) act 1's descriptor gained a DEBUG-only region row:
    //
    //   const OJZ_E2_SNAP_ROWS: array = if DEBUG == 1 {
    //       [ ojz_region(x0: OJZ_SNAP_X0, x1: 6143, …, effects: OJZ_Preset_NightSnap) ]
    //   } else { [] }
    //
    // Aurora's descriptor reader is textual: it pairs each `effects:` with the
    // `sec:` inside its own call and does not evaluate `if DEBUG == 1`. So that
    // row reads as a SECOND key-less row, and a migration run against that
    // revision would emit it as a region and carve section 2 at x 5600 — a
    // document that matches the DEBUG shape of the table and not the release
    // shape aeon's own golden carries.
    //
    // This row exists so the limit is a tested statement rather than a surprise
    // during somebody's migration. It is TAGGED for the controller in the
    // parcel's review packet.
    const desc = read(GOLDEN_PIN, DESC_REL);
    expect(desc, `aeon:${DESC_REL} at ${GOLDEN_PIN} could not be read`).not.toBeNull();
    const rows = descriptorEffectsRows(desc!, 'ojz');
    // ⚠ IN THIS ORDER, which is the file's and not the table's: the DEBUG row is
    // DECLARED above `OJZ_ACT1_REGION_ROWS` (as `OJZ_E2_SNAP_ROWS`, appended to
    // the table with `++`), and this reader walks the text. So the migration
    // would append it BEFORE the night region — one more way a reader that
    // cannot see `if DEBUG == 1` differs from the table the build emits.
    expect(rows.unkeyed.map((u) => u.preset))
      .toEqual(['OJZ_Preset_NightSnap', 'OJZ_Preset_Night']);
    // The debug row's own rectangle resolves, which is exactly why it would be
    // emitted rather than refused.
    expect(rows.unkeyed[0].edges).toEqual({ x0: 5600, x1: 6143, y0: 0, y1: 2047 });
    // And the pin this file reads carries only the release shape, which is what
    // makes the golden comparison above a like-for-like one.
    const atPin = descriptorEffectsRows(read(AEON_PIN, DESC_REL)!, 'ojz');
    expect(atPin.unkeyed.map((u) => u.preset)).toEqual(['OJZ_Preset_Night']);
  });
});
