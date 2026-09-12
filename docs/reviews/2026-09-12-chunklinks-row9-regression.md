# CHUNKLINKS row 9: the chunk edit that never reached the document

**Parcel** CHUNKLINKS-ROW9-REGRESSION · **branch** `fix/chunklinks-row9-regression`
**Rig** `npm run harness:chunk-links` (`scratchpad/chunk-links-harness.mjs`), row 9
**Fixture** aeon `afd6f784`, `git archive`-extracted to `/tmp/fx-aeon` — never the live tree
**Box** every run below at `dpr=1`, composer canvas `css == backing == 1024`, load average ~6.8, wall-clock uptime 2 days 8:01 at the time of the last run

---

## 1. The one-sentence cause

`artStore.markOpenDirty()` replaces the `open` wrapper object, and the composer's
library-re-sync effect was keyed on that wrapper — so it re-ran in the middle of a
tile-space gesture (which writes the document in `applyTileCell` but commits one
React commit later, at `up`), found the document ahead of its library chunk, and
"repaired" the drift by rebuilding the document **from** the chunk, discarding the
author's stamp.

Everything row 9 saw follows from that: the document never moved, so Save sliced
the chunk's old contents, so `buildActPropagationCommand` had nothing to write,
so the linked section tiles kept the old art — and the save still reported
success, because nothing failed.

## 2. First-bad commit

`209acd5d` — *"chunk undo: route the doc-local half onto the zone-art stack (d-37)"*,
2026-09-09 12:36 -0400. It introduced both `syncChunkDocFromLibrary` and

```
useEffect(() => { syncChunkDocFromLibrary(); }, [historyVersion, open]);
```

(`git log -S syncChunkDocFromLibrary -- src/renderer/components/art/ComposerCanvas.tsx`
returns that commit and no other; the dep list is byte-identical at `209acd5d`
and at `master`.)

**What it was trying to do, and it was right to.** Before d-37, a gesture on a
chunk document that wrote only into the composer buffer recorded *nothing*, while
`focusedDocId()` resolved the art facet to `zoneart:<zone>` anyway — so Ctrl+Z
reached the zone-art stack and reverted an unrelated earlier edit, one per press,
while the author's own gesture survived. The re-sync is what makes an undo of the
new `set-chunk` step VISIBLE: undoing rewrites the library chunk, and without the
re-sync the canvas would keep showing the reverted stroke and the next gesture
would fold it back in. **This is a correct change with an unseen consequence, not
a careless one, and it is not a deliberate narrowing of propagation** — nothing in
the commit, its ruling (d-37) or the panel's blurb touches propagation's reach.
So it is a bug, and it was fixed rather than referred.

### Bisect table

The rig FILE is identical in all three trees (`md5 b661b78e01bc216539b659374e00308a`),
so each row scores the app and not the instrument.

| revision | what it is | row 9 | runs |
|---|---|---|---|
| `fe8c2b21` (master) | the reported state | **FAIL** (`before=0 after=0`) | 2 (1 rig + 1 instrumented probe; the probe agrees) |
| `209acd5d` | d-37, the re-sync effect lands | **FAIL** (`before=0 after=0`) | 2 |
| `c1826b29` | its parent | **PASS** (`before=0 after=16385`) | 2 |
| `fix/chunklinks-row9-regression` tip | this branch | **PASS** (`before=0 after=16385`) | 3 |

No blind `git bisect` was run: the mechanism was measured first (§3), which named
`209acd5d` by inspection, and the two boundary revisions were then built and run
to confirm it empirically. That is cheaper than eleven steps and strictly more
informative — but it is an *inspection-led* bisect, and the table is the whole
evidence for the boundary.

Two notes on scoring, both of which cost a run:

* The boundary trees are `git archive` extractions under `/tmp`, built with
  `VITE_AURORA_DEBUG=1` and driven with `AURORA_BUILT_TREE` pointed at
  themselves; every run's `root:`/`pinned:` lines were read.
* **The master rig cannot boot an older build as shipped.** At `209acd5d` the
  debug hook is `open: (dir) => openAeonProject(dir).then(() => undefined)`, so
  the boot gate's `resolved:true` never arrives and the rig throws
  *"aeon open did not succeed (resolved:undefined)"* — a RUNNER contract
  difference, **not a red row**, and it was not scored as one (the first
  `c1826b29` run died exactly this way). The two boundary COPIES of the rig
  accept `resolved:undefined` as well, with the reason written into the file;
  nothing else in them is changed, and row 1 still refuses unless
  `__dbg.aeon.state()` reports the project genuinely open (it printed
  `zone=ojz act=act1 sections=9` on every scored run).

