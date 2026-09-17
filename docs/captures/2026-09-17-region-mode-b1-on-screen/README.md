# Region-mode fix (ruling B1) checked on screen, 2026-09-17

Overseer's own foreground run against master `92443d5b` (B1 merge `dc39bcb2`), built with
`VITE_AURORA_DEBUG=1`, driven over CDP under Xvfb. No emulator. The project was a `git archive`
of aeon `d6ec0c11` (origin/master at the time), opened twice:

- **region copy**: as archived. `regions.json` present, `__dbg.aeon.regions()` = open, 10 regions.
  Every section sidecar's `rasterRef`/`sceneRef` is null.
- **section copy**: the same with `games/sonic4/data/editor/ojz/act1/regions.json` deleted
  (`regions()` = none).

Active section 3 in both. Text was read from the DOM, and every PNG was looked at.

## The packet's three checks (`docs/reviews/2026-09-17-region-mode-b1.md`, "On-screen checks")

1. **Region mode, Effects strip: HOLDS.** The notice ("This act is in region mode: ...") and the
   line "scene and raster are bound on this act's region rows, in the Regions panel" are shown.
   Neither `own preset` nor `threaded` appears on any sub-tab. `region-mode-colour-strip-and-raster-select.png`.
2. **Region mode, both Section selects: HOLD.** Colour tab, band-preset `Section 3` select:
   disabled, title "Section 3 cannot take a raster binding: ...". Parallax tab, Section assignment
   select: disabled, title "Section 3 cannot take a scene binding: ...", refusal printed above it.
3. **Section mode: PARTLY, and the rest CANNOT BE SEEN on any real tree.** The three condition
   rows come back and both selects are live (the mode gate works in both directions). But
   `threaded` reads "no record to check": with `regions.json` deleted, act 1's
   `act_descriptor.emp` still holds only `ojz_region(...)` rows, so there is no section binding to
   show a record-keyed call for, and the editor says so. **aeon has no section-mode act any more**,
   so the record-keyed `threaded` wording is proven by B1's unit rows only.
   `section-mode-colour-condition-rows.png`.

## Found: the scene panel still gives section-keyed advice in region mode

`region-mode-parallax-scene-panel.png`. With `ojz_act1_depth` selected, the Scenes section says
*"Section 3 uses the act default scene. Edits below change ojz_act1_depth, which no section uses
yet: bind it under SECTION ASSIGNMENT."* Wrong on this act on both counts: region `sec4` binds
`ojz_act1_depth` in `regions.json`, and the SECTION ASSIGNMENT control it points to is the one
refusing the binding directly below it. Source: `sceneSelectionRelation` in
`src/renderer/providers/effects-aeon.ts` (the "uses the act default scene" clause), which reads
section sidecars only. B1 condition 5 fixed this for the strip, not for this sentence. Booked as
queue row `SCENE-RELATION-REGION-MODE`.
