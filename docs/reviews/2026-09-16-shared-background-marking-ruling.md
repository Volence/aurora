# Marking regions that share a background: the name goes on the label, not into the fill

**2026-09-16. A ruling, not an implementation. Section 8 harvest item 5.** Ruled by a fable
agent in the owner's place under his overnight words of 2026-09-16T05:2xZ (*"if anything
needs decisions just ask a fable agent"*, banked at empyrean `origin/main` `docs/OVERSEER.md`).
**Overturnable by one word from him.** No product code changes here; the branch carries this
file and nothing else.

## 1. The ruling

**Every region's label on the map carries the name of the background it resolves to, as a
second line under the region's name, always.** Region fill and outline keep the author's own
hue and never change meaning; there is no "colour by" mode. The Regions panel's `bg` row names
the other regions that share the value, and a one-line caption says how many backgrounds the
act has in play. Selecting a region additionally outlines every other region on the same
background, so a glance after a click confirms what the labels already said.

## 2. The question, and what "at a glance" has to survive

His words, 2026-09-14T14:50:35Z: *"if regions share a background, is there anything we should
do to mark that as such? Like this way if I see forest with the night between it I can just at a
glance know they all have the same bg or something without worrying?"*

Two readings of *"they all"*: night shares the forest background too, or only the two forests
do and night interrupts them. The hub's proposal took the first; the harvest took the second.
This ruling handles both without choosing, because a name on each label answers either.

The requirements it must meet, taken from the brief and checked below against each candidate:

