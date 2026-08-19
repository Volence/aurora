// classicLevelStore — the currently-open classic (Sonic 1) level: which act is
// selected, its loaded LevelDoc, per-domain dirty tracking, chunk content
// versions, and the classic editing commands on the per-document undo stacks.
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
// UNDO INTEGRATION (spec §4.3): classic editing has TWO undo documents, not one.
// Layout data (fg, bg, objects, start) is act-scoped and lives on the act's
// `level:<zone>:<act>` stack; zone art (tiles, blocks, chunks, palette, colind)
// is zone-scoped and lives on `zoneart:<zone>`. Both stacks hang off the
// DocumentHistoryHub, so a palette edit no longer invalidates a layout redo —
// which is exactly what the old single whole-document classic history did.
// Undo/redo are not store actions at all: the UI drives the FOCUSED document's
// stack (editorStore.focusedHistory), and the stack calls back into the snapshot
// writers below.

import { create } from 'zustand';
import type { DirtyDomains, EditableTileRange, LevelDoc, ZoneActRef } from '../../core/project/adapter';
import { tileLockReason } from '../../core/project/editable-tiles';
import type { SurfaceEditPlan, PaintMode as SurfaceDivergeMode } from '../../core/art/classic-surface-plan';
import type { BlockDef, ChunkCell, ChunkDef256 } from '../../core/level-classic/model';
import type { CanvasCommitPlan } from '../../core/art/classic-commit-plan';
import {
  validateLevelDoc, unpackChunkCell, chunkIndexForId, MAX_ADDRESSABLE_CHUNKS,
} from '../../core/level-classic/model';
import {
  firstEditableChunkId, firstEditableNonBlankTile, firstNonBlankBlock, landingPaletteLine,
} from '../../core/level-classic/tile-pick';
import type { S1ObjectEntry } from '../../core/formats/classic/s1-objpos';
import {
  LAYOUT_DOMAINS, ART_DOMAINS, pickDomainDirty, restoreDomainDirty,
  ClassicArtHistory, ClassicLayoutHistory,
  type ClassicArtSnapshot, type ClassicLayoutSnapshot,
} from '../../core/editing/classic-domain-history';
import { classicLevelTab, zoneArtDocId } from '../shell/tabs';
import { documentHistoryHub } from './history-hub';
import { useClassicProjectStore } from './classicProjectStore';
// One tool vocabulary (spec §3.6): the tool classic paints with lives in
// editorStore now. Safe direction — editorStore does not import this store.
import { useEditorStore } from './editorStore';

export type ClassicLevelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Outcome of a classic editing command: applied, or atomically rejected. */
export type CommandResult = { ok: true } | { ok: false; error: string };

/**
 * Outcome of a GROW command (add chunk / add block). Like CommandResult but the
 * success case carries the new entity's id so the caller (Duplicate button / MCP
 * tool) can select it. Structurally assignable to CommandResult, so assertCommand
 * accepts it.
 */
export type AddResult = { ok: true; id: number } | { ok: false; error: string };

/** Which composer tab is active (shared selection context, Task B3). */
export type ComposerTab = 'chunk' | 'block' | 'tile';

/**
 * A composer tab's Assign|Paint mode (Task 11). 'assign' is the tab's original
 * grid-assignment behaviour; 'paint' composes the tier's surface and mounts the
 * shared pixel substrate. Named apart from `PaintMode` (classic-surface-plan.ts,
 * imported here as `SurfaceDivergeMode`) on purpose — that one is Link|Isolate,
 * an unrelated axis a Paint-mode gesture resolves under, not a tier's mode.
 */
export type TierPaintMode = 'assign' | 'paint';

/**
 * An edit counter per dirty domain. See `domainGen` on the store.
 *
 * A counter, not a timestamp: two edits inside one millisecond are two edits,
 * and the only question ever asked of it is "is this the same value I read
 * before the await".
 */
export type DomainGen = Partial<Record<keyof DirtyDomains, number>>;

/** The counters for `domains`, each moved on. */
function bumpDomainGen(prev: DomainGen, domains: readonly (keyof DirtyDomains)[]): DomainGen {
  const next = { ...prev };
  for (const d of domains) next[d] = (next[d] ?? 0) + 1;
  return next;
}

export type LayoutPlane = 'fg' | 'bg';

// The active layout-editing tool used to live here as `ClassicTool`
// ('pan' | 'stamp' | 'object'). It is now `editorStore.tool`, one vocabulary for
// both engines (spec §3.6): pan → view, stamp → stamp-chunk, and the
// dual-purpose `object` split into the two tools it always was — `select` when
// nothing is armed, `place-object` when something is. See classic-placement.ts.

interface ClassicLevelState {
  /** The act currently selected in the zone tree (even while loading/errored). */
  ref: ZoneActRef | null;
  /** The loaded document, present only in the 'ready' state. */
  doc: LevelDoc | null;
  status: ClassicLevelStatus;
  /** Human-readable failure reason when status === 'error'. */
  error: string | null;

  /**
   * Level-pool tiles this act's objects draw through mappings rather than
   * blocks (GHZ platforms, MZ bricks, …) — see `ClassicLevelAccess.reservedTiles`'s
   * docblock for the full rule. Captured HERE, at act read, the same moment and
   * the same way `editableTileRange` is (openAct below) — not recomputed lazily
   * per render — because `planSurfaceEdit`'s call site (ChunkTab/BlockTab's paint
   * mode) needs one stable value for the whole open act, not a fresh adapter call
   * on every keystroke. Null when unknown (no handle, adapter omits the query, or
   * the act has not finished loading) — PERMISSIVE, matching `editableTileRange`'s
   * null convention: `planSurfaceEdit` treats an absent set as "nothing reserved",
   * never as "refuse everything".
   *
   * NOT a lock and must never be folded into `dirty`/`tileLockReason` — painting
   * a reserved tile in place is a legitimate edit (see the adapter docblock).
   */
  reservedTiles: ReadonlySet<number> | null;

  /** Per-domain unsaved-change flags (adapter DirtyDomains shape). */
  dirty: DirtyDomains;
  /**
   * A counter per domain, bumped every time that domain's CONTENT changes.
   *
   * The dirty flags alone cannot answer the question a save has to ask. A save
   * snapshots the doc, awaits real IPC, and then clears what it wrote — but an
   * edit committed while the write was in flight is not in the bytes that
   * landed, so clearing its flag loses it silently: no tab dot, no close
   * prompt, and the next Ctrl+S answers "nothing to save". Comparing these
   * counters across the await is what tells the saver which domains are still
   * the ones it wrote.
   */
  domainGen: DomainGen;
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

  // --- Finer content clocks -------------------------------------------------
  // `chunkEpoch` above is deliberately COARSE: chunk art bakes blocks, tiles and
  // palette, so all three must invalidate it. But most consumers do NOT depend on
  // all three, and re-keying them on the coarse epoch is pure redundant work —
  // a single pencil stroke in the tile composer was rebuilding every object
  // sprite in the act (IPC re-read + Nemesis re-decode + createImageBitmap) and
  // repainting all ~965 tile thumbnails.
  //
  // These clocks are ADDITIVE — `chunkEpoch` keeps its exact prior meaning and
  // every existing consumer of it is untouched. They are drawn from the SAME
  // monotonic allocator as `chunkEpoch`/`chunkVersions`, so values are directly
  // comparable across clocks (see core/level-classic/object-sprite-clock).

