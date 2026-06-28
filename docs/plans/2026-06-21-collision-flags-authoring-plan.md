# Collision Flag Authoring (shape + flip + solidity, build-time resolved) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Author collision in Aurora as a **shape + X/Y-flip + solidity** per cell (the classic Sonic 16-bit chunk-entry word), so one stored shape gives both slope directions and any solidity. Resolve the flags **at build time** (the bake interns the flipped/solidity variant into the existing 1-byte runtime index) — runtime collision path unchanged.

**Validated by deep research (S2/S3K disasm + Sonic Clean Engine + SPRG):** flip is a per-placement runtime *flag* (mirror), distinct from rotation (separate shapes) — no contradiction with "no runtime rotation". We resolve it at BUILD time (vs Sonic's probe-time) because our flip math is tested Python and the runtime stays cheap.

**Corrected facts (the earlier proposal got these wrong):**
- Authoring word: `bits0-9 shape | bit10 Xflip | bit11 Yflip | bits12-13 path-A solidity {top,lrb} | bits14-15 path-B solidity {top,lrb}`. No reserved bits; solidity is **4 bits (top/lrb per path)**, NOT a 2-bit enum.
- X-flip = reverse the 16 height columns (`flip_profile_x`) + `flip_angle_x` (neg). Y-flip = `256-h` (0/16 fixed, `flip_profile_y`) + `flip_angle_y` = `-angle-0x80`. These exist + are tested in `collision_pipeline.py`.
- Editor UX exposes the common floor types (Solid = top+lrb on path A, Jump-through = top-only, None); path-B + full bit control is advanced/derived (out of scope detail).

**Architecture:** Aurora reads a fixed **base shape bank** (the 252 S&K shapes) for the palette and stores a 16-bit cell word in `.collattr`. The bake (`ojz_strip_gen` + `collision_pipeline.bake_cell`) reads the word, applies the flip/solidity math, **interns** the result into the runtime attr-set, emits the runtime tables + remapped strips. Runtime (1-byte cell, dual A/B plane) is unchanged.

**Tech:** TypeScript/React/Vitest (Aurora), Python (engine bake), AS/68k (runtime — untouched).

**Combo-cap note:** interned combos are capped at 255; a single act realistically stays well under. Task 4 instruments the peak count; if a future zone overflows, that's the trigger to revisit a runtime word (out of scope now).

## File Structure
- **Create** `aurora/src/core/collision/collision-cell-word.ts` (+test) — pack/unpack the 16-bit cell word.
- **Modify** `aurora/src/core/model/s4-types.ts` — `collisionEdit`/`collisionEditB` → `Uint16Array`; Solidity helpers.
- **Modify** `aurora/src/core/formats/s4-collattr.ts` — 16-bit BE parse/serialize.
- **Modify** `aurora/src/renderer/hooks/useProject.ts` — read the **base bank** for the palette; load/save 16-bit collattr.
- **Modify** `aurora/src/renderer/state/editorStore.ts` — `selectedCollisionXFlip/YFlip/Solidity` + setters.
- **Modify** `aurora/src/renderer/components/CollisionPalette.tsx` — Flip-H / Flip-V buttons + a Floor-type (solidity) picker.
- **Modify** `aurora/src/core/collision/collision-shape-draw.ts` — optional flip in the silhouette draw (preview shows the flipped/solidity-shaded shape).
- **Modify** `aurora/src/renderer/components/MapViewport.tsx` (+`collision-paint.ts`, `commands.ts`/`history.ts`) — paint packs the word into the Uint16 plane.
- **Modify** `s4_engine/tools/import_sk_collision.py` — write the **base bank** (`data/collision/base/*.bin`).
- **Modify** `s4_engine/tools/ojz_strip_gen.py` + `collision_pipeline.py` — read 16-bit collattr words, intern flip/solidity into the runtime tables (`data/collision/*.bin`) + remapped strips; report peak combo count.

(Detailed TDD steps per task to be expanded during execution; each task ends with the verification gate: `npx tsc --noEmit && npm test && npm run build` for Aurora, `python3 tools/ojz_strip_gen.py test` + `SOUND_DRIVER_ENABLED=1 DEBUG=1 ./build.sh` + emulator boot for the engine.)

## Tasks (high level — expanded at execution)
1. **Cell word codec** (pure, TDD): `packCollisionCell({shape,xFlip,yFlip,solidity})` / `unpackCollisionCell` mirroring `packNametableWord`. Solidity helper maps the floor-type UX → bits.
2. **Aurora model/format**: widen the editable planes to `Uint16Array`; 16-bit BE `.collattr`; load/save; the base-bank read for the palette.
3. **Aurora UX**: Flip-H / Flip-V toggles + a Floor-type picker (Solid / Jump-through / None) in the palette; paint packs the word; preview renders flipped + solidity-shaded via `drawCollisionShape`.
4. **Bake intern + base bank**: `import_sk_collision` → base bank; `ojz_strip_gen`/`collision_pipeline.bake_cell` read the word, apply flip/solidity, intern → runtime tables + strips; print peak unique-combo count per section.
5. **Verify end-to-end**: paint a *flipped jump-through* slope, Save, build, decode the block (the interned variant reached the ROM), emulator: stand on it / jump up through it.

## Manual verification (user)
Open the Collision tool → pick a shape, toggle **Flip H** (it mirrors to the other direction), pick **Jump-through** → paint a one-way platform. Save → `SOUND_DRIVER_ENABLED=1 DEBUG=1 ./build.sh` → run → you can jump up through it and land on top; flip a slope and it faces the other way.
