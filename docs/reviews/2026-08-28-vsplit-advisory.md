# The advisory that was cited and never written

**Date** 2026-08-28 · **Branch** `feat/vsplit-unlocked-advisory` · **ROADMAP** §5.1 row 80
· **Instrument** `scratchpad/vsplit-advisory-harness.mjs` (`npm run harness:vsplit-advisory`)

---

## 1. The defect, and the part of it that transfers

`src/renderer/providers/effects-aeon.ts`, inside `fireLineAdvisory`, carried this
from the day the function landed:

```js
// An unlocked scene with a split is refused by `scene()` itself, on a
// different rule and with a different message (the two-writer collision); it
// already has its own advisory, and a layer top is not what is wrong with it.
if (layerTopSpace(scene) !== 'screen') return null;
```

The **second half is true** and the early return is right: on a camera-tracked
scene no layer top has a screen line at all, so `fireLineAdvisory` has nothing
true to say about one.

**"It already has its own advisory" was false.** Not "became false" — false when
it was typed. Grepping the whole tree for a second sentence on this bound found
none in the panel. So the early return silenced the one message the author would
have got, **on the strength of a message that did not exist**, and an author
could build a document aeon's `scene()` refuses outright with nothing on screen
saying so.

### How long it stood

Measured with `git log -S`, not estimated:

* the comment entered the tree in **`17b1676`, 2026-08-27 10:16:57 -0400**
  (*"say when a top cannot exist on a screen"*), and the advisory it cited did
  not exist anywhere at that moment;
* the first thing in Aurora to say anything about the combination was
  `splitRefusal`, in **`6d17484`, 2026-08-28 16:32:30 -0400** — **30 hours and
  16 minutes later**, and even then not in the panel and not with the mechanism
  or both remedies;
* it was closed in `8acc58e`, 2026-08-28 16:58.

So the citation was false for its whole life, and **zero test runs** could have
noticed: about 5,300 vitest rows were green over it throughout, because not one
of them can see a React tree. The gap was found only because row 79's raster
timeline had to say something about unlocked scenes **in order to draw
honestly** — the absence became visible from a neighbouring feature, not from
the suite.

### The transferable part

This is `workaround-outlives-its-defect` one level up. A workaround is a claim
about the code around it and nothing re-checks it. This was **a claim about the
code around it that was never true in the first place** — a citation, not a
workaround — and citations are worse, because a workaround at least did
something once.

The rule the parcel adds to the review bar: **a comment that justifies silence
by naming another speaker must name it precisely enough to grep, and the grep
must be run.** "It already has its own advisory" names nothing. Had it said
"`splitRefusal` says it" the check would have taken ten seconds and failed.

### What was actually true instead

`canvas/raster-timeline.ts`'s `splitRefusal` — landed the SAME DAY as the row 79
timeline, so it did not exist when the comment was written — did say something,
and it was:

* in a **different collapsible section** from the two controls that originate the
  fault (the layer's split select and the scene's `v_factor` spinner);
* naming **one** of the engine's two remedies (lock the plane), so an author who
  read it would not learn that expressing the depth horizontally was an option;
* **never naming the mechanism** — only that the engine refuses the scene.

---

## 2. The engine's side, cited

Read through `git show`, never a peer working tree (row 78, and
`test/support/peer-repo.ts` is the mechanism).

**aeon `ea343260c42c961b544f14cede0a8f25a7a7a5fd`** (its `HEAD` and reachable
from `origin/master` at the time of writing), `engine/level/scene_dsl.emp`:

**`:1290` — `scene()` itself refuses the combination**

