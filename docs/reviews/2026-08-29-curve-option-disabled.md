# The curve picker stops offering the value the build refuses

**ROADMAP row 13 · branch `o13-curve-option-disabled` · 2026-08-29**

The effects scene panel's **Plane B curve to** dropdown offered every named
factor, including the one equal to that layer's own `fb`. Picking it produced a
ramp whose two ends are equal, which aeon's `scene_dsl.emp` `layer()` guard 4
refuses outright — and the author found out only *afterwards*, from
`curveAdvisory`'s sentence appearing under the row they had just used.

The remedy is the one this repo's drift-codec packet named
(`docs/reviews/2026-08-29-drift-codec.md`): **the option is disabled with a
reason, not merely hidden.**

---

## §1 · What was true before anything changed

Established firsthand, because this row's own wording has been conflated twice
with the *unlocked scene + vsplit* item next to it (whose advisory,
`sceneVsplitLockAdvisory`, was already wired into the panel and is a different
defect).

* **The dropdown genuinely still offered the refused value.** `FactorField`
  rendered `factorOptions()` unconditionally — the schema's whole named list,
  with no reference to the layer being edited. Reproduced in the running app:
  with `fb = FACTOR_1_4`, the curve picker listed a live, selectable
  `FACTOR_1_4`. **Not already fixed.**
* **`curveAdvisory` was the only thing standing there**, and it fires only once
  the refused value is already in the document.
* **The remedy's shape was NOT new to this repo.** Two pickers on this same
  panel already do exactly this, and both write out the reasoning:
  * `leftColumnMaskOptions` — `sprite_mask` disabled with the engine's reason;
  * `tableRefParamOptions` — `period` narrowed to the divisors of the table
    length, with a non-divisor a *file* carries still rendered, disabled.

  So this parcel **applies an established idiom to a third picker** rather than
  inventing one. That matters for the two parcels told to copy it: the thing to
  copy is `tableRefParamOptions`' banner, not this file.

---

## §2 · The strictness question, answered on the repo's own test

`tableRefParamOptions` sets the bar: disable an option **only when no document
content can make it legal**, and it explicitly rules `factor0_lock` the other
way *because that value's precondition is about the rest of the scene*.

`curve.to == fb` passes that test, and it is worth saying why, because at first
glance it looks like the `factor0_lock` case:

* The refused value is **recomputed from `fb` on every render**. It is not a
  claim an author might declare now and make true later — the only way to make
  `to == fb` build is to change `fb`, which is two rows up on the same card and
  immediately moves *which* option is disabled. The picker therefore never
  withholds something the build would have accepted from the document as it
  stands.
