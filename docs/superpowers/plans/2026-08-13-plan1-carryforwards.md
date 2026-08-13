# Plan 1 — running carry-forwards and deviations

Live notes from executing `2026-08-13-ux-overhaul-stage4-plan1-history.md`.
Fold the durable parts into the spec when Plan 1 merges.

## Re-slicing actually executed

Plan order was 1..12. Executed order:

1. Tasks 1+2 (`UndoStack`, `BoundEditHistory`) — `3cef3fe`, `891318d`
2. Task 3 (hub generalization) — `da4662d`
3. **Task 3b (unplanned bridge)** — `834bcba`
4. Tasks 4+5 (zone-art doc ids, classic domain split) — `2795343`, `c33b1dd`
5. Task 6 (route classic commits) — `1ba64d8`, `2920652`
6. **Task 6b (unplanned bugfix)** — `ff42962`
7. Task 7 (multi-doc sprite store) — `2fcd171`
8. Tasks 8+9+10 combined (see below) — `d3b900c`, `3f6d3dc`
9. Task 11 + two live gaps — `30412b3`, `cec2acf`, `bde1efd`

### Why Task 3b existed

Task 3 made `historyFor` throw when no factory is registered, but nothing
registered one until Task 6/8. The plan anticipated the resulting `tsc` error
and deferred it to Task 9 — it did **not** anticipate that it also reds 17
tests across 4 files. That would have left the tree broken across Tasks 4–8,
destroying the green baseline every later review depends on.

Task 3b registers only the aeon `level:` factory, created
`history-factories.ts` early, and wired `registerHistoryFactories()` into
`App.tsx`'s runtime-wiring effect plus a vitest setup file.

**Consequence: the plan's known ordering hazard is gone.** Task 6 no longer
registers a classic-only `level:` factory that would hijack aeon docs; it was
directed to write the engine-dispatching version directly. Nothing in the
branch ever had a hijacking factory.

### Why Task 6b existed

Both classic snapshot types captured the store's whole `DirtyDomains` map and
restored it wholesale, so with two independent stacks, restoring one document
clobbered the other's dirty flags:

    edit fg -> edit palette -> undo the fg step  ==>  dirty.palette wiped
    while the palette edit is still in the doc

The UI then reports no unsaved changes over real edits — a silent data-loss
path. Fixed by narrowing what the read functions capture (structural
invariant) and restoring per-domain with set-and-clear semantics.
Helpers `pickDomainDirty` / `restoreDomainDirty` live beside the domain lists.

An existing test's comment had enshrined the old clobbering as intended
design; it was corrected and the redo order flipped to prove order no longer
matters.

## Deviations from plan text worth keeping

- **Sprite store uses a checkout model, not map-as-truth.** The active doc
  lives on the store root; `docs` holds only parked docs. Map-as-truth would
  have forced ~50 read-site rewrites across 13 UI files and rendered an empty
  editor between Tasks 7 and 11. `SpriteDoc` was widened past the plan's nine
  fields (adds `name`, `originX/Y`, `exportDplc`, `format`, `characterAnims`)
  because parking only nine leaks one sprite's identity onto another.
  `UNTITLED_SPRITE_DOC_ID` keeps `activeDocId` non-null so every edit has a
  stack; it deliberately does not parse as a sprite-doc tab id.
- **`SnapshotHistory<S>`** was promoted to `src/core/editing/snapshot-history.ts`;
  classic layout/art and sprite doc histories all extend it.
- **Domain partition is now self-enforcing:** `assertSingleDomain` throws in
  `commitLayout`/`commitArt` if a dirty patch names a key outside that
  function's list. The ten-site audit was independently re-verified twice
  during execution and holds.

## Open items for Task 11 — ALL CLOSED (see "what actually landed" below)

