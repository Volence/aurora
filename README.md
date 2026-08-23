# Aurora

The **Empyrean** suite's visual editor for Sega Genesis / Mega Drive Sonic projects:
level layout, level art, collision, object and ring placement, palettes, and
sprite/animation authoring.

It is an Electron + React + TypeScript desktop app. State is held in
[Zustand](https://github.com/pmndrs/zustand) stores and on-disk formats are parsed
and validated through [Zod](https://zod.dev) schemas.

## What it opens

Aurora fingerprints the directory you point it at and picks an adapter
(`src/core/project/`):

- **aeon** — the suite's from-scratch engine. Detected by a root `project.json`
  whose `engine` is `"s4"`.
- **classic** — a Sonic 1 disassembly, **edited in place**: Aurora reads and writes
  S1's own native formats, so the disassembly's stock `build.lua` produces the
  modified ROM. Detected by `sonic.asm` plus non-empty `artnem/`, `map256/` and
  `levels/`.

Anything else opens with an unrecognized-project notice. A classic project keeps a
small `.aurora/project.json` sidecar (path overrides, build command, ROM and
symbol file names).

## The shell

A Home tab (open a project, recents, per-level cards), an Explorer sidebar, and a
tab strip. A tab is a **level**, a **sprite document**, or an **art canvas
document**.

A level tab is one workspace with a row of **facet pills** — lenses over the same
act:

| Project | Facets |
|---|---|
| aeon | Layout · Objects · Effects · Rings · Collision · Palette · Art |
| classic | Layout · Objects · Collision · Palette · Art |

Everything except **Art** shares the map canvas and swaps only the tools and the
right-hand panel; Art replaces the canvas with a tile/block/chunk composer. There
is no Map/Art *mode* toggle — that was removed in the UX overhaul. See
[`docs/ART_SUITE.md`](docs/ART_SUITE.md) for the art surfaces and for the
tile/block/chunk terminology (a chunk is 128×128 px in aeon, 256×256 px in classic).

Sprite documents do mappings + DPLC round-trip across four game formats — Sonic 1,
2, 3&K and S4 (`src/core/formats/games/`) — with a whole-frame bitmap editor and an
animation timeline.

Every edit — level, art, sprite, or agent-driven — is a single undo step
(Ctrl+Z; redo Ctrl+Y or Ctrl+Shift+Z) on the focused document's history, which
human and agent edits share. Edits stay in memory until you save; the classic save
is mtime-guarded and refuses rather than clobbering a file changed underneath it.

## Playtest loop

Aurora is an Aether client as well as a server, so it can drive the **oracle**
emulator while you edit:

- **Live palette push** — palette edits are written into the running game's RAM
  palette source (both engines rebuild CRAM from RAM every frame).
- **Build & Run** (Ctrl+Shift+B) — save, build the open project (aeon:
  `./build.sh`; classic: `lua build.lua`), then reload the ROM in the running
  emulator.
- **Play from cursor** (F7) — aeon only, and only on a DEBUG-shaped ROM. Classic
  gates it off: S1 has no warp mailbox.

The socket path resolves `ORACLE_SOCKET` → `EXODUS_SOCKET` →
`$XDG_RUNTIME_DIR/oracle.sock` → `/tmp/oracle.sock`.

## Getting started

Requires Node.js and npm.

```bash
npm install --legacy-peer-deps
npm run dev        # launch the editor (electron-vite dev)
```

`--legacy-peer-deps` is currently required: `electron-vite@5` declares a peer of
`vite@^5 || ^6 || ^7`, and this project is on `vite@8`. Plain `npm install` and
`npm ci` both fail with `ERESOLVE` until that peer range widens.

Other scripts (all of `package.json`'s):

```bash
npm run build      # production build into dist/ (electron-vite)
npm run preview    # build, then launch the production build in Electron
npm test           # vitest, single run
npm run test:watch # vitest in watch mode
npm run gen:theme  # regenerate src/renderer/styles/theme.css
```

`gen:theme` reads the Empyrean design tokens from `$EMPYREAN_TOKENS`, else the
sibling `../megaforge/design/tokens.json`. Its output is checked in, so only
regeneration needs the contract repo present.

### Environment variables

```bash
AURORA_NO_GPU=1 npm run dev   # disable Chromium hardware acceleration entirely.
                              # Last resort for GPU/GL stacks that stall Aurora's
                              # paints — e.g. NVIDIA drivers logging "Failed to
                              # allocate NVKMS memory for GEM object".

AURORA_PERF=1 npm run dev     # the classic level viewport logs one paint-timing
                              # line per act load to THIS terminal: store-ready ms,
                              # first-paint ms, draw count, avg/max draw ms over the
                              # first 2s. Look for "[aurora-perf]". Off (and
                              # inert) by default.

VITE_AURORA_DEBUG=1 npm run dev  # expose the `window.__dbg` test hooks the CDP
                                 # harnesses drive. Absent from a normal build.
```

## Agent / tool surface

While running, Aurora serves one `editor/*` method registry
(`src/main/editor-methods.ts`) over two transports at once:

- **MCP** — Streamable HTTP at `POST /mcp`.
- **Aether** — the suite bus: JSON-RPC 2.0 at `POST /aether` with a server-push
  event channel at `GET /aether/events` (SSE), behind an `initialize`/capabilities
  handshake (`protocolVersion: 1`). This lets non-AI suite tools drive Aurora
  without going through MCP.

The registry covers the aeon art/palette/background/effects tools, the classic
project surface (`open_project` … `save_project`), and the playtest methods
(`aether_status`, `aether_connect`, `push_palette`, `warp`, `build_and_run`). Each
mutation is one undo step, shared with human edits.

Every route is loopback-only (loopback bind plus a Host/Origin check). The active
port is written to `~/.aurora/mcp.json` — default `38473`, falling back to an
ephemeral port if taken — alongside the `aether` and `aetherEvents` URLs; the
legacy `~/.sonic-level-editor/mcp.json` is also written during the rename
transition. Connect with:

```bash
claude mcp add --transport http aurora http://127.0.0.1:38473/mcp
```

Full tool reference and conventions: [`docs/MCP.md`](docs/MCP.md).

## Architecture

```
src/
  main/        Electron main process — IPC, file I/O, MCP + Aether servers
    aether/    outbound Aether client (unix socket, NDJSON JSON-RPC), build & run,
               warp, palette push, boot-position restore
  preload/     context-bridge preload
  renderer/    React UI
    workspace/ the level workspace and its per-engine facet registry
    shell/     tabs, explorer, commands, session lifecycle
    components/  map/classic viewports, art, sprite, effects, panels
    canvas/ state/ hooks/ providers/ agent/ styles/
  core/        engine-agnostic logic (no Electron/React imports)
    project/   project detection, the aeon and s1 adapters, bundled profiles
    formats/   binary readers/writers (aeon data, classic/ S1 codecs, per-game
               sprite mappings, Kosinski, palettes, effects)
    level-classic/  the S1 level model: render, collision, object sprites, I/O
    art/ collision/ compress/ editing/ export/ import/ model/ anim/ agent/
    aether/ config/ shell/
  shared/      types shared across processes
test/          node-only vitest suites (plus `__tests__/` alongside sources)
```

`src/core` is pure data logic and carries the bulk of the test coverage.

## Documentation

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — the plan of record. Read §2.5–§2.7 first;
  where they disagree with the older sections, they win.
- [`docs/ART_SUITE.md`](docs/ART_SUITE.md) — art authoring guide and terminology
- [`docs/MCP.md`](docs/MCP.md) — agent tool reference and conventions
- `docs/specs/`, `docs/plans/`, `docs/ideas/`, `docs/reviews/` — design specs,
  implementation plans, notes, and review packets

## License

MIT
