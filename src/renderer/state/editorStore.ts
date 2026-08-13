import { create } from 'zustand';
import type { Solidity } from '../../core/collision/collision-model';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import type { MapClipboard, PasteLayers } from '../../core/editing/map-clipboard';
import type { UndoStack } from '../../core/editing/undo-stack';
import { useArtStore } from './artStore';
import { BoundEditHistory } from '../../core/editing/bound-edit-history';
import { documentHistoryHub } from './history-hub';
import { useProjectStore } from './projectStore';
import { useSessionStore } from './sessionStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { levelDocId, parseLevelTabId, isSpriteDocTabId, zoneArtDocId } from '../shell/tabs';

export type EditorTool =
  | 'view' | 'select' | 'paint-tile' | 'paint-block' | 'stamp-chunk'
  | 'paint-collision' | 'eraser' | 'place-object' | 'place-ring' | 'marquee';

/** An in-progress or committed marquee selection, in tile coords, snapped to
 *  16px blocks (map-clipboard.ts snapMarquee) and pinned to one section. */
export interface MarqueeState {
  sectionIndex: number;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface Selection {
  type: 'object' | 'ring';
  sectionIndex: number;
  index: number;
}

export interface RingPattern {
  name: string;
  offsets: Array<{ dx: number; dy: number }>;
}

export const RING_PATTERNS: RingPattern[] = [
  { name: 'Single', offsets: [{ dx: 0, dy: 0 }] },
  { name: 'H×2', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }] },
  { name: 'H×3', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }] },
  { name: 'H×4', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }] },
  { name: 'H×5', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }, { dx: 96, dy: 0 }] },
  { name: 'H×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: i * 24, dy: 0 })) },
  { name: 'V×2', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }] },
  { name: 'V×3', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }] },
  { name: 'V×4', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }] },
  { name: 'V×5', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }, { dx: 0, dy: 96 }] },
  { name: 'V×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: 0, dy: i * 24 })) },
  { name: 'Diamond', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 48, dy: 24 }, { dx: 24, dy: 48 },
  ]},
  { name: 'Circle', offsets: (() => {
    const r = 36;
    return Array.from({ length: 8 }, (_, i) => ({
      dx: Math.round(r * Math.cos(i * Math.PI / 4)),
      dy: Math.round(r * Math.sin(i * Math.PI / 4)),
    }));
  })()},
  { name: '2×2 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 },
  ]},
  { name: '3×3 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 },
    { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
    { dx: 0, dy: 48 }, { dx: 24, dy: 48 }, { dx: 48, dy: 48 },
  ]},
  { name: 'Triangle', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
  ]},
];

export type EditingLayer = 'fg' | 'bg';

interface EditorState {
  tool: EditorTool;
  selection: Selection | null;
  dirty: boolean;
  /**
   * Repaint clock for level mutations that DON'T go through a command and so
   * never reach an undo stack: an object/ring drag in progress, a direct BG tile
   * write. History-driven repaint is not here — it comes from the hub, via
   * hooks/useHistoryVersion.
   */
  liveEditVersion: number;
  chunkLibraryVersion: number;

  // S4 tool state
  activeSectionIndex: number;
  editingLayer: EditingLayer;
  selectedTileIndex: number;
  selectedPaletteLine: number;
  selectedChunkId: string | null;
  selectedObjectTypeId: string | null;
  selectedObjectSubtype: number;
  selectedRingPattern: number;
  selectedCollisionProfile: number; // base-bank shape index for the map collision palette
  selectedCollisionEntryFlipX: boolean; // the picked palette entry's mirror-to-canonical-left flag
  selectedCollisionXFlip: boolean;  // USER Flip-H toggle (XORs with the entry flag → effective mirror)
  selectedCollisionYFlip: boolean;  // flip the painted shape vertically (floor↔ceiling)
  selectedCollisionSolidity: Solidity; // floor type painted: all / top (jump-through) / none / sides-bottom
  collisionPaintPlane: 'a' | 'b';
  collisionBrushSize: number; // brush width in 16px blocks; 1 = reuse, >1 = positional N×N area

  marquee: MarqueeState | null;
  mapClipboard: MapClipboard | null;
  pasteLayers: PasteLayers;
  /** True while the map paste-ghost/click-to-commit mode is active (entered by
   *  Ctrl+V, stays active across repeat pastes). Lives in the store (rather
   *  than a MapViewport-local ref) because the paste-layer options bar
   *  (App.tsx) and the status bar hint need to react to it from outside
   *  MapViewport; the hovered footprint position itself is a MapViewport-local
   *  ref (like the collision-paint hover), since nothing else needs it. */
  pasting: boolean;