> `scene(): a layer authors vsplit: At(..) while this scene's Plane-B vertical
> scroll TRACKS THE CAMERA (v_factor {v_factor}; 15 is the lock sentinel). That
> is the two-writer collision: Parallax_Step5_Vscroll recomputes ((camY -
> v_center) >> v_factor) + v_offset every VBlank and Vscroll_Write ships it to
> VSRAM entry 1 at frame top, while the lowered split writes an ABSOLUTE
> constant to the same word mid-frame. The two do not merely disagree about a
> value — the split cannot express what the other writer is for: it carries ONE
> baked scroll value at ONE baked fire line, and that line is derived at
> comptime from the layer top, which is a screen line only while Vscroll_BG is
> constant. Lock the plane (v_factor: 15) and author the depth as a split, or
> express it horizontally (layer(fb:) / curve:), which the walker recomputes
> every frame`

**`:2479` — `scene_vsplit_line()`'s backstop**, and its last clause is why this
has to be an **editor** message rather than a build one:

> `An authored scene cannot reach this (scene() refuses the combination
> outright); a Scene{{ .. }} literal can, and this is where it stops`

The author's document takes the AUTHORED path. The sentence he would eventually
have seen is `scene()`'s — at build time, in a terminal, after the fact.

---

## 3. What was built

### 3.1 One declaration, three compositions

`VSPLIT_LOCK_CLAUSES` in `providers/effects-aeon.ts`:

