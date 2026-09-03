# O48d — `crossover-paint` could not run on a clean checkout, and `[2c]` was right about why

**Branch** `fix/o48d-crossover-fixture` · **Instrument** `npm run harness:crossover-paint`
**Environment** `VITE_AURORA_DEBUG=1 npm run build` in this worktree;
`ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`;
`AURORA_BUILT_TREE` = this worktree; xvfb-run `1680x1050x24`. **No screen
measurement in this parcel** — every row reads bytes out of a file or words off
the Aether wire, so `devicePixelRatio` does not enter it.

## The defect, as handed to me and re-confirmed here

The harness opened `../.aurora-crossover-paint`, **a directory it depended on and
did not create**, and painted a hardcoded fixture at section 0 `(56,16)`. Three
states:

| tree | result | why |
|---|---|---|
| the 08-29 scratch copy | `[2]` red | the baseline already carried a prior run's crossovers |
| | `[2c]` **green** | …and *because* that prior paint had made the two planes differ |
| fresh `git archive` of aeon `origin/master` | `[2c]` red | both planes read the same word at `(56,16)` |
| directory absent | `ENOENT` at `words()` | the harness never materialised it |

So it had **never** been runnable on a clean checkout. ⚠ This is **not** the O66
"not re-runnable on a reused copy" shape: a reused copy was the only tree it ever
passed on. The correction is banked in `docs/OVERSEER-LOG.md`.

## `[2c]` is correct and was left alone

`[2c]` is an anti-vacuous guard. Its claim is about the **fixture**, not the code:
*"plane B carries its OWN geometry, distinct from plane A — so a cross-plane
clobber is DETECTABLE here."* A red is the guard saying it cannot detect the thing
it exists to detect. Its matcher is unchanged (`JSON.stringify(B.words) !==
JSON.stringify(A.words)`); the fixture underneath it is what moved. The row now
carries a `⚠ DO NOT RELAX THIS ROW` block naming the falsification that keeps it
honest.

## The measurement that decided the fixture

Over **every** `.collattr*.bin` pair aeon commits at `origin/master` (`ff9cf84a`)
— 9 files, all `games/sonic4/data/editor/ojz/act1` — counted at 16px cell
resolution, with a non-uniform cell (four disagreeing sub-tiles) reported as such
rather than sampled:

- section 0 is the only one with any collision at all (planes A/B: 1792 / 1100
  non-zero words; 780 words differ). Sections 1–8 are entirely zero on both planes.
- 0 mixed cells on either plane.
- 195 cells where the two planes read differently — and **0 cells anywhere in the
  9 files where BOTH planes carry geometry AND read differently.** Plane B is air
  wherever plane A has shape, and vice versa.

**So the property `[2c]` asserts is not derivable whole from committed data.**
Per the parcel's own escape hatch that is the point at which the fixture gets
*authored* rather than *invented*, and it is authored in the harness's own setup.

## The fixture as it now stands

- **Plane A's half is DERIVED**: the harness scans the file for the first run of
  `W` adjacent cells that are uniform, carry real shape (`word & ~0xC000 != 0`)
  and have no crossover, with both control columns in range. On `origin/master`
  that answers **section 0, 4x1 at (13,13)** — words `0x10ee 0x14d3 0x14d2
  0x10d2`, a genuinely varied run rather than four copies of one word. Nothing is
  typed: move the data and the scan moves with it.
- **Plane B's half is AUTHORED**, into the harness's own throwaway tree, **before
  the app launches**. The word is not invented either — it is the most common
  non-air cell word plane B already carries **elsewhere in the same file**
  (`0x30ff`, 166 cells, out of a 2-word vocabulary), required to differ from every
  plane-A word at the fixture. A word the format and the bake already accept.
- **Why it survives a fresh archive**: both halves are computed from the archive
  itself, on every run, in a tree made that run. No run depends on what a previous
  run left behind — which was the entire failure mode.
- **Plane B's cells now carry real geometry too**, which the old fixture never
  guaranteed. New row `[2bB]` states it, because `[5b]` ("geometry HELD" on plane
  B) is exactly as vacuous over air as `[5a]` was at the original all-zero `(8,8)`
  fixture — the same defect, one plane over, and nothing had named it.

## The tree, and the O66 remedy applied properly

