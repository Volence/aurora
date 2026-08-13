// The ONE re-render signal for undo/redo affordances. Every surface that shows
// history state — the toolbar's Undo/Redo buttons, the workspace header chips,
// the palette swatches an undo restores — re-renders through this hook.
//
// It replaces three separate repaint clocks that stores kept by hand
// (editorStore.historyVersion, classicLevelStore.historyTick,
// spriteStore.historyTick). Those had to be bumped at every call site that
// touched history, so a missed bump was a silently stale button; the hub already
// knows when a stack changed, so this derives the signal instead of maintaining it.

import { useSyncExternalStore } from 'react';
import { documentHistoryHub } from '../state/history-hub';

// Module-level, and subscribed at import time so it is the FIRST hub listener:
// the counter is therefore already advanced by the time React reads the snapshot
// for any component subscription registered later.
let version = 0;
documentHistoryHub.onChange(() => { version += 1; });

/** Re-renders the caller whenever any undo stack changes. */
export function useHistoryVersion(): number {
  return useSyncExternalStore(
    (cb) => documentHistoryHub.onChange(cb),
    () => version,
    () => version,
  );
}
