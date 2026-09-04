// ═══════════════════════════════════════════════════════════════════════════
// THE MARK WIDTH — why a two-way crossover needs 8px and what proves it.
//
// THE DEFECT THIS FILE PINS (docs/reviews/2026-09-04-loops-test-loop-witness.md
// §6, closed by docs/reviews/2026-09-04-loops-two-way-mark.md):
//
//   aeon's `Player_LoopCrossover` fires once per 8px COLUMN entered and reads
//   the mark from the plane the player is CURRENTLY ON. Aurora's cell is 16px =
//   TWO of those columns. So a two-way pair painted at cell width hands the
//   player over and hands him straight back — every two-way pair, not a corner
//   case — and until this parcel a cell was the only width an author could paint.
//
// ⚠ THE VACUITY TRAP HERE IS SPECIFIC AND IT IS THE WHOLE REASON FOR THE
// CONTROL ROWS. The old behaviour and the new one are IDENTICAL for every
// one-way mark, for every `keep` stroke, and for every cell whose two halves
// were going to end up the same anyway. A test that painted a one-way mark and
// checked it arrived would pass before this parcel and after it, on a build
// with the span parameter deleted. Every row below that matters therefore
// authors a mark on ONE HALF and asserts the OTHER HALF is untouched — the only
// observation the two implementations disagree about.
//
// AND NO NUMBER HERE IS TYPED. `8` and `16` appear nowhere as expectations:
// the sub-tile count comes from `cellTileIndices`'s own output, and the engine
// side is PARSED out of aeon's `constants.emp` at a pinned revision.

import { describe, it, expect } from 'vitest';
import {
  cellTileIndices, cellCrossoverIndices, spanForTileCol,
  CELL_SUBTILE_COLS, CELL_SUBTILE_ROWS,
} from '../../src/core/collision/collision-cell';
import {
  withCrossover, readCrossover, crossoverSpanIsHalf,
  type CrossoverSpan,
} from '../../src/core/collision/layer-transition';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import {
  paintCollisionRectBothPlanes, paintCollisionCellsBothPlanes, collisionRectCrossoverIndices,
} from '../../src/core/collision/collision-paint';
import { auditCrossovers, scanCancellingRuns } from '../../src/core/collision/crossover-audit';
import { peerRepo, readAtRev } from '../support/peer-repo';

const W = 64;                       // a small stride; the arithmetic is stride-agnostic
const SOLID = packCollisionCell({ shape: 0x11, xFlip: false, yFlip: false, solidity: 'all' });

/** Sub-tile column of an index, given the stride. The only arithmetic this file
 *  performs on an index, and it is `cellTileIndices`'s own row-major layout. */
const colOf = (index: number, stride = W) => index % stride;

// ───────────────────────────────────────────────────────────────────────────
// 1. The arithmetic, derived from cellTileIndices and never from a literal
// ───────────────────────────────────────────────────────────────────────────

