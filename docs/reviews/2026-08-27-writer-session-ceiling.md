# Row 60 — the writer session re-run at the ceiling, and widened to the deform controls

Branch `feat/writer-session-ceiling`, off master `71f8925`. Commits `a451a9d`
(ceiling) and `6bab090` (deform), plus this packet.

Baseline on entry: **5070 passed / 7 skipped / 0 failed**, 387 files, tsc exit 0.
Final: **5070 passed / 7 skipped / 0 failed**, 387 files, tsc exit 0. No net
change: the rows this parcel added went into an existing `it` block.

Harness: **29/29 → 32/32** (commit A) **→ 37/37** (commit B).

---

## 1. The method problem this parcel had to solve first

Every previous re-origination of `writer_session_ojz.json` was corroborated the
same way: **the delta was exactly one line**, and that single line was the only
thing distinguishing *"the session was re-run faithfully"* from *"the session was
driven differently"*. Row 59's provenance says so twice.

A ceiling-driven re-run moves **43 lines**. Widening to the deform controls moves
another 61. Done together that is a 104-line delta with nothing to check it
against — a re-derived file a reviewer could only accept on trust, which is the
exact failure the fixture exists to prevent.

So the corroboration was **replaced, not waived**, three ways, and they are
ordered by how much weight each carries:

1. **THE DELTA WAS PREDICTED BEFORE THE HARNESS RAN.** R4/R5/R6 (and later
   R12–R16) were evaluated by hand into a complete expected file and committed:
   `scratchpad/predict-commitA.py` → `PREDICTED-commitA.json`, and
   `scratchpad/predict-commitB.py` → `PREDICTED-commitB.json`. **Both matched the
   emitted bytes exactly, with no diff at all.** A differently-driven session
   cannot land on a file written down before it ran. *This is what carries the
   faithfulness claim.*
2. **THE FIRST EIGHT LAYERS ARE A CONTINUITY ANCHOR.** They came back
   byte-identical to the 8-layer file; the only character that moved in that
   region is the `}` → `},` a ninth layer forces.
3. **DETERMINISM, and it is listed last and separately on purpose.** Four
   consecutive runs of the final state emitted **identical bytes**. ⚠ **That
   proves the session is DETERMINISTIC. It does NOT prove it was driven
   correctly** — a harness driving the wrong gesture drives it identically every
   time, which is precisely how the five rots below survived. Determinism is not
   allowed to stand in for faithfulness anywhere in this packet.

### The predicted delta, written first, beside the actual one

**Commit A, predicted (verbatim from the run, before the harness started):**
eight new layer blocks at `world_y = i*32` for i = 8..15, with
`fa` = factor option index *i* → `FACTOR_3_4, FACTOR_3_8, FACTOR_3_16,
FACTOR_5_8, FACTOR_5_16, FACTOR_7_8, FACTOR_7_16, FACTOR_15_16` and
`fb` = option index `len-1-i` (len = 17, the 16 names plus the packed sentinel) →
`FACTOR_3_4, FACTOR_1_32, FACTOR_1_16, FACTOR_1_8, FACTOR_1_4, FACTOR_1_2,
FACTOR_1, FACTOR_0`; plus `v_center` 8 → 16, `v_offset` −8 → −16, and
**`v_factor` 8 → 0**.

**Actual:** `diff -u PREDICTED-commitA.json emitted-A1.json` → *empty*.

⚠ **My predicted `v_factor` differs from the one in my brief**, which said "and
`v_factor`/`v_center` = 16". That is §2 below: the naive `= N` rule is
unsatisfiable at this ceiling, and I predicted the amended value in advance
rather than absorbing a surprise after the fact.

**Commit B, predicted:** `deform_fg` = `{shared:{table:sine(amplitude 16, period
16), speed 16}}`; `deform_bg` = the same with `triangle`; `v_deform` =
`{columns:{table:{generator:"zero"}, speed 16, amp_shift 15}}`;
`left_column_mask` = `"accept"`; `layers[15].deform` =
`{own:{table:v_column_perspective(focal 16, max_offset 16), shift_a 0, shift_b 0,
phase 16, speed 16}}`.

