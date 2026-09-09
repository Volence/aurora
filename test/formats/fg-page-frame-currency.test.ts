/**
 * CURRENCY FOR THE FG BUDGET'S *UNIT* — the page-frame quantum and the frame
 * count Aurora derives from it, held against aeon's own declarations at a
 * committed revision.
 *
 * ═══ THE FINDING THIS FILE WAS BUILT FOR ═══
 *
 * `fg-pool-ceiling-currency.test.ts` next door gates the CEILING, and it was
 * built because Aurora showed an author 1024 tiles against an engine that
 * declares 768. That corrected the ceiling's VALUE. THE UNIT WAS ALSO WRONG.
 *
 * aeon carves the FG art window into FIXED page frames (`quantum` in the VRAM
 * map, `ART_POOL_PAGE_TILES` in the engine) and an act's baked art is split into
 * pages of that size; a page occupies a whole frame however full it is. So the
 * quantity that can refuse an act is its PACKED PAGE COUNT against the frame
 * count, not its tile count against the tile ceiling. Aurora cannot run that
 * packing — it happens at bake time in aeon's tooling — so `computeActBudget`
 * reports a LOWER BOUND, and this file gates the two numbers that bound is built
 * out of.
 *
 * ⚠ THE FRAME COUNT IS EXPECTED TO MOVE, AND THAT IS NOT A DEFECT. The engine
 * lane has an open recommendation to shrink the pool, which changes the frame
 * count with it. A gate that pinned today's frame count would go red on a
 * landing that is entirely correct, which is worse than no gate: it trains a
 * reader to dismiss it. So NOTHING HERE PINS A FRAME COUNT. Every row reads
 * aeon's declared inputs at the tip and DIVIDES, exactly as aeon does
 * (`pub const PAGE_FRAMES = POOL_TILE_CEILING / ART_POOL_PAGE_TILES`) and
 * exactly as Aurora does. What goes red is our copy drifting, or aeon changing
 * the SHAPE of the derivation under us.
 *
 * ═══ WHAT AEON ALREADY HOLDS TOGETHER, SO THIS GATE NEED NOT ═══
 *
 * `games/sonic4/config/constants.emp` carries an `ensure` that the VRAM map's
 * `fg_art_pool` size equals the engine's `POOL_TILE_CEILING`, which makes drift
 * between those two build-fatal on aeon's side. This gate is therefore about
 * OUR copy being current, not about policing theirs.
 *
 * ═══ THE THREE RULES, INHERITED ═══
 *
 *   1. aeon is read at a COMMITTED REVISION through git objects, never through
 *      the sibling working tree (a peer lane's live checkout mid-edit).
 *   2. Every message NAMES the revision it read.
 *   3. No aeon checkout, or a revision that does not resolve, is a LOUD SKIP and
 *      never a pass.
 *
 * ⚠ WHAT THIS FILE DOES NOT CLAIM. It gates the unit, not the counting.
 * `computeActBudget` still sums TWO checkerboard VRAM groups from the retired
 * per-section VRAM-base scheme, so a tile the engine dedupes globally is counted
 * twice: the reading stays CONSERVATIVE BY AN AMOUNT NOBODY HAS QUANTIFIED.
 * Answering the fragmentation question did not make the figure equivalent, and
 * "fragmentation cannot refuse you" must not travel as "your number is right".
 * Pinning is the other open one: a pinned frame is never an eviction candidate,
 * so the capacity covering a moving view is the UNPINNED frame count, which aeon
 * has open with no measurement behind it. Both are carried to the author in the
 * reply's `unquantified[]`; neither is closed here.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { peerRepo, resolveRev, readAtRev, AURORA_DIR } from '../support/peer-repo';
import {
  FG_TILE_LIMIT, FG_PAGE_TILES, FG_PAGE_FRAMES, deriveFgPageFrames,
} from '../../src/core/export/vram-coloring';

const AEON_TIP = 'origin/master';
const NOT_OURS = 'NOT AN AURORA REGRESSION: the vendored aeon FG page geometry is stale.';

const VRAM_TOML = 'games/sonic4/vram.toml';
const CONSTANTS = 'engine/system/constants.emp';
const PAGE_CACHE = 'engine/level/page_cache.emp';

/** Anchored on the region's own NAME: this map declares two dozen regions. */
const QUANTUM_IN_TOML = /name\s*=\s*"fg_art_pool"[\s\S]{0,400}?\nquantum\s*=\s*(\d+)/;
const PAGE_TILES_IN_ENGINE = /^pub const ART_POOL_PAGE_TILES\s*=\s*(\d+)/m;
const CEILING_IN_ENGINE = /^pub const POOL_TILE_CEILING\s*=\s*(\d+)/m;
/**
 * THE SHAPE OF THE DERIVATION, not its result. aeon spells no frame count
 * anywhere — it divides — so there is no number to compare against. What can go
 * wrong is aeon changing HOW the count comes out of the pool (reserving frames,
 * say), which would silently make Aurora's division wrong while every value it
 * reads stayed correct. That is what this pattern catches.
 */
