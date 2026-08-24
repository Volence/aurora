import { z } from 'zod';
import type { AgentRequest } from '../shared/agent-protocol';
// The SAME pattern `loadCanvasFile`'s guard tests (canvas-file.ts). Stated here
// as a schema so a bad canvas name is INVALID_PARAMS at the protocol edge
// rather than the renderer's throw, which reaches a client as INTERNAL.
import { CANVAS_NAME_PATTERN } from '../shared/canvas-name';
// The flat/fully-solid colind value, named in set_block_collision's `shape`
// description. Imported rather than restated so the tool cannot advertise a
// value the collision writer no longer uses. Type-only-import module, so this
// pulls no runtime code into the main process.
import { FLAT_SHAPE } from '../core/art/commit-collision';
// Pure-TS format facts (model.ts imports only two `import type`s, so nothing
// runtime-heavy follows it into the main process). The collision tool's schema
// bounds are DERIVED from them rather than restated.
import { MAX_FG_CELLS_W, MAX_FG_CELLS_H } from '../core/level-classic/model';
// The BG plane's real engine bounds. `bg-override.ts` is the ONE module that
// reads the vendored aeon contract (bganim-consumer-contract.json); every
// number below therefore has a single definition, and get_bg/set_bg cannot
// ADVERTISE a shape the handler refuses (or, worse, accept one the hardware
// cannot hold). This schema used to hardcode `.length(2048)` and `.max(512)`:
// the first made the engine's full-height nametable unrepresentable, the second
// took blobs that overrun the sprite attribute table. ROADMAP item 8.
import {
  BG_LAYOUT_WORDS, BG_LAYOUT_WORDS_LEGACY, BG_TILE_CAPACITY,
  LAYOUT_WORD_MAX, TILE_PIXELS, TILE_PIXEL_MAX,
} from '../core/formats/bg-override/bg-override';
import { BG_WIDTH } from '../core/formats/bg-tiles';

