# Plant-and-count audit of `src/main/aether/` — 2026-09-09

**What this is.** The first audit of the outbound Aether client that asks the
suite a question its authors could not: *would these tests notice a defect?*
The method is the one aurora's collision audit used — plant one plausible
defect at a time, run the whole suite, read the failure message, confirm it
names the mechanism planted, restore from a committed baseline, count.

A green suite over code its own parcels wrote is evidence about internal
consistency. A survival ratio is evidence about correctness.

## Scope and size

Derived by `find`/`wc -l` on this branch:

| | files | lines |
|---|---|---|
| source | 10 | 2,646 |
| `__tests__` | 13 | 3,647 |

Baseline suite (`npm test`, this worktree): **8198 passed, 9 skipped, 563
files**, green, ~21.5s for the vitest half.

## Method notes, including the ones that cost something

- Every plant was applied, **quoted back from disk via `git diff`**, run under
  the full `npx vitest run`, and restored with `git checkout -- <one path>`
  from a clean committed baseline. The restore is asserted byte-equal.
- **Two plants were MALFORMED and are void, not results.** P05's first attempt
  and P06's first attempt each produced a *collection-time `SyntaxError`*
  across nine test files — a red run that looked exactly like a catch. The
  runner now refuses to score any run whose log contains `SyntaxError`. This is
  the trap the brief names: a green plant announces itself as failed, a red one
  from the wrong arm does not announce anything at all. Both were re-planted in
  a syntactically valid form and scored on the second, valid attempt.
- A kill is only counted when the failing row **names the planted mechanism**.
  Every kill below quotes its row.
- No live bus was reached, and none was needed: this client injects its
  transport (`connect`), so every plant was decided against the tree's own
  fixtures. What that cannot cover is listed at the end.

## Results

(filled in as the batches complete — see the ledger table at the end)
