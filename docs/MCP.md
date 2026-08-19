# MCP Integration

The editor embeds an MCP server (Streamable HTTP) while running. It exposes
art-generation tools that operate on the live editing session — every mutation
is one undo step (Ctrl+Z), and nothing touches disk until you save.

## Connect (one time)

1. Launch the editor (`npm run dev`).
2. Check the port in `~/.aurora/mcp.json` (default 38473; falls back
   to an ephemeral port if 38473 is in use — always use the file).
3. `claude mcp add --transport http aurora http://127.0.0.1:38473/mcp`
   (substitute the port from the file if it differs).

## Tools

Query: `get_project_info`, `get_palette`, `get_tiles`, `get_nametable_region`, `check_budget`, `get_bg`, `list_bgs`
Mutate (one undo step each): `set_palette`, `write_tiles`, `paint_region`, `paint_collision`, `save_chunk`*, `stamp_chunk`, `set_bg`*, `assign_section_bg`
View: `goto`, `screenshot`

The tools above operate on an **aeon** project. The classic (Sonic 1 disassembly)
project surface is a separate group — see [Classic project tools](#classic-project-tools).

*`save_chunk` adds to the chunk library outside undo history (additive only),
matching the existing chunk-library behavior. `set_bg` with a `name` argument
likewise ADDS the background to the project BG library (outside undo history)
instead of replacing the act default; the reply includes the generated id.

## Collision

`paint_collision` fills a rectangle of one collision plane (`a` or `b`) with a
single packed cell word. Coordinates are in 16px CELL units (0-127 per axis,
half a section's 256x256 tiles), not tile units — a section is 128x128 cells.
The word is the same packed cell encoding used throughout the editor
(`src/core/collision/collision-cell-word.ts`):

- bits 0-9: shape index (0..1023; 0 = air — the rest of the word is ignored)
- bit 10: X-flip, bit 11: Y-flip
- bits 12-13: solidity for this plane (0=none, 1=top, 2=sides-bottom, 3=all)
- bits 14-15: spare

Painting seeds both of the section's collision planes on first touch (lazily
packing the engine baseline into cell words), same as the human paint tool,
then diffs the rectangle against the plane's current words — cells already
equal to `word` are left alone, and the reply's `painted` count is the number
of 8px sub-tile entries actually changed (up to 4 per cell).

`save_chunk` optionally carries `collisionA`/`collisionB`: packed cell words,
row-major, `(w/2)*(h/2)` entries each (chunk dimensions must be even tiles
per axis so collision cells stay 16px/2-tile aligned). Omit either array to leave that plane
air. `stamp_chunk` places a chunk's art AND collision atomically (one undo
step covering both) and requires even x/y, since collision cells are
16px/2-tile aligned; there is no art-only agent stamp (the UI's Alt-stamp
art-only mode is a human-only shortcut).

`get_bg`/`set_bg` operate on the zone-wide background (Plane B): a 64x32 tile
nametable plus its own tile blob (max 512 tiles) — a separate tile space from
the FG tileset. Both directions use the LOCAL index convention (nametable tile
indices index directly into the BG blob): engine-emitted files with
VRAM-absolute indices (1024+) are normalized once at load, so a `get_bg`
result round-trips straight back into `set_bg`. `set_bg` (without `name`)
replaces the whole plane in one undo step. `screenshot` accepts `showBg: true`
to render the background plane during capture (restores the overlay state
afterwards). Note that the editor renders Plane B once at world origin
(512x256 px) — screenshots of regions away from the origin won't show it.

Per-section backgrounds: every section displays the act default unless
`assign_section_bg` points it at a BG library entry (`bgId` from `set_bg` with
`name`, or `list_bgs`; `bgId: null` reverts to the act default). The viewport
composites the background of the ACTIVE section, so `goto` a section to see
its assigned BG. Assignments are one undo step each and persist in per-section
`.meta.json` sidecars; library entries persist under `data/editor/` on save.
Export emits `{zone}_BG_{id}` labels in the act descriptor's section table —
the engine build must BINCLUDE the referenced binaries.

## Classic project tools

A **classic** project is an on-disk Sonic 1 disassembly (the `tiles → blocks →
chunks → chunk-id layout` hierarchy). These tools open one, read acts, and edit
them in memory; nothing touches disk until `save_project`. Every mutation is one
classic undo step (Ctrl+Z), sharing the classic undo timeline with human edits —
exactly like the aeon tools above share the aeon undo stack. A classic and an
aeon project are never open at once.

