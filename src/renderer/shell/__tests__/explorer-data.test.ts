import { describe, it, expect } from 'vitest';
import { classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups } from '../explorer-data';

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
      { id: 'doc:sprite:aeon:motobug', label: 'Moto Bug' },
      { id: 'doc:sprite:aeon:spring', label: 'Spring', disabled: true, reason: 'no sprite bound' },
    ]);
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
