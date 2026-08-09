// classicLevelStore — the currently-open classic (Sonic 1) level: which act is
// selected, its loaded LevelDoc, per-domain dirty tracking, chunk content
// versions, and the classic editing commands on the shared undo history.
//
// READ PATH (Task 11): selecting an act calls `openAct`, which reads the LevelDoc
// through the ProjectHandle held in classicProjectStore (handle.levels.read(ref))
// and transitions loading → ready | error. That path is unchanged.
//
// EDITING (Task 12, spec §2.2): the eight `classic:*` commands below are pure,
// exported functions (MCP-addressable in Task 16, exactly like aeon's
// executeCommand). Each command:
//   • validates atomically BEFORE applying (rejects with a human message, no
//     partial mutation),
//   • builds a NEW doc immutably (unchanged sub-arrays are shared),
//   • marks its dirty domain(s),
//   • bumps chunk content versions where the edit changes rendered chunk art,
//   • records ONE undo step.
//
// UNDO INTEGRATION: classic editing joins the shared undo timeline as a SIBLING
// history (ClassicHistory), the same pattern sprite editing uses — see
// core/editing/classic-history.ts for the full rationale (the aeon EditHistory is
// hardcoded to S4Level and cannot carry a LevelDoc without refactoring aeon core;
// the repo's sanctioned way for a different data model to share one uniform Ctrl+Z
// is a sibling snapshot history on the neutral undo-bus + edit-seq). A classic and
// an aeon project are never open at once; within a classic session classic-level
// and (s1 object) sprite edits interleave by recency.

import { create } from 'zustand';
import type { DirtyDomains, EditableTileRange, LevelDoc, ZoneActRef } from '../../core/project/adapter';
import type { BlockDef, ChunkCell } from '../../core/level-classic/model';
import { validateLevelDoc, unpackChunkCell, chunkIndexForId } from '../../core/level-classic/model';
import type { S1ObjectEntry } from '../../core/formats/classic/s1-objpos';
import { ClassicHistory, type ClassicSnapshot } from '../../core/editing/classic-history';
import { registerRedoClearer, invalidateSiblingRedos } from '../../core/editing/undo-bus';
import { useClassicProjectStore } from './classicProjectStore';

export type ClassicLevelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Outcome of a classic editing command: applied, or atomically rejected. */
export type CommandResult = { ok: true } | { ok: false; error: string };

export type LayoutPlane = 'fg' | 'bg';

/**
 * The active layout-editing tool. `pan` navigates (drag = pan); `stamp` paints
 * the selected chunk (Task 13); `object` selects / moves / places / deletes
 * object placements (Task 14).
 */
export type ClassicTool = 'pan' | 'stamp' | 'object';

interface ClassicLevelState {
  /** The act currently selected in the zone tree (even while loading/errored). */
  ref: ZoneActRef | null;
  /** The loaded document, present only in the 'ready' state. */
  doc: LevelDoc | null;
  status: ClassicLevelStatus;
  /** Human-readable failure reason when status === 'error'. */
  error: string | null;

  /** Per-domain unsaved-change flags (adapter DirtyDomains shape). */
  dirty: DirtyDomains;
  /**
   * Per-chunk content version. The viewport caches offscreen chunk canvases keyed
   * by chunkId; keying additionally on this version lets a single-chunk edit
   * invalidate only that chunk. Values are drawn from a process-monotonic clock so
   * a (chunkEpoch, version) pair uniquely identifies a chunk's content across the
   * session. Undo/redo RESTORE the recorded version values, so the KEY a restored
   * chunk hashes to is exact/stable — but the viewport cache stores only the
   * latest canvas per chunk id, so an undo that reverts to an older key still
   * triggers a re-render (see ClassicLevelViewport's cache note). Correctness is
   * unaffected; it just isn't a zero-cost reuse.
   */
  chunkVersions: Map<number, number>;
  /**
   * A whole-library epoch bumped by edits that change EVERY chunk's rendered art
   * (block edits, tile-pixel edits, palette edits — chunk art bakes all three).
   * Cheaper than touching every per-chunk version. The viewport keys on
   * `${chunkEpoch}:${chunkVersions.get(id) ?? 0}`.
   */
  chunkEpoch: number;
  /** Bumped on every history change so undo/redo affordances re-evaluate. */
  historyTick: number;