  /**
   * Bumps ONLY when a palette line is written. Every object sprite and every
   * tile/block thumbnail bakes palette colors, so all of them key on this.
   */
  paletteEpoch: number;
  /**
   * Bumps ONLY when tile-pool pixels are written. LevelArt-sourced object
   * sprites (GHZ platforms, collapsing ledges, MZ bricks, …) draw from
   * `doc.tiles` and so depend on this; file-backed (`.nem`) sprites do not.
   */
  tileEpoch: number;
  /**
   * Per-tile content version, the tile-pool analogue of `chunkVersions`: a
   * pencil stroke bumps only the tile(s) it wrote, so the composer's tile strip
   * repaints one thumbnail instead of all of them. Not snapshotted — an
   * undo/redo instead allocates fresh epochs (see writeArtSnapshot), which
   * invalidates everything and is correct, if coarse, for a rare operation.
   */
  tileVersions: Map<number, number>;

  /**
   * Layout-editing UI state (Task 13, spec §3 M5). Not doc data and NOT part of
   * an undo snapshot: undo/redo restore the document, never the tool/selection.
   * The TOOL itself is no longer here — see the note above the state interface.
   */
  /** The chunk id the stamp tool paints (0..255); also the eyedropper target. */
  selectedChunkId: number;
  /**
   * The level-pixel point last clicked on the Collision facet, or null.
   *
   * `view` is the Collision facet's DEFAULT tool, so a left-drag pans and a
   * right-click still eyedrops a chunk into `selectedChunkId`. Neither tells
   * the Collision panel WHERE the user clicked, and there was no channel for a
   * tool that writes nothing to report a point at all. This is that channel:
   * set from the viewport's left-click path whenever the collision facet is
   * active — including under `view`, so the readout can be consulted BEFORE
   * deciding to write — and read by the panel to call `probeCollision`.
   *
   * LEVEL PIXELS, not layout cells and not client/screen coordinates —
   * `probeCollision(doc, x, y)` takes level pixels, so storing anything else
   * here would need a silent unit conversion at every read site.
   *
   * UI state, not doc data: not part of an undo snapshot, and cleared on every
   * act change (openAct's `fresh`) because a point that survived would have the
   * panel confidently describing a cell in an act the user is no longer looking
   * at — worse than showing nothing.
   */
  collisionProbe: { x: number; y: number } | null;
  /** The shape the picker last armed, applied by a swatch click and by the
   *  paint-collision tool. Null until the user picks one. */
  collisionShape: number | null;
  /**
   * Link | Isolate for COLLISION writes, defaulting to Link.
   *
   * Deliberately NOT the art tiers' `paintDivergeMode`, though the concept is
   * the same: that field initialises to 'isolate' and is sticky across
   * surfaces, so sharing it would (a) default this facet to the block-spending,
   * table-growing path against spec §4.5, and (b) mean setting Link here
   * silently re-arms Link in the art composer, where the next stroke propagates
   * pixels to every use of a shared tile.
   */
  collisionDiverge: 'link' | 'isolate';
  /**
   * Whether the stamp tool writes S1's bit-7 loop flag alongside the chunk id
   * (Task B4). Only meaningful for an armed engine id 1..$7F — air ($00) never
   * loops. UI state (not doc data); the eyedropper syncs it from the picked cell.
   */
  stampLoop: boolean;
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

  // --- Composer dock UI state (Task B3) — shared selection across the three
  // tabs; UI state, NOT part of an undo snapshot. Out-of-range values after an
  // undo/redo are clamped/cleared by the dock (an added chunk/block can be
  // undone away under a stale selection). ---
  /** Which composer tab is active (persists across acts). */
  composerTab: ComposerTab;
  /** The block id the composer edits / paints (0-based; blocks are 0-based in S1). */
  composerBlockId: number;
  /** The tile-pool index the composer edits (0-based). */
  composerTileIndex: number;
  /** The palette line (0-3) the tile editor colors with (seeded from block context). */
  composerPalLine: number;
  /**
   * The Tile tab's copy/paste buffer: 64 palette indices, or null. Pixels are
   * palette-agnostic, so the clipboard deliberately survives act switches
   * (copying GHZ art into MZ is a feature). A workflow preference, not doc data.
   */
  tileClipboard: Uint8Array | null;

  /**
   * Assign | Paint per tier (Task 11, "decided" — paint is an explicit mode, not
   * an armed tool). The assignment grid stays each tab's default; painting is a
   * second mode a user switches INTO. Deliberately NOT derived from
   * `editorStore.tool`: Chunk/Block have no 'assign' member in that union (it
   * would have to be invented), and that union is shared with the sprite editor
   * — a level-art-only member would leak a concept into a surface that can never
   * use it.
   *
   * STORE state, not local `useState` inside the tab, for two reasons: (1)
   * `ClassicComposerDock` unmounts each tab on tab switch
   * (`{tab === 'chunk' && <ChunkTab/>}`), so local state would forget the choice
   * every time the user left and came back; (2) `isClassicPixelTier`
   * (workspace/level-presence.ts) needs THIS SAME value from three call sites
   * that are not ChunkTab/BlockTab at all — ClassicArtToolDock (the tool rail's
   * contents) and LevelWorkspace's `usePixelToolsLive` (the rail's 44px
   * CONTAINER) — so a tab-local toggle could not answer "is this tier live"
   * from outside the tab.
   */
  chunkPaintMode: TierPaintMode;
  blockPaintMode: TierPaintMode;
  /**
   * Link | Isolate for BOTH paint-mode surfaces — a single cross-tier workflow
   * preference, not per-tier: the same shape as `artStore.zoom` (a CROSS-ENGINE
   * SINGLETON, see TileTab.tsx), where the cost of one shared field (a choice
   * made on Chunk carries into Block) is judged worth it over a second toggle
   * that means the same thing. Isolate default; STICKY — not reset in `openAct`'s
   * `fresh` object, because it is a workflow preference like `composerTab`, not
   * per-act document data.
   */
  paintDivergeMode: SurfaceDivergeMode;

