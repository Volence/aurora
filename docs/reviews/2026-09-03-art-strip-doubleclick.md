# The Art strip moved out from under its own double click

**Branch** `fix/art-strip-doubleclick`, cut from master `d79b6f06` in a linked
worktree (`.claude/worktrees/agent-ac57be697de6b19e4`).
**Window** 2026-09-03T09:41:24Z → 10:03:53Z, uptime 8 days 21:30 → 21:52.
Every UTC time below is a local mtime converted at this box's `date +%z` =
`-0400`, read after the fact; the two ends of the window are `date -u` readings
I took myself. **No emulator: no `mcp__oracle__*` call was made.**

**Environment for every runtime figure**

- the app under test is **this worktree's own build** — `VITE_AURORA_DEBUG=1 npx
  electron-vite build`, launched with `AURORA_BUILT_TREE=<this worktree>` so
  `run-root.mjs` prints `pinned:` rather than `BORROWED`.
- `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` — a
  linked worktree has no `node_modules/.bin/electron`. (`node_modules` itself is
  a symlink to the main checkout's, which is gitignored and untracked.)
- `AEON_DIR=/home/volence/.cache/o50door/aeon` — a throwaway `git -C
  <live aeon> archive HEAD | tar -x` of aeon **73b07a4f** (1356 tracked files,
  52M), on the same ext4 filesystem as the repo. It has to be: the harness
  materialises its fixture with `cp -al`, which cannot cross tmpfs, so an
  `AEON_DIR` under `/tmp` dies with `Invalid cross-device link` before any row
  runs. The live aeon tree was never opened and never written — harness row
  `[8b]` re-hashes it every run.
- xvfb, `1680x1050x24` unless a row says otherwise.

---

## A. The defect, and what it actually was

**Double-clicking a background tile in the Layout column's Art strip never
opened its composer, and left the band stamp armed instead.** Nothing threw and
nothing looked broken; the tile simply never opened. ROADMAP row 57 shipped
`openBgTileDocument` and it was unreachable from any human gesture.

The mechanism was diagnosed by the O50 triage
(`docs/reviews/2026-09-03-o50-triage-bganim.md` §A1, merge `07816a45`) and is
reproduced here exactly, on my own build, before any change:

```
                       strip canvas top   tool          under the aim (1187,443)
  before the gesture   381                view          CANVAS#art-browser-canvas
  BETWEEN the halves   525.5625           paint-tile    CANVAS in DIV#art-browser-bands
  after  the gesture   381                stamp-band    CANVAS#art-browser-canvas
  window.__dbg.aeon.stripOpen().gestures  0 throughout
  inter-click gap      45ms
