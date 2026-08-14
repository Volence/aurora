// The rule the whole engine-neutral pattern rests on: nothing under
// `components/shared/` may import from `state/`.
//
// It is not a style preference. `executeCommand` THROWS when the focused
// document is not an aeon command history (state/editorStore.ts), so a shared
// component that reached a store or a command directly would hard-crash classic
// on the first click rather than degrade. And the two engines repaint off
// different signals — aeon mutates its project in place and ticks a version
// clock, classic swaps an immutable doc — so a subscription here could only ever
// be correct for one of them. Everything arrives through a port instead, built
// per engine in `providers/*`.
//
// A source scan, like components/classic/__tests__/classic-surface.test.ts,
// because the renderer has no DOM/component test harness: no test that RUNS
// these components exists to notice the import, and a type-only import compiles
// away so even a bundle-size check would not see it.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `src/renderer/components/shared` — paths reported relative to it. */
const SHARED = join(__dirname, '..');

/** Every source file in the directory, recursively, excluding test directories. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(SHARED, rel), { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(child);
    }
  };
  walk('');
  return out.sort();
}

/**
 * Any import whose specifier reaches `state/` — `../../state/editorStore`,
 * `import type { … } from '.../state/x'`, a bare `import '.../state/x'` for its
 * side effects, or a dynamic `import('.../state/x')`. Matching the SPECIFIER
 * rather than the statement is what makes all four forms one rule.
 */
const STATE_IMPORT = /from\s+'[^']*\/state\/|import\s*\(\s*'[^']*\/state\/|import\s+'[^']*\/state\//;

describe('components/shared imports no store', () => {
  it('finds the shared components at all', () => {
    // Without this, a wrong SHARED path would make the guard below vacuously
    // green — the failure mode two earlier source guards in this repo actually
    // had.
    const files = sourceFiles();
    expect(files).toContain('MapStatusBar.tsx');
    expect(files).toContain('map-status-model.ts');
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(sourceFiles())('%s does not import from state/', (file) => {
    expect(readFileSync(join(SHARED, file), 'utf8')).not.toMatch(STATE_IMPORT);
  });
});
