# S1 non-level art audit — measurement report (2026-08-20)

**Question:** Aurora opens shared-art S1 object sprites level-free (Ring et al.; bosses in flight on `feat/s1-boss-sprites`). The owner wants **Sonic's art** openable too, and the other non-level, non-badnik art families. Inventory them and cut the parcels.

**Method:** read-only transcription from `/home/volence/sonic_hacks/s1disasm` (macros, consumer routines, binclude sites), read-through of Aurora's sprite import/checkout stack, and **one empirical probe**: s1disasm's real `_maps/Sonic.asm` + `_maps/Sonic - Dynamic Gfx Script.asm` + `artunc/Sonic.unc` fed through Aurora's shipped `parseAsmMappings` / `parseAsmDPLC` / `reconstructFromFrames` via `npx tsx` (scratchpad script, no repo changes), rendered with `palette/Sonic.bin` and eyeballed as a contact sheet.

**Headline (measured, not argued): Aurora already renders S1 Sonic perfectly.** The probe produced 88 correctly-composed frames — standing, walking, spinning, rolling, all correct colors — through code that shipped for the S3K/S2 DPLC cases. No new renderer, no new parser, no new codec is needed for Parcel A. What's missing is one field on the row shape and a venue decision for the non-object families.

---

## 1. The DPLC format — transcribed (the make-or-break facts)

Version switch: `sonic.asm:68-69` sets `SonicMappingsVer = 1` and `SonicDplcVer = 1`. Macros in `s1disasm/_maps/_MapMacros.asm`:

```
dplcHeader  (Ver 1, _MapMacros.asm:62-72):
    dc.b  ((BlockEnd - BlockBegin) / 2)          ; BYTE = number of 2-byte entries (0 legal: SonPLC_Null)

dplcEntry tiles,offset  (Ver 1, _MapMacros.asm:74-81):
    dc.w  (((tiles-1)&$F)<<12) | (offset&$FFF)   ; high nybble = tile count − 1 (1..16 tiles/entry)
                                                  ; low 12 bits = SOURCE tile index into Art_Sonic
```

- **Offset table**: `SonicDynPLC_internal: mappingsTable` + 88 × `mappingsTableEntry.w SonPLC_*` — word offsets relative to the table base, one per mapping frame, same table macro as the mappings file (`_maps/Sonic - Dynamic Gfx Script.asm:4-92`).
- **Offset unit is TILES, not bytes**: the consumer multiplies by 32 (`lsl.w #5 ; multiply by $20 (tile_size)`).
- **Consumer** `Sonic_LoadGfx` (a.k.a. `LoadSonicDynPLC`), `_incObj/01 Sonic.asm:2393-2437`: runs only when `obFrame` changed; `add.w d0,d0 / adda.w (a2,d0.w),a2` (frame doubles into the word table); reads the count byte, `subq/bmi` (so a 0-count frame is a no-op — `SonPLC_Null`); per entry copies `tiles` consecutive tiles from `Art_Sonic + offset*32` into `v_sgfx_buffer`; sets `f_sonframechg` and VBlank DMAs the buffer to `ArtTile_Sonic*tile_size` = tile $780 (`sonic.asm:832-835`; `_Constants.asm:571`).
- **Consequently mapping tile indices are FRAME-LOCAL**: every frame's art lands at the same VRAM base, so `_maps/Sonic.asm` piece tile fields index the frame's DPLC-expanded tile list from 0, exactly what Aurora's `renderFrames(frames, art, dplc)` implements (`src/core/import/sprite-import.ts:85-94`).
- **Engine word-math caveat** (trivia, not a blocker): the consumer's `lsl.w #5` on a 16-bit register truncates the effective offset to 11 bits ($7FF); the format carries 12. Art_Sonic is $509 tiles so nothing real is affected, and Aurora's readers keep all 12 bits.

### Sonic's numbers (all verified)

