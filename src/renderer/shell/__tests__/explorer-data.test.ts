import { describe, it, expect } from 'vitest';
import {
  classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups,
  resolveObjectSprite, canvasExplorerGroup, NEW_SPRITE_ITEM_ID, NEW_CANVAS_ITEM_ID,
} from '../explorer-data';

/** A project with no canvases — the shape listCanvasNames returns. */
const NO_CANVASES = { names: [], skipped: [] };

describe('classicExplorerGroups', () => {
  const zoneTree = [
    { zone: 'ghz', act: 1, label: 'Green Hill Act 1', available: true },
    { zone: 'lz', act: 2, label: 'Labyrinth Act 2', available: false, reason: 'missing 2 required file(s): x, y' },
  ];
  const objects = [
    { id: 0x4b, name: 'Buzz Bomber', hex: '$4B', linked: true },
    { id: 0x40, name: 'Moto Bug', hex: '$40', linked: false },
  ];

  it('builds Levels / Object Library / Tools', () => {
    const groups = classicExplorerGroups(zoneTree, objects, true, NO_CANVASES);
    expect(groups.map((g) => g.id)).toEqual(['levels', 'objects', 'canvases', 'tools']);
  });

  it('level items carry tab ids; unavailable acts disable with the reason', () => {
    const levels = classicExplorerGroups(zoneTree, objects, true, NO_CANVASES)[0];
    expect(levels.items[0]).toEqual({ id: 'level:ghz:1', label: 'Green Hill Act 1' });
    expect(levels.items[1]).toMatchObject({
      id: 'level:lz:2', disabled: true, reason: expect.stringContaining('missing'),
    });
  });

  it('object library lists only art-linked objects, hint = hex id', () => {
    const objectsGroup = classicExplorerGroups(zoneTree, objects, true, NO_CANVASES)[1];
    expect(objectsGroup.items).toEqual([
      { id: 'obj:75', label: 'Buzz Bomber', hint: '$4B' },
    ]);
  });

  it('object rows disable with a reason until a level doc is loaded (art edit needs its palette)', () => {
    const objectsGroup = classicExplorerGroups(zoneTree, objects, false, NO_CANVASES)[1];
    expect(objectsGroup.items[0]).toMatchObject({ disabled: true, reason: expect.any(String) });
  });

  it('tools group contains Project Setup', () => {
    const tools = classicExplorerGroups(zoneTree, objects, true, NO_CANVASES)[3];
    expect(tools.items).toEqual([{ id: 'tool:project-setup', label: 'Project Setup' }]);
  });
});

describe('aeonExplorerGroups', () => {
  it('builds Levels (zone-name · act) and Tools when the object library is empty', () => {
    const groups = aeonExplorerGroups(
      [{ id: 'ehz', name: 'Emerald Hill', acts: [{ id: 'act1' }, { id: 'act2' }] }],
      [],
      NO_CANVASES,
    );
    expect(groups.map((g) => g.id)).toEqual(['levels', 'canvases', 'tools']);
    expect(groups[0].items).toEqual([
      { id: 'level:ehz:act1', label: 'Emerald Hill · act1' },
      { id: 'level:ehz:act2', label: 'Emerald Hill · act2' },
    ]);
  });

  it('an empty object library omits the Object Library group entirely (no dead chrome)', () => {
    const groups = aeonExplorerGroups(
      [{ id: 'ehz', name: 'Emerald Hill', acts: [{ id: 'act1' }] }],
      [],
      NO_CANVASES,
    );
    expect(groups.some((g) => g.id === 'objects')).toBe(false);
  });

  it('aeon groups include an Object Library of sprite-bound definitions', () => {
    const groups = aeonExplorerGroups(
      [{ id: 'ojz', name: 'OJ Zone', acts: [{ id: 'act1' }] }],
      [
        { id: 'motobug', name: 'Moto Bug', sprite: 'motobug' },
        { id: 'spring', name: 'Spring', sprite: undefined },
      ],
      NO_CANVASES,
    );
    const lib = groups.find((g) => g.id === 'objects')!;
    expect(lib.label).toBe('Object Library');
    expect(lib.items).toEqual([
      { id: NEW_SPRITE_ITEM_ID, label: 'New Sprite…', hint: 'new' },
      { id: 'doc:sprite:aeon:motobug', label: 'Moto Bug' },
      { id: 'doc:sprite:aeon:spring', label: 'Spring', disabled: true, reason: 'no sprite bound' },
    ]);
  });

  it('offers New Sprite… first, and enabled, even when EVERY object is unbound', () => {
    // The chicken-and-egg case: no object has a sprite, so every other row is
    // greyed and nothing else in the app opens a sprite-doc tab. If this row is
    // missing or disabled, the first sprite can only be authored by hand-editing
    // JSON on disk.
    const lib = aeonExplorerGroups(
      [{ id: 'ojz', name: 'OJ Zone', acts: [{ id: 'act1' }] }],
      [{ id: 'spring', name: 'Spring', sprite: undefined }],
      NO_CANVASES,
    ).find((g) => g.id === 'objects')!;
    expect(lib.items[0]).toEqual({ id: NEW_SPRITE_ITEM_ID, label: 'New Sprite…', hint: 'new' });
    expect(lib.items[0].disabled).toBeUndefined();
    // Not a tab id: the Explorer routes 'doc:sprite:' items into a sprite-doc
    // tab open, and this row must not be swallowed by that branch.
    expect(NEW_SPRITE_ITEM_ID.startsWith('doc:sprite:')).toBe(false);
  });
});

