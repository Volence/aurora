// Every tool that acts on a section must CLAIM it — `editorStore.activeSectionIndex`
// is what the section-scoped panels act on, and two of those actions are
// wholesale destructive: CollisionPalette's Reset and Clear rewrite the whole of
// `sections[activeSectionIndex]` on the active plane.
//
// The Collision facet has no section navigator (SectionGridNav is Layout's, and
// it is the act-STRUCTURE editor — insert/remove/move/resize — not a navigator
// worth mounting beside a collision palette), so painting is the only thing that
// can point that index at what the user is looking at. `paint-collision` was the
// one branch that did not claim unconditionally: its claim lived at the end of
// paintCollisionCell, behind four early returns, so a click that painted nothing
// left the index wherever another tool had last put it — and Clear then wiped a
// section off screen.
//
// A SOURCE grep, because MapViewport is .tsx and the suite is node-only (see
// workspace/__tests__/undo-keys.test.ts for the same constraint and its limits).
// It proves the call is IN the branch, not that it runs on every path — which is
// exactly why the claim belongs at the top of each branch, where there is no
// path around it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '..', 'MapViewport.tsx'), 'utf8');

/** The mouse-down dispatcher: `const handleMouseDown = …` up to its `}, []);`. */
function mouseDownBody(): string {
  const start = source.indexOf('const handleMouseDown');
  expect(start, 'MapViewport no longer declares handleMouseDown').toBeGreaterThan(-1);
  const end = source.indexOf('}, []);', start);
  expect(end, 'handleMouseDown is no longer a useCallback with an empty dep list').toBeGreaterThan(start);
  return source.slice(start, end);
}

/** One tool's branch: from its `if (tool === 'x')` to the next branch's. */
function branch(tool: string): string {
  const body = mouseDownBody();
  const open = body.indexOf(`if (tool === '${tool}')`);
  expect(open, `no ${tool} branch in handleMouseDown`).toBeGreaterThan(-1);
  const next = body.indexOf('if (tool === ', open + 1);
  return body.slice(open, next === -1 ? undefined : next);
}

// `view` is absent on purpose: it pans and edits nothing, so it has no section
// to claim. Every other tool the map offers acts on one.
const ACTING_TOOLS = [
  'select', 'paint-tile', 'paint-block', 'stamp-chunk',
  'paint-collision', 'place-object', 'place-ring',
];

describe('every acting map tool claims the section it acts on', () => {
  it('finds the branches at all (a moved handler would pass vacuously)', () => {
    expect(mouseDownBody()).toContain("if (tool === 'view'");
    for (const tool of ACTING_TOOLS) expect(branch(tool).length).toBeGreaterThan(40);
  });

  it.each(ACTING_TOOLS)('%s sets activeSectionIndex', (tool) => {
    expect(branch(tool)).toContain('setActiveSectionIndex');
  });

  it('paint-collision claims BEFORE it paints, not only on success', () => {
    // The regression: paintCollisionCell's own claim is its last line, after a
    // same-cell dedupe, an already-that-shape guard, an empty-entry-list check
    // and a null-level check. A no-op click has to claim too — the user is
    // looking at that section either way.
    const b = branch('paint-collision');
    expect(b.indexOf('setActiveSectionIndex')).toBeLessThan(b.indexOf('paintCollisionCell('));
  });
});
