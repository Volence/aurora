# O51 — the two Art-mode defects, re-measured

**Branch** `parcel/o51-artmode-defects` · **2026-09-03** · host uptime 8d 17:38 at the
final run.

## Verdict in one line

**Neither defect reproduces.** Both were fixed on 2026-08-16 and the fixes are in
HEAD. The parcel's actual finding is elsewhere: **one of the three harnesses was
incapable of ever seeing the defect it was written for**, and printed a confident
"not reproduced" about a canvas that was not the subject.

No `src/` change was needed and none was made.

---

## Defect A — "the Chunk tab's Assign view renders all black"

### Does not reproduce.

Two hypotheses existed, each with its own harness. Both were run against real GHZ
act 1, in this worktree's own `VITE_AURORA_DEBUG=1` build
(`AURORA_BUILT_TREE` pinned to the worktree, `ELECTRON_BIN` to the main
checkout's binary — a linked worktree has no `node_modules/.bin/electron`).

**A1 — Assign → Paint → Assign** (`scratchpad/assign-toggle-harness.mjs`):

```
      1  assign on first mount: {"fraction":0.646,"size":[576,576]}
PASS  1  baseline Assign renders art  — 0.646
      2  assign after Paint round-trip: {"fraction":0.646,"size":[576,576]}
PASS  2  Assign still renders after a Paint round-trip  — 0.646
      3  after toggling Show (a dep change): {"fraction":0.639,"size":[576,576]}
PASS  3  and still renders after a dep change  — 0.639
      4  block assign first / after round-trip: [{"fraction":1,...},{"fraction":1,...}]
PASS  4  Block Assign survives a Paint round-trip too  — 1

4/4 checks passed
```

**A2 — "black once an object-art document has been opened"**
(`scratchpad/assign-black-harness.mjs`), the reporter's Signpost / Giant Ring /
Spiked Pole scenario, after the harness was repaired (see below):

```
      baseline  assign ink: {"n":8967,"fraction":0.646,"size":[576,576]}
      sprite  active tab before switching back: Sonic
      sprite  switch back: activated
      sprite  active tab after switching back: Green Hill Zone Act 1
      after-sprite  assign ink: {"n":8967,"fraction":0.646,"size":[576,576]}

baseline 0.646 → after sprite 0.646
not reproduced
```

`scratchpad/shots-canvas/repro-assign.png` shows GHZ chunk `$01` drawn correctly —
palm, flowers, grass, checkerboard dirt, grid and solidity tint all present. (The
0.646 rather than 1.0 is the chunk's own black sky, not a partial paint.)

### What fixed it

`2b38e0bb8332406d71fc13ee8d95159d10cd3a0c` — *fix(art): Assign went black after a
Paint round-trip*, 2026-08-16 03:27:14 -0400, an ancestor of HEAD.

```
$ git log --oneline -S 'chunkPaintMode]' -- src/renderer/components/classic/ChunkTab.tsx
2b38e0bb fix(art): Assign went black after a Paint round-trip
```

That is the ONLY commit that has ever moved that dependency into or out of the
array, so the comment at `ChunkTab.tsx:346` and the fix landed together — the
comment is not a later annotation of an older change. The commit touched
`ChunkTab.tsx` and `BlockTab.tsx` (both tabs had it) and shipped
`assign-toggle-harness.mjs` as its proof.

The mechanism, in one sentence: Assign and Paint mount different element types, so
React destroys and recreates the `<canvas>` on every toggle, and a fresh canvas has
a transparent backing store over `styles.gridCanvas`'s `CANVAS_BLACK` — the render
effect's deps did not include the mode, nothing else moved (`useBoxSize` keeps its
last measurement, so `cellPx`/`sizePx` were identical), so nobody ever painted the
new canvas.

### Red-first, so the green above is not vacuous

The fix was removed from the working tree and the app REBUILT:

```
$ git diff --stat
 src/renderer/components/classic/ChunkTab.tsx | 2 +-
$ git diff -U0 -- src/renderer/components/classic/ChunkTab.tsx | grep '^[+-][^+-]'
-  }, [..., cellPx, sizePx, chunkPaintMode]);
+  }, [..., cellPx, sizePx]);
```

With that mutation on disk and in the bundle:

```
      1  assign on first mount: {"fraction":0.646,"size":[576,576]}
PASS  1  baseline Assign renders art  — 0.646
      2  assign after Paint round-trip: {"fraction":0,"size":[576,576]}
FAIL  2  Assign still renders after a Paint round-trip  — 0
3/4 checks passed
```

`0.646 → 0.000` on the same 576x576 surface: the reported "entirely black",
exactly. Restored with `git checkout HEAD -- …` from the committed baseline, not
from a dirty tree.

That pass also settles a second question: the harness really is measuring **this
worktree's** build, not the main checkout's. A rig pointed at the wrong tree would
have stayed green through the mutation.

---

## Defect B — "Paint opens at 24x and ctrl+scroll does not zoom out"

### Does not reproduce, in either half.

`scratchpad/artmode-repro-harness.mjs`, clean HEAD build:

```
      A  dpr: {"dpr":1,"inner":[1400,872],"rawRect":[250.328125,205.5,578,578]}
      A  canvas: {"w":576,"h":576,"cssW":578,"cssH":578}
      A  ink: {"ink":5791,"n":8967,"fraction":0.646}
      B  dpr: {"dpr":1,"inner":[1400,872],"rawRect":[300,214,768,768]}
      B  canvas: {"w":768,"h":768,"cssW":768,"cssH":768}
      B  zoom label: 3×
      B  wheel target: {"x":569,"y":511,"scroller":"div","rect":[294,208,549,605]}
      B  zoom after ctrl+wheel down: 2×
      B  zoom after plain wheel down: 2×
      B  zoom at rest: 2×
      C  zoom in notch 1..5: 4× 8× 16× 32× 64×
```

**dpr was 1 on this run**, and every rect that matters is integer: the Paint
canvas' raw client rect is `[300, 214, 768, 768]` and the wheel landed at integer
client `(569, 511)` inside the scroller's `[294, 208, 549, 605]`. The one
fractional figure is the Assign canvas' left/top (`250.328125, 205.5`), which is
flex centring inside an odd-width column and does not enter any measurement here.
Recording this because dpr under Xvfb has been seen at both 1 and 1.35 on this
machine in a single session; a later run that disagrees with these numbers should
check its own dpr line first.

- **Opens at 3×, not 24×.** 256 × 3 = 768px, which is what the canvas measures.
- **ctrl+scroll zooms out.** 3× → 2×. 2× is `artStore`'s floor, not a stall — the
  five zoom-in notches immediately after go 4, 8, 16, 32, 64.

### What fixed it — two commits, one per half

**The 24×** was `aebfa67cdfc720c7c5466c22022503eaaa5883a2` — *fix(art): zoom is per
TIER — a chunk no longer opens at 6144px*, 2026-08-16 03:14:39 -0400, ancestor of
HEAD. Four art surfaces shared one zoom number; the default 24 suits a tile (8 × 24
= 192px) and opened a 256px chunk at 6144x6144. `artStore.ts:122` now reads
`{ composer: 8, tile: 24, block: 12, chunk: 3 }`. The 24 the reporter saw is
literally the `tile` default leaking onto the chunk surface. Regression-covered in
the node suite by `src/renderer/state/__tests__/art-zoom-tier.test.ts`.

**The dead wheel** was `6f963c47f847f9de79155db5ab70c787d5189f01` — *fix(art):
wheel zoom and hand pan were never attached in Paint mode*, 2026-08-16 00:24:34
-0400, ancestor of HEAD. Its own message names the report verbatim: *"way too
zoomed and I can't ctrl+scroll to zoom out"*. `use-anchored-zoom` and `use-hand-pan`
attached inside `useEffect(…, [])` with an early return on a null scroller ref;
Chunk and Block mount their scroller ONLY in Paint mode and default to Assign, so
the effect ran once against nothing and never again. `use-attached-effect.ts` —
whose docblock at `:12` describes exactly that — is the fix.

### Red-first for B

`use-anchored-zoom.ts` was reverted to the pre-fix shape and rebuilt:

```
$ git diff -U0 -- src/renderer/components/art-shared/use-anchored-zoom.ts | grep '^[+-][^+-]'
-  useAttachedEffect(scrollerRef, (scroller) => {
+  useEffect(() => {
+    const scroller = scrollerRef.current;
+    if (!scroller) return;
-  });
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, []);
```

With that in the bundle, all seven wheel events — ctrl and plain, out and in — moved
nothing:

```
      B  zoom label: 3×
      B  zoom after ctrl+wheel down: 3×
      B  zoom after plain wheel down: 3×
      B  zoom at rest: 3×
      C  zoom in notch 1..5: 3× 3× 3× 3× 3×
```

Restored from the committed baseline.

---

## The finding that is NOT "already fixed"

`assign-black-harness.mjs` — the instrument for the sprite hypothesis — could
never have reproduced the defect it was written for. Its first run in this parcel
printed:

```
      after-sprite  assign ink: {"n":3488,"fraction":0.987,"size":[384,336]}
baseline 0.646 → after sprite 0.987
not reproduced
```

384x336 is not a chunk grid. The chunk Assign canvas is 16 cells at a whole-pixel
cell size (`ChunkTab.tsx`: `width={sizePx}`, `sizePx = cellPx * 16`), so it is
always square and always a multiple of 16. Two independent faults:

1. **The tab switch was a no-op.** `TabStrip.tsx:21` activates a document tab on
   `onMouseDown`. `HTMLElement.click()` dispatches a `click` event and nothing
   else — no mousedown, no mouseup. So `Q.click('Green Hill Zone Act 1')` returned
   the string `'clicked'`, the Sonic sprite tab stayed active, and every reading
   after it came off the sprite editor. `shots-canvas/assign-after-sprite.png` from
   that run shows the sprite editor, not the level.

2. **"The biggest visible canvas" is not the Assign canvas.** With a sprite
   document open, the biggest visible canvas is the sprite sheet.

Fixed on this branch: the tab is activated with a bubbling
mousedown/mouseup/click sequence and the front document is **read back** from the
strip (`styles.tabActive`'s non-transparent inset shadow — derived from
`TabStrip.tsx`, not a pinned colour); the canvas selector requires square and
`% 16 === 0`; and no match, no 2d context, or two readings of differently-sized
surfaces are each **UNMEASURABLE and loud**, never folded into a pass. Only after
that did the sprite hypothesis get exercised at all.

A note on the read-back predicate, because it went wrong once on the way:
`getComputedStyle` serialises `transparent` to `rgba(0, 0, 0, 0)`, so testing the
shadow string for the word matched nothing and all three tabs read as active. The
alpha channel is the signal.

Also fixed here: the dpr note added to `artmode-repro-harness.mjs` carried
backticks inside a comment in a `String.raw` template, which closed the literal and
stopped the file parsing. It went out in one commit and was fixed in the next;
`node --check` on all three harnesses is the cheap guard and now passes on all
three.

---

## Files, commits, verification

Branch `parcel/o51-artmode-defects`, both commits scratchpad-only — **no `src/`
change was made or needed**:

| SHA | What |
|---|---|
| `e1656d83` | `harness(art): the sprite row was measuring the sprite editor's canvas` — `scratchpad/assign-black-harness.mjs` (tab activation, canvas selector, three-way verdict), `scratchpad/artmode-repro-harness.mjs` (dpr + raw rect) |
| `cecb0e80` | `harness(art): the dpr note's comment closed its own template literal` — `scratchpad/artmode-repro-harness.mjs` |

**Node suite** (whole aggregate, not a tail):

```
 Test Files  469 passed | 2 skipped (471)
      Tests  6476 passed | 8 skipped (6484)
   Duration  12.43s
skip-report: OK — every skip named its reason.
```

Zero failures. The 8 skips are the standing opt-in/absent-tree set the report
enumerates (the band-art foreground gate, the compose bench, the live S1 warp, two
`s4_engine` rows for a tree that is gone from this machine, and the sibling-root
step-3 row that can only run from the main checkout).

### Why no new node test

Both defects are invisible to the node suite by their nature, and a test that
passed without touching the subject would be worse than none:

- **A** is a rendered-canvas defect. The bug is that nobody painted a real
  `<canvas>` backing store; jsdom has no 2d rendering, so a node test can assert
  the dependency array's *contents* but never that the pixels arrived. That is a
  test of the fix's shape, not of the behaviour — and it would go green against a
  component that had stopped painting for any other reason.
- **B**'s zoom-default half **is** already node-covered
  (`art-zoom-tier.test.ts`). B's wheel half is about whether a native non-passive
  listener was ever ATTACHED to an element that mounts late; that needs a real
  layout, a real wheel event and a real scroller.

The CDP harnesses are the proof for both, and both were shown capable of going
red above.

## Open / not done

- **Nothing outstanding on either reported defect.** No `src/` follow-up is
  proposed and none is implied by these runs.
- The `zoom-readout vs zoom-drawn` divergence visible at the top of the range
  (label `64×`, canvas 15872 rather than 16384 — `zoom-cap`'s 16000px ceiling) is
  pre-existing, deliberate and already documented in `96c1c143` /
  `91ad0726`. Out of scope here, and NOT a symptom of B.
- The other two harnesses (`assign-toggle`, `artmode-repro`) still use the
  "biggest visible canvas" selector. It happened to pick correctly in every run
  here (576x576 chunk, 384x384 block — both square, both `% 16 === 0`), so it was
  left alone under the cut-the-ceremony ruling rather than swept. It is the same
  latent hazard as the one repaired in `assign-black`, and worth knowing if either
  is ever pointed at a session with a sprite document open.
