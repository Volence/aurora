# map-coverage-6: the plane arm of the stroke flush, reached from the keyboard

Branch `parcel/map-coverage-6-plane-arm`, from master `52ebb8e4`.
Code tip `9a715051`. Commits, in order:

| commit | what |
|---|---|
| `9a715051` | rows: a collision stroke whose plane changes mid-drag lands one command per plane |

This packet and the ledger row follow the code tip and change no code or test.

Continues lens row `MAPVIEWPORT-UNTESTED` (last row `2026-09-12T01:13:13Z`,
packet `docs/reviews/2026-09-12-map-coverage-5.md`). Its REACHABLE AND STILL
UNCOVERED list had one item:

> The PLANE arm of `recordPaint`'s flush: a plane change mid-drag lands two
> commands. It is stated in the code, so a row can be written without a ruling.

---

## The headline: the arm is reachable by one route, the keyboard, and the clause keeps plane A's undo from being corrupted

`recordPaint`'s docblock (`src/renderer/components/MapViewport.tsx`) states the
rule: *"A change of section or plane flushes the stroke and starts a new one —
one command per contiguous run."* The plane half is the last clause of `sameRun`:

```ts
const sameRun = cur && cur.kind === kind && cur.sectionIndex === sectionIndex
  && cur.section === liveSection
  && (cur.kind !== 'collision' || cur.plane === plane);
```

- **Reachable, by keyboard only.** The enumeration is below. The collision
  palette's Plane A and B buttons are the only UI writer of the plane. A mouse
  click on one cannot land while the drag is held, but Tab then Space can.
- **Two rows now cover it**, driven through the real palette's own Plane button.
  A switch from A to B mid-drag lands two commands, undone newest first. The
  CONTROL presses the plane already aimed at mid-drag and lands one command.
- **Plant M1 shows what the clause is for.** With the clause deleted, a plane
  switch does not flush, and the one merged command is filed under plane A. On
  undo, plane A receives the plane-B run's old words at the plane-B run's cells,
  and plane B keeps its paint. So without the clause the result is not one undo
  step too few. It is a wrong write to the plane the author was not painting.

No live defect.

---

## The gesture, enumerated before any row was written

`paintCollisionCell` reads the plane from the store per cell
(`const plane = useEditorStore.getState().collisionPaintPlane;`). The press
latches Alt (`paintPropagate`), both planes (`paintBothPlanes`), the crossover
brush and its span, but not the plane.

Every writer of `collisionPaintPlane`, found by grepping for the setter and for
any `collisionPaintPlane:` or `=` write in `src/`, excluding tests:

| path | what it is | can it change the plane mid-drag? |
|---|---|---|
| `CollisionPalette.tsx` Plane A / B buttons, `onClick={() => pickPlane(p)}` | the palette beside the map in the Collision facet | **YES, by keyboard.** See below. |
| `CollisionPalette.tsx` mount effect, `claimCollisionOverlay(..., plane, variant)` into `show(p)` into `pickPlane(p)` | the palette claiming the overlay on mount | **No.** It writes the plane already in the store. |
| `debug-hooks.ts` `armCollisionBrush` | the CDP harness door | **Not a gesture.** No person reaches it. |
| the agent's `paint_collision` | the agent road | **Does not write the field.** It names its own plane per call. |
| `ComposerCanvas.tsx` (Art facet) | reads only | never writes. The Art facet never mounts MapViewport. |

**Why a mouse click is not a route.** A held drag means the primary button is
down over the map. To click a palette button, that button has to come up first,
and MapViewport hears `mouseup` on the window (`window.addEventListener('mouseup',
onUp)`), which runs `finishGesture` and commits the stroke. So the click arrives
after the stroke has ended. A second mouse button pressed over the palette fires
no `click`.

**Why the keyboard is a route.** Each step below is recorded in the tree:

1. A clicked palette button keeps keyboard focus. This was measured on the
   running app (O48b) and is written into `ui/act-and-drop-focus.ts`: after a
   real mouse click, `document.activeElement` was the button and a bare Space
   re-fired it. d-27 fixed this for Reset and Clear only. The Plane buttons do
   not call `actAndDropFocus`.
2. The press on the map does not move focus. The collision branch of
   `handleMouseDown` calls `e.preventDefault()`, and MapViewport contains no
   `.focus()` and no `tabIndex`.
3. Nothing claims Tab or Space. MapViewport's window keydown handlers have no
   case for Tab, Space or Enter. The App and LevelWorkspace handlers return
   early without Ctrl or Meta.

