import { z } from 'zod';
import type { AgentRequest } from '../shared/agent-protocol';

/**
 * The editor's capability surface, defined once and consumed by BOTH the MCP
 * server and the Aether adapter so the two never drift (the spec's keystone:
 * discovery is the protocol). Each method forwards to the renderer agent bridge
 * as `{ kind, ...params }`. The Aether method name is `editor/<name>`; the MCP
 * tool name is `<name>` — same role-based names, never brand-named (protocol D3).
 */
export const entrySchema = z.object({
  tile: z.number().int().describe('tileset tile index'),
  pal: z.number().int().min(0).max(3).describe('palette line 0-3'),
  pri: z.boolean().optional().describe('VDP priority bit'),
  hf: z.boolean().optional().describe('horizontal flip'),
  vf: z.boolean().optional().describe('vertical flip'),
});

// ---- Classic (Sonic 1) schemas ----
// A 16x16 block's 8x8 tile cell (Mega Drive pattern-name fields).
const blockCellSchema = z.object({
  tile: z.number().int().min(0).describe('tile-pool index'),
  xf: z.boolean(),
  yf: z.boolean(),
  pal: z.number().int().min(0).max(3).describe('palette line 0-3'),
  pri: z.boolean().describe('priority bit'),
});
// One object placement in an S1 objpos list.
const s1ObjectSchema = z.object({
  x: z.number().int().min(0).max(0xffff),
  y: z.number().int().min(0).max(0x0fff),
  xflip: z.boolean(),
  yflip: z.boolean(),
  respawn: z.boolean().describe('remember-state / respawn flag'),
  id: z.number().int().min(0).max(0x7f).describe('object id (7-bit)'),
  subtype: z.number().int().min(0).max(0xff),
});

export interface EditorMethod {
  name: string;                 // snake_case; MCP tool name + Aether `editor/<name>`
  kind: AgentRequest['kind'];   // renderer agent-bridge request kind
  description: string;
  params: z.ZodRawShape;        // {} for no-arg methods
  result: 'json' | 'image';
}

