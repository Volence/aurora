// THE SENTENCE AN AGENT READS ABOUT BITS 15:14, CHECKED AGAINST aeon's BAKER.
//
// ROADMAP row 212 (EXPIRY-LISTS-WITH-NO-READER) built this reader: the
// `get_collision_region` description is a second author of "what does aeon's
// bake do with the reserved crossover bits", and a second author with no reader
// went on saying an old thing for 23 days. It derives the answer from aeon's
// PUBLISHED `tools/collision_pipeline.py` (origin/master, through git objects),
// reads what the shipped sentence claims, and fails when they disagree.
//
// ⚠ RE-POINTED 2026-09-26 (ROADMAP rows 223+224), and THIS IS WHY IT WENT RED.
// It used to look for `if ... == XOVER_RESERVED: raise` (the value 3 only). aeon's
// LINES-EVERYWHERE (19978b00) retired the painted marks: XOVER_* are gone and
// `bake_plane_cell` now raises on ANY non-zero bits 15:14, through
// `plane_reserved_bits(cell_word)`. The clause is now
// `RESERVED_BITS_BAKE_CLAUSE` (core/collision/reserved-bits-audit.ts) and says
// that; the detector below looks for the new refusal. The file keeps its name so
// the row's history is one `git log` away.
//
// ⚠ THE DETECTOR HAS A CONTROL: at the parent of the commit that introduced the
// any-value refusal (a974bc2e^), `bake_plane_cell` raised on value 3 ONLY, so the
// detector must say "not enforced" there. Without it a detector that matched
// any `raise` in the function would be green forever.
//
// LOUD ON UNMEASURABLE: no aeon checkout, or a revision that does not resolve,
// is a `ctx.skip` naming what was looked for. Never a pass.

import { describe, it, expect } from 'vitest';
import { RESERVED_BITS_BAKE_CLAUSE } from '../../src/core/collision/reserved-bits-audit';
import { EDITOR_METHODS } from '../../src/main/editor-methods';
import { peerRepo, readAtRev, resolveRev, isAncestor } from '../support/peer-repo';

const AEON_TIP = 'origin/master';
/** The commit that made bake_plane_cell refuse ANY non-zero 15:14; its parent is the control. */
const ANY_VALUE_RAISE_LANDED = 'a974bc2e';
const PIPELINE = 'tools/collision_pipeline.py';

/**
 * Does `bake_plane_cell` in this source RAISE on any non-zero reserved bits?
 * Reads the function's body (up to the next top-level `def`/`class`) and looks
 * for `if plane_reserved_bits(...)` (truthy = any non-zero value) followed by a
 * `raise` in that block. Returns null when the function is not there at all,
 * which is a rename the caller must report rather than read as "does not enforce".
 */
export function bakeRaisesOnReservedBits(src: string): boolean | null {
  const start = src.search(/^def bake_plane_cell\(/m);
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/^(def |class )/m);
  const body = next < 0 ? rest : rest.slice(0, next);
  return /if\s+plane_reserved_bits\(\s*cell_word\s*\)\s*:\s*\n\s+raise\b/.test(body);
}

/** What the shipped clause claims, read from its canonical spelling. */
function clauseClaimsEnforced(clause: string): boolean | null {
  const yes = /aeon's bake enforces it/.test(clause);
  const no = /aeon's bake does not enforce it/.test(clause);
  if (yes === no) return null;
  return yes;
}

describe('get_collision_region: the reserved-bits sentence against aeon\'s baker', () => {
  it('ships in the get_collision_region description (the tested sentence is the published one)', () => {
    const m = EDITOR_METHODS.find((x) => x.name === 'get_collision_region');
    expect(m, 'get_collision_region is no longer in EDITOR_METHODS').toBeDefined();
    expect(m!.description).toContain(RESERVED_BITS_BAKE_CLAUSE);
    // The retired spellings must not come back beside it.
    expect(m!.description).not.toMatch(/does not read this field/);
    expect(m!.description).not.toMatch(/XOVER_RESERVED/);
  });

  it('claims exactly what aeon origin/master\'s bake_plane_cell does with non-zero bits 15:14', (ctx) => {
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
    const enforced = bakeRaisesOnReservedBits((blob as { ok: true; text: string }).text);
    expect(enforced, `bake_plane_cell is not in ${PIPELINE} at ${AEON_TIP}: renamed? Re-read aeon and re-point the clause`).not.toBeNull();
    const claimed = clauseClaimsEnforced(RESERVED_BITS_BAKE_CLAUSE);
    expect(claimed, 'the clause says neither "aeon\'s bake enforces it" nor "aeon\'s bake does not enforce it", so its claim cannot be read').not.toBeNull();
    expect(claimed, `aeon ${AEON_TIP} ${enforced ? 'RAISES' : 'does NOT raise'} on non-zero plane_reserved_bits in bake_plane_cell, and RESERVED_BITS_BAKE_CLAUSE claims the opposite. `
      + 'Re-read aeon and rewrite the clause (src/core/collision/reserved-bits-audit.ts).').toBe(enforced);
  });

  it('control: the detector says "not enforced" at the parent of the commit that made the refusal any-value', (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) { ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo'); return; }
    const parent = `${ANY_VALUE_RAISE_LANDED}^`;
    const blob = readAtRev(repo, parent, PIPELINE);
    if (!blob.ok && /does not resolve/.test(blob.why)) { ctx.skip(`SKIPPED, NOT PASSED: ${blob.why}`); return; }
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    const text = (blob as { ok: true; text: string }).text;
    // The control is only a control if the function existed there AND already
    // raised on something (the value 3): a detector matching any raise fails here.
    expect(text).toMatch(/^def bake_plane_cell\(/m);
    expect(text).toMatch(/^XOVER_RESERVED\s*=\s*3/m);
    expect(bakeRaisesOnReservedBits(text)).toBe(false);
  });

  it('the reading names a published aeon revision', (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) { ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo'); return; }
    const m = /read at aeon ([0-9a-f]{7,40})/.exec(RESERVED_BITS_BAKE_CLAUSE);
    expect(m, 'the clause no longer carries "read at aeon <sha>"').not.toBeNull();
    const tip = resolveRev(repo, AEON_TIP);
    if (tip === null) { ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in aeon`); return; }
    expect(resolveRev(repo, m![1]), `aeon ${m![1]} does not resolve`).not.toBeNull();
    expect(isAncestor(repo, m![1], tip), `aeon ${m![1]} is not on ${AEON_TIP}`).toBe(true);
  });
});
