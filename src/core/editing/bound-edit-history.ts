// Adapts EditHistory (command model, needs an S4Level on every call) to the
// argument-free UndoStack the hub holds. The level supplier is re-read on every
// call rather than captured, because the store swaps level objects on act load.

import type { AnyCommand, S4Level } from './commands';
import type { EditHistory } from './history';
import type { UndoStack } from './undo-stack';

/**
 * Which way a command just moved through the history: freshly applied, reverted
 * by an undo, or re-applied by a redo. `execute` and `redo` are NOT merged: the
 * caller of execute already accounts for its own edit, and a redo has no such
 * caller, so a listener has to be able to tell them apart.
 */
export type EditDirection = 'execute' | 'undo' | 'redo';

export class BoundEditHistory implements UndoStack {
  constructor(
    private readonly history: EditHistory,
    private readonly getLevel: () => S4Level | null,
    /**
     * Notified with every command this stack applies or reverts. undo()/redo()
     * are argument-free (the UndoStack contract), so they cannot hand the moved
     * command back to their caller — without this hook the renderer-cache
     * invalidation that repaints after an undo would simply be lost.
     *
     * WHICH DIRECTION, as a second argument, because the repaint does not care
     * and the DIRTY FLAG does. A stack that only says "a command moved" cannot
     * tell the store whether the document just gained an edit or gave one back,
     * so the dot could only ever be turned on — undoing to the saved point left
     * it standing (packet docs/reviews/2026-09-09-save-contract.md, receipt R5).
     * Defaulted callers keep working; the parameter is optional on the callback
     * so an existing `(command) => …` still type-checks.
     */
    private readonly onCommand: (
      command: AnyCommand, direction: EditDirection,
    ) => void = () => {},
  ) {}

  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }

  undo(): void {
    const level = this.getLevel();
    if (!level) return;
    const command = this.history.undo(level);
    if (command) this.onCommand(command, 'undo');
  }

  redo(): void {
    const level = this.getLevel();
    if (!level) return;
    const command = this.history.redo(level);
    if (command) this.onCommand(command, 'redo');
  }

  clear(): void { this.history.clear(); }

  onChange(cb: () => void): () => void { return this.history.onChange(cb); }

  /**
   * Apply a command and record it. `level` overrides the bound supplier for the
   * command path, whose callers already hold the level they built the command
   * against (the agent handler builds commands against its own context level).
   */
  execute(command: AnyCommand, level?: S4Level): void {
    const target = level ?? this.getLevel();
    if (!target) return;
    this.history.execute(command, target);
    this.onCommand(command, 'execute');
  }
}
