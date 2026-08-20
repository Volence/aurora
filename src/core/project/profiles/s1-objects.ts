// Sonic 1 object id → display-name table.
//
// Hardcoded pure data (like profiles/s1.ts). Transcribed at authoring time from
// s1disasm's SonLVL object definitions —
//   `s1disasm/Utility Project Files/SonLVL INI Files/_ObjDef/*.ini`
// (the base `obj.ini` + the `obj.rev01.ini` overlay + the per-zone `objXXX.ini`
// files). SonLVL resolves an object's display name from, in priority order: an
// explicit `name=` field, else the `Name="…"` attribute of the referenced
// `xmlfile=`, else the class name of the referenced `codetype=` (CamelCase split
// into words). This table is the union of every id those definitions name.
//
// This is a display convenience only — it does NOT gate editing. The object tool
// can place/select any 7-bit id (0x00–0x7F); ids absent from this table simply
// render as their `$XX` hex (see `s1ObjectName`).
//
// The BOSS-family names are the one exception to the SonLVL provenance (SonLVL
// defines no boss objdef at all): they are transcribed from the disasm's
// `_inc/Object Pointers.asm` labels and the `_incObj` file headers. That also
// widens the id domain past 0x7F — the engine's object index runs to $8C, and
// the FZ/SBZ2 boss actors ($82-$86) are named so their sprite docs (opened via
// the s1-object-art.ts boss rows) carry real titles.

/** id (0x00–0x8C, the disasm object-index range) → human-readable object name. */
export const S1_OBJECT_NAMES: Readonly<Record<number, string>> = {
  0x0b: 'Pole',
  0x0c: 'Flapping Door',
  0x0d: 'Signpost',
  0x11: 'Bridge',
  0x12: 'Siren Light',
  0x13: 'Fireball Spawner',
  0x15: 'Swinging Platform',
  0x16: 'Harpoon',
  0x17: 'Spiked Pole',
  0x18: 'Platform',
  0x1a: 'Collapsing Cliff',
  0x1c: 'Bridge Stump',
  0x1e: 'Ball Hog',
  0x1f: 'Crabmeat',
  0x22: 'Buzz Bomber',
  0x25: 'Ring',
  0x26: 'Monitor',
  0x28: 'Ending Animals',
  0x2a: 'One-Way Barrier',
  0x2b: 'Chopper',
  0x2c: 'Jaws',
  0x2d: 'Burrobot',
  0x2f: 'Grass Platform',
  0x30: 'Large Glass Pillar',
  0x31: 'Chained Stompers',
  0x32: 'Switch',
  0x33: 'Movable Block',
  0x36: 'Spikes',
  0x3b: 'Purple Rock',
  0x3c: 'Breakable Wall',
  // Boss-family ids: SonLVL's INIs define NO section for any boss, so these
  // names are transcribed from the disasm itself — `_inc/Object Pointers.asm`
  // labels + the `_incObj` file headers ("Object 3D - Eggman (GHZ)", …). Same
  // NOT-IN-SonLVL treatment as the s1-object-art.ts boss rows.
  0x3d: 'Eggman (GHZ Boss)',
  0x3e: 'Egg Prison',
  0x40: 'Moto Bug',
  0x41: 'Spring',
  0x42: 'Newtron',
  0x43: 'Roller',
  0x44: 'Wall Barrier',
  0x45: 'Sideways Stomper',
  0x46: 'Brick',
  0x47: 'Bumper',
  0x48: 'Boss Wrecking Ball', // id_BossBall — "wrecking ball on a chain that Eggman swings (GHZ)"
  0x49: 'Waterfall Sound Effect',
  0x4b: 'Giant Ring',
  0x4c: 'Lava Geyser Maker',
  0x4e: 'Wall of Lava',
  0x50: 'Yadrin',
  0x51: 'Smashable Block',
  0x52: 'Moving Block Platform',
  0x53: 'Collapsing Floor',
  0x54: 'Invisible Lava Marker',
  0x55: 'Basaran',
  0x56: 'Door',
  0x57: 'Spikeball',
  0x58: 'Big Spiked Ball',
  0x59: 'Elevator',
  0x5a: 'Rotating Platform',
  0x5b: 'Stairs',
  0x5c: 'Foreground Metal Pylon',
  0x5d: 'Fan',
  0x5e: 'Seesaw',
  0x5f: 'Bomb',
  0x60: 'Orbinaut',
  0x61: 'Block/Cork',
  0x62: 'Gargoyle',
  0x63: 'Conveyor Belt',
  0x64: 'Bubbles',
  0x65: 'Waterfall',
  0x66: 'Rotating Junction',
  0x67: 'Running Disc',
  0x68: 'Conveyor Belt Controller',
  0x69: 'Trapdoor/Spinning Platform',
  0x6a: 'Saws and Pizza Cutters',
  0x6b: 'Stomper and Door',
  0x6c: 'Vanishing Platform',
  0x6d: 'Flamethrower',
  0x6e: 'Electrocuter',
  0x6f: 'Platform Conveyor Belt',
  0x70: 'Girder Block',
  0x71: 'Invisible Block',
  0x72: 'Teleporter',
  // Boss-family ids (see the $3D note): from _inc/Object Pointers.asm + the
  // _incObj headers.
  0x73: 'Eggman (MZ Boss)',
  0x74: 'Boss Fire', // id_BossFire — the fireballs the MZ boss drops
  0x75: 'Eggman (SYZ Boss)',
  0x76: 'Boss Block', // id_BossBlock — blocks Eggman picks up (SYZ)
  0x77: 'Eggman (LZ Boss)',
  0x78: 'Caterkiller',
  0x79: 'Lamppost',
  0x7a: 'Eggman (SLZ Boss)',
  0x7b: 'Boss Spikeball', // id_BossSpikeball — spiked balls the SLZ boss drops
  0x7d: 'Hidden Point Bonus',
  // $80+ ids are outside the placeable 7-bit objpos range Aurora's object tool
  // edits, but they name the sprite docs the boss art rows open (the checkout
  // path resolves names through s1ObjectName).
  0x82: 'Eggman (SBZ2 Cutscene)',
  0x83: 'Crumbling Floor (SBZ2)', // id_FalseFloor
  0x84: 'FZ Boss Cylinder', // id_EggmanCylinder
  0x85: 'Eggman (FZ Boss)', // id_BossFinal
  0x86: 'FZ Plasma Launcher', // id_BossPlasma — launcher + energy balls
};

