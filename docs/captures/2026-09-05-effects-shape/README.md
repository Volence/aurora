# The Effects shape you ruled, built — for you to approve or reject

You ruled the SHAPE of this surface on 2026-09-02 (`d-26b`,
`three_sub_tabs_plus_section_strip`) from an ASCII mockup and an argument. The
ruling's own closing note says the visual detail is **unratified**, and asks that
the built thing be captured for you rather than assumed approved. Only the
section strip was ever captured. The three sub-tabs and the preview default have
shipped since, and you have not seen them.

These are those pictures. **Nothing here is a question about whether the shape is
right — you settled that.** It is only: does the built version look right to you.

## What you are looking at

| File | Tab |
|---|---|
| `effects-sub-tab-parallax.png` | Parallax — the arrival tab |
| `effects-sub-tab-colour.png` | Colour |
| `effects-sub-tab-tileAnim.png` | Tile anim |

**Three things worth your eye, because they are the clauses of your own ruling:**

1. **The section strip** — top right of every shot, above the sub-tabs. It never
   collapses and always states which section you are editing and what it is bound
   to (`scene ojz_act1_start · raster hand-authored`, then the wiring). Three of
   the fourteen confusions in the walkthrough were the missing fact it now states.
2. **The three sub-tabs** — one job shows one panel. Compare the right-hand column
   across the three files: each tab paints only its own sections, and the other
   two jobs are not on screen at all. In particular the two different things both
   called "bands" are now never visible together, which is the confusion you hit.
3. **The parallax preview is on by default, and only on Parallax.** Look at the
   `Parallax preview` chip in the toolbar: lit on the Parallax shot with the layer
   overlay drawn on the map, dark on the other two. That scoping is deliberate —
   turning it on globally would have changed the overlay on every other facet.

## If something looks wrong

Say so and it changes. That is what this capture is for, and it is a look call,
so nothing has been ruled in your place about the appearance — it waits for you.

## Provenance

- **Aurora** `3c6a733a` on `master`. The app was built from this tree; the only
  commit between it and `aad83c06` touches `docs/decisions.jsonl`, so the source
  behind these pictures is `aad83c06`'s.
- **Project opened**: a fresh `git archive` extract of **aeon** `origin/master`
  `9e3d28614cbee78ffeec74eab6e2bcd2ffc301b3`, never the live tree.
- **Taken by** `npm run harness:effects-sub-tabs`, **13/13 rows**, which captures
  one shot per tab from a clean arrival — the state you would actually meet, not
  a posed one.
- **No emulator, no ROM.** These are the editor, not the game.