export const EDITOR_METHODS: EditorMethod[] = [
  { name: 'get_project_info', kind: 'get-project-info', result: 'json', params: {},
    description: 'Project, zone, act grid, sections, tileset size, chunk library, active section.' },
  { name: 'get_palette', kind: 'get-palette', result: 'json', params: {},
    description: 'The active 4x16 palette as RGB per line plus Genesis CRAM words (0000BBB0GGG0RRR0, ready to pass back to set_palette). Line 0 is sprite-reserved; index 0 of each line is transparent.' },
  { name: 'get_tiles', kind: 'get-tiles', result: 'json',
    params: { start: z.number().int().min(0), count: z.number().int().min(1).max(256) },
    description: 'Read raw 8x8 tiles as 64 palette indices each (max 256 per call).' },
  { name: 'get_nametable_region', kind: 'get-nametable-region', result: 'json',
    params: { section: z.number().int().min(0), x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64) },
    description: 'Decoded nametable entries (tileIndex, palette, flips, priority) for a tile-coordinate rectangle of a section.' },
  { name: 'check_budget', kind: 'check-budget', result: 'json',
    params: { section: z.number().int().min(0).optional() },
    description: 'Flip-aware unique-tile counts per section and per VRAM color group vs the 1024-tile FG pool. fits=false means export will fail.' },
  { name: 'set_palette', kind: 'set-palette', result: 'json',
    params: { line: z.number().int().min(1).max(3), colors: z.array(z.number().int()).length(16) },
    description: 'Write one palette line (1-3) as 16 Genesis CRAM words (0000BBB0GGG0RRR0, even channel values only). One undo step.' },
  { name: 'write_tiles', kind: 'write-tiles', result: 'json',
    params: { tiles: z.array(z.array(z.number().int().min(0).max(15)).length(64)).min(1).max(128), at: z.number().int().min(0).optional() },
    description: 'Append or overwrite tileset tiles. Each tile is 64 pixel values 0-15 (index 0 = transparent). Omit "at" to append. One undo step. Reply flags tiles that duplicate an existing tile or its flip (reuse that index instead).' },
  { name: 'paint_region', kind: 'paint-region', result: 'json',
    params: { section: z.number().int().min(0), x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().min(1), h: z.number().int().min(1), entries: z.array(entrySchema) },
    description: 'Paint a w*h tile rectangle of a section with nametable entries (row-major). One undo step. Reply includes updated VRAM budget.' },
  { name: 'paint_collision', kind: 'paint-collision', result: 'json',
    params: {
      section: z.number().int().min(0),
      plane: z.enum(['a', 'b']),
      x: z.number().int().min(0).max(127).describe('cell col (16px units, 0-127)'),
      y: z.number().int().min(0).max(127).describe('cell row (16px units, 0-127)'),
      w: z.number().int().min(1).max(128), h: z.number().int().min(1).max(128),
      word: z.number().int().min(0).max(0xFFFF).describe('packed collision cell word (shape 9:0, xflip 10, yflip 11, solidity 13:12); 0 = air'),
    },
    description: 'Fill a w*h CELL rectangle (16px units) of one collision plane with a packed cell word. One undo step. Reply\'s "painted" counts 8px sub-tile entries actually changed, up to 4 per cell.' },
  { name: 'save_chunk', kind: 'save-chunk', result: 'json',
    params: {
      name: z.string().min(1), w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64), entries: z.array(entrySchema),
      collisionA: z.array(z.number().int().min(0).max(0xFFFF)).optional().describe('packed collision cell words for plane A, row-major, (w/2)*(h/2) entries; omit for an all-air plane'),
      collisionB: z.array(z.number().int().min(0).max(0xFFFF)).optional().describe('same as collisionA, for plane B'),
    },
    description: 'Save a reusable w*h pattern into the chunk library (row-major entries), optionally with collisionA/collisionB cell-word planes ((w/2)*(h/2) words each; omitted planes default to air). Returns the chunk id.' },
  { name: 'stamp_chunk', kind: 'stamp-chunk', result: 'json',
    params: { chunkId: z.string(), section: z.number().int().min(0), x: z.number().int().min(0), y: z.number().int().min(0) },
    description: 'Stamp a library chunk (art + collision) onto a section at tile coordinates. x/y must be even (collision cells are 16px/2-tile aligned). One undo step.' },
  { name: 'goto', kind: 'goto', result: 'json',
    params: { section: z.number().int().min(0), x: z.number().int().min(0).optional(), y: z.number().int().min(0).optional(), zoom: z.number().min(0.125).max(8).optional() },
    description: 'Set the active section and scroll the shared viewport to tile coords (x,y) at optional zoom (0.125-8).' },
  { name: 'get_bg', kind: 'get-bg', result: 'json', params: {},
    description: 'Read the zone-wide background (Plane B): a 64x32 tile nametable plus its own tile blob (max 512 tiles), a SEPARATE tile space from the FG tileset. Nametable indices are local to the BG blob; a get_bg result can be fed straight back to set_bg. Returns nulls when the act has no background.' },
  { name: 'set_bg', kind: 'set-bg', result: 'json',
    params: { layout: z.array(z.number().int().min(0).max(0xFFFF)).length(2048), tiles: z.array(z.array(z.number().int().min(0).max(15)).length(64)).min(1).max(512), name: z.string().min(1).optional().describe('save to the BG library under this name instead of replacing the act default; the reply includes the generated id') },
    description: 'Write a zone-wide background (Plane B): a 64x32 tile nametable (2048 row-major VDP words) plus its tile blob (max 512 tiles). Without "name" replaces the act-default BG (one undo step); with "name" saves to the project BG library (additive). Tile indices are local to the BG blob.' },
  { name: 'list_bgs', kind: 'list-bgs', result: 'json', params: {},
    description: "List available backgrounds: the act default, every BG library entry (id, name, tile count), and each section's current assignment (bgId null = act default)." },
  { name: 'assign_section_bg', kind: 'assign-section-bg', result: 'json',
    params: { section: z.number().int().min(0), bgId: z.string().nullable().describe('BG library entry id, or null for the act default') },
    description: 'Assign which background a section displays: a BG library id, or null to revert to the act default. The viewport composites the assigned BG while that section is active. One undo step.' },
  { name: 'screenshot', kind: 'screenshot', result: 'image',
    params: { region: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().min(1), h: z.number().int().min(1) }).optional(), showBg: z.boolean().optional().describe('render the background plane during capture') },
    description: 'PNG of the map canvas (current viewport). Optional region crop in canvas device pixels (not tile/world coords).' },

  // ---- Classic (Sonic 1 disassembly) project surface (Task 16) ----
  { name: 'open_project', kind: 'classic-open-project', result: 'json',
    params: { dir: z.string().min(1).describe('absolute path to the project directory') },
    description: 'Open a project directory (classic-first detection, the same flow as File→Open). A Sonic 1 disassembly opens into the classic surface (reply: type/label/report/zoneTree); an aeon project is left unchanged for the aeon loader; an unrecognized directory errors.' },
  { name: 'get_project_report', kind: 'classic-get-project-report', result: 'json', params: {},
    description: 'The full ResolutionReport of the open classic project (which expected files resolved / are missing / were ambiguous, plus resolved/total counts).' },
  { name: 'list_classic_levels', kind: 'classic-list-levels', result: 'json', params: {},
    description: 'List the open classic project\'s zone/act references (zone, act, label, availability).' },
  { name: 'get_classic_level', kind: 'classic-get-level', result: 'json',
    params: { zone: z.string().min(1), act: z.number().int().min(0) },
    description: 'Open and read one act. Returns a summary: fg/bg dims, tile/block/chunk/object counts, the 4 palette lines (CRAM words), the object list, the player start, and the fg/bg chunk-id layout grids as nested row arrays.' },
  { name: 'set_layout_region', kind: 'classic-set-layout-region', result: 'json',
    params: { plane: z.enum(['fg', 'bg']), x: z.number().int().min(0), y: z.number().int().min(0), chunkIds: z.array(z.array(z.number().int().min(0).max(255))).describe('row-major 2D grid of chunk ids (S1 engine ids: 0 = air/blank, 1..N = the N chunks); placed with the top-left cell at (x,y)') },
    description: 'Stamp a rectangular region of a layout plane with a 2D grid of chunk ids (top-left at x,y). Chunk ids are 1-based (0 = air). One undo step.' },
  { name: 'edit_chunk', kind: 'classic-edit-chunk', result: 'json',
    params: { chunkId: z.number().int().min(1).max(255).describe('S1 engine chunk id (1-based; id 1 = the first map256 chunk — 0 is air/blank and not editable)'), cells: z.array(z.object({ index: z.number().int().min(0).max(255), word: z.number().int().min(0).max(0xffff) })).describe('block-cell edits: cell index 0-255, packed S1 chunk-block word') },
    description: 'Set individual 16x16 block cells of one chunk (batched). chunkId is a 1-based engine id (0 = air, not editable). One undo step.' },
  { name: 'edit_block', kind: 'classic-edit-block', result: 'json',
    params: { blockId: z.number().int().min(0), def: z.object({ cells: z.array(blockCellSchema).length(4).describe('exactly 4 tile cells, TL/TR/BL/BR') }) },
    description: 'Replace one 16x16 block\'s 4-tile-cell definition. One undo step.' },
  { name: 'add_chunk', kind: 'classic-add-chunk', result: 'json',
    params: { cells: z.array(z.object({ index: z.number().int().min(0).max(255), word: z.number().int().min(0).max(0xffff) })).optional().describe('optional sparse seed: block-cell edits (index 0-255, packed S1 chunk-block word) over a blank base; omit for an all-blank chunk') },
    description: 'Append a NEW 256-cell chunk to the pool (grows it). Reply includes the new 1-based ENGINE id. Refuses at the 127-chunk cap (engine ids 1..$7F; the layout loop bit makes $80+ unaddressable). One undo step.' },
  { name: 'add_block', kind: 'classic-add-block', result: 'json',
    params: { def: z.object({ cells: z.array(blockCellSchema).length(4).describe('exactly 4 tile cells, TL/TR/BL/BR') }).optional().describe('optional seed definition; omit for four blank tile-0 cells') },
    description: 'Append a NEW 16x16 block to the pool (grows it). Reply includes the new 0-based block id. Refuses at the 1024-block cap (10-bit block refs). One undo step.' },
  { name: 'place_object', kind: 'classic-place-object', result: 'json',
    params: { entry: s1ObjectSchema },
    description: 'Append one object placement to the open act. One undo step; reply includes the new object index.' },
  { name: 'move_object', kind: 'classic-move-object', result: 'json',
    params: { index: z.number().int().min(0), x: z.number().int().min(0).max(0xffff), y: z.number().int().min(0).max(0x0fff) },
    description: 'Move the object at the given index to (x,y). One undo step.' },
  { name: 'delete_object', kind: 'classic-delete-object', result: 'json',
    params: { index: z.number().int().min(0) },
    description: 'Delete the object placement at the given index. One undo step.' },
  { name: 'set_colind', kind: 'classic-set-colind', result: 'json',
    params: { entries: z.array(z.object({ blockId: z.number().int().min(0), value: z.number().int().min(0).max(255) })).describe('block id → collision-shape index edits') },
    description: 'Set block→collision-shape indices (batched). One undo step.' },
  { name: 'save_project', kind: 'classic-save-project', result: 'json', params: {},
    description: 'Save every dirty act of the open classic project through the guarded (mtime-checked) write channel. Returns a structured outcome: saved / conflict / partial / error / nothing.' },
];
