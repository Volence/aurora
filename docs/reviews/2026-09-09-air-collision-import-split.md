# Import refuses when the editor could not look, and still imports when the bank really has no full block

**Branch** `parcel/air-collision-import-split` · **base** `4e66b570` · **decision**
`d-36b-air-collision-import-split-closed` (`docs/decisions.jsonl`), answered by the owner as
`refuse_a_warn_b` · **ledger row** `FULLBLOCK-ZERO-IS-TWO-ANSWERS` (`docs/lens-findings.jsonl`)

---

## 1. The two cases, and what each does now

One button, two behaviours, because the two situations are not the same kind of thing.

| | **Case A** | **Case B** |
|---|---|---|
| What happened | The project's collision tables never loaded. **The editor could not look.** | The tables loaded fine and the bank **genuinely holds no full-block shape.** |
| Whose fact is it | The editor reporting **its own blindness** | A **true statement about a real bank someone authored** |
| In code | `lookupFullBlockShape` answers `no-profiles` | `lookupFullBlockShape` answers `no-full-block` |
| Behaviour | **REFUSES.** Returns `false` before any mutation, before `markDirty`, and before the three file dialogs. | **PROCEEDS.** Imports, marks dirty, warns. |
| Toast tone | `error` | `warning` |
| Changed by this parcel | **Yes — this is the whole change.** | **No.** Unchanged wording, unchanged behaviour. |

**Only case A is a change.** Case B already said the right thing: the
`FULLBLOCK-ZERO-IS-TWO-ANSWERS` parcel had corrected it so it stopped claiming a success it never
had. I read it and it is right; it is not re-worded here.

---

## 2. The exact text, because one of these is what he will actually read

**CASE A — the refusal.** Toast type `error`. Reproduced verbatim from
`chunkImportBlindRefusal`, driven with a `project.json` shaped like aeon's post-split layout
(`dataPath: games/sonic4/data/editor/ojz/act1/`):

> Import refused: this project's collision shape tables did not load, so nothing could be marked
> solid and every chunk would have come in as air. Nothing was imported and the project is
> unchanged. Aurora needs heightmaps.bin, angles.bin and solidity.bin together in one directory.
> It looked in: games/sonic4/data/collision/base/, games/sonic4/data/collision/,
> data/collision/base/, data/collision/.

The path list is not fixed prose. It is `collisionTableSearchPaths(config.raw)`: the candidate
dirs `collisionDataPathCandidates` yields, each expanded through the loader's own base-then-flat
probe. A legacy-layout project gets a two-entry list; this four-entry one is what a post-split
aeon project produces.

**CASE A with no project config loaded** (defensive arm; not reachable from the button today,
since the import needs an open zone and `config` and `project` are set together by `openLoaded`).
The last sentence becomes:

> ... Aurora needs heightmaps.bin, angles.bin and solidity.bin together in one directory. It
> cannot list where it looked, because no project configuration is loaded.

**CASE B — unchanged, quoted so the two can be read side by side.** Toast type `warning`:

> Imported 71 chunks WITH NO COLLISION -- the project's collision bank loaded but contains no
> full-block shape to mark cells solid with. The art is fine; every cell came in as air. Save to
> keep the art.

**The success sentence**, also unchanged: `Imported 71 chunks -- Save to keep`.

---

## 3. What "refuses before writing anything" was made to mean

The cost the finding recorded is **not** that the author was told the wrong thing. It is that the
write had already happened and **is not recoverable by undo the way an author expects** — library
adds live outside undo history on purpose, which `clearChunkLibrary`'s docblock states and d-30
measured. So a refusal that rolled back after `addChunks` would be a weaker promise wearing the
same word.

The refusal therefore stands at the **top of `importChunkFiles`**, above the `try`, before the
first `selectFile`.

**Before the dialogs, not merely before the write**, and that is a deliberate call rather than
convenience: `collisionProfiles` is written only by `openLoaded` — `setCollisionProfiles` has no
callers anywhere in `src/` — so nothing the author picks in those three dialogs can turn a null
profile set into a bank. Walking them through three file pickers and then refusing would spend
their time on an answer that was already fixed when they clicked.

**The refusal is enforced by the compiler, not by an `if`.** `chunkImportOutcomeToast` now takes

```ts
export type ProceedingFullBlockShape = Exclude<FullBlockShapeLookup, { status: 'no-profiles' }>;
```

so the blind answer cannot reach the success path at all. That is the same move the parcel that
made this split visible already made: `FULLBLOCK-ZERO-IS-TWO-ANSWERS` **deleted** the conflated
`0` return rather than guarding it, and the narrowing is what separated the two questions. A
runtime guard here would have let a later edit go quietly green; this one stops the file
compiling (proved in §5, mutation M5).

