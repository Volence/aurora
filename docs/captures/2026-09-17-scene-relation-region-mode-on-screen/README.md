# Scene list's region-mode sentence checked on screen, 2026-09-17

Overseer's own foreground run against master `9f6ecd35` (merge `caa6b51a`), built with
`VITE_AURORA_DEBUG=1`, driven over CDP under Xvfb. No emulator. The project was a `git archive`
of aeon `d6ec0c11`, opened twice, the same two copies as
`docs/captures/2026-09-17-region-mode-b1-on-screen/`: as archived (region mode, 10 regions), and
with `games/sonic4/data/editor/ojz/act1/regions.json` deleted (section mode). Effects, Parallax
sub-tab. For each copy: active section 3, 0 and 7, with a scene selected through
`__dbg.aeon.selectScene`. Text read from the DOM (`region-copy.log`, `section-copy.log`), and the
two PNGs were looked at.

## Region copy: HOLDS

Every probe prints the new sentence and it names the right region row from `regions.json`:
`ojz_act1_depth` names `sec4`, `ojz_act1_start` names `sec0`, `ojz_act1_floor` names `sec8`.
The sentence does not change when the Editing section changes (3, 0, 7). No "act default", no
"no section uses", no SECTION ASSIGNMENT pointer. `region-mode-sec3-depth-names-sec4.png`.

## Section copy (control): HOLDS

The old section-keyed sentence comes back ("Section 3 uses the act default scene. Edits below
change ojz_act1_depth, which no section uses yet: bind it under SECTION ASSIGNMENT."), which is
true on that copy: no sidecar binds a scene and the picker is live.
`section-mode-control-sec3-depth.png`.

## Not checked here

The "no region binds yet" and "regions.json could not be read" sentences: every scene in act 1's
library is bound by a region, and no unreadable file was planted. Both rest on the parcel's unit
rows (`docs/reviews/2026-09-17-scene-relation-region-mode.md`).

## Still visible, already booked

The layer count line under LAYERS still reads "(per scene; scenes are assigned per section)" in
region mode. It is item 1 of the four unfixed advisories in the parcel packet.
