# The box is right. The ATOM was wrong.

**Row** EW-LAYER-CARD-SCROLLER, project EFFECTS-W1.
**Branch** `parcel/layer-card-height` - 2026-09-05

The row arrives as *"a 163.5px sentence in a 149.5px box"*.
`docs/reviews/2026-09-05-plane-y-referent.md` had already rewritten that once,
to *"a box that no advisory of ordinary length fits"*. **Both readings are
wrong, and so is every citation either of them gave for the box.** What follows
is measured on a running app.

---

## 1. Neither citation for the box named the thing that governs it

| what was cited | what it actually is |
|---|---|
| "a ~150px box (**column-layout's LIST floor**)" - the review, and the same words in `plane-y-referent-capture.mjs` row [6d] | `column-layout.tsx` **declares no floor**. Its only `154` is a **WIDTH**, in a prose comment, about a select falling to 154px against generated ladder rungs needing 157px and 159px. |
| `maxHeight: 154` on `SCENE_LIST` and `PRESET_LIST` | the **scene picker** and the **preset picker**. Neither is an ancestor of a layer card. |

The box is the **body of the `aeon.effects.layers` section**, and its height
comes from `LIST_SECTION` in `ui/CollapsibleSection.tsx`:

```
flex: '1 1 0', minHeight: SECTION_LIST_MIN_HEIGHT /* 160 */, maxHeight: 'max-content'
```

So `harness:layer-card-height` does not cite the box at all. It **walks outward
from a sentence an author is reading** and prints every level of the chain with
its own computed overflow / height / flex / min-height / max-height, which is how
both citations were found to be wrong rather than argued to be.

---

## 2. The measurement

Window **1400x872**, the app's own default. (The xvfb screen is 1680x1050 and is
not the window; a run that reported the screen would be 280px out.)

### The box, and the column it lives in

```
box        the layers SectionBody: 149.47px, client 149, scrollHeight 4371,
           overflow-y auto, a real 15px scrollbar
section    180.47px, flex 1 1 0, min-height 160px, max-height max-content
column     742px, and its SEVEN children sum to 742.00 EXACTLY:
             147.53  the sub-tab + section strip
             107     a column-wide notice
             153     Scenes
             180.47  Layers          <- the only grow item
              31     Scene (collapsed)
              98     Section assignment
              25     Properties
```

**There is no spare pixel, and no cap is holding the section back.** Relaxed one
at a time on the live element and put back (`[5a]`):

| relaxed | box afterwards |
|---|---|
| the section's `max-height: max-content` -> `none` | 149.47px (**unchanged**) |
| the section's `flex-basis` -> `auto` | 149.47px (**unchanged**) |
| the body's `flex-grow` -> `1` | 149.47px (**unchanged**) |

And the section sits at 180.47px, **above** the 160px floor (`[5b]`), so the
floor is not squeezing this column either. **Raising it would only push the
column into its own scrollbar** - and `effects-sub-tabs-harness` `[4b]` asserts
the Parallax tab does not scroll on arrival, so that change is red before it is
even a design question.

### The census: 34 prose blocks, height beside character count

`Hint` is identified by its own `overflowWrap: 'anywhere'`, which column-layout's
docblock says the label column deliberately does not have.

| height | chars | count | what |
|---|---|---|---|
| **165px** | 355 | 1 | `layer-2-rowremap-reach` |
| **165px** | 333 | 1 | `layer-2-rowremap-precondition` (nothing to vary) |
| 82.5px | 146..165 | 18 | ordinary hints |
| 49.5px | 89..99 | 14 | short hints |

**32 of 34 fit.** The two that do not are the same feature's, at twice the
panel's own ordinary block length. The prior review generalised from a sample of
two that happened to be adjacent on one row, and both members of the sample were
the row remap's.

> ⚠ **The first version of this census could not see an `Advisory` at all.** It
> filtered out anything containing a control, and an Advisory renders its "why
> this happens" disclosure as a `<button>` **inside** the hint - so a census
> written that way would have gone green after the fix while the tallest blocks
> on screen were the ones it could not count. Row `[1c]` now asserts the
> predicate can see a folded hint.