**Actual:** `diff -u PREDICTED-commitB.json emitted-B1.json` → *empty*.

The A→B delta contains **zero removed lines of substance** — every line is an
addition, and every added key is `deform_bg`, `deform_fg`, `left_column_mask`,
`v_deform`, a layer's `deform`, or a field inside one of them.

---

## 2. R7's rule was UNSATISFIABLE at the new ceiling — a finding, not an absorption

`v_factor` is a 0..15 shift count. R7 read *"= N, the layer count"*, with an
explicit rider: deliberately **not** the field's own `max`, because `max` is also
the new-scene default (`newEffectsScene` seeds `EFFECTS_V_FACTOR_LOCK`) and a
fixture carrying it would prove the control moved nothing.

Row 56 raised the layer ceiling to 16 while this control's range stayed 0..15. So
at N=16 the plain rule **overflows** and the app's clamp folds it onto exactly the
value the rider forbids. **Measured, not reasoned** — the un-amended rule was run
as red-first plant 2 and the document came back `v_factor: 15`.

R7 now reads **`min + (N % (max − min + 1))`**: N wrapped into the control's own
advertised range by the same `%` R5 already applies when an index runs past the
end of a list (`factorOpts[i % factorOpts.length]`). At N=16 on a 0..15 control
that is **0**. Harness row **6h** pins the result away from the control's `max`,
so the collision cannot return in silence.

**Two alternatives considered and rejected**, said out loud because this is the
one place I amended a rule rather than following it:

* *Leave `v_factor` at the app's default.* Legal, and the provenance's own first
  bullet admits untouched defaults as an origin — but it withdraws a gesture and
  the fixture stops demonstrating that this control moves anything.
* *`max − N` clamped* (R6's complement). Also lands on 0 here, but the `%` is a
  rule the fixture already uses for an over-long index, and the complement is
  already spoken for by R6/R14's shift exception.

### A pre-existing property, unchanged in kind, stated so nobody reads it as new

The scene the session authors has always tripped `planeLineOf`'s advisory: layer
0's top is 0 and `v_center` is N > 0, so `worldY < v_center` fires *regardless of
`v_factor`*. The committed 8-layer file tripped it too (`v_factor` 8, `v_center`
8). It is structural given R8 (`v_center = N`), not something the ceiling change
introduced, and it is out of this parcel's scope — the fixture is a shape
artifact from an enumeration, not a playable scene. The refusal this parcel *was*
told to check — the `v_deform`/`left_column_mask` mutual gate — is checked, in §5.

---

## 3. A FIFTH rot, of row 59's exact family

R4's selector `/^Layer i world_y/` **matched nothing and had been driving
nothing.** The layer card's top spinner is titled with the app's OWN label for
the scene's vertical space (`layerTopBounds().label`) — `world_y` unlocked,
**`Screen line`** locked — and a new scene starts locked. Row 5d prints what the
app actually renders:

```
Layer 0 Screen line (0..511) — a plane line; the scene is locked
```

**It stayed invisible for the worst possible reason**: `addLayerCommand` pushes
`clampWorldY(last.world_y + 32)`, so the app's own default for a stack of added
layers **is** `i * 32` — exactly what R4 prescribes. So:

* **Row 5b ("every layer took its enumerated world_y") is NON-DISCRIMINATING and
  always was.** It is retained because it still catches a *wrong* value; it
  cannot catch a *missing* gesture.
* **The fix moves zero bytes.** Proven, not assumed: the planted re-rot emitted
  bytes byte-identical to the clean run.

The catcher is the new blanket row **8a**, which watches the GESTURE rather than
the value: every `SET_INPUT` goes through a `drive()` ledger and 8a asserts none
returned `'no-element'` **and** that the session issued exactly the number of
gestures the rule prescribes (a count derived from N and the forms the index rule
landed on, not pinned — so a skipped gesture, which leaves no `'no-element'`
behind, shows up as a shortfall).

---

## 4. Red-first plants — every one, with its quoted failure

| # | plant | catcher | quoted failure | result |
|---|---|---|---|---|
| 1 | restore R4's rotted `/^Layer i world_y/` selector | harness **8a** | `55 gestures issued (rule prescribes 55), 16 missed: [{"label":"R4 layer 0 top","r":"no-element"}, …]` | **31/32** |
| 2 | R7's un-amended `= N` rule | harness **6h** (and 6b) | `v_factor=15, control range [0,15], N=16, rule min + (N % range) = 0` | **30/32** |
| 3 | vendored schema `layers.maxItems` 16 → 15 (a ceiling move with no re-run) | `effects-scene-writer-originated` count row | `AssertionError: expected 16 to be 15` | 3 failed / 2 passed |
| 4 | R14 `period` → the control's `max` (= the toggle's seed) | harness **8b** | `…{"generator":"sine","amplitude":16,"period":256}…` with `seedEscape` false | **36/37** |
| 5 | R15 picks the FIRST option (`undeclared`) instead of the last | harness **8c**, **8d**, **8f** | `8d: {"v_deform":true}` — `left_column_mask` absent, i.e. `scene_dsl.emp:1288` refused | **34/37** |
| 6 | delete `v_deform` from the fixture **and update the provenance hash to match** — the realistic failure, where the blob guard is green | suite preamble row | `AssertionError: the session authored v_deform: expected { …(11) } to have property "v_deform"` | 1 failed / 4 passed |