Batched shapes: the mutation tools take arrays where the underlying editing
commands do, so an agent never loops single-cell calls.

| Tool | Params | Result |
|---|---|---|
| `open_project` | `{ dir }` | Opens a directory, classic-first (the same flow as File→Open). A Sonic 1 disasm opens the classic surface and returns `{ type, label, report: {resolved,total}, zoneTree }`; a real aeon project is left unchanged (`{ type: "aeon", opened: false }`); an unrecognized directory errors. |
| `get_project_report` | `{}` | The full `ResolutionReport` of the open classic project (per-file resolved/missing/ambiguous + counts). |
| `list_classic_levels` | `{}` | `{ levels }` — the project's zone/act refs (`zone, act, label, available`). |
| `get_classic_level` | `{ zone, act }` | Opens + reads one act. Summary only: `dims` (fg/bg w×h), `counts` (tiles/blocks/chunks/objects), `palettes` (4×16 CRAM words), `objects`, `start`, and `layout` (fg/bg chunk-id grids as nested row arrays; S1 ids are 1-based — `0` = air, `1..N` = the N chunks). Not the raw tile/block/chunk buffers. |
| `set_layout_region`\* | `{ plane, x, y, chunkIds }` | Stamps a 2D grid of chunk ids into a layout plane (`fg`/`bg`), top-left at `(x,y)`. Chunk ids are 1-based: `0` = air/blank (erases the cell), `1..N` reference the N map256 chunks. |
| `edit_chunk`\* | `{ chunkId, cells: [{index, word}] }` | Sets individual 16×16 block cells of one chunk (packed S1 chunk-block words). `chunkId` is a 1-based engine id (min `1`; `0` is air/blank and not editable). |
| `edit_block`\* | `{ blockId, def: {cells: [4]} }` | Replaces one 16×16 block's 4-tile-cell definition. |
| `add_chunk`\* | `{ cells?: [{index, word}] }` | Appends a NEW 256-cell chunk (grows the pool). Optional sparse `cells` seed it over a blank base; reply gives the new 1-based engine `chunkId`. Refuses at the 127-chunk cap ($80+ is unaddressable — the layout loop bit). |
| `add_block`\* | `{ def?: {cells: [4]} }` | Appends a NEW 16×16 block (grows the pool). Optional `def` seeds it (else four blank tile-0 cells); reply gives the new 0-based `blockId`. Refuses at the 1024-block cap (10-bit block refs). |
| `place_object`\* | `{ entry }` | Appends one object placement; reply includes the new `index`. |
| `move_object`\* | `{ index, x, y }` | Moves the object at `index`. |
| `delete_object`\* | `{ index }` | Deletes the object at `index`. |
| `set_colind`\* | `{ entries: [{blockId, value}] }` | Sets block→collision-shape indices. |
| `set_block_collision`\* | `{ x, y, w, h, shape, mode?, dryRun? }` | Sets the collision SHAPE on the block under every cell of a rectangle, in 16px FG cell units. Does NOT set solidity — that rides the chunk cell (`edit_chunk`). `mode` is `link` (default; changes the block everywhere it is used, ZONE-wide) or `isolate` (clones the block first, at the cost of one collision-table entry per distinct block — GHZ and SBZ have none spare). Partial by design: cells that are air, blank block 0, a dangling block reference, outside the layout, or (link) past the end of the zone's collision table are skipped and counted. Refuses only when nothing applied and nothing already matched, or when isolate needs more table entries than the zone has. |
| `set_level_palette`\* | `{ line, colors: [16] }` | Writes one classic-level palette line (0-3) as 16 Genesis CRAM words (`0000BBB0GGG0RRR0`; index 0 transparent). Bumps the palette epoch so chunk art + object sprites refresh. Named `set_level_palette` (not `set_palette`) because the aeon `set_palette` already owns that name in the shared tool registry and the classic surface allows line 0. |
| `set_start`\* | `{ x, y }` | Moves the player spawn point to `(x,y)` (both 16-bit; the startpos file has no terminator sentinel). |
| `save_project` | `{}` | Saves every dirty act through the guarded (mtime-checked) write channel. Structured outcome: `saved` / `conflict` / `partial` / `error` / `nothing`. |
| `commit_canvas`\* | `{ name, targets?, paletteResolution?, collision?, dryRun? }` | Commits a saved canvas (under `.aurora/canvas`) into the open act: cut to tiles/blocks/chunks, dedupe, reclaim, write. Reply carries the full commit report plus the 1-based ENGINE ids of any appended chunks (pass those to `set_layout_region`). `paletteResolution` says what to do when the canvas draws with colours the act does not have — default `none` refuses and reports them, `use-act-colours` re-indexes onto the nearest act colours, `adopt-into-zone` writes them into the ZONE palette (every act sharing that palette file displays them); line 0 is never written by either. A refusal returns `ok:false` with a message, a resolution, and which `paletteResolution` values would unblock it. Also returns `warnings` from loading the canvas — an unreadable sidecar means the canvas was treated as unconstrained. |
| `import_art_sheet`\* | `{ path, targets?, collision?, dryRun? }` | Same commit from an INDEXED (paletted) PNG made elsewhere, mapped onto the open act's palette first. No size cap (unlike a canvas). Reply is `commit_canvas`'s; the refusals are a NARROWER set (no palette-drift, palette-unmappable or cell-clash, and so no `paletteResolution` to pass) plus two import-only ones: a colour the act does not have, and an 8×8 cell mixing colours from two palette lines — for that one, adding the missing colour to the zone palette only helps if it goes on the LINE the cell already uses. |

