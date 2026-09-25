# REGIONS-LIST (ROADMAP §5.1 row 206): the per-rectangle list, and the mid-drag override written up for routing

Editor spec: empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`,
read with `git show origin/main:` at empyrean `78a50e03`, never through the sibling working
tree. The spec has no section 0 Corrections block. Its §8 was read first: the Q1 ruling
(2026-09-14T14:54:34Z, *"Yeah probablyy go with how we think about it"* = A, cut right away)
supersedes painter's order in §2.3, §2.5, §3.2 and §5.2, and §3.4 carries no banner of its own.

Branch `parcel/regions-list`, cut from master `bf50d44d`. Commits:

| sha | purpose |
|---|---|
| `f7a0fa5c` | test: 21 node rows, RED against a stub whose every export throws |
| `258e85bd` | feat: the per-rectangle list, its three doors, and one shared removal sentence |
| `7fda61f2` | harness: the list on screen through real input, 22/22 |
| `01e25fbf` | harness: row 3c reports a dropped entry as red instead of crashing |
| (tip) | this packet and the ROADMAP row |

## 1. The re-measure: most of row 206's item 1 already existed

Row 206 says "the per-rectangle list that section 3.4 describes". I checked each part of
§3.4 against the tree before building anything. **Most of the list was built in REGIONS
step 6** (merge `a9e25d80`, packet `docs/reviews/2026-09-16-regions-step6.md`, ROADMAP
row 183) and step 8B. What was missing was the one item the row's own words name, the
**per-rectangle** row.

| §3.4 item | state before this parcel | where |
|---|---|---|
| region list, "painter's order, topmost first" | EXISTED, in document order. Painter's order has no referent after Q1. Kept in document order and sorts nothing, one row per region id | `regionListRows`, `src/renderer/providers/regions-aeon.ts`; rows in `test/renderer/regions-panel.test.ts` §1 |
| act `defaults` as a fixed bottom row "act" | EXISTED. Read-only, with its reason shown as text (ruling CALL 3) | `ActRow`, `src/renderer/components/regions/RegionsPanel.tsx` |
| selecting an entry selects it on the map | EXISTED in the direction the spec names (list to map): the overlay draws `selectedRegionId` heavy | `MapViewport.tsx` overlay block, `selectedId` |
| "hidden" for a fully covered region | SUBSTITUTED at step 6 and RULED (`docs/superpowers/notes/2026-09-16-regions-panel-three-calls.md`, call 1). Under Q1 regions are disjoint and nothing can be covered, so the mark became `overlaps <other id>` | `RegionListRow.overlaps` |
| binding rows, inherited/explicit badges, "revert to inherited" | EXISTED. Four distinct badges, including `explicit (required)` for preset | `regionBindingRows`, `BindingRow` |
| status line of §2.5 rule results | EXISTED, with rule 4 CHECKED since row 201 | `regionStatusRows`, `StatusRows` |
| **`rects #1 x … y … w … h … [Carve] [Fit to 16]`** | **MISSING.** The detail pane showed four fields that resolved the id's FIRST `regions[]` entry. On a carved region they edited rectangle 1, and the other rectangles were not on screen. A warning line said so, and the step-8B packets tagged it | this parcel |

So the row's premise was partly stale: "the list" was built, and "the per-rectangle list"
was not. I built the missing part. The list's scope was well under a day, so there was no
need to split off a core. The ordering, overlaps (the successor to "hidden") and badge node
rows the brief asks for **already exist** in `test/renderer/regions-panel.test.ts`. I left
them unchanged and wrote new rows only for new logic.

## 2. What was built

`src/renderer/providers/regions-rect-list.ts` (pure) and the `RectList` component that
replaces `RectFields` in `RegionsPanel.tsx`. There is one row per `regions[]` **entry** of the
selected region, numbered `#1..#N` in document order. Every control addresses its entry by
**document index**.

Each row has three doors. They do not all carve, and the difference is deliberate:

1. **The four numbers** write the entry in place and carve nothing. These are the step-6
   semantics unchanged, now aimed at the right entry. Whether a typed number should trim its
   neighbours the way a drag does is tagged in §8. I did not decide it.
2. **[Fit to 16]** moves each **edge** to its nearest 16 px line. It snaps edges, not
   `x`/`w`: snapping `w` as a number would move an edge that was already on the grid. Fit
   runs through the gesture layer as a `resize`, so like any geometry gesture under Q1 it
   trims whatever it now lands on. It is **absent** on a rect that is already on the grid,
   because a button that does nothing is worse than no button.
