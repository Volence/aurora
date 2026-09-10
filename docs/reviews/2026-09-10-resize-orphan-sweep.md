# RESIZE-ORPHAN-SWEEP: the distinction first, then the sweep

2026-09-10. Branch `worktree-agent-a91d4b764ed71ab6f`, off `82ba0634`.
Node/vitest only: no Electron, no CDP, no ROM build, no emulator, and none was
needed.

## Verdict

**Both halves landed, in that order.** ABSENT and REFUSED are now different
values at the point a save reads them, and the sweep is gated on the
distinction. The `KNOWN DEFECT, still open` row is converted, with both of its
commented assertions restored and passing.

No quarantine, no report-only fallback: the distinction held, so the deletion
could be made positive on both ends. What was NOT swept is stated below under
"What this deliberately does not delete", because a limitation nobody wrote down
is the same thing as a limitation nobody knows about.

| Commit | What |
|---|---|
| `eb45bff1` | the distinction: `Act.sectionFiles`, built by `load.ts` |
| `aed0df2e` | the sweep: `buildAeonSavePlan`, gated on it, plus the converted row |
| tip below | the glue's stale sentence, and this packet |

## The refusal this row inherited, and why it was right

The previous parcel (`docs/reviews/2026-09-10-grid-resize-roundtrip.md`) stopped
the data loss and left the stranded `section_N` files alone, on this reasoning:

> `load.ts` pushes `null` for an ABSENT `tiles.bin` and for a REFUSED
> (unreadable/unparseable) one through the same `if (!loaded)` branch,
> discarding the `unreadable` record along with the section. A save-side sweep
> cannot tell a resize orphan from a file that merely failed to parse, and would
> therefore delete real work on a parse failure.

Verified, not taken on trust. `src/core/project/aeon/load.ts`, in the act's
section loop: `markUnreadable` records the refusal on `section.unreadable` and
in a project-wide list, and then `if (!loaded) { sections.push(null); continue; }`
throws the `Section` away. What reached the save was `act.sections[i] === null`
for both causes. The project-wide list survived, but only as prose in a
notice — nothing structured, nothing per-act, nothing a plan builder could
subtract with.

The naive sweep is not a hypothetical: it is measured below as mutation M2, and
it deletes the author's truncated file on the next Ctrl+S.

## How ABSENT and REFUSED are distinguished now

`Act.sectionFiles: ActSectionFileLedger` (`src/core/model/s4-types.ts`), built
per act by the section loop and carried on the model:

* **`loadedPaths`** — every section file this load READ and understood, in load
  order. For the collision planes the push sits inside
  `readCollisionPlaneFile` AFTER the length check and the parse, not at the
  read: a file that reached the catch is not one Aurora understood, and this
  list is a licence to delete.
* **`unreadablePaths`** — every section file that is (or may be) there and would
  not read or parse. Fed by `markUnreadable`, which already guesses PRESENT when
  its `exists` probe cannot answer, so "I could not tell" lands on the safe side
  before it ever reaches here.

Both are **positive claims about a read that was attempted and returned**. A
path in NEITHER list is a third outcome — absent, or never enumerated — and it
is left alone. Three consequences follow, and they are the point:

* an empty ledger means "nobody looked", and yields **zero** deletions. A
  hand-built `Act` fixture cannot make a save destructive. This is the exact
  inversion of the 2026-09-05 defect where a guard that could not look returned
  an empty set and the consumer read it as permission;
* a refused file is neither written (the existing `understood()` gate) nor
  removed (this one), so it survives a save untouched in both directions;
* the two lists are disjoint by construction, and a row asserts it.

Plumbing: `SectionLoadLedger` replaces the bare `UnreadableItem[]` parameter on
`markUnreadable` and on the exported `readCollisionPlaneFile`. Five hand-built
`Act` fixtures gained an empty ledger with a comment saying why empty is safe.
The per-act refusals are folded into the project-wide collection after each
act's loop, so `summarizeUnreadable`'s notices keep their load order.

## The sweep

`src/core/project/aeon/save.ts`, immediately after the per-section write loop:

```
removable = (paths this load READ and understood as this act's section
             documents)  MINUS  (paths this plan is writing)
                         MINUS  (paths the load REFUSED)
```

It reuses `removalsFor`, whose docblock already carries this argument for the
effects libraries — including the second subtraction of the refused set, "so
the rule holds even if a future loader ever admitted such a path to the ledger".
That clause is not decorative here; see mutation M4.

