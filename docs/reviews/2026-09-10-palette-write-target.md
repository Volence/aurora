# PALETTE-NO-WRITE-TARGET: an edited colour now has somewhere to go

2026-09-10. Branch `palette-write-target`, tip `9e2eb070` (from `9c28a037`).
Node/vitest only: **no Electron, no CDP, no ROM build, no emulator.** The one
cross-repo read below is a file measurement, not a build.

## Verdict

**CONFIRMED, and fixed.** Editing a palette line changed the model and was then
discarded. It was not a missing step. It was a missing **destination**: there
was no code anywhere that could turn a `Palette` back into bytes, and the aeon
save plan contained no palette file at all.

- `src/core/formats/palette.ts` had `parsePaletteLine` and `buildPalette` and
  **no inverse**. Now it has `serializeZonePalette`.
- `buildAeonSavePlan` planned no palette write. Now it plans one per zone.
- Lines 1 to 3 round-trip: edit, save, reopen, the colour comes back.
- Line 0 is **refused** with a sentence that says why, and
  `art/palettes/SonicAndTails.bin` is not written, planned, or removed anywhere
  in this parcel.

Two defects were found *by this parcel's own poison runs* and fixed here: a
vacuous ordering assertion in a gate I had just written, and a **second,
unguarded door onto line 0** in the copy bridge. Both are below.

## The destination, and why it is not the editor-destination rule

This repo has a written invariant for the three art blobs Aurora persists
(`core/config/s4-config.ts`): field absent means Aurora owns the path, derives
`<dataRoot>editor/<derived>` and retargets the pointer; field present
(`editorTilesetPath`, `editorBgLayout`, `editorBgTiles`) means the repo owns it.
The obvious move was a fourth key, `editorPalettePath`.

**That would have been wrong, and the producer says so.** aeon's
`tools/ojz_common.py` carries a block headed *"THE ACT PALETTE: EXACTLY ONE
WRITER, AND IT IS THE EDITOR"*:

> INVARIANT. `games/<game>/data/editor/<zone>/<act>/palette.bin` is the ONLY
> authored copy of an act's palette. The generated `ojz_palette.bin` is a pure
> MIRROR of it [...] WHY data/editor/ AND NOT SOMEWHERE ELSE.
> `tools/level_staleness.py`'s `editor_sources()` covers that whole tree, so an
> authored palette there makes the staleness gate SEE a palette edit and
> re-bake. Anywhere else and the build cannot tell a palette changed at all.

Aurora *is* that editor, and had never written the file. So the palette is the
one art blob with **no escape hatch and no retarget**: the save writes
`zones[].palette` verbatim, in place. A retarget would leave the authored file
untouched and the mirror step copying a palette nobody edited.

The same block records aeon's own six-month version of this defect and the
reason nobody caught it, which is exactly this parcel's reason too:

> Nothing reported a failure: the save saved, the build genuinely did regenerate
> the palette, and the editor's live preview pushes CRAM directly, so the
> emulator DID show the new colour. **THE LIVE PATH WORKING IS WHAT HID IT** — a
> check that only exercises the live preview would have passed throughout.

Every row in the new gate therefore goes through disk.

## Line 0: refused, not written and not dropped

`Zone.palette` is assembled from **two** files (`core/project/aeon/load.ts`):
the zone's own authored palette into CRAM lines 1 to 3 (`destOffset 16`), and
`art/palettes/SonicAndTails.bin` into line 0 — one file for the entire game.
An edit there recolours Sonic and Tails in every zone. Owner card
`PALETTE-LINE0-BLAST-RADIUS` is unanswered; this is the recommended
`refuse_line0` build, and **the refusal is the thing that gets replaced** if the
ruling comes back the other way.

It is refused in four places, in increasing order of how hard it is to undo:

| Where | What | Reddens on deletion |
|---|---|---|
| `serializeZonePalette` | the loop starts at `ZONE_PALETTE_FIRST_LINE`, so no argument makes it emit line 0 | yes, `palette-write-target.test.ts` (P2) |
| `buildAeonSavePlan` | never names the shared file | yes, same file |
| `AEON_ZONE_PALETTE_POLICY` | the grid does not offer the swatch, in **every** zone mount | yes, `palette-aeon.test.ts` (P5) |
| `previewZone` + `zoneCopyTargetRefusal` | the port's own guard, and the copy bridge's | yes (P6, P6b, P7b) |

**What a person sees.** The locked swatch and the locked line grip carry
`ZONE_LINE0_REFUSAL` as their `title`, replacing the old label
`sprite-reserved (line 0)`:

> Palette line 0 is the Sonic and Tails palette, one file shared by every zone
> in the game, so Aurora does not change it from here. Lines 1 to 3 are this
> zone's own palette and they do save.

