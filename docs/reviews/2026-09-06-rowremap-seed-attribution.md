# The row-remap control was reading a scene the app was not editing

`parcel/rowremap-seed-attribution` · branched from master `6088adda` · 2026-09-06

The overseer measured `harness:row-remap-control` at **18/25** on master and asked
the only question worth asking first: **is the app broken, or the instrument?**

Answer: **the instrument, three times over, and the app not once.** The live
hypothesis handed to this parcel — that `EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT`
degraded to `undefined` when the contract retired its buildable-shift clause — is
**killed by direct measurement**. And the row that was supposed to catch such a
degradation, `[3a2]`, had itself become unfailable and was passing while printing
`undefined`.

---

## 1. App, or harness, or both — and the evidence that separated them

The harness deliberately re-derives the contract from the vendored schema rather
than importing `scene-ui.ts`, so its `height_shift undefined..undefined` could
have been its own broken derivation, the app's, or both. **The printed line
cannot tell them apart**, so both were evaluated independently and printed side
by side: the app's through its own real exports, the harness's by replaying its
own expressions against the same file.

```
=== APP (scene-ui.ts / effects-aeon.ts) ===
  SHIFTS            : [4]
  SHIFT_BOUNDS      : {"min":4,"max":4}
  BUILDABLE_SHIFT   : null
  PLANE_Y_BOUNDS    : {"min":0,"max":511}
  SEED_HEIGHT_SHIFT : 4
  rowRemapFromToggle(true,{world_y:100}) : {"plane_y":100,"height_shift":4}
=== HARNESS (row-remap-control-harness.mjs, re-derived) ===
  SHIFTS            : [4]
  HEIGHT.minimum    : undefined
  HEIGHT.maximum    : undefined
  BUILDABLE         : null
```

**The app is correct.** `EFFECTS_ROW_REMAP_BUILDABLE_SHIFT ?? BOUNDS.min` produces
`null ?? 4` = **4**, because the same landing that retired the clause (`23c7886e`)
also re-derived `EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS` off `SHIFTS[0]` instead of
off the schema node's `minimum`. The `??` fallback the parcel was pointed at is
sound. A new remap is born `{plane_y: <the strip's own top, clamped>, height_shift: 4}`.

**The harness is wrong in two independent places**, and a third, larger one.

### 1a. THE ROOT — six rows read a document nothing on screen was editing

`[3a]` printed `rowRemap = undefined`, which no bounds bug explains. Probing the
running renderer for *every* scene rather than the one the row asserts about:

```
ojz_act1_depth  layers rowRemap = [null, null, null, null, null]
ojz_act1_start  layers rowRemap = [null, null, null, {"plane_y":112,"height_shift":4}, null]
DOM: "Layer 3 rowRemap: …" value = "ladder"   "Layer 3 rowRemap.height_shift" value = "4"
```

The control worked perfectly. **It wrote to `ojz_act1_start`.** The harness
asserted about `ojz_act1_depth`.

`EffectsScenePanel` carries a *selection follows the active section* effect
(`4b9b3f6a`, cold read C2 — the owner called the old behaviour the most
disorienting thing on the tab): on mount it sets the selection to the active
section's own `sceneRef`. Section 0 of this project binds `ojz_act1_start`. The
harness called `selectScene('ojz_act1_depth')` **before** mounting the facet, so
the app overwrote it — **correctly, and by design.**

The overwrite is silent, and that is what cost the rows. The **widget** rows
(`[2b]`, `[3b]`, `[3b2]`, `[4c]`, `[7b]`) went on passing, because they read the
DOM and the DOM held a real, correct row-remap control — just for another
document. The **document** rows (`[3a]`, `[3a2]`, `[4a]`, `[5a]`, `[5c]`, `[6c]`)
read a scene nothing had touched. One root, six dependents, exactly as predicted —
but the root was neither constant the hypothesis named.

`[5c]`, the anti-vacuous floor, did its job: it is why `[5a]`/`[5b]` were reported
as **unmeasurable rather than failing**.

### 1b. `[3a]` tested a SET as if it were a RANGE

```js
&& seeded.height_shift >= HEIGHT.minimum && seeded.height_shift <= HEIGHT.maximum
```

