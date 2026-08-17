# Classic collision authoring — design

**Date:** 2026-08-16
**Status:** approved, not yet planned
**Origin:** §7.2 of `docs/reviews/2026-08-16-aurora-lens-sweep.md` (DIR seat) — recommended next phase.

---

## 1. Why

Every rung of the classic art ladder — originate → constrain → import → commit → refine — now
exists in-app **except collision**, which is the one rung that still sends the artist out of Aurora.
That is the exact failure the "artists don't leave for Aseprite" bar forbids, arriving at the last
step.

Concretely: `classicSetColind` (`src/renderer/state/classicLevelStore.ts:1189`) is reachable only
from the agent handler and MCP `set_colind` (`src/main/editor-methods.ts:142`). **The agent can
assign collision today and a person cannot.** Classic's sole human affordance is a read-only
overlay. `collision` is absent from `S1_FACETS` by owner decision on 2026-08-13
(`src/core/project/s1/index.ts:76-83`), pending exactly this design.

## 2. The model this is built on

The engine's lookup chain, verified against the disassembly
(`s1disasm/_incObj/sub FindNearestTile & FindFloor & FindWall.asm`):

```
FG layout byte (1-based chunk id; $00 = air)
  └→ chunk definition, 16×16 cells
       └→ chunk cell (16×16px) carries TWO independent things:
            ① solidity, 2 bits at bits 13..14 of the packed cell word
            ② a block id + X/Y flips
                 └→ colind[block]  →  shape index
                      └→ shape: 16 height columns + one angle byte
```

- **Solidity gates the shape.** `btst d5,d4` runs before the shape is consulted.
- **Block id 0 short-circuits both.** `andi.w #$7FF,d0 / beq.s .isblank` precedes the solidity
  test. Shape index 0 short-circuits too.
- **Collision is read from the FG plane only** (`lea (v_lvllayout_fg).w,a1`).

### 2.1 Sharing is two-level, and both levels are shared

This is the fact the design turns on, and the first draft of this design got it wrong:

| tier | what it is | shared by |
|---|---|---|
| **solidity** | a field of the chunk **definition** | every placement of that chunk, zone-wide |
| **colind** | block id → shape index | every use of that block, **zone**-wide (all three acts share `collide/{ZONE}.bin`) |

Measured: in GHZ FG across acts 1–3, **304 of 309 non-air layout cells (98%) reference a chunk that
is stamped more than once** (50 distinct chunks). There is no such thing as a "local" solidity edit
made from the map.

What *is* true: a **block** shared between two chunk cells can be solid in one and air in the other,
because solidity rides the cell rather than the block.

### 2.2 Why the chunk tier is not editable from the map

A chunk-tier Isolate (duplicate the chunk, restamp the clicked layout cell) is not affordable:

1. It burns one of only **127 addressable chunk ids** (`MAX_ADDRESSABLE_CHUNKS`,
   `src/core/level-classic/model.ts:208`) — the layout loop bit makes $80+ unaddressable.
2. It spans two undo documents: the layout restamp is the `fg` domain (act-scoped), the chunk
   duplicate is `chunks` (zone-art). `assertSingleDomain`
   (`classicLevelStore.ts:629-643`) forbids that composite, so **it cannot be one undo step** under
   the current architecture.

## 3. Scope

**In:** assigning collision from the shapes the disassembly already ships — the block tier
(`colind`) from a new map facet, with the chunk tier read there and edited where it already is.

**Out:** editing the height/angle tables. Beyond needing a new save-back path, it is barely
possible: the table is **global across all six zones**, with 251 non-empty slots / 247 distinct
patterns and only ~17 slots free (5 empty + 12 non-empty-but-unreferenced), three files to keep in
sync (Normal + Rotated + Angle Map), and no encoder exists.

**Stated limitation:** assign-only means **snap-to-nearest**. An arbitrarily drawn block profile
will generally have no exact match among the 247. Per-zone distinct usage: GHZ 60, LZ 40, MZ 13,
SLZ 109, SYZ 49, SBZ 68.

## 4. Design

### 4.1 Tier ownership

- **New Collision facet, on the level map** — owns the **block tier**. Click a cell, assign that
  block's shape.
