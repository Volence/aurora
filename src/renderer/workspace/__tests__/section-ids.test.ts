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
//
// ---------------------------------------------------------------------------
// AND IT READS ALL OF THEM NOW (ROADMAP §5.1 item 18)
// ---------------------------------------------------------------------------
// This file used to walk `workspace/facets/*` for its own copy of the scan —
// the THIRD guard on that frame, and it had the same hole the other two did:
// a section composed one level below a facet was invisible. 18 of the 43
// sections in this tree are, including all four of the effects panel's, all
// nine of SpriteMode's and all three of CanvasMode's. The panel-state map is
// global, so an id collision between a facet section and a sprite-mode section
// is exactly as real as one between two facets — and no scan could see it.
//
// The derivation is now the shared one in components/__tests__/helpers, which
// enumerates by the section primitive's own call sites. Its own docblock is
// where the reasoning and the residual blind spot live.

import { describe, it, expect } from 'vitest';
import { deriveSections } from '../../components/__tests__/helpers/section-panels';

const ALL = deriveSections();

describe('CollapsibleSection ids', () => {
  it('finds the sections it is scanning (a regex drift would pass vacuously)', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(15);
    expect(ALL.map((s) => s.id)).toContain('classic.chunks');
    expect(ALL.map((s) => s.id)).toContain('aeon.ringPatterns');
    // Declared outside a facet module — the half this file could not see.
    expect(ALL.map((s) => s.id)).toContain('aeon.effects.layers');
    expect(ALL.map((s) => s.id)).toContain('sprite.palette');
  });

  /**
   * THE SCOPES THAT OWN A PANEL-STATE KEY.
   *
   * `aeon.` / `classic.` are engines; the rest are surfaces that are not a map
   * facet at all — the art and palette tabs, the canvas editor, the sprite
   * editor, the left-hand Explorer, the project setup tab. Hand-maintained, and
   * safe in the way the old PANELS list was not: a scope missing from this list
   * is a FAILING test, not a silent pass.
   */
  const SCOPES = ['aeon', 'classic', 'art', 'palette', 'canvas', 'sprite', 'explorer', 'setup'];

  it('are engine- or surface-scoped, never bare', () => {
    // An unprefixed id is what let one slot name leak across engines. Every id
    // carries the engine or the surface that owns it, which is what makes a
    // collision visible on sight.
    for (const s of ALL) {
      expect(s.id, `${s.owner}: ${s.id}`).toMatch(new RegExp(`^(${SCOPES.join('|')})\\.`));
    }
  });

  it('every named scope is one some section still uses', () => {
    // Otherwise a scope outlives the surface it was written for and quietly
    // admits whatever takes that prefix later.
    const used = new Set(ALL.map((s) => s.id.split('.')[0]));
    for (const scope of SCOPES) expect([...used], `scope '${scope}' names no section`).toContain(scope);
  });

  /**
   * ONE ID, ONE NAME. The discriminator between the bug and the legitimate
   * reuse is the TITLE, not the file:
   *
   *  - `aeon.props` is `Properties` on Layout, Objects, Rings, Collision and
   *    Effects — five mounts of the SAME section doing the SAME job. One
   *    collapse preference across them is what a user would expect, and
   *    collapsing one visibly collapses a section that reads identically. Legal.
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
    // Chunks, Marquee, Paste and Brush, which are mutually exclusive — never
    // two headers on screen at once, so one preference governs one visible
    // section. `Brush` joined them with the tile-attribute brush (2026-08-28):
    // it renders for paint-tile and paint-block, and both of those exclude
    // stamp-chunk, marquee and pasting by being a different tool.
    expect(multiTitled).toEqual([
      "aeon.layoutOptions: Brush / Chunks / pasting ? 'Paste' : 'Marquee'",
    ]);
  });
});