```

The first press/release of a double click is an ordinary click:
`ArtBrowser.handleClick` picks the slot and arms `paint-tile`, and
`layout-facet.tsx` rendered the **Brush** `CollapsibleSection` for exactly that
tool **immediately above** the `aeon.art` section. The strip was pushed down
**144.5625px — the Brush section's own height**. The second click landed on the
band-card row that had slid into its place, armed `stamp-band`, and that
un-mounted Brush and put the strip back. `dblclick` never reached the strip's
container.

**The panel moved under the cursor mid-gesture.** The composer was the symptom.

---

## B. What else the mechanism reaches — a verdict per path

A reachability claim is an enumeration problem, so this is the enumeration, not
a spot check. The fault needs **three** things at once:

1. a section that hosts a **multi-step pointer gesture** (a double click, or a
   drag whose first step commits something);
2. a section **above** it whose PRESENCE is conditional;
3. the gesture's **own first step** changing the state that condition reads.

### B.1 Every multi-step pointer gesture in a panel

`grep -rn "onDoubleClick" src/renderer/` — five live sites, plus the drags.

| # | site | column | first click does | above it | verdict |
|---|---|---|---|---|---|
| 1 | `components/ArtBrowser.tsx:459` (strip) | layout `aeon.art` | `setSelectedTileIndexForLayer` + **`setTool('paint-tile')`** | the tool-conditional `aeon.layoutOptions` slot | **THE DEFECT.** All three conditions. |
| 2 | `components/ArtBrowser.tsx` strip DRAG (`resolveStripDrag`) | layout `aeon.art` | `handleMouseDown` **only records** the anchor — "the press only records", item 43 wave 2 | same | **SAFE.** The tool changes at mouseUP, after the gesture is over. Held by harness `[6a]`/`[6b]`. |
| 3 | `components/SectionGridNav.tsx:188` | layout `aeon.sections` | `selectSection` → `setActiveSectionIndex` (no tool, no section-list change) | **nothing** — it is the first section in the column | **SAFE, doubly.** |
| 4 | `components/shared/ChunkGrid.tsx:240` via `ChunkLibrary` | layout `aeon.layoutOptions` | `chunk-grid-aeon.ts:186` `setSelectedChunkId` — no tool change | only `aeon.sections`, unconditional | **SAFE.** |
| 5 | `components/shared/ChunkGrid.tsx:240` via `ChunkLibrary` | art `art.chunks` (last) | same | `art.collision` is conditional but reads `tool`/`open`, neither of which a chunk select touches | **SAFE.** |
| 6 | `components/art/TilesetPanel.tsx:386` | art `art.tileset` | `setBrushTile` → `artStore.ts:164 set({ brushTile })`. **It does not touch `tool` or `open`.** | `art.collision` (`tool === 'collision' && open !== null && …`) | **SAFE — and it is the near miss.** If that click ever armed a paint tool the way the strip's does, this facet acquires the identical bug. Row `[3]` of the node gate is what would then fail. |
| 7 | `components/effects/RasterTimelineStrip.tsx:294` + its edge drag | effects, colour tab | `endDrag` refuses to run a command when the edge did not move (`if (band[d.edge] === d.line) return;`), so the first half commits nothing | **nothing** — it is the first element of the tab body, under the sticky `SectionPicker` | **SAFE.** (Also another agent's files this session; read only, not touched.) |
| 8 | `components/MapViewport.tsx` map drags | not in a panel | the only `setTool` there is `setToolScoped`, reachable **from keyboard hotkeys only** (`MapViewport.tsx:1842-1850`) | — | **SAFE.** No pointer path arms a tool, and the map is not inside the column. |

### B.2 Every facet column with conditional section membership

`grep -rn "CollapsibleSection id=" src/renderer/workspace/facets/` over all eight
facet modules:

| column | conditional sections | verdict |
|---|---|---|
| `layout-facet.tsx` | `aeon.layoutOptions` ×3 arms + `aeon.chunkLinks`, all on `tool`/`pasting` | **the one column with the fault** |
| `art-facet.tsx` | `art.collision` (`showCollisionPanel`) | conditional, and **above two double-click hosts** — safe only because nothing in that column arms a tool (B.1 #5, #6). Recorded by name in the node gate, not exempted silently. |
| `objects-facet.tsx`, `rings-facet.tsx`, `collision-facet.tsx`, `palette-facet.tsx`, `effects-facet.tsx` | none | **SAFE** |
| `s1-facets.tsx` — all five classic columns | **none at all** | **SAFE.** Worth stating because classic's chunk picker DOES arm a tool (`classicLevelStore.ts:558`, via `selectChunkForStamp`) — it is inert here purely because no classic column has a conditional section. |

### B.3 The two things that are NOT this fault, and why the distinction matters

- **`ArtBrowser`'s own height flips 180 ↔ 270** with `bandGroups.length > 0`.
  That moves everything BELOW it, and it moves when the layer tab or the active
  section changes. Both are single clicks that complete; nothing hit-tests
  afterwards. It is a settled-state shift, not a mid-gesture one.
- **`TilesetPanel`'s header-actions row mounts after a successful open**, pushing
  its own canvas down. Again after the gesture, not during it.

**Verdict: one instance, and it is the one that was reported.** The near miss is
`art-facet.tsx`, and the guard names it.

---

## C. The fix, and the three I rejected

**Chosen: `aeon.art` moves ABOVE the tool-conditional slot** — the column is now
Sections → **Art** → `[Chunks | Marquee/Paste | Brush]` → Chunk links →
Properties. Arming a tool from the strip can no longer move the strip, because
nothing above it is conditional.

The `aeon.layoutOptions` slot keeps all three arms and its shared id: **the whole
group moved together**, so the "one id for a retitling slot" argument in that
section's own note is untouched. Nothing in this change required breaking it, so
there is no BLOCKED item here.

**Cost, stated:** the chunk library now sits below a 180–270px Art section in a
240px column. That is a real ergonomic cost to the facet's busiest tool, paid to
put the gesture host where nothing can move it. The Art section is collapsible
and its collapse state persists, which is the mitigation available.

### Rejected

| candidate | why not |
|---|---|
| **Reserve the slot's space always** (render `aeon.layoutOptions` unconditionally) | It fixes membership, not geometry. The three arms have different heights — a 144px Brush against a `flex: 1 1 0` chunk grid — so arming still reflows. Making the slot a FIXED height would work and clips the chunk grid to a box it cannot use. |
| **Let the strip own the double click** (move it to `mousedown`, use `e.detail`, or `setPointerCapture`) | It cannot work while the panel moves, and I checked rather than assumed: pointer capture is implicitly released at `pointerup`, so the SECOND `mousedown` of the gesture hit-tests normally and still lands on whatever slid into the strip's place. More importantly it treats one gesture and leaves the fault armed for the next one added to this column. |
| **Do not arm a tool on the first click of a potential double click** | The only implementation is a timer — wait and see whether a second click arrives. That is the forbidden shape: the panel is still moving, and the arming behaviour is deliberate (`ArtBrowser`'s own comment: "the tile you are about to draw is the tile in your hand"). |

### The residue, stated rather than implied

`aeon.sections` above the Art section is a `list` variant — `flex: 1 1 0` with a
`SECTION_LIST_MIN_HEIGHT` floor of 160. In a column with **more than zero and
less than one Brush-height of slack** it can still SHRINK when an options section
mounts, which would move Art UP. No ordering can eliminate that: it is a
consequence of adding a content section to a column containing a flex list, and
only reserving the space could rule it out.

**Measured, both ends:** the strip's top is 381 before the gesture and 381
between the halves at **1680x1050** and at **1280x700** (§D). Neither
configuration is in that regime. The band in between was not exercised, and I am
not claiming it.

---

## D. The runs

Instrument: `scratchpad/bganim-tile-door-harness.mjs`, driven exactly as §
Environment says. Times are completion times.

| # | build | screen / dpr | result | completed (UTC) |
|---|---|---|---|---|
| 1 | **UNFIXED** (base ordering) | 1680x1050 / 1 | 8 PASS, **`[4b]` and `[4b2]` RED**, exit 2 | 09:49:03Z (bracketed by my own `date -u` at 09:41:24Z and 09:49:54Z) |
| 2 | fixed, harness untouched | 1680x1050 / 1 | 17/19 — `[4b]`, `[4b2]`'s subject and `[4c]`…`[8b]` green; **`[6-pre]`/`[6a]` red** (§E) | 09:50:25Z |
| 3 | fixed, `[4e]` first cut + §6 repair | 1680x1050 / 1 | 19/20 — `[4e]` red on its own `endGeom` gate, my error (§E) | 09:52:54Z |
| 4 | fixed, `[4e]` final | 1680x1050 / 1 | **20/20, exit 0** | 09:54:42Z |
| 5 | **PLANT A** — the ordering reverted | 1680x1050 / 1 | **exit 2**, `[4b]` + `[4b2]` RED | 09:58:16Z |
| 6 | **PLANT B** — a 4px conditional spacer above Art | 1680x1050 / 1 | 18/20 — **`[4b]` GREEN**, `[4c-pre]` + `[4e]` RED | 09:59:22Z |
| 7 | fixed | **1280x700** / 1 | **20/20, exit 0** | 10:00:42Z |
| 8 | fixed | 1680x1050 / 1 | **20/20, exit 0** | 10:01:55Z |
| 9 | fixed, `SCALE=1.35` | 1680x1050 / **1.35, fractional rect** | **20/20, exit 0** | 10:02:36Z |

Four green runs across three environments, and `devicePixelRatio` is printed by
the harness on every one (1, 1, 1, **1.35**) — this box has been seen at both,
hours apart, so the fractional case is forced rather than waited for. Run 9's
strip rect is `{"left":1005.926…,"top":378.657…,"width":224.444…}`; every aim is
still an integer that re-derives through the app's own slot formula.

### Run 6 is the important one

A 4px conditional spacer above the Art section shifts the strip by less than one
cell, so the aim (cell centre, 8px into a 16px item at an 18px pitch) still lands
on slot 37:

```
  [4b]  PASS   report={"kind":"open","slot":37,"openedTileIndex":37,"gestures":3}
  [4e]  FAIL   strip BEFORE  top 381
               strip BETWEEN top 385
