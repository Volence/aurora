// Adapts EditHistory (command model, needs an S4Level on every call) to the
// argument-free UndoStack the hub holds. The level supplier is re-read on every
// call rather than captured, because the store swaps level objects on act load.

import type { AnyCommand, S4Level } from './commands';
import type { EditHistory } from './history';
import type { UndoStack } from './undo-stack';

export class BoundEditHistory implements UndoStack {
  constructor(
    private readonly history: EditHistory,
    private readonly getLevel: () => S4Level | null,
    /**
     * Notified with every command this stack applies or reverts. undo()/redo()
     * are argument-free (the UndoStack contract), so they cannot hand the moved
     * command back to their caller — without this hook the renderer-cache
     * invalidation that repaints after an undo would simply be lost.
     */
    private readonly onCommand: (command: AnyCommand) => void = () => {},
  ) {}

  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }

  undo(): void {
    const level = this.getLevel();
    if (!level) return;
    const command = this.history.undo(level);
    if (command) this.onCommand(command);
  }

  redo(): void {
    const level = this.getLevel();
    if (!level) return;
    const command = this.history.redo(level);
    if (command) this.onCommand(command);
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
    this.onCommand(command);
  }
}
