# Finding — the band's blob and the viewport's blob are two different blobs

*Found 2026-08-26 while implementing ROADMAP item 42 (BgAnim motion preview), which
was commissioned on the premise that the band's background is already on screen.
**It is not.** The premise is false today, and it is false structurally rather than
by accident. Recorded here because the preview parcel is built around the guard
that closes it, and because the sync itself is somebody else's parcel.*

## 1. The premise the parcel was written on

> "The background IS on screen already. `MapViewport.tsx` resolves and draws Plane B
> for the active section … So band art is already painted; your overlay changes
> *which phase* of it is painted, it does not invent a surface."

Every clause of that is true except the join. `MapViewport` does draw Plane B. A
band does name slots in "the BG tile blob". They are **not the same blob.**

## 2. Two blobs, and nothing in Aurora relates them

| | the viewport's BG | the band's BG |
|---|---|---|
| where it lives | `act.bgLayout` / `act.bgTiles`, or a `bgLibrary` entry when the active section carries a `bgLayoutRef` | `project.bgOverride.doc` — `layout` / `tiles` |
| on disk | `games/sonic4/data/editor/*.bin` (`project.json`'s `bgLayout`/`bgTiles`, and the BG library's `_tiles.bin`s) | `games/sonic4/data/editor_bg_override.json` |
| loaded by | `core/project/aeon/load.ts` (`actConfig.bgLayout`/`bgTiles`, `normalizeBgLayout`) | `core/formats/bg-override/bg-override-io.ts::loadBgOverride` |
| written by | `core/project/aeon/save.ts` (`editorBgLayoutPath`) | `bg-override-io.ts::saveFileFor` |
| what reads it in the renderer | `MapViewport.resolveActiveBg` → `SectionRenderer.loadBg` | **nothing, before this parcel** |

`grep -rn bgOverride src/` reaches the agent handler, the project store, the debug
hooks, the band panel, load, save, history and the codec. It reaches **no canvas
code at all**. The two halves have never met.

And the divergence is not a stale file waiting to be regenerated. A band command
(`set-bg-override-band`) renumbers `doc.tiles` — that is the whole point of the
prefix rule — and touches `act.bgTiles` never. **Authoring a band makes the two
blobs disagree by design.**

## 3. Measured on the live tree, 2026-08-26

`editor_bg_override.json`: 320 tiles, 4096 layout words, one band
(`cols 8`, `rows 4`, `driver timer`, no `rate_shift`, no `slot_base`), 1244 layout
cells referencing its 32 slots.

The active section of OJZ act 1 (`section_0.meta.json`) carries
`"bgLayoutRef": "ingame-forest-v15-1786630615596"`, so the viewport paints
`editor/ojz_bg_ingame-forest-v15-1786630615596_tiles.bin` — **448 tiles**.

- prefix comparison, doc `tiles[i]` vs blob `tiles[i]`: **0 of 320 match**, against
  every `*_tiles.bin` in the editor directory, the act default included.
- as SETS: **all 320 of the document's distinct tiles appear in that 448-tile
  blob.**

So the two blobs hold *the same art* at *different indices* — the document is a
de-duplicated, renumbered descendant of the library background. That is the worst
possible shape for an index-keyed substitution: every index is meaningful in both
blobs and means something different in each. An overlay that trusted the index
would paint real art, from the right file, at the wrong cells, and look plausible.

## 4. What item 42 does about it

It does **not** sync them — that is a separate parcel with its own direction to
choose (§5). It makes the substitution *sound* instead, per band, with the
equality the consumer contract already names:

> `prefixIdentity`: `phases[0] == tiles[slot_base : slot_base + cols*rows]` — the
> band's rest state IS the static tiles it covers.

Checked against the **displayed** blob rather than the document's own `tiles`, that
equality becomes exactly the licence to substitute: it says the two blobs agree
about *this band's slots*, which is all the overlay touches.
`bganim-preview.ts::bandRestArtMismatch` is that check;
`BgAnimPreviewNote` reports the refusal to the author in their own terms.

On today's live tree the guard **refuses**, and the note says why. That is the
correct behaviour and it is also, honestly, a preview that shows nothing on the
one real project — which is why this document exists rather than a line in a
commit message.

## 5. Left open for the overseer — the two directions, not a recommendation

1. **The viewport learns the override.** When a readable `bgOverride` document
   exists, it *is* the background the ROM ships; painting the act's stale bins
   beside a band editor is arguably the bug. Costs: the BG paint tools write
   `act.bgLayout`, so this needs a story for which blob a stroke edits.
2. **The override learns the viewport.** An export that regenerates
   `editor_bg_override.json` from the displayed background (band ranges
   preserved) would keep them in step. Costs: `editor_bg_override.json` is
   Aurora's under the 2026-08-22 sole-writer ruling, but its *content* is
   currently generator-authored, and a regenerate would have to keep the
   hand-authored `phases` it does not own.

**Not settled here.** The measurement is: they diverge, the divergence is
structural, and the preview refuses rather than guessing.
