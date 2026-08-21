// Dev-only debug hooks for the automated crash/perf harnesses.
//
// Installs `window.__dbg` ONLY when the renderer is built/run with
// VITE_AURORA_DEBUG=1 (see scratchpad/crash-investigation/launch.sh). It is a thin
// façade over the classic project/level/object-art stores so a headless CDP driver
// can open a project, load acts, and read load/paint state without reaching into
// the bundled zustand internals. Tree-shaken out of any build where the flag is
// unset — never present in a normal `npm run dev` / production bundle.
//
// This is investigation infrastructure, not product code: it holds no state of its
// own and only calls existing store methods.

import { useClassicProjectStore } from './state/classicProjectStore';
import { useClassicLevelStore } from './state/classicLevelStore';
import { useClassicObjectArtStore } from './state/classicObjectArtStore';
import { useProjectStore, getCurrentAct } from './state/projectStore';
import { useEditorStore, focusedHistory } from './state/editorStore';
import { openAeonProject } from './state/aeon-open';
import { useAetherStore } from './state/aetherStore';
import { useViewStore } from './state/viewStore';
import { useArtStore } from './state/artStore';
import { useCanvasStore } from './state/canvasStore';
import { useSpriteStore } from './state/spriteStore';
import { useToastStore } from './state/toastStore';
import { confirmProjectOpen } from './shell/project-open-guard';
import { activateLevelTarget } from './shell/tab-activation';
import { levelDocId } from './shell/tabs';
import { buildUsageIndex } from '../core/level-classic/usage-index';
import { buildChunkSurface } from '../core/art/classic-surface-buffer';
import { tileLockReason } from '../core/project/editable-tiles';

/**
 * Paint-through (Task 12) read-only query surface. Every function here reads
 * `doc`/`usage` off the live classic level store and returns plain data — no
 * mutation, no bypass of the composer's write path (planSurfaceEdit →
 * classicPaintSurface stays the ONLY way pixels get committed; see ChunkTab's
 * header). These exist because finding "two chunks that share a block" or "two
 * ADJACENT cells in one chunk sharing a block" by hand in a real GHZ act is not
 * practical from outside — the doc has hundreds of blocks/chunks and the CDP
 * harness cannot import core modules into the page. Selecting the FOUND ids
 * (setSelectedChunk/setComposerBlock) is setup, exactly like `activate()` is
 * setup for opening an act — the harness still drives the actual paint strokes,
 * undo and mode toggles through real pointer/keyboard events on the real UI.
 */
