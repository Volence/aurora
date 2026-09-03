# O52 — three environment defects the O50 census found, and the one it found by accident

**Branch** `fix/o52-harness-environment` · **Commits** `c25884cc`, `5b25cc0a`, `c2cb72fd`, `0842937f`
**Source** `docs/reviews/2026-09-03-harness-red-sweep.md` findings 2, 3 and 4.
**Environment** this worktree: `npm ci` + `VITE_AURORA_DEBUG=1 npm run build` in place, so
harness runs were **in-tree, not borrowed**, except where a run deliberately pinned
`AURORA_BUILT_TREE` at a synthetic tree. No emulator, no MCP tool, no foreground display.

**Scope, stated up front.** This parcel fixes the three *infrastructure* findings. The 28 RED
instruments are untouched and remain a per-file question the census did not answer.

---

## 1. The staleness gate compared two different trees

### Reproduced

The shipped expression, in all eighteen copies:

```js
const distM  = statSync(MAIN).mtimeMs;                        // the tree the run is AGAINST
const newest = execSync(`find ${JSON.stringify(join(ROOT, 'src'))} … stat -c %Y …`);  // the tree the file LIVES IN
if (Number(newest) * 1000 > distM) throw new Error('dist/ is STALER than src/ — …');
```

Run from this worktree with the main checkout's build borrowed, at the committed baseline:

```
root: /home/volence/sonic_hacks/aurora  BORROWED — this script lives in …/worktrees/agent-a3e7226340addd6ff
Error: dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first
    at main (…/scratchpad/animated-art-harness.mjs:212:11)
```

The **same expression, same bundle, same instant**, evaluated with each of the two trees the
`ROOT` operand can name — the honest demonstration, and the reason the main-checkout half was
measured rather than run there (a worktree-isolated agent cannot `git status` the shared
checkout afterwards, so it must not write into it):

```
MAIN(dist) = /home/volence/sonic_hacks/aurora/dist/main/index.mjs  mtime=1788411497
ROOT(src)  = /home/volence/sonic_hacks/aurora                      newest=1788410271
GATE SILENT: bundle is fresh

MAIN(dist) = /home/volence/sonic_hacks/aurora/dist/main/index.mjs  mtime=1788411497
ROOT(src)  = …/worktrees/agent-a3e7226340addd6ff                   newest=1788411610
GATE FIRES: "dist/ is STALER than src/"
```

The 113 s that flip the verdict are the `git worktree add`, not a source edit. Every agent here
works in a worktree, so for all of them the gate **could refuse and could not pass**.

### ⚠ One census claim did not reproduce

Finding 2 says `mapviewport-baseline-harness` "`statSync`s `join(ROOT, 'dist/main/index.mjs')`, a
path that does not exist in a worktree at all, so it throws ENOENT rather than refusing cleanly."
**It does not**, at this source. That file's `ROOT` is `resolveRunRoot(...).root` — the *run*
root, not the checkout — and line 830 `existsSync`-guards the very path line 835 stats, with a
sentence. It was in fact **the only one of the eighteen already asking a coherent question**:
both operands named one tree. It had a different, unnamed defect instead — it hand-composed
`${ROOT}/node_modules/.bin/electron` and so was the one file of the eighteen that silently
ignored `ELECTRON_BIN`, the override `docs/OVERSEER.md` documents for exactly this case. Fixed
via `electronBin()`.

### Fixed

`assertFreshBuild(RUN)` in `scratchpad/lib/run-root.mjs` replaces all eighteen inline copies.
**Both halves name `run.root`** — the only tree in which mtimes are commensurable, because the
build and the sources it consumed were written by one machine in one order. `run.here` never
enters the comparison: mtimes do not compare across trees at all, and using one as the source
operand is how this happened.

Two further faults went with the shell scan: fourteen copies spelled it without `-print0`/`-0`,
so one source path containing a space would have split into two nonexistent paths and yielded a
**wrong maximum** while the pipeline still exited 0; and an empty result made
`Number('') * 1000` = 0, so an empty source tree read as "everything is fresh". The walk is in
JS now, and absent `dist/`, absent `src/`, and a `src/` with no `.ts`/`.tsx` are
**`unmeasurable`** — a loud refusal, never folded into `fresh`.

### The borrowed case: announced, and the announcement answers something

A borrowed run measures another tree's build, so a second question appears beside staleness:
*are this checkout's sources in that bundle?* Saying "cannot check" would be a couldn't-check
rendered as green, so it is not said — `borrowedSourceDrift` **answers** it, by CONTENT (the only
instrument that works across checkouts), naming how many files under `src/` differ:

