# Spec — Collision Authoring (Phase 2): draw real collision on the map

Status: **design, autonomous (user asleep) — to be adversarially verified before build** · 2026-06-20
Context: Phase 2 of the collision initiative (`2026-06-19-collision-tooling-design.md`). Phase 1
gave an accurate read-only VIEW (real surfaces from the engine strips). Phase 2 makes collision
**editable** — "hard to add it" was half the original ask. **Phase 2a (this spec's build target)**
is the authoring foundation: an editable real-attr collision layer, a profile palette, a paint
tool, and persistence. **2b/2c are roadmap.**

## 0. Where Phase 1 left the model (the starting point)

- `Section.engineCollision` / `engineCollisionB` = **read-only** per-cell attr indices (0-255) from
  the baked strips (path A / path B). The collision VIEW renders these; they match the game.
- `Section.tileGrid.collision` = the legacy **editable** byte array. On load it was the crude
  legacy `.coll.bin` (verified: only 0/1 — meaningless vs the real attr indices). The old
  `paint-collision` tool clamps to a 0-15 nibble. **This is stale and must be migrated.**
- Real collision is per **16px cell** (attr index → heightmap/angle/solidity tables). One attr
  index per cell; both 8px tiles of a cell carry it.

## 1. Goal & phasing

**Phase 2 goal:** author real collision in the editor — assign collision profiles (shapes +
solidity + angle) to map cells, see it live, undo it, and persist it.

**Phase 2a (build now):**
- §3 Migrate the editable collision to **real attr indices** (seeded from the strips), persisted
  to a new `.collattr.bin` (the crude `.coll.bin` is retired for collision).
- §4 The VIEW renders the **editable** layer for path A, so edits show live.
- §5 A **collision profile palette** — the level's real profiles as shape thumbnails + an eraser.
- §6 A **paint tool** that writes the selected profile index per 16px cell, undoable.

**2b (roadmap):** a **profile editor** (draw a new 16-col height shape, set solidity + angle, dedup
into the set); **path-B / per-path** authoring; **block-level** collision (attach to reusable
blocks). **2c / Phase 3 (roadmap, gated):** **bake to ROM** — re-verify the engine build tools
(`collision_pipeline.py` / `ojz_strip_gen.py` / `build.sh`) and emit collision the build consumes
(today the act descriptor ships `sec_collision_s4lz = 0`).

**Non-goals (2a):** creating *new* profiles (only existing ones can be painted — 2b); editing path
B; ROM bake. 2a is editor-side authoring of the real per-cell collision plane using the profiles
the level already defines.

## 2. Why per-cell attr painting is the right 2a primitive

The engine's per-cell attr index IS the unit the strips store and the view renders. Painting an
**existing** attr index onto a cell is a direct, well-defined edit of that plane — it needs none
of the post-bake authoring complexity (block→profile + flips + per-path solidity) that *creating*
profiles or block-authoring (2b) require. So 2a edits the per-cell attr plane; 2b/2c add profile
creation and the block/ROM path.

## 3. Editable layer + persistence (2a)

**CORRECTED (adversarial verification):** do NOT repurpose `tileGrid.collision` — it is bridged
with `ChunkDef.collision`'s **2-bit block-solidity flags** (chunk stamping copies 0..3 flags into
it), so reinterpreting it as a 0-255 attr index would render stamped chunks as garbage profiles.
Use a **separate field**.

- Add **`Section.collisionEdit: Uint8Array | null`** — the editable real-attr (0-255) plane.
- On load (additive — the existing `tileGrid.collision`/`.tiles.bin`/`.coll.bin` load is UNCHANGED;
  `tileGrid.collision` stays the legacy chunk/nibble plane): after `engineCollision` is built from
  the strips, seed `collisionEdit = parseCollAttr(${prefix}.collattr.bin)` if that file exists,
  **else `engineCollision.slice()` (a CLONE, not an alias — so paints don't mutate the diff
  baseline)**. `null` only when there are no strips and no saved file.
- Save **adds** a `${prefix}.collattr.bin` write of `collisionEdit` (identity bytes via a new
  `s4-collattr.ts`). The legacy editor `.coll.bin` write is left as-is (harmless; nothing reads it
  for the view now).
- `engineCollision` (path A) / `engineCollisionB` (path B) remain read-only strip references for
  the path-B view and the A/B diff baseline.

## 4. The view renders the editable layer (2a)

- Path A overlay + hover render **`collisionEdit ?? engineCollision`** (prefer the editable plane;
  fall back to the strip reference, then `tileGrid.collision`), so painted edits appear immediately.
- Path B overlay still renders `engineCollisionB` (read-only). The A/B diff compares the path-A
  array (`collisionEdit ?? engineCollision`) against read-only B — unedited sections show **zero**
  false diffs because `collisionEdit` is seeded as a clone of `engineCollision`.
- The map invalidates + repaints on the new `set-collision-edit` command (below), like tile paints.

## 5. The collision profile palette (2a)

A new panel (map mode, shown when the collision paint tool is active) listing the level's real
profiles as **shape thumbnails**:
- One swatch per meaningful profile index `1..solidCount-1` (≈45-64 for OJZ), each a small canvas
  drawing that profile's silhouette (reusing `columnSolidRun`) tinted by solidity, with the index
  shown. Plus an **Erase (air)** swatch = index 0.
