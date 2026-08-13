// The row model both engines' object lists reduce to, plus the only logic worth
// testing in them. Deliberately store-free and engine-free: the classic list is
// 82 hardcoded S1 objects keyed by number, the aeon list is a project-declared
// library keyed by string, and neither fact belongs here.

import type React from 'react';

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

/**
 * Everything `ObjectList` needs, supplied by a per-engine provider hook. The
 * component subscribes to NOTHING: the two engines repaint off different signals
 * (aeon mutates its project in place and ticks a version clock; classic swaps an
 * immutable doc), so the only repaint signal the neutral side may trust is the
 * explicit `versionKey` its port hands it.
 */
export interface ObjectListPort {
  readonly rows: readonly ObjectRow[];
  readonly selectedKey: string | null;
  /** Toggle semantics: selecting the already-selected row clears it. */
  select(key: string | null): void;
  /** Rendered in the thumb slot for rows with `hasArt`; null when the port has
   *  no art to show at all. */
  readonly Thumb: React.ComponentType<{ rowKey: string }> | null;
  /** Optional per-row secondary action (classic's "edit art" pencil). Offered
   *  only on rows with `hasArt`. */
  readonly secondaryAction?: {
    icon: string;
    title(row: ObjectRow): string;
    run(key: string): void;
  };
  /** Optional footer (aeon's sprite-binding select). */
  readonly Footer?: React.ComponentType;
  /** Props spread on the root element — classic uses this to claim its facet. */
  readonly rootProps?: React.HTMLAttributes<HTMLElement>;
  /** Shown when the port has no rows at all, as distinct from "no matches" for
   *  the current filter. Engine-flavoured wording, hence the port's to own. */
  readonly emptyMessage?: string;
  /** Changes when the rows or their art change; the list keys thumb renders on
   *  it so a repaint is forced without the neutral side knowing why. */
  readonly versionKey: string;
}
