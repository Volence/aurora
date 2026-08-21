// Sonic 1 object id → sprite-art linkage. Pure data (like profiles/s1.ts and
// s1-objects.ts): id → { artFile, mapAsm, frame, pal, compression } transcribed
// ONCE, at authoring time, from s1disasm's SonLVL object definitions —
//   `s1disasm/Utility Project Files/SonLVL INI Files/_ObjDef/*.ini`
// and the XML / C# definition files those INIs reference (resolved relative to
// the `SonLVL INI Files/` directory). Aurora never parses those files at runtime.
//
// THREE OBJDEF FLAVORS were read to build this table:
//   • direct INI entries — `art=…/mapasm=…/frame=…/pal=…` fields.
//   • `xmlfile=` XML `<ObjDef>` definitions — the default image is the top-level
//     `Image="…"` id; its `<ImageFromMappings>` gives `<ArtFile>` + `<MapFile
//     frame= startpal=>`. `startpal` is the palette line.
//   • `codetype=`/`codefile=` C# sources — the object's default `Image` is a
//     `MapASMToBmp(art, mapAsm, frame, startpal)` call; those four args map here.
//
// CURATION (B5 full sweep): every objdef across base + all six per-zone INIs that
// SonLVL can draw statically from a standalone `.nem`/`.unc` art file is now linked
// — badniks, monitors, springs, spikes, signpost, egg prison, bridges, swinging
// platforms, spiked poles, breakable/edge walls, LZ pole/door/harpoon/waterfall/
// bubbles/conveyor, MZ switch/pushable/smashable/moving blocks, SBZ spinning/saws/
// flamethrower/stomper, SLZ fan/seesaw, and the common scenery. Subtype-dependent
// draws (bridge log count, monitor icon, spike rows, spring orientation, swinging
// chain length, …) get COMPOSED frames from object-subtype-rules.ts on top of the
// single default frame here.
//
// B6 CLOSEOUT: the two families the B5 skip list bucketed as "needs a separate
// pipeline" are now LINKED. LevelArt objects use `artSource:'levelArt'` (tiles from
// `LevelDoc.tiles`, the act's VRAM-ordered pool — mirrors SonLVLAPI ObjectHelper.
// LevelArt); offset-art objects use `off()` (tile pool shifted by the SonLVL byte
// `offset=`, exactly as MultiFileIndexer<byte> does). Now linked:
//   • LevelArt: GHZ Platform ($18: rule → "Large"=frame1) + Collapsing Cliff ($1A:
//     subtype→frame), MZ Grass Platform ($2F: Sprite bits→frame) + Brick ($46), SLZ
//     Platform ($18) + Elevator ($59) + Circling Platform ($5A) + Stairs ($5B:
//     4-piece composite), SYZ Siren Light ($12) + Platform ($18) + Block ($56: rule
//     → (subtype&0x70)>>4 frame).
//   • offset-art: Switch ($32, offset −128 = skip 4 tiles) in LZ/SBZ/SYZ; LZ Block/
//     Cork ($61, Cork offset 9024 = +282 tiles default; subtype rule for the other
//     three variants — each its own .nem + offset).
//
// Deliberately UNLINKED (keep the viewport's hex-box fallback), with reasons:
//   • dual/multi-art default (composites several DIFFERENT art files in one image —
//     not a single-file tile pool + offset): MZ Sideways Stomper ($45), SBZ Rotating
//     Junction ($66). A per-image multi-file art indexer is out of B6 scope.
//   • debug / invisible / trigger markers (drawn as ghost markers, see
//     s1-objects.ts S1_INVISIBLE_OBJECT_IDS): Fireball Spawner ($13), Waterfall SFX
//     ($49), Invisible Lava Marker ($54), Conveyor Controller ($68), Invisible Block
//     ($71), Teleporter ($72).
//   (Post-B6 red-box sweep: $6B/$6F — formerly bucketed as name-only INI blobs —
//   plus MZ $31/$4C and SLZ $56 are now linked by transcribing art/mappings from
//   the disasm SOURCE (_incObj obMap/obGfx + PLCs) where SonLVL has no objdef at
//   all; and SBZ aliases the LZ links SBZ3 places, since SBZ3 is the engine's
//   "LZ act 4". Rules aliased accordingly in object-subtype-rules.ts.)
//   • Ending Animals ($28): the ending act is not a placeable zone in this profile
//     (zones are ghz/mz/syz/lz/slz/sbz), so there is nowhere to scope it.
// Orbinaut's XML default is a spikeball+body composite; we preview its recognizable
// body frame (frame 0) alone. Sonic ($01) — long excluded here because the [Sonic]
// start entry uses a DPLC frame, not a flat mapping — is now LINKED via `dplc()`
// (Parcel A of docs/reviews/2026-08-20-s1-nonlevel-art-audit.md): the shipped
// parseAsmDPLC/renderFrames pipeline was probe-proven to render all 88 frames.
//
// ZONE SCOPING: SonLVL merges a base `obj.ini` with a per-zone `objXXX.ini` that
// can REDEFINE an id (e.g. $1C is GHZ's "Bridge stump" but SLZ's "Fireball
// Thrower"; $53 "Collapsing Floor" has different art in MZ/SLZ/SBZ). The badniks
// live ONLY in the per-zone INIs (base obj.ini names just the global objects), so
// most entries are zone-scoped. `resolveObjectArt(id, zone)` checks the zone map
// first, then the base map.
//
// PATHS are rewritten INI-relative → disasm-relative exactly as profiles/s1.ts
// did: the INI's `../../artnem/X.nem` becomes `artnem/X.nem`, `../../_maps/X.asm`
// becomes `_maps/X.asm`.

/** How an object's 8x8 art file is stored on disk. */
export type ObjectArtCompression = 'nemesis' | 'uncompressed';

/**
 * Where an object's tile art comes from (B6):
 *   • `'file'`     — a standalone `.nem`/`.unc` art file (`artFile`) decoded on its own.
 *   • `'levelArt'` — the ACT's own VRAM-ordered tile pool (`LevelDoc.tiles`); the
 *     mappings' tile indices point straight into that pool. Mirrors SonLVLAPI's
 *     `ObjectHelper.LevelArt` (= `LevelData.TileArray`, the whole level tile blob),
 *     which `MapASMToBmp` indexes exactly like a file. `artFile` is the sentinel
 *     `'LevelArt'` and is NOT read from disk.
 */
