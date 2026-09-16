# Regions step 8B on screen: one gesture, one undo step, proven with a real mouse

Editor spec (empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`
at `origin/main`) §7 row 8's second named gate: *"a CDP drag harness asserting one
`set-regions` command per gesture"*. **Say which spec**: the ENGINE half,
`2026-09-14-regions-part-2-design.md`, numbers its steps independently and collides.

Foreground work, by the overseer. Agents cannot run a harness here.

Instrument: `scratchpad/region-gesture-harness.mjs`, `npm run harness:region-gesture`.

## Why it was needed, stated against the test that already passed

Step 8B merged with `map-region-wiring.test.ts` green, and that file is a **source scan**:
it asserts `MapViewport` *names* the gesture entry points and passes the real zoom. It says
so itself. A listener that never attached, a branch nothing reaches, a repaint that never
fires and a canvas that throws all read as PASS under it. So the whole of step 8B's
behaviour was unmeasured — **in the way that looks measured**, which is the worse of the
two, and is why the merge commit said so rather than claiming the parcel worked.

## Result

**16 rows, 16 passed, 0 failed, 0 unmeasurable.** Environment printed in-run beside the
verdicts: `devicePixelRatio=1`, canvas rect `{left:284, top:74, width:836, height:774}`.
No claim in this packet is stitched from two runs.

The load-bearing row is **6e**: at **zoom 0.5**, a real mouse drag carves — `night` becomes
two entries, three in total — and **ONE Ctrl+Z restores the document byte-identically** to
the seed. That is §3.3's property, on the running app.

## The proof that the proof works

A green harness proves nothing until it has been made to go red. Committed baseline
`8fad04db` (tree verified clean before and after each run).

| # | mutation, as applied on disk | result |
|---|---|---|
| P1 | `executeCommand(outcome.command, level)` duplicated verbatim | **GREEN — and the mutation was in the bundle** |
| P2 | the same net change split into TWO sequential commands (`newDocument` truncated for the first, that value used as `oldDocument` for the second) | **RED on 6e, and ONLY 6e** — 15 other rows unchanged |

**P1's green was investigated rather than explained away**, because invariant 8(c) says an
applied-and-still-green mutation is a runner defect until proven otherwise. It was not:
the mutated bundle hashed `e34351fe`, the restored bundle `614eebe2`, so the build *had*
carried it. **The poison was inert.** Executing the identical command twice is a no-op the
history collapses — the second entry's before and after are the same document — so the
gesture still cost one effective undo step and the row was right to stay green. The defect
shape is two *different* commands, which is what P2 plants and what a naive
one-command-per-rewritten-entry implementation would produce.

**P2 reddening exactly one row is the strongest form of this evidence.** A mutation that
reddens many rows isolates nothing; this one says 6e measures the undo-step property and
not something adjacent to it.

## Two instrument defects, both mine, both found by the rows themselves

1. **The refusal arm ran after the carve and went UNMEASURABLE** — clicking the act row
   does not clear `selectedRegionId`, so the arm was never entered. Moved **before** the
   selection. That is not a workaround: un-selected is the state an author is in the first
   time they arm the tool, so it is the honest place to test it.

2. **Row 5b FAILED while the app was doing exactly the right thing.** The toast store's
   field is `message`; the matcher read `.text`, so every toast mapped to `''` and the row
   compared against nothing. It cost one run to see **only because the detail line dumps
   the raw toasts** — keep that. A matcher that silently yields `''` reports on something
   other than the property, the same family as one loose enough to catch a neighbouring
   error. It now matches the **whole** advice sentence, not a prefix: a prefix match would
   survive the sentence being truncated on screen, which is the failure an author meets.

**And a third, caught by looking at a screenshot rather than by a row.** The header called
the gesture a DRAW. It is a **MOVE**: the press lands inside the selected region's
rectangle, and §3.2's amended table says that is a move. It still carves, and it rewrites
*more* entries than a draw would, so the subject was if anything harder than advertised —
but a file that proves something about a gesture it never performed is a citation waiting
to be made wrongly. Row **6b** now pins the identity by asserting the selected region's own
rectangle travelled.

## What was added to the app, and why

`__dbg.aeon.regionsDocument()` — the act's regions document verbatim, deep-cloned.
`regions()` reports ids and a count, and **this property is about rectangles**: a carve can
rewrite entries without changing the id list, and a half-applied undo restores the right
ids with the wrong geometry — the exact state a second command leaves behind. A row
comparing id lists would call that a PASS. The deep clone matters too: a live reference
makes two reads the same object, so a "did it change?" row could never say no.

## What NO row here asserts, deliberately

**No world coordinate.** Converting an aim to world pixels in the harness would
re-implement `screenToWorld`, and an expectation copied out of the code under test agrees
with it by construction — including when both are wrong. Every assertion is about the
document (did it change; was it restored exactly), which needs no coordinate arithmetic on
this side. That is also why the dpr hazard reduces here to *aim at an integer client pixel
and print what you aimed at*, rather than needing a derivation chain.

## The owner's eye — what I can report, and what stays his

**Captures are COMMITTED at `docs/captures/2026-09-16-regions-on-screen/`** — five of them:
the two zoom captures, the carve, the refusal, and the boundary pair. The harness writes
its shots to a git-ignored scratch directory, so they are copied here as part of the
landing; a packet that cited them where they were written would be naming pictures no
other session or reader could open.

*(`check-doc-citations` caught this paragraph's first draft, which cited that ignored
directory by name while explaining why the files had been moved out of it. The gate offers
an EXEMPT row for provenance statements and it was not taken: the sentence loses nothing by
not spelling the path, and removing a dangling reference is better than excusing one.)*

**Verified by eye, and it is a claim no unit test in this repo can reach:** the hatch pitch
is **identical at zoom 1 and zoom 2** while the level art doubles. 8A's screen-pixel
decision holds — a world-pixel hatch would have been a solid wash at one end and an empty
outline at the other.

**Also verified by eye:** UNASSIGNED ground is instantly distinguishable from an owned
region — red *cross* hatch against the region's single diagonal — and it is named in words
on the canvas. The redundant encoding (hue *and* angle *and* the cross) does the work it
was designed to do; it is legible without relying on colour at all. The selected region
carries a visibly heavier outline. The refusal toast reaches the screen carrying the
layer's own reason *and* what to do instead.

**`region-hue-pair-at-the-boundary.png` was added for exactly the question the other
captures could not answer**, and getting it took two tries worth recording. `setView(x, …)`
sets the viewport's TOP-LEFT corner, not its centre, so the first attempt framed the seam
at the screen's left edge and produced another one-region picture — **and row 4d passed it
green, because it asserted only the ZOOM.** A guard aimed at the wrong observable; no
planted violation would ever have revealed it, since the row was not watching the quantity
it named. It now asserts the seam lies strictly inside the visible world span.

**AND THE CAPTURE PAID FOR ITSELF, with a finding no unit test could produce and no row
here asserts.** `REGION_HUES` has **five** entries, and `regionHatchSlope` flips only on a
palette **wrap** — `Math.floor(index / 5) % 2`. So **the first five regions of an act all
share one hatch angle and are separated by HUE ALONE.** The angle is redundancy against a
hue *repeat* five regions away; it gives nothing to two *adjacent* regions, which is the
common case. 8A's summary — *"the first ten regions of an act are ten distinct (hue, angle)
pairs"* — is **true and easy to read as more than it says**: distinct as pairs does not mean
two channels separate any given neighbour. For a colourblind reader looking at regions 1
and 2, hue is the only fill channel, which is precisely the case the palette measurement
was designed for and precisely why that measurement mattered.

What actually carries the distinction on screen for neighbours is **the word label** at each
region's top-left — "Forest" and "Night" are both legible in the capture. That is a
strength of the design, not a gap; it is worth naming because the hatch was doing less of
the work than the prose suggests.

**STILL HIS:** the warm/cool pair reads as *different* at the seam but **subtle over dark
level art at low zoom** — that is contrast against the art and the 0.45 alpha wash, not hue
confusability, and it is a taste call I am not making. The
orange-against-screen-frame pair 8A measured as the palette's tightest is still not shown
by any capture here, and was accepted on a *simulation* of a deuteranope's eye rather than
a person's. Nothing here changes that.

**One behaviour worth his attention, working as designed:** the move pushed `forest`
partly outside the act and left unassigned ground, and the panel said so in full — *"1
region lies outside the act… the build refuses these rows"* and *"UNASSIGNED: 2 areas
belong to no region… the build refuses an area with no identity"*. The editor lets the
gesture happen and tells you what the build will do with it, rather than silently clamping.

## TAGGED, still open

1. Whether the hatch's warm/cool pair is strong enough over dark art, and the
   orange/screen-frame pair — both his eye, neither answerable by a row.
2. §3.4's per-rect list is not built; the detail pane's four fields edit rectangle 1 of a
   carved region (and now say so).
3. `regionStatusRows`' disjointness else-arm counts *pieces* and says "regions" — wrong the
   moment a region is several entries.
4. Ctrl-inverted snap and an edge **resize** are wired but not covered by a row here.
