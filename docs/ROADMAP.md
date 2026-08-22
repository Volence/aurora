<!--
Authored 2026-07-03 by Claude Fable 5. This is Aurora's forward-looking master plan,
written to be executed cold by later (smaller) model sessions: every phase names its
contract documents, file paths, and acceptance gates. Companion: PLAN_AUDIT_2026-07-03.md
(what was stale and why). Grounding: aurora/src survey, empyrean/docs + contract/ + design/,
aeon/structs.asm + tools/ + docs/superpowers/{specs,plans}/2026-07-02-* (the design week).
Update this doc as phases complete — mark DONE in place, log discoveries under each phase.
-->

# Aurora — Art-Suite Roadmap

*The plan of record for making Aurora the best-in-class visual authoring tool for the
Aeon engine. Last full revision: 2026-07-03; **re-sequenced 2026-08-19** (§2.6 + §5).*

> **Read §2.6 before §2, §3 or §5.** Two lines of work were delivered out of this plan's
> sequence — §2.5 (disasm-as-project, 2026-08-09) and §2.6 (the August line, 2026-08-12 →
> 08-19) — and where they disagree with the older sections, **they win**. §5.1 is the
> short list of what is open right now.

## 1. Mission

Empyrean's charter (`empyrean/docs/ROADMAP.md`) makes Aurora **the single home for
everything visual**: level layout, level art, collision, sprites, animation, screens/
menus/HUD, parallax/raster effects, and object-behavior authoring. No separate sprite
app, no separate menu tool. The quality bar is unchanged: *"did a modern studio ship
this for their own engine?"*

Two structural rules frame everything below:

- **Aurora authors documents; generators bake them.** The pattern proven by collision
  (`.collattr.bin` → `ojz_strip_gen.py` overlay) is now the suite standard: Aurora
  writes editor-owned files under `aeon/games/<game>/data/editor/`, a Python generator
  in `aeon/tools/` validates them with hard build gates and emits `data/generated/`.
  Aurora never emits engine assembly directly (the TS asm exporters are being retired —
  see §4.2, §4.7). Compression is Crucible's (ZX0/S4LZ), never Aurora's.
- **Aurora is becoming a live tool, not just a file editor.** The Aether bus
  (`empyrean/contract/protocol.md`) is how Aurora talks to Oracle (the emulator):
  live palette pushes, play-from-cursor, and design #8's real-engine 60fps parallax
  preview. Aurora already *serves* Aether; the missing half is the **outbound client**
  (§4.8) — named by the 2026-07-01 suite audit as the whole suite's keystone gap.

## 2. Ground truth (2026-07-03)

> Dated, and partly overtaken — §2.5 and §2.6 are the current picture. Kept because the
> engine-contract half below is still the contract.

**Shipped and solid** (verified against src + git):
- **Map mode** — 256×256-tile sections, sparse act grids, tile/block/chunk stamping,
  BG (Plane B) assignment per act + per-section override, object/ring *display*,
  section management (add/remove/move/copy, undoable), zone-tileset prerender.
- **Art mode** — full pixel suite (pencil/fill/line/rect/select/dither/mirror/
  transforms), tile/block/chunk documents, flip-aware tileset dedup, edit-in-place,
  chunk library, palette editor with live preview.
- **Sprite mode** — whole-frame bitmap editing, multi-game adapters (S1/S2/S3K/S4)
  for mappings+DPLC read, animation *playback* timeline, zone/standalone palette
  modes + copy bridge, cross-sprite pixel clipboard, snapshot undo merged with the
  shared history.
- **Collision authoring** — the real engine model end-to-end: 16-bit cell words
  (S&K-derived shape 9:0 | xflip 10 | yflip 11 | solidity 13:12), dual planes A/B,
  block-keyed reuse painting, kind-tabbed shape palette, sticky flips,
  `.collattr.bin`/`.collattrb.bin` sidecars **consumed authoritatively by the engine
  build** (`aeon/tools/ojz_strip_gen.py:1065`). WYSIWYG confirmed in-game.
- **Agent surface** — MCP server (:38473, ~16 `editor/*` tools) + Aether *server*
  adapter (`/aether` + SSE), shared undo with human edits, loopback-only.
- Health: ~83 test files (vitest), tsc clean, electron-vite build.

**The engine contract that matters now** (supersedes `aeon/docs/LEVEL_EDITOR_SPEC.md`
until that doc is refreshed — trust `aeon/structs.asm` + the 2026-07-02 specs):
- `Sec` is **66 bytes ($42)**; per-section tile art is gone. Art is an **act-wide,
  globally-deduped, ZX0-paged pool** (`act_art_pool_table`/`act_art_pool_pages`,
  256-tile pages; manifest at `data/generated/ojz/act1/ojz_act_pool_manifest.asm`).
  Blocks are 768-byte units (512 nametable + 128 collision A + 128 collision B),
  S4LZ v3 with per-section dictionaries. Camera bounds are grid-derived, not authored.
- Editor-owned inputs the build already consumes: `section_{N}.tiles.bin`,
  `.collattr.bin`/`.collattrb.bin`, `objects.json`, `rings.json`, `meta.json`,
  `data/editor/{zone}_tiles.bin`, BG library. ⚠ **Corrected 2026-08-22:**
  `editor_bg_override.json` was listed here and is NOT Aurora-owned — it has
  **zero references in `src/`** and is produced by aeon's own
  `tools/png_to_bg_override.py`. Load-bearing for the effects arc: wave 1's
  BgAnim bands ride that file's `anims` key, so Aurora must **become a writer of
  a file it has never touched** — not extend a path it already owns.
