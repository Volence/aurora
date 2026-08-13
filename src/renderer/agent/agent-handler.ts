import { useProjectStore, getCurrentZone, getCurrentAct, getActiveLevel } from '../state/projectStore';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import type { S4Level, SetTilesCommand } from '../../core/editing/commands';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE,
  packNametableWord, unpackNametableWord, createChunkDef,
} from '../../core/model/s4-types';
import type { Tile, Zone, Act } from '../../core/model/s4-types';
import { validatePaletteLine, validateTilePixels, validatePaintRegion, validateEntries, validateChunkCollisionPlane, validatePaintCollisionRect } from '../../core/agent/validation';
import { computeActBudget, canonicalTileHash } from '../../core/agent/budget';
import { decodeGenesisColor, encodeGenesisColor } from '../../core/formats/palette';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
import { makeBgId } from '../../core/formats/bg-library';
import { buildStampCommand } from '../../core/editing/map-stamp';
import { ensureCollisionPlanes } from '../../core/collision/collision-cell-resolve';
import { paintCollisionRectEntries } from '../../core/collision/collision-paint';
import type { AgentRequest, AgentRequestEnvelope } from '../../shared/agent-protocol';
import { useClassicProjectStore } from '../state/classicProjectStore';
import {
  useClassicLevelStore,
  classicSetLayoutCells, classicEditChunkCells, classicEditBlock,
  classicAddChunk, classicAddBlock,
  classicSetObjects, classicSetColind,
  classicSetPalette, classicSetStart,
  type CommandResult,
} from '../state/classicLevelStore';
import { saveClassicProject } from '../state/classic-save';
import type { LevelDoc, LayoutGrid } from '../../core/level-classic/model';
import { planProjectOpen, currentOpenDirtySnapshot } from '../shell/project-open-guard';
import { useSessionStore } from '../state/sessionStore';
import { parseLevelTabId } from '../shell/tabs';
import { switchFacet } from '../workspace/facet-tools';
import { useWorkspaceStore } from '../workspace/workspaceStore';

let registered = false;

// Zone-wide background (Plane B): a fixed 64x32 nametable with its own tile
// blob — a SEPARATE tile space from the zone tileset (the engine loads it at
// VRAM slot 1024+). Layout tile indices are local to the BG blob in BOTH
// directions: load-time normalization (normalizeBgLayout) guarantees the
// in-memory layout get_bg returns is local, and set_bg validates local input.
const BG_TILES_HIGH = 32;
const BG_MAX_TILES = 512;