  /** Select + load an act. Reads through the open project's handle. */
  openAct: (ref: ZoneActRef) => Promise<void>;
  setSelectedChunkId: (chunkId: number) => void;
  /** Record (or clear, with null) the Collision facet's last-clicked point. */
  setCollisionProbe: (point: { x: number; y: number } | null) => void;
  /** Arm (or clear, with null) the shape a swatch click or paint-collision applies. */
  setCollisionShape: (shape: number | null) => void;
  /** Switch the Collision facet's write mode between Link and Isolate. */
  setCollisionDiverge: (mode: 'link' | 'isolate') => void;
  /**
   * The Composer picker's plain left-click select: sets the chunk AND arms the
   * stamp tool (unless it's already active). Distinct from setSelectedChunkId
   * because the viewport's right-click eyedrop also sets the selection and must
   * NOT force a tool switch mid-pan/mid-object-edit.
   */
  selectChunkForStamp: (chunkId: number) => void;
  setStampLoop: (loop: boolean) => void;
  setSelectedObjectIndex: (index: number | null) => void;
  setArmedObjectId: (id: number | null) => void;
  setComposerTab: (tab: ComposerTab) => void;
  setComposerBlockId: (id: number) => void;
  setComposerTileIndex: (index: number) => void;
  setComposerPalLine: (line: number) => void;
  setTileClipboard: (px: Uint8Array | null) => void;
  setChunkPaintMode: (mode: TierPaintMode) => void;
  setBlockPaintMode: (mode: TierPaintMode) => void;
  setPaintDivergeMode: (mode: SurfaceDivergeMode) => void;
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
  /**
   * `atGen` is the `domainGen` the saver read BEFORE its write. A domain whose
   * counter has moved since was edited mid-save, is not in the bytes that
   * landed, and is left dirty. Returns the domains it withheld, so the caller
   * can say so rather than reporting a clean save.
   */
  markDomainsClean: (
    ref: ZoneActRef, domains: (keyof DirtyDomains)[], atGen?: DomainGen,
  ) => (keyof DirtyDomains)[];
  reset: () => void;
}

const IDLE = {
  ref: null,
  doc: null,
  status: 'idle' as ClassicLevelStatus,
  error: null,
  reservedTiles: null as ReadonlySet<number> | null,
  dirty: {} as DirtyDomains,
  domainGen: {} as DomainGen,
  chunkVersions: new Map<number, number>(),
  chunkEpoch: 0,
  paletteEpoch: 0,
  tileEpoch: 0,
  tileVersions: new Map<number, number>(),
  selectedChunkId: 0,
  collisionProbe: null as { x: number; y: number } | null,
  collisionShape: null as number | null,
  // Link, not Isolate: the non-destructive path (spec §4.5) — see the field's
  // docblock in the state interface for why this is not shared with
  // paintDivergeMode, which defaults the other way.
  collisionDiverge: 'link' as 'link' | 'isolate',
  stampLoop: false,
  selectedObjectIndex: null as number | null,
  armedObjectId: null as number | null,
  composerTab: 'chunk' as ComposerTab,
  composerBlockId: 0,
  composerTileIndex: 0,
  composerPalLine: 0,
  tileClipboard: null as Uint8Array | null,
  chunkPaintMode: 'assign' as TierPaintMode,
  blockPaintMode: 'assign' as TierPaintMode,
  paintDivergeMode: 'isolate' as SurfaceDivergeMode,
};

// ---------------------------------------------------------------------------
// Undo documents + version clock
// ---------------------------------------------------------------------------

/** The layout doc id for the act currently loaded in this store, or null. */
export function layoutDocIdForCurrentAct(): string | null {
  const { ref } = useClassicLevelStore.getState();
  return ref ? classicLevelTab(ref).id : null;
}

/** The zone-art doc id for the zone currently loaded in this store, or null. */
export function zoneArtDocIdForCurrentZone(): string | null {
  const { ref } = useClassicLevelStore.getState();
  return ref ? zoneArtDocId(ref.zone) : null;
}

/**
 * Drop `ref`'s two undo stacks. Undo never crosses a level load: the snapshots
 * hold references into the doc that was loaded when they were taken, so replaying
 * them onto a freshly-read doc would splice one act's data into another.
 */