- Coming from the design week: `section_id` widens byte→word (floating origin, #2);
  per-act ROM budget gates (#1); an engine/game split with a game manifest (#5).

**The four Aurora-facing engine designs — all approved, execution-ready**
(specs+plans in `aeon/docs/superpowers/{specs,plans}/2026-07-02-*`):

| # | Design | Aurora's half |
|---|---|---|
| 6 | Editor collision authoring | Chunks carry dual-plane 16-bit collision; stamps place art+collision atomically; legacy encodings retired; `paint_collision` MCP tool |
| 7 | Screens/HUD | 4th AppMode `'screen'`: visual authoring of title/menus/results/game-over as JSON documents → `screens_gen.py`; 7 MCP tools |
| 8 | Raster + parallax | 5th AppMode `'raster'`: band/curve/raster-timeline editors → `parallax_gen.py`+`raster_gen.py`; **Aurora's first outbound Aether client** for live 60fps preview via DEBUG RAM overrides; 6 MCP tools |
| 9 | Object behaviors | Map-mode properties panel: typed per-placement params + behavior picker → `behavior_gen.py`; subtype-as-bundle-index; retire TS entity exporter; 4 MCP tools |

## 2.5 Delivered out of sequence — Disassembly-as-Project (2026-08-09)

**Status: SHIPPED (v1)** — branch `feature/disasm-project`, ~35 double-reviewed
commits. Spec: `specs/2026-08-09-disasm-project-abstraction-design.md`; plan (with
per-task deviation notes): `plans/2026-08-09-disasm-project-abstraction.md`. This
was a motivated pull-forward, not part of the P0–P8 line (see §5) — it proves the
engine-agnostic project abstraction by opening a **Sonic 1 disassembly and editing
it in place**.

What landed:
- **Engine-agnostic `ProjectAdapter` layer** (`core/project/`): fingerprint
  `detect` → bundled profile → **loud resolution report** (per-entry
  resolved/missing/ambiguous) → capability manifest → domain accessors. Single
  `detectProject` registry with disjoint fingerprints; `.aurora/project.json`
  override sidecar.
- **S1 in-place editing**: hierarchical `LevelDoc` (tiles → blocks → chunks →
  chunk-id layout, never flattened) on the shared undo history; levels
  (layout/chunks/blocks/tiles/palette/colind), object placement, and object
  sprite art all edit and **save back S1's native formats** so its stock
  `build.lua` produces the modified ROM. Round-trip is byte-identical
  (uncompressed) / decompressed-identical (compressed) across all six zones.
- **Pure codecs** (`core/formats/classic/`): Enigma (the one missing codec) +
  S1 plain-binary layout/objpos/startpos/colind/collision-shape codecs; Nemesis
  and Kosinski encoders already existed and were reused.
- **Guarded save**: atomic tmp+rename, mtime-conflict refusal, encoder self-check
  (re-decode + structural compare before any file is written).
- **12 MCP tools** for the classic surface (`open_project` … `save_project`),
  MCP-parity one-undo-step-per-mutation (`docs/MCP.md` → *Classic project tools*).
- **Aeon detection unified**: aeon now routes through the same `detectProject`
  registry (`AeonProjectAdapter`).

**Relationship to the P0–P8 plan:**
- **Pulls P8 Phase A/D forward.** P8's neutral `LevelDoc` model and its Phase D
  classic codecs (§4.10) are now built and battle-tested against real S1 data —
  P8 inherits them and its "donor disasms are import-only" assumption is
  superseded (edit-in-place proven). See the P8 note in §4.10 and §5.
- **Shares P1's placement vocabulary.** Classic object placement
  (select/move/Del/drag-from-library, inspector for id/subtype/flips/respawn)
  deliberately mirrors the P1 aeon entity-placement interaction (§4.1) so the
  later aeon work reuses the same UI gestures behind a different backing command.

**Deferrals — status after v1.1** (2026-08-09 afternoon, Tasks B1–B4 on the same
branch; plan `plans/2026-08-09-classic-v1.1-batch.md`):
- **Aeon adapter is a routing marker** — *CLOSED 2026-08-13 (`4782e86`); this entry was
  STALE for nine days and is corrected 2026-08-22.* `AeonProjectAdapter.open()` performs
  the **real project load** — `index.ts:115` calls `loadAeonProject(fa, …)` and returns it
  on `handle.aeon` — and `useProject.loadFromPath` **no longer exists anywhere in `src/`**
  (the renderer's aeon branch goes through `state/aeon-open.ts` → `aeonAdapter.open()`).
  What IS still deferred is narrower and should be described as such: the aeon `report` is
  not populated (`buildReport([])`), and `AeonProjectData` carries no scene/preset/band or
  budget concepts. Extending that model is a data-shape change, **not** "building a loader".
  This stale text was handed across the fence into aeon's 2026-08-22 effects assessment and
  refuted there; see `reviews/2026-08-22-aeon-effects-survey-verification.md`.
- **Composer wiring for classic content editing** — *CLOSED (v1.1 B3).* A
  self-contained `ClassicComposerDock` (Chunk/Block/Tile tabs) edits tile pixels,
  blocks, and chunks in the classic view with shared-structure UX (usage counts +
  shared-edit warnings + duplicate-then-edit) — deliberately NOT wired into aeon's
  Art mode.
- **Palette editing UI + MCP** — *CLOSED (v1.1 B4).* A `ClassicPalettePanel` (4×16
  swatch grid) edits the act palette through a reusable Genesis RGB-slider control
  (extracted from `PaletteEditor`'s idiom, decoupled from the aeon stores); each
  color commits one `classicSetPalette`, whose epoch bump refreshes chunk art +
  object sprites + thumbnails live. MCP now wires `set_level_palette` (classic
  `set_palette` — renamed to avoid the aeon `set_palette` name in the flat tool
  registry) and `set_start`.
- **Object art + loop authoring** — *CLOSED (v1.1 B1/B4).* Placed objects render
  their real S1 sprite art in the viewport (B1); loop-de-loop layout cells are
  authorable (the chunk picker's Loop toggle stamps S1's bit-7 flag; the viewport
  draws a corner glyph; the eyedropper preserves the flag) (B4).

## 2.6 Delivered out of sequence — the August line (2026-08-12 → 2026-08-19)

**Status: SHIPPED — all on `master` and pushed** (`ae5d6a2` … `8efda9d`, ~540 commits).
Recorded 2026-08-19. Where this section disagrees with §2, §3 or §5, **this section wins**;
every row was re-checked against source on that date.

Health at `8efda9d`: 296 test files, **3291 passed / 3 skipped**, `tsc --noEmit` clean.

Like §2.5 this was *steered*, not taken from §5's order, and for the same reason: the
motivating spine is the **classic (S1 disassembly) editor**, the one engine where a whole
level can be authored end-to-end today. Three lines landed, each on its own spec, plus a
full-surface review.

### A. UX overhaul — one shell, facet parity (spec stages 1–4)

Specs: `specs/2026-08-12-aurora-ux-overhaul-design.md` (§12 is the staging) and
`specs/2026-08-13-ux-overhaul-stage4-design.md` (**read its §2 and §3.0 first** — seven
claims from earlier documents were investigated and found wrong; four changed the design).
Merges `ae5d6a2` → `2f1db2b`, `a662e99`.

- **Stages 1–3** — document/session model (tabs, per-document undo, project-wide save),
  facet/tool/panel registries, tab strip + explorer + Home + Project Setup, and aeon's
  Map/Art/Sprite modes re-homed as facets of one `LevelWorkspace`.
- **Stage 4** — classic re-homed into that same workspace, and the exit criterion met:
  **both engines render through one `LevelWorkspace`**, through one `(engine, facetId)`
  module registry. `LegacyWorkspace`, `ClassicProjectView`, `ZoneActTree` and the old
  `Toolbar` are **deleted**. Undo is unified on `DocumentHistoryHub` (per-document stacks;
  undo-bus, sprite-undo, edit-seq and classic-history all gone). Step H converged the art
  tiers three ways instead of the spec's one shared Art facet — only one of classic's three
  tiers is a pixel surface — so classic's Tile tier now runs on aeon's
  `PixelEditController`/`PixelViewport`, one `art-shared/PaletteGrid.tsx` serves all four
  palette sites, and `s1ArtFacet`/`artFacet` stay separate modules.
- **Classic facets today** (`src/core/project/s1/index.ts`):
  `layout · objects · collision · palette · art`. Rings are absent by design (S1 rings are
  objpos objects, not a layer).
- **Not built from that spec:** stage 5's **typed cross-tab/cross-window clipboard** and the
  **Converter tab** (clipboards are still per-store; no converter module in-tree), and stage
  6's polish pass beyond what the lens sweep (D below) fixed. PNG import — stage 5's other
  half — shipped through line B instead.

### B. In-app art authoring — originate, constrain, commit (phases 1, 2A, 2B, 2C)

Specs: `specs/2026-08-15-in-app-art-authoring-design.md` (its **§0 · Corrections** is
authoritative over everything after it) and
`specs/2026-08-15-phase-2c-resolve-and-commit-design.md` (supersedes §4.4).
Merges `4427c2f`, `42ff186`, `d5f44d6`, `9a77e5b`, `697d409`.

The bar this line was built to: *Aurora must be good enough that artists don't leave for
Aseprite to make the art in the first place.*

- **Phase 1 — paint-through.** Paint pixels on a composed block/chunk surface; the stroke
  resolves down the tile→block→chunk reference ladder without silently damaging the other
  places sharing that tile.
- **Phase 2A/2B — the origination canvas.** A free canvas with a configurable constraint
  profile; clashes, colours-per-line and the flip-aware tile count stay live in front of the
  artist while they draw. Canvas documents are named sidecar files under `.aurora/canvas`.
- **Phase 2C — resolve and commit.** `canvas-resolve` (pure geometry) → `classic-commit-plan`
  → `classicCommitCanvas` (one store command), with a **PNG import path** at any size feeding
  the same resolver. A canvas commit therefore covers at most **16 chunks** — that is a
  derivation, not a literal in source (`CANVAS_MAX_SIDE` 1024px ÷ `CHUNK_PX` 256 = 4, so
  4×4); an agent auditing this went looking for a `16` and reasonably could not find one.
  The PNG path has no such cap. CDP-verified 7/7 (commit panel) and 4/4 (import).
- **Phase 3 (tile-pool growth) was measured and DECLINED** — see §0 of the phase-1/2 spec.
  Measured across all six S1 zones: **blocks** are both the dangerous tier and the variant
  tier; chunks have no near-duplicates at all; GHZ has 2 spare tiles.
- **Doc debt:** the 2C header says BUILT, but **§D2b cross-act reach reporting is not built**
  (SBZ palette sources, LZ/SBZ3 shared-file reach, the underwater-palette warning). Annotate
  the header rather than letting BUILT mean "except §D2b".

### C. Classic collision authoring + the agent surface (spec stages 1–5)

Spec: `specs/2026-08-16-classic-collision-authoring-design.md`. Merges `81a51fc`, `e981908`,
`a39afce`, `13734af`, `3217fab`, `9f734f4`, `4df618f`, `a814b09`, `eb138e2`, `92a7a00`,
`8efda9d`. **Complete and closed** — nothing it booked is outstanding; the packet is
`docs/reviews/2026-08-19-handoff-after-collision.md`.

Before it, `classicSetColind` was reachable **only** from the agent handler: the agent could
assign collision and a person could not. Now:

- A **Collision facet** for classic, over the real engine lookup verified against
  `s1disasm/_incObj/sub FindNearestTile & FindFloor & FindWall.asm`: chunk-cell solidity
  gates the block-id `colind`, and block 0 short-circuits both. Granted read-only at stage
  3a, write at stage 3b (a shape picker over `paint-collision`); solidity itself stays
  ChunkTab's Assign mode.
- **Committed art gets collision** (stage 4) — closing 2C's own out-of-scope note that a
  committed drawing landed at colind 0 / solidity 0, i.e. the player fell through new art.
- **Human gestures** — drag to paint, Shift-drag for a rectangle — and refusals that
  *guarantee* instead of hedging: link-equivalence carries `linkEquivalent`, a drag crossing
  a loop-flagged cell says so, and a partial paint names **which** cells were skipped.
- **Agent parity restored** (stage 5, two plans): `commit_canvas` + `import_art_sheet` (the
  whole art line had shipped UI-only) and `set_block_collision`. Each is one `EDITOR_METHODS`
  entry, so it lights up on **both** MCP and Aether at once; that registry now carries **36
  tools**. Spec `specs/2026-08-18-art-agent-surface-design.md` §1 corrects the "MCP parity"
  framing: it is registry work, with no MCP-specific and no Aether-specific half.

**Runtime proof lives outside vitest** — a node-only suite cannot see React or canvas.
`scratchpad/collision-agent-harness.mjs` (**8/8**),
`scratchpad/collision-gesture-harness.mjs` (**9/9**) and
`scratchpad/commit-collision-harness.mjs` (**8/8**) drive the real app under CDP; all three
must stay green, and each carries planted-defect notes in its footer.

The commit harness used to report 5/6, recorded here as "stage 4's row-4 *expectation* is what
is wrong". **Confirmed and closed in `c005f57`**, and the reason is worth keeping: row 4 wanted
the toggle to stamp `$FF` into *every* new block, but `withCollision` skips block ids past the
end of the zone's colind table (spec §5 / CLASSIC-A4 — in ROM they read the *adjacent* zone's
table). GHZ ships **439 blocks against a 410-entry** `collide/GHZ.bin`, so in GHZ that skip
covers every id a commit can append and the shape half of the toggle is a designed no-op — which
the preview stated on screen all along. The harness now runs GHZ *and* SLZ (414 blocks against a
500-entry table, where the write is permitted) and proves both halves. No app change was needed
for row 4 itself — but the preview's statement was half-silent: it said "0 will get flat ($FF)"
without saying blocks were skipped or why (`reportLines` dropped `skippedOverhang`). Closed
2026-08-20 (`fix/report-skipped-overhang`): the preview now carries the count and the overhang
reason, guarded by harness row 8 (planted red first) — hence 8/8.

### D. The 2026-08-16 lens sweep

`docs/reviews/2026-08-16-aurora-lens-sweep.md`, a full-surface review. Its R1–R14 defect
campaign landed (`de7fb4e`, `780d311`), the micro type tier `2xs: 10px/14px` landed
(`3a129f5`), and three findings were REFUTED and recorded so they are not re-found. Its §7
*direction* items are the open list in §5.1.

## 2.7 P2 delivered — the playtest loop (2026-08-19)

**Status: SHIPPED.** Aurora is now Aether's first outbound client, which the
2026-07-01 suite audit named as the whole suite's keystone gap. Aeon-first, not
classic-first as the lens sweep recommended — that advice predated the switch to
`oracle-next`, and aeon's path was measurably working while classic's had two
unverified links — measured 2026-08-19 in
`docs/reviews/2026-08-19-classic-playtest-links.md`: they were **symbols** (oracle's
listing parser hard-refuses an AS `.lst`; gates everything, since Aurora resolves only
by symbol) and **play-from-cursor** (S1 has no warp mailbox and no facility to co-opt).
Build and live palette were false worries — 600 ms native build, palette strictly
simpler than aeon's.

Health: 3383 passed / 3 skipped, `tsc` clean.

- **Client** (`src/main/aether/client.ts`) — unix socket, NDJSON JSON-RPC,
  four-step socket-path resolution, symbol resolution with a cache dropped on
  `romReloaded`. **The handshake is two messages**: `initialize` advertising
  `events: true`, then an `initialized` notification. Subscription happens on the
  second; a client sending only the first gets a healthy connection that silently
  never receives an event.
- **Live palette** — writes `Pal_Base` (96 bytes, **lines 1–3 only**) then sets
  `Pal_Base_Dirty`, payload-then-flag. NOT a `write_cram`: both engines rebuild
  CRAM from a RAM source every frame, so a CRAM write is a one-frame flash. Proven
  end to end by a harness driving the real app, with an independent observer client
  reading `Palette_Buffer` out of the machine.
- **Play-from-cursor** (F7) — through aeon's `Warp_Req_*` mailbox rather than a
  camera poke. Measured: a bare poke leaves 19/1120 visible-window nametable words
  wrong at +30f; the mailbox leaves 0. DEBUG-shape only, so a release ROM greys it
  out.
- **Build & Run** (Ctrl+Shift+B — Ctrl+B was already the Explorer) — save →
  `FAST=1 ./build.sh` → reload the ROM the emulator is actually running → restore
  the player's position. The panel opens on start and closes on success; errors are
  pulled to the top of its output.
- **Agent surface** — five `EDITOR_METHODS` entries, so all of it is live on MCP
  and Aether at once. The art line had to be retrofitted for this; this phase did
  not repeat that.

**Loop cost, attributed** (the interesting number was never the build): re-bake
7–12s · build 1.3s · position restore 1.5s · reload 64ms · save ~0. Aeon has an
incremental content-addressed re-bake in flight targeting <2s. **Updated 2026-08-20:**
aeon's re-bake landed at 0.99s, and position restore moved to the engine's boot-position
override (aeon `a2a24eb9`, ARCH §4.12b; consumed here in `src/main/aether/boot-restore.ts`)
— measured 643ms vs the warp-retry loop's 1442ms, and the first painted frame IS the
destination (the draw-then-jump is deleted, not shortened). The warp loop survives only
as a fallback for pre-override DEBUG ROMs; `restoredTo` now reports the engine-published
clamped pair on both paths. Aurora's own
contribution to the wall was a save that rewrote every file whether it had changed
or not, which bumped ~40 mtimes and marked aeon's level tree stale on **every**
build — fixed by comparing before writing.

### 2.7b The classic half — links 1 and 3 (2026-08-20)

**Status: SHIPPED** for s1disasm projects, per the split the measurement report
recommended (`2026-08-19-classic-playtest-links.md` §7). The gate that report
named — oracle-next's parser refusing AS listings — opened with oracle's
`a380830` drop; the report's §9 foreground acceptance and this parcel's own
harness both confirm `sonic.lst` loads (accepted unverified, 35-method server).

- **Build & Run** routes through the OPEN project (`state/build-and-run.ts`,
  ONE dispatch site for UI + agent + debug hooks): classic saves via
  `saveClassicProject` then runs `lua build.lua` in the disasm root. No env
  requirements, no FAST/DEBUG flavour (the plan never claims one), listing is
  the source-named `sonic.lst` — never a ROM-stem derivation. The three build
  fields are seeded fill-only into `.aurora/project.json` at open. **Measured
  end-to-end wall: ~650 ms** (save ~0 · build 0.6s · reload ~0) — the fastest
  Build & Run in the suite, as the report predicted.
- **Live palette** — classic is SIMPLER than aeon and is not a port: S1's
  VBlank DMAs all four `v_palette_line_N` lines to CRAM unconditionally every
  frame, so a push is ONE 32-byte write, no dirty flag (none exists; none was
  invented). The mapping is 1-indexed — editor line N ↔ `v_palette_line_(N+1)`
  — derived from Aurora's own S1 profile against `Palette Index.asm`, and the
  harness plants the off-by-one to prove the observer catches it. All four
  lines push (classic line 0 is an ordinary act line). A push PERSISTS until
  the next level transition/fade; only `PaletteCycle`'s few entries repaint.
  The connection probe reports **which family** the ROM carries
  (`paletteKind`), so neither engine's panel lights up against the other's ROM.
- **Play-from-cursor stays gated OFF** — link 4, not shipped and not faked: S1
  has no warp mailbox in any flavour, so F7 gates on symbol detection exactly
  as a release aeon ROM does, with a classic-worded reason. Position restore
  after Build & Run is likewise absent by design (`restoredVia` omitted): the
  only alternative is poking `v_player` on a running machine, which is link
  4's unmeasured spike. Both wait on the s1disasm-side mailbox decision the
  report assigned across the fence (§6 items 8–9).

Proof: `scratchpad/classic-playtest-harness.mjs`, 19/19 — real app under CDP on
the real s1disasm, independent observer client, anti-vacuous controls (stale-
dist refusal, pre-push sentinel absence, untouched-line checks), and the tree
restored byte-identically (git status equal) at the end.

## 3. The domain map

Where each art domain stands and where it goes. ★ = new capability, ☆ = upgrade.

| Domain | Today | Target | Contract | Phase |
|---|---|---|---|---|
| Level layout (map) | Mature | ☆ in-viewport object/ring placement + section/act properties | `specs/2026-07-03-entity-placement-properties-design.md` | P1 |
| Level art (tiles/chunks) | Mature; **authoring shipped** — paint-through, origination canvas, resolve-and-commit (§2.6 B) | ☆ export realignment to act-pool pipeline; VRAM budget v2 | §4.2 | P1/P6 |
| Collision | Mature (aeon map paint); **classic authoring shipped** — Collision facet, gestures, committed art gets collision (§2.6 C) | ☆ chunk-carried collision (design #6, **aeon**) | aeon spec #6 | P1 |
| Sprite art | Mature (draw/read) | ☆ finish the S4 export spine (decompose→mappings→DPLC→anim) | `plans/2026-06-17-sprite-*.md` | P3 |
| Animation | Playback only; **S1 `_anim` scripts auto-load** into the timeline on object art checkout, flips included (Parcel 1, 2026-08-20 — `docs/reviews/2026-08-20-s1-animation-audit.md`) | ★ authoring timeline + event tags | `specs/2026-07-03-animation-authoring-design.md` | P3 |
| Screens/menus/HUD | Nothing | ★ Screen mode (design #7) | aeon spec #7 | P4 |
| Parallax/raster | Config path in project.json only | ★ Raster mode + live preview (design #8) | aeon spec #8 | P5 |
| Object behaviors | Static JSON placement | ★ properties panel + behavior picker (design #9) | aeon spec #9 | P6 |
| Playtest loop | None | ★ Aether client: palette→CRAM, build→reload, play-from-cursor | `specs/2026-07-03-aether-client-playtest-design.md` | **P2 — next** |
| Import pipeline | **PNG import shipped for classic** on 2C's resolver (§2.6 B); **slicing + auto-palette exist as core algorithms** (2026-08-22), reachable by nothing yet | ★ wire slicing/suggestion into the import dialog + agent surface; sprite-frame targets | `specs/2026-07-03-png-import-design.md` + `specs/2026-08-15-phase-2c-resolve-and-commit-design.md` | P7 |
| Multi-game levels | Sprites only; **S1 read+write in place shipped** (§2.5) | ★ level adapters (S1/S2/S3K ⇄ each other ⇄ aeon, both directions) | `specs/2026-07-03-multi-game-level-interop-design.md` | P8 (Phase A unblocked now; **Phase A/D substrate landed by §2.5**) |

### 4.1 Level layout — close the last authoring gaps

Objects and rings render but are edited as raw JSON. Fix:
- **Place/drag/delete in-viewport**: drag from the object library palette onto the
  map; drag to move; Del to remove; ring line/arc/rect pattern tools (classic
  SonLVL patterns). One undo step per gesture via new `set-entities` command.
- Enforce the exporter constraints at edit time (section-local 0–$7FF, type < 32,
  subtype < 256, X-sorted on save) rather than at bake.
- **Section properties inspector**: surface the authored `Sec` fields Aurora hides
  today — `sec_flags` (water/underground/no-Y-wrap/preserve-state), `sec_music`,
  `sec_camera_lookahead`, per-section BG override, per-section parallax ref — in a
  right-dock panel writing `meta.json`. (Water flag pairs with the #8 water raster
  track later.)
- **Act/zone management**: "New Act / New Zone" wizard writing `project.json` +
  skeleton editor files, so creating a level never means hand-editing JSON. Grid
  resize already exists; expose start-position drag on the map.

This is also the substrate design #9 needs (its properties panel extends this
inspector), which is why it's Phase 1.

### 4.2 Level art — realign export to the real pipeline

The engine moved to the act-pool model; Aurora's `core/export/{vram-coloring,
act-descriptor,entity-data}.ts` target the retired one (see PLAN_AUDIT §1). Direction:
- **Retire, don't extend.** Aurora's save path (editor files) is the real interface; the
  Python generators own baking.

  > **Corrected scope, measured 2026-08-19 — the 2026-07-03 order and the 2026-08-19
  > handoff packet are BOTH wrong about this, in opposite directions. Re-measure before
  > you cut.** What is actually in-tree:
  >
  > | Module | Reality |
  > |---|---|
  > | `core/export/index.ts` | **Not dead.** `src/core/project/aeon/save.ts:27` imports `exportAct` and calls it at `:271` — the aeon save's export step. (The handoff packet says "ZERO importers"; that is wrong.) |
  > | `act-descriptor.ts`, `entity-data.ts` | Reached only through that barrel. |
  > | `vram-coloring.ts` | Reached through that barrel **and** by `src/core/agent/budget.ts:4` (`computeVramColoring`, `FG_TILE_LIMIT`), which `agent-handler.ts` uses for the **live** `check_budget` tool. Deleting it wholesale **breaks `check_budget`**. |
  >
  > What the export step emits — `{dataPath}export/{act_descriptor,entity_data,vram_bases}.asm`
  > and `section_N.{tiles,art}.bin` — is consumed by **nothing**. The directory *does*
  > exist and is populated (`aeon/games/sonic4/data/editor/ojz/act1/export/`, 30 files,
  > last written 2026-08-12) — an earlier revision of this note wrongly said it did not —
  > but nothing in aeon reads it: the build's `act_descriptor.emp` is authored under
  > `games/*/data/levels/`, and `tools/ojz_entity_gen.py` builds its own
  > `data/generated/ojz/act1/entity_data.emp` from the editor JSONs. Same filename,
  > different producer.
  >
  > So the order is: (1) delete the export step from `buildAeonSavePlan` — which also kills
  > sweep finding **R8**'s misleading "Project saved" after a failed export; (2) then
  > `export/index.ts`, `act-descriptor.ts`, `entity-data.ts` are genuinely dead — delete
  > them; (3) **keep** `vram-coloring.ts`, or move the two symbols `budget.ts` needs
  > somewhere honest and retire only the ASM generators.

  > **DONE 2026-08-19.** Executed exactly as ordered above. `buildAeonSavePlan` no longer
  > emits anything under `export/` and `AeonSavePlan.exportError` is gone with the R8 toast
  > branch it fed; `export/index.ts`, `act-descriptor.ts`, `entity-data.ts` and four test
  > files are deleted; `vram-coloring.ts` kept, trimmed to the two symbols `budget.ts` uses
  > (`assignVramBases`, `generateVramBasesAsm`, `VramBaseAssignment` deleted). Two guards
  > replace the deleted export tests and were both proven red against a planted
  > `export/act_descriptor.asm` push. Suite 291 files / 3271 passed / 3 skipped, tsc clean.
  > **Left alone deliberately:** the 30 stale files already on disk in the aeon tree —
  > deleting another repo's data is not this change's business.
- **Whole-level tile view stays** (the editor's flat-tile model is unaffected); what
  changes is bookkeeping: the VRAM budget readout should count **act-pool pages**
  (612 distinct tiles ⇒ 3 pages of 256) against the 1472-tile FG pool + 448-tile BG
  region, using `ojz_act_pool_manifest.asm` as ground truth, not per-section 300-tile
  caps. (`check_budget` MCP tool gets the same update.)
- Later (P6): a **budget visualizer** — per-page occupancy, shared-vs-unique tiles,
  what stamping this chunk would add — the "green/red before build" idea from the
  vision doc, rebuilt on the paged model.

### 4.3 Collision — execute design #6

Aurora-side only; aeon needs zero changes. Follow
`aeon/docs/superpowers/plans/2026-07-02-editor-collision-authoring.md` exactly:
`ChunkDef.collisionA/B: Uint16Array` (64 words per 16×16-tile chunk), atomic
art+collision stamping (one undo step), chunk composer paints collision with the
existing tool + palette, capture-from-map carries collision, paint default flips to
"just here" (propagation becomes the modifier), legacy `tileGrid.collision` nibble
plane + `ChunkDef.collision` byte + `.coll.bin` all deleted, `paint_collision` MCP
tool added. This *completes* the 2026-06 collision lineage.

### 4.4 Sprites & animation — finish the spine, then author

The read side is done (four game adapters); the S4 *write* side is the open queue
(plans `2026-06-17-sprite-{decomposition,mappings-export,animation-export}.md`):
1. **Auto-decomposition** — whole frame → hardware pieces (≤4×4 tiles, one palette
   line each) + flip-aware tile pool. This unlocks everything downstream.
2. **Mappings + DPLC export** to aeon's formats (`games/sonic4/data/{mappings,dplc}`;
   VDP-order pieces, 8 bytes/piece).
3. **Animation authoring**: upgrade the timeline from playback to editing — add/
   remove/reorder frames, per-frame 1/60s durations, loop/jump control codes, and
   **event tags as inline timeline markers** targeting the engine's `AF_*` codes
   (incl. `AF_CALLBACK`, which design #9 consumes as `EV_ANIM`). Onion-skinning.
4. **Registry payoff**: object library entries reference a sprite + preview frame, so
   placed objects render their real art in the map viewport (replaces markers).

Craft backlog (pull in opportunistically, each small: pixel-perfect pencil stroke,
symmetry painting, RotSprite rotation, boolean selection modes, numeric transforms —
research already done in `ideas/2026-06-16-art-suite-vision.md`).

### 4.5 Screens/menus/HUD — execute design #7 (Aurora half)

The engine plan sequences its own tasks first (font/text, fade engine, interpreter,
`screens_gen.py`); Aurora's mode is that plan's last stage. Build per the spec:
4th AppMode `'screen'`, `core/formats/screen.ts` (Zod mirror of the generator schema),
`screenStore` on shared undo, `ScreenViewport` (40×28 cell grid, font-tile text,
menu rows + cursor, images, live palette + fade preview), tool dock (text / menu /
image / properties: palette, music cue, fades, timeout+input actions), atomic save to
`games/sonic4/data/editor/screens/<name>.screen.json`, 7 MCP tools
(`list_screens`…`remove_widget`). Menu art itself is just Art mode (tiles) + this
mode (layout) — no separate "menu art" tool needed.

### 4.6 Parallax/raster — execute design #8 (Aurora half)

> ⚠ **SUPERSEDED IN ITS DATA CONTRACT (2026-08-22).** The incoming effects-authoring arc
> (§5.2) ruled **Option B**, owner-confirmed: Aurora authors `games/sonic4/data/editor/`
> **`effects/`**`*.json` and aeon's **`tools/effects_gen.py`** bakes generated `.emp`.
> The paths, packer and generators named below — `data/editor/{parallax,raster}/*.json`,
> `core/formats/parallax-pack.ts`, `parallax_gen.py`/`raster_gen.py` — are **NOT the
> contract**; neither generator was ever built, so nothing is lost by dropping them.
> Ruled here rather than left ambiguous so Aurora does not carry two contradictory
> contracts (`reviews/2026-08-22-aeon-effects-survey-verification.md`). The *editor
> surface* described below — band editor, curve editor, raster timeline, sequencer —
> stands and is what waves 1–2 build. Ruling 4 targeted the **act-level** ref, not the
> section-level one; **both are settled as of 2026-08-22** (§5.1 item 11): the act-level
> field is now **`Act.sceneRef`**, and the dead `Section.parallaxRef` was measured and
> deleted. Cite by symbol — item 11 records why a line number here went wrong as two
> different types inside one day.

The flagship "modern studio" feature: author per-scanline effects visually and see
them **in the running engine at 60fps** instead of hand-tuning asm tables. Per the
spec: 5th AppMode `'raster'` with band editor (drag boundaries over the rendered BG,
factor dropdowns constrained to representable shift-add fractions), curve editor
(sine params or 256-point freehand), raster timeline (224-line strip, split markers,
palette stops), sequencer step list; documents at
`data/editor/{parallax,raster}/*.json`; shared packer `core/formats/parallax-pack.ts`
golden-tested against `parallax_gen.py`; live preview = pack → debounce 50ms →
`emulator/write_memory` payload-then-flag into the engine's DEBUG override blocks;
fallback save→build→`reload_rom` stays supported. 6 MCP tools. Gated on engine tasks
1–4 of its plan (trampoline/walker, water effect, sequencer, generators + byte-equal
migration golden).

### 4.7 Object behaviors — execute design #9 (Aurora half)

Map-mode PropertiesPanel becomes a typed form driven by the archetype's param schema
(from `objects.json`, which gains `behaviors:{move,act,events}` + param declarations);
instance overrides via `set-object-props` command; behavior picker on library entries;
4 MCP tools; **retire `core/export/entity-data.ts`** (Python `behavior_gen.py` +
`ojz_entity_gen.py` become sole authority). Gated on the engine's sequencer + generator
landing (its plan's tasks 1–5).

### 4.8 The playtest loop — become Aether's first outbound client

Suite-designated priority (`SUITE_PLAN_AUDIT_2026-07-01.md` §3.1). Build one small
client module and three features on it:
- **Client**: `src/main/aether/client.ts` — connect to Oracle's socket
  (`$XDG_RUNTIME_DIR/oracle.sock`, NDJSON JSON-RPC 2.0, `initialize` handshake per
  `empyrean/contract/protocol.md`), event subscription, **symbol resolution only**
  (`emulator/lookup_symbol` — never hardcode addresses; they provably drift +$24
  between builds). Status-bar `Aether ◇ connected` indicator (the design contract's
  chrome convention). Consider making it the seed of
  `empyrean/clients/typescript/` so the suite gets its shared TS lib.
- **A1 — live palette→CRAM** (tiny): palette slider drag → `emulator/write_cram`;
  the running game recolors next frame. The suite's designated "one product" demo.
- **A3 — Build & Run** (medium): invoke `aeon/build.sh` (child_process now;
  `build/invoke` when Crucible joins the bus), then `emulator/load_symbols` +
  `emulator/reload_rom` on success; surface build errors in a toast/panel.
- **A2 — play-from-cursor** (small, the crown jewel): keypress warps the running
  game to the map cursor — resolve `Player_1`/`Camera_X`/`Camera_Y` by symbol, write
  positions, let section streaming re-run. Within-act only until the engine grows
  parameterized boot (engine #5 delivers `Game_Entry`, which eventually unlocks
  cross-act).
This phase also builds exactly the plumbing design #8's live preview needs
(`write_memory`/`reload_rom`), which is why it precedes P5.

### 4.9 Import pipeline ★ (new proposal — not previously specced)

Most real art starts life outside Aurora. Add:
- **PNG import** to tile/chunk/sprite-frame documents: nearest-palette-line
  quantization with error reporting (which pixels exceeded the line), optional
  auto-palette suggestion (median-cut to 15 colors + transparent), flip-aware dedup
  into the tileset on accept. Import targets both level art and sprite frames.
- **Sprite-sheet slicing** (grid or auto-bounds) → frames.
- Defer Aseprite native format; PNG covers the pipeline. Defer shadow/highlight
  authoring until an accuracy study (sample ground truth via Oracle per the vision
  doc's research note).

### 4.10 Multi-game levels

> **Substrate landed early (§2.5, 2026-08-09).** The disasm-as-project work built
> and battle-tested the neutral hierarchical `LevelDoc`, the S1 classic codecs
> (Phase D), and the engine-agnostic `ProjectAdapter`/registry against real S1 data,
> and proved **edit-in-place** (superseding this design's original import-only
> assumption for donor disasms). P8 now inherits that layer; the remaining P8 work is
> the *cross-game* adapters (S2/S3K ⇄ each other ⇄ aeon, both directions), collision
> best-match into the shared shape set, object mapping tables, and world assembly.

**Fully designed** — see `specs/2026-07-03-multi-game-level-interop-design.md`:
hub-and-spoke `LevelDoc` neutral model, per-game adapters driven by SonLVL INI
manifests (SonLVL's API source in `programs/SonLVL/SonLVLAPI/` is the definitive
format reference), collision best-match into the S&K shape set (which IS aeon's
vocabulary — S3K maps ~1:1), object placements via editable mapping tables with
marker entities for the unmapped, both directions (donor→aeon AND aeon→classic, plus
cross-classic through the hub), and **world assembly**: import multiple levels — any
mix of games — into one aeon act placed adjacent in the section grid, flowing
continuously in-game via per-section palette/BG/parallax/music. Phased A–E; Phase A
(S2→aeon end-to-end + into-act placement + chunk-borrow mode) is unblocked today.
Sequenced late only because earlier phases raise its value — pull it forward freely
if it's the motivating feature.

### Cross-cutting (all phases)

- **Design tokens**: consume `empyrean/design/tokens.json` (emit CSS custom props via
  `gen:theme`), accent `#34D399`, window title `Aurora — <context>`, command palette
  Ctrl/Cmd-K. Most exists from polish Plan A — close the gaps as the modes multiply.
- **Trust model**: keep loopback-only + Origin/Host checks on every HTTP surface.
- **MCP parity rule**: every new authoring capability ships with its MCP tools in the
  same phase (the ~17 new tools across #6–#9), one undo step per mutation, so agent
  and human editing stay equivalent.
- **New-mode pattern**: every new AppMode follows the established recipe — Zod format
  module in `core/formats/`, store on the shared undo history, viewport component,
  dock, `EDITOR_METHODS` descriptors. Designs #7/#8 name this explicitly.
- **project.json growth**: as screens/parallax/raster/behavior documents appear,
  extend `s4-config.ts` (paths, per-game manifest awareness from engine #5) with Zod
  validation and sane defaults, keeping paths relative to the engine repo root.

## 5. Recommended sequencing

Two things invalidated the original table: §2.5 and §2.6 delivered ~700 commits it never
recorded, and the steering moved to the **classic spine**. Re-sequenced 2026-08-19 around
what is actually being built. **P2 — the playtest loop — is next.**

### 5.1 Open now, in order

| # | Work | Size | Source |
|---|---|---|---|
| 1 | ~~The playtest loop (= P2, §4.8)~~ — **DELIVERED 2026-08-19, aeon-first.** Client core, live palette, play-from-cursor and Build & Run all ship, with the agent surface (`aether_status`, `aether_connect`, `push_palette`, `warp`, `build_and_run`). See §2.7. | M | sweep §7.2, `SUITE_PLAN_AUDIT_2026-07-01.md` §3.1 |
| 2 | ~~Retire the dead export path~~ — **DONE 2026-08-19**, see §4.2 | S | sweep §7.6 |
| 3 | ~~`docs/ART_SUITE.md` teaches a deleted UI~~ — **DONE 2026-08-19**, rewritten, not deleted. Measured section by section first: the mechanics core (presets, brush spaces, tools, flip keys, edit-in-place, save/dedup flows, palette editor, atlas note) was still true against source and is kept; the Toolbar navigation, the "separate classic surface" section and the shared-stack undo claim were false and are replaced with the facet-pill shell, the five classic facets, and per-document undo; paint-through, the origination canvas, resolve-and-commit and the 36-tool agent registry are now covered with spec pointers. | XS | sweep §7.5 |
| 4 | ~~Annotate the 2C spec header~~ — **DONE 2026-08-19.** Re-measured first: `CommitReport.warnings` is fed by exactly two pushes (shared-palette file, engine chunk $51), so none of D2b's three reaches is reported. Header now reads "BUILT — EXCEPT §D2b". | XS | sweep §7.3 |
| 5 | ~~Write three already-settled decisions into the art spec~~ — **DONE 2026-08-19.** All three verified against source, then written into §7 of `2026-08-15-in-app-art-authoring-design.md` (retitled *Settled decisions*) with citations: `ChunkTab.tsx:441`/`BlockTab.tsx:347`, `canvas-file.ts:36`, `use-canvas-constraints.ts` + `canvas-budget.test.ts`. | XS | sweep §7.4 |
| 6 | ~~`ChunkGrid`'s status hint needs 213px in a 157px slot~~ — **DONE 2026-08-19**, and the framing was wrong. Measured under CDP: classic loses 58px, but **aeon loses 158px** (a chunk-NAME badge plus the S/M/L control leave the hint 29px), so no rewrite could have fixed it. The hint now takes its own line. `scratchpad/chunkgrid-hint-harness.mjs`, 20/20, six rows proven red first. | XS | handoff §4 |

**Open (added 2026-08-22, from the effects-arc verification):**

| # | Work | Size | Source |
|---|---|---|---|
| 8 | **The 448-tile BG ceiling has no expression in Aurora.** `src/main/mcp/agent-handler.ts:51-52` still caps at `BG_TILES_HIGH = 32` / `BG_MAX_TILES = 512`, so the agent path cannot author a 64-row BG — the stage-4 design claimed this "Fixed here"; it was not. The 448 ceiling the BgAnim band invariants depend on is represented **nowhere** in this repo. Ruled 2026-08-22 with the aeon overseer as **NOT in effects wave-1 scope** (wave 1 needs a human authoring surface first; agent parity on bands is a distinct capability). Booked anyway: it is a real invariant with no local expression, and re-rule if agent-authored bands become how the first act's content gets produced. | S | `reviews/2026-08-22-aeon-effects-survey-verification.md` |
| 9 | **No aeon-viewport performance datum exists, and the OJZ showcase runs there.** `MapViewport.tsx` has **zero** `requestAnimationFrame` calls (vs. four in `ClassicLevelViewport.tsx`), and `viewStore.ts:52-56` scopes `playAnimatedArt`/`occludeSprites` to `s1` only — so the play-clock + overlay-pass machinery the effects arc was assumed to ride is **classic-only**. **MEASURED 2026-08-22** (`scratchpad/mapviewport-baseline-harness.mjs`, foreground; 21/23 rows): with the page provably still painting — **1602 rAF ticks against 0 MapViewport repaints** over 5.0s idle, probe still bound, React root alive — **the aeon viewport has no clock**; it repaints only on pan/zoom/overlay/state/edit. **Headroom is ample**: worst configuration (zoom 0.25) p95 **1.000ms = 6.0% of a 16.69ms frame**. **RE-RUN 2026-08-22 after the resolution fix: 37/37, harness landed (`253cb0e`).** The first run's confound was real — `performance.now()` is clamped to 0.1ms — and is now beaten by **amortised batching** (12 repaints per bracket, **0.0167ms effective resolution, 6× finer than the tick**), verified by two self-checks that MEASURE the claim: c1 reads the actual quantum, c2 pushes known 1:2:4 sub-tick workloads through the same machinery and recovers **2.00 / 4.00**. Cross-cell comparison is now valid. Amortised per-repaint medians: zoom 4 **0.0250ms**, zoom 2 / zoom 1 **0.0333ms**, Tile Grid ON **0.0833ms**, zoom 0.25 **0.7167ms ±0.0225** — spread 96.5%, gap 41.5× the resolution. **The arc-relevant number: one extra full-viewport line pass (Tile Grid) costs ~+0.050ms**, the only per-pass evidence available until an effects prototype exists (a 224-line pass is a different shape of work). An unclamped CDP `Performance.getMetrics` cross-check corroborates the ORDERING (0.82ms vs 0.13ms script/repaint for the same two cells) and is reported, never asserted. The fix also repaired a real tripwire bug: `(hi-lo)/lo` fell through its zero branch and announced "0.00% spread" about a set running 0.000→0.800ms. ⚠ **Caveat that must still travel with these numbers:** The bracket excludes React commit, compositor and GPU upload, so these are an **upper** bound on available headroom. **What it does NOT settle:** whether a loop must be ADDED is undecidable from this — nothing in the viewport animates, so "needs none" and "needs one that doesn't exist" predict the identical zero. **RULED 2026-08-22 — `reviews/2026-08-22-preview-posture-ruling.md`** (the measurement licensed only the affordability half; the design half is now closed). The fork was drawn wrongly: **BgAnim bands are not uniformly time-driven.** `aeon/engine/level/bg_anim.emp` gives three drivers — `camera_x` (0), `camera_y` (1), `timer` (2, `Logic_Tick`) — and `camera_x` is the schema default, so **two of three are functions of camera position, not time**. Ruled shape is therefore a fourth option nobody named: **driver-faithful preview** — camera bands ride the existing pan repaints *clocklessly* (`MapViewport.tsx:574` already carries `vpX, vpY` in its draw-effect deps), and **only `timer` bands get a clock**, because `rate_shift` is the one parameter judgeable solely in motion. A wall-clock preview of a camera band would teach the wrong driver model, which "labeled-approximate" does not license. **Ordering: concurrent, not a prerequisite** — the wave-1 design §5's "wave-1 prerequisite" is overdrawn and corrected; no band editor/writer work reads a clock, so the clock is its own parcel with one intra-wave edge (land no later than the band-preview parcel). **Shape:** classic's pattern copied locally — `playAnimatedArt` promoted into `OVERLAY_KEYS_BY_ENGINE.aeon`, **off by default**, `ClassicLevelViewport.tsx:401-431`'s early-return + `t0`-deterministic + step-keyed repaint (~15/s at `rate_shift` 2, not 60); the zero-repaint idle property is **conditioned, not spent**. No shared clock service — §5's "shared play-clock" is aspirational; classic's is component-local. **Overseer's addition (§4 of the ruling): the coordinate derivation is the real correctness risk** — `vpX`/`vpY` are an editor pan, `Camera_X`/`Camera_Y` are engine world px; the band-preview parcel must DERIVE the mapping and test it, or the preview is confidently wrong about phase and rate. **Palette-cycling cost is UNMEASURED** (the stamp stays under `SectionRenderer.ts:13`'s `RECOMPOSE_DIRTY_THRESHOLD = 2000` and takes the per-cell flush path; a palette change takes full-recompose) — booked with aeon as a **wave-2 prerequisite**. | S–M | same |

| 10 | ~~**`resolvePlaneWords` returns a short `edit` array as-is, ignoring its own `length` argument**~~ — **DONE 2026-08-22**, branch `fix/resolve-plane-words-length`. Re-measured first, and the booking under-described it in two ways. (a) The consumers do **not** iterate to `length`: `OverlayRenderer.drawCollisionOverlay` indexes `(cr*2)*SECTION_TILES_WIDE + cc*2` and `MapViewport`'s hover readout indexes `cellRow*SECTION_TILES_WIDE + cellCol`, so the real bound is the **section geometry**, not any array's `.length` — and both call sites were *deriving* `len` from array lengths (`OverlayRenderer.ts:59-61` from plane **A**, then reusing it for plane **B**; `MapViewport.tsx:1546`), which is the drift vector, not just the missing pad. (b) The consequence is not a crash: `undefined & 0x3FF === 0`, so a missing region renders as **air, silently**, while the A/B diff reads `undefined !== word` as "these planes disagree" and outlines every one of those cells. **Fix:** exported `SECTION_PLANE_WORDS` (the same `SECTION_TILES_WIDE * SECTION_TILES_HIGH` expression the consumers index with, so bound and buffer cannot drift); `resolvePlaneWords` now pads a short `edit` to `length` with `AIR_CELL` (its own documented absent-plane fill) and reports every mismatch once via `[COLLISION_PLANE_LENGTH]` on `console.error` — it does **not** throw, deliberately: `render()` draws all sections' grids/rings/objects in one call and the hover readout runs inside a mousemove handler, so a throw would destroy far more than the bad plane. Refusing bad input stays the LOADER's job (`6fc7359`); this is the last line, not the gate. Call sites re-pointed to `SECTION_PLANE_WORDS`: `OverlayRenderer.ts`, `MapViewport.tsx`, and `CollisionPalette.tsx`'s `resetToEngine` (which sized `engineWords` from `engine.length` and would have pushed `newColl: undefined` into an undoable command). **Verified:** `test/collision/collision-cell-resolve.test.ts`, +8 tests, suite **3919 passed / 3 skipped / 0 failed** (was 3911/3, `npm test` → `vitest run`); six proven red on the unfixed body, and the index-space derivation additionally proven by a planted violation (`SECTION_PLANE_WORDS` halved → *"expected 65278 to be less than 32768"*). **STILL OPEN — foreground CDP pass:** the node suite drives `OverlayRenderer` through a recording 2D-context stand-in, so it proves the draw **calls**, not the pixels; and `MapViewport`'s hover readout is React and unreachable from node, so *"a cell past a short plane reports its real shape instead of `air`"* is asserted **nowhere**. **Overseer's landing check (2026-08-22), which narrows that residual to near-nothing:** the change is **behaviour-preserving on every well-formed path**. The old bound's three fallbacks all already evaluated to 65536 — `collisionEdit?.length`, `engineCollision?.length` (the loader allocates exactly `SECTION_TILES_WIDE * SECTION_TILES_HIGH`, `load.ts:258-259`) and `tileGrid.nametable.length` (same geometry) — so the fix replaces three fragile routes to the right number with one derived route to it, and changes behaviour **only** on the malformed path. No allocation change, no live-behaviour risk; the earlier worry that a baseline-less section would start allocating 128KB per repaint is refuted by that third fallback. **And the residual CDP proof has a structural obstacle worth naming rather than chasing:** exercising this end-to-end requires a short plane to reach the renderer, but the loader guard (`6fc7359`) now refuses one at load — so the harness would have to deliberately defeat the guard that makes the path unreachable. Ruled: leave the residual booked, do **not** build that harness; revisit only if a producer outside the loader path ever writes a plane. | S | collattr fix parcel, 2026-08-22 |

| 11 | ~~**Re-point the `parallaxRef` reader to the effects contract**~~ — schema §4's carry (`parallaxRef` → scene id). **GATED on aeon landing its `project.json` edit first**: at aeon `00607dd5`, the act entry still read `"parallax": ".../ojz_default.asm"`, so re-pointing now would target a key that does not exist. aeon has booked that edit as a wave-1 lane item and an explicit prerequisite (aeon `5d0be056`; empyrean half LANDED at `b0d5b00`). **Contract re-pin due:** the sceneRef parcel pinned empyrean `1326ceb`; the schema doc has since moved to `2f3b6fd` (six→thirteen ref-site relabel + the §4 ordering fix). Verified firsthand that `contract/schema/aurora-effects-scene.schema.json` is **byte-unchanged** across that range and the normative `sceneRef` lines only shifted line numbers — so nothing landed is invalidated — but **re-pin the writer-side golden against `2f3b6fd` when the next parcel is cut** (schema §8). ~~re-pin against `2f3b6fd`~~ — **DONE differently, and better, in item 12**: the schema-codec parcel pins the schema JSON's **git blob hash** (`2d7a9fee37d85334103ca1a3e03e1a40466d6d9c`), which is stable across `1326ceb → 2f3b6fd → 069cf59 → c2c81e2` and cannot be invalidated by a doc-only commit. Cite the blob, not a commit, for anything that depends on the wire shape. **UNGATED 2026-08-22 — aeon landed it. Code anchor `98100905`** (class-checked: a merge, `project.json | 2 +-` = the one line, plus three doc syncs; the narrower edit commit is `7bff8488`). aeon's act entry now reads `"sceneRef": null` — explicit null, not an absent key. aeon verified on the merged tree from a clean checkout, all four build shapes byte-matching their pins, and their reader enumeration came back **DEAD** (four read-only Python readers, all naming fields explicitly, no generic iteration; a full `regenerate-level.sh` re-baked byte-identical, which a consumer of the key could not have done).

**DELIVERED 2026-08-22**, branch `fix/act-scene-ref-repoint` (`83bb635` the dead-field deletion, `91afb64` the re-point). `Act.parallaxRef` → **`Act.sceneRef`**, populated from the act entry's `sceneRef` with `?? null` so **null and ABSENT collapse before the model sees them** (§4 gives them one meaning, and absent is the real case for any `project.json` predating aeon's edit — which is also why `S4ActConfig.sceneRef` is declared OPTIONAL where `parallax` was required). Renamed, not re-valued, for the contract's two reasons: no reader can mistake a scene id for a path, and act-level and section-level assignment now share one name and one semantics. The typed lie is closed — the reader was reading a key aeon had deleted, so the field held `undefined` against a `string | null`.

**⚠ NO LINE NUMBERS IN THIS ROW, DELIBERATELY — anchor to the symbol.** The previous revision of this row *corrected* a stale cite by supplying a fresh one, and **the correction went stale inside a single day**: the line it warned about (`s4-types.ts:227`) was `export interface Tileset` when the warning was written and `export interface Palette` by that evening's master — wrong as **two different types in one day** — and a peer overseer re-cited it that afternoon inside an otherwise carefully SHA-pinned message, so the pin certified a coordinate the pinned revision itself refutes. A correction that carries a line number inherits the defect it was correcting. Cite the **symbol** (`Act.sceneRef`, `loadAeonProject`, `buildAeonSavePlan`); let a SHA date the **claim**, never the coordinate. *A path has a time — and so does a line number, but a symbol does not.*

**§(b) — the save-path claim: PROVED, and it was already half-tested.** `buildAeonSavePlan` re-serialises `LoadedS4Config.raw`, the raw parsed document, and only when a pointer retarget actually changed something — so `sceneRef` round-trips untouched and no `parallax` key returns. The pre-existing gate is `test/config/editor-dest-fields.test.ts`, *"carries unmodelled keys through at top, zone and act level"*: `expect(out.zones[0].acts[0].unknownActKey).toEqual([1, 2, 3])`. That covers **unmodelled** keys; `sceneRef` is now modelled-on-read and still never written, which nothing pinned. **+7 tests** in the same file: the reader's three cases plus *"a pre-change project.json (parallax, no sceneRef) gives that same null"* (which fails with a **path** in the message if anything is re-wired to the old key), and on the save side sceneRef-survives / no-parallax-returns, explicit-null-stays-a-PRESENT-key, and the general form — **every act key the save does not own comes back unchanged, derived from the input object rather than a copied literal**. Three planted defects proved them red; the hand-enumerated-save plant failed **6** tests, the three new ones plus three pre-existing baseline/verbatim ones.

**§(c) — the dead `Section.parallaxRef`: DELETED** (`83bb635`). Enumerated **by symbol**, over every constructor/copier/serialiser of a `Section`, not by grepping the field's own name: `createSection` (wrote null) and `cloneSection` (copied it) were the only writers, `cloneSection` the only reader — reading it solely to hand it back to itself. `loadAeonProject` never assigned it; `buildAeonSavePlan`'s meta-sidecar literal enumerates exactly `bgLayoutRef`/`paletteRef`/`sceneRef`; the `SectionMeta` codec has three keys and this is not one; `resizeGrid`/`moveSection` copy with `{ ...sec }` **spreads** (field-agnostic, not enumeration sites at all); `pasteSection` and `SectionGridNav`'s clipboard delegate to `cloneSection`; the history commands assign `sceneRef`/`bgLayoutRef` and `set-sections` stores arrays by reference; `EffectsScenePanel`, `effects-aeon`, `properties-aeon`, `agent-handler` and `debug-hooks` all read `sceneRef`/`bgLayoutRef` and none reads this. It was **not inert clutter but an active trap** — the effects survey wired ruling Q4 to it by mistake, because a per-section `parallaxRef` is exactly what a per-section scene assignment would be named, and the contract had to grow a correction saying "not that one". **What replaced it is the point:** `cloneSection`'s ref coverage was three hand-written lists, which can only catch a drop someone remembered to add a line for. A fourth test now derives the expectation from the source section's own key set. Proven by planting a new `weatherRef` on `Section` that `cloneSection` does not copy: **all three hand-list tests stayed GREEN and only the new one failed.**

**Cross-repo consequence — TAG for the controller.** empyrean's `AURORA_EFFECTS_SCHEMA.md` §4 warns readers away from `Section.parallaxRef` *by name and by line*. That field no longer exists, so the warning is now moot rather than wrong, and both of §4's coordinates into this repo are dead. Worth a ping when the next contract edit is cut; nothing is broken by leaving it.

**Fossil, re-checked at delivery and still dead:** an *untracked* aeon `games/sonic4/data/editor/ojz/act1/export/act_descriptor.asm` carries `dc.l games/sonic4/data/parallax/ojz_default.asm ; act_parallax_config`. Untracked, dated before the export step was retired (§4.2), syntactically invalid as 68000 asm (a bare path as a `dc.l` operand could never assemble), and **`grep -rn act_parallax_config src/` still returns nothing** — confirmed 2026-08-22. Left alone. **But if the export path ever grows an `act_parallax_config` emitter it needs this same re-point** — a site a search for `parallaxRef` would never surface.

**Verified:** suite **4040 passed / 3 skipped / 0 failed** (4032 on master; +8), `npx tsc --noEmit` clean — noting that `tsconfig.json` includes only `src/**/*`, so `test/` fixtures are NOT typechecked and tsc alone is not a completeness proof for anything under `test/`. **Explicitly still open, and out of scope here:** no UI assigns an act-level scene and no consumer of `Act.sceneRef` exists — the field is read from disk, held, and written back unchanged. | S | effects arc wave 1 |

| 12 | ~~**Wave-1 surface 1 — the scene-definition codec**~~ — **DELIVERED**, branch `feat/effects-scene-codec`. Reader/writer/library-load/golden for `games/sonic4/data/editor/effects/<scene_id>.json` in `src/core/formats/effects/` (schema §2/§6/§8; aeon consumer contract §2.1/§2.3 at `00607dd5`). No UI — this parcel is core/format only. **Pin:** the contract schema is vendored byte-identical and held to blob `2d7a9fee37d85334103ca1a3e03e1a40466d6d9c` by `test/formats/effects-schema-drift.test.ts`; the doc half read at `069cf59` (§2 unchanged since `0ea8734`). **Not ajv:** Aurora's core runs in the renderer under `script-src 'self'` (`src/renderer/index.html:6`) and ajv compiles schemas with `new Function`; the subset evaluator refuses any keyword it does not implement, and a coverage gate walks the committed schema to prove the implemented set covers it. **Design:** the codec never enumerates fields — parse hands back the parsed document untouched, serialize reorders keys from the schema's own `properties` order and refuses to drop anything — so §6 hazard 1 is answered structurally rather than by a fourth hostile comment. **Rulings made here:** `layer_mask_raw`/`v_deform_shift_raw` are REJECTED on read (closed schema + consumer's NOT-read list; refusing at read is the loud half of "round-trip what you do not understand, or refuse the file"), and the `deform.own` two-sources guard is **not** enforced — §2.2 assigns it to sigil, so it ships as `advisoryLayerDeformConflicts`, a pure function nothing in the read or write path calls. **Still open:** ~~surface 3 (`project.json` act-level `sceneRef`) is item 11 and stays aeon-gated~~ — surface 3 **DELIVERED 2026-08-22**, see item 11 (reader re-pointed, save proven to round-trip it, no act-level UI); surface 4 (BgAnim `anims`) is a separate parcel; no caller wires `loadEffectsSceneLibrary` into the aeon project load yet — that arrives with the UI parcel. Surface 2 (`sceneRef` in the meta sidecar) landed earlier at master `61d4b80`. **Overseer's landing verification (2026-08-22):** merged and re-verified on the MERGED tree, not branch-side — **3959 passed / 3 skipped / 0 failed**, `tsc` clean (exactly `3919 + 40`, so this parcel and item 10 compose without interference). Three claims checked independently rather than accepted: (a) the `unevaluatedProperties` → `additionalProperties` equivalence is **exact** — all **19** occurrences in the committed file sit beside `{type, properties, required}` with **zero** in-place applicators (`allOf`/`anyOf`/`if`/`dependentSchemas`/`not` counts are all 0; the 12 `$ref`s and 8 `oneOf`s all sit under `properties`, which is not in-place), and the evaluator re-asserts the precondition per node; (b) the CSP blocker is real and decisive — `renderer/index.html:6` is `script-src 'self'` with no `unsafe-eval`, so an ajv validator would have passed every node test and thrown in the running app; (c) `oneOf` is implemented with correct **exactly-one** semantics including the >1 branch, which is the failure mode a hand-rolled evaluator would most plausibly get wrong. **Cross-repo reconciliation, verified at landing:** empyrean's committed `contract/schema/aurora-effects-scene.schema.json`, Aurora's vendored copy and the hash pinned in the drift test are all `2d7a9fee…` and the two files are **byte-identical** on disk. ⚠ **This reconciliation is an OVERSEER RITUAL, not a gate** — the drift test proves only that *our copy is the blob we pinned*; nothing inside this repo can notice empyrean changing the schema, and that is deliberate (a sibling-repo path probe is wrong from a worktree, wrong from a lone clone, and absent from a packaged build, and would degrade to "not found → skip validation"). **Re-run the three-way compare by hand whenever a wave parcel is cut**; last reconciled 2026-08-22 against empyrean `8e55475` — schema JSON **byte-identical, blob `2d7a9fee…`, pin holds**. Note that `8e55475` changed the schema *doc* (§5.1/§5.2/§6) without touching the schema *file*, and the empyrean overseer said so explicitly **because silence from that side is not evidence either way** — this repo's drift test structurally cannot observe theirs. That is the ritual working as designed. **RATIFIED by the contract owner 2026-08-22** (empyrean overseer): both rulings above confirmed as *what the contract requires, not merely permits* — rejecting the raw fields on read is mandated by the closed schema plus §2.1's exclusion (a carrying file fails validation outright), and the unenforced two-sources guard is the normativity split as designed, with the advisory-nothing-calls-it shape called a textbook implementation of it. **Do not re-litigate either without new evidence.** The reconciliation gap is closed from their side too: empyrean `152a30c` (docs-only, 9 lines to their `OVERSEER.md`, class-checked here) makes pinging the Aurora lane a **standing obligation** on any change to the schema file, recording both our blob pin and the no-in-place-applicators precondition so an amendment introducing `allOf`/`$ref` gets coordinated rather than silently breaking the `additionalProperties` equivalence. §8's re-pin remains the deliberate step; that commit names who pulls the trigger. | M | effects arc wave 1 |

| 13 | ~~**Wave-1 scene AUTHORING UI + caller wiring + agent parity**~~ — **DELIVERED 2026-08-22**, branch `feat/effects-scene-ui` (`d017b8f` model+load+save, `5184668` scene-ui+undo command, `17b34e6` the facet, `4977f61` agent parity, `640277a` harness). The codec (item 12) had no caller and no UI; an author can now create, edit, assign and persist a scene. **What shipped:** (a) `S4Project.effectsScenes` + `AeonProjectData.scenes` — the SAME object, aliased not copied, pinned with `toBe`; required rather than optional because the tree has exactly one S4Project constructor and an optional field would let a second one omit it, which reads downstream as "no scenes" and writes nothing. (b) `loadAeonProject` calls `loadEffectsSceneLibrary`; `buildAeonSavePlan` writes one canonicalised JSON per scene. (c) A new **Effects facet** on the `parallax` capability (which already existed in `FACET_CAPABILITIES`, declared ahead exactly for this), order 15 — `mapFacet`, so the act stays in view; tools `['view']`, plane-gated like `palette`. Factor pickers, precision/transition, layer list with `world_y`/`fa`/`fb`, add/remove layer, and the per-section `sceneRef` assignment. (d) `set-section-scene` is its OWN command, not a field on `set-section-bg`: folding them would make changing a background undo a scene assignment made three steps earlier. (e) Agent parity as REGISTRY work — four `EDITOR_METHODS` entries (`list_effects_scenes`, `get_effects_scene`, `set_effects_scene`, `assign_section_scene`), kinds, handler cases; `docs/MCP.md` updated. (f) `set-effects-scene` is ONE command for create/edit/delete, a whole-document swap, so the one-undo-step bar holds by construction however many controls a gesture touched. (g) `scratchpad/effects-scene-harness.mjs`, **RUN: 26/26** under xvfb-run against the real aeon tree. **Design decisions worth not re-litigating:** the wire and the undo command both carry WHOLE DOCUMENTS, never field patches — a patch API needs the field enumeration `core/formats/effects` is built around not having, and `cloneEffectsScene` is `structuredClone` for the same reason. `scene-ui.ts` derives every UI constraint from the vendored schema and its `at()` THROWS naming the path, because a quiet `undefined` renders as an empty dropdown that looks exactly like a panel still loading. `WAVE1_PRECISION_VALUES` is the schema's list with `"line"` filtered out, not a `['cell']` literal — and it is a UI policy, not a validation rule: a document carrying `"line"` still loads, round-trips and saves. **A guard that asserted nothing, caught and fixed:** the save path's first unreadable-file rule was a by-path SKIP, which can never fire — an unparsable file yields no id, so nothing on a load→save aims at its path. The reachable collision is a scene AUTHORED under the broken file's stem (easy, because that scene is invisible in every list), and a skip there would lose the author's work AND leave the file. It now THROWS naming the file; the UI and the agent refuse the id earlier. **Measured, not assumed:** 0 map repaints over 3.0s idle on the Effects facet against 962 rAF ticks — item 9's zero-idle property survives wave 1, as `reviews/2026-08-22-preview-posture-ruling.md` requires; planting an rAF loop in the panel takes that row to 1786 repaints. **Verification:** node suite **4032 passed / 3 skipped / 0 failed**, `tsc` clean; 11 red-first proofs across core, provider, agent and harness, each planted and restored. **Still open, deliberately:** no PREVIEW of scene output (its own parcel); the BgAnim `anims` writer (surface 4); item 11's act-level `sceneRef` (aeon-gated). **Two gaps found while building, NOT closed here:** a scene DELETED in the editor leaves its file on disk (the save plan has no delete channel at all — `bgLibrary` has the same hole), and nothing authored here reaches a ROM, because aeon's `tools/effects_gen.py` still does not exist. | M–L | effects arc wave 1 |

| 14 | **`editor_bg_override.json` has two writers and one of them destroys the other's work — PARKED FOR THE OWNER, and it blocks the BgAnim road.** Found 2026-08-22 while weighing BgAnim bands (arc surface 4) as the next cut. `aeon/tools/png_to_bg_override.py` is a **whole-file overwrite that never reads the file**: `out = {"layout": …, "tiles": …}` is a fresh dict at `:175` (plus `palette`/`palette_line` conditionally), then `open(OVERRIDE, "w")` + `json.dump` at `:179-180` — and the token `OVERRIDE` appears **exactly twice in the entire file**, the path constant at `:44` and that write. Verified by reading around the cited lines, not by trusting them (bar 17). **So the moment Aurora writes `anims`, the next `png_to_bg_override.py` run silently deletes it** — no merge, no warning — and `anims` is the expensive key (`phases` = 8 banks × `cols*rows` tiles × 64 pixel values). An author could lose a hand-authored band set to a routine BG re-import and only discover it when the bands stopped reaching the ROM. **Same defect class as bar 12's silent ref erasure**, which is why the ownership question is downstream of this rather than the reverse. This is the per-key-ownership fork that was named as a design obligation when the arc was greenlit, deliberately left unanswered, with **last-writer-wins explicitly rejected**; both overseers have refused to settle it unilaterally. Decision agent dispatched with the mechanism as grounding. **RULED 2026-08-22 — `reviews/2026-08-22-bg-override-ownership-ruling.md`; the fork is CLOSED and this row's own sequencing call is REVERSED.** Three findings overturned the framing, all re-verified firsthand: (i) **the collision already fired.** `anims` existed at aeon `b76576ea`/`b0e5a661` and is gone at `dd93a840` (2026-07-21) — the commit that introduced `png_to_bg_override.py` — destroying two authored bands (192 animated slots of 340 tiles); `bg_anim.emp` has read `BgAnim_Table: u16 = 0 (disabled)` for **one month** and nobody noticed, because the `--stat` shows one line on minified JSON. *No act authors bands BECAUSE the collision fired* — the prior premise inverted cause and effect. (ii) **Three writers, not two** — `forest_bg_gen.py:420-431` dumps the same path with `anims` and no read, destroying `palette` in the other direction; bar 12 again, the enumeration counted format-definers and missed a data-toucher. (iii) **`anims`/`tiles`/`layout` are not separable** — bands pack from slot 0 and `tiles[0:n] == phases[0]` (measured True for both bands), so animated slots are a **prefix** of `tiles` and adding/removing a band renumbers the whole blob. **Ruled:** ownership is **per-document, not per-key**; Aurora is sole writer of record; `png_to_bg_override.py` is reclassified writer→**importer/seeder** that refuses loudly on keys it does not produce, gains `--out`, and asserts retained `palette` against `GEN_PALETTE`; `forest_bg_gen.py` gets the same refusal or is deleted (art judgement → owner). **The overseer's "refusal is a floor that becomes merge in one edit" was WRONG** — a merge would pass every consumer assert and ship silent visual corruption, strictly worse than the deletion it replaces. And the fork was **already answered in schema §6 hazard 1** (refuse-or-round-trip binds *every* wave-1 writer, aeon's included); three sessions failed to cite it. **SEQUENCING REVERSED — BgAnim is unblocked and cuttable now**, since nothing Aurora writes is wrong absent the aeon fix; exposure is to a third party running an aeon tool afterward. **Hard gate:** the refusal must be on aeon master *before the first commit carrying a non-empty `anims` lands there*. **DISCHARGED 2026-08-22 — aeon `bd31e133`**, `--stat`-verified here as a genuine code merge (727 insertions): a shared `tools/bg_override_io.py`, BOTH writers converted (`png_to_bg_override.py` gains `--out`, `forest_bg_gen.py` keeps `BG_OUT`), `inject_editor_bg.py`, a 295-line `tools/test_bg_override_no_clobber.py`, and TOOL-01 in `docs/BUGS.md`. **BgAnim (wave-1 surface 4) is UNBLOCKED.**

⚠ **The gate's own vacuity, raised by the empyrean overseer and RETIRED here rather than at first-band time.** Their caveat was accurate: the shipped `editor_bg_override.json` carries only `layout`+`tiles` (verified — `anims` absent, `bg_anim.emp` still `BgAnim_Table: u16 = 0`), so every refusal check runs against *fixtures*, and the first band Aurora authors would have been the first time the gate fired on live data. That is a real "first green is newly meaningful" exposure, and it does not need to wait for a band editor to exist. `scratchpad/bg-override-live-shape-refusal-probe.py` closes it now: it copies **today's shipped file** (448 tiles, 4096 layout entries — not the 340-tile `b0e5a661` fixture), adds one real band at `b0e5a661`'s band-0 geometry (`32×4, camera_x, rate_shift 2, slot_base 0`, 8 phases), and runs the tool through the acceptance suite's own `tool.OVERRIDE` monkeypatch. **Result: refusal fires, names `anims` in its exit message, and leaves the file byte-intact** — and the *paired control*, the same live file with no `anims`, is **accepted (exit 0)**, so the refusal is attributable to the key and not to the tool disliking the shipped shape. The aeon tree is byte-identical afterwards (asserted, not assumed). What this does NOT retire: the composition with Aurora's own writer output, which cannot be tested until surface 4 exists — a first-band green is still newly meaningful about *Aurora's* bytes, just no longer about the gate. Superseded call below, kept for the record: ~~**BgAnim is NOT the next cut.**~~ aeon's overseer is right that it is the shorter road on the engine side — its consumer `inject_editor_bg.py` ships, unlike `effects_gen.py` — but it is the road that crosses this parked call, and the scene road does not. The fix, whatever shape it takes, is aeon's to land: Aurora builds in that tree but never lands there. Note it is genuinely arguable that "regenerate the BG from source art" *should* be authoritative over the whole file — in which case the answer is a **loud refusal** on unknown keys, not a silent clobber. **EXTENDED 2026-08-22 by the aeon overseer, verified firsthand here — it is worse, and it is ALREADY FIRING with no Aurora writer involved.** Read `:175-178` as a unit, not `:175` alone: `palette`/`palette_line` are written **conditionally** (`if stamp_palette:`), and `inject_editor_bg.py:206-215` **consumes them** (`if 'palette' in data:` → 16 CRAM words asserted → mapped to a line → stamped into `ojz_palette.bin`, whose own comment says the colours revert without it). So run the tool in EXTRACT+stamp mode, then again in lock mode to re-import art, and **the stamped BG palette is silently gone** — one tool forgetting its OWN key, across its own two documented modes, on a live consumer path, in a workflow those modes make natural. Confirmed the only `.read()` in the tool is `GEN_PALETTE` at `:75`. **This kills the "regenerate from source art should be authoritative over the whole file" defense** that was booked above as arguable: the tool is not authoritative over `palette`, it just forgets it, and authority you cannot exercise consistently across your own invocations is not authority — it is an unread file. Ruled a bug on the aeon side **independent of the ownership question**, and being fixed now with the line drawn deliberately: (i) the tool's OWN keys survive its own modes — uncontroversial, resolves nothing about ownership; (ii) unknown keys including `anims` get a **LOUD REFUSAL**, explicitly not read-merge-write, because *a tool that silently preserves unknown keys has in effect ruled the file shared and multi-writer-safe — one of the two answers to the fork, adopted by implementation rather than by decision.* Refusal takes neither side, converts silent destruction into a visible stop, and leaves both "shared file" and "split the files" equally cheap. **The refusal is the FLOOR, not a decision taken**; if the ruling comes back shared-ownership, refusal becomes merge in one edit. Decision agent re-dispatched (Fable limit hit) and sent this mechanism as a grounding correction. | S–M (aeon) | Aurora overseer, 2026-08-22 |

| 15 | ~~**Effects panel polish + a harness evidence gap**~~ — **DELIVERED 2026-08-22**, branch `fix/effects-panel-polish` (`5713f21` the two panel fixes, `ab72d58` the 13 new CDP rows, `6777ef5` this row). Harness **39/39** (was 26/26), node suite **unchanged at 4032 passed / 3 skipped**, `tsc` clean, and the aeon tree hashes identically before and after the run. **(a) FIXED — and derived, not eyeballed.** The shell had exactly ONE horizontal dock inset, the `T.s4` typed into `PanelHeader`'s padding, and nothing else could reach it — which is precisely why a panel that renders its own body content had nothing to line up with. It is now `PANEL_INSET` in `ui/primitives`, `PanelHeader` reads it, and a new opt-in `SectionBody` applies it to a section's body; `EffectsScenePanel` wraps all four of its sections in one. Deliberately NOT folded into `CollapsibleSection`: `CollisionPalette`, `RingPatternPalette`, `ArtBrowser` and `PropertiesPanel` already pad themselves, so a section-applied inset would double up on every one of them. Red-first on master, all four flagged controls at rightInset 0: `new_scene_id L+0 R+45.2 | Name L+72 R+0 | V factor L+72 R+0 | Section select L+72 R+0 (header inset 8/8)`; green after at `L+8 R+8` on the three fields and `L+8` on the id input. The harness row reads the header's COMPUTED padding rather than a literal, so the two cannot drift apart. **(b) NOT OURS — ATTRIBUTED, AND THE CODE LEFT ALONE.** The red `soli…` badge is the generic object box `canvas/OverlayRenderer.drawObjects` draws for a placement with no sprite preview (fill `rgba(255,100,100,.7)`, stroke `#ff4444`, `obj.typeId` centred in 8px monospace, `canvas-colors.ts:80-82`), and aeon's `ojz/act1/section_0.objects.json` holds exactly one placement: `typeId: "solid"` at world (808,210). Measured on the map canvas's own pixels on the Effects facet AND on Layout: the SAME 16x16 cluster at canvas `[800,202,815,217]`, at the SAME screen x 1084..1100, on both. What differs is the canvas — **816px wide on Effects vs 876px on Layout, because the Effects dock is 300px and every other map facet's is 240px** — so clearance from the badge to the canvas's own right edge is **60px on Layout and 0px on Effects**. And the label is genuinely wider than its badge: `"solid"` measures **19.9998px in the app's own 2D context inside a 16px box**, so it overflows by ~2px each side at any window size. The Effects facet does not cause it and does not expose anything a pan would not; it merely has a narrower canvas, and this act's one object happens to sit at its edge. **⚠ BOOKING (not this parcel's):** `OverlayRenderer.drawObjects` draws `obj.typeId` untruncated and unclipped centred on a fixed 16px box — any typeId over ~4 characters spills, and any object near a viewport edge shows a half glyph. Reproduces on every map facet at every window size; needs a measured-and-elided label (or a box sized to its text). **(c) EVIDENCE PRODUCED — and it uncovered a real defect on the way.** The harness now drives the app into the expanded-layers-with-packed-spinners state at two layers AND at the schema maximum of eight, proves the section is genuinely expanded and the forms genuinely open before it shoots (rows 11a/11b/11d — a collapsed section photographs calm and asserts nothing, which is exactly what item 13's shots did), and captures both. **THE MEASURED DENSITY, reported and NOT judged:** a fully expanded layer card with both packed-factor forms open is **154px**. The Layers section's share of a 774px dock is **306px**, so **exactly two cards fit**; at 2/8 the stack is 308px (18px beyond the window), at 8/8 it is **1232px, 966px of it beyond**. Whether that is acceptable is the owner's call — this is the evidence for making it. **The defect found doing it, and FIXED here:** both of this panel's `variant="list"` sections declared the variant and never supplied the scroller the variant's own model requires (`ui/CollapsibleSection`: a list "takes an equal share … and scrolls inside it"), so with `overflow: visible` **954px of layer cards were painted straight over the SECTION ASSIGNMENT rows** — overlapping text, photographed on master, pre-existing and not introduced by (a). One style prop per list section. **⚠ BOOKING (why no node test caught it):** `panel-scrollers.test.ts` and `panel-headings.test.ts` derive their panel list by walking `<CollapsibleSection><Child` inside **facet modules**, and `effects-facet.tsx` mounts `<EffectsScenePanel />` straight under `<Panel>` — so **all four of this panel's titled sections, both list variants included, are invisible to both guards**. Any future panel that groups its own sections escapes the same way. The derivation in `components/__tests__/helpers/section-panels.ts` needs to walk sections declared inside panels, not only inside facets. | XS–S | overseer landing pass, item 13 |

| 16 | **`s1-io` zero-edit round-trip times out under CPU contention — a flaky gate, reported honestly rather than buried.** Found by the item-11 parcel, which saw a single `1 failed | 4039 passed` run that did not reproduce in 11 subsequent runs. Rather than shrug it off as noise it hunted the cause under **2× CPU oversubscription** and caught it: `src/core/level-classic/__tests__/s1-io.test.ts › s1-io (c) zero-edit round-trip (all 18 acts) › re-encodes every domain identically` — `Error: Test timed out in 5000ms`. **A wall-clock timeout, not an assertion failure**, on an 18-act ROM round trip. **Proven pre-existing, not introduced**: the parcel put master's content in the working tree and reproduced the identical timeout there, 2 of 3 starved runs, at master's own 4031/3 count; the branch touches nothing under `src/core/level-classic/`. Not reproduced independently by the overseer — recorded as the parcel's finding, and it is the *method* that earns the booking (reproduce-before-concluding on something it would have been cheaper to call noise). **Why it matters beyond tidiness:** a 5s budget on the repo's heaviest round trip means the suite's verdict depends on machine load, and this workspace routinely runs several agent worktrees at once — so a red run here is ambiguous between a real regression and a busy box, which is exactly the ambiguity that trains people to re-run until green. Fix is a raised/removed timeout on that test specifically, or splitting the 18 acts. | XS | item-11 parcel, 2026-08-22 |

**Open (added 2026-08-21, owner-named):**

| # | Work | Size | Source |
|---|---|---|---|
| 7 | ~~**Priority-aware object previews + occlusion ghost**~~ — **DONE 2026-08-21 (classic/S1)**, merge `feat/s1-priority-occlusion`: per-pixel compositor (map wins iff hi tile ∧ opaque ∧ low sprite piece; piece pri = attrs bit 15), violet-wash ghost at 0.4α riding the same "Sprite occlusion (game order)" toggle (default ON), MZ animated hi-pri cells re-patched per play-tick. Harness 30/30, and what it **guards** is `avg < 5ms` (`s1-priority-occlusion-harness.mjs:620`) — the 0.18ms figure once quoted here was a single observation, never an assertion, and is not a held property (corrected 2026-08-22) (found the owner's exact monitor, GHZ1 $26). **Still open: the aeon viewport half** — no priority-mask derivation exists there yet; re-book when aeon previews grow occlusion needs. Original booking:  In the map viewport, object previews composite above ALL map tiles; the VDP draws high-priority plane tiles in front of low-priority sprites (owner screenshot: an invincibility monitor rendered in front of GHZ tree leaves it should sit behind). Add a third compositing pass — high-priority map-tile pixels re-drawn above the object layer, honoring each sprite piece's own priority bit from its mappings — and a ghost affordance (occluded portion drawn translucent/outlined) so hidden objects stay discoverable and selectable. The priority lens (`337d2d3`) already derives the per-tile priority mask; reuse it. Applies to both engines' viewports where object previews exist. | S–M | owner, 2026-08-21 |

⚠ **Item 1 is the first phase that needs the emulator.** Background agents must never call
`mcp__oracle__*` — they deadlock. Runtime work goes in a CDP / foreground harness the
controller runs, exactly as the two collision harnesses do.

Deliberately **not** open: sweep finding U6 (argued at the site, left unchanged on purpose —
don't re-find it), and the sweep's three REFUTED findings (§6 of the review).

### 5.2 The phase table

| Phase | Work | Gate/dependency | Status |
|---|---|---|---|
| **P0** | Doc hygiene: apply PLAN_AUDIT (status banners, naming pass, README); annotate vision-doc entries superseded by design-week specs | none | **PARTLY DONE** — this revision closes the ROADMAP half; §5.1 items 3–5 are the rest |
| **P1** | Design #6 collision-in-chunks + retirements; in-viewport object/ring placement; section/act properties inspector; act/zone wizard; export realignment (retire vram-coloring path, budget → act-pool math) | none | **PARTLY DONE, and re-cut.** Classic collision authoring shipped (§2.6 C) — but that is *classic*, not aeon design #6; classic object place/move/delete shipped (§2.5); the export **retirement** is done (§4.2, 2026-08-19). Still open: **aeon** design #6, the section/act properties inspector, the act/zone wizard, and the budget readout's act-pool math (the retirement removed the old path; it did not build the new count) |
| **P2** | Aether outbound client + A1 palette→CRAM + A3 Build & Run + A2 warp | Oracle running (exists) | ✅ **DONE 2026-08-19** — see §2.7 |
| **P3** | Sprite export spine (decompose → mappings → DPLC) + animation authoring timeline w/ event tags + object-art previews in map | engine consumer + sigil `.emp` anim question are cross-fence | **RE-CUT 2026-08-20** (audit: `docs/reviews/2026-08-20-p3-plan-audit.md`) — the three 2026-06-17 plans were **executed in June** (154 sprite tests pass; a real `pitcher_plant/` export exists); their checkboxes were never ticked. Actually open: the animation *authoring* timeline (2026-07-03 spec: event tags, reorder, onion-skin) + agent parity; an **engine-side consumer** — nothing in aeon's build reads `data/sprites/`, so the spine ends at the editor's doorstep; and plan 3's premise collapsed and is now RULED (aeon `336c53ea`, 2026-08-20): Aurora emits NEITHER `.asm` nor `.emp` — the neutral export (json + bin) IS the contract, aeon's bake-step consumer (booked their side) owns flatten/dedup/`.emp` generation, and Aurora's golden pins json+bin bytes once aeon hands over the field list its consumer reads. The June `.asm` anim exporter is therefore pipeline-dead and retires when the neutral anim export replaces it. Previews exist on BOTH sides (aeon's `object-previews.ts` survived the re-home; bindings file empty), not classic-only |
| **P4** | Screen mode (design #7 Aurora half) | aeon #7 tasks 1–4 (interpreter + `screens_gen.py`) | open, engine-gated |
| **P5** | Raster mode + live preview (design #8 Aurora half) | aeon #8 tasks 1–4; P2's client | open, engine-gated |
| **P6** | Behaviors properties panel (design #9 Aurora half) + entity-exporter retirement; VRAM budget visualizer v2 | aeon #9 tasks 1–4 | open, engine-gated |
| **P7** | Import pipeline (PNG/sheet quantization) + craft backlog pulls | none | **PARTLY DONE** — the PNG import path shipped on 2C's resolver for classic (§2.6 B). **Core algorithms landed 2026-08-22** (`core/art/sheet-slice.ts`: grid + auto-bounds; `core/art/palette-suggest.ts`: median cut to 15 + transparent, cut in the Genesis 3-bit space): pure functions, 26 node tests, **no caller** — `ImportSheetDialog` still takes a whole sheet against a fixed act palette. Remaining: (a) UI + agent wiring for both, which only a CDP harness can prove; (b) **sprite-frame targets** — measured 2026-08-22, `CommitTarget` is `{ chunkFileIndex }` and nothing else, so a frame target is a commit-planner change, not an import one |
| **P8** | Multi-game level adapters (own design cycle) | none hard | substrate delivered by §2.5; remaining work is the cross-game adapters + world assembly (§4.10) |
| **UX 5–6** | The UX overhaul's own leftovers: typed cross-tab/cross-window clipboard, Converter tab, and the stage-6 polish pass | none | open (§2.6 A) |
| **§2.5** | ✅ **DONE** — Disassembly-as-Project: engine-agnostic `ProjectAdapter` + S1 in-place editing + guarded save + 12 MCP tools + aeon detection unified. Aeon adapter's `open()` performs the real load (`4782e86`, 2026-08-13) — the long-standing "routing marker" claim was stale and is corrected in §2.5; what remains deferred is the unpopulated aeon `report` and `AeonProjectData`'s missing scene/budget concepts. | delivered 2026-08-09 | done |
| **§2.6** | ✅ **DONE** — the August line: UX overhaul stages 1–4, art authoring 1/2A/2B/2C, classic collision authoring + the agent surface, the lens-sweep defect campaign. | delivered 2026-08-12 → 08-19 | done |

Rationale: P2 is the suite's keystone gap — Aurora already *serves* Aether and the outbound
half is what the 2026-07-01 suite audit named — and it builds exactly the plumbing design
#8's live preview needs, which is why it still precedes P5. The classic spine has overtaken
P1's aeon half, so P1's remainder should be re-cut against what facet parity already gave for
free rather than executed as written. P3 and P7 stay pure-Aurora work that can interleave any
time engine work stalls.

**Incoming arc (agreed 2026-08-22 with the aeon overseer): parallax/raster effects authoring view** — multi-band parallax + raster effects + BgAnim tile bands, Aurora-authored (the OJZ BG showcase direction). Sequence: aeon's read-only survey of this repo (pinned at `4cffe45`) → owner design review → aeon's S4LZ-slicing engine parcel → Aurora parcels cut HERE against aeon's committed briefs/contracts (SHAs to be pinged across). Lane split: Aurora's overseer dispatches and lands all Aurora parcels; aeon ships committed briefs; cross-tool contract material goes to empyrean. ~~Known load-bearing caveat handed to their survey: the aeon ProjectAdapter is still a routing marker (§2.5)~~ — **THAT CAVEAT WAS FALSE and Aurora is the source of the error** (corrected 2026-08-22). `open()` has performed the real load since `4782e86` (2026-08-13); `useProject.loadFromPath` no longer exists. The stale §2.5 text propagated into aeon's effects assessment and was refuted there — see `reviews/2026-08-22-aeon-effects-survey-verification.md`. The real gap is narrower: `AeonProjectData` names no scene, preset, band or budget, so that model must be **extended**; it is not a loader that must be built, and any estimate priced as such is wrong.

Watch items from the engine side: `section_id` byte→word (floating origin) — check Aurora's
section keying when it lands; engine/game split (#5) — `project.json` may gain a
game-manifest pointer (the split happened on 2026-07-07: `games/demo` now boots on the
agnostic engine); per-act ROM budget gate (#1) — surface its numbers in the budget UI when
the manifest exists.

## 6. Acceptance bar (per phase)

A phase is done when: tsc + vitest green with new coverage for every format codec;
every new mutation is one undo step and has an agent tool; formats are Zod-validated
with build-gate parity (what the generator rejects, Aurora flags at edit time); the
feature is GUI-verified by the user (Electron; no headless); relevant docs updated
(this file's phase table + MCP.md tool list); and — for generator-coupled work — a
golden test proving Aurora's writer and the Python reader agree byte-for-byte.

Two amendments from the August line (§2.6), both learned the hard way:

- **"an MCP tool" is the wrong phrasing** — one `EDITOR_METHODS` entry in
  `src/main/editor-methods.ts` serves **both** MCP and Aether, so the parity obligation is
  *registry* work: schema entry + `AgentRequest` kind (`src/shared/agent-protocol.ts`) +
  a case in `src/renderer/agent/agent-handler.ts`. There is no MCP-specific half.
- **vitest cannot see React or canvas.** Anything whose behaviour is a rendered surface, a
  mouse gesture or a live store round-trip needs a CDP harness driving the real app
  (`scratchpad/*-harness.mjs` — the collision pair are the reference), run in the
  foreground by the controller. Background agents must never call `mcp__oracle__*`; they
  deadlock. And **plant a violation before believing any guard**: a guard that asserts
  nothing is the dominant defect class here, and a defect planted in the wrong function —
  there are usually two near-identical dispatch lines — passes a full build-and-run cycle
  looking convincing.
