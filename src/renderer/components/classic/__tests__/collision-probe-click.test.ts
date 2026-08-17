// Source guard: the classic viewport's left-click path reports a point to the
// Collision facet without eating the gesture.
//
// The viewport is .tsx and never executes in the node-only renderer suite, so
// this is a source scan rather than a behavioural test — see
// classic-camera.test.ts for the same pattern on a different invariant.
//
// The Collision facet is read-only: `view` stays armed, so a left-drag pans
// and a right-click still eyedrops a chunk. There was no channel for the
// viewport to tell a (future) panel WHERE the user clicked — this guard
// protects both halves of that fix: the call exists, AND it does not consume
// the mousedown (a `return` right after it would make the collision facet the
// one place on the map that cannot be panned).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VIEWPORT_PATH = join(__dirname, '..', 'ClassicLevelViewport.tsx');

/** Source with comments stripped, so a `return` mentioned only in a comment
 *  (as this very branch's own explanatory comment does) can't fool the guard. */
function code(): string {
  return readFileSync(VIEWPORT_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('collision facet click channel', () => {
  it('reports a probe point on the collision facet without eating the pan', () => {
    const src = code();
    expect(src).toMatch(/setCollisionProbe\(/);
    // The branch must not return early right after recording the point — a
    // probe that swallowed the gesture would make the collision facet the
    // one place the map cannot be panned.
    expect(src, 'probe branch returns before the pan path')
      .not.toMatch(/setCollisionProbe\([^)]*\);\s*\n\s*return;/);
  });

  it('guards a file that actually exists and still holds the call site', () => {
    // Vacuity check: if the branch were deleted outright, the negative
    // assertion above would pass for the wrong reason (nothing to match).
    expect(code()).toContain('setCollisionProbe');
  });

  it('probes on every click but writes only when paint-collision is armed', () => {
    const VIEWPORT = code();
    expect(VIEWPORT).toMatch(/setCollisionProbe/);
    expect(VIEWPORT, 'the write must be gated on the tool').toMatch(/paint-collision/);
    expect(VIEWPORT, 'the write goes through the dispatch helper, not the store directly')
      .toMatch(/applyCollisionShape/);
    expect(VIEWPORT).not.toMatch(/classicSetColind\(|classicPaintSurface\(/);
  });
});