function disposeStacksFor(ref: ZoneActRef | null): void {
  if (!ref) return;
  documentHistoryHub.dispose(classicLevelTab(ref).id);
  documentHistoryHub.dispose(zoneArtDocId(ref.zone));
}

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
    // empty history (undo never crosses a level load) — for the act being left as
    // well as the one being entered, since both docs are about to be re-read.
    disposeStacksFor(get().ref);
    disposeStacksFor(ref);
    const fresh = {
      // Unknown until the read below succeeds — a stale set from the PRIOR act
      // would misdescribe this one (different zone, different object list).
      reservedTiles: null as ReadonlySet<number> | null,
      dirty: {} as DirtyDomains,
      domainGen: {} as DomainGen,
      chunkVersions: new Map<number, number>(),
      chunkEpoch: nextVersion(),
      // Fresh finer clocks too: a new act has a new palette and a new tile pool,
      // so every sprite/thumbnail cached against the old act's clocks is stale.
      paletteEpoch: nextVersion(),
      tileEpoch: nextVersion(),
      tileVersions: new Map<number, number>(),
      // Chunk ids are per-act, so a fresh act resets the stamp selection (the tool
      // choice persists — it's a workflow preference, not level data). $00 (air)
      // is the value for the states BELOW this line — loading, and the two error
      // paths, where there is no pool to pick from; a successful read replaces it
      // with firstEditableChunkId(doc.chunks).
      selectedChunkId: 0,
      // A probed point names a cell in THIS act's layout; carrying it into a
      // freshly-loaded act would have the Collision panel confidently
      // describing a cell the user is no longer looking at.
      collisionProbe: null as { x: number; y: number } | null,
      // An armed shape names an index into THIS act's shape table (and belongs
      // to the block the user was looking at) — cleared per act, same reason as
      // collisionProbe just above. collisionDiverge is deliberately NOT reset
      // here: Link/Isolate is a standing preference, like a tool choice, not
      // per-act document data (compare paintDivergeMode, also absent from `fresh`).
      collisionShape: null as number | null,
      stampLoop: false,
      // Object selection + place-arm are per-act too (indices/ids into this act's
      // object list), so a fresh act clears them.
      selectedObjectIndex: null,
      armedObjectId: null,
      // Composer block/tile/palette selections index THIS act's data, so a fresh
      // act resets them to 0 (the dock open/tab state are workflow preferences and
      // persist — they're not touched here).
      composerBlockId: 0,
      composerTileIndex: 0,
      composerPalLine: 0,
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
      // Land the Chunk/Block/Tile tabs on something visible: block $000 / tile
      // $000 are blank in every stock act, and an empty black square /
      // checkerboard on first open reads as "broken".
      //
      // The CHUNK one is not cosmetic. `fresh` above resets the selection to $00
      // because chunk ids are per-act — but $00 is air, the one id with no data
      // behind it, so the Art facet's whole resting state was the Chunk tab's
      // "not editable" message over an empty preview. Landing on the first real
      // chunk is the same "pick something a user can see" rule the other two
      // already followed, applied to the tier that needed it most.
      //
      // It lands here rather than in the Art facet on entry BECAUSE the
      // selection is shared with the map's stamp target: a facet-entry effect
      // would rewrite a choice the user made on Layout (picking air to erase
      // with is a real choice), where an open-time default overrides nothing.
      const range = handle.levels.editableTileRange?.(ref) ?? null;
      // T4: the tiles this act's object sprites draw from the level pool
      // through mappings, not blocks — captured HERE, beside the range above,
      // so `planSurfaceEdit`'s call site (ChunkTab/BlockTab's paint mode) reads
      // one stable value for the act rather than re-querying the adapter per
      // gesture. See the `reservedTiles` field's docblock for why this is not a
      // lock and must never be merged into `range`/`tileLockReason`.
      const reserved = handle.levels.reservedTiles?.(ref) ?? null;
      // The palette line goes with them, and for the same reason one tier down:
      // the Block and Tile tiers draw the SAME tile strip under two different
      // fields (the landing block's cell pal vs `composerPalLine`), and
      // `composerPalLine` had no seed at all — so a cold open showed Green Hill's
      // tileset green on Block and red on Tile, one tab click apart. Seeded from
      // the block that was just picked, not merged with it; see
      // core/level-classic/tile-pick.ts:landingPaletteLine.
      const blockId = firstNonBlankBlock(doc.blocks, doc.tiles);
      set({
        ref, doc, status: 'ready', error: null,
        reservedTiles: reserved,
        selectedChunkId: firstEditableChunkId(doc.chunks),
        composerTileIndex: firstEditableNonBlankTile(doc.tiles, range),
        composerBlockId: blockId,
        composerPalLine: landingPaletteLine(doc.blocks, blockId),
      });
    } catch (e) {
      if (token !== loadToken) return;
      set({ ref, doc: null, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  setSelectedChunkId: (chunkId: number) => {
    if (Number.isInteger(chunkId) && chunkId >= 0 && chunkId <= 0xff) set({ selectedChunkId: chunkId });
  },
  setCollisionProbe: (point: { x: number; y: number } | null) => set({ collisionProbe: point }),
  setCollisionShape: (shape: number | null) => set({ collisionShape: shape }),
  setCollisionDiverge: (mode: 'link' | 'isolate') => set({ collisionDiverge: mode }),
  selectChunkForStamp: (chunkId: number) => {
    if (!Number.isInteger(chunkId) || chunkId < 0 || chunkId > 0xff) return;
    set({ selectedChunkId: chunkId });
    // Selecting a chunk expresses intent to stamp it (user feedback, stage-3
    // smoke test) — arm the stamp tool, but only if it isn't already active.
    // The guard is not just an optimisation: setTool also clears the aeon
    // selection and cancels an in-progress paste, so an unconditional call
    // would make a no-op chunk re-select destroy unrelated state.
    const editor = useEditorStore.getState();
    if (editor.tool !== 'stamp-chunk') editor.setTool('stamp-chunk');
  },
  setStampLoop: (loop: boolean) => set({ stampLoop: loop }),
  setSelectedObjectIndex: (index: number | null) => set({ selectedObjectIndex: index }),
  // Arming an object for placement is mutually exclusive with a live selection:
  // clear the selection so the inspector reflects the pending placement, not a
  // still-selected object.
  setArmedObjectId: (id: number | null) =>
    set(id === null ? { armedObjectId: null } : { armedObjectId: id, selectedObjectIndex: null }),

  setComposerTab: (tab: ComposerTab) => set({ composerTab: tab }),
  setComposerBlockId: (id: number) => {
    if (Number.isInteger(id) && id >= 0) set({ composerBlockId: id });
  },
  setComposerTileIndex: (index: number) => {
    if (Number.isInteger(index) && index >= 0) set({ composerTileIndex: index });
  },
  setComposerPalLine: (line: number) => {
    if (Number.isInteger(line) && line >= 0 && line <= 3) set({ composerPalLine: line });
  },
  setTileClipboard: (px: Uint8Array | null) => {
    if (px === null || px.length === 64) set({ tileClipboard: px });
  },
  setChunkPaintMode: (mode: TierPaintMode) => set({ chunkPaintMode: mode }),
  setBlockPaintMode: (mode: TierPaintMode) => set({ blockPaintMode: mode }),
  setPaintDivergeMode: (mode: SurfaceDivergeMode) => set({ paintDivergeMode: mode }),

  markDomainsClean: (ref, domains, atGen) => {
    const s = get();
    // Only touch the currently-open act (the saver clears exactly what it wrote).
    if (!s.ref || s.ref.zone !== ref.zone || s.ref.act !== ref.act) return domains;
    const dirty = { ...s.dirty };
    const withheld: (keyof DirtyDomains)[] = [];
    for (const d of domains) {
      if (atGen && (s.domainGen[d] ?? 0) !== (atGen[d] ?? 0)) { withheld.push(d); continue; }
      delete dirty[d];
    }
    set({ dirty });
    return withheld;
  },

  reset: () => {
    loadToken++; // invalidate any in-flight read
    disposeStacksFor(get().ref);
    set({ ...IDLE, chunkVersions: new Map() });
  },
}));

// ---------------------------------------------------------------------------
// Snapshot read/write — the stacks' window onto this store. Exported because
// history-factories.ts hands them to the ClassicLayoutHistory / ClassicArtHistory
// it builds; that is the only non-test caller.
// ---------------------------------------------------------------------------

export function readLayoutSnapshot(): ClassicLayoutSnapshot {
  const s = useClassicLevelStore.getState();
  const doc = s.doc!;
  return {
    fg: doc.fg, bg: doc.bg, objects: doc.objects, start: doc.start,
    dirty: pickDomainDirty(s.dirty, LAYOUT_DOMAINS),
  };
}

export function writeLayoutSnapshot(snap: ClassicLayoutSnapshot): void {
  useClassicLevelStore.setState((s) => ({
    doc: { ...s.doc!, fg: snap.fg, bg: snap.bg, objects: snap.objects, start: snap.start },
    dirty: restoreDomainDirty(s.dirty, snap.dirty, LAYOUT_DOMAINS),
    // An undo/redo is a content change like any other — the whole scope moves,
    // so a save in flight over any of it no longer wrote what is now resident.
    domainGen: bumpDomainGen(s.domainGen, LAYOUT_DOMAINS),
  }));
}

export function readArtSnapshot(): ClassicArtSnapshot {
  const s = useClassicLevelStore.getState();
  const doc = s.doc!;
  return {
    chunks: doc.chunks, blocks: doc.blocks, tiles: doc.tiles,
    palettes: doc.palettes, colind: doc.collision.colind,
    chunkVersions: s.chunkVersions, chunkEpoch: s.chunkEpoch,
    dirty: pickDomainDirty(s.dirty, ART_DOMAINS),
  };
}

export function writeArtSnapshot(snap: ClassicArtSnapshot): void {
  useClassicLevelStore.setState((s) => ({
    doc: {
      ...s.doc!,
      chunks: snap.chunks, blocks: snap.blocks, tiles: snap.tiles, palettes: snap.palettes,
      collision: { ...s.doc!.collision, colind: snap.colind },
    },
    dirty: restoreDomainDirty(s.dirty, snap.dirty, ART_DOMAINS),
    domainGen: bumpDomainGen(s.domainGen, ART_DOMAINS),  // see writeLayoutSnapshot
    chunkVersions: snap.chunkVersions,
    chunkEpoch: snap.chunkEpoch,
    // The finer clocks are NOT snapshotted: an art undo/redo can revert tiles,
    // blocks, AND palette in one step, so the cheapest correct thing is to
    // allocate fresh epochs and let everything re-derive. That over-invalidates
    // (a full sprite + thumbnail rebuild) but only on an explicit, rare undo —
    // never on the per-stroke path this split exists to keep cheap. Keeping a
    // snapshot of them would have to ripple through ClassicArtSnapshot for no
    // benefit on the hot path.
    paletteEpoch: nextVersion(),
    tileEpoch: nextVersion(),
    tileVersions: new Map<number, number>(),
  }));
}

