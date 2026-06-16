# Spec — Sprite Mode (v1 of the unified art suite)

Status: **design, awaiting approval** · 2026-06-16 · Author: brainstormed with user
Vision context: `docs/ideas/2026-06-16-art-suite-vision.md`
Engine target: `s4_engine` (the "Sonic 4 Engine") — **NOT** `sonic_hack`.

## 1. Goal & non-goals

Grow the level/art editor into a unified art suite by adding **Sprite mode**: author
object/badnik sprite art, lay it out into engine mappings automatically, animate it on a
timeline, export it to `s4_engine`, and surface the result as **object preview images in
the level editor**. The authoring experience must feel modern ("did a studio ship this?"),
sharing one canvas/tool core with the existing Art mode.

**In scope (v1):**
- Sprite mode shell: a third app mode (`map | art | sprite`).
- **Draw** the whole sprite frame as a bitmap (NOT tile-by-tile assembly).
- Automatic decomposition: frame bitmap → deduped tile pool → optimal hardware sprite
  pieces (mappings), reusing the existing flip-aware tile-dedup machinery.
- Optional **Mapping inspector** (advanced): view auto pieces, piece/tile budget, override
  per-region palette line, hand-tune. Never required.
- **Animation timeline**: sequence frames, per-frame durations (1/60s), playback
  (forward/reverse/ping-pong), onion-skinning, frame tags, and inline **event-tag markers**
  authoring the engine's real `AF_*` codes.
- **Export** to `s4_engine`: mappings (S4 binary), animations (`.asm`), uncompressed art.
- **Object previews**: registry → `projectStore.objectSprites` → level-map rendering.
- Shared **art-core refactor** so Sprite mode reuses Art mode's drawing primitives.

**Out of scope (deferred — see vision doc backlog):** DPLC / character sprites; Genesis
shadow/highlight authoring (needs an accuracy study; preview likely sampled from the Exodus
emulator, not reimplemented); per-section VRAM precalc; palette-fade preview; parallax
editor; menu-art mode; live emulator hot-reload; importing existing engine binaries
(PitcherPlant-from-`sonic_hack` port is a fast-follow, see §10).

## 2. Engine export contract (ground truth from `s4_engine`)

All formats verified against `s4_engine` source (see vision doc research + the format
deep-dive). The editor's internal sprite model is format-agnostic; export writes these.

### 2.1 Mappings (S4-optimized binary, VDP order)
Per `tools/convert_s2_mappings.py`, `data/mappings/*.bin`, consumed via `SST_mappings` ($10).
```
Offset table:   dc.w Frame0-MapStart, Frame1-MapStart, …     (frame_count words)
Per frame:
  +0 dc.b x_min, x_max, y_min, y_max   ; signed bbox extents, FLIP-INVARIANT (union of
                                       ;   flipped+unflipped — conservative, always correct)
  +4 dc.w piece_count
  per piece (8 bytes):
    +0 dc.w y_offset                   ; signed
    +2 dc.b size_code                  ; bits3-2 = width-1 (0-3), bits1-0 = height-1 (0-3)
    +3 dc.b 0                          ; pad
    +4 dc.w tile_attrs                 ; (pri<<15)|(pal<<13)|(vflip<<12)|(hflip<<11)|tile
    +6 dc.w x_offset                   ; signed
```
Frame indices valid `0x00–0xF6`; `0xF7–0xFF` are animation control codes (must reject frame
ids ≥ `0xF7`).

### 2.2 Animation scripts (`.asm`, `data/animations/`)
Consumed by `engine/objects/animate.asm` via `SST_anim_table` ($1A); object selects an anim
via `SST_anim` ($18). Output is `SST_mapping_frame` ($23).
```
Offset table:   dc.w Ani_X_A-Ani_X, …                        (anim_id × 2 indexes it)
Per-animation (per-anim duration form — most common):
  dc.b duration            ; 0x00–0x7F static hold; $FF = DUR_DYNAMIC (speed-scaled, player only)
  dc.b frame0, frame1, …   ; mapping frame indices
  dc.b <control_code>
  align 2
Per-frame duration form (opt-in, AnimateSprite_PerFrame): dc.b frame0,dur0,frame1,dur1,…,code,0
```
**Control / event codes (IMPLEMENTED — `animate.asm` lines 22-34, commit 2261970):**
| Code | Name | Bytes | Effect |
|---|---|---|---|
| `$FF` | AF_END | — | loop from frame 0 |
| `$FE` | AF_BACK | +1 count | rewind N frames |
| `$FD` | AF_CHANGE | +1 anim_id | switch animation |
| `$FC` | AF_ROUTINE | — | advance routine counter +2 |
| `$FB` | AF_DELETE | — | delete object |
| `$FA` | AF_CALLBACK | +hi,+lo,+0 | call ROM routine (a0=SST) |
| `$F9` | AF_SOUND | +sound_id | play SFX (driver stub today) |
| `$F8` | AF_COLLISION | +coll_type | set `SST_collision_resp` |
| `$F7` | AF_SET_FIELD | +sst_off,+val,+0 | write an SST byte |
Events execute inline without advancing the frame; all consume even byte counts.

