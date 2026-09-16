# The chooser-shape question: this lane's position, banked because it lived only in a message

**2026-09-16.** Aeon (`aeon-1c`) is building `parcel/regions-loader-golden` and asked this lane,
before ruling, whether either shape of an open generator design item would be awkward for the
editor. The question is stated in the spec itself, so read it there rather than from this file:
empyrean `origin/main`, `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`,
section 5.2, last paragraph. That path is in EMPYREAN and not in this repo, which is why this line
names the repo beside it.

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
- ⛔ **WITHDRAWN 2026-09-16, AND IT WAS WRONG WHEN WRITTEN. The weak preference for B rested on a
  consistency argument that compares two different kinds of fact.** Kept in place rather than
  deleted, because the way it failed is the lesson. It said: the schema makes `sceneRef` a region
  fact and `rasterRef` a record fact, so only one can be right, and B makes them consistent.
  **The binding pair is `preset` and `sceneRef`** - both resolve to per-region engine pointers,
  `Region.rg_effects` (a required pointer to an EffectsPreset record) and `rg_parallax`. They are
  symmetric already. **`rasterRef` is provenance and not binding**, so it was never a candidate for
  the same shape. The contract says so in the sentence next to the one this lane quoted:
  *"`rasterRef` is not a second home for identity: the record named by `preset` is what the engine
  binds, and `rasterRef` names a document that produced part of it. One fact, one home."*
  (`docs/AURORA_REGIONS_SCHEMA.md` section 3 at empyrean `origin/main`, read there after aeon
  raised it.) **This lane had that sentence in front of it and read past it** - it sits in the same
  `rasterRef` description that supplied the half-quote the argument was built on, and it was pasted
  into the codec dispatch brief on the way. Reading far enough to find the support and stopping
  there is the defect, and it produced the stronger-SOUNDING of the two arguments.
  **No preference is now stated on the chooser shape.** The costs below stand on their own and
  aeon rules on engine numbers.

**The half that stands, and it is the one that mattered.** The "B falsifies a landed sentence"
cost is real, aeon kept it in their ledger, and the hub has changed a rule because of it: their
CR rule was keyed to KEYS, so a meaning-only change slid under it, and it now runs as a CR landing
with or before the change it describes. **The argument this lane got wrong was the loud one; the
argument nothing else in the suite could have made was the quiet one.** Worth remembering in that
order.

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

## The limit on what the codec parcel may claim at landing

**Added 2026-09-16, from aeon's reply, and it is the most useful thing in that exchange.** They
withdrew the blocker and kept the row in weaker form, which is the correct reduction and it binds
this lane's landing language:

> a codec green against its own vectors and round-trip properties is not green against a tested
> seam, because both sides can agree with themselves while disagreeing with each other.

So when `parcel/regions-codec` returns green, **what is proven is that Aurora reads and writes the
document the hub's schema describes, and nothing whatever about the seam.** The vectors are the
hub's, which makes them better than a fixture this lane wrote, and they are still one side of the
wall. **Do not write "the regions file is proven" in the lane log or in a report to the hub.**
Write what was measured: the schema is vendored and pinned, the ten contract vectors get the
verdicts the contract states, the round trip is byte-exact, and the drift gate is red-first.

**The re-open condition, so it is a condition and not a hope:** the seam is open until aeon's
shared golden exists and this repo runs a leg against it. That leg is the claim about the seam;
everything landing now is upstream of it. Same class as this repo's standing rule that a merge is
not a certification, seen from the other end.

**And a caution about the resolution:** aeon is holding to report which row and which axis if their
flattener disagrees with the hand table, without reconciling first. When that arrives it is
evidence, not a defect report against either side. `src/core/editing/region-geometry.ts` is the
third independent cut and is as able to be the wrong one as the other two.

## The nearby gap is a measured consequence, not a design choice, and nothing here may assume it is permanent

**Aeon, 2026-09-16.** No key names the effects record's *document* the way `sceneRef` names the
scene. That asymmetry is real but it is a consequence rather than a decision: no effects document
can express a total binding yet, it fails three independent ways (it does not bind, the base
palette is not in its vocabulary at all, and one key is still reserved-and-refused by name), and
`effectsRef` is reserved against **all three** closing rather than whichever is fixed first. So it
dissolves when they close; it is not a shape to build against.

**Why nothing in this parcel is exposed to that, stated as a mechanism rather than an intention.**
The codec validates against a VENDORED copy of the contract pinned by blob hash in its sidecar,
with a drift gate that goes red when empyrean's copy moves. The schema is closed, so `effectsRef`
is refused today, correctly, because the contract refuses it today. The day the hub spends it, the
pin moves, the drift gate reddens, and the re-vendor is the act that teaches this repo the new key.
**No code here decides whether that key is coming.** That is the property to preserve when
reviewing the parcel: any place the report or the types state the gap as settled rather than as
"what the pinned contract says today" is a place to correct before landing.
