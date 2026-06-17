# Art Suite — Vision & Future Directions (living doc)

Started 2026-06-16. Captures the long-range vision, the v1 cut, and the backlog so
nothing brainstormed gets lost. This is NOT a spec — it's the idea ledger.

## North Star

A single, modern art suite for the engine. You want to make art for this game, you
open **one tool**, not three or four random ones. One shell, shared primitives:
pixel canvas, brush/fill/select tools, copy-paste, palette picker, undo, zoom/pan,
toolbar — identical code and identical muscle memory across every domain. The domain
only changes what you assemble pixels *into* and how it exports.

Domains:
- **Level art** — shipped (tiles → blocks → chunks → sections → backgrounds, palettes, collision, object/ring placement).
- **Sprite art** — this initiative (objects/badniks first, characters later).
- **Menu / UI art** — later.

Quality bar: "did a modern game-dev studio release this for their engine?" — not
"someone made this 14 years ago and it shows."

## Engine grounding (IMPORTANT correction — 2026-06-16)

**Our engine is `s4_engine` (the "Sonic 4 Engine"), NOT `sonic_hack`.** `sonic_hack` is a
separate/older Sonic-2-disasm mod; do not assume its formats or constraints are ours.
ClownMapEd / SGDK / S3K are **UX references only** — our export target is `s4_engine`.

What `s4_engine` already provides (so the editor exports INTO this, doesn't reinvent it):
- **Animation system**: `engine/objects/animate.asm` — S.C.E./S3K-style `AnimateSprite`
  with control codes `$FF`=loop, `$FE`=jump-back N, `$FD`=switch anim, `$FC`=advance
  routine, `$FB`=delete. Script format: offset table → `dc.b duration, frame0, frame1,
  …, control_code`. A per-frame-timing variant exists (`frame,timer` pairs). Speed-scaled
  walk/run for the player. Data lives in `data/animations/*.asm` (e.g. `sonic_anims.asm`).
- **Mappings**: `data/mappings`.  **DPLC**: `data/dplc` (separate from animation, as in S3K).
- **Animation Event Tags** (designed: `docs/superpowers/specs/2026-04-27-animation-event-tags-design.md`)
  — Ristar-inspired inline frame tags for SFX triggers, hitbox/hurtbox swaps, particle
  spawns, callbacks. **This IS the frame→SFX/event model**; the editor's timeline should
  author these tags. Active work on branch `feat/sonic-animations`.
- **VRAM/tile budget**: we are **NOT as tile-constrained as stock Sonic** — the
  constraint-check / tile-reuse tooling must use OUR engine's real limits, not stock
  Sonic ceilings. Goal is "avoid bloat," not "fit a tiny fixed VRAM window."

**Implication:** sprite/animation export (vision item 1) targets `s4_engine`'s
`data/{animations,mappings,dplc}` asm/bin formats + the event-tag layout. Study our own
`animate.asm` + the event-tags spec before locking export — internal docs first, external
tools (ClownMapEd) only for UX inspiration. Read `s4_engine/docs/research/animation-system.md`.

## Sprite authoring model (CORRECTED 2026-06-16 — user caught this)

**You draw the WHOLE sprite frame as a bitmap. You do NOT draw tiles and assemble pieces.**
The tile/piece decomposition is a hardware/export concern the tool hides — old ROM-hack
mapping editors (SonMapEd/ClownMapEd) expose it and that's a big part of why they feel
dated. The authoring surface is "just draw the sprite," with full craft tools.

Genesis wrinkle (the only reason pieces exist): a hardware sprite piece is max **4×4 tiles
(32×32px)** and uses **exactly one palette line**. Frames bigger than 32×32 MUST split into
multiple pieces — but the tool does this **automatically** (reuse the existing flip-aware
tile-dedup machinery to derive the tile pool; pack non-empty area into optimal pieces on
save/export). A **Mapping inspector** panel is OPTIONAL/advanced: view auto piece outlines,
piece/tile budget, override a region's palette line (the one case Genesis genuinely needs
user input — multi-palette-line frames), hand-tune. Never a required step.

