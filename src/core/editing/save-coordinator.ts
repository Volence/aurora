// Project-wide save (spec §10): every dirty-able surface (level docs, zone
// art, sprite docs, palettes) registers a Saver; Ctrl+Shift+S calls saveAll()
// and the shell reports the aggregate. Replaces mode-based save routing — the
// coordinator, not the active view, knows what needs saving.
//
// Ctrl+S is NARROWER: save what the user is looking at, and nothing else
// (writing a background document the user wasn't ready to commit is a real cost
// — these are build inputs). That routing is ALSO coordinator-owned: a saver
// declares an optional `scope` saying which tabs it owns and how to save just
// one of them, and saveActive() picks the single owner. No component learns
// about save targets.

/**
 * Active-document routing for Ctrl+S. A saver without a scope owns no tab and
 * therefore participates in saveAll() only.
 */
export interface SaverScope {
  /** True when this saver owns the work behind that tab id. First match wins. */
  owns(tabId: string): boolean;
  /** Honest per-tab dirtiness: is there anything to write for THAT tab? */
  isDirty(tabId: string): boolean;
  /** Persist just that tab's work. Throw to report failure. */
  save(tabId: string): Promise<void>;
}

export interface Saver {
  readonly id: string;
  isDirty(): boolean;
  /** Persist this surface's dirty state. Throw to report failure. */
  save(): Promise<void>;
  readonly scope?: SaverScope;
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

  /** The saver that owns a tab's work, or null (Home, tool tabs, unknown ids). */
  activeSaver(tabId: string | null): Saver | null {
    if (!tabId) return null;
    return this.savers.find((s) => s.scope?.owns(tabId)) ?? null;
  }

  /** True when Ctrl+S on that tab would actually write something — the ONE
   *  definition the app-bar Save button's enabledness reads. */
  canSaveActive(tabId: string | null): boolean {
    const s = this.activeSaver(tabId);
    return s !== null && s.scope!.isDirty(tabId!);
  }

  /**
   * Ctrl+S: save the active tab's document and nothing else. A tab no saver
   * owns is a no-op (never throws); an owned but clean tab is skipped.
   */
  async saveActive(tabId: string | null): Promise<SaveAllResult> {
    const result: SaveAllResult = { saved: [], skipped: [], failed: [] };
    const saver = this.activeSaver(tabId);
    if (!saver) return result;
    if (!saver.scope!.isDirty(tabId!)) {
      result.skipped.push(saver.id);
      return result;
    }
    try {
      await saver.scope!.save(tabId!);
      result.saved.push(saver.id);
    } catch (e) {
      result.failed.push({ id: saver.id, message: e instanceof Error ? e.message : String(e) });
    }
    return result;
  }
}
