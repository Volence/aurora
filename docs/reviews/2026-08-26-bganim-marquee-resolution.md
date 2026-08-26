# Can a marquee over the background resolve to a promotable band?

**ROADMAP item 43, part 2 — the measurement that gates the gesture.**
Branch `feat/bganim-band-marquee`. Measured 2026-08-26.

**VERDICT: NO. The gesture as booked cannot be built. BLOCKED, awaiting a ruling
on its shape.**

Over the shipped OJZ background, **1.71%** of rectangular marquees resolve to a
promotable slot range, and **every one of them that is larger than a single tile
is a single ROW of tiles**. Of the 143,088 multi-row marquees swept, **18** are
promotable — 0.013%. The mechanism is not bad luck: the static blob is laid out
**row-major** in the picture and a band's slots are **column-major**, so the two
are transposes of each other and a rectangle cannot be both at once.

Instruments, both committed:

- `scratchpad/bganim-marquee-resolution-probe.mjs` — the sweep. Run:
  `node scratchpad/bganim-marquee-resolution-probe.mjs`. Output as measured:
  `scratchpad/bganim-marquee-resolution.out`.
- `scratchpad/bganim-marquee-command-crosscheck.ts` — puts the probe's verdict
  beside the real `promoteBandCommand`. Build/run line is in its header.

---

## What was swept

A marquee of `w x h` picture cells at every position on the 64x64 plane, for
`h` in 1, 2, 4, 8, 16, 32, 64 (a band's `rows` must be a power of two —
`bg-override.ts`: column bytes `rows*TILE_BYTES` must be a power of two) and `w`
in 1, 2, 3, 4, 6, 8, 12, 16, 24, 32. **177,776 marquees per document**, over
three documents: the shipped `b0e5a661` fixture, aeon's live
`games/sonic4/data/editor_bg_override.json`, and the band-free `roomy` fixture.

Every constant — `LAYOUT_TILE_INDEX_MASK`, `BG_LAYOUT_WORDS`, `TILE_BYTES`, the
`COLS, ROWS = 64, 64` plane shape — is read out of
`bganim-consumer-contract.json`, not typed into the probe.

Verdicts, weakest to strongest:

| verdict | meaning |
|---|---|
| `distinct` | the `w*h` cells name `w*h` distinct tile indices |
| `contiguous` | those indices are exactly `[min, min + w*h)` — no holes |
| `promotable` | contiguous **and** `min >= animatedSlotCount`, so `promoteBand` would not refuse the range |
| `colMajor` | promotable **and** cell `(j,i)` names `min + j*h + i` — the band's own slot geometry, so the promoted band animates the region as pictured |
| `rowMajor` | promotable **and** cell `(j,i)` names `min + i*w + j` — the transpose, measured in case *that* is what the art uses |

## 1. What fraction resolve

| document | marquees | distinct | contiguous | **promotable** | colMajor |
|---|---|---|---|---|---|
| b0e5a661 (shipped OJZ) | 177,776 | 39.44% | 13.05% | **1.71%** | 1.59% |
| aeon live (320 tiles, 1 band) | 177,776 | 26.43% | 6.47% | **5.39%** | 5.12% |
| roomy fixture (no bands) | 177,776 | 26.43% | 6.66% | **6.66%** | 6.32% |

Those headline numbers are **inflated by the degenerate cases**, and the
breakdown is the finding:

**b0e5a661 — every promotable shape, by count:**

```
1x1: 1536   (a single tile: contiguous by arithmetic, not by anything about the picture)
2x1:  533   3x1: 335   4x1: 260   8x1: 157   6x1: 127   12x1: 30   16x1: 18   24x1: 18
1x2:   18   <-- the ONLY multi-row shape, and it is one tile wide
```

There is **no promotable marquee taller than one tile and wider than one tile**
anywhere on the shipped background. The other two documents add one such shape
between them — `16x2` (98 positions on the live document, 98 on roomy), a
16-wide run that happens to continue onto the next plane row — plus roomy's
`1x2:4`. Still nothing resembling the 32x4 / 16x4 bands the document ships.

Per-height totals for b0e5a661, static art only (`promotable`):

| h | 1x | 2x | 4x | 8x | 16x | 32x |
|---|---|---|---|---|---|---|
| **h=1** | 37.50% | 13.22% | 6.66% | 4.30% | 0.57% | 0.00% |
| **h=2** | 0.45% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| **h=4** | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| **h=8** | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |

At `h=4` — the height **both** shipped bands use — the `contiguous` column reads
40–55%, which looks like a result until you notice that `promotable` on the same
rows is **exactly 0**, at every width:

```
 1x4  contiguous 2180 / 3904 (55.84%)   promotable 0
 2x4  contiguous 2098 / 3843 (54.59%)   promotable 0
 4x4  contiguous 1942 / 3721 (52.19%)   promotable 0
 8x4  contiguous 1630 / 3477 (46.88%)   promotable 0
16x4  contiguous 1231 / 2989 (41.18%)   promotable 0
32x4  contiguous  957 / 2013 (47.54%)   promotable 0
```

**Every** contiguous 4-row window on this background sits on the animated
prefix: it is one of the two existing bands being drawn, and `promoteBand`
refuses it by rule because its slots already belong to a band. Across all
heights the same split reads:

```
WHERE the contiguous marquees are (b0e5a661, ALL heights):
  over the ANIMATED prefix (already a band, promotion refuses): 20168  [column-major: 8712]
  over STATIC art (what promotion is for):                       3032  [column-major: 2822]
```

— and of that 3,032, all but 18 are a single row of tiles.

**The only art in the document laid out the way a band needs is art that is
already a band.**

## 2. What the near-miss looks like

Not a few holes. Scattered.

```
NEAR-MISS over the 154,576 non-contiguous marquees (b0e5a661):
       0 hole(s):  38796 (25.10%)   <- distinctness failed: the same tile is drawn twice
       1 hole(s):    919 ( 0.59%)
       2 hole(s):   3668 ( 2.37%)
     ...
       8+ holes:  97589 (63.13%)
  span / cells  — median 1.8x, p90 7.4x, max 124.0x
```

On the live document it is worse: **94.50%** of failures have 8+ holes, median
span/cells **3.6x**, max **156.5x**.

Two distinct failure modes, and the first one is not fixable by any snapping:

- **De-duplication.** 25% of the failures have *zero* holes because the marquee
  never named `w*h` distinct tiles at all — the blob is de-duplicated, so
  repeated picture reuses one slot. Row 0 of b0e5a661 is tile 192 in all 64
  cells. At 8x1, only 70.86% of marquees name 8 distinct tiles before contiguity
  is even asked; at 8x8, 0.37%.
- **Scatter.** The rest name indices spread across the blob. A median non-
  contiguous marquee's indices span 1.8x its cell count; the tail runs to 124x,
  i.e. the whole 340-tile blob for a 4-cell selection.

## 3. Does `w`/`h` correspond to the band's `cols`/`rows`?

**Only for `h == 1`, and for `h > 1` there is no second mapping to derive — the
arrangement is simply the wrong one.**

