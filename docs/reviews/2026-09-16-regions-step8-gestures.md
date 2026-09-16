# Regions step 8A: the world-space gesture layer and the map overlay

Editor spec (empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`
at `origin/main`) §3.2, §3.4, build-plan row 8, first half. **Say which spec**: the ENGINE
half, `2026-09-14-regions-part-2-design.md`, numbers its steps independently and collides
with this one.

Branch `parcel/regions-step8-gestures` in `/home/volence/sonic_hacks/aurora-wt-regions8a`,
cut from master `5a6435b3`.

| SHA | what |
|---|---|
| `e39e2ac2` | `src/core/editing/region-marquee.ts` + its 36 rows |
| `e8ce24b9` | the identical-bindings row turned into a census, after it stayed green under its own mutation |
| `080ecdfc` | `src/renderer/canvas/region-overlay.ts`, its colours, + 27 rows |
| `3b673970` | the palette measured and replaced; two gate catches repaired |

Nothing is wired. `MapViewport`, a `region` ToolId, `FACET_TOOLS`, any CDP work, the screen
frame and the colour sidecar are out of scope and untouched.

## How verified

`npm test` in the worktree, foreground, the whole chain (14 `check:*` scripts, then
`tsc --noEmit`, then vitest). Aggregate totals from the runner, not a tail excerpt:

| run | Test Files | Tests | exit |
|---|---|---|---|
| baseline at `5a6435b3` | 638 passed, 3 skipped (641) | 9970 passed, 9 skipped (9979) | 0 |
| final, this branch | 640 passed, 3 skipped (643) | 10034 passed, 9 skipped (10043) | 0 |

`+2` files and `+64` tests: 36 in `src/core/editing/__tests__/region-marquee.test.ts` and
28 in `src/renderer/canvas/__tests__/region-overlay.test.ts`.

### Red-first, every mutation applied on disk from a COMMITTED baseline

Each row: the mutation was written into the file, `git diff -U0` and `git diff --stat`
printed to show it applied, the test file run, then the file restored with
`git checkout --` from the commit. Isolation is the point: most rows redden one test.

| # | mutation, as applied | reds |
|---|---|---|
| M1 | `snapWorld`: `Math.round` to `Math.floor` | 1: snaps to the nearest multiple |
| M2 | `const tol = REGION_GRAB_PX / (zoom > 0 ? zoom : 1)` to `= REGION_GRAB_PX` | 1: the grab band is screen px |
| M3 | the move loop's `if (pieces[i].id !== selectedId) continue;` deleted (§3.2's literal reading) | 2: draw over another region; draw reachable on a covered act |
| M4 | move/resize pass `pieces` instead of `rest`, so a rect carves itself | 2: a move does not carve itself; a resize gives area back to unassigned |
| M5 | `atLeastOneCell` returns `r.w`/`r.h` unchanged | 2: no empty rect from a dead click; resize never collapses |
| M6 | bindings taken from `doc.regions[i]` instead of the id's first entry | 1: several entries, identical bindings |
| M7 | `const before = idsWithArea(pieces)` to `new Set<string>()` | 3: removed on a covering draw; last rect deletes the region; the entry is dropped |
| M8 | `coalesceByRegion(next)` to `next` | 1: coalesces without changing area |
| M9 | the unknown-id guard to `if (false)` | 2: refuses a draw with no preset; accepts it with a template |
| N1 | `regionOutlineSegments`: the interior cuts emptied | 1: no seam on a shared edge |
| N2 | `regionHatchSlope` always returns 1 | 2: angle turns over on the wrap; 2N distinct pairs |
| N3 | `regionHue` clamps instead of wrapping | 2: same two |
| N4 | `if (holes.length > 0)` to `if (false)` | 1: unassigned painted when there is a hole |
| N5 | the hole label drawn once per hole | 1: named once however many |
| N6 | `const lw = selected ? SELECTED : PX` to `= PX` | 1: the selected outline is heavier |
| N7 | the background line deleted from the label | 1: names the background on a second line |
| N8 | `ctx.clip()` before the hatch deleted | 1: hatches the rects and nothing outside |
| N9 | `const visible = intersects(...)` to `= true` | 1: an off-canvas region draws nothing |
| N10 | `setTransform(dpr,...)` to `setTransform(1,...)` | 1: draws in the canvas's dpr frame |
| N11 | the paint counter does not advance | 1: paints advances on every draw |
| N12a | bluishgreen `#009E73` added back to `REGION_HUES` | 1: deuteranope separation |
| N12b | yellow `#F0E442` added back to `REGION_HUES` | 1: deuteranope separation |
| N13 | `REGION_HATCH_ALPHA` 0.45 to 1 | 1: the hatch is washed below full alpha |

**Two of these did not go red the first time, and both were my defects, not the runner's.**

* **M6 stayed green (36/36)** while eight other mutations on the same file reddened on the
  same runner, so the runner was executing the patch and the row was not asserting what it
  said. It checked the invariant over `east`, the region that split; the mutation gave
  east's two pieces the same fallback and made **west's** disagree. Fixed at `e8ce24b9` to a
  census over every id, with an anti-vacuous floor, and re-run red.
* **A vermillion mutation stayed green**, which is what sent me to measure the palette. See
  below: the mutation was right to stay green, and the palette was wrong.

**A contamination I caused and am recording rather than smoothing over.** The first palette
mutation run called `git checkout --` on a tree that was **dirty** for `canvas-colors.ts`
(my palette rewrite was not yet committed), so it silently restored the OLD palette and both
results measured a file I had already replaced. That is exactly the failure mode invariant
8(b) names. Everything in the table above was re-run from a committed baseline with
`git status --porcelain` verified empty before the run and after it.

## What I decided, and the readings I rejected

### 1. §3.2's gesture table contradicts the Q1 ruling. Resolved, not picked.

The table says *"drag inside a rect | move that rect"* with no qualifier, and *"plain drag
on empty space | new rect"*. Read literally, a draw can only start on unassigned ground.

`flattenRegionsDocument` (`src/core/formats/regions/flatten.ts`) **throws on any act with a
hole**, so a document the build accepts has no unassigned ground at all. Under the literal
reading the gesture the owner's Q1 ruling of 2026-09-14T14:54:34Z promoted to the primary
one would have nowhere to start on exactly the documents that ship.

So the qualifier §3.2 omits is supplied: **move and resize act on the SELECTED region;
everything else is a draw, and a draw carves.** `editorStore.selectedRegionId` is the
disambiguator, which is the state `regions-facet.tsx` already says step 8 reads. The cost is
one bound: a rect cannot be drawn *starting inside* your own selection. **The reading I
rejected** was a modifier key for draw, which is the shape the ruling deleted. A row asserts
draw is reachable over a fully covered act (M3 reddens it).

### 2. Snap is to the nearest multiple, and a move snaps its DELTA.

§3.2 says base 16 px, Ctrl inverts to 8 px, reusing `effectiveGranularity`'s semantics and
not its cell arithmetic. `snapMarquee`'s `block` arm rounds **out**; **that reading was
rejected** because it rounds out for a reason that does not hold here: a CELL is indivisible
and a selection must cover every cell touched, whereas a region edge is a coordinate in
continuous world pixels and "round out" has no meaning for the single edge a resize moves.
A move snaps its delta so an off-grid rect (a migrated one, or one typed into the panel)
keeps its offset instead of jumping to the grid the first time it is nudged.

### 3. The grab band is SCREEN px, and the constant is duplicated on purpose.

A fingertip is a property of the device. In world px the same band is 24 screen px of dead
zone at zoom 4 and 1.5 unhittable ones at zoom 0.25, so `regionPressAt` takes the zoom and
uses `REGION_GRAB_PX / zoom`. `REGION_GRAB_PX` is **not imported** from `screen-frame.ts`:
`src/core` must not import `src/renderer`, and the two bands are independently owned. That
is the same call `screen-frame.ts` made against the guides' `GUIDE_GRAB_PX`, and it means
the two can drift without either being wrong. Nothing locks them together.

### 4. Nothing ever produces an empty rectangle.

`applyDraw` treats an empty draw as a no-op and hands the set back unchanged, which on
screen is a gesture that silently did nothing. Every rect the gesture layer makes is at
least one snap cell, so that path is unreachable from here.

## The visual calls, and the one that was measured and overturned

**Hatch 8 screen px, 1 px outline, 2 px when selected, hue washed at alpha 0.45, label on a
dark plate at the union's top-left with the background name as its second line.** Screen px
and not world px for the hatch, for the grab band's reason: a texture whose density tracks
the zoom is a solid wash at 8x and an empty outline at 1/8. 8 px is the tile grid's pitch at
zoom 1 so the two lattices agree instead of beating. The second label line is not mine to
decide: the owner's 2026-09-16 ruling, quoted in `src/renderer/providers/regions-aeon.ts`'s
header, says the background is named on every region label always, and the words come from
that file's `regionBgLabel` rather than being derived a second time here.

**UNASSIGNED is red and also the only CROSS hatch on the overlay.** Hue alone would rest the
one categorical answer on the one channel a colourblind reader may not have. And it is named
in words, on the largest hole only: `band-lens.ts` records that its own wash was never
unclear as a colour and that *"THE REAL DEFECT WAS THAT NOTHING NAMED THE WASH"*.

### The palette: my eye was wrong, and the gate that would have caught it was too loose

The overlay first shipped with five Okabe-Ito hues chosen by dropping **vermillion** ("the
nearest member to the refusal red") and **orange** ("it reads as `SCREEN_FRAME_LINE`"). Both
sentences reason from hue NAMES. Under a deuteranopia simulation (Viénot 1999), searched
over every subset of the seven chromatic members against the two colours this overlay shares
a screen with:

```
bluishgreen vs the refusal red   50.8      vermillion vs the refusal red   97.1
yellow      vs the screen frame  52.4      orange     vs the screen frame  63.4
```

**The two members that actually collapse are a green and a yellow, and both were in the set
I shipped.** Vermillion, dropped for being near the red, is twice as far from it as the
green I kept. The palette is now the subset with the largest worst-case separation — orange,
sky blue, blue, vermillion, reddish purple — which keeps both hues the eye had thrown out.

The tightest remaining pair is **orange against the screen frame**, and it is accepted and
named rather than left to be found: the frame is a 1 px unfilled outline with a caption plate
and a region is a hatched wash, and every alternative subset is worse for the colourblind
reader, which is the constraint that cannot be worked around by looking harder.

**The gate was vacuous at its first bar.** Its population was the palette alone and its bar
was 40, so the mutation that put vermillion back left it green. It now also carries the two
cohabitants (the refusal red and `SCREEN_FRAME_LINE`) — a palette checked only against
itself is checked against half the screen — and its bar is 55, set where the two
measured-out members sit. It carries its own control (the simulation must not be the
identity), and **that control caught itself**: the first confusable pair I wrote was one the
simulation kept 73 apart, which would have let a broken simulation pass; the pair now used
was found by searching (129.5 in sRGB, 4.2 simulated).

Redundant encoding beyond hue: the **hatch angle** turns over each time the palette wraps,
so the first ten regions of an act are ten distinct (hue, angle) pairs.

## Contradicting the brief, and two gate catches

* **The brief says "if you find yourself writing rectangle subtraction, stop — it is
  there".** There are already **two** copies in the tree: `region-geometry.ts`'s
  `subtractRect` and a second `subtractRect`/`rectsIntersect`/`uncoveredRects` inside
  `src/core/formats/regions/flatten.ts`. I added neither; the overlay's `subtractSpans` is a
  one-dimensional interval subtraction, which no module had. The duplication in `flatten.ts`
  is not mine to resolve and is noted, not touched.
* **`region` is an overloaded word in this tree.** `src/core/editing/region-flip.ts` and
  `src/renderer/canvas/region-preview.ts` both use it for *a rectangle of map the marquee
  has grabbed*, which is a different object from an identity region. I kept the brief's
  suggested names for consistency with `region-geometry.ts`, the module I actually build on,
  and put the collision in both new files' headers so a grep is not misread.
* **`validate.ts`'s rule-1 summary claims a refusal that does not exist.** Line 8 lists
  "duplicate id" among what `parseRegionsDocument` refuses. **Measured: nothing in this tree
  or in aeon refuses a duplicate id.** The vendored schema has no uniqueness keyword,
  `parseRegionsDocument` has no such check, and aeon's `tools/region_flatten.py` uses the id
  only to name a complaint. That silence is what makes a multi-rect region expressible, so
  the comment is wrong in the direction that would have stopped this parcel.
* Two gates in the chain caught me and both were right: `engine-claim-register.test.ts`
  refused `UNASSIGNED_LABEL` ending "and the build refuses it" (a module-level constant is
  standing copy; nothing in that module has read a generator), and `check-cited-paths`
  caught a filename I had line-wrapped across two comment lines.

## TAGGED for the controller's foreground follow-up

No emulator was called and none may be from a background agent.

1. **`setRegionBinding` would break a multi-piece region's bindings, and it must be the
   first thing 8B fixes.** A region with several rectangles is several `regions[]` entries
   sharing an id — forced, not chosen: the contract carries one `rect` per entry, an L-shape
   is two engine rows (§2.1), and a carve splits one rect into up to four.
   `applyRegionGestureToDocument` keeps every entry of one id byte-identical except its rect,
   and a row asserts it. But `setRegionBinding` (`src/renderer/providers/regions-aeon.ts`)
   uses `findIndex` and edits only the FIRST entry with that id, so one binding edit to a
   carved region would leave its pieces disagreeing. **Latent today** — nothing calls the
   gesture layer — and deliberately not fixed here, because it is step 6's landed, tested
   behaviour and its tests are not mine.
2. **`regionListRows` renders one row per ENTRY**, so an L-shaped region will list twice in
   the panel. Same cause, same parcel.
3. **Does aeon's emission mind two rows with the same `id`?** `region_flatten.py` does not,
   but the editor spec says the id "becomes a component of emitted symbol names", and the
   emitter is aeon's step 2. If it mints one symbol per row, two rows sharing an id collide.
   Not answerable from this repo.
4. **Nothing has looked at this overlay over real level art.** Legibility, the hatch's
   density at the zoom an author actually paints at, and whether the orange/screen-frame pair
   reads as two things are the owner's eye and 8B's CDP harness, in the foreground.
5. **No lane-log entry was written.** The landing procedure is the controller's and a
   same-second ledger entry refuses a landing.

---

## Overseer's landing note, 2026-09-16 — merged at master `1e2b1bd2`

**Re-verified on the MERGED tree**, not taken from the packet: `npm test`, foreground,
exit 0, **640 files passed / 3 skipped (643); 10,035 tests passed / 8 skipped (10,043)**.

**One difference from the agent's own final run, named rather than papered over:** it
reported 10,034 passed / 9 skipped, I measured 10,035 / 8. Same population (10,043) and
same exit; one environment-conditional row ran for me that was skipped for the agent.
This repo's `skip-report` gate makes that legible by construction — every skip names its
reason — so the difference is accounted for by design rather than by my reading of it.
It is NOT evidence about this parcel either way.

**The premise under the design fork was checked firsthand before the merge, because the
whole gesture model rests on it.** The agent resolved §3.2's *"drag inside a rect | move
that rect"* against the Q1 carve ruling on the ground that a literal reading makes DRAW
unreachable. That is true: `src/core/formats/regions/flatten.ts` throws a
`RegionFlattenError` whenever `uncoveredRects` is non-empty — *"a hole is a place with no
identity"* — so a document that can ship covers the act completely and has no empty ground
for a plain drag to start on. Read at the merge commit, not from the packet's quotation of
it. The resolution stands.

**What I am NOT claiming.** Nothing here has been on a screen. The overlay's legibility
over real level art, the orange/screen-frame pair, and the hue set's behaviour over a
jungle palette are all untested by anything in this suite, and the palette work — good as
its measurement is — is a simulation of a deuteranope's eye, not a person's. That is step
8B's business and partly the owner's.

**Both self-reported defects were the right call to report and neither changes the
verdict.** The dirty-tree `git checkout --` contamination is invariant 8(b)'s exact named
failure mode; it was caught by the agent, re-run from a committed baseline, and disclosed
in the packet and the commit body. The M6 green-under-mutation was a vacuous row found by
its own proof rather than by a reviewer, which is the instrument working.

### The spec was AMENDED to match, so this section is no longer a departure from it

**empyrean `0449cd8`** (verified here an ancestor of empyrean `origin/main`, and the rows
read at that revision rather than from the hub's message): §3.2's table now reads *drag
inside a rect **of the SELECTED region** → move that rect*, and *drag inside any OTHER
region's rect → **draw and carve**, exactly as on empty space*. That is this parcel's
resolution adopted unchanged, not a third reading.

**So a later reader should not re-litigate this.** What is recorded above as "the reading I
rejected" is now also what the spec rejects. The hub verified the premise independently
before amending — §9's check requires the authored rows to be pairwise disjoint AND to
cover the act, which is the same refusal `flatten.ts` enforces from the other side.

**And the reason it was booked as a SECOND defect rather than folded under §3.2's existing
banner is the part worth carrying out of this parcel.** The Q1 supersession was scoped to
*carve as an opt-in modifier* and correctly retired the Alt gesture. It left a different
sentence in the same section — move-versus-draw precedence — without a coherent referent,
changed by implication and named nowhere. **A supersession banner retires the prose it
describes, not every sentence the ruling invalidates**, and that residue is invisible
precisely because the section already looks annotated.