const BG_ROWS = BG_LAYOUT_WORDS / BG_WIDTH;
const BG_ROWS_LEGACY = BG_LAYOUT_WORDS_LEGACY / BG_WIDTH;

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
    description: `Read the zone-wide background (Plane B): a ${BG_WIDTH}x${BG_ROWS} tile nametable `
      + `(${BG_WIDTH}x${BG_ROWS_LEGACY} in legacy files) plus its own tile blob (max `
      + `${BG_TILE_CAPACITY} tiles), a SEPARATE tile space from the FG tileset. "height" is measured `
      + 'off this act\'s layout, not assumed. Nametable indices are local to the BG blob; a get_bg '
      + 'result can be fed straight back to set_bg. Returns nulls when the act has no background.' },
  { name: 'set_bg', kind: 'set-bg', result: 'json',
    params: {
      layout: z.array(z.number().int().min(0).max(LAYOUT_WORD_MAX))
        .refine((a) => a.length === BG_LAYOUT_WORDS || a.length === BG_LAYOUT_WORDS_LEGACY, {
          message: `layout must have ${BG_LAYOUT_WORDS} words (${BG_WIDTH}x${BG_ROWS}) or `
            + `${BG_LAYOUT_WORDS_LEGACY} (${BG_WIDTH}x${BG_ROWS_LEGACY} legacy, zero-padded by the engine)`,
        }),
      tiles: z.array(z.array(z.number().int().min(0).max(TILE_PIXEL_MAX)).length(TILE_PIXELS))
        .min(1).max(BG_TILE_CAPACITY),
      name: z.string().min(1).optional().describe('save to the BG library under this name instead of replacing the act default; the reply includes the generated id'),
    },
    description: `Write a zone-wide background (Plane B): a ${BG_WIDTH}x${BG_ROWS} tile nametable `
      + `(${BG_LAYOUT_WORDS} row-major VDP words; the legacy ${BG_WIDTH}x${BG_ROWS_LEGACY} / `
      + `${BG_LAYOUT_WORDS_LEGACY}-word shape is still accepted and the engine zero-pads it) plus its `
      + `tile blob (max ${BG_TILE_CAPACITY} tiles — the BG VRAM region $8000..$B7FF, below the sprite `
      + 'attribute table at $B800). Without "name" replaces the act-default BG (one undo step); with '
      + '"name" saves to the project BG library (additive). Tile indices are local to the BG blob.' },
  { name: 'list_bgs', kind: 'list-bgs', result: 'json', params: {},
    description: "List available backgrounds: the act default, every BG library entry (id, name, tile count), and each section's current assignment (bgId null = act default)." },
  { name: 'assign_section_bg', kind: 'assign-section-bg', result: 'json',
    params: { section: z.number().int().min(0), bgId: z.string().nullable().describe('BG library entry id, or null for the act default') },
    description: 'Assign which background a section displays: a BG library id, or null to revert to the act default. The viewport composites the assigned BG while that section is active. One undo step.' },
  // ---- The effects arc, wave 1 -------------------------------------------
  // One registry entry lights a capability up on BOTH MCP and Aether, so agent
  // parity is a property of adding it here (this file's header, and ROADMAP §6's
  // first amendment). There is no MCP-specific half to write.
  { name: 'list_effects_scenes', kind: 'list-effects-scenes', result: 'json', params: {},
    description: 'List the project\'s effects scenes (parallax/raster scene definition documents under '
      + 'data/editor/effects/): each scene\'s id, name and layer count, plus which scene each section is '
      + 'assigned to (sceneRef null = the act default). Also reports scene files that exist but could NOT '
      + 'be read — those ids are unusable and Aurora will not overwrite them.' },
  { name: 'get_effects_scene', kind: 'get-effects-scene', result: 'json',
    params: { id: z.string().min(1).describe('scene id') },
    description: 'Read one effects scene as its WHOLE document, exactly as it is on disk — including any '
      + 'field this editor does not itself expose. Feed the result straight back to set_effects_scene.' },
  { name: 'set_effects_scene', kind: 'set-effects-scene', result: 'json',
    params: {
      // THE ID PATTERN IS NOT RESTATED HERE. It lives in the contract schema
      // (`^[a-z][a-z0-9_]{0,31}$`), the reader enforces it along with the
      // filename-stem identity rule, and a second copy on this boundary could
      // only drift from it. What the description owes an agent is the SHAPE of
      // the rule and why it differs from a background id.
      id: z.string().min(1)
        .describe('scene id — lowercase letters, digits and underscores, starting with a letter, max 32. '
          + 'It becomes part of generated .emp symbol names, so hyphens are NOT legal (unlike a background id).'),
      scene: z.unknown().nullable()
        .describe('the whole scene definition document (schema 1), or null to delete the scene. Its "id" '
          + 'must equal the id parameter. Validated against the contract schema; an invalid document is '
          + 'refused with the specific issues and nothing is written.'),
    },
    description: 'Create, replace or delete one effects scene. Takes the WHOLE document, not a field patch: '
      + 'read the current one with get_effects_scene, change what you want, send it back. Fields this '
      + 'editor does not expose survive because nothing enumerates them. One undo step. The document is '
      + 'validated against the contract schema on the way in — layers 1..8, factors from the published '
      + 'FACTOR_* set or a packed {s1,s2,op} triple, no unknown keys.' },
  { name: 'assign_section_scene', kind: 'assign-section-scene', result: 'json',
    params: {
      section: z.number().int().min(0),
      sceneId: z.string().nullable().describe('effects scene id, or null for the act default'),
    },
    description: 'Assign which effects scene a section uses (sceneRef in its meta sidecar): a scene id, or '
      + 'null to fall back to the act default. One undo step. Refuses an id that is not a readable scene — '
      + 'a ref the build cannot resolve is worse than no ref.' },

  // ---- Wave-1 surface 4: BgAnim bands -------------------------------------
  // Same registry, same rule as the scene block above: one entry lights the
  // capability up on BOTH MCP and Aether, so agent parity is a property of
  // adding it here rather than a second surface to keep in step.
  //
  // THE DESCRIPTIONS CARRY TWO FACTS AN AGENT CANNOT GUESS, and both of them
  // are ones a plausible-sounding wrong model would get backwards:
  //   • a driver is a SCALAR SOURCE, not an axis — every band moves horizontally;
  //   • promotion does not grow the tile blob and addition does, which is why
  //     promotion is the operation that works on a document at capacity.
  { name: 'list_bg_anim_bands', kind: 'list-bg-anim-bands', result: 'json', params: {},
    description: 'List the BgAnim bands of this game\'s BG override document '
      + '(data/editor_bg_override.json): each band\'s geometry, driver, rate shift and slot range, '
      + 'plus the tile-blob and band-count budgets. Also reports whether that file exists and '
      + 'whether it could be read — an unreadable one is never overwritten, and every band '
      + 'operation will refuse against it.' },
  { name: 'promote_bg_anim_band', kind: 'promote-bg-anim-band', result: 'json',
    params: {
      cols: z.number().int().min(1).describe('pattern width in tiles; pattern_px becomes cols*8'),
      rows: z.number().int().min(1)
        .describe('pattern height in tiles. rows*32 (the bytes in one pattern column) must be an '
          + 'exact power of two, because the runtime rotates a column by shifting it'),
      staticBase: z.number().int().min(0)
        .describe('first tile of the existing static range to declare animated. It must lie at or '
          + 'after the end of the current animated prefix (list_bg_anim_bands reports it as '
          + 'budget.firstPromotableSlot) and the whole cols*rows range must already be in the blob'),
      driver: z.string().optional()
        .describe('camera_x, camera_y or timer — the SCALAR the band\'s step is read from. Every '
          + 'band shifts HORIZONTALLY whichever driver it uses; camera_y does NOT mean vertical '
          + 'motion. Omit to leave the key out so the document tracks the engine default'),
      rateShift: z.number().int().optional()
        .describe('right shift applied to the driver scalar. Omit to leave the key out'),
    },
    description: 'Promote an existing static tile range into a new BgAnim band. THE PRIMARY WAY TO '
      + 'AUTHOR A BAND: the range MOVES to the front of the blob rather than being added to it, so '
      + 'tiles.length is unchanged and this works on a document that has spent its whole tile '
      + 'budget (which the shipping one has). Phase 0 is READ from the blob and banks 1-7 arrive as '
      + 'copies of it, so the rendered picture is identical before and after — the band is inert '
      + 'until its frames are drawn. One undo step.' },
  { name: 'demote_bg_anim_band', kind: 'demote-bg-anim-band', result: 'json',
    params: {
      band: z.number().int().min(0).describe('index into the band list'),
      staticBase: z.number().int().min(0).optional()
        .describe('where the band\'s slots land in the static region. Omit for the front of it, '
          + 'which for the LAST band moves no tile at all'),
    },
    description: 'Demote a BgAnim band back to plain static tiles. LOSSLESS in both directions and '
      + 'the safe counterpart to remove_bg_anim_band: the slots move into the static region instead '
      + 'of being deleted, so every cell that drew the band goes on drawing the same picture and '
      + 'there is nothing to blank. One undo step.' },
  { name: 'add_bg_anim_band', kind: 'add-bg-anim-band', result: 'json',
    params: {
      cols: z.number().int().min(1).describe('pattern width in tiles; pattern_px becomes cols*8'),
      rows: z.number().int().min(1).describe('pattern height in tiles; rows*32 must be a power of two'),
      phases: z.array(z.array(z.array(z.number().int().min(0).max(15)).length(64))).optional()
        .describe('the band art: exactly 8 banks, each of cols*rows tiles, each tile 64 pixel '
          + 'values 0-15 row-major. Omit for a blank band'),
      driver: z.string().optional().describe('camera_x, camera_y or timer — the scalar source, never an axis'),
      rateShift: z.number().int().optional().describe('right shift applied to the driver scalar'),
    },
    description: 'Add a NEW BgAnim band whose art comes from outside the document. THIS GROWS THE '
      + 'TILE BLOB by cols*rows, so it refuses on a document at capacity — use '
      + 'promote_bg_anim_band there instead. The art arrives unreferenced, so nothing on screen '
      + 'changes until layout cells point at it. One undo step.' },
  { name: 'remove_bg_anim_band', kind: 'remove-bg-anim-band', result: 'json',
    params: {
      band: z.number().int().min(0).describe('index into the band list'),
      blankReferencingCells: z.boolean().optional()
        .describe('repoint layout cells that draw this band to the blank word instead of refusing. '
          + 'Off by default: removal DESTROYS the band\'s art, and this is how you say you meant to'),
    },
    description: 'Remove a BgAnim band, deleting its slots from the tile blob. DESTRUCTIVE, unlike '
      + 'demote_bg_anim_band — refuses by default when layout cells draw the band, naming how many, '
      + 'and only blanks them when blankReferencingCells says so. One undo step.' },

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
  // NAMED `set_block_collision`, NOT `paint_collision` — aeon already owns that
  // name in this flat registry with different semantics (a collision-plane cell
  // word including solidity, versus a shape index on the zone-wide BLOCK tier),
  // and registry names must be globally unique. Same collision, same resolution
  // as `set_level_palette` below.
  //
  // The bounds are DERIVED from the format (model.ts's MAX_LAYOUT_W/H, in cells)
  // rather than copied from aeon's `paint_collision`, whose 127/128 encode
  // aeon's fixed section size. A classic act is up to 1024 cells wide, and a
  // full-width sweep has to be ONE call to be one undo step.
  { name: 'set_block_collision', kind: 'classic-set-block-collision', result: 'json',
    params: {
      // THE UNIT IS SPELLED OUT WITH ITS CONVERSION, because the classic surface
      // speaks three of them: set_layout_region takes CHUNKS, place_object and
      // set_start take PIXELS, and this takes 16px CELLS. An agent that just read
      // a pixel coordinate off an object has no other way to know to divide.
      x: z.number().int().min(0).max(MAX_FG_CELLS_W - 1).describe('left FG cell column, in 16px cell units (level pixel x / 16)'),
      y: z.number().int().min(0).max(MAX_FG_CELLS_H - 1).describe('top FG cell row, in 16px cell units (level pixel y / 16)'),
      w: z.number().int().min(1).max(MAX_FG_CELLS_W).describe('width in cells, extending right from x (inclusive)'),
      h: z.number().int().min(1).max(MAX_FG_CELLS_H).describe('height in cells, extending down from y (inclusive)'),
      // NAMING $FF MATTERS: there is no tool that lists the zone's collision
      // shapes, so without it an agent asked to "make this ledge solid" has
      // nothing to pick from. FLAT_SHAPE is imported rather than written as 255
      // so the two cannot drift.
      shape: z.number().int().min(0).max(255)
        .describe(`collision-shape index (a colind value): 0 = no collision, ${FLAT_SHAPE} ($FF) = flat/fully solid. Other values index this zone's collision array and vary per zone.`),
      mode: z.enum(['link', 'isolate']).optional()
        .describe('"link" (default) writes the shape onto the block itself, changing every use of it ZONE-wide; "isolate" clones the block first so only these cells change — at the cost of one collision-table entry per distinct block, which some zones have none of'),
      dryRun: z.boolean().optional().describe('plan and report without applying'),
    },
    description: 'Set the collision SHAPE on the block under every cell of a rectangle, in 16px FG cell units. One undo step. Does NOT set solidity — that rides the chunk cell (edit_chunk). Partial by design: cells that are air, blank block 0, a dangling block reference, outside the layout, or (link) past the end of the zone\'s collision table are skipped and counted in the reply, and the rest still applies. A refusal returns ok:false with a message and a resolution — the whole call is refused only when nothing applied and nothing already matched, or when isolate would need more collision-table entries than the zone has spare.' },
  // NOTE: named `set_level_palette` (not `set_palette`) — the aeon `set_palette`
  // tool already owns that name in this flat registry, and MCP tool names must be
  // globally unique. The classic surface allows palette line 0 (a real level line,
  // not sprite-reserved), so it is a distinct tool from the aeon one.
  { name: 'set_level_palette', kind: 'classic-set-palette', result: 'json',
    params: { line: z.number().int().min(0).max(3), colors: z.array(z.number().int().min(0).max(0xffff)).length(16) },
    description: 'Write one classic-level palette line (0-3) as 16 Genesis CRAM words (0000BBB0GGG0RRR0). Index 0 is transparent. One classic undo step; bumps the palette epoch so chunk art + object sprites refresh.' },
  { name: 'set_start', kind: 'classic-set-start', result: 'json',
    params: { x: z.number().int().min(0).max(0xffff), y: z.number().int().min(0).max(0xffff) },
    description: 'Move the player spawn point to (x,y). Both are 16-bit (the startpos file has no terminator sentinel). One classic undo step.' },
  { name: 'save_project', kind: 'classic-save-project', result: 'json', params: {},
    description: 'Save every dirty act of the open classic project through the guarded (mtime-checked) write channel. Returns a structured outcome: saved / conflict / partial / error / nothing.' },

  // --- the art line (spec 2026-08-18) ---
  // Both are the same commit with different pixel sources. A REFUSAL comes back
  // in the result as `ok:false` with the artist-facing sentence, not as a
  // protocol error — see the design's §4.
  { name: 'commit_canvas', kind: 'classic-commit-canvas', result: 'json',
    params: {
      name: z.string().regex(CANVAS_NAME_PATTERN, 'a canvas name is 1-64 chars of letters, digits, - and _, starting with a letter or digit (no path, no extension)')
        .describe('canvas name under .aurora/canvas (no path, no extension)'),
      targets: z.array(z.object({
        chunkFileIndex: z.number().int().min(0).nullable().describe('0-based FILE index of the chunk to replace (engine id minus one), or null to append'),
      })).optional().describe('one per whole 256x256 chunk of the canvas, row-major; omit to append them all'),
      paletteResolution: z.enum(['none', 'use-act-colours', 'adopt-into-zone']).optional()
        .describe('what to do when the canvas draws with colours the act does not have (default "none" = refuse and report them). "use-act-colours" re-indexes the art onto the nearest act colours, changing no palette; "adopt-into-zone" writes the drifted colours into the ZONE palette, which every act sharing that palette file displays. Line 0 (Sonic\'s) is never written by either.'),
      collision: z.boolean().optional().describe('give the new art flat ($FF) collision in the same undo step'),
      dryRun: z.boolean().optional().describe('plan and report without applying'),
    },
    description: 'Commit a saved canvas into the open act: cut to tiles/blocks/chunks, dedupe, reclaim, write. One undo step. Reply carries the full commit report plus the 1-based ENGINE ids of any appended chunks (pass those to set_layout_region). A refusal returns ok:false with a message, a resolution, and which paletteResolution values would unblock it. Also returns "warnings" from loading the canvas — an unreadable sidecar means the canvas was treated as unconstrained, which is worth reading before trusting the result.' },
  // NO `paletteResolution` HERE. The sheet is mapped onto the act's own palette
  // before it is planned, so it cannot drift, so the option could never change
  // an outcome — see the kind's own comment in shared/agent-protocol.ts.
  // ---- The playtest loop (§4.8). Same code paths as the UI drives ----------
  //
  // The art line shipped UI-only and had to be retrofitted; this phase does not
  // repeat that. One EDITOR_METHODS entry lights a capability up on BOTH MCP and
  // Aether, so agent parity is a property of adding it here, not a second task.
  { name: 'aether_status', kind: 'aether-status', result: 'json', params: {},
    description: 'Is Aurora connected to a running emulator, and what can it do there? '
      + 'Reports connection state, the server, whether live palette is available and for WHICH '
      + 'engine family (`paletteKind`: aeon\'s Pal_Base pair or classic\'s v_palette_line_1..4 '
      + 'resolved — a push only lands when it matches the open project), and the last push '
      + 'error. Read this before assuming a push or warp will land.' },

  { name: 'aether_connect', kind: 'aether-connect', result: 'json',
    params: {
      connect: z.boolean().optional()
        .describe('true (default) connects, false disconnects'),
    },
    description: 'Connect Aurora to the running emulator over the Aether bus, or disconnect. '
      + 'Connecting is always explicit — Aurora never opens the socket on its own.' },

  { name: 'push_palette', kind: 'aether-push-palette', result: 'json',
    params: {
      // THE RANGE IS THE UNION OF BOTH ENGINES (one entry serves both, per the
      // registry rule). On aeon, line 0 is the character palette the engine
      // owns and a push to it is refused with a reason; on classic (S1), line
      // 0 is an ordinary act line and pushes like any other.
      line: z.number().int().min(0).max(3)
        .describe('palette line 0-3 (on aeon, line 0 is the character palette and is refused; classic pushes all four)'),
    },
    description: 'Push a palette line of the OPEN PROJECT to the RUNNING game, so it recolours '
      + 'without a rebuild. Writes the editor\'s current colours for that line — edit the palette '
      + 'first, then push. Persistence differs by engine: on aeon a rebuild or a section crossing '
      + 'restores ROM colours; on classic (S1) the push PERSISTS until the next level transition '
      + 'or fade (only the zone\'s few palette-cycled entries keep repainting themselves).' },

  { name: 'warp', kind: 'aether-warp', result: 'json',
    params: {
      x: z.number().int().min(0).describe('destination x in act-world PIXELS'),
      y: z.number().int().min(0).describe('destination y in act-world PIXELS'),
    },
    description: 'Warp the running game to a point in the act (play-from-cursor). '
      + 'Reports where the player LANDED — the engine clamps to act bounds and the answer '
      + 'may differ from the request. Aeon-only, and needs a DEBUG build: a release aeon ROM '
      + 'has no warp mailbox, and classic (S1) has none in any flavour — both gate off on '
      + 'symbol detection with the reason in `detail`.' },

  { name: 'build_and_run', kind: 'aether-build-run', result: 'json', params: {},
    description: 'Save, build the OPEN project (aeon: re-bake + ./build.sh; classic: lua '
      + 'build.lua), reload the emulator, and on aeon put the player back where they were — via '
      + 'the engine\'s boot-position override, so the first painted frame is already the '
      + 'destination (falls back to the warp mailbox on a DEBUG ROM that predates it; '
      + '`restoredVia` says which ran, `restoredTo` is where the engine says the player LANDED '
      + 'after clamping). Classic reloads to a clean boot — S1 has no restore mechanism, and '
      + '`restoredVia` is honestly absent. The one call that makes an edit real. Reports the '
      + 'build output on failure and does NOT reload a failed build.' },

  { name: 'import_art_sheet', kind: 'classic-import-art-sheet', result: 'json',
    params: {
      path: z.string().min(1).describe('absolute path to an INDEXED (paletted) PNG'),
      targets: z.array(z.object({
        chunkFileIndex: z.number().int().min(0).nullable().describe('0-based FILE index of the chunk to replace (engine id minus one), or null to append'),
      })).optional().describe('one per whole 256x256 chunk of the sheet, row-major; omit to append them all'),
      collision: z.boolean().optional().describe('give the new art flat ($FF) collision in the same undo step'),
      dryRun: z.boolean().optional().describe('plan and report without applying'),
    },
    description: 'Import an indexed PNG made elsewhere, mapped onto the open act\'s palette, and commit it. No size cap (unlike a canvas). The reply is commit_canvas\'s; the refusals are a NARROWER set plus two import-only ones. Narrower: the sheet is mapped onto the act\'s palette before planning, so palette-drift, palette-unmappable and cell-clash cannot arise (and there is no paletteResolution to pass). Import-only: a colour the act does not have, and an 8x8 cell mixing colours from two palette lines — for that one, adding the missing colour to the zone palette only helps if it goes on the LINE the cell already uses.' },
];