export function registerAgentHandler(): void {
  if (registered || !window.agentBridge) return;
  registered = true;
  window.agentBridge.onRequest(async (envelope: AgentRequestEnvelope) => {
    try {
      const result = await handleAgentRequest(envelope.payload);
      window.agentBridge.respond({ id: envelope.id, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.agentBridge.respond({ id: envelope.id, ok: false, error: message });
    }
  });
}

interface Ctx { zone: Zone; act: Act; level: S4Level; }

// NOTE: tile atlases are unified (2026-06). Rendering, export, budget, and
// agent reads/validation all operate on the zone tileset (zone.tileset.tiles,
// optionally overridden per-section by section.tiles — unused today, reserved
// for future per-section art). The legacy chunk-library atlas
// (chunks_tiles.bin) is merged into the zone tileset at load time (see
// src/core/art/atlas-migration.ts), so screenshots and exports agree.
function requireProject(): Ctx {
  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const act = getCurrentAct(state);
  const level = getActiveLevel(state);
  if (!state.project || !zone || !act || !level) throw new Error('no project loaded');
  return { zone, act, level };
}

function budgetSummary(ctx: Ctx) {
  return computeActBudget(ctx.act, ctx.zone.tileset.tiles);
}

/**
 * Ensure the layout facet (its MapViewport + canvas) is showing before agent
 * operations that read or write that canvas (goto, screenshot): agent edits
 * target the map, so make the layout facet visible if a level tab is up. A level
 * tab on a non-layout facet leaves MapViewport unmounted, so switch the active
 * level tab to its layout facet and wait two frames for the component to mount
 * and paint before proceeding.
 */
async function ensureLayoutFacet(): Promise<void> {
  const activeId = useSessionStore.getState().activeId;
  if (parseLevelTabId(activeId) && useWorkspaceStore.getState().facetFor(activeId) !== 'layout') {
    switchFacet(activeId, 'layout');
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }
}

// ---------------------------------------------------------------------------
// Classic (Sonic 1 disassembly) surface — thin wrappers over the classic open
// bridge (classicProjectStore) and the Task-12 editing commands. Guard rails and
// error surfacing match the aeon tools: a missing project/level throws (→ MCP
// structured error), and a CommandResult rejection re-throws its human message.
// ---------------------------------------------------------------------------

/** The open classic project store, or throw the standard "no project" error. */
function requireClassicProject() {
  const s = useClassicProjectStore.getState();
  if (s.status !== 'open' || !s.handle) throw new Error('no classic project is open');
  return s;
}

/** The currently-open, ready classic level document, or throw. */
function requireClassicDoc(): LevelDoc {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) throw new Error('no classic level is open');
  return s.doc;
}

/** Turn a command rejection into the repo's standard thrown-Error idiom. */
function assertCommand(res: CommandResult): void {
  if (!res.ok) throw new Error(res.error);
}

/** A layout plane's chunk-id cells as nested row arrays, clamped to w*h. */
function layoutToGrid(g: LayoutGrid): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < g.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < g.width; x++) {
      const idx = y * g.width + x;
      row.push(idx < g.cells.length ? g.cells[idx] : 0);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Dispatch one agent request to the live editing session. Returns the tool's
 * result, or throws an Error whose message becomes the MCP/Aether structured
 * error. Exported for unit tests (the MCP server + Aether adapter drive it
 * through the IPC bridge in production).
 */
export async function handleAgentRequest(req: AgentRequest): Promise<unknown> {
  switch (req.kind) {
    case 'get-project-info': {
      const ctx = requireProject();
      const state = useProjectStore.getState();
      return {
        project: state.project!.name,
        zone: ctx.zone.id,
        act: { id: ctx.act.id, gridWidth: ctx.act.gridWidth, gridHeight: ctx.act.gridHeight },
        sections: ctx.act.sections.map((s, i) => s ? { index: i, name: s.name } : null),
        tilesetSize: ctx.zone.tileset.tiles.length,
        chunks: state.project!.chunkLibrary.map(c => ({
          id: c.id, name: c.name, w: c.widthTiles, h: c.heightTiles,
        })),
        activeSection: useEditorStore.getState().activeSectionIndex,
      };
    }

    case 'get-palette': {
      const ctx = requireProject();
      return {
        lines: ctx.zone.palette.lines.map(line =>
          line.colors.map(c => ({ r: c.r, g: c.g, b: c.b }))),
        words: ctx.zone.palette.lines.map(line =>
          line.colors.map(c => encodeGenesisColor(c))),
      };
    }

    case 'get-tiles': {
      const ctx = requireProject();
      // Reads zone.tileset.tiles — the unified atlas. write-tiles
      // appends/overwrites here, and get-tiles reads back the same indices;
      // budget, export, and rendering all consume the same tileset
      // (section.tiles ?? zone tileset). See NOTE above requireProject.
      const tiles = ctx.zone.tileset.tiles;
      if (!Number.isInteger(req.start) || !Number.isInteger(req.count) || req.count < 1) {
        throw new Error(`start/count must be integers with count >= 1, got start=${req.start} count=${req.count}`);
      }
      if (req.start < 0 || req.start >= tiles.length) {
        throw new Error(`start ${req.start} out of range (tileset has ${tiles.length} tiles)`);
      }
      const count = Math.min(req.count, tiles.length - req.start, 256);
      return {
        start: req.start,
        tiles: tiles.slice(req.start, req.start + count).map(t => Array.from(t.pixels)),
      };
    }

    case 'get-nametable-region': {
      const ctx = requireProject();
      if (!Number.isInteger(req.section) || req.section < 0 || req.section >= ctx.act.sections.length) {
        throw new Error(`section ${req.section} out of range (0-${ctx.act.sections.length - 1})`);
      }
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty`);
      if (![req.x, req.y, req.w, req.h].every(Number.isInteger)) {
        throw new Error(`region coords must be integers, got (${req.x},${req.y}) ${req.w}x${req.h}`);
      }
      if (req.w < 1 || req.h < 1 || req.x < 0 || req.y < 0 ||
          req.x + req.w > SECTION_TILES_WIDE || req.y + req.h > SECTION_TILES_HIGH) {
        throw new Error(`region ${req.w}x${req.h} at (${req.x},${req.y}) is out of bounds (section is ${SECTION_TILES_WIDE}x${SECTION_TILES_HIGH} tiles)`);
      }
      const rows: unknown[][] = [];
      for (let r = 0; r < req.h; r++) {
        const row: unknown[] = [];
        for (let c = 0; c < req.w; c++) {
          const idx = (req.y + r) * SECTION_TILES_WIDE + (req.x + c);
          const e = unpackNametableWord(section.tileGrid.nametable[idx]);
          row.push(e);
        }
        rows.push(row);
      }
      return { rows };
    }

    case 'check-budget': {
      const ctx = requireProject();
      const budget = budgetSummary(ctx);
      if (req.section !== undefined) {
        if (!Number.isInteger(req.section) || req.section < 0 || req.section >= ctx.act.sections.length) {
          throw new Error(`section ${req.section} out of range (0-${ctx.act.sections.length - 1})`);
        }
        if (!ctx.act.sections[req.section]) {
          throw new Error(`section ${req.section} is empty`);
        }
        return { ...budget, perSection: budget.perSection.filter(p => p.index === req.section) };
      }
      return budget;
    }

    case 'set-palette': {
      const ctx = requireProject();
      const err = validatePaletteLine(req.line, req.colors);
      if (err) throw new Error(err);
      const newColors = req.colors.map(w => decodeGenesisColor(w));
      newColors[0] = { ...newColors[0], a: 0 }; // index 0 transparent
      executeCommand({
        type: 'set-palette-line',
        description: `agent: set palette line ${req.line}`,
        sectionIndex: -1,
        line: req.line,
        oldColors: ctx.zone.palette.lines[req.line].colors.map(c => ({ ...c })),
        newColors,
      }, ctx.level);
      return { line: req.line, budget: budgetSummary(ctx) };
    }

    case 'write-tiles': {
      const ctx = requireProject();
      const tiles = ctx.zone.tileset.tiles;
      const at = req.at ?? tiles.length;
      if (!Number.isInteger(at)) throw new Error(`at=${at} must be an integer`);
      if (at < 0 || at > tiles.length) {
        throw new Error(`at=${at} out of range (0-${tiles.length}; writes must be contiguous)`);
      }
      if (at + req.tiles.length > 0x800) throw new Error('tileset would exceed 2048 tiles (11-bit index)');
      const newTiles: Tile[] = [];
      for (let i = 0; i < req.tiles.length; i++) {
        const err = validateTilePixels(req.tiles[i]);
        if (err) throw new Error(`tile ${i}: ${err}`);
        newTiles.push({ pixels: Uint8Array.from(req.tiles[i]) });
      }
      // Warn (don't reject) when an incoming tile duplicates an existing
      // tileset tile or one of its flips — the agent can reuse the existing
      // index (with h/v flip bits) instead of spending a new tile.
      const existingByHash = new Map<string, number>();
      for (let i = 0; i < tiles.length; i++) {
        const hash = canonicalTileHash(tiles[i].pixels);
        if (!existingByHash.has(hash)) existingByHash.set(hash, i);
      }
      const duplicates: Array<{ index: number; duplicateOf: number }> = [];
      for (let i = 0; i < newTiles.length; i++) {
        const existing = existingByHash.get(canonicalTileHash(newTiles[i].pixels));
        if (existing !== undefined) duplicates.push({ index: at + i, duplicateOf: existing });
      }
      const oldTiles = newTiles.map((_, i) =>
        at + i < tiles.length ? { pixels: new Uint8Array(tiles[at + i].pixels) } : null);
      executeCommand({
        type: 'set-tileset-tiles',
        description: `agent: write ${newTiles.length} tiles at ${at}`,
        sectionIndex: -1,
        at,
        oldTiles,
        newTiles,
      }, ctx.level);
      return { at, count: newTiles.length, duplicates, budget: budgetSummary(ctx) };
    }

    case 'paint-region': {
      const ctx = requireProject();
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty or out of range`);
      // Validate tile indices against the section's *effective* atlas:
      // budget/export/rendering all resolve section.tiles ?? zone.tileset.tiles.
      const err = validatePaintRegion(req.section, req.x, req.y, req.w, req.h, req.entries, {
        sectionCount: ctx.act.sections.length,
        tilesetSize: (section.tiles ?? ctx.zone.tileset.tiles).length,
      });
      if (err) throw new Error(err);
      const entries: SetTilesCommand['entries'] = [];
      for (let r = 0; r < req.h; r++) {
        for (let c = 0; c < req.w; c++) {
          const spec = req.entries[r * req.w + c];
          const idx = (req.y + r) * SECTION_TILES_WIDE + (req.x + c);
          const oldNt = section.tileGrid.nametable[idx];
          entries.push({
            index: idx,
            oldNt,
            newNt: packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf),
          });
        }
      }
      executeCommand({
        type: 'set-tiles',
        description: `agent: paint ${req.w}x${req.h} at (${req.x},${req.y})`,
        sectionIndex: req.section,
        entries,
      }, ctx.level);
      return { painted: entries.length, budget: budgetSummary(ctx) };
    }

    case 'paint-collision': {
      const ctx = requireProject();
      const err = validatePaintCollisionRect(req.section, req.x, req.y, req.w, req.h, {
        sectionCount: ctx.act.sections.length,
        cellsW: SECTION_TILES_WIDE / 2, cellsH: SECTION_TILES_HIGH / 2,
      });
      if (err) throw new Error(err);
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty`);
      ensureCollisionPlanes(section);
      const plane = req.plane === 'b' ? section.collisionEditB! : section.collisionEdit!;
      const entries = paintCollisionRectEntries({
        x: req.x, y: req.y, w: req.w, h: req.h, word: req.word,
        plane, tileWidth: SECTION_TILES_WIDE,
      });
      if (entries.length > 0) {
        executeCommand({
          type: 'set-collision-edit',
          plane: req.plane,
          description: `agent: paint collision ${req.plane.toUpperCase()} ${req.w}x${req.h} at (${req.x},${req.y})`,
          sectionIndex: req.section,
          entries,
        }, ctx.level);
      }
      return { painted: entries.length };
    }

    case 'save-chunk': {
      const ctx = requireProject();
      if (!Number.isInteger(req.w) || !Number.isInteger(req.h) ||
          req.w < 1 || req.w > 64 || req.h < 1 || req.h > 64) {
        throw new Error(`chunk size must be 1-64 tiles per axis, got ${req.w}x${req.h}`);
      }
      if (req.w % 2 !== 0 || req.h % 2 !== 0) {
        throw new Error(`chunk size (${req.w}x${req.h}) must be even — collision cells are 16px/2-tile aligned`);
      }
      if (!Array.isArray(req.entries) || req.entries.length !== req.w * req.h) {
        throw new Error(`entries length ${Array.isArray(req.entries) ? req.entries.length : typeof req.entries} != ${req.w}x${req.h}`);
      }
      const state = useProjectStore.getState();
      // Chunk nametables index into the unified zone tileset.
      const entriesErr = validateEntries(req.entries, ctx.zone.tileset.tiles.length);
      if (entriesErr) throw new Error(entriesErr);
      const collAErr = validateChunkCollisionPlane('collisionA', req.collisionA, req.w, req.h);
      if (collAErr) throw new Error(collAErr);
      const collBErr = validateChunkCollisionPlane('collisionB', req.collisionB, req.w, req.h);
      if (collBErr) throw new Error(collBErr);
      const id = `agent-${Date.now()}-${state.project!.chunkLibrary.length}`;
      const chunk = createChunkDef(id, req.name, req.w, req.h);
      req.entries.forEach((spec, i) => {
        chunk.nametable[i] = packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf);
      });
      // Collision planes default to air (createChunkDef); an explicit payload
      // overrides either plane independently.
      if (req.collisionA) chunk.collisionA = Uint16Array.from(req.collisionA);
      if (req.collisionB) chunk.collisionB = Uint16Array.from(req.collisionB);
      state.addChunks([chunk]);
      // Note: chunk library additions are not part of EditHistory (matches
      // existing ChunkLibrary behavior); they are additive and non-destructive.
      return { id };
    }

    case 'stamp-chunk': {
      const ctx = requireProject();
      const state = useProjectStore.getState();
      const chunk = state.project!.chunkLibrary.find(c => c.id === req.chunkId);
      if (!chunk) throw new Error(`chunk ${req.chunkId} not found`);
      if (!Number.isInteger(req.section) || req.section < 0 || req.section >= ctx.act.sections.length) {
        throw new Error(`section ${req.section} out of range (0-${ctx.act.sections.length - 1})`);
      }
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty or out of range`);
      if (!Number.isInteger(req.x) || !Number.isInteger(req.y) || req.x < 0 || req.y < 0 ||
          req.x + chunk.widthTiles > SECTION_TILES_WIDE || req.y + chunk.heightTiles > SECTION_TILES_HIGH) {
        throw new Error(`chunk ${chunk.widthTiles}x${chunk.heightTiles} at (${req.x},${req.y}) is out of bounds (section is ${SECTION_TILES_WIDE}x${SECTION_TILES_HIGH} tiles)`);
      }
      if (req.x % 2 !== 0 || req.y % 2 !== 0) {
        throw new Error(`stamp position (${req.x},${req.y}) must be even — collision cells are 16px/2-tile aligned`);
      }

      // Lazily seed both collision planes before stamping, same as the UI tool.
      ensureCollisionPlanes(section);

      // Unlike the UI tool, agent stamps do NOT snap to the chunk's own grid —
      // callers pass explicit tile coords (validated even, above), by design.
      const cmd = buildStampCommand({
        chunk, section, sectionIndex: req.section,
        baseCol: req.x, baseRow: req.y, artOnly: false,
        description: `agent: stamp ${chunk.id} at (${req.x},${req.y})`,
      });

      let changed = 0;
      if (cmd) {
        executeCommand(cmd, ctx.level);
        for (const c of cmd.commands) {
          if (c.type === 'set-tiles' || c.type === 'set-collision-edit') changed += c.entries.length;
        }
      }
      return { stamped: true, changed, budget: budgetSummary(ctx) };
    }

    case 'goto': {
      await ensureLayoutFacet();
      const ctx = requireProject();
      if (!Number.isInteger(req.section) || req.section < 0 || req.section >= ctx.act.sections.length) {
        throw new Error(`section ${req.section} out of range`);
      }
      useEditorStore.getState().setActiveSectionIndex(req.section);
      const col = req.section % ctx.act.gridWidth;
      const row = Math.floor(req.section / ctx.act.gridWidth);
      const view = useViewStore.getState();
      if (req.zoom !== undefined) view.setZoom(req.zoom);
      view.setPosition(
        col * SECTION_PIXEL_SIZE + (req.x ?? 0) * 8,
        row * SECTION_PIXEL_SIZE + (req.y ?? 0) * 8,
      );
      return { section: req.section, vpX: useViewStore.getState().vpX, vpY: useViewStore.getState().vpY, zoom: useViewStore.getState().zoom };
    }

    case 'get-bg': {
      const ctx = requireProject();
      return {
        width: BG_WIDTH,
        height: BG_TILES_HIGH,
        layout: ctx.act.bgLayout ? Array.from(ctx.act.bgLayout) : null,
        tiles: ctx.act.bgTiles ? ctx.act.bgTiles.map(t => Array.from(t.pixels)) : null,
      };
    }

    case 'set-bg': {
      const ctx = requireProject();
      if (!Array.isArray(req.tiles) || req.tiles.length < 1 || req.tiles.length > BG_MAX_TILES) {
        throw new Error(`tiles must be 1-${BG_MAX_TILES} tiles, got ${Array.isArray(req.tiles) ? req.tiles.length : typeof req.tiles}`);
      }
      const newTiles: Tile[] = [];
      for (let i = 0; i < req.tiles.length; i++) {
        const err = validateTilePixels(req.tiles[i]);
        if (err) throw new Error(`tile ${i}: ${err}`);
        newTiles.push({ pixels: Uint8Array.from(req.tiles[i]) });
      }
      if (!Array.isArray(req.layout) || req.layout.length !== BG_WIDTH * BG_TILES_HIGH) {
        throw new Error(`layout must have ${BG_WIDTH * BG_TILES_HIGH} words (${BG_WIDTH}x${BG_TILES_HIGH}), got ${Array.isArray(req.layout) ? req.layout.length : typeof req.layout}`);
      }
      for (let i = 0; i < req.layout.length; i++) {
        const word = req.layout[i];
        if (!Number.isInteger(word) || word < 0 || word > 0xFFFF) {
          throw new Error(`layout word ${i} = ${word}: must be a 16-bit nametable word`);
        }
        const tileIdx = word & 0x7FF;
        if (tileIdx >= newTiles.length) {
          throw new Error(`layout word ${i}: tile index ${tileIdx} out of range (blob has ${newTiles.length} tiles; indices are local to the BG blob)`);
        }
      }
      const newLayout = Uint16Array.from(req.layout);

      // name provided: ADD to the BG library (additive, outside undo history
      // — like save-chunk/addChunks) instead of replacing the act default.
      // Sections opt in via assign-section-bg.
      if (req.name !== undefined) {
        const name = req.name.trim();
        if (!name) throw new Error('name must be non-empty');
        const id = makeBgId(name);
        useProjectStore.getState().addBgToLibrary({ id, name, layout: newLayout, tiles: newTiles });
        return { id, name, tiles: newTiles.length, uniqueWords: new Set(newLayout).size };
      }

      executeCommand({
        type: 'set-bg',
        description: `agent: set background (${newTiles.length} tiles)`,
        sectionIndex: -1,
        oldLayout: ctx.act.bgLayout ? new Uint16Array(ctx.act.bgLayout) : null,
        newLayout,
        oldTiles: ctx.act.bgTiles ? ctx.act.bgTiles.map(t => ({ pixels: new Uint8Array(t.pixels) })) : null,
        newTiles,
      }, ctx.level);
      return { tiles: newTiles.length, uniqueWords: new Set(newLayout).size };
    }

    case 'assign-section-bg': {
      const ctx = requireProject();
      if (!Number.isInteger(req.section) || req.section < 0 || req.section >= ctx.act.sections.length) {
        throw new Error(`section ${req.section} out of range (0-${ctx.act.sections.length - 1})`);
      }
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty`);
      if (req.bgId !== null) {
        const library = useProjectStore.getState().project!.bgLibrary;
        if (!library.some(b => b.id === req.bgId)) {
          throw new Error(`bg "${req.bgId}" not found in the library (use list-bgs)`);
        }
      }
      if (section.bgLayoutRef === req.bgId) {
        // No-op guard: a same-ref command would consume an undo slot without
        // changing anything.
        return { section: req.section, bgId: req.bgId, changed: false };
      }
      executeCommand({
        type: 'set-section-bg',
        description: `agent: section ${req.section} bg -> ${req.bgId ?? 'act default'}`,
        sectionIndex: req.section,
        oldRef: section.bgLayoutRef,
        newRef: req.bgId,
      }, ctx.level);
      return { section: req.section, bgId: req.bgId, changed: true };
    }

    case 'list-bgs': {
      const ctx = requireProject();
      const library = useProjectStore.getState().project!.bgLibrary;
      return {
        actDefault: ctx.act.bgLayout && ctx.act.bgTiles
          ? { width: BG_WIDTH, height: Math.floor(ctx.act.bgLayout.length / BG_WIDTH), tiles: ctx.act.bgTiles.length }
          : null,
        entries: library.map(b => ({ id: b.id, name: b.name, tiles: b.tiles.length })),
        sections: ctx.act.sections.map((s, i) => s ? { index: i, bgId: s.bgLayoutRef } : null),
      };
    }

    case 'screenshot': {
      await ensureLayoutFacet();
      requireProject();
      const canvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
      if (!canvas) throw new Error('map canvas not found — is the viewport mounted?');
      const view = useViewStore.getState();
      const prevShowBg = view.overlays.showBgPlane;
      if (req.showBg) view.setOverlay('showBgPlane', true);
      try {
        // Give the renderer a frame to flush pending paints (e.g. right after
        // goto/paint, or the overlay change above)
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        let source: HTMLCanvasElement = canvas;
        if (req.region) {
          const { x, y, w, h } = req.region;
          if (w < 1 || h < 1 || x < 0 || y < 0 || x + w > canvas.width || y + h > canvas.height) {
            throw new Error(`region out of canvas bounds (canvas is ${canvas.width}x${canvas.height})`);
          }
          const crop = document.createElement('canvas');
          crop.width = w; crop.height = h;
          crop.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
          source = crop;
        }
        const dataUrl = source.toDataURL('image/png');
        return { pngBase64: dataUrl.slice('data:image/png;base64,'.length), width: source.width, height: source.height };
      } finally {
        if (req.showBg) useViewStore.getState().setOverlay('showBgPlane', prevShowBg);
      }
    }

    // ---- Classic (Sonic 1) project surface (Task 16) ----

    case 'classic-open-project': {
      // Fail closed on unsaved work (stage-3 Task 7 follow-up): an agent-driven
      // open has no UI to confirm through, so — unlike useProject.openPath, which
      // offers Save & open / Discard & open / Cancel — this tool refuses outright
      // rather than silently destroying unsaved classic/aeon/sprite edits.
      if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') {
        throw new Error(
          'Unsaved changes present (classic/aeon/sprite). Save first (Ctrl+S / save tools) ' +
          'or have the user discard, then retry.',
        );
      }
      // Reuse the Task-9 open bridge exactly (no duplicated open logic): the store
      // detects classic-first and, for a real aeon dir, leaves aeon untouched.
      const outcome = await useClassicProjectStore.getState().openDirectory(req.dir);
      const s = useClassicProjectStore.getState();
      if (outcome === 'opened') {
        // Mirror File→Open's recent-projects registration when the shell api is
        // available (absent in unit tests / headless).
        if (typeof window !== 'undefined' && window.api?.addRecentProject) {
          try { await window.api.addRecentProject(req.dir, s.label ?? req.dir); } catch { /* non-fatal */ }
        }
        return {
          type: s.type,
          label: s.label,
          report: s.report ? { resolved: s.report.resolved, total: s.report.total } : null,
          zoneTree: s.zoneTree,
        };
      }
      if (outcome === 'not-classic') {
        // A real aeon project — this tool does not drive the aeon loader.
        return { type: 'aeon', opened: false, note: 'aeon project left unchanged; open it with the aeon loader' };
      }
      // Unrecognized directory (or the bridge threw): surface the store's notice.
      throw new Error(s.error ?? 'could not open project');
    }

    case 'classic-get-project-report': {
      const s = requireClassicProject();
      if (!s.report) throw new Error('no resolution report available');
      return s.report;
    }

    case 'classic-list-levels': {
      const s = requireClassicProject();
      return { levels: s.zoneTree };
    }

    case 'classic-get-level': {
      const s = requireClassicProject();
      const ref = s.zoneTree.find(r => r.zone === req.zone && r.act === req.act);
      if (!ref) throw new Error(`level ${req.zone}/${req.act} not found in this project`);
      await useClassicLevelStore.getState().openAct(ref);
      const ls = useClassicLevelStore.getState();
      if (ls.status !== 'ready' || !ls.doc) throw new Error(ls.error ?? `level ${req.zone}/${req.act} failed to load`);
      const doc = ls.doc;
      return {
        zone: ref.zone, act: ref.act, label: ref.label,
        dims: { fg: { width: doc.fg.width, height: doc.fg.height }, bg: { width: doc.bg.width, height: doc.bg.height } },
        counts: {
          tiles: Math.floor(doc.tiles.length / 32),
          blocks: doc.blocks.length,
          chunks: doc.chunks.length,
          objects: doc.objects.length,
        },
        palettes: doc.palettes.map(line => Array.from(line)),
        objects: doc.objects.map(o => ({ ...o })),
        start: { ...doc.start },
        layout: { fg: layoutToGrid(doc.fg), bg: layoutToGrid(doc.bg) },
      };
    }

    case 'classic-set-layout-region': {
      requireClassicDoc();
      const cells: { x: number; y: number; chunkId: number }[] = [];
      for (let dy = 0; dy < req.chunkIds.length; dy++) {
        const row = req.chunkIds[dy];
        for (let dx = 0; dx < row.length; dx++) {
          cells.push({ x: req.x + dx, y: req.y + dy, chunkId: row[dx] });
        }
      }
      assertCommand(classicSetLayoutCells(req.plane, cells));
      return { plane: req.plane, cells: cells.length };
    }

    case 'classic-edit-chunk': {
      requireClassicDoc();
      assertCommand(classicEditChunkCells(req.chunkId, req.cells));
      return { chunkId: req.chunkId, cells: req.cells.length };
    }

    case 'classic-edit-block': {
      requireClassicDoc();
      assertCommand(classicEditBlock(req.blockId, req.def));
      return { blockId: req.blockId };
    }

    case 'classic-add-chunk': {
      requireClassicDoc();
      const res = classicAddChunk(req.cells);
      if (!res.ok) throw new Error(res.error);
      return { chunkId: res.id, count: requireClassicDoc().chunks.length };
    }

    case 'classic-add-block': {
      requireClassicDoc();
      const res = classicAddBlock(req.def);
      if (!res.ok) throw new Error(res.error);
      return { blockId: res.id, count: requireClassicDoc().blocks.length };
    }

    case 'classic-place-object': {
      const doc = requireClassicDoc();
      const objects = [...doc.objects, req.entry];
      assertCommand(classicSetObjects(objects));
      return { index: objects.length - 1, count: objects.length };
    }

    case 'classic-move-object': {
      const doc = requireClassicDoc();
      if (!Number.isInteger(req.index) || req.index < 0 || req.index >= doc.objects.length) {
        throw new Error(`object index ${req.index} out of range (0..${doc.objects.length - 1})`);
      }
      const objects = doc.objects.map((o, i) => i === req.index ? { ...o, x: req.x, y: req.y } : o);
      assertCommand(classicSetObjects(objects));
      return { index: req.index, x: req.x, y: req.y };
    }

    case 'classic-delete-object': {
      const doc = requireClassicDoc();
      if (!Number.isInteger(req.index) || req.index < 0 || req.index >= doc.objects.length) {
        throw new Error(`object index ${req.index} out of range (0..${doc.objects.length - 1})`);
      }
      const objects = doc.objects.filter((_, i) => i !== req.index);
      assertCommand(classicSetObjects(objects));
      return { deleted: req.index, count: objects.length };
    }

    case 'classic-set-colind': {
      requireClassicDoc();
      assertCommand(classicSetColind(req.entries));
      return { entries: req.entries.length };
    }

    case 'classic-set-palette': {
      requireClassicDoc();
      assertCommand(classicSetPalette(req.line, Uint16Array.from(req.colors)));
      return { line: req.line };
    }

    case 'classic-set-start': {
      requireClassicDoc();
      assertCommand(classicSetStart(req.x, req.y));
      return { x: req.x, y: req.y };
    }

    case 'classic-save-project': {
      requireClassicProject();
      return saveClassicProject();
    }

    default: {
      const exhaustive: never = req;
      throw new Error(`unknown request kind: ${(exhaustive as { kind?: string }).kind}`);
    }
  }
}