```
build: FRESH in /home/volence/sonic_hacks/aurora — dist/main/index.mjs is 1227s newer than the
       newest of 826 .ts/.tsx under …/aurora/src (…/src/shared/agent-protocol.ts)
       BORROWED but NOT DRIFTED: all 826 source files under src/ are byte-identical between this
       checkout and the built tree, so that bundle IS this checkout's sources.
```

118 ms for 826 files, both trees.

⚠ **DRIFT IS A WARNING, NOT A REFUSAL — a ruling, not an oversight.** Borrowing is legitimate; it
is the whole reason `run-root.mjs` exists, and it is conformant *while it announces itself*
("a derivation that legitimately differs and SAYS SO is conformant; one that differs silently is
the defect"). Refusing on drift would make these eighteen unrunnable from any worktree whose
branch touches `src/`, which is most of them — replacing a gate that could never be green with a
gate that could never be green, and calling it a fix.

### Discrimination — the half the shipped expression was never capable of

"Does it fire?" is a vacuous question about a gate that fires unconditionally. The property is
that it fires on a stale bundle and **does not** on a fresh one, **from a worktree**. Two
synthetic built trees, mtimes set by hand, both bundles deliberately **older than this worktree's
`src/`** so the old expression fires on both:

| | dist mtime | newest src mtime |
|---|---|---|
| `tree-fresh` | 1788411500 | 1788411400 |
| `tree-stale` | 1788411500 | 1788411600 |

```
OLD expression, tree-fresh, ROOT = this worktree   ->  GATE FIRES     <- no discrimination
OLD expression, tree-stale, ROOT = this worktree   ->  GATE FIRES

NEW, s1-anim-harness, AURORA_BUILT_TREE=tree-fresh ->  build: FRESH … 100s newer …, run proceeds
NEW, s1-anim-harness, AURORA_BUILT_TREE=tree-stale ->  HARNESS ERROR: dist/ is STALER than src/ in
    …/tree-stale — …/tree-stale/src/main.ts is 100s newer than …/tree-stale/dist/main/index.mjs.
```

And live, in-tree, after the fix — a harness that refused unconditionally an hour earlier:
`sprite-restore-harness` **10/10**, `build-console-overlap-harness` **21/21**.

### What keeps it from coming back

- **Five rows** in `test/support/run-root.test.ts`, every one with `here !== root` (the worktree
  shape). Fresh-with-a-newer-caller, stale-from-the-same-caller, both no-source shapes plus the
  refusal, no-bundle, and drift in **both** directions (identical *and* drifted — a comparator
  that reported drift unconditionally would satisfy only one).
- **A sixth row** derives its population from `git ls-files 'scratchpad/*.mjs'` and fails on any
  file still carrying `stat -c %Y` or `STALER than src`.
- **G7** in `scratchpad/check-harness-guards.mjs`, which is in the `npm test` chain.

**Red-first, mutation shown on disk, restored from the committed baseline:**

- Plant A — the two-tree operand put back (`const srcDir = join(run.here, SOURCE_REL)`), shown as
  a `git diff` hunk before the run. Result: **2 failed | 17 passed**, the fresh row failing with
  `the caller's own src/ must not enter the comparison at all: expected 'stale' to be 'fresh'`.
  That is the anti-vacuity proof: the discrimination rows are not passing trivially.
- Plant B — an executable hand-rolled gate appended to `s1-anim-harness.mjs`. G7 red naming the
  file (`checker exit=1`), and the derived-population vitest row red naming it too.
  ⚠ **The first version of plant B was a COMMENT and did not fire** — correctly: G7 scans with
  comments stripped, exactly as G2/G3 do. Recorded because it is the shape that has made a plant
  in this repo look like a passing gate before.
- Both restored with `git checkout --`; checker exit 0, 22/22 vitest.

---

## 2. The shared recent-projects list — the one that already cost data

### Reproduced

`~/.config/<app>/recent-projects.json` is written by `src/main/recent-projects.ts`
(`addRecentProject` → `writeFileSync(join(app.getPath('userData'), 'recent-projects.json'))`),
capped at ten entries, in no repo, under no harness's cleanup — and not in
`scratchpad/lib/harness-guard.mjs`'s snapshot, which covered only the two `mcp.json` files.

One run of `build-console-overlap-harness` with the guard unfixed:

```
before  sha1 3e151ce256a8413779c28cb723ea1afdbb6144d7   1 entry:  /home/volence/sonic_hacks/aeon
after   sha1 2fcde28edeb7d28dfe350b0756d9a1a39eec3de8   2 entries, row 0
        /tmp/aurora-build-console-jQz4Mw — a directory that no longer existed by the time the run ended
```

Ten of those and the owner's ten rows are gone. That is what the census's 89 runs did.

### ⚠ A second census claim that did not reproduce

Finding 4 attributes `palette-drag-harness` and `palette-grid-harness`'s
`aeon recent row unreachable` to the shared list, "a function of what ran before them". **Their
own source refutes it, and this parcel does not fix them.** Both compute

```js
const AEONDIR = siblingPathOrUnresolved('aeon') + '/';        // note the trailing slash
…
await c.evalExpr(`window.api.addRecentProject(${JSON.stringify(AEONDIR)}, 'Sonic 4')`);
…
document.querySelector(`button[title=${JSON.stringify(AEONDIR)}]`)
```

They add their own row, so what ran before them is not what they are reading — but
`normalizeProjectPath` (`src/shared/project-path.ts`, "trailing separators stripped") means the
row is stored as `…/aeon` while the selector asks for `…/aeon/`. A title that can never match.
A stale harness expectation from before normalization landed, not the shared-list coupling.
**Static evidence only** — neither was run, because both open the owner's **live** `../aeon`
tree, which is its own hazard and its own parcel. Fixing (2) therefore turns **no** census RED or
UNRUNNABLE green.

### Fixed

The paths join the **existing** mechanism rather than getting a second one: `snapshotDiscovery`
and `restoreDiscovery` now iterate `GUARDED_GLOBAL_FILES`, so the same `spawnGuarded`
first-launch capture, the same `finally`, and the same exit/SIGINT/uncaught net put them back.

**Three app names are guarded, because Electron's `userData` depends on how the app was
started** — and all three exist on this box:

| name | why | who |
|---|---|---|
| `Electron` | `electron <root>/dist/main/index.mjs` — a FILE argument, no package.json at the app path, so Electron's own default name | **every harness**; the one the census evicted |
| package.json `name` | `electron .` (`npm run dev`) — the app path is the repo | **the owner** |
| `sonic-level-editor` | the legacy name, still on disk, already carried for the discovery file | history |

The package name is **read from `package.json`**, not typed, so a rename cannot silently drop the
owner's directory out of the set. `describeDiscovery` prints an entry **count** for a recents
file (`entriesOf`) rather than the discovery file's liveness verdict, which has no pid to read
and would print `LIVENESS UNKNOWABLE` on every line: ten evictions and one write must not look
the same.

⚠ **Its one honest limit, stated rather than discovered later:** a byte-for-byte restore also
erases a project the owner opens *during* a run. That window is a run long, it is the same trade
the discovery-file restore already makes, and the alternative — merging his row back in — is a
bespoke rule for one file. The discovery files have a pid to arbitrate with; a recents list has
nothing comparable.

### Proven

`test/support/harness-guard-globals.test.ts`, 3 rows, in `npm test`, every one in a `mkdtemp`
`HOME` (a test for a guard against clobbering the owner's data must not clobber it to prove it):

- the guarded path is derived on **both** sides — the basename is read out of
  `src/main/recent-projects.ts`, the owner-side app name out of `package.json`;
- **RED then GREEN**: a run's append is left standing with no restore, and put back byte for byte
  with one (asserting only the green half would pass against a restore with nothing to undo);
- a list the run itself created is **deleted**, not left holding its rows.

**Live, same harness, after the fix:** `sha1 3e151ce2…` — unchanged, where the identical run
before it wrote `2fcde28e…`. All three real recents files byte-identical across the run.

**Red-first for the export list**: `RECENT_PROJECT_FILES` renamed on disk → G4 names it and the
first vitest row fails. See §4 — that plant found something.

---

## 3. `build-console-overlap` — the second O48d instance

### Reproduced

Default project `scratchpad/fixtures/aeon-console-fix`: gitignored (`.gitignore:31`), untracked,
absent on a clean checkout, and documented in the header as an `rsync` **a human must run**.
Committed baseline, no `AEON_DIR`:

```
FAIL  [1a] ANTI-VACUOUS: the aeon project is open, with sections
      {"open":false,"zone":null,"act":null,"sections":0,…}
HARNESS ERROR: Error: aeon did not open
```

Its own anti-vacuous row is the thing that knew — precisely `crossover-paint`'s shape. It was
GREEN at 21/21 in the census only because that sweep handed it an `AEON_DIR`.

### Fixed — O48d's resolution, applied unchanged

It fits without alteration, so nothing was invented: `materialise()` makes a fresh `mkdtemp` per
run from a **committed** aeon revision (`git archive` reads the object database, so aeon's
working tree is never opened, dirty or not); `AEON_DIR` now names the **source** to take the
fixture from, a git checkout being archived at `AEON_SHA` (default `origin/master`) and a plain
extract copied; the provenance is printed; a wrong `AEON_DIR` is refused up front against
`project.json` rather than eight hundred lines later as a red row about the app.

```
project: /tmp/aurora-build-console-16ykOA
         git archive /home/volence/sonic_hacks/aeon @ origin/master = f45b7769272a2d8d33b074adfc717b6888d8db02
…
=== 21/21 rows passed ===
```

**21/21 on a clean checkout with nothing set** — the state in which it previously could not run
at all.

The extract is **removed however the run ends** (52 MB/run was the other half of the census's
3.8 GB), and teardown now goes through `killTree`, which was **imported and never called**: the
bare group SIGKILL skipped the ordered app-then-X shutdown *and* the display reap, leaking one
`/tmp/xvfb-run.*` per run — hazard 4 in the guard module's own header. Confirmed: the leaked-
tempdir count on this box was 185 before and after the fixed runs.

---

## 4. ⚠ Found by planting: G4 could not fail `check-harness-guards`

Red-firsting §2's addition to `REQUIRED_EXPORTS` produced this:

```
G4  lib/harness-guard.mjs exports 24/25 required names — MISSING RECENT_PROJECT_FILES
…
UNGUARDED BUT UNTRACKED (1) — present in THIS working tree only.
  G4 lib/harness-guard.mjs no longer exports: RECENT_PROJECT_FILES
════ 185 clean / 186 classified · 0 failure(s) · 1 unguarded-untracked · 0 unmeasurable ════
exit=0
```

The tracked/untracked split keys on `msg.replace(/^\s*[GS]\d+ /,'').split(':')[0]`, which for a
G4 message is the phrase `lib/harness-guard.mjs no longer exports` — not a path `git ls-files`
knows — so **every G4 failure has been filed as untracked and printed rather than gated**. That
makes the file's own claim about G4 false: *"Without this the whole check is vacuous the day
someone renames an export."* It was.

Same shape as the G6 stale-exemption case `alwaysFatal` was written for, one rule over, and the
same lesson: **the failure was printed, and printed is not gated.** G4 is a claim about this
repo's own guard module, never about a file the repo may not carry, so it goes in `alwaysFatal`.
With the fix and the plant still in place: `exit=1`, `FAILING (1)`, G4 named. Plant reverted from
the committed baseline: `exit=0`, 186 clean. **Pre-existing; not introduced by this parcel.**

---

## Suite, guards, disk, residue

| | |
|---|---|
| suite, this branch | **6476 passed / 8 skipped**, 469 files, `tsc` clean, exit 0 |
| baseline given for master | 6468 passed / 7 skipped |
| delta | **+8 passing** — exactly the 5 run-root rows and 3 harness-guard rows added here |
| the 8th skip | `sibling-root` step 3, which skips **because this run is in a linked worktree** and names that as its reason; it is a property of where the suite was run, not of this branch |
| guards | `186 clean / 186 classified (179 .mjs + 7 .sh) · 0 failure(s) · 0 unmeasurable` |
| disk, `/` available before, 05:02:48Z | 570,218,414,080 |
| disk, `/` available after, 05:32Z | 562,158,465,024 |
| delta | **−8,059,949,056** (−7.51 GiB) |

Of that delta ~470 MB is this worktree's `node_modules/` + `dist/`, created deliberately so runs
were in-tree and **left in place so the branch stays verifiable**. **The remainder is not
attributable to this parcel**, and the strongest evidence for that is a measurement inside it:
available bytes went **down by ~300 MB across a step that only deleted files** (removing the two
synthetic built trees and four `shots-*` directories), with load average between 6 and 9 and
other lanes active on this machine throughout. Everything this parcel created outside the
worktree — three 52 MB aeon extracts, two synthetic built trees — was removed; `/tmp` carries no
`aurora-build-console-*`, and the `/tmp/xvfb-run.*` count was 185 before and 185 after.

`git status` clean apart from the tracked files named in the commits; **no tracked file was
overwritten by a run** (the census overwrote two PNGs; the shots directories these harnesses
write are gitignored). `../aeon` was read only through `git archive` at a committed revision and
never opened; `../s1disasm` not touched. No emulator, no MCP tool, no `pkill`.

---

## Left open, deliberately

- **The 28 RED instruments.** Out of scope by instruction, and none of the three fixes turns any
  of them green: the eighteen were all GREEN in the census (it built in-tree, which is the
  workaround this parcel removes the need for), and §2 above establishes that the two
  `palette-*` UNRUNNABLEs fail for a reason the census misattributed.
- **`palette-drag-harness` / `palette-grid-harness`** — the trailing-slash defect is diagnosed
  above and not fixed. Both also open the owner's **live** `../aeon`, which is the more serious
  finding about them and belongs with whoever takes that parcel. **TAGGED** for foreground.
- **`build-console-overlap`'s remaining shape**: it still has no `[0]`-style build-freshness gate.
  Adding one was declined as scope creep rather than forgotten.
