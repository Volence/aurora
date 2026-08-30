import { useProjectStore, getCurrentZone, getCurrentAct, getActiveLevel } from '../state/projectStore';
import { useAetherStore } from '../state/aetherStore';
import { saveAllDirty } from '../state/project-runtime';
import { useEditorStore, executeAmbientCommand } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import type { S4Level, SetTilesCommand } from '../../core/editing/commands';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE,
  unpackNametableWord, createChunkDef,
} from '../../core/model/s4-types';
// THE ONE DECIDER for what sixteen bits a paint writes — the human brush's and
// the agent's, deliberately the same one. `packNametableWord` is deliberately
// NOT imported here any more: a hand-built word on this road is how `pri`'s
// omitted state got answered with "off". See core/editing/brush-word.ts.
import { brushNametableWord, brushPriorityFromOptional } from '../../core/editing/brush-word';
import type { Tile, Zone, Act } from '../../core/model/s4-types';
import { validatePaletteLine, validateTilePixels, validatePaintRegion, validateEntries, validateChunkCollisionPlane, validatePaintCollisionRect, validateCollisionWrite, validateCollisionReadPlane } from '../../core/agent/validation';
import { computeActBudget, canonicalTileHash } from '../../core/agent/budget';
import { decodeGenesisColor, encodeGenesisColor } from '../../core/formats/palette';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
// The BG plane's real engine bounds, read from the vendored aeon contract by
// the ONE module that reads it. Restating any of these here is the defect this
// import exists to close (ROADMAP item 8).
import {
  BG_LAYOUT_WORDS, BG_LAYOUT_WORDS_LEGACY, BG_TILE_CAPACITY,
  LAYOUT_TILE_INDEX_MASK, LAYOUT_WORD_MAX,
} from '../../core/formats/bg-override/bg-override';
import { danglingBgRef, makeBgId } from '../../core/formats/bg-library';
import { parseEffectsScene } from '../../core/formats/effects/scene';
import { sceneIdRefusal } from '../../core/formats/effects/scene-ui';
import {
  deleteSceneCommand, replaceSceneCommand, sectionSceneCommand,
} from '../providers/effects-aeon';
import { parseEffectsPreset } from '../../core/formats/effects/preset';
import {
  deletePresetCommand, presetIdRefusal, replacePresetCommand, PRESET_LIMITS,
} from '../providers/effects-preset';
import {
  addBandCommand, bandBudget, bandRows, demoteBandCommand,
  promoteBandCommand, removeBandCommand,
} from '../providers/bg-anim-aeon';
import { regenerateShiftCommand } from '../providers/bg-anim-art';
import { BG_SECTION_BINDING_LIMIT } from '../../core/formats/bg-binding';
import { makeSetBgOverrideTilesCommand } from '../../core/editing/bg-override-art';
import { buildStampCommand } from '../../core/editing/map-stamp';
import { withLinkBreaks } from '../../core/editing/chunk-links';
import { ensureCollisionPlanes } from '../../core/collision/collision-cell-resolve';
import {
  paintCollisionRectBothPlanes, paintCollisionCellsBothPlanes,
} from '../../core/collision/collision-paint';
import {
  readCollisionRegion, SECTION_CELLS_WIDE, SECTION_CELLS_HIGH, COLLISION_REGION_MAX_CELLS,
} from '../../core/collision/collision-region-read';
import {
  auditCrossovers, crossoverAuditSeverity, crossoverAuditMessage,
} from '../../core/collision/crossover-audit';
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
import { applyCollisionShapeRect } from '../state/collision-dispatch';
import { commitPixels } from './art-commit';
import { loadCanvasFile } from '../state/canvas-file';
import { sheetFromBytes, explainSheetRefusal, sheetRefusalResolution } from '../../core/art/sheet-import';
import type { PngImportRefusal } from '../../core/art/png-import';
import type { ArtCommitReply } from './art-commit';
import type { LevelDoc, LayoutGrid } from '../../core/level-classic/model';
import { planProjectOpen, currentOpenDirtySnapshot } from '../shell/project-open-guard';
import { useSessionStore } from '../state/sessionStore';
import { parseLevelTabId } from '../shell/tabs';
import { switchFacet } from '../workspace/facet-tools';
import { useWorkspaceStore } from '../workspace/workspaceStore';

let registered = false;

// Zone-wide background (Plane B): the engine's 64x64 nametable with its own
// tile blob — a SEPARATE tile space from the zone tileset (the engine loads it
// at VRAM slot 1024+). Layout tile indices are local to the BG blob in BOTH
// directions: load-time normalization (normalizeBgLayout) guarantees the
// in-memory layout get_bg returns is local, and set_bg validates local input.
//
// EVERY BOUND BELOW IS READ FROM THE VENDORED CONTRACT, never restated here —
// bg-override.ts is the one module that reads
// `bganim-consumer-contract.json`, and these are its exports. This file used to
// hardcode `BG_TILES_HIGH = 32` / `BG_MAX_TILES = 512`, and both were wrong in
// OPPOSITE directions:
//
//   • too NARROW on height — the engine's nametable is BG_LAYOUT_WORDS words
//     (64x64), so a 2048-word `.length` check made the full-height plane
//     literally unrepresentable on the agent path, on a document the BG library
//     already holds at that size. The legacy 64x32 shape stays legal: the
//     consumer ZERO-PADS it rather than refusing (BG_LAYOUT_WORDS_LEGACY), so
//     refusing it here would reject a file aeon bakes fine.
//   • too LOOSE on tiles — the BG tile region is $8000..$B7FF, i.e.
//     BG_TILE_CAPACITY tiles, because the sprite attribute table sits at
//     $B800. 512 accepted blobs the hardware cannot hold; the surplus sprays
//     into the SAT. A loose ceiling is the dangerous half: it takes documents
//     the engine's own injector asserts against.
const BG_ROWS = BG_LAYOUT_WORDS / BG_WIDTH;
const BG_ROWS_LEGACY = BG_LAYOUT_WORDS_LEGACY / BG_WIDTH;

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

/**
 * The BG override document as the project holds it RIGHT NOW.
 *
 * Re-read on every use rather than captured once: a band command REPLACES the
 * document inside the project's holder, so a reply built from a value read
 * before the command would describe the document the operation started from.
 * That is the same aliasing hazard `getActiveLevel`'s accessor exists for, seen
 * from the reader's side.
 */