| Fact | Value | Citation |
|---|---|---|
| Art | `artunc/Sonic.unc`, 41,248 bytes = **1,289 tiles** ($509) | `sonic.asm:4412` (`Art_Sonic`), `stat` |
| Mappings | `_maps/Sonic.asm` — **88 frames**, 260 `spritePiece` calls, ALL plain numeric literals (grep-verified, zero irregular lines) | file; included `sonic.asm` (`Map_Sonic`) |
| DPLC | `_maps/Sonic - Dynamic Gfx Script.asm` — **88 entries** (1:1 with mapping frames), 605 lines | `sonic.asm:4410` (`SonicDynPLC`) |
| Coverage | max DPLC source tile = 1288 = last art tile, exact cover (probe) | probe output |
| Palette | `Pal_Sonic` = `palette/Sonic.bin` (32 B, one line) → CRAM **line 0** (`v_palette_line_1` is the FIRST line, `_Variables.asm:317-321`) | `_inc/Palette Index.asm:19,51` |
| VRAM | streamed per frame to tile $780 (`ArtTile_Sonic`) | `_Constants.asm:571`, `sonic.asm:834` |
| Revision split | none — single art/maps/DPLC files (unlike `Rings (REV00/REV01).asm`, `Sega Logo (REV00/REV01).nem`) | `/bin/ls` |

### Sonic's animations — status quo stands

Per the animation audit (`docs/reviews/2026-08-20-s1-animation-audit.md` §1.4, not re-derived here): `_anim/Sonic.asm` is a distinct dialect — `sonani` macro table, `fr_*` equates, negative duration bytes ($FF/$FE/$FD) as dynamic-speed markers, and walk/run rotation fan-out computed in `Sonic_Animate` (code, not data). Parcel 1 of that audit shipped with Sonic **named-excluded** from `S1_OBJECT_ANIMS`. This audit keeps that exclusion: Parcel A opens Sonic's art with an empty-but-honest timeline; the sonani dialect is its own later question.

---

## 2. Family inventory — every non-level, non-badnik art family

All paths s1disasm-relative; line numbers are `sonic.asm` binclude sites unless noted. "Model" letters defined in §3.

