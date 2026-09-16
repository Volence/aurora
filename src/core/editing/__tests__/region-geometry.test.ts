/**
 * REGION GEOMETRY - the suite that has to be right before anything is wired to it.
 *
 * Three populations, kept apart on purpose:
 *
 *   1. HAND CASES over the primitive. Rect subtraction is where the bugs live,
 *      so every shape it can produce (none, one, two, three, four pieces, plus
 *      containment and edge-touching) has its own row with the exact rectangles
 *      written out. A property test cannot replace these: it would tell me the
 *      invariant held without telling me the decomposition was the one I meant.
 *
 *   2. PROPERTY ROWS over random draws. Disjointness and "assigned plus
 *      unassigned equals the act" after EVERY operation, over hundreds of
 *      random draws from a seeded generator. A property test that never
 *      generated an overlapping pair is vacuous, so the generator's own output
 *      is CENSUSED and the census is asserted: if no draw ever split a rectangle
 *      into four, the row that claims to cover a four-way split fails.
 *
 *   3. THE RULES, DERIVED FROM AEON AT A COMMITTED REVISION. The minimum span
 *      and the camera centre's reachable band are aeon's numbers. Not one of
 *      them is typed here: they are folded out of aeon's own source through git
 *      objects, the formulas they are folded from are asserted to still read the
 *      way this file folds them, and aeon's real act 1 region table is read the
 *      same way and required to pass every rule, to be disjoint and to tile the
 *      act. That last row is the strongest thing in the file: aeon's build
 *      asserts those three properties of that table in its own language, so if
 *      this module disagrees with it, one of the two is wrong about the act
 *      that ships.
 *
 * NO WORKING TREE IS EVER OPENED. aeon is another lane's live checkout; every
 * read here goes through `test/support/peer-repo.ts`, which reads objects. A
 * revision that does not resolve is a LOUD SKIP naming what went unmeasured, and
 * a path that is absent AT a resolved revision is a red row, because that is a
 * measurement.
 *
 * ═══ RED-FIRST LOG, 2026-09-15 ═══
 *
 * Every mutation below was APPLIED ON DISK, run, and then restored from the
 * committed baseline `75b9ba22`. The counts are out of 47 rows.
 *
 *   M1  subtractRect's left and right pieces cut to the WHOLE rectangle's rows
 *       instead of the overlap's rows                        8 red
 *   M2  `toInclusive` drops the `- 1` (half-open read as inclusive)
 *                                                            7 red
 *   M3  `resolveRegion` returns the first match instead of `ambiguous`
 *                                                            1 red
 *   M4  the right-edge rule made the mirror of the left one (`x1 + 1 <=` becomes
 *       `x1 <=`), which is the asymmetry aeon actually writes
 *                                                            1 red
 *   M5  the minimum-span comparison moved one pixel (`<` becomes `<=`)
 *                                                            1 red
 *   M6  `deleteRegion` keeps the region (a delete that vacates nothing)
 *                                                            5 red
 *   M7  `coverage` always reports a fully painted act        8 red
 *   M8  the property generator spaced so NO draw can overlap anything, which is
 *       the vacuous-property state the census exists to catch
 *                                                            1 red, on the
 *       census assertion itself ("expected 0 to be greater than 0")
 *   M9  the aeon row parser shifts every row's left edge by one pixel, which is
 *       what a golden that was not really reading aeon would survive
 *                                                            5 red
 *
 * ⚠ M8 WAS WRONG THE FIRST TIME AND THE SUITE STAYED GREEN, which is worth more
 * than the nine reds. The first attempt moved the draws to x, y around 10000 so
 * they would miss the act. They did, and the census still counted hundreds of
 * overlaps, because THE DISPLACED DRAWS OVERLAPPED EACH OTHER. A mutation that
 * leaves the property it is aimed at intact is not evidence of anything; the
 * second attempt spaces the draws 500 px apart, wider than any generated
 * rectangle, so the "no overlapping pair was ever generated" state is real.
 *
 * SEPARATELY, the aeon rows were proven to SKIP rather than pass when aeon
 * cannot be read: with `AEON_DIR` pointed at a directory that is not a git
 * checkout, 13 rows skipped and the skip reporter printed each reason, ending
 * "skip-report: OK. Every skip named its reason." Nothing silently passed.
 *
 * M7 DID NOT RED THE PROPERTY ROW, and the reason is a real bound on it: in that
 * row the act is fully painted at every step, so "assigned plus unassigned
 * equals the act" holds just as well when `unassigned` is hardcoded to zero. The
 * rows that catch a coverage that lies are the delete rows and the empty-act row,
 * not the property row.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';

import {
  applyDraw,
  coalesceRects,
  coverage,
  deleteRegion,
  disjointness,
  fromInclusive,
  intersectRects,
  isEmptyRect,
  rectArea,
  rectContainsPoint,
  rectsOverlap,
  regionRects,
  resolveRegion,
  sortRects,
  subtractRect,
  subtractRectFromSet,
  toInclusive,
  totalArea,
  validateRect,
  validateRegionSet,
  type Rect,
  type RegionPiece,
  type RegionRules,
} from '../region-geometry';
import { peerRepo, resolveRev, readAtRev } from '../../../../test/support/peer-repo';
import { siblingPathOrUnresolved, siblingPathSource } from '../../../../test/support/sibling-root.mjs';
import { announceFixture, READ_MODES } from '../../../../scratchpad/lib/fixture-provenance.mjs';

const AEON = siblingPathOrUnresolved('aeon');

/**
 * THE AEON REVISION THESE ROWS READ. A full SHA, so no lane's commit can move it.
 *
 * WHY THIS ONE: it was aeon `origin/master`'s tip when this parcel was cut
 * (2026-09-15T22:13:47-0400), and it is the first revision at which act 1's
 * region table carries BOTH off-grid edges, so the golden below exercises a
 * rectangle whose edges fall on no section, block or chunk line. Its two blobs
 * are `d8650339` (the act descriptor) and `6224c273` (the engine constants);
 * those are recorded so a re-pin is a visible change and not a silent one.
 *
 * It is deliberately NOT `origin/master`. Following a branch would make this
 * file's green depend on what a peer lane committed since, which is the exact
 * thing reading at a revision exists to stop. The currency row below is what
 * asks whether the pin has gone stale, and it asks about the RULE LINES rather
 * than the whole file, so aeon adding content to the act does not red this suite
 * while aeon changing a rule does.
 */
