// Builders: project snapshots → ExplorerGroupModel[]. Pure functions over
// plain inputs so the group shapes are unit-testable; the Explorer component
// supplies store data and routes item-id prefixes to actions. Only groups
// with live data sources render (spec §3, no dead chrome): aeon's Object
// Library (Task 15) and Canvases are live; Level Art / Palettes / UI & Screens
// are still pending.
//
// The Canvases group is the ONE exception to "no dead chrome", and deliberately:
// it renders with only its New Canvas… row in a project that has none, because
// it is the only place the origination canvas is discoverable and a group that
// appears once you already have one is a feature nobody finds. Every other group
// here lists something that exists independently of Aurora.

import type { ZoneActRef } from '../../core/project/adapter';
import type { RecentProject } from '../../shared/ipc-types';
import type { ExplorerGroupModel, ExplorerItemModel } from '../../core/shell/explorer';
import {
  s1ArtRowGroups, groupIdsHex, s1UnavailableRowNote,
} from '../../core/project/profiles/s1-object-presentation';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../core/project/profiles/s1-objects';
import { S1_NAMED_ART_DOCS } from '../../core/project/profiles/s1-object-art';
import { PROJECT_SETUP_TAB } from './tabs';

// Frozen: this singleton is spread into every classic/aeon groups() result, so
// an accidental mutation through one caller (e.g. a future in-place sort/push)
// would silently corrupt the Tools group everywhere else it's shared.
const TOOLS_GROUP: ExplorerGroupModel = Object.freeze({
  id: 'tools',
  label: 'Tools',
  items: Object.freeze([
    { id: PROJECT_SETUP_TAB.id, label: PROJECT_SETUP_TAB.title },
  ]),
});

/** The Explorer row that opens the New Canvas dialog. Its own item id (not a tab
 *  id) for the same reason NEW_SPRITE_ITEM_ID has one — the `doc:canvas:` branch
 *  must not swallow it. */
export const NEW_CANVAS_ITEM_ID = 'new-canvas';
/** Import a foreign PNG sheet into the open act. Classic only — the
 *  tile/block/chunk ladder it commits into is a classic notion. */
export const IMPORT_SHEET_ITEM_ID = 'import-sheet';

/**
 * The Canvases group, identical for both engines because a canvas has no engine
 * (see the ⌘K entry's comment). Present even when empty: it is the only place
 * the origination canvas is discoverable, and a group that appears only once you
 * already have one is a feature nobody finds.
 *
 * `skipped` files are LISTED AS DISABLED ROWS rather than dropped. `.aurora/canvas`
 * is a directory users are expected to hand-populate (dropping an Aseprite
 * export in is a supported way to get art into Aurora), and a file that vanishes
 * from a listing with no explanation is indistinguishable from data loss —
 * `listCanvasNames` computes `skipped` for exactly this and says so in its own
 * doc comment. The row says what to do: the name, not the file, is the problem.
 */
export function canvasExplorerGroup(
  listing: { names: string[]; skipped: string[] },
  opts: { classic?: boolean } = {},
): ExplorerGroupModel {
  return {
    id: 'canvases',
    label: 'Canvases',
    items: [
      { id: NEW_CANVAS_ITEM_ID, label: 'New Canvas…', hint: 'new', action: true },
      // Sits beside New Canvas because it is the OTHER way art gets in, and the
      // command palette was its only home — a feature reachable solely by a
      // keystroke nobody has been told about is a feature nobody finds. Classic
      // only, matching the ⌘K entry's gate.
      ...(opts.classic ? [{ id: IMPORT_SHEET_ITEM_ID, label: 'Import Art Sheet…', hint: 'import', action: true }] : []),
      ...listing.names.map((n) => ({ id: `doc:canvas:${n}`, label: n })),
      ...listing.skipped.map((f) => ({
        id: `canvas-skipped:${f}`,
        label: f,
        disabled: true,
        reason:
          'Aurora cannot open this file because of its NAME (letters, digits, - and _ only, '
          + 'starting with a letter or digit). Rename it and it will appear as a canvas.',
      })),
    ],
  };
}

/**
 * The classic Object Library's rows: EVERY named object, in two blocks.
 *
 * FIRST the objects whose art this zone actually loads — `s1ArtRowGroups(zone)`,
 * the resolveObjectArt hits (zone map ∪ zone-free base map), deduped by link
 * identity so the five shared-link Eggman ids read as one "Eggman (Boss)" row
 * whose hint carries the covered ids. Then a heading divider, then THE REST of
 * the registry: rows this zone's Pattern Load Cues never feed (or that no
 * table links at all), listed disabled with the honest per-row note from
 * `s1UnavailableRowNote` — visible because the catalog is the whole game's,
 * not the open act's, but not clickable because there is no art doc to open
 * here. The split is derived from the same table `resolveObjectArt` reads;
 * nothing is hardcoded.
 */