`act.sections[i]` is deliberately **not** consulted. It is precisely the value
that cannot tell an emptied slot from an unreadable one.

The `keep` set is `sectionPathsWritten`, gathered from the loop's own pushes
through a `writeSection` helper rather than recomputed from the grid. The meta
and chunklinks sidecars each have three write branches (write / clear-if-exists
/ nothing), so a set recomputed here would eventually disagree with the loop and
sweep a file out from under a write.

### What this deliberately does not delete

* **A `section_N` beyond the grid `project.json` declared.** The load enumerates
  `gridWidth * gridHeight` slots, so a file past that range was never opened, is
  in no list, and is left alone. Sweeping it would mean deleting off a directory
  listing, which is the "no reason to keep it" shape this whole gate exists to
  refuse. In practice the shrink case IS covered, because the load that
  populated the ledger ran at the LARGER size: shrinking 3x2 to 2x2 in a session
  removes the files the shrink stranded. Only a grid that was already smaller
  than its files when the project opened is out of reach.
* **A refused file does not follow the re-index.** It stays at its old path, and
  the author keeps getting the notice about it. Moving bytes Aurora never parsed
  is a worse answer than leaving them where the author can find them.
* **Nothing on an ordinary save.** With no structural change every loaded path
  is either rewritten (so it is in `keep`) or refused (so it is subtracted), and
  the removal list is empty. The 594-file suite passing unchanged is the
  evidence: every existing save-plan test would have grown removals otherwise.

## Tests

Runner: `npm test` (the gate chain, then `vitest run`; collection confirmed by
`scripts/check-test-collection.mjs`, which reports 597 test-shaped files on disk
and all 597 collected).

**`src/core/project/aeon/__tests__/section-file-ledger.test.ts`** — new, 6 rows.
One fixture, four slots, four different outcomes at once: slot 0 reads
everything, slot 1 reads its nametable and REFUSES its `objects.json`, slot 2
REFUSES its `tiles.bin`, slot 3 has nothing on disk. Slots 2 and 3 are the pair
the parcel turns on: identical in `act.sections`, opposite in what a save may do.

* `the fixture really does produce two null slots for two different reasons`
* `a file that READ is in loadedPaths and in nothing else`
* `a file that REFUSED is in unreadablePaths and NEVER in loadedPaths`
* `a file that is ABSENT is in NEITHER list, which is a third outcome and not a synonym`
* `the two lists are disjoint, and every path in them belongs to this act`
* `the refusal still reaches the author as a notice, so the ledger did not swallow it`

The first row exists so no later row can pass on a fixture that quietly
collapsed to one case. The ABSENT row loops all seven suffixes the loader probes
rather than naming one, so it cannot pass by having picked the suffix nobody
looks for.

**`src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts`** — 5 rows
(was 4).

* `a stranded section file is swept, so no phantom section comes back` — the
  converted `KNOWN DEFECT, still open` row, with both pinned assertions
  restored: the on-disk file set equals the resized grid's own occupancy, and
  the reopened slot 2 is null. Not weakened and not deleted; the docblock says
  what it used to be and points here.
* `a section file the loader REFUSED is neither swept nor overwritten` — **the
  destructive half, proved on the REFUSED side.** A `tiles.bin` truncated by one
  nametable row (an interrupted write, not a token stub) at flat 2 of a 2x2 act,
  then the same widening resize. Flat 2 is empty afterwards for BOTH reasons at
  once, and they come out different: the file the loader READ (flat 3,
  re-indexed to flat 4) is swept; the refused file is not in `plan.removals`,
  not in `plan.files`, and is byte-identical after the plan is applied. The row
  also asserts the sweep RAN in that same save, so it cannot pass with the sweep
  switched off.

### Red first

All four mutations were applied to the **committed** baseline `aed0df2e` and
restored with `git checkout aed0df2e -- <path>`, verified by an empty
`git diff --stat`. Each is quoted from `git diff` as it sat on disk.

**M1 — the sweep disabled.** `src/core/project/aeon/save.ts | 1 insertion(+), 1 deletion(-)`:

```
   removals.push(...removalsFor(
-    act.sectionFiles.loadedPaths,
+    [],
     sectionPathsWritten,
     act.sectionFiles.unreadablePaths,
```