describe('cellCrossoverIndices — the mark is a subset of the cell, always', () => {
  it("'cell' is EXACTLY what a stroke covers — the default cannot narrow anything", () => {
    // The load-bearing back-compat row: if these two ever differ, every stroke
    // ever painted at the default width changed meaning.
    for (const [cc, cr] of [[0, 0], [3, 5], [31, 63]] as const) {
      expect(cellCrossoverIndices(cc, cr, W, 'cell')).toEqual(cellTileIndices(cc, cr, W));
    }
  });

  it('the two halves PARTITION the cell — disjoint, and together the whole thing', () => {
    const all = cellTileIndices(4, 6, W);
    const left = cellCrossoverIndices(4, 6, W, 'left');
    const right = cellCrossoverIndices(4, 6, W, 'right');
    expect(left.filter((i) => right.includes(i))).toEqual([]);
    expect([...left, ...right].sort((x, y) => x - y)).toEqual([...all].sort((x, y) => x - y));
  });

  it('each half is ONE sub-tile column, full height — the shape the engine reads', () => {
    // ONE COLUMN is what makes the pair flip; FULL HEIGHT is what makes it
    // readable at all, because aeon's bake samples the cell's TOP sub-tile row
    // and a mark on the bottom row alone would never be seen.
    for (const span of ['left', 'right'] as const) {
      const half = cellCrossoverIndices(9, 2, W, span);
      expect(new Set(half.map((i) => colOf(i))).size).toBe(1);
      expect(half).toHaveLength(CELL_SUBTILE_ROWS);
    }
    // ...and the two halves are ADJACENT columns, one apart. A `right` that
    // returned the next cell's column would pass every row above.
    const l = colOf(cellCrossoverIndices(9, 2, W, 'left')[0]!);
    const r = colOf(cellCrossoverIndices(9, 2, W, 'right')[0]!);
    expect(r - l).toBe(1);
    expect(l).toBe(9 * CELL_SUBTILE_COLS);
  });

  it('spanForTileCol reads the CURSOR, and covers every sub-tile column of a cell', () => {
    // The human road's whole span resolution. Exhaustive over one cell rather
    // than two examples, so an off-by-one at CELL_SUBTILE_COLS > 2 shows up.
    const spans = new Set<CrossoverSpan>();
    for (let d = 0; d < CELL_SUBTILE_COLS; d++) spans.add(spanForTileCol(7 * CELL_SUBTILE_COLS + d));
    expect(spans).toEqual(new Set(['left', 'right']));
    expect(spanForTileCol(7 * CELL_SUBTILE_COLS)).toBe('left');
    // And the mode predicate the palette and the brush both turn on.
    expect(crossoverSpanIsHalf('half')).toBe(true);
    expect(crossoverSpanIsHalf('cell')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. The paint — through the REAL builders both roads use
// ───────────────────────────────────────────────────────────────────────────

/** A pair of planes big enough that no fixture cell falls off the end.
 *
 *  ⚠ SIZED DELIBERATELY. A Uint16Array DROPS an out-of-range write silently, so
 *  a plane too short for a fixture's cell row produces a green "nothing was
 *  marked" that looks exactly like a working narrowing. The first draft of this
 *  file was 4 sub-tile rows tall and cell row 2 wrote past the end; the
 *  anti-vacuous assertions in each row are what caught it. */
const PLANE_ROWS = CELL_SUBTILE_ROWS * 8;
function planes() {
  return { a: new Uint16Array(W * PLANE_ROWS), b: new Uint16Array(W * PLANE_ROWS) };
}
function apply(plane: Uint16Array, entries: { index: number; newColl: number }[]) {
  for (const e of entries) plane[e.index] = e.newColl;
}

describe('the stroke — geometry at 16px, the MARK at 8px', () => {
  it.each(['left', 'right'] as const)(
    '%s: reshapes the WHOLE cell and marks ONE half, on both planes, with the right value',
    (span) => {
      const { a, b } = planes();
      const out = paintCollisionRectBothPlanes({
        x: 3, y: 1, w: 1, h: 1, word: SOLID,
        aimedPlane: a, otherPlane: b, tileWidth: W, bothPlanes: true,
        aimedPlaneId: 'a', crossover: 'hand-off', crossoverSpan: span,
      });
      apply(a, out.aimed); apply(b, out.other);

      const all = cellTileIndices(3, 1, W);
      const marked = cellCrossoverIndices(3, 1, W, span);
      const other = all.filter((i) => !marked.includes(i));
      expect(other.length).toBeGreaterThan(0);   // anti-vacuous: there IS an other half

      // GEOMETRY: the whole cell, both planes. The narrowing is the crossover's
      // alone — a stroke that also narrowed the shape would be a new painting
      // unit, which this parcel must not introduce.
      for (const i of all) {
        expect(a[i]! & ~(3 << 14)).toBe(SOLID);
        expect(b[i]! & ~(3 << 14)).toBe(SOLID);
      }
      // MARK: the aimed half only, and the OPPOSITE value per plane (a copy
      // would be a self-mark, which aeon's bake hard-errors on).
      for (const i of marked) {
        expect(readCrossover(a[i])).toBe('to-b');
        expect(readCrossover(b[i])).toBe('to-a');
      }
      // ⚠ THE ROW THE OLD IMPLEMENTATION FAILS. Before mark widths, this half
      // carried the mark too.
      for (const i of other) {
        expect(readCrossover(a[i])).toBe('none');
        expect(readCrossover(b[i])).toBe('none');
      }
    });

  it("the per-cell ('words') form narrows identically — two forms of one tool, one rule", () => {
    const fill = planes(), cells = planes();
    const args = {
      x: 2, y: 2, w: 2, h: 1, tileWidth: W, bothPlanes: true,
      aimedPlaneId: 'a' as const, crossover: 'hand-off' as const, crossoverSpan: 'right' as const,
    };
    const f = paintCollisionRectBothPlanes({
      ...args, word: SOLID, aimedPlane: fill.a, otherPlane: fill.b,
    });
    apply(fill.a, f.aimed); apply(fill.b, f.other);
    const c = paintCollisionCellsBothPlanes({
      ...args, words: [SOLID, SOLID], aimedPlane: cells.a, otherPlane: cells.b,
    });
    apply(cells.a, c.aimed); apply(cells.b, c.other);
    expect(cells.a).toEqual(fill.a);
    expect(cells.b).toEqual(fill.b);
    // Anti-vacuous: something actually got marked, and not everything did.
    const xo = [...fill.a].filter((w) => readCrossover(w) !== 'none').length;
    expect(xo).toBeGreaterThan(0);
    expect(xo).toBeLessThan([...fill.a].filter((w) => w !== 0).length);
  });

  it("'cell' produces the byte-identical plane a build with no span parameter would", () => {
    // BACK-COMPAT, asserted as an equality between two whole planes rather than
    // as prose. `collisionRectCrossoverIndices` returns null for 'cell', so the
    // merge takes the untouched path — this row is what says so.
    expect(collisionRectCrossoverIndices(0, 0, 4, 4, W, 'cell')).toBeNull();
    const withSpan = planes(), without = planes();
    const base = { x: 1, y: 1, w: 2, h: 2, word: SOLID, tileWidth: W, bothPlanes: true,
      aimedPlaneId: 'a' as const, crossover: 'hand-off' as const };
    const p = paintCollisionRectBothPlanes({
      ...base, aimedPlane: withSpan.a, otherPlane: withSpan.b, crossoverSpan: 'cell' });
    apply(withSpan.a, p.aimed); apply(withSpan.b, p.other);
    const q = paintCollisionRectBothPlanes({
      ...base, aimedPlane: without.a, otherPlane: without.b });   // no crossoverSpan at all
    apply(without.a, q.aimed); apply(without.b, q.other);
    expect(withSpan.a).toEqual(without.a);
    expect(withSpan.b).toEqual(without.b);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. THE DISCRIMINATOR — does the mark actually flip the layer?
// ───────────────────────────────────────────────────────────────────────────

describe('⚠ the cancellation — the same gesture at two widths, and only one works', () => {
  /** Paint a two-way pair at `span` and audit it. Everything real: the shipped
   *  builders, the shipped audit. */
  function pairAt(span: CrossoverSpan) {
    const { a, b } = planes();
    const out = paintCollisionRectBothPlanes({
      x: 5, y: 1, w: 1, h: 1, word: SOLID,
      aimedPlane: a, otherPlane: b, tileWidth: W, bothPlanes: true,
      aimedPlaneId: 'a', crossover: 'hand-off', crossoverSpan: span,
    });
    apply(a, out.aimed); apply(b, out.other);
    return { a, b, audit: auditCrossovers(a, b, W), runs: scanCancellingRuns(a, b, a.length, W) };
  }

  it('a pair at CELL width nets to nothing, and the audit says exactly that', () => {
    const { audit, runs } = pairAt('cell');
    expect(audit.cancellingMeasured).toBe(true);
    expect(audit.cancelling).toBe(1);
    // The simulation, not just the count: the player enters on A and leaves on A.
    expect(runs).toHaveLength(1);
    expect(runs[0]!.width).toBe(CELL_SUBTILE_COLS);
    expect(runs[0]!.pairs).toBe(CELL_SUBTILE_COLS);
    expect(runs[0]!.flipsRightward).toBe(false);
    expect(runs[0]!.flipsLeftward).toBe(false);
  });

  it.each(['left', 'right'] as const)('a pair at %s HALF width FLIPS, and the audit is clean', (span) => {
    const { a, b, audit, runs } = pairAt(span);
    expect(audit.pairs).toBeGreaterThan(0);       // there IS a two-way pair to judge
    expect(audit.cancellingMeasured).toBe(true);
    expect(audit.cancelling).toBe(0);
    expect(runs).toEqual([]);
    // ⚠ THE CONTROL, AND WITHOUT IT THIS ROW IS VACUOUS. `runs` being empty is
    // also what a scanner that found nothing EVER would return. So take the
    // same painted pair, widen it by ONE adjacent column, and require the scan
    // to find it: green above and red here is the pair of results that says the
    // width is what decided it.
    expect(widenedByOneColumn(a, b, span)).toHaveLength(1);
  });

  /** The same half-cell pair with one more paired column bolted on — two
   *  columns, even, so it must cancel. */
  function widenedByOneColumn(a: Uint16Array, b: Uint16Array, span: CrossoverSpan) {
    const wa = Uint16Array.from(a), wb = Uint16Array.from(b);
    const half = cellCrossoverIndices(5, 1, W, span);
    // The neighbouring sub-tile column, on the SAME rows the half mark occupies
    // — derived from the mark's own indices, so it cannot drift to another row.
    for (const i of half) {
      const neighbour = span === 'left' ? i + 1 : i - 1;
      wa[neighbour] = withCrossover(SOLID, 'to-b');
      wb[neighbour] = withCrossover(SOLID, 'to-a');
    }
    return scanCancellingRuns(wa, wb, wa.length, W);
  }

  it('does NOT fire on two SEPARATED one-way marks — the shape that actually works', () => {
    // The witness packet's §6 layout: plane A carries a mark at one place,
    // plane B at another, nothing paired. Reporting this would fire on the
    // correct answer, which is the failure mode a parity-only check has.
    const { a, b } = planes();
    for (const i of cellTileIndices(2, 1, W)) a[i] = withCrossover(SOLID, 'to-b');
    for (const i of cellTileIndices(9, 1, W)) b[i] = withCrossover(SOLID, 'to-a');
    const audit = auditCrossovers(a, b, W);
    expect(audit.oneWay).toBeGreaterThan(0);      // it IS one-way, and says so
    expect(audit.pairs).toBe(0);
    expect(audit.cancelling).toBe(0);
    expect(scanCancellingRuns(a, b, a.length, W)).toEqual([]);
  });

  it('an ODD run of paired columns flips — the parity is the mechanism, not the width', () => {
    // Three adjacent paired columns: A→B, B→A, A→B. Net: flipped. This is what
    // says the check models the traversal rather than testing `width % 2`
    // against a cell size it happens to know.
    const { a, b } = planes();
    for (const col of [10, 11, 12]) {
      for (const row of [2, 3]) {
        a[row * W + col] = withCrossover(SOLID, 'to-b');
        b[row * W + col] = withCrossover(SOLID, 'to-a');
      }
    }
    const runs = scanCancellingRuns(a, b, a.length, W);
    expect(runs).toEqual([]);
    // ...and FOUR does not.
    for (const row of [2, 3]) {
      a[row * W + 13] = withCrossover(SOLID, 'to-b');
      b[row * W + 13] = withCrossover(SOLID, 'to-a');
    }
    const four = scanCancellingRuns(a, b, a.length, W);
    expect(four).toHaveLength(1);
    expect(four[0]!.width).toBe(4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. THE ENGINE SIDE — parsed out of aeon, at a revision, never retyped
// ───────────────────────────────────────────────────────────────────────────

/** Pinned: a moving target is not an anchor. `a2ba03d7` is aeon `origin/master`
 *  on 2026-09-04 and carries both files below. */
const AEON_REV = 'a2ba03d7';
const CONSTANTS = 'engine/system/constants.emp';
const BAKE = 'tools/ojz_strip_gen.py';

/** `pub const NAME = <expr>` from a `.emp` file, as source text.
 *
 *  ⚠ THE COMMENT IS STRIPPED AS `//`, NOT AS `/`. The first draft captured
 *  `[^/\n]+`, which truncates `BLOCK_TILE_SIZE * 8 / BLOCK_COLL_COLS` at the
 *  DIVISION and reads COLL_CELL_W as 128. It failed loudly here because the
 *  expectations are derived; had this file typed `expect(cellW).toBe(8)` it
 *  would have been a parse bug wearing a green tick. */
function constExpr(src: string, name: string): string | null {
  const m = new RegExp(`^\\s*pub const ${name}\\s*=\\s*(.+)$`, 'm').exec(src);
  return m ? m[1]!.replace(/\/\/.*$/, '').trim() : null;
}

describe('the engine side of the ratio, READ from aeon at a pinned revision', () => {
  const repo = peerRepo('aeon');
  const blob = repo ? readAtRev(repo, AEON_REV, CONSTANTS) : null;
  const bake = repo ? readAtRev(repo, AEON_REV, BAKE) : null;

  it('⚠ derives COLL_CELL_W/H from aeon and shows Aurora\'s cell is TWO trigger columns', () => {
    // LOUD ON UNMEASURABLE. This row is the reason the whole parcel is shaped
    // the way it is, so it must not quietly pass when it measured nothing.
    if (!repo || !blob?.ok) {
      expect.fail(
        'COULD NOT MEASURE the engine side: '
        + (repo ? `aeon has no ${CONSTANTS} at ${AEON_REV} (${blob?.ok === false ? blob.why : 'unknown'})`
                : 'no aeon peer checkout resolved (set AEON_DIR or EMPYREAN_SUITE_ROOT)')
        + '. This row DERIVES the 8px trigger width the whole mark-width feature '
        + 'rests on; a green here without it would be a claim nobody checked.');
      return;
    }
    const src = blob.text;
    // Evaluate the constant EXPRESSIONS, so a change to BLOCK_COLL_COLS is seen.
    const num = (name: string): number => {
      const e = constExpr(src, name);
      expect(e, `aeon ${CONSTANTS} has no \`pub const ${name}\``).toBeTruthy();
      // The four constants below are pure integer arithmetic over each other.
      const scope: Record<string, number> = {};
      for (const dep of ['BLOCK_TILE_SIZE', 'BLOCK_COLL_ROWS', 'BLOCK_COLL_COLS']) {
        if (dep === name) continue;
        const de = constExpr(src, dep);
        if (de && !/[A-Z_]{3,}/.test(de.replace(/BLOCK_TILE_SIZE/g, ''))) {
          scope[dep] = evalIntExpr(de, scope);
        }
      }
      return evalIntExpr(e!, scope);
    };
    const cellW = num('COLL_CELL_W');
    const cellH = num('COLL_CELL_H');

    // Aurora's cell edge, in the same units — derived from its own expansion,
    // not typed: the cell is CELL_SUBTILE_COLS sub-tiles wide and a sub-tile is
    // an 8px nametable tile, which is aeon's COLL_CELL_W here.
    const auroraCellW = CELL_SUBTILE_COLS * cellW;

    // THE CLAIM, spelled as arithmetic: a cell-wide mark spans an EVEN number
    // of trigger columns, so a two-way pair at that width nets to nothing.
    const triggerColumnsPerCell = auroraCellW / cellW;
    expect(triggerColumnsPerCell).toBe(CELL_SUBTILE_COLS);
    expect(triggerColumnsPerCell % 2).toBe(0);
    // And the asymmetry that makes X the axis that matters: Y quantises at a
    // FULL Aurora cell, so a mark never spans two trigger rows.
    expect(cellH).toBe(auroraCellW);
    expect(cellW).toBeLessThan(cellH);
  });

  it('⚠ aeon\'s bake indexes the 8px SUB-TILE COLUMN, so a half-cell mark survives to the ROM', () => {
    // The other half of "Aurora can close this alone". If their bake collapsed
    // a cell to one word, a half-cell mark would work in the editor and be
    // flattened on the way to the game — a feature that does nothing.
    if (!repo || !bake?.ok) {
      expect.fail(
        `COULD NOT MEASURE aeon's bake (${BAKE} at ${AEON_REV}): `
        + (repo ? (bake?.ok === false ? bake.why : 'unknown') : 'no aeon peer checkout resolved')
        + '. This row is the evidence that Aurora owns this gap alone.');
      return;
    }
    const fn = /def apply_editor_collision_overlay[\s\S]*?\n(?=def |\Z)/.exec(bake.text);
    expect(fn, 'aeon has no apply_editor_collision_overlay at this revision').toBeTruthy();
    const body = fn![0];
    // The index expression: `o = (cr * 2) * W + col`, where `col` runs over the
    // saved plane's TILE columns. `col` un-multiplied is the whole point — a
    // bake reading `col * 2` would be sampling one sub-tile per cell.
    expect(body).toMatch(/o\s*=\s*\(\s*cr\s*\*\s*2\s*\)\s*\*\s*W\s*\+\s*col\b/);
    // ...and it really does loop `col` over every column, not every other one.
    expect(body).toMatch(/for\s+col\s+in\s+range\(len\(coll_a\)\)/);
  });
});

/** Evaluate the tiny integer expressions aeon's constants use (`A * 8 / B`),
 *  with named dependencies substituted. Deliberately not `eval`: only integers,
 *  identifiers from `scope`, and `* / + -` are accepted, so a constant that
 *  grew a real expression fails loudly instead of being mis-parsed. */
function evalIntExpr(expr: string, scope: Record<string, number>): number {
  const substituted = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id) => {
    expect(scope, `unresolved identifier ${id} in aeon constant expression "${expr}"`)
      .toHaveProperty(id);
    return String(scope[id]);
  });
  expect(substituted, `unexpected syntax in aeon constant expression "${expr}"`)
    .toMatch(/^[\d\s*/+\-()]+$/);
  // eslint-disable-next-line no-new-func
  const v = Function(`"use strict"; return (${substituted});`)() as number;
  expect(Number.isInteger(v), `aeon constant "${expr}" is not an integer`).toBe(true);
  return v;
}
