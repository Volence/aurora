# `curve` and `vsplit` are reachable — the cheap instrument, and what it carried

**Date** 2026-08-27 · **Branch** `test/curve-vsplit-reachable` · **Base** master `1330a77`
**Parcel type** verification, on a ruled reshaping of ROADMAP row 61.

---

## 0. THE ROW CHANGED SHAPE BEFORE THIS PARCEL STARTED — read this first

Row 61 as **booked** asks for a **second writer-originated fixture**: a `deform`-free
session driving `curve`/`vsplit`, because row 60 widened `writer_session_ojz` to carry
`deform` and `v_deform`, and aeon **refuses `curve` beside a strip's `deform` and
`vsplit` beside a scene's `v_deform`**. The two remaining wave-1-authorable layer
fields are therefore mutually exclusive with the file that would have covered them.

**The owner ruled otherwise, and this packet delivers the ruled version.** A second
originated fixture carries a second provenance record, a second pinned blob hash and a
standing obligation to **re-run a whole CDP session every time the contract moves** —
a bill that came due **twice on 2026-08-27 alone** (rows 59 and 60). `canopy_dusk.json`
(writer-CERTIFIED) already covers both fields for **shape**. The only uncovered claim
is the narrow one:

> **an author can reach `curve` and `vsplit` through the UI.**

A harness carries that without a recurring bill. **The suite hub confirmed no
cross-lane consumer depends on a second originated artifact existing.**

**Why the claim is worth proving at all.** ROADMAP row 57 found `openBgTileDocument`
with **zero callers anywhere outside its own definition and tests** — fully unit-covered,
and no user could ever invoke it. *Coverage of a function says nothing about whether
anything calls it.* That is the defect class ruled out here, and **only a running app
can rule it out**: the ~5,000-test node suite cannot see React, a canvas, or a mounted
panel.

**ROADMAP row 61 is replaced in place as DELIVERED, and the replacement states which
SHAPE it took**, so a later session cannot read it as the booked version having been done.

---

## 1. VERDICT

**THE HARNESS CARRIED THE CLAIM.** Both fields are reachable, on all four required
points, through **two independent input paths**, and every value asserted is one the
app's own defaults cannot produce. Nothing here fell short of the row's requirement.

Two honest qualifications, neither of which weakens the claim:

* **One instrument limit was found and worked around, not hidden.** A `<select>` cannot
  be driven by **arrow keys** through CDP in this environment — Chromium's menulist
  opens a *native* popup that lives outside the page. It **can** be driven by
  **typeahead**, which is how a keyboard user picks from a closed list. Measured, §5.
* **One half of one row is non-discriminating and is disclosed** — the "and is ENABLED"
  clause of rows 3a/4a. §7 names it and names its catcher.

| row 61's requirement | field | carried by | verdict |
|---|---|---|---|
| 1. control exists and is enabled, on a legal scene | curve | `3a` (+ `2c` for legality) | **yes** (enabled half disclosed, §7) |
| | vsplit | `4a`, `4d` (+ `2c`) | **yes** (same disclosure) |
| 2. a real gesture changes the DOCUMENT | curve | `3c`, `5a` | **yes**, model read back through `__dbg` |
| | vsplit | `4c`, `4e`, `5b`, `5c` | **yes**, same |
| 3. the value survives a save and reaches the FILE | curve | `6b` | **yes**, bytes off disk |
| | vsplit | `6c` | **yes**, same |
| 4. the value is the one the gesture ASKED FOR | curve | `3b` + `3c` | **yes**, §3 |
| | vsplit | `4c`/`4e`/`4f` + `5c` | **yes**, §3 |
| blanket: no selector returned `no-element` | both | `7a` | **yes** |

---

## 2. WHAT CHANGED

| path | what |
|---|---|
| `scratchpad/curve-vsplit-reachable-harness.mjs` | **new.** The harness. 30 rows. |
| `scratchpad/_select-key-probe.mjs` | **new.** The probe that settled the three real-input facts in §5, committed so they can be re-derived rather than believed. |
| `docs/reviews/2026-08-27-curve-vsplit-reachable.md` | **new.** This packet. |
| `docs/ROADMAP.md` | **row 61 REPLACED IN PLACE** as DELIVERED, stating the shape it took. |

**`src/` IS UNTOUCHED.** Three app-side defects were planted, built, run and reverted
(§6); `git diff master -- src/` is **empty** at the end of the parcel, quoted in §6.4.

### 2.1 Provenance — the required lines

