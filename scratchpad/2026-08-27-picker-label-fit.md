# the band card's readout — the fourth spelling, and the box it never fitted

Branch `parcel/picker-label-fit`, off master `3f24a91`. Sibling of
`parcel/slot-range-tail`, which NAMED both defects and left them
(`scratchpad/2026-08-27-slot-range-tail.md`, "NOT touched, on purpose" and
"Also unverified here"). Neither is a live off-by-one; both are real.

## The two findings, and what they were

| # | finding | before | after |
|---|---|---|---|
| 1 | `tilePickerBandLabel` TRUNCATES | `band 0 · slots 0..31 (8x4)` — **155px in a 106px box** | `b0 · 0..31` — **75px, granted in full** |
| 2 | it HAND-ROLLS the span | `const last = g.slotBase + g.cols * g.rows - 1` inline | `slotSpanDigits(g.slotBase, bandSlotCount(g))` |

It writes `#art-browser-hover-label` — **the same DOM element the strip
readout uses**, `whiteSpace: nowrap` + ellipsis, measured in the running app at
`clientWidth` 106 at the docked 224px panel. Everything `stripDragLabel` was
shortened for applies to it word for word, and nothing measured it: [6g2] reads
whatever text is on the line, and a band label is only on the line while the
pointer is on a card.

## Which helper, and why that one

