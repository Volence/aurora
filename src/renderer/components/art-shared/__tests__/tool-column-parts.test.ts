// THE TOOL-COLUMN PARTS AND THE UI PRIMITIVES — two modules that a single file
// imports from at once, so their exported NAMES have to stay disjoint.
//
// The 2026-08-16 lens sweep called for "merging the duplicate ToolButton/Divider
// pairs into the art-shared versions". They are not duplicates:
//
//   ui.ToolButton            28×28, icon child, transparent → accent when active.
//                            The DOCK button (map/art/sprite/canvas tool docks).
//   ToolColumnParts.ToolBtn  40×28, glyph text, filled border box, `small` and
//                            `disabled` variants. The OPTION-BAR button.
//   ui.Divider               a VERTICAL rule, 1×16 — a separator inside a
//                            horizontal OptionBar.
//   ToolColumnParts.Divider  a HORIZONTAL rule, 80%×1 with vertical margin — a
//                            separator inside a vertical column. Nothing
//                            imported it; it was deleted rather than merged.
//
// Merging them would have turned every option-bar separator into a horizontal
// rule. What was real is the NAME COLLISION: CanvasMode imports both modules and
// had to write `ToolButton as ModifierButton` to name the second one. That is
// what this file guards.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../../..');
const code = (p: string): string => readFileSync(join(R, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PARTS = code('components/art-shared/ToolColumnParts.tsx');
const PRIMITIVES = code('components/ui/primitives.tsx');
const CANVAS_MODE = code('components/canvas/CanvasMode.tsx');
const MAP_STATUS = code('components/shared/MapStatusBar.tsx');

/** Every `export function X` / `export const X` name in a module's source. */
function exportedNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:function|const)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return names;
}

describe('tool-column parts vs ui primitives', () => {
  it('export no name in common', () => {
    const shared = [...exportedNames(PARTS)].filter((n) => exportedNames(PRIMITIVES).has(n));
    // `components/ui/index.ts` re-exports all of primitives.tsx with `export *`,
    // so a collision here is not a style nit: any file wanting both modules must
    // rename one at the import, and the two look nothing alike on screen.
    expect(shared, `colliding exports: ${shared.join(', ')}`).toEqual([]);
  });

  it('no longer ships the dead column Divider', () => {
    // Zero importers at the time it was removed. Kept as an assertion because
    // the obvious "fix" for the sweep item is to re-add it as a merge target.
    expect(PARTS).not.toMatch(/export function Divider/);
    expect(PARTS).not.toMatch(/divider:/);
  });

  it('CanvasMode names the glyph button directly, with no alias', () => {
    expect(CANVAS_MODE).not.toMatch(/ToolButton as /);
    expect(CANVAS_MODE).toMatch(/GlyphButton/);
  });
});

describe('zoom controls run the same direction everywhere (UX-A5)', () => {
  // The level surfaces' status bar reads − 100% +, the pixel surfaces' option
  // bar read + 4× −. Same gesture, opposite geometry, one screen apart. The
  // convention the rest of the app (and every map/editor) follows is that the
  // value grows to the right, so zoom-out is the LEFT control in both.
  const outThenIn = (src: string, label: string) => {
    const out = src.indexOf('Zoom out');
    const zin = src.indexOf('Zoom in');
    expect(out, `${label}: no "Zoom out" control found`).toBeGreaterThanOrEqual(0);
    expect(zin, `${label}: no "Zoom in" control found`).toBeGreaterThanOrEqual(0);
    expect(out, `${label}: zoom-out must be rendered before zoom-in`).toBeLessThan(zin);
  };

  it('ZoomControl (pixel surfaces) puts zoom-out first', () => outThenIn(PARTS, 'ToolColumnParts'));
  it('MapStatusBar (level surfaces) puts zoom-out first', () => outThenIn(MAP_STATUS, 'MapStatusBar'));
});