| clause | what it carries |
|---|---|
| `sceneIs(vf)` | `Plane B's vertical scroll TRACKS THE CAMERA (v_factor {vf}; 15 is the lock sentinel)` — subject-free, because each surface has its own |
| `mechanism` | two writers, the one word, and why the split cannot stand in for the other writer |
| `remedyLock` | lock the plane (v_factor 15) and author the depth as a split |
| `remedyHorizontal` | express the depth horizontally (the layer's Plane B factor, or a Plane B curve), which the walker recomputes every frame |

Composed by three surfaces:

* **`vsplitLockAdvisory(scene, layer)`** — LAYER subject, rendered under the
  layer card's split control. Answers *"what did turning this split on do?"*
* **`sceneVsplitLockAdvisory(scene)`** — SCENE subject, rendered under the
  `v_factor` row. Answers *"what did moving v_factor off the lock do?"*, and is
  the **only** surface that can name WHICH layers, because that route never
  touches one.
* **`splitRefusal`** in `canvas/raster-timeline.ts` — refactored to compose the
  same clauses, replacing its own wording.

This is row 75's rule applied to a second bound: three sentences about one
engine `ensure` force an author to work out whether they are three rules, and
the owner has already lost time to exactly that on the fire bound.

The two panel sentences are **different events, not two dressings of one** — the
`guideBoundNotice` `'held'`/`'illegal'` precedent. A test asserts they share
every clause and are not the same string.

### 3.2 Why the mechanism, and not the illegality

The precedent is `FIRE_FLOOR_IS_THE_BOX`, immediately above in the same file:
the owner's confusion about the fire floor was resolved by a sentence naming the
**coupling he had already correctly noticed**, and the review comment above it
records why *"min 138"* would not have.

The same applies here and harder. The author's model is not merely incomplete —
it is that `v_factor` and `vsplit` are **two independent fields**. *TWO WRITERS
TO ONE WORD* is the fact that makes them one field, and no amount of "this is
refused" gets there.

### 3.3 Why both remedies

They are genuinely different products:

* **Lock the plane** keeps the depth VERTICAL and gives up camera-tracked
  vertical parallax for the whole scene.
* **Express it horizontally** keeps the camera tracking and moves the depth onto
  `fb`/`curve`, which the walker recomputes every frame.

An advisory offering only the first silently narrows what the author can build.
That is what the strip's sentence was doing.

### 3.4 Scope held

* **No control refuses.** The rule *"the control that owns a value refuses to
  originate an illegal one"* is real here and is **pending the owner's review**
  (it touches rows 37/58/66). Neither the `v_factor` spinner nor the split
  select is narrowed; harness rows `[8a]`/`[8b]` assert the document still holds
  the illegal combination and the spinner still shows the typed value.
* **`FactorField` untouched** — a separate parcel, deliberately held.
* **Nothing changed about saving or loading.** Row 58's ruling stands.

---

## 4. How it is proven

### 4.1 Node suite

**5,356 passed · 0 failed · 7 skipped** (baseline on this tree: 5,341/0/7; +15
rows). Any failure would be ours; there is no known-failing test here.

New/changed rows:

* `src/renderer/providers/__tests__/effects-aeon.test.ts` — 12 rows over
  `vsplitLockAdvisory` and `sceneVsplitLockAdvisory`, every clause **derived
  from `VSPLIT_LOCK_CLAUSES`** rather than retyped, every trigger swept over the
  schema's own `v_factor` range.
* `src/renderer/canvas/__tests__/raster-timeline.test.ts` — the unlocked-arm row
  now asserts against the shared clauses, and pins **both** remedies (it used to
  assert `toContain('tracks the camera')`, which the one-remedy wording passed).
* `test/formats/vsplit-two-writer-currency.test.ts` — **new**, see below.

### 4.2 The currency instrument, and why it exists

Every assertion about `VSPLIT_LOCK_CLAUSES` in the provider tests is
**self-consistent by construction**: the clauses are declared once and the tests
derive from that declaration. That is right for *"do the three surfaces agree"*
and answers **nothing** about *"does aeon still refuse this, for these reasons,
with these two remedies"*.

Which is the same shape as the comment that started this row. So the fact gets
an instrument pointed at the engine:

* reads `scene_dsl.emp` at the pinned revision **and** at `origin/master`,
  through git objects;
* identifies the ensure **by its condition** (`any_vsplit == 0 || v_factor ==
  15`), not by a line number — a pinned line rots on the next edit above it;
* pins **seven load-bearing claims**: both writers by name, the word they share,
  the baked-once property, why the line is only a screen line under the lock,
  and **both remedies**;
* **skips LOUDLY** when it cannot measure. Verified: with `AURORA_AEON_REPO`
  pointed at a nonexistent path the file goes **3 passed → 3 skipped**, so its
  green is not a green-when-absent.

### 4.3 Red-first, node

Three violations planted against the committed tree, each restored:

1. **Drop the horizontal remedy** (the exact defect `splitRefusal` shipped
   with) → 3 rows red across two files:
   `expected 'this layer authors a Plane B split wh…' to contain 'express the depth horizontally instea…'`
2. **Remove the locked-scene early return** (an always-on hint) → 2 rows red:
   `AssertionError: expected 'this layer authors a Plane B split wh…' to be null`
3. **Replace the mechanism with `'The build refuses it.'`** → the mechanism row
   AND the engine-currency row red:
   `expected 'The build refuses it.' to match /two writers, one word/i`

### 4.4 CDP harness — **36/36 on three consecutive runs**

`scratchpad/vsplit-advisory-harness.mjs`, dpr 1, 1680x1050 under Xvfb. Every
sentence is read from `textContent` in the live DOM; nothing asks a provider
what it would have returned.

* Every clause is **parsed out of the provider source**; the lock sentinel comes
  from the **schema's** `properties.v_factor.maximum` (the app's own derivation
  chain, checked still to be `EFFECTS_V_FACTOR_BOUNDS.max`). No sentence and no
  bound is typed in the instrument.
* The illegal combination is built **through the real controls** and read back
  out of the document (`__dbg.aeon.scenesJson()`) before any DOM is inspected.
* Only one row uses client coordinates (`[5c]`, `elementFromPoint`) and it aims
  at the hint's integer-rounded centre; dpr, rect and aim are printed regardless.

### 4.5 This parcel's exposure, and the rows that answer it

**It is the shape of the defect itself: a locked scene produces no advisory, and
so does a completely broken implementation.** Every scene that ships is locked.

So every discriminating row is a **pair inside one session**:

| pair | rows |
|---|---|
| a LOCKED scene **with a split** is silent; the same scene one field later speaks | `[4b]` + `[5a]` |
| re-locking with a split goes silent again — not permanent chrome | `[9a]` |
| unlocking **without** a split stays silent — that scene is legal | `[9b]` |