So an author who clicked Plane **A**, then presses and holds on the map, can
press **Tab** (focus moves to B) and **Space** (B's `click`, so `pickPlane('b')`)
while the drag is held. The next cell is painted on plane B.

**Verdict: reachable.** The rows run the same handler that the Space press
dispatches, which is the button's own `onClick`, taken from the real palette's
element tree. The focus steps are browser facts that this suite cannot see, so
they are tagged for the foreground (F-1).

---

## What is now covered

2 rows in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`
(155 to 157), in a new block directly after the section-crossing block,
`'a collision stroke whose plane changes mid-drag lands one command per plane,
undone newest first'`:

- **The switch.** Press on cell (1, 1), move to (2, 1), press the palette's B,
  move to (3, 1) and (4, 1), release. Plane A holds cells 1 and 2, and plane B
  holds cells 3 and 4. The first undo leaves plane A as it was and empties plane
  B. The second undo empties plane A. No third entry remains.
- **CONTROL.** The same drag, pressing the palette's A (the plane already aimed
  at) at the same moment. The store write, the overlay claim and the re-render
  all still happen. All four cells land on plane A, one undo takes everything
  back, and no second entry remains.

### Fixture decisions worth knowing

- **The palette is the real one.** `renderHooked` renders `CollisionPalette`
  with `{ variant: 'map' }` over the live stores. The Plane buttons are found by
  type (`'button'`) and label (`'A'`, `'B'`), and a HARNESS assertion requires
  exactly one of each. This is map-coverage-5's Detach idiom, applied to the
  collision palette.
- **The palette needs collision tables before it renders its Plane row.**
  Without them it returns a "Collision tables not found" note. The block loads
  `{ profiles: [], engine: 's4', solidCount: 1 }`: the shape grid stays empty
  and no row reads a profile. `projectStore.reset()` in the file's top-level
  `beforeEach` puts it back to `null`.
- **The palette's mount effect claims the collision overlay**, so the block
  unmounts the panel in `afterEach`, and its cleanup hands the overlay back.
- **An ANTI-VACUOUS assertion checks that the B press moved the store's plane**
  before any cell is painted on B. A palette press that did nothing would
  otherwise turn the row into a one-plane drag that expects two commands.
- **The same fixture as the one-section collision block.** act1's section 0,
  `seedCollision()` (plane A filled with shape 1, plane B with shape 2), and the
  pick is shape 9, which neither plane carries. A write to the wrong plane is
  therefore a wrong VALUE, and `collPainted` sees it. Expected indices come from
  `cellSubTiles`, never typed in.

---

## Both rows are red-first proven

| # | plant | reds |
|---|---|---|
| M1 | `sameRun`'s plane clause deleted: `&& (cur.kind !== 'collision' \|\| cur.plane === plane)` removed | exactly the switch row. The CONTROL and the other 155 rows stay green. |

The rows were committed first (`9a715051`). M1 was applied on disk and read back
before the run:

```diff
     const sameRun = cur && cur.kind === kind && cur.sectionIndex === sectionIndex
-      && cur.section === liveSection
-      && (cur.kind !== 'collision' || cur.plane === plane);
+      && cur.section === liveSection;
```

The whole file was run: `Tests 1 failed | 156 passed (157)`. The one failure is
the switch row, class ASSERTION:

```
AssertionError: the first undo did not take back exactly the plane-B run, on plane B
  expected { a: [514, 515, 516, 517, 770, 771, 772, 773], b: [] }
  received { a: [518, 519, 520, 521, 774, 775, 776, 777],
             b: [518, 519, 520, 521, 774, 775, 776, 777] }
```

`518` to `521` and `774` to `777` are cells 3 and 4, the plane-B run. After the
merged command's undo, plane A holds them with plane B's old words, and plane B
keeps its paint. That is the corruption described in the headline.

The CONTROL is green under M1, because no plane changes in it. It still
separates "the palette press splits the stroke" from "a plane change splits the
stroke": a flush on any store write or re-render would redden it.

Restored with `git checkout 9a715051 -- src/renderer/components/MapViewport.tsx`.
The file's blob (`dcd35996`) equals the commit's, and `git status --short` was
empty before the suite run.

**The switch row is the only row in the file that M1 reddens.** Before this
parcel, no row could see a stroke that keeps one command across a plane change.

### A harness note

Running this file with `-t` to isolate a block makes the repo's skip-report
gate exit 1 ("155 skipped test(s) above give NO REASON"), because the filtered
rows count as unexplained skips. The rows themselves passed. Every red-first run
above used the whole file, unfiltered.

---

## Suite

| | Test Files | Tests |
|---|---|---|
| base (`52ebb8e4`) | 611 passed \| 3 skipped (614) | 9235 passed \| 9 skipped (9244) |
| code tip (`9a715051`) | 611 passed \| 3 skipped (614) | 9237 passed \| 9 skipped (9246) |

