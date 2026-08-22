import { describe, it, expect } from 'vitest';
import { countableItems } from '../../../core/shell/explorer';
import {
  classicExplorerGroups, classicObjectLibraryItems, aeonExplorerGroups, noProjectExplorerGroups,
  resolveObjectSprite, canvasExplorerGroup, NEW_SPRITE_ITEM_ID, NEW_CANVAS_ITEM_ID, IMPORT_SHEET_ITEM_ID,
} from '../explorer-data';
import { S1_OBJECT_LIST } from '../../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';

/** A project with no canvases — the shape listCanvasNames returns. */
const NO_CANVASES = { names: [], skipped: [] };

describe('classicExplorerGroups', () => {
  const zoneTree = [
    { zone: 'ghz', act: 1, label: 'Green Hill Act 1', available: true },
    { zone: 'lz', act: 2, label: 'Labyrinth Act 2', available: false, reason: 'missing 2 required file(s): x, y' },
  ];

  it('builds Levels / Object Library / Tools', () => {
    const groups = classicExplorerGroups(zoneTree, 'ghz', true, NO_CANVASES);
    expect(groups.map((g) => g.id)).toEqual(['levels', 'objects', 'canvases', 'tools']);
  });

  it('level items carry tab ids; unavailable acts disable with the reason', () => {
    const levels = classicExplorerGroups(zoneTree, 'ghz', true, NO_CANVASES)[0];
    expect(levels.items[0]).toEqual({ id: 'level:ghz:1', label: 'Green Hill Act 1' });
    expect(levels.items[1]).toMatchObject({
      id: 'level:lz:2', disabled: true, reason: expect.stringContaining('missing'),
    });
  });

  it('tools group contains Project Setup', () => {
    const tools = classicExplorerGroups(zoneTree, 'ghz', true, NO_CANVASES)[3];
    expect(tools.items).toEqual([{ id: 'tool:project-setup', label: 'Project Setup' }]);
  });
});