Neither half alone discriminates: `[4b]` alone is what a **deleted** feature
returns, `[5a]` alone is what an **always-on** hint returns.

Other discriminators: `[5b]` (both remedies on screen — an advisory offering one
cannot survive it), `[5c]` (`elementFromPoint` lands inside the hint — a
`display:none` hint still has a `textContent`), `[6a]`/`[6b]` (the scene
sentence names which layers), `[7a]`/`[7b]`/`[7c]` (**DOM order**, via
`compareDocumentPosition`, pins one sentence between the `v_factor` spinner and
the cards and one per card), `[9c]`/`[9d]` (route B — turning the split on).

**Non-discriminating rows, named:** `[0y] [0a] [1a] [2a] [3a0] [3a1] [3a2] [3b]
[4a0] [4a] [5a0] [5a1] [6b0] [9a0] [9b0] [9b1] [9b2] [9c0] [10a]` are setup and
anti-vacuous. `[8b]` guards a **non-goal** (nothing clamped `v_factor`) rather
than passing a feature.

### 4.6 The alternative green path, ruled out by measurement

*If these rows went green for a reason OTHER than the rule holding, what would
it be?*

**Because `splitRefusal` composes the same clauses, the raster timeline strip
can put the sentence on screen with the panel still silent** — which is very
nearly the original defect wearing this parcel's clothes. `[5a]`–`[5d]` only ask
*"is it on screen"*, and would pass.

Measured, not reasoned: the harness was run against a build carrying
**origin/master's `EffectsScenePanel.tsx`** on this branch's provider.

```
29/36 rows passed
FAIL  [6a] the v_factor route names WHICH layer is now illegal
        looking for "layer 0 authors a Plane B split" on screen
FAIL  [6b] with two splits it names both, in order
FAIL  [7a] the SCENE sentence sits between the v_factor spinner and the layer cards
        {"found":false}
FAIL  [7b] the LAYER sentence sits on a layer card
        {"found":false}
FAIL  [7c] ANTI-VACUOUS: there are TWO layer sentences, one per split layer
        0 element(s).
FAIL  [9c] turning the SPLIT on (route B) makes the layer card speak
        0 sentence(s); expected exactly one
FAIL  [9d] and it carries the mechanism and BOTH remedies
        text="undefined…"
```

`[5a] [5b] [5c] [5d]` stayed **GREEN** off the strip.

**So the panel's rows are `[6a] [6b] [7a] [7b] [7c] [9c] [9d]`**, and the
harness's own summary says so, so nobody reads the 5-series as proof about the
panel.

---

## 5. Open / tagged

* **TAGGED for foreground:** not seen on the owner's display. The sentences are
  proven present in the DOM of a real Electron window under Xvfb; nobody has
  looked at them at the owner's resolution, and the layer-card hint is a long
  sentence in a narrow column (measured box 200px wide × 346px tall for the
  three hints together at 1680x1050 — it wraps, it does not truncate, but its
  length at the owner's column width is a design question a person should see).
* **No emulator touched.** Nothing here needs one: the advisory is comptime
  behaviour the engine reports at build time.
* **STILL OPEN, deliberately: rows 37/58/66's authorship rule.** *"The control
  that owns a value refuses to originate an illegal one; every other route
  surfaces it."* It is real for this bound too — the `v_factor` spinner and the
  split select both originate a scene the build refuses — and it is **pending
  the owner's review**. Building further refusal on an unreviewed rule increases
  what unwinds if he rejects it, so this parcel surfaces and does not prevent.
* **`rasterTimelineSpaceNotice` was left alone.** Its subject is the strip's
  RULER (*"these rows are where the tops land for THIS camera only"*), not the
  refusal; folding it into the shared clauses would have merged two genuinely
  different statements. Its tail clause (*"and the engine refuses a split on
  this scene"*) overlaps by one phrase and reads correctly as conditional.
* **The 37 `s1disasm` absolute paths** from row 78 remain out of scope here.
