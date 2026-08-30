// The aeon properties panel's row model. Every assertion here is a transcription
// of what components/PropertiesPanel.tsx rendered before it became neutral — the
// task's requirement 3 is "aeon shows exactly what it showed", and this is the
// only place that can hold that claim, since the renderer has no component test
// harness.

import { describe, it, expect, vi } from 'vitest';
import { aeonBackgroundCommand, aeonPropertySections, type AeonPropertiesInput } from '../properties-aeon';
import type { Tile } from '../../../core/model/s4-types';

const NOOP = (): void => {};

/** Defaults = a loaded act with one empty section, nothing selected, view tool. */
function input(over: Partial<AeonPropertiesInput> = {}): AeonPropertiesInput {
  return {
    projectName: 'Sonic 4',
    bgLibrary: [],
    zone: { name: 'Green Hill', tileset: { tiles: new Array<Tile>(42) } },
    act: { id: 'act1', gridWidth: 8, gridHeight: 4 },
    section: { objects: [], rings: [], bgLayoutRef: null },
    activeSectionIndex: 0,
    selection: null,
    showObjectSelection: false,
    tool: 'view',
    selectedTileIndex: 0,
    selectedBgTileIndex: 0,
    editingLayer: 'fg',
    selectedPaletteLine: 0,
    viewport: { x: 0, y: 0, zoom: 1 },
    onBackgroundChange: NOOP,
    ...over,
  };
}

const titles = (i: AeonPropertiesInput): string[] => aeonPropertySections(i).map((s) => s.title);

function section(i: AeonPropertiesInput, title: string) {
  const found = aeonPropertySections(i).find((s) => s.title === title);
  if (!found) throw new Error(`no "${title}" section in [${titles(i).join(', ')}]`);
  return found;
}

const rows = (i: AeonPropertiesInput, title: string): [string, string][] =>
  section(i, title).rows.map((r) => [r.label, r.value]);

describe('aeonPropertySections — the always-on sections', () => {
  it('reports project, active section, art and viewport, in that order', () => {
    expect(titles(input())).toEqual(['Project', 'Active Section', 'Art', 'Viewport']);
  });

  it('names the project, zone, act and grid', () => {
    expect(rows(input(), 'Project')).toEqual([
      ['Name', 'Sonic 4'],
      ['Zone', 'Green Hill'],
      ['Act', 'act1'],
      ['Grid', '8x4'],
    ]);
  });

  it('drops the zone row AND the whole Art section when no zone is current', () => {
    const i = input({ zone: null });
    expect(titles(i)).toEqual(['Project', 'Active Section', 'Viewport']);
    expect(rows(i, 'Project')).toEqual([['Name', 'Sonic 4'], ['Act', 'act1'], ['Grid', '8x4']]);
  });

  it('counts the zone tileset for Art', () => {
    expect(rows(input(), 'Art')).toEqual([['Tiles', '42']]);
  });

  it('counts the active section contents', () => {
    const i = input({
      activeSectionIndex: 3,
      section: { objects: [obj(), obj()], rings: [{ x: 0, y: 0 }], bgLayoutRef: null },
    });
    expect(rows(i, 'Active Section')).toEqual([
      ['Index', '3'],
      ['Objects', '2'],
      ['Rings', '1'],
    ]);
  });

  it('says the slot is empty, and offers no background, when the section is null', () => {
    const i = input({ section: null, activeSectionIndex: 5 });
    expect(rows(i, 'Active Section')).toEqual([['Index', '5'], ['Status', '(empty)']]);
    expect(section(i, 'Active Section').select).toBeUndefined();
  });

  it('rounds the viewport position and shows zoom as a percentage', () => {
    const i = input({ viewport: { x: 12.7, y: -3.2, zoom: 1.5 } });
    expect(rows(i, 'Viewport')).toEqual([['Position', '13, -3'], ['Zoom', '150%']]);
  });
});

