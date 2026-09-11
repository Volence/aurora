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
  /**
   * A DIVIDER inside a group — a label over the rows after it, not a row
   * itself (classic's Object Library uses one between the objects this zone's
   * cues load and the rest). Never activatable, never counted, and dropped
   * while a filter is active: the filtered view interleaves survivors from
   * both sides, so a stranded divider would mislabel whatever happens to
   * follow it.
   */
  heading?: boolean;
}

/** The rows a group's count should report: the things — not the verbs, not the dividers. */
export function countableItems(group: ExplorerGroupModel): number {
  return group.items.reduce((n, i) => n + (i.action || i.heading ? 0 : 1), 0);
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
      // Headings drop out under a filter (see ExplorerItemModel.heading) —
      // matching one by its own label would show a divider with no rows.
      (i) => !i.heading && (i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q)),
    );
    if (items.length > 0) out.push({ ...g, items });
  }
  return out;
}

/**
 * WHAT THE EXPLORER SHOWS WHEN THE TREE IS EMPTY — and, specifically, whether
 * the no-project call to action is on screen.
 *
 * UX SEAT B, FINDING F5: on the cold Home screen the sidebar's ONLY control is
 * the `Open Project…` button in its empty state. Typing three characters into
 * the `Filter…` box above it deleted that button and put `No matches` where it
 * had been; the box carries no clear affordance, so getting it back cost three
 * Backspaces on a control the filter had no business removing
 * (docs/reviews/2026-09-07-lens-ux/uxb-audit.md, F5).
 *
 * THE RULE, and it is one sentence: a filter narrows the TREE, and the way out
 * of the empty state is not part of the tree. `openProject` therefore never
 * consults the query. The old condition did — it was
 * `filtered.length === 0 && query.trim() === '' && noProject`, written inline in
 * Explorer.tsx — and the `query.trim() === ''` term is the whole defect.
 *
 * `noMatches` is UNCHANGED and deliberately not folded into the above: when a
 * filter is active and matched nothing, saying so is the honest report, and
 * dropping it to make room for the button would trade one silence for another.
 * The two are independent, so both can be true at once — and on the cold Home
 * screen with a filter typed, both ARE.
 *
 * THE SENTENCE, decided later (the census's B-F5 wording half, 2026-09-11).
 * Seat B also read `No matches` as misdescribing the no-project state: "with no
 * project open there is nothing to match". True whenever the no-project tree is
 * empty before the filter runs, which is the cold Home of a first launch. With
 * no project open the tree lists only Recent Projects, so the true report
 * depends on whether there was anything to narrow:
 *
 *   project open, filter matched nothing   `No matches` (unchanged, and true)
 *   no project, recents listed, none match  `No recent project matches`
 *   no project, nothing listed at all       `No project is open, so there is nothing to filter`
 *
 * That third case is why the rule takes the UNFILTERED group count: from the
 * filtered count alone, "matched nothing" and "there was nothing" look the
 * same. The text lives here, beside the condition that selects it, so the
 * component cannot pick a sentence the rule did not choose.
 */
export const EXPLORER_NO_MATCHES = 'No matches';
export const EXPLORER_NO_RECENT_MATCHES = 'No recent project matches';
export const EXPLORER_NOTHING_TO_FILTER = 'No project is open, so there is nothing to filter';

export interface ExplorerEmptyState {
  /** The active filter matched nothing. Only ever true while a filter is set. */
  noMatches: boolean;
  /** What to say when `noMatches`: one of the three constants above. Null otherwise. */
  message: string | null;
  /** Offer the way out of the no-project state. NEVER suppressed by a filter. */
  openProject: boolean;
}

export function explorerEmptyState(
  filteredGroupCount: number, query: string, noProject: boolean, unfilteredGroupCount: number,
): ExplorerEmptyState {
  const treeIsEmpty = filteredGroupCount === 0;
  const noMatches = treeIsEmpty && query.trim() !== '';
  let message: string | null = null;
  if (noMatches) {
    if (!noProject) message = EXPLORER_NO_MATCHES;
    else message = unfilteredGroupCount > 0 ? EXPLORER_NO_RECENT_MATCHES : EXPLORER_NOTHING_TO_FILTER;
  }
  return {
    noMatches,
    message,
    openProject: treeIsEmpty && noProject,
  };
}
