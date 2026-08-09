<!--
Authored 2026-08-09 (Claude Fable 5 + user brainstorm). Status: IMPLEMENTED (v1.1),
2026-08-09 — Milestones M1–M7 landed on branch feature/disasm-project (plan
docs/plans/2026-08-09-disasm-project-abstraction.md), then the v1.1 batch (Tasks
B1–B4, plan docs/plans/2026-08-09-classic-v1.1-batch.md) closed the composer +
palette deferrals below (plus object-art rendering and loop-chunk authoring). The
only deferral still open is §2.7 aeon migration.

  v1.1 CLOSURE:
  • §2.4 composer wiring — CLOSED (B3). A self-contained ClassicComposerDock
    (Chunk/Block/Tile tabs) edits tile pixels/blocks/chunks in the classic view with
    shared-structure UX; deliberately NOT wired into aeon's Art mode.
  • §2.4 palette editing UI + MCP — CLOSED (B4). ClassicPalettePanel (4×16 swatches)
    edits the act palette via a reusable Genesis RGB-slider control extracted from
    PaletteEditor's idiom (decoupled from the aeon stores); MCP wires set_level_palette
    (the classic set_palette, renamed to dodge the aeon set_palette name in the flat
    tool registry) and set_start.

Original v1 deferrals (of which only the first remains):
  • §2.7 aeon migration — `AeonProjectAdapter` is a routing MARKER: detect keys on
    project.json engine:"s4" so aeon participates in the single detectProject
    registry, but open() returns a capability-marker handle and the renderer still
    runs the untouched useProject.loadFromPath (zero behavior change). Wrapping the
    real aeon loader behind open() (and populating its report) awaits a
    core-callable aeon loader.
  • §2.4 composer wiring — the classic surface (ClassicLevelViewport / chunk picker
    / object inspector) ships, but wiring the Art-mode pixel/block/chunk composer to
    classic content-editing commands is deferred; those commands exist and are
    reachable via the edit_chunk/edit_block MCP tools.
  • §2.4 palette editing UI — the `classicSetPalette` command exists and is tested,
    but is NOT surfaced anywhere: the Art-mode PaletteEditor is aeon-store-coupled
    (projectStore/getCurrentZone/editorStore.executeCommand/artStore/spriteStore +
    the s4 Color type), so it takes no lines+callback props and reusing it here means
    a non-trivial extraction — deliberately not forced. There is also NO MCP/agent
    tool reaching classicSetPalette (agent-handler exposes layout/chunk/block/object/
    colind but not palette or start), so classic palettes are currently un-editable in
    both the UI and MCP surfaces. Wiring either is follow-up work.
Originally: user approved approach + section 1 interactively; sections 2–3 delegated
to Claude with instruction to proceed to implementation overnight (Opus worker
agents, Fable oversight).
Companion: docs/specs/2026-07-03-multi-game-level-interop-design.md (P8) — this spec
pulls P8's neutral model + Phase D codecs forward and supersedes P8's assumption that
donor disasms are import-only. Ground truth for S1 formats verified against
s1disasm/Utility Project Files/SonLVL INI Files/SonLVL.rev01.ini and SonLVLAPI source.
-->

# Disassembly-as-Project: Aurora's Engine-Agnostic Project Layer — Design

## Goal

Open a recognized disassembly directory (first target: `/home/volence/sonic_hacks/s1disasm/`,
the GitHub AS-based Sonic 1 disassembly) and have everything recognized and **editable in
place**: levels (layout/chunks/blocks/tiles/palettes), object sprite art, and object
placement. Save writes S1's own native formats back into the disasm, so its stock build
(`build.lua`) produces the modified ROM. Aurora becomes a multi-engine tool; aeon becomes
"just another project type" behind the same abstraction.

**Primary motivation (user-selected): prove the abstraction.** Success = s1disasm opens/
edits/saves correctly AND Aurora's internals become engine-agnostic (aeon migrates behind
the same `ProjectAdapter` interface with zero behavior change). Polish only where touched;
this is not (yet) a shippable community tool.