export type ObjectArtSource = 'file' | 'levelArt';

/**
 * The art + mappings needed to render one object's default preview frame. Paths
 * are disasm-relative POSIX. `pal` is the palette LINE (0..3) — the objdef's
 * `pal=` / XML `startpal` / C# `MapASMToBmp` startpal arg — used to pick
 * `doc.palettes[pal]`. `frame` indexes the mappings' frame table.
 *
 * `artSource` selects the tile pool (see ObjectArtSource). `tileIndexOffset` is a
 * TILE shift derived from SonLVL's XML `offset=` byte value as `offset / 32` (all
 * real S1 offsets are multiples of 32). The renderer builds the effective tile pool
 * EXACTLY as SonLVLAPI's `MultiFileIndexer<byte>` does: `combined[i] = raw[i −
 * offsetBytes]`, so mapping tile T resolves to raw tile `T − tileIndexOffset`. A
 * negative offset (Switch `offset="-128"` → −4) drops the first N leading tiles; a
 * positive offset (LZ Cork `offset="9024"` → +282) prepends N blank tiles. `0` /
 * absent = the mappings index the pool directly (every LevelArt def, and plain
 * `.nem` files).
 */
/**
 * One ADDITIONAL art file composited into a doc's tile space (beyond the row's
 * `artFile`, which is always the pool's tile 0). `tileBase` is the tile index
 * where this file's tile 0 lands — the VRAM-RELATIVE offset between the two
 * PLC load addresses, transcribed (and cited on the row) from the disasm's
 * ArtTile constants. This mirrors what the engine does in VRAM: one obGfx
 * base, N nem files loaded at fixed offsets from it, mappings whose tile
 * indices span the whole space. Gaps between slices are blank tiles (no
 * mapping references them). Save-back stays PRIMARY-only: s1ArtSource captures
 * `artFile`'s tiles alone, and the write-back's per-piece guard skips pieces
 * whose tiles fall outside that pool — secondary pixels render, never write.
 */
export interface ObjectArtExtraSource {
  artFile: string;
  compression: ObjectArtCompression;
  tileBase: number;
}

/**
 * A per-frame-range REPLACEMENT art pool: mapping frames `firstFrame..lastFrame`
 * (inclusive) draw their tiles from `artFile` INSTEAD of the row's primary art.
 * This transcribes an engine pattern `sources` cannot: the object code swaps
 * `obGfx` to a DIFFERENT ArtTile base for certain frames (Spring: `_incObj/41
 * Springs.asm:54-58` sets obFrame 3 + ArtTile_Spring_Vertical for sideways
 * springs), so those frames' tile indices are relative to the OTHER file's tile
 * 0 — not offsets into a shared composite pool. Save-back is refused for rows
 * carrying these (frames from two files, one save target — a single-file write
 * would corrupt one of them); see captureS1ArtSource.
 */
export interface ObjectArtFrameSource {
  firstFrame: number;
  lastFrame: number;
  artFile: string;
  compression: ObjectArtCompression;
}

export interface ObjectArtLink {
  artFile: string;
  mapAsm: string;
  frame: number;
  pal: number;
  compression: ObjectArtCompression;
  artSource: ObjectArtSource;
  tileIndexOffset?: number;
  /**
   * DPLC (dynamic pattern load cue) script, for streamed-art objects: the
   * `.asm` whose per-frame `dplcEntry tiles,offset` lists resolve each frame's
   * FRAME-LOCAL mapping tile indices into the shared art pool. Sonic ($01) is
   * S1's only such object. Rows carrying this open edit/export-only — see
   * captureS1ArtSource (frames share source tiles in the pool, so an in-place
   * write of one frame would rewrite others).
   */
  dplcAsm?: string;
  /** Additional art files at their VRAM-relative tile offsets (see ObjectArtExtraSource). */
  sources?: ObjectArtExtraSource[];
  /** Per-frame-range replacement art pools (see ObjectArtFrameSource). */
  frameSources?: ObjectArtFrameSource[];
}

const nem = (
  artFile: string, mapAsm: string, frame: number, pal: number,
): ObjectArtLink => ({ artFile, mapAsm, frame, pal, compression: 'nemesis', artSource: 'file' });

const unc = (
  artFile: string, mapAsm: string, frame: number, pal: number,
): ObjectArtLink => ({ artFile, mapAsm, frame, pal, compression: 'uncompressed', artSource: 'file' });

/**
 * A DPLC (streamed-art) link: uncompressed art pool + mappings whose tile
 * indices are FRAME-LOCAL, resolved through `dplcAsm`'s per-frame source-tile
 * lists (Ver-1 `dplcHeader`/`dplcEntry` macros — s1disasm/_maps/_MapMacros.asm:
 * 62-81). Sonic is the only S1 case (audit §1: SonicMappingsVer/SonicDplcVer = 1,
 * sonic.asm:68-69).
 */
const dplc = (
  artFile: string, mapAsm: string, dplcAsm: string, frame: number, pal: number,
): ObjectArtLink => ({ artFile, mapAsm, dplcAsm, frame, pal, compression: 'uncompressed', artSource: 'file' });

/**
 * A LevelArt-backed link: tiles come from `LevelDoc.tiles` (the act's own pool), not
 * a `.nem`. `artFile` is the SonLVL sentinel `'LevelArt'` (never read from disk);
 * `compression` is irrelevant for this source but kept `uncompressed` for shape.
 */
const lvl = (
  mapAsm: string, frame: number, pal: number,
): ObjectArtLink => ({ artFile: 'LevelArt', mapAsm, frame, pal, compression: 'uncompressed', artSource: 'levelArt' });

/**
 * An offset-art `.nem` link: `offsetBytes` is the SonLVL XML `offset=` value in
 * BYTES (e.g. Switch −128, LZ Cork 9024); stored here as `tileIndexOffset =
 * offsetBytes / 32` tiles. See ObjectArtLink for the exact tile-pool math.
 */
const off = (
  artFile: string, mapAsm: string, frame: number, pal: number, offsetBytes: number,
): ObjectArtLink => ({
  artFile, mapAsm, frame, pal, compression: 'nemesis', artSource: 'file',
  tileIndexOffset: offsetBytes / 32,
});

