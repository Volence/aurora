# A collision poke through the debug door now marks the edit live

**Branch** `parcel/live-edit-bump` · **Parcel** LIVE-EDIT-BUMP, 2026-09-06
**Closes** `docs/reviews/2026-09-06-loops-audit-coords.md` §8 row 1.

**Environment.** `ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`
(a linked worktree has no `node_modules` of its own; npm resolves up for
everything else). `AURORA_BUILT_TREE` = this worktree, so every run executes the
bundle built from the source under test. `AEON_DIR` = a **fresh** `git archive`
copy of aeon `origin/master` **f14b21a8**, re-materialised before *every single
run* — `two-way-mark` issues a real Ctrl+S into `AEON_DIR`, and
`collision-preservation`/`-destructive` count cells in that same act, so without
that a run order would silently change a later run's numbers. The live aeon tree
was never written and never pointed at. **No emulator was touched.**

---

## 1. The defect

`window.__dbg.aeon.collisionPoke` (`src/renderer/debug-hooks.ts`) wrote the
collision plane word in place and told nobody:

```
plane[index] = word & 0xFFFF;
return plane[index] ?? null;
```

`editorStore.liveEditVersion` is the app's *"something changed"* clock, and for a
collision **cell word** it is the only dependency the lenses have —
`CollisionPalette.tsx:153` subscribes to it for the crossover audit memo, and
`MapViewport.tsx:1503` lists it in the redraw effect's dep array. So a defect
planted through the hook sat in the document with every live lens still showing
the previous frame, until some unrelated store tick happened to repaint.

## 2. What the real door does, and which half this takes

The real collision write path is `MapViewport.paintCollisionCell`
(`MapViewport.tsx:2605`), which writes the plane arrays and then calls
`recordPaint` (`MapViewport.tsx:2274`). `recordPaint` is the single tail of every
collision stroke, and its last two lines are:

```
useEditorStore.getState().markDirty();
useEditorStore.getState().bumpLiveEdit();
```

**The hook now calls `bumpLiveEdit()` and deliberately does not call
`markDirty()`.** That is the one place this door does less than the real one, and
the reason is written at the call site rather than left to be rediscovered:

* `dirty` is not a repaint signal. Nothing re-renders on it except the tab dot.
  It is the **save** flag — `shell/dirty-snapshot.ts` feeds `shell/dirty-tabs.ts`
  feeds `state/project-runtime.ts`'s `scope.isDirty`, which is what makes Ctrl+S
  a no-op and what the close/project-switch guard asks. Adding it would buy no
  visibility at all.
* It would remove a real safety. Every harness that pokes states in its own
  header that nothing it does can reach disk, and `audit-coords` refuses to run
  against the live aeon checkout with exactly this sentence: *"a poke plus a
  stray Ctrl+S is one keystroke from writing the live tree."* Dirtying the
  document on a fixture write is what stands between that keystroke and the
  write. A fixture is not an edit the author made; it has no undo entry either,
  for the same reason.

**This is the only choice in the parcel that is a judgement rather than a
measurement, and it is stated as one.** If a later lane wants a fixture write to
be savable, the defensible shape is a second hook (`collisionPokeAsEdit`) rather
than widening this one, so the harnesses that assert "nothing reached disk" keep
the door they were written against.

## 3. The consumer enumeration, and how it was made

Enumerated by **what touches the data**, not by what defines it: the hook name,
the store field, and every reader and writer of both, over the whole tree
(`src/`, `test/`, `scratchpad/`, `docs/`) with `node_modules`/`.git`/`dist`
excluded — not just the owning module.

### 3.1 `collisionPoke` — six consumers, all harnesses, and the hook

`grep -rln 'collisionPoke' src/ test/ scratchpad/*.mjs scratchpad/**/*.mjs`

| consumer | script | uses the poke to |
|---|---|---|
| `scratchpad/audit-coords-harness.mjs` | `harness:audit-coords` | author a self-mark the brush cannot make; the rows that found this defect |
| `scratchpad/collision-preservation-harness.mjs` | `harness:collision-preservation` | author a destination carrying unowned bits, then paint over it |
| `scratchpad/collision-read-harness.mjs` | `harness:collision-read` | author sub-tiles for the agent read road, and put them back at exit |
| `scratchpad/collision-destructive-harness.mjs` | `harness:collision-destructive` | author unowned bits over both real and empty cells |
| `scratchpad/two-way-mark-harness.mjs` | `harness:two-way-mark` | seed a base word, and restore the in-memory document after a real Ctrl+S |
| `scratchpad/loop-paint-harness.mjs` | `harness:loop-paint` | author a crossover destination before a paint row |
| `src/renderer/debug-hooks.ts` | — | the hook itself (declaration + implementation) |

**Nothing in `src/` other than the hook, and nothing in `test/`, touches it.**
The brief and the `audit-coords` packet both say *three* other harnesses; the
census says **five** other harnesses. That is the count this parcel ran.

### 3.2 `liveEditVersion` — writers and readers