| Family | Art file(s) | Comp | Mappings | Palette (line / source) | Level-tied? | Model |
|---|---|---|---|---|---|---|
| **Sonic** | `artunc/Sonic.unc` (:4412) | unc | `_maps/Sonic.asm` + DPLC script (:4410) | line 0 / `Pal_Sonic` | no — line 0 of every zone palette | **(b)** |
| **Shield + Invincibility** | `artnem/Shield.nem` (:4425), `artnem/Invincibility Stars.nem` (:4427) | Nem | `_maps/Shield and Invincibility.asm` (obj $38) | line 0 (`obGfx` carries no pal bits, `_incObj/38:28,33`) | no | (a) |
| **HUD labels** (SCORE/TIME/RINGS) | `artnem/HUD.nem` (:4678) | Nem | `_maps/HUD.asm` (obj $21, 4 frames, `_incObj/21 HUD.asm:20,59`) | line 0, hi-priority pieces | no | (a) |
| **HUD digits** | `artunc/HUD Numbers.unc` — 768 B = 24 tiles (12 digits, 8×16) (:4339) | raw | **none** — blitted digit-by-digit straight to VRAM by `_inc/HUD Update.asm:201,313,368,436,490` | line 0 | no | **(c)** |
| **Lives counter** | icon `artnem/HUD - Life Counter Icon.nem` (:4680); digits `artunc/Lives Counter Numbers.unc` — 320 B = 10 tiles 8×8 (:4341) | Nem + raw | icon via PLC to fixed tiles (`_inc/Pattern Load Cues.asm:76`), digits raw-blitted (`HUD Update.asm:538`) | line 0 | no | (c) |
| **Level select / debug font** | `artunc/Level Select & Debug Text.unc` — 1,312 B = 41 tiles (:631, `Art_Text`) | raw | none — plane text writer (`sonic.asm:547,1962`) | `Pal_LevelSel` | no | (c) |
| **Title screen** | `Title Screen Sonic.nem` (:4396), `Title Screen Foreground.nem` (:4394), `Title Screen TM.nem` (:4398) | Nem | `_maps/Title Screen Sonic.asm` (obj $0E), `_maps/Press Start and TM.asm` (obj $0F) | `Pal_Title` (4 lines); Sonic + TM on line 1 (`Tile_Pal2`, `_incObj/0E,0F:28,103`), PSB line 0 | no (title mode) | (a) |
| **Sega logo** | `Sega Logo (REV00/REV01).nem` (:4378/:4383) | Nem | none — plane tilemap | `Pal_SegaBG` | no | (c′) |
| **Title cards** | `artnem/Title Cards.nem` (:4676) | Nem | `_maps/Title Cards.asm` (obj $34) — **multi-table file**: `Map_Card` + `include "_maps/Game Over.asm"` + `Map_Got` + `Map_SSR`, with cross-referenced blocks (file header lines 7-10) | line 0 + prio (`_incObj/34:70`) | no (zone-name frames per zone, one shared nem) | (a)‡ |
| **Game over / time over** | `artnem/Game Over.nem` (:4690) | Nem | `_maps/Game Over.asm` (obj $39) — standalone file, also included into Title Cards.asm | line 0 (`_incObj/39:32`) | no | (a) |
| **Continue screen** | `Continue Screen Sonic.nem` (:4708), `Continue Screen Stuff.nem` (:4710) | Nem | `_maps/Continue Screen.asm` (objs $80/$81) | `Pal_Continue` | no | (a) |
| **Ending suite** | `Ending - Sonic.nem` (:4809), `- Emeralds.nem` (:4807), `- StH Logo.nem`, `- Try Again.nem` (:4811), `- Credits.nem`, `- Flowers.nem`, `artkos/Flowers at Ending.kos` | Nem (+1 Kos) | `_maps/Ending Sequence Sonic.asm` / `…Emeralds.asm` / `…STH.asm` / `Try Again & End Eggman.asm` / `Credits.asm` (objs $87-$8A) | `Pal_Ending` | no (ending mode) | (a) |
| **Special stage blocks** | `Special Walls.nem` (:4446), `Special UP-DOWN/R/W/Ghost/Glass/GOAL/1UP/Red-White/ZONE1-6/Emeralds/Emerald Twinkle.nem` (:4456-4486) | Nem | `_maps/SS Walls.asm` (16 angle frames, plain spriteHeader/spritePiece), `SS Shared/Glass/UP/DOWN Block.asm`, `SS Chaos Emeralds.asm` (`sonic.asm:4315-4319,4444`) | `Pal_Special` | SS-mode; per-block VRAM tile base + pal come from the **`SS_MapIndex` data table** (`_inc/Special Stage Loading & Drawing.asm:595-605`) | **(d)** |
| **SS results** | `Special Result Emeralds.nem` (:4488) | Nem | `_maps/SS Result Chaos Emeralds.asm` (:4165) + `Map_SSR` inside Title Cards.asm | `Pal_SSResult` | no | (a) |
| **Giant Ring** | `artunc/Giant Ring.unc` — 3,136 B = 98 tiles (:5036) | unc | `_maps/Giant Ring.asm` | line 1 | **already linked** (`0x4b` unc row) — art streamed in-game by `AniArt_GiantRing`, but statically it's plain unc+maps | (a) |
| **Hidden JP credits** | `Hidden Japanese Credits.nem` (:4402) | Nem | none — plane text | — | no | (c′) |
| Unused (goggles, smoke, SS flash, UnkFire, LZ Sonic, Eggman ending…) | `:4419-4437, :4815` etc. | Nem | mostly none | — | no | out of scope |

‡ Title Cards is one `.asm` containing three tables plus an `include` — `parseAsmMappings` on it yields the concatenation of all inline table labels (`collectBlocks` appends every `mappingsTableEntry`, `asm-mappings.ts:50-73`). Viewable, but frame indices won't match any single engine table, and the inner `include` line is silently skipped (Game Over's frames come only from its own file). Rows should point at the most specific file (`_maps/Game Over.asm` for $39), and a Title Cards row accepts the merged-index caveat. UNVERIFIED: not probed; behavior read from `collectBlocks`.

Not present in S1 at all: spindash dust (no spindash — `grep -i dust\|spindash` over `sonic.asm` is empty), Tails/Knuckles, super forms.

## 3. Loading models → parcel boundaries

