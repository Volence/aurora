# Section 8 of the regions editor spec supersedes four sections and carries five rulings for THIS lane

**2026-09-16. Read this before building any part of REGIONS-PAINT.** Raised by aeon (`aeon-1c`),
whose agent hit it implementing the flattener. **Verified here firsthand** at empyrean
`origin/main`, `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` section 8, not
taken from their account.

## The defect, which is the reusable part

Sections 2.3, 2.5, 3.2 and 5.2 still carry **superseded prose**. The supersession is stated in
section 8, at the end of the document, **by the document about itself** - it is not an inference
from reading two paragraphs against each other. And **a reader starts at the section they need**,
which is what anyone does, so nobody reaches section 8. The same shape as this repo's own rule that
a stale label at the FRONT of a row survives every correction appended to its back.

## What was ruled

The owner ruled Q1 on **2026-09-14T14:54:34Z**, verbatim: *"Yeah probablyy go with how we think
about it."* It selected **A, cut right away**: drawing a region over another trims the other's
rectangles at once, `regions.json` holds exactly each region's own disjoint area, and **list order
carries no meaning**. Section 8 then names what that supersedes:

- **2.3** the painter's-order model and `regions[]` ordering.
- **2.5** coverage and non-overlap stop being validator rules and become **author-visible** ones the
  editor enforces: a vacated area shows as UNASSIGNED in red and the build refuses it until someone
  gives it to a region, in one action such as "give to forest".
- **3.2** carve is what **every** draw over an existing region does, not a separate Alt gesture.
- **5.2** flattening becomes a check that the rows are disjoint and cover the act, not a subtraction.

**The landed schema is the tiebreaker and agrees with the ruling rather than the prose:**
`{schema, act, regions[]}`, one `rect` per region, a required non-null `preset`, no `defaults`, no
`bindings` wrapper, no `rects` array. The document section 2.3 sketches cannot be written against
it at all.

## This lane already built the RULED model, checked rather than assumed

`src/core/editing/region-geometry.ts`, landed 2026-09-16 under the owner's cut-on-draw ruling:

- **Zero occurrences of "alt" in the module.** There is no Alt gesture to unbuild. `applyDraw` cuts
  on every draw.
- `deleteRegion` gives the area back to **UNASSIGNED** and nothing grows into it; the header calls
  unassigned "a first-class answer".
- `coverage` and `disjointness` are **explicit checks**, and the module header says exactly why:
  the schema sees one document and no act, so it cannot check tiling or overlap.
- The tests find a hole rather than assuming there is none: *"a hole in the middle comes back as
  the hole"*, *"an empty act is entirely unassigned"*, *"a rectangle hanging off the act is
  reported as OUTSIDE, not clamped and not a hole"*, and a property over 400 random draws that
  assigned plus unassigned equals the act.

**Aeon's sharpest point applies to this side too and is why the list above was checked instead of
asserted:** subtraction made coverage true by construction and therefore **unfalsifiable**. Under
the ruled model a hole is something an author can actually have, so the check has to FIND one and
name it. A coverage check that cannot fail is the same artifact as no coverage check.

## The five rulings in section 8 that are THIS lane's to build, and they are in the unread section

REGIONS-PAINT scope. Answered by the owner 2026-09-14T14:50:35Z unless noted:

1. **Region hues: fixed by default AND the author can change one later**, which means the colour IS
   saved. His words: *"Mayybe give an option to change color later (just because I might quickly
   equate green to forest in my mind it helps me think about regions, blue for lake…)"*. The hub's
   application, overturnable: save it **editor-side in a sidecar**, the `.chunklinks.json`
   precedent, **never in `regions.json`**, so level data stays free of editor-only fields.
2. **The screen frame is always visible in the Regions facet and arrow keys take it**; panning moves
   to Shift-drag or the middle button there. His: *"Sure."*
3. **`[` and `]` for the edge hop.** His: *"That sounds fine."* Not verified against every facet's
   bindings; section 9 says so.
4. **Migration naming: no preference from him** (*"Doesn't matter too much, we don't have pseudo
   regions in sections right now besides the test one you made"*), so the recommendation stands as
   the default: the preset name when the preset is explicit, `sec_N` otherwise.
5. **His own request, and it is a feature nobody has built:** *"Btw if regions share a background,
   is there anything we should do to mark that as such? Like this way if I see forest with the night
   between it I can just at a glance know they all have the same bg…"*. The hub's proposed shape for
   section 3.4, explicitly overturnable: a map toggle **Colour by: region / background / effects
   preset**, background mode filling each region with its resolved background's colour so forest and
   night read as one colour with night's outline still drawn, and a list badge "shared by N regions".

**Item 5 is a request from him that no queue row carries.** It is recorded here rather than acted
on: it is a look call and it is his, and the hub's shape for it is a proposal, not a ruling.
