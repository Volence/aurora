# The three guard-surface gaps, closed — and the pin that moved underneath them

**Date** 2026-08-27 · **Branch** `fix/guard-surface-gaps` · **Parcel type** repair, on measured findings.

Yesterday's verification parcel (`docs/reviews/2026-08-27-guard-transcription.md`) found
Aurora's transcription of aeon's five deform guards **sound** and its *surface* incomplete
in three ways, and booked them as ROADMAP rows 62, 63 and 64. This packet closes all
three. Row 64 arrived booked at status **READ, not measured**; it is now measured, and it
is a **second confirmed permissive gap**.

**The framing yesterday established and this parcel keeps: four of the five guards are
ADVISORY, not preventions.** A warned scene still saves — row 58's deliberate posture,
pinned by a test. Nothing here turns an advisory into a prevention. Row 63 narrows a
*picker*, which is a different thing, and §4.3 argues why on the codebase's own test.

---

## 0. ⛔ STOP CONDITION TRIPPED — the shared sigil binary moved, twice, DURING this parcel

The brief pinned the assembler banner at **`revision: fbf60abd`** and said to stop and
report if it read anything else. It read something else on the very first build, and then
something else again six minutes later:

| time | banner, quoted verbatim |
|---|---|
| 07:19 (canonical baseline) | `Assembler: sigil 52882e2e5ead (clean at capture — no uncommitted changes)` |
| 07:25 onward (every other build) | `Assembler: sigil 537869e6382e (clean-sources at capture — 1 uncommitted change(s), none of them in the sources this binary is compiled from)` |
| the pin | `fbf60abd` |

**Neither is the pin.** What happened, established rather than guessed:

- `fbf60abd` → `52882e2e` → `537869e6` are all on sigil's own history, in that order
  (`git merge-base --is-ancestor fbf60abd 52882e2e` → yes). The sigil lane rebuilt the
  shared binary overnight and again this morning; `537869e6` is sigil's current `HEAD`.
- **A `cargo test --release --workspace --no-fail-fast` was running inside
  `/home/volence/sonic_hacks/sigil` while my first build ran** (pid 853201, observed
  live), and it relinked both binaries mid-build — `sigil` mtime `07:20:23`, my canonical
  build spanned `07:19:37`–`07:20:58`. **Not mine.** No `cargo` command was issued from
  this parcel; `./build.sh` only *executes* the two binaries.
- aeon's own build printed the mismatch itself and is louder about it than the pin was:
  > `## WARNING: THE ASSEMBLER MAY NOT MATCH ITS SOURCE (revision)`
  > `##   binary built from : 52882e2e5eade4c99ce783ab1a16d2ad6dae91be`
  > `##   /home/volence/sonic_hacks/sigil HEAD : 866ab37af2e7eea3fc010cc31860e5dff7fede01`

### 0.1 What I did about it, and why the evidence below still stands

**Reported as the headline rather than absorbed** — that is the stop condition honoured.
The builds were then run anyway, loudly labelled, because refusing to measure would have
returned row 64 to the queue at exactly the status it was booked at. Three things carry
the evidence across the moved pin, and each is checkable:

1. **A binary-stability guard around every case.** `md5sum` of `SIGIL_BUILD` is taken
   immediately before and after each build and required equal. Every case reports
   `BINARY STABLE across this build` (`5f325dca996be45f2c9a20c650d38c4b`, all nine
   cases). The mid-build swap that hit the 07:19 baseline could not have hit any of them
   undetected.
2. **The baseline CRC is byte-identical to yesterday's**, under both moved revisions:
   `crc=e9e07375 len=718999`, the same number yesterday's parcel recorded under
   `fbf60abd`. A sigil advance that changed what these scenes lower to would not land on
   the same ROM.
3. **Every refusal is attributed by its own text**, not by rc alone, and each names the
   guard under test with this scene's interpolated values. The rules are aeon comptime
   `ensure`s; a sigil bump does not author them.

⚠ **What is NOT claimed:** that these builds were run under the pinned revision. They
were not. Anyone re-running against `fbf60abd` should expect the same outcomes and is
entitled to check.

