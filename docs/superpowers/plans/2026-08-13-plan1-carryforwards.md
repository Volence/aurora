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
8. Tasks 8+9+10 combined (see below)

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

## Open items for Task 11 (grew well beyond "dispose on tab close")

Task 7 built the multi-document sprite capability but left it **dormant** —
`openSpriteDoc` / `activateSpriteDoc` / `closeSpriteDoc` have no production
caller. Task 11 must wire tab activation to them, and while doing so:

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
