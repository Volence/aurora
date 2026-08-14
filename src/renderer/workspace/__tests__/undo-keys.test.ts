// Source-grep guard: the suite is node-only (no jsdom/RTL) and .tsx files are
// not collected, so a rendering test of these components would silently never
// run. Grepping the source is the house pattern (see classic-surface.test.ts).
//
// What this does NOT prove, so the next reader doesn't over-trust it: it
// matches one exact call expression, so `const h = focusedHistory(); h?.undo();`
// in a canvas would slip through, and it bounds only these two files — a third
// binding added by a future facet module goes unnoticed. It catches the
// regression that actually threatens this refactor (someone re-adding the
// obvious line to a canvas), not every possible way to bind undo twice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(R, p), 'utf8');

describe('level undo keys live in exactly one place', () => {
  it('LevelWorkspace owns the handler', () => {
    const src = read('workspace/LevelWorkspace.tsx');
    expect(src).toContain('focusedHistory()?.undo()');
    expect(src).toContain('levelKeysEnabled()');
    expect(src).toContain('isTypingTarget(');
  });

  // Two canvases under one workspace each binding window keydown means one
  // Ctrl+Z undoes twice the moment both are mounted. The absence is the point.
  it('the canvases do not bind their own', () => {
    for (const p of ['components/MapViewport.tsx', 'workspace/facets/art-facet.tsx']) {
      expect(read(p)).not.toContain('focusedHistory()?.undo()');
    }
  });
});