A band's slots are column-major: slot `t` is column `floor(t/rows)`, row
`t%rows` (aeon `engine/level/bg_anim.emp`; `forest_bg_gen.py` builds banks
`for col: for vrow:`; the injector calls the banks blob "column-major so
whole-column rotation is two wrapped DMAs"). So a promotable `w x h` marquee
needs **down a column to be +1** and **across a row to be +h**.

The static art does the opposite. Measured over static cells only, adjacent-pair
index deltas:

| document | ACROSS is +1 | DOWN is +1 |
|---|---|---|
| b0e5a661 | 31.9% (n=1512) | **1.3%** (n=1344) |
| roomy | 54.5% (n=4032) | **0.0%** (n=4032) |

Worked example, b0e5a661, a 4x2 marquee at col 0 row 45:

```
  row 45:  292 293 294 295
  row 46:  316 317 318 319
```

Across is +1. Down is +24 — and 24 is a property of that band of art, not of the
marquee's height, so no `cols`/`rows` choice reaches it. A `cols=4, rows=2` band
needs `292 294 / 293 295`. This is the transpose, and it is why the multi-row
column of the table above is zeros rather than small numbers.

The `colMajor` and `rowMajor` columns are equal at every row of the sweep — for
`h=1` they are the same predicate by definition, and for `h>1` both are 0%. The
transpose is not a rescue.

## 4. The part that makes this dangerous rather than merely disappointing

`promoteBandCommand` **cannot detect the mismatch.** It checks that
`staticBase` is an integer, that `staticBase + cols*rows <= tiles.length`, and
that `staticBase >= animatedSlotCount`. It never sees the marquee, so it cannot
know whether the range is the art the author selected.

`scratchpad/bganim-marquee-command-crosscheck.ts`, over 6,474 sampled marquees
on the shipped document:

```
probe says PROMOTABLE     -> command ok:        116
probe says PROMOTABLE     -> command REFUSED:     0   (the probe agrees with the codec)
probe says NOT promotable -> command REFUSED:  4836
probe says NOT promotable -> command ok:       1522   <-- the codec cannot see the mismatch

worst silent acceptance:
  16x8 at col 12 row 0: covers 45 distinct tile(s) spanning 192..247; promoting
  192..319 takes 83 tile(s) the marquee never touched and leaves out 0 it did
```

**23.5% of sampled marquees would be accepted while selecting something else.**
The result is not corrupt — promotion is image-preserving, so the picture is
unchanged and the document validates — but the band the author gets is not the
art they drew a box around, and nothing anywhere says so. The refusal therefore
cannot come from the codec; it has to be computed by the gesture, and on the
shipped document it would fire on **98.3%** of marquees and on **99.99%** of the
multi-row ones.

## 5. A finding that fell out: the live document's band is not drawn as a block

The probe's own instrument check looks for each band drawn as its own
column-major `cols x rows` window. On b0e5a661 it finds **2/2**. On aeon's live
document it finds **0/1**: the 8x4 band's 32 slots are scattered across plane
rows 0–2 in row-major order, and slot 3 of that band is drawn in **964** cells
(it is the sky tile).

That is consistent with the band having been promoted from a static range whose
picture arrangement was not the band's geometry — the exact hazard measured
above, already present in the live file. It is a structural observation only.
**TAGGED FOR FOREGROUND:** what that band looks like when it steps is an
emulator question and no emulator was touched from this agent.

## 6. Options, for the ruling

None of these were built. The gesture was not quietly redefined to reach one.

- **(a) Ship it with the refusal.** Honest, and off 98.3% of the time on the
  shipping document. A gesture whose answer is almost always "no" teaches the
  author nothing about how to get a yes.
- **(b) Constrain the marquee to a single row.** `h=1` is the only height that
  resolves at all (4–37% depending on width). A `rows=1` band is legal
  (`1*TILE_BYTES = 32`, a power of two) and is an 8px-tall strip. Both shipped
  bands are `rows=4`; nothing has ever shipped at `rows=1`.
- **(c) Select by SLOT RANGE, not by picture region.** Drag over the blob strip
  in the Art panel — which is already sourced from the resolved BG blob
  (`providers/tile-picker-source.ts`, item 47) — where a contiguous range is
  what the surface natively expresses. This is a different panel and a different
  parcel's surface, and it drops the "on the map preview" half of the original
  booking.
- **(d) Invert the gesture: the marquee READS rather than promotes.** Given a
  band (or a candidate `staticBase`/`cols`/`rows`), highlight on the map every
  cell those slots paint. Well-defined for every range, needs no refusal, and it
  would have shown §5's scattered live band at a glance. It is a lens, not an
  edit — it does not close the row as booked.
- **(e) Make the picture match the model first.** A blob re-ordering pass that
  lays a chosen region out column-major would make (a) work, but that is a
  permutation of `tiles` plus the whole layout rewrite — new plan machinery in
  `bg-anim-band.ts`, which this parcel is a caller of and not a co-author of.

## Instrument discipline

- **Red-first, run-level decode gate.** The probe refuses to report unless at
  least one banded document shows its band drawn as the block the band's
  geometry describes. Planting `PLANE_COLS / 2` makes it print
  `BAND-AS-BLOCK: 0/2 ... at 32 words/row` and exit **3**; restored, it exits
  **0** with `DECODE PROVEN BY: b0e5a661 fixture`.
- **Alternative green path ruled out.** A document with no bands returns
  "not applicable" and must not satisfy the gate. Running the probe on the
  band-free `roomy` fixture alone exits **3** — the gate is not satisfiable by
  absence of a subject.
- **The classifier is checked against the codec, not trusted.** §4's cross-check
  found 0 disagreements on the promotable side over 6,474 samples.
- **No tolerances.** Every predicate is exact integer equality.
