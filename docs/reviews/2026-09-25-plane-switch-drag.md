# Plane switch mid-drag: O1, O2 and the Plane button's focus, re-measured

**Branch** `plane-switch-drag`, base master `5c6c85f3`. **Date** 2026-09-25.
**Row** `MAPVIEWPORT-UNTESTED`. Its line at `2026-09-25T13:37:53Z` (f7-warp-landing) carried
three items forward as open: O1 and O2 from `docs/reviews/2026-09-12-map-coverage-6.md`, and
the foreground check "the clicked Plane button keeping focus through a map press with Tab and
Space mid-drag".
**Code tip** `523c61b0` (one test row). This packet and the ledger line follow it and change no
code or test.

---

## 0. The answer: the brief was stale, and so was the ledger

The ledger line was accurate when map-coverage-6 wrote it. Six hours later all three items were
closed by the hub's rulings (`docs/reviews/2026-09-12-rulings-asked.md`, "Rulings received",
2026-09-12T07:08:52Z, made in the owner's place and open to his review) and by the map parcel
that implemented them (`docs/reviews/2026-09-12-map-behaviour-fixes.md`). Every later line of
the row, including f7-warp-landing's, copied the item list forward unchanged.

| item as the brief filed it | what the tree says | commit (ancestor of `5c6c85f3`) |
|---|---|---|
| O2: the drag cache key leaves out the plane | Ruling M2, "put the plane in the key". **Fixed**, with a node row (`M2:`) and a live row (`harness:map-behaviour-fixes` M2.a) | `ece9735f` |
| O1: with both planes armed a plane switch still splits the stroke | Ruling M3, **"leave it"**. No code change was due. | none |
| Foreground: "a clicked Plane button **keeps** focus through a press on the map" | Ruling M1, "drop focus (d-27 precedent)". The buttons now go through `actAndDropFocus`, so a click leaves focus on `<body>`. The route that is left is Tab then Space. That route is measured live (M2.0). | `6fcacce0`, harness `5947cd81` |

**So the foreground check cannot be carried out as the brief wrote it.** Its first clause is the
behaviour ruling M1 removed. A harness asserting it would go red on master, and correctly. I did
not register a `harness:plane-switch-drag`. It would repeat `harness:map-behaviour-fixes` parts
`m1` and `m2`, which already assert the ruled version of each clause with real
`Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` input. I re-ran those parts on today's
tree instead (section 3), with a red run. The overseer should tell me if a separately registered
name was wanted anyway.

What this parcel adds:

1. **O2 re-measured on today's tree**, node and live, red then green (sections 1 and 3).
2. **One new node row for O1 as ruled** (section 2). It asserts that each undo of a both-planes
   stroke puts back **each plane's own words**. The split is not only about undo granularity.
   A merged both-planes stroke would swap the two planes' old words on undo.
3. **A claim from `ece9735f` measured.** Its message says that with A+B armed, the new key
   revisits the cell for the new plane and adds no entry, marked "(Read, not measured.)". It is
   now measured (section 2.3).

---

## 1. O2: the plane is in the key, re-measured

The key is in `paintCollisionCell` (`src/renderer/components/MapViewport.tsx`):
`` `${info.sectionIndex}:${cellCol}:${cellRow}:${crossoverSpan}:${plane}` ``, and a comment
above it cites ruling M2 and map-coverage-6 O2.

**Node row** `M2: after a plane switch mid-drag, a move inside the SAME cell paints that cell on
the new plane` (`src/renderer/components/__tests__/map-viewport-mounted.test.ts`). This is an
existing row, not a new one. I re-ran it against the unfixed key:

- Mutation on disk (sed, then `git diff`):
  ```diff
  -    const cellKey = `${info.sectionIndex}:${cellCol}:${cellRow}:${crossoverSpan}:${plane}`;
  +    const cellKey = `${info.sectionIndex}:${cellCol}:${cellRow}:${crossoverSpan}`;
  ```
  `MapViewport.tsx | 2 +-`
- Red, whole file: `Tests 1 failed | 165 passed (166)`. The one failure is the M2 row:
  `AssertionError: the cell under the pointer at the switch was skipped for the new plane:
  expected { a: [ 514, 515, 770, 771 ], b: [] }`.
- Restored with `git checkout 5c6c85f3 -- src/renderer/components/MapViewport.tsx`. Status empty
  afterwards. Green: `Tests 166 passed (166)`.

---

## 2. O1: the decision, and the row that pins what it protects

### 2.1 The decision

Ruled already: **M3, "leave it"**, by the hub in the owner's place. It is not an owner approval,
and a word from him overturns it. I agree with the ruling and changed no code. What a user sees
under each option:

- **As ruled (split).** A both-planes drag whose aimed plane changes partway (Tab to the other
  Plane button, then Space, while the button is held) gives two undo entries. Both read `Paint
  collision A+B (n blocks, both planes)`. The first Ctrl+Z takes back the part painted after the
  switch, on both planes. The second takes back the part before it. Nothing is written wrongly.
  The cost is one extra Ctrl+Z, after a gesture that already takes three deliberate keys in the
  middle of a drag.