// --- Badniks / scenery shared across several zones (deduped constants) -------
const CRABMEAT = nem('artnem/Enemy Crabmeat.nem', '_maps/Crabmeat.asm', 0, 0);
const BUZZ_BOMBER = nem('artnem/Enemy Buzz Bomber.nem', '_maps/Buzz Bomber.asm', 0, 0);
const YADRIN = nem('artnem/Enemy Yadrin.nem', '_maps/Yadrin.asm', 0, 1);
const CATERKILLER = nem('artnem/Enemy Caterkiller.nem', '_maps/Caterkiller.asm', 0, 1);
const BOMB = nem('artnem/Enemy Bomb.nem', '_maps/Bomb Enemy.asm', 0, 0);
// GHZ Swinging Platform art (SwingingPlatform.cs hardcodes it for GHZ *and* MZ). The
// single-frame default preview is the platform (frame 0); the $15 subtype rule
// composes anchor (frame 2) + chain links (frame 1) + platform (frame 0).
const SWINGING_PLATFORM = nem('artnem/GHZ Swinging Platform.nem', '_maps/Swinging Platforms (GHZ).asm', 0, 2);

// --- Bosses (transcribed from the disasm SOURCE — SonLVL has no boss objdefs) --
//
// SonLVL's INIs define NO section for any boss id, so every row below is
// transcribed from `_incObj` obMap/obGfx writes plus the PLC that loads the art
// (the same treatment as the MZ $31/$4C and SBZ $6B/$6F rows above). The zone
// bosses all draw Eggman's shared base art: `Nem_Eggman: binclude "artnem/Boss -
// Main.nem"` (sonic.asm:4793), queued by `PLC_Boss` (_inc/Pattern Load
// Cues.asm:285) — ONE shared binclude, not zone-stored, so those ids live in the
// BASE map and classify zone-free (level-free open), exactly like Ring.
//
// MULTI-SOURCE HONESTY: several bosses composite MORE than one art file at
// runtime; the checkout model supports one `artFile` per row, so each row is the
// object's OWN slot's primary source and the composite parts are named here:
//   • Eggman ($3D/$73/$75/$77/$7A): the ship + face sub-slots draw Map_Eggman
//     frames 0-7 from Nem_Eggman; the escape-flame frames 11/12 index tile
//     $12A+ — past Nem_Eggman's pool and into Nem_Exhaust — CLOSED by the
//     row's `sources` slice (citations on the EGGMAN const below): one maps
//     file whose tile indices span N nem files at VRAM-relative offsets is
//     exactly what `sources` composites. (Contrast $48: its parts are
//     different maps FILES, which `sources` cannot merge.)
//   • Wrecking Ball ($48): three maps FILES at runtime — the ball (Map_GBall /
//     Nem_Ball, the row below: the recognizable sprite leads the doc), chain
//     links (Map_Swing_GHZ frame 1 / ArtTile_GHZ_MZ_Swing — $15's file pair),
//     and the chain anchor (Map_BossItems .chainanchor1 / Nem_Weapons) — the
//     anchor is the part beyond the one-file row now.
//   • SLZ Spikeball ($7B): the explosion shrapnel (routine $A) swaps to
//     Map_BSBall, whose tiles $27/$28 read the Nem_Bomb underlay PLC_Boss loads
//     UNDER the spikeball art (:288 "gets overwritten" — only the first $12 tiles
//     are) — a VRAM-layering trick a single-file checkout cannot reproduce.
//   • SBZ2 Eggman ($82): the spawned switch sub-slot draws Map_But from
//     Nem_LzSwitch at ArtTile_Eggman_Button-4 (PLC_EggmanSBZ2:434).
//   • FZ Eggman ($85): SIX slots — exposed Eggman (Map_SEgg/Nem_Sbz2Eggman, the
//     object's own slot, transcribed below), cockpit cylinder (Map_EggCyl/
//     Nem_FzBoss), legs (Map_FZLegs, _maps/FZ Eggmobile Legs.asm, from
//     Nem_FzEggman at ArtTile_FZ_Eggman_Fleeing, PLC_FZBoss:441), and ship+flame
//     (Map_Eggman/Nem_Eggman).
//   • FZ Plasma ($86): the launcher is the object's own slot (below); the balls
//     it spawns (routine 8) draw Map_Plasma at ArtTile_FZ_Boss|Tile_Pal2 → same
//     Nem_FzBoss file, palette line 1.
//
// The shared Eggman ship row (frame 0 = .ship; obGfx = ArtTile_Eggman, no
// Tile_Pal bits → palette line 0). `sources` composites Nem_Exhaust into the
// tile space at $12A — the VRAM-relative offset the escapeflame frames were
// written against: ArtTile_Eggman equ $400 / ArtTile_Eggman_Exhaust equ
// ArtTile_Eggman+$12A (_Constants.asm:579/584), PLC_Boss loads Nem_Eggman at
// ArtTile_Eggman and Nem_Exhaust "artnem/Boss - Exhaust Flame.nem"
// (sonic.asm:4805) at ArtTile_Eggman_Exhaust (_inc/Pattern Load Cues.asm:
// 286/290; PLC_FZBoss repeats the pair at :445). Map_Eggman's .escapeflame1/2
// index tiles $12A-$13A — past Nem_Eggman's $6C tiles and exactly onto
// Nem_Exhaust's $11 (Nemesis headers) — so without this slice the tail frames
// rendered blank (owner-recorded limitation, now closed).
const EGGMAN: ObjectArtLink = {
  ...nem('artnem/Boss - Main.nem', '_maps/Eggman.asm', 0, 0),
  sources: [{ artFile: 'artnem/Boss - Exhaust Flame.nem', compression: 'nemesis', tileBase: 0x12A }],
};

/**
 * The base linkage (from `obj.ini` + the XML / C# defs it references). These
 * apply in EVERY zone unless a per-zone override below redefines the id.
 */
