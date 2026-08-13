// Startup wiring for the DocumentHistoryHub: the ONE place that knows which
// doc-id prefix maps to which undo stack (and therefore to which store). The hub
// itself stays data-model agnostic (spec §4.1) — it only holds UndoStacks.
//
// Called explicitly at app bootstrap (App.tsx's runtime-wiring effect) rather
// than at import time, so importing a store never mutates hub state; the vitest
// setup calls it too, standing in for that bootstrap.
//
// The sprite factory lands with the sprite doc history.

import { BoundEditHistory } from '../../core/editing/bound-edit-history';
import { ClassicArtHistory, ClassicLayoutHistory } from '../../core/editing/classic-domain-history';
import { EditHistory } from '../../core/editing/history';
import type { UndoStack } from '../../core/editing/undo-stack';
import { documentHistoryHub } from './history-hub';
import { useClassicProjectStore } from './classicProjectStore';
import {
  readArtSnapshot, readLayoutSnapshot, writeArtSnapshot, writeLayoutSnapshot,
} from './classicLevelStore';
import { useProjectStore, getActiveLevel } from './projectStore';

/**
 * Classic and aeon share the `level:` prefix (tabs.ts) — a classic act tab is
 * `level:ghz:1`, an aeon one `level:ojz:act1` — so the factory has to dispatch on
 * which project this window has open. Dispatching at stack-CONSTRUCTION time is
 * safe: a window holds exactly one project, and a project switch calls
 * hub.clearAll() (project-runtime), so no stack outlives the engine that made it.
 */
function classicIsOpen(): boolean {
  return useClassicProjectStore.getState().status === 'open';
}

// The level supplier is re-read per call (not captured) because the project
// store hands out a fresh S4Level object on every act load.
function aeonLevelHistory(): UndoStack {
  return new BoundEditHistory(new EditHistory(), () => getActiveLevel(useProjectStore.getState()));
}

/**
 * Idempotent (App mount, HMR and tests may all call it): registerFactory
 * replaces by prefix, and re-registering never touches already-built stacks.
 */
export function registerHistoryFactories(): void {
  // Act-scoped layout: classic's fg/bg/objects/start, or aeon's command history.
  documentHistoryHub.registerFactory('level:', () =>
    classicIsOpen()
      ? new ClassicLayoutHistory(readLayoutSnapshot, writeLayoutSnapshot)
      : aeonLevelHistory());

  // Zone-scoped art: classic's tiles/blocks/chunks/palette/colind. Aeon has no
  // zone-art document yet, so it falls back to a level command history rather
  // than throwing — the hub refuses to guess, and an unhandled prefix is worse
  // than an empty stack.
  documentHistoryHub.registerFactory('zoneart:', () =>
    classicIsOpen()
      ? new ClassicArtHistory(readArtSnapshot, writeArtSnapshot)
      : aeonLevelHistory());
}