`materialise()` makes a **fresh `mkdtemp` per run**: `git -C <aeon> archive
<AEON_SHA, default origin/master> | tar -x`, which reads the object database and
**never** aeon's working tree, dirty or not. `AEON_DIR` pointing at a plain
extract (no `.git`) is copied instead, so the runner the overseer used for the
other eight still works; the provenance line says which branch ran and, for a
copy, that the revision is unverifiable.

Leftover state is then **refused, not scored**. Any word with bits 15:14 set in
either plane is a prior run's residue (anchor §5: every committed cell is
XOVER_NONE), and the harness exits 2 naming the count and the first offenders,
instead of letting `[2]` go red and leaving a reader to wonder whether the app
broke.

## The one place offsets are computed, and how it is checked

The measurement still assumes no geometry — it diffs whole files and derives which
words moved. The **setup** must compute offsets to author plane B, and names its
assumption: the plane is square in 8px tiles, so the edge is `sqrt(65536) = 256`
tiles = 128 cells (`SECTION_TILES_WIDE` / `SECTION_CELLS_WIDE` in `src`). It is not
taken on faith — new row **`[1c]`** reads both planes back **through the app** at
the chosen cells and requires the app's words to equal the ones the file math
picked. A wrong stride means wrong cells and `[1c]` red, so every anti-vacuous row
below it is known to be reporting on the cells the setup actually touched.

## Results

**15 / 15 on a fresh archive of aeon `origin/master` (`ff9cf84a`)**, both ways of
naming the tree:

```
node scratchpad/crossover-paint-harness.mjs                       -> 15 passed, 0 failed
AEON_DIR=<fresh extract> npm run harness:crossover-paint          -> 15 passed, 0 failed
```

Row count went 13 -> 15: `[1c]` (index math confirmed) and `[2bB]` (plane B's
geometry is real) are new; `[2]` now covers both planes rather than plane A alone.
The substantive rows are unchanged — `[4a/4b]` exactly 16 words moved in each
131,072 B file, `[5a/5b]` low 14 bits identical on every one, `[6a/6b]` crossover 2
on A and 1 on B, `[7]` the two planes differ, `[8]` two runs of eight.

⚠ **What a green here still does not mean** is unchanged and worth restating: the
engine read site does not exist. `bake_plane_cell` never reads bits 15:14
(`docs/reviews/2026-08-29-crossover-paint-loop.md`). This measures authoring and
save, and says nothing about behaviour.

## `[2c]` still discriminates

`PLANT=identical-planes` authors plane A's own words into plane B, so the two
planes read identically at the fixture:

```
    plane A there (from the file): 0x10ee 0x14d3 0x14d2 0x10d2
    plane B AUTHORED there (PLANT=identical-planes: plane A's own words): 0x10ee 0x14d3 0x14d2 0x10d2
FAIL  [2c] ANTI-VACUOUS: plane B carries its OWN geometry, distinct from plane A …
=== 14 passed, 1 failed
```

**And the reason the row has to exist is in the other fourteen lines of that run:
`[4b]`, `[5b]` and `[6b]` all still PASS.** With the planes identical, a paint that
wrote plane A's words into plane B would be invisible to every substantive row in
the harness. `[2c]` is the only thing that says so.

The leftover-state refusal was likewise driven red-first, by pointing `AEON_DIR` at
the tree an earlier run had painted:

```
HARNESS REFUSES: /tmp/aurora-crossover-paint-B6DDUt already carries 32 crossover word(s) — leftover state, not a clean tree.
        first few: …section_0.collattr.bin#6682=0x90ee …#6683=0x90ee …#6684=0x94d3
exit=2
```

## Siblings and suite

`../aeon` untouched — HEAD `73b07a4f` and 2 dirty files before and after; every
read of it went through `git archive` at a committed SHA. `../s1disasm` not
opened. `scripts/check-peer-path-literals.mjs` OK (1211 files, 4 rules, all fired
on canaries); `scratchpad/check-harness-guards.mjs` 186 clean / 186 classified, 0
failures. Suite **465 files / 6432 tests passing**, 8 skipped, each naming its
reason.

## Residual, stated

The harness leaves its `mkdtemp` behind on purpose — the final line names the
`.collattr.bin` a bake would read next, and deleting it would take that away. They
accumulate in `/tmp` at ~52 MB each.
