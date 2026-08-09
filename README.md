# Aurora

Visual authoring — level art, sprites, animation, and menus — for the **Empyrean**
Sega Genesis / Mega Drive suite. Aurora is a desktop editor for the `s4_engine`
Sonic hack: you lay out levels, paint tiles, edit collision, place objects and
rings, tune palettes, and build sprite animations, then export data the engine
assembles into the ROM.

It is an Electron + React + TypeScript app. State is held in [Zustand](https://github.com/pmndrs/zustand)
stores and all on-disk formats are parsed/validated through [Zod](https://zod.dev)
schemas. Nothing is written to disk until you save.

## Modes

- **Map** — the level canvas. Edit the foreground tile grid in Tile / Block (16×16)
  / Chunk (128×128) units, paint collision, place objects and ring patterns, and
  assign per-section backgrounds (Plane B). See [`docs/ART_SUITE.md`](docs/ART_SUITE.md).
- **Art** — an in-editor art studio for creating and editing tiles, blocks, and
  arbitrary-size chunk assemblies, with a tileset panel, palette editor, and chunk
  library. Toggling between Map and Art preserves the open document.
- **Sprite** — sprite and animation authoring with multi-game mappings/DPLC
  round-trip support (Sonic 1, 2, 3&K, and S4). See `src/core/formats/games/`.

Every edit — map, art, sprite, or agent-driven — is a single undo step (Ctrl+Z)
on a shared history.

## Getting started

Requires Node.js and npm.

```bash
npm install
npm run dev        # launch the editor (electron-vite dev)
```

Other scripts:

```bash
npm run build      # production build (electron-vite)
npm run preview    # preview a production build
npm test           # run the test suite (vitest)
npm run test:watch # vitest in watch mode
npm run gen:theme  # regenerate theme tokens (scripts/gen-theme.mjs)
```

### GPU / paint troubleshooting env vars

The classic (Sonic 1) level viewport composes its chunk layout on CPU-backed
canvases so paint stays fast even on machines whose GPU stack fails Chromium's
canvas allocations. Two escape hatches help when a machine is still struggling:

```bash
AURORA_NO_GPU=1 npm run dev   # disable hardware acceleration entirely (software
                              # compositor). Last resort for GPU/GL stacks that
                              # stall Aurora's paints — e.g. NVIDIA drivers logging
                              # "Failed to allocate NVKMS memory for GEM object".
```

```bash
AURORA_PERF=1 npm run dev     # log one paint-timing line per act load to THIS
                              # terminal: store-ready ms, first-paint ms, draw
                              # count, avg/max draw ms over the first 2s. Off (and
                              # zero-overhead) by default. Look for "[aurora-perf]".
```

## MCP / agent integration

While running, Aurora embeds an MCP server (Streamable HTTP) that exposes
art-generation tools operating on the **live** editing session — query tiles,
palettes and backgrounds; paint regions; stamp and save chunks; capture
screenshots. Each mutation is one undo step and nothing touches disk until you
save.

The active port is written to `~/.aurora/mcp.json` (default `38473`, falling back
to an ephemeral port if taken; the legacy `~/.sonic-level-editor/mcp.json` is also
written during the rename transition). Connect with:

```bash
claude mcp add --transport http aurora http://127.0.0.1:38473/mcp
```

Full tool reference and conventions: [`docs/MCP.md`](docs/MCP.md).

Aurora also speaks the **Aether** suite bus directly: the same `editor/*` method
surface is served as JSON-RPC 2.0 over `/aether` (POST) with a push event channel
at `/aether/events` (SSE), behind an `initialize`/capabilities handshake
(`protocolVersion: 1`). The discovery file advertises the `aether` and
`aetherEvents` endpoints alongside the MCP `url`. This lets non-AI suite tools
drive Aurora without going through MCP.

## Architecture

```
src/
  main/        Electron main process — IPC, file I/O, MCP server, Aether bus
    aether/    suite bus protocol (JSON-RPC 2.0 envelope over HTTP/SSE)
  preload/     context-bridge preload
  renderer/    React UI
    components/  Map, Art, and Sprite panels, palettes, viewports
    canvas/      rendering
    state/       Zustand stores (undo history lives here)
    hooks/ shell/ styles/
  core/        engine-agnostic logic (no Electron/React imports)
    formats/   binary format readers/writers (collision, nametable, rings,
               objects, palettes, Kosinski, per-game sprite mappings)
    export/    level + sprite export, tile dedup, VRAM coloring
    art/ collision/ compress/ editing/ import/ model/ agent/
  shared/      types shared across processes
```

`src/core` is pure data logic and carries the bulk of the test coverage
(`*.test.ts` alongside sources, plus `test/`).

## Documentation

- [`docs/ART_SUITE.md`](docs/ART_SUITE.md) — Art mode usage guide and terminology
- [`docs/MCP.md`](docs/MCP.md) — MCP server tools and conventions
- `docs/specs/` — design specs per feature
- `docs/plans/`, `docs/ideas/` — implementation plans and design notes

## License

MIT