  setTool: (tool: EditorTool) => void;
  setSelection: (selection: Selection | null) => void;
  setActiveSectionIndex: (index: number) => void;
  setEditingLayer: (layer: EditingLayer) => void;
  setSelectedTileIndex: (index: number) => void;
  setSelectedPaletteLine: (line: number) => void;
  setSelectedChunkId: (id: string | null) => void;
  setSelectedObjectTypeId: (id: string | null, subtype?: number) => void;
  setSelectedRingPattern: (index: number) => void;
  setSelectedCollisionProfile: (index: number) => void;
  /** Pick a palette entry: its base shape + whether it must mirror to face left.
   *  Resets the user Flip-H toggle so the freshly-picked shape shows canonical. */
  pickCollisionShape: (shape: number, entryFlipX: boolean) => void;
  setSelectedCollisionXFlip: (on: boolean) => void;
  setSelectedCollisionYFlip: (on: boolean) => void;
  setSelectedCollisionSolidity: (s: Solidity) => void;
  setCollisionPaintPlane: (plane: 'a' | 'b') => void;
  setCollisionBrushSize: (size: number) => void;
  setMarquee: (marquee: MarqueeState | null) => void;
  setMapClipboard: (clipboard: MapClipboard | null) => void;
  setPasteLayers: (layers: PasteLayers) => void;
  setPasting: (pasting: boolean) => void;
  markDirty: () => void;
  markClean: () => void;
  bumpLiveEdit: () => void;
  bumpChunkLibraryVersion: () => void;
}

/** Facets whose edits belong to the ZONE-ART document rather than the act's
 *  layout: art and palette are zone-scoped data edited from an act tab. */
const ZONE_ART_FACETS = new Set<string>(['art', 'palette']);

/**
 * The document the user is currently editing: the active tab, refined by the
 * facet focused within it (spec §4.2). Null when the active tab is not a
 * document at all (a tool tab, or nothing open).
 *
 * The ONE resolution — focusedHistory and executeCommand both go through it, so
 * a command can never be recorded on a document that undo would not reach.
 */
export function focusedDocId(): string | null {
  const activeId = useSessionStore.getState().activeId;
  if (!activeId) return null;

  // A sprite-doc tab IS its document; no facet refinement applies. Includes the
  // untitled "New Sprite…" tab, whose id is its document id too — otherwise the
  // toolbar's undo would read as "nothing undoable" while SpriteMode's own
  // Ctrl+Z happily undid on that document's stack.
  if (isSpriteDocTabId(activeId)) return activeId;

  const level = parseLevelTabId(activeId);
  if (!level) return null;

  const facet = useWorkspaceStore.getState().facetFor(activeId);
  return ZONE_ART_FACETS.has(facet) ? zoneArtDocId(level.zone) : activeId;
}

/**
 * The undo stack for whatever the user is looking at (spec §4.2) — the ONE undo
 * entry point every keybinding and toolbar button drives. Null when nothing
 * undoable is focused, which the UI renders as a disabled control.
 *
 * Replaces activeHistory(), which keyed off projectStore's current act and so
 * was aeon-coupled and blind to the focused facet.
 */