3. **[Delete]** is §3.2's last row, *"Delete on a selected rect: remove it; a region whose
   last rect is removed is removed with it"*. It goes through the gesture layer's `delete`
   arm, which was built and tested in 8A and never wired to any control before this. When a
   region disappears, the panel toasts the same sentence the map drag uses. That sentence now
   has one composition, `regionsRemovedSentence`, and `MapViewport` calls it too.

Each row also names the OTHER region its rectangle overlaps (`#2 overlaps night`) and shows
its own §2.5 rule-2 findings. The region-level mark says which regions collide. The rect-level
mark says which rectangle is doing it.

**Not built: §3.4's [Carve].** In the painter's-order draft, carve was an opt-in subtraction.
§3.2's Q1 banner says *"Carve is what EVERY draw over an existing region does — there is no
separate Alt gesture"*. A carve button would be a gesture the ruling deleted, so it has no
referent. §8 and §3.4 do not otherwise conflict for this item.

## 3. Store and spec mapping

| spec words | code |
|---|---|
| `rects #1 …` | `regionRectRows(doc, regionId, act)`: `{n, entryIndex, rect, fitted, findings, overlaps}` |
| typed rect numbers (§7 row 6) | `regionRectFieldCommand(doc, entryIndex, key, value)`: one `set-regions` per committed field, null on no-op |
| `[Fit to 16]`, snap 16 nearest (§3.2) | `fitRectToGrid`, `regionRectFitOutcome` (resize gesture, carves) |
| Delete on a selected rect (§3.2) | `regionRectDeleteOutcome` (delete gesture) |
| one command per gesture (§3.3) | every door builds exactly one `SetRegionsCommand`, act-ambient (`sectionIndex: -1`) |
| selection | unchanged: `editorStore.selectedRegionId`, by id |

## 4. Red/green, node

**Red first.** `f7a0fa5c` committed the 21 rows with the module as a stub whose every export
throws `NOT BUILT`: `Tests 20 failed | 1 passed (21)`. The one green row, `[snap]`, pins the
existing `REGION_SNAP_PX` against the spec's 16 and has no new code under it. **Green** at
`258e85bd`: `Tests 21 passed (21)`.

**Mutations**, each applied on disk to the committed `258e85bd` file, shown with `git diff`
before the run, and restored with `git checkout 258e85bd -- <file>`:

| id | the diff on disk | red |
|---|---|---|
| M1 | `next.regions[entryIndex].rect = …` became `const first = next.regions.findIndex((r) => r.id === entry.id); next.regions[first].rect = …` (**the pre-parcel defect**) | 2 failed: `[field]`, `[field-nocarve]` |
| M2 | `if (r.id !== regionId) return;` became `if (r.id !== regionId \|\| rows.length > 0) return;` (first entry only) | 7 failed: `[order]`, `[all]`, `[field]`, `[fitted]`, `[rect-overlap]`, `[rect-overlap-self]`, `[rect-findings]` |
| M3 | Fit written in place (`plain.regions[entryIndex].rect = fit`) instead of the resize gesture | 1 failed: `[fit-carves]` |
| M4 | `let x1 = snapWorld(rect.x + rect.w, snap)` became `let x1 = x0 + snapWorld(rect.w, snap)` (snap `w` as a number) | 1 failed: `[fit-edges]` |
| M5 | the `if (o.idA === o.idB) continue;` same-id drop deleted | 1 failed: `[rect-overlap-self]` |

After the last restore: `Tests 21 passed (21)`. **One honest gap:** `[fit-edge-kept]` stays
GREEN under M4. Its fixture's fractional parts do not cross a grid line, so it does not
discriminate edge-snap from width-snap. `[fit-edges]` is the row that does, and it is red
alone under M4.

## 5. Live results

Instrument: `scratchpad/regions-rect-list-harness.mjs`, registered as
`harness:regions-rect-list` (`check-harness-guards` exit 0). It uses real CDP input only:
`Input.dispatchMouseEvent` at integer element centres and `Input.insertText`, never `.click()`
and never a synthetic `MouseEvent`. Run with `ELECTRON_BIN` = the main checkout's electron,
`AURORA_BUILT_TREE` = this worktree, and `AEON_DIR` = a fresh rsync copy of aeon `57b75d6c`
(excluding `.git` and `.claude`), deleted after the runs. Built with
`VITE_AURORA_DEBUG=1 npm run build` before each run. The run printed `root:` and `pinned:`
as this worktree.

