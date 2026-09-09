# The chunk-document repair now has a guard that runs in `npm test`

Branch `parcel/chunk-commit-node-rows`, base `5f63a67f`.
One new file: `src/renderer/state/__tests__/chunk-doc-commit.test.ts`, 30 rows.
Nothing under `src/` changed; the repair itself is untouched.

## 0. Why this exists

`docs/reviews/2026-09-09-chunk-undo-routing.md` landed owner ruling d-37 and closed a
defect that **destroyed the owner's work silently**: on a chunk document every gesture that
wrote only into the composer's buffer recorded nothing, `focusedDocId()` resolved the art
facet to `zoneart:<zone>` anyway, and so `Ctrl+Z` reverted an **earlier edit made on another
document** while the author's own stroke survived. The chunk's cells reference the reverted
tile, so the canvas repainted and it looked like the undo had worked.

That repair was proven by two CDP harnesses and **neither runs in `npm test`**. Its own
packet said so and named the follow-up (§5, last bullet). Until this file, a fix for a
silent-destruction defect was guarded by nothing that would notice it breaking, which is the
same shape as the defect it fixed: a thing that looks fine and is not.

## 1. The properties these rows hold

Row ids below (`A1`, `D2`, ...) are the **literal prefixes of the vitest titles**, so every
claim in this packet can be checked by name against a run.

Every row asserts **state or payload**, never a message and never a call count on its own.
The two instruments are `stepsOf(fn)` (the actual command objects the zone-art stack
received) and `docIdsTouchedBy(fn)` (every document id the history hub was asked for); group
C then re-checks the counting claim from the state side by walking the stack with `undo()`
to empty, so no property rests on a spy alone.

| # | Property | Rows |
|---|---|---|
| 1 | **One gesture is ONE step** on `zoneart:<zone>`, not two and not zero | A2, A4, A5, A6, A7, A8, and C1's walk-to-empty |
| 2 | **The step is a `set-chunk`**, preceded by the `set-tileset-tiles` that materialises painted tiles **only where needed** | A2, A3, A7 (positive: the append is there, it is the painted tile, it comes first); A4, A5 (a collision paint and a stamp of an already-atlas tile record a **bare** `set-chunk` and materialise nothing); A6 (a stroke wholly on atlas-backed cells records a **bare** `set-tileset-tiles` and **no** `set-chunk`) |
| 3 | **No second stack is minted** | B1 (`composerDocId` stays null, `isPureDocLocal` false), B2 (every id the hub is asked for during a gesture is `zoneart:ojz`), B3 (`recordComposerEdit`, which the `allowCow` tail still calls, mints nothing here), B4 (the `isChunkDocument` exclusions), B5 (a pure doc-local document gets nothing) |
| 4 | **Undo takes back the author's own gesture and leaves an earlier zone-art edit alone** | C1 (art), C2 (collision, which carries no art at all), C3 (redo puts the author's step back, not somebody else's) |
| 5 | **`syncChunkDocFromLibrary`'s role** | D1, D2, D3, D4, D5 -- see §4 |
| 6 | A refusal to **record** never becomes a refusal to **edit** | E1 (chunk gone from the library: the atlas edits still land, alone), E2, E3 (at the tileset ceiling the painted pixels stay in the document), E4 |

Anti-vacuous by construction: A1 asserts the fixture really routes to `zoneart:ojz`, that
the stack starts empty, and that the cell the pencil rows paint really is empty -- so
"the stroke had to materialise a tile" is a measurement rather than an assumption. Tile *i*
of the fixture atlas is filled with *i*, so "the atlas moved" is never a coin that lands
heads.

## 2. The properties these rows do NOT hold

**A vitest row cannot replace the harnesses and this file does not pretend to.** The
harnesses drive the real app through CDP; these drive the module. A green suite covers §1
and **not** the following, which remain harness-only:

- **The delivery.** Node cannot mount `ComposerCanvas`. Nothing here proves that a real
  pointer gesture reaches `commitWrites` or `endTileGesture`, that the
  `useEffect([historyVersion, open])` actually fires after an undo, or that a real `Ctrl+Z`
  reaches `focusedHistory()`. Group F reads the **source** for those five sites: it catches
  **deletion of a call site and nothing subtler**, and it is labelled as such in the file.
  It is not behaviour and must not be counted as coverage of the wiring.
- **The paint.** Whether the canvas shows the reverted state is a render. The whole reason
  the original defect was silent is that a wrong undo *looked* right on screen; only the
  harnesses can see that half.
- **The gestures themselves.** Group A drives the doc-local tail that paste, cut, selection
  move and the seven transforms share, but no row here clicks `Flip horizontal`. The
  routing packet's §5 list of measured-versus-derived gestures is unchanged by this parcel.
