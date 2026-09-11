# paste-across-tilesets: the clipboard remembers the tile set its words index

Branch `parcel/paste-across-tilesets`, from master `3d5ba0ad`.
Code tip `1b3e7785` (commits `31bd116b` reproduction, red on base; `1b3e7785`
fix and rows). This packet, the plant script it cites and the ledger row follow
it and change no code or test.

Lens row `PASTE-ACROSS-TILESETS`. Opened from the closing "Not touched: the
clipboard" note in `docs/reviews/2026-09-11-map-remount-clear.md`, section 9.

---

## Verdict: FIXED for aeon. Classic is not served by this clipboard.

`mapClipboard` holds nametable words, and a nametable word is a tile NUMBER in
the tile set the section is drawn with. The clipboard outlives act, zone and
project switches on purpose. So a Ctrl+V re-armed in another zone wrote the first
zone's numbers into the second zone's tile set, and the author got different
tiles, silently. The reproduction below shows the exact words.

The clipboard now remembers the tile set its words belong to, captured at the
copy. Arming a paste (Ctrl+V) or committing one (the click) into a section whose
tile set is not that one is refused with a warning toast, and nothing is written.
Pasting into the same tile set is unchanged, including act to act within a zone.
The clipboard is not cleared, so going back to the source still pastes. There is
no remapping and no nearest-tile guess.

One point where the tree contradicts the ruling's wording, "going back to the
source", is in section 4a. It is a PROJECT round trip, and it is refused.

---

## 1. The census: everything that reads or writes `mapClipboard`

Enumerated by what READS the field, not where it is defined: `git grep -n
mapClipboard` over `src/` (non-test) and over everything outside `src/`, plus
every `setMapClipboard(` caller. Line numbers are at the code tip.

| site | reads or writes | what it does with the words | tile set it meets | after this parcel |
|---|---|---|---|---|
| `src/renderer/components/MapViewport.tsx:1914` map Ctrl+C | WRITES | `copyFromSection` of the marquee | the open zone's | captures `tileset: zone.tileset` (`:1925`) |
| `src/renderer/components/art/ComposerCanvas.tsx:812` Art chunk Ctrl+C | WRITES | `copyChunkToClipboard(chunk, ...)` | the one `getAtlas` draws a chunk doc with: the open zone's (`:159`) | captures it (`:812`) |
| `src/renderer/components/map-flip.ts:150` `performMapFlip`, paste mode | reads and WRITES | mirrors the pending paste | the one captured | `flipClipboard` carries it through its spread |
| `src/renderer/components/MapViewport.tsx:1952` Ctrl+V | reads | arms paste mode | the open zone's | REFUSES on a mismatch (`:1959`) |
| `src/renderer/components/MapViewport.tsx:3275` the commit click | reads, writes the SECTION | `buildPasteCommand` then `executeCommand` | the open zone's | REFUSES on a mismatch and disarms (`:3285`) |
| `src/renderer/components/MapViewport.tsx:848` the ghost preview | reads | rasterises the words against the open zone's tiles | the open zone's | unchanged: it draws only while pasting, and paste mode can no longer be armed over another tile set, is disarmed by any act, zone or project change (`src/renderer/state/editorStore.ts:988`), and is disarmed by a refused click |
| `src/renderer/components/MapViewport.tsx:3797` paste hover | reads | the SHAPE only (`pasteBaseStep`) | none | unchanged |
| `src/renderer/components/MarqueePasteOptions.tsx:132` | reads | `artOnly`, and flip enablement through `resolveFlip` | none | unchanged |
| `src/renderer/components/map-flip.ts:83` `resolveFlip` | reads | presence only | none | unchanged |
| `src/renderer/components/art/ComposerCanvas.tsx:850` composer Ctrl+V | reads | pastes the COLLISION planes into the open doc | none: no nametable word is written | not guarded (section 4c) |
| `src/renderer/debug-hooks.ts:1329` and `:1641` | reads | `mapClipboardInfo`, `mapClipboardWords` probes for CDP harnesses | none | unchanged |
| `src/renderer/state/editorStore.ts:443`, `:772`, `:872` | the field, its initial `null`, its setter | | | the field is `MapClipboard`, which now requires `tileset` |