| | |
|---|---|
| aeon under test | a **copy** — `cp -a ../aeon/project.json ../aeon/games ../aeon/art <scratchpad>/aeoncopy/`. The harness **refuses to start** if `AEON_DIR` begins with aeon's own path. |
| `cargo` in sigil | **never run.** No build of aeon or sigil was needed or attempted — this is a UI-reachability parcel, and nothing in it lowers a scene to a ROM. |
| emulator | **never started.** Nothing here needs one. |
| Aurora build | `VITE_AURORA_DEBUG=1 npx electron-vite build`, run 5 times (baseline, plant A, plant B, plant C, restored). `node_modules` is symlinked from the main checkout; `package.json` verified byte-identical to `master:package.json`. |

**aeon editor-effects tree, md5 BEFORE and AFTER — the required line:**

```
BEFORE (08:00)                                             AFTER (08:13, identical)
dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json      dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json
bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json      bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json
```

`git -C ../aeon status --porcelain` at the end shows `M docs/decisions.jsonl`,
`M docs/lane-status.json`, `?? games/sonic4/data/sprites/object-bindings.json` — **all
three are other lanes' and none is under `data/editor/effects/`.** `../sigil` was
neither read nor written.

---

## 3. THE ROWS, AND WHY NO DEFAULT CAN PRODUCE WHAT EACH ASSERTS

This is the part that has bitten this harness family twice, so it is stated per row.

**The two historical failures, for calibration.** (i) Five selectors were **end-anchored**
(`/^v_offset$/`) against titles that had grown explanatory tooltip suffixes: the driver
returned `'no-element'`, the field kept the app's default, **and every row still passed**
— because *the default is itself a legal value*, so a row asserting "this field holds one
of the schema's legal options" passes identically whether the gesture landed or never
fired. (ii) `world_y`'s rule prescribed `i*32` and `addLayerCommand` pushes
`last.world_y + 32`, so **the app's own default for added layers IS `i*32`** and that row
was non-discriminating and always had been.

**Every selector in this harness matches with `\b`. None uses `$`** — except inside the
two deliberate rot plants, which exist to prove the rows notice.

### 3.1 `curve`

| | |
|---|---|
| **the app's default** | **the key is ABSENT.** `newEffectsLayer` writes `world_y`/`fa`/`fb` and nothing else; the schema's `$defs.layer.properties.curve.default` is the string `"none"`; `curveFieldValue` maps both absent and `"none"` to `'none'`. |
| **this run asserts** | `layers[0].curve = {to: "FACTOR_3_4"}` and `layers[2].curve = {to: "FACTOR_3_4"}` |
| **why the default cannot produce it** | the default is **the absence of the key**. There is no path in the app that writes `{to: <a factor name>}` onto a layer other than this picker's `onChange`. A row asserting "curve holds a legal value" would pass on `undefined`; this row does not, because it compares against the exact string the rule computed. |

**Rule C** is *the option at index ⌊len/2⌋ of the picker's own option list* — derived from
the control, never typed. Row `3b` makes it **safe rather than lucky** by asserting at
runtime that the pick is:

* **not `__none__`** — the none sentinel, i.e. the default;
* **not `__packed__`** — the custom escape hatch, which seeds a triple *the app* chooses
  rather than a value the rule asked for;
* **not equal to this layer's `fb`** — aeon's `layer()` guard 4 refuses a ramp whose two
  ends are equal (`curveAdvisory` says so before the build does), and `newEffectsLayer`
  seeds `fb = FACTOR_1`, so a rule landing there would author a scene the build rejects.

`3b` is itself anti-vacuous: it asserts the option list *does* contain both sentinels, so
"not a sentinel" is a fact about this pick and not about a list that has none. Measured:

```
PASS  [3b] rule C's pick is a real factor: not the `none` sentinel (the default), not the custom-packed escape hatch, and NOT this layer's own fb (which the engine refuses)
        pick=FACTOR_3_4 at index 9 of 18; layer 0 fb="FACTOR_1"; options=["__none__","FACTOR_LOCKED","FACTOR_0","FACTOR_1","FACTOR_1_2","FACTOR_1_4","FACTOR_1_8","FACTOR_1_16","FACTOR_1_32","FACTOR_3_4","FACTOR_3_8","FACTOR_3_16","FACTOR_5_8","FACTOR_5_16","FACTOR_7_8","FACTOR_7_16","FACTOR_15_16","__packed__"]
PASS  [3c] a real gesture on the curve picker put THE ASKED-FOR FACTOR into the DOCUMENT — a value the app has no default path to produce
        before=undefined after={"to":"FACTOR_3_4"} asked=FACTOR_3_4
        other layers' curve = [{"to":"FACTOR_3_4"},null,null]
```