export function focusedHistory(): UndoStack | null {
  const docId = focusedDocId();
  return docId ? documentHistoryHub.historyFor(docId) : null;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'view',
  selection: null,
  dirty: false,
  liveEditVersion: 0,
  chunkLibraryVersion: 0,

  activeSectionIndex: 0,
  editingLayer: 'fg',
  selectedTileIndex: 0,
  selectedPaletteLine: 0,
  selectedChunkId: null,
  selectedObjectTypeId: null,
  selectedObjectSubtype: 0,
  selectedRingPattern: 0,
  selectedCollisionProfile: 0,
  selectedCollisionEntryFlipX: false,
  selectedCollisionXFlip: false,
  selectedCollisionYFlip: false,
  selectedCollisionSolidity: 'all',
  collisionPaintPlane: 'a',
  collisionBrushSize: 1,

  marquee: null,
  mapClipboard: null,
  pasteLayers: 'both',
  pasting: false,

  // An explicit tool switch cancels an in-progress paste (repeat pastes never
  // call setTool, so they aren't affected) — picking a different tool while
  // pasting means the user is done pasting.
  setTool: (tool) => set({ tool, selection: null, pasting: false }),
  setSelection: (selection) => set({ selection }),
  setActiveSectionIndex: (index) => set({ activeSectionIndex: index }),
  setEditingLayer: (layer) => set({ editingLayer: layer }),
  setSelectedTileIndex: (index) => set({ selectedTileIndex: index }),
  setSelectedPaletteLine: (line) => set({ selectedPaletteLine: line }),
  setSelectedChunkId: (id) => set({ selectedChunkId: id }),
  setSelectedObjectTypeId: (id, subtype) => set({ selectedObjectTypeId: id, selectedObjectSubtype: subtype ?? 0 }),
  setSelectedRingPattern: (index) => set({ selectedRingPattern: index }),
  setSelectedCollisionProfile: (index) => set({ selectedCollisionProfile: Math.max(0, Math.min(0x3FF, index | 0)) }),
  // Picking a shape updates the canonical-mirror baseline but LEAVES the user's
  // Flip-H / Flip-V toggles untouched — they're sticky "modes" that hold until
  // pressed again (matching Flip-V, which was already sticky).
  pickCollisionShape: (shape, entryFlipX) => set({
    selectedCollisionProfile: Math.max(0, Math.min(0x3FF, shape | 0)),
    selectedCollisionEntryFlipX: !!entryFlipX,
  }),
  setSelectedCollisionXFlip: (on) => set({ selectedCollisionXFlip: !!on }),
  setSelectedCollisionYFlip: (on) => set({ selectedCollisionYFlip: !!on }),
  setSelectedCollisionSolidity: (s) => set({ selectedCollisionSolidity: s }),
  setCollisionPaintPlane: (collisionPaintPlane) => set({ collisionPaintPlane }),
  setCollisionBrushSize: (size) => set({ collisionBrushSize: Math.max(1, Math.min(31, size | 0)) }),
  setMarquee: (marquee) => set({ marquee }),
  setMapClipboard: (mapClipboard) => set({ mapClipboard }),
  setPasteLayers: (pasteLayers) => set({ pasteLayers }),
  setPasting: (pasting) => set({ pasting }),
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  bumpLiveEdit: () => set((s) => ({ liveEditVersion: s.liveEditVersion + 1 })),
  bumpChunkLibraryVersion: () => set((s) => ({ chunkLibraryVersion: s.chunkLibraryVersion + 1 })),
}));

/**
 * Centralized renderer-cache invalidation hook. The component that owns the
 * renderer caches (MapViewport) registers a listener here; every command that
 * goes through executeCommand/undo/redo is forwarded to it so cached canvases
 * can be repainted — regardless of whether the mutation came from the UI,
 * keyboard undo/redo, or the agent handler.
 */
let invalidationListener: ((cmd: AnyCommand) => void) | null = null;

export function setCommandInvalidationListener(fn: ((cmd: AnyCommand) => void) | null): void {
  invalidationListener = fn;
}

/**
 * Store-level invalidation for commands. Unlike the renderer-cache listener
 * above (owned by MapViewport, unmounted in Art mode), these version bumps are
 * pure store concerns and must fire for every execute/undo/redo regardless of
 * which mode is active — e.g. undoing a set-chunk in Art mode must still bust
 * the ChunkLibrary thumbnail cache.
 *
 * chunkLibraryVersion is also bumped for set-palette-line and set-tileset-tiles
 * because chunk thumbnails bake both palette colors and tile pixels: in-place
 * tile edits keep tiles.length constant but change pixels, and palette edits
 * change colors used by the baked thumbs.
 */
function bumpStoreVersions(cmd: AnyCommand): void {
  if (cmd.type === 'batch') {
    for (const c of cmd.commands) bumpStoreVersions(c);
    return;
  }
  if (cmd.type === 'set-chunk'
      || cmd.type === 'set-palette-line'
      || cmd.type === 'set-tileset-tiles') {
    useEditorStore.getState().bumpChunkLibraryVersion();
  }
  // A committed palette-line change (a slider commit, a copy-bridge write, or its
  // undo/redo) must repaint every paletteVersion subscriber — notably the sprite
  // canvas, which watches paletteVersion but not the history clock. The live slider
  // preview bumps paletteVersion itself; this covers the commit + undo/redo paths.
  if (cmd.type === 'set-palette-line') {
    useArtStore.getState().bumpPaletteVersion();
  }
}

/**
 * A command was applied or reverted: refresh everything that caches level data.
 * The aeon undo stacks call this themselves (history-factories wires it in), so
 * an undo repaints exactly like the edit that made it — see BoundEditHistory,
 * whose argument-free undo()/redo() cannot return the command to their caller.
 */
