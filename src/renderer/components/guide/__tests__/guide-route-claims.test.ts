// THE GUIDE'S ROUTE CLAIMS, HELD AGAINST THE PRODUCERS THAT DECIDE THEM.
//
// ═══ THE POPULATION, NAMED RATHER THAN IMPLIED ═══
//
// `docs/guides/effects-first-run.md` is imported with Vite's `?raw` by
// `src/renderer/components/guide/guides.ts` and rendered VERBATIM into the
// Guide tab. A ROUTE CLAIM in it is a sentence asserting WHERE a control is, in
// what ORDER things appear, or what state a section ARRIVES in. That is a
// different population from the one `scripts/check-guide-text.mjs` covers: that
// gate asks "does this label exist on screen", re-derived from the component
// that renders it, and its own header is explicit that it says nothing about
// position, order or arrival state. A guide can name every control correctly
// and still send the reader to the wrong end of the column.
//
// The census these rows were derived from, all 45 claims with their producers,
// is `docs/reviews/2026-09-10-guide-route-claims.md`. Read it before adding a
// row here: a guessed subset is what that packet exists to end.
//
// ═══ ONE CLAIM WAS FALSE WHEN THIS FILE WAS WRITTEN ═══
//
// The §1 panel schematic drew the Colour sub-tab with `RASTER TIMELINE` at the
// TOP. It has been LAST since 8e3727ad, which moved the preset panel up, moved
// `providers/effects-sub-tabs.ts`'s declared order with it, and updated exactly
// one sentence in the guide: §3 step 1, the one the seat had quoted. The
// picture four screens above it went stale in the same commit that fixed the
// prose, and `colour-tab-arrival.test.ts`'s guard was phrased at step 1's text
// so it could not see the picture.
//
// THE LANDING THAT FIXES A ROUTE CLAIM IS THE LANDING MOST LIKELY TO FALSIFY
// ITS SIBLINGS, because it is the only landing that moves the thing they all
// describe. That is why these rows are phrased against the DISCRIMINATION and
// not against the defect: "the diagram lists the sections in the order the
// provider declares" survives the fix and catches the next reorder in either
// direction, where "the timeline is no longer first" would go green forever.
//
// ═══ WHERE EVERY EXPECTATION COMES FROM ═══
//
// From the producer, never from the guide. The sub-tab order and labels are
// `EFFECTS_SUB_TABS`, imported and executed. A section's arrival state is read
// off its own `<CollapsibleSection>` tag. The drift seed the guide prints is
// computed through `driftFromToggle`. The band count of a new preset is read
// off `newPreset`. Copying a number or an order out of the guide would make
// these rows agree with the thing under test.
//
// ⚠ WHAT THESE ROWS DID NOT DO. None rendered a pixel. This repo's node suite
// has no jsdom and the vitest glob is `.test.ts`, so what is proved is DECLARED
// ORDER, SOURCE ORDER and ARRIVAL STATE. The one pixel claim on the page (the
// `LAYERS` list "measured at 211px of a ~2,400px list") is deliberately not
// asserted here and is tagged for a foreground seat in the packet's §5.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EFFECTS_SUB_TABS, effectsSubTab, subTabOfSection,
  type EffectsSubTabId,
} from '../../../providers/effects-sub-tabs';
import {
  LAYER_DRIFT_ROW, driftFromToggle, driftPxFieldValue,
} from '../../../providers/effects-aeon';
import { newPreset, newAnchorSweep } from '../../../providers/effects-preset';

const REPO = join(__dirname, '..', '..', '..', '..', '..');
const guide = readFileSync(join(REPO, 'docs', 'guides', 'effects-first-run.md'), 'utf8');

const renderer = (rel: string): string =>
  readFileSync(join(REPO, 'src', 'renderer', rel), 'utf8');

