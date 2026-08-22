# Aurora Overseer

**Boot prompt** (paste into a fresh session started in this repo):

> You're the overseer for this repo. Read `docs/OVERSEER.md` first, then
> `../empyrean/docs/OVERSEER-PROTOCOL.md`. Work the queue. Peers may or may not be
> running — check `ListAgents`; coordinate if present, proceed solo if not.

The role, delegation discipline, review bars, and peer protocol live in the shared
protocol doc. This file is what's Aurora-specific.

## The queue

**`docs/ROADMAP.md` is the plan of record — read §2.6 then §5.1 and stop.** §2.6 records
what has actually shipped; §5.1 is the open list in order. §2/§3/§5's older claims are
banner-marked where §2.6 supersedes them. The most recent `docs/reviews/*handoff*` packet
carries the arc-level detail, and `docs/superpowers/{specs,plans}/` hold the designs —
read a spec's §0 Corrections block FIRST where one exists; several are authoritative over
everything after them.

Do not duplicate queue content here. This file only says where it is.

## What the overseer implements

Aurora is a TypeScript/Electron app: features, tests and harnesses all go to agents in
worktrees. The overseer's own work is judging returned work, running the **foreground**
runtime harnesses (below — agents cannot), rulings, and landing.

## Aurora-specific review bars (beyond the protocol's)

Each has caught a real defect here.

1. **The node suite cannot see React, canvas, or a running app.** ~3,400 vitest tests
   pass while a feature is visibly broken. Anything whose behaviour is a rendered
   surface, a mouse gesture, an IPC round trip or a live emulator needs a
   `scratchpad/*-harness.mjs` driving the real app under CDP. Three defects in ten
   minutes of real use is the observed rate for UI shipped on unit tests alone.
2. **Plant a violation before believing any guard.** Guards that assert nothing are the
   dominant defect class in this repo. Red-first, restored, with the failing assertion
   quoted — and `grep` the call site first: a defect planted in the wrong function
   (there are usually two near-identical dispatch lines) survives a full build-and-run
   cycle looking convincing.
3. **Anti-vacuous rows.** A row that would pass on an empty screen, an unloaded project
   or a blank chunk proves nothing. Assert the instrument saw its subject. A stamp-ghost
   check once "passed" against `OJZ $45`, which is legitimately blank.
4. **Same-destination-two-ways for anything about state.** To ask "did X corrupt this?",
   reach the same state by a path known good and by the path under test, from ONE
   checkpoint, and diff. Then diff the known-good path against ITSELF and require zero,
   or the comparison is measuring nondeterminism.
5. **Report the regime; don't conclude past your evidence.** A row that cannot separate
   two hypotheses must say so in its own text. "Terrain snap falsified" was published
   from six samples that could not distinguish it from an unsimulated player.
6. **A suspiciously clean constant across varied inputs is evidence of a CONFOUND.**
   Two independent probes produced the same stable wrong number from two different
   confounds (unfinished falls; two warps in one boot). Vary what the confound holds
   fixed — fresh boot per sample, settle before reading — before believing it.
7. **Check the SERVER's rule before writing the call.** `require_paused` was missed three
   times in one day by reasoning about what an operation *does* instead of reading
   `oracle-next/crates/oracle-aether/src/engine.rs`. Grep the gate; do not infer it.
8. **Plans state the PROPERTY, never invented fixture numbers.** Nine defects came from
   plans carrying guessed values; the dispatches that stated the property produced zero.

9. *(Now also in the shared protocol, `43fbfc9` — kept here with its local precedent.)*
   **Check the CLASS of every SHA before it hardens into a citation.** A docs-only commit
   cited as the anchor for a code guarantee is invisible once it is in prose, and these
   citations cross repos — two other repos' contract docs pinned Aurora SHAs on
   2026-08-22. `git show --stat` it and cite the **merge** that put the code on master,
   not whatever master happened to be when you typed the message. Both of that night's
   outcomes are the precedent, and the pairing is the point: `945f5c6` (2 insertions,
   `docs/ROADMAP.md` only) went out as the anchor for a 472-line collision-plane fix and
   was wrong — the code anchor was `6fc7359` — while `a88db05`, sent the same casual way
   in the same message, was a genuine merge and held. One miss in two. **The rule polices
   citations, not reputations**: checking is the discipline, and the receiver's `--stat`
   is what caught it in both directions.
