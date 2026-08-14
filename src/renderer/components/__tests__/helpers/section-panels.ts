// WHICH COMPONENTS ARE PANELS IN A FACET'S RIGHT-HAND COLUMN, derived from the
// facet modules themselves.
//
// Extracted from panel-headings.test.ts, whose docblock is where the reasoning
// lives, and shared because a SECOND rule now needs the same list
// (panel-scrollers.test.ts). Both rules are about what a panel may do inside a
// titled section, and both were written after a hand-maintained list of panels
// missed one — so there must be exactly one derivation, or the next rule gets a
// third list to forget something in.
//
// The short version of why it is derived: `const PANELS = [three paths]` shipped
// aeon's Rings facet with its heading drawn twice, because RingPatternPalette
// was not one of the three. A guard that only checks what someone remembered is
// not a guard.
//
// A SOURCE scan, because these are .tsx and the renderer suite is node-only:
// nothing renders them, so nothing else can see either rule break.

import { expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/** `src/renderer/components` — panel paths are reported relative to it. */
export const COMPONENTS = join(__dirname, '..', '..');
const FACETS = join(COMPONENTS, '..', 'workspace', 'facets');

const read = (file: string): string => readFileSync(file, 'utf8');

/**
 * Every component rendered as the direct child of a CollapsibleSection in one
 * facet module, as a `<Name` capture. Self-closing (`<ChunkPicker pick="edit"
 * />`) and wrapping forms both appear in these files, and props may span lines,
 * so the match is "the first JSX tag after the section's opening tag".
 */
function sectionChildren(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/<CollapsibleSection[^>]*>\s*(?:\{[^}]*\}\s*)?<([A-Z]\w*)/g)) {
    names.push(m[1]);
  }
  return names;
}

/** Where `name` is imported from in `source`, as a module specifier. */
function importSpecifier(source: string, name: string): string | null {
  const m = source.match(
    new RegExp(`import\\s+(?:${name}\\b[^;]*|\\{[^}]*\\b${name}\\b[^}]*\\})\\s+from\\s+['"]([^'"]+)['"]`),
  );
  return m ? m[1] : null;
}

/** Resolve a relative module specifier from `fromFile` to a real .tsx panel
 *  file, or null (a .ts module has no JSX to title or scroll anything with). */
function resolvePanel(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const abs = resolve(dirname(fromFile), spec);
  for (const candidate of [`${abs}.tsx`, join(abs, 'index.tsx')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every component this file renders — the direct children of its own JSX. */
function renderedComponents(source: string): string[] {
  return [...source.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]);
}

/**
 * The panels the facet modules mount inside a titled section, TRANSITIVELY, as
 * absolute paths under components/.
 *
 * Transitive is what the rules actually say: ChunkGrid is not mounted by a facet
 * at all, it is what ChunkLibrary and ChunkPicker are made of — and it is the
 * panel that WAS drawing a second title, and the one that WAS growing to 900px
 * and burying the sections under it. A direct-children-only scan would have
 * missed it exactly the way the hand-written list missed RingPatternPalette.
 *
 * components/ui is excluded and nothing else is: PanelHeader lives there, it IS
 * the section header, and it is the one place entitled to heading type.
 */
export function derivePanels(): string[] {
  const found = new Set<string>();
  const facetFiles = readdirSync(FACETS).filter((f) => f.endsWith('.tsx'));
  // A rename or a move of the facets directory must not silently empty this.
  expect(facetFiles.length, 'no facet modules found').toBeGreaterThan(0);

  const queue: string[] = [];
  for (const file of facetFiles) {
    const path = join(FACETS, file);
    const source = read(path);
    for (const name of sectionChildren(source)) {
      // A section child with no import is defined in the facet file itself (a
      // local wrapper) and has no separate panel file to scan.
      const spec = importSpecifier(source, name);
      const panel = spec ? resolvePanel(path, spec) : null;
      if (panel) queue.push(panel);
    }
  }

  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.startsWith(join(COMPONENTS, 'ui'))) continue;
    found.add(file);
    const source = read(file);
    for (const name of renderedComponents(source)) {
      const spec = importSpecifier(source, name);
      const next = spec ? resolvePanel(file, spec) : null;
      if (next) queue.push(next);
    }
  }
  return [...found].sort();
}

/** A derived panel path as it reads in a failure message. */
export const panelName = (file: string): string => file.slice(COMPONENTS.length + 1);
