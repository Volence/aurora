# A full-size second band does NOT fit — and the binding limit is not the one we were watching

**The re-layout bought TILE room. It did not buy BYTE room, and the byte budget is the owner's
own ruling.** A second full-size (8×4 = 32 slot) band is **4,186 B over** the BgAnim section
ceiling. No screen claim is made and the owner's layout was not touched.

## What Aurora can do — measured through its own API

`createBand` → `makeAddBandCommand` → `EditHistory.execute`, so every rule the panel enforces
ran; nothing hand-spliced.

| | before | after |
|---|---|---|
| tiles | 320 | **352** |
| tile slots remaining (448 ceiling) | 128 | **96** |
| bands | 1 | **2** |

**Aurora accepts it and the tile ceiling is not the problem** — 96 slots still free.

## What aeon's bake refuses, and the number

```
[inject_editor_bg] REFUSED: this act's BG animation does not fit its section.
  2 band(s), 64 slots total (band 0: 8x4 = 32 slots, band 1: 8x4 = 32 slots)
  -> ojz_bg_anim would be 16474 B (2 + 44x2 + 64x256)
  -> the ceiling is 12288 B (BGANIM_SECTION_CEILING, the ruled authoring budget)
  THE LIMIT IS ON THE TOTAL, NOT PER BAND. At 2 band(s) the ceiling allows 47 slots in total.
```

**The limit is the owner's decision d-9, 12 KiB**, and the message says raising it *"is an owner
ruling, not an edit"*. Arithmetic checks: `2 + 88 + 16384 = 16474`; `(12288 − 90) / 256 = 47`.

**So a second band is authorable at up to 15 slots** (32 + 15 = 47), and a second **full-size**
one is not. That is the loop-closing answer to card 1's purpose, with the opposite sign to the
one expected: the re-layout removed the tile constraint and exposed the byte one underneath.

## Two things found on the way

**⚠ `default_off` is a SINGLE-BAND-ACT feature, and Aurora cannot author it.** aeon's bake
refuses it on 1 of 2 bands *and* on 2 of 2 (`"the debug view twins are emitted only for a
single-band act"`). So a second band requires removing it from **the shipped band**, which is a
content decision, not an edit. Separately: **`default_off` appears zero times in Aurora's
`src/`** — `createBand` cannot set it. **It does survive Aurora's round trip** (parse →
serialize keeps `true`), so there is no silent data loss on the shipped band; the gap is
authoring, not preservation.

**⚠ A failed bake leaves the generated tree behind, and restoring the SOURCE does not undo it.**
My first copy was contaminated by an earlier invalid document: after `git checkout --` of the
document, the build still failed with `OJZ_Act1_BG_Layout: declared 8192 B, initializer produced
4096`. **A pristine re-extract at the same revision built clean (rc=0)**, which is what proved
the tree healthy and the copy dirty. Every measurement above is from a fresh extract.

## Where this leaves it

The question *"did the re-layout buy room for a full-size band"* is answered: **for tiles yes,
for the section budget no.** What it would take is the owner's, twice over — raising d-9's
12 KiB, and allowing the shipped band's `default_off` to be dropped. Neither is an edit.
