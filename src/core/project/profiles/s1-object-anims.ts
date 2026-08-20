// Sonic 1 object id → animation-script linkage. Pure data, transcribed ONCE at
// authoring time (exactly like s1-object-art.ts): s1disasm itself has NO
// object→script data table — the binding is 68k code (`lea (Ani_X).l,a1` /
// `lea Ani_X(pc),a1` before the AnimateSprite call), so it was transcribed by
// sweeping BOTH:
//   • the 49 `include "_anim/…"` sites (8 in sonic.asm, 41 in `_incObj/*.asm`
//     whose filenames carry the owning object ids, e.g. `_incObj/1F Badnik -
//     Crabmeat.asm`), and
//   • the `lea (Ani_*)` binding sites across `_incObj/` (long-absolute and
//     pc-relative forms), which attribute shared tables to their users (e.g.
//     Ani_Eggman ← the GHZ/MZ/SYZ/LZ/SLZ boss files; Ani_Fire ← both the
//     fireball object 14 and the MZ boss fire 74).
// Aurora never parses `_incObj` at runtime; per-row provenance is cited below.
//
// Deliberately UNLINKED, with reasons:
//   • Sonic ($01): `_anim/Sonic.asm` is a DIFFERENT dialect (sonani macro
//     table, fr_* equates, negative duration mode markers, code-driven walk/run
//     rotation) — excluded from the s1 dialect parser by design; see
//     docs/reviews/2026-08-20-s1-animation-audit.md §1.4.
//   • Caterkiller ($78): its script `Ani_Cat` is defined INLINE in
//     `_incObj/78 Badnik - Caterkiller.asm:444`, not an `_anim/` file — out of
//     scope for the file-level link (both its lea sites, :125/:288, bind it).
//   • Everything else placeable simply has no animation script (static
//     platforms, blocks, spikes, switches, bridges, …): the engine never calls
//     AnimateSprite for them, so an empty timeline is the honest state.
//
// ZONE SCOPING: none. Unlike art (where SonLVL's per-zone INIs redefine what an
// id LOOKS like), the anim script is bound to the object's CODE, and S1 has one
// global object index — the same id runs the same code (and thus the same
// script) in every zone it appears in.

/** One object's animation-script link: the disasm-relative `_anim/*.asm` file. */
export interface ObjectAnimLink {
  animAsm: string;
}

const anim = (animAsm: string): ObjectAnimLink => ({ animAsm });

/**
 * Object id → `_anim` script. Ids beyond the placeable set (bosses, cutscene
 * actors, spawned children like the Buzz Bomber missile) are included where the
 * binding is unambiguous — the resolver doesn't care whether an id is placeable.
 */