function currentBgOverride() {
  return useProjectStore.getState().project?.bgOverride.doc ?? null;
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

/**
 * An IMPORT refusal, in the commit refusal's shape.
 *
 * Derived from `ArtCommitReply`'s own `ok:false` arm rather than written out
 * again, so "same shape" is a fact the compiler checks: drop `offers`, misspell
 * `resolution`, or let the commit reply grow a field, and this stops compiling.
 * It cannot simply BE that arm — the refusal it carries is a `PngImportRefusal`
 * (two kinds about colour, raised before planning starts), not a
 * `CommitRefusal`, and widening the commit arm to accept either would let a
 * commit reply claim a refusal a commit can never raise.
 */
type SheetRefusalReply =
  Omit<Extract<ArtCommitReply, { ok: false }>, 'refusal'> & { refusal: PngImportRefusal };

/**
 * A canvas commit's reply: whatever `commitPixels` returned, plus the load's
 * warnings.
 *
 * Annotated rather than inferred so the extra field is checked. `warnings` is
 * spread-LAST on purpose: were `ArtCommitReply` ever to grow a `warnings` of its
 * own, an inferred object would silently keep whichever came last and nobody
 * would notice the canvas's were gone. Naming the type here means that day is a
 * compile error instead.
 */
type CanvasCommitReply = ArtCommitReply & { warnings: string[] };

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
      executeAmbientCommand({
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
      executeAmbientCommand({
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
          // A DECIDER: the request means something NARROWER than the cell.
          // `pri` is optional on the wire, so omitting it is "no opinion about
          // depth" and the destination's bit 15 stands — the same rule the
          // human brush follows. The flips are NOT optional in that sense: a
          // request naming a tile and no flip has named an unflipped picture.
          entries.push({
            index: idx,
            oldNt,
            newNt: brushNametableWord(spec.tile, oldNt, {
              paletteLine: spec.pal,
              hFlip: !!spec.hf,
              vFlip: !!spec.vf,
              priority: brushPriorityFromOptional(spec.pri),
            }),
          });
        }
      }
      // A PAINTED TILE STOPS TRACKING ITS CHUNK (owner ruling d-18c) — the same
      // rule the human brush follows in MapViewport. An agent bulk-paint over a
      // stamped region is exactly the case where a surviving link would have the
      // next chunk edit overwrite work the agent was asked to do.
      executeAmbientCommand(withLinkBreaks(section, {
        type: 'set-tiles',
        description: `agent: paint ${req.w}x${req.h} at (${req.x},${req.y})`,
        sectionIndex: req.section,
        entries,
      }), ctx.level);
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
      // EITHER a single fill `word` OR a per-cell `words` array. The check is
      // here rather than in zod because `EditorMethod.params` is a raw shape
      // with nowhere to hang a refinement; see validateCollisionWrite.
      const formErr = validateCollisionWrite(req.word, req.words, req.w, req.h);
      if (formErr) throw new Error(formErr);
      ensureCollisionPlanes(section);
      // "both" is a MODE, not a third plane — the aimed plane stays A so the
      // command, its description and its undo all name a real plane. See
      // core/collision/both-planes-paint.ts for why "solid on both planes"
      // needs no new cell field and is therefore not blocked on aeon's
      // encoding anchor the way a layer transition is.
      const bothPlanes = req.plane === 'both';
      const aimedId: 'a' | 'b' = req.plane === 'both' ? 'a' : req.plane;
      const aimed = aimedId === 'b' ? section.collisionEditB! : section.collisionEdit!;
      const other = aimedId === 'b' ? section.collisionEdit! : section.collisionEditB!;
      // Absent means `keep`, never `clear` — see the protocol comment.
      const crossover = req.crossover ?? 'keep';
      // THE THREE AXES COMPOSE, AND NOTHING BRANCHES TWICE ON ANY OF THEM.
      // FORM picks the builder; PLANE and CROSSOVER are passed through to the
      // same `buildPlaneEntries` merge underneath either one. Both forms are
      // DECIDERS and both reach `collisionPaintWord` — two forms of one tool
      // must not be two rules
      // (docs/reviews/2026-08-29-paint-collision-reconcile.md).
      const plan = req.words !== undefined && req.words !== null
        ? paintCollisionCellsBothPlanes({
          x: req.x, y: req.y, w: req.w, h: req.h, words: req.words,
          aimedPlane: aimed, otherPlane: other, tileWidth: SECTION_TILES_WIDE, bothPlanes,
          aimedPlaneId: aimedId, crossover,
        })
        : {
          ...paintCollisionRectBothPlanes({
            x: req.x, y: req.y, w: req.w, h: req.h, word: req.word!,
            aimedPlane: aimed, otherPlane: other, tileWidth: SECTION_TILES_WIDE, bothPlanes,
            aimedPlaneId: aimedId, crossover,
          }),
          // The FILL form names a word for every cell in the rectangle, so it
          // can never skip one. Stated as a constant rather than left off the
          // reply, so `skipped` means the same thing on both roads.
          skipped: 0,
        };
      const entries = plan.aimed;
      const otherPlaneEntries = plan.other;
      if (entries.length > 0 || otherPlaneEntries.length > 0) {
        executeAmbientCommand({
          type: 'set-collision-edit',
          plane: aimedId,
          description: `agent: paint collision ${bothPlanes ? 'A+B (both planes)' : aimedId.toUpperCase()} `
            + `${req.w}x${req.h} at (${req.x},${req.y})`,
          sectionIndex: req.section,
          entries,
          ...(otherPlaneEntries.length ? { otherPlaneEntries } : {}),
        }, ctx.level);
      }
      // `painted` stays the AIMED plane's count so an existing caller's number
      // does not change meaning; `paintedOther` is the new half, reported
      // separately rather than folded in. A single summed number would make
      // "wrote 8 sub-tiles on one plane" and "wrote 4 on each of two"
      // indistinguishable, and this parcel's whole risk is the second plane
      // quietly not being written.
      // `skipped` counts CELLS whose word was null — one number, not one per
      // plane, because the nulls come from a single `words` array and a cell a
      // caller declined to name is declined on both planes.
      // The audit rides back on the reply rather than waiting to be asked for.
      // An agent painting a loop is the caller LEAST able to notice that it
      // marked only one plane — it has no lens — and aeon's build does not
      // check it either (anchor §8.2 assigns the loop-shaped check to Aurora).
      // So the number that says "this loop works in one direction" is returned
      // beside the paint that could have caused it.
      const audit = auditCrossovers(section.collisionEdit, section.collisionEditB);
      return {
        painted: entries.length, paintedOther: otherPlaneEntries.length, bothPlanes,
        skipped: plan.skipped,
        crossover,
        crossoverAudit: {
          marksA: audit.marksA, marksB: audit.marksB, pairs: audit.pairs,
          oneWay: audit.oneWay, selfMarks: audit.selfMarks, reserved: audit.reserved,
          severity: crossoverAuditSeverity(audit),
          note: crossoverAuditMessage(audit),
        },
      };
    }

    case 'get-collision-region': {
      const ctx = requireProject();
      // ⚠ THE ONE COMBINATION THE MERGE REFUSED. `paint_collision` takes
      // plane: "both"; this does not, and a caller that just used it there will
      // try it here. The refusal is prose, not a bare enum error, because the
      // method description is the only documentation an agent gets. See
      // `validateCollisionReadPlane` for the argument.
      const planeErr = validateCollisionReadPlane(req.plane);
      if (planeErr) throw new Error(planeErr);
      // THE SAME VALIDATOR THE WRITE USES, on purpose: read and write must not
      // drift on what a legal cell rectangle is, and its cellsW/cellsH come
      // from the derived section cell extent rather than a second /2 here.
      const err = validatePaintCollisionRect(req.section, req.x, req.y, req.w, req.h, {
        sectionCount: ctx.act.sections.length,
        cellsW: SECTION_CELLS_WIDE, cellsH: SECTION_CELLS_HIGH,
      });
      if (err) throw new Error(err);
      if (req.w * req.h > COLLISION_REGION_MAX_CELLS) {
        throw new Error(
          `region ${req.w}x${req.h} = ${req.w * req.h} cells exceeds the `
          + `${COLLISION_REGION_MAX_CELLS}-cell per-call limit; read it in tiles `
          + `(a whole ${SECTION_CELLS_WIDE}x${SECTION_CELLS_HIGH}-cell section is `
          + `${Math.ceil((SECTION_CELLS_WIDE * SECTION_CELLS_HIGH) / COLLISION_REGION_MAX_CELLS)} calls)`,
        );
      }
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty`);
      // Seed exactly as a paint would. A section nobody has painted yet has NO
      // authored plane, and reading it as all-air would report "no collision"
      // for a section whose engine baseline is full of it — the read would be
      // confidently wrong about the very thing it exists to check.
      ensureCollisionPlanes(section);
      const planeWords = req.plane === 'b' ? section.collisionEditB! : section.collisionEdit!;
      return readCollisionRegion({
        plane: req.plane,
        planeWords,
        tileWidth: SECTION_TILES_WIDE,
        x: req.x, y: req.y, w: req.w, h: req.h,
        profiles: useProjectStore.getState().collisionProfiles,
        ascii: req.ascii === true,
      });
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
        // A CREATOR, not a decider: `createChunkDef` hands back a freshly
        // allocated nametable, so there is provably nothing to preserve and
        // `keep` means "no priority" — byte for byte what this always wrote.
        //
        // `undefined` rather than `chunk.nametable[i]` ON PURPOSE. Reading the
        // fresh array would give the same answer today and would silently turn
        // this into a merge the day `createChunkDef` starts seeding anything;
        // `undefined` states the classification in code, and brushNametableWord
        // documents that a caller with no destination gets "no priority".
        chunk.nametable[i] = brushNametableWord(spec.tile, undefined, {
          paletteLine: spec.pal,
          hFlip: !!spec.hf,
          vFlip: !!spec.vf,
          priority: brushPriorityFromOptional(spec.pri),
        });
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
      // The checkbox's wire form (d-18c). Absent means KEEP the link, which is
      // the ruling's default and matches what the UI checkbox does unchecked —
      // the two surfaces must not disagree about what a plain stamp means.
      const detached = req.detach === true;
      const cmd = buildStampCommand({
        chunk, section, sectionIndex: req.section,
        baseCol: req.x, baseRow: req.y, artOnly: false, detached,
        description: `agent: stamp ${chunk.id} at (${req.x},${req.y})${detached ? ' (detached)' : ''}`,
      });

      let changed = 0;
      if (cmd) {
        executeAmbientCommand(cmd, ctx.level);
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
      // `height` is MEASURED off the layout this act actually holds, never
      // announced from a constant: the same document is legal at BG_ROWS and at
      // BG_ROWS_LEGACY, so a fixed number would misdescribe one of them. Null
      // when there is no background, matching `layout`/`tiles` — the reply's
      // existing convention, and honest about a plane that is not there.
      return {
        width: BG_WIDTH,
        height: ctx.act.bgLayout ? ctx.act.bgLayout.length / BG_WIDTH : null,
        layout: ctx.act.bgLayout ? Array.from(ctx.act.bgLayout) : null,
        tiles: ctx.act.bgTiles ? ctx.act.bgTiles.map(t => Array.from(t.pixels)) : null,
      };
    }

    case 'set-bg': {
      const ctx = requireProject();
      if (!Array.isArray(req.tiles) || req.tiles.length < 1 || req.tiles.length > BG_TILE_CAPACITY) {
        throw new Error(
          `the BG tile blob holds 1-${BG_TILE_CAPACITY} tiles, got `
          + `${Array.isArray(req.tiles) ? req.tiles.length : typeof req.tiles}. `
          + `${BG_TILE_CAPACITY} is the BG VRAM region $8000..$B7FF, not a policy — the sprite `
          + `attribute table sits at $B800, so tile ${BG_TILE_CAPACITY} would spray into it.`,
        );
      }
      const newTiles: Tile[] = [];
      for (let i = 0; i < req.tiles.length; i++) {
        const err = validateTilePixels(req.tiles[i]);
        if (err) throw new Error(`tile ${i}: ${err}`);
        newTiles.push({ pixels: Uint8Array.from(req.tiles[i]) });
      }
      if (!Array.isArray(req.layout)
        || (req.layout.length !== BG_LAYOUT_WORDS && req.layout.length !== BG_LAYOUT_WORDS_LEGACY)) {
        throw new Error(
          `layout must have ${BG_LAYOUT_WORDS} words (${BG_WIDTH}x${BG_ROWS}) or `
          + `${BG_LAYOUT_WORDS_LEGACY} (${BG_WIDTH}x${BG_ROWS_LEGACY} legacy, which the engine's `
          + `injector zero-pads to ${BG_LAYOUT_WORDS} rather than refusing), got `
          + `${Array.isArray(req.layout) ? req.layout.length : typeof req.layout}`,
        );
      }
      for (let i = 0; i < req.layout.length; i++) {
        const word = req.layout[i];
        if (!Number.isInteger(word) || word < 0 || word > LAYOUT_WORD_MAX) {
          throw new Error(`layout word ${i} = ${word}: must be a 16-bit nametable word`);
        }
        const tileIdx = word & LAYOUT_TILE_INDEX_MASK;
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

      executeAmbientCommand({
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
        const proj = useProjectStore.getState().project!;
        if (!proj.bgLibrary.some(b => b.id === req.bgId)) {
          // TWO DIFFERENT REFUSALS, because they need two different actions.
          // "Not in the library" is right for an id nobody ever made. But an id
          // the zone's MANIFEST names, whose binaries this checkout does not
          // have, is a refusal the agent cannot act on with that wording — it
          // reads the id in `list_bgs`'s own `unresolved` column and is told it
          // does not exist. The bytes are the missing thing, and only the
          // person with the authoring checkout can supply them.
          const named = proj.bgLibraryUnresolved.find(e => e.id === req.bgId);
          if (named) {
            throw new Error(
              `bg "${req.bgId}" (${named.name}) is named by the zone's bglib manifest but its ` +
              'layout/tile binaries are not in this checkout, so there is nothing to display. ' +
              'Aeon tracks the manifest and not the bodies — the files have to come from the ' +
              'authoring machine before this ref can resolve.');
          }
          throw new Error(`bg "${req.bgId}" not found in the library (use list-bgs)`);
        }
      }
      if (section.bgLayoutRef === req.bgId) {
        // No-op guard: a same-ref command would consume an undo slot without
        // changing anything.
        return { section: req.section, bgId: req.bgId, changed: false, binding: BG_SECTION_BINDING_LIMIT };
      }
      executeAmbientCommand({
        type: 'set-section-bg',
        description: `agent: section ${req.section} bg -> ${req.bgId ?? 'act default'}`,
        sectionIndex: req.section,
        oldRef: section.bgLayoutRef,
        newRef: req.bgId,
      }, ctx.level);
      // A SUCCESS REPLY THAT SAYS WHERE THE SUCCESS STOPS. `changed: true` is
      // true — the ref is written, the sidecar persists it, the viewport
      // composites it — and an agent reading only that reasonably concludes the
      // background is in the game. Nothing bakes it. `list_effects_presets`
      // answers the same shape with `sectionBinding` rather than an all-nulls
      // column, and this is that answer for the tool that DOES write something.
      return {
        section: req.section, bgId: req.bgId, changed: true,
        binding: BG_SECTION_BINDING_LIMIT,
      };
    }

    case 'list-bgs': {
      const ctx = requireProject();
      const proj = useProjectStore.getState().project!;
      const library = proj.bgLibrary;
      return {
        actDefault: ctx.act.bgLayout && ctx.act.bgTiles
          ? { width: BG_WIDTH, height: Math.floor(ctx.act.bgLayout.length / BG_WIDTH), tiles: ctx.act.bgTiles.length }
          : null,
        entries: library.map(b => ({ id: b.id, name: b.name, tiles: b.tiles.length })),
        // NAMED BY THE MANIFEST, NOT OPENABLE HERE. Without this column an
        // agent on a clean clone of aeon sees `entries: []` and concludes the
        // zone has no backgrounds, when the tracked `{zone}_bglib.json` names
        // seventeen and only their untracked binaries are missing. Empty is the
        // ordinary answer; a non-empty one is a fact about the CHECKOUT, not
        // about the project, and no amount of editing here will change it.
        unresolved: proj.bgLibraryUnresolved.map(e => ({ id: e.id, name: e.name })),
        // The per-section column IS meaningful here (unlike the preset tool's,
        // which would be all-nulls forever) — the refs are real and the editor
        // uses them. What it cannot say on its own is that none of them reaches
        // a ROM, so the sentence travels beside the column rather than instead
        // of it. Same words as assign_section_bg's reply, from one constant.
        //
        // `dangling` is the second thing the bare `bgId` could not say. A
        // section printing an id that appears in neither `entries` nor
        // `unresolved` is showing the ACT DEFAULT on screen while this column
        // reads as an assignment that works, and the reader has to cross-check
        // two arrays to notice. The flag is computed from the same library the
        // viewport resolves against, so it cannot drift from what is painted.
        sections: ctx.act.sections.map((s, i) => s
          ? { index: i, bgId: s.bgLayoutRef, dangling: danglingBgRef(s.bgLayoutRef, library) !== null }
          : null),
        sectionBinding: BG_SECTION_BINDING_LIMIT,
      };
    }

    // ---- The effects arc, wave 1 (AURORA_EFFECTS_SCHEMA.md §2/§3) ----------
    //
    // These three go through the SAME provider functions the Effects facet's
    // controls do (providers/effects-aeon), so the agent path and the human path
    // cannot diverge on what a no-op is, which refs are assignable, or how a
    // scene edit is recorded. What they add is the validation an agent needs and
    // a form does not: a form can only produce documents its own controls allow,
    // where an agent hands over arbitrary JSON.

    case 'list-effects-scenes': {
      const ctx = requireProject();
      const library = useProjectStore.getState().project!.effectsScenes;
      return {
        scenes: library.scenes.map(s => ({
          id: s.id,
          name: typeof s.name === 'string' ? s.name : null,
          layers: s.layers.length,
        })),
        // NOT silently omitted. A file that would not parse is a scene id an
        // agent must not take and a file it must not expect to be rewritten.
        unreadable: library.unreadable.map(u => ({ path: u.path, reason: u.reason })),
        sections: ctx.act.sections.map((s, i) => s ? { index: i, sceneId: s.sceneRef } : null),
      };
    }

    case 'get-effects-scene': {
      requireProject();
      const library = useProjectStore.getState().project!.effectsScenes;
      const scene = library.scenes.find(s => s.id === req.id);
      if (!scene) {
        const broken = library.unreadable.find(u => u.path.endsWith(`/${req.id}.json`));
        throw new Error(broken
          ? `scene "${req.id}" exists at ${broken.path} but could not be read (${broken.reason})`
          : `scene "${req.id}" not found (use list_effects_scenes)`);
      }
      // The whole document, unfiltered — the point of the tool.
      return { scene };
    }

    case 'set-effects-scene': {
      const ctx = requireProject();
      const library = useProjectStore.getState().project!.effectsScenes;

      if (req.scene === null) {
        const command = deleteSceneCommand(library, req.id);
        if (!command) return { id: req.id, deleted: false, reason: 'no such scene' };
        executeAmbientCommand(command, ctx.level);
        return { id: req.id, deleted: true };
      }

      // VALIDATED BY THE CODEC, not by a shape restated on this boundary. Going
      // through parseEffectsScene rather than validateAgainstSchema buys the two
      // rules that are not in the JSON schema at all: the filename-stem identity
      // check, and the loud rejection of layer_mask_raw / v_deform_shift_raw.
      const scene = parseEffectsScene(JSON.stringify(req.scene), req.id);

      const existing = library.scenes.find(s => s.id === req.id) ?? null;
      if (!existing) {
        // A CREATE has to answer an id question a replace does not: the id may
        // already be taken by a file that did not parse, which is invisible to
        // list_effects_scenes and which the save path refuses to write over.
        const refusal = sceneIdRefusal(req.id, library);
        if (refusal) throw new Error(refusal);
      }
      const command = replaceSceneCommand(library, req.id, scene);
      if (!command) return { id: req.id, changed: false };
      executeAmbientCommand(command, ctx.level);
      return { id: req.id, changed: true, created: existing === null };
    }

    case 'assign-section-scene': {
      const ctx = requireProject();
      if (!Number.isInteger(req.section) || req.section < 0 || req.section >= ctx.act.sections.length) {
        throw new Error(`section ${req.section} out of range (0-${ctx.act.sections.length - 1})`);
      }
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty`);
      const library = useProjectStore.getState().project!.effectsScenes;
      if (req.sceneId !== null && !library.scenes.some(s => s.id === req.sceneId)) {
        // Deliberately refuses an UNREADABLE id too — it is not in `scenes`.
        // Writing a ref the build cannot resolve is worse than writing none.
        throw new Error(`scene "${req.sceneId}" is not a readable scene in this project (use list_effects_scenes)`);
      }
      const command = sectionSceneCommand(req.section, section.sceneRef, req.sceneId ?? '');
      if (!command) return { section: req.section, sceneId: req.sceneId, changed: false };
      executeAmbientCommand(command, ctx.level);
      return { section: req.section, sceneId: req.sceneId, changed: true };
    }

    // ---- Wave 2: raster PRESETS (DoD item 12) ------------------------------
    //
    // The three above, mirrored onto the OTHER effects document — and they are a
    // different document, not a different view of the same one. A scene is a
    // `parallax_config` under data/editor/effects/; a preset is the raster band
    // program under data/editor/effects/presets/, and the scene loader refuses a
    // `bands` key outright, so the two can never be confused into one file.
    //
    // Same design rule as the scene block: these go through the SAME provider
    // functions the band-preset panel's controls do (providers/effects-preset),
    // so the agent path and the human path cannot diverge on what a no-op is or
    // which ids are creatable. Same refusal convention too — THROWN, not
    // returned as `{ok:false}`.
    //
    // ⚠ THERE IS NO FOURTH TOOL HERE. `assign_section_preset` would be the
    // mirror of `assign-section-scene`, and it is not written. `SectionMeta` is
    // `{bgLayoutRef, paletteRef, rasterRef, sceneRef}`
    // (core/formats/section-meta.ts) and the preset field now EXISTS —
    // `rasterRef`, empyrean docs/AURORA_EFFECTS_SCHEMA.md §3.1, adjudicated
    // 2026-08-30 — but Aurora only PRESERVES it round-trip; nothing here
    // authors one, and aeon's generator does not yet read one. So the gap moved
    // rather than closed, and it is still ROADMAP row 93 — and still why
    // `PRESET_LIMITS`' first limit says saving a preset does not install it.
    //
    // ⚠ NOT `effectsRef`: that reservation stays unspent for a TOTAL binding.

    case 'list-effects-presets': {
      requireProject();
      const library = useProjectStore.getState().project!.effectsPresets;
      return {
        // `presetListEntries` is the PANEL's row shape (id/label/bands) and is
        // deliberately not reused: `label` collapses a missing name onto the id,
        // which is right for a list a human reads and wrong for an agent, which
        // must be able to tell "named after itself" from "unnamed". So this
        // reports `name` raw, exactly as `list_effects_scenes` does.
        presets: library.presets.map(p => ({
          id: p.id,
          name: typeof p.name === 'string' ? p.name : null,
          bands: p.bands.length,
        })),
        // NOT silently omitted, on list_effects_scenes' rule: a file that would
        // not parse is a preset id an agent must not take and a file it must not
        // expect to be rewritten.
        unreadable: library.unreadable.map(u => ({ path: u.path, reason: u.reason })),
        // WHERE `list_effects_scenes` HAS A `sections` COLUMN, THIS HAS A
        // SENTENCE — and the difference is a fact about the repo, not a gap in
        // the tool. A per-section column here would be all-nulls forever and
        // would read as "assigned to nothing" rather than "there is no
        // assignment to make", which is the wrong thing for an agent to
        // conclude: it would go looking for the assign tool. Said once, in the
        // panel's own words (`PRESET_LIMITS.unbound`), so the agent and the
        // author are told the same thing.
        sectionBinding: PRESET_LIMITS.find(l => l.key === 'unbound')!.body,
      };
    }

    case 'get-effects-preset': {
      requireProject();
      const library = useProjectStore.getState().project!.effectsPresets;
      const preset = library.presets.find(p => p.id === req.id);
      if (!preset) {
        const broken = library.unreadable.find(u => u.path.endsWith(`/${req.id}.json`));
        throw new Error(broken
          ? `preset "${req.id}" exists at ${broken.path} but could not be read (${broken.reason})`
          : `preset "${req.id}" not found (use list_effects_presets)`);
      }
      // The whole document, unfiltered — the point of the tool.
      return { preset };
    }

    case 'set-effects-preset': {
      const ctx = requireProject();
      const library = useProjectStore.getState().project!.effectsPresets;

      if (req.preset === null) {
        const command = deletePresetCommand(library, req.id);
        if (!command) return { id: req.id, deleted: false, reason: 'no such preset' };
        executeAmbientCommand(command, ctx.level);
        return { id: req.id, deleted: true };
      }

      // VALIDATED BY THE CODEC, not by a shape restated on this boundary — the
      // rule set-effects-scene states. Going through parseEffectsPreset rather
      // than validateAgainstSchema buys the three rules that are not in the JSON
      // schema at all: the filename-stem identity check, the reserved wave-2
      // vocabulary refused BY NAME (fires / variants / cycles), and the
      // exactly-one-ON-arm sentence that explains why two writes cannot share a
      // band. It also buys what the codec deliberately does NOT do: no numeric
      // bound is checked and nothing is clamped, so the engine's own `ensure`
      // still fires with the measurement behind the rule (aeon §E.4).
      const preset = parseEffectsPreset(JSON.stringify(req.preset), req.id);

      const existing = library.presets.find(p => p.id === req.id) ?? null;
      if (!existing) {
        // A CREATE has to answer an id question a replace does not: the id may
        // already be taken by a file that did not parse, which is invisible to
        // list_effects_presets and which the save path refuses to write over.
        const refusal = presetIdRefusal(req.id, library);
        if (refusal) throw new Error(refusal);
      }
      const command = replacePresetCommand(library, req.id, preset);
      if (!command) return { id: req.id, changed: false };
      executeAmbientCommand(command, ctx.level);
      return { id: req.id, changed: true, created: existing === null };
    }

    // ---- Wave-1 surface 4: BgAnim bands ------------------------------------
    //
    // These five go through the SAME provider functions the band panel's
    // controls do (providers/bg-anim-aeon), which in turn go through the same
    // four command factories, which in turn go through the codec's own
    // validator. Three layers, one rulebook: an agent and an author cannot
    // disagree about what a full blob refuses, because neither of them owns the
    // refusal — the codec does, and both quote it.
    //
    // THE REFUSALS ARE THROWN, not returned as `{ok:false}`. A provider result
    // is a form's business (it greys a control and prints a reason beside it);
    // an agent asked for an operation and either got it or did not, and an
    // error is the only reply an MCP client cannot mistake for success.

    case 'list-bg-anim-bands': {
      const ctx = requireProject();
      const state = useProjectStore.getState().project!.bgOverride;
      return {
        path: state.path,
        // NOT silently omitted, on the rule list_effects_scenes states: a file
        // that would not parse is a document an agent must not expect to be
        // rewritten, and it is why every operation below will refuse.
        unreadable: state.unreadable,
        present: state.doc !== null,
        budget: bandBudget(state.doc),
        bands: bandRows(state.doc).map(b => ({
          index: b.index, cols: b.cols, rows: b.rows, tileCount: b.tileCount,
          patternPx: b.patternPx, columnBytes: b.columnBytes,
          // `driver` is the EFFECTIVE value and `driverIsExplicit` says whether
          // the document spells it. An agent that read only the first would
          // write today's default into a file that was tracking the contract's.
          driver: b.driver, driverIsExplicit: b.driverIsExplicit,
          rateShift: b.rateShift, rateShiftIsExplicit: b.rateShiftIsExplicit,
          slotBase: b.slotBase, phaseBanks: b.phaseBanks,
        })),
        // Stated on every reply because it is the fact that decides which of the
        // two authoring doors an agent should reach for.
        note: 'Every band shifts HORIZONTALLY; `driver` names the scalar source '
          + '(camera_x/camera_y/timer), never an axis. Adding a band grows the tile blob; '
          + 'promoting an existing static range does not.',
        actSections: ctx.act.sections.length,
      };
    }

    case 'promote-bg-anim-band': {
      const ctx = requireProject();
      const doc = useProjectStore.getState().project!.bgOverride.doc;
      const result = promoteBandCommand(doc, req.staticBase, {
        cols: req.cols, rows: req.rows,
        ...(req.phaseFill !== undefined ? { phaseFill: req.phaseFill } : {}),
        ...(req.driver !== undefined ? { driver: req.driver } : {}),
        ...(req.rateShift !== undefined ? { rateShift: req.rateShift } : {}),
      });
      if (!result.ok) throw new Error(result.reason);
      executeAmbientCommand(result.command, ctx.level);
      return { promoted: true, bands: bandRows(currentBgOverride()).length, budget: bandBudget(currentBgOverride()) };
    }

    case 'demote-bg-anim-band': {
      const ctx = requireProject();
      const result = demoteBandCommand(currentBgOverride(), req.band, req.staticBase);
      if (!result.ok) throw new Error(result.reason);
      executeAmbientCommand(result.command, ctx.level);
      return { demoted: true, bands: bandRows(currentBgOverride()).length, budget: bandBudget(currentBgOverride()) };
    }

    case 'add-bg-anim-band': {
      const ctx = requireProject();
      const result = addBandCommand(currentBgOverride(), {
        cols: req.cols, rows: req.rows,
        ...(req.phaseFill !== undefined ? { phaseFill: req.phaseFill } : {}),
        ...(req.driver !== undefined ? { driver: req.driver } : {}),
        ...(req.rateShift !== undefined ? { rateShift: req.rateShift } : {}),
      }, req.phases);
      if (!result.ok) throw new Error(result.reason);
      executeAmbientCommand(result.command, ctx.level);
      return { added: true, bands: bandRows(currentBgOverride()).length, budget: bandBudget(currentBgOverride()) };
    }

    case 'remove-bg-anim-band': {
      const ctx = requireProject();
      // `blankReferencingCells` defaults OFF here exactly as it does in the
      // command: an agent that did not say it meant to lose the art gets the
      // refusal WITH the cell count, which is the only reply that lets it decide.
      const result = removeBandCommand(
        currentBgOverride(), req.band, req.blankReferencingCells === true);
      if (!result.ok) throw new Error(result.reason);
      executeAmbientCommand(result.command, ctx.level);
      return { removed: true, bands: bandRows(currentBgOverride()).length, budget: bandBudget(currentBgOverride()) };
    }

    case 'set-bg-override-tiles': {
      const ctx = requireProject();
      const doc = currentBgOverride();
      if (!doc) throw new Error('no BG override document (data/editor_bg_override.json) is open');
      // The builder THROWS the codec's words on a bad index/pixel — surfaced as
      // an error, on the rule the band cases above state.
      const cmd = makeSetBgOverrideTilesCommand(doc, req.tiles);
      executeAmbientCommand(cmd, ctx.level);
      return { written: cmd.tiles.map((t) => t.index), bands: bandRows(currentBgOverride()).length };
    }

    case 'regenerate-bg-anim-band-shift': {
      const ctx = requireProject();
      const result = regenerateShiftCommand(currentBgOverride(), req.band);
      if (!result.ok) throw new Error(result.reason);
      executeAmbientCommand(result.command, ctx.level);
      return { regenerated: true, band: req.band };
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

      // A READ MUST NOT DESTROY WORK. `openAct` re-reads from disk, drops both
      // undo stacks and clears every dirty flag — so calling it unconditionally
      // made the natural agent sequence (edit, then read back to check) revert
      // the agent's own edits and report the pristine disk state as success.
      // The two doors this tool sits beside already have the policy: the tab
      // strip's planLevelActivation no-ops on the loaded act and confirms
      // before discarding, and classic-open-project above fails closed. This is
      // the same rule with the confirm turned into a refusal, because an
      // agent-driven read has no UI to confirm through.
      const loaded = useClassicLevelStore.getState();
      // A failed or never-finished load of the same act is still worth
      // retrying: there is no doc, so there is nothing to lose.
      const sameAct = loaded.ref?.zone === ref.zone && loaded.ref?.act === ref.act
        && loaded.status === 'ready' && !!loaded.doc;
      if (!sameAct) {
        if (Object.values(loaded.dirty).some(Boolean)) {
          throw new Error(
            `Unsaved changes in ${loaded.ref?.label ?? 'the loaded act'}. Reading ${req.zone}/${req.act} ` +
            'reloads from disk and would discard them — save first (classic-save-level), then retry.',
          );
        }
        await useClassicLevelStore.getState().openAct(ref);
      }
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

    case 'classic-set-block-collision': {
      // THE ONE FAULT ON THIS TOOL. Everything else a caller could fix by
      // changing an argument comes back as a refusal inside a SUCCESSFUL
      // result — a throw is -32603 INTERNAL at the Aether adapter, which tells
      // the client Aurora broke. See art-commit.ts for the worked example.
      requireClassicDoc();

      // ONE call, deliberately. `dryRun` is the dispatch function's option
      // (collision-dispatch.ts) rather than a planner call made here: planning
      // in the handler would need the rectangle planner, which this case's own
      // source guard forbids, and the guard is right — a second planning site
      // is a second place for the Link/Isolate decision to drift.
      const res = applyCollisionShapeRect(
        { x: req.x, y: req.y, w: req.w, h: req.h },
        req.shape,
        req.mode ?? 'link',
        { dryRun: req.dryRun },
      );

      const dryRun = req.dryRun === true;
      return res.ok
        ? { ok: true, ...res.report, dryRun }
        // `offers` is [] and stays [] — unlike the art line's palette
        // resolutions, no parameter VALUE can unblock these refusals. The
        // actionable half is `resolution`, which is computed against THIS
        // document, so it never recommends a mode this document also refuses.
        // Shaped like `import_art_sheet`'s refusal reply so a caller handles
        // every Aurora refusal with one branch.
        : { ok: false, refusal: res.refusal, message: res.why, resolution: res.resolution, offers: [], dryRun };
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
      const result = await saveClassicProject();
      // A FAILED SAVE IS NOT A RESULT. `saveClassicProject` reports outcomes as
      // a variant rather than throwing — that is its contract with the UI,
      // which toasts them — but returning the variant verbatim here made a
      // conflict, a partial write or a self-check failure arrive at the agent
      // as an ordinary successful tool result. The agent then proceeds as if
      // the level were on disk. The transport's only "this failed" channel is a
      // throw, so the failing variants take it.
      switch (result.kind) {
        case 'saved':
        case 'nothing':
          return result;
        case 'conflict':
          throw new Error(
            `Save aborted — ${result.conflicts.length} file(s) changed on disk since the act was read ` +
            `(${result.conflicts.slice(0, 3).join(', ')}). Reopen the act to pick up the external changes.`,
          );
        case 'partial':
          throw new Error(
            `Save incomplete — the write failed at ${result.failed.path} (${result.failed.message}); ` +
            `${result.unwritten.length} further file(s) did not land. The act is still marked unsaved.`,
          );
        case 'error':
          throw new Error('Save failed — see the editor notice for the reason. Nothing was written.');
      }
    }

    // ---- The art line (spec 2026-08-18) ----
    // One commit, two pixel sources. Everything below the surface —
    // snapshot, plan, collision, apply, reply — is `commitPixels`.

    case 'classic-commit-canvas': {
      // No `requireClassicDoc()` here: `commitPixels` reads the doc itself via
      // commitContextFromStores and throws the same message. A second read would
      // be an unused local and a second copy of the guard.
      const dir = useClassicProjectStore.getState().dir;
      if (!dir) throw new Error('no project directory is open');
      // Name safety is loadCanvasFile's own guard (canvas-file.ts:42/123) and it
      // THROWS — right for a fault, but a throw is -32603 INTERNAL at the Aether
      // adapter, so the tool schema states the same pattern (shared/canvas-name.ts)
      // and rejects a bad name as INVALID_PARAMS before this case ever runs.
      const loaded = await loadCanvasFile(dir, req.name);
      // `collision` STAYS A BOOLEAN here, and that is the whole conversion story
      // at this layer: `commitPixels` takes a flag (art-commit.ts:130) and turns
      // it into `{ colindLength }` off the doc it has already read for the
      // snapshot (art-commit.ts:136). Task 4's review (fb92c99) moved that store
      // read UP out of `replyFromPlanResult` — which used to do it itself behind
      // a `?? 0` — and pushed the typed REQUIREMENT down in its place, so the
      // layer that actually stamps collision cannot be called without the table
      // length. A `?? 0` there meant every block id was past the table: every
      // new block skipped while its cells were still stamped solid, which is the
      // fall-through-the-floor case. Nothing about that lives here; forwarding
      // the flag is all this case has to get right.
      const { kind: _k, name: _n, ...opts } = req;
      const reply: CanvasCommitReply = {
        ...commitPixels({
          pixels: loaded.doc.pixels,
          canvasPalette: loaded.doc.palette,
          gridOrigin: loaded.doc.gridOrigin,
          // Rest-spread, not six named forwards: `commitPixels`' input is
          // all-optional, so a seventh option added to the kind and forgotten
          // here would be a silent no-op with no type error. Note the converse
          // is NOT covered: TS does not excess-property-check spreads, so an
          // option forwarded to nothing is also silent.
          ...opts,
        }),
        // NEVER DROPPED. These carry "the sidecar could not be read — the canvas
        // is unconstrained until this is fixed", which is precisely the kind of
        // thing a caller committing art unattended has to hear.
        warnings: loaded.warnings,
      };
      return reply;
    }

    case 'classic-import-art-sheet': {
      const doc = requireClassicDoc();
      const bytes = new Uint8Array(await window.api.readBinaryFile(req.path, ''));
      const res = await sheetFromBytes(doc, bytes);
      if (!res.ok) {
        // An import refusal, like a commit refusal, is an ANSWER — and in the
        // same shape, so a caller handles both with one branch. The shape is
        // DERIVED from `ArtCommitReply`'s refusal arm (see SheetRefusalReply)
        // rather than promised in a comment, and both sentences come from core,
        // where the dialog reads the identical pair.
        const reply: SheetRefusalReply = {
          ok: false,
          refusal: res.refusal,
          message: explainSheetRefusal(res.refusal),
          resolution: sheetRefusalResolution(res.refusal),
          // No palette resolution can unblock these: this sheet was mapped onto
          // the act's own palette, so there is nothing for the commit planner's
          // palette offers to act on.
          offers: [],
        };
        return reply;
      }
      // An imported sheet has no grid of its own — see CommitPlanInput.gridOrigin.
      const { kind: _k, path: _p, ...opts } = req;
      return commitPixels({
        pixels: res.sheet.pixels,
        canvasPalette: res.sheet.palette,
        ...opts,
      });
    }

    // ---- The playtest loop. These drive the SAME store actions the UI does,
    // deliberately: an agent and a person pressing the key must not be able to
    // diverge, and the store is where the gating, throttling and pause handling
    // already live.
    case 'aether-status': {
      const s = useAetherStore.getState();
      return {
        status: s.status,
        // ⚠ A DEPLOYMENT LABEL, NOT AN IDENTITY. protocol.md §2.1 makes
        // `serverName` config-settable and says it MUST NOT be used to
        // discriminate implementations; the Rust core reports `oracle-next`
        // here. Kept because it is what a person named their process.
        server: s.serverName ?? null,
        // WHAT ANSWERED, for real. The legacy C++ server and the Rust core
        // resolve the same socket chain and serve different subsets, so an
        // agent measuring capability against `status` alone is measuring
        // nothing. `implementation` is §2.1's registry lineage — the field that
        // discriminates. Aurora refuses to connect at all to a superseded or
        // unidentified one, so a non-null value here has been checked.
        implementation: s.implementation ?? null,
        // Provenance for a bug report. §2.1 calls it opaque: never compare it,
        // and never gate on it — it moves on a documentation commit.
        serverBuild: s.serverBuild ?? null,
        // The count is a separate signal: an installed binary can advertise a
        // different count from the source tree it was built from. Read it,
        // never pin it.
        methodCount: s.methodCount ?? null,
        // A palette symbol family resolved — i.e. a push can actually land…
        palettePushAvailable: s.palette,
        // …and WHICH family the running ROM carries ('aeon' | 'classic'). A
        // push only lands when this matches the open project's engine.
        paletteKind: s.paletteKind ?? null,
        building: s.buildState === 'building',
        lastBuild: s.buildSummary ?? null,
        error: s.error ?? null,
        lastPushError: s.pushError ?? null,
      };
    }

    case 'aether-connect': {
      const s = useAetherStore.getState();
      if (req.connect === false) { await s.disconnect(); }
      else { await s.connect(); }
      const now = useAetherStore.getState();
      return { status: now.status, server: now.serverName ?? null, error: now.error ?? null };
    }

    case 'aether-push-palette': {
      const s = useAetherStore.getState();
      if (s.status !== 'connected') {
        return { pushed: false, reason: 'not connected to an emulator' };
      }
      // PROJECT-AWARE, one entry for both engines (the registry rule): the
      // open project decides where the words come from and which symbol
      // family they land in.
      const classicOpen = useClassicProjectStore.getState().status === 'open';
      let words: number[];
      if (classicOpen) {
        const doc = useClassicLevelStore.getState().doc;
        const line = doc?.palettes?.[req.line];
        if (!line) throw new Error(`palette line ${req.line} does not exist in the open act`);
        words = Array.from(line);
      } else {
        const ctx = requireProject();
        const colors = ctx.zone.palette.lines[req.line]?.colors;
        if (!colors) throw new Error(`palette line ${req.line} does not exist in this zone`);
        // aeon's line 0 is the character palette; the engine owns it. The
        // store refuses it silently, so the refusal is said HERE, in words.
        if (req.line === 0) {
          return { pushed: false, reason: 'line 0 is the character palette on aeon — the engine owns it' };
        }
        words = colors.map(encodeGenesisColor);
      }
      const kind = classicOpen ? 'classic' as const : 'aeon' as const;
      if (!s.palette || s.paletteKind !== kind) {
        return {
          pushed: false,
          // NEVER BLAME THE ROM FOR THE SERVER. "This ROM has no live-palette
          // symbols" is a claim about the artist's build, and making it when
          // the probe could not even run — because the connected server does
          // not serve the lookup — is a confident wrong answer that sends them
          // to rebuild something that was never at fault.
          reason: s.palette
            ? `the running ROM carries ${s.paletteKind} palette symbols, not ${kind} — wrong emulator for this project`
            : s.paletteUnservedMethod
              ? `the connected Aether server does not serve ${s.paletteUnservedMethod}, so the live-palette symbols were never looked up — this is a server gap, not a ROM problem`
              : 'this ROM has no live-palette symbols — live palette is unavailable',
        };
      }
      s.pushPaletteLine(req.line, words, kind);
      // The store COALESCES pushes, so this reports that the push was accepted,
      // not that bytes have landed. Saying "pushed: true" would be a lie about
      // an operation that is still queued.
      return { pushed: true, line: req.line, note: 'queued; the store coalesces pushes at ~10Hz' };
    }

    case 'aether-warp': {
      const classicOpen = useClassicProjectStore.getState().status === 'open';
      const msg = await useAetherStore.getState().warp(req.x, req.y, classicOpen ? 'classic' : 'aeon');
      if (msg === null) return { warped: false, reason: 'not connected to an emulator' };
      return { warped: msg.startsWith('Warped'), detail: msg };
    }

    case 'aether-build-run': {
      // ONE routing site with the UI (state/build-and-run.ts): the open
      // project — classic or aeon — decides the toolchain, and the save
      // always precedes the build on both routes.
      const { startBuildAndRun } = await import('../state/build-and-run');
      const routed = await startBuildAndRun();
      if (routed.route === 'none') throw new Error('build_and_run needs a project open — aeon or a classic disassembly');
      if (!routed.ran) {
        return { ok: false, summary: 'the pre-build save failed, so the build was refused — it would have assembled the previous state' };
      }
      const after = useAetherStore.getState();
      return {
        ok: after.buildState === 'ok',
        project: routed.route,
        summary: after.buildSummary,
        // The output is the point on failure — an agent that only learns "it
        // failed" cannot fix the document that caused it.
        output: after.buildState === 'failed' ? after.buildOutput : undefined,
        missingEnv: after.buildMissingEnv.length ? after.buildMissingEnv : undefined,
      };
    }

    default: {
      const exhaustive: never = req;
      throw new Error(`unknown request kind: ${(exhaustive as { kind?: string }).kind}`);
    }
  }
}
