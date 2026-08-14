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
/** Source with comments stripped, so prose about a binding cannot satisfy an
 *  assertion about one — the same helper classic-surface.test.ts uses. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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

  // The other half of the claim, and the half that could not be written until
  // the shell flip (stage-4 plan 5, task 9): the handler above is classic's ONLY
  // Ctrl+Z since its own copy died with ClassicProjectView, so it is only
  // reachable if App routes a CLASSIC open to LevelWorkspace too. Before the
  // flip, App branched a classic open to LegacyWorkspace and this would have
  // been false — which is why the guard asserted nothing about it.
  //
  // Grep-shaped like the rest of the file, with the same limits: it reads the
  // one mount expression, so a refactor that moves the level pane out of App
  // fails here loudly rather than silently. That is the intended failure mode —
  // whoever moves it re-states where classic lands.
  it('App routes BOTH engines to LevelWorkspace, so classic reaches it', () => {
    const src = code('App.tsx');
    // `engine` is useOpenEngine() — 's1' for a classic open, 'aeon' for aeon —
    // so this single gate is the whole routing story. Anything narrower (the old
    // `classicOpen ? … : config ? …`) leaves one engine somewhere else.
    expect(src).toContain('engine ? <LevelWorkspace /> : null');
    expect(src).toContain('useOpenEngine');
    // Zero classic undo bindings is the regression this forbids: re-branching
    // classic to a second shell strands it with no Ctrl+Z at all.
    expect(src).not.toContain('LegacyWorkspace');
  });
});