## 3. How it was measured

`scratchpad/chunk-row9-probe.mjs` (committed) is the rig with row 9 instrumented
at five moments. On master:

```
before DOWN  cell(3,0)={atlasTile:null} chunk nonzeroTiles=128 dirty=false
             tool=tile-stamp collA={sum:0,nonzero:0} collB={sum:0,nonzero:0}
after  DOWN  cell(3,0)={atlasTile:null} chunk nonzeroTiles=128 dirty=TRUE
             collA/collB UNCHANGED
             doc cells changed by the DOWN: []          <- the whole 16x16
             aim: click=(532,176) origin=(308,144) zoom=8 -> cell (3,0), intended (3,0)
after  UP    identical; no cell of the document holds the armed tile
after  SAVE  toasts=[{"Saved chunk \"OJZ $00\"","success"}] dirty=false
```

So the save path is innocent: `saveComposerDocument` ran to completion and its
propagation was *vacuous*, because the document it sliced still held the chunk's
old contents. And the aim is exact — the click resolved to the intended cell.

The remaining contradiction ("nothing changed, yet the document went dirty") was
settled with a temporary trace in `artStore.markOpenDirty` (applied, measured,
then restored from the committed baseline):

```
Error: markOpenDirty
    at Object.markOpenDirty (...)
    at applyTileCell (...)
    at Object.down (...)
```

`applyTileCell` reaches `markOpenDirty` only *past* its
`if (sameComposerCell(before, after)) return;` guard — so the stamp **did** land,
and something threw it away before the next CDP read. The only writer that can is
`restoreComposerDoc` inside `syncChunkDocFromLibrary`, and the effect that calls
it re-ran because `markOpenDirty` had just replaced `open`.

Why it survived hand use long enough to need a rig: a **drag** loses only its
first cell (the second `markOpenDirty` is a no-op, so `open` keeps its identity),
and the **pixel** tools were never exposed at all — they mark dirty and call
`commitChunkDocStep` in the same synchronous block, so the library chunk has
caught up before React runs any effect. Only a single-click tile-space gesture is
lost whole, and nothing on screen says so.

## 4. The fix

`state/chunk-doc-commit.ts` gains `chunkDocSyncKey(historyVersion, open)` →
`[historyVersion, open?.doc ?? null]`, beside the function it gates and carrying
the rule in its docblock; `ComposerCanvas` keys the effect on it. `open.doc` is
the honest identity: the document buffer is a stable object for the life of the
document (`markOpenDirty` spreads the wrapper, never the doc) and is exactly what
a rebuild would overwrite.