- **Merged (one entry).** One Ctrl+Z for the whole drag. **This is not the small fix it looks
  like.** A collision stroke stores its cells by role, not by plane: `entries` holds the aimed
  plane's cells and `otherEntries` the other plane's. The aimed plane is what changes at the
  switch. Dropping the flush (for example, skipping `sameRun`'s plane clause when both planes
  are armed) files the post-switch cells' B words as A's and A's as B's. Undo then writes each
  plane's old words onto the other plane (section 2.2 measures this). A correct merge would key
  the stroke's maps by physical plane (A and B) instead of by role. That touches the stroke
  type, `recordPaint`, `endPaintStroke`'s command build and `revertPaintStroke`. That is a
  change to undo granularity that the ruling declined, not a defect fix.

**Recommendation: keep M3 as ruled.** If the owner overturns it, the change is the physical-plane
re-keying above, and the new row goes red on any merge that swaps the planes.

### 2.2 The new row, red first

`M3: a BOTH-PLANES stroke whose aimed plane changes is two commands, and each undo puts back
each plane's OWN words`, in the Plane-change block of `map-viewport-mounted.test.ts`. A+B
armed. Press cell 1, move to cell 2, press the real palette's B (anti-vacuous: the aimed plane
is now `b`), move to cells 3 and 4, release. Anti-vacuous: all four cells are painted on both
planes. The first undo leaves cells 1 and 2 on both planes. The second leaves nothing, and no
third entry exists. Expected indices come from `cellSubTiles`. The fixture fills plane A with
shape 1 and plane B with shape 2, so a word restored onto the wrong plane counts as a painted
cell.

- Committed first: `523c61b0`. Whole file green: `Tests 167 passed (167)`.
- Mutation on disk (`git diff`, `MapViewport.tsx | 3 +--`):
  ```diff
  -      && cur.section === liveSection
  -      && (cur.kind !== 'collision' || cur.plane === plane);
  +      && cur.section === liveSection;
  ```