**Writers.** `bumpLiveEdit` (`editorStore.ts:844`) is the store's only mutator of
the field, and before this parcel it had **five** call sites, all in
`MapViewport.tsx` (2175, 2233, 2244, 2316 — the `recordPaint` tail — and 3399,
the object/ring drag). This parcel adds a **sixth**, `debug-hooks.ts:1223`.

**Readers** (16 sites outside `editorStore.ts`, comments included because a
comment is where a stale claim about this field would live):

* `components/CollisionPalette.tsx:153` — **the audit memo; the lens this parcel is about**
* `components/MapViewport.tsx:510, 584, 654, 1503` — redraw effect dep, preview version key, chunk-raster cache key
* `components/MarqueePasteOptions.tsx:87-88, 115`
* `components/effects/BgAnimPreviewStrip.tsx:76, 92`
* `components/effects/BgAnimBandPanel.tsx:260, 265, 612`
* `providers/properties-aeon.ts:279`
* `providers/object-inspector-aeon.ts:182, 244, 247`
* `providers/bganim-preview-aeon.ts:139` (docblock), `workspace/facets/objects-facet.tsx:24` (docblock), `components/AeonObjectInspector.tsx:11` (docblock)

Only `CollisionPalette` and `MapViewport` can see a collision **cell word**; the
rest key off it for objects, marquee paste and the BG-anim preview, none of which
`collisionPoke` writes. **No consumer of `liveEditVersion` lives outside `src/`**
— no harness and no test reads or asserts the field; `mapviewport-baseline-
harness.mjs` names it only in a header comment about MapViewport's dep array and
never pokes.

### 3.3 The consumer that could have depended on the un-bumped behaviour

`audit-coords` did, and it is named in the packet that sent this parcel: it
carried a `forceRepaint` helper that round-tripped through the other section to
force the memo to re-run. **That workaround is removed in the same commit**, and
that removal is what makes the fix provable — see §6.

No other consumer stages several pokes and asserts a single render, and none
asserts that something does **not** repaint. The three that restore state at exit
(`collision-read`, `two-way-mark`, `collision-preservation`/`-destructive`) now
cause one extra repaint per restored cell, which is why the numbers below are the
evidence and not the argument.

## 4. Before-numbers — measured here, not quoted

Every figure below was produced by this parcel's own runs. **Nothing is taken
from the packet that sent it.** Aggregate totals, with every failing row named.

| harness | before (master hook) | pre-existing reds |
|---|---|---|
| `audit-coords` | **9/9** | — |
| `collision-preservation` | **11/12** | `[f0]` |
| `collision-read` | **32/32** | — |
| `collision-destructive` | **28/30** | `[f0]`, `[r3]` |
| `two-way-mark` | **25/25** | — |
| `loop-paint` | **41/45** | `[fx0]`, `[o0]`, `[o2]`, `[r2]` |

**⚠ SEVEN ROWS WERE ALREADY RED BEFORE THIS PARCEL TOUCHED ANYTHING**, in three
harnesses, and none of them is about `liveEditVersion`. They are all the same
class: a **vacuity premise that has stopped being true**. `[f0]`/`[fx0]` assert
*"ZERO real cells carry unowned bits, so a row painting over real content would
be VACUOUS"*, and the act now carries them — `collision-preservation` measured
`cells=16384 carrying=4`, `collision-destructive` `cells=65536 nonzero=2076
carrying=8`. `[r3]` fails on the toast's wording, which now names the loop
crossover.

