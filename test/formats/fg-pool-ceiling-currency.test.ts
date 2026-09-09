/**
 * CURRENCY FOR `FG_TILE_LIMIT` — the act FG art pool ceiling Aurora shows an
 * author, held against aeon's own declaration at a committed revision.
 *
 * ═══ THE FINDING THIS FILE WAS BUILT FOR ═══
 *
 * `src/core/agent/budget.ts` answers the `check_budget` tool. It reports
 * `limit: FG_TILE_LIMIT` and a boolean `fits`, and `editor-methods.ts` puts the
 * same number in the tool's DESCRIPTION, which is the only place an agent can
 * learn its budget before spending it. That number was 1024, under the comment
 * "BG region starts at tile slot 1024 ($400); FG group unions must fit below it."
 *
 * THE PREMISE WAS TRUE AND THE CONCLUSION WAS FALSE. aeon's BG arena does begin
 * at slot 1024 - Aurora vendors that same number as `BG_TILE_BASE_SLOT` in the
 * bganim consumer contract, currency-gated beside this file. But the FG pool
 * does not reach it: `fg_art_pool` is based at slot 0 with its own declared
 * extent, and eleven other regions occupy the gap. Aurora was handing an author
 * a pool a third larger than the one aeon allocates.
 *
 * The reason a content hash could not have caught it is the reason this whole
 * family of files exists, and `bg-override-contract-currency.test.ts` states it
 * best: nothing inside this repo can observe aeon changing. Worse here, there
 * was nothing to hash - `FG_TILE_LIMIT` was a bare literal with no provenance
 * marker, no contract entry and no gate, which is why it outlived two moves of
 * the quantity it claimed to be (aeon's own key records 960 -> 896 -> today).
 *
 * ═══ THE THREE RULES, INHERITED ═══
 *
 *   1. aeon is read at a COMMITTED REVISION through git objects
 *      (`readAtRev`, i.e. `git -C <aeon> show <rev>:<path>`), never through the
 *      sibling working tree, which on this machine is some peer lane's live
 *      checkout mid-edit.
 *   2. Every message NAMES the revision it read.
 *   3. No aeon checkout, or a revision that does not resolve, is a LOUD SKIP
 *      and never a pass. An absent constant and a passing check must not be the
 *      same output.
 *
 * ⚠ WHAT THIS FILE DOES NOT CLAIM, AND THE ROW IS OPEN RATHER THAN CLOSED.
 * It gates the CEILING, not the COUNTING. `computeActBudget` sums the unique
 * tiles of TWO checkerboard groups and compares the total to this limit, which
 * is the shape of the retired per-section VRAM-base scheme (`vram-coloring.ts`'s
 * own header records that path's retirement). aeon describes the act FG art as
 * one globally-deduped paged pool, so a tile used by both groups is counted
 * twice here and once there. That mismatch is NOT measured by anything in this
 * repo and is not fixed by this file; see
 * docs/reviews/2026-09-09-guard-residue-offschema.md §3.
 */

import { describe, it, expect } from 'vitest';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';
import { FG_TILE_LIMIT } from '../../src/core/export/vram-coloring';

const AEON_TIP = 'origin/master';
const NOT_OURS = 'NOT AN AURORA REGRESSION: the vendored aeon FG pool ceiling is stale.';

interface Authority {
  path: string;
  pattern: RegExp;
  quote: string;
}

/**
 * THE AUTHORITY LADDER. aeon's tree names `games/sonic4/vram.toml` as the VRAM
 * placement authority; `tools/gen_vram_map.py` generates `tools/vram_map.py`
 * from it, and aeon's own `test_gen_vram_map.py::test_generated_artifacts_are_in_sync`
 * reddens their build on an un-regenerated edit. So the toml is FIRST and the
 * generated copy corroborates. Reading only the generated copy is reading a
 * copy, and a copy is what carried a stale line number in the neighbouring
 * contract for a fortnight.
 */
const AUTHORITIES: Authority[] = [
  {
    path: 'games/sonic4/vram.toml',
    // Anchored on the region's own NAME so a `tiles` key belonging to any other
    // region cannot answer for it. The same anchoring rule as the bg_region
    // extractor next door, and for the same reason: this file declares two
    // dozen regions and they all have a `tiles =`.
    pattern: /name\s*=\s*"fg_art_pool"[\s\S]{0,400}?\ntiles\s*=\s*(\d+)/,
    quote: 'the [[region]] named "fg_art_pool", its `tiles =` key',
  },
  {
    path: 'tools/vram_map.py',
    pattern: /^POOL_TILE_CEILING = (\d+)$/m,
    quote: 'the GENERATED block: `POOL_TILE_CEILING = N`',
  },
];

const aeon = peerRepo('aeon');
const tip = aeon === null ? null : resolveRev(aeon, AEON_TIP);

describe('FG_TILE_LIMIT is still what aeon declares the FG art pool to be', () => {
  for (const a of AUTHORITIES) {
    it(`matches ${a.path} at aeon ${AEON_TIP}`, (ctx) => {
      if (aeon === null) {
        ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR);'
          + ' CANNOT MEASURE whether FG_TILE_LIMIT is still what aeon declares');
        return;
      }
      if (tip === null) {
        ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon};`
          + ' CANNOT MEASURE whether FG_TILE_LIMIT is still what aeon declares');
        return;
      }

      const at = readAtRev(aeon, tip, a.path);
      // NOT a skip: the revision resolved, so this WAS measured, and a cited
      // authority that is gone at aeon's tip is drift of the loudest kind.
      expect(
        at.ok,
        at.ok ? '' : `${NOT_OURS} ${a.path} at ${tip}: ${(at as { ok: false; why: string }).why}`,
      ).toBe(true);
      if (!at.ok) return;

      const m = a.pattern.exec(at.text);
      // NOT a silent pass: an extractor that matches nothing has stopped being
      // an instrument. Either aeon rewrote the line (which is the drift being
      // looked for) or this pattern is stale. Do not relax it into a match.
      expect(
        m !== null,
        `${NOT_OURS}\n`
        + `  The extractor for ${a.path} matched NOTHING at aeon ${tip}.\n`
        + `  It was looking for ${a.quote}\n`
        + `  with ${String(a.pattern)}.\n`
        + '  Either aeon rewrote that line (re-read the authority and re-vendor) or this\n'
        + '  pattern is stale. An extractor that cannot fail is not a check.',
      ).toBe(true);
      if (m === null) return;

      expect(
        Number(m[1]),
        `${NOT_OURS}\n`
        + `  Aurora's FG_TILE_LIMIT is ${FG_TILE_LIMIT}; aeon declares ${m[1]} at ${tip}.\n`
        + `  Authority: ${a.quote} in ${a.path}.\n`
        + `  Read it:   git -C <aeon> show ${tip}:${a.path}\n`
        + '  Aurora shows this number to an author as their FG tile budget and derives\n'
        + '  check_budget\'s `fits` from it, so a stale one is a wrong budget on the\n'
        + '  generous side: an act Aurora calls fitting that aeon will not take.\n'
        + '  Update src/core/export/vram-coloring.ts and re-read its citation block.',
      ).toBe(FG_TILE_LIMIT);
    });
  }

  // Anti-vacuous: a ladder that lost its rungs would skip every row above and
  // still print green.
  it('reads more than one authority', () => {
    expect(AUTHORITIES.length).toBeGreaterThan(1);
  });
});