---

## 3. The design call

**THE BOX NEEDS NO NEW GOVERNOR.** It is already governed correctly, by the
column, and section 2 is the proof: every pixel is spoken for, no declaration is
binding, and the floor is not engaging. There is nothing to tune. "Make the box
bigger" is not a small fix here, it is not available.

**WHAT WAS MISSING IS A BAR ON THE ATOM.** A scroller is a legitimate device
while every **indivisible** block inside it fits, because the author can bring
the part they want into view. It stops being one the moment a single paragraph is
taller than the box: then **no scroll position shows that paragraph whole**, and
the reader has to hold its top half in memory while fetching the bottom. The
list's atom stopped being a 24px row when prose moved into it, and nothing
noticed.

**AND THE BAR IS NOT TODAY'S BOX.** `flex: 1 1 0` makes 149.47px a fact about
this window. The shell's floor is the standing promise about the least a list
section may be squeezed to, so

```
SECTION_LIST_MIN_HEIGHT (160) - this section's own header (31, measured; it
carries an Add button) = 129px
```

is the smallest box any block in that list can ever be given, and that is the
bar. A bar keyed to the box on screen passes on a tall window and is wrong on a
short one; a bar keyed to a character count rots the day someone writes a longer
sentence.

### What was rejected

| rejected | why |
|---|---|
| raise `SECTION_LIST_MIN_HEIGHT` | the floor is not engaging here (180.47 > 160), so raising it only makes this column overflow, and it lands on every facet: aeon Layout's Sections list is standing **on** that floor right now. `effects-sub-tabs` `[4b]` goes red. |
| a per-section floor for the layers list | same overflow, always on, and `panel-scrollers.test.ts` forbids the other spelling: a body whose `minHeight` is not `0` stops counting as column-bounded and reads as an unbounded scroller. |
| make Layers a `content` section so the column scrolls | that is the 954px overlap defect the whole `variant="list"` model exists to prevent, in its other costume: 4251px of cards pushing Section assignment and Properties below the fold. |
| shorten the two sentences | the review already did that once (470 chars to 355) and it did not fix anything; the block was still 165px. Deleting words to fit a box is how an advisory becomes decoration. |
| split each into two hints | `row-remap-span.ts` argues against it in its own comment: the reach is one inequality at two magnitudes, and stacking "does nothing" under "does less than asked" reads as two problems where there is one. |

### The fix is the project's own ruling, applied where it had not reached

O15 (`docs/reviews/2026-08-30-o15-advisory-shape.md`, and the block in
`providers/effects-aeon.ts`) already decided the shape for prose of exactly this
kind, on the **scene** surface, after a 460px advisory pushed five controls below
the fold:

> the three parts do three different jobs - DIAGNOSIS, MECHANISM, REMEDIES - and
> the remedies are LAST in the composed sentence. So any length-based truncation,
> any "show more" that slices at a character count, hides precisely the part an
> author acts on and keeps the part they can skip.

That ruling had never reached the layer card. Now it has:

- `rowRemapReachAdvisoryParts` (`canvas/row-remap-span.ts`)
- `rowRemapPreconditionParts` (`providers/effects-aeon.ts`)

For the preconditions the split needed **no new editorial judgement at all**:
every one of those messages was already written as a finding followed by
`The contract: "..."`, and the quote is the mechanism in O15's sense.

`Advisory` gains optional `mechanism` and optional `remedies`. That is **not**
the inversion O15 forbids: the ruling is that a remedy which *exists* may never
be the hidden half, not that every advisory has one. Spelling those cases as `''`
drew an empty paragraph and, worse, **a disclosure button with nothing behind
it** - a control that lies about having something to show.

`Hint` and `Advisory` also gain a `testid`, on the hint **root**.
EffectsScenePanel's own comment records that `data-testid` passed to `<Hint>` is
silently dropped and that a harness once read zero nodes for sentences visibly on
screen; the workaround was a wrapping `<span>`, which marks the **text**.
Anything measuring a block against its box has to address the **block**.

### Measured after, same run, same window