`HEIGHT` is the raw schema node. Under `enum [4]` it carries neither key, so this
was `4 >= undefined && 4 <= undefined` — **false for a perfectly legal payload** —
and the message printed `height_shift undefined..undefined` while pointing at the
app. `scene-ui.ts` states the rule for its own bounds constant in its own docblock
("Nothing may test membership through this constant"); the harness had the same
bug the app had already been fixed for. It is now `SHIFTS.includes(...)`, which
also survives a sparse enum such as `[4, 7]` that a `min..max` pair would wrongly
widen to admit 5 and 6.

**So: the harness, on all three counts. The app, on none.**

---

## 2. Regression from `23c7886e`, or pre-existing? — **Pre-existing, and measured**

Nobody knew whether these rows had ever passed. Established by running each
revision's own harness against its own build, each with a fresh aeon copy.

| revision | when | rows | what it shows |
|---|---|---|---|
| `e3b0fd62` | 09-04 | *claimed* 26/26 | the landing's own claim — **not** re-run here |
| `f872db04` (`4b9b3f6a^`) | 09-06 01:1x | **23/26** | six document rows **GREEN**; `[5b]`, `[6a]`, `[6b]` already red |
| `87ca80ce` | 09-06 12:26 | **17/26** | six document rows **RED**, plus the same three |
| `6088adda` (master) | 09-06 13:02 | **18/25** | as the overseer measured |

**`4b9b3f6a` is the breaking commit, pinned by a single-step bisection** — green at
its parent, red at the next revision measured, and the diff is exactly the
selection-follow effect whose behaviour the live probe then caught in the act.
`23c7886e` is **12 hours later** and is not the cause of anything here.

What `23c7886e` *did* do is change how the damage reads: it retired `[4a]` into
`[4b-retired]` (26 rows → 25), turned `[3a2]` vacuously green, and broke `[3a]`'s
own bounds test. So the master run showed **seven** failures where the baseline
showed **nine** — the count went *up* while two more rows stopped being able to
fail. That is why master looked like a fresh regression.

**Honest limits of this baseline.** The `87ca80ce` and `f872db04` runs are real
and are not vacuous: the schema there was still `minimum 3 / maximum 7`, so
`SHIFTS` was `[3,4,5,6,7]`, `BUILDABLE` was `4`, and `[3a]`/`[3a2]`/`[4a]` were all
genuinely measured — `[3a2]` **fired red correctly** at `87ca80ce`, which is the
same row that passes vacuously on master. The `e3b0fd62` 26/26 is quoted from its
own landing report and **was not re-run**; it is not relied on for any conclusion
above. The three rows red at `f872db04` show that even the 09-04 claim had already
stopped holding by 09-05 without anyone measuring.

---

## 3. The fix

`scratchpad/row-remap-control-harness.mjs`, one commit.

1. **Select AFTER the facet mounts.** The app owns the selection on mount; the
   harness must take it back afterwards. The app is not touched.
2. **`[1c2]`, a new gate: assert the selection took.** The precondition every row
   below rests on was *assumed*. It is now asserted in the app's own words
   (`window.__dbg.aeon.selectedScene()`), and it **aborts** rather than continuing,
   so the rows it protects can never be reported as anything but unmeasured.
3. **`[3a]` tests membership, not ends.**

**Red-first, mutation shown on disk.** The old ordering was restored on disk
(`git diff --stat` → `scratchpad/row-remap-control-harness.mjs | 3 ++-`):

```
FAIL  [1c2] and the panel is EDITING the scene every row below asserts against
      selectedScene() = "ojz_act1_start", wanted "ojz_act1_depth". …
HARNESS ABORTED: the panel is editing ojz_act1_start, not ojz_act1_depth
  4/5 rows had run — this is NOT a pass over the rows that never ran.
```

Restored from the committed baseline with `git checkout HEAD -- <path>`.

**The app was not changed, and must not be.** The selection-follow behaviour is
deliberate, documented, and what the owner asked for. Making it defer to a
programmatic `selectScene` would be changing the subject to suit the instrument.

---

## 4. `[3a2]` — the vacuity, and its red-first repair

`[3a2]` asserted *"the seed is the shift that BUILDS — a new remap is never born
unbuildable"*, and on master it **PASSED while printing `seeded shift undefined`.**

```js
BUILDABLE === null || seeded?.height_shift === BUILDABLE
```

