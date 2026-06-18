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
  coll: z.number().int().min(0).max(255).optional().describe('collision type; omit to keep existing'),
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
    description: 'Decoded nametable entries (tileIndex, palette, flips, priority, collision) for a tile-coordinate rectangle of a section.' },
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
  { name: 'save_chunk', kind: 'save-chunk', result: 'json',
    params: { name: z.string().min(1), w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64), entries: z.array(entrySchema) },
    description: 'Save a reusable w*h pattern into the chunk library (row-major entries). Returns the chunk id.' },
  { name: 'stamp_chunk', kind: 'stamp-chunk', result: 'json',
    params: { chunkId: z.string(), section: z.number().int().min(0), x: z.number().int().min(0), y: z.number().int().min(0) },
    description: 'Stamp a library chunk onto a section at tile coordinates. One undo step.' },
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
];