const AEON_PIN = '52dc068016ff3cb6574b42f1352c7fb0fcabd8f2';
/** The published branch that answers "has the rule changed since the pin". */
const AEON_TIP = 'origin/master';

const DESC_REL = 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp';
const CONST_REL = 'engine/system/constants.emp';

type AeonAt =
  | { ok: true; dir: string; sha: string }
  | { ok: false; why: string };

/**
 * Resolve a revision in aeon's object database, or say exactly which of the
 * three ways it could not be done happened. None falls back to the working tree:
 * a fallback is how "I could not look" turns into "I looked and it was fine".
 */
function openAeon(ref: string, announce: boolean): AeonAt {
  if (!existsSync(AEON)) {
    return {
      ok: false,
      why: `no aeon checkout at ${AEON} (resolved by: ${siblingPathSource('aeon') ?? 'unresolved'}). `
        + 'Set AEON_DIR or EMPYREAN_SUITE_ROOT. The rule constants went UNMEASURED.',
    };
  }
  const dir = peerRepo('aeon');
  if (dir === null) {
    return {
      ok: false,
      why: `${AEON} exists but is not a git checkout, so aeon at ${ref} cannot be read out of its `
        + 'object database. These rows will not read that directory files instead. UNMEASURED.',
    };
  }
  const sha = resolveRev(dir, ref);
  if (sha === null) {
    return {
      ok: false,
      why: `${ref} does not resolve to a commit in ${dir} (unfetched, shallow, or history `
        + 'rewritten). The rule constants went UNMEASURED.',
    };
  }
  if (announce) {
    let out = '';
    try {
      announceFixture(
        {
          peer: 'aeon',
          mode: READ_MODES.COMMITTED,
          ref,
          dir,
          dirSource: siblingPathSource('aeon') ?? 'peerRepo(aeon)',
        },
        (s: string) => { out += s; },
      );
    } catch (e) {
      return { ok: false, why: `provenance for aeon at ${ref} could not be taken: ${String(e)}` };
    }
    process.stderr.write(out);
  }
  return { ok: true, dir, sha };
}

/**
 * aeon bytes at a resolved revision. After the revision has resolved, an absent
 * path can only mean the file is not in that tree, which is a MEASUREMENT: it
 * throws and the row goes red naming the path and the revision.
 */
function readAeon(at: AeonAt & { ok: true }, rel: string): string {
  const r = readAtRev(at.dir, at.sha, rel);
  if (!r.ok) {
    throw new Error(`aeon:${rel} at ${at.sha}: ${r.why}. That is a MEASURED absence at a resolved `
      + 'revision, not a failure to look');
  }
  return r.text;
}

// ---------------------------------------------------------------------------
// Folding aeon's constants out of aeon's own source
// ---------------------------------------------------------------------------

/** `const NAME = <integer>` (with or without `pub`, with or without a trailing comment). */
function empInt(text: string, name: string): number | null {
  const m = new RegExp(`^[ \\t]*(?:pub[ \\t]+)?const[ \\t]+${name}[ \\t]*=[ \\t]*(-?\\d+)[ \\t]*(?://.*)?$`, 'm')
    .exec(text);
  return m === null ? null : Number(m[1]);
}

/** The right hand side of `const NAME = ...` as written, comment stripped. */
function empExpr(text: string, name: string): string | null {
  const m = new RegExp(`^[ \\t]*(?:pub[ \\t]+)?const[ \\t]+${name}[ \\t]*=[ \\t]*(.+?)[ \\t]*(?://.*)?$`, 'm')
    .exec(text);
  return m === null ? null : m[1].trim();
}

/** Fold, or throw naming the constant. A missing constant is a measurement, so it is red. */
function needInt(text: string, name: string, where: string): number {
  const v = empInt(text, name);
  if (v === null) throw new Error(`${where} no longer declares "const ${name} = <integer>". The fold cannot proceed`);
  return v;
}

/** Assert a formula still reads the way this file folds it, or say so and stop. */
function needExpr(text: string, name: string, expected: string, where: string): void {
  const got = empExpr(text, name);
  if (got !== expected) {
    throw new Error(
      `${where} declares ${name} as "${got ?? '(absent)'}", not "${expected}". This suite folds `
      + 'that formula by hand, so a change to it must be read and re-folded, never followed blindly',
    );
  }
}

/** The four reachable-edge predicates, transcribed into `region-geometry.ts` and asserted here. */
const EDGE_PREDICATES = [
  'ensure(x0 == 0 || (x0 - 1 >= CENTRE_X_MIN && x0 <= CENTRE_X_MAX),',
  'ensure(x1 == ACT_W - 1 || (x1 >= CENTRE_X_MIN && x1 + 1 <= CENTRE_X_MAX),',
  'ensure(y0 == 0 || (y0 - 1 >= CENTRE_Y_MIN && y0 <= CENTRE_Y_MAX),',
  'ensure(y1 == ACT_H - 1 || (y1 >= CENTRE_Y_MIN && y1 + 1 <= CENTRE_Y_MAX),',
];
/** The minimum-span predicate, same deal. */
const SPAN_PREDICATE = 'ensure(x1 - x0 + 1 >= REGION_MIN_SPAN && y1 - y0 + 1 >= REGION_MIN_SPAN,';

interface AeonRules {
  rules: RegionRules;
  act: Rect;
  /** The act 1 release table, converted from aeon inclusive bounds to half-open rectangles. */
  rows: RegionPiece[];
  /** What the descriptor itself says the release row count is. */
  declaredRowCount: number;
}

/**
 * Build the whole derivation. Every number here comes out of aeon; the only
 * things typed in this file are the FORMULAS, and each one is asserted against
 * aeon's own text before it is folded.
 */