⚠ **THAT TOOLTIP IS READ FROM SOURCE, NOT SEEN.** No Electron, no CDP, so the
text is pinned by the executed rows on `ZONE_LINE0_REFUSAL` and by the port's
`title()`, and nobody has looked at it on a screen. **Tagged for foreground.**
The same applies to the swatch being unclickable: `swatchClick` is executed, the
rendered `<PaletteGrid>` is not.

### The sprite pane used to unlock it, and that control was inert everywhere

`AEON_SPRITE_PALETTE_POLICY` deliberately unlocked line 0, on the reasoning that
"editing the player palette is precisely the job there". Measured, that control
reached nothing:

- not **disk** — the save plan had no palette write at all (this parcel's
  defect);
- not a **running game** — `Pal_Base` is 96 bytes over lines 1 to 3 and
  `palBaseOffset` throws on line 0 (`core/aether/palette-push.ts`);
- not the **agent tool** — `validation.ts` has refused it in those words since
  long before: `palette line 0 is reserved for player/sprite art`.

Three standing refusals and one unlocked slider. Now that lines 1 to 3 genuinely
save, leaving it open would make line 0 the one control in the palette whose
edits still silently evaporate. It is locked. The **standalone** sprite row —
the sprite document's own 16 private colours, drawn as one row the grid indexes
as "line 0" — is not a CRAM line at all and stays unlocked; that is why there
are now two named policies instead of one.

## Not overwriting what was not understood

`Zone.paletteFile` carries the **load's verdict** to the write path, the same
shape as `Section.unreadable`, `Act.sectionFiles` and
`EffectsSceneLibrary.unreadable`, and required rather than optional so a
producer cannot leave it unsaid (the `Notice.severity` rule).

