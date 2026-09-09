import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explorerEmptyState } from '../explorer';

/**
 * UX SEAT B, FINDING F5 — "typing into the Explorer filter with no project open
 * deletes the panel's only control and replaces it with 'No matches'"
 * (docs/reviews/2026-09-07-lens-ux/uxb-audit.md).
 *
 * THE PANEL is the Explorer sidebar (`src/renderer/shell/Explorer.tsx`); THE
 * CONTROL is the button labelled `Open Project…` in its empty state, which on
 * the cold Home screen is the only control the panel has. Three characters in
 * the `Filter…` box removed it. The box carries no clear affordance, so getting
 * it back cost three Backspaces.
 *
 * WHY THIS FILE IS NODE-ONLY AND WHAT THAT COSTS. This suite has no jsdom and no
 * testing-library, and `vitest.config.ts` collects `.test.ts` only — a `.tsx`
 * row would not even be collected, let alone run. So the decision moved OUT of
 * the component into `explorerEmptyState`, which these rows drive directly, and
 * the last describe reads Explorer.tsx as text to hold the seam: a pure function
 * nothing renders from is a sound link in a chain holding nothing.
 */

describe('explorerEmptyState: a filter narrows the TREE, never the way out of it', () => {
  // -- the finding, in both directions -----------------------------------
  it('F5: with no project open, a filter that matches nothing STILL offers Open Project…', () => {
    expect(explorerEmptyState(0, 'zon', true).openProject).toBe(true);
  });

  it('and the un-filtered cold Home is unchanged: the button is there', () => {
    expect(explorerEmptyState(0, '', true).openProject).toBe(true);
  });

  /**
   * THE OTHER DIRECTION, which is what makes the row above a rule rather than a
   * constant: `openProject` is not simply always true. A project IS open here,
   * so the empty tree is an empty tree and there is nothing to offer.
   */
  it('with a project OPEN, a filter that matches nothing offers no button', () => {
    expect(explorerEmptyState(0, 'zon', false).openProject).toBe(false);
  });

  it('a NON-empty tree offers no button either, project or no project', () => {
    expect(explorerEmptyState(1, '', true).openProject).toBe(false);
    expect(explorerEmptyState(3, 'zon', true).openProject).toBe(false);
  });

  // -- the half that must NOT regress ------------------------------------
  it('the "No matches" report survives: a filter matching nothing still says so', () => {
    expect(explorerEmptyState(0, 'zon', false).noMatches).toBe(true);
    expect(explorerEmptyState(0, 'zon', true).noMatches).toBe(true);
  });

  it('and it is not shown when no filter is set: an empty tree is not "no matches"', () => {
    expect(explorerEmptyState(0, '', true).noMatches).toBe(false);
    expect(explorerEmptyState(0, '   ', true).noMatches).toBe(false);
    expect(explorerEmptyState(0, '', false).noMatches).toBe(false);
  });

  /**
   * THE STATE F5 IS ABOUT, named as one row so a future reader sees what the
   * fix actually produces: on the cold Home screen with `zon` typed, the panel
   * reports the empty filter AND keeps its only control. Before the fix the
   * first was true and the second false.
   */
  it('the F5 screen exactly: both, at once', () => {
    expect(explorerEmptyState(0, 'zon', true)).toEqual({ noMatches: true, openProject: true });
  });

  it('whitespace is trimmed the same way filterExplorer trims it', () => {
    // filterExplorer treats "  " as no filter (it returns the input identity),
    // so an all-whitespace query must not read as an active filter here either.
    expect(explorerEmptyState(0, ' \t ', false)).toEqual({ noMatches: false, openProject: false });
  });
});

/**
 * THE SEAM. `explorerEmptyState` is only worth anything if the panel renders
 * from it; a component that quietly re-derives the condition inline would leave
 * every row above green while the button vanished again on screen.
 */
describe('the Explorer renders from the rule rather than re-deriving it', () => {
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const EXPLORER = join(HERE, '..', '..', '..', 'renderer', 'shell', 'Explorer.tsx');
  const text = readFileSync(EXPLORER, 'utf8');

  it('LOUD WHEN IT CANNOT MEASURE: the component file was actually read', () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('Open Project…');
  });

  it('it calls explorerEmptyState and renders both branches from the result', () => {
    expect(text).toMatch(/explorerEmptyState\(\s*filtered\.length,\s*query,\s*noProject\s*\)/);
    expect(text).toContain('emptyState.noMatches');
    expect(text).toContain('emptyState.openProject');
  });

  it('and the deleted term is gone: no render condition consults the query directly', () => {
    // `query.trim() === ''` guarding the Open Project… button IS finding F5. If
    // it comes back, in this file, the button is filterable again.
    expect(text).not.toContain("query.trim() === ''");
  });
});