### 3.2 `vsplit` — two gestures, and the second is the one that matters

| | |
|---|---|
| **the app's default (key)** | **ABSENT.** Same argument as `curve`; schema default `"none"`. |
| **the app's default (value, once on)** | ⚠ **`vsplitFromToggle` seeds `{at: clampVSplitAt(world_y)}`.** So `at === world_y` is *the app's own choice*, not an author's. This is exactly the `world_y = i*32` trap, one field over. |
| **this run asserts** | `layers[1].vsplit = {at: 170}` and `layers[2].vsplit = {at: 341}` |
| **why the default cannot produce it** | **three independent escapes.** (a) the key is absent by default; (b) **the toggle's seed is read out of the document between the two gestures** (`seed=32` on layer 1, `seed=64` on layer 2) and row `4e`/`5c` assert the final value **differs from that recorded seed**; (c) 170 and 341 are **interior** to the control's advertised `0..511`, so no clamp and no saturation can land on them. |

**Rule V** is: the toggle takes the **last of the two options its own select offers**;
the row spinner then takes `min + ⌊(max−min+1)/3⌋` read off **the spinner's own advertised
bounds** (→ 170), and path 2's spinner takes `min + ⌊2(max−min+1)/3⌋` (→ 341).

⚠ **THE ONE-THIRD IS NOT DECORATION — it is the sentinel trap avoided by construction.**
`15` is a no-op sentinel across this schema family (`shift_a`/`shift_b` 15 = "this plane
takes none of it"; `EFFECTS_V_FACTOR_LOCK` = 15 = LOCKED), and a rule reaching for "a
large value" **by saturating** lands on a sentinel and authors *nothing happening* while
looking like it authored something. **No rule in this harness saturates**: not `max`, not
`min`, not `max − N`. Row `4f` pins that as a fact about the number:

```
PASS  [4c] the vsplit toggle put the KEY into the DOCUMENT (the schema default is its absence) — and the value it seeded is the app's own, recorded for row 4e
        before=undefined seeded={"at":32} (layer top = 32)
        other layers' vsplit = [null,{"at":32},null]
PASS  [4e] a real gesture on the vsplit ROW spinner moved the DOCUMENT off the toggle's seed and onto THE ASKED-FOR ROW
        seed=32 -> now={"at":170} asked=170 bounds=[0,511]
        layer top unchanged at 32 (a spinner wired to the wrong field would have moved it)
PASS  [4f] the authored split row is INTERIOR to the control's range and is not the layer top — nothing here was reached by saturating
        VSPLIT_AT=170, bounds=(0,511) exclusive, layer top=32
```

**Row `4c` deliberately does NOT carry point 4**, and says so in its own text: the value
it lands on *is* a seed. What `4c` proves is that **the key appeared where the default is
its absence**. Point 4 for `vsplit` is `4e`'s job, and `4c`'s recorded seed is the number
`4e` is asserted different from. Separating them is what stops `4e` being the `world_y`
trap a third time.

### 3.3 The blanket ledger — row `7a`

Every gesture goes through one `drive()` that records the selector's own verdict. `7a`
asserts **not one returned `'no-element'`**, and that the count is exactly what the rules
prescribe (a *skipped* gesture leaves no `'no-element'` behind, so the count matters).

```
PASS  [7a] EVERY gesture found its control — no selector returned `no-element` — and the session issued exactly the gestures the rules prescribe
        8 gestures issued (rules prescribe 8), 0 missed
        ledger: ["G1 new_scene_id=ok","C layer 0 curve.to=ok","V layer 1 vsplit toggle=ok","V layer 1 vsplit.at=ok","K layer 2 focus curve=ok","K layer 2 focus vsplit=ok","K layer 2 focus vsplit.at=ok","G2 sceneRef=ok"]
```

⚠ **`7a` IS NOT SUFFICIENT ON ITS OWN, AND THE PLANTS PROVED IT.** Under plants A and B
— the app's `onChange` unwired or pointed at the wrong field — **`7a` stayed GREEN**: the
selector found its element, the event fired, and the app simply did nothing with it. The
value rows are the catchers there. Both kinds of row are kept because they catch
different halves of the same failure. §6 has the quoted evidence.

### 3.4 The legality precondition — row `2c`

Row 61's premise is the mutual exclusion, so the scene these fields are driven on must
carry **neither** side of it, or the rows would be authoring a scene the build rejects and
proving the wrong thing. Read off the **created document**, not asserted from
`newEffectsScene`'s source:

```
PASS  [2c] the fresh scene is the LEGAL case for curve and vsplit — no scene deform, no v_deform, no left_column_mask, and no strip carries its own deform
        {"keys":["schema","id","layers","v_factor"],"layerDeforms":[null,null,null]}
```

and row `6f` re-checks it **on the emitted bytes**, so a writer that added a deform key
on the way out could not hide.

### 3.5 The *illegal* case is surfaced — row `8a`

Row 61's point 1 allows the control to be "legitimately disabled or advised against" on a
deform-carrying scene — "the engine's rule, not a defect". **That is only true if the app
says so.** After the save (so the emitted bytes stay the clean legal scene), the harness
turns the curve layer's own `deform` on and reads the rendered surface:

```
PASS  [8a] turning the SAME strip's deform on makes the app SAY the pair is refused — the illegal case is advised against, on screen, not silently allowed
        toggle=ok; advisories on screen: ["this strip authors both a curve and its own deform table — the build forbids curve and deform on one strip (the fill's curve loop has no registers left for a sampled channel). Move the deform to another strip, or drop the curve."]
```

`8a` is discriminating: under the curve plants (A and the gesture rot) it went **red**,
because with no curve on that strip there is correctly nothing to advise against.

---

## 4. THE RUNS — dpr, rect, load average, uptime, and the count

**Three runs of the FINAL green harness, back to back, on the restored build.** No row is
read out of a different run from any other row: every quoted block above comes from a
single run, and the three runs agree byte-for-byte on the emitted file.

| run | uptime at start | loadavg at start | dpr | wall | result | emitted sha256 |
|---|---|---|---|---|---|---|
| green 1 | `08:11:29 up 2 days, 0 min` | `2.59 2.59 2.64` | **1** | 26.0 s | **30/30** | `952c4d9a…6029d688` |
| green 2 | `08:11:59 up 2 days, 1 min` | `2.59 2.58 2.64` | **1** | 26.0 s | **30/30** | `952c4d9a…6029d688` |
| green 3 | `08:12:29 up 2 days, 1 min` | `2.37 2.52 2.62` | **1** | 26.0 s | **30/30** | `952c4d9a…6029d688` |

Aggregate, not a tail: **30 of 30 checks passed** in each of the three runs; `rc=0`.

The controls' rects, printed live by every run:

```
        LIVE ENV  dpr=1 inner=[1400,872]
        curve select  rect={"x":1182,"y":869,"width":175,"height":26,"top":869,"right":1357,"bottom":895,"left":1182}
        vsplit select rect={"x":1182,"y":1356,"width":72,"height":26,"top":1356,"right":1254,"bottom":1382,"left":1182}
        (no row below derives an expectation from a pixel coordinate — §B)
```

⚠ **THE DPR TRAP DOES NOT REACH THIS INSTRUMENT, and that is a claim, not an excuse.**
`devicePixelRatio` has been seen at both 1 and 1.35 hours apart on this machine, and at
1.35 a rect is fractional, so an event aimed at `rect.top + N` lands one device row off
and presents as an off-by-one bug in a feature that is fine. **No row here is aimed at a
pixel coordinate**: every gesture targets a DOM element found by its *rendered title*, or
is a key event delivered to whatever the page has focused. dpr read **1** on all three
runs and the rects are integral, but the rows would be unchanged if it read 1.35. The
numbers are printed anyway, as the standing bar requires.

**The emitted file, all three runs identical (522 bytes):**

```json
{
  "id": "curve_vsplit_reach",
  "layers": [
    { "curve": { "to": "FACTOR_3_4" }, "fa": "FACTOR_1", "fb": "FACTOR_1", "world_y": 0 },
    { "fa": "FACTOR_1", "fb": "FACTOR_1", "vsplit": { "at": 170 }, "world_y": 32 },
    { "curve": { "to": "FACTOR_3_4" }, "fa": "FACTOR_1", "fb": "FACTOR_1", "vsplit": { "at": 341 }, "world_y": 64 }
  ],
  "schema": 1,
  "v_factor": 15
}
```

(reformatted to one layer per line for width; the file itself is the app's own
pretty-printed output, quoted verbatim in every run log.)

⚠ **THIS FILE IS NOT A FIXTURE AND MUST NOT BECOME ONE.** It is a per-run artifact
written to a throwaway copy of the aeon tree and deleted before each run. It carries **no
provenance record, no pinned blob, and no re-origination obligation** — which is the whole
economic point of the ruling. Anyone tempted to check it in has re-created the cost the
ruling avoided.

**Node suite, supporting evidence only.** `npx vitest run src/renderer/components/effects
src/renderer/providers/__tests__/effects-aeon.test.ts` → **4 files, 127 tests passed**,
385 ms. That is a real cross-check on the codec and the wording tests, and it is **not**
evidence for anything in this packet: the node suite cannot see React, a canvas, or a
running app, which is the entire reason this parcel exists.

---

## 5. THE INSTRUMENT LIMIT, MEASURED — arrow keys, typeahead, and a double-typed digit

Path 2 exists so the reachability claim cannot be answered with "you synthesised an
event". It uses `Input.dispatchKeyEvent` — **Chromium's own input pipeline**, no
`new Event`, no native value setter, no `.click()`. Three facts about it were **measured,
not reasoned**, and the first two runs of this harness paid for each. The probe is
committed (`scratchpad/_select-key-probe.mjs`); its output, verbatim:

```
BEFORE {"v":"smooth","opts":["smooth","instant"],"focused":true}
after rawKeyDown  smooth|focus=true
after keyDown     smooth|focus=true
opts [ 'smooth', 'instant' ]
after typeahead "inst" instant|focus=true
rect { x: 1277, y: 413 }
after mouse click instant|focus=true
after click+arrow+enter instant|focus=true
number BEFORE 0|true
number AFTER  112233 | model v_center = [32767,0,0]
```

1. **ArrowDown DOES NOT DRIVE A `<select>` HERE, in any event form.** `keyDown`,
   `rawKeyDown`, and even a real mouse click on the control followed by ArrowDown+Enter
   all left the value at `smooth`. In the harness's first two runs this presented as
   `curve=undefined` after nine presses — which looks exactly like an unreachable control
   and is not. **Chromium's menulist opens a native popup widget outside the page, and
   CDP's Input domain cannot reach into it.** An instrument limit, not a defect. Reported
   rather than absorbed, because the next parcel that tries to drive a picker with arrow
   keys will otherwise re-derive it as a bug in the app.
2. **TYPEAHEAD DOES.** Typing the option's own displayed text at a focused, *closed*
   select moves the selection and fires `change` — Chromium's built-in select typeahead,
   and the way a keyboard user picks from a closed list without ever opening it. The probe
   moved `transition` from `smooth` to `instant` by typing `inst`. That is path 2's
   gesture for both pickers, and the text it types is read off the DOM (`option.text`),
   never typed into the harness.
3. **A `keyDown` CARRYING `text` MUST NOT ALSO GET A `char` EVENT.** Sending both inserted
   **every digit twice** — the probe typed `123` into a spinner and read back `112233`
   (and the model clamped to `32767`). One event per character. `Ctrl+A` also does not
   select-all in this input, so the field is cleared with Backspaces.

**What path 2 then showed, on the restored build:**

```
PASS  [5a] REAL keyboard input (typeahead "FACTOR_3_4" on the focused picker) reached the curve field in the DOCUMENT, at the same rule-C value
        focus=ok curve={"to":"FACTOR_3_4"} asked=FACTOR_3_4 via typed text "FACTOR_3_4"
PASS  [5b] REAL keyboard input (typeahead "row") turned the split ON in the DOCUMENT
        focus=ok vsplit={"at":64} (layer top 64) via typed text "row"
PASS  [5c] REAL typed digits moved the split row in the DOCUMENT to the typed number — off the seed, and off every other layer's value
        typed=341 seed=64 now={"at":341} (row 4e's layer holds 170, this layer's top is 64)
PASS  [5d] the DOM-event path and the REAL-INPUT path put the same factor on their respective layers — the control answers both
        [{"curve":{"to":"FACTOR_3_4"}},{"vsplit":{"at":170}},{"curve":{"to":"FACTOR_3_4"},"vsplit":{"at":341}}]
```

`5d` is the row that makes the two paths worth having separately: a wiring that only
answered synthesised events would split them apart.

---

## 6. RED-FIRST — every plant, with quoted failure

Five plants. **Three are defects in the APP** (built, run, reverted); **two are defects in
the INSTRUMENT** (env knobs on the harness, no rebuild). The load-bearing one the brief
named — *unwire the control's `onChange` and confirm the reachability rows go RED* — is
plant A, and it is joined by two more of the same family.

### 6.1 PLANT A (load-bearing) — the curve picker's `onChange` UNWIRED

`EffectsScenePanel.tsx`, the curve `FactorField`:

```diff
-                  onChange={(f) => run(setLayerFieldCommand(
-                    library, selected.id, i, 'curve', curveFromField(f)))} />
+                  onChange={() => { /* PLANT A: the curve picker is UNWIRED */ }} />
```

`VITE_AURORA_DEBUG=1 npx electron-vite build` → rc 0. Harness → **rc 1, 25/30**:

```
FAIL  [3c] a real gesture on the curve picker put THE ASKED-FOR FACTOR into the DOCUMENT — a value the app has no default path to produce
        before=undefined after=undefined asked=FACTOR_3_4
        other layers' curve = [null,null,null]
FAIL  [5a] REAL keyboard input (typeahead "FACTOR_3_4" on the focused picker) reached the curve field in the DOCUMENT, at the same rule-C value
        focus=ok curve=undefined asked=FACTOR_3_4 via typed text "FACTOR_3_4"
FAIL  [5d] the DOM-event path and the REAL-INPUT path put the same factor on their respective layers — the control answers both
        [{},{"vsplit":{"at":170}},{"vsplit":{"at":341}}]
FAIL  [6b] the authored CURVE survived the save and is in the emitted FILE, on exactly the strips the gestures named
        file layers' curve = [null,null,null]
FAIL  [8a] turning the SAME strip's deform on makes the app SAY the pair is refused — the illegal case is advised against, on screen, not silently allowed
        toggle=ok; advisories on screen: []
```

⚠ **THE MOST IMPORTANT LINE IN THIS SECTION: under plant A, row `3a` stayed GREEN and row
`7a` stayed GREEN.** The control was on screen, enabled, with a full option list, and
every selector found its element. **If the rows were proving "a control is on screen",
this run would have been all-green** — which is precisely the failure the brief warned
about, and precisely what rows 3c/5a/6b are for.

### 6.2 PLANT B (load-bearing) — the vsplit row spinner points at the WRONG FIELD

```diff
                         onChange={(n) => run(setLayerFieldCommand(
-                          library, selected.id, i, 'vsplit', { at: clampVSplitAt(n) }))} />
+                          library, selected.id, i, 'world_y', clampVSplitAt(n)))} />
```

Build rc 0. Harness → **rc 1, 27/30**:

```
FAIL  [4e] a real gesture on the vsplit ROW spinner moved the DOCUMENT off the toggle's seed and onto THE ASKED-FOR ROW
        seed=32 -> now={"at":32} asked=170 bounds=[0,511]
        layer top unchanged at 170 (a spinner wired to the wrong field would have moved it)
FAIL  [5c] REAL typed digits moved the split row in the DOCUMENT to the typed number — off the seed, and off every other layer's value
        typed=341 seed=64 now={"at":64} (row 4e's layer holds 170, this layer's top is 64)
FAIL  [6c] the authored VSPLIT survived the save and is in the emitted FILE at the asked-for rows — not the toggle seeds, not the layer tops
        file layers' vsplit = [null,{"at":32},{"at":64}]; tops = [0,170,341]
```

This is the plant that answers **"does the row measure the wrong quantity?"** — the third
cause of a poison coming back green. The detail line prints the smoking gun itself: the
row's own "layer top unchanged" clause read **170**, i.e. the number the author asked for
landed in `world_y`, and `6c`'s `tops = [0,170,341]` shows the whole shift on the bytes.
`7a` again stayed green.

### 6.3 PLANT C — the vsplit TOGGLE's `onChange` UNWIRED

```diff
-                            onChange={(v) => run(setLayerFieldCommand(
-                              library, selected.id, i, 'vsplit', vsplitFromToggle(v === 'at', layer)))}
+                            onChange={() => { /* PLANT C: the vsplit toggle is UNWIRED */ }}
```

Build rc 0. Harness → **rc 1, 22/30**, eight rows red — `4c 4d 4e 4f 5b 5c 7a 6c`:

```
FAIL  [4c] the vsplit toggle put the KEY into the DOCUMENT (the schema default is its absence) — and the value it seeded is the app's own, recorded for row 4e
        before=undefined seeded=undefined (layer top = 32)
        other layers' vsplit = [null,null,null]
FAIL  [4d] the vsplit ROW spinner appeared once the split was on, enabled, and advertising the schema's own plane-row bounds
        {"found":false}
FAIL  [7a] EVERY gesture found its control — no selector returned `no-element` — and the session issued exactly the gestures the rules prescribe
        8 gestures issued (rules prescribe 8), 2 missed: [{"label":"V layer 1 vsplit.at","r":"no-element"},{"label":"K layer 2 focus vsplit.at","r":"no-element"}]
```

**Plant C also found a defect in the instrument and it was fixed.** The first plant-C run
**threw** (`TypeError: Cannot read properties of undefined (reading 'at')`) and aborted
before the save rows could be read — a defect must **redden rows, not crash the
harness**, or it presents as a broken instrument rather than a caught bug. Row `4e` now
reads a null-safe recorded seed. Re-run under the same plant: eight clean reds, no throw.

### 6.4 PLANTS D and E — instrument rot, the exact shape of the five real ones

`PLANT=rot-curve-gesture` end-anchors **only the gesture's** selector, leaving the probe's
intact — so the control is on screen the whole time and only the gesture misses, which is
how all five real rots presented. → **rc 1, 25/30**:

```
FAIL  [3c] a real gesture on the curve picker put THE ASKED-FOR FACTOR into the DOCUMENT — a value the app has no default path to produce
        before=undefined after=undefined asked=FACTOR_3_4
FAIL  [7a] EVERY gesture found its control — no selector returned `no-element` — and the session issued exactly the gestures the rules prescribe
        8 gestures issued (rules prescribe 8), 1 missed: [{"label":"C layer 0 curve.to","r":"no-element"}]
        ledger: ["G1 new_scene_id=ok","C layer 0 curve.to=no-element","V layer 1 vsplit toggle=ok","V layer 1 vsplit.at=ok","K layer 2 focus curve=ok","K layer 2 focus vsplit=ok","K layer 2 focus vsplit.at=ok","G2 sceneRef=ok"]
```

`PLANT=rot-curve-selector` rots both and is caught one row earlier, at `3a`
(`FAIL [3a] the curve control EXISTS …`), after which the harness stops on its own —
a missing control is the reachability claim failing, and it fails loudly.

### 6.5 Restore

`git diff --stat master -- src/` → **empty**. `git status --porcelain` shows only
untracked `scratchpad/` files. The restored build was rebuilt and the harness ran green
three times (§4), so no red above is attributable to accumulated state.

---

## 7. NON-DISCRIMINATING ROWS, DISCLOSED — and the catcher for each

**One clause cannot fail today.**

* **"and is ENABLED" in rows `3a` and `4a`.** Read the panel: neither the curve
  `FactorField`'s `Select` nor the vsplit `Select` is ever passed a `disabled` prop —
  `disabled` appears in `EffectsScenePanel.tsx` only on the Add/Remove-layer buttons, the
  New chip, and individual engine-refused `<option>`s. So `el.disabled === false` is a
  fact about the component's **source**, not about this run. **It is kept** because it is
  row 61's literal wording and because a future parcel that disables these controls would
  then be caught — but it asserts nothing today.
  **THE CATCHERS are `3c` / `4c` / `4e` / `5a` / `5c` (the document moved to the asked
  value) and `7a` (every selector found its element).** Those are the rows the plants were
  run against, and plants A/B/C reddened them while `3a`/`4a` stayed green.
* **The "exists" half of `3a`/`4a` IS discriminating** — plant D (`rot-curve-selector`)
  reddened `3a`, so the row can fail.
* **`4c` deliberately does not carry point 4** and says so in its own text (§3.2). It is
  not non-discriminating — it caught plant C — but it must not be read as evidence that an
  *authored* value landed. `4e` is that row.

**Rows checked for "can this only ever return green?" and cleared.** Fourteen rows were
observed **red** under at least one of the five plants and are therefore demonstrably
falsifiable: `3a 3c 4c 4d 4e 4f 5a 5b 5c 5d 6b 6c 7a 8a`. The rows **not** observed red
are `0a`, `1a`–`1e`, `2a`, `2b`, `2c`, `3b`, `4a`, `4b`, `6a`, `6d`, `6e`, `6f` — every
one a precondition, a provenance line, or a guard on a rule, and each is falsifiable in
principle:

* `3b` reddens if the picker's option list loses either sentinel, or if the middle-index
  rule lands on the layer's own `fb`. It is the row that keeps rule C safe rather than
  lucky, so it can only be exercised by a *schema* change, not by an app plant.
* `4a` reddens if the vsplit control stops rendering (plant C unwired it but left it on
  screen, which is why it stayed green there — and is exactly §7's disclosure).
* `4b` ("the row spinner is absent before the toggle") is load-bearing in the other
  direction — it is what makes `4c`/`4e` a two-stage proof rather than one — and would go
  red the moment the spinner were rendered unconditionally.
* `2c`/`6f` redden if a fresh scene ever seeds a deform key, which would invalidate the
  legality premise the whole parcel rests on.

---

## 8. ALTERNATIVE GREEN PATHS, RULED OUT

The operational question — *if this row went green for a reason OTHER than the rule
holding, what would that reason be?* — asked of each load-bearing row, and what was
checked.

| row | the other reason it could be green | what rules it out |
|---|---|---|
| `3c` curve in the doc | **something else writes `curve`** — a seeder, a replayed command | the row asserts **the other two layers still carry no `curve` at all** (`other layers' curve = [{…},null,null]`). A blanket seeder would light them up. Confirmed the other way by plant A, where all three read `null`. |
| `3c` | **the key was already there** before the gesture | `curveDefaultBefore` is read immediately before the gesture and asserted `undefined`, and printed in the detail (`before=undefined`). |
| `3c` | **the value is a default that looks right** | row `3b` proved the pick is neither sentinel and differs from `fb`; `3c` compares against the exact computed string, not "is a legal factor". |
| `4e` vsplit value | **the row re-reads the key the TOGGLE filled** | the value must have moved **from the recorded seed to the asked number** (`seed=32 -> now={"at":170}`). A stale read shows the seed. Plant B reddened it exactly that way. |
| `4e` | **the spinner writes a different field and this row reads a coincidence** | the row also asserts **the layer top is unchanged**; plant B moved the top to 170 and the row went red naming it. |
| `4e`/`5c` | **a clamp produced the number** | both numbers are strictly interior to the advertised bounds (`4f`), so no clamp at either end can reach them, and neither is the `15` sentinel. |
| `6b`/`6c` file rows | **the writer emits schema defaults onto every layer** | both rows assert the **negative** — the layers the gestures did *not* name carry no key — and check the raw text as well as the parse. |
| `7a` ledger | **a gesture was skipped rather than missed** (leaves no `'no-element'`) | the row asserts the **count** as well as the verdicts: `8 gestures issued (rules prescribe 8)`. |
| `8a` advisory | **the matcher also matches a different rule's advisory** | the matcher is `/curve and deform/i`, and the quoted hit is the layer-level `layerCurveDeformAdvisory` sentence naming *this strip*; the scene-level `curveAnchorDeformAdvisory` cannot fire here because `2c`/`6f` proved the scene carries no anchor deform at all. |
| `8a` | **two code paths hold it green** | there is one producer of that sentence (`layerCurveDeformAdvisory`); plant A removed its *input* (no curve on the strip) and the row went red with `advisories on screen: []`. |
| all rows | **the panel never mounted, so absences are trivially true** | `2a` (the scene reached the model, listed beside the project's two pre-existing scenes), `2b` (layer cards rendered), `3a`/`4a` (real option lists), `4d` (the spinner appeared) are the anti-vacuous floor. |

---

## 9. WHAT THIS PARCEL DID NOT DO

* **It did not mint a second writer-originated fixture.** That is the ruling, not an
  omission. §0 and the ROADMAP row state it.
* **It did not build aeon or sigil, and ran no `cargo` command.** Nothing here needs a
  ROM: the claim is about the UI, and the last link it needs is *the bytes the app wrote*.
  Whether those bytes then assemble is `canopy_dusk`'s job and row 58's.
* **It did not start an emulator.**
* **It did not touch `../aeon` or `../sigil`** — §2.1's md5 pair is the evidence.
* **Still uncovered, and still not this row's business** (carried forward from row 61's
  own note): `v_column_floor` (deform form index 4) and the `.bin` form (index 5).

---

## 10. THE ONE THING TO RELAY

**A control being on screen, enabled, and answering a selector is not evidence that it is
reachable.** Plants A and B are the proof: under both, the control rendered, the option
list was full, every selector found its element, and `7a` — the blanket
anti-rot ledger this harness family built specifically to catch silent misses — **stayed
green**. Only the rows that read the *document* back and compared it against a value **the
app's own defaults cannot produce** went red. Any future reachability row that stops at
"the control is there" is asserting nothing, in exactly the way row 57's
`openBgTileDocument` was covered by tests and callable by nobody.