The seed puts `forest` as two entries with `night` between them in the file. It selects
forest with a real click on its list row. The rows check: one panel row per entry, addressed
to its own index (3a/3b); row #2's fields show entry 2 (3c); Fit is offered exactly on the
off-grid row (3d); the old warning is gone (3e); typing into #2's `h` writes entry 2 and
leaves entry 0 and night byte-identical (4a/4b); Fit moves the off-grid edge and trims night
(5a/5b); Delete removes one entry (6a/6b); deleting night's only rectangle removes night and
toasts the module's own sentence (7a/7b). Each gesture is undone by ONE Ctrl+Z to the
document just before it (4c/5c/6c/7c).

| run (UTC) | build | result |
|---|---|---|
| 07:57:56 to 07:58:13 | green | **16 passed, 5 failed of 21.** A harness defect: the blur click hit a control at the detail pane's centre, so focus stayed in a field and the workspace's Ctrl+Z ignores a typing target. Every later undo row then compared with a seed the first undo never restored. Fixed in the harness (blur on the list card; compare each undo with its own pre-gesture document) |
| 07:58:52 to 07:59:08 | green | **22 passed, 0 failed, 0 UNMEASURABLE of 22** |
| 07:59:52 to 08:00:09 | **M1 planted and built** | 20 passed, **2 failed**: exactly `[4a]`, `[4b]` |
| 08:00:28 to 08:00:37 | **M2 planted and built** | 3a and 3b red, then a TypeError in 3c with no summary. A crash is not a row, so 3c was hardened (`01e25fbf`) |
| 08:00:49 to 08:01:02 | M2, hardened harness | 8 passed, **11 failed**, 1 UNMEASURABLE of 20, 3c among the reds |
| 08:01:40 to 08:01:56 | restored from `7fda61f2`, rebuilt (plant absent from `dist/`: grep count 0) | **22 passed, 0 failed, 0 UNMEASURABLE of 22** |

A run from 08:01:14 is **discarded**. The restore in that command was refused by the shell
guard, so it measured the M2 build again and not a green one. It is recorded here so its
numbers are not mistaken for a result.

Captures from the final green run (08:01:40Z), tracked in
`docs/captures/2026-09-25-regions-list/`: `regions-rect-list-two-rects.png`,
`regions-rect-list-after-fit.png` and `regions-rect-list-last-rect-deleted.png`. The first shows
`#1` and `#2` each with its own x/y/w/h, and Fit to 16 on `#2` only.

## 6. `npm test`

`VITEST_MAX_WORKERS=4 npm test`, foreground, 2026-09-25T08:02:20Z to 08:05:00Z (vitest
`Duration 105.83s`), exit 0, every gate in the chain included:

```
 Test Files  655 passed | 3 skipped (658)
      Tests  10317 passed | 9 skipped (10326)
```

This is master's `10296 passed / 9 skipped` plus the 21 new rows.

## 7. The mid-drag override: written up, NOT decided (a look call to route)

**What it is.** The owner asked (2026-09-16) *"Can we have it just toggleable if we want to
see it exactly?"*, and got `OverlayOptions.showRegions`, the View-menu tick "Tint the ground
by region". The overseer then added one disjunct the owner did not ask for: the whole region
block draws when `showRegions || regionDrag !== null`. The stated reason was that with the
wash hidden, a region drag would be carving blind, with no rectangle and no carve preview,
and the document would change on release.

