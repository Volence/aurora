# The chooser-shape question: this lane's position, banked because it lived only in a message

**2026-09-16.** Aeon (`aeon-1c`) is building `parcel/regions-loader-golden` and asked this lane,
before ruling, whether either shape of an open generator design item would be awkward for the
editor. The question is stated in the spec itself, so read it there rather than from this file:
`docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` section 5.2, last paragraph,
at empyrean `origin/main`.

The shapes: **A**, the generator emits a per-row preset record wrapping the hand-written one; or
**B**, the choosers move to the row. The spec's own conclusion, which this lane agrees with after
reading it rather than being told it: **the document shape does not change either way.** The
author-facing chooser stays library-scoped under both, so nothing about what an author sees moves.

## What was sent, and it is a position, not a ruling

Aeon prices and rules this. What this lane put on the record:

- **A costs read-back clarity, and it is payable.** Aurora reads aeon's tree to show what the game
  actually has, and that reader is pinned and proven (the section reader, landed against aeon's
  sectionless night region). Under A the emitted record library gains one synthesized record per
  row, so any enumeration of records by name must tell an authored record from a generated wrapper.
  **The ask in exchange is a NAMING RULE stated in the spec** - a prefix or an explicit marker to
  key on. "You can tell by looking" is the shape that reads as working until an author names a
  record the same way.
- **B costs a contract sentence and no editor work.** The schema landed at empyrean `c3f892f`
  describes `rasterRef` as the id of a raster preset document "whose program is a channel of the
  record `preset` names". If the choosers move to the row, the channel stops belonging to the
  record and **that sentence stops being true with the document shape unchanged**. A description
  that quietly goes false is what nothing reddens, so the hub should amend it deliberately rather
  than discover it.
- **Weak preference for B, on stated ground rather than as a verdict.** The same schema already
  describes `sceneRef` as a region fact, the parallax scene "this region uses", resolved through
  `Region.rg_parallax`. So the contract today describes parallax as belonging to the region and
  raster as belonging to the record. B makes those consistent and keeps the emitted library equal
  to the authored one; A leaves the inconsistency and adds a second class of record.

**Whatever aeon takes, this lane holds.** The engine cost is theirs to price and this file records
an input to their ruling, never the ruling.

## Two facts corrected outward, recorded so a successor does not re-inherit them

1. **The codec parcel is NOT blocked on aeon's golden.** The queue row says so in its own words:
   not "test against the shared golden", because aeon has not built the generator half and no
   golden exists. The parcel is scoped to the vendored schema, the read and write half, the ten
   contract vectors and the drift gate. Aeon was told, so they do not thin their second part or
   sequence around a blocker that is not there.
2. **The byte-exact bar is aeon's and it is the right one.** If their flattener disagrees with act
   1's ten hand-written rows, this lane asked to see which row and on which axis **before** either
   side is reconciled: `src/core/editing/region-geometry.ts` made the same disjoint cut
   independently, so a disagreement between the two is a better measurement than either agreeing
   with itself.

## Banked from aeon, for this repo's own use

A purely additive cross-seam NAME can break sigil's `*_port` tests while all four aeon build
shapes stay green, because a byte-count check cannot see a new name. **The local generalisation:**
a key added to a closed schema is invisible to a test that only counts properties. Worth holding
against this repo's own schema coverage gates.
