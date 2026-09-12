# map-coverage-5: the link hover and the section-crossing stroke, and the Detach that hit the wrong section

Branch `parcel/map-coverage-5`, from master `98db8124`.
Code tip `ab9963be`. Commits, in order:

| commit | what |
|---|---|
| `6d22867e` | rows: a stroke crossing a section boundary lands one command per section |
| `e795c65a` | rows: the stamp tool's link hover names the placement under the pointer |
| `e7bcc32f` | test: DETACH-WRONG-SECTION, reproduced red on base |
| `ab9963be` | fix: Detach acts on the placement the panel names, in the hover's section |

This packet and the ledger row follow the code tip and change no code or test.

Continues lens row `MAPVIEWPORT-UNTESTED` (last row `2026-09-11T23:29:58Z`,
packet `docs/reviews/2026-09-11-map-coverage-4.md`). Its REACHABLE AND STILL
UNCOVERED list was the worklist: the stamp-chunk link hover and a stroke
crossing a section boundary. Both were re-measured on base before any row was
written. No test referenced `linkHover`, and every stroke row ran on a
one-section act, so neither was covered.

---

## The headline: one live defect, found one step past the hover, and fixed in one call

**DETACH-WRONG-SECTION.** The Chunk links panel
(`src/renderer/components/ChunkLinkOptions.tsx`) names the placement under
the cursor from the hover's own section (`hover.sectionIndex`). Its Detach
chip ran `runDetach(placementId)`, which resolved that id in the ACTIVE
section (`activeSectionIndex`). The hover never claims a section: nothing in
its branch of `handleMouseMove` writes the index. Placement ids are per
section and start at 1 (`allocatePlacementId` in
`src/core/editing/chunk-links.ts`). So after a stamp in section 1, the author
hovers section 0's placement #1 and reads "Under cursor: (section 0's chunk)
(#1)". The Detach press then unlinks **section 1's** placement #1.

- **Reproduced red on base** (`e7bcc32f`). The row is plain `it`, and its
  two outcome assertions are `expect.soft`, so the first failure does not hide
  the second. Both halves failed, class ASSERTION:
  - `Detach left the placement the panel named linked: expected { id: 1, chunkId: 'hover-s0', ... } to be null`
  - `Detach unlinked the ACTIVE section's placement with the same number instead: expected undefined to be 'hover-s1'`

  Every premise held before them: section 1 was active, the hover named
  section 0's placement, the panel's readout named section 0's chunk, and
  Detach was enabled.
- **The CONTROL** (hover in the active section, then Detach) is green before
  and after the fix.
- **The fix** (`ab9963be`, +14/-5, one file): the chip passes
  `hover.sectionIndex` and `runDetach(sectionIndex, placementId)` resolves the
  section from it. Nothing on screen changes, because the panel already named
  this placement; the press now acts on it. "Detach all in section" stays on
  the active section, which its own label names.
- **Proven against the fix:**

| plant | reds |
|---|---|
| MD1: the chip passes the active section again (the defect's own shape) | exactly DETACH-WRONG-SECTION |
| MD2: the right section is read, but the command names the active section | exactly DETACH-WRONG-SECTION |

The defect is undoable, like every detach, but silent: nothing on screen
says the other placement stopped following its chunk. A later edit to that
chunk would then fail to propagate there.

No other live defect.

---

## A harness finding, measured by the first run

Five of the six hover rows first failed as `ReferenceError: document is not
defined`, not as an assertion. With a chunk picked, the move goes past the
link hover to the stamp ghost, and the ghost rasterises the chunk
(`regionPreviewCanvas`, `src/renderer/components/MapViewport.tsx` line 796),
which needs a `document` this suite does not have. The stack trace named
that line, not the hover. The rows put the pick down after their two stamps
(`setSelectedChunkId(null)`). The link hover reads the tool, the tile and
`chunkOriginAt`, never the pick, so the write they measure is the same with
or without one. The ghost is a drawing claim and stays foreground-only, as
map-coverage-3 already said of it.

---

## What is now covered

10 rows, all in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`
(145 to 155). Each drives the component's real handlers over the real stores.

| block | rows | before this parcel |
|---|---|---|
| a stroke crossing a section boundary | 3 | one-section strokes only |
| the stamp tool's link hover, and the Detach it aims | 7 (incl. DETACH-WRONG-SECTION) | nothing |

**The crossing rows**:
- A tile stroke from section 0 into section 1 lands two commands. The first
  undo takes back the section-1 run only, the second takes back section 0,
  and no third entry is left.
- A both-planes collision stroke does the same, on both planes of each section.
- A collision stroke that jumps to the SAME cell of the next section paints it.
  The drag cache key's section index is the only thing separating the two cells.

**The hover rows**:
- Over section 1 the hover names section 1, its placement and its chunk.
- An unlinked tile writes `null`, and moving back onto the placement names it again.
- `onMouseLeave` keeps the value.
- CONTROL: another tool writes nothing.
- A sweep across one placement's four tiles is one store write.
- CONTROL: Detach in the active section unlinks the hovered placement.
- DETACH-WRONG-SECTION.

### Fixture decisions worth knowing

- **Both blocks use map-coverage-4's two-section act** (`makeAct1TwoSections`),
  with the camera parked so the boundary sits mid-viewport. Section 1 has its
  own FG fill (`FG_S1`), and the crossing block gives it its own collision
  shapes (5 and 6). A write into the wrong section is therefore a wrong VALUE,
  and one `offFill` comparison per plane sees it.
- **The placements are made by the real stamp click**, from chunks minted by
  the save-as-chunk button's own `selectionToChunk`, so their ids are
  `allocatePlacementId`'s. Section 0 and section 1 each hold a placement with
  the SAME id, of DIFFERENT chunks, at the same local spot. An ANTI-VACUOUS
  assertion checks the ids are equal, so a read or a detach in the wrong
  section is a wrong chunk, not a missing one. That coincidence is what made
  the defect visible.
- **The hovered tile is off the diagonal, and is the placement's last tile**,
  so a swapped row and column, or a dropped offset inside the chunk, lands on
  an unlinked tile.
- **The Detach rows render the real panel** (`renderHooked` over
  `ChunkLinkOptions`) and run its Detach chip's own `onClick`, found by type
  (`Chip`) and label. Nothing is laid out or clicked on screen.
- **The same-cell row zooms to 0.25**, so both cells are whole client pixels
  inside one 640px viewport. An ANTI-VACUOUS assertion checks that, rather than
  aiming a move outside the declared rect.
- **The one-write row counts identity changes of `linkHover`** through a store
  subscription, so it measures the de-duplication MapViewport's comment relies
  on ("one store write per placement crossed"), in `editorStore.ts`.

---

## Every one of the 10 rows is red-first proven

Each plant was applied by exact-anchor replacement, refused unless the anchor
occurred exactly once and the planted file equalled HEAD. It was read back
from disk and printed as a line diff before its run, run against the whole
file, and restored byte-identical from HEAD with `git diff` checked quiet. The
runner is a scratch script outside the repo and is not committed. 15 runs: 11
on `MapViewport.tsx` (SB1 to SB5, LH1 to LH6), 1 on
`src/renderer/state/editorStore.ts` (LH7), 1 on `ChunkLinkOptions.tsx` before
the fix (LH8), and the 2 fix plants on it after (MD1, MD2). Every one applied,
none was refused, and every one went red with an AssertionError.

| # | plant | reds |
|---|---|---|
| SB1 | `recordPaint`'s run ignores the section (never flushes on a crossing) | tile crossing, collision crossing |
| SB2 | the `set-tiles` command always names section 0 | tile crossing |
| SB3 | the `set-collision-edit` command always names section 0 | collision crossing |
| SB4 | the flush DROPS the finished run instead of committing it | tile crossing, collision crossing |
| SB5 | the collision drag cache key drops the section index | same-cell |
| LH1 | the link hover's tool gate removed | CONTROL other tool |
| LH2 | the hover reads section 0's links wherever the pointer is | section-1 hover |
| LH3 | the hover names section 0 whatever section it read | section-1 hover; the Detach CONTROL at its premise |
| LH4 | an unlinked tile writes nothing instead of `null` | null row |
| LH5 | the hovered tile index with row and column swapped | 5 of the 6 hover rows then written, all but CONTROL other tool (4 at their premise; DETACH-WRONG-SECTION came later) |
| LH6 | `onMouseLeave` clears the link hover | leave row |
| LH7 | `setLinkHover`'s same-placement de-duplication removed (`editorStore.ts`) | one-write row (4 writes) |
| LH8 | Detach builds its command and never executes it (`ChunkLinkOptions.tsx`) | Detach CONTROL |
| MD1, MD2 | the fix (table above) | DETACH-WRONG-SECTION |

**SB1 reddens only the two crossing rows.** Before this parcel, no row in the
file could see a stroke that never flushes on a crossing: every other stroke
row stays inside one section.

### Rows that could not fail until changed, or failed for the wrong reason

- Five hover rows first failed for the HARNESS's reason (the ghost's
  `document`), not the component's. They were changed to put the pick down
  before they were trusted (see the harness finding).
- DETACH-WRONG-SECTION was first written with two plain `expect`s. The first
  failure hid the second half, so they became `expect.soft` before the red
  commit. That run measured both halves.
- No row needed a change to become able to fail: every one of the 10 is
  reddened by at least one plant aimed at it.

---

## Suite

| | Test Files | Tests |
|---|---|---|
| base (`98db8124`) | 609 passed \| 3 skipped (612) | 9206 passed \| 9 skipped (9215) |
| code tip (`ab9963be`) | 609 passed \| 3 skipped (612) | 9216 passed \| 9 skipped (9225) |

Both are `npm test`, the whole chain with its gates, and both exit 0. The
repo's failure-class reporter says "no failures in this run" on both.
`9225 - 9215 = 10`, the rows added. The file count does not move because
every row went into an existing file. `npx tsc --noEmit` exits 0 at the code
tip. Base was measured in this worktree, detached at `98db8124` and switched
back: a second worktree outside this one is refused by the agent's isolation.

---

## What the tree said that the brief did not

- **"The Detach target"** in the worklist was read as a label for the hover.
  In the tree, the Detach is a separate resolution in another file, and it
  did not use the hover's section. That is the defect above. The brief named
  MapViewport's `setLinkHover`, and the hover itself is correct.
- **The stamp ghost cannot run here with a chunk picked** (the harness
  finding). The brief did not say so; the earlier chunk-stamp block's comment
  did ("the stamp ghost (which needs a `document`) is never drawn").
- **`recordPaint`'s flush has a plane arm as well as a section arm**: "A change
  of section or plane flushes the stroke." `collisionPaintPlane` is read per
  cell in `paintCollisionCell`, not latched at the press, so switching the
  plane mid-drag starts a second command. The brief named only the section
  boundary. The plane arm is stated in the code, so it is not a behaviour
  question, and it has no row yet (see Still open).

---

## Observations for the overseer, not acted on

- **A stamp does not refresh the link hover.** The hover is written only on a
  move. A click that creates a placement under a still pointer leaves the
  panel saying "no chunk link" until the pointer moves. Whether the press
  should write the hover is a behaviour call.
- **The collision plane is read live per cell**, while Alt, both planes and
  the crossover brush are latched at the press. This is the same shape as
  map-coverage-4's brush-size observation, but here the code's own docblock
  names the consequence (a flush into a second command). So it is stated, not
  unruled. It is listed only so the two live reads are seen together.

---

## Still open, and what is foreground-only

**Foreground-only, tagged, not attempted.** No emulator was touched.

- The stamp ghost during a link hover with a chunk picked (it rasterises
  through `document`), and whether the Chunk links panel's readout and Detach
  chip are visible and legible on screen. The panel rows read its element
  tree, never a pixel.
- Everything map-coverage-4 listed, unchanged: the guide drag, the screen
  frame's LOCKED-scene arm and `resolveEscape`'s lens arm, all behind the
  Effects-facet gate; the paste ghost, the collision hover preview with its
  crossover rects, the band preview, and the hover bar's legibility; the
  warp's landing in the running game.

**Reachable and still uncovered in the node suite:**

- The PLANE arm of `recordPaint`'s flush: a plane change mid-drag lands two
  commands. It is stated in the code, so a row can be written without a ruling.

**Behaviour questions before rows:** the stamp press not refreshing the link
hover (above), plus map-coverage-4's three: the collision brush size read live,
paint-block's one-block drag, and the readout freezing during drags.

**Cannot be a row today, and why:** unchanged from map-coverage-4. A
placement off the grid and F7's fresh act read are each guarded twice.