**Relay to the suite:** the shared `sigil/target/release` binaries are being rebuilt under
active lane work while other lanes pin them. A pin that names a revision cannot survive
that; a pin that names an **md5** could. Booked as an observation, not a change.

### 0.2 The environment defect from yesterday, cleared the same way

`tools/emp_helper_closure.py` locates sigil as a **sibling of the aeon root**. The
throwaway clone was placed at `…/scratchpad/aeonwork/aeon` with a **symlink**
`…/scratchpad/aeonwork/sigil -> /home/volence/sonic_hacks/sigil` beside it before the
first build, so the four tool-test failures yesterday's parcel lost its baseline to never
occurred here. sigil itself was not written.

---

## 1. Provenance — the required lines

| | |
|---|---|
| aeon under test | `git clone` of `/home/volence/sonic_hacks/aeon` at HEAD **`4caac35e`** into the scratchpad. **`../aeon` and `../sigil` were never written to.** |
| Banner, every build | `52882e2e5ead` (1 build) / `537869e6382e` (all others) — see §0 |
| Pins | `SIGIL_BUILD` / `SIGIL_EMIT` = `/home/volence/sonic_hacks/sigil/target/release/{sigil,emit_sound_blob}`, `AEON_SKDISASM_DIR=/home/volence/sonic_hacks/skdisasm` |
| `cargo` inside sigil | **never run by this parcel.** The two binaries were only *executed*. (One was running, from another lane — §0.) |

**aeon editor-effects tree, md5 BEFORE and AFTER — required line:**

```
BEFORE                                                        AFTER (identical)
dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json         dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json
bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json         bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json
```

`diff` of the two listings is **empty**. `git -C ../aeon status --porcelain` is unchanged
across the parcel (` M docs/lane-status.json`, `?? games/sonic4/data/sprites/object-bindings.json`
— both pre-existing, neither ours). `../sigil` shows one untracked `.landing-537869e6.log`,
the sigil lane's own.

### 1.1 Green baselines and the restore discipline

| build | rc | evidence | wall | uptime |
|---|---|---|---|---|
| canonical baseline | **0** | `emp_expect_fail: OK — 35/35` · `effects_gen: OK` · `crc=e9e07375 len=718999` | 81 s | `up 1 day, 23:08 → 23:10` |
| FAST baseline | **0** | `crc=e9e07375 len=718999` — **byte-identical to canonical** | 1.69 s | `up 1 day, 23:14` |
| FINAL canonical restore-green | **0** | `emp_expect_fail: OK — 35/35` · `effects_gen: OK` · `crc=e9e07375 len=718999` · copy tree clean | 68.7 s | `up 1 day, 23:23 → 23:24` |

Per-case builds used `FAST=1`, validated against the canonical build (byte-identical
ROM). **Every one of the six refusal/accept cases was followed by `git checkout --` the
fixture, `effects_gen.py emit`, and a rebuild — all six restore-greens rc=0 at
`crc=e9e07375 len=718999`**, so no refusal is attributable to accumulated state.

Method per case: fixture JSON → `games/sonic4/data/editor/effects/ojz_act1_start.json` in
the **copy** → `python3 tools/effects_gen.py emit` (regenerates the committed binding
module, so the drift gate cannot mask the guard) → `FAST=1 ./build.sh`.

---

## 2. ROW 62 — `sprite_mask`, the value that ARRIVES

**Commit `a845770`** · `src/renderer/providers/effects-aeon.ts`,
`src/renderer/providers/__tests__/effects-aeon.test.ts`

### 2.1 What was wrong

`sprite_mask` renders as a **disabled `<option>`** and row 58 reasoned that correctly —
no scene content can make it legal, so disabling it cannot produce *the editor refused
what the build accepts*. What row 58 did not ask is what happens when the value **is
already in the document**: a hand-edited file, a scene copied from another act, an MCP
`edit_effects_scene` write, a future tool. Disabling an option governs the **picker**. It
governs nothing about a value that arrived.

Measured on the identical document: `sceneDeformAdvisories` returned **`(none)`**.