Outside `src/`, only scratchpad CDP harnesses read the clipboard, and only through
the two debug probes above. None of them pastes.

`copyFromSection`, `buildPasteCommand`, `effectivePasteLayers`, `pasteBaseStep`
and `applyClipboardCollisionToDoc` do not touch the clipboard field. They take a
`MapRegion` (the captured words without an identity), because none of them reads
the tile set: `copyFromSection` also serves save-as-chunk, the composer seed and
the in-place flip, which never enter the clipboard.

---

## 2. What "the same tile set" is, per adapter

### Aeon: the zone's `Tileset` object

- **The words index the zone's tile set.** `src/core/project/aeon/load.ts:508`
  reads ONE file per zone (`zoneConfig.tileset`) and `:510` builds one
  `Tileset` from it. `Zone.tileset` is at `src/core/model/s4-types.ts:544`. The
  `Act` interface in the same file carries no tile set. MapViewport prepares the
  zone tile set once for all sections (`src/renderer/components/MapViewport.tsx:1052`),
  and `getActiveLevel` hands the command layer `tileset: zone.tileset`
  (`src/renderer/state/projectStore.ts:136`).
- **Not per act.** Every act of a zone shares the zone's one object.
- **Not per section.** `Section.tiles` exists as an override
  (`src/renderer/components/MapViewport.tsx:1060`), and nothing assigns it today:
  the load-time atlas migration nulls legacy pins.
- **Not paged.** The ZX0-paged act-wide art pool is the ENGINE's build output,
  made from this data. Aurora's model has no page: the pool appears in `src/`
  only as the reason older code retired (`src/core/export/vram-coloring.ts:6`,
  `src/core/project/aeon/save.ts:14`).
- **Stable for the life of a load.** The only model-side constructor is
  `load.ts:510` (`save.ts:421` rewrites the raw project.json pointer, not the
  model). Tile edits land IN PLACE: `src/core/editing/history.ts:139` writes,
  `:362` removes an appended tile on undo, `:364` restores one.

So the identity is the `Tileset` object, compared BY REFERENCE. Two tile sets
whose pixels happen to agree are still two: either can be edited without the
other, and a reloaded project's file may have changed on disk.

**The Art composer's chunk copy.** The chunk library is project-wide
(`src/core/model/s4-types.ts:567`) and was migrated into the FIRST zone's tile
set at load (`load.ts:1034`, a stated single-zone assumption). But every surface
that shows a chunk draws it against the OPEN zone's: the composer
(`src/renderer/components/art/ComposerCanvas.tsx:159`) and the chunk grid
(`src/renderer/providers/chunk-grid-aeon.ts:183`). The copy captures the tile set
the author saw the chunk drawn with, which is the open zone's.

### Classic (Sonic 1): not served, nothing to refuse

- MapViewport never mounts for classic. `mapFacet`'s `Canvas: MapViewport`
  (`src/renderer/workspace/facet-registry.ts:169`) is registered for aeon only
  (`src/renderer/workspace/register-facets.ts:19`). Classic's facets are
  `ClassicLevelViewport` and `ClassicComposerCanvas`
  (`src/renderer/workspace/facets/s1-facets.tsx:480`, `:496`, `:529`, `:542`,
  `:578`; registered at `register-facets.ts:41`).
- Classic has no map clipboard at all. Its one clipboard is the Tile tab's
  `tileClipboard` (`src/renderer/state/classicLevelStore.ts:276`): 64 palette
  indices, which are pixels, not tile numbers, so it indexes no tile set.
- Nothing is BLOCKED. There is no path where the identity cannot be determined.

---

## 3. What was built

- `MapClipboard` is now `MapRegion` plus a REQUIRED `tileset`
  (`src/core/editing/map-clipboard.ts`). Required, on this repo's rule for
  load-bearing fields: an optional one reads as "no tile set" and forces a guess.
- `clipboardFitsTileset(clip, target)` is true only when `target` is the very
  object captured. No open tile set is never a match.
