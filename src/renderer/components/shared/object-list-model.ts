// The row model both engines' object lists reduce to, plus the only logic worth
// testing in them. Deliberately store-free and engine-free: the classic list is
// 82 hardcoded S1 objects keyed by number, the aeon list is a project-declared
// library keyed by string, and neither fact belongs here.

/** One row. `key` is the engine's own id, stringified — never parsed back. */
export interface ObjectRow {
  readonly key: string;
  /** Short id chip: classic's '$1C', aeon's 'enemy'. */
  readonly badge: string;
  readonly label: string;
  /** Tooltip; falls back to `label` when absent. */
  readonly title?: string;
  /** True when this row has art to preview. The list draws a thumb slot for it
   *  and offers the secondary action; it never resolves the art itself. */
  readonly hasArt?: boolean;
}

/** Case-insensitive match over label, badge and key. Whitespace-trimmed, so a
 *  filter of spaces shows everything rather than nothing. */
export function filterRows(rows: readonly ObjectRow[], filter: string): ObjectRow[] {
  const q = filter.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (r) =>
      r.label.toLowerCase().includes(q) ||
      r.badge.toLowerCase().includes(q) ||
      r.key.toLowerCase().includes(q),
  );
}