// ---------------------------------------------------------------------------
// Commit — the ONE place a validated edit becomes state: records a single undo
// step on the edited DOCUMENT's stack, then applies the new doc + dirty flags +
// version bump. Layout and art commit separately so their timelines are
// independent (spec §4.3).
// ---------------------------------------------------------------------------

type VersionEffect =
  | { kind: 'none' }
  | { kind: 'chunk'; id: number }
  /**
   * Every chunk's art changed. `tiles` optionally names the tile-pool indices
   * that were rewritten, so the composer's tile strip can repaint just those
   * thumbnails instead of the whole pool. Omitting it is always safe (the strip
   * then falls back to the palette clock); it is purely a narrowing hint.
   */
  | { kind: 'all'; tiles?: readonly number[] };

/**
 * The split is only sound while every commit site is single-domain: a patch that
 * spans both lists would be recorded on one stack and silently un-undoable from
 * the other. Fail loudly instead of letting a future call site rot the invariant.
 */
function assertSingleDomain(
  fn: 'commitLayout' | 'commitArt',
  dirtyPatch: DirtyDomains,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(dirtyPatch)) {
    if (!allowed.includes(key)) {
      throw new Error(
        `${fn} was given the dirty domain '${key}', which belongs to the other classic ` +
          `undo document (allowed here: ${allowed.join(', ')}). Split the edit into one ` +
          `commit per document.`,
      );
    }
  }
}

/**
 * The hub's `level:`/`zoneart:` factories dispatch on `classicIsOpen()` at stack
 * CONSTRUCTION time (history-factories.ts), so a stack built while the classic
 * project store is anything but 'open' — the `status: 'opening'` window, say,
 * with a previous project's level tabs still in the strip — is an aeon
 * BoundEditHistory with no `record` method. A cast would hand that back and blow
 * up as "record is not a function" deep inside an edit, naming nothing. Check
 * instead, and say which document produced what.
 */
function requireClassicHistory<T>(
  id: string,
  ctor: new (...args: never[]) => T,
  stack: unknown,
): T {
  if (!(stack instanceof ctor)) {
    throw new Error(
      `classic commit: document '${id}' holds a ${(stack as object)?.constructor?.name ?? typeof stack}, ` +
        `not a ${ctor.name} — the history factory built it for a different engine ` +
        `(is the classic project actually open?).`,
    );
  }
  return stack;
}

/** Commit an act-scoped layout edit (fg / bg / objects / start). */
export function commitLayout(newDoc: LevelDoc, dirtyPatch: DirtyDomains, ve: VersionEffect): void {
  assertSingleDomain('commitLayout', dirtyPatch, LAYOUT_DOMAINS);
  const id = layoutDocIdForCurrentAct();
  if (id) {
    requireClassicHistory(id, ClassicLayoutHistory, documentHistoryHub.historyFor(id))
      .record(readLayoutSnapshot());
  }
  applyCommit(newDoc, dirtyPatch, ve);
}

/** Commit a zone-scoped art edit (tiles / blocks / chunks / palette / colind). */
export function commitArt(newDoc: LevelDoc, dirtyPatch: DirtyDomains, ve: VersionEffect): void {
  assertSingleDomain('commitArt', dirtyPatch, ART_DOMAINS);
  const id = zoneArtDocIdForCurrentZone();
  if (id) {
    requireClassicHistory(id, ClassicArtHistory, documentHistoryHub.historyFor(id))
      .record(readArtSnapshot());
  }
  applyCommit(newDoc, dirtyPatch, ve);
}