`Tests 2 failed | 3 passed (5)`. Red: the converted phantom row, and the
refused row (on its assertion that the sweep ran at all).

**M2 — the naive sweep, i.e. the defect this row exists to avoid.**
`src/core/project/aeon/save.ts | 7 insertions(+), 6 deletions(-)`: the
`removalsFor` call replaced by

```
  for (let i = 0; i < act.sections.length; i++) {
    if (act.sections[i]) continue;
    removals.push({ path: `${dataPath}section_${i}.tiles.bin`, what: 'naive sweep' });
  }
```

`Tests 1 failed | 4 passed (5)`. The phantom row passes — a grid-derived sweep
does remove the orphan. The REFUSED row fails:
`AssertionError: expected [ …(3) ] to not include 'data/ojz/act1/section_2.tiles.bin'`.
That is the naive sweep deleting the author's truncated file, caught, and the
assertion that fires names the refused path rather than any wording another rule
in this file also uses.

**M3 — the refusal record dropped again.** `src/core/project/aeon/load.ts | 1 insertion(+), 1 deletion(-)`:

```
           loadedPaths: ledger.loaded,
-          unreadablePaths: ledger.unreadable.map(u => u.path),
+          unreadablePaths: [], // MUTATION M3: the refusal record is dropped again
```

`Tests 2 failed | 9 passed (11)` across both files, both with
`AssertionError: expected [] to include 'data/ojz/act1/section_2.tiles.bin'`.

**M4 — a future loader admits a REFUSED path to `loadedPaths`**, which is the
scenario `removalsFor`'s second subtraction was written for.
`src/core/project/aeon/load.ts | 1 insertion(+)`, added inside `markUnreadable`:

```
   ledger.unreadable.push({ path, reason });
+  ledger.loaded.push(path); // MUTATION M4: a future loader admits a refused path to the ledger
```

`Tests 1 failed | 4 passed (5)` — but read WHERE it failed, because the first
reading of this run was wrong. It fails at the row's own fixture-invariant
assertion (`loadedPaths` must not contain the refused path), reported at
`grid-resize-roundtrip.test.ts:283`, not at the removal assertions, which M4
never reaches. **The method changed to answer the question M4 was for**, so it
is recorded as its own step: with that one fixture-invariant line suspended by a
throwaway edit (restored immediately, never committed), the same M4 tree runs
`Tests 5 passed (5)` — the refused file is still not removed and still not
written. The second subtraction is therefore load-bearing under the exact
future-loader case its docblock names, and it is not vacuous.

### Runs

* `npx vitest run src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts
  src/core/project/aeon/__tests__/section-file-ledger.test.ts` ->
  `Test Files 2 passed (2)`, `Tests 11 passed (11)`.
* `npm test` (the whole chain: 15 gates, then typecheck, then vitest) ->
  every gate OK, `Test Files 594 passed | 3 skipped (597)`,
  `Tests 8851 passed | 9 skipped (8860)`, zero failed,
  `failure-class: no failures in this run (597 module(s) reported)`.
* `npx tsc --noEmit` -> rc 0.

Note against the previous packet: the two gates it recorded as pre-existing red
(`check-doc-citations` on an untracked lane-status citation, and
`check-ledger-timestamps`) are both GREEN on this base. They were fixed between
the two parcels; nothing here touched them.

## The reader that would have gone stale

`src/renderer/state/aeon-save.ts`'s removal step said "`core/project/aeon/save.ts`
derives it from each library's `loadedPaths` ledger" — accurate before this
change and one source short after it. Amended to name `Act.sectionFiles` and the
second subtraction. It is the only prose reader of the removal contract outside
`save.ts` itself.

The previous packet's "The residual" section names the pinned row by a title
that no longer exists, so a closure line was added at its head pointing here.

## For the foreground

Nothing here needs the app or the emulator. The round trip drives the real
`loadAeonProject`, the real `EditHistory` `set-sections`, and the real
`buildAeonSavePlan`, and applies the plan's writes and removals to the file map
between two loads.

What a foreground pass WOULD add, on a multi-section act with the owner already
at the machine: one real Ctrl+S after a grid resize, confirming that
`window.api.deleteFile` actually unlinks the stranded `section_N.tiles.bin` and
that the save summary names it. The plan is exercised here; the IPC delete is
not, and `state/aeon-save.ts` is where a wrong `basePath` or a refused unlink
would show. Worth one pass, not load-bearing for the verdict.
