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
import { isBlockAligned, effectiveGranularity } from '../core/editing/map-clipboard';
import { COLLISION_CELL_OWNED_MASK, COLLISION_CELL_UNOWNED_MASK } from '../core/editing/collision-word';
import { lastPasteGhostReport, type PasteGhostReport } from './canvas/region-preview';
import { useSessionStore } from './state/sessionStore';
import { useWorkspaceStore } from './workspace/workspaceStore';
import { switchFacet } from './workspace/facet-tools';
import type { FacetCapability } from '../core/project/adapter';
import { ensureCollisionPlanes } from '../core/collision/collision-cell-resolve';
import { chunkOriginAt } from '../core/editing/chunk-links';
import { selectedCollisionWord } from '../core/collision/collision-cell-word';
import { openAeonProject } from './state/aeon-open';
import { bandBudget, bandRows } from './providers/bg-anim-aeon';
import { serializeBgOverride } from '../core/formats/bg-override/bg-override';
import { resolveDisplayedBg } from './providers/bganim-preview-aeon';
import { lastGuideReport } from './canvas/effects-guides';
import { lastCollisionMarkReport } from './canvas/collision-mark-report';
import type { CollisionMarkReport } from './canvas/collision-mark-report';
import type { GuideReport } from './canvas/effects-guides';
import { lastScreenFrameReport, type ScreenFrameReport } from './canvas/screen-frame';
import { lastPriorityLensReport, type PriorityLensReport } from './canvas/priority-lens';
import {
  lastComposerPriorityLensReport, type ComposerPriorityLensReport,
} from './canvas/composer-priority-lens';
import { lastBothPlanesLensReport, type BothPlanesLensReport } from './canvas/both-planes-lens';
import { lastCrossoverLensReport, type CrossoverLensReport } from './canvas/crossover-lens';
import {
  CROSSOVER_SHIFT, CROSSOVER_VALUE_MASK, CROSSOVER_BITS,
  CROSSOVER_NONE, CROSSOVER_TO_A, CROSSOVER_TO_B, CROSSOVER_RESERVED,
  readCrossover, crossoverRefusal,
} from '../core/collision/layer-transition';
import { auditCrossovers, crossoverAuditSeverity, type CrossoverAudit } from '../core/collision/crossover-audit';
import { lastCameraPreviewReport, type CameraPreviewReport } from './canvas/camera-preview';
import { lastRasterTimelineReport, type RasterTimelineReport } from './canvas/raster-timeline';
import { lastBandLensReport, lastBandMarkReport } from './canvas/band-lens';
import type { BandLensReport, BandMarkReport } from './canvas/band-lens';
import { lastStripDragReport } from './providers/band-strip-range';
import type { StripDragReport } from './providers/band-strip-range';
import { lastStripOpenReport } from './providers/bg-anim-art';
import type { StripOpenReport } from './providers/bg-anim-art';
import { useAetherStore } from './state/aetherStore';
import { useViewStore } from './state/viewStore';
import { parallaxPreviewOn } from './providers/parallax-preview';
import { useArtStore } from './state/artStore';
import { useCanvasStore } from './state/canvasStore';
import { useSpriteStore } from './state/spriteStore';
import { useToastStore, type ToastType } from './state/toastStore';
import { useSonicPreviewStore } from './state/sonicPreviewStore';
import { confirmProjectOpen } from './shell/project-open-guard';
import { activateLevelTarget } from './shell/tab-activation';
import { levelDocId } from './shell/tabs';
import { buildUsageIndex } from '../core/level-classic/usage-index';
import { buildChunkSurface } from '../core/art/classic-surface-buffer';
import { tileLockReason } from '../core/project/editable-tiles';
import { SECTION_TILES_WIDE } from '../core/model/s4-types';

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
  /** EVERY placement of an id (read-only) — the animated-preview harness's
   *  phase-lock rows need two distinct Rings, not just the first. */
  listObjects(id: number): { x: number; y: number; subtype: number; xflip: boolean; yflip: boolean }[];
  /**
   * One FNV hash over the doc state playback could conceivably touch (tile
   * pool bytes + palettes + the full object list + start) — the animated-
   * preview harness's "the document was NEVER written by play" sentinel.
   * Read-only, cheap, and stable across pure repaints.
   */
  docHash(): number | null;
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
    listObjects: (id) => {
      const { doc } = state();
      if (!doc) return [];
      return doc.objects
        .filter((o) => o.id === id)
        .map((o) => ({ x: o.x, y: o.y, subtype: o.subtype, xflip: o.xflip, yflip: o.yflip }));
    },
    docHash: () => {
      const { doc } = state();
      if (!doc) return null;
      let h = fnv1a(doc.tiles, 0, doc.tiles.length);
      const enc = new TextEncoder();
      const mix = (s: string) => {
        const b = enc.encode(s);
        h = (h ^ fnv1a(b, 0, b.length)) >>> 0;
      };
      mix(JSON.stringify(doc.objects));
      mix(JSON.stringify(doc.palettes.map((p) => [...p])));
      mix(JSON.stringify(doc.start));
      return h;
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
    /** The act's section grid — its world extent is this times SECTION_PIXEL_SIZE. */
    gridWidth: number | null; gridHeight: number | null;
    tool: string; dirty: boolean; dirtyActs: string[];
  };
  /** Can the focused document's stack undo? Drives the "one gesture, one step" count. */
  canUndo(): boolean;
  /** One placement's live position — the drag rows read this before and after. */
  objectAt(sectionIndex: number, index: number): { x: number; y: number; typeId: string } | null;
  /** One section nametable entry — the FG paint rows. */
  ntAt(sectionIndex: number, index: number): number | null;
  /** One RESOLVED background nametable entry — the BG paint rows. Resolved
   *  through the viewport's OWN resolver, so it cannot report a different
   *  background from the one on screen. */
  bgAt(index: number): number | null;
  /** Which file the resolved background came from: the ROM-bound override
   *  document, a BG-library entry, or the act default. */
  bgSource(): 'override' | 'library' | 'act' | null;
  /** One RESOLVED background tile's 64 pixel values, at a blob-local slot. */
  bgTileAt(slot: number): number[] | null;
  /** Which section the last gesture claimed. */
  activeSection(): number;
  /**
   * SETUP, `setSelectedBand`'s reason and its bound. The per-section raster
   * select and the scene assignment row both draw `activeSectionIndex`, and the
   * only UI routes to that value are the LAYOUT facet's section grid and a click
   * on the map canvas — neither of which is on screen beside the control under
   * test. A harness pinning "the select follows the active section" needs to
   * move it without leaving the facet; a harness pinning the GESTURE that moves
   * it is a different instrument and must still use the grid or the canvas.
   */
  setActiveSection(index: number): void;
  /** Live toast messages, same as the canvas probe's. */
  toasts(): { message: string; type: string }[];
  /** SETUP, like the classic probe's setSelectedChunk: which plane the next
   *  stroke paints. The stroke itself is still a real drag on the real canvas. */
  setLayer(layer: 'fg' | 'bg'): void;
  /**
   * SETUP, on the same rule as `setLayer`: which tile the next stroke puts
   * down.
   *
   * The armed tile comes from the ART BROWSER, a virtualised canvas grid — a
   * harness that wanted index 500 would have to scroll it and hit-test a cell,
   * and would then be measuring the browser rather than the thing under test.
   * Arming is setup; the stroke is still a real drag, and what it WROTE is still
   * read back out of the document.
   *
   * LAYER-AWARE since ROADMAP item 47: it arms the pick for whichever layer
   * `setLayer` left active, because there are now two picks naming two different
   * tile arrays. Calling it in BG mode therefore still reaches `paintBgTile`,
   * including with an out-of-blob index — which is how the refusal row is
   * reached now that the picker cannot offer one.
   */
  setSelectedTile(index: number, paletteLine?: number): void;
  /** Both picks and the layer, straight out of the store. Read-only — the rows
   *  that care what a click SELECTED read this, not what a component drew. */
  selectedTile(): { layer: 'fg' | 'bg'; fg: number; bg: number; paletteLine: number };
  /**
   * The committed marquee, if any — the marquee-drag rows read the snap result
   * back out rather than re-deriving it from pixels. Read-only.
   *
   * `aligned` comes from `map-clipboard.ts` `isBlockAligned` itself, NOT from a
   * copy of its arithmetic here: it is the predicate the whole collision rule
   * turns on, and a probe that re-implemented it could agree with itself while
   * disagreeing with the app.
   */
  marquee(): {
    sectionIndex: number; col: number; row: number; w: number; h: number; aligned: boolean;
  } | null;
  /**
   * Which granularity the marquee tool is armed to. READ-ONLY ON PURPOSE, and
   * that is the difference between this and `setSelectedTile`.
   *
   * The tile pick has no reachable UI for an arbitrary index (a virtualised
   * grid), so arming it is setup. This control is two ordinary buttons in the
   * marquee panel, so a harness can and must click the real one — and then this
   * is what proves the click reached the store rather than merely repainting a
   * button. A setter here would let a green row coexist with a dead control.
   */
  marqueeGranularity(): string;
  /**
   * THE SNAP MODIFIER, both halves, read-only.
   *
   * `invert` is the live Ctrl/Cmd state the store carries; `effective` is
   * `effectiveGranularity(armed, invert)` called for real — never re-derived
   * here. A probe that recomputed the inversion could agree with itself while
   * disagreeing with the drag, which for a two-value function with a collapsed
   * pair of outcomes is not a theoretical risk: BLOCK+held and TILE+plain
   * produce identical rects, so half the state space cannot tell a working
   * modifier from a broken one by geometry alone. This probe is what lets a
   * harness row name WHICH of the four combinations it is standing in.
   *
   * No setter, for the reason `marqueeGranularity` has none: the modifier is a
   * real key on a real keyboard, and a harness that set a flag instead of
   * holding the key would go green over a drag that never read it.
   */
  marqueeSnapModifier(): { armed: string; invert: boolean; effective: string };
  /**
   * WHAT THE PASTE GHOST IS SHOWING, read-only — the hovered footprint the
   * viewport last drew, straight out of `region-preview`'s published report.
   *
   * It exists because of a bug that could not be seen without it: a middle-drag
   * pan in paste mode was swallowed by the ghost-tracking branch, and the fix
   * had to pan AND keep the ghost live. Whether the ghost is stale is not
   * visible in the store (the hovered cell is a viewport-local ref), not
   * visible in the camera, and not reliably visible in a canvas scan — the
   * ghost is drawn on a second overlay canvas that a colour scan cannot tell
   * apart from the map beneath it.
   */
  pasteGhost(): PasteGhostReport;
  /**
   * WHAT THE MAP CLIPBOARD ACTUALLY HOLDS. Read-only.
   *
   * `artOnly` and the two plane lengths are the whole collision rule as the
   * clipboard carries it, and none of it is on screen: the paste ghost draws
   * art either way. `nonzeroTiles` is the anti-vacuous companion — a copy of a
   * blank region and a copy that never happened both leave a clipboard whose
   * dimensions look right.
   */
  mapClipboardInfo(): {
    widthTiles: number; heightTiles: number; artOnly: boolean;
    collisionALen: number; collisionBLen: number; nonzeroTiles: number;
  } | null;
  /**
   * One tile index's authored collision word on plane A, or null when the
   * section has no authored plane. The only way a row can tell "the paste wrote
   * art and left collision alone" from "the paste wrote art and quietly cleared
   * collision" — which is this parcel's worst failure mode and is invisible
   * unless the collision overlay happens to be on.
   */
  collisionAAt(sectionIndex: number, index: number): number | null;
  /**
   * One tile index's authored collision word on EITHER plane. `collisionAAt`
   * answers only for A, and the paint tool can be armed to B.
   */
  collisionAt(sectionIndex: number, plane: 'a' | 'b', index: number): number | null;
  /**
   * ⚠ FIXTURE AUTHORING, harness-only. Seed one plane cell to an exact word,
   * bypassing the command system.
   *
   * It exists because of the vacuity trap this whole area sits in: every cell in
   * every shipped act holds ZERO in the collision word's unowned bits, so a
   * harness row that paints over REAL content emits the same artifact whether
   * preservation works or not. There is no real cell to find, the way
   * `ntRect` finds real priority cells for the nametable rows — so the
   * destination has to be AUTHORED, and this is the only way to author it.
   *
   * Seeds both planes' arrays first (the same lazy seed a paint would do), so a
   * harness can poke before any gesture has touched the section. Returns the
   * word actually stored, or null when the section/index is out of range —
   * never a silent no-op, because a fixture that did not land would make every
   * row that depends on it vacuous.
   */
  collisionPoke(sectionIndex: number, plane: 'a' | 'b', index: number, word: number): number | null;
  /**
   * Whether the section carries an ENGINE BASELINE for a plane, and its length.
   *
   * READ-ONLY, and it exists because CollisionPalette's Reset opens with
   * `if (!engine) return` — a silent early return that is invisible from
   * outside the app. "Already at the baseline" and "there is no baseline to
   * reset to" both present to a harness (and to an author) as a click that
   * changed nothing, and only one of those is the button working. Null when the
   * section itself is missing, so absence of a section never reads as absence
   * of a baseline.
   */
  collisionBaseline(sectionIndex: number, plane: 'a' | 'b'): { present: boolean; length: number } | null;
  /**
   * Switch the active tab's facet, through the app's own `switchFacet` action.
   *
   * A harness needs this because tool HOTKEYS are facet-scoped: `toolForKey`
   * only arms a tool the current facet offers, so pressing 'c' on the Layout
   * facet silently arms nothing and every gesture row afterwards measures a
   * stroke that never happened. Returns the facet and the tool actually armed,
   * so a harness can assert it rather than assume it.
   */
  setFacet(facet: string): { facet: string; tool: string } | null;
  /** Arm the collision palette exactly as a click on it would. Returns the word
   *  `selectedCollisionWord` now yields, so a harness asserts on the app's own
   *  encoding rather than recomputing it. */
  armCollisionBrush(sel: {
    plane?: 'a' | 'b'; shape?: number; solidity?: 'none' | 'top' | 'sides-bottom' | 'all';
    xFlip?: boolean; yFlip?: boolean; brush?: number;
    /** The "A+B" chip. Goes through `setCollisionPaintBothPlanes`, NOT a raw
     *  `set`, so the harness exercises the lens-surfacing side effect the chip
     *  carries instead of a shortcut around it. */
    bothPlanes?: boolean;
    /** The crossover tri-state chip. Goes through
     *  `setCollisionCrossoverBrush`, so the harness exercises the lens-surfacing
     *  side effect rather than a shortcut around it. */
    crossover?: 'keep' | 'clear' | 'hand-off';
  }): { plane: 'a' | 'b'; word: number; bothPlanes: boolean; crossover: string };
  /**
   * The both-planes lens's last publish. Same role as `priorityLens()`: it
   * reports what the last repaint DREW, so a harness can tell "veiled N cells"
   * from "never ran", and `reason` distinguishes off / bg-layer / no-plane-b.
   */
  bothPlanesLens(): BothPlanesLensReport;
  /** The crossover lens's last publish. `oneWayVeils` is the interesting one. */
  crossoverLens(): CrossoverLensReport;
  /**
   * THE ENCODING, AS THE APP HOLDS IT.
   *
   * Published so a harness asserts against the running build's own constants
   * rather than re-typing aeon's anchor into the harness — a second copy of a
   * bit number is the exact defect this seam exists to prevent, and a harness
   * is not exempt from that. The node test cross-checks these against the peer
   * blob; this hook checks that the RUNNING app carries the same ones.
   */
  crossoverEncoding(): {
    shift: number; valueMask: number; bits: number;
    none: number; toA: number; toB: number; reserved: number;
  };
  /** One cell's crossover, by name, off the live document. `reserved` is a real
   *  answer (the illegal value 3), never folded into `none`. */
  crossoverAt(sectionIndex: number, plane: 'a' | 'b', index: number): string | null;
  /**
   * The paint-time loop audit over one section's two planes — the check aeon
   * assigned to Aurora rather than to its build (anchor §8.2).
   *
   * Exposed because the audit is the only thing that can see a HALF-PAINTED
   * loop, and a harness proving the brush wrote two bits proves nothing about
   * whether the loop it belongs to is traversable in both directions.
   */
  crossoverAudit(sectionIndex: number): (CrossoverAudit & { severity: string }) | null;
  /** The refusal text for writing `crossover` on `plane`, or null when legal.
   *  A harness row asserts the editor REFUSES a self-mark, which is a hard
   *  build error in aeon and must never reach a file. */
  crossoverRefusal(plane: 'a' | 'b', crossover: string): string | null;
  /** The armed stamp source (editorStore.selectedChunkId). Read-only. */
  selectedChunk(): string | null;
  /**
   * CHUNK IDENTITY, as the document holds it (owner ruling d-18c) — READ-ONLY,
   * and the whole surface is read-only ON PURPOSE.
   *
   * Nothing here has a setter, not even the checkbox. `stampDetached()` reports
   * the store field the real `<input type="checkbox">` writes, so a harness has
   * to CLICK the control and this is what proves the click reached the store; a
   * setter would let a green row coexist with a dead checkbox — the rule
   * `marqueeGranularity` states for the same reason.
   *
   * `chunkLinkAt` goes through `chunkOriginAt` itself rather than reading the
   * plane here: a probe with its own copy of "plane id -> placement" could agree
   * with itself while disagreeing with the app.
   *
   * It takes COL/ROW, not a flat index, for the reason bar 8 gives: a harness
   * that multiplied by its own idea of the section width would be asserting
   * against a number it typed. `SECTION_TILES_WIDE` is 256 and every ad-hoc
   * copy of it in a script is a defect waiting for the day it changes.
   */
  chunkLinkAt(sectionIndex: number, col: number, row: number):
    { id: number; chunkId: string; baseCol: number; baseRow: number; collision: boolean } | null;
  /** Every placement recorded in one section, in placement order. `[]` is a real
   *  answer and is distinct from a section that has no identity layer at all —
   *  `hasChunkLinks` separates them, which is what keeps a "nothing is linked"
   *  row from passing on a section the feature never touched. */
  chunkPlacements(sectionIndex: number):
    { id: number; chunkId: string; baseCol: number; baseRow: number; collision: boolean }[];
  hasChunkLinks(sectionIndex: number): boolean;
  /** The stamp-time checkbox's live state. Read-only — see above. */
  stampDetached(): boolean;
  /** The latched "placement under the cursor" the Chunk links panel reads. */
  linkHover(): { sectionIndex: number; placementId: number; chunkId: string } | null;
  /**
   * THE ART COMPOSER'S OPEN CHUNK DOCUMENT — read-only, the chunk counterpart
   * to `bgArtOpen()` (which returns null for anything that is not a BG-override
   * doc, so it cannot serve here).
   *
   * A propagation harness needs three things that exist nowhere on screen in a
   * readable form: WHICH chunk the composer opened (the canvas looks the same
   * for any of them), whether the doc is DIRTY (the anti-vacuous control — a
   * "Save propagated it" row means nothing if the tile stamp never landed), and
   * the armed `brushTile`, which is drawn into a canvas HUD chip and is
   * therefore invisible to the DOM. No setters: arming the tool and the tile are
   * real clicks on the real rail and the real tileset panel.
   */
  artChunkOpen(): {
    chunkId: string | null; name: string; widthTiles: number; heightTiles: number;
    dirty: boolean; tool: string; brushTile: number;
    /** `artStore.stampPriority` — the stamp's armed tri-state (O17). Like
     *  `brushTile` it is drawn into a canvas HUD chip and so is invisible to the
     *  DOM; unlike the chips that set it, which ARE real DOM buttons a harness
     *  must click rather than poke. No setter here, for that reason. */
    stampPriority: string;
  } | null;
  /**
   * ONE CELL OF THE OPEN COMPOSER DOCUMENT'S COLLISION PLANE — read-only, at
   * 16px CELL resolution (`doc.collisionA` / `doc.collisionB` are stored that
   * way, unlike a section's tile-resolution planes, so `collisionRect`'s shape
   * does not transfer).
   *
   * `artChunkOpen()` reports the doc's identity and dirtiness and nothing about
   * what it holds, and `collisionAt` answers for a SECTION — the composer's doc
   * is a copy taken at open (`docFromChunk`) that no section hook can see. So a
   * gesture row against the Art facet's chunk collision brush has no other way
   * to read its own destination.
   *
   * Null when nothing is open, when the open doc is a BG-override doc, or when
   * the index is out of range — never a silent 0, which is a legal word.
   */
  artDocCollisionAt(plane: 'a' | 'b', index: number): number | null;
  /**
   * THE COLLISION WORD'S OWNERSHIP RULE, as the app itself computes it —
   * `COLLISION_CELL_OWNED_MASK` and its 16-bit complement.
   *
   * A harness asserting "the brush wrote its fields and the cell kept the rest"
   * has to say WHICH bits are which, and a typed `0x3fff` in a harness is a pin
   * that survives the day `packCollisionCell` grows a field — the exact failure
   * `collision-word.ts` states the rule as a mask complement to avoid. So the
   * masks come from the module, and a harness builds its fixture out of them.
   */
  collisionWordMasks(): { owned: number; unowned: number };
  /**
   * ⚠ FIXTURE AUTHORING, harness-only — the composer counterpart to
   * `collisionPoke`, and it exists for exactly the same reason.
   *
   * Bits outside `COLLISION_CELL_OWNED_MASK` are ZERO in every shipped chunk,
   * so a row that paints over a real doc cell emits the same artifact whether
   * the brush merges or replaces. The destination has to be AUTHORED, and the
   * composer offers no gesture that can author it (that is the point: the
   * unowned bits are the half no control writes).
   *
   * Returns the word actually stored, or null when nothing is open / the index
   * is out of range — never a silent no-op, because a fixture that did not land
   * makes every row after it vacuous. Does NOT mark the doc dirty: dirtiness is
   * what the CONTROL rows measure, and a fixture that pre-dirtied the doc would
   * hand them a pass they did not earn.
   */
  artDocCollisionPoke(plane: 'a' | 'b', index: number, word: number): number | null;
  /** Every chunk-library id, in library order. Read-only. */
  chunkIds(): string[];
  /** One library chunk's shape + how much of it is actually art (nonzero
   *  nametable words) — the anti-vacuous control for the stamp rows: a stamp
   *  of an all-air chunk into a blank area proves nothing. Read-only. */
  chunkInfo(id: string): {
    name: string; widthTiles: number; heightTiles: number; nonzeroTiles: number;
  } | null;
  /** A rectangle of one section's FG nametable words, row-major — `ntAt` at
   *  scale, so a harness can find blank/non-blank regions and compare a whole
   *  stamped footprint without a WS round-trip per tile. Read-only. */
  ntRect(sectionIndex: number, col: number, row: number, w: number, h: number): number[] | null;
  /**
   * A rectangle of one authored collision plane's words, row-major at TILE
   * resolution (all four sub-tiles of a 16px cell hold the same word) — the
   * collision counterpart to `ntRect`. Null when the section has no authored
   * plane.
   *
   * The marquee FLIP needs this and `collisionAAt` cannot serve: a flip is a
   * claim about a whole rectangle (words reverse AND their own X/Y-flip bits
   * toggle), and a per-index probe can only ever sample it. Reading the plane
   * at tile resolution rather than cell resolution is deliberate too — it is
   * how the section actually stores it, so a flip that wrote a cell
   * non-uniformly across its four tiles is VISIBLE here instead of being
   * averaged away by a cell-level accessor.
   */
  collRect(sectionIndex: number, col: number, row: number, w: number, h: number,
    plane: 'a' | 'b'): number[] | null;
  /**
   * THE MAP CLIPBOARD'S ACTUAL WORDS — nametable and both collision planes.
   *
   * `mapClipboardInfo` reports the clipboard's SHAPE, which is what the paste
   * rules turn on; this reports its CONTENTS, which is the only way to see that
   * a flip of the pending paste did both halves of its transform (the words
   * reversed AND each word's own flip bit toggled). Nothing on screen can tell
   * those apart: the ghost of a reverse-only flip is a picture, drawn, in the
   * right place, wrong.
   */
  mapClipboardWords(): {
    widthTiles: number; heightTiles: number;
    nametable: number[]; collisionA: number[]; collisionB: number[];
  } | null;
  /**
   * The effects-scene library as the MODEL holds it — READ-ONLY, and the only
   * way a harness can see what the Effects facet's controls actually did.
   *
   * Nothing about a scene is on screen except the form fields themselves, so a
   * harness that only read the DOM would be checking that a `<select>` shows
   * what it was told to show. `scenesJson()` returns the whole documents, so a
   * row can assert on a field the form never touched (the property the codec's
   * whole design turns on) — as a JSON STRING because CDP's returnByValue would
   * otherwise flatten a `oneOf` union oddly across versions.
   */
  scenes(): { id: string; name: string | null; layers: number }[];
  scenesJson(): string;
  unreadableScenes(): { path: string; reason: string }[];
  /**
   * WHICH SCENE THE FACET IS EDITING — the store field the panel and the map
   * canvas now share (ROADMAP item 43). Raw and possibly stale by design; the
   * resolved answer is in `guides().sceneId`.
   */
  selectedScene(): string | null;
  selectScene(id: string | null): void;
  /**
   * The RASTER PRESET library as the MODEL holds it — READ-ONLY, and the only
   * way a harness can see what the band panel's controls actually did.
   *
   * `presetsJson()` returns the whole documents, as a JSON STRING for
   * `scenesJson()`'s reason: CDP's returnByValue flattens a `oneOf` union oddly
   * across versions, and the ON arm IS a oneOf — the one thing a band harness
   * most needs to read back exactly.
   */
  presets(): { id: string; name: string | null; bands: number }[];
  presetsJson(): string;
  unreadablePresets(): { path: string; reason: string }[];
  selectedPreset(): string | null;
  selectPreset(id: string | null): void;
  /**
   * THE PARALLAX GUIDES AS THE LAST REPAINT DREW THEM.
   *
   * The only honest way to check a line on a canvas short of sampling pixels.
   * MapViewport publishes this at the end of its draw body — it is a record of
   * what happened, not a recomputation of what should have, so `active: false`
   * and a `paints` counter that has stopped moving are both things a row can
   * catch. See canvas/effects-guides.ts's `GuideReport`.
   */
  guides(): GuideReport;
  /**
   * THE COLLISION ANGLE MARKS AS THE LAST REPAINT DREW THEM.
   *
   * Same publish-not-recompute contract as `guides()`. OverlayRenderer writes
   * this out of the very geometry it hands to `drawAngleMark`, in world px, so
   * a harness knows where on the canvas to sample — and, just as importantly,
   * where the mark must NOT be. `suppressed: true` (angles on, zoom below the
   * density gate) is distinct from `active: false` (angles off), so both are
   * rows that can fail. See canvas/collision-mark-report.ts.
   */
  collisionMarks(): CollisionMarkReport;
  /**
   * THE SCREEN FRAME AS THE LAST REPAINT DREW IT (triage 2026-08-26 row G).
   * Same publish-not-recompute contract as `guides()`; `active: false` is what
   * the View toggle OFF reports, and `paints` proves a repaint happened.
   */
  screenFrame(): ScreenFrameReport;
  /**
   * THE PRIORITY LENS AS THE LAST REPAINT DREW IT (2026-08-28).
   *
   * Same publish-not-recompute contract as `guides()`. A probe that re-scanned
   * the nametables for bit 15 would prove two copies of one scan agree, which
   * stays true when the lens is never drawn — so this reports the DRAW: `veils`
   * is `fillRect` calls actually issued, `segments` is boundary strokes, and
   * `reason` distinguishes the toggle being off from the BG layer having no
   * foreground to mark. Pixels are still the last word; see
   * scratchpad/priority-lens-harness.mjs.
   */
  priorityLens(): PriorityLensReport;
  /**
   * THE PRIORITY LENS ON THE ART COMPOSER, as the last repaint drew it (O17).
   *
   * A SECOND REPORT rather than a `surface` field on the first, because the two
   * are published by two canvases that are never mounted together and a shared
   * slot would make "the composer's lens ran" and "the map's lens ran" the same
   * assertion. Same publish-not-recompute contract as `priorityLens()`, with one
   * addition: `priorityCells` is the MODEL's own count, so a harness can tell a
   * document with nothing to mark from a lens that drew nothing — the
   * anti-vacuous control a veil count alone cannot supply.
   *
   * `reason: 'live-tile'` is not "off": a single atlas tile has no placement, so
   * it has no priority bit to show. See canvas/composer-priority-lens.ts.
   */
  composerPriorityLens(): ComposerPriorityLensReport;
  /**
   * What the last repaint's in-frame camera composite actually planned and drew.
   *
   * A PUBLISH, not a re-derivation: `bands` is the array `drawCameraPreview`
   * blitted from, and `blits` is how many `drawImage` calls it issued — so a
   * harness can tell "composed" from "would compose if anything were drawing".
   */
  cameraPreview(): CameraPreviewReport;
  /**
   * THE RASTER TIMELINE AS THE LAST DRAW PUT IT DOWN (ROADMAP row 79).
   *
   * Same publish-not-recompute contract as `guides()`, and it matters more here
   * than usual: the strip is a projection of `cameraPreview()`'s own plan, so a
   * probe that re-derived it from the scene would prove the projection agrees
   * with itself — which stays true when the canvas is blank. `fills` and
   * `markers` are rectangles and rules ACTUALLY issued, and the strip's own
   * constants (`lines`, `scale`, `originY`, `stripX`, `stripW`) are published so
   * a harness derives every pixel aim from the app's contract instead of typing
   * a number. Pixels are still the last word; see
   * scratchpad/raster-timeline-harness.mjs.
   */
  rasterTimeline(): RasterTimelineReport;
  /**
   * THE BAND LENS AS THE LAST REPAINT DREW IT (ROADMAP item 43 part 2).
   *
   * Same contract as `guides()` and for the same reason: a PUBLISH from the end
   * of the draw body, not a recomputation. A probe that re-scanned the layout
   * from the stores would prove two copies of one scan agree, which stays true
   * when the draw pass never ran. `active: false` is a real answer.
   */
  bandLens(): BandLensReport;
  /**
   * THE LAST CLICK-TO-SEED MARK, whatever it resolved to.
   *
   * The cases worth asserting are the ones that CHANGE NOTHING — a blank cell, a
   * slot past the end of the blob, a document that moved under the press. Those
   * leave the tint untouched, so `bandLens()` cannot tell them from a click that
   * never happened; `marks` advancing is what proves the gesture ran.
   */
  bandMark(): BandMarkReport;
  /**
   * THE LAST BLOB-STRIP DRAG (ROADMAP item 43 wave 2), whatever it resolved to.
   *
   * `bandCandidate()` cannot stand in for this. A REFUSED drag and a drag that
   * never ran leave the candidate byte-identical, and a plain PICK leaves it
   * untouched too — so the store cannot say which of the three happened.
   * `gestures` advancing proves the release ran; `kind` proves WHICH branch took
   * it, which is what a row needs when two paths can produce one observable.
   */
  stripDrag(): StripDragReport;
  /**
   * What the last DOUBLE CLICK on the blob strip did — ROADMAP row 57's door to
   * a static slot.
   *
   * `bgArtOpen()` cannot stand in for this, and the gap is exactly the one row
   * 57 exists about. It shows the document that is open, so it is equally happy
   * with a document the BANK door opened — and on the two non-opening branches
   * (`ignored` on the foreground strip, `refused` on a background that is not
   * the override) it shows the document that was already there, which is
   * byte-identical to what a build with no `onDoubleClick` at all would show.
   * `gestures` advancing proves the gesture RAN; `kind` proves which branch took
   * it; `openedTileIndex` proves WHICH slot, so a row cannot be satisfied by
   * "some document opened".
   */
  stripOpen(): StripOpenReport;
  /** What the lens resolves RIGHT NOW, independent of the draw pass. */
  bandLensTarget(): { kind: 'band'; index: number } | { kind: 'candidate' } | null;
  /**
   * A DOOR, not an assertion — the same shape as `selectScene`.
   *
   * A pixel probe has to compare the SAME cell with the lens on and off to
   * prove the tint is the lens rather than the art; without a way to turn the
   * mark off, the only baseline available is a different cell, which is a
   * weaker claim about a different pixel.
   */
  setBandLensTarget(t: { kind: 'band'; index: number } | { kind: 'candidate' } | null): void;
  /**
   * The band `stamp-band` is armed with (parcel J) — what a click on an Art
   * panel band card sets. The setter exists so a harness can arm the stamp
   * without the card when it is pinning the GESTURE rather than the picker;
   * the card click is still the row that proves the picker.
   */
  selectedBand(): number | null;
  setSelectedBand(index: number | null): void;
  /** The promotion candidate the panel form and the map now share. */
  bandCandidate(): { staticBase: number; cols: number; rows: number };
  /** One section's `sceneRef` — what the assignment dropdown writes. */
  sceneRef(sectionIndex: number): string | null;
  /**
   * One section's `rasterRef` — what the per-section raster select writes.
   *
   * READ-ONLY, and it exists for the defect the DOM cannot show. A `<select>`
   * whose `onChange` did nothing at all still renders the option the browser
   * put on screen, so reading the control back tells you what the BROWSER did
   * and not what the model holds. The two are the same only when the binding
   * really landed, which is the thing under test.
   */
  rasterRef(sectionIndex: number): string | null;
  /**
   * The BgAnim bands as the MODEL holds them — READ-ONLY, and the only way a
   * harness can see what the band panel's controls actually did.
   *
   * IT EXISTS FOR A DEFECT THE DOM CANNOT SHOW. A band edit replaces the whole
   * override document inside the project's holder; if that write-back is broken
   * the panel still renders, the button still depresses, and the only visible
   * difference is that the list does not change — which is exactly what a
   * correctly-refused operation also looks like. Reading the band list back out
   * of the store is what tells those two apart.
   */
  bands(): {
    index: number; cols: number; rows: number; tileCount: number;
    driver: string; driverIsExplicit: boolean;
    rateShift: number; rateShiftIsExplicit: boolean;
    slotBase: number; phaseBanks: number;
  }[];
  /** Tile-blob and band-count budgets — the numbers the panel prints. */
  bandBudget(): {
    bands: number; maxBands: number; bandsRemaining: number;
    animatedSlots: number; tiles: number; tileCapacity: number;
    tileSlotsRemaining: number; firstPromotableSlot: number;
  };
  /** Whether the file was there, and whether it parsed. Absent != unreadable. */
  bgOverrideStatus(): {
    path: string; present: boolean; unreadable: { path: string; reason: string } | null;
  } | null;
  /**
   * FNV-1a over the whole serialized override document — "is this the same
   * document". A string of ~89 KB would cross CDP on every call; a hash lets a
   * row assert that an undo landed back on the EXACT bytes it started from,
   * which is a stronger claim than "the band count went back to what it was".
   * Null when there is no document, or when it would not serialize.
   */
  bgOverrideHash(): number | null;
  /** One layout word of the override document — the cell-level image check. */
  bgOverrideLayoutAt(index: number): number | null;
  /** One override tile's 64 pixel values — the art-level image check. */
  bgOverrideTileAt(index: number): number[] | null;
  /**
   * One tile of one PHASE BANK: `anims[bandIndex].phases[bank][slot]`.
   *
   * IT EXISTS BECAUSE `bgOverrideTileAt` CANNOT SEE BANKS 1..7. The static
   * blob mirrors phase 0 only, so a harness reading tiles alone cannot tell a
   * stroke that landed in the bank it opened from one that landed in bank 0 —
   * both leave the same DOM, the same thumbnail count, and the same
   * "something changed" verdict. This is the observable that separates them,
   * and it is what makes "the composer really opened bank k" assertable
   * rather than inferred from a canvas aspect ratio.
   */
  bandPhaseTile(bandIndex: number, bank: number, slot: number): number[] | null;
  /**
   * The Art facet's OPEN DOCUMENT, when it is a BG-override one: which target
   * (`{kind:'tile',tileIndex}` / `{kind:'bank',bandIndex,bank}`), its name, and
   * the composer document's tile dimensions.
   *
   * A bank click is claimed to "open bank k in the composer". The DOM shows a
   * canvas either way, and every bank of one band has the SAME size and aspect
   * — so the only place the identity of the opened bank exists is this store
   * field. Read-only.
   */
  bgArtOpen(): {
    name: string; target: unknown; widthTiles: number; heightTiles: number; dirty: boolean;
    /** `artStore.tool` — the ART facet's armed tool. `aeon.state().tool` is the
     *  MAP's, a different store, so a harness arming the pencil has nothing else
     *  to read the result off. */
    tool: string;
  } | null;
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
  // Re-read per call, never captured: a band command REPLACES the document
  // inside the holder, so a captured reference would report the pre-edit
  // document forever — and the rows that check a band edit landed would pass
  // against a broken write-back, which is the one thing they exist to catch.
  const bgDoc = () => useProjectStore.getState().project?.bgOverride.doc ?? null;
  return {
    open: (dir) => openAeonProject(dir).then(() => undefined),
    state: () => {
      const p = useProjectStore.getState();
      const e = useEditorStore.getState();
      return {
        open: p.project !== null,
        zone: p.currentZoneId, act: p.currentActId,
        sections: act()?.sections.filter(Boolean).length ?? 0,
        // THE GRID, NOT JUST THE POPULATED COUNT. `sections` counts sections
        // that EXIST; the act's extent in world pixels is `grid * 2048` whether
        // or not every slot is filled, and every statement about where a
        // background repeats is measured against that extent. A harness that had
        // to infer the grid from `sections` would be wrong on any act with a
        // hole in it — OJZ act 1 is 3x3 with two sidecars on disk.
        gridWidth: act()?.gridWidth ?? null,
        gridHeight: act()?.gridHeight ?? null,
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
      // THROUGH THE ONE RESOLVER, never a second copy of the rule. This used to
      // reproduce the library/act-default fallback by hand, and after decision
      // d-12 that copy would have reported the LIBRARY's word for a cell the
      // canvas was painting from the override — a probe that lies is worse than
      // no probe, and it is exactly the harness a BG paint row would trust.
      const st = useProjectStore.getState();
      const resolved = resolveDisplayedBg(
        a, st.project?.bgLibrary ?? [], useEditorStore.getState().activeSectionIndex,
        st.project?.bgOverride ?? null,
      );
      return resolved?.layout[index] ?? null;
    },
    /** Where `bgAt` is reading from — 'override' | 'library' | 'act', or null. */
    bgSource: () => {
      const a = act();
      if (!a) return null;
      const st = useProjectStore.getState();
      return resolveDisplayedBg(
        a, st.project?.bgLibrary ?? [], useEditorStore.getState().activeSectionIndex,
        st.project?.bgOverride ?? null,
      )?.source ?? null;
    },
    /** One RESOLVED background tile's 64 pixel values — the art the canvas is
     *  painting at a slot, whichever file it came from. */
    bgTileAt: (slot) => {
      const a = act();
      if (!a) return null;
      const st = useProjectStore.getState();
      const resolved = resolveDisplayedBg(
        a, st.project?.bgLibrary ?? [], useEditorStore.getState().activeSectionIndex,
        st.project?.bgOverride ?? null,
      );
      const t = resolved?.tiles[slot];
      return t ? [...t.pixels] : null;
    },
    /** Which section the last gesture claimed — a paint lands wherever the
     *  cursor was, and the grid is 3x3 here. */
    activeSection: () => useEditorStore.getState().activeSectionIndex,
    setActiveSection: (index) => useEditorStore.getState().setActiveSectionIndex(index),
    toasts: () => useToastStore.getState().toasts.map((t) => ({ message: t.message, type: t.type })),
    setLayer: (layer) => useEditorStore.getState().setEditingLayer(layer),
    setSelectedTile: (index, paletteLine) => {
      const e = useEditorStore.getState();
      e.setSelectedTileIndexForLayer(e.editingLayer, index);
      if (paletteLine !== undefined) e.setSelectedPaletteLine(paletteLine);
    },
    selectedTile: () => {
      const e = useEditorStore.getState();
      return {
        layer: e.editingLayer,
        fg: e.selectedTileIndex,
        bg: e.selectedBgTileIndex,
        paletteLine: e.selectedPaletteLine,
      };
    },
    marquee: () => {
      const m = useEditorStore.getState().marquee;
      return m ? {
        sectionIndex: m.sectionIndex, col: m.col, row: m.row, w: m.w, h: m.h,
        aligned: isBlockAligned(m.col, m.row, m.w, m.h),
      } : null;
    },
    marqueeGranularity: () => useEditorStore.getState().marqueeGranularity,
    pasteGhost: () => lastPasteGhostReport(),
    marqueeSnapModifier: () => {
      const e = useEditorStore.getState();
      return {
        armed: e.marqueeGranularity,
        invert: e.marqueeSnapInvert,
        effective: effectiveGranularity(e.marqueeGranularity, e.marqueeSnapInvert),
      };
    },
    mapClipboardInfo: () => {
      const c = useEditorStore.getState().mapClipboard;
      if (!c) return null;
      let nonzeroTiles = 0;
      for (let i = 0; i < c.nametable.length; i++) if (c.nametable[i] !== 0) nonzeroTiles++;
      return {
        widthTiles: c.widthTiles, heightTiles: c.heightTiles, artOnly: c.artOnly,
        collisionALen: c.collisionA.length, collisionBLen: c.collisionB.length, nonzeroTiles,
      };
    },
    collisionAAt: (sectionIndex, index) => {
      const section = getCurrentAct(useProjectStore.getState())?.sections[sectionIndex];
      const plane = section?.collisionEdit;
      if (!plane || index < 0 || index >= plane.length) return null;
      return plane[index];
    },
    collisionAt: (sectionIndex, planeId, index) => {
      const section = getCurrentAct(useProjectStore.getState())?.sections[sectionIndex];
      const plane = planeId === 'b' ? section?.collisionEditB : section?.collisionEdit;
      if (!plane || index < 0 || index >= plane.length) return null;
      return plane[index] ?? null;
    },
    collisionPoke: (sectionIndex, planeId, index, word) => {
      const section = getCurrentAct(useProjectStore.getState())?.sections[sectionIndex];
      if (!section) return null;
      ensureCollisionPlanes(section);
      const plane = planeId === 'b' ? section.collisionEditB : section.collisionEdit;
      if (!plane || index < 0 || index >= plane.length) return null;
      plane[index] = word & 0xFFFF;
      return plane[index] ?? null;
    },
    collisionBaseline: (sectionIndex, planeId) => {
      const section = getCurrentAct(useProjectStore.getState())?.sections[sectionIndex];
      if (!section) return null;
      const engine = planeId === 'b' ? section.engineCollisionB : section.engineCollision;
      return { present: !!engine, length: engine ? engine.length : 0 };
    },
    setFacet: (facet) => {
      const tabId = useSessionStore.getState().activeId || null;
      if (!tabId) return null;
      switchFacet(tabId, facet as FacetCapability);
      return { facet: useWorkspaceStore.getState().facetFor(tabId), tool: useEditorStore.getState().tool };
    },
    armCollisionBrush: (sel) => {
      const e = useEditorStore.getState();
      if (sel.plane !== undefined) e.setCollisionPaintPlane(sel.plane);
      if (sel.shape !== undefined) e.pickCollisionShape(sel.shape, false);
      if (sel.solidity !== undefined) e.setSelectedCollisionSolidity(sel.solidity);
      if (sel.xFlip !== undefined) e.setSelectedCollisionXFlip(sel.xFlip);
      if (sel.yFlip !== undefined) e.setSelectedCollisionYFlip(sel.yFlip);
      if (sel.brush !== undefined) e.setCollisionBrushSize(sel.brush);
      // Through the SETTER, so the lens-surfacing side effect it carries is
      // part of what the harness drives. A `set({...})` here would arm the mode
      // without the lens and every subsequent row would be measuring a state no
      // click can produce.
      if (sel.bothPlanes !== undefined) e.setCollisionPaintBothPlanes(sel.bothPlanes);
      if (sel.crossover !== undefined) e.setCollisionCrossoverBrush(sel.crossover);
      const s = useEditorStore.getState();
      return {
        plane: s.collisionPaintPlane,
        bothPlanes: s.collisionPaintBothPlanes,
        crossover: s.collisionCrossoverBrush,
        word: selectedCollisionWord({
          shape: s.selectedCollisionProfile, entryFlipX: s.selectedCollisionEntryFlipX,
          userXFlip: s.selectedCollisionXFlip, yFlip: s.selectedCollisionYFlip,
          solidity: s.selectedCollisionSolidity,
        }),
      };
    },
    selectedChunk: () => useEditorStore.getState().selectedChunkId,
    chunkLinkAt: (sectionIndex, col, row) => {
      const s = section(sectionIndex);
      if (!s) return null;
      const p = chunkOriginAt(s, row * SECTION_TILES_WIDE + col);
      return p ? { ...p } : null;
    },
    chunkPlacements: (sectionIndex) =>
      (section(sectionIndex)?.chunkLinks?.placements ?? []).map((p) => ({ ...p })),
    hasChunkLinks: (sectionIndex) => !!section(sectionIndex)?.chunkLinks,
    stampDetached: () => useEditorStore.getState().stampDetached,
    artChunkOpen: () => {
      const a = useArtStore.getState();
      const o = a.open;
      if (!o || o.bgOverride) return null;
      return {
        chunkId: o.chunkId,
        name: o.name,
        widthTiles: o.doc.widthTiles,
        heightTiles: o.doc.heightTiles,
        dirty: o.dirty,
        tool: a.tool,
        brushTile: a.brushTile,
        stampPriority: a.stampPriority,
      };
    },
    linkHover: () => {
      const h = useEditorStore.getState().linkHover;
      return h ? { ...h } : null;
    },
    artDocCollisionAt: (planeId, index) => {
      const o = useArtStore.getState().open;
      if (!o || o.bgOverride) return null;
      const arr = planeId === 'b' ? o.doc.collisionB : o.doc.collisionA;
      if (!Number.isInteger(index) || index < 0 || index >= arr.length) return null;
      return arr[index];
    },
    artDocCollisionPoke: (planeId, index, word) => {
      const o = useArtStore.getState().open;
      if (!o || o.bgOverride) return null;
      const arr = planeId === 'b' ? o.doc.collisionB : o.doc.collisionA;
      if (!Number.isInteger(index) || index < 0 || index >= arr.length) return null;
      arr[index] = word & 0xFFFF;
      return arr[index];
    },
    collisionWordMasks: () => ({
      owned: COLLISION_CELL_OWNED_MASK, unowned: COLLISION_CELL_UNOWNED_MASK,
    }),
    chunkIds: () => (useProjectStore.getState().project?.chunkLibrary ?? []).map((c) => c.id),
    chunkInfo: (id) => {
      const c = useProjectStore.getState().project?.chunkLibrary.find((k) => k.id === id);
      if (!c) return null;
      let nonzero = 0;
      for (let i = 0; i < c.nametable.length; i++) if (c.nametable[i] !== 0) nonzero++;
      return { name: c.name, widthTiles: c.widthTiles, heightTiles: c.heightTiles, nonzeroTiles: nonzero };
    },
    scenes: () => (useProjectStore.getState().project?.effectsScenes.scenes ?? []).map((s) => ({
      id: s.id,
      name: typeof s.name === 'string' ? s.name : null,
      layers: s.layers.length,
    })),
    scenesJson: () => JSON.stringify(useProjectStore.getState().project?.effectsScenes.scenes ?? []),
    unreadableScenes: () =>
      (useProjectStore.getState().project?.effectsScenes.unreadable ?? [])
        .map((u) => ({ path: u.path, reason: u.reason })),
    sceneRef: (sectionIndex) => section(sectionIndex)?.sceneRef ?? null,
    rasterRef: (sectionIndex) => section(sectionIndex)?.rasterRef ?? null,
    selectedScene: () => useEditorStore.getState().selectedEffectsSceneId,
    selectScene: (id) => useEditorStore.getState().setSelectedEffectsSceneId(id),
    presets: () => (useProjectStore.getState().project?.effectsPresets.presets ?? []).map((p) => ({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : null,
      bands: p.bands.length,
    })),
    presetsJson: () =>
      JSON.stringify(useProjectStore.getState().project?.effectsPresets.presets ?? []),
    unreadablePresets: () =>
      (useProjectStore.getState().project?.effectsPresets.unreadable ?? [])
        .map((u) => ({ path: u.path, reason: u.reason })),
    selectedPreset: () => useEditorStore.getState().selectedEffectsPresetId,
    selectPreset: (id) => useEditorStore.getState().setSelectedEffectsPresetId(id),
    guides: () => lastGuideReport(),
    collisionMarks: () => lastCollisionMarkReport(),
    screenFrame: () => lastScreenFrameReport(),
    priorityLens: () => lastPriorityLensReport(),
    composerPriorityLens: () => lastComposerPriorityLensReport(),
    bothPlanesLens: () => lastBothPlanesLensReport(),
    crossoverLens: () => lastCrossoverLensReport(),
    crossoverEncoding: () => ({
      shift: CROSSOVER_SHIFT, valueMask: CROSSOVER_VALUE_MASK, bits: CROSSOVER_BITS,
      none: CROSSOVER_NONE, toA: CROSSOVER_TO_A, toB: CROSSOVER_TO_B, reserved: CROSSOVER_RESERVED,
    }),
    crossoverAt: (sectionIndex, planeId, index) => {
      const sec = getCurrentAct(useProjectStore.getState())?.sections[sectionIndex];
      const plane = planeId === 'b' ? sec?.collisionEditB : sec?.collisionEdit;
      if (!plane || index < 0 || index >= plane.length) return null;
      return readCrossover(plane[index]);
    },
    crossoverAudit: (sectionIndex) => {
      const sec = getCurrentAct(useProjectStore.getState())?.sections[sectionIndex];
      if (!sec) return null;
      const a = auditCrossovers(sec.collisionEdit, sec.collisionEditB);
      return { ...a, severity: crossoverAuditSeverity(a) };
    },
    crossoverRefusal: (plane, crossover) =>
      // Narrowed here rather than trusting the harness's string: an unknown
      // value must not read as "legal".
      (crossover === 'none' || crossover === 'to-a' || crossover === 'to-b')
        ? crossoverRefusal(plane, crossover)
        : `unknown crossover "${crossover}"`,
    cameraPreview: () => lastCameraPreviewReport(),
    rasterTimeline: () => lastRasterTimelineReport(),
    bandLens: () => lastBandLensReport(),
    bandMark: () => lastBandMarkReport(),
    stripDrag: () => lastStripDragReport(),
    stripOpen: () => lastStripOpenReport(),
    bandLensTarget: () => useEditorStore.getState().bandLensTarget,
    setBandLensTarget: (t) => useEditorStore.getState().setBandLensTarget(t),
    selectedBand: () => useEditorStore.getState().selectedBgBand,
    setSelectedBand: (index) => useEditorStore.getState().setSelectedBgBand(index),
    bandCandidate: () => useEditorStore.getState().bandCandidate,
    bands: () => bandRows(bgDoc()).map((b) => ({
      index: b.index, cols: b.cols, rows: b.rows, tileCount: b.tileCount,
      driver: b.driver, driverIsExplicit: b.driverIsExplicit,
      rateShift: b.rateShift, rateShiftIsExplicit: b.rateShiftIsExplicit,
      slotBase: b.slotBase, phaseBanks: b.phaseBanks,
    })),
    bandBudget: () => bandBudget(bgDoc()),
    bgOverrideStatus: () => {
      const s = useProjectStore.getState().project?.bgOverride;
      if (!s) return null;
      return { path: s.path, present: s.doc !== null, unreadable: s.unreadable };
    },
    bgOverrideHash: () => {
      const doc = bgDoc();
      if (!doc) return null;
      let text: string;
      try { text = serializeBgOverride(doc); } catch { return null; }
      // FNV-1a, the same spelling canvasProbe.pixelsHash uses.
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h >>> 0;
    },
    bgOverrideLayoutAt: (index) => {
      const doc = bgDoc();
      if (!doc || !Array.isArray(doc.layout)) return null;
      return doc.layout[index] ?? null;
    },
    bgOverrideTileAt: (index) => {
      const doc = bgDoc();
      if (!doc || !Array.isArray(doc.tiles)) return null;
      return doc.tiles[index] ?? null;
    },
    bandPhaseTile: (bandIndex, bank, slot) => {
      const doc = bgDoc();
      const band = doc?.anims?.[bandIndex];
      const t = band?.phases?.[bank]?.[slot];
      return Array.isArray(t) ? [...t] : null;
    },
    bgArtOpen: () => {
      const a = useArtStore.getState();
      const o = a.open;
      if (!o || !o.bgOverride) return null;
      return {
        name: o.name,
        target: JSON.parse(JSON.stringify(o.bgOverride)) as unknown,
        widthTiles: o.doc.widthTiles,
        heightTiles: o.doc.heightTiles,
        dirty: o.dirty,
        tool: a.tool,
      };
    },
    ntRect: (sectionIndex, col, row, w, h) => {
      const s = section(sectionIndex);
      if (!s) return null;
      const out: number[] = [];
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          out.push(s.tileGrid.nametable[(row + r) * SECTION_TILES_WIDE + (col + c)] ?? 0);
        }
      }
      return out;
    },
    collRect: (sectionIndex, col, row, w, h, plane) => {
      const s = section(sectionIndex);
      const p = plane === 'b' ? s?.collisionEditB : s?.collisionEdit;
      if (!p) return null;
      const out: number[] = [];
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          out.push(p[(row + r) * SECTION_TILES_WIDE + (col + c)] ?? 0);
        }
      }
      return out;
    },
    mapClipboardWords: () => {
      const c = useEditorStore.getState().mapClipboard;
      if (!c) return null;
      return {
        widthTiles: c.widthTiles, heightTiles: c.heightTiles,
        nametable: [...c.nametable],
        collisionA: [...c.collisionA], collisionB: [...c.collisionB],
      };
    },
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
  /** Every View-menu overlay toggle, as the store holds them. Read-only. */
  overlays(): Record<string, boolean>;
  /**
   * Flip one overlay toggle, exactly as the View menu's checkbox does.
   *
   * A harness needs this because two of the three lenses this repo now carries
   * are ARMED AS A SIDE EFFECT of arming a brush — so a row that turned a lens
   * on by reaching past the store could not tell "the app armed it" from "the
   * harness did". This goes through `setOverlay`, the same action the menu
   * calls, and rows that are about the arming read `overlays()` instead.
   */
  setOverlay(key: string, value: boolean): void;
  /**
   * THE PARALLAX COMPOSITE, AND ITS THREE INPUTS SEPARATELY.
   *
   * It is NOT in `overlays()` — it stopped being an overlay key when it became
   * tab-scoped (EW-SHAPE-PREVIEW), and it could not stay one: `on` is true for
   * an author whose stored `choice` is `null`, which no boolean record can say.
   *
   * A harness gets all four because the interesting failures are the ones where
   * they disagree — a preview drawn in the wrong facet, a default speaking over
   * a recorded choice, a choice recorded by a click that should have been a
   * no-op. `on` is the app's own derivation, not a second one computed here.
   */
  parallaxPreview(): { on: boolean; choice: boolean | null; facet: string; subTab: string };
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
    /**
     * Put the store in EXACTLY the state a FAILED build leaves behind, without
     * running one.
     *
     * `BuildPanel` is a pure function of five store fields — `buildPanelOpen`,
     * `buildState`, `buildOutput`, `buildSummary`, `buildMissingEnv` — and this
     * writes the same object `aetherStore.build()`'s failure branch writes
     * (state 'failed', the process output, a `Build failed (exit N)` summary,
     * panel open). The ONLY thing skipped is spawning build.sh, which the panel
     * cannot observe.
     *
     * It exists because the alternative for a layout harness is
     * `aether.build()`, and that runs a REAL aeon build in a REAL project tree
     * and then reloads a REAL emulator — three side effects a question about
     * where a column's bottom edge lands has no business having.
     */
    showFailedBuild(lines: string[], exitCode?: number): void;
  };
  /**
   * The classic "Edit art…" action, exactly as the object UI runs it (tab
   * activation owns the document lifecycle). Resolves true when the object's
   * sprite-doc ended up checked out.
   */
  /** Open an object's sprite doc (numeric id) or a NAMED art doc (string key
   *  from S1_NAMED_ART_DOCS, e.g. 'gameover') — the same tab-open the sprite
   *  list / Explorer rows drive, so harnesses can exercise level-free named
   *  opens even while the zone-gated sprite list is unmounted. */
  editObjectArt(id: number | string): Promise<boolean>;
  /**
   * The checked-out sprite document's timeline state, read from the store (not
   * from any loader's return value): the anim picker's contents with full
   * per-step data, and the steps currently loaded in the playable timeline.
   */
  spriteState(): {
    activeDocId: string | null;
    frames: number;
    anims: {
      name: string; synced?: boolean; note?: string;
      /** Sonic special-script entries: the Sonic_Animate mode (walkrun/roll/push). */
      dynamic?: string;
      steps: { frameIndex: number; duration: number; xFlip?: boolean; yFlip?: boolean }[];
    }[];
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
    /**
     * Per-frame FNV-1a (32-bit, 8 hex digits) over the frame's index bytes —
     * lets a harness assert WHICH pixels a frame holds (e.g. the spring's
     * sideways frames drawing Nem_VSpring), not merely that some exist. The
     * unit domain (s1-open-refusal.test.ts) computes the same hash over the
     * same openDiscoveredSet output, so a constant measured there is
     * comparable here.
     */
    frameHashes: string[];
  };
  /**
   * The sprite editor's active palette source + colors — lets a harness assert
   * a checkout SEEDED the right colors (e.g. a named family's palFile line —
   * Pal_Title line 1 for titlesonic), not merely that pixels exist. `mode` is
   * the store's paletteMode; colors are the 16 standalone RGBA entries.
   */
  spritePalette(): { mode: string; colors: { r: number; g: number; b: number; a: number }[] };
  /**
   * Paint ONE pixel of one frame through the REAL edit path (selectFrame +
   * setBuffer, which records undo + flips unsavedEdits exactly like a canvas
   * stroke commit). The deterministic seam under the mouse — same rationale as
   * `aether.push`: the save-back harness proves the store -> delta writer ->
   * guarded IPC path, and canvas hit-testing is exercised by humans/CDP
   * clicks elsewhere. Returns false (and paints nothing) when the frame or
   * pixel is out of range.
   */
  spritePaint(frameIndex: number, x: number, y: number, value: number): boolean;
  /**
   * The checked-out sprite document's SAVE-BACK posture, read from the store:
   * where an in-place save would write, with which writer inputs, or why it
   * refuses. The save-back harness's capture assertion.
   */
  spriteSaveInfo(): {
    relPath: string | null;
    compression: string | null;
    hasDplc: boolean;
    refusal: string | null;
    unsavedEdits: boolean;
  };
  /**
   * The Sonic dynamic-preview surface: which special anim the timeline has
   * active, the scrubbed interpreter inputs, and the LAST published sample —
   * `sample.hold`+1 is the cadence in editor ticks, `sample.tick` advances
   * while the preview is live (poll twice to prove liveness).
   */
  sonicPreview(): {
    active: boolean;
    name: string | null;
    mode: string | null;
    inertia: number;
    angle: number;
    xflip: boolean;
    sample: { tick: number; frame: number; xFlip: boolean; yFlip: boolean; variant: string; hold: number } | null;
  };
  /**
   * Scrub the dynamic preview's inputs through the SAME store setters the
   * sliders call (deterministic seam under the slider, same rationale as
   * spritePaint under the canvas). Omitted fields are left untouched.
   */
  sonicScrub(v: { inertia?: number; angle?: number; xflip?: boolean }): void;
  /** Currently-visible toast messages (they expire — poll while waiting). */
  toasts(): { message: string; type: string }[];
  /**
   * Push toasts through the SAME `addToast` every producer calls — the
   * deterministic seam under a flood, on exactly the rationale `spritePaint` has
   * under the canvas.
   *
   * WHY A HOOK RATHER THAN A REAL FLOOD. `MAX_VISIBLE_TOASTS` is the LAST line,
   * not the only one: it bounds what is PAINTED, while each producer is
   * responsible for how many toast objects it builds. Every loop-shaped producer
   * found by an AST containment scan over `src` has since been bounded —
   *   • the aeon loader's 63 unreadable-section-file notices → one (load.ts);
   *   • the two effects library loaders, whose count was a directory listing's
   *     length → one each (core/formats/effects/{scene,preset}.ts);
   *   • `saveAllSpriteArt` and the canvas Save-All loop, one toast per dirty
   *     document → one summary per channel (state/save-outcome-report.ts).
   * `saveAllDirty` is often miscounted as a flood: it toasts once per failed
   * SAVER, and there are exactly four, registered by fixed id.
   *
   * So no project on disk puts twelve toasts on screen any more, and the only
   * honest way to drive the overflow row in the running app is to add them the
   * way the app itself does. This hook is that instrument — deliberately the one
   * unbounded `addToast` loop left in the tree, because its whole job is to
   * exceed the cap on demand.
   */
  pushToasts(items: { message: string; type: ToastType }[]): void;
}