const FRAMES_FORMULA = /^pub const PAGE_FRAMES\s*=\s*POOL_TILE_CEILING\s*\/\s*ART_POOL_PAGE_TILES\s*$/m;
/** The sentence the `unquantified[]` pinning caveat rests on. */
const PINNING_RULE = /a page whose refcount is 0 and is not pinned is an eviction\s*\n?\/\/\s*candidate/;

const aeon = peerRepo('aeon');
const tip = aeon === null ? null : resolveRev(aeon, AEON_TIP);

/** Loud skip, never a pass: an absent constant and a passing check must differ. */
function unmeasurable(ctx: { skip: (why: string) => void }): boolean {
  if (aeon === null) {
    ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR);'
      + ' CANNOT MEASURE whether the FG page geometry is still what aeon declares');
    return true;
  }
  if (tip === null) {
    ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon};`
      + ' CANNOT MEASURE whether the FG page geometry is still what aeon declares');
    return true;
  }
  return false;
}

/** Read a peer file at the tip, failing (not skipping) when the path is gone. */
function textAt(p: string): string {
  const at = readAtRev(aeon as string, tip as string, p);
  expect(
    at.ok,
    at.ok ? '' : `${NOT_OURS} ${p} at ${tip}: ${(at as { ok: false; why: string }).why}`,
  ).toBe(true);
  return at.ok ? at.text : '';
}

/** Extract, refusing to pass on a pattern that matched nothing. */
function extract(text: string, p: string, pattern: RegExp, quote: string): string | null {
  const m = pattern.exec(text);
  expect(
    m !== null,
    `${NOT_OURS}\n`
    + `  The extractor for ${p} matched NOTHING at aeon ${tip}.\n`
    + `  It was looking for ${quote}\n`
    + `  with ${String(pattern)}.\n`
    + '  Either aeon rewrote that line (re-read the authority and re-vendor) or this\n'
    + '  pattern is stale. An extractor that cannot fail is not a check.',
  ).toBe(true);
  return m === null ? null : (m[1] ?? '');
}

describe('FG page geometry is still what aeon declares', () => {
  it(`the page quantum matches ${VRAM_TOML} at aeon ${AEON_TIP}`, (ctx) => {
    if (unmeasurable(ctx)) return;
    const q = extract(textAt(VRAM_TOML), VRAM_TOML, QUANTUM_IN_TOML,
      'the [[region]] named "fg_art_pool", its `quantum =` key');
    if (q === null) return;
    expect(
      Number(q),
      `${NOT_OURS}\n`
      + `  Aurora's FG_PAGE_TILES is ${FG_PAGE_TILES}; aeon declares ${q} at ${tip}.\n`
      + `  Read it:   git -C <aeon> show ${tip}:${VRAM_TOML}\n`
      + '  This is the size of the fixed frame the FG art window is carved into, so it is\n'
      + '  the DIVISOR of every page-frame figure check_budget shows an author, and it is\n'
      + '  the number that makes a half-full page cost a whole frame.\n'
      + '  Update src/core/export/vram-coloring.ts and re-read its citation block.',
    ).toBe(FG_PAGE_TILES);
  });

  it(`the page quantum matches ${CONSTANTS} at aeon ${AEON_TIP}`, (ctx) => {
    if (unmeasurable(ctx)) return;
    const n = extract(textAt(CONSTANTS), CONSTANTS, PAGE_TILES_IN_ENGINE,
      'the engine-side twin: `pub const ART_POOL_PAGE_TILES = N`');
    if (n === null) return;
    expect(
      Number(n),
      `${NOT_OURS}\n`
      + `  Aurora's FG_PAGE_TILES is ${FG_PAGE_TILES}; aeon's ART_POOL_PAGE_TILES is ${n}`
      + ` at ${tip}.\n`
      + `  Read it:   git -C <aeon> show ${tip}:${CONSTANTS}\n`
      + '  The VRAM map and the engine constant are the two authorities for one quantity;\n'
      + '  reading only one is reading a copy.',
    ).toBe(FG_PAGE_TILES);
  });

  it('the frame count still comes out of the pool the way Aurora divides it', (ctx) => {
    if (unmeasurable(ctx)) return;
    const text = textAt(CONSTANTS);
    // ROW ONE: the SHAPE. Every value below could be current while aeon had
    // changed what the count is derived FROM, and only this notices.
    expect(
      FRAMES_FORMULA.test(text),
      `${NOT_OURS}\n`
      + `  aeon's PAGE_FRAMES is no longer POOL_TILE_CEILING / ART_POOL_PAGE_TILES at ${tip}.\n`
      + `  Read it:   git -C <aeon> show ${tip}:${CONSTANTS}\n`
      + '  Aurora derives FG_PAGE_FRAMES with exactly that division. If aeon now reserves\n'
      + '  frames, or derives the count some other way, Aurora is handing an author a\n'
      + '  capacity the engine does not have, while every constant it reads is correct.\n'
      + '  Re-read the engine declaration and change deriveFgPageFrames to match.',
    ).toBe(true);

    // ROW TWO: the VALUES, divided rather than pinned. NOTHING HERE SPELLS A
    // FRAME COUNT — a pool resize is expected and must stay green.
    const ceiling = extract(text, CONSTANTS, CEILING_IN_ENGINE,
      'the engine constant: `pub const POOL_TILE_CEILING = N`');
    const quantum = extract(text, CONSTANTS, PAGE_TILES_IN_ENGINE,
      'the engine constant: `pub const ART_POOL_PAGE_TILES = N`');
    if (ceiling === null || quantum === null) return;

    const aeonFrames = deriveFgPageFrames(Number(ceiling), Number(quantum));
    expect(
      aeonFrames,
      `${NOT_OURS}\n`
      + `  Aurora derives ${FG_PAGE_FRAMES} FG page frames from its vendored`
      + ` ${FG_TILE_LIMIT} / ${FG_PAGE_TILES};\n`
      + `  aeon derives ${aeonFrames} from ${ceiling} / ${quantum} at ${tip}.\n`
      + `  Read it:   git -C <aeon> show ${tip}:${CONSTANTS}\n`
      + '  THE FRAME COUNT MOVING IS EXPECTED: the engine lane has an open recommendation\n'
      + '  to shrink the pool. This row is not objecting to the move; it is saying OUR copy\n'
      + '  has not followed it. Update FG_TILE_LIMIT (and FG_PAGE_TILES if the quantum\n'
      + '  moved) in src/core/export/vram-coloring.ts; the frame count follows on its own.',
    ).toBe(FG_PAGE_FRAMES);
  });

  it('pinning is still a thing, so the caveat about it is still true', (ctx) => {
    if (unmeasurable(ctx)) return;
    // check_budget TELLS AN AUTHOR that pinned frames leave fewer than the full
    // count to cover a moving view. That is a claim about aeon's behaviour, and a
    // claim with no gate is how the last two wrong numbers survived. If pinning
    // ever goes away, the caveat becomes a false warning rather than a true one.
    expect(
      PINNING_RULE.test(textAt(PAGE_CACHE)),
      `${NOT_OURS}\n`
      + `  page_cache.emp no longer states the pinning/eviction rule at ${tip}.\n`
      + `  Read it:   git -C <aeon> show ${tip}:${PAGE_CACHE}\n`
      + '  src/core/agent/budget.ts tells an author that a pinned frame is never an\n'
      + '  eviction candidate, so the frames covering a moving view are fewer than the\n'
      + '  carved count. Re-read the engine and re-word that caveat, or drop it.',
    ).toBe(true);
  });
});

