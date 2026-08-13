// Classic undo, split by document domain (spec §4.3). ClassicHistory used to
// snapshot the whole LevelDoc, which made per-document undo impossible: a
// palette edit and a layout stamp landed on one stack. The audit of all ten
// commit() sites found every one single-domain, so DirtyDomains' nine keys
// partition cleanly and each domain gets its own stack.
//
// Snapshots hold REFERENCES to the LevelDoc slices they own — the store treats
// the doc immutably (each command produces a new doc sharing unchanged
// sub-arrays), so this is cheap. Only the small mutable containers (the dirty
// object, the chunkVersions map) are cloned.
//
// No edit-seq stamps and no clearRedo: with per-document stacks there are no
// sibling stacks to invalidate, which is what retires the undo-bus.

import type { BlockDef, ChunkDef256, LayoutGrid } from '../level-classic/model';
import type { S1ObjectEntry } from '../formats/classic/s1-objpos';
import type { DirtyDomains } from '../project/adapter';
import type { UndoStack } from './undo-stack';

export const LAYOUT_DOMAINS = ['fg', 'bg', 'objects', 'start'] as const;
export const ART_DOMAINS = ['tiles', 'blocks', 'chunks', 'palette', 'colind'] as const;

/**
 * The dirty flags a document OWNS, dropped from the store-wide map. A snapshot
 * must never carry a flag it doesn't own: the two stacks are independent, so a
 * snapshot that captured the whole map would restore the OTHER document's flags
 * to whatever they happened to be when this document was last edited — wiping a
 * real unsaved edit and telling the UI there is nothing to save.
 */
export function pickDomainDirty(
  dirty: DirtyDomains,
  domains: readonly (keyof DirtyDomains)[],
): DirtyDomains {
  const out: DirtyDomains = {};
  for (const d of domains) if (dirty[d]) out[d] = true;
  return out;
}

/**
 * Replace exactly `domains`' flags from a snapshot, leaving the other document's
 * flags alone. Must both SET and CLEAR within its own domains — a plain merge
 * could only ever set, so undoing back to a pristine state would leave the
 * document permanently dirty.
 */
export function restoreDomainDirty(
  current: DirtyDomains,
  snapshot: DirtyDomains,
  domains: readonly (keyof DirtyDomains)[],
): DirtyDomains {
  const next = { ...current };
  for (const d of domains) {
    if (snapshot[d]) next[d] = true;
    else delete next[d];
  }
  return next;
}

export interface ClassicLayoutSnapshot {
  fg: LayoutGrid;
  bg: LayoutGrid;
  objects: S1ObjectEntry[];
  start: { x: number; y: number };
  /** LAYOUT_DOMAINS flags only (see pickDomainDirty / restoreDomainDirty). */
  dirty: DirtyDomains;
}

export interface ClassicArtSnapshot {
  chunks: ChunkDef256[];
  blocks: BlockDef[];
  tiles: Uint8Array;
  palettes: Uint16Array[];
  colind: Uint8Array;
  chunkVersions: Map<number, number>;
  chunkEpoch: number;
  /** ART_DOMAINS flags only (see pickDomainDirty / restoreDomainDirty). */
  dirty: DirtyDomains;
}

const MAX_DEPTH = 200;

/**
 * Shared machinery for both classic domain stacks. `read` returns the live slice,
 * `write` installs a restored one; the store supplies both, which is what makes
 * undo/redo argument-free.
 */
abstract class ClassicDomainHistory<S> implements UndoStack {
  private undoStack: S[] = [];
  private redoStack: S[] = [];
  private listeners: Array<() => void> = [];

  constructor(
    protected readonly read: () => S,
    protected readonly write: (snapshot: S) => void,
  ) {}

  protected abstract clone(s: S): S;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** Record the BEFORE snapshot of an edit. The store applies the edit itself. */
  record(before: S): void {
    this.undoStack.push(this.clone(before));
    if (this.undoStack.length > MAX_DEPTH) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.clone(this.read()));
    this.write(this.clone(prev));
    this.notify();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.clone(this.read()));
    this.write(this.clone(next));
    this.notify();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  private notify(): void { for (const l of this.listeners) l(); }
}

export class ClassicLayoutHistory extends ClassicDomainHistory<ClassicLayoutSnapshot> {
  protected clone(s: ClassicLayoutSnapshot): ClassicLayoutSnapshot {
    return {
      fg: s.fg,               // immutable by convention
      bg: s.bg,
      objects: s.objects,
      start: { ...s.start },
      dirty: { ...s.dirty },
    };
  }
}

export class ClassicArtHistory extends ClassicDomainHistory<ClassicArtSnapshot> {
  protected clone(s: ClassicArtSnapshot): ClassicArtSnapshot {
    return {
      chunks: s.chunks,       // immutable by convention
      blocks: s.blocks,
      tiles: s.tiles,
      palettes: s.palettes,
      colind: s.colind,
      chunkVersions: new Map(s.chunkVersions),
      chunkEpoch: s.chunkEpoch,
      dirty: { ...s.dirty },
    };
  }
}
