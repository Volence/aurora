# map-coverage-2 — extending the behavioural reach into `MapViewport`

Branch `parcel/map-coverage-2`, from master `670e3821`.
Tips: `80fd0d17` → `7bcd4d08` → `12c90f67`.

Continues lens row `MAPVIEWPORT-UNTESTED` (last row `2026-09-09T01:55:43Z`).
That row had already been narrowed once and half its original claim refuted;
this parcel is its stated residual.

---

## The headline: a source scan cannot see a behaviour invert, and here is the pair

Two measurements in this parcel land on that sentence from opposite sides. Both
were taken by planting the mutation on disk and watching the runs.

**A defect the scan could not see.** `map-surface-listeners.test.ts` held the
whole BG-stroke half of `BG-STROKE-WRONG-ACT` as a source scan. Every line it
asserts was present and correct. The sixth new behavioural row went red on its
first run against that same correct-looking source:

```
AssertionError: the cursor's cell was painted into the act that just opened:
expected [ [ 2, 2 ] ] to have a length of +0 but got 1
```

`abandonStaleGestures`'s BG arm reverted the stroke's live writes and dropped
`bgStroke.current` — and left `isPaintDragging.current` **true**. Both sibling
arms end their gesture (`isDragging` for the object drag, `isPaintDragging` for
the FG paint stroke); the fifth carrier did not. So the held button survived the
cancellation: the next mousemove fell through to the paint-drag branch, called
`paintBgTile` again, and opened a **brand-new stroke in the act that had just
been switched to** — an edit to a plane the author never pressed on, arriving
immediately after a toast saying *"Nothing was written"*.

Fixed in `80fd0d17`: one line, inside the `bgStrokeMustRevert` arm and not
beside it, because `background-switched` is the artist's own doing on an act
they still own and `paintBgTile` flushes it — ending the drag there would strand
the held button mid-paint.

**A scan row that names a defect and then does not catch it.** The scan asserts,
in a row whose own message reads *"a revert that re-resolves the plane would
write into the wrong act"*:

```js
expect(revert).not.toContain('resolveDisplayedBg');
expect(revert).not.toContain('getCurrentAct');
```

Planted exactly that defect — `revertBgStroke` writing through `bgFrameFresh()`
instead of `stroke.layout` — and **the scan stayed green**. `bgFrameFresh` calls
both banned functions, one level of indirection away, and a text scan reads only
the block it was pointed at. Three behavioural rows caught it.

I did **not** add `.not.toContain('bgFrameFresh')` to the scan. That is
whack-a-mole: a negative enumeration of known-bad callees is a partial
instrument that then earns trust it has not got. The scan's role is stated
below instead.

---

## What is now covered, and what still holds the file up