describe('aeonPropertySections — the background select', () => {
  const LIB = [{ id: 'bg-city', name: 'City' }, { id: 'bg-sky', name: 'Sky' }];

  it('offers the act default plus every library entry', () => {
    const sel = section(input({ bgLibrary: LIB }), 'Active Section').select;
    expect(sel?.label).toBe('Background');
    expect(sel?.options).toEqual([
      { value: '', label: 'Act default' },
      { value: 'bg-city', label: 'City' },
      { value: 'bg-sky', label: 'Sky' },
    ]);
  });

  it('shows the act default (the empty value) when the section has no override', () => {
    expect(section(input({ bgLibrary: LIB }), 'Active Section').select?.value).toBe('');
  });

  it('shows the override when the section has one', () => {
    const i = input({ bgLibrary: LIB, section: { objects: [], rings: [], bgLayoutRef: 'bg-sky' } });
    expect(section(i, 'Active Section').select?.value).toBe('bg-sky');
  });

  // ── O31: the ref the library cannot answer ────────────────────────────────
  //
  // A `<select>` whose `value` matches no `<option>` renders at selectedIndex
  // -1: a BLANK box under the label "Background", on a section whose sidecar on
  // disk names one. That is what a checkout of aeon carrying the tracked
  // `ojz_bglib.json` and none of its untracked `ojz_bg_*.bin` bodies produced —
  // seventeen names in the manifest, zero entries in `bgLibrary`, and
  // `section_0.meta.json` pointing into the gap.
  const DANGLING = { objects: [], rings: [], bgLayoutRef: 'ingame-forest-v15-1786630615596' };

  it('gives the missing entry an option of its own, so the control is not blank', () => {
    const sel = section(input({ bgLibrary: LIB, section: DANGLING }), 'Active Section').select;
    // The value is unchanged — the section really does carry that ref, and a
    // fix that quietly rewrote it to '' would be the silent fallback again,
    // this time in the model.
    expect(sel?.value).toBe('ingame-forest-v15-1786630615596');
    expect(sel?.options).toEqual([
      { value: '', label: 'Act default' },
      {
        value: 'ingame-forest-v15-1786630615596',
        label: 'ingame-forest-v15-1786630615596 — missing, showing act default',
      },
      { value: 'bg-city', label: 'City' },
      { value: 'bg-sky', label: 'Sky' },
    ]);
  });

  it('the extra option appears ONLY for a ref nothing answers', () => {
    // ANTI-VACUOUS: a resolvable ref and the act default must both produce the
    // untouched list, or the row above would pass over an option added always.
    const resolvable = input({ bgLibrary: LIB, section: { objects: [], rings: [], bgLayoutRef: 'bg-sky' } });
    expect(section(resolvable, 'Active Section').select?.options).toHaveLength(3);
    expect(section(input({ bgLibrary: LIB }), 'Active Section').select?.options).toHaveLength(3);
  });

  it('a missing entry does not block the author — every real option still works', () => {
    const onBackgroundChange = vi.fn();
    const sel = section(
      input({ bgLibrary: LIB, section: DANGLING, onBackgroundChange }), 'Active Section').select;
    sel?.onChange('bg-city');
    expect(onBackgroundChange).toHaveBeenCalledWith('bg-city');
  });

  it('forwards the raw select value — the null-for-empty rule is aeonBackgroundCommand’s', () => {
    // The panel must not decide what '' MEANS. Only the aeon port knows that the
    // empty option is `bgLayoutRef: null`, and only it may issue the command.
    const onBackgroundChange = vi.fn();
    section(input({ bgLibrary: LIB, onBackgroundChange }), 'Active Section').select?.onChange('bg-city');
    expect(onBackgroundChange).toHaveBeenCalledWith('bg-city');
  });
});

describe('aeonBackgroundCommand', () => {
  it('maps the empty option back to the act default', () => {
    // '' is a <select>'s only way to say "no value"; the model is `null`. This
    // mapping is the reason the neutral panel forwards the raw string.
    expect(aeonBackgroundCommand(2, 'bg-sky', '')).toEqual({
      type: 'set-section-bg',
      description: 'Section 2 background',
      sectionIndex: 2,
      oldRef: 'bg-sky',
      newRef: null,
    });
  });

  it('describes a normal change with both ends of the swap', () => {
    // oldRef is what undo restores — a command that recorded the NEW value on
    // both sides would undo to itself.
    expect(aeonBackgroundCommand(0, null, 'bg-city')).toEqual({
      type: 'set-section-bg',
      description: 'Section 0 background',
      sectionIndex: 0,
      oldRef: null,
      newRef: 'bg-city',
    });
  });

  it('issues nothing when the value did not change', () => {
    // Re-picking the option already selected fires onChange in some browsers and
    // always fires on a programmatic set. Without this guard every such pick
    // pushes a junk undo entry that visibly does nothing.
    expect(aeonBackgroundCommand(1, 'bg-city', 'bg-city')).toBeNull();
    expect(aeonBackgroundCommand(1, null, '')).toBeNull();
  });
});