export const S1_OBJECT_ANIMS: Readonly<Record<number, ObjectAnimLink>> = {
  // --- Placeable objects / badniks -----------------------------------------
  0x08: anim('_anim/Water Splash.asm'), // lea Ani_Splash ← _incObj/08 LZ Water Splash.asm
  0x0a: anim('_anim/Drowning Countdown.asm'), // include + 3 lea ← _incObj/0A LZ Drowning Countdown.asm
  0x0c: anim('_anim/Flapping Door.asm'), // include + lea Ani_Flap ← _incObj/0C LZ Flapping Door.asm
  0x0d: anim('_anim/Signpost.asm'), // include + lea Ani_Sign ← _incObj/0D Signpost.asm
  0x14: anim('_anim/Fireballs.asm'), // lea Ani_Fire ← _incObj/13, 14 MZ, SLZ Fire Balls and Maker.asm ($13 is the invisible spawner; the fireball child $14 animates)
  0x16: anim('_anim/Harpoon.asm'), // include + lea Ani_Harp ← _incObj/16 LZ Harpoon.asm
  0x1e: anim('_anim/Ball Hog.asm'), // included from sonic.asm:4107; lea Ani_Hog ← _incObj/1E, 20 Badnik - Ball Hog and Cannonball.asm
  0x1f: anim('_anim/Crabmeat.asm'), // include + 2 lea Ani_Crab ← _incObj/1F Badnik - Crabmeat.asm
  0x22: anim('_anim/Buzz Bomber.asm'), // include ← _incObj/22, 23…; lea Ani_Buzz is the $22 body
  0x23: anim('_anim/Buzz Bomber Missile.asm'), // include ← _incObj/22, 23…; 4 lea Ani_Missile are the $23 missile
  0x25: anim('_anim/Rings.asm'), // included from sonic.asm:4120; lea Ani_Ring ← _incObj/25, 37 Rings.asm
  0x26: anim('_anim/Monitor.asm'), // include + lea Ani_Monitor ← _incObj/26, 2E Monitors and Power-Ups.asm
  0x2a: anim('_anim/SBZ Small Door.asm'), // include + lea Ani_ADoor ← _incObj/2A SBZ Small Door.asm
  0x2b: anim('_anim/Chopper.asm'), // include + lea Ani_Chop ← _incObj/2B Badnik - Chopper.asm
  0x2c: anim('_anim/Jaws.asm'), // include + lea Ani_Jaws ← _incObj/2C Badnik - Jaws.asm
  0x2d: anim('_anim/Burrobot.asm'), // include + lea Ani_Burro ← _incObj/2D Badnik - Burrobot.asm
  0x35: anim('_anim/Burning Grass.asm'), // include + lea Ani_GFire ← _incObj/2F, 35 MZ Large Grassy Platforms and Burning Grass.asm ($2F platform is static)
  0x37: anim('_anim/Rings.asm'), // scattered rings — same _incObj/25, 37 Rings.asm code binds Ani_Ring
  0x38: anim('_anim/Shield and Invincibility.asm'), // included from sonic.asm:4250; 2 lea Ani_Shield ← _incObj/38 Shield and Invincibility.asm
  0x3e: anim('_anim/Prison Capsule.asm'), // include + lea Ani_Pri ← _incObj/3E Prison Capsule.asm
  0x40: anim('_anim/Moto Bug.asm'), // include + 2 lea Ani_Moto ← _incObj/40 Badnik - Moto Bug.asm
  0x41: anim('_anim/Springs.asm'), // include + 3 lea Ani_Spring ← _incObj/41 Springs.asm
  0x42: anim('_anim/Newtron.asm'), // include + lea Ani_Newt ← _incObj/42 Badnik - Newtron.asm
  0x43: anim('_anim/Roller.asm'), // include + lea Ani_Roll ← _incObj/43 Badnik - Roller.asm
  0x47: anim('_anim/Bumper.asm'), // include + lea Ani_Bump ← _incObj/47 SYZ Bumper.asm
  0x4a: anim('_anim/Special Stage Entry (Unused).asm'), // included from sonic.asm:4252; lea Ani_Vanish ← _incObj/4A Unused - Special Stage Entry.asm
  0x4c: anim('_anim/Lava Geyser.asm'), // included from sonic.asm:4205; 2 lea Ani_Geyser ← _incObj/4C, 4D MZ Lava Geyser and Maker.asm
  0x4e: anim('_anim/Wall of Lava.asm'), // included from sonic.asm:4206; lea Ani_LWall ← _incObj/4E MZ Wall of Lava.asm
  0x50: anim('_anim/Yadrin.asm'), // include + lea Ani_Yad ← _incObj/50 Badnik - Yadrin.asm
  0x55: anim('_anim/Basaran.asm'), // include + lea Ani_Bas ← _incObj/55 Badnik - Basaran.asm
  0x5f: anim('_anim/Bomb Enemy.asm'), // include + 3 lea Ani_Bomb ← _incObj/5F Badnik - Walking Bomb.asm
  0x60: anim('_anim/Orbinaut.asm'), // include + lea Ani_Orb ← _incObj/60 Badnik - Orbinaut.asm
  0x64: anim('_anim/Bubbles.asm'), // include + 3 lea Ani_Bub ← _incObj/64 LZ Air Bubbles.asm
  0x65: anim('_anim/Waterfalls.asm'), // include + lea Ani_WFall ← _incObj/65 LZ Waterfalls.asm
  0x69: anim('_anim/SBZ Spinning Platforms.asm'), // include + 2 lea Ani_Spin ← _incObj/69 SBZ Spinning Platforms and Trapdoors.asm
  0x6c: anim('_anim/SBZ Vanishing Platforms.asm'), // include + 2 lea Ani_Van ← _incObj/6C SBZ Vanishing Platforms.asm
  0x6d: anim('_anim/Flamethrower.asm'), // include + lea Ani_Flame ← _incObj/6D SBZ Flamethrower.asm
  0x6e: anim('_anim/Electrocuter.asm'), // include + lea Ani_Elec ← _incObj/6E SBZ Electrocuter.asm
  0x6f: anim('_anim/SBZ Spin Platform Conveyor.asm'), // include + lea Ani_SpinConvey ← _incObj/6F SBZ Spin Platform Conveyor.asm

  // --- Bosses / cutscene actors (not placeable, but the binding is data) ----
  0x0e: anim('_anim/Title Screen Sonic.asm'), // 2 lea Ani_TSon ← _incObj/0E, 0F Title Screen - Sonic, Press Start, TM.asm
  0x0f: anim('_anim/Press Start and TM.asm'), // lea Ani_PSBTM ← same file ($0F is Press Start / TM)
  0x3d: anim('_anim/Eggman.asm'), // included from sonic.asm:4291; 2 lea Ani_Eggman ← _incObj/3D, 48 Boss - GHZ Main and Wrecking Ball.asm
  0x73: anim('_anim/Eggman.asm'), // 2 lea Ani_Eggman ← _incObj/73, 74 Boss - MZ Main and Fire.asm
  0x74: anim('_anim/Fireballs.asm'), // 2 lea Ani_Fire ← same MZ boss file (boss fire reuses the fireball script)
  0x75: anim('_anim/Eggman.asm'), // 2 lea Ani_Eggman ← _incObj/75, 76 Boss - SYZ Main and Blocks.asm
  0x77: anim('_anim/Eggman.asm'), // 2 lea Ani_Eggman ← _incObj/77 Boss - LZ Main.asm
  0x7a: anim('_anim/Eggman.asm'), // 2 lea Ani_Eggman ← _incObj/7A, 7B Boss - SLZ Main and Spike Balls.asm
  0x80: anim('_anim/Continue Screen Sonic.asm'), // include + lea Ani_CSon ← _incObj/80, 81 Continue Screen Elements and Sonic.asm
  0x82: anim('_anim/Eggman - Scrap Brain 2 & Final.asm'), // include + lea Ani_SEgg ← _incObj/82, 83 SBZ Eggman Cutscene and Crumbling Floor.asm
  0x84: anim('_anim/Plasma Ball Launcher.asm'), // lea Ani_PLaunch ← _incObj/85,84,86 Boss - FZ….asm:1038
  0x85: anim('_anim/FZ Eggman in Ship.asm'), // include + lea Ani_FZEgg ← same FZ boss file ($85 is the ship; it also binds Ani_SEgg for the exposed Eggman)
  0x86: anim('_anim/Plasma Balls.asm'), // include + lea Ani_Plasma ← same FZ boss file
  0x87: anim('_anim/Ending Sequence Sonic.asm'), // include + lea Ani_ESon ← _incObj/87, 88, 89 Ending Sequence Sonic, Emeralds, Logo.asm
  0x8b: anim('_anim/Try Again & End Eggman.asm'), // include + lea Ani_EEgg ← _incObj/8B, 8C Try Again, End Eggman, End Emeralds.asm
};

/**
 * Resolve the animation-script link for an object id, or `undefined` when the
 * id has none (static object, or a named exclusion — see the header). No zone
 * argument: the binding is per-object-code, which S1 shares across zones.
 */
export function resolveObjectAnims(id: number): ObjectAnimLink | undefined {
  return S1_OBJECT_ANIMS[id];
}