---

## 4. Where it looked is derived from the looker

A refusal that says *"here is where it looked"* is a claim about another module's behaviour. Two
new exports in `src/core/project/aeon/load.ts` make it a derived claim rather than a second
opinion, and **`loadCollisionProfilesFa` itself consumes both**, so the sentence and the probe
cannot drift apart:

* `COLLISION_TABLE_FILES` — the three tables the loader's `Promise.all` demands **together** (a
  directory holding two yields nothing). Keyed by role, not a positional array, so a reorder
  cannot silently hand the adapter the wrong table.
* `collisionTableProbeDirs(relDir)` — `[<dir>base/, <dir>]`, the loader's own base-then-flat
  order.
* `collisionTableSearchPaths(raw)` — the candidates crossed with the probe dirs. Pure, no I/O,
  so the refusal path costs no second disk read.

⚠ **What the message does NOT claim.** It does not say *which* of the three tables was missing.
The loader wraps all three reads in one `Promise.all` inside one `catch`, so that information is
discarded before anyone could report it; naming one would be inventing precision. The message
says what is true — the trio is needed together, no probed directory yielded it, here is every
directory probed. Recovering the per-file detail would mean `Promise.allSettled` and a richer
return type from a function whose deliberate `null` contract several other consumers depend on.
That is a real follow-up, not a silent gap.

---

## 5. Red-first, and every guard broken on purpose

Every mutation below was applied **on disk**, run, and restored with
`git checkout -- <path>` from a **committed** baseline (`c3256fe8` for the red-first row,
`a051e927` for the mutations).

### R0 — red-first, before any source change (commit `c3256fe8`)

The three CASE A rows against the shipped importer, quoted from the run:

```
AssertionError: a refusal resolves false, like a cancel: expected true to be false
AssertionError: PREDICATE: nothing the author picks can change a null profile set,
                so refuse before the dialogs: expected 3 to be +0
AssertionError: a refusal is not a warning about something that happened:
                expected 'warning' to be 'error'
```

`npx vitest run src/renderer/providers/__tests__/chunk-import-refuses-when-blind.test.ts`
→ **3 failed | 2 passed (5)**, all three classified ASSERTION. The two CASE B rows **passed**,
which is the point: case B is not the change, and it is the control.

### M1 — the refusal moved to AFTER `addChunks` + `markDirty` (a rollback, not a refusal)

This is the mutation the parcel exists for. A message and an unmutated project are different
claims; M1 keeps the message and destroys the state.

```
AssertionError: PREDICATE: collisionProfiles === null must leave the project and both dirty
  flags exactly as found: expected { chunks: 71, dirty: true, …(3) }
                       to deeply equal { chunks: +0, dirty: false, …(3) }
AssertionError: PREDICATE: nothing the author picks can change a null profile set,
  so refuse before the dialogs: expected 3 to be +0
AssertionError: a refusal writes no chunks: expected 71 to be +0
```

**3 failed | 6 passed (9)** across both import test files. ⚠ The row that asserts the refusal
**message** stayed **green** under M1 — which is exactly the evidence that asserting the sentence
would have proved the wrong thing.

### M2 — refuse on the near-synonym: `status !== 'found'` instead of `status === 'no-profiles'`

The confusion the whole decision card is about: "the import produced no solid cells" is true in
**both** cases, and keying on it wrongly refuses an author who has collision data.

**2 failed | 7 passed (9)** — and the two are precisely the CASE B rows, in both files:

```
[ASSERTION] CASE B ... The chunks ARRIVE and the project goes dirty
[ASSERTION] BANK WITH NO FULL BLOCK: same air, a DIFFERENT sentence naming the bank
```

CASE A stayed green. The two cases are discriminated on the lookup status and nothing else.

### M3 — the message hardcodes a plausible path list instead of the one passed in

```
AssertionError: PREDICATE: the loader really reads games/sonic4/data/collision/base/,
  so the refusal must name it: expected 'Import refused: this project\'s colli…'
  to contain 'games/sonic4/data/collision/base/'
```

**1 failed | 8 passed (9)**. The expected directories in that row are **measured, not restated**:
the row drives the real `loadCollisionProfilesFa` against a `FileAccess` that records every read
and serves nothing, and takes the directory of each recorded read. A hand-written list that
happened to look right would pass a prose assertion and fails this one.

### M4 — rename a table: `COLLISION_TABLE_FILES.solidity` → `solid.bin`

```
AssertionError: PREDICATE: the refusal must name the table solidity.bin:
  expected 'Import refused: this project\'s colli…' to contain 'solidity.bin'
```

**1 failed | 172 passed (173)** across the new file plus the whole of
`src/core/project/aeon/__tests__/`.

