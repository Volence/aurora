// The one shape every undo history presents to the hub and the UI. Deliberately
// ARGUMENT-FREE: aeon's EditHistory takes an S4Level on every call, classic and
// sprite histories read/write their stores. Each concrete stack binds its own
// target at construction, so the hub can hold all three without knowing any of
// their data models (spec §4.1).
export interface UndoStack {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
  clear(): void;
  /** Subscribe to stack changes. Returns an unsubscribe function. */
  onChange(cb: () => void): () => void;
}