### 2.3 Art
Uncompressed 8×8 4bpp tiles DMA'd into the object's reserved VRAM region; mappings index it
relative to `art_tile` ($14 = `(pri<<15)|(pal<<13)|tile`). **v1 = non-DPLC**: all art
loaded once; no per-frame DMA. (`Perform_DPLC` simply isn't called for these objects.)

### 2.4 Object ↔ art binding (for the registry)
`objdef` macro fields the registry must associate per object id: `mappings` label ($10),
`anim_table` label ($1A), `art_tile` (VRAM tile + pal + pri, $14), reserved VRAM tile range,
art-source label, and a chosen `preview_frame`. Generated data follows the
`data/generated/…/entity_data.asm` + `data/editor/` conventions already used for level art.

## 3. Architecture — shared art core

Refactor first so Sprite mode reuses, not clones, the drawing core. **Zero behavior change
to Art mode** (it delegates to the extracted pieces).

| Piece | Action |
|---|---|
| `src/core/art/pixel-ops.ts` (147L) | **reuse as-is** (pure pixel primitives) |
| `PaletteEditor.tsx` (295L), `palette.ts` | **reuse as-is** (Genesis 3-bit, 4-line, idx0 transparent) |
| `editing/history.ts` + `commands.ts` | **reuse**; add sprite command types to the union |
| `ToolColumn.tsx` (332L) | **reuse** (sprite variant only if a sprite-only tool is added) |
| `ComposerCanvas.tsx` (929L) | **extract** generic `PixelCanvas` (brush/fill/select/transform); chunk-specific atlas/live-tile logic stays behind it |
| `composer-buffer.ts` (233L) | **extract** `PixelGridDoc`; `ChunkDoc` + new `SpriteDoc` extend it; diff/write logic stays shared |
| new `usePixelEditingState` hook | shared tool/color/paletteLine/dither/mirror/zoom state for Art + Sprite |

## 4. Data model

```ts
// src/core/model/sprite-types.ts (new)
interface SpritePieceOverride { /* optional per-region palette-line / manual piece tweaks */ }
interface SpriteFrame {
  id: string;
  doc: PixelGridDoc;            // the painted whole-frame bitmap (indexed color)
  originX: number; originY: number; // sprite origin within the frame
  overrides?: SpritePieceOverride[];  // empty ⇒ fully auto-decomposed
}
interface SpriteAnimation {
  id: string; name: string;
  steps: Array<{ frameId: string; duration: number /* 1/60s */; tags?: EventTag[] }>;
  control: 'loop' | 'back' | 'change' | 'routine' | 'delete' | 'once';
  controlArg?: number | string;
}
interface EventTag {            // authors AF_SOUND/AF_COLLISION/AF_CALLBACK/AF_SET_FIELD
  kind: 'sound' | 'collision' | 'callback' | 'set-field';
  args: number[] | string[];
}
interface SpriteDef {
  id: string; name: string;
  objectId?: string;           // link to ObjectDef.id (registry)
  frames: SpriteFrame[];
  animations: SpriteAnimation[];
  vramTileBudget?: number;     // reserved range; informs piece/tile budget readout
  previewFrameId?: string;
}
```
- `S4Project` gains `spriteLibrary: SpriteDef[]` (alongside `objectLibrary`, `chunkLibrary`,
  `bgLibrary`). `ObjectDef.sprite?: string` (already present) points at a `SpriteDef.id`.
- New `spriteStore` for open-document/editing state, mirroring `artStore`.

## 5. UI — Sprite mode

One shell (mirrors Art mode), sharing canvas core + palette:
- **Draw view (primary)** — canvas = the whole current frame. Tools: Pixel-Perfect pencil,
  symmetry painting (H/V draggable axes), dithering gradient, fill, four boolean selection
  modes, numeric move/scale/rotate/skew + nudge, cluster-preserving rotation
  (RotSprite/CleanEdge-style). Paint in indexed color against an active palette line.
- **Animation view** — frame strip + timeline: per-frame duration (1/60s), playback
  (fwd/rev/ping-pong), onion-skinning (range/opacity/tint/front-behind), frame tags, and
  **inline event-tag markers** on frames (typed small payloads matching §2.2 codes).
- **Mapping inspector (optional panel)** — auto piece outlines over the frame, piece-count
  & tile-count budget vs `vramTileBudget`, per-region palette-line override, manual piece
  edit. Hidden by default.
- **Sprite library panel** — list/select/create sprites (mirrors `ChunkLibrary`).

## 6. Auto-decomposition (frame bitmap → mappings)

On save/export, per frame:
1. Slice the painted frame into 8×8 tiles; **dedup flip-aware** into the sprite's tile pool
   (reuse `export/tile-dedup.ts` logic).
2. Pack the non-empty tile region into hardware pieces: each piece ≤ 4×4 tiles, single
   palette line; respect `overrides` (palette-line regions / manual pieces) when present.
3. Emit the S4 mapping frame (§2.1): flip-invariant bbox, pieces in VDP order, `tile_attrs`
   from each piece's tile index + palette line + flip + priority.
Determinism + a clear piece-count readout matter (sprite/VRAM budgeting). Log any frame that
exceeds its `vramTileBudget` rather than silently truncating.

## 7. Object previews

Registry maps `objectId → { spriteId, previewFrameId }`. On sprite save, render the preview
frame (refactored `renderSpriteFrame` taking tile-pool + palette-line resolvers) to an
`ImageBitmap` and populate the already-declared `projectStore.objectSprites`. Add a preview
hook to `OverlayRenderer.drawObjects()`; draw the sprite when present, fall back to the
current marker box otherwise. No change to object placement/commands.

## 8. Export

New `src/core/export/sprite-export.ts`, hooked into `exportAct()`:
- `generateMappingsBin(spriteDef)` → S4 mappings binary (§2.1).
- `generateAnimationsAsm(spriteDef)` → `.asm` matching `data/animations/` (§2.2), event tags
  inline.
- `generateArtBin(spriteDef)` → uncompressed tile blob for the object's VRAM region.
- Emit alongside existing act/entity output, following `data/editor/` + `data/generated/`
  path/versioning conventions.

## 9. Undo / commands

New command types added to the `AnyCommand` union + `history.ts` dispatch, following the
existing shape: `set-sprite-pixels`, `set-sprite-frame` (pieces/overrides), `add-sprite-frame`,
`set-sprite-animation`. Executed via the same `executeCommand()`; history-version bump and
invalidation listeners work unchanged.

## 10. Fast-follow / not-v1

- **Import existing mappings** — `sonic_hack` PitcherPlant badnik port. `sonic_hack` uses the
  stock-Sonic-2 mapping format that `src/core/formats/sprite-mappings.ts` already parses;
  path = parse S2 mappings+art → editor `SpriteDef` → re-export to S4 (§2.1). Also enables
  importing existing `s4_engine` sprites.
- DPLC/characters; shadow/highlight authoring+preview; section VRAM precalc; palette-fade
  preview; emulator hot-reload (see vision doc).

## 11. Testing

- Unit: auto-decomposition (bitmap → pieces; flip dedup; 4×4/one-palette-line constraints;
  budget overflow logged), mappings binary round-trip, animation `.asm` emission incl. each
  `AF_*` event code, palette-line override packing.
- Reuse existing tile-dedup tests as the dedup oracle; assert sprite export tiles match the
  same flip-aware rules.
- Object-preview: registry populate → `objectSprites` → render hook returns bitmap.
- Refactor safety: existing Art-mode tests stay green after the `PixelCanvas`/`PixelGridDoc`
  extraction (no behavior change).

## 12. Open questions (resolve in planning)

- Exact piece-packing algorithm (greedy 4×4 vs. optimal) — start greedy + deterministic;
  optimize later only if piece counts hurt.
- Whether `art_tile` VRAM ranges for new objects are user-assigned or auto-allocated from a
  free list in v1 (lean: user-set per sprite, validated against overlap).
- Whether the Draw view edits one frame at a time or supports lightweight layers (lean:
  single indexed layer in v1; layers are a later craft add).
