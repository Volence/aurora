// THE SENTENCE AN AGENT READS ABOUT CROSSOVER VALUE 3, CHECKED AGAINST aeon's BAKER.
//
// ROADMAP row 212 (EXPIRY-LISTS-WITH-NO-READER). `get_collision_region`'s MCP tool
// description told an agent, from 2026-08-29 to 2026-09-25, that "as of
// 2026-08-29 the bake does not read this field, so NOTHING downstream refuses
// it". aeon 8a4313b5 (2026-09-02) made `bake_plane_cell` raise on the reserved
// value 3, and this repo corrected the SAME fact in `crossover-audit.ts`'s
// `reserved` docblock on 2026-09-09. The agent-facing copy was a second author
// of that fact with no reader, so it went on saying the old thing for 23 days.
//
// This file is the reader. It derives "does aeon's bake refuse 3" from aeon's
// PUBLISHED `tools/collision_pipeline.py` (origin/master, through git objects,
// never the sibling working tree), reads what the shipped sentence claims, and
// fails when they disagree. It reddens on aeon's change, not on ours, which is
// the point: the alternative, a frozen pin, goes stale in silence.
//
// ⚠ THE DETECTOR HAS A CONTROL. The derivation below is run at aeon
// `8a4313b5^`, where `XOVER_RESERVED` was already DEFINED but nothing raised on
// it, and must say "not enforced" there. Without that row a detector that
// matched the constant's definition would be green forever.
//
// LOUD ON UNMEASURABLE: no aeon checkout, or a revision that does not resolve,
// is a `ctx.skip` naming what was looked for. Never a pass.

import { describe, it, expect } from 'vitest';
import { CROSSOVER_RESERVED_BAKE_CLAUSE } from '../../src/core/collision/crossover-audit';
import { EDITOR_METHODS } from '../../src/main/editor-methods';
import { peerRepo, readAtRev, resolveRev, isAncestor } from '../support/peer-repo';

const AEON_TIP = 'origin/master';
/** The commit that added the raise; its parent is the control. */
const RAISE_LANDED = '8a4313b5';
const PIPELINE = 'tools/collision_pipeline.py';

/**
 * Does `bake_plane_cell` in this source RAISE on the reserved crossover value?
 * Reads the function's body (up to the next top-level `def`) and looks for a
 * comparison against XOVER_RESERVED followed, within the same `if` block, by a
 * `raise`. Returns null when the function is not there at all, which is a
 * rename the caller must report rather than read as "does not enforce".
 */
export function bakeRaisesOnReserved(src: string): boolean | null {
  const start = src.search(/^def bake_plane_cell\(/m);
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/^(def |class )/m);
  const body = next < 0 ? rest : rest.slice(0, next);
  return /if\s+[^\n]*==\s*XOVER_RESERVED\s*:\s*\n\s+raise\b/.test(body)
    || /if\s+XOVER_RESERVED\s*==[^\n]*:\s*\n\s+raise\b/.test(body);
}

/** What the shipped clause claims, read from its canonical spelling. */
function clauseClaimsEnforced(clause: string): boolean | null {
  const yes = /aeon's bake enforces it/.test(clause);
  const no = /aeon's bake does not enforce it/.test(clause);
  if (yes === no) return null;
  return yes;
}

describe('get_collision_region: the reserved-crossover sentence against aeon\'s baker', () => {
  it('ships in the get_collision_region description (the tested sentence is the published one)', () => {
    const m = EDITOR_METHODS.find((x) => x.name === 'get_collision_region');
    expect(m, 'get_collision_region is no longer in EDITOR_METHODS').toBeDefined();
    expect(m!.description).toContain(CROSSOVER_RESERVED_BAKE_CLAUSE);
    // The retired spelling must not come back beside it.
    expect(m!.description).not.toMatch(/does not read this field/);
  });

  it('claims exactly what aeon origin/master\'s bake_plane_cell does with XOVER_RESERVED', (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo, so ${PIPELINE} at ${AEON_TIP} could not be read`);
      return;
    }
    const blob = readAtRev(repo, AEON_TIP, PIPELINE);
    if (!blob.ok && /does not resolve/.test(blob.why)) {
      ctx.skip(`SKIPPED, NOT PASSED: ${blob.why}`);
      return;
    }
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    const enforced = bakeRaisesOnReserved((blob as { ok: true; text: string }).text);
    expect(enforced, `bake_plane_cell is not in ${PIPELINE} at ${AEON_TIP}: renamed? Re-read aeon and re-point the clause`).not.toBeNull();
    const claimed = clauseClaimsEnforced(CROSSOVER_RESERVED_BAKE_CLAUSE);
    expect(claimed, 'the clause says neither "aeon\'s bake enforces it" nor "aeon\'s bake does not enforce it", so its claim cannot be read').not.toBeNull();
    expect(claimed, `aeon ${AEON_TIP} ${enforced ? 'RAISES' : 'does NOT raise'} on XOVER_RESERVED in bake_plane_cell, and CROSSOVER_RESERVED_BAKE_CLAUSE claims the opposite. `
      + 'Re-read aeon and rewrite the clause (src/core/collision/crossover-audit.ts).').toBe(enforced);
  });

  it('control: the detector says "not enforced" at the parent of the commit that added the raise', (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) { ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo'); return; }
    const parent = `${RAISE_LANDED}^`;
    const blob = readAtRev(repo, parent, PIPELINE);
    if (!blob.ok && /does not resolve/.test(blob.why)) { ctx.skip(`SKIPPED, NOT PASSED: ${blob.why}`); return; }
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    const text = (blob as { ok: true; text: string }).text;
    // The control is only a control if the constant already existed there.
    expect(text).toMatch(/^XOVER_RESERVED\s*=\s*3/m);
    expect(bakeRaisesOnReserved(text)).toBe(false);
  });

  it('the reading names a published aeon revision', (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) { ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo'); return; }
    const m = /read at aeon ([0-9a-f]{7,40})/.exec(CROSSOVER_RESERVED_BAKE_CLAUSE);
    expect(m, 'the clause no longer carries "read at aeon <sha>"').not.toBeNull();
    const tip = resolveRev(repo, AEON_TIP);
    if (tip === null) { ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in aeon`); return; }
    expect(resolveRev(repo, m![1]), `aeon ${m![1]} does not resolve`).not.toBeNull();
    expect(isAncestor(repo, m![1], tip), `aeon ${m![1]} is not on ${AEON_TIP}`).toBe(true);
  });
});
