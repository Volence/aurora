// Pure presentation logic for the resolution report: bucket a flat
// ResolutionReport's entries by their owning zone. Extracted from a component so
// it can be unit-tested without a DOM. Its one consumer is now the Project Setup
// tab (setup/setup-model.ts), which groups the same entries into editable
// path-override rows; the read-only ResolutionReportPanel it was written for was
// deleted once Setup was shown to cover everything it rendered.

import type { ResolutionEntry } from '../../../core/project/report';

export interface ReportGroup {
  /** Zone id, or 'global' for entries not owned by a zone (e.g. collision tables). */
  id: string;
  entries: ResolutionEntry[];
  resolved: number;
  total: number;
}

/**
 * Group resolution entries by owning zone. An entry key is `<zone>.actN.<field>`
 * for act-owned entries or a flat key (e.g. `collision.normal`) for globals;
 * any entry whose leading segment isn't a known zone id is bucketed under
 * 'global'. Groups are returned in `zoneOrder` (the order zones appear in the
 * tree), with the 'global' bucket last. Empty zones are omitted.
 */
export function groupEntriesByZone(entries: ResolutionEntry[], zoneOrder: string[]): ReportGroup[] {
  const zoneSet = new Set(zoneOrder);
  const byId = new Map<string, ResolutionEntry[]>();
  for (const e of entries) {
    const prefix = e.key.split('.')[0];
    const id = zoneSet.has(prefix) ? prefix : 'global';
    const list = byId.get(id);
    if (list) list.push(e);
    else byId.set(id, [e]);
  }
  const order = [...zoneOrder.filter((z) => byId.has(z)), ...(byId.has('global') ? ['global'] : [])];
  return order.map((id) => {
    const es = byId.get(id)!;
    const resolved = es.filter((e) => e.status === 'resolved').length;
    return { id, entries: es, resolved, total: es.length };
  });
}
