# S&K Collision Set Import (fresh start) — Design

**Date:** 2026-06-21
**Status:** approved in principle, pending spec review

## Goal

Replace the s4_engine's throwaway 84-shape collision vocabulary with **Sonic & Knuckles' battle-tested collision set** (252 shapes / 256-slot table), so Aurora authors level collision from a proven, complete Sonic vocabulary — loops, the full slope-angle spread (69 distinct angles vs our 42), walls, ceilings. **Fresh start:** the current level's collision is dropped (it's ~1 chunk of ground, throwaway), not migrated.

## Why this over the alternatives

- Our 84 shapes were synthetic/concept; nothing precious to preserve. The level uses ~1 chunk of real ground.
- S&K's set is a known-good, complete vocabulary → no curation guesswork, no "will it fit 256" later (252 ≤ 256).
- The engine cap is 256 (1-byte index), same as S2/S&K. No slot-size change needed — even Sonic 3's 512-slot table only filled ~232. Going to 512 is a deferred upgrade if a future game ever maxes 256.

## Architecture

Three pieces; the heavy lifting is engine-side (a tool + a bake simplification). Aurora needs ~no change.

### 1. Import tool — `s4_engine/tools/import_sk_collision.py` (new)

Reads from the skdisasm checkout:
- `skdisasm/Levels/Misc/Height Maps.bin` (256×16 signed vertical heightmaps)
- `skdisasm/Levels/Misc/Height Maps Rotated.bin` (256×16 wall/rotated heightmaps)
- `skdisasm/Levels/Misc/angles.bin` (256 angle bytes)

Writes the engine's four collision tables verbatim from S&K:
- `data/collision/heightmaps.bin` ← S&K Height Maps
- `data/collision/heightmaps_rot.bin` ← S&K Height Maps Rotated (imported directly — no `rotate_profile` derivation needed, avoids its single-run validity constraint)
- `data/collision/angles.bin` ← S&K angles
- `data/collision/solidity.bin` ← **generated**: see Solidity below.

The byte format matches ours (signed int8 heights; angles in 256-units; verified). Index 0 stays air.

### 2. Solidity assignment

Classic Sonic heightmaps carry NO solidity (it's per-placement). Our profile model bundles it. With 256 slots and 252 shapes we can't fit two solidity variants per shape, so **every imported shape gets solidity `all` (solid)** — the correct, common case for terrain (floors, slopes, walls, loops are all solid-from-every-side; the player stands on top and can't pass through). Index 0 = air → solidity `none`.

Consequence for Aurora's kind-tabs: flat shapes classify as **Solid** (not Floor), so the **Floor (jump-through/top-only) tab will be empty**. That's fine — one-way platforms are a separate, later feature ("make this shape jump-through" toggle, or a small set of `top` duplicate profiles in the spare ~4 slots). Out of scope here.

### 3. Bake simplification — `ojz_strip_gen.py` (+ `gen_collision_data.py`)

Today the collision tables are generated from the **sonic_hack collision walk** (`build_section_collision` → `AttrSet` → `emit_tables`), and strips carry that stock collision. Fresh start drops this:
- The collision tables are now the **fixed S&K set** (from the import tool, committed to `data/collision/`). `gen_collision_data.py` / `ojz_strip_gen.py` no longer re-emit tables from a sonic_hack walk; they use the S&K tables as the fixed vocabulary.
- **Strip collision = the editor `.collattr.bin`/`.collattrb.bin` (authoritative, S&K indices) where present, else AIR.** The sonic_hack stock collision is no longer baked. So a freshly-loaded level starts with NO collision and the user authors it from the S&K palette (matches "fresh start").
- This is a net *simplification* — `build_section_collision`, the attrset build, and the per-cell `bake_cell` walk are removed from the collision path (kept only if needed elsewhere; verify).
- The gated DEBUG self-check (`OJZ_BOOT_COLLISION_EDITED`) and "Player below world" gate are unaffected.

### 4. Aurora — automatic

Aurora already loads the four tables into `collisionProfiles` and renders `solidCount` shapes in the kind-tabbed palette (`classifyProfile` auto-categorizes; `drawCollisionShape` renders silhouette + solid-edges + angle needle; sorted by angle). With 252 shapes it just shows more, organized by Slope/Wall/Ceiling/Solid and angle. **No code change required**, beyond confirming it reads the bigger table and hides empty tabs (the empty-tab hide already exists). Optional polish: tune categorization for the larger set (e.g. a dedicated "Loop/curve" grouping) — deferred unless it reads badly.

## Data flow (after the change)

S&K Height Maps → `import_sk_collision.py` → `data/collision/*.bin` (fixed 252 shapes)
→ Aurora reads tables → palette (paint with S&K shapes, collattr = S&K indices)
→ `ojz_strip_gen` (strips = collattr or air) → `ojz_block_gen` (blocks) → ROM.

WYSIWYG path is the same one already working; only the shape *vocabulary* and the strip *source* change.

## Testing / verification

- **Import tool:** unit-check the output tables == S&K inputs (heights/rotated/angles byte-identical; solidity all-`all` except index 0); table sizes 4096/4096/256/256.
- **Bake:** with no `.collattr.bin`, strips' collision plane is all-air (fresh start); with a painted collattr (S&K index), the strip carries it (decode `sec0_blocks.bin` to confirm — the verified method). ROM tables == the imported S&K tables (md5). `ojz_strip_gen.py test` passes.
- **Build:** `SOUND_DRIVER_ENABLED=1 DEBUG=1 ./build.sh` completes; tile-budget guard passes.
- **In-game (emulator):** ROM boots; paint a floor in Aurora → Save → build → player stands on it; the player spawns over air until ground is painted (expected, fresh start).
- **Aurora:** `npx tsc --noEmit && npm test && npm run build` green; palette shows ~252 shapes across kind-tabs, angle-sorted; empty Floor tab hidden.

## Risks / open items

- **Spawn over air:** fresh start means no ground until painted → player falls at spawn. Acceptable (WIP); the user paints the start floor first. (The "Player below world" assert is already gated to clamp.)
- **Solidity = all everywhere:** no jump-through platforms yet. Deferred feature; noted.
- **Dropping the sonic_hack collision walk:** verify nothing else depends on `build_section_collision` / the attrset (BG? objects? probably not — collision-only). Keep the code, just unhook it from the table/strip path.
- **skdisasm path dependency:** the import reads from `../../skdisasm/...`. Commit the imported `data/collision/*.bin` so the build doesn't depend on skdisasm being present at build time (the tool is run once / on demand).