As handed to Task 11 (each item's resolution is in the next section). Task 7
built the multi-document sprite capability but left it **dormant** —
`openSpriteDoc` / `activateSpriteDoc` / `closeSpriteDoc` had no production
caller. Task 11 wired tab activation to them, and while doing so:

- `planSpriteDocActivation` must check out an already-open doc instead of
  reloading it. Its "Discard & open" confirm becomes a lie once switching no
  longer discards.
- `dirty-tabs.tabHasDirtyDot` still dots only `loadedSpriteDocId`, so
  background sprite docs will show no dirty dot.
- `project-runtime`'s `sprite-art` saver reports dirtiness for the checked-out
  doc only. Correct today (`saveSpriteArt` can only write the checked-out
  sprite) but under-reports once background docs exist.
- `resetProjectRuntime()` clears hub stacks but not `spriteStore.docs`;
  Task 11 should call `closeAll()` on project close. Deferred from Task 7
  because adding it there would blank the canvas on project switch.

## Task 11 — what actually landed (all four open items closed)

Task 11 absorbed two live gaps plus its own scope. Deviations worth keeping:

- **Classic facet signal (unplanned, highest priority).** Classic art edits
  recorded on `zoneart:<zone>` but `focusedHistory()` read `facetFor(tab)`,
  which only aeon's FacetBar ever wrote — so a classic tab always read
  `'layout'` and Ctrl+Z after an art edit reverted an unrelated layout step.
  Fixed with `components/classic/classic-surface.ts`: each classic surface
  claims its facet on pointer-down (capture) + focus-in. Composer dock and
  palette panel claim `art`; map viewport, object inspector and object library
  claim `layout`. It writes `setFacet` directly, NOT `switchFacet`, because
  switchFacet also re-scopes the aeon `editorStore.tool` and classic runs its
  own tool system. A source-level guard test
  (`classic/__tests__/classic-surface.test.ts`) fails if a component that issues
  a classic command stops declaring a surface — the renderer suite is node-only,
  so there is no component test that could see the wiring otherwise.
- **The sprite switch confirm is gone, not reworded.** Once activation parks the
  outgoing document, switching discards nothing, so there is nothing to confirm.
  The confirm moved to `requestCloseTab` (the only sprite path that still
  destroys work) as Save & close / Discard & close / Cancel.
- **Save is offered only when the document has an `s1ArtSource`.** The plan
  assumed a context-free `saveSpriteDoc(docId)`; there isn't one. An aeon sprite
  document's "save" is Export, which needs a name and ≥1 animation step and can
  fail for reasons a close dialog can't resolve — so that dialog states there is
  no save-back file instead of offering a button it can't honour. Worth
  revisiting if sprite Export ever becomes a plain save.
- **Sprite activations are serialized** (`spriteActivations` promise chain)
  rather than generation-cancelled. The loaders write into whatever document is
  checked out when their awaits resolve; with one editor that produced a stale
  view, but with per-tab documents it would have spliced one sprite's pixels AND
  its save-back target into another's document.
- **`loadedSpriteDocId` deleted.** `spriteStore.activeDocId` is the checked-out
  document — the value `recordEdit` records against — so a second marker could
  only drift. `getLoadedSpriteDocId()` now derives from it.
- **Ctrl+S saves every dirty sprite document with an art target**
  (`saveAllSpriteArt` → `saveSpriteDocArt`). Reporting only the checked-out
  document would have left a background tab dirty after a save the user believed
  covered everything. *(Task 11 implemented this by checking the target out for
  the write and restoring the previous checkout; the final review replaced that
  with by-id addressing — see "Final-review fixes" below.)*
- `resetProjectRuntime()` now calls `closeAll()`. The Task-7 concern (blanking
  the canvas on project switch) is resolved by the wiring: session restore runs
  immediately after and re-activates the restored sprite tab, which loads its
  document again.

Still open after Task 11 (pre-existing, not introduced here): the sprite UI's
Load / New / Import buttons replace the CHECKED-OUT document's content in place,
so they can leave a tab titled for one sprite holding another. They predate
multi-document and were left alone.

## Final-review fixes

Four findings from the pre-handoff review, in the order they were fixed.

### 1. Commands have a SCOPE, and ambient callers route by it

`executeCommand` resolves its document from FOCUS (`focusedDocId`) and throws
when the focused document owns no aeon command history. Two caller groups are
not focus-driven and broke on it:

- `PaletteEditor` is mounted inside the sprite pane (`SpriteMode` renders it
  with `context="sprite"`), still renders ZONE palette rows there, unlocks line
  0, and builds "Copy to ▸ Zone line N" targets unconditionally. With an aeon
  sprite-doc tab active all three of its zone writes threw inside a React event
  handler. (Classic was only accidentally safe: `getCurrentZone()` is null, so
  the guards early-returned.)
- Every aeon agent edit tool. `activeHistory()` derived the act from
  `projectStore`; `focusedDocId` derives from `sessionStore.activeId`, so
  `set-palette` / `write-tiles` / `stamp-chunk` / … failed as MCP errors
  whenever the active tab was Home, a tool tab, or a sprite doc — a silent,
  untested narrowing of the agent API.

`executeAmbientCommand` (editorStore) resolves the document from the COMMAND's
scope using `projectStore`'s current zone/act, as `activeHistory()` did.

**The act/zone split is read off `core/editing/history.ts`, not guessed:**
`set-palette-line`, `set-tileset-tiles` and `set-chunk` are the only members of
`AnyCommand` whose apply/undo touch `level.palette` / `level.tileset` /
`level.chunkLibrary` — the zone-level fields of `S4Level`. Everything else
writes `level.sections[...]` or `level.act`. A `batch` is zone-scoped only when
every leaf is; one act-scoped child pins the step to the act. Keep
`ZONE_SCOPED_COMMAND_TYPES` in step with `applyCommand`.

This also stops a zone-scoped ambient edit made while the layout facet happens
to be focused from landing on the ACT stack, where closing that act tab would
have discarded it.

`focusedHistory()` stays focus-driven — correct for the undo/redo controls,
which must reach back into what the user was looking at.

### 2. The sprite art save no longer clears a dirty flag over unwritten bytes

`saveSpriteArt` read `frames` synchronously, awaited `writeGuarded`, then cleared
`unsavedEdits` unconditionally. A stroke committed during the await went through
`recordEdit` into the document being saved, was not in the bytes on disk, and
was then marked clean — no dirty dot, discarded on close with no prompt.

It also read and wrote the store ROOT, so saving a parked document checked it
out for the duration of the write. The old comment claimed nothing flickers
because "the sprite pane renders only the active tab's document" — **wrong**:
the pane renders the store root and `activateSpriteDoc` is a `setState`, so the
user's canvas repainted with another sprite for the whole write and any stroke
in that window landed in the wrong document.

`saveSpriteArt(docId?)` now addresses its document by id in both directions —
`spriteDocState` to read, the new `patchSpriteDoc` to write back — so **no
checkout happens at all**. After the write it re-reads the document (it may have
moved or closed across the await) and clears `unsavedEdits` only when its pixels
still match what was written; otherwise the save succeeds, the mtime baseline
refreshes, and the document stays dirty with a toast saying so.
`saveSpriteDocArt` is now a thin alias.

Still open (pre-existing, unchanged): palette and timeline edits also set
`unsavedEdits`, and this path writes art bytes only — so an art save still
over-clears those. Narrow, and separate from the race.

### 3. Classic commits check the stack type instead of casting

`commitLayout`/`commitArt` cast `historyFor(id)`. The hub's `level:`/`zoneart:`
factories pick the stack type from `classicIsOpen()` at CONSTRUCTION time, so a
stack built outside a classic `'open'` status is an aeon `BoundEditHistory` and
`.record(...)` blew up as "record is not a function", naming nothing. Now an
`instanceof` check naming the doc id, what it found and what it wanted. No live
repro is constructible (timing saves it); the test forces the shape by building
the stack with the project store in `'opening'`.

### 4. `BoundEditHistory.onCommand` is covered

It is the whole aeon repaint path (`notifyCommandApplied` → `bumpStoreVersions`
+ the invalidation listener) and every existing construction omitted the third
constructor argument. Now asserted on execute, undo and redo, with the command
each step actually moved. Verified by mutation.

**Deliberately NOT changed** (owner decisions): `focusedHistory()`'s focus-driven
routing; closing a dirty level tab still drops its undo stack without warning;
`parseZoneArtDocId` stays unused.

## Live behaviour changes already in the branch

- Cross-domain classic undo no longer walks a single global recency timeline.
  That is the intended end state of the split, not a regression.
- A sprite edit no longer invalidates the level redo stack (the sprite store
  stopped registering an undo-bus clearer). Intended; the bus is deleted in
  the combined 8+9+10 step.

## Baselines observed

| After | Files | Passed | Skipped | Failed |
|---|---|---|---|---|
| master (`a7a274e`) | 159 | 1361 | 2 | 0 |
| Task 3 (red window) | 155 | 1348 | 2 | **17** |
| Task 3b (green restored) | 159 | 1365 | 2 | 0 |
| Tasks 4+5 | 160 | 1376 | 2 | 0 |
| Task 6 | 161 | 1383 | 2 | 0 |
| Task 6b | 161 | 1386 | 2 | 0 |
| Task 7 | 162 | 1392 | 2 | 0 |
| Tasks 8+9+10 | 161 | 1394 | 2 | 0 |
| Task 11 (gap 1: classic facet) | 162 | 1406 | 2 | 0 |
| Task 11 (complete) | 163 | 1428 | 2 | 0 |
| Final-review fix 1 (ambient commands) | 164 | 1438 | 2 | 0 |
| Final-review fix 2 (sprite save) | 165 | 1442 | 2 | 0 |
| Final-review fix 3 (classic cast) | 165 | 1444 | 2 | 0 |
| Final-review fix 4 (onCommand) | 165 | 1448 | 2 | 0 |

## Smoke-test fixes (two owner-reported regressions)

### A. The repaint clock was too wide — but not as wide as it looked

Reported as "editing the palette / anything that affects the map is mega slow"
in an aeon project, with the suspicion that `useHistoryVersion`'s 14 consumers
were the cause. **The census refutes that as the aeon story.** Master's clock
(`editorStore.historyVersion`) already had ELEVEN of those twelve components
subscribed, and it ticked on every aeon command *and* on every live-drag tick
(`bumpVersion` in MapViewport's object/ring drag and BG tile write). The branch
split those drag ticks onto `liveEditVersion`, which only MapViewport and
PropertiesPanel read — so for an aeon drag the branch renders FEWER components
than master, and for an aeon command it adds exactly one (TabStrip, cheap).

What the branch did genuinely widen is CROSS-DOCUMENT. On master the aeon
canvases could not see `spriteStore.historyTick` or
`classicLevelStore.historyTick`, and there was one aeon clock for all acts. On
the hub they see everything: a sprite brush stroke, a classic edit, or a
background act tab's undo all woke every aeon surface — including the three that
rebuild an expensive cache on that signal:

| Surface | What one tick costs |
|---|---|
| `TilesetPanel` | one `OffscreenCanvas` + `putImageData` **per tile in the zone**, plus a `tileUsageCounts` scan of every section nametable |
| `MapViewport` | `reloadAllSections` — re-prerender the whole atlas and every section |
| `ComposerCanvas` | re-derive the document's entire pixel buffer from the atlas |

Fix: `DocumentHistoryHub.onChange` now passes the CHANGED DOC ID, and
`hooks/useHistoryVersion` keeps two hooks — `useHistoryVersion()` (any document,
for the focus-following affordances: Toolbar, TabStrip, LevelWorkspace, and the
cheap panels) and `useAeonHistoryVersion()` (the current zone-art + act
documents only), which the four heavy surfaces now use. It is a strict narrowing
of the hub signal, never a widening: it drops sprite documents, classic and
background acts, and every aeon command still lands on one of the two watched
documents because `executeCommand` (focus) and `executeAmbientCommand` (scope)
both resolve against the same zone/act. As a side effect those surfaces now
subscribe to `currentZoneId`/`currentActId`, which SectionGridNav previously
lacked.

**Not claimed:** that this is the whole of the owner's slowness. The three costs
in the table are PRE-EXISTING and fire once per aeon command on master too;
`TilesetPanel.ensureTileCache` allocating one OffscreenCanvas per tile on every
committed art edit is the most suspicious of them and is untouched here. The
renderer suite is node-only, so no test can count re-renders — the hub payload
and the per-document counters are what is covered
(`hooks/__tests__/useHistoryVersion.test.ts`).

### B. Chunk thumbnails never invalidated at all

Reported as "undo doesn't refresh the chunk thumbnails". Root cause is older
than this branch and is not undo-specific: `ChunkLibrary`'s `ChunkThumb`
memoised its `OffscreenCanvas` on `[chunk, tiles, palette]` — the three prop
IDENTITIES — but every one of those is mutated IN PLACE by `history.ts`
(`chunk.nametable = …`, `tiles[i] = …`, `palette.lines[n].colors = …` on the
objects it was handed). So the memo never invalidated in either direction; the
thumbnails were pinned to the art as it stood when the panel mounted.
`chunkLibraryVersion` — bumped by `bumpStoreVersions` for exactly the three
commands that can change the render, on execute/undo/redo alike — was subscribed
but never threaded into the key. Now it is, for the thumbnail and for the
`blankIds` "empty" tags (a `set-chunk` can make a chunk blank in place).

Measured cost of the rebuild that this turns back on: ~6 ms of pixel work for
128 chunks, ~12 ms for 256 (node, pixel loops only), plus one OffscreenCanvas per
chunk. Acceptable, and it is what the surrounding comments already claimed was
happening.

TilesetPanel and ComposerCanvas do NOT share the bug — both key their caches on
the history clock, so both already invalidated on undo.

| After | Files | Passed | Skipped | Failed |
|---|---|---|---|---|
| Smoke-test fixes A+B | 167 | 1457 | 2 | 0 |