describe('classicObjectLibraryItems', () => {
  // Real-table expectations, hand-derived (see s1-object-presentation.test.ts
  // for the table citations): GHZ links 36 ids (35 + Sonic's $01 DPLC row);
  // the five shared-link Eggman ids dedup to one row → 32 object rows, plus
  // the named art docs (Boss Items + the 13 non-level families, Parcel B)
  // → 46 rows before the heading.
  const items = classicObjectLibraryItems('ghz', true);
  const headingIdx = items.findIndex((i) => i.heading === true);

  it('lists EVERY named object: available block, one heading divider, then the rest', () => {
    expect(headingIdx).toBeGreaterThan(0);
    expect(items.filter((i) => i.heading)).toHaveLength(1);
    const available = items.slice(0, headingIdx);
    const rest = items.slice(headingIdx + 1);
    expect(available).toHaveLength(46);
    // Named art docs ride at the end of the available block with a
    // doc:sprite: id — they are not object rows. Table order = declaration
    // order in S1_NAMED_ART_DOCS.
    const namedDocs = available.filter((i) => i.id.startsWith('doc:sprite:'));
    expect(namedDocs.map((i) => i.label)).toEqual([
      'Boss Items', 'Shield & Invincibility', 'HUD', 'Title Screen Sonic',
      'Press Start / TM', 'Title Cards', 'Game Over', 'Continue Screen',
      'Ending Sonic', 'Ending Emeralds', 'Ending StH Logo', 'Try Again',
      'Credits Font', 'SS Result Emeralds',
    ]);
    // NEVER gated on a level: named rows are zone-free by construction.
    for (const d of namedDocs) expect(d.disabled).toBeUndefined();
    // Every named id appears exactly once across the two blocks (merged rows
    // carry their extra ids in the hint, not as rows).
    const linked = S1_OBJECT_LIST.filter((o) => resolveObjectArt(o.id, 'ghz') !== undefined);
    expect(available.length - namedDocs.length + 4).toBe(linked.length); // Eggman merge swallowed 4 rows
    expect(rest).toHaveLength(S1_OBJECT_LIST.length - linked.length);
    for (const r of rest) expect(r.disabled).toBe(true);
  });

  it('the heading names the zone', () => {
    expect(items[headingIdx].label).toBe('Not loaded in GHZ');
  });

  it('the merged Eggman row carries the covered ids as its hint', () => {
    const egg = items.slice(0, headingIdx).filter((i) => i.label.includes('Eggman'));
    expect(egg.map((i) => i.label)).toContain('Eggman (Boss)');
    const merged = egg.find((i) => i.label === 'Eggman (Boss)')!;
    expect(merged.id).toBe('obj:61'); // canonical $3D
    expect(merged.hint).toBe('$3D · $73 · $75 · $77 · $7A');
  });

  it('unavailable rows carry the honest per-row note (PLC-derived, cited)', () => {
    const jaws = items.find((i) => i.label === 'Jaws')!;
    expect(jaws.disabled).toBe(true);
    expect(jaws.reason).toContain('Not loaded in GHZ');
    expect(jaws.reason).toContain('LZ, SBZ');
    const teleporter = items.find((i) => i.label === 'Teleporter')!;
    expect(teleporter.reason).toContain('Invisible trigger');
  });

  it('zone-SCOPED rows disable with the palette reason until a level doc is loaded; zone-FREE rows stay live', () => {
    const cold = classicObjectLibraryItems('ghz', false);
    const idx = cold.findIndex((i) => i.heading === true);
    // Zone-scoped: Moto Bug is GHZ-map-only art — needs the open act.
    const moto = cold.find((i) => i.label === 'Moto Bug')!;
    expect(moto).toMatchObject({ disabled: true, reason: expect.stringContaining('Open a level first') });
    // Zone-free: Ring / Sonic open genuinely level-free (base-map link, disk
    // palette fallback) — the Explorer exemption (audit §4.4).
    const ring = cold.find((i) => i.label === 'Ring')!;
    expect(ring.disabled).toBeUndefined();
    const sonic = cold.find((i) => i.label === 'Sonic')!;
    expect(sonic.disabled).toBeUndefined();
    // Named family rows (Parcel B) are zone-free by construction — never gated.
    const cont = cold.find((i) => i.label === 'Continue Screen')!;
    expect(cont.disabled).toBeUndefined();
    // Every disabled pre-heading row carries the honest palette reason.
    for (const i of cold.slice(0, idx)) {
      if (i.disabled) expect(i.reason).toContain('Open a level first');
    }
  });

  it('no zone open: zone-free rows are the available set; the heading does not blame a zone', () => {
    const free = classicObjectLibraryItems(null, false);
    const idx = free.findIndex((i) => i.heading === true);
    expect(free[idx].label).toBe('Needs an open act');
    // The available block is exactly the base-map (zone-free) groups.
    expect(idx).toBeGreaterThan(0);
    expect(free.slice(0, idx).some((i) => i.label === 'Ring')).toBe(true);
    expect(free.slice(0, idx).some((i) => i.label === 'Moto Bug')).toBe(false);
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
      { id: NEW_SPRITE_ITEM_ID, label: 'New Sprite…', hint: 'new', action: true },
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
    expect(lib.items[0]).toEqual({ id: NEW_SPRITE_ITEM_ID, label: 'New Sprite…', hint: 'new', action: true });
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
      { id: NEW_CANVAS_ITEM_ID, label: 'New Canvas…', hint: 'new', action: true },
      { id: 'doc:canvas:cliffs', label: 'cliffs' },
      { id: 'doc:canvas:sky', label: 'sky' },
    ]);
  });

  it('offers New Canvas… even with no canvases yet, and it is not a tab id', () => {
    // The discoverability case: with the group hidden or the row missing, the
    // origination canvas has exactly one entry point (⌘K) and a user who has
    // never made one has no reason to look for it there.
    const g = canvasExplorerGroup({ names: [], skipped: [] });
    expect(g.items).toEqual([{ id: NEW_CANVAS_ITEM_ID, label: 'New Canvas…', hint: 'new', action: true }]);
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

describe('canvasExplorerGroup — the import entry', () => {
  it('offers Import Art Sheet beside New Canvas for a classic project', () => {
    const g = canvasExplorerGroup({ names: [], skipped: [] }, { classic: true });
    expect(g.items.map((i) => i.id)).toEqual([NEW_CANVAS_ITEM_ID, IMPORT_SHEET_ITEM_ID]);
  });

  it('omits it for aeon — the tile/block/chunk ladder it commits into is classic', () => {
    const g = canvasExplorerGroup({ names: [], skipped: [] });
    expect(g.items.some((i) => i.id === IMPORT_SHEET_ITEM_ID)).toBe(false);
  });

  it('keeps both entry points ABOVE the canvas listing, so they are always visible', () => {
    // A "New…" row that sorts below fifty canvases is a row nobody scrolls to.
    const g = canvasExplorerGroup({ names: ['a', 'b'], skipped: [] }, { classic: true });
    expect(g.items.slice(0, 2).map((i) => i.id)).toEqual([NEW_CANVAS_ITEM_ID, IMPORT_SHEET_ITEM_ID]);
  });
});

/**
 * UX-A4. Group headers counted every row, so the two verbs at the top of the
 * Canvases group counted as canvases: a project with ONE canvas read
 * "CANVASES 3". The count is about the things, not the verbs.
 */
describe('group counts report things, not actions', () => {
  it('does not count New Canvas… or Import Art Sheet…', () => {
    const g = canvasExplorerGroup({ names: ['sky'], skipped: [] }, { classic: true });
    expect(g.items).toHaveLength(3);      // both verbs plus the one canvas
    expect(countableItems(g)).toBe(1);
  });

  it('counts a badly-named file — it IS a canvas, just an unopenable one', () => {
    const g = canvasExplorerGroup({ names: ['sky'], skipped: ['9 bad name.png'] });
    expect(countableItems(g)).toBe(2);
  });

  it('reads zero for an empty group rather than counting its own verb', () => {
    expect(countableItems(canvasExplorerGroup({ names: [], skipped: [] }))).toBe(0);
  });
});
