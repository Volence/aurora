# The collision word keeps the bits the stroke does not own

**Branch** `fix/collision-word-preservation` · **Project** LOOPS-P · **ROADMAP** §5.1 row 82
**Commits** `00e7933` (red module + rows) · `cbf896e` (red harness + debug hooks) · `7ccbd89` (the fixes)
**Instrument** `scratchpad/collision-preservation-harness.mjs` — `npm run harness:collision-preservation`
**Rule module** `src/core/editing/collision-word.ts` — sibling of `src/core/editing/brush-word.ts`

---

## 1. The rule

Aurora's collision-cell writers must preserve bits the field being written does not own.
This is a statement about the 16-bit word, not about any feature that might one day use the
spare bits.

`packCollisionCell` writes four fields:

| bits | field |
|---|---|
| 9:0 | shape index (0 = air) |
| 10 | X-flip |
| 11 | Y-flip |
| 13:12 | this plane's solidity |
| 15:14 | **not written by any Aurora field** |

The owned mask is **derived from the encoder**, never typed:

```ts
export const COLLISION_CELL_OWNED_MASK = packCollisionCell({
  shape: 0xFFFF, xFlip: true, yFlip: true, solidity: 'all',
});                                    // → 0x3FFF at today's layout
export const COLLISION_CELL_UNOWNED_MASK = (~COLLISION_CELL_OWNED_MASK) & 0xFFFF;
```

The day `packCollisionCell` starts writing bit 14, the mask widens on its own and the brush
starts owning it, with no edit to the rule. A literal `0xC000` anywhere in this parcel —
module, test or harness — would have been the copied-pin defect this repo keeps paying for.

---

## 2. The aeon grounding, and a correction to the dispatch's premise

Read at a **committed revision**, never through the peer's working tree
(`test/support/peer-repo.ts`, ROADMAP row 78):

```
git -C ../aeon show b76576ea:tools/collision_pipeline.py
```

`b76576ea` is the last commit touching that file. Its constants:

```python
BLOCK_ID_MASK    = 0x03FF      # bits 9:0 of a chunk entry word
CHUNK_XFLIP_BIT  = 0x0400      # bit 10
CHUNK_YFLIP_BIT  = 0x0800      # bit 11
PATH_A_SOL_SHIFT = 12          # bits 13:12 (bit12=top, bit13=lrb)
PATH_B_SOL_SHIFT = 14          # bits 15:14
```

**Our constants agree with theirs** for 13:0 — asserted, not trusted, by
`test/editing/collision-word.test.ts` → *"agrees with aeon collision_pipeline.py field
constants at a committed revision"*, which parses the four names out of the blob and checks
`BLOCK_ID_MASK | CHUNK_XFLIP_BIT | CHUNK_YFLIP_BIT | (3 << PATH_A_SOL_SHIFT) === COLLISION_CELL_OWNED_MASK`.

### ⚠ The premise this parcel was briefed on is wrong, and the correction matters

The dispatch stated that bits 15:14 are *"referenced nowhere in their pipeline"* — a grep for
`0xC000`, `>> 14`, `<< 14`, `0x3FFF` having returned zero hits — and that their semantics are
*"still being designed"*.

At `b76576ea`, **`PATH_B_SOL_SHIFT = 14` is a live, fully-defined field.** The grep missed it
because the pipeline never spells the mask; it shifts by a named constant. Three uses:

- `collision_pipeline.py:54` — the declaration, commented `# bits 15:14`.
- `:189` — `bake_cell` loops `((PATH_A_SOL_SHIFT, index_a), (PATH_B_SOL_SHIFT, index_b))` and
  extracts `solidity = (block_word >> shift) & 3` for each path.
- `:542` — its own self-test: *"Path B all-solid (bits 15:14), path A empty"*.

So the semantics are **not unsettled**. They are settled, and they are path-B solidity.

**Why this is still not a reason to encode them.** The same file carries a *second* baker,
`bake_plane_cell`, added for us and documented as such:

> *"Aurora paints each of the engine's TWO collision planes independently, so each cell
> carries its OWN word (vs bake_cell's single word driving both paths). cell_word bits: 9:0
> base-bank shape index, bit10 xflip, bit11 yflip, 13:12 THIS plane's solidity"*

That is the encoding Aurora's data feeds, and it never reads 15:14. Path B's solidity lives
in **plane B's own bits 13:12** — which is exactly what `collision-cell-word.ts` already said:
*"the full Sonic '4 solidity bits' = this 2-bit field on plane A's word + the 2-bit field on
plane B's word."*

So in Aurora's per-plane word the bits are genuinely unassigned, the dispatch's *conclusion*
holds, and its *reason* does not. The distinction is load-bearing: someone who finds these
bits empty in every act and concludes "15:14 are free everywhere" would be reintroducing
path-B solidity into a word that no longer means that. The currency test pins **both** halves —
that `(3 << PATH_B_SOL_SHIFT)` equals our unowned mask, and that nothing `packCollisionCell`
can emit ever sets those bits — so the finding cannot be lost.

**No meaning is encoded for 15:14 anywhere in this parcel.** The word *preserves* them.

---

## 3. ⚠ The complete writer sweep

Enumerated by **writer**, not by tool. This is the list the next reserved field gets checked
against, so the correct ones are here with their reasons, not omitted.

The writers fall into four kinds, and the kind decides the verdict:

- **DECIDERS** choose what sixteen bits a gesture writes. They mean something *narrower* than
  the cell, so they must merge. These are where the rule goes.
- **TRANSFERS** move a whole cell from a source. The source owns all sixteen bits; a merge
  here would be wrong.
- **APPLIERS** replay a word some decider already chose. Fixing them would put the rule in two
  places and let them disagree.
- **CREATORS** fill a destination that provably has nothing to preserve.

### DECIDERS — 5 sites, 3 were broken

| # | Site | Verdict |
|---|---|---|
| 1 | `MapViewport.tsx` `paintCollisionCell` entry build (~:2291) | **WAS BROKEN — FIXED.** `newColl: word` replaced the whole cell. Now `collisionPaintWord(word, oldColl)`. Its cheap already-painted short-circuit was updated with it, or it would fail to fire on a cell whose merge differs from the bare brush word. **Reached by BOTH the press (~:2653, `handleMouseDown`) and the drag (~:2901, `handleMouseMove`)** — one function, so one edit covers both. That is the claim harness rows `[p2]`/`[d2]` exist to prove rather than assert from a reading. |
| 2 | `collision-paint.ts` `paintCollisionRectEntries` (:59) | **WAS BROKEN — FIXED.** The agent's `paint-collision` tool. Identical defect on a second road. |
| 3 | `composer-collision.ts` `paintDocCollision` (:17) | **WAS BROKEN — FIXED. This is the site an enumeration by TOOL misses.** The Art facet's chunk collision brush is a *different writer of the same word* from the map's collision tool, and its docs are seeded from real sections by `seedDocCollisionFromSection`, so their cells carry whatever the section's did. Its press and drag also share one function (`ComposerCanvas.applyTileCell` via `hostPointer.down`/`.move`). |
| 4 | `CollisionPalette.tsx` `clearSection` (~:132) | **CORRECT, AND NOW DECIDED.** See §4. Extracted to `clearCollisionEntries` so the decision is testable and stated where it is made. |
| 5 | `CollisionPalette.tsx` `resetToEngine` (~:166) | **DISCARD UNAVOIDABLE — NO LONGER SILENT.** See §4. Extracted to `resetToEngineEntries`, which also returns the count of cells losing unowned bits. |

### TRANSFERS — correct as they stand

| # | Site | Why it is right |
|---|---|---|
| 6 | `map-stamp.ts` `buildRegionWriteCommand` (:115) | Chunk stamp **and** clipboard paste. `newColl: word` here is the *source cell's* word, read out of a plane array that already carries whatever it carried. A paste means "this cell, entire" — it owns all sixteen bits, and merging would make a copy differ from its original. |
| 7 | `composer-collision.ts` `applyClipboardCollisionToDoc` (:38) | Clipboard → composer doc. Whole-cell copy, same reasoning. |
| 8 | `composer-collision.ts` `seedDocCollisionFromSection` (:59, :62) | Section → composer doc capture. Whole-cell copy; it is what *makes* doc cells carry unowned bits, which is why #3 mattered. |

### APPLIERS — correct as they stand

| # | Site | Why it is right |
|---|---|---|
| 9 | `history.ts:212` redo — `arr[e.index] = e.newColl` | Replays a word a decider already merged. Merging again here would be the rule in two places, free to disagree. |
| 10 | `history.ts:375` undo — `arr[e.index] = e.oldColl` | `oldColl` is captured **whole** by every decider above, so undo restores all sixteen bits. Harness `[u1]` proves this end-to-end on the running app. |
| 11 | `MapViewport.tsx:2302` live apply — `ce[e.index] = e.newColl` | Same word the command carries; correct once #1 is. |

### CREATORS — correct as they stand

| # | Site | Why it is right |
|---|---|---|
| 12 | `collision-cell-resolve.ts` `resolvePlaneWords` (:110) | Packs the engine baseline into a **freshly allocated** array. The source is a baked byte with no unowned bits; zeros there are the honest representation of a baseline that never had the field. |
| 13 | `chunk-migrate.ts` `migrateLegacyChunkCollision` (:26) | Legacy chunk migration. Guarded by an explicit all-zero precondition (`if (chunk.collisionA.some(w => w !== 0) …) return false`), so there is provably nothing to preserve. |
| 14 | `chunk-mappings.ts` `blockRefToCollisionWord` (:95) | ROM import constructing a fresh word from block solidity flags. No destination. |

### I/O — correct as it stands

| # | Site | Why it is right |
|---|---|---|
| 15 | `s4-collattr.ts` `serializeCollAttr` / its reader, via `aeon/save.ts:97-102` and `aeon/load.ts:319-320` | Full 16-bit big-endian round trip, byte for byte. Unowned bits survive save and load, which is what makes preserving them meaningful at all. |

**Count: 15 writers. Three were broken. The dispatch's reading had found three sites total,
two of which turned out to be decisions rather than defects.**

---

## 4. The two decisions

### Clear — WIPES, and is the only writer allowed to

`clearSection` writes a bare `0`, unowned bits included. Decided, not inherited.

The argument is not "that is what it did before". It is that **Clear is the single gesture
whose stated intent is the whole cell** rather than a field of it. A stroke means "this shape,
this solidity". A stamp means "this source cell". A reset means "the engine's baseline". Only
Clear means "empty". Preservation is the rule for writers that mean something narrower than
the cell, and Clear does not.

What settles it is the consequence of deciding the other way: if Clear also preserved 15:14,
the editor would contain **no gesture that could ever remove a value from them**. A section
the author had explicitly emptied would still carry state that nothing on screen depicts and
nothing in the UI can reach — invisible, undeletable residue. That is strictly worse than
losing a field to a command that is named "Clear collision", scoped to one plane of one
section, invoked deliberately, and whose undo restores every cell **exactly**, because
`oldColl` captures the full sixteen bits (asserted by a test row).

### Reset to engine — DISCARDS unavoidably; silence was the actual defect

Aeon has confirmed and the source shows it: `bake_plane_cell` ends in
`attrset.intern(heights, angle, solidity)` — three things, none of which is bits 15:14. The
baked plane is a **per-cell byte**. There is nothing in baked data to revert *to*, and
`resolvePlaneWords` correctly produces words with zeros there.

So reverting always discards, and no care in this parcel changes that. What changed is that it
no longer happens quietly:

- `resetToEngineEntries` returns `discardedUnownedCells` alongside the entries;
- when it is non-zero the command **description** gains
  `— discards reserved bits on N cells`, which is the text the undo stack shows, so the
  discard is named at the moment it is recorded and is undoable from that same list;
- and a toast says it in prose, naming undo as the way back.

Placing it in the description rather than behind a confirmation dialog is deliberate: this is
an escape hatch for a section that has drifted, the loss is fully reversible, and a modal on a
recovery action trains people to dismiss modals.

---

## 5. ⚠ The vacuity trap, and how every row escapes it

**Every cell in every shipped act holds zeros in bits 15:14.** So on real content a correct
implementation and a completely broken one emit the *same artifact*: `0` preserved and `0`
truncated are the same sixteen bits. A test that paints over real cells and checks the result
is not a weak test — it is a **coin that always lands heads**, and it would stay green through
a total removal of the rule.

The nametable sweep could dodge this: it *found* real priority cells with `ntRect` and painted
over those. Here there is nothing to find, and the harness **measures that rather than
assuming it**:

```
NOTE  section 0, first 64 rows, as the app holds it
      16384 cells read · 748 with a shape · 0 carrying unowned bits
PASS  [f0] ZERO real cells carry unowned bits — so a row painting over real content would be VACUOUS
      cells=16384 carrying=0
```

The `748 with a shape` is the anti-vacuity guard on the guard: it is a region of **real
authored collision**, not an empty one, and it still carries nothing in 15:14. That zero is
the whole justification for the fixture-authoring hook. So:

- **Node** — `test/editing/collision-word.test.ts` states the rule in a header block, and every
  preservation row builds its destination through `withUnowned()`. `unownedProbe()` derives the
  probe from the mask (`UNOWNED & -UNOWNED`) and **asserts it is non-zero**, so a future layout
  change that emptied the unowned mask would blow the file up rather than silently making it
  vacuous. Every preservation row also asserts the *pre-state* — e.g.
  `expect(unownedCollisionBits(dest)).toBe(unownedAll())` — before asserting the post-state.
- **Harness** — every preservation row authors its destination through
  `__dbg.aeon.collisionPoke` (added to `debug-hooks.ts` for exactly this), and `seedCell`
  **re-reads and THROWS** if the authored bits are not there. Rows `[p0]`/`[d0]` then re-assert
  the seeded pre-state as visible rows.

### The converse control

A "preserve everything" bug — a writer that stopped painting at all — would sail through every
preservation row. So every phase pairs its preservation row with a **CONTROL** proving the
owned fields *did* change to the armed brush: node rows tagged `CONTROL`, harness rows
`[p1]`/`[d1]`.

This was not decoration. See §7.

---

## 6. Proof

### Red-first, node — commit `00e7933`, 4 failed / 17 passed

```
FAIL paintCollisionRectEntries > a 1x1 cell paint keeps the destination cell's unowned bits
       on all four sub-tiles
     AssertionError: expected +0 to be 49152
FAIL paintCollisionRectEntries > CONTROL: a cell already carrying the brush word AND the
       unowned bits emits nothing
     AssertionError: expected [ { index: +0, …(2) }, …(15) ] to deeply equal []
FAIL paintDocCollision > keeps the doc cell's authored unowned bits when the chunk brush
       paints over it
     AssertionError: expected +0 to be 49152
FAIL paintDocCollision > CONTROL: reports no change when the cell already holds the merged
       result
     AssertionError: expected true to be false
```

Restored: **21 passed** in that file.

Whole suite, **re-verified on the MERGED tree after rebasing onto `origin/master` 4f36936**
(which landed row 81's marquee-snap/paste-pan parcel mid-parcel): **5,383 passed / 0 failed /
7 skipped**, `tsc` clean. Branch-side before the rebase it was 5,377 / 0 / 7 against the older
baseline of 5,356 — this parcel adds 21 rows either way, and the two parcels compose without
interference.

### Red-first, running app — commit `cbf896e`, 10/12

```
FAIL [p2] a real PRESS preserves the cell's unowned bits
     want unowned 0xc000; got 0x0000 0x0000 0x0000 0x0000
FAIL [d2] a real DRAG preserves the far cell's unowned bits
     want unowned 0xc000; got 0x0000 0x0000 0x0000 0x0000
```

with `[p1]`/`[d1]` **green** — the stroke really did write the armed brush `0x3401` over the
seeded `0x1aa5` — so neither red is "nothing happened".

### Green, running app — three consecutive runs, 12/12 each, twice over

Three runs branch-side before the rebase, and **three more on the MERGED tree afterwards**,
all 12/12.

Each total read **whole from its own run**; no row from one run was ever paired with a row from
another. Post-fix the cell reads `0xf401` = armed owned `0x3401` | preserved unowned `0xc000`.

`dpr` was **1.35 on two of the three branch-side runs and 1 on all three merged-tree runs** —
it genuinely varies on this box, which is the trap. Every aim is computed from `view()` read back off the store through the app's own transform,
rounded to an integer, and then **verified by inverting that transform** — an off-by-one is a
thrown refusal, never a red feature row. Row `[aim]` prints dpr, the rect and `canvas.width`
and asserts `canvas.width === Math.floor(rect.width)`.

### Guards proved by planted violations (each restored, tree clean after)

| Violation | Effect |
|---|---|
| Neuter the merge (drop the `oldWord` term from `collisionPaintWord`) | **7 rows red** — all three preservation groups plus their merged-result CONTROLs |
| Make the owned mask disagree with the engine (drop yFlip) | **5 rows red, including the aeon currency row** — so that row genuinely measures the peer blob rather than passing on a regex that matched nothing |

### Derivation, never a literal

- Module: mask from `packCollisionCell` itself.
- Node test: `0x3FF | 0x400 | 0x800 | (0x3 << 12)` written out as a shown derivation, plus a
  sweep asserting no value `packCollisionCell` can emit escapes the mask, plus the peer-blob
  cross-check.
- Harness: §BITS **parses the four field expressions out of `packCollisionCell`'s body** and
  self-checks they are pairwise disjoint, throwing if the function's shape changed.

---

## 7. ⚠ The alternative green-path, and the one that was real

For every green row: *if this went green for a reason other than the rule holding, what would
that reason be?*

| Row | Alternative green-path | How it was ruled out |
|---|---|---|
| `[p2]` `[d2]` preservation | **The stroke never happened** — preserved-because-nothing-was-written | **THIS ONE WAS REAL.** On the harness's first run both rows passed *on the broken build*. Tool hotkeys are facet-scoped and `paint-collision` lives only on the collision facet (`facet-tools.ts:26`), so `'c'` pressed on Layout armed nothing and both rows went green on the **absence** of a write. The paired CONTROL rows `[p1]`/`[d1]` failed and exposed it. Fixed by switching facet first; `[arm]` is now **fatal**, since everything after it is meaningless without it. |
| all preservation rows | **The destination was already zero**, so preserved and truncated are indistinguishable | `[f0]` measures that real cells carry zero (the reason to author), `seedCell` throws if the fixture does not land, and `[p0]`/`[d0]` re-assert the non-zero pre-state as visible rows |
| node preservation rows | **`collisionPaintWord` is trivially identity** — it preserves everything by never painting | `CONTROL: still changes the fields it owns` unpacks the result and asserts shape/flips/solidity are the *brush's*; violation 1 confirms these rows fire |
| currency row | **The regex matched nothing** and compared `NaN` to `NaN`, or the peer was absent and it silently passed | `expect(m).not.toBeNull()` per constant; absence produces an explicit `console.warn` SKIP, not a pass; and violation 2 turns it red, proving it measures |
| `[u1]` undo | **Undo restored zeros that happened to match** | The seeded word `0xdaa5` carries unowned bits, and the row asserts exact equality with it, not just the unowned half |
| `[r1]` restore | **Nothing was ever poked**, so nothing needed restoring | The row prints `12/12 cells restored` against a list built by the pokes themselves |

### One non-discriminating claim, named

The claim *"press and drag share one function, so one fix covers both"* is a reading of
`MapViewport` and `ComposerCanvas`. For MapViewport it is **measured** — `[p2]` and `[d2]` are
separate gestures against separate cells. For **ComposerCanvas it is only read**: the Art
facet's chunk collision brush is covered by node rows and by source inspection
(`hostPointer.down` and `.move` both call `applyTileCell`), not by a driven gesture. See §8.

---

## 8. Open, and tagged

- **TAGGED for foreground follow-up — no runtime/emulator work was done or attempted.** Nothing
  in this parcel touched `mcp__oracle__*`. Whether preserved bits reach a built ROM
  unchanged is a question for the engine lane; today they are inert to `bake_plane_cell` by
  construction, so there is nothing for an emulator to show.
- **The Art facet's collision brush is not driven by the harness.** `paintDocCollision` is
  fixed and covered by node rows, but no CDP row performs a real press-and-drag in the chunk
  composer. That is the same class of gap the map rows exist to close, one surface over. A
  follow-up parcel should extend the harness rather than trust the reading.
- **The dispatch's premise about bits 15:14 should go back to the engine lane.** They believe
  those bits are unreferenced in their pipeline; `PATH_B_SOL_SHIFT = 14` at `b76576ea` says
  otherwise for `bake_cell`. Aurora is safe either way — it encodes no meaning — but if that
  belief is informing a design decision on their side, it is grounded on a grep that could not
  see a shifted constant.
- **No new UI surface for the unowned bits, deliberately.** Nothing depicts them, and nothing
  should until they mean something. The only place they are named to the author is Reset's
  discard notice, which exists because that gesture destroys them.
