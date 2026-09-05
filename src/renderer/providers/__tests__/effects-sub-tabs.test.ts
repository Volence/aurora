// THREE SUB-TABS — the table, and the seam a reveal crosses (d-26b, EW-SHAPE-TABS).
//
// ⚠ WHAT THIS FILE CANNOT SEE, said first. The node suite has no layout, so
// nothing here proves a tab body is 742px instead of 4,843px, that the layers
// list grew, or that a section on an inactive tab is off the screen. Those are
// `scratchpad/effects-sub-tabs-harness.mjs`'s rows, driven under CDP against
// the built app. What node CAN pin is the two things that would rot silently:
// the table is COMPLETE against the panels' own source, and the reveal crosses
// the tab boundary before it opens the disclosure.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EFFECTS_SUB_TABS, subTabOfSection, effectsSubTab, revealEffectsSection,
} from '../effects-sub-tabs';
import { BANDS_SECTION_ID, followBand } from '../band-follow';
import { loadPanelState, savePanelState, isCollapsed, subscribePanelState } from '../../shell/panel-state';
import { useEditorStore } from '../../state/editorStore';

// panel-state IS localStorage, and node has none — its load/save swallow the
// throw and return {}, so without this stub every reveal row below would pass
// vacuously. (Same stub, same reason, as band-follow.test.ts.)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const EFFECTS = join(__dirname, '../../components/effects');

/**
 * EVERY SECTION THE THREE PANELS DECLARE, read from their source.
 *
 * ⚠ FROM THE SOURCE AND NOT FROM A LIST IN THIS FILE. A hand-kept list of
 * section ids is only ever as complete as the last person to remember it, and
 * the failure is the silent one: a section added to a panel and to no tab is a
 * control that renders nowhere, which no assertion over a list this file also
 * wrote could catch. (`CollapsibleSection`'s own docblock makes the same
 * argument against inferring the section VARIANT from a name list.)
 */
function declaredSections(): { file: string; id: string }[] {
  const files = ['EffectsScenePanel.tsx', 'BandPresetPanel.tsx', 'BgAnimBandPanel.tsx',
    'RasterTimelineStrip.tsx'];
  const out: { file: string; id: string }[] = [];
  for (const file of files) {
    const src = readFileSync(join(EFFECTS, file), 'utf8');
    for (const m of src.matchAll(/<CollapsibleSection[\s\S]{0,200}?id="([^"]+)"/g)) {
      out.push({ file, id: m[1] });
    }
  }
  return out;
}

describe('the table of which sub-tab owns which section', () => {
  it('ANTI-VACUOUS: the panels really do declare sections, and more than one', () => {
    // A regex that matched nothing would make every row below trivially true.
    const found = declaredSections();
    expect(found.length).toBeGreaterThanOrEqual(9);
    expect(new Set(found.map((s) => s.file)).size).toBe(4);
  });

  it('claims every section the effects panels declare: none is rendered nowhere', () => {
    for (const { file, id } of declaredSections()) {
      expect(subTabOfSection(id), `${file} declares ${id}, which no sub-tab renders`).not.toBeNull();
    }
  });

  it('claims NOTHING the panels do not declare: a stale id is a dead tab row', () => {
    const declared = new Set(declaredSections().map((s) => s.id));
    for (const tab of EFFECTS_SUB_TABS) {
      for (const id of tab.sections) {
        expect(declared.has(id), `${tab.id} lists ${id}, which no effects panel declares`).toBe(true);
      }
    }
  });

  it('gives each section exactly one owner', () => {
    const seen = new Map<string, string>();
    for (const tab of EFFECTS_SUB_TABS) {
      for (const id of tab.sections) {
        expect(seen.has(id), `${id} is on both ${seen.get(id)} and ${tab.id}`).toBe(false);
        seen.set(id, tab.id);
      }
    }
  });

  it('⚠ PUTS THE TWO "BAND" FEATURES ON DIFFERENT TABS: the walkthrough\'s §c1', () => {
    // A tile animation (a block of background TILES with phase banks) and a
    // raster band (a range of SCREEN LINES that repaints CRAM) were adjacent
    // sections in one list, which is how one author read them as one feature
    // and dirtied his project with the wrong one.
    const tileAnim = subTabOfSection('aeon.bganim.bands');
    const raster = subTabOfSection('aeon.effects.presets');
    expect(tileAnim).not.toBeNull();
    expect(raster).not.toBeNull();
    expect(tileAnim).not.toBe(raster);
  });

  it('leaves `aeon.props` OUT: it is the facet\'s readout, not one of the three jobs', () => {
    // Mounted by effects-facet directly, outside the tab body, deliberately.
    expect(subTabOfSection('aeon.props')).toBeNull();
  });

  it('names three tabs, each with a label and a sentence saying what the job is', () => {
    expect(EFFECTS_SUB_TABS.map((t) => t.label)).toEqual(['Parallax', 'Colour', 'Tile anim']);
    for (const tab of EFFECTS_SUB_TABS) {
      expect(tab.sections.length, `${tab.id} renders nothing`).toBeGreaterThan(0);
      // §a3 of the walkthrough is "nine unfamiliar nouns and no orientation".
      expect(tab.blurb.length, `${tab.id} has no blurb`).toBeGreaterThan(60);
      expect(effectsSubTab(tab.id)).toBe(tab);
    }
    expect(effectsSubTab('nope' as never)).toBeNull();
  });
});