export const S1_OBJECT_ART_BASE: Readonly<Record<number, ObjectArtLink>> = {
  // Sonic ($01) — the player object, S1's ONLY DPLC (streamed-art) sprite.
  // Art = Art_Sonic "artunc/Sonic.unc" (sonic.asm:4412; 41,248 B = 1,289 tiles,
  // uncompressed); maps = Map_Sonic "_maps/Sonic.asm" (88 frames, all plain
  // spritePiece literals); DPLC = SonicDynPLC "_maps/Sonic - Dynamic Gfx
  // Script.asm" (sonic.asm:4410; 88 entries, 1:1 with mapping frames, offsets
  // in TILES). Palette LINE 0: Pal_Sonic → v_palette_line_1, the FIRST CRAM
  // line (_inc/Palette Index.asm:19,51; _Variables.asm:317-321). Zone-free by
  // construction: one binclude streamed per frame to ArtTile_Sonic = $780
  // (_Constants.asm:571, sonic.asm:832-835) in EVERY zone — no zone map may
  // claim $01. Default frame 1 = MS_Stand, the standing frame (frame 0 is
  // MS_Null/SonPLC_Null — the empty null frame, a blank doc lead). All facts
  // probe-verified in docs/reviews/2026-08-20-s1-nonlevel-art-audit.md §1/§4.
  0x01: dplc('artunc/Sonic.unc', '_maps/Sonic.asm', '_maps/Sonic - Dynamic Gfx Script.asm', 1, 0),
  0x0d: nem('artnem/Signpost.nem', '_maps/Signpost.asm', 0, 0), // Signpost
  0x25: nem('artnem/Rings.nem', '_maps/Rings (REV00).asm', 0, 1), // Ring (Ring.cs: startpal 1)
  0x26: nem('artnem/Monitors.nem', '_maps/Monitor.asm', 0, 0), // Monitor (Monitor.xml Image="img")
  0x36: nem('artnem/Spikes.nem', '_maps/Spikes.asm', 0, 0), // Spikes (Spikes.xml Image="img1")
  0x3e: nem('artnem/Prison Capsule.nem', '_maps/Prison Capsule.asm', 0, 0), // Egg Prison (capsule)
  // Spring ($41): Map_Spring has 6 frames — 0-2 upright (drawn at
  // ArtTile_Spring_Horizontal → Nem_HSpring "artnem/Spring Horizontal.nem"),
  // 3-5 sideways (.spg_Left/LeftFlat/LeftExt). The object code SWAPS the art
  // base for sideways springs: `_incObj/41 Springs.asm:54-58` sets obFrame 3 +
  // `move.w #ArtTile_Spring_Vertical,obGfx` (→ Nem_VSpring "artnem/Spring
  // Vertical.nem"; ArtTile_Spring_Horizontal equ $523 / ArtTile_Spring_Vertical
  // equ $533, _Constants.asm:554-555), so frames 3-5's tile indices are
  // relative to Nem_VSpring's tile 0 — a per-frame pool replacement, not a
  // composite offset (`sources` can't express it). Without the frameSources
  // slice, frames 3-5 rendered from the horizontal-spring tiles (owner
  // screenshot, render-bugs parcel).
  0x41: {
    ...nem('artnem/Spring Horizontal.nem', '_maps/Springs.asm', 0, 0), // Spring (redvert)
    frameSources: [{ firstFrame: 3, lastFrame: 5, artFile: 'artnem/Spring Vertical.nem', compression: 'nemesis' }],
  },
  0x4b: unc('artunc/Giant Ring.unc', '_maps/Giant Ring.asm', 0, 1), // Giant ring (uncompressed, pal 1)
  0x79: nem('artnem/Lamppost.nem', '_maps/Lamppost.asm', 0, 0), // Lamppost
  0x7d: nem('artnem/Hidden Bonuses.nem', '_maps/Hidden Bonuses.asm', 3, 0), // Point bonus (img100 = frame 3)

  // --- Bosses (see the boss provenance block above the EGGMAN const) --------
  // Zone bosses on Eggman's shared ship art. obMap/obGfx citations, all
  // `move.l #Map_Eggman,obMap` + `move.w #ArtTile_Eggman,obGfx` (line 0):
  0x3d: EGGMAN, // GHZ boss — _incObj/3D, 48 Boss - GHZ Main and Wrecking Ball.asm:44-45
  0x73: EGGMAN, // MZ boss — _incObj/73, 74 Boss - MZ Main and Fire.asm:59-60
  0x75: EGGMAN, // SYZ boss — _incObj/75, 76 Boss - SYZ Main and Blocks.asm:61-62
  0x77: EGGMAN, // LZ boss — _incObj/77 Boss - LZ Main.asm:58-59
  0x7a: EGGMAN, // SLZ boss — _incObj/7A, 7B Boss - SLZ Main and Spike Balls.asm:64-65
  // Wrecking Ball ($48): the doc LEADS with the BALL — the sprite the owner
  // (and the player) knows as "the wrecking ball" (owner finding 2026-08-20:
  // the old row led with the anchor's Map_BossItems and showed chain/debris
  // with no ball). Obj48's final spawned slot draws Map_GBall at
  // ArtTile_GHZ_Giant_Ball|Tile_Pal3 with obFrame=1 (_incObj/3D, 48 …:479-481;
  // frames 0/1 then alternate via `bchg #0,obFrame` in GBall_UpdateBase, so
  // frame 0 `.shiny` — the ball with its shine — leads the doc). Maps =
  // Map_GBall "_maps/GHZ Ball.asm" (sonic.asm:4094; 4 frames .shiny/.check1/
  // .check2/.check3); art = Nem_Ball "artnem/GHZ Giant Ball.nem" (sonic.asm:
  // 4502) queued at ArtTile_GHZ_Giant_Ball = $3AA by PLC_GHZ2 (_inc/Pattern
  // Load Cues.asm:126; _Constants.asm:460) — a standalone binclude, so the
  // level-free open stays honest. Tile_Pal3 equ 2<<13 (_Constants.asm:438) →
  // palette LINE 2. The other two pairs Obj48 draws are different maps FILES
  // (multi-source note above): chain links = Map_Swing_GHZ frame 1 (:459-461,
  // reachable via $15's doc — same file pair as SWINGING_PLATFORM); chain
  // anchor = Map_BossItems frame 0 @ ArtTile_Eggman_Weapons (:443-444,
  // Nem_Weapons via PLC_Boss:286) — no doc doorway anymore; cut reported.
  0x48: nem('artnem/GHZ Giant Ball.nem', '_maps/GHZ Ball.asm', 0, 2),
  // SLZ Spikeball ($7B): own slot = Map_SSawBall, obFrame set to 1 (.silver) at
  // ArtTile_Eggman_Spikeball, no pal bits → line 0 (_incObj/7A, 7B …:534-537);
  // art = Nem_SlzSpike "artnem/SLZ Little Spikeball.nem" (sonic.asm:4578) queued
  // there by PLC_Boss (:289, over the Nem_Bomb underlay :288). Shrapnel is
  // multi-source (above).
  0x7b: nem('artnem/SLZ Little Spikeball.nem', '_maps/Seesaw Ball.asm', 1, 0),
  // SBZ2 Eggman cutscene ($82): Map_SEgg + ArtTile_Eggman, no pal bits → line 0
  // (_incObj/82, 83 SBZ Eggman Cutscene and Crumbling Floor.asm:45-46); art =
  // Nem_Sbz2Eggman "artnem/Boss - Eggman in SBZ2 & FZ.nem" (sonic.asm:4799),
  // queued AT ArtTile_Eggman by PLC_EggmanSBZ2 (:433).
  0x82: nem('artnem/Boss - Eggman in SBZ2 & FZ.nem', '_maps/Eggman - Scrap Brain 2.asm', 0, 0),
  // Crumbling floor ($83): Map_FFloor + ArtTile_Eggman_Trap_Floor|Tile_Pal3 →
  // line 2 (_incObj/82, 83 …:237-238); art = Nem_SbzBlock "artnem/SBZ Vanishing
  // Block.nem" (sonic.asm:4624) queued at that tile by PLC_EggmanSBZ2 (:432).
  0x83: nem('artnem/SBZ Vanishing Block.nem', "_maps/SBZ Eggman's Crumbling Floor.asm", 0, 2),
  // FZ cylinder ($84): Map_EggCyl + ArtTile_FZ_Boss, no pal bits → line 0
  // (_incObj/85,84,86 Boss - FZ Main, Cylinders, and Plasma Balls.asm:770-771);
  // art = Nem_FzBoss "artnem/Boss - Final Zone.nem" (sonic.asm:4801) queued at
  // ArtTile_FZ_Boss by PLC_FZBoss (:442).
  0x84: nem('artnem/Boss - Final Zone.nem', "_maps/FZ Eggman's Cylinders.asm", 0, 0),
  // FZ Eggman ($85): the object's OWN slot is BossFinal_ObjData row 1 —
  // Map_SEgg at ArtTile_FZ_Eggman_No_Vehicle, no pal bits → line 0 (_incObj/
  // 85,84,86 …:39-40 with the table-driven init at :89-93); art = Nem_Sbz2Eggman
  // queued AT that tile by PLC_FZBoss (:444). The other five slots are the
  // multi-source composite named above.
  0x85: nem('artnem/Boss - Eggman in SBZ2 & FZ.nem', '_maps/Eggman - Scrap Brain 2.asm', 0, 0),
  // FZ plasma launcher ($86): routine 0 = Map_PLaunch + ArtTile_FZ_Boss, no pal
  // bits → line 0 (_incObj/85,84,86 …:993-994); same Nem_FzBoss file as $84
  // (Map_PLaunch's .red starts at tile $6E inside it). Balls are multi-source.
  0x86: nem('artnem/Boss - Final Zone.nem', '_maps/Plasma Ball Launcher.asm', 0, 0),
};

