// Adapts EditHistory (command model, needs an S4Level on every call) to the
// argument-free UndoStack the hub holds. The level supplier is re-read on every
// call rather than captured, because the store swaps level objects on act load.
//
// `raw` is the escape hatch for command EXECUTION: executeCommand still needs
// EditHistory.execute(cmd, level), which is not part of the UndoStack contract.

import type { AnyCommand, S4Level } from './commands';
import type { EditHistory } from './history';
import type { UndoStack } from './undo-stack';

export class BoundEditHistory implements UndoStack {
  constructor(
    private readonly history: EditHistory,
    private readonly getLevel: () => S4Level | null,
  ) {}

  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }

  undo(): void {
    const level = this.getLevel();
    if (level) this.history.undo(level);
  }

  redo(): void {
    const level = this.getLevel();
    if (level) this.history.redo(level);
  }

  clear(): void { this.history.clear(); }

  onChange(cb: () => void): () => void { return this.history.onChange(cb); }

  /** Command execution needs the raw history; undo/redo must not. */
  execute(command: AnyCommand): void {
    const level = this.getLevel();
    if (level) this.history.execute(command, level);
  }

  get raw(): EditHistory { return this.history; }
}
