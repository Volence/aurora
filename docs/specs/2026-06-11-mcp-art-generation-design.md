# MCP Art-Generation Integration — Design Spec

## Overview

Embed an MCP (Model Context Protocol) server in the level editor's Electron main process so a Claude Code session can generate and edit level art for the s4_engine — live, in the running editor, with visual feedback via canvas screenshots and hard validation against engine constraints.

The agent's editing loop: write palette/tiles → paint nametable regions → navigate the viewport → screenshot the canvas → judge → revise. Every mutation is one undoable command in the editor's existing history.

## Goals

- Let an agent author level art (palettes, tiles, nametable painting, chunk library) against the live editor session.
- Give the agent eyes: scoped screenshots of the map canvas rendered by the editor's own renderer.
- Enforce engine constraints at the tool boundary: 9-bit even-value colors, 16 colors/line, 11-bit tile indices, per-section flip-aware unique-tile budgets against the s4_engine VRAM pool.
- Keep the user in control: edits are unsaved until the user saves; undo/redo treats each tool call as one step.

## Non-Goals (v1)

- Object, ring, collision, or section-property tools (manual in the editor).
- PNG/image import via MCP (the agent authors tile data directly; the quantize pipeline remains available to the UI).
- Headless/file-based operation when the editor is closed.
- An `undo` tool (undo belongs to the user).
- Saving to disk as a tool side effect.

## Prerequisites (separate, land before MCP work)

1. **Strip parser refresh**: `src/core/formats/s4-strips.ts` parses the legacy 48-row strip format; the engine's `ojz_strip_gen.py` now emits 256-row (full section height) strips with dual collision planes (A/B). Update parser + tests to the current format.
2. **VRAM base computation**: `src/core/export/vram-coloring.ts` hardcodes `VRAM_BASE_B = 113 * 32` — a stale snapshot of a measured value. Compute color-group bases from measured flip-deduped union tile counts, matching `s4_engine/tools/tile_dedupe.assign_section_slots` semantics, and fail export when groups exceed the VRAM pool.

Reference contract for all engine formats: `s4_engine/docs/LEVEL_EDITOR_SPEC.md`.

## Architecture

Three pieces, all in this repo:

### 1. MCP server in the main process — `src/main/mcp-server.ts`

- Official `@modelcontextprotocol/sdk`, Streamable HTTP transport.
- Starts after the main window is created; binds `127.0.0.1` on an OS-assigned port.
- Writes a discovery file `~/.sonic-level-editor/mcp.json`: `{ port, pid, projectPath }`.
- One-time client setup: `claude mcp add --transport http sonic-editor http://127.0.0.1:<port>/mcp`.
- Translates tool calls into IPC round-trips to the renderer (mutations, queries, navigation, screenshots). The server holds no project state of its own.
- Crash-isolated: a thrown error rejects that tool call only; nothing propagates into the editor. No project loaded / window gone → clean structured error ("no project loaded", "editor not ready").
- Lifecycle: starts with the app, dies with the app. No editor running → no tools.

### 2. Agent IPC channel — preload + renderer

- New channel `agent:command` carrying structured requests: `{ kind: 'mutate' | 'query' | 'navigate' | 'screenshot', ... }`.
- Renderer handler executes against the Zustand stores (`projectStore`, `editorStore`) through the existing editing-command system.
- **Every mutation request builds exactly one batched command** pushed onto `EditHistory` — one tool call = one Ctrl+Z step, interleaved linearly with the user's own edits.

### 3. Pure agent-command logic — `src/core/agent/`

- Command construction, validation, and budget computation as pure functions (no Electron/DOM imports), unit-tested with vitest like the export modules.

## Tool Surface (v1)

### Query (read-only)

| Tool | Description |
|------|-------------|
| `get_project_info` | Zones/acts/section grid, tileset size, chunk library listing, project paths. |
| `get_palette(section?)` | Active 4×16 palette as Genesis words and RGB. |
| `get_tiles(start, count)` | Raw 8×8 pixel-index arrays. |
| `get_nametable_region(section, x, y, w, h)` | Decoded entries: tile index, palette line, h/v flip, priority. |
| `check_budget(section?)` | Flip-aware unique-tile count per section and per VRAM color group vs. pool limits. |

### Mutate (one undo step per call; replies include the affected section's updated budget)

| Tool | Description |
|------|-------------|
| `set_palette(line, colors)` | Writes one palette line. Validates 9-bit BGR, even-only channel values. Line 0 is rejected by default (engine convention reserves it for player/sprite art — confirm against s4_engine during implementation and adjust if the reservation differs). |
| `write_tiles(tiles, at?)` | Append or replace tileset tiles. Returns assigned indices; warns when a tile duplicates an existing tile or its flip. |
| `paint_region(section, x, y, entries)` | Writes a rectangle of nametable entries through the same path as the tile brush. |
| `save_chunk(name, w, h, nametable)` | Adds a reusable pattern to the chunk library. (chunk-library addition; additive and outside undo history, matching existing ChunkLibrary behavior) |
| `stamp_chunk(id, section, x, y)` | Stamps a library chunk onto a section grid. |

### See & navigate

| Tool | Description |
|------|-------------|
| `goto(section, x?, y?, zoom?)` | Sets active section, scrolls, zooms via `editorStore` — agent and user share one view. |
| `screenshot(region?, scale?)` | PNG of the map canvas only (via `canvas.toDataURL()`), current viewport or requested region. |

## Data Flow

Mutation: MCP server (main) → `agent:command` IPC → renderer handler → build batched command → `EditHistory` apply → store update → dirty-rect repaint → IPC reply (result + budget).

- Renderer in-memory state is the single source of truth. The MCP never writes project files while the app runs; no two-writers problem with unsaved work.
- IPC serializes onto the renderer event loop — agent commands and user brush strokes cannot race.
- Queries read live (unsaved) state; `check_budget` reflects everything in memory.
- Screenshots return through the same channel as PNG bytes.

## Error Handling

- Validate before mutating: palette values, tile index ranges (≤ 11-bit), region bounds, budget overflow on `write_tiles`/`paint_region`.
- A failed call applies nothing — commands are all-or-nothing; no partial application.
- Structured, specific error messages (what failed, the offending value, the limit).
- Window closed or reloading → "editor not ready" rejection; no queueing.

## Testing

- `src/core/agent/` pure functions: vitest unit tests (validation matrices, budget math, command construction, screenshot region clamping math).
- IPC plumbing: thin integration test via Electron test harness (round-trip a query, a mutation, an undo).
- End-to-end generate→screenshot→undo loop: manual verification in the running app.

## Decisions Log

| Decision | Choice | Why |
|----------|--------|-----|
| V1 scope | Art generation only | Matches the goal; smaller surface |
| Editing mode | Live in running editor | Immediate feedback, shared undo, no reload churn |
| Undo granularity | One step per tool call | Clean recovery without losing whole generations |
| Transport/architecture | Embedded HTTP MCP server in Electron main | Everything needed (IPC, files, canvas) already reachable from main; zero extra processes |
| Stale-code fixes | Separate, land first | MCP builds on correct export/import code |
