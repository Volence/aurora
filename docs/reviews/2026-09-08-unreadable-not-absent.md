# Two stores that could not say "I could not read this"

**Branch** `parcel/unreadable-not-absent` (base `4cf66084`) · **2026-09-08** ·
lens rows RECENTS-CORRUPT-ERASED (CRITICAL) and MARKUNREADABLE-DEFEATED (HIGH)

Both are the class the classic sidecar fix closed in August
(`docs/reviews/2026-09-06-sidecar-unreadable-overwrite.md`): a reader with no way
to spell *"I could not look"* answers *"there is nothing here"*, and the next
write makes that true.

---

## Defect 1 - the recents store was destroyed by the next project open

`src/main/recent-projects.ts` answered `[]` from one `catch` for a JSON syntax
error, an EACCES and a genuine first run alike. `addRecentProject` read through
that, unshifted one row and wrote unconditionally; `removeRecentProject` was worse
in intent, because the user asks to drop ONE entry and every entry the reader could
not see went with it. No notice, no backup, and the renderer drew the same screen
as a first run.

**All nine existing rows seeded a well-formed store**, which is why none of them
could fail. (The sweep row said eleven; the file held nine.)

### Red first, on the record

Committed red at `555830aa` before any production change: **5 failed | 10 passed
(15)**.

| row | what the unfixed code did |
|---|---|
| a syntax error survives the next open | file replaced by the one new entry |
| a non-array JSON root survives | same |
| a store readable-denied but writable survives (mode `0o200`) | contents replaced |
| `removeRecentProject` removes NOTHING when it cannot read | file became `[]` |
| CONTROL: a junk row does not strand the list | the good row was lost too |
| CONTROL: a first run still creates the store | already green, must stay green |

Every row asserts the **bytes on disk**, because the returned value is the thing
the old code got wrong.

### The fix

`src/shared/recents.ts` (new) carries `RecentsState` with a **required**
`read: 'absent' | 'read' | 'unreadable'`, the `reason`, the store `path` and a
`dropped` count, plus `recentsMayBeOverwritten` (the write gate, keyed on `read`)
and `recentsRefusalMessage` (one sentence, one place). Required on purpose: a
producer that forgets which of the three this is must fail to compile, because the
answer a reader would otherwise assume is the dangerous one.

Main renames `getRecentProjects` to `readRecents(): RecentsState` so every caller
had to be revisited, and takes **absence from the read itself** (an ENOENT/ENOTDIR
errno) instead of a preceding `existsSync` - one stat fewer, no window between the
two calls, and no catch whose single `return []` is the absent branch's value.
Rows are salvaged leniently *in the direction that keeps data*: `path` is the
identity, so a row with a usable path and a missing name or timestamp is repaired
(basename, epoch 0) rather than discarded.

`src/renderer/state/recents.ts` (new) is the one door - `loadRecents()` for the
three surfaces that list and `recordRecentProject()` for the three that record -
and it toasts the refusal, deduped by message because those three list surfaces can
mount in the same second.

### Mutation matrix (each applied on disk, diff shown, restored from a committed baseline)

| # | mutation | caught by |
|---|---|---|
| M1 | gate → `return true` (the original defect reinstated) | **8 failed** / 23 |
| M2 | gate → `return false` ("refuse everything") | **8 failed**, including all four CONTROLs |
| M3 | non-array root returns `read: 'read'` | 2 failed |
| M4 | the read catch treats every errno as absence | 1 failed - the permissions row, the one no old fixture could express |
| M5 | gate also keyed on `dropped === 0` | 2 failed - both "a junk row is still writable" rows |
| M6 | the renderer notes the state but says nothing | 3 failed |

M1 and M2 are the pair that matters: no single-sided fix passes both.

---

## Defect 2 - a careful split defeated one layer down

`markUnreadable` (`src/core/project/aeon/load.ts`) asks `fa.exists` to tell an
absent section file from a present unreadable one, and gates all seven of a
section's writes on the answer. `src/main/file-io.ts`'s `pathExists` answered
`false` for **any** stat error - its own docblock named permissions as a cause -
and `markUnreadable`'s own `catch { present = false }` agreed.

**Where the sweep was one layer off.** The branch is not dead in general: every
existing R7 row reaches it, because an in-memory `FileAccess` answers `exists` from
a Map and is exact. It is dead for exactly the failures that take the read and the
stat down *together* - EACCES on a parent directory, ELOOP, a volume that dropped
out - which are also the only ones with no other tell.

### Reproduced before fixing

Committed red at `94f082d1`. A probe line inside the new save row, on the unfixed
code, for a section whose `objects.json` was present and held a placement:

```
PROBE unreadable= undefined  notices= 0  after= []
```

`after` is the file's content **after a save**. The placement is gone, replaced by
an empty list, and nobody was told at any point.

### The fix, five layers because the defect spanned five