  /**
   * Layout-editing UI state (Task 13, spec §3 M5). Not doc data and NOT part of
   * an undo snapshot: undo/redo restore the document, never the tool/selection.
   */
  tool: ClassicTool;
  /** The chunk id the stamp tool paints (0..255); also the eyedropper target. */
  selectedChunkId: number;
  /**
   * The object tool's current selection: an index into `doc.objects`, or null.
   * NOT part of an undo snapshot (UI state). Consumers must treat an index that
   * is out of range for the current list as "no selection" — a delete or undo
   * can shrink the list under a stale index.
   */
  selectedObjectIndex: number | null;
  /**
   * The object id armed for placement (the object library's "place mode"), or
   * null. When set, the next object-tool click on the map places a new object of
   * this id and clears the arm. UI state, not doc data.
   */
  armedObjectId: number | null;

  /** Select + load an act. Reads through the open project's handle. */
  openAct: (ref: ZoneActRef) => Promise<void>;
  setTool: (tool: ClassicTool) => void;
  setSelectedChunkId: (chunkId: number) => void;
  setSelectedObjectIndex: (index: number | null) => void;
  setArmedObjectId: (id: number | null) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Clear the given dirty domains for `ref` after a successful save. NOT an
   * undoable edit (it does not touch history).
   *
   * DIRTY vs DISK (corrected — this is subtle): undo/redo RESTORE a recorded
   * `dirty` snapshot, they do not re-derive it. In the common single-edit case
   * (edit → save → undo) the snapshot recorded before that edit had dirty={}, so
   * undoing back to it leaves dirty={} even though the doc now differs from the
   * (edited) bytes on disk. So the dirty flags are NOT a doc≠disk oracle after a
   * save+undo. The Save UX must not lean on undo "re-dirtying" to reflect that
   * divergence — the dirty indicator simply reads these flags, which is an
   * accepted v1 limitation (a true doc-vs-disk hash comparison is out of scope).
   */
  markDomainsClean: (ref: ZoneActRef, domains: (keyof DirtyDomains)[]) => void;
  reset: () => void;
}

const IDLE = {
  ref: null,
  doc: null,
  status: 'idle' as ClassicLevelStatus,
  error: null,
  dirty: {} as DirtyDomains,
  chunkVersions: new Map<number, number>(),
  chunkEpoch: 0,
  historyTick: 0,
  tool: 'pan' as ClassicTool,
  selectedChunkId: 0,
  selectedObjectIndex: null as number | null,
  armedObjectId: null as number | null,
};

// ---------------------------------------------------------------------------
// Shared undo history + version clock
// ---------------------------------------------------------------------------

/** The classic editing undo/redo stack (a sibling of the aeon + sprite ones). */
export const classicHistory = new ClassicHistory();
const clearClassicRedo = () => classicHistory.clearRedo();
// Joining the shared timeline: a new edit on a sibling history (e.g. an s1 object
// sprite edit) invalidates our redo, and vice-versa (see undo-bus.ts).
registerRedoClearer(clearClassicRedo);

// Process-monotonic content-version allocator. NEVER rewound: undo/redo restore
// recorded version VALUES, but every fresh allocation is globally unique, so
// (chunkEpoch, perChunkVersion) → content is a stable bijection for the session.
let versionClock = 0;
function nextVersion(): number { return ++versionClock; }

// A monotonically-increasing token guards against a slow read for act A landing
// after the user has already selected act B — only the latest request commits.
let loadToken = 0;