describe('aeonPropertySections — the selection readouts', () => {
  it('shows a selected ring whether or not object selection is on', () => {
    const i = (showObjectSelection: boolean): AeonPropertiesInput => input({
      showObjectSelection,
      activeSectionIndex: 2,
      section: { objects: [], rings: [{ x: 16, y: 32 }], bgLayoutRef: null },
      selection: { type: 'ring', sectionIndex: 2, index: 0 },
    });
    for (const on of [true, false]) {
      expect(titles(i(on))[0]).toBe('Selected Ring');
      expect(rows(i(on), 'Selected Ring')).toEqual([['Section', '2'], ['Position', '16, 32']]);
    }
  });

  it('shows a selected object ONLY when the mount site asked for it', () => {
    const sel = { type: 'object', sectionIndex: 0, index: 1 } as const;
    const sec = { objects: [obj(), obj({ typeId: 'ring-monitor', subtype: 3, x: 8, y: 9 })], rings: [], bgLayoutRef: null };
    expect(titles(input({ selection: sel, section: sec }))).not.toContain('Selected Object');
    const on = input({ selection: sel, section: sec, showObjectSelection: true });
    expect(titles(on)[0]).toBe('Selected Object');
    expect(rows(on, 'Selected Object')).toEqual([
      ['Section', '0'],
      ['Type', 'ring-monitor'],
      ['Subtype', '3'],
      ['Position', '8, 9'],
    ]);
  });

  it('shows nothing rather than blanks when the selection index is stale', () => {
    // Deleting the selected object without clearing the selection is reachable
    // (undo/redo), and indexing past the end must not print "undefined".
    const stale = { objects: [], rings: [], bgLayoutRef: null };
    expect(titles(input({ selection: { type: 'object', sectionIndex: 0, index: 4 }, section: stale, showObjectSelection: true })))
      .not.toContain('Selected Object');
    expect(titles(input({ selection: { type: 'ring', sectionIndex: 0, index: 4 }, section: stale })))
      .not.toContain('Selected Ring');
  });

  it('shows nothing when the active section slot is empty', () => {
    const i = input({ selection: { type: 'ring', sectionIndex: 0, index: 0 }, section: null });
    expect(titles(i)).not.toContain('Selected Ring');
  });
});

describe('aeonPropertySections — the paint tool readout', () => {
  it('appears for the two paint tools only', () => {
    const shown = { selectedTileIndex: 7, selectedPaletteLine: 2 };
    expect(titles(input({ ...shown, tool: 'paint-tile' }))[0]).toBe('Paint Tool');
    expect(titles(input({ ...shown, tool: 'paint-block' }))[0]).toBe('Paint Tool');
    for (const tool of ['view', 'select', 'stamp-chunk', 'place-object'] as const) {
      expect(titles(input({ ...shown, tool }))).not.toContain('Paint Tool');
    }
  });

  it('reports the armed tile and palette line', () => {
    const i = input({ tool: 'paint-tile', selectedTileIndex: 7, selectedPaletteLine: 2 });
    expect(rows(i, 'Paint Tool')).toEqual([['Tile Index', '7'], ['Palette', '2']]);
  });

  // ROADMAP item 47. The two picks are indices into different arrays, so a
  // readout that showed one under the other's label would be the same
  // see-one-thing-paint-another defect at panel scale.
  it('reports the BG pick, under a label that names the other space, in BG mode', () => {
    const i = input({
      tool: 'paint-tile', editingLayer: 'bg', selectedTileIndex: 7,
      selectedBgTileIndex: 5, selectedPaletteLine: 2,
    });
    expect(rows(i, 'Paint Tool')).toEqual([['BG Tile Index', '5'], ['Palette', '2']]);
    // Anti-vacuous: 5 and 7 really are different, so the row cannot pass by the
    // two picks happening to agree.
    expect(rows(input({ tool: 'paint-tile', editingLayer: 'fg', selectedTileIndex: 7, selectedBgTileIndex: 5 }),
      'Paint Tool')[0]).toEqual(['Tile Index', '7']);
  });

  it('sits below the selection readouts', () => {
    const i = input({
      tool: 'paint-tile',
      section: { objects: [], rings: [{ x: 0, y: 0 }], bgLayoutRef: null },
      selection: { type: 'ring', sectionIndex: 0, index: 0 },
    });
    expect(titles(i)).toEqual(['Selected Ring', 'Paint Tool', 'Project', 'Active Section', 'Art', 'Viewport']);
  });
});

function obj(over: { typeId?: string; subtype?: number; x?: number; y?: number } = {}) {
  return { x: 0, y: 0, typeId: 'spike', subtype: 0, ...over };
}