So Sprite mode views = **Draw (whole-frame bitmap)** + **Animation (timeline)**, with the
Mapping inspector as an optional advanced panel — NOT a required "Pixel→Layout→Animate"
three-step where you assemble tiles.

## Import targets / fast-follow

- **PitcherPlant badnik port from `sonic_hack`** (the other project) — desired so we can
  reuse those badniks. `sonic_hack` uses stock-Sonic-2 mapping format, which the editor's
  existing `src/core/formats/sprite-mappings.ts` parser already reads. Path: import S2
  mappings+art → editor sprite model → re-export to S4 format. Fast-follow after v1.

- **Multi-format sprite interop (S1 / S2 / S3K ↔ S4)** — user idea 2026-06-17. Open existing
  Sonic 1/2/3K sprite art (that's where most existing art lives) and save/convert between
  them and our S4 format. Architecture: the editor's **logical `SpriteDef` is the hub**;
  each game is a reader/writer **adapter** (mappings + DPLC + animation streams all differ
  per game; S3K adds mirrored-player art + its own DPLC). We already have the S2 reader and
  (v1) the S4 writer, so the spine exists — S1 and S3K are additional adapters. Effectively a
  modern SonMapEd/ClownMapEd with our canvas on top and S4 as a first-class target. The
  PitcherPlant port is the first concrete consumer (needs S2→S4 anyway). Backlog, post-v1.

## Architecture keystone

A **shared art core** (extracted from the existing `ComposerCanvas`) + a **sprite/object
asset registry** linking engine object IDs ↔ art + mappings + a chosen preview frame.
The registry is what makes the cross-domain payoffs (previews, VRAM precalc) cheap
rather than bolt-ons.

## v1 cut — Option B

Sprite mode for **object/badnik sprites** (no DPLC): **draw + layout + animate + export**,
PLUS the registry surfacing **real object preview images in the level editor** (replacing
abstract markers). Ships the full sprite-editing loop and one headline cross-domain feature.

## Backlog (post-v1, each likely its own spec)

- **Per-section VRAM precalc / overlap visualizer** — extend the existing flip-aware
  budget engine to sum level-art tiles + sprite tiles of objects placed in a section
  against `VRAM_Layout` regions; show green/red *before build*. Genuinely novel.
- **DPLC / character sprites** — Sonic/Tails/Knuckles stream tiles per-frame; editing a
  frame means recomputing DMA cues. Needs a DPLC model + generator.
- **Animation editor depth** — anim-script commands (loops, sub-animations, SFX/engine
  callbacks), onion-skinning, timing tweaks, in-editor playback parity with the game.
- **Menu / UI art mode** — third domain on the shared core.
- **Parallax / deformation editor + live previewer** — author per-scanline horizontal
  scroll (HBlank deformation): parallax bands, water ripple, heat-haze wobble. Author
  and preview the deformation curves in-tool instead of hand-tuning asm tables and
  rebuilding. Builds on the existing `bg_anim` camera-driven pipeline.
- **Shadow/Highlight mode authoring + preview** — the Genesis VDP shadow/highlight mode
  (priority/operator-driven) is part of our look; the palette/constraint tooling and the
  canvas preview should understand and let you author/preview shadow & highlight regions,
  not just flat colors. (User idea, 2026-06-16.)
- **Section palette-fade / transition preview** — a preview mode that shows a section
  fading from one palette to another (palette transitions / cycling) so you can see in the
  editor how it will actually look in game. We don't do palette fades yet; could pair with
  authoring them. (User idea, 2026-06-16.)

## Cross-tool integration ideas (engine · editor · emulator · DAW=megadaw)

Unifying idea: **one game project, live round-trips between tools**, glued by the asset
registry + the MCP transport already running.

**Editor ↔ Emulator** (Exodus MCP bridge already exists):
- Live art **hot-reload** → push edited sprite/tile/palette to running VRAM/CRAM, no rebuild.
- **Pull from running game** → capture live VRAM/CRAM into the editor.
- **Ground-truth the VRAM precalc** against actual in-game VRAM when you walk to a section.
- **Warp-to** → select section/object in editor, drop the player there in the emulator.

**Editor ↔ DAW (megadaw):**
- Zone/act ↔ music-track binding edited here, consumed by the engine.
- Animation/object → **SFX triggers** referencing SFX by name from the DAW project, previewable.
- Boss/cutscene **choreography timeline** syncing animation + music + camera.

**Emulator ↔ DAW:**
- **VGM capture → DAW** (MCP has `vgm_start/stop`) to record/compare in-game audio.
- Live **sound hot-reload** into Z80 sound RAM (art hot-reload's audio twin).

## Research findings (2026-06-16, deep-research pass — 28 sources, adversarially verified)

Highest-impact patterns for the "did a studio ship this?" bar, all confirmed against
primary docs (Aseprite, Cosmigo Pro Motion NG, SGDK, ClownMapEd, Godot, Defold):

1. **Unified timeline + frame tags.** One timeline over frames (and layers/cels), with
   named *tags* that carve sub-animations out of a single frame strip; 3 playback modes
   (forward / reverse / ping-pong); per-frame durations. SGDK already expresses Genesis
   timing as per-frame 1/60s counts (e.g. `[[3,3,3,4,4][4,5,5]]`) and models a sheet as
   **rows = animations, cells = frames** — that grid maps cleanly onto Sonic-2-disasm
   anim scripts + mappings. (Aseprite, SGDK)
2. **Onion-skinning** with configurable range, opacity, tint, and front/behind placement,
   plus a live preview window. Table-stakes for animation feel. (Aseprite)
3. **Tile-aware editing with an Auto mode.** Tilemap cells reference reusable tileset
   tiles (exactly like palette indices); toggle Draw-Pixels vs Draw-Tiles; an **Auto
   submode creates, reuses, and garbage-collects tiles as you draw** → minimal unique
   tiles automatically. This is gold for Genesis VRAM and lets ONE canvas core serve
   level art and sprite mappings. We already have flip-aware tile dedup for level art —
   this extends it into a live editing affordance. (Aseprite; also a Stack submode.)
4. **Hardware-constraints engine.** Full palette editor (ramps, harmonies, color wheels)
   PLUS a "check-for-errors" layer that flags per-tile color-limit / palette violations
   **at edit time** (Genesis/SNES/C64 modes). Directly serves both the studio bar and the
   VRAM/palette-budget vision. (Pro Motion NG)
5. **Auto DPLC generation.** A best-in-class Genesis sprite tool auto-produces optimised
   DPLC from the sheet. **ClownMapEd (Clownacy) is a strong UX reference** for the
   mappings+DPLC editing workflow — but our actual export format is `s4_engine`'s
   `data/{mappings,dplc}`, NOT ClownMapEd's. Study it for interaction ideas only. (ClownMapEd, SGDK)
6. **Live-reload patterns (later integration phase).** Stable UUID asset identity in
   committed meta files (Distill — now dormant, needs a filesystem), MD5 source-hash
   reimport (Godot), state-preserving hot reload that does NOT re-run init (Defold). For
   us: push changed VRAM/CRAM through the existing Exodus MCP bridge. Reference, not
   adoptable tech.

**Implications for v1 (Option B):** adopt the **rows=animations / cells=frames sheet
model**, **per-frame 1/60s timing**, **frame tags**, **onion-skinning**, and **tile-aware
Auto-reuse** drawing from the start; wire the **palette constraint-check** in early (cheap,
high signal); study **ClownMapEd** before locking the mappings/DPLC export format.

**Research-flagged gaps still unmined** (candidates for a focused follow-up pass before or
during spec): clipboard/copy-paste ergonomics; palette-swapping & multi-palette-per-sprite
UX for the Genesis 4-palette limit; the **frame-event / SFX-trigger model** (GB Studio +
Unity Animation Events not yet mined — relevant to the DAW integration); and which
live-reload transport is most reliable (Exodus MCP `write_vram/write_cram` vs hash-watch).

Full report archived at `tasks/wsu12diyf.output` (this session).

## Research findings — pass 2 (2026-06-16, drawing-craft focus — 23 sources, verified)

Primary thread = "is the editor itself a joy to draw in." Impact order from synthesis:
**brush/stroke craft > selection/transform > Genesis palette+shadow/highlight > anim timeline.**

1. **Brush & stroke craft (highest impact).** Adopt: **Pixel-Perfect mode** (pencil
   removes doubled corner pixels on a stroke — the single most-loved pixel-pencil feature);
   **Gradient tool with built-in dithering** (Bayer 2/4/8 patterns); **symmetry painting**
   on every tool (≥ horizontal + vertical axes with draggable position); brush
   shapes/sizes + custom/captured brushes; DPaint/PPaint-era drawing ops (Pro Motion NG).
   (Aseprite context-bar, Pro Motion NG.)
2. **Selection & transform.** Four boolean selection modes (Replace/Add/Subtract/Intersect);
   modifier-keyed move/scale with **numeric X/Y/W/H/Rotate/Skew** entry; keyboard **nudge**
   of a floating selection; floating-selection paste/stamp. **Cluster-preserving rotation**
   matters for pixel art — offer both **RotSprite** and **CleanEdge**-style options, not a
   naive rotate. (Aseprite, astropulse Clean-Rotate.)
3. **Color/palette as a drawing experience.** Confirmed Genesis facts: **4 palette lines ×
   16 entries, index 0 transparent; a given sprite/tile uses exactly ONE line at a time.**
   So multi-palette-per-sprite UX = assign/swap *which line* a sprite or region samples +
   preview it live. **Color cycling = shifting palette indices** (PixelOver) — reusable for
   both authoring and the palette-fade preview idea.
4. **Genesis shadow/highlight — CORRECTED, handle with care.** Verifiers **killed** the
   naive model: shadow is **NOT** "halve the color," highlight is **NOT** "double," and it
   is **NOT** a simple per-tile priority-bit toggle. What survived: it's authored via
   **operator sprites** (high-priority sprites on the operator/4th palette line; c15≈
   highlight, c16≈shadow — *medium* confidence) interacting with plane priority. The exact
   compositing is a finer intensity ramp, not 2×/½×. **Implication:** to PREVIEW shadow/
   highlight accurately, don't reinvent the math — **sample ground-truth from the Exodus
   emulator** (read the real rendered CRAM/output via the MCP bridge) or port the exact VDP
   algorithm from a known-accurate emulator. Flag this as the least-pinned area; needs its
   own format/accuracy study before we build authoring for it. (rasterscroll, spritesmind.)
5. **Animation timeline → events (validates our event-tag plan).** Universally, tools place
   **events as draggable markers on the frame timeline** (Unity Animation Events, Unreal
   AnimNotify markers on an Event line, Godot Call-Method tracks). Trust signals: markers
   visible inline on the timeline, hover tooltips, and a constrained event payload (Unity =
   single-param method call). GB Studio shows the no-code pattern: per-state animation
   switch + a collision/bounding box attached to the sprite. **Our editor's timeline should
   render event-tags as inline markers on frames** and keep each tag's payload small/typed —
   matches our `s4_engine` inline frame-event-tag design directly.

**Net v1 priorities (craft):** Pixel-Perfect pencil, dithering gradient, symmetry, the four
selection modes + numeric transform + nudge, cluster-preserving rotation, one-line-per-sprite
palette assignment with live swap preview, and an animation timeline with inline event-tag
markers. Shadow/highlight authoring is explicitly deferred pending an accuracy study.

Full report archived at `tasks/wdfp0y169.output` (this session).

## Open / next

- Approach decided: **make the program feel great first (editing/UX craft), integration
  with the other tools comes later.**
- Research phase requested, weighted toward **editing/UX craft** (canvas tools, animation
  timeline, onion-skinning, palette workflows). Nothing off-limits. Secondary: integration
  patterns. Survey modern sprite/animation/art tools and engine-integrated editors
  (Aseprite, Godot/Unity sprite+anim workflows, GB Studio, Tiled, Pro Motion, SonLVL,
  etc.) to mine ideas for the "modern + strong" bar before locking the v1 spec.