/** Source with comments gone, so prose about a mount is never read as one. */
function stripped(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

const facet = stripped(renderer(join('workspace', 'facets', 'effects-facet.tsx')));
const picker = stripped(renderer(join('components', 'effects', 'SectionPicker.tsx')));
const subTabBar = stripped(renderer(join('components', 'effects', 'EffectsSubTabBar.tsx')));
const presetPanel = stripped(renderer(join('components', 'effects', 'BandPresetPanel.tsx')));
const scenePanel = stripped(renderer(join('components', 'effects', 'EffectsScenePanel.tsx')));
const bgAnimPanel = stripped(renderer(join('components', 'effects', 'BgAnimBandPanel.tsx')));
const timeline = stripped(renderer(join('components', 'effects', 'RasterTimelineStrip.tsx')));
const effectsAeon = renderer(join('providers', 'effects-aeon.ts'));

/**
 * The module that mounts each declared section. Not a copy of the provider's
 * table: it is the file to READ for that section's own title and arrival state,
 * and every id below is checked to exist in the file named beside it.
 */
const SECTION_SOURCE: Readonly<Record<string, string>> = Object.freeze({
  'aeon.effects.scenes': scenePanel,
  'aeon.effects.layers': scenePanel,
  'aeon.effects.scene': scenePanel,
  'aeon.effects.assign': scenePanel,
  'aeon.effects.presets': presetPanel,
  'aeon.effects.preset.bands': presetPanel,
  'aeon.effects.preset.channels': presetPanel,
  'aeon.effects.preset.anchors': presetPanel,
  'aeon.effects.timeline': timeline,
  'aeon.bganim.bands': bgAnimPanel,
  'aeon.bganim.new': bgAnimPanel,
});

/** The `title=` the section's own component gives it, template holes and all. */
function titleOf(sectionId: string): string {
  const src = SECTION_SOURCE[sectionId];
  if (src === undefined) throw new Error(`no source module recorded for ${sectionId}`);
  const at = src.indexOf(`id="${sectionId}"`);
  if (at < 0) throw new Error(`${sectionId} is declared by no CollapsibleSection in its module`);
  const after = src.slice(at, at + 600);
  // ⚠ WHICHEVER COMES FIRST, not whichever shape is checked first. A section's
  // own title can be either a template or a plain string, and the window after
  // the id reaches into the section BODY, which carries titles of its own: for
  // `aeon.effects.scenes` a preferred-shape-first reader picked up a preset
  // button's `title={`${e.label} (${e.id})`}` from further down, and for
  // `aeon.effects.layers` it picked up a hint's `title="a section can bind its
  // own scene"`. Both read as a plausible title and neither was the section's.
  const backtick = /title=\{`([^`]*)`\}/.exec(after);
  const plain = /title="([^"]*)"/.exec(after);
  if (backtick && (!plain || backtick.index < plain.index)) return backtick[1];
  if (plain) return plain[1];
  throw new Error(`the CollapsibleSection for ${sectionId} no longer carries a title=`);
}

/** The opening `<CollapsibleSection …>` tag text, for the arrival state. */
function tagOf(sectionId: string): string {
  const src = SECTION_SOURCE[sectionId];
  const at = src.indexOf(`id="${sectionId}"`);
  if (at < 0) throw new Error(`${sectionId} is declared by no CollapsibleSection in its module`);
  const open = src.lastIndexOf('<CollapsibleSection', at);
  return src.slice(open, src.indexOf('>', at) + 1);
}

/** True when the section arrives collapsed. Read off the tag, never asserted. */
function arrivesShut(sectionId: string): boolean {
  return tagOf(sectionId).includes('defaultCollapsed');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The title as a matcher for the text a person reads.
 *
 * A title is a template (`Preset: ${selected.id} · cycles, variants`), so the
 * literal parts either side of each `${…}` hole are what survives into the
 * guide; the hole itself is written `<id>` or `n` there. Joining the literals
 * with a wildcard is therefore the whole derivation, and `weight` is how much
 * literal a match actually consumed, which is what separates `Preset: <id>`
 * from `Preset: <id> · moving anchors` when both match one cell.
 */
function titleMatcher(sectionId: string): { re: RegExp; anchored: RegExp; weight: number } {
  const parts = titleOf(sectionId).split(/\$\{[^}]*\}/);
  const body = parts.map(escapeRe).join('.*');
  return {
    re: new RegExp(body, 'i'),
    anchored: new RegExp(`^${body}`, 'i'),
    weight: parts.join('').trim().length,
  };
}

/**
 * Which declared section a piece of guide text names, by longest title match.
 * `null` when it names none, which every caller treats as a finding rather
 * than as a skip.
 */
function sectionNamedBy(text: string, anchored: boolean): string | null {
  let best: string | null = null;
  let bestWeight = -1;
  for (const id of Object.keys(SECTION_SOURCE)) {
    const m = titleMatcher(id);
    if (!(anchored ? m.anchored : m.re).test(text)) continue;
    if (m.weight > bestWeight) { best = id; bestWeight = m.weight; }
  }
  return best;
}

// ═══ THE §1 SCHEMATIC, READ BY COLUMN ═══
//
// ⚠ BY COLUMN AND NOT BY SUBSTRING. A whole-block `indexOf` over three columns
// drawn side by side would count a Colour entry that had drifted into the
// Parallax column as present and in order. The header line's own offsets for
// the three tab labels slice each following line into three cells, so where an
// entry sits is measured and not assumed.

interface Schematic { columns: Map<EffectsSubTabId, string[]>; found: boolean; }

function readSchematic(): Schematic {
  const columns = new Map<EffectsSubTabId, string[]>();
  const lines = guide.split('\n');
  const labels = EFFECTS_SUB_TABS.map((t) => t.label);
  let header = -1;
  let fenced = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('```')) { fenced = !fenced; continue; }
    if (!fenced) continue;
    // THE HEADER, NOT THE STRIP MOCK-UP. The same fenced block also draws the
    // three buttons as `[ Parallax ][ Colour ][ Tile anim ]`, which names all
    // three labels too. What separates them is the RULE under the header: the
    // column titles are underlined with box-drawing characters and the button
    // row is not. Matching on the labels alone read the mock-up as the header
    // and sliced the columns one line too high.
    if (!labels.every((l) => lines[i].includes(l))) continue;
    if (i + 1 < lines.length && /^[\s─-╿]+$/.test(lines[i + 1])
      && /[─-╿]/.test(lines[i + 1])) { header = i; break; }
  }
  if (header < 0) return { columns, found: false };
  const starts = labels.map((l) => lines[header].indexOf(l));
  // ⚠ `found` HAS TO BE MORE THAN "the labels are all in there". Every offset
  // is >= 0 by construction at this point, so asserting that proves nothing;
  // and `includes` matches a SUPERSTRING, so renaming the middle heading to
  // `Colours` left this whole reader working and every row green when it was
  // tried as a mutation. What actually has to hold for the slicing below to
  // mean anything is that the three headings sit at three DISTINCT, INCREASING
  // offsets, in the order the bar paints them.
  const ordered = starts.every((s, k) => s >= 0 && (k === 0 || s > starts[k - 1]));
  for (let k = 0; k < labels.length; k += 1) {
    const cells: string[] = [];
    for (let i = header + 1; i < lines.length && !lines[i].startsWith('```'); i += 1) {
      const cell = lines[i].slice(starts[k], k + 1 < starts.length ? starts[k + 1] : undefined)
        .trim();
      if (cell !== '' && !/^[─-╿\s]+$/.test(cell)) cells.push(cell);
    }
    columns.set(EFFECTS_SUB_TABS[k].id, cells);
  }
  return { columns, found: ordered };
}