d-37 is preserved whole — the re-sync still runs on every history tick, which is
the undo-visibility case it exists for, and on a genuinely different document.
`chunk-doc-commit.test.ts` (d-37's own CI half, 30 rows) and
`composer-doc-undo.test.ts` (c1826b29's, 22 rows) are green, with one row
**re-aimed**: `[F2]` asserted the old dep list verbatim, i.e. the defect. Its new
text says so and points here.

## 5. Red-first proof

Each mutation was applied to a **committed** baseline, quoted back from disk, and
restored with `git checkout HEAD -- <path>` (never over a dirty tree).

| mutation | on disk | runner | result |
|---|---|---|---|
| **M1** key on the whole wrapper: `return [historyVersion, open as unknown as never];` | `chunk-doc-commit.ts:304`, `git diff --stat` = 1 file, 1 insertion | `npx vitest run …/chunk-doc-sync-key.test.ts` | **K1 RED** (K0/K2/K3/H1/H2 green) |
| **M2** restore the old dep list: `useEffect(() => { syncChunkDocFromLibrary(); }, [historyVersion, open]);` | `ComposerCanvas.tsx:213`, `git diff --stat` = 1 file, 1 insertion | same + `chunk-doc-commit.test.ts` | **K0 RED and [F2] RED** |
| **M3** disable the save-side propagation: `const propagation = false ? buildActPropagationCommand({…}) : null;` | `art-composer-save.ts:237`, `git diff --stat` = 1 file, 2 insertions | `npx vitest run …/chunk-save-propagation.test.ts` | **P2 RED** (P0/P1/P3 green) |

After each restore, `git diff --stat` was empty before the next step.

## 6. Rig totals, before and after

| run | tree | totals |
|---|---|---|
| baseline 1 | this worktree @ `fe8c2b21` | **10/12 rows, FAILED: 4b, 9** |
| probe runs (×5, instrumented) | same | row 9 FAILED in all five |
| boundary `c1826b29` ×2 | `/tmp/bisect-c1826b29` | **11/12, FAILED: 4b** |
| boundary `209acd5d` ×2 | `/tmp/bisect-209acd5d` | **10/12, FAILED: 4b, 9** |
| fixed 1 | this worktree @ branch tip | **11/12, FAILED: 4b** |
| fixed 2 | same | **11/12, FAILED: 4b** |
| fixed 3 | same, after the LAST write on the branch (`14994f0a`) | **11/12, FAILED: 4b** |

`4b` is **red on purpose** (CHIP-FONT-13PX, owner card d-36) and is left red. It is
red at `c1826b29` too, so it predates this window entirely.

Row 9's passing readout, identical on both fixed runs and at `c1826b29`:

```
section word before=0 after=16385 (tileIndex 1)
```

## 7. Why no node test caught this, and does one now

**No node test could have caught the defect itself, and none covered the thing it
broke either.** Both halves are worth stating.

* The defect lives in a React effect's dependency list. This repo has no React
  renderer in the node suite (no `@testing-library/react`, no jsdom — `vitest`
  runs in `node`), so the effect cannot be mounted, fired, or observed there at
  all. `chunk-doc-commit.test.ts` says so in its own header and confines itself
  to the store-side routing, with a `Group F` that *reads the component source*
  for the five call sites — "which catches deletion and nothing subtler". `[F2]`
  was exactly that row, and it was green throughout, because it asserted the
  defective line verbatim.
* The **propagation path** — gesture, commit, Save, section tiles rewritten — had
  **no node coverage at all**. `test/editing/chunk-links.test.ts` proves
  `buildChunkPropagationCommand` computes the right entries *when it is called*;
  `chunk-doc-commit.test.ts` proves a gesture records the right commands. Nothing
  asserted that Save still calls the propagation builder with a document that had
  actually moved. So when the gesture silently stopped moving the document, every
  node row stayed green for three days and only the CDP rig — which nobody runs
  per-commit — could see it.

**Now:**

* `src/renderer/state/__tests__/chunk-save-propagation.test.ts` (4 rows, in
  `npm test` via `vitest run`) drives the store path in the regression's own
  order — stamp, `commitChunkDocStep`, `saveComposerDocument` — and asserts the
  linked section tile carries the chunk's new word, derived from the library
  chunk rather than typed in, with `[P0]` as the anti-vacuous control (the tile
  is linked and the fixture's word is not already the answer). Proven red by M3.
* `src/renderer/state/__tests__/chunk-doc-sync-key.test.ts` (6 rows) holds the
  rule itself: `[K1]` a dirty mark does not move the sync key (proven red by M1),
  `[K2]`/`[K3]` it is not inert, `[K0]` the component still asks through it
  (a source read, labelled as one — proven red by M2), and `[H1]` the hazard K1
  prevents: asked mid-gesture, the sync really does destroy the stamp. `[H1]` is
  green on **both** sides of the fix on purpose — it is not a guard, it is what
  stops `[K1]` from ever being deleted as harmless.

What stays harness-only, and should be said plainly: **the delivery**. Nothing in
node proves React calls `chunkDocSyncKey`, that a real pointer gesture reaches
`applyTileCell`, or that the commit really happens at `up`. `harness:chunk-links`
row 9 is still the only instrument that sees the whole path, and `[K0]`'s source
read is a thin proxy for it.

## 7b. Node suite

`VITEST_MAX_WORKERS=4 npm test` at the branch tip: **618 files passed, 3 skipped;
9594 tests passed, 9 skipped; exit 0**, every skip naming its reason, no
failure-class records. `check-harness-guards` is part of that run and it failed
the first time (G6: `chunk-row9-probe.mjs` was committed with no `package.json`
script able to reach it — "nobody can run it by name, so nothing sweeps it and a
red row in it is invisible"); it is registered as `harness:chunk-row9` and the
guard is now 282 clean / 283 classified, 0 failures.

## 8. Open / tagged

* **Nothing tagged for the emulator.** No ROM is involved.
* `4b` stays red by the owner's card (d-36). Untouched.
* The two `/tmp/bisect-*` trees and `/tmp/fx-aeon` are disposable; nothing in the
  repo points at them.
