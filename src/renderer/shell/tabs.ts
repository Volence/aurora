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

// GUIDE TAB IDS — 'tool:guide:<slug>' — host the in-app help page
// (components/guide/GuideTab.tsx). Kind is `tool`, the kind PROJECT_SETUP_TAB
// already uses, so the shell's keep-alive pane renders it with no new TabKind:
// a guide is a read-only page with no document, no dirty state and no undo,
// which is exactly what `tool` means here.
//
// THE SLUG IS THE FILE STEM under docs/guides/, which is what makes the tab id
// stable across restarts: session restore reopens `tool:guide:effects-first-run`
// and `guideBySlug` finds the text with no extra mapping. It carries NO anchor —
// a deep link is where the reader ARRIVED, not what the tab IS, and baking it
// into the id would open a second tab per `?` button.
export const GUIDE_TAB_PREFIX = 'tool:guide:';

export function guideTab(slug: string, title: string): TabDescriptor {
  return { id: `${GUIDE_TAB_PREFIX}${slug}`, kind: 'tool', title };
}

export function parseGuideTabId(id: string): { slug: string } | null {
  if (!id.startsWith(GUIDE_TAB_PREFIX)) return null;
  const slug = id.slice(GUIDE_TAB_PREFIX.length);
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? { slug } : null;
}

export function isGuideTabId(id: string): boolean {
  return parseGuideTabId(id) !== null;
}

/** The act-scoped document id for a zone/act pair — also the level TAB id. */
export function levelDocId(zone: string, act: string): string {
  return `level:${zone}:${act}`;
}

export function classicLevelTab(ref: ZoneActRef): TabDescriptor {
  return { id: levelDocId(ref.zone, String(ref.act)), kind: 'level', title: ref.label };
}

export function aeonLevelTab(zoneId: string, zoneName: string, actId: string): TabDescriptor {
  return { id: levelDocId(zoneId, actId), kind: 'level', title: `${zoneName} · ${actId}` };
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

/**
 * The UNTITLED sprite document's tab id — "New Sprite…". This is the same
 * string spriteStore has always used for the document the editor holds before
 * any tab claims it (spriteStore re-exports it as UNTITLED_SPRITE_DOC_ID), so
 * the tab and the document are one and the same: undo, the dirty dot and the
 * close confirm all key off the tab id and find the right document with no
 * extra mapping.
 *
 * It deliberately does NOT parse as an engine-bound sprite-doc id, so it can
 * never collide with a real `doc:sprite:<engine>:<ref>` tab — which is also why
 * every "is this a sprite tab?" test must go through isSpriteDocTabId rather
 * than parseSpriteDocTabId alone.
 */
export const UNTITLED_SPRITE_TAB_ID = 'doc:sprite:untitled';

/** The "New Sprite…" tab: an empty aeon sprite document with no save-back
 *  target (Export in the sprite editor is how it becomes a real sprite). */
export function untitledSpriteTab(): TabDescriptor {
  return { id: UNTITLED_SPRITE_TAB_ID, kind: 'sprite-doc', title: 'Untitled Sprite' };
}

/** TRUE for any tab hosting the sprite editor — engine-bound OR untitled. The
 *  predicate every caller that only cares "is the sprite editor showing?" must
 *  use; parseSpriteDocTabId answers the narrower "which sprite does it load?". */
export function isSpriteDocTabId(id: string): boolean {
  return id === UNTITLED_SPRITE_TAB_ID || parseSpriteDocTabId(id) !== null;
}

// Canvas-doc tab ids — 'doc:canvas:<name>' — host the origination canvas
// (spec §4.1). <name> is the canvas's file stem under .aurora/canvas/, which is
// what makes the tab id stable across sessions: session restore reopens the tab
// and the activation glue loads that file. Kind is 'art-doc', the entry
// TAB_KINDS has always listed and nothing has claimed.
export function canvasDocTab(name: string): TabDescriptor {
  return { id: `doc:canvas:${name}`, kind: 'art-doc', title: `Canvas · ${name}` };
}

export function parseCanvasDocTabId(id: string): { name: string } | null {
  const m = /^doc:canvas:(.+)$/.exec(id);
  return m ? { name: m[1] } : null;
}

export function isCanvasDocTabId(id: string): boolean {
  return parseCanvasDocTabId(id) !== null;
}

// Zone-art doc ids — 'zoneart:<zone>'. Unlike the others this is NOT a tab id:
// zone art (chunks, blocks, tiles, palettes) is edited from act-scoped tabs but
// is zone-scoped data, so it owns its own undo document (spec §4.2). One zone's
// art stack is shared by every act tab of that zone, which is the point: a
// palette edit made from act 1 is undoable from act 2.
export function zoneArtDocId(zone: string): string {
  return `zoneart:${zone}`;
}

export function parseZoneArtDocId(id: string): { zone: string } | null {
  if (!id.startsWith('zoneart:')) return null;
  const zone = id.slice('zoneart:'.length);
  return zone.length > 0 ? { zone } : null;
}
