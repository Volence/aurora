<!--
Authored 2026-07-03 (Claude Fable 5). Design for ROADMAP.md Phase P2.
Contracts this spec rides on: empyrean/contract/protocol.md (the Aether spec),
empyrean/docs/STUDIO_VISION.md §5 (workflows A1/A2/A3), aeon design #8's Aether
requirements (aeon/docs/superpowers/specs/2026-07-02-raster-parallax-authoring-design.md)
whose live-preview client this module must also serve.
-->

# Aurora Aether Client & Playtest Loop — Design

## 0 · Corrections (2026-08-19, pre-implementation)

**This section overrides anything below it that disagrees.** The spec was written
2026-07-03 and is sound in structure — the client module (§1), the one-function warp
math (§4), symbol-only resolution and the trust model all survive unchanged. What
follows is what six weeks moved underneath it, measured against a live server and
against engine source on 2026-08-19, before any code was written.

### C1 · The emulator is `oracle-next`, not Oracle

The suite's emulator is now `oracle-next/` (Rust, WIP), not the C++ Exodus port. Run it
headless as `target/release/oracle-aether <rom.bin>`. Everywhere this spec says "Oracle",
read oracle-next. Its owner implements missing methods on request rather than having
clients work around gaps — so a gap is a conversation, not an obstacle to route past.

### C2 · A1 CANNOT WORK AS SPECIFIED — and it is not "do first"

§2 says slider drag → `emulator/write_cram` → the running game recolors next frame.
**On a running machine that is a one-frame flash at best, on both engines**, because
both rebuild CRAM from a RAM source every frame:

- **aeon** — `engine/effects/palette.emp:31` composes "once per frame into
  `Palette_Buffer`"; `engine/ram.emp:973` takes a per-line copy at each line's frame-top
  DMA enqueue. `Palette_Buffer` (`$FFFF8216`) is itself recomposed each frame from
  base → cycling → cross-fade, so even writing the composed buffer is transient. The
  live hook must target the pipeline's *source* — which is what aeon design #8's
  DEBUG-override block with its payload-then-flag protocol exists for.
- **classic S1** — `sonic.asm:1034` `HBlank` blasts `v_palette_water` into CRAM with an
  unrolled `rept (4*$10)/2`; VBlank does the dry palette.

§2's own "correctness note" gestures at this ("the engine reloads palettes on section
change/fades") but understates it by orders of magnitude: it is every frame, not every
section change.

**So live palette is a `write_memory`-to-the-RAM-palette-source story**, not a
`write_cram` story. `write_memory` already exists and is symbol-targeted.

Consequences: **A1 moves from first to LAST**, and the phase order becomes
**client core → A2 → A3 → A1** (see C6). `emulator/write_cram` is additionally **not
served** by oracle-next today (`-32601`; it is schematized in the contract and the
contract admits the gap). It has been requested and accepted, and will ship
`require_paused` — which costs nothing, because the unpaused case is the one that fails
for engine reasons anyway. Where `write_cram` earns its keep is a **paused** machine:
inspect a colour, tweak it, see it on the glass with the pipeline stopped.

### C3 · A2's residency model no longer exists

§4 says to resolve `Slot_Section_Map` / `Slot_Origins` at runtime and restrict v1 to
"warp within the loaded slot pair only". **Neither symbol is in `s4.lst`.** The engine
moved to an act-wide ZX0-paged art pool (ROADMAP §2) and a camera-driven tile cache;
what exists now is `Camera_X`/`Camera_Y` (+`_Biased`, `_Max`, `_Target`, `_Art_Hold`)
and section-write state (`Cache_Prev_Cam_Row`, `Cache_Prev_Cam_X`,
`Section_Top_Row_Written`, `Section_Plane_Dirty`).

The spec's instinct — *resolve at runtime, do not reimplement constants from docs* — was
exactly right and is why this was caught cheaply. But the residency rule and its
fallback UX ("section not loaded — walk closer") must be **re-derived against the
engine**, not carried over. It is plausible the warp is now *simpler* than v1 feared
(write camera + player, let the cache re-stream, no residency test at all) — that is a
hypothesis to test at implementation time, not a claim.

