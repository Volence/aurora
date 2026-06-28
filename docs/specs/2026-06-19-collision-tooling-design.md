# Spec — Collision Tooling (see → draw → bake), engine-agnostic

Status: **design, awaiting user review** · 2026-06-19
Context: Goal 2 of the Aurora roadmap ("better tooling around level collision: can't see it,
hard to add it"). Brainstormed from a full map of collision across Aurora and the s4_engine
ROM pipeline, then **adversarially verified against the live code + engine data** (corrections
folded in). **Phase 1 (accurate model + view) is scoped to build now;** Phases 2-4 (draw, bake,
multi-game) are documented as the roadmap this phase is architected for.

## 0. Why this exists (the gap)

Aurora's collision today is a **placeholder that doesn't match the engine**:
- The editor stores collision as a byte per 8px tile (`SectionTileGrid.collision: Uint8Array`,
  256×256). The interactive painter clamps to a **0-15 nibble** (`ArtToolOptions.tsx:79-81`); the
  map overlay (`OverlayRenderer.drawCollisionOverlay`) colors only ids 1-7 and paints anything ≥8
  as OOB magenta.
- On **ROM export the collision pointer is hardcoded to `0`** (`act-descriptor.ts:79` ships
  `dc.l 0 ; sec_collision_s4lz`). So painted collision **goes nowhere** — the game never reads it.

The engine's **real** collision is full Sonic-style, per **16px cell**, an **attr index** (0-255,
0 = air) into four global ROM tables baked by `s4_engine/tools/collision_pipeline.py`:

| Table | File (`s4_engine/data/collision/`) | Size | Meaning (per attr index) |
|---|---|---|---|
| Height maps (floor/ceiling) | `heightmaps.bin` | 4096 B = 256×16 | 16 signed height bytes, one per pixel-column |
| Height maps rotated (walls) | `heightmaps_rot.bin` | 4096 B = 256×16 | 16 signed width bytes (derivable via rotate) |
| Angles | `angles.bin` | 256 B | one 256-unit angle byte (odd = "no usable angle") |
| Solidity | `solidity.bin` | 256 B | one class byte: 0 none / 1 top-only / 2 left-right-bottom / 3 all |

**Aurora can already obtain the real per-cell attr indices** — but only via the *fallback* load
path. `s4-strips.ts` parses the engine strip files (`WIDE_STRIP_SIZE = 776`/column, 128 path-A
collision bytes), writing each 16px-cell byte into **both tile rows** of the cell (vertical
duplication, `s4-strips.ts:51-54`); the two 8px *columns* of a cell carry equal bytes by an
**engine-baker invariant** (`build_section_collision` shares a block's baked byte across its
columns), not via the loader. Verified in `sec0`: those bytes are attr indices 0-52, keying into
the tables (`solidity.bin` = exactly `{0,1,2,3}`, `heightmaps.bin` profile 1 = sixteen `16`s).

