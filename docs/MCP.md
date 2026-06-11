# MCP Integration

The editor embeds an MCP server (Streamable HTTP) while running. It exposes
art-generation tools that operate on the live editing session — every mutation
is one undo step (Ctrl+Z), and nothing touches disk until you save.

## Connect (one time)

1. Launch the editor (`npm run dev`).
2. Check the port in `~/.sonic-level-editor/mcp.json` (default 38473; falls back
   to an ephemeral port if 38473 is in use — always use the file).
3. `claude mcp add --transport http sonic-editor http://127.0.0.1:38473/mcp`
   (substitute the port from the file if it differs).

## Tools

Query: `get_project_info`, `get_palette`, `get_tiles`, `get_nametable_region`, `check_budget`
Mutate (one undo step each): `set_palette`, `write_tiles`, `paint_region`, `save_chunk`*, `stamp_chunk`
View: `goto`, `screenshot`

*`save_chunk` adds to the chunk library outside undo history (additive only),
matching the existing chunk-library behavior.

## Constraints enforced at the tool boundary

- Colors: Genesis 9-bit BGR, even channel values; palette line 0 rejected (sprite-reserved).
- Tiles: 8x8, pixel values 0-15, index 0 transparent; tileset capped at 2048.
- Budget: flip-aware unique tiles per VRAM color group must fit the 1024-tile FG pool
  (BG region starts at slot 1024). `check_budget` and every mutation reply report it.
- Over-budget paints are allowed and reported (`fits: false` in the reply); export is
  where overflow hard-fails. Optimize tile reuse before exporting.

## Discovery file

`~/.sonic-level-editor/mcp.json` is written on startup and removed on clean quit.
It contains `{ "url": "...", "port": <n>, "pid": <n> }`. Use the `pid` field to
detect stale files from crashes: if the process is not running, the file is stale
and the editor is not active.

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

## Known limitations

- Tile atlases were unified (2026-06): rendering, export, budget, and MCP all use
  the zone tileset.
- Odd-tile-row collision edits are dropped on strip serialization: the engine format
  stores one collision byte per 16px cell (every two tile rows), so only even tile
  rows are authoritative. Edits to odd rows are written to the in-memory grid but
  are overwritten when the strip file is serialized.