/** Apply a committed edit to the store (shared by both domains; no history). */
function applyCommit(newDoc: LevelDoc, dirtyPatch: DirtyDomains, ve: VersionEffect): void {
  const s = useClassicLevelStore.getState();

  let chunkVersions = s.chunkVersions;
  let chunkEpoch = s.chunkEpoch;
  if (ve.kind === 'chunk') {
    chunkVersions = new Map(s.chunkVersions);
    chunkVersions.set(ve.id, nextVersion());
  } else if (ve.kind === 'all') {
    chunkEpoch = nextVersion();
  }

  // The finer clocks move on WHAT changed, read straight off the dirty patch —
  // which every commit already states truthfully (assertSingleDomain enforces
  // exactly one domain per commit). Deriving them here rather than threading a
  // second signal through every command keeps the commands unchanged and makes
  // it impossible for the two to disagree.
  //
  // Note a block edit bumps NEITHER: no object sprite and no tile thumbnail
  // bakes block data, so a block edit must invalidate none of them (it still
  // bumps chunkEpoch above, which is what repaints chunk art).
  let paletteEpoch = s.paletteEpoch;
  let tileEpoch = s.tileEpoch;
  let tileVersions = s.tileVersions;
  if (dirtyPatch.palette) paletteEpoch = nextVersion();
  if (dirtyPatch.tiles) {
    tileEpoch = nextVersion();
    if (ve.kind === 'all' && ve.tiles) {
      tileVersions = new Map(s.tileVersions);
      for (const t of ve.tiles) tileVersions.set(t, nextVersion());
    }
  }

  useClassicLevelStore.setState({
    doc: newDoc,
    dirty: { ...s.dirty, ...dirtyPatch },
    domainGen: bumpDomainGen(s.domainGen, Object.keys(dirtyPatch) as (keyof DirtyDomains)[]),
    chunkVersions,
    chunkEpoch,
    paletteEpoch,
    tileEpoch,
    tileVersions,
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const err = (error: string): { ok: false; error: string } => ({ ok: false, error });

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

/**
 * The writable tile span for the open act, or null (unknown / fakes).
 *
 * EXPORTED for the agent surface. `useEditableTileRange`
 * (components/classic/composer-shared.tsx:36) is the React-reactive twin of this
 * and is what components use; the agent handler is not a component, and
 * `classicCommitCanvas` below already calls this one.
 */
export function editableTileRange(): EditableTileRange | null {
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
    // chunkId is a RAW layout byte: bits 0-6 = the S1 engine id, bit 7 = S1's
    // loop flag (kept in-band; loop-chunk authoring, Task B4). $00 = air (valid —
    // erases the cell), and engine ids 1..chunks.length map to chunks[id-1].
    // Validate the MASKED engine id against the pool (an un-drawable id can't be
    // baked in) while accepting the full 0..$FF byte range so the loop bit rides
    // along. render/collision both consume `cell & 0x7f`.
    if (!isInt(c.chunkId) || c.chunkId < 0 || c.chunkId > 0xff) {
      return err(`chunk id byte ${c.chunkId} out of range 0..255 (bit 7 = loop flag)`);
    }
    if ((c.chunkId & 0x7f) > doc.chunks.length) {
      return err(`chunk id ${c.chunkId & 0x7f} out of range 0..${doc.chunks.length} (0 = air)`);
    }
  }
  const nextCells = new Uint8Array(grid.cells);
  for (const c of cells) nextCells[c.y * grid.width + c.x] = c.chunkId;
  const nextGrid = { ...grid, cells: nextCells };
  const newDoc: LevelDoc = plane === 'bg' ? { ...doc, bg: nextGrid } : { ...doc, fg: nextGrid };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Layout isn't chunk content → no chunk version bump.
  commitLayout(newDoc, plane === 'bg' ? { bg: true } : { fg: true }, { kind: 'none' });
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
  commitArt(newDoc, { chunks: true }, { kind: 'chunk', id: chunkId });
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
  commitArt(newDoc, { blocks: true }, { kind: 'all' });
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
    // reject them at save). Only enforced when the range is known. Shares ONE
    // predicate with the composer's 🔒 UI (core/project/editable-tiles) so the
    // pencil can never look live on a tile this would refuse.
    const lock = tileLockReason(range, tileIndex);
    if (lock) return err(`tile ${tileIndex} is not editable: ${lock}`);
  }
  const nextTiles = new Uint8Array(doc.tiles);
  for (const { tileIndex, data } of edits) nextTiles.set(data, tileIndex * 32);
  const newDoc: LevelDoc = { ...doc, tiles: nextTiles };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Any tile-pixel change repaints every chunk that uses it — bump the epoch.
  // Naming the written tiles additionally lets the composer's tile strip repaint
  // only those thumbnails (a pencil stroke touches one tile, not the pool).
  commitArt(newDoc, { tiles: true }, { kind: 'all', tiles: edits.map((e) => e.tileIndex) });
  return { ok: true };
}

/**
 * classic:paint-surface — apply one paint gesture across all three art tiers.
 *
 * Composite by design: tile pixels, new blocks, block-cell repoints and chunk-cell
 * repoints land in ONE commitArt, so a stroke that diverges a block is a single
 * Ctrl+Z. Splitting it would let an undo strand a cloned block with nothing
 * pointing at it. Validation mirrors classicEditTiles for tile writes — including
 * the SAME tileLockReason predicate, so a plan can never write a locked tile.
 */
export function classicPaintSurface(plan: SurfaceEditPlan): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');

  const poolTiles = Math.floor(doc.tiles.length / 32);
  const range = editableTileRange();
  for (const { tileIndex, data } of plan.tileWrites) {
    if (!isInt(tileIndex) || tileIndex < 0 || tileIndex >= poolTiles) {
      return err(`tile ${tileIndex} does not exist (0..${poolTiles - 1})`);
    }
    if (!(data instanceof Uint8Array) || data.length !== 32) {
      return err(`tile ${tileIndex} data must be 32 bytes (got ${data?.length})`);
    }
    const lock = tileLockReason(range, tileIndex);
    if (lock) return err(`tile ${tileIndex} is not editable: ${lock}`);
  }

  const nextTiles = plan.tileWrites.length ? new Uint8Array(doc.tiles) : doc.tiles;
  for (const { tileIndex, data } of plan.tileWrites) nextTiles.set(data, tileIndex * 32);

  const nextBlocks = (plan.newBlocks.length || plan.blockCellEdits.length)
    ? doc.blocks.slice() : doc.blocks;
  for (const b of plan.newBlocks) nextBlocks.push({ cells: b.def.cells.map((c) => ({ ...c })) });

  // COLLISION TRAVELS WITH THE CLONE. `colind` is indexed by block id, so an
  // appended block with no entry has undefined collision in game — and an
  // Isolate clone is a copy of a block the artist is painting, usually solid
  // ground. Dropping it turns solid ground into something the player falls
  // through: invisible here (the overlay reads `colind[block] ?? 0`), wrong on
  // hardware. See SurfaceEditPlan.newBlocks for why the source id is carried.
  //
  // THE TABLE MAY START SHORTER THAN THE BLOCK LIST and that is normal, not
  // corruption: GHZ ships 439 blocks against a 410-byte colind. Growing it to
  // cover a new id necessarily defines the entries in between, which this fills
  // with 0 — the same "no collision" answer Aurora's overlay already renders
  // for them, so the game is brought into line with what the editor shows
  // rather than left reading whatever bytes follow the file.
  //
  // KNOWN OPEN QUESTION (CLASSIC-A4, seat evidence, unverified): "whatever bytes
  // follow the file" is not nothing — the ROM resolves the overhang from the
  // adjacent zone's table, so those blocks may have REAL collision in game that
  // Aurora both draws as air and overwrites with zeros here. Reading it would
  // need cross-file reach Aurora does not have, so the behaviour is left as
  // argued above rather than changed on an unverified claim. What HAS been
  // closed is the other direction: s1-io refuses to write a colind SHORTER than
  // the one it read, which would move the overhang boundary silently.
  for (const b of plan.newBlocks) {
    if (b.colind !== undefined && (!isInt(b.colind) || b.colind < 0 || b.colind > 255)) {
      return err(`colind override ${b.colind} out of range 0..255`);
    }
  }
  const nextColind = plan.newBlocks.length
    ? (() => {
      const src = doc.collision.colind;
      const out = new Uint8Array(Math.max(nextBlocks.length, src.length));
      out.set(src);
      plan.newBlocks.forEach((b, i) => {
        out[doc.blocks.length + i] = b.colind ?? src[b.sourceBlockId] ?? 0;
      });
      return out;
    })()
    : doc.collision.colind;
  for (const { blockId, cellIndex, cell } of plan.blockCellEdits) {
    if (!isInt(blockId) || blockId < 0 || blockId >= nextBlocks.length) {
      return err(`block ${blockId} does not exist (0..${nextBlocks.length - 1})`);
    }
    if (!isInt(cellIndex) || cellIndex < 0 || cellIndex > 3) {
      return err(`block cell index ${cellIndex} out of range 0..3`);
    }
    const cells = nextBlocks[blockId].cells.slice();
    cells[cellIndex] = { ...cell };
    nextBlocks[blockId] = { cells };
  }

  const nextChunks = plan.chunkCellEdits.length ? doc.chunks.slice() : doc.chunks;
  for (const { chunkIndex, cellIndex, cell } of plan.chunkCellEdits) {
    if (!isInt(chunkIndex) || chunkIndex < 0 || chunkIndex >= nextChunks.length) {
      return err(`chunk index ${chunkIndex} does not exist (0..${nextChunks.length - 1})`);
    }
    if (!isInt(cellIndex) || cellIndex < 0 || cellIndex > 255) {
      return err(`chunk cell index ${cellIndex} out of range 0..255`);
    }
    const cells = nextChunks[chunkIndex].cells.slice();
    cells[cellIndex] = { ...cell };
    nextChunks[chunkIndex] = { cells };
  }

  const newDoc: LevelDoc = {
    ...doc, tiles: nextTiles, blocks: nextBlocks, chunks: nextChunks,
    collision: { ...doc.collision, colind: nextColind },
  };
  const e = structuralError(newDoc);
  if (e) return err(e);

  // State the dirty domains TRUTHFULLY — only what actually changed.
  const dirtyPatch: DirtyDomains = {};
  if (plan.tileWrites.length) dirtyPatch.tiles = true;
  if (plan.newBlocks.length || plan.blockCellEdits.length) dirtyPatch.blocks = true;
  // An appended block extends colind (above), so the collision file must be
  // rewritten too — the writer emits it only when this domain is dirty, and a
  // grown table nobody flags is a table that never reaches disk.
  if (plan.newBlocks.length) dirtyPatch.colind = true;
  if (plan.chunkCellEdits.length) dirtyPatch.chunks = true;
  if (Object.keys(dirtyPatch).length === 0) return { ok: true }; // no-op gesture

  // A block or tile change repaints every chunk that reaches it — bump the epoch,
  // naming written tiles so the composer's tile strip repaints only those thumbs.
  //
  // Always 'all', even for a lone chunk-cell edit, where classicEditChunkCells
  // manages the narrower { kind: 'chunk', id }. Two reasons, so nobody "optimises"
  // this into the narrow path: a paint plan that touches chunks essentially always
  // touches blocks or tiles too, which needs the epoch anyway (classicEditBlock has
  // the same precedent); and the narrow effect is keyed by ENGINE chunk id while a
  // plan addresses chunks by FILE index, so reusing it would need a conversion that
  // buys nothing here.
  commitArt(newDoc, dirtyPatch, { kind: 'all', tiles: plan.tileWrites.map((w) => w.tileIndex) });
  return { ok: true };
}