**Where it lives.** `src/renderer/components/MapViewport.tsx`, the regions overlay block
(`if (regionsDoc && (overlayOpts.showRegions || rd !== null))`, with the "OVERSEER'S CALL
AND IS OVERTURNABLE" comment above it). It came in with commit `dce413e9`. Harness row `7c`
in `scratchpad/region-gesture-harness.mjs` pins it (a drag with the toggle OFF still
advances the overlay paint count).

**What it looks like** (`e640e0fe`'s capture `region-overlay-OFF-mid-drag`): mid-drag the
WHOLE overlay comes back, including the large red UNASSIGNED wash, every region's hatch and
labels, and a transient label collision. It is not a light preview.

**Options.**

| | shape | for | against |
|---|---|---|---|
| A | keep as is | no blind carving; already built and pinned | when the author hid the wash to see the art, a drag floods the art with the full wash including red; the owner did not ask for it |
| B | cut the disjunct | the toggle means exactly what it says | a drag with the wash hidden is carving blind, and the document changes on release with no picture of the change |
| C | **gesture-only preview**: while hidden, draw only what the hand is doing (the dragged rectangle's outline, plus the outline of each piece it will trim), with no hatch, no unassigned wash and no labels | keeps the art visible AND the gesture's picture of itself; the preview is already computed (`regionDragPreview` runs the release's own transform) | a new, smaller draw mode in `region-overlay.ts`; harness `7c` must change from "paints advance" to "paints advance and the full wash is not drawn" |
| D | arming or pressing the region tool while hidden turns the toggle back ON, visibly | simple and honest (the menu tick changes) | the author's choice is overridden and stays overridden after the drag |

**Recommendation: C.** It is the only option that keeps both halves: the owner's "see it
exactly" (the art stays clear of everything except the gesture in hand) and the overseer's
"no carving blind". Its cost is contained in the overlay drawer. This recommendation is not
a ruling. ROADMAP row 206 already says this call should go to a Fable agent.

## 8. Deviations

- **§3.4's [Carve] is not built.** Q1 left it no referent (§2).
- **The "hidden" mark stays substituted by `overlaps`**, as ruled at step 6. The new
  rect-level overlap mark extends the substitution. It does not reopen it.
- **The selection-linked second outline** (`docs/reviews/2026-09-16-shared-background-marking-ruling.md`
  line 157) was NOT built. This parcel did not open the overlay's draw pass: it changes the
  panel, plus one call site in `MapViewport` for the shared sentence. The ruling allows
  deferring it "without weakening the ruling". Booked in §9.
- **`node_modules`** in this worktree is an EMPTY directory, not a missing one.
  `cp -al … node_modules` into an existing directory is the nesting trap, so I did not run
  it. Node resolution walks up to the main checkout's `node_modules`, and both the suite and
  the build ran from it.
- `scratchpad/region-gesture-harness.mjs` still selects its row with a synthetic
  `MouseEvent`. I did not change it (it is outside this parcel); the new harness does not do
  this.

## 9. Follow-ups (named, open)

1. **REGIONS-MIDDRAG-LOOK**: the §7 look call, to route to a Fable agent.
2. **REGIONS-SELECTION-OUTLINE**: the selection-linked second outline (ruling item 4).
   **Found while re-measuring:** that ruling's items 2 (the caption *"N regions, K
   backgrounds …"*) and 3 (the panel `bg` row badge `same as: …`) are ALSO unbuilt: there
   are zero matches for either in `src`. They are booked here too, because the ruling marked
   them REGIONS-PAINT work.
3. **REGIONS-TYPED-CARVE**: should a typed rect number trim its neighbours the way a drag
   and Fit do? Today it does not (row `[field-nocarve]` pins it), and the status line
   reports the overlap. This is a behaviour question, tagged for the foreground.
4. **REGIONS-MAP-SELECT**: clicking a region ON THE MAP does not select it. §3.4 names only
   list to map, so this is not a spec gap, but an author will expect it. It is not a free
   add: with the region tool armed, a click draws a one-cell rect by design
   (`region-marquee.ts`: "a collapsed drag reads as the smallest legal rectangle"). So the
   door would need the `view` tool or a modifier, which is a design call.
5. **REGIONS-RECT-HIGHLIGHT**: nothing on the map says which piece is `#2`. Hover- or
   selection-linking a rect row to its piece outline needs the draw pass.
6. **`#n` renumbers after Fit** (the gesture layer draws a resized piece back at the end and
   then coalesces). This is documented in the module header. Stable numbering would need
   the layer to keep positions.
7. **Rect fields clip four-digit values** at `width={54}` in the 280 px column (visible in
   `regions-rect-list-two-rects.png`, "4100" shows as "410"). The step-6 fields had the same
   width. This is a look item.
8. **Pre-existing, seen on screen:** the status line reads *"No two regions overlap (3
   regions checked)"* for a document with 2 regions and 3 entries. This is step-8B packet
   item 5 (`regionStatusRows` counts pieces), and it is still open.
9. `[fit-edge-kept]` does not discriminate under M4 (§4). A fixture that crosses a line
   would close this.

## 10. Tagged for the foreground

- The §7 mid-drag override, recommendation C, **not decided**.
- Follow-ups 3 and 4 are behaviour calls, not bugs.
- Follow-up 2: the background-marking ruling's items 2 and 3 were believed to have shipped
  with REGIONS-PAINT, and they did not.