/**
 * Ids that are invisible / trigger objects in-game — they have no real sprite (SonLVL
 * marks them `debug=True` and draws a placeholder box, or they are pure triggers /
 * invisible controllers). The viewport draws these as a muted "ghost marker" labelled
 * with the object NAME (distinct from the red hex box that flags a not-yet-linked id),
 * so an author can see and grab them without mistaking them for un-ported art.
 * Transcribed from the SonLVL objdefs (Common/*.xml `debug=True`, per-zone INIs).
 */
export const S1_INVISIBLE_OBJECT_IDS: ReadonlySet<number> = new Set<number>([
  0x13, // Fireball Spawner (Common/FireballSpawner.xml, debug — invisible spawner)
  0x49, // Waterfall Sound Effect (objGHZ.ini debug=True, no art — SFX trigger)
  0x54, // Invisible Lava Marker (Common/Invisible lava marker.xml, debug region marker)
  0x68, // Conveyor Belt Controller (SBZ/ConveyorBelt.cs debug — invisible controller)
  0x71, // Invisible Block (Common/InvisibleBlock.cs debug — invisible solid)
  0x72, // Teleporter (objSBZ.ini debug=True, no art — trigger)
]);

/** Whether an id is an invisible / trigger object (ghost-marker styling). */
export function s1ObjectIsInvisible(id: number): boolean {
  return S1_INVISIBLE_OBJECT_IDS.has(id);
}

/** Uppercase `$XX` hex for an object id. */
export function s1ObjectHex(id: number): string {
  return `$${(id & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * Display name for an object id: the transcribed name, or its `$XX` hex when the
 * id is not one the SonLVL definitions name.
 */
export function s1ObjectName(id: number): string {
  return S1_OBJECT_NAMES[id] ?? s1ObjectHex(id);
}

/** A named object, id-ordered — the library-panel / inspector row list. */
export interface S1ObjectListEntry {
  id: number;
  name: string;
}

/** Every named id (ascending), for the object library panel + inspector dropdown. */
export const S1_OBJECT_LIST: readonly S1ObjectListEntry[] = Object.keys(S1_OBJECT_NAMES)
  .map((k) => Number(k))
  .sort((a, b) => a - b)
  .map((id) => ({ id, name: S1_OBJECT_NAMES[id] }));