/** The file's fnv1a as 8 hex digits — the frameHashes encoding. Mirrored in
 *  s1-open-refusal.test.ts — keep the two implementations equivalent. */
function frameHash(d: Uint8Array): string {
  return fnv1a(d, 0, d.length).toString(16).padStart(8, '0');
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
      showFailedBuild: (lines, exitCode = 1) => useAetherStore.setState({
        buildState: 'failed',
        buildOutput: lines.slice(-500),
        buildSummary: `Build failed (exit ${exitCode})`,
        buildMissingEnv: [],
        buildPanelOpen: true,
      }),
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
    overlays: () => ({ ...useViewStore.getState().overlays }) as unknown as Record<string, boolean>,
    setOverlay: (k, v) => useViewStore.getState()
      .setOverlay(k as keyof ReturnType<typeof useViewStore.getState>['overlays'], v),
    parallaxPreview: () => ({
      on: parallaxPreviewOn(),
      choice: useViewStore.getState().parallaxPreview,
      facet: useWorkspaceStore.getState().facetFor(useSessionStore.getState().activeId),
      subTab: useEditorStore.getState().effectsSubTab,
    }),
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
      const { editObjectArt, editNamedArtDoc } = await import('./components/sprite/export-sprite');
      if (typeof id === 'string') return editNamedArtDoc(id);
      return editObjectArt(id);
    },
    spriteState: () => {
      const s = useSpriteStore.getState();
      return {
        activeDocId: s.activeDocId,
        frames: s.frames.length,
        anims: s.characterAnims.map((a) => ({
          name: a.name, synced: a.synced, note: a.note,
          dynamic: a.dynamic?.mode,
          steps: a.steps.map((st) => ({ ...st })),
        })),
        steps: s.steps.map((st) => ({ ...st })),
        unsavedEdits: s.unsavedEdits,
        frameW: s.frames[0]?.width ?? 0,
        frameH: s.frames[0]?.height ?? 0,
        frameCoverage: s.frames.map((f) => {
          let n = 0;
          for (let i = 0; i < f.data.length; i++) if (f.data[i] !== 0) n++;
          return n;
        }),
        frameHashes: s.frames.map((f) => frameHash(f.data)),
      };
    },
    spritePalette: () => {
      const s = useSpriteStore.getState();
      return { mode: s.paletteMode, colors: s.standalonePalette.map((c) => ({ ...c })) };
    },
    spritePaint: (frameIndex, x, y, value) => {
      const s = useSpriteStore.getState();
      if (frameIndex < 0 || frameIndex >= s.frames.length) return false;
      s.selectFrame(frameIndex);
      const cur = useSpriteStore.getState().frames[frameIndex];
      if (x < 0 || x >= cur.width || y < 0 || y >= cur.height) return false;
      const data = cur.data.slice();
      data[y * cur.width + x] = value & 0xf;
      useSpriteStore.getState().setBuffer({ width: cur.width, height: cur.height, data });
      return true;
    },
    spriteSaveInfo: () => {
      const s = useSpriteStore.getState();
      return {
        relPath: s.s1ArtSource?.relPath ?? null,
        compression: s.s1ArtSource?.compression ?? null,
        hasDplc: !!s.s1ArtSource?.dplc,
        refusal: s.saveBackRefusal,
        unsavedEdits: s.unsavedEdits,
      };
    },
    sonicPreview: () => {
      const s = useSonicPreviewStore.getState();
      return {
        active: s.active !== null,
        name: s.active?.name ?? null,
        mode: s.active?.mode ?? null,
        inertia: s.inertia,
        angle: s.angle,
        xflip: s.xflip,
        sample: s.sample ? { ...s.sample } : null,
      };
    },
    sonicScrub: (v) => {
      const s = useSonicPreviewStore.getState();
      if (v.inertia !== undefined) s.setInertia(v.inertia);
      if (v.angle !== undefined) s.setAngle(v.angle);
      if (v.xflip !== undefined) s.setXflip(v.xflip);
    },
    toasts: () => useToastStore.getState().toasts.map((t) => ({ message: t.message, type: t.type })),
    pushToasts: (items) => {
      for (const it of items) useToastStore.getState().addToast(it.message, it.type);
    },
  };
  (window as unknown as { __dbg: DebugApi }).__dbg = dbg;
}