`BUILDABLE` has read `null` since the contract retired its "TODAY ONLY n BUILDS"
clause, so the row **short-circuited true before looking at the seed at all**. It
is not a weak gate; it is an anti-gate — it stood beside `[3a]`'s red actively
asserting the seed was fine, which is the single most misleading line in the whole
run. A row that cannot fail when both sides degrade together.

**Its vacuity is already proven by two independent measurements**, both recorded
above: it passed on master with the seed literally `undefined`, and it fired red
correctly at `87ca80ce` where `BUILDABLE` was `4`. The clause retiring is a
*different event* from the seed going wrong, and the row conflated them.

The row is now two claims: the seed is **always** a shift the contract admits —
checkable under every contract this key has ever carried, and the half that catches
a `?? BOUNDS.min` fallback degrading to `undefined` — **and**, where the contract
still names a buildable shift, it is that one.

**Red-first, mutation shown on disk**, planting the exact unit hazard the parcel
exists for — a **line count** where the seed shift belongs:

```ts
export const EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT: number =
  rowRemapHeightLines(EFFECTS_ROW_REMAP_BUILDABLE_SHIFT ?? EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS.min);
```

```
FAIL [3a]  strip 3 rowRemap = {"plane_y":112,"height_shift":16}; … height_shift one of {4}
FAIL [3a2] seeded shift 16; the contract admits {4} and names no shift as the one that builds,
           so only ADMISSION is asserted here
```

**The old `[3a2]` would have passed under that exact plant** — `null || …`
short-circuits regardless of a 16. Restored from the committed baseline and
rebuilt.

---

## 5. Final count: **23/26**, with all three residuals classified

Up from 18/25. Every document row recovered. The three that remain were **already
red at `f872db04`**, before the root of this parcel existed, and none is an app
defect. All three are **left red on purpose**: each needs its own red-first repair,
and one of them must never be "fixed" at the app end.

| row | classification | cause |
|---|---|---|
| `[5b]` | **defect — the row's expectation is WRONG** | see below |
| `[6a]` | **defect in the row's reading** — the claim ships, one disclosure deeper | `73fc44bf` |
| `[6b]` | **defect in the row's reading** — same cause | `73fc44bf` |

**`[6a]`, `[6b]` — one parcel stale.** `73fc44bf` (09-05 20:18) split the precondition
sentences into `{diagnosis, mechanism}` and folded the contract's own clause behind
a collapsed *"Why this happens"*. The rows still look for `MUST declare anchor` and
`at most ONE layer` in the **visible** text. The clauses are still shipped and still
derived from the schema; the harness reads only the top half. The repair is to open
the disclosure, not to unfold the UI.

**`[5b]` — the row now asserts a falsehood, and the app is right.** It requires the
painted sentence to say Aurora's bound is the **CONTRACT'S ONLY ENFORCEMENT** of
the `plane_y` ceiling. That stopped being true: aeon landed an engine-side `< 512`
guard, and aurora correctly retired the claim (`044a8b05`, `04929ec0`) — the shipped
sentence now reads *"This bound is ONE OF TWO ENFORCEMENTS of the ceiling, with the
engine-side guard aeon landed alongside it"*. **Making the app satisfy this row
would put a false claim back in front of an author.** The row's expectation must
move to the true sentence. Flagged rather than quietly relaxed.

> Recorded because it is the general shape: at `f872db04` `[5b]` failed for a
> *different* reason again — the sentence was found (`leaf: true`) but is taller
> than its own scroller (rect 504–735 vs scroller 545–694), so strict containment
> could not pass. One row, two successive breakages, neither measured at the time.

**NOT MEASURED HERE, and left tagged:** that a band visibly compresses toward a
surface. That needs a built ROM in an emulator, and aeon's generator half (9b) does
not exist, so no ROM can be built through this path at all. No emulator was touched.

---

## What this cost, in one line each

- **A silent overwrite beats a loud one.** The app took the selection away and said
  nothing; the harness kept driving a real control for the wrong document, and the
  widget rows kept saying yes. The gate that was missing was not on any value — it
  was on the **precondition**.
- **A row that cannot fail is worse than no row.** `[3a2]` did not merely fail to
  catch the regression `[3a]` caught; it stood next to it and contradicted it.
- **A retirement can make a gate vacuous without touching it.** `BUILDABLE` going
  `null` was correct, intended, and turned a working assertion into an anti-gate
  in a file nobody edited. Every `X === null || …` guard in this repo written
  against a clause that can retire deserves the same read.