- `OTHER_TILESET_REFUSAL`, one string for both refusals: "Not pasted: the copied
  tiles belong to another tile set, so pasting them here would put different
  tiles down. Copy again from a map that uses this tile set."
- Ctrl+V: on a mismatch, a warning toast, the key is still claimed, and nothing
  is armed.
- The commit click checks for itself and does not trust whoever armed it. No
  shipped gesture reaches it with the wrong tile set, but `setPasting` is a
  public store action. On a mismatch: a warning toast, nothing written, and paste
  mode is left so no ghost stays under the cursor.
- `flipClipboard` is generic over the region and spreads its input, so a flip
  keeps the tile set.

---

## 4. Where the tree contradicted the ruling or the brief

**4a. "Going back to the source" after a PROJECT switch is refused.** Aurora has
no way back to a project without reloading it: every aeon open builds a fresh
project (`src/renderer/state/aeon-open.ts:90`), and so a fresh `Tileset`
(`load.ts:510`), a same-directory reopen included. Copy in A, open B, reopen A,
Ctrl+V: refused, loudly. Act and zone round trips within one load paste, and a
row pins that. The options, for the overseer:

1. **Keep it** (built). The refusal is loud and the cure is one Ctrl+C.
2. **A content snapshot**: record the tile set's pixels at the copy and accept a
   different object whose tiles are byte-identical. Exact, not a guess, but it
   opens a question the ruling does not answer: two zones with identical tiles
   and different palettes would then accept the paste and show different colours.