### C4 · Param conventions are mixed, not uniformly hex

§1 says "addresses/payloads as hex strings (protocol D9)". Measured: `addr` **is** a hex
string, but `write_memory`'s `value` wants a **JSON integer** — a hex string is rejected.
Check per-method rather than assuming one rule.

### C5 · A symbol target cannot carry a displacement — and getting it wrong is silent

§4 writes `Player_1` SST **+$02** and **+$06**. `write_memory` accepts a `symbol` target,
but **unknown params are silently ignored**: `{symbol: 'Player_1', offset: 2}` and
`disp: 2` both report success and write to the BASE address (verified by zeroing base and
base+2, writing `0xBEEF` with `offset: 2`, and reading it back at base).
`symbol: 'Player_1+2'` is a clean error. So the warp **must** resolve the base with
`lookup_symbol` and write by computed `addr` — still symbol-derived, never a literal.
Reported to oracle-next; a ruling on reject-unknown-params vs an explicit `disp` is
pending, but the workaround is correct regardless.

### C6 · The socket path has a resolution ORDER, and a length trap

§1 hardcodes `$XDG_RUNTIME_DIR/oracle.sock`. The real order is
`$ORACLE_SOCKET` → `$EXODUS_SOCKET` (transitional) → `$XDG_RUNTIME_DIR/oracle.sock` →
`/tmp/oracle.sock`. Honour all four. **A long path fails with `SUN_LEN`** — do not put a
test socket in a deep scratchpad directory.

### What §1 got RIGHT and must not be "fixed"

- The **two-step handshake** — `initialize` advertising `events: true`, then
  `initialized` — is correct and load-bearing. Subscription happens on the second
  message; a client that sends only the first gets a healthy connection that silently
  never receives an event. (This cost three probe rounds to rediscover; the spec had it
  right all along.)
- Event names `emulator/{stopped,resumed,romReloaded}` are correct (camelCase is
  normative; contract CR-6 corrected an earlier draft of this very spec).
- Feature-detect against the `initialize` result's advertised **method list** — it is
  authoritative and gated on the server side, so `write_cram` will simply appear there
  when it lands. Branch on that, never on version.

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
  `emulator/romReloaded`); forward to renderer via IPC push.
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

## 2. A1 — live palette → CRAM ~~(do first)~~ — **SEE §0 C2: this section's mechanism is wrong and A1 is now LAST**

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

## 4. A2 — play-from-cursor (within-act warp) — **SEE §0 C3 and C5 before implementing**

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

- ~~With Oracle running `s4.bin`: drag a palette slider → the running game recolors
  (<100 ms perceived).~~ **Superseded by §0 C2** — a CRAM write cannot survive a frame
  on either engine. The A1 acceptance test is: drag a slider → the running game
  recolors and STAYS recoloured across several seconds of play (i.e. the write went to
  the palette pipeline's source, not to CRAM). Kill Oracle → editing continues unaffected, status shows
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
2. ~~A1 palette push.~~ **A2 warp + warp-math tests** — every link measured working
   today, so this is the first shippable increment (§0 C2).
3. A3 build & run + error panel — engine-parameterized from day one; the classic
   probe (build s1disasm, feed its AS listing to `load_symbols`, resolve `v_player` /
   `v_screenposx` / `v_screenposy`) rides this step rather than gating the phase.
4. **A1 palette push**, against the RAM palette source (§0 C2), feature-detected off
   the advertised method list so it never gates the phase.
5. MCP tools + MCP.md update. Each lands separately; GUI-verify per slice.

Engine choice is NOT a phase-level fork: the client and A1 are engine-neutral, and
engine only bites at A3's build config and A2's symbol names + warp math — both of
which drop into the `ProjectAdapter` registry §2.5 already built. Aeon first because
it is measurably working; classic follows as configuration.