- **(a) nem + maps** — identical to existing `S1_OBJECT_ART_BASE` rows (`nem(...)`). Shield/stars, HUD labels, title screen ×3, title cards, game over, continue ×2, ending ×5, SS results. The parse/render/palette-seed path is 100% shipped; what these lack is a **row + a venue**, because none is a placeable object id (SonLVL objdefs never covered them, so the B5/B6 sweeps rightly skipped them).
- **(b) uncompressed + DPLC** — Sonic, alone in S1. Fully served by shipped code (probe-proven §4).
- **(c) raw tile grid, no mappings** — HUD digits, lives digits, level select font. Nothing in the sprite pipeline can open "just tiles" today: `openDiscoveredSet` requires a mappings file, `SpriteFrame[]` is the document's spine. Smallest honest fix: synthesize one frame per glyph (digits are fixed 8×16 / 8×8 strips) — a ~20-line loader, not a new document type. (c′) covers nem-compressed plane art (Sega logo, JP credits): same synthesized-grid answer after a Nemesis decode.
- **(d) SS blocks** — nem + maps pairs (mapping model is ordinary), but the art↔map binding plus palette line live in `SS_MapIndex`, and correct colors need `Pal_Special` (+ SS palette cycles). Fits the row shape with `tileIndexOffset`-style transcription of SS_MapIndex; last in line because no editor surface asks for it yet.

---

## 4. Side B — what Aurora already has (and the probe)

| Need | Status | Where |
|---|---|---|
| Parse `dplcHeader`/`dplcEntry` ASM text | **SHIPPED** — `parseAsmDPLC` reads macro call-sites, expands `tiles,offset` into per-frame source-tile lists | `src/core/import/asm-mappings.ts:149-166` |
| Parse Ver-1 binary DPLC | SHIPPED (S1 adapter `readDPLC` — byte count, `(tiles-1)<<12\|offset`) | `src/core/formats/games/sonic-dplc.ts:22-51`, `games/s1.ts` |
| Frame-local DPLC tile resolution in the renderer | SHIPPED — `renderFrames(frames, art, dplc)` | `src/core/import/sprite-import.ts:85-94` |
| Uncompressed art | SHIPPED — `CompressionKind 'uncompressed'` identity codec; checkout already maps `link.compression` | `src/core/compress/index.ts:14-20`; `export-sprite.ts:601` |
| Open path that takes mappings + art + optional DPLC | SHIPPED — `DiscoveredSpriteSet.dplc?` → `openDiscoveredSet` → `dplcFromFile` | `sprite-discovery.ts:13-19`; `export-sprite.ts:462-499` |
| **Probe result** | `parseAsmMappings` → 88 frames; `parseAsmDPLC` → 88 entries; max source tile 1288 of 1289; `reconstructFromFrames(…, 'uncompressed', dplc)` → 64×56 canvas, 88 frames; contact sheet (frames 1,8,21,34,47,60,70,80) is **visibly correct Sonic** in `palette/Sonic.bin` colors | scratchpad `sonic-dplc-probe.mts` / `sonic-render.mts`, run via `npx tsx` |
| Manual open today | The "Open sprite…" 3-file pick (`openSprite`, S1 + uncompressed + DPLC file) should already open Sonic — every stage is the probed code. UNVERIFIED as an in-app click-through only. The scan list can't: s1 discovery never pairs a DPLC (`sprite-discovery.ts:55-58`) and `isDplcName` hides the Gfx script from the set list (:26 — correctly) | |

### What's actually missing (the whole gap)

1. **Row shape**: `ObjectArtLink` has no DPLC field (`s1-object-art.ts:101-108`), and `editObjectArtCheckout` builds its `DiscoveredSpriteSet` without one (`export-sprite.ts:602`). A `dplc(artFile, mapAsm, dplcAsm, frame, pal)` constructor + `dplcAsm?: string` threaded into the set is the entire Parcel A core. Sonic's row: id `$01`, zone-free, `pal 0`, `compression 'uncompressed'` — currently named-excluded ("[Sonic] start entry uses a DPLC frame, not a flat mapping — excluded", `s1-object-art.ts:73-75`).
2. **Save-back**: `captureS1ArtSource` guards `game==='s1' && !hasDplc && artCompression==='nemesis'` (`export-sprite.ts:196`) — so Sonic (DPLC) AND every uncompressed/raw family open **edit/export-only, no in-place save**, exactly like Giant Ring `0x4b` today. Openable ≠ save-backable; that extension (`s1-art-write.ts` is Nemesis-only by design, header lines 1-17) is orthogonal to every parcel here.
3. **Venue for non-object families**: sprite-doc tabs are keyed `engine:'s1', ref:<bare numeric object id>` — `Number(ref.ref)` at `tab-activation/sprite.ts:128` and `SpriteDocUnloaded.tsx:43`, `editObjectArtCheckout(id: number)`. Title/continue/ending/SS families have no object id in the table's sense. They need either a ref-namespace extension (e.g. `s1fam:<name>`) with a small transcribed family table (name → art/maps/frame/pal + palette FILE, since `checkoutPaletteLine` only reads LEVEL palettes — `Pal_Title`/`Pal_Continue`/`Pal_Ending`/`Pal_SSResult` come from `_inc/Palette Index.asm` bincludes, not acts), or honest ids where a real object exists ($38 shield, $39 game over, $34 title card, $0E/$0F title, $80/$81 continue, $87-$8A ending — all real `_incObj` ids, just not placeable/objdef'd).
4. **Explorer gate**: the Object Library disables every row when `!levelDocReady` (`explorer-data.ts:104-114`) — 176291f's level-free open shipped in tab restore/self-serve, not in the Explorer. Zone-free rows (Sonic included) want the `objectArtIsZoneFree` exemption there.
5. **Raw grids**: model (c) needs the small synthesized-frames loader (§3); nothing existing covers it (`TileTab`/art facet are LevelDoc-pool-tied).