export function notifyCommandApplied(command: AnyCommand): void {
  bumpStoreVersions(command);
  invalidationListener?.(command);
}

/**
 * Execute a command against the current level, recording it on the FOCUSED
 * document's undo stack (focusedDocId) so the same Ctrl+Z that the user reaches
 * for reverts it.
 *
 * Commands are aeon's editing model, so the focused document must be an aeon
 * command history. Anything else is a wiring bug (a level command issued while a
 * sprite doc or tool tab owns the focus) and is loud rather than silent: a
 * swallowed command would edit the level with no way to undo it.
 */
export function executeCommand(command: AnyCommand, level: S4Level): void {
  const stack = focusedHistory();
  if (!(stack instanceof BoundEditHistory)) {
    throw new Error(
      `executeCommand: the focused document '${focusedDocId() ?? '(none)'}' is not an aeon command history`,
    );
  }
  stack.execute(command, level);   // notifies notifyCommandApplied
  useEditorStore.getState().markDirty();
}

// --- Ambient (non-focused) commands ----------------------------------------

/**
 * Commands whose data lives on the ZONE rather than the act. Derived from what
 * core/editing/history.ts actually mutates: these three are the only members of
 * AnyCommand that touch `level.palette` / `level.tileset` / `level.chunkLibrary`
 * (all zone-level fields of S4Level). Every other command writes
 * `level.sections[...]` or `level.act`, both act-scoped. Keep this in step with
 * applyCommand — a new zone-level command that isn't listed here would be
 * recorded on the act stack and lost when that act tab closes.
 */
const ZONE_SCOPED_COMMAND_TYPES = new Set<AnyCommand['type']>([
  'set-palette-line',
  'set-tileset-tiles',
  'set-chunk',
]);

/**
 * A batch is zone-scoped only when EVERY leaf is — one act-scoped child pins the
 * whole step to the act, because a step that half-lives on a stack the act tab's
 * close would discard is worse than one recorded a level too narrowly. No mixed
 * batch is constructed today (map-stamp builds act-scoped children, ComposerCanvas
 * zone-scoped ones); the rule exists so a future one can't silently split.
 */
export function isZoneScopedCommand(command: AnyCommand): boolean {
  if (command.type === 'batch') {
    return command.commands.length > 0 && command.commands.every(isZoneScopedCommand);
  }
  return ZONE_SCOPED_COMMAND_TYPES.has(command.type);
}

/**
 * The document a command's DATA belongs to, from the project store's current
 * zone/act (which tab activation keeps pointed at the last activated level tab).
 * Null when no act is current, i.e. there is no level to edit at all.
 */
export function commandDocId(command: AnyCommand): string | null {
  const { currentZoneId, currentActId } = useProjectStore.getState();
  if (!currentZoneId) return null;
  if (isZoneScopedCommand(command)) return zoneArtDocId(currentZoneId);
  return currentActId ? levelDocId(currentZoneId, currentActId) : null;
}

/**
 * Execute a command that does NOT originate from the focused surface, recording
 * it on the document its data belongs to (commandDocId).
 *
 * executeCommand routes by FOCUS, which is right for an editing surface — the
 * user's Ctrl+Z reaches back into the thing they were just looking at. It is
 * wrong for ambient callers, which edit the project irrespective of focus:
 *
 *  - the agent handler's edit tools, which run against whatever act is loaded
 *    while the active tab may be Home, a tool tab, or a sprite doc — none of
 *    which own a command history, so focus routing THREW (the MCP call failed);
 *  - PaletteEditor's zone-palette rows and "Copy to ▸ Zone line N" bridges,
 *    which write zone CRAM from inside the sprite pane (same throw).
 *
 * Scope routing also stops a zone-scoped edit made while the layout facet
 * happens to be focused from being recorded on the ACT stack, where closing
 * that act tab would discard a zone edit that outlives it.
 */
export function executeAmbientCommand(command: AnyCommand, level: S4Level): void {
  const docId = commandDocId(command);
  if (!docId) {
    throw new Error(
      `executeAmbientCommand: no current act — '${command.type}' has no document to record on`,
    );
  }
  const stack = documentHistoryHub.historyFor(docId);
  if (!(stack instanceof BoundEditHistory)) {
    throw new Error(
      `executeAmbientCommand: document '${docId}' is not an aeon command history`,
    );
  }
  stack.execute(command, level);   // notifies notifyCommandApplied
  useEditorStore.getState().markDirty();
}
