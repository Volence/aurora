// Project-wide save (spec §10): every dirty-able surface (level docs, zone
// art, sprite docs, palettes) registers a Saver; Ctrl+S calls saveAll() and
// the shell reports the aggregate. Replaces mode-based save routing — the
// coordinator, not the active view, knows what needs saving.

export interface Saver {
  readonly id: string;
  isDirty(): boolean;
  /** Persist this surface's dirty state. Throw to report failure. */
  save(): Promise<void>;
}

export interface SaveAllResult {
  saved: string[];
  skipped: string[];
  failed: { id: string; message: string }[];
}

export class SaveCoordinator {
  private savers: Saver[] = [];

  register(s: Saver): void {
    if (this.savers.some((x) => x.id === s.id)) {
      throw new Error(`Saver '${s.id}' is already registered`);
    }
    this.savers.push(s);
  }

  unregister(id: string): void {
    this.savers = this.savers.filter((s) => s.id !== id);
  }

  /** Test support / project close. */
  clear(): void {
    this.savers = [];
  }

  anyDirty(): boolean {
    return this.savers.some((s) => s.isDirty());
  }

  /** Save every dirty saver in registration order; failures don't block the rest. */
  async saveAll(): Promise<SaveAllResult> {
    const result: SaveAllResult = { saved: [], skipped: [], failed: [] };
    for (const s of this.savers) {
      if (!s.isDirty()) {
        result.skipped.push(s.id);
        continue;
      }
      try {
        await s.save();
        result.saved.push(s.id);
      } catch (e) {
        result.failed.push({ id: s.id, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return result;
  }
}