describe('revealEffectsSection: the seam between a reveal and a sub-tab', () => {
  beforeEach(() => {
    savePanelState({});
    useEditorStore.getState().setEffectsSubTab('parallax');
  });

  it('brings the owning tab forward AND opens the section', () => {
    expect(useEditorStore.getState().effectsSubTab).toBe('parallax');
    const tab = revealEffectsSection(BANDS_SECTION_ID);
    expect(tab).toBe('tileAnim');
    expect(useEditorStore.getState().effectsSubTab).toBe('tileAnim');
    // `aeon.bganim.bands` is defaultCollapsed, which is the case that matters.
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(false);
  });

  it('⚠ SWITCHES BEFORE IT NOTIFIES: the order band-follow depends on', () => {
    // The follow-up asks the panel to scroll to a card that does not exist
    // until the section is both mounted (tab) and rendered (disclosure). A
    // listener firing while the store still says `parallax` is the reveal
    // landing in an unmounted tab.
    let tabWhenNotified: string | null = null;
    const off = subscribePanelState(() => {
      tabWhenNotified = useEditorStore.getState().effectsSubTab;
    });
    revealEffectsSection(BANDS_SECTION_ID);
    off();
    expect(tabWhenNotified).toBe('tileAnim');
  });

  it('still reveals a section no tab claims, rather than refusing', () => {
    expect(revealEffectsSection('aeon.props')).toBeNull();
    expect(isCollapsed(loadPanelState(), 'aeon.props', true)).toBe(false);
    expect(useEditorStore.getState().effectsSubTab).toBe('parallax');
  });

  it('leaves the tab alone when the section is already on it', () => {
    useEditorStore.getState().setEffectsSubTab('colour');
    revealEffectsSection('aeon.effects.presets');
    expect(useEditorStore.getState().effectsSubTab).toBe('colour');
  });
});

describe('followBand goes through that door: the toolbar verb reaches the panel', () => {
  beforeEach(() => {
    savePanelState({});
    useEditorStore.getState().setEffectsSubTab('parallax');
  });

  it('a band made from the tool-options bar brings the Tile anim tab forward', () => {
    // The verb chips are on the bar, which is on screen from every sub-tab, so
    // the author authoring parallax can create a tile animation that lands two
    // tabs away. Before this, the reveal opened a section that was not mounted.
    followBand(0);
    expect(useEditorStore.getState().effectsSubTab).toBe('tileAnim');
    expect(isCollapsed(loadPanelState(), BANDS_SECTION_ID, true)).toBe(false);
  });
});