/**
 * The LZ zone links, hoisted to a named map because Scrap Brain Act 3 is the
 * engine's "LZ act 4" (the profile keeps it under zone 'sbz' but its objpos
 * places LZ objects) — the sbz map below aliases the entries SBZ3 actually uses.
 */
const LZ_LINKS: Readonly<Record<number, ObjectArtLink>> = {
  0x0b: nem('artnem/LZ Breakable Pole.nem', '_maps/Pole that Breaks.asm', 0, 2), // Pole (Pole.xml)
  0x0c: nem('artnem/LZ Flapping Door.nem', '_maps/Flapping Door.asm', 0, 2), // Flapping Door (FlappingDoor.xml)
  0x16: nem('artnem/LZ Harpoon.nem', '_maps/Harpoon.asm', 3, 0), // Harpoon (Harpoon.xml, default "vertical" = frame 3)
  0x32: off('artnem/Switch.nem', '_maps/Button.asm', 0, 0, -128), // Switch (Common/Switch.xml offset=-128 → skip 4 tiles)
  0x61: off('artnem/LZ Cork.nem', '_maps/LZ Blocks.asm', 2, 2, 9024), // Block/Cork (LZ/Block.xml default "Cork" offset=9024 → +282 tiles; subtype rule for other variants)
  0x52: nem('artnem/LZ 32x16 Block.nem', '_maps/Moving Blocks (LZ).asm', 0, 2), // Moving Block (MovingBlocks.xml)
  0x56: nem('artnem/LZ Vertical Door.nem', '_maps/Floating Blocks and Doors.asm', 6, 2), // Door (Door.xml, "vertical" = frame 6)
  0x63: nem('artnem/LZ Wheel.nem', '_maps/LZ Conveyor.asm', 0, 0), // Conveyor Belt wheel (ConveyorBelt.xml)
  0x64: nem('artnem/LZ Bubbles & Countdown.nem', '_maps/Bubbles.asm', 19, 0), // Bubbles (Bubbles.xml, img1 = frame 19)
  0x65: nem('artnem/LZ Water & Splashes.nem', '_maps/Waterfalls.asm', 9, 2), // Waterfall (Waterfall.xml, img10 = frame 9)
  0x2c: nem('artnem/Enemy Jaws.nem', '_maps/Jaws.asm', 0, 1), // Jaws (Jaws.xml)
  0x2d: nem('artnem/Enemy Burrobot.nem', '_maps/Burrobot.asm', 2, 0), // Burrobot (frame 2)
  0x57: nem('artnem/LZ Spiked Ball & Chain.nem', '_maps/Spiked Ball and Chain (LZ).asm', 1, 0), // Spikeball (frame 1)
  0x60: nem('artnem/Enemy Orbinaut.nem', '_maps/Orbinaut.asm', 0, 0), // Orbinaut (body frame)
  0x62: nem('artnem/LZ Gargoyle & Fireball.nem', '_maps/Gargoyle.asm', 0, 2), // Gargoyle
};

/**
 * Per-zone overrides / additions, keyed by the profile zone id (lowercase, as in
 * `ZoneActRef.zone`: ghz/mz/syz/lz/slz/sbz). An entry here wins over the base map
 * for the same id in that zone.
 */
