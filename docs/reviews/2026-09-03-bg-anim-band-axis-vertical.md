# The motion axis — Aurora's half of aeon's DoD item 8

*Branch `feat/ew-band-axis-vertical`. Commits `4b6fa93` (code), `df1efa8`
(obligations + aeon bake), `accf53d` (aeon's real emitter), plus this packet.
ROADMAP row 55.*

**What is new on screen for the owner:** a BgAnim band can declare
`axis: "vertical"` and Aurora authors it end to end — the Axis picker, the
column-wise shift-fill, the preview, the art composer, the agent verbs. This is
his own 2026-08-27 ask, and it is the first vertical background motion the
editor can produce.

**What is NOT proven here:** that it MOVES on screen. That is the overseer's, in
the foreground, with the emulator. This parcel's ceiling is: correct bytes,
through aeon's own guard AND aeon's own emitter, at a pinned revision.

---

## 1. Grounding

aeon's engine half landed 2026-09-02. Everything Aurora transcribed was read at

    git -C <aeon> show 3a4712faa920100653669c1ec3fc26c2da71ef68:tools/EFFECTS_CONSUMER_CONTRACT.md
    git -C <aeon> show 3a4712faa920100653669c1ec3fc26c2da71ef68:tools/inject_editor_bg.py

— never through the sibling working tree, which is another lane's live checkout.
`bg-anim-band-axis-aeon-gate.test.ts` re-checks that the pin is still an ancestor
of aeon's `origin/master` and **fails rather than skips** if it is not: a pin that
has left aeon's history means the contract was transcribed from a commit that no
longer exists, and every derivation in this parcel needs re-reading.

## 2. ROADMAP row 55's caution was wrong, and the correction is the interesting part

Row 55 (2026-08-27) guessed:

> `bandColumnBytes`' power-of-two constraint exists because *the runtime rotates a
> whole column by shifting it*, which is the exact mechanism a vertical band would
> have to replace — so the rows/cols legality rule is likely to change shape, not
> just gain an axis. […] the first question for them is whether a vertical shift
> can reuse the column rotate at all or needs a different DMA shape.

The answer is **reuse, exactly, with no engine byte moved.** aeon's own block says
why, and it is worth restating because it is the thing a reader will otherwise
re-derive wrong: `BgAnim_Update` never learns which way a band moves. It reads a
step off a scalar, picks bank `step & 7`, and rotates the band's byte image by
`(step >> 3) << col_shift`. Both fields are **units**:

| field       | what it actually is                                    |
|-------------|--------------------------------------------------------|
| `col_shift` | log2 of the ROTATION UNIT in bytes                     |
| `step_mask` | the pattern PERIOD in px, minus 1                      |

So the legality condition is the same on both axes — `units * unit_bytes ==
tile_count * 32` — and the power-of-two rule **keeps its shape and changes which
key it lands on**:

| axis       | rotation unit | period    | slot order                     |
|------------|---------------|-----------|--------------------------------|
| horizontal | `rows * 32`   | `cols * 8`| column-major `base + c*rows + r` |
| vertical   | `cols * 32`   | `rows * 8`| **ROW**-major `base + r*cols + c` |

What forbade vertical until 2026-09-02 was not the DMA: it was two asserts that
spelled the horizontal reading of those two fields as if it were the only one.

## 3. The three writer obligations — how each is enforced, and by which named row

aeon's contract states outright that the consumer **cannot check** these. They
are the parcel.

### 3.1 Slot order

`bandCellSlot` / `bandSlotCell` in `src/core/formats/bg-override/bg-override.ts`
are now the ONE pair, and the four surfaces that turn a band into a grid all go
through them — they each spelled `c*rows + r` separately before:

- `shiftedPhaseBanks` (the fill)
- `bandSlotSource` (the preview's DMA model)
- `bgArtCellAtlasIndex` (the art composer's atlas)
- `bankThumbnail` (the bank strip)

**The aim was the hard part.** Column-major and row-major emit the SAME SET of
slots, the same COUNT, and the same multiset of pixels. Any assertion over a set,
a count, a sum or a checksum is vacuous *by construction* and would go green
forever on a band the ROM shows transposed. Every real row therefore names a
POSITION, derived from the two formulas as the contract writes them.

Named rows: `places named cells at the slots the contract's two formulas name`,
`is a bijection onto the band's slots …`, `the preview's DMA model reads the same
order the fill writes`, `the art composer's atlas index and the bank thumbnail
read it too`.

### 3.2 The eight phases are translations along the declared axis

`shiftedPhaseBanks` rolls x within `cols*8` on a horizontal band and y within
`rows*8` on a vertical one. **The axis is not a parameter of it** — it is read off
the band, so there is no way to ask for the horizontal arm on a band that declares
vertical, which is the one case aeon refuses. `regeneratedShiftPhases` (the panel's
Shift button, the agent's regenerate verb) takes a whole band, so the same is true
of the regenerate path — which is where the accident actually lives: open a
vertical band, edit phase 0, press Shift.

Named rows: `rolls x on a horizontal band and y on a vertical one, at named
pixels` (asserts the WHOLE pixel plane against the axis's translation),
`a vertical band's banks are NOT horizontal translations of bank 0`, `the axis is
READ off the band, so there is no way to ask for the other arm`, `the Shift
REGENERATE reads the band's axis too`, `a phase-0 edit followed by Shift stays
vertical`.

### 3.3 `axis` survives a round trip

The key is optional on the band type and the codec never writes a default it was
not given; the serializer's total-reorder check already refuses to drop any key.
The read model reports `axis` AND `axisIsExplicit`, and so does the agent's
`list_bg_anim_bands`, so an agent editing a band cannot write today's default into
a file that was tracking the contract's — nor drop the key off a band that DOES
claim vertical, which is what blinds obligation 2's guard.

Named rows: `is written, re-read, and re-written unchanged`, `survives an edit to a
DIFFERENT key — the case the guard cannot see through`, `is never injected into a
document that did not spell it`.

## 4. Red-first evidence

Five defects planted **from a clean committed tree**, each shown on disk with
`git diff -U0` before its run, each restored with `git checkout --` on a tree with
nothing else uncommitted. Counts are over the two axis files (27 rows).

| plant | mutation (quoted from the diff) | red |
|---|---|---|
| `slot-order` | `- return bandIsHorizontal(band) ? col * band.rows + row : row * band.cols + col;`<br>`+ return col * band.rows + row;` | **20 / 27** |
| `phase-axis` | the `srcX`/`srcY` ternaries → `srcX = (col*8 + px + roll) % (cols*8); srcY = row*8 + py` | **2 / 27** |
| `pre-parcel` | the whole fill body → column-major slots AND an x roll: the writer this repo had *before* the parcel | **4 / 27**, incl. **aeon's own guard** |
| `round-trip` | `- if (spec.axis !== undefined) band.axis = spec.axis;` | **13 / 27** |
| `period` | `- return band[BAND_AXIS_PERIOD_KEY[bandAxis(band)]] * TILE_WIDTH_PX;`<br>`+ return band.cols * TILE_WIDTH_PX;` | **14 / 27** |
| `unit` | `- return BAND_AXIS_UNIT_KEY[bandAxis(band)] === 'rows' ? bandColumnBytes(band) : bandRowBytes(band);`<br>`+ return bandColumnBytes(band);` | **4 / 27** |

The `pre-parcel` plant is the one that matters most, because it is not a
hypothetical: it restores exactly what Aurora's shift-fill did yesterday. Under it
aeon's own guard, executed, said:

> band 0 declares axis "vertical" but every phase is an exact HORIZONTAL
> translation of phase 0 (32px pattern) and none is a vertical one. Its banks were
> regenerated by a horizontal-only writer (aurora's shift-fill; the column-wise
> twin is aurora ROADMAP row 55 and is not built).

## 5. What was proven about the bake

`test/formats/bg-anim-band-axis-aeon-gate.test.ts`, 7 rows. aeon is materialised
with `git archive <pin> tools project.json games/sonic4/{vram,map}.toml` into a
temp directory the test owns; **aeon's checkout is only ever read.** A probe script
written into that directory imports `inject_editor_bg` and reports back as JSON.

Against the document Aurora's **real promote door** produces (the `roomy`
generator output, a 4x8 vertical band, `phaseFill: 'shift'`, `driver: camera_y`):

1. `band_axis_geometry` derives `unit_bytes = cols*32`, `period_px = rows*8` —
   both asserted derived, and both asserted NOT to be the horizontal readings.
2. `validate_band_phase_axis` **admits** it.
3. The same band with horizontally-filled phases is **refused by name**.
4. The same art declared horizontal is **admitted** (the guard is narrow, not
   merely loud).
5. `inject_editor_bg.main()` — the real emitter — writes the four generated files
   and the 44-byte record:

       // band 0: 32 tiles at BG slot 0, driver camera_y, vertical (scrolls up), 1px per 4 units
       data _BgAnim_Band0_hdr: [u16; 6] = [1, 2, 63, 7, 32, $8000]

   `step_mask = 63 = rows*8 - 1`; `col_shift = 7`, and `1 << 7 = 128 = cols*32`.
   The same art declared horizontal emits `step_mask 31` and `col_shift 8`. Both
   asserted derived from the authored geometry and both asserted NOT to be the
   other axis's reading — one band, one geometry, two records, differing exactly
   where the axis says.

aeon's own `tools/test_bg_emit.py::TestBgAnimMotionAxis` was also run by hand from
the same materialised copy: **13 tests, OK**, confirming the guard is green at the
pin independently of anything Aurora did.

## 6. The non-discriminating row, disclosed

`ANTI-VACUOUS CONTROL: the two orders are indistinguishable by set and by count`
asserts that `h.length === v.length`, that the sorted slot lists are equal, and
that the sums are equal. **Those three assertions rule out nothing about the
code** — they are true of any two orderings of the same slots, forever, and they
are in the file as a live demonstration of the trap rather than as coverage. The
row's trailing `expect(h).not.toEqual(v)` is the only half that discriminates, and
it does: the row goes red under the `slot-order` plant.

Two further honest limits on discrimination, found by the plants rather than
assumed:

- `a vertical band's banks are NOT horizontal translations of bank 0` reddens
  under `phase-axis` but **not** under `pre-parcel`, because with column-major
  slots the plane this row reads is garbled rather than a clean horizontal roll.
  The two plants cover each other; neither alone would.
- aeon's guard reddens under `pre-parcel` but **not** under `phase-axis` alone.
  That is aeon's guard being precisely as narrow as its docstring says: it catches
  a *horizontal-only writer* (column-major slots **and** an x roll), not any x roll
  under a vertical declaration. Worth knowing before anyone treats it as a general
  axis check.

## 7. The vendored contract — a DERIVATION, not a blob copy

Established before touching it: `bganim-consumer-contract.json` is **not** pinned
to an aeon blob. `bg-override-contract-drift.test.ts` hashes OUR text, and the
file's own `$comment` says every value was *read out of* aeon source rather than
copied. (Contrast `effects-schema-drift.test.ts`, which pins empyrean's schema by
git **blob** hash — that one is a copy and is re-vendored by extraction.)

So this was updated **as source**, re-read at aeon `3a4712fa`, and the file now
carries an `amendments` array recording the revision, the documents, and — the
part that matters — **what this amendment did NOT re-derive**:

> SCOPE: this amendment re-derived the AXIS half only. Two values in this file were
> read at the 2026-08-22 commit and were NOT re-vendored here, and one of them has
> MOVED IN SHAPE at this revision — see `outputDir.note`.

**The disclosed drift.** At `3a4712fa` the injector's act is a PARAMETER:
`BgActNames.out_dir()` derives `games/sonic4/data/generated/<zone_id>/<act_id>` and
`override_path()` derives the input file, both from `project.json`'s zone/act
indices. Both vendored literals **still hold for the default act** — a
`LEGACY_OVERRIDE_ACT = ('ojz', 'act1')` special case keeps that one act on the
un-suffixed `editor_bg_override.json` — so nothing in the codec is wrong today.
What changed is the KIND of fact: the act binding is no longer two hardcodes but
one hardcode against one derivation, and a project whose first act is not
`ojz/act1` would break the match. Recorded in `outputDir.note` rather than silently
corrected, because a stale citation is worse than a stale value. **Re-vendoring
that half is its own parcel.**

Two invariants were RENAMED, and the drift gate asserts the old names are gone:
`columnBytesPowerOfTwo` → `rotationUnitPowerOfTwo`, `patternWidth` →
`patternPeriod`. Both now read off a different band key per axis, so a name saying
"column" or "width" states the horizontal reading as if it were the only one —
exactly the class of stale rule this parcel went looking for.

## 8. The retired rule, and where it was hiding

*"Every band moves HORIZONTALLY"* was true until 2026-09-02 and is now false. A
surface still saying it teaches a limit the product does not have. Nine live sites
moved with the code; the two named in the dispatch were the first two:

1. `bg-override.ts` — the driver refusal message
2. `BgAnimBandPanel.tsx` — the driver tooltip (**and** a second one on the card,
   **and** the file's `THERE IS NO VERTICAL BAND, AND THE PANEL SAYS SO` docblock,
   **and** the empty-state hint)
3. `bganim-consumer-contract.json` — the `drivers` `$comment`
4. `bg-anim-aeon.ts` — the file header's rule 2, and every `driverOptions()` title
5. `bganim-preview.ts` — `bandIsTimeVarying`'s docblock
6. `BgAnimPreviewRenderer.ts` — the rAF-gating comment
7. `agent-handler.ts` — the standing `note` on every `list_bg_anim_bands` reply
8. `editor-methods.ts` — the MCP method descriptions (two of them)
9. `bg-anim-art.ts` (×2, core and provider) — "column-major pattern"

The drift gate now asserts the sentence is **absent** from the vendored comment
rather than merely that a new one is present: the failure mode is an old sentence
surviving beside a new one. Historical records (`docs/reviews/2026-08-22-…`,
`docs/superpowers/plans/…`) were left alone — they are dated findings, not
teaching surfaces.

A pre-existing gate caught four of my own new strings saying "band" in
user-visible text (`band-vocabulary.test.ts`: the product word is *tile
animation*). Reworded.

## 9. BLOCKED, and what it blocks

**No ROM was built.** `printenv SIGIL_BUILD` and `printenv SIGIL_EMIT` are both
unset in this agent worktree, and aeon's `build.sh` makes each a hard error
(`build.sh:267`, `:393`). Per the standing rule that is a BLOCKED report and not a
workaround hunt — I did not go looking for a binary to point them at, and I did not
write into `../aeon`, which a real build would have required (`editor_bg_override.json`
is an input to the build's mtime staleness gate).

What that leaves un-proven: only that the emitted module assembles and places
inside the ROM. The bytes themselves are proven — aeon's own emitter wrote them,
under its own section-ceiling check (`ojz_bg_anim 8238/12288 B`).

**The on-screen proof is the overseer's**, in the foreground: a vertical band
actually stepping upward in the running game. No emulator MCP tool was touched.

## 10. Left open

- **The on-screen proof** (overseer, foreground) and **a ROM build** (blocked, §9).
- **Aurora cannot PLACE a band as a rectangle**, on either axis. The promote door
  declares an existing static range animated and inherits whatever cell-to-tile
  mapping `layout` already had. So obligation 1 is enforced over Aurora's four grid
  readers, not over the author's picture — and the `roomy` document's blob is
  emitted row-major over the plane with dedup, so a contiguous range is not a clean
  rectangle there in either order. **Not introduced by this parcel** (it is equally
  true of the shipped horizontal arm) but it is the gap that would make a vertical
  band easy to author correctly rather than merely possible.
- **`band-strip-range.ts`'s dragged range is horizontal-only** — it reads
  `rowChoices()`, which is now `rotationUnitChoices(BAND_AXIS_DEFAULT)`. Correct
  as it stands (it authors no axis, so it makes horizontal bands), but the drag
  surface does not offer the new axis.
- **Re-vendoring the act-binding half of the contract** (§7).