const schematic = readSchematic();

describe('the guide is readable as an instrument at all', () => {
  it('LOUD ON UNMEASURABLE: the schematic and its three column headers were FOUND', () => {
    // Every order row below rests on this. Without it a renamed heading turns
    // the whole schematic into an empty map, and an empty map is in every
    // order there is.
    expect(schematic.found, 'the §1 panel schematic no longer has a fenced header line naming '
      + 'all three sub-tab labels at three distinct rising offsets; every column row below is '
      + 'measuring nothing').toBe(true);
    for (const tab of EFFECTS_SUB_TABS) {
      expect(schematic.columns.get(tab.id)?.length ?? 0,
        `the schematic's ${tab.label} column came back empty`).toBeGreaterThan(0);
    }
  });

  it('LOUD ON UNMEASURABLE: every section id has a module that really declares it', () => {
    // `titleOf` and `tagOf` throw rather than return a default, so this row is
    // what turns a renamed section into a named failure instead of a silent
    // reclassification somewhere below.
    for (const id of Object.keys(SECTION_SOURCE)) {
      expect(() => tagOf(id), `no CollapsibleSection declares ${id}`).not.toThrow();
      expect(titleOf(id), `${id} has an empty title`).not.toBe('');
    }
  });

  it('LOUD ON UNMEASURABLE: the provider and the module table describe one set', () => {
    const declared = new Set(EFFECTS_SUB_TABS.flatMap((t) => t.sections));
    expect([...declared].sort(),
      'a sub-tab declares a section this file cannot read, or this file reads one no tab '
      + 'declares; either way the rows below cover less than they say')
      .toEqual(Object.keys(SECTION_SOURCE).sort());
  });
});