export function classicObjectLibraryItems(
  zone: string | null,
  levelDocReady: boolean,
): ExplorerItemModel[] {
  const groups = s1ArtRowGroups(zone ?? undefined);
  const linkedIds = new Set(groups.flatMap((g) => g.ids));
  const available: ExplorerItemModel[] = groups.map((g) => {
    const hint = g.ids.length > 1 ? groupIdsHex(g) : s1ObjectHex(g.id);
    // ZONE-FREE rows (objectArtIsZoneFree — Ring, the bosses, Sonic: one
    // shared art file no zone map redefines) open genuinely level-free: the
    // checkout resolves their link from the base map and seeds the palette
    // from disk (checkoutPaletteLine's zone-free fallback). Only zone-scoped
    // rows still need an open act for their zone context.
    return levelDocReady || g.zoneFree
      ? { id: `obj:${g.id}`, label: g.label, hint }
      : {
          id: `obj:${g.id}`, label: g.label, hint,
          disabled: true, reason: 'Open a level first (art preview needs its palette)',
        };
  });
  // NAMED art docs (S1_NAMED_ART_DOCS — maps files with no object id of their
  // own, e.g. Map_BossItems): listed after the object rows, opened through the
  // existing `doc:sprite:` Explorer branch. Zone-free by construction, so
  // never gated on an open level.
  const namedDocs: ExplorerItemModel[] = Object.entries(S1_NAMED_ART_DOCS).map(([key, d]) => ({
    // Raw-grid rows (Parcel C) have no mappings file — disclose the model.
    id: `doc:sprite:s1:${key}`, label: d.name, hint: d.link.rawGrid ? 'tiles' : 'maps',
  }));
  const rest: ExplorerItemModel[] = S1_OBJECT_LIST
    .filter((o) => !linkedIds.has(o.id))
    .map((o) => ({
      id: `obj:${o.id}`, label: o.name, hint: s1ObjectHex(o.id),
      disabled: true, reason: s1UnavailableRowNote(o.id, zone),
    }));
  if (rest.length === 0) return [...available, ...namedDocs];
  const heading: ExplorerItemModel = {
    id: 'objlib:unavailable',
    label: zone !== null ? `Not loaded in ${zone.toUpperCase()}` : 'Needs an open act',
    heading: true,
  };
  return [...available, ...namedDocs, heading, ...rest];
}

export function classicExplorerGroups(
  zoneTree: ZoneActRef[],
  zone: string | null,
  levelDocReady: boolean,
  canvases: { names: string[]; skipped: string[] },
): ExplorerGroupModel[] {
  return [
    {
      id: 'levels',
      label: 'Levels',
      items: zoneTree.map((r) =>
        r.available
          ? { id: `level:${r.zone}:${r.act}`, label: r.label }
          : { id: `level:${r.zone}:${r.act}`, label: r.label, disabled: true, reason: r.reason ?? 'unavailable' },
      ),
    },
    {
      id: 'objects',
      label: 'Object Library',
      items: classicObjectLibraryItems(zone, levelDocReady),
    },
    canvasExplorerGroup(canvases, { classic: true }),
    TOOLS_GROUP,
  ];
}

export interface AeonObjectRow { id: string; name: string; sprite: string | undefined }

/** The Object Library row that opens an empty sprite document. Its own item id
 *  (not a tab id) so the Explorer's `doc:sprite:` branch can't swallow it. */
export const NEW_SPRITE_ITEM_ID = 'new-sprite';

/**
 * Which saved sprite an aeon object def is bound to, or undefined for none.
 *
 * TWO sources, deliberately ranked. `bindings` is the editor-side sidecar
 * (`sprites/object-bindings.json`) that the Objects facet's "Preview sprite"
 * dropdown writes — the only binding UI there is, and the only one Aurora may
 * write, since objects.json is hand-authored alongside the object's assembly.
 * `ObjectDef.sprite` is that hand-edited escape hatch, kept as the fallback so
 * anything already declared in JSON keeps working.
 *
 * An empty-string binding (a stale sidecar; the writer deletes rather than
 * blanks) falls through to the fallback rather than reading as "bound to ''".
 */
export function resolveObjectSprite(
  o: { id: string; sprite?: string },
  bindings: Record<string, string>,
): string | undefined {
  return bindings[o.id] || o.sprite;
}

export function aeonExplorerGroups(
  zones: { id: string; name: string; acts: { id: string }[] }[],
  objects: AeonObjectRow[],
  canvases: { names: string[]; skipped: string[] },
): ExplorerGroupModel[] {
  const groups: ExplorerGroupModel[] = [
    {
      id: 'levels',
      label: 'Levels',
      items: zones.flatMap((z) =>
        z.acts.map((a) => ({ id: `level:${z.id}:${a.id}`, label: `${z.name} · ${a.id}` })),
      ),
    },
  ];
  if (objects.length > 0) {
    groups.push({
      id: 'objects',
      label: 'Object Library',
      items: [
        // FIRST, and always enabled: in a project whose objects are all still
        // unbound every row below is greyed, and the sprite editor is otherwise
        // unreachable — nothing opens a sprite-doc tab without a binding, and
        // Export (which creates the sprite the binding would point at) lives
        // inside that editor. This row breaks that circle.
        { id: NEW_SPRITE_ITEM_ID, label: 'New Sprite…', hint: 'new', action: true },
        ...objects.map((o) =>
          o.sprite
            ? { id: `doc:sprite:aeon:${o.sprite}`, label: o.name }
            : { id: `doc:sprite:aeon:${o.id}`, label: o.name, disabled: true, reason: 'no sprite bound' },
        ),
      ],
    });
  }
  groups.push(canvasExplorerGroup(canvases));
  groups.push(TOOLS_GROUP);
  return groups;
}

export function noProjectExplorerGroups(recents: RecentProject[]): ExplorerGroupModel[] {
  if (recents.length === 0) return [];
  return [
    {
      id: 'recents',
      label: 'Recent Projects',
      items: recents.map((r) => ({ id: `recent:${r.path}`, label: r.name, hint: r.path })),
    },
  ];
}