Both are `npm test`, the whole chain with its gates, and both exit 0. The
failure-class reporter says "no failures in this run" on both. `9246 - 9244 = 2`,
the rows added. The file count does not move because both rows went into an
existing file. `npx tsc --noEmit` exits 0 at the code tip. It was not run at
base.

---

## What the tree said that the brief did not

- **"Reachable" had to be earned, and the route is narrower than "a plane
  change mid-drag".** The brief asked for a real gesture. The only UI writer is
  the palette, and the mouse cannot reach it mid-drag. The keyboard can, only
  because a clicked button keeps focus. The tree records that fact about Reset
  and Clear (d-27) and did not apply it to these two buttons.
- **The clause guards a value, not only a count.** The brief framed the property
  as "two commands, not one". M1's received values show that the merged command
  writes the wrong plane on undo.
- **The ledger convention, and a count of mine that was wrong.** Eight lines
  of `docs/lens-findings.jsonl` carry `MAPVIEWPORT-UNTESTED`: lines 1, 84, 95,
  119, 191, 261, 275 and 276. That is the original lens-sweep row plus one
  APPENDED line per narrowing (viewport-gesture-guards twice, then map-coverage
  1 to 5). map-coverage-4 (`6f611f9f`) and map-coverage-5 (`b9c6baff`) were
  each one insertion. This brief said to replace the row rather than append a
  copy. So line 276, map-coverage-5's, was rewritten in place, and the other
  seven were left alone. map-coverage-5's ledger text survives in `b9c6baff` and
  in its packet. No gate forbids the rewrite: `check-ledger-timestamps` polices
  `lane-log.jsonl` and `decisions.jsonl` and passes on this change. If the
  append convention should win, the fix is to restore line 276 from `b9c6baff`
  and append this row after it. My first count was "two lines". It came from a
  grep that matched only lines whose `id` key comes first, and parsing every
  line corrected it before this commit.

---

## Observations for the overseer, not acted on

Both were measured in two scratch rows (not committed, removed by the same
checkout from `9a715051`), on this block's fixture.

- **O1. With both planes armed, a plane switch still splits the stroke.** The
  same A to B drag with "A+B" on: both planes hold cells 1 to 4 live, and the
  stroke is **2** undo entries. The first takes cells 3 and 4 off both planes,
  the second takes cells 1 and 2. The set of planes written never changes (A+B
  throughout), but the aimed plane does, and the clause does not look at
  `otherEntries`. The code states the flush unconditionally and says nothing
  specific to both-planes mode, so this is not a row. Whether a both-planes
  stroke should split when only its aimed plane changes is a behaviour question.
- **O2. The drag cache key does not include the plane.** Press on cell (1, 1)
  on plane A, press B, then move inside the same 16px cell (its other sub-tile).
  Plane B is **not** painted there (`b: []`). The next cell is painted on B. The
  key is `section:col:row:span`, and its comment explains the span: *"Without it,
  dragging from one half of a cell to the other inside a single stroke would be
  'the same cursor cell — skip', and the second half could never be marked."*
  The plane is left out, so the cell under the pointer at the switch cannot
  reach the new plane until the pointer leaves it. The code is silent on this,
  so it is a behaviour question and not a row.
- **The Plane buttons keep focus**, which is the only reason the arm is
  reachable at all. d-27 made Reset and Clear drop focus because Space re-fired
  them. The Plane buttons are not destructive, but Space on one mid-drag splits
  the stroke, and nothing on screen says so. Listed so the two focus facts are
  seen together.

---

## Still open, and what is foreground-only

**Foreground-only, tagged, not attempted.** No emulator, Electron or CDP was
touched.

- **F-1.** In the running app, after clicking Plane A, a press held on the map
  leaves focus on A. Tab then reaches B, and Space fires B without ending the
  drag. The rows run B's handler, and this suite cannot see focus.
- Everything map-coverage-5 listed, unchanged: the stamp ghost during a link
  hover and the Chunk links panel on screen; the Effects-facet-gated guide drag,
  the screen frame's locked-scene arm and `resolveEscape`'s lens arm; the paste
  ghost, the collision hover preview with its crossover rects, the band preview,
  and the hover bar's legibility; the warp's landing in the running game.

**Reachable and still uncovered in the node suite:** the list these packets
carried is now empty. That ends the enumerated list. It is not a measurement of
the whole file.

**Behaviour questions before rows:** O1 and O2 above, the stamp press not
refreshing the link hover (map-coverage-5), plus map-coverage-4's three: the
collision brush size read live, paint-block's one-block drag, and the readout
freezing during drags.

**Cannot be a row today, and why:** unchanged from map-coverage-4. A placement
off the grid and F7's fresh act read are each guarded twice.