describe('§1 schematic: each column is the column the provider declares', () => {
  for (const tab of EFFECTS_SUB_TABS) {
    it(`the ${tab.label} column lists the sections in the declared order`, () => {
      const cells = schematic.columns.get(tab.id) ?? [];
      const named = cells.map((c) => {
        const id = sectionNamedBy(c, true);
        expect(id, `the schematic draws "${c}" in the ${tab.label} column and it matches no `
          + 'section title any panel renders').not.toBe(null);
        return id;
      });
      expect(named, `the ${tab.label} column of the §1 schematic is not the order `
        + 'providers/effects-sub-tabs.ts declares for that tab').toEqual([...tab.sections]);
    });
  }

  it('no section is drawn in a column that does not own it', () => {
    // The order rows above would still pass if two tabs swapped a whole column,
    // because each would be internally ordered. This is the row that cannot.
    for (const tab of EFFECTS_SUB_TABS) {
      for (const cell of schematic.columns.get(tab.id) ?? []) {
        const id = sectionNamedBy(cell, true);
        expect(id === null ? null : subTabOfSection(id),
          `the schematic draws "${cell}" under ${tab.label}`).toBe(tab.id);
      }
    }
  });
});

describe('the three buttons: how many, in what order, and which word names which', () => {
  it('there are three of them, which is what makes "middle" a position at all', () => {
    expect(EFFECTS_SUB_TABS.length,
      'the guide calls the bar "the three sub-tab buttons" and says one of them is the middle')
      .toBe(3);
  });

  it('the bar paints the provider array in its own order, with nothing in between', () => {
    // Without this the rows below prove an order in a table nothing renders.
    expect(subTabBar, 'EffectsSubTabBar no longer maps EFFECTS_SUB_TABS directly, so the '
      + 'declared order is no longer the painted order').toMatch(/EFFECTS_SUB_TABS\.map\(/);
  });

  it('§2 step 1 sends the reader to the button the provider puts FIRST', () => {
    const step = guide.slice(guide.indexOf('## 2. Make the background drift'));
    const first = step.slice(step.indexOf('1. Press'), step.indexOf('2. In'));
    expect(first, 'the guide names a first-of-three button that is not EFFECTS_SUB_TABS[0]')
      .toContain(`\`${EFFECTS_SUB_TABS[0].label}\``);
    expect(first, 'the guide stopped calling it the first of the three buttons')
      .toMatch(/first of the three sub-tab buttons/);
  });

  it('§3 step 1 sends the reader to the button the provider puts in the MIDDLE', () => {
    const step = guide.slice(guide.indexOf('## 3. Make a raster band'));
    const first = step.slice(step.indexOf('1. Press'), step.indexOf('2. Type'));
    const middle = EFFECTS_SUB_TABS[Math.floor(EFFECTS_SUB_TABS.length / 2)];
    expect(first, 'the guide calls a different button the middle sub-tab than the one the '
      + 'provider paints in the middle').toContain(`\`${middle.label}\``);
    expect(first, 'the guide stopped calling it the middle sub-tab').toMatch(/middle sub-tab/);
  });

  it('§9 spells the three buttons in the order they are painted', () => {
    const spelled = EFFECTS_SUB_TABS.map((t) => `\`${t.label}\``).join(' / ');
    expect(guide, 'the quick reference lists the three job buttons in an order the bar does '
      + `not paint; it should read ${spelled}`).toContain(spelled);
  });
});

describe('what arrives open, what arrives shut, and what the guide promises', () => {
  it('the guide says `SCENE: <id>` arrives shut, and the section agrees', () => {
    // BOTH DIRECTIONS. If the panel ever drops `defaultCollapsed` this row goes
    // red on a guide that now teaches a click that does the opposite, which is
    // the failure a one-directional `toContain('defaultCollapsed')` would miss.
    const shut = arrivesShut('aeon.effects.scene');
    const saysShut = /`SCENE: <id>` \*\*arrives shut\.\*\*/.test(guide);
    expect(saysShut, `the scene form arrives ${shut ? 'shut' : 'open'} and §1 says `
      + `${saysShut ? 'shut' : 'nothing of the kind'}`).toBe(shut);
    const quickRef = /open `SCENE: <id>` \(it arrives shut\)/.test(guide);
    expect(quickRef, 'the §9 quick reference and §1 no longer agree about the scene form '
      + 'arriving shut; one of the two was updated alone').toBe(shut);
  });

  it('the guide says `RASTER BAND PRESETS` arrives open, and the section agrees', () => {
    const open = !arrivesShut('aeon.effects.presets');
    const step = guide.slice(guide.indexOf('## 3. Make a raster band'));
    const first = step.slice(step.indexOf('1. Press'), step.indexOf('2. Type'));
    expect(/arrives open/.test(first), `the preset section arrives ${open ? 'open' : 'shut'} `
      + 'and step 1 says otherwise').toBe(open);
  });

  it('step 1 calls it the FIRST section on the tab, and the provider puts it first', () => {
    // The half of step 1 `colour-tab-arrival.test.ts` pins against the provider
    // but never against the guide's own sentence.
    const colour = effectsSubTab('colour');
    expect(colour, 'no colour sub-tab is declared').not.toBe(null);
    const step = guide.slice(guide.indexOf('## 3. Make a raster band'));
    const first = step.slice(step.indexOf('1. Press'), step.indexOf('2. Type'));
    const named = sectionNamedBy(first, false);
    expect(named, 'step 1 names no section this repo renders').not.toBe(null);
    expect(named, 'step 1 tells the reader the first section on the Colour tab is not the '
      + 'section the provider declares first').toBe(colour?.sections[0]);
  });

  it('every preset sub-section the guide tells the reader to OPEN really arrives shut', () => {
    // "Open `PRESET: <id> · CYCLES, VARIANTS`" is a wasted instruction the day
    // one of these starts arriving open, and a guide that teaches a click that
    // shuts the thing is worse than one that says nothing.
    for (const id of ['aeon.effects.preset.bands', 'aeon.effects.preset.channels',
      'aeon.effects.preset.anchors']) {
      expect(arrivesShut(id), `the guide says to OPEN ${titleOf(id)} and it now arrives open`)
        .toBe(true);
    }
  });
});

describe('§6 and §1: where the strip is, and what sits at the ends of a tab', () => {
  it('the strip is the first thing in the column and the job buttons ride inside it', () => {
    const strip = facet.indexOf('<SectionPicker>');
    const body = facet.indexOf('<EffectsSubTabBody />');
    const bar = facet.indexOf('<EffectsSubTabBar />');
    for (const [name, at] of [['<SectionPicker>', strip], ['<EffectsSubTabBody />', body],
      ['<EffectsSubTabBar />', bar]] as const) {
      expect(at, `landmark not found in effects-facet.tsx: ${name}`).toBeGreaterThan(0);
    }
    expect(bar, 'the sub-tab bar is no longer a child of the section strip, so §6\'s "pinned '
      + 'to the top of the panel, above the three sub-tab buttons" describes two boxes that '
      + 'no longer stack').toBeGreaterThan(strip);
    expect(strip, 'the section strip no longer precedes the job it is describing').toBeLessThan(body);
  });

  it('inside the strip, the buttons come after the three condition rows and the act line', () => {
    const third = picker.indexOf('<ConditionRow n={3}');
    const act = picker.indexOf('`act: own preset ');
    const children = picker.indexOf('{children}');
    for (const [name, at] of [['<ConditionRow n={3}', third], ['the act: line', act],
      ['{children}', children]] as const) {
      expect(at, `landmark not found in SectionPicker.tsx: ${name}`).toBeGreaterThan(0);
    }
    expect(act, '§6 says the `act:` line is UNDER the condition rows').toBeGreaterThan(third);
    expect(children, '§1 says the three job buttons are under the strip\'s rows')
      .toBeGreaterThan(act);
  });

  it('`PROPERTIES` sits below all three jobs, as §1 says', () => {
    const body = facet.indexOf('<EffectsSubTabBody />');
    const props = facet.indexOf('id="aeon.props"');
    expect(props, 'landmark not found in effects-facet.tsx: id="aeon.props"').toBeGreaterThan(0);
    expect(props, 'the properties readout moved above the sub-tab body').toBeGreaterThan(body);
    expect(subTabOfSection('aeon.props'),
      '`aeon.props` joined a sub-tab, so "below all three" is no longer what it is')
      .toBe(null);
  });

  it('`SECTION ASSIGNMENT` really is the last section the Parallax tab declares', () => {
    const parallax = effectsSubTab('parallax');
    expect(parallax, 'no parallax sub-tab is declared').not.toBe(null);
    const last = parallax?.sections[parallax.sections.length - 1] ?? '';
    const bullet = guide.split('\n').find((l) => l.includes('at the bottom of the')
      && l.includes('sub-tab')) ?? '';
    expect(bullet, '§6 no longer has a bullet placing a binding at the bottom of a sub-tab')
      .not.toBe('');
    expect(sectionNamedBy(bullet, false), '§6 names a different section as the bottom of the '
      + 'Parallax tab than the one the provider declares last').toBe(last);
  });

  it('the `Section <n>` dropdown is the last field in `RASTER BAND PRESETS`', () => {
    const from = presetPanel.indexOf('id="aeon.effects.presets"');
    const to = presetPanel.indexOf('</CollapsibleSection>', from);
    expect(from, 'landmark not found: id="aeon.effects.presets"').toBeGreaterThan(0);
    expect(to, 'the preset section never closes').toBeGreaterThan(from);
    const section = presetPanel.slice(from, to);
    const bind = section.indexOf('<Field label={`Section ${activeSectionIndex}`}');
    const create = section.indexOf('label="Preset id"');
    const list = section.indexOf('{entries.length > 0 &&');
    const unreadable = section.indexOf('{library.unreadable.length > 0 &&');
    for (const [name, at] of [['the section binder', bind], ['the create row', create],
      ['the preset list', list], ['the unreadable warning', unreadable]] as const) {
      expect(at, `landmark not found inside the preset section: ${name}`).toBeGreaterThan(0);
    }
    expect(bind, '§6 says the section dropdown is at the BOTTOM of RASTER BAND PRESETS')
      .toBeGreaterThan(Math.max(create, list, unreadable));
    expect(section.lastIndexOf('<Field '), 'a field was added after the section binder, so the '
      + 'binder is no longer the bottom of that section').toBe(bind);
  });
});

describe('§8: the sub-tab each control is on', () => {
  it('every control the table places on a sub-tab is on the tab the provider says', () => {
    const table = guide.slice(guide.indexOf('## 8. Tile animations are not raster bands'));
    const rows = table.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l));
    const byLabel = new Map(EFFECTS_SUB_TABS.map((t) => [t.label, t.id]));
    let judged = 0;
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      if (cells.length < 3) continue;
      const owner = byLabel.get(cells[2]);
      if (owner === undefined) continue;
      const id = sectionNamedBy(cells[1], false);
      expect(id, `the §8 table puts "${cells[1]}" on ${cells[2]} and it names no section any `
        + 'panel renders').not.toBe(null);
      expect(id === null ? null : subTabOfSection(id),
        `the §8 table puts "${cells[1]}" on the ${cells[2]} sub-tab`).toBe(owner);
      judged += 1;
    }
    // ANTI-VACUOUS. A renamed heading or a reformatted table would otherwise
    // leave this row iterating over nothing and reporting a pass.
    expect(judged, 'the §8 table yielded no row naming a sub-tab; this row judged nothing')
      .toBeGreaterThan(3);
  });
});