- **ChunkTab's Assign mode keeps the chunk tier** — it already edits solidity today
  (`brushSolidity` chips, `ChunkTab.tsx:103,528-533`, committed through `classicEditChunkCells`).
  The facet **reads** solidity and links to it. There must be exactly one solidity editor.

Registering the facet requires resolving the aeon-only `CollisionPalette` pill coupling named in
`s1/index.ts:76-83` (spec §3.0.3) — classic needs its own palette, not aeon's.

### 4.2 The panel, split by what the control changes

- **This block** *(editable)* — shape picker (this zone's shapes first, then the rest), the usage
  count, and the **Link / Isolate** switch. Link changes every use of the block zone-wide; Isolate
  forks the block for this cell only.
- **This cell** *(read-only)* — solidity, the owning chunk, how many placements share that chunk,
  and a breadcrumb into the Chunk tab.

The two headings are load-bearing: the tier a control acts on must be stated, not inferred. (Same
lesson as the "Diverge:" label removed in `17783ae`.)

### 4.3 What does not exist yet and must be built

- **A colind override on the Isolate path.** `classicPaintSurface` hard-codes colind inheritance
  from `sourceBlockId` with no override (`classicLevelStore.ts:936,982-992`), and
  `SurfaceEditPlan.newBlocks` carries no colind field. "Clone the block, repoint the cell, assign a
  *different* shape" is therefore inexpressible today. Composing `classicAddBlock` +
  `classicEditChunkCells` + `classicSetColind` is three commits = three undo entries and can strand
  a cloned block on undo (the store's own doctrine, `classicLevelStore.ts:930`). Add the override to
  `newBlocks` instead.
- **Undo routing.** colind is an `ART_DOMAIN` → zone-art stack, but map-tab Ctrl+Z routes by facet
  through `ZONE_ART_FACETS = {'art','palette'}` (`editorStore.ts:220,248`). `collision` must join
  that set or every collision edit made on the map is un-undoable *from* the map.

### 4.4 Canvas commit

Most of this is already built and the packet overstated the gap. The commit planner **already
inherits** collision from the displaced cell (`classic-commit-plan.ts:571-576`) and block-reuse
identity already includes colind (`renderKey#colind`, `:501,530`). It **already reports** the
shortfall (`canvas-commit-model.ts:78-84`): *"collision: X inherited · N have none"* and
*"solidity: N cells have none (appended chunks)"*. colind 0 / solidity 0 arise only for cells with
no predecessor — appended chunks and previously-air cells.

**New:** one remediation action on that report — assign shape **$FF** + solidity All to those cells.

Setting solidity here does not contradict §4.1's "the facet never edits solidity". The cells with no
predecessor are in chunks the commit itself just **appended**, so they have exactly one placement and
nothing else shares them. It is the one moment in the app where a solidity write is provably local,
and it is available only as this one bulk action on freshly created chunks — not as a brush.

> The shape must be **$FF**, not "a full-height block". Five shapes are full-height ($FB–$FF) but
> their Angle Map bytes are $E0, $20, $A0, $60, $FF — $FB–$FE are 45°-family loop corners. Only $FF
> is flat/neutral.

### 4.5 MCP parity

- `paint_collision` for classic, in the **same cell coordinates the facet uses**, so the agent and
  the human describe collision the same way. (`set_colind` and `edit_chunk` technically reach colind
  and solidity today, but only as raw block ids and packed words.)

  Its contract mirrors the facet's exactly, and the mirroring is the point: given a rectangle in
  16px FG cell units, it assigns a shape index to **the block under each cell** — the block tier
  only. It does **not** set solidity; that stays `edit_chunk`, for the same reason the facet does
  not (§2.2). Like the facet it takes the Link/Isolate mode, defaulting to Link, and refuses block 0
  and the overhang range with the same messages.
- `commit_canvas` and `import_art_sheet` — neither exists on MCP at all. The whole 2A/2B/2C art line
  shipped UI-only; this is the actual parity breach DIR-A3 named.

### 4.6 Bugs fixed here, because the facet is built on them

- **The angle needle is drawn mirrored.** `classic-overlays.ts:90-91` draws direction
  `(cos a, −sin a)`; the engine's convention (anchored on `Sonic_Jump`, `'01 Sonic.asm':1224-1231`,
  which jumps along angle−$40 through `CalcSine`) makes it `(cos a, sin a)` with canvas y-down. A
  **stray negation is present and must be removed** — it is not a missing one. Symptom: an ascending
  slope ($E0) draws as descending.
- **The needle ignores `cell.xf/yf`** (`:84`), while the height rendering directly above it honors
  them and the engine transforms the angle on flips (xflip → `neg`; yflip → −a−$80). Flipped cells
  stay wrong even after the sign fix.
- **`colind[0]` is writable but unreachable** — block 0 short-circuits. The editor refuses it and
  says why. Related: the overlay lacks the engine's block-0 short-circuit (`:66-68`), so a non-zero
  `colind[0]` would draw phantom collision. Latent today (0 in all six stock zones).

## 5. Hazards to surface, not swallow

- **The colind overhang (CLASSIC-A4, `classicLevelStore.ts:967-981`).** GHZ ships **439 blocks
  against a 410-byte colind**; in ROM the overhang resolves into the adjacent zone's table, so
  blocks ≥410 may have real in-game collision that Aurora shows as air. Assigning a shape to such a
  block force-grows the table with zeros, **silently changing every other overhang block's in-game
  collision**. This design makes a latent question load-bearing: it must refuse or warn loudly, not
  proceed quietly.
- **GHZ $28/$51 loop alias.** The engine substitutes chunk $51 for $28 behind loops
  (`FindNearestTile .specialtile`). The canvas planner already warns
  (`classic-commit-plan.ts:623-625`); a map-first collision editor shows half the loop's truth and
  needs the same warning.
- **`collision.rotated` is enumerated but never loaded** (`s1-io.ts:371-372` loads Normal + Angle
  Map only; the entry exists at `s1/index.ts:163`). The overlay is a floor heightmap. Correct for
  stock, misleading on hacks with a desynced Rotated array — state the limit rather than implying
  full fidelity.
- **Documentation drift found while designing:** `profiles/s1.ts:82` documents colind as
  "per-chunk"; it is per-block. Fix in passing.

## 6. Testing

Following the repo's standing discipline — **every fix lands with the plant that proves its guard
fires**:

- **Pure model tests:** the resolve chain (layout byte → chunk → cell → block → colind → shape),
  including the block-0 and shape-0 short-circuits and the FG-only rule; the Isolate-with-colind-
  override plan; the $FF selection in commit remediation.
- **Source guards:** `collision` registered in both `S1_FACETS` and the undo-routing set (a facet
  that exists but is not undo-routed is the specific silent failure); the angle needle honoring
  flips.
- **Runtime (CDP):** click a map cell → the block's shape changes → **one** Ctrl+Z reverts it, from
  the map. This is the row that a source guard cannot reach, and undo routing is exactly where this
  design is most likely to be wrong.
- **Refusal rows:** `colind[0]`, and a block in the GHZ overhang range.

## 7. Staging

One phase, but it does not want to be one commit. The order is chosen so each stage is independently
verifiable and the riskiest thing is not underneath everything else:

1. **The three overlay/model bug fixes** (§4.6) plus the `profiles/s1.ts:82` doc fix. They are small,
   they stand alone, and the facet is a lie without them — an editor built on a mirrored needle
   teaches the wrong slope.
2. **The store extension**: colind override on `SurfaceEditPlan.newBlocks`, plus the overhang and
   block-0 refusals. Pure model, fully unit-testable, no UI.
3. **The facet**: registration, undo routing, classic collision palette, the two-heading panel.
4. **Commit remediation** (§4.4) — needs 2 and 3 in place to be worth offering.
5. **MCP parity** (§4.5) — `paint_collision` last of the three, since it mirrors a facet contract
   that must exist first; `commit_canvas` / `import_art_sheet` are independent and can go any time
   after 1.

## 8. Explicitly not in this phase

- Editing the shape tables (§3).
- A section navigator on the facet — the aeon facet's own note calls that a separate design ask.
- Touching `src/core/collision/` — that is aeon's system, unaudited per the sweep packet §9, and
  classic's collision is a different model that does not route through it.
- Lifting `assertSingleDomain` to make chunk-tier Isolate atomic. That is a store-architecture phase
  of its own, and §4.1 is designed so this phase does not need it.
