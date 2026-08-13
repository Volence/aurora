// Startup wiring for the DocumentHistoryHub: the ONE place that knows which
// doc-id prefix maps to which undo stack (and therefore to which store). The hub
// itself stays data-model agnostic (spec §4.1) — it only holds UndoStacks.
//
// Called explicitly at app bootstrap (App.tsx's runtime-wiring effect) rather
// than at import time, so importing a store never mutates hub state; the vitest
// setup calls it too, standing in for that bootstrap.
//
// Only the aeon `level:` prefix is registered so far. Classic and sprite
// factories land with the stacks they need.

import { BoundEditHistory } from '../../core/editing/bound-edit-history';
import { EditHistory } from '../../core/editing/history';
import { documentHistoryHub } from './history-hub';
import { useProjectStore, getActiveLevel } from './projectStore';

/**
 * Idempotent (App mount, HMR and tests may all call it): registerFactory
 * replaces by prefix, and re-registering never touches already-built stacks.
 */
export function registerHistoryFactories(): void {
  // The level supplier is re-read per call (not captured) because the project
  // store hands out a fresh S4Level object on every act load.
  documentHistoryHub.registerFactory(
    'level:',
    () => new BoundEditHistory(new EditHistory(), () => getActiveLevel(useProjectStore.getState())),
  );
}