export const S1_OBJECT_ART_ZONE: Readonly<Record<string, Readonly<Record<number, ObjectArtLink>>>> = {
  ghz: {
    0x11: nem('artnem/GHZ Bridge.nem', '_maps/Bridge.asm', 0, 2), // Bridge (Bridge.cs; subtype rule)
    0x15: SWINGING_PLATFORM, // Swinging Platform (SwingingPlatform.cs; subtype rule)
    0x17: nem('artnem/GHZ Spiked Log.nem', '_maps/Spiked Pole Helix.asm', 0, 2), // Spiked pole (SpikedPole.cs; subtype rule)
    0x18: lvl('_maps/Platforms (GHZ).asm', 0, 2), // Platform (Platform.xml LevelArt; subtype rule: "Large" → frame 1)
    0x1a: lvl('_maps/Collapsing Ledge.asm', 0, 2), // Collapsing Cliff (CollapsingCliff.xml LevelArt; subtype 1 → shadow frame 1)
    0x1c: nem('artnem/GHZ Bridge.nem', '_maps/Bridge.asm', 1, 2), // Bridge stump (frame 1)
    0x1f: CRABMEAT,
    0x22: BUZZ_BOMBER,
    0x2b: nem('artnem/Enemy Chopper.nem', '_maps/Chopper.asm', 0, 0), // Chopper
    0x3b: nem('artnem/GHZ Purple Rock.nem', '_maps/Purple Rock.asm', 0, 3), // Purple rock
    0x3c: nem('artnem/GHZ Breakable Wall.nem', '_maps/Smashable Walls.asm', 0, 2), // Breakable wall (BreakableWall.xml; subtype rule)
    0x40: nem('artnem/Enemy Motobug.nem', '_maps/Moto Bug.asm', 0, 0), // Moto Bug
    0x42: nem('artnem/Enemy Newtron.nem', '_maps/Newtron.asm', 3, 0), // Newtron (img1 = frame 3; subtype rule)
    0x44: nem('artnem/GHZ Edge Wall.nem', '_maps/GHZ Edge Walls.asm', 0, 2), // Wall Barrier (WallBarrier.xml; subtype rule)
  },
  mz: {
    0x15: SWINGING_PLATFORM, // Swinging Platform (reuses GHZ art/class; subtype rule)
    0x22: BUZZ_BOMBER,
    // NOT IN SonLVL: the stock INIs define no [31]/[4C] at all (SonLVL draws them
    // as unknown boxes too). Transcribed directly from the disasm source instead:
    //   _incObj/31: obGfx = ArtTile_MZ_Spike_Stomper (no pal bits → line 0); PLC_MZ
    //     loads Nem_MzMetal there; Map_CStom = _maps/Chained Stompers.asm, frame 0
    //     (.wideblock — frames: 0 block / 1 spikes / 2 ceiling base / 3.. chain).
    //   _incObj/4C: obMap = Map_Geyser (_maps/Lava Geyser.asm), obGfx =
    //     ArtTile_MZ_Lava|Tile_Pal4 → MZ Lava.nem, palette line 3.
    0x31: nem('artnem/MZ Metal Blocks.nem', '_maps/Chained Stompers.asm', 0, 0), // Chained Stompers
    0x4c: nem('artnem/MZ Lava.nem', '_maps/Lava Geyser.asm', 0, 3), // Lava Geyser Maker
    0x2f: lvl('_maps/MZ Large Grassy Platforms.asm', 0, 2), // Grass Platform (MovingPlatform.xml LevelArt; Sprite bits4-5 → frame 0/1/2)
    0x30: nem('artnem/MZ Green Glass Block.nem', '_maps/MZ Large Green Glass Blocks.asm', 0, 2), // Large glass pillar
    0x32: nem('artnem/MZ Switch.nem', '_maps/Button.asm', 0, 2), // Switch (MZ/Switch.xml — own art, no offset)
    0x46: lvl('_maps/MZ Bricks.asm', 0, 2), // Brick (Brick.xml LevelArt)
    0x33: nem('artnem/MZ Green Pushable Block.nem', '_maps/Pushable Blocks.asm', 0, 2), // Pushable block (PushableBlocks.xml)
    0x51: nem('artnem/MZ Green Pushable Block.nem', '_maps/Smashable Green Block.asm', 0, 2), // Smashable block (SmashableBlock.xml)
    0x52: nem('artnem/MZ Green Pushable Block.nem', '_maps/Moving Blocks (MZ and SBZ).asm', 0, 2), // Moving block (MovingBlocks.xml)
    0x4e: nem('artnem/MZ Lava.nem', '_maps/Wall of Lava.asm', 0, 3), // Wall of Lava
    0x50: YADRIN,
    0x53: nem('artnem/MZ Green Pushable Block.nem', '_maps/Collapsing Floors.asm', 0, 2), // Collapsing floor
    0x55: nem('artnem/Enemy Basaran.nem', '_maps/Basaran.asm', 0, 1), // Basaran
    0x78: CATERKILLER,
    // Boss fire ($74): Map_Fire + ArtTile_MZ_Fireball, no pal bits → line 0
    // (_incObj/73, 74 Boss - MZ Main and Fire.asm:546-547). ZONE-scoped, not
    // zone-free: its art Nem_MzFire "artnem/Fireballs.nem" (sonic.asm:4564) is
    // queued by the MZ zone cue PLC_MZ (_inc/Pattern Load Cues.asm:173), not by
    // the shared PLC_Boss list the Eggman rows ride.
    0x74: nem('artnem/Fireballs.nem', '_maps/Fireballs.asm', 0, 0),
  },
  syz: {
    0x12: lvl('_maps/Light.asm', 1, 0), // Siren Light (objSYZ.ini art=LevelArt frame=1 pal=0)
    0x18: lvl('_maps/Platforms (SYZ).asm', 0, 2), // Platform (Platform.xml LevelArt; single frame)
    0x1f: CRABMEAT,
    0x22: BUZZ_BOMBER,
    0x32: off('artnem/Switch.nem', '_maps/Button.asm', 0, 0, -128), // Switch (Common/Switch.xml offset=-128 → skip 4 tiles)
    0x43: nem('artnem/Enemy Roller.nem', '_maps/Roller.asm', 0, 0), // Roller
    0x47: nem('artnem/SYZ Bumper.nem', '_maps/Bumper.asm', 0, 0), // Bumper
    0x50: YADRIN,
    0x56: lvl('_maps/Floating Blocks and Doors.asm', 0, 2), // Block/Platform (SYZ/Block.cs LevelArt; frame = (subtype&0x70)>>4)
    0x57: nem('artnem/SYZ Small Spikeball.nem', '_maps/Spiked Ball and Chain (SYZ).asm', 0, 0), // Spikeball chain
    0x58: nem('artnem/SYZ Large Spikeball.nem', '_maps/Big Spiked Ball.asm', 0, 0), // Big spiked ball
    0x78: CATERKILLER,
    // Boss block ($76): Map_BossBlock + ArtTile_Level|Tile_Pal3 → LevelArt,
    // palette line 2 (_incObj/75, 76 Boss - SYZ Main and Blocks.asm:753-754).
    // ZONE-scoped by construction: LevelArt draws the ACT's own tile pool, so a
    // level-free open is impossible. Linking it here lets the DERIVED pass of
    // s1-levelart-reservations find it (the SYZ_BOSS_BLOCKS supplemental was
    // retired in the same change).
    0x76: lvl('_maps/SYZ Boss Blocks.asm', 0, 2),
  },
  lz: LZ_LINKS,
  slz: {
    0x15: nem('artnem/SLZ Swinging Platform.nem', '_maps/Swinging Platforms (SLZ).asm', 0, 2), // Swinging Platform (SwingingPlatform.cs; subtype rule)
    0x5d: nem('artnem/SLZ Fan.nem', '_maps/Fan.asm', 0, 2), // Fan (Fan.xml)
    0x5e: nem('artnem/SLZ Seesaw.nem', '_maps/Seesaw.asm', 0, 0), // Seesaw (Seesaw.xml)
    0x1c: nem('artnem/SLZ Cannon.nem', '_maps/Scenery.asm', 0, 2), // Fireball thrower (overrides GHZ $1C)
    0x18: lvl('_maps/Platforms (SLZ).asm', 0, 2), // Platform (Platform.xml LevelArt; single frame)
    0x3c: nem('artnem/SLZ Breakable Wall.nem', '_maps/Smashable Walls.asm', 1, 2), // Breakable wall (frame 1)
    0x53: nem('artnem/SLZ 32x32 Block.nem', '_maps/Collapsing Floors.asm', 2, 2), // Collapsing floor (frame 2)
    0x59: lvl('_maps/SLZ Elevators.asm', 0, 2), // Elevator (Elevator.xml LevelArt)
    0x5a: lvl('_maps/SLZ Circling Platform.asm', 0, 2), // Rotating/Circling Platform (CirclingPlatform.xml LevelArt)
    0x5b: lvl('_maps/Staircase.asm', 0, 2), // Stairs (Stairs.xml LevelArt; 4-piece composite via subtype rule)
    0x5c: nem('artnem/SLZ Pylon.nem', '_maps/Pylon.asm', 0, 0), // Foreground metal pylon
    0x5f: BOMB,
    0x60: nem('artnem/Enemy Orbinaut.nem', '_maps/Orbinaut.asm', 0, 1), // Orbinaut (body frame, pal 1)
    // NOT IN SonLVL (no [56] in objSLZ.ini). From the disasm source (_incObj/56):
    // SLZ's rotating stairway block draws LevelArt (ArtTile_Level|Tile_Pal3 →
    // line 2) from Map_FBlock; SLZ subtypes are $5x/$Dx → frame 5 (shared
    // (subtype&0x70)>>4 rule, aliased into slz in object-subtype-rules.ts).
    0x56: lvl('_maps/Floating Blocks and Doors.asm', 5, 2), // Stairway Block
  },
  sbz: {
    0x15: nem('artnem/SYZ Large Spikeball.nem', '_maps/Big Spiked Ball.asm', 0, 0), // Swinging Spikeball (SwingingSpikeball.cs; subtype rule)
    0x1e: nem('artnem/Enemy Ball Hog.nem', '_maps/Ball Hog.asm', 0, 1), // Ball Hog (BallHog.xml)
    0x2a: nem('artnem/SBZ Small Vertical Door.nem', '_maps/SBZ Small Door.asm', 0, 2), // One-way barrier
    0x32: off('artnem/Switch.nem', '_maps/Button.asm', 0, 0, -128), // Switch (Common/Switch.xml offset=-128 → skip 4 tiles)
    0x52: nem('artnem/SBZ Stomper.nem', '_maps/Moving Blocks (MZ and SBZ).asm', 2, 1), // Moving block / stomper (MovingBlocks.xml, frame2special)
    0x69: nem('artnem/SBZ Spinning Platform.nem', '_maps/SBZ Spinning Platforms.asm', 0, 0), // Spinning Platform (SpinningPlatform.xml)
    0x6a: nem('artnem/SBZ Pizza Cutter.nem', '_maps/Saws and Pizza Cutters.asm', 0, 2), // Saws / Pizza Cutters (SawsandPizzaCutters.xml)
    0x6d: nem('artnem/SBZ Flaming Pipe.nem', '_maps/Flamethrower.asm', 9, 0), // Flamethrower (Flamethrower.cs, labels[0] = frame 9)
    0x53: nem('artnem/SBZ Collapsing Floor.nem', '_maps/Collapsing Floors.asm', 0, 2), // Collapsing floor
    0x5f: BOMB,
    0x60: nem('artnem/Enemy Orbinaut.nem', '_maps/Orbinaut.asm', 0, 0), // Orbinaut (body frame, LZ/Orbinaut.xml)
    0x67: nem('artnem/SBZ Running Disc.nem', '_maps/Running Disc.asm', 0, 2), // Running disc
    0x6c: nem('artnem/SBZ Vanishing Block.nem', '_maps/SBZ Vanishing Platforms.asm', 0, 2), // Vanishing platform
    0x6e: nem('artnem/SBZ Electrocuter.nem', '_maps/Electrocuter.asm', 0, 0), // Electrocuter
    0x70: nem('artnem/SBZ Crushing Girder.nem', '_maps/Girder Block.asm', 0, 2), // Girder block
    0x78: CATERKILLER,
    // NOT IN SonLVL (name-only INI blobs) — transcribed from the disasm source:
    //   _incObj/6B: Map_Stomp = _maps/SBZ Stomper and Door.asm (frames: 0 door /
    //     1.. stomper), obGfx = ArtTile_SBZ_Moving_Block_Short|Tile_Pal2 →
    //     Nem_Stomper (SBZ Stomper.nem), line 1. (SBZ3 swaps to a LevelArt door
    //     in-engine; the .nem preview beats a red box there.)
    //   _incObj/6F: Map_Spin = _maps/SBZ Spinning Platforms.asm (shared with $69),
    //     obGfx = ArtTile_SBZ_Spinning_Platform → SBZ Spinning Platform.nem, line 0.
    0x6b: nem('artnem/SBZ Stomper.nem', '_maps/SBZ Stomper and Door.asm', 0, 1), // Stomper and Door
    0x6f: nem('artnem/SBZ Spinning Platform.nem', '_maps/SBZ Spinning Platforms.asm', 0, 0), // Platform Conveyor Belt
    // SBZ3 = the engine's "LZ act 4" (its objpos places these LZ objects while
    // the profile keys the act under zone 'sbz') — alias the LZ links so they
    // render there. sbz1/2 never place these ids, so the aliases are inert there.
    0x0c: LZ_LINKS[0x0c], // Flapping Door
    0x16: LZ_LINKS[0x16], // Harpoon
    0x2c: LZ_LINKS[0x2c], // Jaws
    0x2d: LZ_LINKS[0x2d], // Burrobot
    0x56: LZ_LINKS[0x56], // Door
    0x57: LZ_LINKS[0x57], // Spikeball
    0x61: LZ_LINKS[0x61], // Block/Cork (subtype rule aliased in object-subtype-rules.ts)
    0x62: LZ_LINKS[0x62], // Gargoyle
    0x64: LZ_LINKS[0x64], // Bubbles
  },
};