⚠ **A finding on the way past.** Those 172 aeon-load rows did **not** notice the rename. A census
for the literal `solidity.bin` across `src/` returns exactly two files: `load.ts` itself and my
new test. So **no test in this repo round-trips a real bank through `loadCollisionProfilesFa`**,
and the loader's actual on-disk table names are pinned by one assertion, the one added here. That
is stated rather than fixed: giving the loader a decodable three-table fixture is a separate
parcel.

### M5 — delete the refusal entirely, and ask the compiler

```
src/renderer/providers/chunk-library-import.ts(213,62): error TS2345:
  Argument of type 'FullBlockShapeLookup' is not assignable to parameter of
  type 'ProceedingFullBlockShape'.
    Type '{ readonly status: "no-profiles"; }' is not assignable ...
```

The claim in §3 is not an aspiration. Removing the refusal stops the file compiling, and
`npm test` runs `tsc --noEmit` before vitest.

---

## 6. Verification

`npm test` (fourteen check scripts, then `tsc --noEmit`, then vitest), run in this worktree with
a hardlink copy of the main checkout's `node_modules`:

| | Test Files | Tests | exit |
|---|---|---|---|
| **base** `4e66b570` | 4 failed \| 567 passed \| 3 skipped (574) | **77 failed \| 8447 passed \| 9 skipped (8533)** | **1** |
| **tip** `a051e927` | 4 failed \| 568 passed \| 3 skipped (575) | **77 failed \| 8452 passed \| 9 skipped (8538)** | **1** |

**+1 file, +5 tests, and they reconcile exactly**: the new file has five rows, and the edited file
kept its four.

⚠ **Exit 1 at BOTH ends, and none of the 77 is mine.** They are the same four files at both
commits — `aether-badge-identity`, `map-device-scale`, `map-viewport-mounted`, `classic-map-wheel`
— every row `TypeError: Cannot read properties of null (reading 'useCallback')`, the second-React-
instance defect already recorded at the identical count of 77 in
`docs/reviews/2026-09-09-save-contract.md` §6 and `docs/reviews/2026-09-09-art-undo-fix.md` §
verification. None of the four is touched by this parcel.

**Two environment facts measured here rather than assumed**, both of which cost a run:

* **A symlinked `node_modules` breaks `npm test` before vitest starts.**
  `check-cited-paths` proves its own ignore query on `node_modules/__check-cited-paths-ignore-probe__`,
  and `git check-ignore` answers `fatal: pathspec ... is beyond a symbolic link` (exit 128) on a
  symlink. It reports **COULD NOT MEASURE** and stops the chain, which is the gate behaving
  correctly. A `cp -al` hardlink copy is the fix.
* **`grep -r` in this shell silently skips gitignored paths and returns a clean zero.** Measured
  on a canary: `dist/canary.txt`, `git check-ignore -v` exit 0, `grep -rl` finds nothing,
  `command grep -rl` finds it. Every absence claim in this document was taken with `command grep`.

---

## 7. Declared gaps

1. **No DOM.** The button reaching `importChunkFiles`, `ToastContainer` painting the refusal, and
   the refusal being legible are unproved here, exactly as in the sibling file
   `src/renderer/providers/__tests__/chunk-import-collision-answer.test.ts`. The refusal is a long
   sentence and it is worth one foreground look at how it wraps.
2. **`false` does not distinguish "cancelled" from "refused".** Both resolve `false`.
   `AeonChunkActions.tsx` discards the value, so nothing reads it today and no caller can be
   misled; if a future caller wants to tell them apart, the return type is the place.
3. **Which table is missing is not named** — see §4. The loader discards it.
4. **The loader's table names are pinned by one assertion** — see M4.
5. **`refuse_and_declare` was NOT done and is not drifted toward.** Making the collision bank a
   declared field in `project.json` changes a format aeon owns and which their region work is
   about to touch. It was on the superseded card, it was not chosen, and it stays a follow-up on
   their schedule.

---

## 8. Files

* `src/renderer/providers/chunk-library-import.ts` — the refusal, `chunkImportBlindRefusal`,
  `ProceedingFullBlockShape`, and `chunkImportOutcomeToast` narrowed to the two proceeding answers.
* `src/core/project/aeon/load.ts` — `COLLISION_TABLE_FILES`, `collisionTableProbeDirs`,
  `collisionTableSearchPaths`, and `loadCollisionProfilesFa` rewritten to consume the first two.
* `src/renderer/providers/__tests__/chunk-import-refuses-when-blind.test.ts` — new, 5 rows.
* `src/renderer/providers/__tests__/chunk-import-collision-answer.test.ts` — the `no-profiles` row
  retargeted from "warns" to "refuses", and the sentence-comparison row now holds the refusal
  against the case B warning.
