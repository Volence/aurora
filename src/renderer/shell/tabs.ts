// The one place that builds/parses tab ids for the shell. Level tab ids are
// 'level:<zone>:<act>' — the same doc-id convention core/shell/session.ts
// documents — where <act> is a classic act NUMBER ('1') or an aeon act id
// ('act1'). Consumers parse with parseLevelTabId and then interpret <act>
// against whichever project kind is open (a window holds one project).

import type { ZoneActRef } from '../../core/project/adapter';
import type { TabDescriptor } from '../../core/shell/session';

export const PROJECT_SETUP_TAB: TabDescriptor = {
  id: 'tool:project-setup',
  kind: 'tool',
  title: 'Project Setup',
};

export function classicLevelTab(ref: ZoneActRef): TabDescriptor {
  return { id: `level:${ref.zone}:${ref.act}`, kind: 'level', title: ref.label };
}

export function aeonLevelTab(zoneId: string, zoneName: string, actId: string): TabDescriptor {
  return { id: `level:${zoneId}:${actId}`, kind: 'level', title: `${zoneName} · ${actId}` };
}

export function parseLevelTabId(id: string): { zone: string; act: string } | null {
  if (!id.startsWith('level:')) return null;
  const rest = id.slice('level:'.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { zone: rest.slice(0, sep), act: rest.slice(sep + 1) };
}