### 2.2 The build cell, re-measured today

`r62` — `ojz_act1_start` + `v_deform` + `left_column_mask: sprite_mask` → **rc=1**, 4
`[Error]` lines, all the same diagnostic:

> `[Error] scene(): left_column_mask: SpriteMask is declared, but the engine's left-column strip emission has NOT landed — the declaration would be accepted while the sliver stays uncovered. It is blocked on an aeon+sigil pair (the strip emitter needs engine/objects/sprites.emp's FIRST Game.*/CAP_* reference, a sigil port-flip) and on the game-owned opaque mask tile; … Declare Factor0Lock or Accept, or land the emission parcel first @ Span { source: SourceId(23), start: 96332, end: 97158 }`

It names guard 3. Restore-green rc=0 `crc=e9e07375`.

### 2.3 The fix, and the counter-argument the roadmap row raised

One arm in `sceneDeformAdvisories`, where the other four guards already live and where
the panel already renders. **The disabled option stays** — the two cover different paths
and removing either re-opens the one it covers.

Row 62 asked which of "a permanent warning under a permanently-disabled option" or "the
label suffix alone" serves the author better, and warned the answer is not automatically
*more warning*. **The answer here is both, because they are not two spellings of one
signal:** the suffix `' (engine refuses)'` is attached to an option in a **closed
`<select>`** and reads as a property of a *choice*; the advisory is a sentence about
**this document**, on the same row as the other four refusals, and it carries the
remedy. An author who did not choose the value has no reason to read the picker's option
titles at all.

The arm is **unconditional**, unlike every other arm on this surface, because
`scene_dsl.emp:1354` is: it fires on the declaration alone. A scene carrying
`sprite_mask` with no `v_deform` therefore reads **two** advisories — this one and guard
2's. Both are true; one edit clears both; suppressing either would be Aurora deciding
which of two real refusals the author is allowed to see. Pinned (`.length` is `2`).

**Known expiry, as the row noted:** aeon's refusal names the parcel that will delete that
`ensure`. When it lands, this arm and the disabled option go together.

### 2.4 Verification

- **Node**, 3 assertions groups: the arm fires on the carried value, names both real
  answers, does not fire for `accept` or `factor0_lock` on the identical scene, and the
  document still serializes **carrying `sprite_mask`**.
- **Red-first, 2 plants:**
  - arm disabled → 3 rows red, quoted: `AssertionError: expected '' to match /sprite_mask/`
  - arm widened to `mask !== EFFECTS_LEFT_COLUMN_MASK_UNDECLARED` → 3 **different** rows
    red, quoted: `AssertionError: accept: expected 'this scene declares left_column_mask …' not to match /refuses in every scene/`
- **CDP** (§5): rows 2b, 2c, 2d, 2e.

---

## 3. ROW 64 — MEASURED, and it is a second confirmed permissive gap

**Commit `d58fb6d`** · `src/core/formats/effects/scene-ui.ts`,
`src/renderer/providers/effects-aeon.ts`, tests

### 3.1 The 2×2 cell, filled in

The guard is `scene_dsl.emp:1251`, `ensure(any_curve == 0 || anchor_amp == 0, …)`.
Three fixtures, each one or two authored fields off the game's own `ojz_act1_start`:

| fixture | curve | anchor | Aurora BEFORE | build | ROM |
|---|---|---|---|---|---|
| `r64_a2` | layer 3 | **dsa 3 / dsb 2** | **SILENT** (`sceneDeformAdvisories` → `[]`) | **rc=1**, 4 `[Error]`, one diagnostic | — |
| `r64_b` | layer 3 | dsa 15 / dsb 15 | silent (correct) | **rc=0** | `crc=4362a054 len=718999` |
| `r64_c` | none | dsa 3 / dsb 2 | silent (correct) | **rc=0** | `crc=55e6ebbc len=718999` |

