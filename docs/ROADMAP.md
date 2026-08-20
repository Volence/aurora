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
  `data/editor/{zone}_tiles.bin`, BG library + `editor_bg_override.json`.
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
- **Aeon adapter is a routing marker** — *STILL DEFERRED.* `AeonProjectAdapter.open()`
  returns a capability-marker handle; the renderer still runs the untouched
  `useProject.loadFromPath` (zero behavior change). Wrapping `loadFromPath` behind
  `open()` (and populating the report) awaits a core-callable aeon loader.
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
`scratchpad/collision-agent-harness.mjs` (**8/8**) and
`scratchpad/collision-gesture-harness.mjs` (**9/9**) drive the real app under CDP; both must
stay green, and each carries planted-defect notes in its footer. Known pre-existing and *not*
from this line: `scratchpad/commit-collision-harness.mjs` reports 5/6 — stage 4's row-4
*expectation* is what is wrong.

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
incremental content-addressed re-bake in flight targeting <2s. Aurora's own
contribution to the wall was a save that rewrote every file whether it had changed
or not, which bumped ~40 mtimes and marked aeon's level tree stale on **every**
build — fixed by comparing before writing.

## 3. The domain map

Where each art domain stands and where it goes. ★ = new capability, ☆ = upgrade.

| Domain | Today | Target | Contract | Phase |
|---|---|---|---|---|
| Level layout (map) | Mature | ☆ in-viewport object/ring placement + section/act properties | `specs/2026-07-03-entity-placement-properties-design.md` | P1 |
| Level art (tiles/chunks) | Mature; **authoring shipped** — paint-through, origination canvas, resolve-and-commit (§2.6 B) | ☆ export realignment to act-pool pipeline; VRAM budget v2 | §4.2 | P1/P6 |
| Collision | Mature (aeon map paint); **classic authoring shipped** — Collision facet, gestures, committed art gets collision (§2.6 C) | ☆ chunk-carried collision (design #6, **aeon**) | aeon spec #6 | P1 |
| Sprite art | Mature (draw/read) | ☆ finish the S4 export spine (decompose→mappings→DPLC→anim) | `plans/2026-06-17-sprite-*.md` | P3 |
| Animation | Playback only | ★ authoring timeline + event tags | `specs/2026-07-03-animation-authoring-design.md` | P3 |
| Screens/menus/HUD | Nothing | ★ Screen mode (design #7) | aeon spec #7 | P4 |
| Parallax/raster | Config path in project.json only | ★ Raster mode + live preview (design #8) | aeon spec #8 | P5 |
| Object behaviors | Static JSON placement | ★ properties panel + behavior picker (design #9) | aeon spec #9 | P6 |
| Playtest loop | None | ★ Aether client: palette→CRAM, build→reload, play-from-cursor | `specs/2026-07-03-aether-client-playtest-design.md` | **P2 — next** |
| Import pipeline | **PNG import shipped for classic** on 2C's resolver (§2.6 B) | ★ sprite-frame targets, sheet slicing, auto-palette suggestion | `specs/2026-07-03-png-import-design.md` + `specs/2026-08-15-phase-2c-resolve-and-commit-design.md` | P7 |
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
| **P3** | Sprite export spine (decompose → mappings → DPLC) + animation authoring timeline w/ event tags + object-art previews in map | none | open. Note object-art previews already exist for **classic** (§2.5 v1.1 B1) |
| **P4** | Screen mode (design #7 Aurora half) | aeon #7 tasks 1–4 (interpreter + `screens_gen.py`) | open, engine-gated |
| **P5** | Raster mode + live preview (design #8 Aurora half) | aeon #8 tasks 1–4; P2's client | open, engine-gated |
| **P6** | Behaviors properties panel (design #9 Aurora half) + entity-exporter retirement; VRAM budget visualizer v2 | aeon #9 tasks 1–4 | open, engine-gated |
| **P7** | Import pipeline (PNG/sheet quantization) + craft backlog pulls | none | **PARTLY DONE** — the PNG import path shipped on 2C's resolver for classic (§2.6 B). Remaining: sprite-frame targets, sheet slicing (grid / auto-bounds), auto-palette suggestion (median-cut to 15 + transparent) |
| **P8** | Multi-game level adapters (own design cycle) | none hard | substrate delivered by §2.5; remaining work is the cross-game adapters + world assembly (§4.10) |
| **UX 5–6** | The UX overhaul's own leftovers: typed cross-tab/cross-window clipboard, Converter tab, and the stage-6 polish pass | none | open (§2.6 A) |
| **§2.5** | ✅ **DONE** — Disassembly-as-Project: engine-agnostic `ProjectAdapter` + S1 in-place editing + guarded save + 12 MCP tools + aeon detection unified. Aeon adapter is still a routing marker (real loader deferred). | delivered 2026-08-09 | done |
| **§2.6** | ✅ **DONE** — the August line: UX overhaul stages 1–4, art authoring 1/2A/2B/2C, classic collision authoring + the agent surface, the lens-sweep defect campaign. | delivered 2026-08-12 → 08-19 | done |

Rationale: P2 is the suite's keystone gap — Aurora already *serves* Aether and the outbound
half is what the 2026-07-01 suite audit named — and it builds exactly the plumbing design
#8's live preview needs, which is why it still precedes P5. The classic spine has overtaken
P1's aeon half, so P1's remainder should be re-cut against what facet parity already gave for
free rather than executed as written. P3 and P7 stay pure-Aurora work that can interleave any
time engine work stalls.

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
