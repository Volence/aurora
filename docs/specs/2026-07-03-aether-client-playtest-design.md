<!--
Authored 2026-07-03 (Claude Fable 5). Design for ROADMAP.md Phase P2.
Contracts this spec rides on: empyrean/contract/protocol.md (the Aether spec),
empyrean/docs/STUDIO_VISION.md §5 (workflows A1/A2/A3), aeon design #8's Aether
requirements (aeon/docs/superpowers/specs/2026-07-02-raster-parallax-authoring-design.md)
whose live-preview client this module must also serve.
-->

# Aurora Aether Client & Playtest Loop — Design

## Goal

Make Aurora the suite's first **outbound** Aether client and land the three Tier-A
studio workflows: **A1** live palette→CRAM, **A3** Build & Run, **A2** play-from-cursor.
After this phase, an artist edits a color and the running game recolors next frame;
one keypress rebuilds + reloads; another warps the running game to the map cursor.

## Non-goals

Cross-act warp (engine-gated on parameterized boot — aeon design #5's `Game_Entry`
eventually unlocks it); scenario/save-state anchoring (Oracle doesn't expose it yet);
A4 object-click sync (later, small once events flow); any Seraph/DAW coupling.

## 1. The client module

`src/main/aether/client.ts` (Electron **main** process; renderer talks to it over IPC).

- **Transport**: Unix socket `$XDG_RUNTIME_DIR/oracle.sock`, newline-delimited
  JSON-RPC 2.0, per `empyrean/contract/protocol.md`. Open with the
  `initialize`/`initialized` handshake (advertise `events: true`), store the server's
  capability flags, branch on flags — never on version.
- **Conventions**: addresses/payloads as hex strings (protocol D9); methods are
  `emulator/<name>`.
- **Events**: subscribe to notifications (`emulator/stopped`, `emulator/resumed`,
  `emulator/rom_reloaded`); forward to renderer via IPC push.
- **Symbol resolution (non-negotiable)**: every RAM address via
  `emulator/lookup_symbol`, resolved fresh after every connect and every
  `load_symbols`. Cache per build only; symbols provably drift between builds
  (the documented +$24 incident). Never a literal address in Aurora source.
- **Lifecycle**: reconnect with backoff; all ops no-op gracefully when disconnected
  (UI shows state; edits still work offline — the live push is an enhancement, never
  a dependency).
- **Consider upstreaming**: the JSON-RPC/handshake/event core is what
  `empyrean/clients/typescript/` is supposed to be. Build it as a dependency-free
  layer inside Aurora first; extraction to empyrean is a follow-up, not a blocker.

Renderer state: extend `busStore` with `{oracle: 'disconnected'|'connecting'|'connected',
buildState: 'idle'|'building'|'failed'|'ok', lastBuildId}`.

UI chrome (per `empyrean/design/` conventions): status-bar segment `Aether ◇ connected`
(accent when live), click = connect/disconnect menu.

## 2. A1 — live palette → CRAM (do first)

- Hook the existing palette-editor commit path (`set-palette-line`) **and** the live
  slider-drag preview: on drag, throttle ~30 Hz → `emulator/write_cram
  {line, entries}`; on commit/undo/redo, push the committed line.
- Scope: zone palette lines (all four; sprite line 0 included — it's real CRAM).
  Standalone sprite palettes don't push (they aren't CRAM state).
- Correctness note: the engine reloads palettes on section change/fades; a push is a
  *preview*, ROM truth still comes from save+build. Show a small "live" badge on the
  palette editor while connected so the semantics are visible.

## 3. A3 — Build & Run

- **Command**: `Build & Run` (toolbar button + Ctrl+B + command-palette entry).
- **Pipeline**: save project (existing save path) → spawn `./build.sh` in the engine
  repo root (cwd from `project.json` location; `child_process.spawn`, stream output)
  → on exit 0: `emulator/load_symbols` (path to fresh `s4.lst`) then
  `emulator/reload_rom` (path to `s4.bin`) → toast "Running build <shorthash>".
- **Failure UX**: nonzero exit opens a build-output panel (monospace, scrollback,
  last ~200 lines, error lines highlighted). Build gates from the generators
  (collision/screens/parallax/behaviors) surface here — this panel is the single
  place "the generator rejected my document" appears, so make it good.
- **Config**: engine root is derivable (directory containing `project.json`); build
  command configurable per-project (`project.json` optional `buildCommand`, default
  `./build.sh`). When Crucible later joins the bus, swap spawn → `build/invoke` +
  `build/complete` event behind the same UI (isolate the invocation behind one
  function so the swap is one-file).
- Debounce: one build at a time; queue at most one pending.

## 4. A2 — play-from-cursor (within-act warp)

- **Trigger**: F7 (DSVEdit convention) or command palette, with the Map viewport
  focused; warps to the cursor (hover cell), or selection anchor if a selection exists.
- **Coordinate math**: editor (section sx,sy + local px,py) → engine space. The
  engine keeps a slot model (`Slot_Section_Map`, origins at `SLOT_ORIGIN_*`); do NOT
  reimplement its constants from docs — resolve at runtime: read
  `Slot_Section_Map`/`Slot_Origins` via symbol lookup, compute the target engine
  coords for the cursor's section, and if the target section isn't currently in a
  slot, fall back to: write the act's start-position RAM? — **No**: v1 rule is
  *warp within the loaded slot pair only*; if the cursor's section isn't resident,
  show "section not loaded — walk closer or Boot from ROM" (modifier-held variant
  does save→build→reload, which always works). This dodges re-running section
  streaming by hand — the engine streams on its own once position changes within
  residency. Revisit "force re-stream" only if v1 feels too limited in practice.
- **Writes** (all symbol-resolved): `Player_1` x/y (SST +$02 long, +$06 long — 16.16
  fixed; whole-pixel in the high word), `Camera_X`/`Camera_Y`, zero player velocities
  (SST x_vel/y_vel) so no garbage momentum. Payload-then-verify: read back position
  next frame; toast on success.
- **Floating-origin caveat**: aeon design #2 (floating origin) will change the
  coordinate contract (unbounded coords, per-act rebase). This feature's coordinate
  math must live in ONE function (`core/aether/warp-math.ts`, pure + tested) so the
  floating-origin update is a single-file change. Check aeon's
  `2026-07-02-floating-origin-design.md` status at implementation time.

## 5. MCP tools

Expose the same capabilities to agents: `oracle_status`, `push_palette` (explicit),
`build_and_run`, `warp {sectionX, sectionY, x, y}`. Same code paths as the UI.

## 6. Trust & safety

Unchanged model: Aurora only *initiates* connections to a local socket; its own HTTP
surfaces stay loopback-only with Origin/Host checks. Never auto-build on connect;
builds are always explicit user/agent actions.

## 7. Acceptance

- With Oracle running `s4.bin`: drag a palette slider → the running game recolors
  (<100 ms perceived). Kill Oracle → editing continues unaffected, status shows
  disconnected, reconnect works.
- Ctrl+B from a dirty project → game reloads with the edit visible; a failing build
  shows the error panel and does NOT reload.
- F7 over a resident section moves the player there with zero velocity; over a
  non-resident section shows the fallback message; Boot-from-ROM variant lands at
  the act start.
- Zero literal RAM addresses in the diff (`grep -rn '0x00FF\|\$FFFF[0-9A-F]' src/`
  clean for new code); warp math pure-tested.

## Plan seeds

1. Client core + handshake + status UI (+ tests against a mock socket).
2. A1 palette push. 3. A3 build & run + error panel. 4. A2 warp + warp-math tests.
5. MCP tools + MCP.md update. Each lands separately; GUI-verify per slice.
