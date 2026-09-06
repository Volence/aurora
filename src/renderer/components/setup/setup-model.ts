// Pure model for the Project Setup tab (spec §7): ResolutionReport entries
// joined with the sidecar's path overrides → editable rows grouped by zone,
// plus the sidecar overrides that match no profile entry (typos — the report
// can't show them because resolution never asked about those keys). Edits are
// applied immutably onto the ProjectConfig, preserving every other channel.
// Zone grouping reuses the classic report-grouping helper (same key scheme).

import type { ResolutionReport, EntryStatus } from '../../../core/project/report';
import type { ProjectConfig, SidecarState } from '../../../core/project/mapping';
import { serializeProjectConfig, sidecarMayBeOverwritten, sidecarRefusalMessage } from '../../../core/project/mapping';
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

/** Keys whose edited value differs from the sidecar's current override ('' = cleared).
 *  Compares against config.paths directly (NOT report rows) so removing an
 *  unknown override — a key no report row carries — still counts as pending. */
export function pendingEditCount(config: ProjectConfig, edits: Record<string, string>): number {
  return Object.keys(edits).filter((k) => edits[k] !== (config.paths?.[k] ?? '')).length;
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

// ---------------------------------------------------------------------------
// Apply — the second writer of `.aurora/project.json`
// ---------------------------------------------------------------------------

/**
 * What Apply should do with the user's edits. Extracted out of ProjectSetupTab
 * because the decision is the part worth testing and a React component is the
 * part this repo cannot render in a test (there is no @testing-library/react
 * here) — a writer with no reachable test is how the open-time seed destroyed
 * files for as long as it did.
 */
export type SetupWritePlan =
  | { kind: 'write'; config: ProjectConfig; bytes: Uint8Array }
  | { kind: 'refused'; reason: string };

/**
 * Merge the tab's edits onto the sidecar and produce the bytes Apply writes.
 * `''` clears an override (the tab's spelling for "back to stock").
 *
 * REFUSES an unreadable sidecar, the same gate the open-time seed passes
 * (classicProjectStore) and for the same reason. `sidecar.config` is `{}` in
 * that case — not because the file is empty but because Aurora could not read
 * it — so `applyPathEdits` merges the user's one edit onto NOTHING and this
 * function would hand the tab a complete document containing only that edit.
 * Apply then writes it over a file still holding every other override.
 *
 * The gate lives HERE, in the planner, rather than only as a disabled button:
 * a guard each surface writes for itself passes whenever both are wrong
 * together, and the button is the surface most likely to be bypassed by a
 * future caller. The tab disables Apply as well, so the user is told before
 * clicking rather than after.
 */
export function planSetupSidecarWrite(
  sidecar: SidecarState,
  edits: Record<string, string>,
): SetupWritePlan {
  if (!sidecarMayBeOverwritten(sidecar)) {
    return { kind: 'refused', reason: sidecarRefusalMessage('your path overrides') };
  }
  const editMap: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(edits)) editMap[k] = v === '' ? null : v;
  const config = applyPathEdits(sidecar.config, editMap);
  return { kind: 'write', config, bytes: serializeProjectConfig(config) };
}
