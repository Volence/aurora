# The vertical word: what aeon's witness closed, and the one hop it did not

**Parcel:** `parcel/vertical-word-precision`, aurora.
**Date:** 2026-09-06.
**Shape:** this changes what our record CLAIMS. Not one byte of app behaviour moves,
and no author-facing string changes — see §5 for why that is the ruling and not a
default.

---

## 1. What was read, and where

Everything below was read out of aeon at a **committed revision**, resolved through
`test/support/sibling-root.mjs` (`AEON_DIR`), never through a typed path and never
through their working tree's live files.

| what | how |
|---|---|
| aeon revision | `f0aebbd39177f062df4d32e716156845238ffbf2`, *"merge(vertical band): a vertical BgAnim band is in a ROM and witnessed moving vertically"*, 2026-09-04 13:52:19 -0400 |
| ancestry | `git merge-base --is-ancestor f0aebbd3 origin/master` — **true**, re-verified in this parcel rather than taken from the brief |
| files (all **aeon**-relative, none of them ours) | `tools/bganim_vprobe_witness.py`, `tools/bganim_vprobe_gen.py`, `games/sonic4/vram.toml`, `tools/png_to_bg_override.py`, `games/sonic4/data/editor_bg_override.json`, `docs/DEFERRED_WORK.md` — all via `git show f0aebbd3:<path>` |

No emulator was called. No ROM was built. No probe was authored. Those are the
parcel's explicit non-goals and they stayed non-goals.

---

## 2. Aeon's four claims, checked against aeon's source

### 2.1 The y-roll predicate is a hard verdict gate — **CONFIRMED**

`is_yroll = img == roll_up(phase0, v_step)` is computed per sample and printed, and
it is *also* collected in the verdict block:

```python
bad = [r for r in v if not r["is_yroll"]]
if bad:
    fails.append(f"vertical arm: {len(bad)} of {len(v)} samples are not a y-roll of "
                 f"phase 0 (steps {[r['step'] for r in bad]})")
```

`run()` returns `(1, fails)` on any finding and `main()` returns that rc into
`sys.exit`. So it fails the run, naming the offending steps. Not a printed nicety.

Two neighbouring gates strengthen it and were not in the brief: the same sample is
required to equal `Band.predict(step)` — a prediction derived from the record read
out of the ROM image and from a reading of the proc, compared against live VRAM —
and the run refuses **UNMEASURABLE** rather than passing if the vertical and
horizontal predictions never diverged across its samples, so the negative arm can
never be silently unasked.

### 2.2 The `2s ≡ 0 (mod 32)` argument — **CONFIRMED, and it rests on one more thing than the brief said**

`bganim_vprobe_gen.py` sets `COLS = 2`, `ROWS = 4`, `H = ROWS * 8 = 32`,
`V_STEP_MASK = H - 1 = 31`, so steps run 0..31. A downward roll of `s` is the same
image as an upward roll of `32 - s`; the two coincide iff rolling by `32 - 2s` is the
identity.

