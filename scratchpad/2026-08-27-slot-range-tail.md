# item 54's tail — the four readouts the parcel named and did not fix

Branch `parcel/slot-range-tail`, off master `9b27869`. Sibling of
`parcel/slot-range-readouts` (item 54) and of `d7ec678` before it. The
convention is unchanged and was not re-opened: `slotSpanPhrase(base, count)` in
`src/renderer/providers/bg-anim-aeon.ts` stays the only place that decides what
a slot span is punctuated as, and what an EMPTY one is called.

## The four sites

Every quantity involved is a COUNT (`cov.range.count`, `range.count`,
`cols * rows`), so `base + count` is the FIRST SLOT PAST the range. Each of
these named it as the last one.

| # | site | before | after |
|---|---|---|---|
| 1 | `band-coverage.ts` `coverageSummary`, empty case | `no background cell draws slots 40..44` | `no background cell draws slots 40..43` |
| 2a | `band-coverage.ts` `coverageSubject`, band | `highlighted: the cells band 2 animates (slots 0..32)` | `highlighted: the cells band 2 animates (slots 0..31)` |
| 2b | `band-coverage.ts` `coverageSubject`, candidate | `highlighted: the cells a band at slots 34..42 would animate` | `highlighted: the cells a band at slots 34..41 would animate` |
| 3 | `band-strip-range.ts` `stripDragLabel` | `band 40..56 · 4x4` | `band · slots 40..55 · 4x4` |
| 4 | `band-strip-range.ts` `stripDragHint` | `band candidate · slots 40..56 (4x4) · from a dragged run of 16 slots` | `band candidate · slots 40..55 (4x4) · from a dragged run of 16 slots` |

`stripDragLabel` gained a `·` rather than reading `band slots 40..55`: the
helper carries the word "slots" itself and the noun would otherwise run into
the span. `stripDragHint` LOST its literal "slots" for the same reason — it
would have rendered `slots slots 40..55`.

Both strip readouts now go through one private `rangeSlots(outcome)` so
`cols * rows` is spelled once in the file.

## The zero/empty cases, each DECIDED

**`coverageSummary`** — `n === 0` is zero CELLS, a real result. Zero SLOTS is a
different fact that lands in the SAME branch, because an empty range covers
nothing and so always arrives with no cells. "no background cell draws no
slots" is true and useless, and a naive `- 1` renders `40..39`. So the empty
RANGE gets its own sentence:
`this range covers no slots, so no background cell can draw it`.
WHICH empty it is, is decided by comparing the helper's answer to
`NO_SLOTS_PHRASE` — not by a second `count <= 0` test that could drift.

**`coverageSubject`** — the empty phrase cannot be substituted: the candidate
sentence would read "a band at no slots would animate", and the band sentence
would claim cells are highlighted while naming none. Both kinds get
`highlighted: nothing — {band N | this candidate} covers no slots`. Reachable
at the type level: `SlotRange` is documented half-open, `bandCoverage` clamps
`Math.max(0, count)`, `rangeCovers` answers false for the whole of it, and
`setBandCandidate` takes an unvalidated patch.

**`stripDragLabel` / `stripDragHint`** — `cols * rows === 0` is UNREACHABLE from
`resolveStripDrag`, derived rather than assumed: `rowChoices()` enumerates from
`rows = 1` and an illegal `rows` is refused before the range branch, while
`cols = min(max(1, floor(runLength/rows)), maxCols)` with `maxCols < 1` already
refused — both factors are at least 1. A sweep row measures this over
2,000+ drags. NO GUARD WAS ADDED: `StripDragOutcome` is exported and both
readouts are total over it, so a hand-built degenerate outcome is reachable, and
`slotSpanPhrase` already answers `no slots` for it — which both sentences stay
grammatical around (`band · no slots · 0x4`). A guard here would be a second
opinion about what an empty range is called.

## NOT touched, on purpose

* the half-open COVERAGE arithmetic — `rangeCovers`, `slotRange`,
  `bandCoverage`'s `perSlot` walk. A `- 1` pushed into any of those would make
  every readout right and every painted cell wrong. Pinned by a row.
* the strip's SNAPPING/CLAMPING — `runEnd - staticBase + 1` (inclusive run) and
  `floor((blobTileCount - staticBase) / rows)` (exclusive bound). Pinned by a row.
* `src/renderer/providers/tile-picker-source.ts:161` (`tilePickerBandLabel`) —
  CONFIRMED already correct: `const last = g.slotBase + g.cols * g.rows - 1`.
  It inlines the arithmetic instead of calling the helper, so it is a second
  SPELLING of the convention even though it renders the right answer. Left
  alone per the parcel's scope; a candidate for a later sweep.

## Rows re-cut because they PINNED the defect

Four existing assertions asserted the wrong answer as the intent:

* `band-coverage.test.ts` — `.toBe('no background cell draws slots 40..44')`
* `band-coverage.test.ts` — `toContain('slots 0..32')`, `toContain('slots 34..42')`
* `band-strip-range.test.ts` — `toContain('40..56')  // base .. base + cols*rows`

All four now derive the boundary by WALKING `rangeCovers` (`lastOwnedSlot`), a
different module that is half-open by design and is what the lens actually
consults. Deriving through `slotSpanPhrase` instead would have moved with the
poison and stayed green — measured below.

## Red-first (runner: `npx vitest run <file>`)

| poison | rows red | quoted |
|---|---|---|
| site 1 restored verbatim | 3 | `expected 'no background cell draws slots 40..44' to be '… 40..43'`; `expected 'no background cell draws slots 40..40' to be 'this range covers no slots, …'`; sweep `expected [ Array(1) ] to deeply equal []` |
| site 2 restored verbatim | 4 | `expected '…band 2 animates (slots 0..32)' to be '… (slots 0..31)'`; `'…a band at slots 34..42…' to be '…34..41…'`; `'…band 2 animates (slots 34..34)' to be 'highlighted: nothing — band 2 covers no slots'`; sweep reports `[ '..${range.base + range.count}' ]` |
| site 3 restored verbatim | 4 | `expected 'band 40..56 · 4x4' to be 'band · slots 40..55 · 4x4'`; `expected 'band 336..340 · 1x4' to contain '336..339'`; `expected 'band 40..40 · 0x4' to be 'band · no slots · 0x4'`; sweep `expected 2 to be greater than or equal to 3` |
| site 4 restored verbatim | 4 | `expected 'band candidate · slots 40..56 (4x4) …' to contain 'band candidate · slots 40..55 (4x4)'`; `… 'band candidate · slots 336..340 (1x4)…' to contain '336..339'`; `… to contain 'band candidate · no slots (0x4)'`; sweep `expected [ Array(1) ] to deeply equal []` |
| `slotSpanPhrase` ITSELF back to `base + count`, zero guard deleted | 9 | every readout row above, incl. `expected 'band · slots 336..340 · 1x4' to contain '336..339'`. THE POINT: expectations derived from `rangeCovers` do not move with the helper. |
| all four reverted, calls left ONLY in comments | 10 | see below |

### The comment false-green, measured

The previous parcel's rows went green with three readouts poisoned because
`slotSpanPhrase(…)` still appeared in a COMMENT. Both sweeps here strip comments
first. Measured under the "calls left only in comments" poison:

```
band-coverage.ts    /slotSpanPhrase\(/  UNSTRIPPED: 2  PASSES (>= 2) | STRIPPED: 0  FAILS
band-strip-range.ts /rangeSlots\(/      UNSTRIPPED: 6  PASSES (>= 3) | STRIPPED: 1  FAILS
```

Without the strip both anti-vacuous positives are satisfied by comments alone.
(Neither module carries a `://`, so eating `//` to end-of-line takes nothing but
comments — checked.)

## Alternative green-paths ruled out (bar 2c / 2d)

* **A shared phrase across two messages.** `bganim-preview-aeon.ts:337` also
  says "no background cell draws its slots". The `coverageSummary` rows assert
  the WHOLE sentence with `toBe`, so that verdict string cannot satisfy them.
* **Label satisfied by the hint, or vice versa.** `band candidate ·` occurs at
  exactly one non-test site in `src/` (grepped: `band-strip-range.ts:319`); the
  label opens `band · `. The label row is a whole-string `toBe`.
* **Band sentence satisfied by the candidate sentence.** Both `coverageSubject`
  rows are whole-string `toBe`, and the two forms share no span-bearing
  substring (`animates (` vs `a band at `).
* **The wrong branch running.** Each empty-case row asserts the precondition
  first (`cov.cells` is `[]`, `rangeCovers(empty, base)` is false,
  `r.kind === 'range'`), so a green cannot come from the parts-join branch or a
  refusal.
* **Vacuity.** The boundary row asserts `staticBase + cols*rows === blobTileCount`
  before checking the digits; the unreachability sweep asserts `> 100` resolved
  ranges; both source sweeps assert structural markers survive the strip.

## Not provable here — TAGGED for foreground

The node suite sees no React and no canvas. Whether these corrected strings LAND
on screen is a CDP job: the map's band-lens caption (`coverageSubject` +
`coverageSummary`, drawn by `MapViewport.drawBandLensLabel`), the panel's two
`coverageSummary` lines, and the picker's hover label + `title` in
`ArtBrowser.tsx`. The arithmetic and the wiring are pinned; the pixels are not.

Also unverified here: the label's one-line budget is asserted at <= 60 chars in
node, and the `·` added ~8 characters. The existing row still passes, but the
REAL width at the panel's docked size is a foreground measurement.