## Decisions log (2026-08-09 brainstorm)

| Question | Decision |
|---|---|
| Core model | **Edit in place** (HyperSonic model), not import-into-aeon |
| V1 scope | Levels + object/sprite art + object placement. **No** Build & Test button in v1 |
| Recognition | **Bundled profile** per project type; fingerprint detection; loud resolution report; per-project override sidecar |
| Purpose | Prove the abstraction (dogfood); aeon migration is a deliverable |
| Architecture | Approach 1: `ProjectAdapter` + hierarchical `LevelDoc` as the live editing model for classic projects |
| First milestone | Read-only browse/render before any encoder work |

## Non-goals (v1)

- Build & Test button, emulator launch for classic projects (v2; aeon's is P2 work).
- S2/S3K profiles (the interface is designed for them; only S1 ships).
- Special stage layouts (`sslayout/`), title screen/ending tilemaps, sound — out of scope.
- Editing S1 collision *arrays/shapes* (the 256-shape height arrays). We edit per-block
  collision **indices** (colind); shape authoring stays aeon-only for now.
- SonLVL INI parsing (profile is bundled/hardcoded; INIs were used once, at design time,
  as ground truth).
- Byte-identical *recompression* (see Acceptance: compressed files must be
  decompressed-identical; uncompressed files byte-identical).

## 1. Ground truth — S1 formats (verified against SonLVL.rev01.ini + SonLVLAPI)

| Data | Location | Format | Notes |
|---|---|---|---|
| 8×8 tiles | `artnem/8x8 - {ZONE}.nem` (GHZ split in two: GHZ1+GHZ2) | **Nemesis** | concatenated in VRAM order |
| 16×16 blocks | `map16/{ZONE}.eni` | **Enigma** | 8 bytes/block: 4 tile words (pri/pal/xf/yf/tile) |
| 256×256 chunks | `map256/{ZONE}.kos` | **Kosinski** | 16×16 grid of block words per chunk; word carries block id + xf/yf + solidity bits. **Layout ids are 1-based** (below): the file's first chunk is layout id $01, since id $00 is the implicit blank/air chunk (SonLVLAPI `LoadLevelChunks` prepends an empty Chunk at index 0 for S1/SCD) |
| FG/BG layout | `levels/{zone}{act}.bin`, `levels/{zone}bg.bin` | uncompressed | byte 0 = width−1, byte 1 = height−1, then row-major chunk ids; max 64×8 (INI: levelwidthmax/levelheightmax). Chunk id $00 = blank/air (bit 7 = loop flag); id N≥1 → the (N−1)-th map256 chunk |
| Objects | `objpos/{zone}{act}.bin` | uncompressed | 6 bytes/entry: x word, y word (flags in high bits: yflip bit15, xflip bit14), id byte (bit7 = respawn), subtype byte; terminated $FFFF. REV01 variants exist for some acts |
| Start positions | `startpos/{zone}{act}.bin` (+ credits-demo variants) | uncompressed | x word, y word |
| Palettes | `palette/*.bin` | raw CRAM words | composed per profile rule, e.g. GHZ = `Sonic.bin` line 0 + `Green Hill Zone.bin` lines 1–3 |
| Collision indices | `collide/{ZONE}.bin` | uncompressed | byte per block id → shape index (single plane in S1) |
| Collision shapes | `collide/Collision Array (Normal).bin`, `(Rotated).bin`, `Angle Map.bin` | uncompressed | read-only in v1 (needed to *render* collision overlay) |
| Object sprite art | `artnem/*.nem` | **Nemesis** | per-object files |
| Sprite mappings | `_maps/*.asm` | asm | Aurora's S1 sprite adapter already reads these |
| Animated level art | `artunc/*.unc` | uncompressed 4bpp | v1: load into the tile pool at the profile-declared VRAM slots so chunks render correctly; frame animation editing is out of scope |

Zones: GHZ ($00), LZ ($01, +SBZ3 as LZ act 4), MZ ($02), SLZ ($03), SYZ ($04), SBZ ($05).
Layout quirk: some acts have REV00/REV01 file variants (`objpos/ghz3 (REV01).bin`,
`levels/syzbg (REV01).bin`) — profile defaults to REV01.

**Definitive format reference for implementers:** `programs/SonLVL/SonLVLAPI/` —
`Compression.cs` (+ Kosinski/Nemesis/Enigma implementations it calls) and the S1 engine
reader. Port semantics from there; do not guess from memory. Compression codecs must be
validated against real s1disasm files (decode) and property tests (encode).

## 2. Architecture overview

```
core/project/                      NEW — engine-agnostic project layer
  adapter.ts                       ProjectAdapter interface + registry + detect()
  report.ts                        ResolutionReport types
  profiles/s1.ts                   bundled S1 profile (pure data)
  s1/                              S1ProjectAdapter implementation
  aeon/                            AeonProjectAdapter (migration, last milestone)
core/formats/classic/              NEW — codecs (pure functions, no fs)
  enigma.ts                        decode + encode
  kosinski-encode.ts               encode (decode exists in core/formats/kosinski.ts)
  nemesis-encode.ts                encode (decode exists)
  s1-layout.ts, s1-objpos.ts, s1-startpos.ts, s1-colind.ts, s1-collision-shapes.ts
core/level-classic/                NEW — the hierarchical live model
  model.ts                         LevelDoc (P8 §2 shape, promoted to live document)
  s1-io.ts                         profile entry ⇄ LevelDoc (uses codecs)
  render.ts                        chunk prerender (block→tile resolve, palette)
renderer stores/components         classicProjectStore, classicLevelStore (shared undo),
                                   ClassicLevelViewport, zone/act browser, chunk picker
```

**Data flow (open):** File → Open directory → `detect()` over registered adapters →
`S1ProjectAdapter.open()` resolves every profile entry → `ResolutionReport` + capability
manifest → UI enables Levels/Sprites modes → selecting an act runs `s1-io.read()` →
`LevelDoc` in `classicLevelStore` → viewport renders prerendered chunks over the layout
grid. **(save):** store marks dirty domains → `s1-io.write()` encodes only touched files →
atomic write (tmp + rename) into the disasm.

### 2.1 ProjectAdapter (the abstraction being proven)

```ts
interface ProjectAdapter {
  readonly type: 'aeon' | 's1';                 // grows later: 's2' | 's3k'
  detect(dir: string): Promise<ProjectMatch | null>;   // structural fingerprint
  open(dir: string, overrides?: ProjectOverrides): Promise<ProjectHandle>;
}
interface ProjectHandle {
  capabilities: CapabilityManifest;   // levels:'chunk-hierarchy'|'aeon', sprites, objects:'objpos'|'json', build:false
  report: ResolutionReport;           // per-entry resolved | missing | ambiguous
  levels: { list(): ZoneActRef[]; read(ref): Promise<LevelDoc>; write(ref, doc, dirty): Promise<WriteResult> };
  sprites: {...};                     // bridges to existing sprite-format-adapter machinery
}
```

Fingerprints are disjoint: s1disasm = `sonic.asm` ∧ `artnem/` ∧ `map256/` ∧ `levels/`;
aeon = `project.json` with aurora schema. Detection failure → normal "not a recognized
project" dialog listing what each known type expects.

- **Loud resolution:** every profile entry resolves at open; summary line
  ("70/70 level files resolved") expandable to per-entry detail. Missing files never
  hard-fail the open — the affected zone/act lists as unavailable with the reason.
- **Override sidecar:** `.aurora/project.json` inside the disasm — path overrides and
  additions (new zone slots, new art files). Aurora reads it at open and writes it when
  the user adds content. Human-readable, committed to the user's repo by the user.
- **REV01 default**, open-dialog toggle shown only when both variants exist on disk.

### 2.2 LevelDoc — hierarchical, live (Section 2 of the design)

P8's neutral model, promoted from interchange to the live editing document. **Never
flatten**: S1 levels stay tiles → blocks → chunks → chunk-id layout in memory, and save
re-encodes the same hierarchy — this is what makes byte-faithful round-trip and shared-
chunk semantics possible (edit a chunk once, every placement updates, exactly like the
real game data).

```ts
LevelDoc {
  game: 's1',
  tiles: Uint8Array,                 // 4bpp, includes artunc animated slots at their VRAM offsets
  blocks: BlockDef[],                // 4 × {tile, xf, yf, pal, pri}
  chunks: ChunkDef256[],             // 16×16 cells: {block, xf, yf, solidity(2b)}
  fg: LayoutGrid, bg: LayoutGrid,    // width/height + Uint8Array chunk ids
  collision: { colind: Uint8Array,   // block id → shape idx (editable)
               shapes: HeightProfile[], angles: Uint8Array },   // read-only, for overlay
  palettes: PaletteLine[4],          // + source composition map for save-back
  objects: S1ObjectEntry[],          // {x,y,xf,yf,respawn,id,subtype}
  start: {x,y},
  sourceRefs: {...}                  // which files each domain came from (drives save)
}
```

**Editing semantics.** `classicLevelStore` joins the shared undo history; one undo step
per gesture; every mutation is a command (MCP parity): `classic:set-layout-cells`,
`classic:edit-chunk-cells`, `classic:edit-block`, `classic:edit-tiles`,
`classic:set-palette`, `classic:set-objects`, `classic:set-colind`, `classic:set-start`.
Edit-time validation mirrors the format's hard limits (what the format can't encode,
Aurora refuses at edit time): layout ≤ 64×8 chunks; chunk ids ≤ $FF; block ids ≤ $3FF;
tile count ≤ what the zone's VRAM window holds (profile-declared); object count such that
file stays within stock table expectations (warn, don't block); x/y within word range.

**Viewport.** `ClassicLevelViewport` reuses map-mode machinery: chunks prerender to
offscreen canvases (like zone-tileset prerender), layout renders as a chunk grid with
FG/BG plane toggle, collision overlay (resolve block→colind→shape, draw height columns —
reuse the collision renderer), object markers with real art where the sprite adapter can
render the frame (S1 read side exists), ring-group expansion for obj $25 display. Left
dock: zone/act tree (like the HyperSonic screenshot — this is the one UI idea we adopt).
Bottom dock: chunk picker (prerendered thumbnails). Tools v1: chunk stamp, object
select/move/place/delete (Del), start-position drag. Chunk/block/tile *content* editing
happens in the existing Art-mode composer surfaces wired to the classic store's commands.

### 2.3 Codecs (Section 2, continued)

- `enigma.ts` — decode + encode (S1 blocks). Small, well-documented; port from SonLVLAPI.
- `nemesis-encode.ts`, `kosinski-encode.ts` — encoders for existing decoders.
- Plain-binary codecs: `s1-layout`, `s1-objpos` (respawn/flip bit packing, $FFFF
  terminator, preserve trailing padding bytes if present), `s1-startpos`, `s1-colind`.
- All pure `Uint8Array → structure → Uint8Array`, no fs. **Tests are the contract:**
  property tests `decode(encode(x)) == x` on random + real data; goldens: decode real
  GHZ/MZ/SBZ files and re-encode → decompressed-identical; uncompressed codecs →
  byte-identical on every s1disasm file of that class.

### 2.4 Object sprite art + placement (Section 3 of the design)

- **Placement:** objpos entries edit on the map viewport (place from an object library
  panel listing the profile's object table: id → name → art ref; drag/move/Del;
  subtype + respawn + flips in the inspector). `classic:set-objects` = one undo step per
  gesture. This intentionally mirrors the P1 aeon entity-placement design — same
  interaction vocabulary, different backing command — so the later aeon work shares UI.
- **Sprite art:** existing Sprite mode + S1 adapter provide read/render/edit of frames.
  New: save-back path — re-encode edited art via `nemesis-encode` to the object's
  `artnem/*.nem`; mappings editing stays read-only in v1 (asm write-back is its own
  project; report "mappings are read-only" in the UI rather than silently dropping).
  Level tile/block/chunk art edits save through the level path (2.3).

### 2.5 MCP tools (parity rule)

Same-phase, one undo step per mutation: `open_project {dir}`, `get_project_report`,
`list_classic_levels`, `get_classic_level {zone, act}`, `set_layout_region`,
`edit_chunk`, `edit_block`, `place_object` / `move_object` / `delete_object`,
`set_colind`, `save_project`. (Names final at implementation; follow `EDITOR_METHODS`
descriptor pattern.)

### 2.6 Error handling

- Open never hard-fails on partial resolution; per-entry report, unavailable acts listed
  with reasons.
- Decode failure of one file = that domain unavailable + report entry naming the file
  and offset of the failure; never a blank/corrupt render presented as data.
- Save is atomic per file (tmp + rename), writes only dirty domains, and **refuses** to
  write a file whose on-disk mtime changed since open (external edit) — surface a
  conflict dialog, no silent clobber.
- Encoder output re-decoded and structurally compared before the file is written
  (self-check gate; a failed self-check aborts that file's save with an error).

### 2.7 Aeon migration (the abstraction payoff — last milestone)

Move the existing s4/aeon open path behind `AeonProjectAdapter` implementing the same
interface (capabilities: `levels:'aeon'`, `build:false` for now — P2's Aether client
slots in as a capability later). Zero behavior change; gate = tsc + full vitest suite +
manual open of the aeon project. UI's File → Open becomes uniformly detection-driven.

## 3. Milestones (implementation order)

| M | Deliverable | Gate |
|---|---|---|
| M1 | Codecs: enigma (dec+enc), nemesis-enc, kosinski-enc, s1 plain-binary codecs | property + golden tests green vs real s1disasm files |
| M2 | Project layer: adapter/registry/report + S1 profile + fingerprint + sidecar | unit tests incl. fixture-tree resolution; opens real s1disasm with full report |
| M3 | LevelDoc + s1-io read + chunk prerender | read GHZ1 → model invariants tested; round-trip (read→write, zero edits) goldens |
| M4 | UI: open flow, zone/act tree, ClassicLevelViewport read-only w/ collision overlay + object markers | tsc+vitest; renders GHZ correctly (screenshot check vs SonLVL/emulator) |
| M5 | Editing: layout stamp, chunk/block/tile edit commands, palette, save-back | undo/redo tests per command; save→stock `build.lua` builds a ROM that boots with the edit visible |
| M6 | Object placement editing + object-art Nemesis save-back + MCP tools | command tests; MCP tool tests; mappings read-only notice |
| M7 | Aeon behind ProjectAdapter | zero behavior change; full suite green |

M5's ROM gate is the true end-to-end proof: edit GHZ layout in Aurora → `lua build.lua`
in s1disasm → boot in BlastEm → the edit is in the game.

## 4. Acceptance

- tsc + vitest green; new coverage for every codec and command.
- Round-trip goldens: open each S1 zone/act → save with zero edits → uncompressed files
  byte-identical; compressed files decompressed-identical. All six zones, not just GHZ.
- Every mutation = one undo step = one MCP tool.
- Edit-time validation matches format hard limits (§2.2 list).
- GUI verification by the user (morning review): open s1disasm, browse zones, edit GHZ,
  save, build, boot.
- Docs updated: ROADMAP gains this as an active phase (it pulls P8 Phase A/D forward and
  overlaps P1's placement UI vocabulary); MCP.md tool list.
