# The two refusals name their shape, and the dead size arm is labelled

Branch `parcel/refusal-shape`. Two halves, both about
`src/renderer/providers/bg-anim-aeon.ts`.

- **Half A** — `insertUnavailableReason` and `promoteUnavailableReason` printed a
  section byte figure with no shape named, three weeks after the readout beside
  them was fixed to name one.
- **Half B** — the `!ok` arm of `bganimSectionBytes` and the two panel branches
  behind it: reachable, redundant, or neither.

---

## Half A — the decision, and the argument for it

### What ships

Two changes to each refusal, and they are not the same kind of thing.

**1. The shape label, UNCONDITIONALLY.** The after figure now reads
`… would take it to 20570 of 20480 bytes, in every ROM shape.` — the same two
phrases the readout uses, from one derivation
(`sectionShapePhrase`, `src/renderer/providers/bg-anim-aeon.ts`).

**2. A second sentence, ONLY when the operation moves the act between shapes**
(`sectionShapeMoveNote`, same file):

> ⚠ AND THAT FIGURE IS IN A DIFFERENT SHAPE from the act's current 16568 bytes
> in the debug shape: the 138 bytes of debug view twins are emitted in one of
> the two shapes and not the other, so the two figures do not differ by the
> slots alone.

### Why the label is unconditional

Because it is already ruled, on this exact axis. aeon's
`tools/EFFECTS_CONSUMER_CONTRACT.md` §1.2 says *"Say which shape any figure
is for"*, and `4a565908` applied it to the panel readout. The rule is on
*any figure*, not on *any surprising figure*. Applying it selectively here
would also produce the worse local outcome: a labelled readout sitting directly
above an unlabelled figure in the same units invites the reader to assume the
two match, which is exactly the assumption that is false in the interesting
case. Four words is the whole cost.

It also matters that these strings are not only rendered next to the readout.
The file's own docblock states the discipline — the refusal is *"the same
sentence in the UI, in the agent reply, and in the test"* — so a sentence that
relies on an adjacent readout to disambiguate its units is wrong in two of those
three places.

### Why the move sentence is conditional

This is where the brief's "weigh readability honestly" bites. These refusals are
already five sentences long, and this repo's standing finding is that a wall of
caveats in front of a control is itself a defect. So the extra sentence appears
only in the case it is about — which is also the licence for it to be blunt when
it does appear.

Two shape labels alone would **not** have covered it. They say the act is in two
different shapes; they do not say that the author's own edit is what moved it,
and they do not say the two figures are therefore not commensurable. That second
fact is the one an author cannot recover: subtract the two figures and you get a
per-slot cost that the same sentence just told you was `BGANIM_BYTES_PER_SLOT`,
with nothing on screen to explain the gap.

### ⚠ Where the brief is wrong: the direction never reverses

The brief says *"the after figure can even move in the opposite direction from
what 'adding' implies."* **It cannot**, through these two doors, and the suite
now says so rather than leaving the claim standing.

Both doors append exactly one band, so, writing `T(b) = COUNT + RECORD*b`:

```
after - before = (T(2) - T(1)) + (views_after*T(2) - views_before*T(1)) + n*BYTES_PER_SLOT
```

- `views_after` can only be non-zero if the act arrives at exactly one band
  carrying `default_off` — which needs the act to have had **zero** bands and the
  appended band to carry the key. Neither door writes `default_off` onto the band
  it appends (`BandSpec` in `bg-anim-aeon.ts` has no such field), so through
  these doors **the twins can only be lost, never gained**.
- So the worst case is the maximum twin loss (`VIEW_COUNT * T(1)`) against the
  minimum band (`n = 1`), and even then:
  `BYTES_PER_SLOT + RECORD - VIEW_COUNT*T(1)` = `256 + 44 - 138` = **+162**.

The figure always rises. What it does not do is rise **by the slots alone**, and
that — not a reversal — is the defect the sentence is for. The row
*"the after figure never falls: the smallest band still outweighs the twins
lost"* pins the margin, so a contract change that inverted it fails loudly here
instead of quietly making this paragraph false.

---

## The shape-change fixture, and what it proves

`twinShapedDoc()` in
`src/renderer/providers/__tests__/bg-anim-aeon.section-budget.test.ts`.

**The act:** one tile animation, `default_off` set, `pattern_px` at the derived
period — aeon's shipped shape, and therefore the one shape that emits the debug
view twins. Sized so that **one more tile animation overruns the byte ceiling**.
Nothing is typed: `PERIOD_COLS` comes from
`BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX`, and `rows` is the largest
doubling that still leaves the two-band act room for at least one more slot.