---

## 5. Recommended parcel cut (in order)

**Parcel A — Sonic (owner-named, probe-proven, smallest).**
`dplcAsm?` on `ObjectArtLink` + `dplc()` constructor + the `$01` row (zone-free, pal 0, uncompressed) + one line in `editObjectArtCheckout` passing `link.dplcAsm` into the set + the Explorer zone-free exemption (§4.4). Anims stay excluded (sonani dialect — the anim audit's standing TAG); the timeline opens empty-but-honest exactly as `resolveObjectAnims` already treats Sonic. Acceptance: checkout test à la `edit-art-handoff.test.ts:119` asserting the set carries the DPLC path + comp, plus a node-side render assert against the real files (the probe, promoted to a test).
**Depends on `feat/s1-boss-sprites` landing first** — both edit `s1-object-art.ts` (frozen for this audit) and plausibly the checkout; rebasing a one-field row change is cheap, the other direction isn't.

**Parcel B — the (a)-model families: venue + family table.**
The ref-namespace decision (§4.3) plus a transcribed table for: shield/stars, HUD labels, title screen ×3, title cards (+ standalone game over), continue, ending suite, SS results — each `{art, mapAsm, frame, pal, palFile}`. Zero new parsing; the work is the tab/Explorer surface and non-level palette seeding. This is the "and other things like that" bulk: ~12 families in one venue change. After A (A settles the row-shape edit and lands the same-file conflicts first).

**Parcel C — raw grids (c)/(c′).**
Synthesized-frames loader for `HUD Numbers.unc` (12 × 8×16), `Lives Counter Numbers.unc` (10 × 8×8), `Level Select & Debug Text.unc` (41 glyphs), optionally Sega logo / JP credits post-Nemesis-decode. Read-only. Rides on B's venue; pointless before it.

**Parcel D — SS blocks (d).**
Transcribe `SS_MapIndex` (art tile bases + pal per block) into rows with `tileIndexOffset` semantics, `Pal_Special` seeding. Ordinary mappings underneath; deferred because nothing in the editor asks for SS content yet.

**Cross-cutting, any time after A**: uncompressed/DPLC save-back (lift the `captureS1ArtSource` guard with an uncompressed writer — easier than the Nemesis path it mirrors; DPLC write-back must patch the shared source pool, watching tiles referenced by multiple frames).

## 6. UNVERIFIED / TAGGED

- The in-app 3-file manual open of Sonic ("Open sprite…"): every stage probe-verified in node; the Electron click-through itself not run. TAG: CDP once Parcel A branches.
- Title Cards multi-table parse behavior (merged frame order, skipped inner `include`) read from `collectBlocks`, not probed.
- `SS_MapIndex` entry layout (frame id, mappings ptr, VRAM settings word) read from the loader loop (`Special Stage Loading & Drawing.asm:595-605`); per-block art-tile/pal values not transcribed — that's Parcel D's authoring task.
- Whether `feat/s1-boss-sprites` also touches `editObjectArtCheckout`/Explorer (assumed plausible; branch not read — it's owned).
- Palette-cycle fidelity for SS/title water cycles: out of scope for static docs (`Cycle - *.bin` files exist; no parcel here plays them).