```

**The outcome row cannot see the mechanism.** That is the whole argument for
`[4e]`, demonstrated rather than asserted.

---

## E. What each new or changed assertion was proven with

Every mutation was applied to disk, **quoted back from `git diff` before the red
run**, and restored with `git checkout HEAD -- <path>` from a committed baseline.

| gate | mutation | red evidence |
|---|---|---|
| harness `[4b]`, `[4b2]` | PLANT A — `aeon.art` moved back below the Brush section | run 5: exit 2, `slot 37 did not open`, strip top `381 → 525.5625` between the halves |
| harness `[4e]` | PLANT B — `{!pasting && (tool === 'paint-tile' \|\| tool === 'paint-block') && (<div style={{ height: 4, flexShrink: 0 }} />)}` above the Art section | run 6: `[4e]` RED at `top 381 → 385` **with `[4b]` still green** |
| node `[1]` (anti-vacuous) | PLANT C — `if (String(section.guard) === String(section.guard)) return false;` at the head of `toolConditional` | `no section in the layout column reads as tool-conditional — row [2] would pass on nothing: expected [] to include 'aeon.layoutOptions'`. **`[2]` went GREEN under this plant** — which is exactly the vacuity `[1]` exists to catch. |
| node `[2]` (the rule) | PLANT A, same edit as above | `expected [] to deeply equal [ "aeon.layoutOptions — guard: … {!pasting && tool === 'stamp-chunk' && (", "aeon.chunkLinks — …", "aeon.layoutOptions — … {(tool === 'marquee' \|\| pasting) && (", "aeon.layoutOptions — … {!pasting && (tool === 'paint-tile' \|\| tool === 'paint-block') && (" ]` — all four named, with their guards |
| node `[3]` (enumeration, half 1) | PLANT C (it blinds this half too) | `expected [] to deeply equal [ 'art-facet.tsx:art.collision' ]` |
| node `[3]` (enumeration, half 2) | PLANT D — a `.setTool(` call added to `components/TileBrushOptions.tsx` | `+ "components/TileBrushOptions.tsx"` — the file named in the diff |

**The runner is named:** the node rows are
`src/renderer/workspace/__tests__/panel-gesture-order.test.ts`, executed by
`npm test` (vitest, `vitest.config.ts`) with no registration needed — it is a
`__tests__` file under `src/`, which is the config's own include. The harness is
NOT nameable by a `package.json` script; that is the registration hole the O50
sweep named, and this parcel does not close it.

**Expectations are derived, not typed:** the harness reads `itemSize` and the
grid pitch out of `ArtBrowser.tsx` in-process, the override path out of the
consumer contract JSON, the document name out of `bg-anim-art.ts`, and both slot
aims off `bandBudget().firstPromotableSlot`. The node gate reads every section
id, guard and `.setTool(` site off source.

### Two corrections against myself

1. **My first `[4e]` gated on `endGeom`** (run 3) and was red for a reason that
   is the door WORKING: a successful open switches to the Art facet, which
   unmounts the strip, so `STRIP_GEOM` answers `null` afterwards. It is printed
   now, with the reason, and not gated.
2. **My first `[4e]` did not disarm the tool first.** `panel BEFORE` read
   `tool: "paint-tile"` — left over from an earlier section — so "the tool is
   `paint-tile` between the halves" would have been true without the gesture
   doing anything. It now clicks the panel's own band card to arm `stamp-band`
   first, CHECKS that took, and requires the transition `stamp-band →
   paint-tile`. That is the difference between reading a still frame and reading
   a change.

---

## F. The harness's section 6 was stale, and nobody could see it

Run 2 turned `[6-pre]` and `[6a]` red — **on the fixed build, in code I had not
touched.** They are not a regression:

- **Section 6 had never executed.** Until the app fix, this file threw at `[4b]`
  and sections 5–8 were unreachable. The O50 triage repaired the identical pair
  in six sibling harnesses on 2026-09-02 and could not reach this one.
- **The two causes are that same pair.** `providers/effects-sub-tabs.ts:94` puts
  `aeon.bganim.new` on the `tileAnim` job (a section on another job is
  **UNMOUNTED, not collapsed**), and `023e0ed9` renamed the disclosure to
  `New tile animation` (`BgAnimBandPanel.tsx:635`).
- **The app answered correctly.** On the first run that reached it, the drag
  resolved `{kind:"range", anchorSlot:34, releaseSlot:44, staticBase:34,
  cols:11, rows:1}` — right for rows=1, which is what `setRows=no-element` left
  the candidate on. `[6a]` divides by rows and failed as a consequence of the one
  line above it, which is what `[6-pre]` exists to separate.

Repaired as its own commit (`2663b5b3`), and `[6-pre]` now prints the sub-tab
result and the section state so "the tab is wrong" and "the control is gone" stop
looking alike.

---

## G. `npm test`

```
Test Files  1 failed | 470 passed | 2 skipped (473)
     Tests  1 failed | 6536 passed | 8 skipped (6545)
```
`npm test` in this worktree, completed 2026-09-03T10:03:06Z, uptime 8d 21:52.

**Failing:** `test/formats/effects-preset-schema-drift.test.ts > the
contract-leads-consumer lag at aeon 79f5af7e is EXACTLY the premise list`.

**Not mine, and measured rather than assumed.** I checked out `d79b6f06` in this
same worktree and ran that one file: **1 failed | 15 passed**, identical row,
identical message. It is a cross-repo drift row and it went red because **aeon
got better** — the measured lag SHRANK to `[]`, i.e. aeon has now built
`patch_motion` and `patch_world_ys`, and the row's own message says the fix is to
remove those names from `PRESET_KEYS_AWAITING_AEON` and re-date it. That is the
effects lane's call and touches `src/core/formats/effects/preset-lag.ts`, so I
left it alone.

**Reconciling with the controller's baseline** (`d79b6f06`, 6535 passed / 0
failed / 7 skipped = 6542, measured in the main checkout). The arithmetic closes
exactly:

```
  6542  controller's total
    +3  my three rows in panel-gesture-order.test.ts
  ----
  6545  mine ✓

  6535  controller's passed
    +3  my three rows, all green
    -1  test/support/sibling-root.test.ts's step-3-in-a-MAIN-CHECKOUT row, which
        SKIPS in a linked worktree and says so in its own skip message (7 -> 8)
    -1  the effects-preset drift row, which has since gone red for both of us
  ----
  6536  mine ✓
```

So the two instruments differ by exactly two things and both are named: **the
worktree** (one row cannot be measured here) and **the aeon tree moving under a
cross-repo row** (one row was green when the controller measured and is red at
`d79b6f06` now).

`skip-report: OK — every skip named its reason.`

---

## H. Commits

`git log --oneline d79b6f06..HEAD`, oldest last:

```
01cb2cad fix(layout): say only what was measured about the flex residue
81828cab test(workspace): hold the panel-column order, and the enumeration behind it
2663b5b3 harness(tile-door): [4e] holds the MECHANISM on a run that passes, and section 6 was stale
30b62100 fix(layout): the Art strip moved out from under its own double click
```

(plus this file.)

---

## I. Open, and what wants the controller

1. **⚠ WANTS A FOREGROUND RUN ON THE OWNER'S DISPLAY.** Every figure here is
   xvfb at 1680x1050 and 1280x700. 144.56px and "the nav is not in the shrink
   regime" are LAYOUT numbers and the panel is resizable, so the residue in §C
   is a claim about two window sizes, not about every one. The reproduction is
   one gesture: Layout facet → Art → BG layer → double-click any slot ≥ 32.
2. **The effects-preset drift row** (§G) is red at `d79b6f06` and is the effects
   lane's to close — aeon built the two keys the premise list is still waiting
   for. Reported, not touched.
3. **The harness is still unregistered.** No `package.json` script names
   `bganim-tile-door-harness.mjs`, which is why a 2026-09-02 rename was still
   undiscovered in its section 6 on 2026-09-03. The node gate added here runs in
   CI and holds the STRUCTURE; the BEHAVIOUR still only runs when someone
   remembers the file.
4. **`art-facet.tsx` is one `setTool` away from this bug** (§B.1 #6). Not
   changed — there is no defect there today and reordering it would be a UI
   change with nothing behind it — but it is the row the node gate will fail
   first, by name, if that ever changes.