- **Short file.** `buildPalette` pads with black. Those blacks are the reader's
  invention, so the save writes nothing and the load emits a `'warning'` notice
  naming the file and saying palette edits will not save. (Silence here would be
  this parcel's own defect wearing a hat.)
- **Long file.** Everything past the three lines is held as `tail` and written
  back verbatim, so a save cannot truncate a file whose shape this reader was
  wrong about.
- **Unreadable file.** `fa.read(zoneConfig.palette)` is unguarded in the loader,
  so a palette that will not read aborts the open. Nothing can reach the save.

## Measured on aeon's real file

`/home/volence/sonic_hacks/aeon/games/sonic4/data/editor/ojz/act1/palette.bin`,
read 2026-09-10 through a scratch harness (written, run, deleted, never
committed) that drives the real `buildPalette` and `serializeZonePalette`:

```
SCRATCH file bytes = 96 expected 96
SCRATCH out bytes = 96 differing bytes = 0
```

So opening and saving an untouched OJZ project adds **no palette churn** — no
`git status` line in aeon, and no spurious re-bake. aeon's live `project.json`
was read the same day: `zones[0].palette` is
`games/sonic4/data/editor/ojz/act1/palette.bin`, the authored path, not the
generated mirror.

⚠ **Byte identity holds for words that are already legal colours.** A word with
junk in the bits the VDP does not display (`GENESIS_WORD_MASK`) is normalised by
the decode/encode pair. aeon's 48 words are all clean, hence the zero above.

## The two defects the poison runs found

### 1. A gate assertion of mine that was vacuous

The scan row proving `previewZone` short-circuits on line 0 compared indices and
took `body.indexOf('return')` to mean "the refusal's return". It does not: it
lands on the `if (!z) return;` two statements below. **Poison P6b** kept the
`zonePaletteLineRefusal(line)` call and deleted only its `return`, so a refused
line was warned about and then **written anyway** — and the row came back
**GREEN**. Fixed by anchoring the span (between the refusal and the first thing
that touches the zone there must be a `return;`). Commit `dd9928b6`.

*When a poison comes back green, suspect the matcher before the guard.*

### 2. A second door onto line 0 that no row guarded

`PaletteEditor`'s "Copy to" menu and its swatch/line drag-and-drop write a zone
palette line too — in a **single gesture, with no slider to notice**. Both gated
on one local predicate, `line === 0 && !inSprite`. So with the palette open in
the sprite pane, the shared Sonic and Tails palette was a legal copy **target**
at the same moment the grid's policy was refusing that write.

I closed it in the first commit, and then **poison P7 passed the entire suite**
(595 files, 8863 rows, zero red): the lock I had added was a defensive guard
with no row that reddens on its deletion, which this repo files as a finding.
Fixed in `9e2eb070` by moving the decision to
`zoneCopyTargetRefusal(line, standaloneRow)`, whose argument list has no
`inSprite` in it — putting the door back now means putting an argument back —
plus one executed row and one source-scan row, both red under P7b.

## Red-first: every poison, and what it reddened

Each mutation was applied to disk, shown with `git diff -U0`, run, and restored
with `git checkout --` from the **committed** baseline `a2ca7b97` (P7b from
`9e2eb070`).

| # | Mutation | Red |
|---|---|---|
| P1 | delete the palette write from `buildAeonSavePlan` (the pre-parcel state) | 5 rows across `palette-write-target.test.ts` and `editor-dest-fields.test.ts` |
| P2 | `serializeZonePalette` loops from line 0 | 5 rows, incl. the line-0 invariance row |
| P3 | drop the `paletteFile.complete` gate | `a truncated palette file is neither written nor grown` |
| P4 | drop the `tail` argument | `a longer palette file keeps every byte past the three lines` |
| P5 | `ZONE_UNSAVABLE_LINES = []` (unlock line 0) | 3 rows in `palette-aeon.test.ts` |
| P6 | delete the `previewZone` refusal outright | `refuses line 0 inside previewZone` |
| P6b | keep the call, delete only its `return` | **GREEN at first** — see defect 1 — **RED** after the matcher fix |
| P7 | restore `&& !inSprite` in `zoneLineLocked` | **GREEN across the whole suite** — see defect 2 |
| P7b | the same door, against the new code | `gates the aeon copy bridge on the port's refusal` |
| P8 | delete the short-palette notice | `and the load says so, as a warning` |

## Rows: executed vs read from source

**EXECUTED** (real loader, real `set-palette-line` through `EditHistory`, real
`buildAeonSavePlan`, real in-memory `FileAccess`; expectations derived from the
edit word, never from an observed value):

`src/core/project/aeon/__tests__/palette-write-target.test.ts` — 9 rows.
1. the colour picked on line 2 is the colour that comes back
2. every line the zone owns round-trips, and they do not swap places
3. writes the zone palette to the path project.json names, and retargets nothing
4. an untouched project re-serializes the palette byte for byte
5. never plans a write to the shared player palette
6. the serializer emits lines 1 to 3 and has no way to emit line 0
7. a truncated palette file is neither written nor grown
8. and the load says so, as a warning
9. a longer palette file keeps every byte past the three lines

`src/renderer/providers/__tests__/palette-aeon.test.ts` — 5 new/changed rows on
the policies, the refusal sentence, the copy-bridge refusal, and a cross-check
that the locked set agrees with `PAL_BASE_FIRST_LINE`/`PAL_BASE_LAST_LINE`,
which were written independently of `ZONE_PALETTE_FIRST_LINE`.

**READ FROM SOURCE** (comment-stripped scans, the established technique in these
two files because the renderer suite is node-only and `.tsx` is not collected):

- `refuses line 0 inside previewZone, before anything is written` — proves the
  refusal is consulted and returns before the write. Cannot prove a real drag
  reaches it.
- `gates the aeon copy bridge on the port's refusal, with no mode of its own`
  (`palette-grid-wiring.test.ts`) — proves the host still asks.

**NOT MEASURED AT ALL, and tagged for foreground:**

- the refusal **tooltip on screen**, and the locked swatch being unclickable in
  the real app;
- Ctrl+S in the real app writing aeon's real `palette.bin`. The plan is proven
  at the core layer and the glue (`state/aeon-save.ts`) applies plans it is
  given, but no one has driven the app.

## Still open

1. **A `project.json` whose `zones[].palette` names the generated mirror.**
   Aurora writes whatever that key names. If it named
   `data/generated/<zone>/<act>/ojz_palette.bin`, the next aeon build's mirror
   step would overwrite the edit — not Aurora's doing, but the same silent
   outcome. aeon's live `project.json` was measured today and does **not**; the
   stale shape survives only in this repo's deliberately pre-change fixture
   (`test/config/editor-dest-fields.test.ts`), where it is now commented. No
   guard was invented for it: refusing a path by directory name would be a
   heuristic over a peer's convention.
2. **Per-section palette refs.** `Section.paletteRef` exists and is saved in the
   meta sidecar; nothing in this parcel touches per-section palettes. Only the
   ZONE palette round-trips.
3. **`Zone.paletteFile` is per zone, and the model has one palette per zone.**
   An act-scoped palette (aeon's own path is act-scoped:
   `editor/<zone>/<act>/palette.bin`) is carried by whatever the zone's single
   `palette` key names. A project with two acts and two palettes is not modelled
   here and was not modelled before.

## Suite

Baseline `9c28a037`: **594 files passed, 3 skipped (597); 8851 tests passed,
9 skipped (8860); 0 failed.**

Tip `9e2eb070`: **595 files passed, 3 skipped (598); 8865 tests passed,
9 skipped (8874); 0 failed.** `npm test` (which runs the `check:*` chain and
`tsc --noEmit` before vitest).