function deriveFromAeon(at: AeonAt & { ok: true }): AeonRules {
  const consts = readAeon(at, CONST_REL);
  const desc = readAeon(at, DESC_REL);
  const cwhere = `aeon:${CONST_REL} at ${at.sha.slice(0, 8)}`;
  const dwhere = `aeon:${DESC_REL} at ${at.sha.slice(0, 8)}`;

  const screenW = needInt(consts, 'SCREEN_WIDTH', cwhere);
  const screenH = needInt(consts, 'SCREEN_HEIGHT', cwhere);
  const halfW = needInt(consts, 'CAM_SCREEN_HALF_W', cwhere);
  const halfH = needInt(consts, 'CAM_SCREEN_HALF_H', cwhere);
  const maxYStep = needInt(consts, 'CAM_MAX_Y_STEP', cwhere);
  const sectionShift = needInt(consts, 'SECTION_SIZE_SHIFT', cwhere);
  const gridW = needInt(desc, 'GRID_W', dwhere);
  const gridH = needInt(desc, 'GRID_H', dwhere);

  needExpr(desc, 'ACT_W', 'GRID_W << SECTION_SIZE_SHIFT', dwhere);
  needExpr(desc, 'ACT_H', 'GRID_H << SECTION_SIZE_SHIFT', dwhere);
  needExpr(desc, 'CENTRE_X_MIN', 'CAM_SCREEN_HALF_W', dwhere);
  needExpr(desc, 'CENTRE_X_MAX', 'ACT_W - SCREEN_WIDTH + CAM_SCREEN_HALF_W', dwhere);
  needExpr(desc, 'CENTRE_Y_MIN', 'CAM_SCREEN_HALF_H', dwhere);
  needExpr(desc, 'CENTRE_Y_MAX', 'ACT_H - SCREEN_HEIGHT + CAM_SCREEN_HALF_H', dwhere);
  needExpr(desc, 'REGION_MIN_SPAN', '2 * CAM_MAX_Y_STEP', dwhere);

  for (const p of [...EDGE_PREDICATES, SPAN_PREDICATE]) {
    if (!desc.includes(p)) {
      throw new Error(`${dwhere} no longer contains the predicate this module transcribes:\n  ${p}`);
    }
  }

  const actW = gridW << sectionShift;
  const actH = gridH << sectionShift;
  const rules: RegionRules = {
    actW,
    actH,
    minSpan: 2 * maxYStep,
    centreXMin: halfW,
    centreXMax: actW - screenW + halfW,
    centreYMin: halfH,
    centreYMax: actH - screenH + halfH,
  };

  const declared = /const OJZ_ACT1_REGION_ROW_COUNT[ \t]*=[ \t]*(\d+)[ \t]*\+/.exec(desc);
  if (declared === null) {
    throw new Error(`${dwhere} no longer declares OJZ_ACT1_REGION_ROW_COUNT as "<n> + ...", so the `
      + 'release row count cannot be derived from it');
  }

  return {
    rules,
    act: { x: 0, y: 0, w: actW, h: actH },
    rows: parseRegionRows(desc, dwhere),
    declaredRowCount: Number(declared[1]),
  };
}

/**
 * Read `OJZ_ACT1_REGION_ROWS` out of the descriptor, in its RELEASE shape.
 *
 * ONLY THE TABLE'S OWN BRACKETS ARE SCANNED. A `ojz_region(...)` call also
 * appears inside the DEBUG-only snap-region block above it, and sweeping the
 * whole file would pull that row in beside the release row it replaces, giving a
 * table that overlaps itself for a reason that is aeon's build shape and not a
 * defect. Any `if DEBUG == 1 { ... } else { N }` constant folds to its ELSE
 * branch, which is the release value by aeon's own comment on that line.
 */
function parseRegionRows(desc: string, where: string): RegionPiece[] {
  const start = desc.indexOf('const OJZ_ACT1_REGION_ROWS');
  if (start < 0) throw new Error(`${where} no longer declares OJZ_ACT1_REGION_ROWS`);
  const end = desc.indexOf('\n]', start);
  if (end < 0) throw new Error(`${where}: OJZ_ACT1_REGION_ROWS has no closing bracket at a line start`);
  const body = desc.slice(start, end);

  const symbols = new Map<string, number>();
  const intDecl = /^[ \t]*(?:pub[ \t]+)?const[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(-?\d+)[ \t]*(?:\/\/.*)?$/gm;
  for (let m = intDecl.exec(desc); m !== null; m = intDecl.exec(desc)) symbols.set(m[1], Number(m[2]));
  const debugDecl = /^[ \t]*const[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*if[ \t]+DEBUG[ \t]*==[ \t]*1[ \t]*\{[^}]*\}[ \t]*else[ \t]*\{[ \t]*(-?\d+)[ \t]*\}/gm;
  for (let m = debugDecl.exec(desc); m !== null; m = debugDecl.exec(desc)) symbols.set(m[1], Number(m[2]));

  const evaluate = (raw: string): number => {
    const s = raw.trim();
    if (/^-?\d+$/.test(s)) return Number(s);
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]*([+-])[ \t]*(\d+))?$/.exec(s);
    if (m === null || !symbols.has(m[1])) {
      throw new Error(`${where}: cannot fold the region-row argument "${s}". The table's shape `
        + 'changed and this parser must be re-read against it, never guessed at');
    }
    const base = symbols.get(m[1]) as number;
    if (m[2] === undefined) return base;
    return m[2] === '+' ? base + Number(m[3]) : base - Number(m[3]);
  };

  const call = /ojz_region\(x0:[ \t]*([^,]+),[ \t]*x1:[ \t]*([^,]+),[ \t]*y0:[ \t]*([^,]+),[ \t]*y1:[ \t]*([^,)]+),[ \t]*effects:[ \t]*([A-Za-z_][A-Za-z0-9_]*)/g;
  const rows: RegionPiece[] = [];
  for (let m = call.exec(body); m !== null; m = call.exec(body)) {
    rows.push({
      id: m[5],
      rect: fromInclusive({
        x0: evaluate(m[1]), x1: evaluate(m[2]), y0: evaluate(m[3]), y1: evaluate(m[4]),
      }),
    });
  }
  if (rows.length === 0) throw new Error(`${where}: OJZ_ACT1_REGION_ROWS parsed to zero rows`);
  return rows;
}

// ---------------------------------------------------------------------------
// 1. The primitive, by hand
// ---------------------------------------------------------------------------

/** A helper the rows read with: the pieces, in the module's own deterministic order. */
function pieces(existing: Rect, incoming: Rect): Rect[] {
  return subtractRect(existing, incoming);
}