**24 new rows**, all in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`
(25 → 49). Three blocks:

| block | rows | what had it before |
|---|---|---|
| BG tile stroke | 8 | a source scan only |
| the map's keyboard (arrows, zoom, Escape, two guards) | 9 | nothing |
| FG tile stroke (`recordPaint`/`endPaintStroke`/`revertPaintStroke`) | 7 | nothing |

### Every one of the 24 is red-first proven

Nineteen mutations, each shown applied on disk by `git diff -U0` before its run,
each restored from the committed baseline. No mutation failed to apply.

| # | mutation | rows it reddened |
|---|---|---|
| M1 | the BG stroke loses its `actKey` witness | 5 |
| M2 | `revertBgStroke` re-resolves the plane | 3 (**scan green**) |
| M4 | the BG brush writes tile 0, not the pick | 2 |
| M5 | `abandonStaleGestures` reverts silently | 2 |
| M6 | `reloadBg` never loads the plane (the pre-fixture state) | 7 |
| — | the live `isPaintDragging` defect, before its fix | 1 |
| K1 | `ArrowRight`'s sign flipped | 4 |
| K2 | `ArrowLeft` drops `preventDefault` | 1 |
| K3 | the `isTypingTarget` guard defeated | 1 |
| K4 | `levelKeysEnabled` removed from the keyboard effect | 1 |
| K5 | Escape's paste arm made a no-op | 1 |
| K6 | `viewStore.pan` ignores the zoom | 1 |
| K7 | the `0` key stops going home | 1 |
| K8 | `viewStore.pan` loses its origin clamp | 1 |
| K9 | an over-application on Escape's `case null` arm | 1 |
| F1 | the FG brush writes tile 0, not the pick | 1 |
| F2 | the paint-drag branch made unreachable | 6 |
| F3 | the press commits per cell | 4 |
| F4 | the stale arm stops reverting the FG stroke | 2 |
| F5 | the stale arm leaves `isPaintDragging` armed | 1 |
| F6 | the `oldNt !== newNt` guard removed | 1 |
| F7 | the unmount stops finishing the gesture | 3 |

**F5 is the one worth reading.** It plants, on the FG carrier, exactly the defect
that was live on the BG carrier. The FG arm already had the line; the BG arm did
not. One row *shape* catches it on both — *"a paint after the switch writes into
NEITHER"* — and nothing else in the suite does, on either carrier. That shape is
the thing to copy onto a sixth carrier, not the assertion.

### Two rows that could not fail until they were changed

Stated up front rather than folded into a 24/24 (the `object-label-harness`
precedent).

1. **The Escape CONTROL row.** As first written it parked at zoom 1. A planted
   *"Escape resets the view"* calls `setZoom(1)` on a view already at 1, and all
   42 rows stayed **green**. The row now parks at zoom 2 off the origin, and the
   same plant reddens it. A control standing exactly where the thing it controls
   for lands is not a control.

2. **The direction rows, for the same reason.** `viewStore.pan` clamps with
   `Math.max(0, …)`, so at the default vpX/vpY of 0 the Left and Up arrows are
   indistinguishable from a dead key. Every direction row starts parked at
   (256, 256); **one** row keeps the bound and is labelled as the clamp row it is.

This is one hazard, met twice, and it is the reason the method tightened
mid-parcel. Every row written before the tightening was re-examined against it;
the two above are the ones that needed changing, and both were re-proven red
after the change (K9 and K8/K1 respectively).

### A fixture that would have made a row lie

The section nametable was `new Uint16Array(64)` while `worldToSectionTile`
computes `row * SECTION_TILES_WIDE + col` — **256**, not the `widthTiles: 8` the
object declared. Row 1 is index 256, past the end, and an out-of-range
typed-array store is **dropped, not thrown**. A row dragging down a column would
have painted one cell, asserted three, and the *fixture* would have been the
thing that failed. Sized from the engine constants now, with `widthTiles` /
`heightTiles` declared to match. The row that would have been the casualty is in
the file and says so.

Both planes' fills are per-act (BG `0x0011`/`0x0022`, FG `0x0101`/`0x0202`), so a
write into the wrong act is a wrong **value**, not merely a wrong array identity.

Nothing is pinned from the source it checks: the pan step is never asserted as
64. What is asserted is the property — equal and opposite, one axis per key, and
half the world distance at zoom 2, which is `pan`'s `dx / state.zoom` and is what
makes an arrow move a constant number of *screen* pixels at every zoom. K6 is the
mutation that proves that last one is doing work.

---

## The scan is still load bearing, on two counts. Both re-measured.

The parcel's instruction was: if you replace a scan row with a behavioural one,
prove the behavioural row catches what the scan caught; if it does not, keep both
and say so. **Both stay, and here is why.**

1. **The empty dep list on the unmount effect.** Re-measured under the enlarged
   set, not taken from the previous parcel's report: changing
   `useEffect(() => () => { finishGestureRef.current(); }, [])` to
   `[finishGesture]` reddens **two rows in `map-teardown.test.ts` and none of
   the 33 behavioural rows then in the file**. Scan-only, confirmed.

2. **The act check inside `endBgStroke`, and this one is structural.**
   `abandonStaleGestures` runs first on all three teardown routes and always
   reverts an act-moved BG stroke, so **by construction** no behavioural row can
   arrive at `endBgStroke` with a stale `actKey`. That guard is a consumer-side
   arm against a *future* call site. It is exactly the class of claim only a scan
   can hold, and no amount of harness work changes that.

---

## Suite

| | Test Files | Tests |
|---|---|---|
| before (`670e3821`) | 1 failed \| 559 passed \| 3 skipped (563) | 1 failed \| 8197 passed \| 9 skipped (8207) |
| after (`12c90f67`) | 560 passed \| 3 skipped (563) | 8222 passed \| 9 skipped (8231) |

The baseline failure was a **TIMEOUT** in
`src/renderer/workspace/__tests__/facet-modules.test.ts`, classified as such by
the repo's own failure-class reporter and green on the after run — load, not a
defect. `8231 − 8207 = 24`, which is the number of rows added; the counts sum.
`npx tsc --noEmit` clean.

---

## Still open, and what is foreground-only

**Foreground-only — tagged, not attempted.** No emulator was touched.

- Anything that depends on a pixel or on real layout. Nothing paints, nothing
  lays out, no event propagates, and **the rect a row declares is not one a
  browser measured**. Every rect in this file is declared by the test.
- The browser fact the wheel fix rests on — that React registers root `wheel`
  listeners as *passive*, so an `onWheel` prop's `preventDefault` is dead. Not
  observable here.
- "Is this on screen". `checkVisibility()` and `getClientRects()` both go green
  on an element scrolled 2,635px out of its scroller; the honest test compares
  the rect to the **scroller's** box, and there is no scroller here.
- `resolveEscape`'s third arm, the band lens, is gated on `inEffectsFacet()` — a
  facet this fixture does not open. Its *verdict* is pinned in
  `map-escape.test.ts`; that the branch *acts* on it is not, on that arm.

**Still uncovered in the node suite, and reachable — the next parcel's list.**
`MapViewport.tsx` is ~4,500 lines and three blocks do not make it even.

- The **marquee** drag and its snap (`applyMarqueeSnap`), and paste mode.
- The **band stamp** (`beginBandStampGesture` … `endBandStampGesture`) — the
  sixth gesture carrier, and the one whose stale arm this parcel's F5 shape has
  not been pointed at.
- **Collision paint** (`paintCollisionCell`), including the both-planes stroke.
- The **BG override** arm of `paintBgTile`: the out-of-blob refusal and its
  once-only toast. Needs a `bgOverride` document in the fixture; the `act` arm is
  what this parcel built.
- The **context menu**, the **guide drag** and the **screen-frame drag**.
- `map-escape.test.ts`'s header still says the Escape branch "is inside a React
  effect the node suite cannot reach". That sentence is now false and the header
  should be corrected when someone is next in that file.