1. `main/file-io.ts` `pathExists(): Promise<boolean>` → `probePath(): PathProbe`,
   `'present' | 'absent' | 'unknown'` with a reason. ENOENT and ENOTDIR are the two
   errnos that really do mean "not there"; everything else is `'unknown'`. An
   escaping path is `'unknown'` too, because a refusal to look is not a statement
   about the disk. It still never rejects, so the no-log-spam property the tolerant
   answer existed for is untouched.
2. `shared/ipc-types.ts` `PathProbe` + `PATH_PROBE` (`'file:path-probe'`). The
   channel and the preload method were **renamed with the meaning**, which is what
   found the Setup tab's live path check, four test mocks and the handover harness.
3. `renderer/state/classic-file-access.ts` `exists` maps present/absent and
   **throws** on `'unknown'`: `Promise<boolean>` has no third value, so the third
   answer has to be a throw or it degrades into a guess at the boundary.
4. `core/project/adapter.ts` `FileAccess.exists` now STATES the contract: `false`
   means KNOWN absent, and an implementation that cannot tell MUST throw.
5. `aeon/load.ts` `catch { present = false }` → `= true`. The direction of the
   guess is the whole content of the fix: guessing absent costs the user their
   data, guessing present costs one notice and a file left alone.

**A fourth site, found by grepping the pattern rather than the symptom:**
`core/formats/bg-override/bg-override-io.ts`'s `loadBgOverride` carried the same
line. Not a loss on its own (a null doc writes nothing), but it leaves the editor
saying the project has no BG override, and the moment an author creates one,
`saveFileFor` sees `unreadable: null` and writes it over the file that was there.
Fixed, with a row and a control.

### Mutation matrix

| # | mutation | caught by |
|---|---|---|
| N1 | `markUnreadable` catch back to `present = false` | 2 failed (load + save) |
| N2 | `present = true` unconditionally ("everything is unreadable") | **27 failed** / 58, including my own control |
| N3 | the bridge stops throwing on `'unknown'` | 1 failed |
| N4 | `probePath` returns `'absent'` for every error | 2 failed (ELOOP, EACCES) |
| N5 | bg-override catch back to `present = false` | 1 failed |
| N6 | bg-override never trusts an absent answer | 2 failed, both absence rows |

### Why the tests could not have existed before

22 `exists: async` fakes across 19 files answer from a Map, so they are exact by
construction: **no fake in this repo could express "I could not look"**, and the
unreachable branch looked reachable. The two new fakes (`cannotTellFa`) throw for
one path and keep its bytes in the map, because the file being there and intact is
the whole hazard. `test/main/path-probe.test.ts` measures the probe on a **real
filesystem**, the only place the third case exists: ELOOP via a symlink cycle
(works as root too, so the row never skips) and EACCES via a `000` directory
holding a file written *before* the lock, so the fs was demonstrably willing and
`'absent'` is a lie rather than a guess.

---

## Judged out of scope, with reasons

1. **Atomic write + backup for the recents store.** A DIFFERENT cause: it needs a
   crash or a full disk DURING the write, where this defect needs only a file
   Aurora cannot parse. Its design questions (who ever reads a `.bak`, how it
   rotates, whether recents should route through the existing guarded-write path)
   are not this parcel's, and simulating an interrupted write is not something the
   node suite can do - an untested atomic write is a claim, not a protection. Note
   the gate already turns the aftermath of such a crash from "destroyed at the next
   open" into "left alone and reported", which is what the backup would have been
   for.
2. **`effects/scene.ts` and `effects/preset.ts`** carry the identical
   `catch { present = false }`, but they probe a DIRECTORY and the flip alone buys
   nothing: `FileAccess.list` swallows its own errors and returns `[]`, so
   `'present'` produces the same empty library one call later. Making those honest
   means giving the listing a third answer too - `listDir`, `fileMtime` and
   `readManyFiles` in `main/file-io.ts` all swallow - which is a bigger seam.
3. **No Electron run and no emulator**, per standing constraint. The toast copy,
   the three list surfaces and the Setup tab's tick mark are not visually
   confirmed.

## Suite

| tree | result |
|---|---|
| base `4cf66084` (re-measured in this worktree) | 3 failed / 7648 passed / 9 skipped (7660), 525 files |
| branch tip | 3 failed / 7675 passed / 9 skipped (7687), 527 files |

The same three failures in both, all in
`test/formats/bg-override-contract-currency.test.ts`, which says in its own message
NOT AN AURORA REGRESSION: aeon declares BG_TILE_CAPACITY 376 against the 400
vendored here. Pre-existing and untouched by this parcel.

**A split difference worth recording:** a run in a LINKED WORKTREE reports
`7648 passed / 9 skipped` where the main checkout reports `7649 passed / 8
skipped`. It is one row - `test/support/sibling-root.test.ts` step 3 - which can
only measure `--git-common-dir`'s relative output shape in a real main checkout and
skips (loudly, with its reason) anywhere else. Both numbers are correct for where
they were taken, and neither is a regression.