- **Non-chunk documents' own histories.** `harness:art-undo-path` and the existing suite
  cover those; nothing here touches them.

So: **`npm test` green now means the routing cannot rot unnoticed. It does not mean the
repair is verified end to end.** That still requires
`npm run harness:chunk-undo-measure` and `npm run harness:chunk-undo-redo`.

## 3. Red-first evidence

The repair is already on disk, so the red is produced by **mutating it** and watching these
rows fail. Baseline for every restore is the committed tip `daab0a1b`; the tree was verified
clean (`git status --porcelain` empty) after the batch. Each mutation was applied by a
script that **exits 2 if its anchor is not found**, so an unapplied patch can never read as
a green run, and each diff below was read back **from disk** with `git diff` immediately
before its run.

### 3.1 Five mutations, five kills

| Mutation | Diff (from disk) | Rows | Verdict |
|---|---|---|---|
| **M1 revert the routing** | `+ if (leading.length === 0) return false;`<br>`+ executeCommand(leading.length === 1 ? leading[0] : {...}, level);`<br>`+ return true;` inserted before `const chunkCmds`, i.e. the pre-fix behaviour: execute the caller's atlas edits, record nothing else | **12 failed / 18 passed**, exit 1 | the whole of §1 goes red, including **both halves of the original defect** (C1, C2) |
| **M2 invert the batch order** | `- const all = [...leading, ...chunkCmds];`<br>`+ const all = [...chunkCmds, ...leading];` | **1 failed / 29 passed**, exit 1 | exactly A7, the ordering row |
| **M3 make the sync a no-op** | `+ if (1) return;` as the first line of `syncChunkDocFromLibrary` | **2 failed / 28 passed**, exit 1 | exactly D1 and D3 -- see §4 |
| **M4 mint a second stack** | `isPureDocLocal` loses `&& open.chunkId === null`, so `openDocument` mints a `doc:composer:` id for a chunk document | **18 failed / 12 passed**, exit 1 | group B's direct rows plus a cascade -- see below |
| **M5 the refusal drops the caller's edits** | `- const all = [...leading, ...chunkCmds];`<br>`+ const all = [...chunkCmds];` | **3 failed / 27 passed**, exit 1 | A6, A7 and E1 -- "a refusal to record became a refusal to edit" |

**M1's kill list, verbatim from the run:** A2, A3, A4, A5, A7, B2, C1, C2, D1, D2, E1, E3.
Eleven were `[ASSERTION]`; A3 came back `[UNCLASSIFIED]` because with nothing recorded
`steps[0]` is `undefined` and the row throws rather than asserting. It is a real kill and it
is reported as the shape it actually had.

**M4 is a weaker discrimination than its count suggests, and is reported as such.** Three
rows fail on their own predicate -- A1 (`focusedDocId()` no longer resolves to the zone-art
document), B1 (`composerDocId` is no longer null) and B3 (`recordComposerEdit` now mints a
stack) -- and they are the `[ASSERTION]` ones. The other fifteen are `[UNCLASSIFIED]`: once
`focusedDocId()` names a `doc:composer:` id, `executeCommand` throws because that stack is
not a `BoundEditHistory`, and one throw propagates through every row that commits. Loud
rather than silent, which is the right behaviour, but it is one discrimination wearing
fifteen coats.

### 3.2 Three mutations I predicted CANNOT discriminate, and did not

A batch where everything dies cannot detect that its own scorer has stopped working. These
three were **predicted green before running** and came back green, 30/30, exit 0:

| Plant | Diff | Predicted | Observed |
|---|---|---|---|
| **N1 toast wording** | the missing-chunk message replaced with `'that chunk went away'` | green | **green** |
| **N2 command description** | `description: \`${description} (+${slice.newTiles.length} tiles)\`` replaced with `description: 'tiles'` | green | **green** |
| **N3 `sameWords` length guard** | `if (a.length !== b.length) return false;` -> `return true;` | green | **green** |

N1 and N2 are green **by design**: no row here reads prose or a description, because the
population that matters is which commands land on which stack. The harnesses do not read
them either, so a wording regression is presently guarded by nothing -- stated rather than
implied. N3 is different and is a real declared hole: my fixture never compares planes of
unequal length, so that branch is unreachable from here. It is reachable in the app only if
a chunk is resized under an open document, which no instrument in this repo drives.

## 4. `syncChunkDocFromLibrary`, and how confident I am

This is the subtle one, and it is written as three rows rather than one:

- **D1** -- after an undo the open document is **stale**: the library chunk went back to
  word 0 while the document still points at the tile index the undo has just truncated
  away. `syncChunkDocFromLibrary()` resolves it. (Both facts asserted, before and after.)
