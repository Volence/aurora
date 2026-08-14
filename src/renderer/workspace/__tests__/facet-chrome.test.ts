// The no-act-loaded rule, which three screens were caught breaking at once:
// classic's Art facet drew two empty section headers plus a status bar reporting
// a chunk id for an act that is not loaded; classic's Layout drew a `Chunks`
// header over 700px of void with a live FG/BG pair, three armed tools and a 58%
// zoom readout; classic's Objects drew a fully interactive 23-object library
// with nowhere to place anything.
//
// None of that throws, and the canvas underneath was already correct in all
// three, so nothing else in the suite can notice. This is the guard.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { facetChrome, isPlaneGated, type FacetChrome } from '../facet-chrome';
import type { FacetCapability } from '../../../core/project/adapter';

/** A module supplying every slot, so a `false` is always the RULE's doing and
 *  never a missing component. */
const ALL_SLOTS = {
  toolDock: true, toolOptions: true, rightPanel: true,
  bottomExtra: true, statusBar: true, mapOverlays: true,
} as const;

const SLOTS = [
  'toolDock', 'toolOptions', 'rightPanel', 'bottomExtra', 'statusBar',
  'planeChips', 'viewMenu',
] as const;

const EVERY_FACET: readonly FacetCapability[] = [
  'layout', 'art', 'objects', 'rings', 'collision', 'palette',
];

describe('with no act loaded, a facet draws nothing but its canvas', () => {
  it.each(EVERY_FACET)('%s suppresses every slot', (facet) => {
    const chrome = facetChrome(false, facet, ALL_SLOTS);
    // Named individually rather than via Object.values, so a NEW slot added to
    // FacetChrome and forgotten here is a type error at SLOTS, not a silent pass.
    for (const slot of SLOTS) expect(chrome[slot], slot).toBe(false);
  });

  it('an unserved facet is the same nothing, act or no act', () => {
    // LevelWorkspace renders FacetUnavailable in the canvas slot; a dock and a
    // status bar around it would be chrome for a screen that has no editor.
    for (const slot of SLOTS) {
      expect(facetChrome(true, null, ALL_SLOTS)[slot], slot).toBe(false);
      expect(facetChrome(false, null, ALL_SLOTS)[slot], slot).toBe(false);
    }
  });
});

describe('with an act loaded, a facet gets back exactly the slots it supplies', () => {
  it('a full map facet gets the lot', () => {
    expect(facetChrome(true, 'layout', ALL_SLOTS)).toEqual<FacetChrome>({
      toolDock: true, toolOptions: true, rightPanel: true, bottomExtra: true,
      statusBar: true, planeChips: true, viewMenu: true,
    });
  });

  it('a slot the module does not supply stays off', () => {
    // classic's art facet: no dock, no tool options, no bottom strip, no
    // overlays — and LevelWorkspace must not conjure any of them.
    const chrome = facetChrome(true, 'art', {
      toolDock: false, toolOptions: false, rightPanel: true,
      bottomExtra: false, statusBar: true, mapOverlays: false,
    });
    expect(chrome).toEqual<FacetChrome>({
      toolDock: false, toolOptions: false, rightPanel: true, bottomExtra: false,
      statusBar: true, planeChips: false, viewMenu: false,
    });
  });

  it('the View menu follows the module flag, not the facet id', () => {
    // mapOverlays is the module's own statement about whether its canvas paints
    // viewStore.overlays. A facet id lookup here would put a View menu over a
    // future composer-canvas variant of a map facet.
    expect(facetChrome(true, 'layout', { ...ALL_SLOTS, mapOverlays: false }).viewMenu).toBe(false);
  });
});

describe('the plane list', () => {
  it('is every map-canvas facet and only those', () => {
    expect(EVERY_FACET.filter(isPlaneGated))
      .toEqual(['layout', 'objects', 'rings', 'collision', 'palette']);
  });
});

describe('LevelWorkspace routes every slot through it', () => {
  // The vacuity risk this file has: facetChrome can be perfect and unused. The
  // node suite cannot render the component, so this reads it.
  const source = readFileSync(join(__dirname, '..', 'LevelWorkspace.tsx'), 'utf8');

  it('computes the chrome from the act-loaded signal', () => {
    expect(source).toContain('useActLoaded(engine)');
    expect(source).toMatch(/facetChrome\(\s*actLoaded/);
  });

  it.each(SLOTS)('gates %s on it', (slot) => {
    expect(source).toContain(`chrome.${slot}`);
  });
});

// ---------------------------------------------------------------------------
// The no-act CANVAS. facetChrome strips the chrome; what is left is one centred
// sentence on one background, and that is all the user sees. Both halves of it
// were wrong in a way only a screenshot caught.
// ---------------------------------------------------------------------------
describe('every no-act canvas is the same screen', () => {
  const s1Facets = readFileSync(join(__dirname, '..', 'facets', 's1-facets.tsx'), 'utf8');
  const classicViewport = readFileSync(
    join(__dirname, '..', '..', 'components', 'classic', 'ClassicLevelViewport.tsx'), 'utf8');
  const mapViewport = readFileSync(
    join(__dirname, '..', '..', 'components', 'MapViewport.tsx'), 'utf8');

  const COPY = 'Open a level from the Explorer, or press Ctrl+K.';

  it('classic paints its empty composer canvas the same colour as its empty map', () => {
    // Layout and Objects (ClassicLevelViewport) painted T.void; Art inherited
    // the shell's T.surface, ~8 levels lighter across the whole 1160x792 canvas.
    // Three "nothing is open" screens that were not the same screen.
    expect(classicViewport).toContain('background: T.void');
    expect(s1Facets).toMatch(/empty: \{[^}]*background: T\.void/s);
  });

  it('both engines say the same true thing', () => {
    // aeon said "Open a project to view sections" — false wherever it can be
    // seen, since a MapViewport only mounts inside a level tab of an OPEN
    // project. The act is what is missing, and the copy is classic's verbatim.
    expect(classicViewport).toContain(COPY);
    expect(mapViewport).toContain(COPY);
    expect(mapViewport).not.toContain('<span>Open a project to view sections</span>');
  });
});
