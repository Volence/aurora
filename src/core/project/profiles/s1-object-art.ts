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
// Deliberately UNLINKED (keep the viewport's hex-box fallback), with reasons:
//   • art=LevelArt (cut from the level's own tile pool, not a .nem): GHZ/SLZ/SYZ
//     Platform ($18), GHZ Collapsing Cliff ($1A), MZ Grass Platform ($2F) + Brick
//     ($46), SLZ Elevator ($59)/Circling Platform ($5A)/Stairs ($5B), SYZ Siren
//     Light ($12) + Block ($56). A LevelArt renderer is a separate pipeline.
//   • offset-art (art uses a byte-skip `offset=` our nemesis decoder can't honour):
//     Switch ($32) in LZ/SBZ/SYZ (offset -128), LZ Block/Cork ($61).
//   • dual/multi-art default (composites several different art files): MZ Sideways
//     Stomper ($45), SBZ Rotating Junction ($66).
//   • debug / invisible / trigger markers (drawn as ghost markers, see
//     s1-objects.ts S1_INVISIBLE_OBJECT_IDS): Fireball Spawner ($13), Waterfall SFX
//     ($49), Invisible Lava Marker ($54), Conveyor Controller ($68), Invisible Block
//     ($71), Teleporter ($72).
//   • name-only BLOBs (INI has no art/map/xml/code at all): SBZ Stomper-and-Door
//     ($6B), Platform Conveyor Belt ($6F).
//   • Ending Animals ($28): the ending act is not a placeable zone in this profile
//     (zones are ghz/mz/syz/lz/slz/sbz), so there is nowhere to scope it.
// Orbinaut's XML default is a spikeball+body composite; we preview its recognizable
// body frame (frame 0) alone. The [Sonic] start entry uses a DPLC frame, not a flat
// mapping — excluded (it is the spawn marker, not a placeable id).
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
// GHZ Swinging Platform art (SwingingPlatform.cs hardcodes it for GHZ *and* MZ). The
// single-frame default preview is the platform (frame 0); the $15 subtype rule
// composes anchor (frame 2) + chain links (frame 1) + platform (frame 0).
const SWINGING_PLATFORM = nem('artnem/GHZ Swinging Platform.nem', '_maps/Swinging Platforms (GHZ).asm', 0, 2);

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
    0x11: nem('artnem/GHZ Bridge.nem', '_maps/Bridge.asm', 0, 2), // Bridge (Bridge.cs; subtype rule)
    0x15: SWINGING_PLATFORM, // Swinging Platform (SwingingPlatform.cs; subtype rule)
    0x17: nem('artnem/GHZ Spiked Log.nem', '_maps/Spiked Pole Helix.asm', 0, 2), // Spiked pole (SpikedPole.cs; subtype rule)
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
    0x30: nem('artnem/MZ Green Glass Block.nem', '_maps/MZ Large Green Glass Blocks.asm', 0, 2), // Large glass pillar
    0x32: nem('artnem/MZ Switch.nem', '_maps/Button.asm', 0, 2), // Switch (MZ/Switch.xml)
    0x33: nem('artnem/MZ Green Pushable Block.nem', '_maps/Pushable Blocks.asm', 0, 2), // Pushable block (PushableBlocks.xml)
    0x51: nem('artnem/MZ Green Pushable Block.nem', '_maps/Smashable Green Block.asm', 0, 2), // Smashable block (SmashableBlock.xml)
    0x52: nem('artnem/MZ Green Pushable Block.nem', '_maps/Moving Blocks (MZ and SBZ).asm', 0, 2), // Moving block (MovingBlocks.xml)
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
    0x0b: nem('artnem/LZ Breakable Pole.nem', '_maps/Pole that Breaks.asm', 0, 2), // Pole (Pole.xml)
    0x0c: nem('artnem/LZ Flapping Door.nem', '_maps/Flapping Door.asm', 0, 2), // Flapping Door (FlappingDoor.xml)
    0x16: nem('artnem/LZ Harpoon.nem', '_maps/Harpoon.asm', 3, 0), // Harpoon (Harpoon.xml, default "vertical" = frame 3)
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
  },
  slz: {
    0x15: nem('artnem/SLZ Swinging Platform.nem', '_maps/Swinging Platforms (SLZ).asm', 0, 2), // Swinging Platform (SwingingPlatform.cs; subtype rule)
    0x5d: nem('artnem/SLZ Fan.nem', '_maps/Fan.asm', 0, 2), // Fan (Fan.xml)
    0x5e: nem('artnem/SLZ Seesaw.nem', '_maps/Seesaw.asm', 0, 0), // Seesaw (Seesaw.xml)
    0x1c: nem('artnem/SLZ Cannon.nem', '_maps/Scenery.asm', 0, 2), // Fireball thrower (overrides GHZ $1C)
    0x3c: nem('artnem/SLZ Breakable Wall.nem', '_maps/Smashable Walls.asm', 1, 2), // Breakable wall (frame 1)
    0x53: nem('artnem/SLZ 32x32 Block.nem', '_maps/Collapsing Floors.asm', 2, 2), // Collapsing floor (frame 2)
    0x5c: nem('artnem/SLZ Pylon.nem', '_maps/Pylon.asm', 0, 0), // Foreground metal pylon
    0x5f: BOMB,
    0x60: nem('artnem/Enemy Orbinaut.nem', '_maps/Orbinaut.asm', 0, 1), // Orbinaut (body frame, pal 1)
  },
  sbz: {
    0x15: nem('artnem/SYZ Large Spikeball.nem', '_maps/Big Spiked Ball.asm', 0, 0), // Swinging Spikeball (SwingingSpikeball.cs; subtype rule)
    0x1e: nem('artnem/Enemy Ball Hog.nem', '_maps/Ball Hog.asm', 0, 1), // Ball Hog (BallHog.xml)
    0x2a: nem('artnem/SBZ Small Vertical Door.nem', '_maps/SBZ Small Door.asm', 0, 2), // One-way barrier
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