- Clicking a swatch sets the active paint profile in a **new** `editorStore.selectedCollisionProfile`
  (0-255). **CORRECTED:** do NOT reuse `selectedCollisionType` — the art-mode stepper masks it with
  `& 0xF` / `% 16` (`ArtToolOptions.tsx:79-81`) and would silently collapse any value >15 on a mode
  switch. `selectedCollisionType` stays the 0-15 art/chunk nibble, untouched. The selected swatch is
  highlighted.
- Optionally a hovered-swatch tooltip: `#idx · solidity · angle°`.
- The palette derives its list from `projectStore.collisionProfiles` (already loaded). If profiles
  are absent (no tables), the palette shows a "collision tables not found" note and is inert.

## 6. The paint tool (2a)

- Repoint the existing `paint-collision` map tool to author the real plane via a **new
  `set-collision-edit` command** (mirrors `set-collision`: `{ type, sectionIndex, entries:
  {index, oldColl, newColl}[] }`, multi-entry + undoable; apply/undo mutate `section.collisionEdit`
  with a null-guard). The old `set-collision` (→ `tileGrid.collision`) is left defined but unused.
- A click/drag paints the **whole 16px cell** — all four 8px tiles (`(cellRow*2+dr)*256 +
  (cellCol*2+dc)` for `dr,dc ∈ {0,1}`) get the selected attr index — via one 4-entry command
  (drop entries where `oldColl===newColl`). A pure `cellTileIndices(cellCol, cellRow, width)`
  helper defines the 4 indices once. Drag **dedupes per cell** (a `lastPaintedCell` ref, like the
  tile painter) so dragging within a cell doesn't push duplicate commands.
- The active value is `selectedCollisionProfile` (0 = erase to air). Painting writes
  `collisionEdit`; the view (rendering it) updates live; Ctrl+Z reverts via the command history.

## 7. Data model, components, testing (2a)

**Core (pure, testable):**
- `src/core/formats/s4-collattr.ts` — `parseCollAttr` / `serializeCollAttr` (identity byte copy,
  mirroring `s4-collision.ts`). *Unit tested (round-trip).*
- `src/core/model/...` — `cellTileIndices(cellCol, cellRow, width)` → the 4 tile indices of a 16px
  cell. *Unit tested.*
- `src/core/editing/commands.ts` + `history.ts` — new `SetCollisionEditCommand` (`set-collision-edit`)
  mutating `section.collisionEdit` (null-guarded), apply + undo. *Covered by an editing test.*

**Model:** `Section.collisionEdit: Uint8Array | null` (+ `createSection` inits `null`).

**Renderer:**
- `useProject.ts` — load: ADD `collisionEdit = parseCollAttr(.collattr.bin) ?? engineCollision.slice()`
  after the strip block (existing `tileGrid.collision` load unchanged); save: ADD a `.collattr.bin`
  write of `collisionEdit`.
- `OverlayRenderer` + `MapViewport` hover — path A reads `collisionEdit ?? engineCollision`.
- `editorStore` — new `selectedCollisionProfile: number` (0-255) + setter; `selectedCollisionType`
  untouched.
- `CollisionPalette.tsx` (new) — the thumbnail palette; mounted in the map-mode side **Panel**
  (`App.tsx`, gated on `tool === 'paint-collision'`; map mode has no option bar).
- `MapViewport` paint handler — `paint-collision` paints the 16px cell (4 tiles) with
  `selectedCollisionProfile` via `set-collision-edit`, with per-cell drag dedupe.

**Testing:** `s4-collattr` round-trip; `cellTileIndices`; `set-collision-edit` apply/undo; existing
suites green; raw-hex guardrail 0. **Manual (user, morning):** load OJZ → collision shows real
surfaces; pick a profile from the palette → paint cells → they update live in the right shape/color;
erase to air; Ctrl+Z; save + reload → edits persist (`.collattr.bin`); path B + diff still work; the
art-mode chunk collision stepper is unaffected.

## 8. Resolved decisions (post-verification) + remaining risk

Resolved by the adversarial verification (all folded into §3-§7):
- **Separate `collisionEdit` field**, not `tileGrid.collision` (which carries chunk 2-bit flags).
- **Separate `selectedCollisionProfile` store field**, not `selectedCollisionType` (art nibble).
- **New `set-collision-edit` command**, not the legacy `set-collision`.
- **Clone on seed** (`engineCollision.slice()`) so paints don't corrupt the diff baseline.
- **`loaded` flag stays driven by the nametable**; the `tileGrid.collision`/`.coll.bin` load is left
  untouched (additive change), minimizing blast radius.
- Palette mounts in the **side Panel** (map mode has no option bar).

Remaining risk to watch in implementation:
- **ROM reach:** 2a is editor-side only; painted collision does NOT drive the game until Phase 3
  (the act descriptor still ships `sec_collision_s4lz = 0`). The palette/UX must not imply it ships.
- **Profile creation:** 2a paints only EXISTING profiles. Painting a shape the level doesn't have
  needs the profile editor (2b). The palette should make clear it lists the level's profiles.
