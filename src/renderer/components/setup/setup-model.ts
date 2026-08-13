// Pure model for the Project Setup tab (spec §7): ResolutionReport entries
// joined with the sidecar's path overrides → editable rows grouped by zone,
// plus the sidecar overrides that match no profile entry (typos — the report
// can't show them because resolution never asked about those keys). Edits are
// applied immutably onto the ProjectConfig, preserving every other channel.
// Zone grouping reuses the classic report-grouping helper (same key scheme).

import type { ResolutionReport, EntryStatus } from '../../../core/project/report';
import type { ProjectConfig } from '../../../core/project/mapping';
import { groupEntriesByZone } from '../classic/report-grouping';

export interface SetupRow {
  key: string;
  /** The path resolution used (or expected, when missing). */
  path: string;
  status: EntryStatus;
  detail?: string;
  /** The sidecar override currently applied to this key, null when stock. */
  override: string | null;
}

export interface SetupGroup {
  id: string;
  rows: SetupRow[];
  resolved: number;
  total: number;
}

export function buildSetupRows(
  report: ResolutionReport,
  config: ProjectConfig,
  zoneOrder: string[],
): { groups: SetupGroup[]; unknownOverrides: { key: string; path: string }[] } {
  const overrides = config.paths ?? {};
  const known = new Set(report.entries.map((e) => e.key));

  const groups: SetupGroup[] = groupEntriesByZone(report.entries, zoneOrder).map((g) => ({
    id: g.id,
    resolved: g.resolved,
    total: g.total,
    rows: g.entries.map((e) => ({
      key: e.key,
      path: e.path,
      status: e.status,
      ...(e.detail !== undefined ? { detail: e.detail } : {}),
      override: overrides[e.key] ?? null,
    })),
  }));

  const unknownOverrides = Object.entries(overrides)
    .filter(([key]) => !known.has(key))
    .map(([key, path]) => ({ key, path }));

  return { groups, unknownOverrides };
}

/**
 * Apply row edits onto the config: string sets an override, null / empty
 * string clears it. Returns a new config; every other field passes through.
 */
export function applyPathEdits(
  config: ProjectConfig,
  edits: Record<string, string | null>,
): ProjectConfig {
  const paths: Record<string, string> = { ...(config.paths ?? {}) };
  for (const [key, value] of Object.entries(edits)) {
    if (value === null || value === '') delete paths[key];
    else paths[key] = value;
  }
  const next: ProjectConfig = { ...config };
  if (Object.keys(paths).length > 0) next.paths = paths;
  else delete next.paths;
  return next;
}
