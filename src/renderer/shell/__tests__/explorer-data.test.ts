import { describe, it, expect } from 'vitest';
import {
  classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups,
  resolveObjectSprite, NEW_SPRITE_ITEM_ID,
} from '../explorer-data';

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
    const groups = classicExplorerGroups(zoneTree, objects, true);
    expect(groups.map((g) => g.id)).toEqual(['levels', 'objects', 'tools']);
  });

  it('level items carry tab ids; unavailable acts disable with the reason', () => {
    const levels = classicExplorerGroups(zoneTree, objects, true)[0];
    expect(levels.items[0]).toEqual({ id: 'level:ghz:1', label: 'Green Hill Act 1' });
    expect(levels.items[1]).toMatchObject({
      id: 'level:lz:2', disabled: true, reason: expect.stringContaining('missing'),
    });
  });

  it('object library lists only art-linked objects, hint = hex id', () => {
    const objectsGroup = classicExplorerGroups(zoneTree, objects, true)[1];
    expect(objectsGroup.items).toEqual([
      { id: 'obj:75', label: 'Buzz Bomber', hint: '$4B' },
    ]);
  });

  it('object rows disable with a reason until a level doc is loaded (art edit needs its palette)', () => {
    const objectsGroup = classicExplorerGroups(zoneTree, objects, false)[1];
    expect(objectsGroup.items[0]).toMatchObject({ disabled: true, reason: expect.any(String) });
  });

  it('tools group contains Project Setup', () => {
    const tools = classicExplorerGroups(zoneTree, objects, true)[2];
    expect(tools.items).toEqual([{ id: 'tool:project-setup', label: 'Project Setup' }]);
  });
});

describe('aeonExplorerGroups', () => {
  it('builds Levels (zone-name · act) and Tools when the object library is empty', () => {
    const groups = aeonExplorerGroups(
      [{ id: 'ehz', name: 'Emerald Hill', acts: [{ id: 'act1' }, { id: 'act2' }] }],
      [],
    );
    expect(groups.map((g) => g.id)).toEqual(['levels', 'tools']);
    expect(groups[0].items).toEqual([
      { id: 'level:ehz:act1', label: 'Emerald Hill · act1' },
      { id: 'level:ehz:act2', label: 'Emerald Hill · act2' },
    ]);
  });

  it('an empty object library omits the Object Library group entirely (no dead chrome)', () => {
    const groups = aeonExplorerGroups(
      [{ id: 'ehz', name: 'Emerald Hill', acts: [{ id: 'act1' }] }],
      [],
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
    ).find((g) => g.id === 'objects')!;
    expect(lib.items[0]).toEqual({ id: NEW_SPRITE_ITEM_ID, label: 'New Sprite…', hint: 'new' });
    expect(lib.items[0].disabled).toBeUndefined();
    // Not a tab id: the Explorer routes 'doc:sprite:' items into a sprite-doc
    // tab open, and this row must not be swallowed by that branch.
    expect(NEW_SPRITE_ITEM_ID.startsWith('doc:sprite:')).toBe(false);
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
