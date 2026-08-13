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

// Sprite-doc tab ids — 'doc:sprite:<engine>:<ref>' — host the sprite editor.
// <engine> is 's1' (classic object-art checkout, <ref> = numeric object id) or
// 'aeon' (a saved library sprite, <ref> = its name). The App-level SpriteMode
// pane mounts only while one of these is the active tab (Task 14).
export function spriteDocTab(engine: 's1' | 'aeon', ref: string, title: string): TabDescriptor {
  return { id: `doc:sprite:${engine}:${ref}`, kind: 'sprite-doc', title };
}

export function parseSpriteDocTabId(id: string): { engine: 's1' | 'aeon'; ref: string } | null {
  const m = /^doc:sprite:(s1|aeon):(.+)$/.exec(id);
  return m ? { engine: m[1] as 's1' | 'aeon', ref: m[2] } : null;
}