describe('§2 and §3: what a control arrives holding', () => {
  it('the drift box arrives holding the number the guide prints', () => {
    const seeded = driftPxFieldValue({ drift: driftFromToggle(true) });
    const step = guide.slice(guide.indexOf('### Clouds that move on their own'));
    const two = step.slice(step.indexOf('2. A number box'), step.indexOf('3. Type'));
    expect(two, `turning drift on seeds ${seeded} px/frame and the guide prints a different `
      + 'number for what the box arrives holding').toContain(`\`${seeded}\``);
  });

  it('the guide\'s drift direction word is the direction the control declares', () => {
    // PHRASED AGAINST THE DISCRIMINATION. The producer states a direction for a
    // negative rate in its own tooltip; this row fails if the two disagree AND
    // fails if the producer stops saying anything, which is the state in which
    // the guide's sentence becomes unbacked rather than wrong.
    const left = /negative\s*=\s*leftward/i.test(LAYER_DRIFT_ROW.title);
    const right = /negative\s*=\s*rightward/i.test(LAYER_DRIFT_ROW.title);
    expect(left || right, 'the drift row\'s tooltip no longer says which way a negative rate '
      + 'moves a layer, so nothing in the app backs the guide\'s "Negative moves left"')
      .toBe(true);
    const step = guide.slice(guide.indexOf('### Clouds that move on their own'));
    expect(/\*\*Negative moves left\.\*\*/.test(step),
      `the control says negative = ${left ? 'leftward' : 'rightward'} and the guide says the `
      + 'opposite').toBe(left);
  });

  it('`Add` seeds the new layer BELOW the last, which is what "next screen line" means', () => {
    const at = effectsAeon.indexOf('export function addLayerCommand');
    expect(at, 'landmark not found: addLayerCommand').toBeGreaterThan(0);
    const body = effectsAeon.slice(at, at + 700);
    const m = /last\.world_y \+ (\d+)/.exec(body);
    expect(m, 'addLayerCommand no longer seeds a new layer from the last one\'s screen line, '
      + 'so §2 step 3 cannot say where the layer appears').not.toBe(null);
    expect(Number(m?.[1] ?? 0), 'a new layer is now seeded at or above the last one; the guide '
      + 'says it appears at the NEXT screen line').toBeGreaterThan(0);
  });

  it('a new preset arrives with exactly the one band the guide names', () => {
    const bands = newPreset('guide_route_probe').bands ?? [];
    expect(bands.length, 'a new preset no longer arrives with exactly one band, so §3 step 3\'s '
      + '"you now have a preset with `Raster band 0` in it" is wrong about the count').toBe(1);
    expect(guide, 'the guide names a band index a new preset does not have')
      .toContain('`Raster band 0`');
  });

  it('a new sweep arrives with `Start at` absent, as the §5 table says', () => {
    expect(Object.prototype.hasOwnProperty.call(newAnchorSweep(), 'phase'),
      'a new sweep now writes a phase, so §5\'s "Optional, and it arrives absent" and the '
      + '`absent · set` chip it tells the reader to leave alone are both stale').toBe(false);
  });
});

