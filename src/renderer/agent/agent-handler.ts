import { useProjectStore, getCurrentZone, getCurrentAct, getActiveLevel } from '../state/projectStore';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import type { S4Level, SetTilesCommand } from '../../core/editing/commands';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE,
  packNametableWord, unpackNametableWord, createChunkDef,
} from '../../core/model/s4-types';
import type { Tile, Zone, Act } from '../../core/model/s4-types';
import { validatePaletteLine, validateTilePixels, validatePaintRegion, validateEntries } from '../../core/agent/validation';
import { computeActBudget, canonicalTileHash } from '../../core/agent/budget';
import { decodeGenesisColor, encodeGenesisColor } from '../../core/formats/palette';
import type { AgentRequest, AgentRequestEnvelope, NametableEntrySpec } from '../../shared/agent-protocol';

let registered = false;

export function registerAgentHandler(): void {
  if (registered || !window.agentBridge) return;
  registered = true;
  window.agentBridge.onRequest(async (envelope: AgentRequestEnvelope) => {
    try {
      const result = await handle(envelope.payload);
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

async function handle(req: AgentRequest): Promise<unknown> {
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
          row.push({ ...e, coll: section.tileGrid.collision[idx] });
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
          const oldColl = section.tileGrid.collision[idx];
          entries.push({
            index: idx,
            oldNt,
            newNt: packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf),
            oldColl,
            newColl: spec.coll ?? oldColl,
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

    case 'save-chunk': {
      const ctx = requireProject();
      if (!Number.isInteger(req.w) || !Number.isInteger(req.h) ||
          req.w < 1 || req.w > 64 || req.h < 1 || req.h > 64) {
        throw new Error(`chunk size must be 1-64 tiles per axis, got ${req.w}x${req.h}`);
      }
      if (!Array.isArray(req.entries) || req.entries.length !== req.w * req.h) {
        throw new Error(`entries length ${Array.isArray(req.entries) ? req.entries.length : typeof req.entries} != ${req.w}x${req.h}`);
      }
      const state = useProjectStore.getState();
      // Chunk nametables index into the unified zone tileset.
      const entriesErr = validateEntries(req.entries, ctx.zone.tileset.tiles.length);
      if (entriesErr) throw new Error(entriesErr);
      const id = `agent-${Date.now()}-${state.project!.chunkLibrary.length}`;
      const chunk = createChunkDef(id, req.name, req.w, req.h);
      req.entries.forEach((spec, i) => {
        chunk.nametable[i] = packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf);
        chunk.collision[i] = spec.coll ?? 0;
      });
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
      // Chunk nametables index into the unified zone tileset — the delegated
      // paint-region below validates against the same atlas the section renders.
      const entries: NametableEntrySpec[] = [];
      for (let i = 0; i < chunk.widthTiles * chunk.heightTiles; i++) {
        const e = unpackNametableWord(chunk.nametable[i]);
        entries.push({ tile: e.tileIndex, pal: e.palette, pri: e.priority, hf: e.hFlip, vf: e.vFlip, coll: chunk.collision[i] });
      }
      return handle({
        kind: 'paint-region',
        section: req.section, x: req.x, y: req.y,
        w: chunk.widthTiles, h: chunk.heightTiles, entries,
      });
    }

    case 'goto': {
      // MCP navigation targets the map viewport; if the user left the app in
      // Art mode, MapViewport (and its canvas) is unmounted. Switch back to
      // Map and wait two frames so the viewport mounts and paints first.
      if (useEditorStore.getState().appMode !== 'map') {
        useEditorStore.getState().setAppMode('map');
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      }
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

    case 'screenshot': {
      // Screenshots read the map canvas, which is unmounted in Art mode —
      // flip back to Map and give it two frames to mount before looking it up.
      if (useEditorStore.getState().appMode !== 'map') {
        useEditorStore.getState().setAppMode('map');
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      }
      requireProject();
      const canvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
      if (!canvas) throw new Error('map canvas not found — is the viewport mounted?');
      // Give the renderer a frame to flush pending paints (e.g. right after goto/paint)
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
    }

    default: {
      const exhaustive: never = req;
      throw new Error(`unknown request kind: ${(exhaustive as { kind?: string }).kind}`);
    }
  }
}