10. *(Illustration, not a new rule — this is the shared protocol's "derived, never
   copied" bar read correctly; ruled local by the empyrean overseer, `43fbfc9`.)*
   **Derive the expectation from the thing it guards, so the two cannot drift.** The
   collattr length check reads `baseline.length * 2` from the loader's *own* fallback
   rather than pinning 131072, so the check and the fallback are the same figure by
   construction. The cleanest worked example in the repo, and the positive form of bar 8
   above (`fix/collattr-unreadable-guard`, merge `6fc7359`).
11. *(Illustration, not a new rule — the shared protocol's faithful-reporting bar applied
   under pressure; ruled local by the empyrean overseer, `43fbfc9`.)*
   **Never manufacture a stronger-looking assertion than the evidence supports.** When
   the natural assertion is weak, prove the claim another way and *say* that is what you
   did. Even-length collattr truncation is byte-identical through a round trip by
   construction (short in, same short out), so the parcel proved that half through
   loader-accepts-then-save-recertifies instead of inventing a byte delta — and stated
   so in its report. A gate that passes for the wrong reason is worse than no gate — and
   this is bar 5's discipline at the moment it is hardest to hold.

12. **Enumerate by what TOUCHES the data, not by what DEFINES it.** Two overseers
   independently counted the section-sidecar ref sites and both got 8; the real count was
   13. Both passes enumerated the *codec* — parse, serialize, the interface, the header —
   and neither asked **what else copies a `Section`**. `cloneSection`
   (`editing/section-ops.ts`) carried all four scalar refs in a hand-enumerated literal
   with no spread and **no test**: deleting `sceneRef` OR `bgLayoutRef` from it survived a
   3909-test suite, so a copy/paste silently losing a section's background or palette
   assignment was invisible. A second hardcoded enumeration at `save.ts:130` was missed
   the same way. When counting the places a field lives, grep for the TYPE and for every
   constructor/copier of it, not just for the field name in its own module.

## Editor↔engine coordination points

Protocol details Aurora depends on and did not invent. All measured; re-verify before
trusting, the repos move.

- **Aether client** (`src/main/aether/`). Socket order `$ORACLE_SOCKET` → `$EXODUS_SOCKET`
  → `$XDG_RUNTIME_DIR/oracle.sock` → `/tmp/oracle.sock`; a long path dies on `SUN_LEN`.
  **The handshake is TWO messages** — `initialize` with `clientCapabilities:{events:true}`
  then an `initialized` NOTIFICATION; subscription happens on the second, and skipping it
  gives a healthy connection that silently never receives an event. Feature-detect off
  the advertised method list, never a version.
- **`require_paused`**: `write_memory`, `reload_rom`, `run_frames`, `run_to`, `press`,
  `play_input`. NOT `read_memory`/`read`/`sprites`/`scanlines` (pure reads). Always
  honour `pause`'s `wasRunning` — the bus is multi-client and an unconditional resume
  starts a machine somebody else stopped.
- **Live palette**: write `Pal_Base` (96 bytes = **lines 1–3 ONLY**; line 0 is the
  character palette and the engine never writes it), then set `Pal_Base_Dirty = 1`.
  Payload then flag: the per-frame compose copies the base in only when the flag says so.
  Reading "96 bytes" as four lines is the natural mistake and slides every line by one.
- **Warp mailbox** (DEBUG shape only): `Warp_Req_X`/`Warp_Req_Y` (u16 world px), then
  `Warp_Req_Flag = 1` LAST. The engine clears the flag as its ack (~20 frames) and
  publishes the CLAMPED destination back into X/Y — surface where it LANDED, not what was
  asked. Gate the feature on the symbols resolving so a release ROM greys it out.
- **The DEBUG ROM boots into debug-fly**, whose update reads only the D-pad — the player
  looks frozen and never falls. One `emulator/press` B exits it properly. Never poke the
  pad cells or `debug_flag`.
- **Builds**: `FAST=1 ./build.sh` (~1.3s) is the iteration loop — lanes skipped, loud
  not-a-ship-artifact banner, and it re-bakes stale editor data itself, which is why
  Aurora runs no re-bake of its own. The canonical build fails loud on stale editor data.
  Build the flavour matching the RUNNING ROM (`emulator/status.romPath`), or the reload
  targets a file the build never touched.
- **Boot-position override** (DEBUG shape only, aeon `a2a24eb9`, ARCH §4.12b):
  `Boot_At_X`/`Boot_At_Y` (u16 world px) + `Boot_At_Flag`, same clamp/publish-back/
  cleared-flag-ack contract as the warp mailbox, consumed by Build & Run's restore
  (`src/main/aether/boot-restore.ts`) at the run_to-the-init window below. **The
  cleared flag can be FORGED**: a write that lands before the boot clear is zeroed
  along with the flag, which reads exactly like an ack — any check of this sequence
  must verify position via an independent read, never the flag alone. The warp-retry
  fallback (pre-override DEBUG ROMs) inherits this hazard on paused machines and is
  unguarded; it vanishes as ROMs carry `Boot_At_*`.
- **Fresh headless oracle-aether is paused at frame 0** — reads before any resume see
  reset-RAM garbage; and after `reload_rom`, RAM holds the OLD session's values until
  the boot clear runs, so level-up polls must gate on `frameToken`, not on plausible
  values.
- **Boot zeroes all 64KB of work RAM.** A write to a reset-paused machine is gone
  before level init reads it, and the boot proceeds with authored values SILENTLY —
  the client looks finished having done nothing. Anything init must consume is written
  at `reload_rom → run_to <init symbol> → write, flag last → continue`, where the
  machine is stopped at the init's entry and nothing is painted yet.
- **`emulator/reset` is off-limits on the hosted build** until aeon's F-HOSTED-RESET-SRM
  closes — it bypasses the player's `.srm` flush. `reload_rom` is unaffected.
- **`.lst` listings carry a third `EQU` section**; oracle-next's parser handles it.
  Equates can never answer address lookups in either direction.

## Instruments

- **CDP harnesses** (`scratchpad/*-harness.mjs`) are how anything visual or live is
  proven. They launch Electron under `xvfb-run` with `AURORA_DEBUG_PORT`, drive it over
  CDP, and assert. `window.__dbg` (`src/renderer/debug-hooks.ts`) is the query/door
  surface — `aeon.open`, `openDir`, `aether.*`, `classic.*`, `canvas.*`. **It only exists
  in a `VITE_AURORA_DEBUG=1 npm run build`**; a plain build has no hooks and no port.
- Reference harnesses: `collision-agent-harness` / `collision-gesture-harness` (agent +
  human paths), `live-palette-e2e-harness` (two processes, independent observer),
  `warp-tearing-harness` (same-destination-two-ways), `chunkgrid-hint-harness` (layout
  measurement).
- **A harness must not ask the component under test whether it worked.** The palette
  harness reads `Palette_Buffer` out of the machine over a SECOND client connection.
- **Subagents NEVER touch `mcp__oracle__*`** — they deadlock. Runtime work is the
  overseer's, in the foreground, or a headless bus script.
- Emulators: `oracle-aether <rom>` headless for harnesses; `oracle-frontend <rom>
  --aether` when a human needs to SEE it. Its startup banner's method count is the
  freshness tell — a mismatch between the two binaries means one is stale, not that the
  hosted build is restricted.

## Quirks

- `npm run build` before relaunching Electron; the app serves `dist/`, not source.
- Never bare-`pkill` on a pattern that matches your own shell command line — it kills
  the shell mid-script and leaves you reading a stale log as if it were fresh.
- **Do not run `cargo` in `oracle-next`** — that pipeline is serialized and concurrent
  cargo has corrupted their evidence repeatedly. Ask that session to rebuild.
- Builds spawned from Aurora need `SIGIL_BUILD`/`SIGIL_EMIT` in the environment; a
  desktop-launched Electron inherits none of a terminal's exports, so the failure reads
  as a broken repo rather than a missing variable. `project.json` `buildEnv` is the
  durable fix.
- Aeon's tree may be live-edited by its own session. Building it from here is normal
  authoring; landing anything in it is not.