3. **Path identity** (project root plus the zone's tileset file): survives a
   reopen, but trusts a file that aeon's regeneration may have rewritten between
   the copy and the paste. That is the silent wrong write this row closes.

**4b. Arming is refused even for a collision-only (Shift) paste.** A collision
word's shape number indexes the collision shape set, not the tile set
(`src/core/collision/collision-cell-word.ts:6`), so a collision-only paste
across zones was correct before and is now refused at Ctrl+V. That is what was
ruled ("Arming or committing ... is REFUSED"). The alternative: arm always, and
refuse only a click that would write art. Not built.

**4c. The composer's Ctrl+V is not guarded.** It writes collision planes only
(`src/renderer/components/art/ComposerCanvas.tsx:850`), so no tile number is
written. Across PROJECTS a shape number indexes that project's collision profile
set, which can differ. That is a collision-set question, not a tile-set one.
Recorded, not acted on.

**4d. Two zones whose tile sets are the same FILE are refused.** Each zone parses
its own copy (`load.ts:508`), and an edit to one does not reach the other in
memory. Refused on purpose.

**4e. Pre-existing, not the clipboard's.** A project-wide chunk library drawn
against whichever zone is open (section 2) is the loader's single-zone
assumption. A chunk STAMP into another zone has the same shape as this row, and
was not in scope.

---

## 5. The reproduction, red on base

Two rows in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`,
nested at the end of the paste block for its `document` stub. The fixture adds a
second zone, `mgz`, whose tile `i` is colour `15 - i` where `ojz`'s is `i`. They
differ at every index because 15 is odd, and every row asserts that before
trusting anything. The copy goes through the real marquee drag and the real
Ctrl+C.

| row | base `3d5ba0ad` plus rows (`31bd116b`) |
|---|---|
| Ctrl+V in a zone with another tile set is REFUSED out loud, and nothing is written | **RED**, ASSERTION |
| a paste armed any other way is refused at the CLICK too, and nothing is written | **RED**, ASSERTION |

Both printed the same twelve words written into the other zone: `mgz/act1/s0/fg`
at 1032, 1033, 1288 and 1289 (the snapped origin (8,4)) went from `0x0303` to
`0x0001`, `0x0002`, `0x0003` and `0x0004`, which are `ojz` tile numbers. Both
collision planes were overwritten at the same cells (`0x3005` to `0x3001`,
`0x3006` to `0x3002`).

---

## 6. The rows, and the plants that redden them

Six more rows join the two above in the same block. One is in
`src/renderer/components/__tests__/map-flip.test.ts` and two are in
`src/core/editing/__tests__/map-clipboard.test.ts`.

"Nothing is written" is measured against EVERY word plane of every section of
every act of every zone (the foreground nametable and both collision planes),
plus the undo stack. The canvas cannot be measured here: this harness has no
pixels. That half is foreground, F-4 below.

Every plant was applied by `scratchpad/paste-tileset-plant.mjs`, which does an
exact-anchor replacement, refuses unless the anchor occurs exactly once, reads
the file back from disk, and prints the mutated lines before the run. Each was
run against all three files and then restored from the committed tip `1b3e7785`
with `git show HEAD:<path>`, and each restore reported the file clean against
HEAD. All reds are ASSERTION; TIMEOUT 0.

| plant | what it does | reds |
|---|---|---|
| P1 | Ctrl+V arms without checking | 4: Ctrl+V refused; back to the source; another project; copied in the other zone |
| P2 | the commit click writes without checking | 1: refused at the click |
| P3 | `flipClipboard` lists fields instead of spreading | 2: map-flip "carries the TILE SET"; mounted "a flip in paste mode" |
| P4 | `copyChunkToClipboard` drops the tile set | 2: 7c-1, 7c-2 |
| P5 | the predicate trusts a tile set whose pixels match | 1: 7c-2 |
| P6 | the ruled-out design: a switch CLEARS the clipboard | 8: all six of the block that switch, plus two earlier remount rows (below) |
| P7 | Ctrl+C captures a new wrapper, so nothing ever matches | 5: the CONTROL; act to act; back to the source; the flip; copied in the other zone |
| P8 | Ctrl+C captures the FIRST zone's tile set, not the open zone's | 1: copied in the other zone |

Every new row is reddened by at least one plant. The two reproduction rows are
also red on base itself. P6's two extra reds are the remount parcel's
project-open rows. The planted line also removed the subscription's early
return, so `giveTheOpenProjectAConfig` cleared the clipboard before their Ctrl+V
premise. That comes from the plant's shape, not from a defect.

What P5 shows: the by-reference rule is pinned at the unit level only. The
mounted fixtures' tile sets differ in content, so a content-matching predicate
would refuse them just the same.

---

## 7. Suite

| | Test Files | Tests |
|---|---|---|
| base `3d5ba0ad` | 602 passed \| 3 skipped (605) | 9055 passed \| 9 skipped (9064) |
| code tip `1b3e7785` | 602 passed \| 3 skipped (605) | 9066 passed \| 9 skipped (9075) |

Both runs exit 0, and the failure-class reporter says "no failures in this run"
on both. `9075 - 9064 = 11`, the rows added. The file count does not move
because every row went into an existing file. `npx tsc --noEmit` exits 0 at the
tip. Three `test/` fixtures were retyped to `MapRegion`, or handed a tile set, so
the compiler holds the required field.

---

## 8. Foreground-only, tagged, and not attempted

No emulator was touched.

- **F-1.** In an aeon project with TWO zones: Layout facet, marquee tool, drag a
  region in zone A, Ctrl+C. Open a level of zone B, then Ctrl+V. Expect the
  warning toast "Not pasted: the copied tiles belong to another tile set...", no
  ghost under the cursor, a click that changes nothing, and nothing new to undo.
  Back in zone A, Ctrl+V shows the ghost and a click pastes. OJZ is a one-zone
  project, so this needs a second zone. Without one, use F-3's
  second-checkout form.
- **F-2.** Zone A, act 1 to act 2: Ctrl+V arms and the paste lands, with no toast.
- **F-3.** With a copy made, open a second checkout of the same tree (same zone
  and act ids): Ctrl+V is refused. Reopen the first checkout: Ctrl+V is ALSO
  refused (section 4a). That is the built behaviour and it wants the overseer's
  eye.
- **F-4.** After any refusal, the map's pixels are unchanged. The node rows
  compare every word plane and cannot see a canvas.
- **F-5.** Art facet, open a CHUNK document, Ctrl+C (whole chunk). Open a level of
  another zone and press Ctrl+V: refused. In a level of the chunk's own zone it
  pastes. The composer's copy site is covered only at the function
  (`copyChunkToClipboard` carries the tile set it is handed, 7c-1). No mounted
  ComposerCanvas harness exists to drive its Ctrl+C.