* Guard 4 is **unconditional** on the pair. No other key licenses it.
* **The document still saves.** Nothing refuses a write; sigil stays the
  rulebook (row 58's posture).

---

## §3 · What changed

| File | What |
|---|---|
| `src/renderer/providers/effects-aeon.ts` | `curveGoesNowhere` (the predicate), `curveFlatReason` (the sentence), `FactorFieldOption`, `curveFieldOptions`; `curveAdvisory` rebuilt on the first two |
| `src/renderer/components/effects/EffectsScenePanel.tsx` | `FactorField` accepts `options`; the curve row passes `curveFieldOptions(layer)`; the `<option>` carries `disabled` / `title` and the ` (engine refuses)` suffix the other two pickers use |
| `src/renderer/providers/__tests__/effects-aeon.test.ts` | 4 rows, incl. the anti-drift gate |
| `src/renderer/components/effects/__tests__/effects-wording.test.ts` | 1 row: the wiring, and the no-duplicated-predicate gate |
| `scratchpad/curve-option-disabled-harness.mjs` | the CDP instrument (new) |
| `package.json` | `harness:curve-option-disabled` |

**Derived, never copied.** The comparison exists in exactly one place. The
component contains no `fb` comparison at all — asserted, on comment-stripped
source. The greyed option and the sentence under the row are literally the same
string, from `curveFlatReason`.

**The packed escape hatch is never disabled, and that is correct.**
`CUSTOM_FACTOR_VALUE` is a sentinel, not a value. And when `fb` is itself
packed, no named option equals it by value, so none is disabled — the packed
collision is reachable only through the s1/s2/op spinners, where there is no
option to grey, and `curveAdvisory` is what covers it. That two-paths split is
the same one `tableRefAdvisory` keeps beside its own picker.

---

## §4 · Red-first — every gate failed on purpose first

| Plant | What was rotted | Failing assertion (quoted) |
|---|---|---|
| A | `disabled={o.disabled}` deleted from the `<option>` | `expected 'function FactorField<N extends string…' to match /<option[^>]*disabled=\{o\.disabled\}/` |
| B | `curveFieldOptions` disables nothing | `expected false to be true` · and `option FACTOR_LOCKED under fb FACTOR_LOCKED: expected false to be true` |
| C | picker refuses a *different* value than the advisory | `option FACTOR_LOCKED under fb FACTOR_LOCKED: expected false to be true` |
| C2 | picker **stricter** than the advisory | `option FACTOR_1 under fb FACTOR_LOCKED: expected true to be false` |
| D | the refused option **dropped** instead of disabled | `the refused option must still be offered: expected undefined to be defined` |
| E | the options prop rewritten with a local comparison | `expected '// The wave-1 effects scene editor: p…' to match /options=\{curveFieldOptions\(layer\)\}/` |
| E2 | a *stray* duplicated comparison, options prop left intact | `expected '\n\n\n…' not to match /JSON\.stringify\([^)]*\bfb\b/` |

### ⚠ Plant A came back GREEN the first time — diagnosed, not waved through

The first cut of the wiring row sliced the panel source from
`function FactorField` **to end of file**. That swept in the `left_column_mask`
and `period` pickers, which render the *identical* `disabled={o.disabled}` line.
So deleting the flag from the component under test left two other components
holding the row green: **cause 2 of invariant 8 — two code paths, one
observable.** The slice is now bounded to `FactorField` itself, and the bound is
asserted (`not.toMatch(/leftColumnMaskOptions|tableRefParamOptions/)`) so it
cannot silently widen again.

### ⚠ A harness row was half a claim — measured, then fixed

Running the harness against the *real* planted defect (`disabled` deleted,
rebuilt, driven) showed row `3f` **"exactly one option is disabled"** passing
while `3c` and `3e` failed: *"no OTHER option is disabled"* is trivially true
when **none** is. `3f` now also requires that the refused one IS disabled, so
the row is true or false about its own sentence rather than about its easy half.

### The alternative green-path ruled out

*If this went green for a reason other than the property holding, what would it
be?* The dominant candidate is **the selector matching nothing** — the rot that
hit five selectors in a sibling harness. Row `3a` asserts the control was found
and holds a full list before any flag is read, and `PLANT=rot-selector`
reproduces the end-anchored rot: the run fails loudly at `3a` and **refuses to
measure rows 3b..4b at all** rather than rendering absence as green.

The second candidate is **the narrowing leaking to the wrong picker**. Rows
`4a`/`4b` read `fa` and `fb` in the same run and require every option enabled —
a control condition, not a restatement.

---

## §5 · The look change, measured in the running app

`npm run harness:curve-option-disabled` — **27 rows, 0 failed, one run.**
Node suite blind spot closed: 5,661 vitest rows pass whether or not the
component honours `disabled`, and the harness proves it does. Driving the real
app with the flag deleted turns rows `3c`, `3e`, `3f` and `5h` red.

```
LIVE ENV     dpr=1.350000023841858  inner=[1400,872]
RECT         left=1181.458251953125 top=850.7175903320312 w=176.18055725097656 h=24.282405853271484
AIM          (1270, 863)   <- integer client px, derived from the rect above
CAPTURE ENV  dpr=1.350000023841858  inner=[1400,1600]  (height overridden; dpr native)
CLIP         {"x":1085,"y":710,"width":296,"height":151}
```

`dpr` was **1.35** this run — the fractional case the environment note warns
about. Every rect above is fractional; every coordinate aimed at or clipped to
is an integer **derived from the rect printed beside it**, in the same run.
Nothing here is stitched from two runs.

### Screenshots

* `scratchpad/shots-curve-option-disabled/3-option-list-refused-value-greyed.png`
  — **the deliverable.** The option list with `FACTOR_1_4 (engine refuses)`
  greyed and unpickable, every other factor live, `none` live, `Custom…` live.
* `scratchpad/shots-curve-option-disabled/2-refused-value-displayed-with-reason.png`
  — a document that *already carries* `to == fb`: the control still displays its
  own value, labelled `(engine refuses)`, with the full reason rendered in amber
  underneath.
* `scratchpad/shots-curve-option-disabled/1-effects-panel.png` — full panel.

**Why the list shot is not an open native popup.** Chromium draws a `<select>`
menulist as a native widget outside the page, so `Page.captureScreenshot` cannot
see it. An `import -window root` on this run's own pinned Xvfb display was
*tried* and returned 1680x1050, 8-bit grayscale, **two colours, 353 bytes** — a
blank server: under `xvfb-run` with no window manager the Electron window is not
on the root surface at all. A blank PNG is worse evidence than none, so the list
is forced to render inline by setting `size` on **the very same `<select>`**.
The `<option>` elements photographed are the ones React rendered, carrying the
provider's `disabled` flag and label; the greying is the browser's own. The
attribute is removed immediately after. This is a capture technique, not a
different control.

**The back door is real and deliberately left open.** An author can still reach
`to == fb` by moving `fb` *onto* a curve that was legal when they set it — two
rows up on the same card. No picker can close that, and a hand-edited file
reaches it too. Rows `5b`–`5f` drive exactly that path and confirm the control
still displays its own value (a dropped option would show a different one) and
that `curveAdvisory` still renders the reason. **That is why the option is
disabled and not hidden.**

---

## §6 · Sibling advisories — enumerated, NOT touched

The whole family, read unwindowed from `effects-aeon.ts`, `scene.ts`,
`scene-ui.ts` and `raster-timeline.ts` (19 exported advisory/refusal/notice
functions). Widening is the lane's call, not this parcel's.

**Same shape — an enumerable `<select>` offering a value the build refuses:**

| | State |
|---|---|
| `leftColumnMaskAdvisory` / `factor0LockRefusal` | **ALREADY REMEDIED** — `leftColumnMaskOptions` disables `sprite_mask` with its reason; `factor0_lock` deliberately left selectable |
| `tableRefAdvisory` | **ALREADY REMEDIED** — `tableRefParamOptions` narrows `period` to divisors; a file's non-divisor renders disabled |
| `curveAdvisory` | **THIS PARCEL** |
| `vsplitLockAdvisory` / `sceneVsplitLockAdvisory` | **CANDIDATE, UNTOUCHED.** On an unlocked scene the vsplit `none`/`row` select's `row` option makes the build refuse the *whole scene*. But its precondition is another control's value (`v_factor`), so by `tableRefParamOptions`' own test it plausibly belongs on the `factor0_lock` side — advise, don't disable. Genuinely a judgement call; **the lane's.** |
| `driftRateRefusal` | **NO CONTROL YET, BY DESIGN.** The drift-codec packet shipped none precisely so as not to manufacture a second instance of this defect. It is the parcel that copies this precedent. Note it is a *number*, not an enum — the remedy there is `tableRefParamOptions`' other half (a bounded control), not a disabled option. |

**Different shape — not this defect, no action implied:**
`binPathRefusal` and `sceneIdRefusal` (free-text fields, not enumerable);
`fireLineAdvisory` and `vsplitOrderAdvisory` (about a *number*, `world_y`, and
about two layers at once); `layerCurveDeformAdvisory`, `curveAnchorDeformAdvisory`,
`sceneDeformAdvisories`, `advisoryLayerDeformConflicts` (cross-field — the halves
sit on different objects, so no single control can carry them);
`layerDeformAdvisory` (not a refusal at all — it explains a legal-but-silent
state); `splitRefusal` and `rasterTimelineSpaceNotice` (read-only canvas labels);
`guideBoundNotice` (a notice); `unassignableSceneRef` (a value with *no* option,
the inverse case, already covered by its advisory).

---

## §7 · Suite

```
Test Files  417 passed | 2 skipped (419)
Tests     5661 passed | 7 skipped (5668)
skip-report: OK — every skip named its reason.
```

Zero failures. `npx tsc --noEmit` clean. `node scratchpad/check-harness-guards.mjs`
(re-run *after* the new harness existed, so the count includes it):
`144 clean / 144 classified · 0 failure(s) · 0 unmeasurable` — the new file
classifies as `LAUNCHER (guarded)`, i.e. it launches through `spawnGuarded` and
cleans up through `killTree`, never a `pkill` pattern.

---

## §8 · Open, and why

* **Widening to `vsplitLockAdvisory` is NOT done** — §6 explains why it is a
  genuine judgement call and the brief reserved scope to the lane.
* **The closed control truncates the suffix.** At the column's 176px the
  selected refused value reads `FACTOR_3_8 (engine refuses` with the final
  bracket clipped (visible in shot 2). The *list* is not truncated (shot 3), the
  full sentence is in the option's `title`, and the advisory underneath spells
  it out — so nothing is lost, but it is cosmetically imperfect and worth a
  glance. Not fixed here: any remedy touches the shared column width that four
  other rows are measured against.
* **No emulator was touched.** Nothing in this parcel wants one — the change is
  editor-side and the engine rule it transcribes was already transcribed.
* **The harness needs a writable aeon copy** (`AEON_DIR`) and refuses to run
  against `/home/volence/sonic_hacks/aeon` itself, because it saves.