All six restored. `git diff --stat` clean on every restored file; the fixture
re-hashed to `4022f564` after plant 6 and the vendored schema showed no diff after
plant 3. Control run after all restores: **37/37**, bytes identical to the
committed fixture.

Plant 1 is worth an extra line: the planted run's **emitted bytes were identical
to the clean run's**, which is simultaneously the proof that the rot was invisible
and the proof that fixing it changed nothing in the file.

---

## 5. Alternative green-paths named and ruled out

The operational question — *if this row went green for a reason OTHER than the
rule holding, what would that reason be?*

| row | the alternative green path | how it was ruled out |
|---|---|---|
| **8a** (no selector returned `no-element`) | the ledger is **empty** — no gestures were issued at all, so "none missed" is trivially true | the row also asserts `driven.length === expectedDrives`, a count derived independently from N and the chosen forms (55 in commit A, 78 in B). An empty ledger fails it. Rows 4a/3c fail first anyway if the panel never mounted. |
| **8a** | a gesture **threw** instead of returning `'no-element'`, so it never reaches the ledger | `drive()` awaits `evalExpr`, which throws on a CDP exception and aborts the whole run — there is no silent path past it. |
| **8a** | the gesture **landed but on the app's default**, so it is 'ok' and asserts nothing | **8a cannot catch this, and does not claim to.** Proven by plant 4: 8a stayed green at 78/78 while the value was the seed. The catcher is 8b. Disclosed in §6. |
| **8b** (the deform values) | every toggle SEEDS a legal attachment, so "holds a legal sceneDeform" is true whether or not the parameter gestures landed | the row asserts the R13/R14 values *and*, separately, `seedEscape` — that `amplitude !== 1`, `period !== 256`, `speed !== 0`, `amp_shift !== 0`, i.e. **not** what `sceneDeformFromToggle` would have left. Plant 4 fired on exactly that half. |
| **8c** (the policy option is pickable) | the option list is **empty or has no disabled member**, so "not disabled" is vacuous | the row asserts `maskOpts.some(o => o.disabled)` — the engine-refused `sprite_mask` really is rendered, disabled, beside the picked one. Observed: `[{undeclared,false},{sprite_mask,true},{factor0_lock,false},{accept,false}]`. |
| **8d** (the mutual gate) | both keys **absent**, so `('v_deform' in S) === ('left_column_mask' in S)` is trivially true | the row also asserts `S.v_deform?.columns !== undefined` and that the policy is neither `undeclared` nor `sprite_mask`. Both-absent fails the first. |
| **8e** (the layer attachment is a rule) | the attachment is on **every** layer, so "the last one has it" is true | the row asserts `S.layers[L-1].deform === undefined` beside it, and the suite asserts `layers.filter(l => 'deform' in l).length === 1`. |
| **6h** (`v_factor` is not the control's max) | `v_factor` is **absent or non-numeric**, so `!== max` is true of garbage | the row asserts it is an integer inside `[min,max]` first. |
| suite count row | the constant is **undefined**, so `toBe(undefined)` matches a broken read | `EFFECTS_LAYER_COUNT` is derived with a throw at module load if `minItems`/`maxItems` are not numbers, and plant 3 shows the row moves with the constant. |
| suite "the session authored `deform_fg`…" | the **blob-hash row** would catch any fixture edit anyway, so the new row is redundant | plant 6: the hash row was updated with the file and stayed **green**, the schema row stayed green (`v_deform` is optional), the round-trip row stayed green. Only the new row spoke. |

---

## 6. Rows disclosed as NON-DISCRIMINATING

Stated because it costs something.

* **Harness 5b ("every layer took its enumerated world_y") is non-discriminating
  and always was**, for the reason in §3: the app's own add-layer default equals
  R4's rule exactly. Under plant 1 it stayed green while every one of its
  gestures returned `'no-element'`. **The catcher is 8a.** 5b is kept because it
  still catches a *wrong* value.
* **Harness 5d stayed GREEN under plant 1** too. It counts top spinners; it says
  nothing about a gesture reaching one. It is a REPORT — it prints the title the
  app rendered, which is the moving part that rotted — and its pass/fail is only
  "there is one per layer". **The catcher is 8a.**
* **Harness 8a stayed GREEN under plants 4 and 5.** Both gestures landed; they
  landed on the wrong value. **The catchers are 8b and 8c/8d.**
* **Harness 7e stayed GREEN under plant 2** (`v_factor=15 range=[0,15]`). It only
  checks the emitted value is an integer in range, which the default satisfies.
  **The catcher is 6h**, and it exists because 7e cannot do this job.
* **Harness 8f stayed GREEN under plant 4** — 256 divides 256, so a `period` at
  the seed satisfies the divisibility rule perfectly. 8f guards the *build's*
  rule, not the *gesture*. **The catcher is 8b.**
* **Harness 8b stayed GREEN under plant 5** — the deform values were fine; the
  policy was not. Correct division of labour.

---

## 7. The mutual gate, driven as the pair the app treats it as

aeon refuses per-column V deform with no policy (`scene_dsl.emp:1288`) **and** a
declared policy with no V deform (`:1293`); Aurora's `vDeformToggleCommand`
clears both keys in one undo step for exactly that reason. So R12's `v_deform`
toggle and R15's policy are one gesture pair, and the emitted file was checked
against both arms rather than assumed safe:

```
[8d] {"v_deform":true,"left_column_mask":"accept"}
```

`sprite_mask` is rendered **DISABLED** (the engine refuses it in every scene
today) and was never driven. R15's "last option" rule does not reach it —
`accept` is last — and row 8c checks the picked option's own `disabled` flag so
the rule is *safe by construction* rather than *lucky*. Plant 5 shows what an
open gate looks like: `left_column_mask` absent, three rows red.

---

## 8. The two commits, by their own numbers

| | before row 60 | after commit A | after commit B |
|---|---|---|---|
| blob | `893cd05586c4524fa919adc6bbbb111e710d1a7e` | `5ca0552bfc38a8bc2d359ad638b4dd0f089369da` | `4022f5647a147ebd72f6b6d23bbc8c527614c06d` |
| sha256 | `c28b6db065d2cf88a1…` | `bf395ce60117a37196…` | `073283c6c5016cb06a…` |
| size | 933 | 1,626 | 2,411 |
| layers | 8 | 16 | 16 |
| harness | 29/29 | 32/32 | 37/37 |

---

## 9. Environment and run stability

This harness aims at titled DOM elements and `<select>` option indices, never at
client pixel coordinates, so the fractional-rect hazard does not arise — there is
no geometric aim to be off by one. What varies here is machine load, so the run
count and the environment are printed beside every number. **Every row of every
claim above comes from ONE run; no two rows are stitched from different runs.**

| run | port | uptime | load avg | result | emitted sha256 |
|---|---|---|---|---|---|
| A1 (commit A) | 9451 | 1d 22:19 | 0.90 | **32/32** | `bf395ce60117a37196…` |
| plant 1 | 9452 | 1d 22:20 | 1.59 | **31/32** (8a red) | identical to A1 |
| plant 2 | 9453 | 1d 22:21 | 1.42 | **30/32** (6b, 6h red) | — |
| A2 control | 9454 | 1d 22:22 | 2.46 | **32/32** | `bf395ce60117a37196…` |
| B1 (commit B) | 9461 | 1d 22:29 | 1.91 | **37/37** | `073283c6c5016cb06a…` |
| plant 4 | 9462 | 1d 22:30 | 2.07 | **36/37** (8b red) | — |
| plant 5 | 9463 | 1d 22:31 | 2.28 | **34/37** (8c, 8d, 8f red) | — |
| B2 | 9472 | 1d 22:32 | 2.29 | **37/37** | `073283c6c5016cb06a…` |
| B3 | 9473 | 1d 22:33 | 2.22 | **37/37** | `073283c6c5016cb06a…` |
| B4 | 9474 | 1d 22:34 | 9.96 | **37/37** | `073283c6c5016cb06a…` |

Four clean runs of the final state, byte-identical, across a load range of
1.9–10.0. **Again: that is determinism, not faithfulness.**

## 10. aeon's own tree was never opened and never written

The session ran against a writable copy (`project.json` + `games/` + `art/`) in
the session scratchpad. `md5sum` over aeon's live
`games/sonic4/data/editor/effects/*.json`, before the parcel and after all ten
runs:

```
dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json
bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json
```

**Identical, and `diff` of the two captures is empty.** mtimes unmoved
(`1787770470`, `1787709676`), and no `writer_session_ojz.json` exists there. The
harness refuses to start without `AEON_DIR`, which is what makes this an
invariant rather than a habit.

---

## 11. What is left open

* ⚠ **NOT SEEN ON HARDWARE.** No emulator was touched (standing ban). This parcel
  changes no engine behaviour and ships no ROM-visible artifact — it re-derives a
  test fixture — so there is no ROM-level claim outstanding. Flagged for
  completeness. **TAGGED for foreground follow-up if anyone wants the authored
  scene actually built by aeon**: nothing here proves sigil accepts this file, only
  that Aurora's own transcription of aeon's five comptime guards is satisfied.
* **`curve` and `vsplit` are authorable and still not authored**, and this is now
  a *conflict*, not an omission: `curve` is refused on a strip that carries a
  `deform` and `vsplit` is refused on a scene carrying a `v_deform` — *"both write
  the same VSRAM word"*. R16 and R12 put both of those in this file. Covering them
  needs a **second writer-originated fixture** from a session that does not carry
  the deform pair, not a wider sequence on this one. Booked in the provenance's
  "What the session could NOT author".
* **Two of the six `tableRef` forms are still uncovered**: `v_column_floor`
  (index 4 — the index rule reaches 0–3 because there are four attachments) and
  `.bin` (index 5 — the only form needing a typed path, i.e. a writer's choice).
  The `.bin` exclusion is by arithmetic and is deliberate; `v_column_floor` would
  arrive free with a fifth attachment.
* **The `CollapsibleSection` propagation bug is still unfixed** — clicking **Add
  layer** in the Layers header also toggles the section, because `IconButton`
  does not stop propagation inside `<div onClick={toggle}>`. The harness routes
  around it with a real click on the header. Recorded in the provenance since
  2026-08-22; still out of scope, and now fifteen clicks rather than seven.
* **`planeLineOf`'s advisory fires on this fixture** and always has, structurally,
  because R8 sets `v_center = N > 0` while layer 0's top is 0. §2 has the
  arithmetic. Unchanged in kind by this parcel; worth someone's decision if the
  fixture is ever wanted as a *buildable* scene rather than a shape artifact.
