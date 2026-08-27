# item 54 — the three band readouts that named a slot the range does not own

Branch `parcel/slot-range-readouts`. Sibling of `d7ec678`, which fixed the fourth
such sentence (the strip refusal's hint) the day before.

## The rule, in one place

`slotSpanPhrase(base, count)` in `src/renderer/providers/bg-anim-aeon.ts`:

* `count > 0` → `slots ${base}..${base + count - 1}` — the LAST slot the range
  contains, derived from the same count the range is built from.
* `count <= 0` → `NO_SLOTS_PHRASE` (`'no slots'`). DECIDED, not inherited: a
  naive `base + count - 1` renders `0..-1` on a document with no bands.

Every quantity on this surface is a COUNT — `tileCount`, `animatedSlots`,
`firstPromotableSlot` — so `base + count` is the first slot PAST the range, and
on the live document that is exactly the slot a promotion drag must reach.

## Before → after (fixture `b0e5a661`: bands 32x4 @0, 16x4 @128; 192 animated)

| readout | before | after |
|---|---|---|
| band card, band 0 | `slots 0..128 · 128 tiles` | `slots 0..127 · 128 tiles` |
| band card, band 1 | `slots 128..192 · 64 tiles` | `slots 128..191 · 64 tiles` |
| blob budget (live doc, 32 animated) | `32 animated (slots 0..32)` | `32 animated (slots 0..31)` |
| blob budget (no bands at all) | `0 animated (slots 0..0)` | `0 animated (no slots)` |
| promote form, 4x2 at base 192 | `→ slots 192..200.` | `→ slots 192..199.` |
| "From tile" title (4th site, same file) | `the range is 192..200. Slots 0..192 already belong to bands.` | `the range is slots 192..199. Bands already own slots 0..191.` |

## Red-first (runner: `npx vitest run <file>`)

| poison | rows that went red |
|---|---|
| `${base + count}` restored in `slotSpanPhrase` | 5 — `expected [ 'slots 0..128', 'slots 128..192' ] to deeply equal [ 'slots 0..127', 'slots 128..191' ]`; `0/1: expected 2 to be 1`; `expected 129 to be 128`; `expected 'slots 0..192' to contain '0..191'`; `expected 'slots 192..200' to contain '192..199'` |
| zero guard deleted (naive `-1` fix) | 2 — `expected 'slots 0..-1' to be 'no slots'` |
| zero case returns `''` | 2 — `expected '' to be 'no slots'` |
| band card back to `slots {b.slotRange}` | 1 — `not to match /slots \{b\.slotRange\}/` |
| blob hint back to `(slots 0..{budget.animatedSlots})` | 2 (incl. the anti-vacuous count `expected 3 to be >= 4`) |
| promote hint back to `{staticBase}..{staticBase + tileCount}` | 2 — sweep reports `[ '..{staticBase + tileCount}' ]` |
| "From tile" title reverted | 2 — sweep reports `[ '..${staticBase + tileCount}' ]` |
| all three reverted, calls left ONLY in comments | 4 — the comment-strip is what makes this red |
| phrase rendered as `0 through 127` (no `..`) | 5 — `expected null not to be null`, never a silent green |

Matchers are deliberately NOT `0..N`-shaped literals: that is the exact matcher
that passed against this defect in `d7ec678`'s row.

## Same defect, NOT fixed here (out of the parcel's named scope)

Four more display strings compute `base + count` as a range end:

* `src/renderer/providers/band-coverage.ts:194` — `coverageSummary`'s empty case,
  `no background cell draws slots ${base}..${base + count}`
* `src/renderer/providers/band-coverage.ts:250` — `coverageSubject`,
  `slots ${range.base}..${range.base + range.count}` (both the band and the
  candidate sentence)
* `src/renderer/providers/band-strip-range.ts:278` — `stripDragLabel`,
  `const end = staticBase + cols * rows`
* `src/renderer/providers/band-strip-range.ts:292` — `stripDragHint`, same `end`

`src/renderer/providers/tile-picker-source.ts:161` is already correct (`- 1`).
The band-coverage pair sits in the file this parcel was told not to touch; the
band-strip-range pair is in the file `d7ec678` fixed, in two functions it did not
reach. All four want `slotSpanPhrase`.

## Not provable here

Whether the corrected strings LAND on screen (the band card, the budget line, the
promote hint, and the `title=` tooltip) is a foreground CDP job — the node suite
sees no React. The arithmetic and the wiring are pinned; the pixels are not.