/**
 * Resolve the sprite-art link for an object id in a given zone, or `undefined`
 * when the id is not linked (the caller keeps the hex-box fallback). Zone
 * overrides win over the base map; `zone` is the lowercase profile zone id
 * (`ZoneActRef.zone`). A missing/unknown zone falls back to the base map only.
 */
export function resolveObjectArt(id: number, zone?: string): ObjectArtLink | undefined {
  if (zone) {
    const zoneMap = S1_OBJECT_ART_ZONE[zone];
    const hit = zoneMap && zoneMap[id];
    if (hit) return hit;
  }
  return S1_OBJECT_ART_BASE[id];
}

/**
 * TRUE when an object's art link is the SAME in every zone — a base-map entry
 * no per-zone map redefines — so resolving it needs no zone at all. This is the
 * measured "Ring is not really stored per zone" distinction: Ring ($25) is one
 * shared file, `artnem/Rings.nem` (a single binclude, s1disasm sonic.asm:4682)
 * queued by `PLC_Main` (_inc/Pattern Load Cues.asm:77), the cue list every
 * level loads — where Moto Bug's `Nem_Motobug` is queued only by `PLC_GHZ`
 * (line 116) and its link exists only under the `ghz` zone map here. Zone-free
 * ids may open with NO act loaded (session restore, a level-free "Edit art…");
 * the override check keeps the answer honest if a zone map ever claims one of
 * these ids (e.g. a future per-zone $53-style redefinition), instead of
 * silently serving the base file in a zone that draws different art.
 */