interface ClassicProbeApi {
  /** Pool sizes, for before/after divergence counts. */
  poolSizes(): { tiles: number; blocks: number; chunks: number } | null;
  /** { block, xf, yf, solidity } for one chunk cell, by ENGINE chunk id (1-based; 0 = air). */
  chunkCell(chunkId: number, cellIndex: number): { block: number; xf: boolean; yf: boolean; solidity: number } | null;
  /** { tile, pal, xf, yf, pri } for one block cell (0=TL,1=TR,2=BL,3=BR). */
  blockCell(blockId: number, cellIndex: number): { tile: number; pal: number; xf: boolean; yf: boolean; pri: boolean } | null;
  /** FNV-1a hash of one tile's raw 32 bytes, so undo restoration can be checked without shipping the whole pool. */
  tileHash(tileIndex: number): number | null;
  /** One block's collision-shape index. Read-only, and the only way a harness
   *  can see whether a commit gave its new art collision — the shape is not on
   *  screen anywhere until the block is stamped and probed on the map. */
  colindOf(blockId: number): number | null;
  /** The reserved-tile set (object-art-claimed level tiles) for the open act, as a plain array. */
  reservedTiles(): number[];
  /**
   * A block used by >= 2 DISTINCT chunks (blockToChunks), plus one referencing
   * cell in each of the first two — for the "paint one chunk, the other chunk
   * must/must not change" checks (3 and 4).
   */
  findSharedBlock(): { blockId: number; chunkAId: number; cellA: number; chunkBId: number; cellB: number } | null;
  /**
   * A block used by >= 2 distinct chunks AND whose TL tile cell (block.cells[0])
   * is itself shared by >= 2 distinct blocks, found at an UNFLIPPED chunk cell —
   * so painting near the cell's local (4,4) is guaranteed to touch a tile that
   * must clone, inside a block that must clone, inside a chunk cell that must
   * repoint. For check 2 (undo restores all three tiers together). Skips any
   * candidate whose tile is in the reserved set.
   */
  findJuicyCell(): { chunkId: number; cellIndex: number; blockId: number; tileId: number } | null;
  /**
   * Two HORIZONTALLY ADJACENT cells (same row, column N and N+1) in one chunk
   * that reference the same block — the A1 regression shape (plan doc: two
   * painted chunk cells sharing one linked block). For check 5.
   */
  findAdjacentSharedBlockCells(): { chunkId: number; cellA: number; cellB: number; blockId: number } | null;
  /**
   * The EXACT fixture from reserved-tiles-real-act.test.ts's
   * `sixSharedTileDivergences`, replicated so the CDP harness can force the
   * same proven six-divergence pass through the REAL UI rather than inventing
   * its own candidate search: the first six distinct chunk cells (by
   * chunkCellIndex) of `doc.chunks[chunkFileIndex]` whose current tile is
   * shared (`tileUsage(t).cells > 1`) and editable, each written with value 9
   * (a nibble GHZ's real tile data never legitimately holds there — see that
   * test's docblock). Returns writes in composed-surface art-pixel coordinates
   * (x, y are each cell's top-left 8x8 corner) and the ENGINE chunk id to
   * select first. Defaults to chunk file index 0 (engine id 1) — the same
   * chunk the proven test uses.
   */
  sixDivergenceWrites(chunkFileIndex?: number): { chunkId: number; writes: { x: number; y: number; value: number }[] } | null;
  /** One hash per pool tile, index-aligned — a before/after diff over the WHOLE
   *  pool without shipping 965 tiles × 32 bytes across the CDP wire. For check 6:
   *  which tile indices actually changed after a batch of Isolate divergences. */
  allTileHashes(): number[];
  /** The first placed object with this engine id (S1ObjectEntry.id), or null. */
  findObject(id: number): { x: number; y: number; subtype: number } | null;
  setSelectedChunk(id: number): void;
  setComposerBlock(id: number): void;
}

