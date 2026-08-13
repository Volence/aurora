// The re-render signals for undo/redo affordances and for history-driven
// repaint. Every surface that shows history state — the toolbar's Undo/Redo
// buttons, the workspace header chips, the palette swatches an undo restores —
// re-renders through one of the two hooks here.
//
// They replace three separate repaint clocks that stores kept by hand
// (editorStore.historyVersion, classicLevelStore.historyTick,
// spriteStore.historyTick). Those had to be bumped at every call site that
// touched history, so a missed bump was a silently stale button; the hub already
// knows when a stack changed, so this derives the signal instead of maintaining it.
//
// TWO hooks, because "a stack changed" and "MY document's stack changed" are
// different questions:
//
//  • useHistoryVersion()      — any document. For affordances that speak for
//    whatever has focus (Toolbar, TabStrip, LevelWorkspace) and for cheap panels.
//  • useAeonHistoryVersion()  — only the aeon documents the level view renders.
//    For the surfaces whose re-render rebuilds an expensive cache: a tileset
//    thumbnail atlas (one OffscreenCanvas per tile), a full section prerender,
//    a composer pixel buffer. Those must not be rebuilt because a sprite
//    document or a background act tab moved its undo pointer — which is exactly
//    what the single global signal made them do, where the store clock they used
//    before (editorStore.historyVersion) only ever ticked for aeon commands.

import { useCallback, useSyncExternalStore } from 'react';
import { documentHistoryHub } from '../state/history-hub';
import { useProjectStore } from '../state/projectStore';
import { levelDocId, zoneArtDocId } from '../shell/tabs';

// Module-level, and subscribed at import time so it is the FIRST hub listener:
// the counters are therefore already advanced by the time React reads a snapshot
// for any component subscription registered later.
let version = 0;
const perDoc = new Map<string, number>();
documentHistoryHub.onChange((docId) => {
  version += 1;
  perDoc.set(docId, (perDoc.get(docId) ?? 0) + 1);
});

/** The change count for one document (0 until its stack first changes). */
export function historyVersionOf(docId: string): number {
  return perDoc.get(docId) ?? 0;
}

/**
 * Sum of the given documents' change counts — monotonic, so it is a valid
 * useSyncExternalStore snapshot: it changes if and only if one of them changed.
 */
export function historyVersionOfAll(docIds: readonly string[]): number {
  let total = 0;
  for (const id of docIds) total += perDoc.get(id) ?? 0;
  return total;
}

/** Re-renders the caller whenever ANY undo stack changes. */
export function useHistoryVersion(): number {
  return useSyncExternalStore(
    (cb) => documentHistoryHub.onChange(cb),
    () => version,
    () => version,
  );
}

/**
 * Re-renders the caller only when one of `docIds` changes. `key` must uniquely
 * identify the id list — it is what keeps the subscribe/snapshot closures stable
 * across renders (an unstable `subscribe` makes React re-subscribe every render).
 */
function useScopedHistoryVersion(docIds: readonly string[], key: string): number {
  /* eslint-disable react-hooks/exhaustive-deps -- `key` stands in for docIds' contents */
  const subscribe = useCallback(
    (cb: () => void) => documentHistoryHub.onChange((changed) => {
      if (docIds.includes(changed)) cb();
    }),
    [key],
  );
  const snapshot = useCallback(() => historyVersionOfAll(docIds), [key]);
  /* eslint-enable react-hooks/exhaustive-deps */
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Re-renders the caller when either aeon document behind the current level view
 * changes: the act's layout stack and the zone's art stack. Every aeon command
 * lands on one of those two — executeCommand routes by the focused facet
 * (ZONE_ART_FACETS → zoneart:, else the act tab) and executeAmbientCommand by
 * command scope, both resolved against the same projectStore zone/act this hook
 * reads — so this is a strict narrowing of the global signal, never a
 * widening: it drops sprite documents and background act tabs and nothing else.
 */
export function useAeonHistoryVersion(): number {
  const zoneId = useProjectStore((s) => s.currentZoneId);
  const actId = useProjectStore((s) => s.currentActId);
  const key = `${zoneId ?? ''}|${actId ?? ''}`;
  const docIds: string[] = [];
  if (zoneId) {
    docIds.push(zoneArtDocId(zoneId));
    if (actId) docIds.push(levelDocId(zoneId, actId));
  }
  return useScopedHistoryVersion(docIds, key);
}
