# Spec — Sprite Palette Modes (zone-attached vs standalone) + copy bridge

Status: **design, awaiting user review** · 2026-06-19
Context: surfaced while testing sprite undo — loading an engine character (Sonic),
drawing, then watching his palette "break." Root-caused to a deeper model problem, and
expanded (with the user) into a proper feature. This is the first of two related sprite
initiatives; **multi-canvas sprite workspace** is a separate, later spec that builds on
this one.

## 0. Why this exists (the bug, and the real model gap)

The sprite editor today has effectively **one** palette model: a sprite is colored by the
current zone's CRAM palette, and the active line is the shared `artStore.paletteLine`
(documented "1–3 for painting"). `loadEngineCharacter` papers over the player character
with a transient **`paletteOverride`** (`spriteStore.paletteOverride: Color[] | null`) —
Sonic's own palette, used for display only. `setBuffer` then **discards that override on
the first draw** (`spriteStore.ts` — "Editing reverts display to the project palette … keep
WYSIWYG honest"), so Sonic's indices re-map to whatever zone line is active (line 3) and his
colors break. Compounding it: Aurora's project loader (`useProject.ts` ~L353) loads the zone
palette starting at **line 1** (`destOffset: 16`) and never loads the player palette into
**line 0**, so the editor's line 0 is literally empty, and `PaletteEditor` hard-locks line 0
(`PaletteEditor.tsx:56`, "sprite-reserved").

**Engine ground truth** (studied from `s4_engine`): CRAM **line 0 = the player palette**
(`art/palettes/SonicAndTails.bin`, 32 bytes, **identical across every zone** — loaded as
`BGND_Palette`), **lines 1–3 = level art** (`OJZ.bin`, 96 bytes). Sonic's sprite tiles
reference `pal=0`. A Genesis sprite/tile uses **exactly one** palette line.

So the fix is not a patch — it's making the two palette relationships **explicit**:
a sprite is either **bound to a zone CRAM line** (the level/player model) or carries its
**own standalone palette** (free pixel art). The user also asked for an easy **copy bridge**
between the two and **cross-sprite copy/paste**.

## 1. Goal & non-goals

**Goal:** give each sprite an explicit **palette mode** (zone-attached to a line, or
standalone), a mode-aware palette panel, a swatch/line **copy bridge** between sprite and
zone palettes, and **cross-sprite pixel copy/paste** — fixing the character-palette bug as a
consequence, and making Aurora a stronger general pixel-art editor.

**In scope:** §3 (model), §4 (panel), §5 (copy bridge), §6 (character fix), §7 (Genesis-legal
colors, live preview, shared-line warning), §8 (cross-sprite copy/paste).

**Out of scope / deferred (noted, not built):**
- Writing edited **line 0 back to the shared `SonicAndTails.bin`** on save (so player-palette
  edits reach the ROM). Distinct export piece — follow-up.
- **Palette reorder with automatic pixel-remap**; **multi-line sprites** (>16 colors across
  several CRAM lines — Sonic needs one); **color-ramp generators**; **"paste & match colors"**
  (remap a pasted clip to the nearest destination colors so it *looks* the same).
- The **multi-canvas workspace** (several sprites open side-by-side) — its own spec; this
  spec's persistent clipboard is its foundation.

## 2. Architecture overview

Three layers, mirroring how the sprite surface already works:

```
spriteStore (per-sprite palette state)
  paletteMode: 'zone' | 'standalone'
  zoneLine: 0..3            (used when 'zone')
  standalonePalette: Color[16]  (used when 'standalone')
  + setPaletteMode / setZoneLine / setStandalonePalette / clearPalette / clearCanvas
  (replaces paletteOverride)
        │ resolves to a display palette
        ▼
SpriteCanvasHost: palette = mode==='zone' ? zone.palette.lines[zoneLine] : standalonePalette
        │ shown + edited via
        ▼
PaletteEditor (made mode-aware) + a small Sprite Palette header
  zone mode  → the 4 zone lines, bound line = paint line, line 0 EDITABLE in sprite mode
  standalone → the sprite's 16 private colors
  + copy bridge (drag / "Copy to ▸"), shared-line warning, Genesis-legal snapping
        │ cross-sprite
        ▼
pixel clipboard (module-level): copy a marquee region → paste into any sprite (indices
  preserved; destination palette wins)
```

## 3. The model

- **`paletteMode` is a per-sprite property** (lives on the open sprite; per-doc once
  multi-canvas lands), switchable anytime.
- **Zone-attached:** the sprite's pixels color against `zone.palette.lines[zoneLine]`
  (`zoneLine` 0–3; 0 = player, 1–3 = level art). Editing a color **edits that zone line**
  (shared with the level — WYSIWYG with the game, and a real edit to the zone palette via the
  existing `set-palette-line` command). **Default for new sprites:** zone-attached to the
  currently-active line.
- **Standalone:** the sprite carries its **own 16-color palette** (`standalonePalette`),
  isolated from any zone. Editing touches only this sprite. Index 0 stays transparent (the
  Genesis sprite rule), so it's 15 usable colors + transparent.
- **Creation paths set the mode:**
  - **New** (the size buttons) → zone-attached to the active line.
  - **Load engine character** → zone-attached, **line 0** (see §6).
  - **Open / import a sprite** (`openSprite`/`openDiscoveredSet`) → **standalone**, seeded with
    the sprite's loaded palette.
  - **Clear palette** → standalone, **blank** palette (index 0 transparent, rest empty).
  - **Clear canvas** → pixels blanked; mode/palette untouched.

## 4. The sprite palette panel

Extend the existing **`PaletteEditor`** to be mode-aware (one palette widget, not two), with a
small header above the swatch grid:

`[ Zone ▾  line 0–3 ]   [ Standalone ]      (Clear palette) (Clear canvas)`

- **Zone mode:** render the 4 zone lines (as today). The **bound line** is highlighted and is
  the active paint line. **Line 0 is editable in sprite mode** (it's the player palette) —
  rendered without the Art-mode lock, tagged "player · shared" so its weight is clear.
- **Standalone mode:** render the sprite's 16 private colors; all 1–15 editable, 0 transparent.
- The swatch grid still doubles as the paint-color picker (`artStore.selectedColor`), but the
  active **line/palette comes from the sprite's mode**, not the generic `artStore.paletteLine`
  — sprite mode and Art mode no longer share the "which line" state (they keep sharing the
  selected color index).
- Color editing reuses the existing slider + quantization (`encodeGenesisColor`/
  `decodeGenesisColor`) and commits through `set-palette-line` for zone edits; standalone edits
  commit through a sprite-local undoable path (see §9).

## 5. The copy bridge

Move colors between the sprite palette and the zone palette, **either direction**, at two
granularities:
- **Single swatch** — drag a swatch onto another swatch (across the two palettes) to copy that
  color; or right-click → **Copy to ▸ {Zone line N · index i | Standalone · index i}**.
- **Whole line** — drag a line's row handle onto a target line to copy all 16 colors; or a
  line-level **Copy to ▸ {Zone line N | Standalone}** menu.
- Every copied color is **snapped to the Genesis 512-color space** (§7) on write.
- Copying **into a zone line** triggers the **shared-line warning** (§7) if that line is used by
  level tiles. Copying into line 0 is allowed but flagged "player · shared."
- Drag is the primary interaction; the "Copy to ▸" menu is the discoverable fallback.

## 6. Character / player fix (a consequence of the model)

- **Project load** (`useProject.ts` palette build): also load the **player palette** into zone
  **line 0**. Read `art/palettes/SonicAndTails.bin` (fallback `art/palettes/sonic.bin`) and
  add a `buildPalette` source `{ srcOffset:0, destOffset:0, length:16 }`. If absent, line 0
  stays empty (no crash). Every zone's line 0 now carries the player colors, matching the game.
- **`loadEngineCharacter`:** set `paletteMode='zone'`, `zoneLine=0`; load that character's
  `art/palettes/${name}.bin` into zone line 0 (Sonic/Tails share one; Knuckles his own) and
  bump `paletteVersion`. **Remove the `setPaletteOverride` call.**
- **Remove `paletteOverride`** from `spriteStore` and `SpriteCanvasHost` entirely; the
  override-clearing branch in `setBuffer` goes away (drawing no longer touches the palette).
- Result: load Sonic → he shows his real line-0 colors → drawing keeps them → the panel
  shows/edits line 0.

## 7. The three add-ons

- **Genesis-legal colors everywhere.** Standalone palettes and every color written through the
  copy bridge pass through `encodeGenesisColor`→`decodeGenesisColor` (3 bits/channel, 512
  colors) so nothing can hold a color the hardware can't show. (Zone editing already does this;
  this extends it to standalone + copies.)
- **Live preview on line switch.** Changing `zoneLine` re-resolves the display palette and
  bumps `paletteVersion`, so a zone-attached sprite **re-colors instantly** as you flip lines
  0→3 — letting you choose the right line by eye. (Essentially free.)
- **Shared-line warning.** Before an edit/overwrite of a zone line (a color edit, or a
  copy-line-into-zone), compute how many level tiles reference that palette line — scan the
  active zone's section nametables, counting tiles whose `unpackNametableWord(...).palette ===
  line` — and surface a small note ("line 2 · used by 37 level tiles"). Mirrors the existing
  shared-chunk-tile warning. Non-blocking; informational.

## 8. Cross-sprite pixel copy/paste

- A **module-level pixel clipboard** holds a copied marquee region (`{ w, h, data:
  Uint8Array }` of indices) and **survives switching/loading sprites** — so the flow
  *copy a selection in sprite A → load/switch to sprite B → paste* works today, before the
  multi-canvas workspace exists. (Multi-canvas later makes it side-by-side.)
- **Copy/cut:** from a marquee selection (the controller already supports marquee select +
  move); copy stores the region's indices; cut also clears them.
- **Paste:** drops the region into the current sprite (as a floating/placed region at the
  cursor or origin). **Indices are preserved** — the pasted pixels are colored by the
  **destination** sprite's palette. So pasting a standalone clip into a zone-attached sprite
  shows it in **zone colors**, and **paste never changes the destination's mode/palette** —
  the destination always wins. (The "paste & match colors" remap variant is deferred, §1.)

## 9. Data model, undo, and components

**spriteStore** (`src/renderer/state/spriteStore.ts`):
- Add `paletteMode: 'zone' | 'standalone'`, `zoneLine: number`, `standalonePalette: Color[]`
  (length 16). Remove `paletteOverride`/`setPaletteOverride`. Add `setPaletteMode`,
  `setZoneLine`, `setStandalonePalette`, `clearPalette` (→ standalone blank), `clearCanvas`.
- `newSprite`/`loadSprite` set the appropriate defaults (§3).

**Undo:**
- **Zone-line palette edits** → existing `set-palette-line` command (already undoable; works in
  sprite mode since `getActiveLevel` exposes the zone palette).
- **Standalone palette edits** and **clear palette / mode switches** → route through the new
  **`sprite-history`** snapshot stack (already built/tested) by including the palette state in
  the sprite snapshot, OR a dedicated tiny command. (Resolve the exact mechanism in planning;
  lean: extend the sprite snapshot to carry `{ paletteMode, zoneLine, standalonePalette }` so
  palette/mode changes are one undo step alongside pixels.)
- **Cross-sprite paste** → one sprite-history step (it changes pixels).

**Components touched:** `SpriteCanvasHost` (palette resolution by mode), `PaletteEditor`
(mode-aware render + line-0 unlock in sprite mode + copy-bridge drag/menu + shared-line
warning), a small **SpritePaletteHeader** (mode toggle + line picker + Clear buttons) in the
sprite panel, `useProject` (load line 0), `export-sprite.loadEngineCharacter` (zone line 0),
and a `pixel-clipboard` module + copy/cut/paste wiring on the sprite surface.

## 10. Export / persistence

- **Zone-attached** sprites export exactly as today — the mappings reference the bound palette
  line (`pal` bits). No change.
- **Standalone** sprites carry their own palette; export writes it as a palette file alongside
  the art. To place a standalone sprite *into* a level, the user converts it to zone-attached
  via the copy bridge (push its colors into a zone line), then exports.
- **Deferred:** line-0 → `SonicAndTails.bin` write-back so palette edits to the player reach the
  ROM (§1).

## 11. Testing

- **Pure unit:** palette resolution by mode; copy (swatch + line) snaps to Genesis-legal
  colors; shared-line usage count over a known nametable; clipboard paste preserves indices
  (destination palette unchanged). Genesis-legal helpers already tested.
- **Existing suites stay green;** the raw-hex guardrail stays at 0 (panel uses `T` tokens).
- **Manual (with user):** load Sonic → line-0 colors correct → draw keeps them; toggle
  zone/standalone; Clear palette / Clear canvas; bound-line live preview; copy a swatch and a
  line both directions; shared-line warning fires on a used line; copy a region from one sprite
  and paste into another (in zone vs standalone) and confirm "destination palette wins."

## 12. Phasing

1. **Model + character fix** — spriteStore palette state (drop `paletteOverride`), load line 0,
   `loadEngineCharacter` → zone line 0, `SpriteCanvasHost` + `PaletteEditor` mode-aware,
   line-0 unlock, the SpritePaletteHeader (toggle/line/Clear). *Fixes the bug; the core model.*
2. **Copy bridge + add-ons** — drag/menu swatch+line copy, Genesis-legal snapping, live
   preview, shared-line warning.
3. **Cross-sprite copy/paste** — the persistent pixel clipboard + copy/cut/paste with the
   destination-palette-wins rule.

Each phase is independently shippable and verifiable in the running app.