export const useClassicLevelStore = create<ClassicLevelState>((set, get) => ({
  ...IDLE,

  openAct: async (ref: ZoneActRef): Promise<void> => {
    const token = ++loadToken;
    // A fresh act load starts a clean editing session: no dirty domains, a fresh
    // chunk epoch (busts the viewport cache for the new level's chunk art), and an
    // empty history (undo never crosses a level load).
    classicHistory.clear();
    const fresh = {
      dirty: {} as DirtyDomains,
      chunkVersions: new Map<number, number>(),
      chunkEpoch: nextVersion(),
      historyTick: get().historyTick + 1,
      // Chunk ids are per-act, so a fresh act resets the stamp selection (the tool
      // choice persists — it's a workflow preference, not level data).
      selectedChunkId: 0,
      // Object selection + place-arm are per-act too (indices/ids into this act's
      // object list), so a fresh act clears them.
      selectedObjectIndex: null,
      armedObjectId: null,
    };
    // Unavailable acts carry their resolution reason — surface it directly rather
    // than attempting a read the handle would reject.
    if (!ref.available) {
      set({ ref, doc: null, status: 'error', error: ref.reason ?? 'act unavailable', ...fresh });
      return;
    }
    const handle = useClassicProjectStore.getState().handle;
    if (!handle || !handle.levels) {
      set({ ref, doc: null, status: 'error', error: 'no classic project is open', ...fresh });
      return;
    }
    set({ ref, doc: null, status: 'loading', error: null, ...fresh });
    try {
      const doc = await handle.levels.read(ref);
      if (token !== loadToken) return; // superseded by a newer selection
      set({ ref, doc, status: 'ready', error: null });
    } catch (e) {
      if (token !== loadToken) return;
      set({ ref, doc: null, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  setTool: (tool: ClassicTool) => set({ tool }),
  setSelectedChunkId: (chunkId: number) => {
    if (Number.isInteger(chunkId) && chunkId >= 0 && chunkId <= 0xff) set({ selectedChunkId: chunkId });
  },
  setSelectedObjectIndex: (index: number | null) => set({ selectedObjectIndex: index }),
  // Arming an object for placement is mutually exclusive with a live selection:
  // clear the selection so the inspector reflects the pending placement, not a
  // still-selected object.
  setArmedObjectId: (id: number | null) =>
    set(id === null ? { armedObjectId: null } : { armedObjectId: id, selectedObjectIndex: null }),

  // undo/redo are timeline NAVIGATION, not new edits, so (like the aeon history)
  // they do not invalidate sibling redo stacks — only commit() does.
  undo: () => {
    const s = get();
    if (!s.doc) return;
    const target = classicHistory.undo(currentSnapshot(s));
    if (!target) return;
    applySnapshot(set, target, s.historyTick);
  },

  redo: () => {
    const s = get();
    if (!s.doc) return;
    const target = classicHistory.redo(currentSnapshot(s));
    if (!target) return;
    applySnapshot(set, target, s.historyTick);
  },

  markDomainsClean: (ref, domains) => {
    const s = get();
    // Only touch the currently-open act (the saver clears exactly what it wrote).
    if (!s.ref || s.ref.zone !== ref.zone || s.ref.act !== ref.act) return;
    const dirty = { ...s.dirty };
    for (const d of domains) delete dirty[d];
    set({ dirty });
  },

  reset: () => {
    loadToken++; // invalidate any in-flight read
    classicHistory.clear();
    set({ ...IDLE, chunkVersions: new Map(), historyTick: get().historyTick + 1 });
  },
}));

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

function currentSnapshot(s: ClassicLevelState): ClassicSnapshot {
  return { doc: s.doc!, dirty: s.dirty, chunkVersions: s.chunkVersions, chunkEpoch: s.chunkEpoch };
}

function applySnapshot(
  set: (partial: Partial<ClassicLevelState>) => void,
  snap: ClassicSnapshot,
  historyTick: number,
): void {
  set({
    doc: snap.doc,
    dirty: snap.dirty,
    chunkVersions: snap.chunkVersions,
    chunkEpoch: snap.chunkEpoch,
    historyTick: historyTick + 1,
  });
}

/** Whether a classic edit can currently be undone / redone (for UI affordances). */
export function classicCanUndo(): boolean { return classicHistory.canUndo; }
export function classicCanRedo(): boolean { return classicHistory.canRedo; }

// ---------------------------------------------------------------------------
// Commit — the ONE place a validated edit becomes state: records a single undo
// step, joins the shared timeline (sibling-redo invalidation), applies the new
// doc + dirty flags + version bump.
// ---------------------------------------------------------------------------

type VersionEffect = { kind: 'none' } | { kind: 'chunk'; id: number } | { kind: 'all' };

function commit(newDoc: LevelDoc, dirtyPatch: DirtyDomains, ve: VersionEffect): void {
  const s = useClassicLevelStore.getState();
  classicHistory.record(currentSnapshot(s));
  invalidateSiblingRedos(clearClassicRedo);

  let chunkVersions = s.chunkVersions;
  let chunkEpoch = s.chunkEpoch;
  if (ve.kind === 'chunk') {
    chunkVersions = new Map(s.chunkVersions);
    chunkVersions.set(ve.id, nextVersion());
  } else if (ve.kind === 'all') {
    chunkEpoch = nextVersion();
  }

  useClassicLevelStore.setState({
    doc: newDoc,
    dirty: { ...s.dirty, ...dirtyPatch },
    chunkVersions,
    chunkEpoch,
    historyTick: s.historyTick + 1,
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const err = (error: string): CommandResult => ({ ok: false, error });

/** The open doc, or null (commands reject cleanly when no level is open). */
function requireDoc(): LevelDoc | null {
  const s = useClassicLevelStore.getState();
  return s.status === 'ready' ? s.doc : null;
}

/** Full-doc structural validation → one joined message, or null if clean. */
function structuralError(doc: LevelDoc): string | null {
  const v = validateLevelDoc(doc);
  return v.length ? v.join('; ') : null;
}

function isInt(n: number): boolean {
  return Number.isInteger(n);
}

// NO-OP MUTATION GUARDS (cheap-to-compare commands only). A command whose built
// doc would be content-identical returns ok:true WITHOUT recording an undo step,
// so an accidental identical write (e.g. a drag that lands back on the same spot,
// or an inspector re-commit) doesn't pollute the timeline with empty steps. Only
// the O(small) commands guard: set-start (two numbers), set-colind (the touched
// entries), set-objects (a field compare over the list). The heavier domains
// (tiles/chunks/blocks/layout) are intentionally NOT guarded — a full deep
// compare of tile pixels / chunk cells / layout grids would cost as much as the
// edit itself, so those always record a step (an identical stamp is a rare,
// cheap-to-undo case not worth the per-edit scan).

/** Field-compare two S1 object entries (no objectsEqual export exists to reuse). */
function objectEntryEqual(a: S1ObjectEntry, b: S1ObjectEntry): boolean {
  return a.x === b.x && a.y === b.y && a.xflip === b.xflip && a.yflip === b.yflip
    && a.respawn === b.respawn && a.id === b.id && a.subtype === b.subtype;
}

/** Whether two object lists are element-wise field-identical (order-sensitive). */
function objectListsEqual(a: readonly S1ObjectEntry[], b: readonly S1ObjectEntry[]): boolean {
  return a.length === b.length && a.every((o, i) => objectEntryEqual(o, b[i]));
}

/** The writable tile span for the open act, or null when unknown (fakes/no handle). */
function editableTileRange(): EditableTileRange | null {
  const { ref } = useClassicLevelStore.getState();
  const levels = useClassicProjectStore.getState().handle?.levels;
  if (!ref || !levels?.editableTileRange) return null;
  return levels.editableTileRange(ref);
}

// ---------------------------------------------------------------------------
// Commands (spec §2.2) — pure, exported, MCP-addressable
// ---------------------------------------------------------------------------

/** classic:set-layout-cells — one gesture's worth of stamped chunk-id cells. */
export function classicSetLayoutCells(
  plane: LayoutPlane,
  cells: { x: number; y: number; chunkId: number }[],
): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  const grid = plane === 'bg' ? doc.bg : doc.fg;
  const bound = Math.min(grid.cells.length, grid.width * grid.height);
  // Validate every cell BEFORE mutating (atomic): in bounds + chunkId a byte.
  for (const c of cells) {
    if (!isInt(c.x) || !isInt(c.y) || c.x < 0 || c.y < 0 || c.x >= grid.width || c.y >= grid.height) {
      return err(`${plane} cell (${c.x},${c.y}) is outside the ${grid.width}x${grid.height} layout`);
    }
    const index = c.y * grid.width + c.x;
    if (index >= bound) {
      return err(`${plane} cell (${c.x},${c.y}) is outside the writable layout region`);
    }
    // chunkId is the S1 ENGINE id: $00 = air (valid — erases the cell), and
    // 1..chunks.length map to chunks[id-1]. Anything past the pool can't render,
    // so reject it here rather than baking an un-drawable id into the layout.
    if (!isInt(c.chunkId) || c.chunkId < 0 || c.chunkId > doc.chunks.length) {
      return err(`chunk id ${c.chunkId} out of range 0..${doc.chunks.length} (0 = air)`);
    }
  }
  const nextCells = new Uint8Array(grid.cells);
  for (const c of cells) nextCells[c.y * grid.width + c.x] = c.chunkId;
  const nextGrid = { ...grid, cells: nextCells };
  const newDoc: LevelDoc = plane === 'bg' ? { ...doc, bg: nextGrid } : { ...doc, fg: nextGrid };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Layout isn't chunk content → no chunk version bump.
  commit(newDoc, plane === 'bg' ? { bg: true } : { fg: true }, { kind: 'none' });
  return { ok: true };
}

/**
 * classic:edit-chunk-cells — set individual block cells of one chunk.
 *
 * `chunkId` is the S1 ENGINE id (1-based; $00 = the blank/air chunk, which is not
 * a real map256 entry and cannot be edited). It resolves to a file-order chunk
 * index via chunkIndexForId. chunkVersions are keyed by ENGINE id so the
 * viewport / picker caches (which key on the layout byte) invalidate correctly.
 */
export function classicEditChunkCells(
  chunkId: number,
  cells: { index: number; word: number }[],
): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  const chunkIndex = chunkIndexForId(doc, chunkId);
  if (chunkIndex === null) {
    if (chunkId === 0) return err('the blank chunk (engine id 0 = air) is not editable');
    return err(`chunk ${chunkId} does not exist (1..${doc.chunks.length})`);
  }
  const src = doc.chunks[chunkIndex];
  const nextCells: ChunkCell[] = src.cells.slice();
  for (const { index, word } of cells) {
    if (!isInt(index) || index < 0 || index > 255) {
      return err(`chunk cell index ${index} out of range 0..255`);
    }
    if (!isInt(word) || word < 0 || word > 0xffff) {
      return err(`chunk cell word ${word} out of range 0..65535`);
    }
    nextCells[index] = unpackChunkCell(word);
  }
  const nextChunks = doc.chunks.slice();
  nextChunks[chunkIndex] = { cells: nextCells };
  const newDoc: LevelDoc = { ...doc, chunks: nextChunks };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Version keyed by ENGINE id (the layout byte the viewport/picker cache on).
  commit(newDoc, { chunks: true }, { kind: 'chunk', id: chunkId });
  return { ok: true };
}

/** classic:edit-block — replace one 16x16 block's 4-cell definition. */
export function classicEditBlock(blockId: number, def: BlockDef): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  if (!isInt(blockId) || blockId < 0 || blockId >= doc.blocks.length) {
    return err(`block ${blockId} does not exist (0..${doc.blocks.length - 1})`);
  }
  if (!def || !Array.isArray(def.cells) || def.cells.length !== 4) {
    return err('block must have exactly 4 cells');
  }
  const nextBlocks = doc.blocks.slice();
  nextBlocks[blockId] = { cells: def.cells.map((c) => ({ ...c })) };
  const newDoc: LevelDoc = { ...doc, blocks: nextBlocks };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // A block change repaints every chunk that references it — bump the whole epoch.
  commit(newDoc, { blocks: true }, { kind: 'all' });
  return { ok: true };
}

/** classic:edit-tiles — overwrite 8x8 tile-pool pixels (32 bytes/tile). */
export function classicEditTiles(edits: { tileIndex: number; data: Uint8Array }[]): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  const poolTiles = Math.floor(doc.tiles.length / 32);
  const range = editableTileRange();
  for (const { tileIndex, data } of edits) {
    if (!isInt(tileIndex) || tileIndex < 0 || tileIndex >= poolTiles) {
      return err(`tile ${tileIndex} does not exist (0..${poolTiles - 1})`);
    }
    if (!(data instanceof Uint8Array) || data.length !== 32) {
      return err(`tile ${tileIndex} data must be 32 bytes (got ${data?.length})`);
    }
    // Reject un-writable tiles at edit time (the s1-io write contract would else
    // reject them at save). Only enforced when the range is known.
    if (range) {
      if (tileIndex >= range.baseTileCount) {
        return err(`tile ${tileIndex} is a gap/appended tile — not editable in v1`);
      }
      if (range.animRanges.some((r) => tileIndex >= r.start && tileIndex < r.start + r.count)) {
        return err(`tile ${tileIndex} is an animated-art slot — not editable in v1`);
      }
    }
  }
  const nextTiles = new Uint8Array(doc.tiles);
  for (const { tileIndex, data } of edits) nextTiles.set(data, tileIndex * 32);
  const newDoc: LevelDoc = { ...doc, tiles: nextTiles };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Any tile-pixel change repaints every chunk that uses it — bump the epoch.
  commit(newDoc, { tiles: true }, { kind: 'all' });
  return { ok: true };
}

/** classic:set-palette — write one 16-color palette line. */
export function classicSetPalette(line: number, colors: Uint16Array): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  if (!isInt(line) || line < 0 || line > 3) return err(`palette line ${line} out of range 0..3`);
  if (!(colors instanceof Uint16Array) || colors.length !== 16) {
    return err(`palette line must have 16 colors (got ${colors?.length})`);
  }
  const nextPalettes = doc.palettes.slice();
  nextPalettes[line] = new Uint16Array(colors);
  const newDoc: LevelDoc = { ...doc, palettes: nextPalettes };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Palette colors are baked into chunk art renders — bump the epoch.
  commit(newDoc, { palette: true }, { kind: 'all' });
  return { ok: true };
}

/** classic:set-colind — set block→collision-shape indices. */
export function classicSetColind(entries: { blockId: number; value: number }[]): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  const colind = doc.collision.colind;
  for (const { blockId, value } of entries) {
    if (!isInt(blockId) || blockId < 0 || blockId >= colind.length) {
      return err(`colind block ${blockId} out of range 0..${colind.length - 1}`);
    }
    if (!isInt(value) || value < 0 || value > 255) {
      return err(`colind value ${value} out of range 0..255`);
    }
  }
  // No-op guard: every touched entry already holds its target value → no undo step.
  if (entries.every(({ blockId, value }) => colind[blockId] === value)) return { ok: true };
  const nextColind = new Uint8Array(colind);
  for (const { blockId, value } of entries) nextColind[blockId] = value;
  const newDoc: LevelDoc = { ...doc, collision: { ...doc.collision, colind: nextColind } };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // colind drives the (live-drawn) collision overlay, not cached chunk art.
  commit(newDoc, { colind: true }, { kind: 'none' });
  return { ok: true };
}

/** classic:set-objects — whole-list replace of the object placements. */
export function classicSetObjects(objects: S1ObjectEntry[]): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  if (!Array.isArray(objects)) return err('objects must be an array');
  // No-op guard: an identical list (e.g. a move that netted zero displacement)
  // records no undo step. The current list is already validated, so a match is
  // safe to accept without re-running structuralError.
  if (objectListsEqual(doc.objects, objects)) return { ok: true };
  const newDoc: LevelDoc = { ...doc, objects: objects.map((o) => ({ ...o })) };
  const e = structuralError(newDoc);
  if (e) return err(e);
  commit(newDoc, { objects: true }, { kind: 'none' });
  return { ok: true };
}

/** classic:set-start — move the player spawn point. */
export function classicSetStart(x: number, y: number): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  if (!isInt(x) || !isInt(y) || x < 0 || x > 0xffff || y < 0 || y > 0xffff) {
    return err(`start position (${x},${y}) out of range 0..65535`);
  }
  // No-op guard: an unchanged spawn point records no undo step.
  if (doc.start.x === x && doc.start.y === y) return { ok: true };
  const newDoc: LevelDoc = { ...doc, start: { x, y } };
  const e = structuralError(newDoc);
  if (e) return err(e);
  commit(newDoc, { start: true }, { kind: 'none' });
  return { ok: true };
}