- reads from the whole map, before any click;
- survives non-adjacent sharers with a different region between them;
- carries information in the all-shared case (the launch state, since `bg` is engine-gated
  until part 2 lands and every region resolves to the act's background today) and in the
  none-shared case;
- does not spend fill colour, which is already spoken for twice (region identity, and the
  author's own hue as a thinking aid, his Q2 ruling);
- degrades to something for a colour-blind reader;
- ships with REGIONS-PAINT rather than after it.

## 3. Why the label, and what was rejected

### The hub's "Colour by: region / background / effects preset" toggle does NOT stand

It is one person's first idea, marked as such, and it fails on the crux the brief names: it
puts a second meaning into the one channel he just claimed. He asked for hues he can fix in
his head — *"green to forest… blue for lake"* — and background mode repaints exactly those.
Whichever mode is on, the map answers one question and lies about the other unless the author
remembers the mode; this app already has lore about a toggle that leaves nothing on screen to
say it is on (`CollisionLegend.tsx`, *"the honest conclusion is that the toggle is broken"*),
and a mode that silently changes what green means is that trap with a worse failure. Three
further reasons, each sufficient on its own:

- **All-shared collapses the map.** In background mode with one background, every region is
  one colour and only the outlines remain — the region picture he uses the facet for is gone
  precisely in the common case.
- **It needs a second colour sidecar** (a colour per background, and a third per effects
  preset), each an author-maintained palette. Two palettes competing for one channel is the
  problem restated as a feature.
- **Hue-only.** A colour-blind reader gets nothing from it at all.

The one part of the proposal that survives is the list badge, upgraded in §4 from a count to
names.

### Adjacency cues (merged outlines, suppressed shared borders): rejected

They fail his own example. Forest / night / forest has no shared border between the two
forests; a cue that lives on a border cannot reach across night.

### A dash or hatch pattern per background: rejected

The alphabet is three or four patterns before they stop being distinguishable, and every one of
them already means something on this map: dashed is a disabled layer (`effects-guides.ts:565`)
and a marquee (`MapViewport.tsx:776`), hatched is the uncertain register
(`raster-timeline.ts:806`, *"a different KIND of mark, not a paler version of the same one"*).
Borrowing them would make a background look like a disabled thing.

### A per-background colour stripe along the region's edge: rejected

A second hue channel beside the first. Hue-only again, and it needs the same colour sidecar
the toggle needed. A thumbnail of the background's actual art in the label would be honest and
sidecar-free, but it is a rasterisation cache and a legibility question at 16 px; deferred, §5.

### The label: chosen, because it is the channel this app already uses for "which"

Every mark on this map that has to say *which* says it in words next to the mark: the layer
guide (*"`L1 y=…` because a bare line answers neither"*, `effects-guides.ts`), the surface row
(*"the label names the KEY, not just the number"*), the section grid's background dot, which is
paired with a tooltip naming the background (`SectionGridNav.tsx`). Spec §3.4 already gives
every region a label at its rectangle's top-left. A second line reading the background's name
is the smallest possible addition to a control the facet has anyway, and text is the one channel
whose alphabet is unbounded and whose meaning cannot collide with a colour.

It is at-a-glance at the zoom he will use. A 4x2-section act is 8192 px wide; framed in a
~1200 px viewport it sits near zoom 0.15, so a 2048 px region is ~300 px on screen and the
1400 px night region ~200 px. Labels are drawn in the screen frame (as the guides are), so a
10 px two-line label is legible on every region at whole-map zoom. Where a region is narrower
on screen than its label, the second line goes first and the caption (§4) still says it.

Text is not "always on carrying nothing": the presence of the line is constant, but the
*content* is the signal. That is the difference from a colour toggle. When the names match the
answer is "same", when they differ the answer is "different", and the eye reads both without a
legend to remember.

## 4. The shape, in the app's own vocabulary

1. **Label, second line.** `Forest, upper mid` / `bg Forest`. Resolution follows
   `resolveDisplayedBg`'s order and its readers: a library id prints the library entry's
   `name`; `@act`, null and absent print `bg act`; a dangling id prints `bg MISSING <id>` in the
   warning tone, the same wording the section grid's dot uses and the same predicate
   (`danglingBgRef`). One pure resolver, `regionBgLabel(region, act, bgLibrary)`, testable in
   the node suite; the draw pass only prints its answer.
2. **Caption, said once, bottom-right,** the idiom of `surfaceCaption`: *"5 regions, 1
   background (act)"* or *"5 regions, 2 backgrounds: Forest, Night"*. This is what carries the
   all-shared and none-shared cases as a sentence rather than as an absence.
3. **Panel `bg` row badge:** `same as: night, forest_b` (names, capped at three with `+N`),
   not the hub's bare count — a count says how many, and he will want to know which.
4. **Selection-linked outline.** With a region selected, every other region resolving to the
   same background gets a second, heavier outline in the neutral overlay colour
   (`OVERLAY_OUTLINE`), not a hue. Weight and a second stroke carry it, so it reads without
   colour. This is confirmation after a click, not the primary cue, and it is the one item
   that may be deferred (§5).

No new control. No mode. No `showX` toggle in `viewStore` — the labels are part of the region
drawing, present whenever the Regions facet is.

## 5. How it behaves in the awkward cases

- **All regions share one background (launch state).** Every label's second line reads
  `bg act`; the caption says *"N regions, 1 background (act)"*. The map is not repainted into
  one colour, region hues stay his. The selection-linked outline lights every other region,
  which is the truthful picture.
- **No two share.** Each label reads a different name; caption *"N regions, N backgrounds:
  …"*; selecting a region outlines nothing extra, and because the label already names the
  background, that absence is not a mystery (the rule behind *"dimmed and hatched, never
  absent"*: the answer is on screen either way).
- **Forest / night / forest.** Labels read `bg Forest`, `bg Night` (or `bg Forest`, on the
  other reading of *"they all"*), `bg Forest`. Both forests say the same word with night between
  them; selecting either forest outlines the other across the gap. Under the first reading all
  three light.
- **Colour-blind reader.** The primary cue is text and needs no colour. The confirmation cue is
  stroke weight. The only hue in the design is the author's own region hue, which this ruling
  leaves exactly as his Q2 ruling set it.
- **Missing library entry.** `bg MISSING <id>` on the label in the warning tone, and the
  caption counts it as its own background, so a checkout without library binaries reads as
  "showing the act default" rather than as a silent share, matching O31's rule for the grid.

## 6. What it costs, and what is deferred

Everything here lives inside the region draw pass and panel that REGIONS-PAINT builds anyway.

| item | build | ships with |
|---|---|---|
| `regionBgLabel` resolver + node tests (three arms: library name, act, missing) | ~40 lines | REGIONS-PAINT |
| second label line in the draw pass, screen-frame font, drop-when-narrow | ~20 lines | REGIONS-PAINT |
| caption sentence | ~15 lines | REGIONS-PAINT |
| panel `bg` row `same as:` badge | ~15 lines | REGIONS-PAINT |
| selection-linked second outline | ~15 lines + one Set per draw | REGIONS-PAINT if the draw pass is already open; **may be deferred** to a follow-up row without weakening the ruling |

Explicitly deferred, not ruled against: a thumbnail of the background's own art in the label
(honest and sidecar-free, but a raster cache and a 16 px legibility question); hover-linked
outlines (the selection form covers it and hover adds a repaint path to a viewport with no
clock); a "group the list by background" sort (list order carries no meaning after Q1, so it is
possible later, but the badge answers the question first).

Nothing here touches `regions.json`, the schema, or the colour sidecar. No new file, no new
field, no new toggle.

## 7. Overturnable by one word from him

This is a look call made in his absence under his overnight words, and one word from him
replaces it. The one question I would put to him if he wants to weigh in:

> *Do you want the background's name on every region's label all the time — or only once the
> act has more than one background, with a quieter map until then?*

I chose all the time, because a line that appears only when something changed asks the author
to notice an absence, and because on day one every act has one background and he would never
see the line he asked for. If he prefers the quiet map, the caption alone carries the launch
state and the label line switches on at the second background; every other part of this ruling
stands unchanged.

---

## 8. The one open question went to a Fable agent, not to his card — and its verdict lands in EMPYREAN

*Appended by the overseer 2026-09-16, after the hub took it up. Recorded here because a
successor reading this ruling is the one who needs it, and it arrived in a message, which is
the one artifact a `/clear` destroys.*

§7's question — **name on every label always, or only once an act has more than one
background** — was **not** filed to the owner. His 2026-09-16T05:2xZ instruction routes a
regions-phase-2 call to a Fable agent rather than to his card, and this is one, inside the lift.
The hub dispatched an agent against **`4414f8ce`**, read at that revision, with this document's
framing rather than the hub's, and with a third option open to it if it has one.

**Its verdict is written into empyrean, not into this repo.** Go and look for it there rather
than waiting for it to arrive; a ruling nobody fetches reads identically to one never made. If
it moves §3.4's badge text beyond what §4 already specifies, that is **view, and it stays this
lane's call** — the hub said so explicitly.

Everything in §1 through §7 stands unless that verdict says otherwise, and the label's
**on-condition** is the only thing it can move. Overturnable by one word from him, as before.