> `[Error] scene(): this scene carries a curve layer AND an anchor with live deform shifts (anchor dsa 3 / dsb 2; 15 is the no-deform sentinel). The overlay writes those shifts into every band from the split DOWN, including bands whose layer authored no deform — so a curve layer below the split would be curve ∧ deform at runtime, which design §2 forbids and the fill's register allocation cannot serve. A PURE-BOUNDARY anchor (dsa 15, dsb 15) composes with curves and is design §2's own case @ Span { source: SourceId(23), start: 86570, end: 87164 }`

**→ The build refuses and Aurora was silent. Second confirmed permissive gap. Advisory added.**

### 3.2 ⚠ The sentinel values, and why they are live

**`dsa 3 / dsb 2`.** Neither is `15`, which in this space means **no deform** — the trap
the row named. A fixture reaching for "a large shift" by saturating lands on 15 and
authors the case the guard **permits** (design §2: *"an anchor split inside a curve layer
CONTINUES the curve"*), while believing it authored the refused one. `r64_b` is exactly
that case and it **builds green**, which is how I know the trap is real rather than
theoretical here.

Also worth recording: **`ojz_act1_start` already ships `anchor: {dsa: 15, dsb: 2}`** — one
live shift, one sentinel. So a check written as "both shifts are live" would miss the only
anchor in the tree. The engine ORs two `if`s into one flag; Aurora now does the same, and
a red-first plant pins it.

### 3.3 Alternative green-paths ruled out — *"if this row went red for a reason other than the rule holding, what would it be?"*

| candidate reason | ruled out by |
|---|---|
| the **curve** alone refuses | `r64_b` has the identical curve on the identical layer and builds **rc=0** |
| the **live anchor** alone refuses | `r64_c` has the identical anchor and builds **rc=0** |
| the fixture never reached the ROM (a no-op edit) | all three CRCs differ from the baseline `e9e07375` **and from each other** |
| a *different* rule's message matched | the error text is `:1251`'s, verbatim, interpolating **this scene's** `dsa 3 / dsb 2` |
| accumulated tree state | each case restored + rebuilt green at `e9e07375` |
| the binary changed mid-case | md5 pre/post equal, reported per case |

### 3.4 Why the transcription dropped it — the generalisable half

Guard 5's other three ensures are per-**layer** facts and `layerCurveDeformAdvisory`
carries them (`:580`, `:586`, plus `:1271`'s vsplit pair at scene level). This one has its
two halves **on different objects**: a curve on a layer, shifts on the scene's anchor. No
per-layer scan can see the pair, and the scene-level scan had no anchor arm — so the
function that *looked* like it covered "curve and deform" covered two thirds of it.
`layerCurveDeformAdvisory`'s docblock now says so, pointing at the scene-level twin.

### 3.5 One thing fixed on the way

`EFFECTS_ANCHOR_SHIFT_BOUNDS` is new. The anchor's sentinel is now read from the anchor's
**own** schema branch. It had been borrowed from `EFFECTS_LAYER_DEFORM_BOUNDS` — the two
are `15` today and live in different `$defs`, amendable apart, at which point the reader
silently tests the wrong sentinel and every anchor advisory inverts. A test pins the
derivation against the schema path.

⚠ **Booked, not fixed:** `factor0LockRefusal` still reads
`EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max` for the **anchor's** `dsb`. Same latent
coupling, one function over. Left alone to keep this commit revertible on its own.

### 3.6 Red-first, 3 plants, each with a distinct quoted failure

| plant | quoted failure |
|---|---|
| the arm removed | `AssertionError: expected '' to match /layer 0 authors a curve/` |
| `< 8` instead of `!== sentinel` (**the trap, planted deliberately**) | `AssertionError: expected '' to match /layer 0 authors a curve/` |
| `\|\|` instead of `&&` on the two shifts | `AssertionError: dsa 15 dsb 2: expected '' to match /authors a curve/` |

---

## 4. ROW 63 — the affordance that advertised 256 values where 9 are legal

**Commit `1b82251`** · `src/renderer/providers/effects-aeon.ts`,
`src/renderer/components/effects/EffectsScenePanel.tsx`, tests

### 4.1 The build cells, including one yesterday left UNVERIFIED

| fixture | build | evidence |
|---|---|---|
| `deform_sine`, period 100 | **rc=1** | exactly **one** `[Error]`: `deform_sine: period 100 must divide 256 @ Span { source: SourceId(21), start: 2979, end: 3052 }` |
| `deform_triangle`, period 100 | **rc=1** | exactly **one** `[Error]`: `deform_triangle: period 100 must divide 256 @ Span { source: SourceId(21), start: 4691, end: 4768 }` |
| `deform_sine`, period 64 (control) | **rc=0** | `crc=09a10261 len=719019` |

**`parallax_dsl.emp:87` was UNVERIFIED in yesterday's packet (§6 item 3) and is now
measured.** It refuses on its own and names its own generator, so the two ensures are
genuinely two and a fix covering only `sine` would have left `triangle` open — which is a
red-first plant below rather than a claim.

### 4.2 The shape chosen, and the trade-off

**A `<select>` over the computed divisors, plus the carried non-divisor rendered as a
disabled option, plus the existing advisory unchanged.**

Rejected: a bare `<select>` over the nine (a file carrying `period: 100` would render the
select showing `1` — the quiet lie `unassignableSceneRef` and `leftColumnMaskOptions` both
exist to stop, and here *worse than the spinner it replaced*, because the author would
read a legal period while the build read an illegal one).

Rejected: keeping the number input and adding an advisory — that is the status quo. The
advisory was already correct and already rendering; the roadmap row's whole point is that
the defect is the **control**, not the diagnosis.

**The bar the brief set — the constraint must hold for a TYPED value, not only a spun
one — is met structurally: a `<select>` has no typed value.** `min`/`max` on an
`<input type="number">` govern the spinner and `:invalid` and stop nothing; a
`clamp*()` beside them can only hold a value inside a *range*, and "divides" is not a
range. That is why no amount of clamping was ever going to close this.

**The list is computed** (`deformPeriodChoices`), bounded by the parameter's own declared
range, from `EFFECTS_DEFORM_TABLE_BYTES` — itself derived from the schema's prose and
cross-checked against `period`'s ceiling at module load. A hand-typed divisor list is a
red-first plant, caught by `divisor 256 missing`.

### 4.3 ⚠ The strictness question, answered rather than assumed — as the brief required

**Read the schema first: it is the LOOSER document.** `period` is
`{"type": "integer", "minimum": 1, "maximum": 256}` for both `sine` and `triangle`. So it
admits all 256 and the engine refuses the non-divisors later, which makes a picker over
nine values **stricter than the contract**. That is a **stated choice**, not an accident,
and it is taken on the codebase's own existing test — the one that licenses
`sprite_mask`'s disabled option and rules `factor0_lock`'s the other way:

- **No scene content can make a non-divisor legal.** Both `ensure`s are unconditional,
  and `sine`/`triangle` are the *only* forms declaring a `period`. So the picker's
  omission cannot cost an author something the build would have taken — the
  editor-refused-what-the-build-accepts failure has no instance here.
- Contrast `factor0_lock`, whose precondition is about the scene's own contents and whose
  Aurora evaluation is deliberately conservative. That one **stays selectable** and only
  advises, and this parcel did not touch it.
- **A value already in the file still renders**, disabled, in sorted position, and is
  still advised.

**This is not turning an advisory into a prevention.** `tableRefAdvisory` is unchanged and
still fires; the document with `period: 100` still saves; the codec still round-trips it;
sigil is still the rulebook. A test pins the save, and CDP row 3g pins that the picker
and the advisory are independent surfaces (reverting the picker leaves 3g green).

**No `.bin` leak:** the `.bin` branch declares no parameters, so `tableRefParams('bin')`
is `[]` and there is nothing for the derivation to reach. Pinned as an assertion.

### 4.4 The fixtures the row said to re-check

**Checked, none affected.** `test/fixtures/effects/writer_session_ojz.json` carries
`period: 16` (row 60's `max ÷ N` at N=16) and `canopy_dusk.json` carries `64` and `128` —
all three are divisors, so all three remain pickable and the goldens are untouched. The
full suite confirms: 5,074 passed.

⚠ **Row 60's harness rule R14 exception is now redundant but was NOT removed.** The
roadmap row anticipated deleting it. It lives in
`scratchpad/writer-originated-scene-harness.mjs`, whose golden landed **today**
(commit `6bab090`), and re-running that harness would move bytes this parcel has no
business moving. **Booked, not fixed** — and it is now a simplification rather than a
correctness item, since `max ÷ N` still lands on a divisor and still passes.

### 4.5 Red-first, 4 plants

| plant | quoted failure |
|---|---|
| `tableRefParamOptions` returns null (spinner restored) | node row red; in the app, **4 CDP rows** red |
| carried non-divisor dropped from the options | `AssertionError: expected [ 1, 2, 4, 8, 16, 32, 64, 128, 256 ] to include 100` |
| hand-typed divisor list `[1,2,…,128]` | `AssertionError: divisor 256 missing: expected [ … ] to include 256` |
| `sine` only, `triangle` left open | `AssertionError: triangle: expected null not to be null` |

---

## 5. The rendered surface — CDP, because the node suite cannot see a screen

`scratchpad/guard-surface-harness.mjs`. **5,074 vitest tests pass over all three of these
changes without any of them being able to see a rendered row** — which is not theoretical
here: row 58 shipped `advisoryLayerDeformConflicts` into this same file with **no caller
anywhere** and a green suite for an entire parcel.

**Every fixture arrives as a FILE, not as a gesture**, and that is load-bearing: the values
under test are ones the picker *will not let an author select* (`sprite_mask` is disabled;
a non-divisor `period` is no longer an option). A harness that authored them through the
controls would be exercising a path that cannot exist. Six scenes were written as `.json`
into the **throwaway aeon copy** and the app was pointed at that copy — the harness
refuses to run against `/home/volence/sonic_hacks/aeon` by an explicit guard.

**Final run on the committed tree: 22/22.** `dpr=1`, viewport `1400x872`,
load `3.59 3.22 3.04`, uptime `up 1 day, 23:34`. Nothing in the file derives an
expectation from a device pixel — every reading is `textContent` / `value` / `title` /
`disabled` off elements found by `title` — so the dpr variance this host shows does not
apply; the numbers are printed anyway.

### 5.1 The rows, and what each would catch

| row | claim |
|---|---|
| 1c, 1d | ANTI-VACUOUS: all six file-borne fixtures were read by the codec; none rejected |
| 2b, 2c | row 62's advisory renders, and names both values that ARE answers |
| 2d | the disabled option is **still there** — 4 options, `sprite_mask` disabled, label `sprite_mask (engine refuses)` |
| 2e | **control**: the identical scene with `accept` renders no such warning, panel still drawn |
| 4b, 4c | row 64's advisory renders, quoting `anchor dsa 3 / dsb 2` and `15 is the no-deform sentinel` |
| 4d | **sentinel control**: the same curve with a 15/15 anchor renders nothing |
| 3b | `period` is a `SELECT`, not an input |
| 3c | it offers exactly `[1,2,4,8,16,32,64,128,256]` — compared against divisors the harness computes from the schema off disk |
| 3e, 3f | a carried `100` is shown as the value, present as an option, and disabled |
| 3g | the advisory **still fires** on it |
| 5a, 5b | **POSTURE**: the warned scene is still editable (no control disabled) and the model still holds `sprite_mask` |

### 5.2 In-app plants — the harness is discriminating, not decorative

Each plant was compiled into the real app and the harness re-run:

| plant | result |
|---|---|
| row 62 arm disabled | **20/22** — 2b, 2c red |
| row 64 arm removed | **20/22** — 4b, 4c red |
| row 63 picker reverted to the spinner | **18/22** — 3b, 3c, 3e, 3f red · **3g stayed green** |
| row 63 carried non-divisor dropped | **20/22** — 3e, 3f red · **3g stayed green** |
| restored | **22/22** |

The two `3g stayed green` cells are the useful ones: they show the picker and the advisory
are **independent surfaces**, so neither row can pass on the other's account.

### 5.3 Non-discriminating rows, disclosed

- **1a, 1b, 2a, 3a, 4a** are anti-vacuous subject checks. They can only go red if the app
  fails to boot or the panel fails to mount, and they assert nothing about the three
  fixes. They exist so that the *absence* rows (2e, 4d) cannot pass on an empty panel —
  which is the catcher relationship: **2e and 4d are the discriminating negatives**, and
  `panelIsDrawn` is what stops them being vacuous.
- **3d** (`9 legal of 256`) is arithmetic over schema-derived numbers; it cannot fail
  while the schema says 256. It is there to make the *scale* of the row explicit in the
  log, not to catch a regression. **3c is the catcher** for the option list.
- **5a** would also be green if the panel had never rendered a control — except that
  it asserts `editable.length > 0` on named titles, which is what makes it non-vacuous.

### 5.4 What is NOT proven here, stated up front

- **No emulator, ever** (standing invariant). Nothing here needed one: this parcel tests
  what BUILDS and what RENDERS. **What any of these scenes looks like on hardware is
  UNVERIFIED and TAGGED for a foreground follow-up.**
- **Stability across runs is not claimed.** Six harness runs were made (one initial, four
  planted, one final on the committed tree) under load 2.4–4.4; the planted runs are
  *different code*, so they are not repeat measurements. Two passes would prove nothing
  about stability in a varying environment and none is asserted.
- The harness reads `textContent` of leaf elements longer than 40 characters as "warning
  rows". That is a structural proxy for `<Hint tone="warning">`, not a colour assertion —
  it would not catch a warning rendered in the wrong tone.

---

## 6. Totals

| | |
|---|---|
| Full vitest suite, final | **5,074 passed · 7 skipped · 387 files passed, 2 skipped** |
| `tsc --noEmit` | clean, at each of the three commit stages |
| aeon builds | 9 cases + 3 baselines = **12 invocations**; 4 rc=1 (each naming its guard), 8 rc=0 |
| restore-greens after a refusal | **6/6 rc=0** at `crc=e9e07375 len=718999` |
| CDP harness, committed tree | **22/22** |
| red-first plants, node | **9**, each with a quoted distinct failure |
| in-app plants, CDP | **4**, each taking exactly its own rows red |
| `../aeon` effects md5 | **unchanged** (§1) |
| eslint | **not run — this repo has no `eslint.config.*`**; lint is not part of its gate |

## 7. Booked rather than fixed

1. **The moved pin** (§0) — relayed. A revision pin cannot survive a shared binary being
   rebuilt by an active lane; an md5 pin could.
2. **`factor0LockRefusal` still borrows the layer bound for the anchor's sentinel**
   (§3.5). Latent, invisible while the two are both 15.
3. **Row 60's harness `max ÷ N` exception is now redundant** (§4.4). A simplification,
   not a correctness item; deleting it would move a golden that landed today.
4. **`sprite_mask`'s known expiry** (§2.3) — aeon's own message names the parcel that will
   delete the `ensure`. When it lands, the advisory and the disabled option retire together.

## 8. Reproduction

```
# clone aeon beside a `sigil` symlink (§0.2), then per case:
cp <fixture>.json  games/sonic4/data/editor/effects/ojz_act1_start.json
python3 tools/effects_gen.py emit
SIGIL_BUILD=… SIGIL_EMIT=… AEON_SKDISASM_DIR=… FAST=1 ./build.sh
git checkout -- games/sonic4/data/editor/effects/ojz_act1_start.json   # then rebuild green
```

Fixtures differ from `ojz_act1_start.json` by one or two authored fields:
`r62_sprite_mask_carried` (+`v_deform` +`sprite_mask`), `r63_period_100` /
`r63_triangle_period_100` / `r63_period_64` (+`deform_fg` at that period),
`r64_a2_curve_live_anchor` (layer 3 `curve`, anchor `dsa 3 / dsb 2`),
`r64_b_curve_boundary_anchor` (same curve, anchor `15/15`),
`r64_c_live_anchor_nocurve` (no curve, anchor `dsa 3 / dsb 2`).

Rendered surface: `VITE_AURORA_DEBUG=1 npx electron-vite build && node scratchpad/guard-surface-harness.mjs`.