- **D2** -- **without** the sync, the next `commitChunkDocStep` diffs the stale document
  against the reverted chunk and **records the undone stroke all over again**: the library
  chunk's nametable moves away from the reverted value. This is the fold-back the effect
  exists to prevent, asserted as a state change on the project object.
- **D3** -- **with** the sync, the same next gesture returns false, pushes no command, and
  the chunk stays reverted.

D4 and D5 pin the two no-ops (the two already agreeing; a document that is not a chunk
document).

**Confidence that these catch a regression in the sync, honestly:**

- **High for the function.** M3 -- a bare `return` at the top of `syncChunkDocFromLibrary`
  -- kills D1 and D3 and nothing else. That is a clean, isolated discrimination: the rows
  fire on this function and no other row depends on it. If someone breaks the rebuild logic,
  the guard is real.
- **Low for the wiring, and that is the gap.** The property that actually protects the
  owner is *"after an undo, the composer's view follows the library"*, and the second half
  of that sentence is `useEffect([historyVersion, open])` in `ComposerCanvas.tsx`. My rows
  call the function **by hand**. Deleting the effect, changing its dependency array to
  `[open]`, or moving it behind a condition would leave all 30 rows green and reintroduce
  the exact defect. F2 matches the effect's source line, so a straight deletion or an edit
  to the dependency array is caught -- but a reordering that makes it fire too early, a
  guard added inside it, or a change to what `historyVersion` counts would not be. **That
  is harness territory and I am leaving it there rather than writing a row that looks like
  coverage and is not.**
- One thing D2 does buy beyond the effect: it is a property of `commitChunkDocStep` too.
  Anyone who later makes the commit path diff against something other than the live
  document will see D2 or D3 move.

## 5. `npm test`, both ends, aggregate with exit codes

Same worktree, same `node_modules`, foreground runs, full output captured.

| | Test Files | Tests | exit | `failure-class` verdict |
|---|---|---|---|---|
| **base** `5f63a67f` | 575 passed \| 3 skipped (578) | 8605 passed \| 9 skipped (8614) | **0** | `no failures in this run (578 module(s) reported)` |
| **tip** `daab0a1b` | 576 passed \| 3 skipped (579) | 8635 passed \| 9 skipped (8644) | **0** | `no failures in this run (579 module(s) reported)` |

**This worktree shows none of the 77 phantom failures** the brief warned about -- its
`node_modules` does not carry the second React instance, so `aether-badge-identity`,
`classic-map-wheel`, `map-device-scale` and `map-viewport-mounted` all pass here. A reader
comparing against the routing packet's §9 table (77 UNCLASSIFIED at both ends, in a
different worktree) should read the difference as the worktrees differing, not the tree.

**The delta is exactly this parcel and nothing else**: +1 test file, +30 tests, zero
failures moved in either direction. `npm run typecheck` is inside that chain and passed, and
every `check:*` in it printed `OK` -- including `check-test-collection` (579 test-shaped
files on disk, all 579 collected, so this file really is one vitest runs). `skip-report`
reports the same 9 pre-existing skips at both ends; none of them is mine.

That run predates this packet and the lens row, so the gates that judge those two were
**re-run afterwards, separately**, and all printed `OK` at rc=0:
`check:ledger-timestamps`, `check:cited-paths`, `check:doc-citations`,
`check:test-collection`, `check:test-dashes`, `check:prose-constants`, `check:pseudo-skip`.
A final full `npm test` was then run **after the last write** -- see §5.2.

### 5.1 Isolation

`npx vitest run src/renderer/state/__tests__/chunk-doc-commit.test.ts`: **30 passed, exit
0**, `failure-class: no failures in this run (1 module(s) reported)`. The same file inside
the full run above is also green, so this is not a row that only passes alone.

### 5.2 After the last write

This repo has paid three times for verifying, then writing, then pushing a red tree, so the
whole chain was run once more with every deliverable on disk:

```
Test Files  576 passed | 3 skipped (579)
     Tests  8635 passed | 9 skipped (8644)
EXIT=0     failure-class: no failures in this run (579 module(s) reported).
```

Identical to §5's tip row, with the packet and the lens row present. The four `check:*`
scripts, `check-harness-guards` and `npm run typecheck` are all inside that exit code.

## 6. What a future reader should do first

If a row in this file goes red, **run the two harnesses before believing the module is
wrong**: they are the specification, this file is the CI shadow of it. If the harnesses are
green and a row here is red, the row is the thing to fix.

If you are changing `ComposerCanvas.tsx`, note that group F counts `commitChunkDocStep(` at
**four** call sites. Adding a fifth is a legitimate change and it will fail F1 -- update the
count and say in your packet which gesture the new site serves.