/**
 * classic:commit-canvas — apply a resolved canvas commit across all five art
 * domains as ONE command.
 *
 * Composite for the same reason `classicPaintSurface` is: tiles, blocks, their
 * collision, chunks and (when the artist adopted it) the palette land in one
 * `commitArt`, so a commit is a single Ctrl+Z. Splitting it would let an undo
 * strand appended blocks with nothing pointing at them, or leave art recoloured
 * by a palette the tiles no longer match.
 *
 * All five domains are members of ART_DOMAINS, so `assertSingleDomain` permits
 * the patch — the same property §3.4 verified for phase 1.
 *
 * The PLAN is the authority on what is legal; this re-validates only what it
 * must, using the SAME predicates rather than a second copy of the rules.
 */
export function classicCommitCanvas(plan: CanvasCommitPlan): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');

  const poolTiles = Math.floor(doc.tiles.length / 32);
  const range = editableTileRange();
  for (const { tileIndex, data } of plan.tileWrites) {
    if (!isInt(tileIndex) || tileIndex < 1 || tileIndex >= poolTiles) {
      // Tile 0 is the transparent tile — a plan that wrote it would repaint
      // every blank cell in the zone, so it is rejected here as well as being
      // unreachable in the planner.
      return err(`tile ${tileIndex} cannot be written (1..${poolTiles - 1})`);
    }
    if (!(data instanceof Uint8Array) || data.length !== 32) {
      return err(`tile ${tileIndex} data must be 32 bytes (got ${data?.length})`);
    }
    const lock = tileLockReason(range, tileIndex);
    if (lock) return err(`tile ${tileIndex} is not editable: ${lock}`);
  }

  const nextTiles = plan.tileWrites.length ? new Uint8Array(doc.tiles) : doc.tiles;
  for (const { tileIndex, data } of plan.tileWrites) nextTiles.set(data, tileIndex * 32);

  // Blocks: the plan addresses them by id and may OVERWRITE a reclaimed id or
  // APPEND a new one, so grow to fit rather than assuming a push.
  const maxBlockId = plan.blockWrites.reduce((m, w) => Math.max(m, w.blockId), doc.blocks.length - 1);
  if (maxBlockId >= MAX_BLOCKS_TOTAL) {
    return err(`block ${maxBlockId} exceeds the ${MAX_BLOCKS_TOTAL}-block ceiling (10-bit chunk-cell field)`);
  }
  const nextBlocks = plan.blockWrites.length ? doc.blocks.slice() : doc.blocks;
  while (nextBlocks.length <= maxBlockId) {
    nextBlocks.push({ cells: [0, 1, 2, 3].map(() => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) });
  }
  for (const { blockId, def } of plan.blockWrites) {
    if (blockId < 1) return err('block 0 is engine-blank and cannot be written');
    nextBlocks[blockId] = { cells: def.cells.map((c) => ({ ...c })) };
  }

  // Collision travels with the block, as it does for an Isolate clone — but
  // here the value is inherited positionally from the cell being displaced
  // rather than from a source block. See the plan's D3.
  const nextColind = plan.blockWrites.length
    ? (() => {
      const out = new Uint8Array(Math.max(nextBlocks.length, doc.collision.colind.length));
      out.set(doc.collision.colind);
      for (const { blockId, colind } of plan.blockWrites) out[blockId] = colind;
      return out;
    })()
    : doc.collision.colind;

  const nextChunks = (plan.chunkWrites.length || plan.chunkAppends.length)
    ? doc.chunks.slice() : doc.chunks;
  for (const { chunkFileIndex, def } of plan.chunkWrites) {
    if (!isInt(chunkFileIndex) || chunkFileIndex < 0 || chunkFileIndex >= nextChunks.length) {
      return err(`chunk index ${chunkFileIndex} does not exist (0..${nextChunks.length - 1})`);
    }
    nextChunks[chunkFileIndex] = { cells: def.cells.map((c) => ({ ...c })) };
  }
  for (const def of plan.chunkAppends) nextChunks.push({ cells: def.cells.map((c) => ({ ...c })) });
  if (nextChunks.length > MAX_ADDRESSABLE_CHUNKS) {
    return err(
      `chunk capacity reached: ${MAX_ADDRESSABLE_CHUNKS} chunks max — engine ids 1..$7F, `
      + 'the layout loop bit (bit 7) makes $80+ unaddressable',
    );
  }

  const nextPalettes = plan.paletteWrites?.length ? doc.palettes.slice() : doc.palettes;
  for (const { line, colors } of plan.paletteWrites ?? []) {
    if (!isInt(line) || line < 1 || line > 3) {
      // Line 0 is Sonic's, shared game-wide. The planner refuses drift there;
      // this is the second door, because the save path writes Sonic.bin happily.
      return err(`palette line ${line} cannot be written by a commit (1..3 only — line 0 is Sonic's)`);
    }
    if (!(colors instanceof Uint16Array) || colors.length !== 16) {
      return err(`palette line ${line} must have 16 colors (got ${colors?.length})`);
    }
    nextPalettes[line] = new Uint16Array(colors);
  }

  const newDoc: LevelDoc = {
    ...doc,
    tiles: nextTiles, blocks: nextBlocks, chunks: nextChunks, palettes: nextPalettes,
    collision: { ...doc.collision, colind: nextColind },
  };
  const e = structuralError(newDoc);
  if (e) return err(e);

  const dirtyPatch: DirtyDomains = {};
  if (plan.tileWrites.length) dirtyPatch.tiles = true;
  if (plan.blockWrites.length) { dirtyPatch.blocks = true; dirtyPatch.colind = true; }
  if (plan.chunkWrites.length || plan.chunkAppends.length) dirtyPatch.chunks = true;
  if (plan.paletteWrites?.length) dirtyPatch.palette = true;
  if (Object.keys(dirtyPatch).length === 0) return { ok: true }; // nothing to do

  commitArt(newDoc, dirtyPatch, { kind: 'all', tiles: plan.tileWrites.map((w) => w.tileIndex) });
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
  // No-op guard (cheap 16-word compare): an identical line records no undo step —
  // consistent with set-start/set-colind/set-objects. Also elides the double
  // commit a slider release could otherwise produce (the picker fires onChange
  // then onCommit with the same final word), keeping one undo step per color edit.
  const cur = doc.palettes[line];
  if (cur && cur.length === 16 && colors.every((c, i) => c === cur[i])) return { ok: true };
  const nextPalettes = doc.palettes.slice();
  nextPalettes[line] = new Uint16Array(colors);
  const newDoc: LevelDoc = { ...doc, palettes: nextPalettes };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // Palette colors are baked into chunk art renders — bump the epoch.
  commitArt(newDoc, { palette: true }, { kind: 'all' });
  return { ok: true };
}

