// THE WIRING, not the arithmetic — O17's Art-facet half.
//
// composer-priority-lens.test.ts proves the veil lands on the right cells and
// priority-lens-surface.test.ts proves the brush rule. Neither can see whether
// ComposerCanvas actually CALLS either one, or whether the option bar draws the
// chips — the renderer suite is node-only and does not collect .tsx at all. A
// perfectly-tested helper nobody calls reproduces the reported gap exactly ("the
// Art facet cannot see or author priority"), which is why these scans exist.
//
// WHAT IS STILL OPEN TO THESE ROWS: whether any of it renders, whether a click
// lands, whether the veil is on screen. That is O17's CDP harness — these rows
// are the cheap standing net under it, not a substitute.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIORITY_CHIPS } from '../../components/shared/PriorityChips';

const SRC = join(__dirname, '..', '..');
const raw = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

/**
 * Source with comments stripped. Every file O17 touched carries long docblocks
 * that discuss `stampPriority`, the lens and `keep` at length — a scan of raw
 * text would pass on the prose alone. (Same helper, same reason, as
 * workspace/__tests__/classic-art-dock.test.ts.)
 */
const code = (...p: string[]) => raw(...p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CANVAS = code('components', 'art', 'ComposerCanvas.tsx');
const BAR = code('shell', 'ArtToolOptions.tsx');
const CHIPS = code('components', 'shared', 'PriorityChips.tsx');
const BRUSH_PANEL = code('components', 'TileBrushOptions.tsx');

describe('the stamp AUTHORS priority', () => {
  it('ComposerCanvas hands stampTile the armed store value', () => {
    expect(CANVAS).toMatch(/pri:\s*s\.stampPriority/);
  });

  it('and no longer hard-codes what the stamp claims about depth', () => {
    // The two states this shipped as before: a hard `false` (destroyed the bit)
    // and then a hard `'keep'` (preserved it, could not author it).
    expect(CANVAS).not.toMatch(/pri:\s*'keep'/);
    expect(CANVAS).not.toMatch(/pri:\s*false/);
  });

  it('the option bar mounts the chips, gated on the stamp tool and the cap', () => {
    expect(BAR).toMatch(/caps\.stampPriority && tool === 'tile-stamp'/);
    expect(BAR).toMatch(/<PriorityChips\s+value=\{stampPriority\}\s+onChange=\{setStampPriority\}/);
  });
});

describe('the lens SHOWS priority', () => {
  it('ComposerCanvas draws it and publishes what it drew', () => {
    expect(CANVAS).toMatch(/drawComposerPriority\(ctx, doc, z\)/);
    expect(CANVAS).toMatch(/publishComposerPriorityLensReport\(/);
  });

  it('is gated on the SHARED overlay key, not a private one', () => {
    // The same `showPriority` the map's View menu and classic's viewport read.
    // A second key would mean the auto-surface in `surfacePriorityLens` raised a
    // veil on one surface and not the other.
    expect(CANVAS).toMatch(/overlays\.showPriority/);
  });

  it('draws BEFORE the tool gate: depth is not a property of the armed tool', () => {
    // The CALL, not the import — the import line is always above everything and
    // an ordering row anchored on it can only ever pass.
    const lensAt = CANVAS.indexOf('drawComposerPriority(ctx');
    const gateAt = CANVAS.indexOf("s.tool === 'tile-stamp' || s.tool === 'collision'");
    expect(lensAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(lensAt, 'the lens must not be reachable only while a tile tool is armed')
      .toBeLessThan(gateAt);
  });

  it('the option bar carries the toggle: the Art facet has NO View menu', () => {
    // facet-chrome.ts gates the View menu on `mapOverlays`, which the composer
    // does not claim (it paints one of aeon's thirteen overlay keys). Without a
    // chip here the auto-surface would raise a veil this facet cannot lower.
    expect(BAR).toMatch(/setOverlay\('showPriority', !showPriority\)/);
  });
});

describe('one vocabulary, two mounts', () => {
  it('both surfaces render the SHARED chips rather than their own', () => {
    expect(BAR).toMatch(/<PriorityChips/);
    expect(BRUSH_PANEL).toMatch(/<PriorityChips/);
  });

  it('neither mount re-spells the labels or the titles', () => {
    for (const [name, src] of [['ArtToolOptions', BAR], ['TileBrushOptions', BRUSH_PANEL]] as const) {
      for (const c of PRIORITY_CHIPS) {
        expect(src, `${name} re-spells the "${c.label}" chip`).not.toContain(c.title);
      }
    }
  });

  it('the three states are still Keep / On / Off, in that order', () => {
    expect(PRIORITY_CHIPS.map((c) => c.value)).toEqual(['keep', 'on', 'off']);
    expect(PRIORITY_CHIPS.map((c) => c.label)).toEqual(['Keep', 'On', 'Off']);
  });

  it('the titles are the CDP harnesses\' selectors and are documented as such', () => {
    // scratchpad/tile-attribute-harness.mjs addresses each chip by `title`, and
    // O17's composer harness does the same. A rename here is a harness break,
    // not a copy edit — the file has to say so.
    expect(raw('components', 'shared', 'PriorityChips.tsx'))
      .toMatch(/KEEP THESE STRINGS STABLE/);
    // The prefix `Priority: <state>` is the SELECTOR half and is what must not
    // move: scratchpad/tile-attribute-harness.mjs matches /^Priority: keep/ and
    // friends. What follows it is prose, and the 2026-09-05 dash ruling turned
    // that from a dash into a full stop; this row pins the prefix, not the
    // punctuation after it.
    for (const c of PRIORITY_CHIPS) expect(c.title).toMatch(/^Priority: (keep|on|off)\. /);
  });
});

describe('the capability is a claim about the host', () => {
  it('classic does not get the chips: its Block tab already authors the bit', () => {
    // components/classic/BlockTab.tsx renders a per-cell `Priority` chip beside
    // that cell's flips. Turning the cap on for classic would put two controls
    // on one field.
    expect(BAR).toMatch(/CLASSIC_TILE_CAPS[\s\S]{0,200}stampPriority: false/);
    expect(code('components', 'classic', 'BlockTab.tsx'))
      .toMatch(/editCell\(\{ pri: !cell\.pri \}\)/);
  });

  it('aeon does: FULL_CAPS claims both halves', () => {
    expect(BAR).toMatch(/FULL_CAPS[\s\S]{0,200}stampPriority: true/);
  });
});

describe('the chips module', () => {
  it('exports one component both hosts render', () => {
    expect(CHIPS).toMatch(/export default function PriorityChips/);
  });
});
