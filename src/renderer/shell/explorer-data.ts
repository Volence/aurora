// Builders: project snapshots → ExplorerGroupModel[]. Pure functions over
// plain inputs so the group shapes are unit-testable; the Explorer component
// supplies store data and routes item-id prefixes to actions. Stage 2 renders
// only groups with live data sources (spec §3, no dead chrome): Level Art /
// Palettes / UI & Screens arrive with Stages 3–4.

import type { ZoneActRef } from '../../core/project/adapter';
import type { RecentProject } from '../../shared/ipc-types';
import type { ExplorerGroupModel } from '../../core/shell/explorer';
import { PROJECT_SETUP_TAB } from './tabs';

export interface ClassicObjectRow {
  id: number;
  name: string;
  hex: string;
  /** Has resolvable sprite art (only linked objects are listed — Stage 2's
   *  library is the art-editable catalog; the full definition view is Stage 4). */
  linked: boolean;
}

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

export function classicExplorerGroups(
  zoneTree: ZoneActRef[],
  objects: ClassicObjectRow[],
  levelDocReady: boolean,
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
      items: objects
        .filter((o) => o.linked)
        .map((o) =>
          levelDocReady
            ? { id: `obj:${o.id}`, label: o.name, hint: o.hex }
            : {
                id: `obj:${o.id}`, label: o.name, hint: o.hex,
                disabled: true, reason: 'Open a level first (art preview needs its palette)',
              },
        ),
    },
    TOOLS_GROUP,
  ];
}

export function aeonExplorerGroups(
  zones: { id: string; name: string; acts: { id: string }[] }[],
): ExplorerGroupModel[] {
  return [
    {
      id: 'levels',
      label: 'Levels',
      items: zones.flatMap((z) =>
        z.acts.map((a) => ({ id: `level:${z.id}:${a.id}`, label: `${z.name} · ${a.id}` })),
      ),
    },
    TOOLS_GROUP,
  ];
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