export function objectArtIsZoneFree(id: number): boolean {
  if (!S1_OBJECT_ART_BASE[id]) return false;
  for (const zoneMap of Object.values(S1_OBJECT_ART_ZONE)) {
    if (zoneMap[id] !== undefined) return false;
  }
  return true;
}

/** Every id linked in the given zone (zone overrides ∪ base), ascending. */
export function linkedObjectIds(zone?: string): number[] {
  const ids = new Set<number>(Object.keys(S1_OBJECT_ART_BASE).map(Number));
  if (zone && S1_OBJECT_ART_ZONE[zone]) {
    for (const k of Object.keys(S1_OBJECT_ART_ZONE[zone])) ids.add(Number(k));
  }
  return [...ids].sort((a, b) => a - b);
}

// --- Named art docs (maps files with no object id of their own) --------------

/** A named sprite doc: a maps+art pair whose only engine consumers are
 *  SUB-SLOTS of objects whose own docs lead with different maps files. */
export interface S1NamedArtDoc {
  /** Doc title (there is no S1_OBJECT_NAMES entry to resolve). */
  name: string;
  link: ObjectArtLink;
}

/**
 * Keyed by the sprite-doc tab ref (`doc:sprite:s1:<key>`). Keys are lowercase
 * identifiers, deliberately DISJOINT from numeric object-id refs — a named key
 * never parses as a number, so `Number(ref)` sites fall through to NaN and the
 * named lookup is unambiguous.
 *
 * bossitems — Map_BossItems "_maps/Boss Items.asm" (sonic.asm:4293): the boss
 * fights' chain anchor / debris frames (.chainanchor1/2, .cross, .widepipe,
 * .pipe, .spike, .legmask, .legs). Art = Nem_Weapons "artnem/Boss -
 * Weapons.nem" (sonic.asm:4795), queued by PLC_Boss (_inc/Pattern Load
 * Cues.asm:286) at ArtTile_Eggman_Weapons equ $46C (_Constants.asm:580) — a
 * shared binclude every boss loads, i.e. zone-free like the EGGMAN rows. No
 * object id draws it as its PRIMARY slot: its consumers are sub-slot routines
 * of $48 (GBall_Main, "_incObj/3D, 48 Boss - GHZ Main and Wrecking Ball.asm":
 * 443-444 — the chain anchor, obGfx with no pal bits → LINE 0), $73's tube
 * (BossMarble_TubeMain :510-512), $75's spike (BossSpringYard_SpikeMain
 * :661-663) and $7A's pipe (:501). It HAD a doc while $48's row led with the
 * anchor; when $48 restructured to lead with the ball (owner finding
 * 2026-08-20), these maps lost their only doorway — this named row is the
 * replacement home. Frame 0 = .chainanchor1, the GHZ anchor the old doc led
 * with; pal 0 per GBall's obGfx.
 */
export const S1_NAMED_ART_DOCS: Readonly<Record<string, S1NamedArtDoc>> = {
  bossitems: {
    name: 'Boss Items',
    link: nem('artnem/Boss - Weapons.nem', '_maps/Boss Items.asm', 0, 0),
  },
};

/** The named doc for a tab ref key, or undefined for object-id refs. */
export function resolveNamedArtDoc(key: string): S1NamedArtDoc | undefined {
  return S1_NAMED_ART_DOCS[key];
}