**Caveat (drives §8's reconciliation work):** `loadFullProject` loads an editor-owned
`section_{i}.coll.bin` (identity passthrough) **with priority over strips** (`useProject.ts:382-404`).
So a project saved *after* painting carries **0-15 painter nibbles**, not attr indices — the rich
overlay would misread those. "The data is already the real indices" holds only for fresh-from-strips
projects. Phase 1 is read-only (it doesn't make this worse); Phase 2 must reconcile the encodings.

## 0a. The collision byte has THREE incompatible encodings today

Critical to get right up front (all share the same `Uint8Array` shape, which is what made the
first draft of this spec wrong):

1. **Strip / section attr index (0-255)** — the engine's real per-cell profile index. **This is
   the model's profile-index space** (§3).
2. **Map-painter nibble (0-15)** — what the interactive `paint-collision` tool writes today
   (`ArtToolOptions.tsx:79-81`, `& 0xF`). A crude legacy encoding, to be **replaced** (not
   reinterpreted) by Phase 2's profile palette.
3. **`ChunkDef.collision` 2-bit block-flag (0-3)** — chunks store a solidity bitfield, not an
   index (`chunk-mappings.ts:90-92` `blockRefToCollision` → `(solidTop?2:0)|(solidAll?1:0)`). A
   **different** encoding Phase 2 must **migrate**, not paint into directly.

Phase 1 only *reads* encoding #1 (and degrades safely on #2/#3 — §7). Unifying these is explicit
Phase-2 data-model work, called out so nothing here implies they're already one thing.

## 1. Goals & non-goals

**Overall goal (multi-phase):** see real collision accurately, draw/author it on the map and on
tiles/blocks, and bake it into the ROM — all behind an engine-agnostic model so Sonic 1/2/3K
collision can plug in later.

**Phase 1 goal (build now):** an engine-agnostic collision **view model** + an **`s4` adapter**
that decodes the four tables, an accurate **map overlay** rendering the true collision surface
(height silhouette + solidity color + angle), and a **hover inspector**. Read-only.

**In scope (Phase 1):** §3 (view model + adapter), §4 (table loading + source config), §5 (overlay),
§6 (hover inspector), §7 (fallback + bounds). **Architected for** §8 (draw) / §9 (bake) without a
rewrite of the *decode/view* layer.

**Out of scope / deferred (documented, not built in Phase 1):** §8 drawing/authoring (Phase 2),
§9 ROM bake (Phase 3, gated on re-verifying the build tools), §10 multi-game adapters; rendering
the rotated/wall profiles as a distinct overlay; dual-path (A/B) collision.

## 2. Architecture overview

Mirrors Aurora's proven `SpriteFormatAdapter` (s1/s2/s3k/s4) pattern — the renderer works against
ONE engine-agnostic *view model*; per-game decode lives in an adapter.

```
CollisionAdapter (per engine; 's4' now, s1/s2/s3k later)
  decodeProfiles(tables) -> CollisionProfileSet   // game tables -> canonical VIEW form
  (Phase 3) encode/bake                            // canonical authoring form -> game format
        │ produces
        ▼
CollisionProfileSet  (engine-agnostic READ/VIEW form; up to N CollisionProfile, index 0 = air)
  CollisionProfile { heights: Int8Array(16); angle; hasAngle; solidity: Solidity }
        │ each map cell references a profile by index (the existing strip/section collision byte)
        ▼
OverlayRenderer.drawCollisionOverlay  (rewritten: real surfaces; profiles threaded in via render())
  + hover inspector (attr index, solidity, angle°, height sparkline)
        │ Phase 2 adds a SEPARATE authoring model (block->profile + flips + per-path solidity)
        ▼
paint/stamp tools (map cells + blocks/tiles)
```

**Important boundary (set now):** `CollisionProfileSet` is the **decoded VIEW form**. The engine's
global tables are a **post-bake, deduplicated artifact** — `bake_cell` (collision_pipeline.py:172-205)
folds X/Y-flip and per-path solidity into each interned profile *before* it lands in the tables. The
engine's *authoring* source is per-block (block→profile id + xflip/yflip + per-path solidity in the
chunk word). So Phase 2 authoring needs its **own** model (§8); Phase 1's flat set is for reading
and rendering, **not** paint-ready. This boundary is the key thing the first spec draft got wrong.

## 3. The engine-agnostic VIEW model

New pure module `src/core/collision/collision-model.ts`:

```ts
/** Canonical solidity class — which sensor directions a cell stops. Adapters
 *  decode their game's solidity encoding INTO this; it is not any one game's
 *  byte layout. (s4 happens to store 0..3 identically.) */
export type Solidity = 'none' | 'top' | 'sides-bottom' | 'all';

/** One decoded collision shape (the VIEW form, not the authoring form). */
export interface CollisionProfile {
  /** 16 signed height bytes (one per px-column of a 16px cell). >0 solid up from
   *  the cell bottom; <0 solid hanging down from the top (depth = -value); 0 empty. */
  heights: Int8Array;
  /** Surface angle in 256-units (0 = flat). Raw; pair with hasAngle. */
  angle: number;
  /** Whether the angle is usable (the s4 "odd byte = no angle" flag is decoded by
   *  the adapter, so this convention never leaks past the boundary). */
  hasAngle: boolean;
  solidity: Solidity;
}

/** The decoded set a level indexes into; index 0 is reserved for air. The length
 *  is whatever the adapter decoded — the 256 cap is an s4 ENCODE constraint
 *  (Phase 3), not a model invariant, so S1/S2 adapters aren't forced through it. */
export interface CollisionProfileSet {
  profiles: CollisionProfile[];
  engine: string; // adapter id ('s4', …)
}

export function angleDegrees(p: CollisionProfile): number | null; // null when !hasAngle
export function isAir(set: CollisionProfileSet | null, index: number): boolean;
/** True when index is a real, in-range solid profile (not air, not out of range). */
export function isKnownProfile(set: CollisionProfileSet | null, index: number): boolean;
```

New `src/core/collision/collision-adapter.ts`:

```ts
export interface CollisionTables {
  heightmaps: Uint8Array;     // 256*16 raw engine bytes
  heightmapsRot?: Uint8Array; // optional (derivable)
  angles: Uint8Array;         // 256
  solidity: Uint8Array;       // 256
}
export interface CollisionAdapter {
  readonly id: string;                                   // 's4'
  decodeProfiles(tables: CollisionTables): CollisionProfileSet;
  // Phase 3: encode(...) -> engine output. Declared then.
}
```

`src/core/collision/adapters/s4-collision-adapter.ts` (Phase 1): decodes the four s4 tables.
- **Height:** signed-byte sign extension matching the engine's `ext.w` (`player_sensors.asm:152`)
  and the pipeline (`collision_pipeline.py:385`): `b < 0x80 ? b : b - 256` (i.e. an Int8 cast).
  On conformant data (bytes 0..16 ∪ 0xF0..0xFF) this gives 0/1-16/-1..-16; using the true
  sign-extension means malformed bytes decode like the engine instead of flipping to large values.
- **Angle:** `angle = byte`, `hasAngle = (byte & 1) === 0` (the s4 odd-flag, decoded here only).
- **Solidity:** `0→'none', 1→'top', 2→'sides-bottom', 3→'all'` (s4 `SOL_NONE/TOP/LRB/ALL`).

## 4. Loading the tables (Phase 1)

- **Source:** the engine's `data/collision/`. Add a new **optional** `collisionDataPath` to
  **`S4ProjectConfig`** (engine-global → project-level). `loadS4Config` (`s4-config.ts`) must
  accept the new optional field without failing validation. **Default when unset:** the
  project-relative constant `data/collision/` (matching the engine layout) — **not** a
  `stripPath`-relative derivation (`stripPath` lives on `S4ActConfig` and points at
  `data/generated/ojz/act1/`, a different subtree, so deriving from it is brittle).
- Load once at project load (`loadFullProject`) via the `s4` adapter into
  **`projectStore.collisionProfiles: CollisionProfileSet | null`** (global per project). Read the
  four `.bin`s through the existing main-process binary read, like tileset/palette `.bin`s.

## 5. The map overlay (Phase 1) — render the real surface

Rewrite `OverlayRenderer.drawCollisionOverlay` to render the true shape, gated by the existing
`viewStore.showCollision`, in world coordinates.

**Plumbing (must be specified — the first draft omitted it):** extend `OverlayRenderer.render(...)`
and `drawCollisionOverlay` to take `collisionProfiles: CollisionProfileSet | null`; thread it from
`projectStore` at **both** `MapViewport` call sites — the main render effect (`MapViewport.tsx:233`)
**and** the `ResizeObserver` path (`:273`, which currently omits even `objectSprites`); add
`collisionProfiles` to the render `useEffect` deps (`:235`) so the overlay repaints once tables load.

Per section, step by **16px cells** (2 tiles): read the attr index at the cell's top-left tile,
`collision[(cellRow*2) * 256 + (cellCol*2)]` (verified safe — both 8px columns of a cell are equal,
0/16384 mismatches in real data; `SECTION_TILES_WIDE = 256`). Then:
- `index === 0` → air, skip.
- `isKnownProfile` false (index ≥ `profiles.length`) → draw a distinct **"unknown profile"**
  marker (e.g. hatched outline), **not** treated as air, so stale/missing table data is visible.
- otherwise look up `profiles[index]` and draw:
  - **Height silhouette:** per px-column, `h>0` → solid `h` px up from the cell bottom; `h<0` →
    solid `-h` px down from the top; `h==0` → empty. Translucent fill so art stays visible.
  - **Solidity color:** distinct legible colors per `Solidity` class (`canvas-colors.ts` tokens,
    keeping the raw-hex guardrail at 0).
  - **Top-surface line:** crisp stroke along the top of each column's solid run.
  - **Angle ticks (sub-toggle `viewStore.showCollisionAngles`, default off):** when `hasAngle`, a
    short oriented tick at the cell center.

Exact fill/line/angle styling is a visual-design call at implementation; the spec fixes the data.

**Granularity note:** collision is engine-meaningful per **16px cell**. The legacy per-8px-tile
`paint-collision` tool can write a byte to a single sub-cell tile that this overlay (top-left
sample) and `serializeStrips` (even-rows only) ignore — a latent inconsistency, harmless in
read-only Phase 1, that Phase 2's profile painter resolves by writing all 4 tiles of a cell.

The art-mode composer collision HUD (`ComposerCanvas.tsx`, raw index number) stays as-is in Phase 1.

## 6. Hover inspector (Phase 1)

The map hover readout today is a status bar (`MapViewport.tsx:787-807`) showing only
`Sec N | Tile (col,row) | Pos x,y` — it does **not** read collision. Phase 1 **adds** a per-cell
collision sample to that handler: read the 16px-cell attr byte (top-left tile), look it up in
`collisionProfiles`, and append **attr index**, **solidity** class, **angle°** (or "—" when
`!hasAngle`), and a tiny **height sparkline**. Read-only; gated on `showCollision`.

## 7. Graceful fallback + bounds (Phase 1)

- **No tables** (`collisionProfiles === null`: path unset/missing/parse-fail): the overlay falls
  back to **a single flat translucent fill of every nonzero cell** — no palette indexing, no
  magenta-OOB (today's `COLLISION_PALETTE[1..7]` + magenta breaks for real indices up to 52). A
  one-line status note ("collision tables not found — showing raw cells") explains why the rich
  view is off. Never a crash.
- **Out-of-range index** in the rich path → the "unknown profile" marker (§5), never silently
  dropped as air.

## 8. Drawing / authoring (Phase 2 — documented, not built now)

Built on Phase 1's *decode* layer, but needs its **own authoring model** (the view set is not
paint-ready, §2). Reconciles the three encodings (§0a). Two granularities, matching the engine:
- **Authoring model:** per-block `block → profile id + xflip/yflip + per-path solidity` (the
  `bake_cell` inputs), from which the flat view set is derived for rendering. This is the inverse
  of the bake that Phase 1 only reads forward.
- **Paint on the map:** a real **collision-profile palette** (presets: flat, slopes, half-tiles,
  curves, ceilings + the level's profiles) and a paint/stamp tool that writes per **16px cell**
  (all 4 tiles), replacing the 0-15 nibble painter. Undoable via `set-collision` (its old/new
  bytes become profile indices).
- **Attach to tiles/blocks:** assign collision to a 16×16 block so it travels with reusable art;
  **migrate** `ChunkDef.collision` from its 2-bit flag encoding (§0a #3) to the profile/authoring
  model.
- **Profile editor:** draw the 16-column height shape, set angle + solidity, dedup into the set.

## 9. Bake to ROM (Phase 3 — documented, not built now)

Make painted collision drive the game. **GATE: before implementing, re-verify how the engine build
tools want collision handled** — read `collision_pipeline.py`, `gen_collision_data.py`,
`ojz_strip_gen.py`, and `build.sh` at that time. Target (from this brainstorm): per 16×16 block,
two 8×16 attr-byte grids (path A/B) after the 512-byte nametable, plus the four global tables keyed
by those attr bytes; the **256-cap is enforced here at encode** (the s4 attr-index limit). Options
to evaluate then: (a) Aurora emits the engine's strips/blocks + tables directly and the act
descriptor points at them (fixing the hardcoded `sec_collision_s4lz = 0`); or (b) Aurora emits the
pipeline's *inputs* and lets `collision_pipeline.py` bake — reusing the proven baker. Pick per what
the build wants then.

## 10. Multi-game adapters (later — designed for now)

S1/S2/S3K collision is similar (height arrays + angle bytes; different table layouts and solidity
encodings, and they index collision differently — e.g. separate block-collision-index + angle
tables, no 256 dedup cap). Each becomes a new `CollisionAdapter.decodeProfiles` producing the same
canonical `CollisionProfileSet`; the overlay, inspector, and paint tools are untouched. The model
deliberately keeps s4 specifics OUT (solidity as a named class, angle's odd-flag decoded in the
adapter, no 256-cap in the model) so these map cleanly.

## 11. Data model, components, testing (Phase 1)

**New:** `src/core/collision/collision-model.ts`, `collision-adapter.ts`,
`adapters/s4-collision-adapter.ts`. **Modified:** `projectStore` (+`collisionProfiles`),
`useProject.ts` (load tables), `s4-config.ts` (+ optional `collisionDataPath`, accepted by
`loadS4Config`), `OverlayRenderer.ts` (+ `collisionProfiles` param on `render`/`drawCollisionOverlay`,
real-surface render) + `canvas-colors.ts` (solidity-class + unknown-marker tokens),
`viewStore.ts` (+`showCollisionAngles`), `MapViewport.tsx` (thread profiles at **both** render call
sites + deps; add the hover collision sample).

**Testing (pure unit):** s4 adapter decodes known table bytes → expected profiles — signed height
incl. hanging/negative (`0xFF→-1`, `0xF0→-16`, `0x40→+64` via Int8); `hasAngle` from the odd-flag;
solidity `0-3 → 'none'/'top'/'sides-bottom'/'all'`. `angleDegrees` (no-angle → null). `isAir` /
`isKnownProfile` (0 → air; ≥ length → unknown; in-range → known). Silhouette geometry helper
(column → fill rect, incl. hanging). Real fixtures: slice the actual `heightmaps.bin`/`angles.bin`/
`solidity.bin` for known attr indices (profile 0 = air, 1 = full block, 40 = a slope). Existing
suites stay green; raw-hex guardrail stays 0.

**Manual (with user):** load the OJZ project, toggle collision → real slopes/surfaces colored by
solidity (not magenta blocks); hover a sloped cell → correct angle°; hanging/ceiling cells render
from the top; a project without tables falls back to flat fills (no crash); an out-of-range cell
shows the unknown marker.

## 12. Phasing

1. **Accurate VIEW model + overlay + inspector** (this spec, build now). Read-only.
2. **Draw collision** — authoring model (block→profile+flips+per-path solidity), profile palette +
   editor, per-cell paint on map + attach to blocks/tiles; reconcile the three byte encodings.
3. **Bake to ROM** — emit engine collision; *gated on re-checking the build tools.*
4. **Multi-game adapters** — S1/S2/S3K.

Each phase is independently shippable and verifiable in the running app.
