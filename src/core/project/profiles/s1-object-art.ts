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
// CURATION: this is a solid top-40 (all named badniks, monitors, springs,
// signpost, egg prison, spikes, common platforms/scenery), NOT an exhaustive
// port. Ids whose objdef is `art=LevelArt` (renders from the level's own tile
// pool — GHZ/SYZ/SLZ Platform, Siren Light, SYZ floating blocks), a binary-map
// debug marker (Invisible lava marker), an invisible/no-art helper (Invisible
// Block, conveyor barriers), or a multi-art composite whose default frame is
// ambiguous (Swinging Platform, Sideways Stomper, Flamethrower) are deliberately
// LEFT OUT — unlinked ids keep the viewport's hex-box fallback.
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
 * The art + mappings needed to render one object's default preview frame. Paths
 * are disasm-relative POSIX. `pal` is the palette LINE (0..3) — the objdef's
 * `pal=` / XML `startpal` / C# `MapASMToBmp` startpal arg — used to pick
 * `doc.palettes[pal]`. `frame` indexes the mappings' frame table.
 */
export interface ObjectArtLink {
  artFile: string;
  mapAsm: string;
  frame: number;
  pal: number;
  compression: ObjectArtCompression;
}

const nem = (
  artFile: string, mapAsm: string, frame: number, pal: number,
): ObjectArtLink => ({ artFile, mapAsm, frame, pal, compression: 'nemesis' });

const unc = (
  artFile: string, mapAsm: string, frame: number, pal: number,
): ObjectArtLink => ({ artFile, mapAsm, frame, pal, compression: 'uncompressed' });

// --- Badniks / scenery shared across several zones (deduped constants) -------
const CRABMEAT = nem('artnem/Enemy Crabmeat.nem', '_maps/Crabmeat.asm', 0, 0);
const BUZZ_BOMBER = nem('artnem/Enemy Buzz Bomber.nem', '_maps/Buzz Bomber.asm', 0, 0);
const YADRIN = nem('artnem/Enemy Yadrin.nem', '_maps/Yadrin.asm', 0, 1);
const CATERKILLER = nem('artnem/Enemy Caterkiller.nem', '_maps/Caterkiller.asm', 0, 1);
const BOMB = nem('artnem/Enemy Bomb.nem', '_maps/Bomb Enemy.asm', 0, 0);

/**
 * The base linkage (from `obj.ini` + the XML / C# defs it references). These
 * apply in EVERY zone unless a per-zone override below redefines the id.
 */
export const S1_OBJECT_ART_BASE: Readonly<Record<number, ObjectArtLink>> = {
  0x0d: nem('artnem/Signpost.nem', '_maps/Signpost.asm', 0, 0), // Signpost
  0x25: nem('artnem/Rings.nem', '_maps/Rings (REV00).asm', 0, 1), // Ring (Ring.cs: startpal 1)
  0x26: nem('artnem/Monitors.nem', '_maps/Monitor.asm', 0, 0), // Monitor (Monitor.xml Image="img")
  0x36: nem('artnem/Spikes.nem', '_maps/Spikes.asm', 0, 0), // Spikes (Spikes.xml Image="img1")
  0x3e: nem('artnem/Prison Capsule.nem', '_maps/Prison Capsule.asm', 0, 0), // Egg Prison (capsule)
  0x41: nem('artnem/Spring Horizontal.nem', '_maps/Springs.asm', 0, 0), // Spring (redvert)
  0x4b: unc('artunc/Giant Ring.unc', '_maps/Giant Ring.asm', 0, 1), // Giant ring (uncompressed, pal 1)
  0x79: nem('artnem/Lamppost.nem', '_maps/Lamppost.asm', 0, 0), // Lamppost
  0x7d: nem('artnem/Hidden Bonuses.nem', '_maps/Hidden Bonuses.asm', 3, 0), // Point bonus (img100 = frame 3)
};

/**
 * Per-zone overrides / additions, keyed by the profile zone id (lowercase, as in
 * `ZoneActRef.zone`: ghz/mz/syz/lz/slz/sbz). An entry here wins over the base map
 * for the same id in that zone.
 */