- Red, whole file: `Tests 2 failed | 165 passed (167)`. The two failures are the existing
  one-plane switch row (map-coverage-6's) and the new row. The new row's received value after the
  first undo is `a: [518..521, 774..777], b: [518..521, 774..777]`. Cells 1 and 2 came back, so
  the one merged command undid the whole stroke. Cells 3 and 4 are still off-fill **on both
  planes**, which is the swap from section 2.1.
- Restored with `git checkout HEAD -- src/renderer/components/MapViewport.tsx` at `523c61b0`.
  Status empty. Green: `Tests 167 passed (167)`.

**What this row adds over the existing switch row.** Both rows go red on the same plant, so on
that plant alone they cannot be told apart. The new row covers the both-planes branch
(`otherEntries`), which the existing row never exercises: it runs with one plane. A
both-planes-only merge would leave the one-plane row green. I did not plant that variant.

### 2.3 Measured, not committed: the both-planes revisit

`ece9735f`'s message: "With A+B armed the new key re-visits the cell once for the new aimed
plane; `buildPlaneEntries` pushes an entry only `if (oldColl !== newColl)`, so both lists come
back empty and `paintCollisionCell` returns before `recordPaint`: no extra entry lands. (Read,
not measured.)"

I measured it with a scratch row in the same block, removed afterwards with `git checkout HEAD`.
A+B armed. Press on cell 1's top-left tile. B. Move to cell 1's bottom-right tile (same cell).
Release. Before release: `{"a":[514,515,770,771],"b":[514,515,770,771]}`. After one undo:
`{"a":[],"b":[]}` and `canUndo` `false`. **One command, as the message said.** I did not commit
it as a row. Two guards hold it: the empty-list return in `paintCollisionCell`, and
`endPaintStroke`'s `entries.size === 0` return, which drops an empty stroke even if the first
guard is removed. No single plant turns it red, so a row would guard nothing a reader could see
fail.

---

## 3. The foreground: `harness:map-behaviour-fixes` parts m1 and m2 on today's tree

**Rig.** As recorded in that harness's header. `VITE_AURORA_DEBUG=1 npm run build` in this
worktree. `AEON_DIR` names an rsync copy of the aeon tree (`.git` and `.claude` excluded, 238M)
taken 2026-09-25T14:24:05Z into this session's scratchpad, with aeon HEAD at `f6f8a635`. Each run
copies it again into its own mkdtemp. `AURORA_BUILT_TREE` names this worktree, and `ELECTRON_BIN`
names the main checkout's electron. Every run printed `root:` and `pinned:` naming this worktree,
`build: FRESH`, `build flavour: DEBUG` and `in-tree: yes`. No emulator: `ORACLE_SOCKET` points
into the run's own mkdtemp.

What the two parts assert, read from the finals (the rows are the harness's, unchanged):

- **M1.a** A real click on Plane B, then on Plane A. Each moves the plane, and afterwards
  `document.activeElement` is `<body>`.
- **M1.b** With the stroke held, a real bare Space presses no Plane button, and the plane stays A.
- **M1.c** CONTROL. One undo takes back the one-plane stroke.
- **M2.0** PREMISE, and the brief's foreground clause as ruled. With the stroke held, **2** real
  Tabs stop at `["BUTTON:A:Plane","BUTTON:B:Plane"]`. A real Space clicks Plane B (`detail 0`),
  the plane is `b`, and the canvas has not moved. The two aims (324,146) and (340,162) are one
  16px cell (1,2) and two 8px tiles.
- **M2.a** The O2 fix on screen. A move inside that same cell paints it on plane B (four sub-tiles
  `12290`), and plane A keeps it. The Space did not end the drag: this row's paint comes from
  the same held stroke.
- **M2.b** CONTROL (M3). The stroke continues onto the next cell on B, gives two commands, and
  the first Ctrl+Z takes back only the B run.

| run | src | parts | totals | time | display |
|---|---|---|---|---|---|
| dev | identical to HEAD (`523c61b0`) | m1,m2 | 8/8 PASS, 0 FAIL, 0 UNMEASURABLE | 27.8 s | dpr 1, canvas rect {284,74,876,774} |
| red-m2 | O2 key reverted (the diff in section 1), rebuilt, `src on disk: DIFFERS FROM HEAD` | m2 | **3/4, FAIL M2.a**: "cell k on B [0,0,0,0]; on A [12290,12290,12290,12290]". M2.0 and M2.b PASS | 19.4 s | dpr 1 |
| **final1** | identical to HEAD, rebuilt after `git checkout HEAD --` | m1,m2 | **8/8 PASS, 0 FAIL, 0 UNMEASURABLE** | 27.4 s | dpr 1 |
| **final2** | identical to HEAD | m1,m2 | **8/8 PASS, 0 FAIL, 0 UNMEASURABLE** | 27.4 s | dpr 1 |
| **final3** | identical to HEAD | m1,m2 | **8/8 PASS, 0 FAIL, 0 UNMEASURABLE** | 27.4 s | dpr 1 |

Every final printed "no mouse event reached the page at a position this harness did not send"
for both parts. Load average ran from 10 to 11 across the runs. Every run was at dpr 1. The
harness's 1.35 path was not exercised today. `SETUP.0` recorded
`open "threw: ... Promise was collected"` while the project opened. f7-warp-landing observed the
same thing.

**No red run for M1 today.** M1's rows are not mine and nothing in this parcel touches them. The
red-m1 run in the 2026-09-12 packet is their proof. I did not re-plant it here.

**Re-run command for the overseer** (from this worktree, after `VITE_AURORA_DEBUG=1 npm run build`):

```
AEON_DIR=<a copy of aeon> AURORA_BUILT_TREE=<this worktree> \
  ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
  PART=m1,m2 npm run harness:map-behaviour-fixes
```

---

## 4. Suite

| tree | `npm test` (`VITEST_MAX_WORKERS=4`) | Test Files | Tests | run-completeness |
|---|---|---|---|---|
| base `5c6c85f3` | exit 0, 14:21:11 to 14:22:36Z | 672 passed \| 3 skipped (675) | 10485 passed \| 18 skipped (10503) | `COMPLETE, 675 of 675 module(s) this run selected finished.` |
| tip `523c61b0` | exit 0, 14:26:55 to 14:28:20Z | 672 passed \| 3 skipped (675) | 10486 passed \| 18 skipped (10504) | `COMPLETE, 675 of 675 module(s) this run selected finished.` |

+1 test (the M3 row, in an existing file). Both runs printed `failure-class: no failures in this
run (675 module(s) reported)`. The tip run printed `skip-report: OK. Every skip named its reason`.

---

## 5. Still open on the row

- **The ledger's carried list was stale beyond this parcel's items.** The same 2026-09-12 landing
  also fixed M4 (brush size latched, `3abca0b8`) and M6 (a stamp press refreshes the link hover,
  `0b45bf77`). Both are ancestors of `5c6c85f3`, and each has node and live rows in that packet.
  The f7-warp-landing line still lists "the stamp press not refreshing the link hover" and
  map-coverage-4's three as behaviour questions. I did **not** re-measure M4 or M6. The ledger
  line records them as closed by that landing on its packet's evidence, not by mine.
- **Still owner-parked:** M5 (a paint-block drag paints one block) and M7 (the cursor readout
  freezes during drags, look-adjacent). They are held until the hub relays the owner's words.
- **The M1 note.** Tab then Space still switches the aimed plane mid-stroke (M2.0: 2 Tabs). The
  2026-09-12 packet §5.1 records it, and it is on the owner's review list through the hub. It is
  not a new ruling, and this parcel adds nothing to it.
- Everything else the previous line listed as foreground-only, unchanged: the stamp ghost during
  a link hover and the Chunk links panel on screen; the Effects-facet-gated guide drag, the
  screen frame's locked-scene arm and `resolveEscape`'s lens arm; the paste ghost, the collision
  hover preview, the band preview, and the hover bar's legibility. "Cannot be a row today" is
  unchanged.