| | before | after |
|---|---|---|
| reach | 165px | **119.5px**, folded, cut 0px, bottom **inside** the box |
| precondition (nothing to vary) | 165px | **86.5px** |
| precondition (no anchor) | 82.5px | 86.5px (the disclosure costs ~4px) |
| box scrollHeight | 4371px | 4251px |

Bar 129px. `[2a]` and `[2b]` green.

---

## 4. What the DOM admits, and what it hides

This is **not** the width axis one file over, and the difference is worth having
written down. There, a select "does NOT wrap and does NOT overflow. It ellipses,
and `scrollWidth` is clamped, so nothing about the element afterwards admits that
anything was cut."

**THE CONTAINER ADMITS BEING CUT, to script and to the eye** (`[3a]`):
`scrollHeight` 4371 against `clientHeight` 149, and a **15px scrollbar is
drawn**. An author can see that the list continues.

**THE BLOCK ADMITS NOTHING.** Scrolled to `block: 'start'` on the pre-fix build,
the reach sentence was cut **14.03px** short of the box bottom while:

- `checkVisibility()` returned **true**
- `getClientRects().length` was **10**
- its own `getBoundingClientRect().height` was 163.5 whether or not any of it was
  on screen

So the signal the DOM does give is about the **container**, and it is the same
signal for "there are more controls below" as for "the paragraph you are reading
is cut in half". Nothing anywhere says **which** of the 34 blocks is the one
being cut. That asymmetry is why the fix is a bar the content must meet rather
than an overflow affordance: an affordance built on the container's signal could
not point at the block.

`[3b]` also records the reachability half separately:
`scrollIntoView({block: 'start'})` does put the block's top inside the box, so a
block that still does not fit is a **reading** problem and not a reachability
one. (`block: 'center'` on an oversized block puts the top **above** the box -
the one position an author cannot begin reading from.)

---

## 5. The second facet, which did not exist for this axis

`SECTION_LIST_MIN_HEIGHT` is **not this panel's number**. It lives in
`ui/CollapsibleSection.tsx` and every facet with a `variant="list"` section stands
on it.

The width axis has this written down as a scar: `LABEL_W` 64 -> 100 measured green
on `effects-column-harness` 25/25 and **broke three controls on the panel next
door the same day**, which is why `anchor-authoring-harness` `[W0]`/`[W1]`/`[W2]`
exists and why "the two must both be run before this number moves".

**Nothing was the `[W0]` of the HEIGHT axis.** Every instrument that reads this
floor reads it in the effects column: `effects-column-harness` r9 derives it from
the rendered element, `effects-sub-tabs-harness` `[4a]` reads it from source. The
only harness that looks at other columns, `section-column-harness`, measures the
four **non-facet** surfaces, whose sections are all `variant="content"` - so the
floor never engages there at all.

Rows `[4l]`/`[4r]`/`[4o]` are that second measurement, and they paid immediately:

| facet | list section | box | header | on the floor? |
|---|---|---|---|---|
| Layout | Sections | 135 | 25 | **YES, 160 = 160** |
| Rings | Ring Patterns | 353 | 25 | no (378) |
| Objects | Objects | 195 | 25 | no (220) |

**aeon Layout's Sections list is standing on the floor right now.** A floor moved
for the effects column lands on a column that is already at it, which is the
strongest single argument in section 3's rejection table and it is a measurement
rather than a worry. It also shows the **header is not a constant**: 25px there
against 31px in the layers section, which carries an Add button. The bar is
therefore derived per section, never typed.

⚠ **Those three rows are vacuous on their prose half and say so.** Every list
section outside effects rendered **zero** prose blocks (`blocks: []`), so what
they check today is the floor and the shape. They are the instrument, not a
finding: the day a chunk grid or an object list grows a hint, they are already
watching.

---

## 6. Gates

### The harness

`npm run harness:layer-card-height`, registered in `package.json` in the same
commit as the file. Run root printed and refused on borrowed.

| | |
|---|---|
| RED, at commit `f63e396` (the pre-fix build) | **12/15**: `[2a]` box 149.47 with two 165px blocks over it; `[2b]` bar 129 with the same two; `[1c]` no Advisory in the layers list to see |
| GREEN, after the fix and a rebuild | **15/15** |