export const S1_OBJECT_ART_ZONE: Readonly<Record<string, Readonly<Record<number, ObjectArtLink>>>> = {
  ghz: {
    0x11: nem('artnem/GHZ Bridge.nem', '_maps/Bridge.asm', 0, 2), // Bridge (Bridge.cs)
    0x17: nem('artnem/GHZ Spiked Log.nem', '_maps/Spiked Pole Helix.asm', 0, 2), // Spiked pole (SpikedPole.cs)
    0x1c: nem('artnem/GHZ Bridge.nem', '_maps/Bridge.asm', 1, 2), // Bridge stump (frame 1)
    0x1f: CRABMEAT,
    0x22: BUZZ_BOMBER,
    0x2b: nem('artnem/Enemy Chopper.nem', '_maps/Chopper.asm', 0, 0), // Chopper
    0x3b: nem('artnem/GHZ Purple Rock.nem', '_maps/Purple Rock.asm', 0, 3), // Purple rock
    0x40: nem('artnem/Enemy Motobug.nem', '_maps/Moto Bug.asm', 0, 0), // Moto Bug
  },
  mz: {
    0x22: BUZZ_BOMBER,
    0x30: nem('artnem/MZ Green Glass Block.nem', '_maps/MZ Large Green Glass Blocks.asm', 0, 2), // Large glass pillar
    0x4e: nem('artnem/MZ Lava.nem', '_maps/Wall of Lava.asm', 0, 3), // Wall of Lava
    0x50: YADRIN,
    0x53: nem('artnem/MZ Green Pushable Block.nem', '_maps/Collapsing Floors.asm', 0, 2), // Collapsing floor
    0x55: nem('artnem/Enemy Basaran.nem', '_maps/Basaran.asm', 0, 1), // Basaran
    0x78: CATERKILLER,
  },
  syz: {
    0x1f: CRABMEAT,
    0x22: BUZZ_BOMBER,
    0x43: nem('artnem/Enemy Roller.nem', '_maps/Roller.asm', 0, 0), // Roller
    0x47: nem('artnem/SYZ Bumper.nem', '_maps/Bumper.asm', 0, 0), // Bumper
    0x50: YADRIN,
    0x57: nem('artnem/SYZ Small Spikeball.nem', '_maps/Spiked Ball and Chain (SYZ).asm', 0, 0), // Spikeball chain
    0x58: nem('artnem/SYZ Large Spikeball.nem', '_maps/Big Spiked Ball.asm', 0, 0), // Big spiked ball
    0x78: CATERKILLER,
  },
  lz: {
    0x2d: nem('artnem/Enemy Burrobot.nem', '_maps/Burrobot.asm', 2, 0), // Burrobot (frame 2)
    0x57: nem('artnem/LZ Spiked Ball & Chain.nem', '_maps/Spiked Ball and Chain (LZ).asm', 1, 0), // Spikeball (frame 1)
    0x62: nem('artnem/LZ Gargoyle & Fireball.nem', '_maps/Gargoyle.asm', 0, 2), // Gargoyle
  },
  slz: {
    0x1c: nem('artnem/SLZ Cannon.nem', '_maps/Scenery.asm', 0, 2), // Fireball thrower (overrides GHZ $1C)
    0x3c: nem('artnem/SLZ Breakable Wall.nem', '_maps/Smashable Walls.asm', 1, 2), // Breakable wall (frame 1)
    0x53: nem('artnem/SLZ 32x32 Block.nem', '_maps/Collapsing Floors.asm', 2, 2), // Collapsing floor (frame 2)
    0x5c: nem('artnem/SLZ Pylon.nem', '_maps/Pylon.asm', 0, 0), // Foreground metal pylon
    0x5f: BOMB,
  },
  sbz: {
    0x2a: nem('artnem/SBZ Small Vertical Door.nem', '_maps/SBZ Small Door.asm', 0, 2), // One-way barrier
    0x53: nem('artnem/SBZ Collapsing Floor.nem', '_maps/Collapsing Floors.asm', 0, 2), // Collapsing floor
    0x5f: BOMB,
    0x67: nem('artnem/SBZ Running Disc.nem', '_maps/Running Disc.asm', 0, 2), // Running disc
    0x6c: nem('artnem/SBZ Vanishing Block.nem', '_maps/SBZ Vanishing Platforms.asm', 0, 2), // Vanishing platform
    0x6e: nem('artnem/SBZ Electrocuter.nem', '_maps/Electrocuter.asm', 0, 0), // Electrocuter
    0x70: nem('artnem/SBZ Crushing Girder.nem', '_maps/Girder Block.asm', 0, 2), // Girder block
    0x78: CATERKILLER,
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

/** Every id linked in the given zone (zone overrides ∪ base), ascending. */
export function linkedObjectIds(zone?: string): number[] {
  const ids = new Set<number>(Object.keys(S1_OBJECT_ART_BASE).map(Number));
  if (zone && S1_OBJECT_ART_ZONE[zone]) {
    for (const k of Object.keys(S1_OBJECT_ART_ZONE[zone])) ids.add(Number(k));
  }
  return [...ids].sort((a, b) => a - b);
}