/** classic:set-colind — set block→collision-shape indices. */
export function classicSetColind(entries: { blockId: number; value: number }[]): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  const colind = doc.collision.colind;
  for (const { blockId, value } of entries) {
    // Block 0 is the blank block. FindFloor does `andi.w #$7FF,d0 / beq.s
    // .isblank` before it reads either solidity or colind, so a shape stored
    // here can never apply in game — writing it would be an edit the editor
    // shows and the console ignores.
    if (blockId === 0) {
      return err('block 0 is the blank block — the engine short-circuits before reading its collision, so a shape here can never apply');
    }
    // 1, not 0, is the low bound now: block 0 is refused above with its own
    // reason, so quoting 0..N-1 here would name a range whose first value this
    // very function rejects.
    if (!isInt(blockId) || blockId < 0) {
      return err(`colind block ${blockId} out of range 1..${colind.length - 1}`);
    }
    // THE OVERHANG. A zone can ship more blocks than its colind has bytes —
    // GHZ is 439 against 410 — and in ROM the tail resolves into the ADJACENT
    // zone's table, so these blocks may have real collision that Aurora cannot
    // see and draws as air. Growing the table here would write zeros over that,
    // silently changing every other overhang block's in-game collision.
    // Refused rather than guessed; reading the true values needs cross-file
    // reach Aurora does not have. See classicPaintSurface for the same fact.
    if (blockId >= colind.length) {
      return err(`block ${blockId} is past the end of this zone's collision table (${colind.length} entries) — the overhang resolves into the adjacent zone's table in ROM, so Aurora cannot set it without silently changing other blocks`);
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
  commitArt(newDoc, { colind: true }, { kind: 'none' });
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
  commitLayout(newDoc, { objects: true }, { kind: 'none' });
  return { ok: true };
}

// GROW-command capacity limits (format hard limits, enforced HERE not just in the
// UI so the MCP path is bounded too):
//   • Chunks are addressed by the layout byte, whose bit 7 is S1's loop flag — so
//     only engine ids 1..$7F are stampable. doc.chunks is file-order (0-based);
//     engine id = index + 1, so at most 127 chunks can be addressed.
//   • Chunk cells reference blocks with a 10-bit field → at most $400 = 1024 blocks.
const MAX_BLOCKS_TOTAL = 0x400; // 1024 (10-bit block ref)

/**
 * classic:add-chunk — append a NEW 256-cell chunk (grows doc.chunks). Optional
 * sparse `cells` (index+packed word) seed it over a blank base — Duplicate passes
 * the source chunk's cells as words; New-blank passes nothing. Returns the new
 * ENGINE id (file index + 1) so the caller can select it.
 *
 * The classicEditChunkCells command edits an EXISTING chunk's cells only; growing
 * the pool needs its own append + cap check (unaddressable at $80+).
 */
export function classicAddChunk(cells?: { index: number; word: number }[]): AddResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  if (doc.chunks.length >= MAX_ADDRESSABLE_CHUNKS) {
    return err(
      `chunk capacity reached: ${MAX_ADDRESSABLE_CHUNKS} chunks max — engine ids 1..$7F, ` +
        `the layout loop bit (bit 7) makes $80+ unaddressable`,
    );
  }
  // Blank base: 256 cells of block 0, no flips, solidity 0.
  const nextCells: ChunkCell[] = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  if (cells) {
    for (const { index, word } of cells) {
      if (!isInt(index) || index < 0 || index > 255) return err(`chunk cell index ${index} out of range 0..255`);
      if (!isInt(word) || word < 0 || word > 0xffff) return err(`chunk cell word ${word} out of range 0..65535`);
      nextCells[index] = unpackChunkCell(word);
    }
  }
  const newChunk: ChunkDef256 = { cells: nextCells };
  const nextChunks = [...doc.chunks, newChunk];
  const newDoc: LevelDoc = { ...doc, chunks: nextChunks };
  const e = structuralError(newDoc);
  if (e) return err(e);
  const newEngineId = nextChunks.length; // file index (length-1) + 1 = length
  commitArt(newDoc, { chunks: true }, { kind: 'chunk', id: newEngineId });
  return { ok: true, id: newEngineId };
}

/**
 * classic:add-block — append a NEW 4-cell block (grows doc.blocks). Optional `def`
 * seeds it (Duplicate passes the source block's def; New-blank passes nothing →
 * four tile-0 cells). Returns the new block id (file index; blocks are 0-based).
 */
export function classicAddBlock(
  def?: BlockDef,
  /** `sourceBlockId` is the block this one is a COPY of — Duplicate passes the
   *  block being shown. It is what the new block inherits its collision shape
   *  from: `colind` is indexed by block id, so a copy without an entry looks
   *  identical and is not solid. Omitted (New-blank) means shape 0, which is
   *  the "no collision" answer Aurora's overlay already renders for an id past
   *  the end of the table. See classicPaintSurface for the same rule on the
   *  Isolate-clone path, and SurfaceEditPlan.newBlocks for why it matters. */
  opts?: { sourceBlockId?: number },
): AddResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');
  if (doc.blocks.length >= MAX_BLOCKS_TOTAL) {
    return err(`block capacity reached: ${MAX_BLOCKS_TOTAL} blocks max (chunk cells reference blocks with a 10-bit field)`);
  }
  let cells: BlockDef['cells'];
  if (def) {
    if (!Array.isArray(def.cells) || def.cells.length !== 4) return err('block must have exactly 4 cells');
    cells = def.cells.map((c) => ({ ...c }));
  } else {
    cells = Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false }));
  }
  const nextBlocks = [...doc.blocks, { cells }];
  // Grow colind to cover the new id, inheriting the source's shape (or 0 for a
  // blank). The table can legitimately START shorter than the block list —
  // GHZ ships 439 blocks against a 410-byte colind — so the entries in between
  // are filled with 0 rather than left undefined.
  const srcColind = doc.collision.colind;
  const nextColind = new Uint8Array(Math.max(nextBlocks.length, srcColind.length));
  nextColind.set(srcColind);
  nextColind[nextBlocks.length - 1] = opts?.sourceBlockId !== undefined
    ? (srcColind[opts.sourceBlockId] ?? 0)
    : 0;
  const newDoc: LevelDoc = {
    ...doc, blocks: nextBlocks,
    collision: { ...doc.collision, colind: nextColind },
  };
  const e = structuralError(newDoc);
  if (e) return err(e);
  // A brand-new block is referenced by no chunk yet → no chunk art changes; the
  // block palette re-reads on the new doc identity. No version bump needed.
  commitArt(newDoc, { blocks: true, colind: true }, { kind: 'none' });
  return { ok: true, id: nextBlocks.length - 1 };
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
  commitLayout(newDoc, { start: true }, { kind: 'none' });
  return { ok: true };
}