describe('§5: where the sweep controls and the strip land on the channel card', () => {
  it('the strip is the LAST thing on the channel, as §5 says', () => {
    const at = presetPanel.indexOf('function AnchorChannelCard');
    const fallback = presetPanel.indexOf('<AnchorSweepPreview');
    expect(fallback, 'landmark not found: <AnchorSweepPreview').toBeGreaterThan(0);
    const card = presetPanel.slice(at > 0 ? at : 0);
    const strip = card.indexOf('<AnchorSweepPreview');
    const travel = card.indexOf('<Field label="Travel"');
    const cycle = card.indexOf('<Field label="Cycle"');
    const start = card.indexOf('<Field label="Start at"');
    for (const [name, idx] of [['Travel', travel], ['Cycle', cycle], ['Start at', start]] as const) {
      expect(idx, `landmark not found on the channel card: the ${name} field`).toBeGreaterThan(0);
    }
    expect(strip, '§5 says the sweep strip is at the BOTTOM of the channel')
      .toBeGreaterThan(Math.max(travel, cycle, start));
  });

  it('the fit warning renders under `Travel`, which is where §5 sends the reader', () => {
    const travel = presetPanel.indexOf('<Field label="Travel"');
    const warning = presetPanel.indexOf('anchorSweepBandRefusal(sweep, index) !== null');
    const cycle = presetPanel.indexOf('<Field label="Cycle"');
    for (const [name, at] of [['the Travel field', travel], ['the fit warning', warning],
      ['the Cycle field', cycle]] as const) {
      expect(at, `landmark not found in BandPresetPanel.tsx: ${name}`).toBeGreaterThan(0);
    }
    expect(warning, '§5 says "A warning appears under `Travel`" and it now renders above it')
      .toBeGreaterThan(travel);
    expect(warning, 'the fit warning drifted past `Cycle`, so it no longer reads as Travel\'s')
      .toBeLessThan(cycle);
  });
});

