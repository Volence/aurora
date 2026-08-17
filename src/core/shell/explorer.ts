// Explorer tree model + filter rule (spec §3). Pure data — what the groups
// contain and how a query narrows them. The renderer builds group models from
// project state (renderer/shell/explorer-data.ts) and maps item ids to open
// actions; nothing here knows about stores, engines, or React.

export interface ExplorerItemModel {
  /** Routable id — the renderer switches on its prefix ('level:', 'obj:', 'tool:', 'recent:'). */
  id: string;
  label: string;
  /** Secondary text (hex id, path) — rendered monospace, also searchable. */
  hint?: string;
  disabled?: boolean;
  /** Tooltip when disabled (e.g. an act's missing-files reason). */
  reason?: string;
  /**
   * This row DOES something rather than naming something — "New Canvas…",
   * "Import Art Sheet…", "New Sprite…".
   *
   * The group headers count their items, and counting these made the number a
   * lie: a project with one canvas read "CANVASES 3", because the two verbs at
   * the top of the group counted as canvases. `countableItems` is the rule.
   */
  action?: boolean;
}

/** The rows a group's count should report: the things, not the verbs. */
export function countableItems(group: ExplorerGroupModel): number {
  return group.items.reduce((n, i) => n + (i.action ? 0 : 1), 0);
}

export interface ExplorerGroupModel {
  id: string;
  label: string;
  items: readonly ExplorerItemModel[];
}

/** Case-insensitive substring over label + hint; empty groups drop out.
 *  An empty/whitespace query returns the input array identity (no re-render churn). */
export function filterExplorer(groups: ExplorerGroupModel[], query: string): ExplorerGroupModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const out: ExplorerGroupModel[] = [];
  for (const g of groups) {
    const items = g.items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q),
    );
    if (items.length > 0) out.push({ ...g, items });
  }
  return out;
}