**The step the brief skipped:** "rolling by `32 - 2s` is the identity" reduces to
`s ∈ {0, 16}` only if phase 0 has no smaller vertical period. That is not assumed —
the generator's `check_art()` **refuses** art whose `H` pixel rows are not all
distinct, and says why in its own message (*"some vertical roll is a no-op, so a
frozen band would pass the vertical predicate"*). So the argument is sound, and
aeon's source supports it more completely than aeon's account of it did. That is
the direction of error I would rather find.

### 2.3 The coarse-coverage gate guarantees the discrimination — **CONFIRMED**

```python
coarse = {r["step"] >> 3 for r in v}
want_coarse = vert.total_bytes // vert.unit_bytes
if len(coarse) < want_coarse:
    fails.append("UNMEASURABLE: ...")
```

`want_coarse` is derived from the record in the ROM: `total_bytes = tile_count * 32
= 256`, `unit_bytes = 1 << col_shift = 64`, so **4**. Coarse 1 is steps 8..15 and
coarse 3 is steps 24..31; neither range contains 0 or 16. A run that passes at all
therefore contains at least two direction-discriminating samples. The gate exists
for its own reason (the two-piece wrapped DMA is where an axis mistake shows), and
the discrimination guarantee is a free rider on it. Confirmed exactly as relayed.

### 2.4 The probe aims at a slot no plane cell references — **CONFIRMED, and I upgraded half of it from a claim to a measurement**

- `games/sonic4/vram.toml` `[[region]] name = "bg_region"`: `base = 1024`,
  `tiles = 448`, `band_reserve = 128`. So the reserve is slots 1344..1471, and
  `VPROBE_VRAM_DEST = (1024 + 320) * 32 = $A800` is its first slot. Two independent
  derivations (`448 - 128` and `1024 + static 320`) agree.
- **The "no other writer" half is measured by the witness itself** — arm 0 reads the
  destination twice twenty frames apart with nothing installed, requires it
  UNCHANGED, and requires it not to already match any of the 32 vertical
  predictions.
- **The "no plane cell references it" half is asserted in the docstring, not measured
  by the run.** I measured it: every one of the **4,096** layout words in
  `games/sonic4/data/editor_bg_override.json` at `f0aebbd3` indexes a tile in
  **0..319** (min 0, max 319). Nothing in the act's picture points at slot 320 or
  above, i.e. at absolute slot 1344 or above. Upstream, `tools/png_to_bg_override.py`
  **refuses** an import above `capacity - band_reserve` rather than truncating, so
  this is a build-time gate and not a coincidence of the current art.

---

## 3. Where aeon's account and aeon's source disagree

**Nothing material.** Three notes, in descending order of how much they matter:

1. **The brief understated §2.2** (see above): the `s ∈ {0, 16}` reduction needs the
   art's rows to be pairwise distinct, and the generator enforces exactly that. The
   account presented the arithmetic as self-standing. It isn't, but the missing
   premise is guarded, loudly, in the same file.

2. **The brief's second caveat is right about the mechanism and slightly wrong about
   the extent.** It says the witness "is not a claim about how an author's own art's
   bank order maps to a direction", and offers as the reason that the generator
   *builds* bank k as phase 0 rolled up by k, so the fine-phase direction is baked
   into the probe's own data. The first half stands. The reason is thinner than the
   conclusion: `is_yroll` compares live VRAM against `vert.banks[0]` — phase 0 as it
   actually sits in the ROM — at the **full** step, fine bits included, so a
   generator that had built its banks with the opposite sign would make the fine and
   coarse halves fight and turn the gate red at every step with a nonzero fine phase.
   The generator's own `bank()` docstring says precisely that. What is genuinely
   underived is not the sign but **the reference frame**: `decode_rowmajor()` *defines*
   which VRAM slot is which picture row, and "up" means "toward decreasing index in
   that decode". §4 is that, stated as the parcel asked.

3. **A coordinate, offered for the record and not as a correction to act on.** The
   brief cites `bganim_vprobe_gen.py:77-88` for COLS/ROWS and `:26` for the bank
   construction. Line 26 is inside the module docstring; the code is in `bank()`.
   Both facts are right. Our own rewrite cites by symbol, per the parcel's rule, so
   the coordinate does not propagate.

**One thing I found that the brief did not have, and it cuts in aeon's favour:**
Aurora's own producer already uses aeon's sign. `shiftedPhaseBanks()` in
`src/core/formats/bg-override/bg-anim-band.ts` derives a vertical band's bank k with
`srcY = (row*8 + py + roll) % patternPx` — the source row at `y + k`, content moving
toward decreasing y — which is exactly `bank()`'s `Pk = [P[(y + k) % H] ...]`. So for
any band **this app** authors with `phaseFill: 'shift'`, the fine-phase direction is
not an author's unknown at all; it is ours, and it is the one aeon measured. That
narrows caveat 2 to hand-authored or imported banks, which Aurora does not produce.

---

## 4. What is still underived, named precisely enough to go and measure

> **The link: band row order → what a viewer sees.**

Aeon established that the bytes at the band's VRAM destination are, at every sampled
step, phase 0 rolled toward **decreasing row index in a row-major decode of the
band's slots**. It did not establish that a viewer's *up* is that direction, because
the probe sits in the band reserve and **no plane cell references it** — §2.4, and
aeon's own file says the sentence it does not support is *"a vertical band was seen
on screen."*

To close it, someone needs: an act document whose **plane cells place the band's slot
`j` at grid position `(j // cols, j % cols)`** over a live, drawn vertical band, and
then either a frame capture across a step boundary or a nametable read proving the
cell order. That is an authoring change to the act's document, booked as aeon
EFFECTS-W1 item 8's on-screen half, and it is deliberately not this parcel.

**The asymmetry, which is the thing nothing in our source used to say.** The
horizontal word does not carry this gap — not because it was separately proven, but
because the 2026-08-26 run was performed on the act's **live** band, whose slots the
act's own plane cells do reference. The two axes are, for the first time, resting on
different evidence. Neither run photographed a screen; the difference is whether the
measured tiles are drawn by anything.

---

## 5. The ruling on the author-facing caption: **keep `up` unqualified**

Four surfaces carry the word today — `BAND_MECHANISM_HINT`, the panel's empty-state
`Hint`, the axis picker's `title` (via `axisOptions()`), and the canvas caption
(via `BAND_SCROLL_DIRECTIONS` through `bandMotion`). **None of them changes.** The
argument, rather than the default:

1. **The word is used in exactly the frame it was measured in.** What an author wants
   from "scrolls up" is *which way my art will travel relative to the art I drew*.
   That is a statement in the band's own row order — the frame aeon's witness
   measured. For the sentence's actual job, the word moved from derived to measured.

2. **The unclosed hop is not a band property; it is the definition of the coordinate
   system the caption is already speaking in.** Row-major slot order is what aeon's
   consumer contract §1.2 *requires* of a vertical band, and Aurora's
   `bandCellSlot`/`bandSlotCell` pair is the sole producer of it in this app. A hedge
   would be hedging the frame, not the fact, and an author has no action to take on
   it.

3. **The evidence moved one way and a hedge would move the text the other way.** The
   risk this caption guards against is *stating the wrong direction*. After
   `f0aebbd3` that risk fell. Adding a qualifier now would be the text getting less
   confident as the evidence got stronger, which is a defect in its own right.

4. **The cost lands on the wrong reader.** This lane has already ruled that a wall of
   caveats in front of a control is itself a defect. The hedge would have to appear
   on four surfaces, three of which are inside a 300px column that this same
   parcel-family spent two sittings getting to zero overflow. The reader who needs
   the precision is the next engineer deciding whether the word is safe to trust —
   not the artist deciding whether to draw a chevron. So the precision goes in the
   provider's block and in the test's recorded reasoning, which is where that reader
   already looks.

**Consequence for the guide gate:** none. `scripts/check-guide-text.mjs` asserts
quoted labels in `docs/guides/effects-first-run.md` against the components that
render them; the guide contains no scroll-direction claim (checked), and no rendered
string changed. The gate is in `npm test` and is green.

---

## 6. The flag, old and new

### Old (master)

```
// THE VERTICAL WORD IS NOT YET WATCHED. aeon's axis block states it from the
// mechanism — "bank k is phase 0 translated k px toward DECREASING coordinate …
// so an increasing driver scrolls a horizontal band LEFT and a vertical band
// UP" — and the LEFT half of that same sentence is the one already confirmed on
// the ROM, which is why `up` ships rather than an empty word: the two halves are
// one mechanism with one sign, and confirming one confirmed the sign. It is
// recorded here as DERIVED-FROM-A-CONFIRMED-MECHANISM, not as watched, so that a
// foreground run that contradicts it edits one constant and not a paragraph.

/**
 * The direction word each axis's motion sentence carries.
 *
 *   horizontal  CONFIRMED on the built ROM 2026-08-26 (bganim-band-status.test.ts).
 *   vertical    DERIVED from the same sign, aeon 3a4712fa; not yet watched.
 *
 * `''` on either arm drops the word, which is the shape the horizontal one
 * shipped in before it was confirmed.
 */
```

### New

Five headed paragraphs in `src/renderer/providers/bganim-preview-aeon.ts`, plus the
rewritten docblock. Read them in the file; what they say, in order:

- **THE VERTICAL WORD IS NOW WATCHED IN VRAM, AND THE TWO AXES REST ON DIFFERENT
  EVIDENCE** — names the upgrade and refuses to call it "confirmed" flat: it is
  confirmed *in one frame of reference*.
- **WHAT AEON MEASURED** — the witness by file and symbol (`Band.predict`, `run`,
  `main`), at revision `f0aebbd3`, the sixteen plateaux, the matched control, the
  UNMEASURABLE refusal. No line numbers anywhere.
- **WHY THAT DISCRIMINATES UP FROM DOWN INSTEAD OF MERELY DETECTING MOTION** — the
  `2s ≡ 0 (mod 32)` argument *including* its dependence on `check_art`, and the
  coarse-coverage rider.
- **AND OUR OWN PRODUCER USES THE SAME SIGN** — `shiftedPhaseBanks`, §3's finding.
- **THE ONE HOP THAT IS STILL UNDERIVED** — §4, and who closes it.
- Closing line: *"one constant per axis, so a foreground run that contradicts either
  edits a word and not a paragraph"* — the fix shape the old comment promised,
  preserved and now **pinned by a test** (§7) rather than only asserted in prose.

The docblock's two arms now read `CONFIRMED on the built ROM 2026-08-26, on the act's
LIVE band — plane-cell-referenced art` and `CONFIRMED in VRAM by aeon
bganim_vprobe_witness.py at aeon f0aebbd3, in the band's OWN row order, on a probe
band that no plane cell references.`

---

## 7. The assertions added, and their red-first proof

Three new assertions in two rows of
`src/renderer/providers/__tests__/bganim-band-status.test.ts`. **The vertical word had
no pin at all before this parcel** — the only direction assertion in the repo was
`BAND_SCROLL_DIRECTION` (the horizontal-only constant), asserted in two files. So
this is a gap closed, not a restatement.

| row | asserts |
|---|---|
| *says a vertical band scrolls UP…* | `BAND_SCROLL_DIRECTIONS.vertical === 'up'`, and that `bandMotion` composes `scrolls up · 1px per …` |
| *an axis with no measured word drops it…* | an axis absent from the table yields the identical sentence minus the word — which is what makes "edits a word and not a paragraph" true |

Neither row pins prose. Both pin the constant and the composed sentence, which are
unique to the rule under test; nothing matches a comment by prefix.

### Plant A — the direction itself

Mutation, quoted from `git diff -U0` on disk:

```
-  Object.freeze({ horizontal: 'left', vertical: 'up' });
+  Object.freeze({ horizontal: 'left', vertical: 'down' });
```

RED, both new rows, for the right reason:

```
× says a vertical band scrolls UP: measured in VRAM by aeon, in the band's own row order
× an axis with no measured word drops it, which is what keeps the fix one constant
AssertionError: expected 'down' to be 'up'
AssertionError: expected 'scrolls down · 1px per 4 frames · ≈15…' to be 'scrolls up · 1px per 4 frames · ≈15 p…'
   Tests  2 failed | 20 passed (22)
```

The horizontal *"says the art scrolls LEFT"* row stayed **green** under this plant,
which is the control: the two arms are independent and the plant hit only the arm it
was aimed at. Restored with `git checkout af3e1fa3 --` (a committed baseline);
`22 passed (22)`.

### Plant B — the fix shape, so the second row is shown to bite alone

Mutation, quoted from `git diff -U0` on disk:

```
-  const dir = word === '' ? '' : ` ${word}`;
+  const dir = word === '' ? ' (direction unmeasured)' : ` ${word}`;
```

RED, the fix-shape row only:

```
× an axis with no measured word drops it, which is what keeps the fix one constant
AssertionError: expected 'scrolls up · 1px per 4 frames · ≈15 p…' to be 'scrolls up (direction unmeasured) · 1…'
   Tests  1 failed | 21 passed (22)
```

The UP row stayed **green** under this plant, so the second assertion discriminates
something the first one does not — neither row is riding the other. Restored with
`git checkout af3e1fa3 --` (a committed baseline); `22 passed (22)`.

---

## 8. Verification

`npm test` (the whole chain: 14 gate scripts, `tsc --noEmit`, then `vitest run`).

```
Test Files  514 passed | 3 skipped (517)
     Tests  7471 passed | 9 skipped (7480)
```

Zero failing. The nine skips are the suite's standing, self-naming set (foreground
band-art gate without `AURORA_FG_GATE_FILE`, the opt-in bench, two live-warp rows,
two absent-`s4_engine` rows, and the sibling-root main-checkout row that cannot run
from a linked worktree) — none of them touched by this parcel. `check-guide-text`,
`check-cited-paths`, `check-doc-citations` and all four dash gates ran and passed.

---

## 9. Open items

1. **The on-screen hop** (§4). Aeon's, booked as EFFECTS-W1 item 8's on-screen half.
   Not ours to close and not this parcel.
2. `docs/reviews/2026-09-04-helpful-artifact-sweep.md` row 185 rules the old comment
   *"CORRECT AS-IS"* and says confirming it needs a ROM run that lane could not make.
   That is a dated review of a state of the world that has since changed; it is
   **left as written** rather than back-edited, on the rule that a review packet is a
   record and not a live claim. Anyone following it forward lands on the provider
   block, which now carries the newer state.
3. `docs/ROADMAP.md` row 55's *"Open: the on-screen proof, and a ROM build"* **was**
   a live claim, so it is amended in place: the ROM half is closed and it was aeon
   who closed it, the on-screen half is now the only open half, and the reason is
   stated with the measurement behind it.
