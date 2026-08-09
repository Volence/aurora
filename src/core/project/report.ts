// ResolutionReport — the per-project accounting of which expected files an
// adapter's detect/open resolved, which are missing, and which resolved
// ambiguously (multiple candidates). Adapters build one of these while opening a
// project so the UI can render a "what did/didn't load" summary without the
// adapter having to invent its own reporting shape each time.
//
// This module is pure data + a tiny builder helper; it holds no fs/Electron
// dependencies and no adapter-specific knowledge.

export type EntryStatus = 'resolved' | 'missing' | 'ambiguous';

export interface ResolutionEntry {
  /** Stable logical name for the thing being resolved, e.g. 'layout' or 'objpos'. */
  key: string;
  /** The path that was resolved (or the path that was expected but missing). */
  path: string;
  status: EntryStatus;
  /** Optional human-readable note (e.g. why it was ambiguous). */
  detail?: string;
}

export interface ResolutionReport {
  entries: ResolutionEntry[];
  /** Count of entries whose status is 'resolved'. */
  resolved: number;
  /** Total number of entries. */
  total: number;
}

/**
 * Build a ResolutionReport from a list of entries, deriving the resolved/total
 * counts so callers can't let them drift out of sync with the entries.
 */
export function buildReport(entries: ResolutionEntry[]): ResolutionReport {
  let resolved = 0;
  for (const e of entries) {
    if (e.status === 'resolved') resolved++;
  }
  return { entries, resolved, total: entries.length };
}
