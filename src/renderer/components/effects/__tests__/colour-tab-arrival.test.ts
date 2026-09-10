// STEP 1 OF THE GUIDE IS AT THE TOP OF THE TAB.
//
// ═══ THE FINDING (UX seat A, F5) ═══
//
// The in-app guide's first instruction for authoring a raster band is "press
// Colour, the middle sub-tab, and open RASTER BAND PRESETS. Type an id in
// Preset id. Press New." The seat measured FOUR WHEEL GESTURES from the top of
// that sub-tab to the `Preset id` input: `RASTER BAND PRESETS` sat below ~440px
// of the timeline section, most of it prose explaining raster SPLITS, which the
// same column is at pains to say is a DIFFERENT MECHANISM from a palette band;
// expanding the accordion then yielded five more paragraphs before the input.
// Small once, and it is the first thing anyone following the guide does.
//
// ═══ WHAT WAS CHOSEN, AND THE TWO THINGS THAT WERE NOT ═══
//
// The seat's remedy was "put Preset id and New at the top of their own
// accordion, above the note". Placement was this lane's call and it went three
// quarters of the way:
//
//   THE SECTION IS FIRST ON THE TAB and arrives OPEN. It is what the tab is
//   for.
//
//   THE CREATE ROW IS FIRST INSIDE IT, above the preset list (which grows
//   without bound: the tenth preset used to push the way to make an eleventh
//   further down) and above the unreadable-files warning.
//
//   ⚠ IT IS NOT ABOVE `LimitBlock`, which is the seat's literal remedy
//   declined with a reason. Those three sentences - saving does not install,
//   there is no preview, "it built" does not prove it runs - are what this
//   surface is shaped around, and `band-preset-wording.test.ts` pins the block
//   as the first thing in the body with nothing between it and the body's
//   opening tag, unconditionally. An author creating a preset without them on
//   screen is the failure the panel exists to prevent.
//
//   ⚠ AND THE TIMELINE IS NOT COLLAPSED to buy the gestures back. Collapsing it
//   is the cheapest-looking fix and it would undo an earlier one:
//   `CollapsibleSection` does not mount a collapsed section's children, so a
//   collapsed timeline has no canvas at all, and that strip exists because
//   `vsplit.at` was authorable and unseeable. The last row in this file is a
//   standing guard on that, because the pressure to collapse it comes back
//   every time somebody measures this tab's arrival depth.
//
// ⚠ WHAT THESE ROWS ARE. Two are EXECUTED over the sub-tab provider's declared
// data. The rest READ SOURCE. None of them measured a wheel gesture, a pixel or
// a scroll position, and none can: this repo's node suite has no jsdom and
// cannot render React. What is proved is ORDER and DEFAULT STATE, which is the
// mechanism behind the depth, not the depth. The depth itself is a foreground
// row.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { effectsSubTab } from '../../../providers/effects-sub-tabs';

const panel = readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8');
const timeline = readFileSync(join(__dirname, '..', 'RasterTimelineStrip.tsx'), 'utf8');
const facet = readFileSync(
  join(__dirname, '..', '..', '..', 'workspace', 'facets', 'effects-facet.tsx'), 'utf8');

/** Source with comments gone, so prose about a mount is never read as one. */
function stripped(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}
const panelCode = stripped(panel);
const facetCode = stripped(facet);