describe('canvasExplorerGroup', () => {
  it('lists each canvas under its own tab id, New Canvas… first', () => {
    const g = canvasExplorerGroup({ names: ['cliffs', 'sky'], skipped: [] });
    expect(g.label).toBe('Canvases');
    expect(g.items).toEqual([
      { id: NEW_CANVAS_ITEM_ID, label: 'New Canvas…', hint: 'new' },
      { id: 'doc:canvas:cliffs', label: 'cliffs' },
      { id: 'doc:canvas:sky', label: 'sky' },
    ]);
  });

  it('offers New Canvas… even with no canvases yet, and it is not a tab id', () => {
    // The discoverability case: with the group hidden or the row missing, the
    // origination canvas has exactly one entry point (⌘K) and a user who has
    // never made one has no reason to look for it there.
    const g = canvasExplorerGroup({ names: [], skipped: [] });
    expect(g.items).toEqual([{ id: NEW_CANVAS_ITEM_ID, label: 'New Canvas…', hint: 'new' }]);
    // Would be swallowed by the Explorer's 'doc:canvas:' branch otherwise.
    expect(NEW_CANVAS_ITEM_ID.startsWith('doc:canvas:')).toBe(false);
  });

  it('shows unopenable files as DISABLED rows, never hides them', () => {
    // `.aurora/canvas` is hand-populated (dropping an Aseprite export in is
    // supported), so a file that silently vanishes from the listing is
    // indistinguishable from data loss. The row must say the NAME is the
    // problem — the file is intact.
    const g = canvasExplorerGroup({ names: ['sky'], skipped: ['my art.png'] });
    expect(g.items[2]).toMatchObject({
      label: 'my art.png', disabled: true, reason: expect.stringContaining('NAME'),
    });
    // and its id must not parse as a canvas tab, or clicking it would try to
    // open a canvas whose name is exactly what was refused.
    expect(g.items[2].id.startsWith('doc:canvas:')).toBe(false);
  });
});

describe('resolveObjectSprite', () => {
  it('prefers the editor-side binding sidecar over ObjectDef.sprite', () => {
    // The sidecar is what the ONLY binding UI writes; objects.json is
    // hand-authored and Aurora never writes it.
    expect(resolveObjectSprite({ id: 'motobug', sprite: 'stale' }, { motobug: 'motobug_v2' }))
      .toBe('motobug_v2');
  });

  it('falls back to ObjectDef.sprite when nothing is bound', () => {
    expect(resolveObjectSprite({ id: 'motobug', sprite: 'motobug' }, {})).toBe('motobug');
  });

  it('is undefined when neither source has one', () => {
    expect(resolveObjectSprite({ id: 'spring' }, {})).toBeUndefined();
    expect(resolveObjectSprite({ id: 'spring' }, { other: 'x' })).toBeUndefined();
  });

  it('treats an empty-string binding as unbound (stale sidecar), not as a name', () => {
    expect(resolveObjectSprite({ id: 'spring', sprite: 'spring' }, { spring: '' })).toBe('spring');
    expect(resolveObjectSprite({ id: 'spring' }, { spring: '' })).toBeUndefined();
  });

  it('ungreys the Object Library when only the sidecar has the binding', () => {
    // End-to-end for the reported bug: binding through the Objects facet wrote
    // the sidecar and the Explorer entry stayed greyed, because the group was
    // built from ObjectDef.sprite alone.
    const bindings = { spring: 'spring_up' };
    const lib = aeonExplorerGroups(
      [{ id: 'ojz', name: 'OJ Zone', acts: [{ id: 'act1' }] }],
      [{ id: 'spring', name: 'Spring' }].map((o) => ({
        id: o.id, name: o.name, sprite: resolveObjectSprite(o, bindings),
      })),
      NO_CANVASES,
    ).find((g) => g.id === 'objects')!;
    expect(lib.items[1]).toEqual({ id: 'doc:sprite:aeon:spring_up', label: 'Spring' });
  });
});

describe('noProjectExplorerGroups', () => {
  it('builds a Recents group from recent projects, hint = path', () => {
    const groups = noProjectExplorerGroups([
      { path: '/p/s1disasm', name: 'Sonic 1 Disassembly (GitHub)', lastOpened: 1 },
    ]);
    expect(groups).toEqual([
      {
        id: 'recents', label: 'Recent Projects',
        items: [{ id: 'recent:/p/s1disasm', label: 'Sonic 1 Disassembly (GitHub)', hint: '/p/s1disasm' }],
      },
    ]);
  });

  it('no recents → no groups (the empty state lives in the component)', () => {
    expect(noProjectExplorerGroups([])).toEqual([]);
  });
});