describe('Aurora derives the frame count rather than storing one', () => {
  /**
   * NOT A PEER READ — this one looks at OUR OWN source, and it is the row that
   * makes the rest of the file matter. Every gate above compares a value; none
   * of them can see someone "simplifying" `FG_TILE_LIMIT / FG_PAGE_TILES` into
   * the literal it evaluates to today. That edit passes every value comparison
   * on the day it is made and is wrong the day aeon resizes the pool, which is
   * precisely the failure the ceiling had.
   */
  const SOURCE = path.join(AURORA_DIR, 'src/core/export/vram-coloring.ts');

  it('defines FG_PAGE_FRAMES by division, not by a literal', () => {
    const src = readFileSync(SOURCE, 'utf8');
    const m = /export const FG_PAGE_FRAMES\s*=\s*([^;]+);/.exec(src);
    expect(m !== null, `no FG_PAGE_FRAMES declaration found in ${SOURCE}`).toBe(true);
    const rhs = (m?.[1] ?? '').trim();
    expect(
      /^deriveFgPageFrames\(\s*FG_TILE_LIMIT\s*,\s*FG_PAGE_TILES\s*\)$/.test(rhs),
      `FG_PAGE_FRAMES is declared as \`${rhs}\`.\n`
      + '  It must be derived from the two vendored constants, the way aeon derives its own\n'
      + '  PAGE_FRAMES ("NO LITERAL HERE, DELIBERATELY", engine/system/constants.emp). A\n'
      + '  literal here passes every currency row in this file on the day it is typed and is\n'
      + '  wrong the day the pool is resized, with nothing to notice, which is exactly how\n'
      + '  the FG tile ceiling came to be a third too generous.',
    ).toBe(true);
  });

  it('agrees with aeon\'s own comptime guard: the frames tile the window exactly', () => {
    expect(FG_PAGE_FRAMES * FG_PAGE_TILES).toBe(FG_TILE_LIMIT);
  });
});