**It is not aeon data drift.** Counted directly out of the two revisions'
`.collattr*.bin` files: aeon `290f4aa8` (the revision the `audit-coords` packet
ran against) and `f14b21a8` (today's `origin/master`) each hold **18 collattr
files, 1,179,648 words, 16 of them carrying bits 15:14** — identical. So these
rows were red on the revision the previous parcel used too, and were not caught
because that parcel ran only its own harness (its §7 item 4 says so). **Booked as
open, not fixed here** — see §8.

## 5. After-numbers, and every row that moved

Same environment, same commands, fresh aeon copy per run. **Three consecutive
runs of each of the six**, each total read whole from its own run — never two
rows stitched out of two runs.

| harness | after (run 1 / 2 / 3) | vs before |
|---|---|---|
| `audit-coords` | **9/9 · 9/9 · 9/9** (and 9/9 on a 4th, after the dpr note) | same |
| `collision-preservation` | **11/12 · 11/12 · 11/12** | same |
| `collision-read` | **32/32 · 32/32 · 32/32** | same |
| `collision-destructive` | **28/30 · 28/30 · 28/30** | same |
| `two-way-mark` | **25/25 · 25/25 · 25/25** | same |
| `loop-paint` | **41/45 · 41/45 · 41/45** | same |

**ZERO rows moved, in either direction.** Checked row by row rather than by
total, because two totals can agree while two rows swap: the PASS/FAIL verdict of
every row id was extracted from the before log and the after log of each harness
and diffed. **153 rows, all six harnesses, byte-identical row lists.** The seven
pre-existing reds are still exactly the same seven rows, with the same measured
details.

`audit-coords` is 9/9 both before and after, but it is **not** the same 9/9: the
before run had `forceRepaint` compensating for the missing bump, and the after
run has neither. That is the point of §6.

## 6. The plant

The fix is only worth having if some row fails without it. It does — but only
after the workaround came out, which is why the two changes are one commit.

1. **Committed the fix and the workaround removal** as `14e330e8`.
2. **Planted its removal**: deleted the single line
   `useEditorStore.getState().bumpLiveEdit();` from `collisionPoke`. Quoted back
   from disk:

   ```
   $ git diff --stat
    src/renderer/debug-hooks.ts | 1 -
    1 file changed, 1 deletion(-)
   @@ -1220,7 +1220,6 @@ function installAeonProbe(): AeonProbeApi {
          // author made; it has no undo entry either, for the same reason.
   -      useEditorStore.getState().bumpLiveEdit();
          return plane[index] ?? null;
   ```
3. **Rebuilt and re-ran** `harness:audit-coords`: **5/9**, failing

   ```
   [n1]  ⚠ THE NOTE ON SCREEN NAMES A PLACE, not an index: "section 0, cell (col 40, row 20), left half"
   [n1b] CONTROL: it still carries the raw index too  [DOES NOT DISCRIMINATE]
   [n2]  the note is laid out inside the panel that scrolls it (a rect, in its scroller)
   [n4]  clearing the defect clears the note entirely
   ```

   Exactly the four rows that need a poked defect to be *visible*. `[n3]`, which
   reaches the same rendering through a real section switch, stays green — which
   is the tell that the plant hit the clock and not the coordinate.
4. **Restored** with `git checkout -- src/renderer/debug-hooks.ts` from the
   committed baseline (`git status` clean, the line back at
   `debug-hooks.ts:1223`), rebuilt, and re-ran: **9/9** on three further runs.

**Geometry, with its scale from the same run.** `[n2]`'s rect is
`top 256 / left 1161 / 224x242` inside a scroller `top 74 / bottom 848`, colour
`rgb(248,113,113)` — at **dpr 1, viewport 1400x872**. The harness did not print
`devicePixelRatio` at all, which on this machine varies run to run; it does now,
next to the rows that quote pixels.

## 7. What is NOT established

1. **No emulator, by invariant.** Nothing here needs one: every claim is about a
   store field and text an editor shows a person.
2. **⚠ NOTHING IN `npm test` WILL CATCH A REGRESSION OF THIS.** No file in
   `test/` or any `__tests__` directory imports or even names `debug-hooks`, and
   **no `harness:*` script runs in `npm test`**. The only instrument for this
   behaviour is `harness:audit-coords` under CDP, run by hand. A source-text gate
   was considered and declined: a grep for `bumpLiveEdit` in that function now
   matches the *docblock and the comment* explaining the fix, so it would stay
   green with the call deleted — the gate would assert nothing.
   Unit suite on this tree, for the record: **513 files / 7463 passed, 0 failed,
   9 skipped**.
3. **Only the collision lens was measured.** `bumpLiveEdit` also re-runs the
   object inspector, the marquee paste panel, the properties provider and the
   BG-anim previews. `collisionPoke` writes none of the state those read, so the
   extra tick costs them a re-render and shows them nothing new — argued from the
   reader census in §3.2, not measured.
4. **The `markDirty` half is a decision, not a measurement.** No harness was
   found that would fail either way; §2 states the cost of both options.
5. **The seven pre-existing reds were diagnosed, not fixed.** The `[f0]`/`[fx0]`
   premise was checked against the artifact (the two aeon revisions' bytes) but
   no row was rewritten.
6. **`loop-paint` was run, never edited.** A concurrent agent owns
   `scratchpad/loop-paint-*` and the loops surfaces in
   `src/renderer/components/`; this parcel read and executed that harness and
   changed nothing in it. Its four reds are that lane's to rule on.

## 8. What is open

| # | what | why |
|---|---|---|
| 1 | **Seven rows across three harnesses assert a vacuity premise that is no longer true**: `collision-preservation [f0]`, `collision-destructive [f0]`+`[r3]`, `loop-paint [fx0]`/`[o0]`/`[o2]`/`[r2]`. The act carries 16 words with bits 15:14 set, and it did at `290f4aa8` too. | Measured in §4, red before this parcel and red after it. Each red is a row saying "so the rows below must author their own destination" — which they still do, so the harnesses are conservative rather than wrong; but a permanently-red row stops being read. `loop-paint`'s four belong to the concurrent loops lane. |
| 2 | Nothing in `npm test` covers `collisionPoke`'s bump. | §7 item 2. Closing it means either a vitest row that can mount the renderer store graph, or accepting that `harness:audit-coords` is the gate and saying so in a runbook. |
| 3 | Whether a fixture write should ever be savable (`markDirty`). | §2. Not needed by any consumer today; the shape if it is ever wanted is a second hook, not a widened one. |