describe('the Colour sub-tab opens on the thing it is for', () => {
  it('the preset section is the first section the tab declares', () => {
    // EXECUTED, over the provider's own array. `revealEffectsSection` routes on
    // it, so it is not decoration: it has to keep saying what the facet renders.
    const colour = effectsSubTab('colour');
    expect(colour, 'no colour sub-tab is declared').not.toBe(null);
    expect(colour?.sections[0]).toBe('aeon.effects.presets');
    expect(colour?.sections[colour.sections.length - 1]).toBe('aeon.effects.timeline');
  });

  it('the facet mounts the panels in the order the provider declares', () => {
    // The declaration and the render are two files, and the whole value of the
    // declaration is that they agree. Nothing else in this repo checks it.
    const branch = facetCode.slice(facetCode.indexOf("if (tab === 'colour')"));
    const presets = branch.indexOf('<BandPresetPanel />');
    const strip = branch.indexOf('<RasterTimelineStrip />');
    expect(presets, 'the colour branch does not mount BandPresetPanel').toBeGreaterThan(0);
    expect(strip, 'the colour branch does not mount RasterTimelineStrip').toBeGreaterThan(0);
    expect(presets, 'the timeline is mounted before the preset panel again').toBeLessThan(strip);
  });

  it('the preset section arrives OPEN', () => {
    const at = panelCode.indexOf('id="aeon.effects.presets"');
    expect(at, 'no aeon.effects.presets section in the panel').toBeGreaterThan(0);
    const tag = panelCode.slice(panelCode.lastIndexOf('<CollapsibleSection', at),
      panelCode.indexOf('>', at) + 1);
    expect(tag, 'the tab leads with a shut accordion again').not.toContain('defaultCollapsed');
  });

  it('the timeline is STILL never defaultCollapsed, whatever the arrival depth costs', () => {
    // ⚠ A STANDING GUARD, NOT A RESTATEMENT OF THIS PARCEL. A collapsed
    // CollapsibleSection renders no children, so collapsing this one deletes
    // the canvas that made an authored `vsplit.at` visible in the first place.
    // It is the obvious way to make this tab shorter and it is the one way that
    // is not allowed.
    const at = timeline.indexOf('id="aeon.effects.timeline"');
    expect(at, 'no aeon.effects.timeline section').toBeGreaterThan(0);
    const tag = timeline.slice(timeline.lastIndexOf('<CollapsibleSection', at),
      timeline.indexOf('>', at) + 1);
    expect(tag, 'the raster timeline was collapsed by default; its children stop mounting')
      .not.toContain('defaultCollapsed');
  });
});

describe('inside the section, the create row comes before everything it used to trail', () => {
  const bodyAt = panelCode.indexOf('<SectionBody>');
  const limitAt = panelCode.indexOf('<LimitBlock');
  const createAt = panelCode.indexOf('label="Preset id"');
  const listAt = panelCode.indexOf('{entries.length > 0 &&');
  const emptyAt = panelCode.indexOf('{entries.length === 0 &&');
  const unreadableAt = panelCode.indexOf('{library.unreadable.length > 0 &&');

  it('every landmark this file reasons about was found', () => {
    // Loud on unmeasurable: an indexOf that missed returns -1, and -1 is less
    // than everything, so a renamed landmark would make the order rows below
    // pass while measuring nothing.
    for (const [name, at] of [
      ['<SectionBody>', bodyAt], ['<LimitBlock', limitAt], ['label="Preset id"', createAt],
      ['the preset list', listAt], ['the empty-list hint', emptyAt],
      ['the unreadable warning', unreadableAt],
    ] as const) expect(at, `landmark not found in BandPresetPanel.tsx: ${name}`).toBeGreaterThan(0);
  });

  it('the limits still come first, which is the seat remedy that was declined', () => {
    expect(limitAt).toBeGreaterThan(bodyAt);
    expect(createAt).toBeGreaterThan(limitAt);
  });

  it('the create row precedes the preset list, which has no upper bound', () => {
    expect(createAt).toBeLessThan(listAt);
    expect(createAt).toBeLessThan(emptyAt);
  });

  it('the create row precedes the unreadable-files warning', () => {
    expect(createAt).toBeLessThan(unreadableAt);
  });

  it('the empty-list hint no longer points DOWN at a box that is now above it', () => {
    // The copy read "Create one below" and the box moved. A stale direction in
    // the one sentence a project with no presets ever sees is the whole cost of
    // this reorder if nobody checks it.
    const hint = panelCode.slice(emptyAt, emptyAt + 400);
    expect(hint, 'the empty-list hint still sends the reader below the box').not.toContain('below');
    expect(hint).toContain('above');
  });
});

describe('the in-app guide still describes the app', () => {
  const guide = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'docs', 'guides', 'effects-first-run.md'),
    'utf8');

  it('step 1 no longer tells the reader to open a section that arrives open', () => {
    const step = guide.slice(guide.indexOf('## 3. Make a raster band'));
    const first = step.slice(step.indexOf('1. Press'), step.indexOf('2. Type'));
    expect(first, 'the guide still says to open RASTER BAND PRESETS').not.toMatch(/and open/);
    expect(first).toContain('arrives open');
  });
});