⚠ **`dist/` is what the app loads.** Both runs are named against the build that
produced them; a probe taken before a rebuild reads the previous build and looks
exactly like "nothing changed".

### The node rows, and a correction to my own claim

The land commit said the byte-identity of the split was "gated" by the 32
existing rows over these two functions. **It was not, and poisoning found it.**

- The `joins back to exactly the sentence the one-string form returns` row is a
  **tautology**: both one-string functions are now *defined as* the join of their
  parts, so it passes on any wording. It is kept, and now says so, for the two
  assertions under it (no double space, no leading or trailing space).
- Every pre-existing row uses `toContain`, which is blind to a clause dropped
  **between** the fragments it looks for.

So each function got one **anti-loss** row whose expectation is independent of
the implementation: the reach's clipped arm is quoted from the plane-y review
(written off a running app before this parcel existed), its zero arm from the
pre-split source, and the preconditions from the run this test file's own
`console.log` printed before the split, with the quoted clause taken from the
contract constant rather than retyped.

**Six poisons, each shown on disk with `git diff -U1` before its red run, each
restored with `git checkout --` from the committed baseline on a clean tree:**

| poison | result |
|---|---|
| 1. the split made by POSITION: remedies swept into the mechanism (the O15 inversion) | **2 failed / 18 passed** |
| 2. the FINDING folded away: diagnosis cut back to the span alone | **1 failed / 19 passed** |
| 3. the naive template join, leaving a double space on the arm with no mechanism | **1 failed / 19 passed** |
| 4. the contract quote left visible, a plausible mechanism invented beside it | **1 failed / 33 passed** |
| 5. the fold became a CUT: one clause of the reach mechanism deleted | **2 failed / 19 passed** |
| 6. a precondition shortened rather than folded | **1 failed / 34 passed** |
| (restored) | **56 passed (56)** over both files |

Poisons 5 and 6 are the ones that matter for the correction above: in each, every
row that existed before this parcel stayed **green** while a whole clause was
gone.

### The row that had to change its bar

`plane-y-referent-capture.mjs` `[6d]` was a COMPARISON ("no taller than the
advisories already there") because no honest absolute existed. There is one now,
and the row reads it **off the DOM** (the section's computed `min-height` minus
its header) rather than from source, so it follows the shell if the number moves.

Its red-first came from the tree rather than a poison: on the pre-fix build the
same sentence measured 165px against the same 129px bar. And the comparison it
replaces would now go **red on a correct sentence** - both peers fell to 86.5px,
so "no taller than the neighbours" became stricter than the box, which is exactly
what a bar keyed to today's text does.

21/21 on this tree, with `OUT=` a scratch directory so the committed captures
under `docs/captures/2026-09-05-plane-y/` were not overwritten:

```
sentence 119.5px / 371 chars; bar 129px (floor 160px minus a 31px header);
box on screen 149.47px; precondition hints [{"h":86.5,"chars":350},{"h":86.5,"chars":181}]
```

The two peers are equal in height and 350 against 181 in characters, which is
what tells a consistent pair from a selector that resolved to one element twice.

---

## 7. Not touched, and why

1. **The shell floor.** Section 3's table, and section 5's measurement that
   another facet is standing on it.
2. **`SCENE_LIST` / `PRESET_LIST` (`maxHeight: 154`).** They are real and they
   are not this box. Both are pickers of one-line rows, which is what a 154px cap
   derived from `6*24 + 5*2` is for.
3. **The 107px column-wide notice and the 147.53px strip above Scenes.** They are
   the two largest non-section consumers of this column and reclaiming either
   would give the list real height. Different owners, and the parcel's finding is
   that height is not the variable.
4. **Every other advisory in the panel.** 32 of 34 fit the bar. Converting a
   block that fits buys a disclosure button with no clipping to prevent, and the
   `Advisory` docblock's own "scope, named rather than silently widened" section
   says to say so rather than widen quietly.
5. **The unlocked-scene arm, the emulator, any ROM.** No Aether socket was
   opened, nothing was built, no scene was saved; `AEON_DIR` was a disposable
   copy and is refused if it names the live checkout.
