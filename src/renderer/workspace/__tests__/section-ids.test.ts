// A CollapsibleSection id is a key in ONE global panel-state map
// (shell/panel-state.ts), so two sections sharing an id share a collapse
// preference. That is right when they are the same slot retitling itself and
// wrong every other time.
//
// It was wrong five times: `map.palette` titled `Chunks` and `Marquee`/`Paste`
// on Layout, `Ring Patterns` on Rings, `Collision` on Collision and `Objects`
// on Objects — five differently-titled sections across four facets on one
// preference, so collapsing the chunk library silently collapsed the ring
// palette two facets away. Nothing throws, nothing else in the suite can see
// it, and the ids are string literals inside .tsx the node suite cannot render.
// So this reads them.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FACETS = join(__dirname, '..', 'facets');

interface Section { readonly file: string; readonly id: string; readonly title: string }

function sections(): Section[] {
  const out: Section[] = [];
  const files = readdirSync(FACETS).filter((f) => f.endsWith('.tsx'));
  expect(files.length, 'no facet modules found').toBeGreaterThan(0);
  for (const file of files) {
    const source = readFileSync(join(FACETS, file), 'utf8');
    for (const m of source.matchAll(/<CollapsibleSection\s+id="([^"]+)"\s+title=(?:"([^"]+)"|\{([^}]+)\})/g)) {
      out.push({ file, id: m[1], title: m[2] ?? m[3] });
    }
  }
  return out;
}

const ALL = sections();

describe('CollapsibleSection ids', () => {
  it('finds the sections it is scanning (a regex drift would pass vacuously)', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(15);
    expect(ALL.map((s) => s.id)).toContain('classic.chunks');
    expect(ALL.map((s) => s.id)).toContain('aeon.ringPatterns');
  });

  it('are engine- or surface-scoped, never bare', () => {
    // An unprefixed id is what let one slot name leak across engines. Every id
    // carries the engine (`aeon.` / `classic.`) or the surface that owns it
    // (`art.` / `palette.`), which is what makes a collision visible on sight.
    for (const s of ALL) {
      expect(s.id, `${s.file}: ${s.id}`).toMatch(/^(aeon|classic|art|palette)\./);
    }
  });

  /**
   * ONE ID, ONE NAME. The discriminator between the bug and the legitimate
   * reuse is the TITLE, not the file:
   *
   *  - `aeon.props` is `Properties` on Layout, Objects, Rings and Collision —
   *    four mounts of the SAME section doing the SAME job. One collapse
   *    preference across them is what a user would expect, and collapsing one
   *    visibly collapses a section that reads identically. Legal.
   *  - `map.palette` was `Chunks`, `Marquee`, `Paste`, `Ring Patterns`,
   *    `Collision` and `Objects`. Collapsing the chunk library and finding the
   *    ring palette collapsed two facets later is not a preference anyone
   *    expressed. That is the bug, and a title disagreement is exactly its
   *    signature.
   */
  it('never carry two different names', () => {
    const byId = new Map<string, Set<string>>();
    for (const s of ALL) {
      if (!byId.has(s.id)) byId.set(s.id, new Set());
      byId.get(s.id)!.add(s.title);
    }
    const multiTitled = [...byId]
      .filter(([, titles]) => titles.size > 1)
      .map(([id, titles]) => `${id}: ${[...titles].sort().join(' / ')}`);
    // ONE exception, and it names itself: Layout's tool-options slot holds
    // Chunks, Marquee and Paste, which are mutually exclusive — never two
    // headers on screen at once, so one preference governs one visible section.
    expect(multiTitled).toEqual([
      "aeon.layoutOptions: Chunks / pasting ? 'Paste' : 'Marquee'",
    ]);
  });
});