On today's vendored contract that lands at 8x8 = 64 animated slots, 64 tiles:

| | bands | twins | section bytes |
|---|---|---|---|
| before | 1 | 3 emitted | `46 + 138 + 64*256` = **16568**, debug shape |
| after (insert 16) | 2 | **declined** | `90 + 0 + 80*256` = **20570**, every ROM shape |

The naive reading — 16568 + 16*256 — is **20664**. The printed figure is 94
lower, and before this parcel nothing on screen said why.

**What the fixture proves, that a merely large document would not:** it is the
only construction in which `bganimSectionBytes(after)` answers in a *different
shape* from `bandBudget(doc).sectionBytes`. Every other refusal row in this file
(and every row the section-ceiling parcel landed) sits inside one shape, where
the label is correct but carries no information and the omission costs nothing.
A test on such an act cannot distinguish the new sentence from the old one.

The row asserts, all derived:

1. the after figure carries `in every ROM shape`;
2. the move sentence names the **current** figure and the **debug** shape, and
   the twins' cost;
3. `after - before !== n * BYTES_PER_SLOT`, and equals
   `n*BYTES_PER_SLOT + RECORD - twins` — the incommensurability as arithmetic,
   independent of any string.

Plus a **control** on an act whose shape does not move: the label is still
present, and `DIFFERENT SHAPE` and `debug view twins` are asserted **absent**.
Without that control the sentence could have been made unconditional and every
other row would still pass.

---

## Half B — the reachability verdict

**Verdict: unreachable from ANY input; not redundant; kept and labelled.**

None of the brief's three outcomes fits exactly, and the difference is the part
that matters to whoever next considers deleting it.

- It is **not** "unreachable only because no current document reaches it". A
  hand-edited file, a foreign document and a future writer all fail to reach it
  too.
- It is **not** "unreachable and redundant because something upstream refuses
  first". Nothing upstream refuses. There is no guard doing this guard's work.

The actual state: **the failure arm has no producer at all.**

`viewsEmitted` (`src/core/formats/bg-override/bg-override.ts`) is the only
function in the codec that ever constructed an `{ ok: false }`. At aeon's
decouple (`364b7bce`) both of its refusing arms became `{ ok: true, value: 0 }` —
the twins *decline* where the build used to fail. Every remaining producer,
`bganimSectionBytes` and `bganimSectionSlotsAllowed`, only forwards what
`viewsEmitted` handed it. Grep evidence: the string `ok: false` occurs in that
file exactly twice, in the type declaration and in a comment — there is no
`return { ok: false` anywhere in it.

### The evidence, as a row rather than a recollection

`test/formats/bg-override-section-ceiling.test.ts`, *"NO input refuses a size:
the census behind the unreachable !ok arm"*. It sweeps the full cross product of
everything `viewsEmitted` reads:

- band count `0 .. BGANIM_MAX_BANDS + 1` (its per-act arm, across and past the
  ceiling),
- `default_off` true / false / absent, **per band, independently** (its
  truthiness read),
- `pattern_px` at the derived period / off it / absent (its per-band arm),

66,430 acts, every one measurable, on all three sizing functions. Non-boolean
truthy `default_off` values (`1`, `'yes'`, `{}`) are checked apart from the
product rather than multiplied into it, and the geometry keys are fixed at 1x1
because `viewsEmitted` never reads them — both stated in the row rather than
implied.

When that row goes RED it is **not necessarily a defect**: it means aeon has
added a sizing refusal back, which is what the arm is for, and the dead-branch
labels have to come down.

### Why nothing was deleted

Two reasons, and neither is caution:

1. **The safe direction lives on this type.** `bandBudget.slotsRemaining`
   collapsing an unmeasurable budget to zero rather than to the looser tile
   budget is the property the whole section-ceiling parcel landed for — it is
   what stopped an 80-slot offer standing in front of a 47-slot section.
   Collapse `BgAnimSizeResult` to a plain `number` and that direction has
   nowhere to live, so the next refusal arrives as a fall-through into the
   permissive figure.
2. **It is a landing site.** The condition `viewsEmitted` tests is unchanged;
   only its consequence moved.

So the five consumer branches stay and each got a short label pointing at one
argument, which now lives in `BgAnimSizeResult`'s docblock:

| site | branch |
|---|---|
| `src/renderer/providers/bg-anim-aeon.ts` | `insertUnavailableReason`'s `if (!bytes.ok)` |
| `src/renderer/providers/bg-anim-aeon.ts` | `promoteUnavailableReason`'s `if (!bytes.ok)` |
| `src/core/formats/bg-override/bg-override.ts` | `bganimSectionIssues` → *"the build refuses this act"* |
| `src/core/editing/bg-override-band.ts` | `sectionSizeOf`'s null arm (load-bearing for `sectionHarm`'s "worse in kind" comparison) |
| `src/renderer/components/effects/BgAnimBandPanel.tsx` | the *"ROM section: cannot say"* hint |

One thing found while labelling the panel branch: the no-document case never
renders that hint at all, because the whole panel body is behind `doc !== null`
while `bandBudget(null)`'s unmeasurable answer is the only live one. That is
noted in the branch comment so the next reader does not mistake the
no-document row in the suite for coverage of the on-screen hint.

Also corrected in passing: a comment in `insertUnavailableReason` still said a
second tile animation on a default-off act *"is refused by the build outright"*.
It has not been since the decouple, and that comment was the reason the shape
question looked like a refusal question.

---

## Plant proofs

`npm test` is the runner. Every mutation below was applied to the **committed**
tree at `9e4be0f7`, run red, restored with `git checkout --`, and run green.
The `git diff -U0` hunk is quoted for each.

| # | mutation | red |
|---|---|---|
| 1 | drop `${sectionShapePhrase(after)}` from insert's sentence | 2 failed / 15 passed — INSERT + CONTROL |
| 2 | `sectionShapeMoveNote` returns `''` always (`if (true)`) | 3 failed / 14 passed — INSERT, PROMOTE, helper row |
| 3 | `sectionShapeMoveNote` fires always (`if (false)`) | 2 failed / 15 passed — **CONTROL** + helper row |
| 4 | both doors label the after figure `sectionShapePhrase(before)` | 2 failed / 15 passed — INSERT, PROMOTE |
| 5 | `viewsEmitted` per-**band** arm returns `{ ok: false }` again | 2 failed / 31 passed — census + period row |
| 6 | `viewsEmitted` per-**act** arm returns `{ ok: false }` again | 6 failed / 27 passed — census + 5 pricing rows |
| 7 | the move note quotes `bganimSectionBytes(after)` as "current" | 2 failed / 15 passed — INSERT, PROMOTE |

Plants 3 and 5/6 are the ones that carry weight. **3** is the anti-caveat
control: without it, making the sentence unconditional would have been
invisible. **5 and 6** are the Half B census against both of `viewsEmitted`'s
arms separately, so the expensive multi-band half of the product is shown to be
doing work rather than padding a count.

On wording uniqueness: every string assertion pins a phrase containing a
**derived figure** (`${afterBytes}`, `${beforeBytes}`, `${twins}`), so none of
them can be satisfied by a neighbouring line that merely starts the same way —
which is the failure mode a gate in this repo has already shipped.

Full suite after the parcel, at `9e4be0f7`:
**519 files passed / 3 skipped, 7586 tests passed / 9 skipped.** All 9 skips are
pre-existing and environmental (foreground-gate file unset, `AURORA_BENCH`
unset, two live-emulator rows unset, the absent `s4_engine` tree, and the
sibling-root main-checkout row that cannot run in a linked worktree).

---

## What I did NOT establish

- **No CDP run.** Every change is to strings the node suite can read, and the
  one JSX edit is a comment. Nothing here is a visual claim, so no harness was
  built and none of this is evidence about what the panel looks like.
- **The panel's own shape phrases are still a second copy.** `sectionShapePhrase`
  gives the refusals one derivation; `BgAnimBandPanel.tsx` still renders
  `in the <strong>debug</strong> shape` as JSX, split around a `<strong>`, so the
  two can drift in wording (not in truth — both read `twinsEmitted` /
  `bganimViewTwinBytes` from the same codec). Unifying them means either
  markup in the provider or a fragment-returning helper; I judged neither worth
  it for four words and left the seam named here instead of pretending it is
  closed.
- **Nothing measured against a live aeon build.** The twin arithmetic is aeon's
  formula as vendored in `bganim-consumer-contract.json`; I did not re-read
  aeon's tree at a revision for this parcel, and the `364b7bce` attribution is
  inherited from the codec's existing docblocks rather than freshly verified.
- **Reachability of the `!ok` arm is proved for `viewsEmitted`'s inputs, not for
  the type.** If a future producer of `BgAnimSizeResult` is added elsewhere, the
  census does not see it. The census asserts what today's producers do.
- **The move sentence's wording has had no reader other than me.** It is one
  long sentence in a refusal that is already five, and I argued above for why it
  earns its place; a cold read might still trim it.