**`slotSpanDigits` for the LINE, `slotSpanPhrase` for the TITLE** — the split
`band-strip-range.ts` already makes, and the case `slotSpanDigits`'s own doc
comment names ("the phrase, always, unless the span has been MEASURED not to
fit"). The count handed to both is `cols * rows` through one private
`bandSlotCount`, so the two forms cannot be given different lengths of the same
range. Nothing in this file sums a range end any more.

## What went off the line, and why it was those words

The card the pointer is on ALREADY DRAWS `Band 0 · 8x4` as its caption two rows
below the line. So the index and the geometry are both on screen, and a 106px
box spending 49 of its characters restating them is the same pure repetition
`stripDragLabel` dropped `band · ` for. **The span is the only thing this line
adds** — nothing else in the picker says which slots a band owns.

The two-character band tag stayed because this line is also where a strip drag's
`34..41 · 2x4` lands: the two readouts interleave on it as the pointer crosses
from the strip to the cards, and a bare span could be either.

## The worst case, over the enumerated legal space

Not a sample, and not a character budget — a character budget is this repo's
canonical vacuous check. Enumerated from the vendored contract's own constants
(`BGANIM_MAX_BANDS` 4, `BG_TILE_CAPACITY` 448, legal `rows` derived through
`rows * TILE_BYTES` an exact power of two → 1/2/4/8/16/32/64/128/256):
**796,916 legal `(index, slotBase, cols, rows)` tuples**, five distinct rendered
lengths, each measured on the real element.

| candidate | widest string | width | box | verdict |
|---|---|---|---|---|
| `band {i} · slots {span} ({c}x{r})` (before) | `band 0 · slots 100..199 (100x1)` | 180px | 106 | **truncates by 74** |
| `band {i} · {span} · {c}x{r}` | `band 0 · 100..199 · 100x1` | 155px | 106 | truncates by 49 |
| `b{i} {span} · {c}x{r}` | `b0 100..199 · 100x1` | 120px | 106 | truncates by 14 |
| `band {i} · {span}` | `band 0 · 100..100` | 110px | 106 | **truncates by 4** |
| `{span} · {c}x{r}` (the strip's form) | `100..199 · 100x1` | 105px | 106 | fits, **1px** |
| **`b{i} · {span}` (shipped)** | `b0 · 100..100` | **90px** | 106 | **fits, 16px** |

`band {i} · {span}` — the plain-English form — is 4px OVER. That is why the tag
is two characters and not a word. The shipped form does **not** eat [6g3]'s 1px
margin: it leaves 16px, on a value range (base up to 447) wider than the live
document's (base up to 319).

**The reduction is measured, not assumed.** ~800k strings cannot each be laid in
the DOM, so one representative per rendered LENGTH is measured — exact only if
every digit renders at one width, since the scaffold is fixed and every varying
character is a digit. The ten digits are measured first (all 140 at 24 chars)
and [6m] is NOT-MEASURABLE, never green, if they disagree.

⚠ **`clientWidth` is not the box when the text is narrower than it.** The line is
a shrink-to-fit flex item: it reports the width of its OWN text until the text
outgrows the row. The fit test is `sw <= cw` with the SAME string in place —
equality means the box granted the string in full. A first cut compared against a
`clientWidth` read back after the short label was restored and turned [6m] red at
`avail=75` on a label that fits.

## Red-first (runner: `node scratchpad/bganim-strip-range-harness.mjs`)

| poison | result | quoted |
|---|---|---|
| none — the fix absent, the rows present | **37/40**, [6k] [6l] [6m] red | `"band 0 · slots 0..31 (8x4)" scrollWidth=155 clientWidth=106`; `title=""`; `template "b0 · 0..31" vs live "band 0 · slots 0..31 (8x4)"` |
| the STRING half only: `band {i} · {span}`, harness template moved with it so only WIDTH can fail | **39/40**, [6m] red, **[6l] GREEN** | `widest={"text":"band 0 · 100..100","sw":110,"cw":106}` while `[6l] "band 0 · 0..31" scrollWidth=95 clientWidth=95` |
| the TITLE half only (`title = ''`) | **39/40**, [6k] red, [6l]/[6m] green | `line="b0 · 0..31" title="" card title="band 0 · slots 0..31 (8x4)"` |

The second row is the whole argument for [6m]: **[6l] alone is green on a label
that ellipsises the moment a document's slots reach three digits.** One sample is
not the property.

### Node (runner: `npx vitest run <file>`)

| poison | rows red | quoted |
|---|---|---|
| the old inline label restored verbatim | 4 | `expected 'band 0 · slots 0..31 (8x4)' to be 'b0 · 0..31'`; `expected 'band 0 · slots 0..31 (8x4)' not to contain 'slots'`; `expected 'band 2 · slots 40..39 (0x4)' to be 'b2 · no slots'`; sweep `to match /slotSpanDigits\(/` |
| helper calls left ONLY in comments | 2 | `expected 'b2 · 40..39' to be 'b2 · no slots'` — the backwards range, live; sweep red |
| `slotSpanDigits`/`slotSpanPhrase` ITSELF back to `base + count` | 2 | `expected 'b0 · 0..32' to be 'b0 · 0..31'`; `expected 'band 0 · slots 0..32 (8x4)' to be '… 0..31'` — **THE POINT: expectations derived from `g.slots` do not move with the helper** |

### The comment false-green, measured

Under the "calls left only in comments" poison, over
`src/renderer/providers/tile-picker-source.ts`:

```
/slotSpanDigits\(/   UNSTRIPPED: 1  PASSES | STRIPPED: 0  FAILS
```

The one unstripped hit is the doc comment saying what to call. Both sweeps strip
`/* */` and `//` first. (The module carries no `://`, so eating `//` to
end-of-line takes nothing but comments — checked.) The module's own doc comments
now also PRINT a hand-rolled `${base}..${base + n - 1}` as the thing not to
write, which an unstripped negative would trip on.

## Rows re-cut because they pinned the old wording

`tile-picker-source.test.ts` — `expect(tilePickerBandLabel(g)).toBe('band 0 ·
slots 0..31 (8x4)')`. **Re-cut to the new convention, not loosened**: that exact
string is now asserted whole against `tilePickerBandHint`, and the line gets its
own whole-string row. Every end is derived from `Math.max(...g.slots)` — the
picture array, built by the row/col walk, a different code path from the
`cols * rows` the label composes through — so the expectations do not move with
the arithmetic they check.

## NOT touched, on purpose

* the card CAPTION (`Band 0 · 8x4`) and `TilePickerBandGroup.label` — the index
  and geometry the line dropped are still drawn there, which is half the reason
  they could go.
* `tilePickerHoverLabel` (the per-tile readout, `bg #12 (0xC)`) — measured
  short, and not a span.
* the strip readout and its box. [6f]/[6g2]/[6g3]/[6h] are unchanged and pass.

## Verification

* `scratchpad/bganim-strip-range-harness.mjs`: **40/40 PASSED** (was 37/40 with
  the rows added and the fix absent). [6f] PASS, [6g2] PASS, [6g3] PASS
  (`widest={"text":"100..319 · 220x1","sw":105,"cw":105}`), [6h] PASS (215
  characters forced onto the line, canvas box byte-identical), and the new
  [6j]/[6k]/[6l]/[6m] PASS.
* `npx vitest run`: **382 files passed | 1 skipped; 4946 tests passed | 3
  skipped**.
* `npx tsc --noEmit`: clean.