function fnv1a(bytes: Uint8Array, offset: number, length: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < length; i++) {
    h ^= bytes[offset + i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function installClassicProbe(): ClassicProbeApi {
  const state = () => useClassicLevelStore.getState();
  const usageOf = (doc: NonNullable<ReturnType<typeof state>['doc']>) => buildUsageIndex(doc);

  return {
    poolSizes: () => {
      const { doc } = state();
      if (!doc) return null;
      return { tiles: Math.floor(doc.tiles.length / 32), blocks: doc.blocks.length, chunks: doc.chunks.length };
    },
    colindOf: (blockId) => {
      const { doc } = state();
      if (!doc) return null;
      if (!Number.isInteger(blockId) || blockId < 0 || blockId >= doc.blocks.length) return null;
      return doc.collision.colind[blockId] ?? 0;
    },
    chunkCell: (chunkId, cellIndex) => {
      const { doc } = state();
      if (!doc) return null;
      const idx = chunkId - 1; // engine id is 1-based; see model.ts chunkIndexForId
      const cell = doc.chunks[idx]?.cells[cellIndex];
      return cell ? { block: cell.block, xf: cell.xf, yf: cell.yf, solidity: cell.solidity } : null;
    },
    blockCell: (blockId, cellIndex) => {
      const { doc } = state();
      if (!doc) return null;
      const cell = doc.blocks[blockId]?.cells[cellIndex];
      return cell ? { tile: cell.tile, pal: cell.pal, xf: cell.xf, yf: cell.yf, pri: cell.pri } : null;
    },
    tileHash: (tileIndex) => {
      const { doc } = state();
      if (!doc) return null;
      const offset = tileIndex * 32;
      if (offset < 0 || offset + 32 > doc.tiles.length) return null;
      return fnv1a(doc.tiles, offset, 32);
    },
    reservedTiles: () => [...(state().reservedTiles ?? [])].sort((a, b) => a - b),
    findSharedBlock: () => {
      const { doc } = state();
      if (!doc) return null;
      const usage = usageOf(doc);
      for (const [blockId, chunkIdxs] of usage.blockToChunks) {
        if (blockId === 0) continue; // block 0 tends to be a blank/filler block — not representative
        if (chunkIdxs.length < 2) continue;
        const [ciA, ciB] = chunkIdxs;
        const cellA = doc.chunks[ciA]?.cells.findIndex((c) => c.block === blockId);
        const cellB = doc.chunks[ciB]?.cells.findIndex((c) => c.block === blockId);
        if (cellA === undefined || cellA < 0 || cellB === undefined || cellB < 0) continue;
        return { blockId, chunkAId: ciA + 1, cellA, chunkBId: ciB + 1, cellB };
      }
      return null;
    },
    findJuicyCell: () => {
      const { doc } = state();
      if (!doc) return null;
      const usage = usageOf(doc);
      const reserved = state().reservedTiles;
      for (let ci = 0; ci < doc.chunks.length; ci++) {
        const chunk = doc.chunks[ci];
        for (let cellIndex = 0; cellIndex < chunk.cells.length; cellIndex++) {
          const cc = chunk.cells[cellIndex];
          if (cc.xf || cc.yf) continue; // unflipped only — local (4,4) maps straight to block cell 0 (TL)
          if (cc.block === 0) continue;
          if (usage.blockUsage(cc.block).containers < 2) continue; // block must be shared to force a clone
          const tlTile = doc.blocks[cc.block]?.cells[0]?.tile;
          if (tlTile === undefined || tlTile === 0) continue; // 0 is the transparent filler tile — not representative
          if (reserved?.has(tlTile)) continue;
          if ((usage.tileToBlocks.get(tlTile)?.length ?? 0) < 2) continue; // tile must be shared to force its own clone
          return { chunkId: ci + 1, cellIndex, blockId: cc.block, tileId: tlTile };
        }
      }
      return null;
    },
    findAdjacentSharedBlockCells: () => {
      const { doc } = state();
      if (!doc) return null;
      for (let ci = 0; ci < doc.chunks.length; ci++) {
        const cells = doc.chunks[ci].cells;
        for (let row = 0; row < 16; row++) {
          for (let col = 0; col < 15; col++) {
            const a = row * 16 + col, b = a + 1;
            if (cells[a].block !== 0 && cells[a].block === cells[b].block) {
              return { chunkId: ci + 1, cellA: a, cellB: b, blockId: cells[a].block };
            }
          }
        }
      }
      return null;
    },
    sixDivergenceWrites: (chunkFileIndex = 0) => {
      const { doc, ref } = state();
      if (!doc) return null;
      const handle = useClassicProjectStore.getState().handle;
      const range = ref && handle?.levels?.editableTileRange ? handle.levels.editableTileRange(ref) : null;
      const usage = usageOf(doc);
      const { provenance } = buildChunkSurface(doc, chunkFileIndex);
      const writes: { x: number; y: number; value: number }[] = [];
      const seenChunkCells = new Set<number>();
      for (let i = 0; i < provenance.cells.length && writes.length < 6; i++) {
        const c = provenance.cells[i];
        if (c.tileIndex === 0) continue;
        if (usage.tileUsage(c.tileIndex).cells <= 1) continue;
        if (tileLockReason(range, c.tileIndex) !== null) continue;
        if (c.chunkCellIndex === null || seenChunkCells.has(c.chunkCellIndex)) continue;
        seenChunkCells.add(c.chunkCellIndex);
        const cx = i % provenance.cellsX;
        const cy = Math.floor(i / provenance.cellsX);
        writes.push({ x: cx * 8, y: cy * 8, value: 9 });
      }
      return { chunkId: chunkFileIndex + 1, writes };
    },
    allTileHashes: () => {
      const { doc } = state();
      if (!doc) return [];
      const n = Math.floor(doc.tiles.length / 32);
      const out = new Array<number>(n);
      for (let t = 0; t < n; t++) out[t] = fnv1a(doc.tiles, t * 32, 32);
      return out;
    },
    findObject: (id) => {
      const { doc } = state();
      if (!doc) return null;
      const o = doc.objects.find((e) => e.id === id);
      return o ? { x: o.x, y: o.y, subtype: o.subtype } : null;
    },
    setSelectedChunk: (id) => state().setSelectedChunkId(id),
    setComposerBlock: (id) => state().setComposerBlockId(id),
  };
}

/**
 * Task 14 (origination-canvas CDP verification) read-only query surface.
 *
 * STRICTLY READ-ONLY FOR 13 OF ITS 14 MEMBERS, and that is load-bearing: the
 * canvas rows are checked by driving the REAL UI (the New Canvas dialog's own
 * fields, real pointer strokes on the real PixelViewport, real Ctrl+Z/Ctrl+S,
 * real Explorer rows), and these answer "what does the store now hold" so an
 * on-screen observation can be corroborated at the byte level. There is
 * deliberately no `createCanvas`, `setPixels` or `save` here — verifying a
 * mechanism by calling something other than the mechanism is the failure
 * phase 1's report warns about.
 *
 * THE ONE EXCEPTION IS `projectOpenGuard()`. It calls the real
 * `confirmProjectOpen`, and every exit of that function which returns `true`
 * also calls `endDocumentSession()` — closing every open sprite and canvas
 * document (and, on the discard path, marking the editor clean too). So a
 * `true` return from this hook is not a read: it is proof that whatever the
 * harness had open a moment ago is now gone. The hook is legitimate (see its
 * own comment — a headless harness has no other way to reach this code path at
 * all), but a caller must not lean on the paragraph above to assume calling it
 * leaves state untouched. It also does not reproduce `openPath`'s full
 * behaviour: the follow-on `openDirectory` is deliberately skipped, so a `true`
 * result leaves the app in a state the real open flow never actually produces
 * on its own — documents gone, but no new project opened in their place.
 */
/**
 * The AEON read-only query surface, and the door that opens an aeon project.
 *
 * IT EXISTS BECAUSE THE HARNESSES HAD NO WAY IN. The 2026-08-16 sweep's standing
 * gap was "the aeon backend had ZERO runtime rows" — not because nobody wanted
 * them, but because `openDir` above is classic's door and aeon's only UI route
 * is the native folder picker CDP cannot drive. Every finding against the aeon
 * viewport (drag commit, BG history, drag coalescing, the tool-letter chords)
 * was therefore static-trace only. This is the door; the rest is read-only, on
 * the same rule the classic probe states: opening an act is SETUP, and every
 * gesture under test still goes through real pointer and keyboard events.
 */
interface AeonProbeApi {
  /** aeon's counterpart to `openDir`, via the same loader `useProject` uses. */
  open(dir: string): Promise<void>;
  state(): {
    open: boolean; zone: string | null; act: string | null; sections: number;
    tool: string; dirty: boolean; dirtyActs: string[];
  };
  /** Can the focused document's stack undo? Drives the "one gesture, one step" count. */
  canUndo(): boolean;
  /** One placement's live position — the drag rows read this before and after. */
  objectAt(sectionIndex: number, index: number): { x: number; y: number; typeId: string } | null;
  /** One section nametable entry — the FG paint rows. */
  ntAt(sectionIndex: number, index: number): number | null;
  /** One RESOLVED background nametable entry — the BG paint rows. */
  bgAt(index: number): number | null;
  /** Which section the last gesture claimed. */
  activeSection(): number;
  /** Live toast messages, same as the canvas probe's. */
  toasts(): { message: string; type: string }[];
  /** SETUP, like the classic probe's setSelectedChunk: which plane the next
   *  stroke paints. The stroke itself is still a real drag on the real canvas. */
  setLayer(layer: 'fg' | 'bg'): void;
}

interface CanvasProbeApi {
  /** Every open canvas document id (the tab ids they are keyed by). */
  docIds(): string[];
  /** The store's focused document — the mirror `canvasPaneState` validates the
   *  active tab against. */
  activeDocId(): string | null;
  /** Everything about one document that a check might want to assert on. */
  state(docId: string): {
    name: string; width: number; height: number; profileId: string;
    gridOrigin: { originX: number; originY: number };
    dirty: boolean;
    source: { pngPath: string; sidecarPath: string; sidecarRejected: boolean } | null;
  } | null;
  /** FNV-1a over the document's whole index buffer — "are these the same pixels". */
  pixelsHash(docId: string): number | null;
  /** How many pixels are not index 0, i.e. how much has been drawn. */
  drawnPixels(docId: string): number | null;
  /** The document's own 64 CRAM words. */
  paletteWords(docId: string): number[] | null;
  /** One pixel's stored index. */
  pixelAt(docId: string, x: number, y: number): number | null;
  /** The armed paint index (0..63) and which grids are switched on. */
  paintIndex(): number;
  visibleGrids(): number[];
  /** The armed tool. Read-only, and the only way a harness can see whether a
   *  real keypress reached the tool keys (UX-A3) — the dock's active state is a
   *  background colour, which is a far weaker thing to assert on. */
  tool(): string;
  /** Live toast messages — a cross-check on what is read off the screen. */
  toasts(): { message: string; type: string; exiting: boolean }[];
  /**
   * The project-open guard, called EXACTLY as `useProject`'s `openPath` calls
   * it — same function, same store state, and the real `ConfirmDialog` appears
   * on screen for the harness to read and click.
   *
   * IT EXISTS BECAUSE THE ONLY UI ROUTE IS A NATIVE DIALOG. `openPath` is
   * reachable from two places: "Open Project…", which begins with
   * `window.api.selectDirectory()` (an OS folder picker CDP cannot drive), and
   * the "Open recent" commands, which `buildCommands` only emits while
   * `engine === null` — i.e. never while a project is open, which is the only
   * state in which a dirty canvas can exist. So the guard's own call is the
   * furthest out a headless harness can start; what is skipped is the folder
   * picker, not any part of the guard.
   *
   * The subsequent `openDirectory` is deliberately NOT performed: this reports
   * the guard's answer and leaves the project where it is, so the harness can
   * exercise Cancel and Discard without tearing down the session it is midway
   * through.
   */
  projectOpenGuard(): Promise<boolean>;
}

function installAeonProbe(): AeonProbeApi {
  const act = () => getCurrentAct(useProjectStore.getState());
  const section = (i: number) => act()?.sections[i] ?? null;
  return {
    open: (dir) => openAeonProject(dir).then(() => undefined),
    state: () => {
      const p = useProjectStore.getState();
      const e = useEditorStore.getState();
      return {
        open: p.project !== null,
        zone: p.currentZoneId, act: p.currentActId,
        sections: act()?.sections.filter(Boolean).length ?? 0,
        tool: e.tool, dirty: e.dirty, dirtyActs: Object.keys(e.dirtyActs),
      };
    },
    canUndo: () => focusedHistory()?.canUndo ?? false,
    objectAt: (sectionIndex, index) => {
      const o = section(sectionIndex)?.objects[index];
      return o ? { x: o.x, y: o.y, typeId: o.typeId } : null;
    },
    ntAt: (sectionIndex, index) => section(sectionIndex)?.tileGrid.nametable[index] ?? null,
    // Mirrors MapViewport's own resolveActiveBg, INCLUDING its requirement that
    // an act default have both a layout and tiles — a probe that answered from
    // `bgLayout` alone would report a plane the paint path refuses to touch, and
    // a harness would read that as "the stroke did nothing" rather than "there
    // is nothing here to stroke".
    bgAt: (index) => {
      const a = act();
      if (!a) return null;
      const ref = a.sections[useEditorStore.getState().activeSectionIndex]?.bgLayoutRef ?? null;
      if (ref !== null) {
        const entry = useProjectStore.getState().project?.bgLibrary.find((b) => b.id === ref);
        if (entry) return entry.layout[index] ?? null;
      }
      if (!a.bgLayout || !a.bgTiles) return null;
      return a.bgLayout[index] ?? null;
    },
    /** Which section the last gesture claimed — a paint lands wherever the
     *  cursor was, and the grid is 3x3 here. */
    activeSection: () => useEditorStore.getState().activeSectionIndex,
    toasts: () => useToastStore.getState().toasts.map((t) => ({ message: t.message, type: t.type })),
    setLayer: (layer) => useEditorStore.getState().setEditingLayer(layer),
  };
}

function installCanvasProbe(): CanvasProbeApi {
  const entry = (docId: string) => useCanvasStore.getState().docs.get(docId) ?? null;
  return {
    docIds: () => [...useCanvasStore.getState().docs.keys()],
    activeDocId: () => useCanvasStore.getState().activeDocId,
    state: (docId) => {
      const e = entry(docId);
      if (!e) return null;
      return {
        name: e.doc.name,
        width: e.doc.pixels.width,
        height: e.doc.pixels.height,
        profileId: e.doc.profileId,
        gridOrigin: { originX: e.doc.gridOrigin.originX, originY: e.doc.gridOrigin.originY },
        dirty: e.unsavedEdits,
        source: e.source
          ? { pngPath: e.source.pngPath, sidecarPath: e.source.sidecarPath, sidecarRejected: e.source.sidecarRejected }
          : null,
      };
    },
    pixelsHash: (docId) => {
      const e = entry(docId);
      if (!e) return null;
      return fnv1a(e.doc.pixels.data, 0, e.doc.pixels.data.length);
    },
    drawnPixels: (docId) => {
      const e = entry(docId);
      if (!e) return null;
      let n = 0;
      for (const v of e.doc.pixels.data) if (v !== 0) n++;
      return n;
    },
    paletteWords: (docId) => {
      const e = entry(docId);
      return e ? [...e.doc.palette] : null;
    },
    pixelAt: (docId, x, y) => {
      const e = entry(docId);
      if (!e) return null;
      const { width, height, data } = e.doc.pixels;
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      return data[y * width + x] ?? null;
    },
    paintIndex: () => useCanvasStore.getState().paintIndex,
    visibleGrids: () => [...useCanvasStore.getState().visibleGrids],
    tool: () => useCanvasStore.getState().tool,
    toasts: () => useToastStore.getState().toasts.map(
      (t) => ({ message: t.message, type: t.type, exiting: t.exiting }),
    ),
    projectOpenGuard: () => confirmProjectOpen(),
  };
}

interface DebugApi {
  openDir(dir: string): Promise<string>;
  projStatus(): { status: string; zones: number };
  openAct(zone: string, act: number): Promise<void>;
  levelState(): { status: string; zone: string | null; act: number | null };
  artState(): { version: number; sprites: number };
  /**
   * The shared camera. Classic's viewport keeps its own `camRef` as the hot path
   * and publishes here once per painted frame, so `view()` is how a harness sees
   * that publish, and `setView()` is how it drives the adopt-subscription — the
   * two halves of the camera seam, neither of which the node suite can reach.
   */
  view(): { x: number; y: number; zoom: number };
  setView(x: number, y: number, zoom: number): void;
  /**
   * Open an act the way the UI does — through the tab activation guard, which is
   * what carries the per-tab viewport snapshot/restore. `openAct` above goes
   * straight to the store and bypasses all of it, so a harness testing restore
   * must use this one.
   */
  activate(zone: string, act: number): Promise<boolean>;
  /**
   * Put the classic level store back to IDLE while leaving the level TAB open —
   * the "a level tab is focused but no act is loaded" state. A cold open cannot
   * be photographed in it (session-lifecycle restores an act immediately, and the
   * load beats any CDP round-trip), so a screenshot harness has no other way in
   * and the facets' empty renders had never been looked at.
   */
  resetLevel(): void;
  /**
   * aeon's counterpart to resetLevel: point the project at NO act while leaving
   * the level tab open, which is what makes `useActLoaded` false for aeon
   * (workspace/level-presence.ts reads getCurrentAct).
   *
   * IT EXISTS BECAUSE THE OLD ROUTE IN WAS A BUG. Harnesses used to reach this
   * state with `activate(zone, '__none__')`, which worked only because the aeon
   * activation path never checked that the act resolved — it opened a TAB for
   * the phantom id too, so the screenshots came with a spurious tab in the
   * strip. That hole is now closed (shell/tab-activation.ts), and closing it
   * would otherwise have made aeon's no-act screen unphotographable.
   */
  resetAct(): void;
  /**
   * Stub for the richer read/mtime instrumentation the investigation harness once
   * carried. The load/paint numbers the harnesses actually assert on come from
   * levelState()/artState() and a self-installed setTransform draw counter, so
   * these fields are reported as empty/zero here (kept for shape compatibility).
   */
  perf(): { marks: unknown[]; readCount: number; readTotalMs: number; mtimeCount: number; mtimeTotalMs: number };
  /** Task 12 (paint-through CDP verification) query surface — see ClassicProbeApi's docblock. */
  classic: ClassicProbeApi;
  /** The aeon read-only query surface + its open door — see AeonProbeApi. */
  aeon: AeonProbeApi;
  /** Task 14 (origination canvas) read-only query surface — see CanvasProbeApi. */
  canvas: CanvasProbeApi;
  /**
   * `artStore.selectedColor` — the cross-engine/cross-tier paint color
   * singleton (ChunkTab/BlockTab/TileTab all read it; see ChunkTab's header).
   * ChunkTab/BlockTab in Paint mode mount NO swatch row of their own (only
   * TileTab does), so a CDP harness testing Chunk/Block paint mode has no DOM
   * element to click for color selection without first detouring through the
   * Tile tier. Exposed directly for the same reason `view()`/`setView()` are:
   * setting which color is armed is setup, not the paint mechanism under test.
   */
  setPaintColor(v: number): void;
  /**
   * The OUTBOUND Aether link (the playtest loop).
   *
   * Exposed for the same reason `aeon.open` is: connecting is a click on a
   * status-bar badge and pushing is a slider drag, and a harness proving the
   * IPC -> main -> socket path should not have to first drive the whole UI to
   * reach it. The UI paths are exercised separately by clicking the badge and
   * moving a real slider; this is the deterministic seam underneath them.
   */
  aether: {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    state(): {
      status: string; palette: boolean; paletteKind?: string;
      serverName?: string; error?: string; pushError?: string;
      buildState: string; buildSummary: string | null;
    };
    /** Push a line of CRAM words, exactly as the palette port does. */
    push(line: number, words: number[], kind?: 'aeon' | 'classic'): void;
    /** Build & Run through the SAME routing the UI and agent use. */
    build(): Promise<{ route: string; ran: boolean }>;
    /** Warp, worded per project kind — the classic F7 path's seam. */
    warp(x: number, y: number, kind?: 'aeon' | 'classic'): Promise<string | null>;
  };
  /**
   * The classic "Edit art…" action, exactly as the object UI runs it (tab
   * activation owns the document lifecycle). Resolves true when the object's
   * sprite-doc ended up checked out.
   */
  editObjectArt(id: number): Promise<boolean>;
  /**
   * The checked-out sprite document's timeline state, read from the store (not
   * from any loader's return value): the anim picker's contents with full
   * per-step data, and the steps currently loaded in the playable timeline.
   */
  spriteState(): {
    activeDocId: string | null;
    frames: number;
    anims: { name: string; synced?: boolean; note?: string; steps: { frameIndex: number; duration: number; xFlip?: boolean; yFlip?: boolean }[] }[];
    steps: { frameIndex: number; duration: number; xFlip?: boolean; yFlip?: boolean }[];
    unsavedEdits: boolean;
    /** Shared frame canvas size (every frame is the same buffer size). */
    frameW: number;
    frameH: number;
    /**
     * Per-frame count of NONZERO pixel indices — the harness's anti-vacuous
     * "does this frame actually draw anything" readout (0 = blank canvas).
     */
    frameCoverage: number[];
  };
}

export function installDebugHooks(): void {
  const dbg: DebugApi = {
    aether: {
      connect: () => useAetherStore.getState().connect(),
      disconnect: () => useAetherStore.getState().disconnect(),
      state: () => {
        const s = useAetherStore.getState();
        return {
          status: s.status, palette: s.palette, paletteKind: s.paletteKind,
          serverName: s.serverName, error: s.error, pushError: s.pushError,
          buildState: s.buildState, buildSummary: s.buildSummary,
        };
      },
      push: (line, words, kind) => useAetherStore.getState().pushPaletteLine(line, words, kind),
      build: async () => {
        const { startBuildAndRun } = await import('./state/build-and-run');
        return startBuildAndRun();
      },
      warp: (x, y, kind) => useAetherStore.getState().warp(x, y, kind),
    },
    openDir: (dir) => useClassicProjectStore.getState().openDirectory(dir),
    projStatus: () => {
      const s = useClassicProjectStore.getState();
      return { status: s.status, zones: s.zoneTree.length };
    },
    openAct: async (zone, act) => {
      const tree = useClassicProjectStore.getState().zoneTree;
      const ref = tree.find((r) => r.zone === zone && r.act === act);
      if (!ref) throw new Error(`no act ${zone}${act} in zone tree`);
      await useClassicLevelStore.getState().openAct(ref);
    },
    levelState: () => {
      const s = useClassicLevelStore.getState();
      return { status: s.status, zone: s.ref?.zone ?? null, act: s.ref?.act ?? null };
    },
    artState: () => {
      const s = useClassicObjectArtStore.getState();
      return { version: s.version, sprites: s.sprites.size };
    },
    view: () => {
      const v = useViewStore.getState();
      return { x: v.vpX, y: v.vpY, zoom: v.zoom };
    },
    setView: (x, y, zoom) => useViewStore.getState().setViewport(x, y, zoom),
    activate: (zone, act) => activateLevelTarget(levelDocId(zone, String(act))),
    resetLevel: () => useClassicLevelStore.getState().reset(),
    // setState rather than setCurrentAct: the store action takes an act id, and
    // "no act" is exactly the value it has no way to express.
    resetAct: () => useProjectStore.setState({ currentActId: null }),
    perf: () => ({ marks: [], readCount: 0, readTotalMs: 0, mtimeCount: 0, mtimeTotalMs: 0 }),
    aeon: installAeonProbe(),
    classic: installClassicProbe(),
    canvas: installCanvasProbe(),
    setPaintColor: (v) => useArtStore.getState().setSelectedColor(v),
    editObjectArt: async (id) => {
      const { editObjectArt } = await import('./components/sprite/export-sprite');
      return editObjectArt(id);
    },
    spriteState: () => {
      const s = useSpriteStore.getState();
      return {
        activeDocId: s.activeDocId,
        frames: s.frames.length,
        anims: s.characterAnims.map((a) => ({ name: a.name, synced: a.synced, note: a.note, steps: a.steps.map((st) => ({ ...st })) })),
        steps: s.steps.map((st) => ({ ...st })),
        unsavedEdits: s.unsavedEdits,
        frameW: s.frames[0]?.width ?? 0,
        frameH: s.frames[0]?.height ?? 0,
        frameCoverage: s.frames.map((f) => {
          let n = 0;
          for (let i = 0; i < f.data.length; i++) if (f.data[i] !== 0) n++;
          return n;
        }),
      };
    },
  };
  (window as unknown as { __dbg: DebugApi }).__dbg = dbg;
}