const BOX: Rect = { x: 100, y: 100, w: 100, h: 100 };

describe('subtractRect: every shape the primitive can produce', () => {
  it('returns the rectangle unchanged when the two do not meet at all', () => {
    expect(pieces(BOX, { x: 500, y: 500, w: 10, h: 10 })).toEqual([BOX]);
  });

  it('EDGE TOUCHING IS NOT OVERLAP: an abutting draw trims nothing', () => {
    expect(pieces(BOX, { x: 200, y: 100, w: 50, h: 100 })).toEqual([BOX]);
    expect(pieces(BOX, { x: 50, y: 100, w: 50, h: 100 })).toEqual([BOX]);
    expect(pieces(BOX, { x: 100, y: 200, w: 100, h: 50 })).toEqual([BOX]);
    expect(pieces(BOX, { x: 100, y: 50, w: 100, h: 50 })).toEqual([BOX]);
    expect(rectsOverlap(BOX, { x: 200, y: 100, w: 50, h: 100 })).toBe(false);
  });

  it('ZERO PIECES when the draw contains the rectangle, exactly or with room to spare', () => {
    expect(pieces(BOX, BOX)).toEqual([]);
    expect(pieces(BOX, { x: 0, y: 0, w: 1000, h: 1000 })).toEqual([]);
  });

  it('ONE PIECE when the draw takes a whole side off', () => {
    expect(pieces(BOX, { x: 100, y: 100, w: 100, h: 40 })).toEqual([{ x: 100, y: 140, w: 100, h: 60 }]);
    expect(pieces(BOX, { x: 160, y: 100, w: 100, h: 100 })).toEqual([{ x: 100, y: 100, w: 60, h: 100 }]);
  });

  it('TWO PIECES when the draw cuts straight through, on either axis', () => {
    expect(pieces(BOX, { x: 0, y: 140, w: 1000, h: 20 })).toEqual([
      { x: 100, y: 100, w: 100, h: 40 },
      { x: 100, y: 160, w: 100, h: 40 },
    ]);
    expect(pieces(BOX, { x: 140, y: 0, w: 20, h: 1000 })).toEqual([
      { x: 100, y: 100, w: 40, h: 100 },
      { x: 160, y: 100, w: 40, h: 100 },
    ]);
  });

  it('THREE PIECES when the draw takes a notch out of one edge', () => {
    expect(pieces(BOX, { x: 140, y: 80, w: 20, h: 60 })).toEqual([
      { x: 100, y: 140, w: 100, h: 60 },
      { x: 100, y: 100, w: 40, h: 40 },
      { x: 160, y: 100, w: 40, h: 40 },
    ]);
  });

  it('FOUR PIECES when the draw punches a hole in the middle', () => {
    expect(pieces(BOX, { x: 140, y: 140, w: 20, h: 20 })).toEqual([
      { x: 100, y: 100, w: 100, h: 40 },
      { x: 100, y: 160, w: 100, h: 40 },
      { x: 100, y: 140, w: 40, h: 20 },
      { x: 160, y: 140, w: 40, h: 20 },
    ]);
  });

  it('the pieces are always disjoint and always add up to what survived', () => {
    const cases: Rect[] = [
      { x: 140, y: 140, w: 20, h: 20 },
      { x: 140, y: 80, w: 20, h: 60 },
      { x: 0, y: 140, w: 1000, h: 20 },
      { x: 100, y: 100, w: 100, h: 40 },
      { x: 500, y: 500, w: 10, h: 10 },
      BOX,
    ];
    for (const cut of cases) {
      const out = pieces(BOX, cut);
      const overlap = intersectRects(BOX, cut);
      expect(totalArea(out)).toBe(rectArea(BOX) - (overlap === null ? 0 : rectArea(overlap)));
      const asSet = out.map((rect, i) => ({ id: `p${i}`, rect }));
      expect(disjointness(asSet).disjoint).toBe(true);
    }
  });

  it('a one pixel rectangle survives a miss and vanishes under a hit', () => {
    const pixel: Rect = { x: 7, y: 9, w: 1, h: 1 };
    expect(pieces(pixel, { x: 8, y: 9, w: 1, h: 1 })).toEqual([pixel]);
    expect(pieces(pixel, pixel)).toEqual([]);
  });

  it('an empty rectangle has no pieces and no area, and contains nothing', () => {
    expect(isEmptyRect({ x: 0, y: 0, w: 0, h: 10 })).toBe(true);
    expect(pieces({ x: 0, y: 0, w: 0, h: 10 }, BOX)).toEqual([]);
    expect(rectArea({ x: 0, y: 0, w: 0, h: 10 })).toBe(0);
    expect(rectContainsPoint({ x: 0, y: 0, w: 0, h: 10 }, 0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. The draw, the delete and the resolve
// ---------------------------------------------------------------------------

const ACT_SMALL: Rect = { x: 0, y: 0, w: 400, h: 300 };

describe('applyDraw: a draw cuts what is there, right away', () => {
  it('a draw over an existing region trims it at once, and the result is disjoint', () => {
    const before: RegionPiece[] = [{ id: 'forest', rect: ACT_SMALL }];
    const after = applyDraw(before, { id: 'night', rect: { x: 100, y: 0, w: 100, h: 300 } });
    expect(after.trimmedIds).toEqual(['forest']);
    expect(after.emptiedIds).toEqual([]);
    expect(disjointness(after.pieces).disjoint).toBe(true);
    expect(sortRects(regionRects(after.pieces, 'forest'))).toEqual([
      { x: 0, y: 0, w: 100, h: 300 },
      { x: 200, y: 0, w: 200, h: 300 },
    ]);
    expect(regionRects(after.pieces, 'night')).toEqual([{ x: 100, y: 0, w: 100, h: 300 }]);
  });

  it('THERE IS NO PAINTERS ORDER: the covered region loses the area, it does not sit under it', () => {
    const before: RegionPiece[] = [{ id: 'forest', rect: ACT_SMALL }];
    const after = applyDraw(before, { id: 'night', rect: ACT_SMALL });
    expect(regionRects(after.pieces, 'forest')).toEqual([]);
    expect(after.emptiedIds).toEqual(['forest']);
    // And removing the region that covered it does NOT give the area back to forest.
    const deleted = deleteRegion(after.pieces, 'night');
    expect(regionRects(deleted.pieces, 'forest')).toEqual([]);
    expect(coverage(ACT_SMALL, deleted.pieces).unassignedArea).toBe(rectArea(ACT_SMALL));
  });

  it('the set stays disjoint over a run of overlapping draws', () => {
    let set: RegionPiece[] = [{ id: 'act', rect: ACT_SMALL }];
    const draws: RegionPiece[] = [
      { id: 'a', rect: { x: 50, y: 50, w: 200, h: 100 } },
      { id: 'b', rect: { x: 100, y: 0, w: 100, h: 300 } },
      { id: 'c', rect: { x: 0, y: 200, w: 400, h: 50 } },
      { id: 'd', rect: { x: 120, y: 120, w: 40, h: 40 } },
    ];
    for (const d of draws) {
      set = applyDraw(set, d).pieces;
      expect(disjointness(set).disjoint).toBe(true);
      const cov = coverage(ACT_SMALL, set);
      expect(cov.assignedArea + cov.unassignedArea).toBe(cov.actArea);
      expect(cov.unassignedArea).toBe(0);
    }
  });

  it('a draw that touches nothing trims nothing', () => {
    const before: RegionPiece[] = [{ id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 } }];
    const after = applyDraw(before, { id: 'b', rect: { x: 100, y: 0, w: 100, h: 100 } });
    expect(after.trimmedIds).toEqual([]);
    expect(after.pieces).toHaveLength(2);
  });
});

describe('deleting a region leaves UNASSIGNED, never a neighbour', () => {
  it('the vacated area is reported and is unassigned afterwards', () => {
    let set: RegionPiece[] = [{ id: 'forest', rect: ACT_SMALL }];
    set = applyDraw(set, { id: 'night', rect: { x: 100, y: 100, w: 50, h: 50 } }).pieces;
    const del = deleteRegion(set, 'night');
    expect(del.vacated).toEqual([{ x: 100, y: 100, w: 50, h: 50 }]);
    const cov = coverage(ACT_SMALL, del.pieces);
    expect(cov.unassignedArea).toBe(50 * 50);
    expect(coalesceRects(cov.unassigned)).toEqual([{ x: 100, y: 100, w: 50, h: 50 }]);
    expect(resolveRegion(del.pieces, 120, 120)).toEqual({ kind: 'unassigned' });
    // The neighbour did NOT grow into it.
    expect(totalArea(regionRects(del.pieces, 'forest'))).toBe(rectArea(ACT_SMALL) - 50 * 50);
  });
});

describe('resolveRegion: one answer, or none, and never a first match', () => {
  const set: RegionPiece[] = [
    { id: 'left', rect: { x: 0, y: 0, w: 100, h: 100 } },
    { id: 'right', rect: { x: 100, y: 0, w: 100, h: 100 } },
  ];

  it('names the owner of a point, and is half open at the seam', () => {
    expect(resolveRegion(set, 99, 50)).toEqual({ kind: 'region', id: 'left', pieceIndex: 0 });
    expect(resolveRegion(set, 100, 50)).toEqual({ kind: 'region', id: 'right', pieceIndex: 1 });
  });

  it('says UNASSIGNED rather than guessing, and that answer is distinguishable', () => {
    const r = resolveRegion(set, 500, 500);
    expect(r).toEqual({ kind: 'unassigned' });
    expect(r.kind === 'unassigned').toBe(true);
  });

  it('OVERLAP IS AN ANSWER, not a silent first match', () => {
    const bad: RegionPiece[] = [...set, { id: 'ghost', rect: { x: 50, y: 0, w: 100, h: 100 } }];
    const r = resolveRegion(bad, 60, 10);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.ids).toEqual(['left', 'ghost']);
    expect(disjointness(bad).disjoint).toBe(false);
  });
});

describe('coverage: the act minus the regions', () => {
  it('an empty act is entirely unassigned, as one rectangle', () => {
    const cov = coverage(ACT_SMALL, []);
    expect(cov.unassigned).toEqual([ACT_SMALL]);
    expect(cov.unassignedArea).toBe(cov.actArea);
    expect(cov.assignedArea).toBe(0);
  });

  it('a hole in the middle comes back as the hole', () => {
    let set: RegionPiece[] = [{ id: 'act', rect: ACT_SMALL }];
    set = applyDraw(set, { id: 'hole', rect: { x: 40, y: 40, w: 30, h: 30 } }).pieces;
    set = deleteRegion(set, 'hole').pieces;
    expect(coalesceRects(coverage(ACT_SMALL, set).unassigned)).toEqual([{ x: 40, y: 40, w: 30, h: 30 }]);
  });

  it('a rectangle hanging off the act is reported as OUTSIDE, not clamped and not a hole', () => {
    const set: RegionPiece[] = [{ id: 'over', rect: { x: 300, y: 0, w: 200, h: 300 } }];
    const cov = coverage(ACT_SMALL, set);
    expect(cov.outside).toEqual([{ index: 0, id: 'over', rect: { x: 400, y: 0, w: 100, h: 300 } }]);
    expect(cov.assignedArea).toBe(100 * 300);
    expect(cov.unassignedArea).toBe(300 * 300);
    // Nothing was clamped: the piece still says what the author drew.
    expect(set[0].rect).toEqual({ x: 300, y: 0, w: 200, h: 300 });
  });
});

describe('coalesceRects', () => {
  it('merges a row of columns and a column of rows into one rectangle', () => {
    expect(coalesceRects([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 10, h: 10 },
    ])).toEqual([{ x: 0, y: 0, w: 30, h: 10 }]);
    expect(coalesceRects([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 0, y: 10, w: 10, h: 10 },
    ])).toEqual([{ x: 0, y: 0, w: 10, h: 20 }]);
  });

  it('refuses to merge what would not be a rectangle, and never changes the area', () => {
    const l: Rect[] = [{ x: 0, y: 0, w: 30, h: 10 }, { x: 0, y: 10, w: 10, h: 20 }];
    const out = coalesceRects(l);
    expect(out).toHaveLength(2);
    expect(totalArea(out)).toBe(totalArea(l));
  });

  it('the four pieces of a cut side come back as one rectangle again', () => {
    const cut = subtractRect(BOX, { x: 140, y: 100, w: 20, h: 100 });
    expect(coalesceRects([...cut, { x: 140, y: 100, w: 20, h: 100 }])).toEqual([BOX]);
  });
});

// ---------------------------------------------------------------------------
// 3. The boundary: half-open here, inclusive in the engine
// ---------------------------------------------------------------------------

describe('the inclusive boundary, where an off-by-one costs a pixel in the ROM', () => {
  it('A ONE PIXEL COLUMN is x0 == x1, which is what aeon says it must be', () => {
    expect(toInclusive({ x: 5, y: 9, w: 1, h: 1 })).toEqual({ x0: 5, x1: 5, y0: 9, y1: 9 });
    expect(toInclusive({ x: 5, y: 0, w: 1, h: 40 })).toEqual({ x0: 5, x1: 5, y0: 0, y1: 39 });
    expect(fromInclusive({ x0: 5, x1: 5, y0: 9, y1: 9 })).toEqual({ x: 5, y: 9, w: 1, h: 1 });
  });

  it('A RECTANGLE FLUSH AGAINST THE ACT FAR EDGE ends on the act last pixel, not past it', () => {
    const actW = 6144;
    const flush: Rect = { x: 4096, y: 0, w: actW - 4096, h: 64 };
    const b = toInclusive(flush);
    expect(b).not.toBeNull();
    expect((b as { x1: number }).x1).toBe(actW - 1);
  });

  it('an empty rectangle converts to null rather than to x1 < x0', () => {
    expect(toInclusive({ x: 5, y: 5, w: 0, h: 10 })).toBeNull();
    expect(toInclusive({ x: 5, y: 5, w: 10, h: 0 })).toBeNull();
  });

  it('round trips over a spread of shapes', () => {
    const shapes: Rect[] = [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 6144, h: 6144 },
      { x: 3400, y: 0, w: 1400, h: 2048 },
      { x: 6143, y: 6143, w: 1, h: 1 },
    ];
    for (const r of shapes) {
      const b = toInclusive(r);
      expect(b).not.toBeNull();
      expect(fromInclusive(b as { x0: number; x1: number; y0: number; y1: number })).toEqual(r);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Property rows, with the generator censused so they cannot go vacuous
// ---------------------------------------------------------------------------

/** A seeded generator: the same run every time, so a failure is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property: the invariants hold after every operation', () => {
  it('disjoint, and assigned plus unassigned equals the act, over 400 random draws', () => {
    const rnd = mulberry32(0x5eed1234);
    const act: Rect = { x: 0, y: 0, w: 320, h: 240 };
    const census = { touched: 0, contained: 0, split2: 0, split3: 0, split4: 0, missed: 0, emptied: 0 };
    let set: RegionPiece[] = [{ id: 'base', rect: act }];

    for (let n = 0; n < 400; n += 1) {
      const w = 1 + Math.floor(rnd() * 160);
      const h = 1 + Math.floor(rnd() * 120);
      const x = Math.floor(rnd() * (act.w + 40)) - 20;
      const y = Math.floor(rnd() * (act.h + 40)) - 20;
      const draw: RegionPiece = { id: `r${n}`, rect: { x, y, w, h } };

      // Census the SHAPES this draw is about to produce, so the row knows what it covered.
      for (const p of set) {
        const survivors = subtractRect(p.rect, draw.rect);
        if (!rectsOverlap(p.rect, draw.rect)) { census.missed += 1; continue; }
        census.touched += 1;
        if (survivors.length === 0) census.contained += 1;
        if (survivors.length === 2) census.split2 += 1;
        if (survivors.length === 3) census.split3 += 1;
        if (survivors.length === 4) census.split4 += 1;
      }

      const res = applyDraw(set, draw);
      census.emptied += res.emptiedIds.length;
      set = res.pieces;

      expect(disjointness(set).disjoint).toBe(true);
      const cov = coverage(act, set);
      expect(cov.assignedArea + cov.unassignedArea).toBe(cov.actArea);
      for (let k = 0; k < 8; k += 1) {
        const px = Math.floor(rnd() * act.w);
        const py = Math.floor(rnd() * act.h);
        expect(resolveRegion(set, px, py).kind).not.toBe('ambiguous');
      }
    }

    // THE CENSUS IS THE ROW'S OWN ANTI-VACUITY CHECK. Without it a generator that
    // only ever produced misses would print the same green.
    expect(census.missed).toBeGreaterThan(0);
    expect(census.touched).toBeGreaterThan(0);
    expect(census.contained).toBeGreaterThan(0);
    expect(census.split2).toBeGreaterThan(0);
    expect(census.split3).toBeGreaterThan(0);
    expect(census.split4).toBeGreaterThan(0);
    expect(census.emptied).toBeGreaterThan(0);
  });

  it('deleting a random region moves exactly its area into UNASSIGNED', () => {
    const rnd = mulberry32(0xbeef01);
    const act: Rect = { x: 0, y: 0, w: 256, h: 256 };
    let set: RegionPiece[] = [{ id: 'base', rect: act }];
    const ids: string[] = ['base'];
    for (let n = 0; n < 40; n += 1) {
      const draw: RegionPiece = {
        id: `r${n}`,
        rect: {
          x: Math.floor(rnd() * 200),
          y: Math.floor(rnd() * 200),
          w: 1 + Math.floor(rnd() * 80),
          h: 1 + Math.floor(rnd() * 80),
        },
      };
      set = applyDraw(set, draw).pieces;
      ids.push(draw.id);
    }
    let deletes = 0;
    for (const id of ids) {
      const held = totalArea(regionRects(set, id).map((r) => intersectRects(r, act)).filter((r): r is Rect => r !== null));
      if (held === 0) continue;
      deletes += 1;
      const before = coverage(act, set).unassignedArea;
      const after = coverage(act, deleteRegion(set, id).pieces).unassignedArea;
      expect(after - before).toBe(held);
    }
    // Anti-vacuity: the loop above must actually have deleted something.
    expect(deletes).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------
// 5. The rules, derived from aeon, and aeon's own table as the golden
// ---------------------------------------------------------------------------

const pinned = openAeon(AEON_PIN, true);

describe('the rule constants come from aeon at a committed revision', () => {
  it('folds the act extent, the minimum span and the reachable band out of aeon source', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    // Nothing here asserts a VALUE: the values are aeon's. It asserts they are
    // sane relative to each other, which is what a fold can be wrong about.
    expect(d.rules.actW).toBeGreaterThan(0);
    expect(d.rules.actH).toBeGreaterThan(0);
    expect(d.rules.minSpan).toBeGreaterThan(1);
    expect(d.rules.centreXMin).toBeGreaterThan(0);
    expect(d.rules.centreXMax).toBeGreaterThan(d.rules.centreXMin);
    expect(d.rules.centreXMax).toBeLessThan(d.rules.actW);
    expect(d.rules.centreYMax).toBeGreaterThan(d.rules.centreYMin);
    expect(d.rules.centreYMax).toBeLessThan(d.rules.actH);
    process.stderr.write(
      `region-geometry: rules folded from aeon ${AEON_PIN.slice(0, 8)}: `
      + `act ${d.rules.actW}x${d.rules.actH}, minSpan ${d.rules.minSpan}, `
      + `x band [${d.rules.centreXMin}, ${d.rules.centreXMax}], `
      + `y band [${d.rules.centreYMin}, ${d.rules.centreYMax}]\n`,
    );
  });

  it('CURRENCY: the rule lines at aeon published tip still read the way this module transcribes them', (ctx) => {
    const tip = openAeon(AEON_TIP, false);
    if (!tip.ok) { ctx.skip(`UNMEASURED, the pin may be stale and nothing here can say: ${tip.why}`); return; }
    const desc = readAeon(tip, DESC_REL);
    for (const p of [...EDGE_PREDICATES, SPAN_PREDICATE]) expect(desc).toContain(p);
    expect(empExpr(desc, 'REGION_MIN_SPAN')).toBe('2 * CAM_MAX_Y_STEP');
    expect(empExpr(desc, 'CENTRE_X_MAX')).toBe('ACT_W - SCREEN_WIDTH + CAM_SCREEN_HALF_W');
    expect(empExpr(desc, 'CENTRE_Y_MAX')).toBe('ACT_H - SCREEN_HEIGHT + CAM_SCREEN_HALF_H');
  });
});

describe('the two per-rect rules, against the derived constants', () => {
  it('MINIMUM SPAN: a rectangle narrower than the span on either axis is refused', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const { rules } = deriveFromAeon(pinned);
    const narrow: Rect = { x: 0, y: 0, w: rules.minSpan - 1, h: rules.minSpan };
    const short: Rect = { x: 0, y: 0, w: rules.minSpan, h: rules.minSpan - 1 };
    const exact: Rect = { x: 0, y: 0, w: rules.minSpan, h: rules.minSpan };
    expect(validateRect(narrow, rules).map((f) => f.code)).toContain('min-span');
    expect(validateRect(short, rules).map((f) => f.code)).toContain('min-span');
    expect(validateRect(exact, rules).map((f) => f.code)).not.toContain('min-span');
  });

  it('REACHABLE EDGE: an interior edge outside the band is refused, the act own edges are exempt', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const { rules } = deriveFromAeon(pinned);

    // The whole act: every edge is an act edge, so all four exemptions fire.
    const whole: Rect = { x: 0, y: 0, w: rules.actW, h: rules.actH };
    expect(validateRect(whole, rules)).toEqual([]);

    // An interior LEFT edge one pixel too far left: the centre cannot stand on
    // the pixel before it, so nothing can cross into the region.
    const tooLeft: Rect = { x: rules.centreXMin, y: 0, w: rules.actW - rules.centreXMin, h: rules.actH };
    expect(validateRect(tooLeft, rules).map((f) => f.code)).toContain('edge-left-unreachable');
    const justReachable: Rect = {
      x: rules.centreXMin + 1, y: 0, w: rules.actW - rules.centreXMin - 1, h: rules.actH,
    };
    expect(validateRect(justReachable, rules).map((f) => f.code)).not.toContain('edge-left-unreachable');

    // An interior RIGHT edge one pixel too far right, with the left edge on the
    // act. The far edge is x1 = w - 1, so w = centreXMax puts x1 one INSIDE the
    // band and w = centreXMax + 1 puts it one outside: the boundary is here, and
    // it is not the mirror of the left edge's.
    const tooRight: Rect = { x: 0, y: 0, w: rules.centreXMax + 1, h: rules.actH };
    expect(validateRect(tooRight, rules).map((f) => f.code)).toContain('edge-right-unreachable');
    const rightOk: Rect = { x: 0, y: 0, w: rules.centreXMax, h: rules.actH };
    expect(validateRect(rightOk, rules).map((f) => f.code)).not.toContain('edge-right-unreachable');

    // The same asymmetry on y.
    const tooHigh: Rect = { x: 0, y: rules.centreYMin, w: rules.actW, h: rules.actH - rules.centreYMin };
    expect(validateRect(tooHigh, rules).map((f) => f.code)).toContain('edge-top-unreachable');
    const topOk: Rect = {
      x: 0, y: rules.centreYMin + 1, w: rules.actW, h: rules.actH - rules.centreYMin - 1,
    };
    expect(validateRect(topOk, rules).map((f) => f.code)).not.toContain('edge-top-unreachable');
    const tooLow: Rect = { x: 0, y: 0, w: rules.actW, h: rules.centreYMax + 1 };
    expect(validateRect(tooLow, rules).map((f) => f.code)).toContain('edge-bottom-unreachable');
    const bottomOk: Rect = { x: 0, y: 0, w: rules.actW, h: rules.centreYMax };
    expect(validateRect(bottomOk, rules).map((f) => f.code)).not.toContain('edge-bottom-unreachable');
  });

  it('the other three per-row rules aeon checks are carried too', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const { rules } = deriveFromAeon(pinned);
    expect(validateRect({ x: 0, y: 0, w: 0, h: 100 }, rules).map((f) => f.code)).toEqual(['inverted']);
    expect(validateRect({ x: -64, y: 0, w: 128, h: rules.actH }, rules).map((f) => f.code))
      .toContain('negative-edge');
    expect(validateRect({ x: 0, y: 0, w: rules.actW + 1, h: rules.actH }, rules).map((f) => f.code))
      .toContain('outside-act');
  });

  it('a rule break is a finding with a message, never a throw and never a clamp', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const { rules } = deriveFromAeon(pinned);
    const bad: Rect = { x: 3, y: 3, w: 4, h: 4 };
    const found = validateRect(bad, rules, { regionId: 'sliver', pieceIndex: 2 });
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      expect(f.message.length).toBeGreaterThan(20);
      expect(f.regionId).toBe('sliver');
      expect(f.pieceIndex).toBe(2);
      expect(f.rect).toEqual(bad);
    }
    // The input is untouched: nothing was clamped into the legal range.
    expect(bad).toEqual({ x: 3, y: 3, w: 4, h: 4 });
  });
});

describe('GOLDEN: aeon own act 1 region table, read at the pin', () => {
  it('parses the release table and agrees with the row count the descriptor declares', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    expect(d.rows).toHaveLength(d.declaredRowCount);
  });

  it('every row passes every per-rect rule this module implements', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    const findings = d.rows.flatMap((r, i) => validateRect(r.rect, d.rules, { regionId: r.id, pieceIndex: i }));
    expect(findings.map((f) => `${f.regionId}: ${f.code}`)).toEqual([]);
  });

  it('the rows are disjoint and tile the act, which is what aeon own build asserts of them', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    const v = validateRegionSet(d.rows, d.act, d.rules);
    expect(v.disjoint.overlaps).toEqual([]);
    expect(v.coverage.unassigned).toEqual([]);
    expect(v.coverage.assignedArea).toBe(d.rules.actW * d.rules.actH);
    expect(v.ok).toBe(true);
  });

  it('NOT VACUOUS: the table really does carry an off-grid edge and a flush act edge', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    const sectionSize = 2048;
    const offGrid = d.rows.filter((r) => r.rect.x % sectionSize !== 0);
    expect(offGrid.length).toBeGreaterThan(0);
    const flush = d.rows.filter((r) => r.rect.x + r.rect.w === d.rules.actW);
    expect(flush.length).toBeGreaterThan(0);
    const interiorLeft = d.rows.filter((r) => r.rect.x !== 0);
    expect(interiorLeft.length).toBeGreaterThan(0);
  });

  it('resolveRegion over the real table answers the way aeon Region_Resolve would', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    // Sample every row at its own first and last pixel: one answer each, and it
    // is that row. With a disjoint table this is exactly Region_Resolve's answer,
    // whose "first row containing the point" cannot differ where only one does.
    for (const row of d.rows) {
      const first = resolveRegion(d.rows, row.rect.x, row.rect.y);
      const last = resolveRegion(d.rows, row.rect.x + row.rect.w - 1, row.rect.y + row.rect.h - 1);
      expect(first.kind).toBe('region');
      expect(last.kind).toBe('region');
      if (first.kind === 'region') expect(first.id).toBe(row.id);
      if (last.kind === 'region') expect(last.id).toBe(row.id);
    }
    // And no pixel of the act resolves to nothing.
    for (let i = 0; i < 200; i += 1) {
      const x = (i * 6113) % d.rules.actW;
      const y = (i * 4099) % d.rules.actH;
      expect(resolveRegion(d.rows, x, y).kind).toBe('region');
    }
  });

  it('a draw over the real table keeps it disjoint and keeps it tiling', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    const after = applyDraw(d.rows, { id: 'newRegion', rect: { x: 1024, y: 1024, w: 2048, h: 1024 } });
    expect(after.trimmedIds.length).toBeGreaterThan(1);
    const v = validateRegionSet(after.pieces, d.act, d.rules);
    expect(v.disjoint.overlaps).toEqual([]);
    expect(v.coverage.unassigned).toEqual([]);
  });

  it('deleting a real row makes exactly that row UNASSIGNED', (ctx) => {
    if (!pinned.ok) { ctx.skip(`UNMEASURED: ${pinned.why}`); return; }
    const d = deriveFromAeon(pinned);
    const victim = d.rows[d.rows.length - 1];
    const del = deleteRegion(d.rows, victim.id);
    const cov = coverage(d.act, del.pieces);
    expect(coalesceRects(cov.unassigned)).toEqual([victim.rect]);
    expect(cov.unassignedArea).toBe(rectArea(victim.rect));
  });
});

describe('validateRegionSet reports the set level defects a schema cannot', () => {
  const rules: RegionRules = {
    actW: 400, actH: 300, minSpan: 32, centreXMin: 160, centreXMax: 240, centreYMin: 112, centreYMax: 188,
  };

  it('an unassigned area is a finding, with the rectangle in it', () => {
    const v = validateRegionSet([], { x: 0, y: 0, w: 400, h: 300 }, rules);
    const unassigned = v.findings.filter((f) => f.code === 'unassigned');
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].rect).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(v.ok).toBe(false);
  });

  it('an overlap is a finding naming both regions and the shared rectangle', () => {
    const set: RegionPiece[] = [
      { id: 'a', rect: { x: 0, y: 0, w: 400, h: 300 } },
      { id: 'b', rect: { x: 200, y: 0, w: 200, h: 300 } },
    ];
    const v = validateRegionSet(set, { x: 0, y: 0, w: 400, h: 300 }, rules);
    const overlap = v.findings.filter((f) => f.code === 'overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0].rect).toEqual({ x: 200, y: 0, w: 200, h: 300 });
    expect(overlap[0].message).toContain('"a"');
    expect(overlap[0].message).toContain('"b"');
  });

  it('a set drawn by applyDraw over the whole act has nothing wrong with it', () => {
    const act: Rect = { x: 0, y: 0, w: 400, h: 300 };
    let set: RegionPiece[] = [{ id: 'base', rect: act }];
    set = applyDraw(set, { id: 'night', rect: { x: 161, y: 0, w: 78, h: 300 } }).pieces;
    const v = validateRegionSet(set, act, rules);
    expect(v.findings.map((f) => `${f.regionId}: ${f.code}`)).toEqual([]);
  });
});

describe('subtractRectFromSet', () => {
  it('cuts every member and keeps the total area honest', () => {
    const set: Rect[] = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 100, y: 0, w: 100, h: 100 },
    ];
    const out = subtractRectFromSet(set, { x: 50, y: 0, w: 100, h: 100 });
    expect(totalArea(out)).toBe(100 * 100);
    expect(sortRects(out)).toEqual([
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 150, y: 0, w: 50, h: 100 },
    ]);
  });
});