The two art tools return a refusal in the RESULT as `ok:false` with an
artist-facing sentence, not as a protocol error — a refusal is a decision the
caller can act on, not a malformed call.

\* One classic undo step each. Editing tools require a classic project AND an
open act (`get_classic_level` first); they error cleanly otherwise. A command's
validation rejection (out-of-range chunk id, nonexistent block, invalid object,
…) surfaces as a structured MCP error carrying the command's human message —
nothing is mutated and no undo step is recorded.

`save_project` never overwrites blindly: it uses the same read-time mtime guard
as Ctrl+S. On a `conflict` (a file changed on disk since open) nothing is
written; on a `partial` some files landed and the rest stay dirty for a retry.

## Constraints enforced at the tool boundary

- Colors: Genesis 9-bit BGR, even channel values; palette line 0 rejected (sprite-reserved).
- Tiles: 8x8, pixel values 0-15, index 0 transparent; tileset capped at 2048.
- Budget: flip-aware unique tiles per VRAM color group must fit the 1024-tile FG pool
  (BG region starts at slot 1024). `check_budget` and every mutation reply report it.
- Over-budget paints are allowed and reported (`fits: false` in the reply); export is
  where overflow hard-fails. Optimize tile reuse before exporting.

## Aether bus

Alongside the MCP server, Aurora serves the **Aether** suite bus on the same port:
JSON-RPC 2.0 over `/aether` (POST) plus a push event channel at `/aether/events`
(SSE), behind an `initialize`/capabilities handshake (`protocolVersion: 1`). It
exposes the same method surface as the MCP tools above, namespaced `editor/*`.
This lets other suite tools drive Aurora directly, without MCP. (The outbound
side — Aurora acting as a *client* of another tool's Aether, e.g. the emulator —
is a later workstream; today Aurora only serves the bus.)

## Discovery file

`~/.aurora/mcp.json` is written on startup and removed on clean quit (the legacy
`~/.sonic-level-editor/mcp.json` is also written during the rename transition).
It contains `{ "url": "...", "port": <n>, "pid": <n>, "aether": "...",
"aetherEvents": "...", "protocolVersion": 1 }`. Use the `pid` field to detect
stale files from crashes: if the process is not running, the file is stale and
the editor is not active.

## Troubleshooting

- **Tools error with 'editor not ready'**: the app window has not finished loading.
  Wait a moment after the window appears and retry.
- **Discovery file present but tools fail**: the file may be stale from a previous
  crash. Check the `pid` in the file against running processes. If the process is
  gone, restart the editor; it will overwrite the file.
- **Screenshots return blank or partial content**: screenshots work even when the
  editor window is occluded or behind other windows (`backgroundThrottling` is
  disabled). If content is blank, ensure a project is loaded and the section is
  rendered (use `goto` first).

## Shared atlas, palette, and undo stack with human editing

Agent and human art editing share the same atlas, palette, and undo stack. A `write_tiles`
call and a brush stroke in Art mode are the same kind of operation: both produce
`set-tileset-tiles` commands on the project's EditHistory, and both are undone with Ctrl+Z.
The `goto` and `screenshot` tools auto-switch the editor to Map mode so the viewport is
visible for screenshots. See `docs/ART_SUITE.md` for the full human-facing art workflow.

## Known limitations

- Tile atlases were unified (2026-06): rendering, export, budget, and MCP all use
  the zone tileset.