describe('§1: the other two jobs are not rendered at all', () => {
  it('a job that is not shown is UNMOUNTED, not hidden', () => {
    // §1 says "One job is on screen at a time, and the other two are not
    // rendered at all". `display: none` would make that sentence false while
    // every text finder in every harness stayed green, which is a failure this
    // facet has already met once.
    const at = facet.indexOf('function EffectsSubTabBody');
    expect(at, 'landmark not found: EffectsSubTabBody').toBeGreaterThan(0);
    const body = facet.slice(at, facet.indexOf('function EffectsPanels'));
    expect(body, 'a sub-tab body is now hidden rather than unmounted')
      .not.toMatch(/display:\s*'none'/);
    // ONE EXCLUSIVE RETURN PER JOB, counted against the provider's own table.
    // All but one job is reached through a `tab === …` guard and the remaining
    // one is the fallthrough, so the return count is the tab count. A body that
    // rendered all three and toggled visibility would collapse to one return.
    const guarded = EFFECTS_SUB_TABS.filter((t) => body.includes(`tab === '${t.id}'`));
    expect(guarded.length, 'EffectsSubTabBody no longer has one guarded branch per job plus a '
      + 'fallthrough, so "one job is on screen at a time" is describing something else')
      .toBe(EFFECTS_SUB_TABS.length - 1);
    expect((body.match(/\breturn\b/g) ?? []).length,
      'EffectsSubTabBody returns a different number of exclusive bodies than there are jobs')
      .toBe(EFFECTS_SUB_TABS.length);
  });
});
