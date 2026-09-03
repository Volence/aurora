# EW-RAMP-SCROLL-MODE — the ramp card could not say whether it was the whole screen or a 16-pixel sliver

**Date** 2026-09-03 · **Branch** `feat/ew-ramp-scroll-mode` · **Base** master `09abdab3`
**Upstream parcel** `docs/reviews/2026-09-03-ew-ramp-control.md` (the panel this extends)
**Peer measured at** aeon `origin/master` `ddaab282`, through git objects

---

## 0. What is mine, what is relayed, and one thing the brief got wrong

| Claim | Source | Status |
|---|---|---|
| the scene's `v_deform` → `pcfg_v_deform_table_bg` → `$0B` bit 2 chain | aeon `scene_dsl.emp` and `parallax.emp` at `ddaab282` | **MEASURED HERE**, through git objects |
| `$0B` reads `$03` on scenes 0-9 and `$07` on scene 10 | the aeon lane, relayed | relayed — and now *corroborated* by the arithmetic above (`%11` always, `%100` conditionally) |
| the affected strip is at **x = 4-19**, not `0-15` | the aeon lane, relayed | **RELAYED. Not measurable from source, and not measured here.** |
| `CAP_PER_COL_VSRAM` is "inert for us" | the brief | ⚠ **PARTLY FALSE — corrected below** |
| `v_deform` is at `scene.ts:225` (`EffectsVDeform`) | the brief | confirmed |
| every sentence, every case split, every row below | built and measured here | mine |

**The correction is §3 and the fourth case is §4.** Those are the two things a
reader who only skims should take away.

---

## 1. The defect, and what shipped

A VSRAM `ramp` produces **one of two completely different effects** — a
full-width vertical scroll, or a scroll of a **single 16-pixel column** — and the
preset document is **identical either way**. VDP register `$0B` bit 2 selects it,
and nothing in `presets/<id>.json` touches that bit. So the ramp card could tell
an author exactly what five numbers they had written and nothing at all about the
largest fact in the feature.

One sentence now sits at the top of the ramp card's controls, derived from the
bindings:

```
  ┌─ the ramp card ────────────────────────────────────────────────────┐
  │ [the MUST NOT]                                                     │
  │ [the sign disclosure, when it applies]                             │
  │                                                                     │
  │ FULL-SCREEN: this ramp scrolls the FULL WIDTH of the plane.        │  ← new
  │ Section 0 binds this preset and its scene "…_flat" has no          │
  │ `v_deform`, so VSRAM stays whole-plane.                            │
  │                                                                     │
  │ Top    [  64 ]   …                                                  │
```

- **`src/core/formats/effects/ramp-scroll-mode.ts`** — the fact, its provenance,
  the five sentences and the contract-length hover. Pure; no renderer imports.
- **`renderer/providers/effects-preset.ts`** — `rampScrollBindings` resolves the
  join; `rampScrollModeAdvisory` is the panel's single call.
- **`components/effects/BandPresetPanel.tsx`** — one `Hint`, painted short with
  the contract text on the same element's `title`.

**Placement: above the controls, not below them.** This sentence changes what
every number under it *means* — the same `top`/`lines`/`start`/`step` are a
full-screen scroll or a 16-pixel sliver — so an author who met it only after
scrolling past five spinners would already have authored the numbers under a
guess. `rampDriftSummary` stays at the foot: that is arithmetic about *this*
document, this is a fact about *three*.

**Neutral tone, and nothing is gated.** Both arms are features; an author who
wants a sliver is not making a mistake. Two wording rows assert that nothing in
the card is `disabled` by, or `refuse`d because of, the mode.

---

## 2. The chain — measured here, not relayed

Read out of aeon's own source at `origin/master` `ddaab282` through git objects
(never the working tree — `test/support/peer-repo.ts`'s rule):

```
scene_dsl.emp:1285-1290   scene_vdeform_table(None) => 0
                          scene_vdeform_table(Columns(tbl, ..)) => tbl
scene_dsl.emp:2970        pcfg_v_deform_table_bg: scene_vdeform_table(s.sc_v_deform)
parallax.emp:1059-1070    moveq #%11, d0                        // bits 1:0, ALWAYS
                          if (Game.SCANLINE_CAPS & CAP_PER_COL_VSRAM) != 0 {
                              move.l  parallax_config.pcfg_v_deform_table_bg(a0), d1
                              beq     .v_done
                              ori.b   #%100, d0                 // bit 2
                          }
```

So the scene's `v_deform` — **and nothing else** — raises the bit, and the
relayed register readings fall out of it: `%11` is `$03`, `%11 | %100` is `$07`.
That upgrade matters: it means this panel's sentence rests on an artifact
property this repo can re-check, not on a message.

**`test/formats/aeon-vsram-mode-drift.test.ts` (5 rows)** holds all three links,
plus a reader exercised on three *broken* synthetic shapes — a missing `beq`, a
missing `ori`, and no capability block — so the "the gate is still there" row
cannot be green-forever.

⚠ **IT IS `v_deform`, NOT `deform_fg`/`deform_bg`.** Those are attachment
`"shared"`, a plane-wide *horizontal* wobble, and touch no VSRAM mode bit. A node
row plants a scene carrying both of them and requires the FULL arm.

⚠ **THE OFF STATE HAS TWO SPELLINGS.** `"none"` and an absent key are the same
thing, so the derivation goes through **`vDeformValue`** — the same function the
scene panel's own V-deform row reads — rather than a second `=== 'none'` here.

---

## 3. ⚠ THE CONJUNCT IS NOT INERT, AND THE BRIEF SAID IT WAS

The rule arrived with a conjunct — the game must declare `CAP_PER_COL_VSRAM` —
described as inert, "Aurora only authors for a game that declares it", with an
instruction to say so rather than drop it. **Measured at the same revision, it is
true of one game and false of the other:**

```
games/sonic4/config/game.emp:126   SCANLINE_CAPS = $07DE   → bit 1 SET
games/demo/config/game.emp:20      SCANLINE_CAPS = 0       → bit 1 CLEAR
engine/level/scene_dsl.emp:206     CAP_PER_COL_VSRAM = $0002
```

On `demo` the whole `if` block compiles to nothing, so a `v_deform` scene would
leave `$0B` at `$03` and the ramp would be **full-width regardless**. Aurora's
project model is aeon's `sonic4` data, so the conjunct holds for every act this
editor can open today — but it is a property of the GAME and it is one line from
changing.

**So it is PAINTED, in the arm it can change:** any sentence claiming a column
ends `Assumes this game declares CAP_PER_COL_VSRAM — sonic4 does.` The
full-screen arm does not carry it (the conjunct cannot make a full-width answer
wrong), and the hover carries both halves. The drift row asserts sonic4 declares
it **and that demo does not**, with a failure message saying that if both games
declare it the clause should be re-worded because it may finally be inert.

---

## 4. ⚠ THE FOURTH CASE — and it is the DEFAULT one in aeon's tree

The brief listed three cases. There is a fourth, and it is not exotic:

**A bound section whose scene Aurora cannot resolve.** `Section.sceneRef: null`
is the **act default** — resolved, per the brief — but `Act.sceneRef` can itself
be `null`, and below it sits the engine's hand-authored `act_parallax_config` in
`act_descriptor.emp`, **a file this editor does not read**.

**In aeon's own tree that is the state of every section.** Their `project.json`
has `sceneRef: null` on `ojz/act1` and there is no `data/editor/effects/`
directory at all — measured, not assumed. So today, binding a preset to a section
in the real project gives you exactly this case. Folding it into "full-screen"
would have been a confident sentence about a document nobody here has opened, on
the most common path there is.

It is reported as `unknown`, with the reason, and it has four more sub-reasons
that are told apart rather than merged: `section-dangling`, `section-unreadable`,
`act-dangling`, `act-unreadable` (a ref can name a deleted scene, a renamed one,
or one sitting in `unreadable` — the sidecar is hand-editable and aeon's
generator writes it too). The `unreadable` test is spelled exactly as
`unassignableSceneRef` spells it, so the two cannot disagree about which failure
it was.

---

## 5. The five sentences, quoted from a real run

Read off the running app by `npm run harness:ramp-scroll-mode`, on aeon's own
project, with the fixtures created through the panels.

**Case 1 — bound, and the scene has no `v_deform`:**

> **FULL-SCREEN:** this ramp scrolls the FULL WIDTH of the plane. Section 0 binds
> this preset and its scene "aurora_local_rampmode_flat" has no `v_deform`, so
> VSRAM stays whole-plane.

**Case 2 — the same document, the same binding, a scene that HAS one:**

> **ONE 16-PIXEL COLUMN:** this ramp scrolls a single 16-pixel column, not the
> screen. Section 0 binds this preset and its scene "aurora_local_rampmode_vdef"
> has a `v_deform`, which puts VSRAM in per-column mode — every other column
> keeps the plane's own scroll. WHICH 16 pixels is a property of that scene, not
> of this document: the aeon lane measured the strip at x = 4-19, not x = 0-15.
> Assumes this game declares CAP_PER_COL_VSRAM — sonic4 does.

**Case 3 — the bound sections DISAGREE:**

> **TWO DIFFERENT EFFECTS, BY SECTION:** the same five numbers below produce
> different effects depending on the section, and this document has no single
> answer. Section 1 scrolls the full width (its scene
> "aurora_local_rampmode_flat" has no `v_deform`); and Section 0 scrolls one
> 16-pixel column (its scene "aurora_local_rampmode_vdef" has a `v_deform`).
> Assumes this game declares CAP_PER_COL_VSRAM — sonic4 does.

**Case 4 — nothing binds it:**

> **FULL-SCREEN OR A 16-PIXEL COLUMN — THE BINDING DECIDES:** no section binds
> this preset, so nothing decides it yet. A section whose scene has no
> `v_deform` scrolls the FULL WIDTH; a section whose scene HAS one narrows this
> ramp to a single 16-pixel column. Bind it in the Section row above and this
> sentence will say which.

**Case 5 (the fourth case) — bound, and the scene is unresolvable:**

> **NOT DECIDED BY ANY DOCUMENT AURORA CAN READ:** Section 0 binds this preset,
> but section 0 takes the act default and this act names no editor scene, so its
> scroll config is aeon's hand-authored `act_parallax_config` in
> `act_descriptor.emp`, which Aurora does not read. Full-screen and one 16-pixel
> column are both still open; assign a scene to say which.

⚠ **NONE OF THE FIVE PICKS AN ARM IT CANNOT JUSTIFY**, and the two that decline
to are the point: with nothing bound, and with an unresolvable scene, "probably
full-screen, that's the common case" would be the drawn lie this row removes.

**A defect the first harness run found and this branch fixed:** the disagreement
arm printed *"Section 1 scroll the full width"*. A generated clause that does not
agree in number reads as a bug in the panel and costs the sentence the authority
it needs. Verb agreement now follows the group size and a node row asserts both
numbers.

---

## 6. ⚠ Independent of the contested display readout, deliberately

Mid-parcel the coordinator relayed that a real ROM contradicted the ramp card's
display span: `{top: 3, lines: 220}` derives `4..223` and the machine rendered
`5..223`; a control at `top: 128` derived 129 and measured 130. **Two different
tops, the same +1.** `EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG` and its readout are
contested, and settling them is the contract's question, not this parcel's.

**Nothing built here reads `rampDisplaySpan`, `ramp.top`, `ramp.lines` or the lag
constant.** This is a claim about the HORIZONTAL extent of the effect and about
which documents decide it; the vertical span stays with the readout. A wording
row asserts the mount site names neither `rampDisplaySpan` nor `DISPLAY_LAG`
within 300 characters either side, so a later editor cannot quietly tie them
together. **Nothing here was changed to accommodate the contested number, and
nothing here needs to change when it is settled.**

---

## 7. Proof

### 7.1 The instruments

| | rows | runner |
|---|---|---|
| `src/renderer/providers/__tests__/effects-preset-ramp-scroll-mode.test.ts` | **21** | `npm test` (vitest include) |
| `test/formats/aeon-vsram-mode-drift.test.ts` | **5** | `npm test` (vitest include) |
| `src/renderer/components/effects/__tests__/ramp-control-wording.test.ts` | **18** (was 14) | `npm test` (vitest include) |
| `scratchpad/ramp-scroll-mode-harness.mjs` | **11** | **`npm run harness:ramp-scroll-mode`** — registered in `package.json`; `npm run check:harness-guards` classifies it LAUNCHER (guarded): 198 clean / 198, 0 failures |

The harness creates **two scenes and a ramp preset through the panels
themselves**, binds them per section through the two per-section selects, and
reads the painted sentence. Selects are driven by the native value setter plus a
real `change` — the idiom every select-driving harness here uses under Xvfb —
and that is stated in the file rather than hidden: **no select is the SUBJECT of
a row here**, they are setup that puts the model into the state the sentence is
read in. `[f0]`/`[f1]` cover reachability by asserting each control is present,
visible, **inside its own scroller** and enabled before use.

**Every "it says X" row asserts the bindings that make X true**, read from
`__dbg.aeon.rasterRef(n)`, `sceneRef(n)` and `scenesJson()` beside the sentence
on the same run, and printed. A sentence alone proves nothing.

⚠ **It writes nothing to disk.** No save is issued, the app has no autosave,
aeon's checkout is opened read-only, and `[z]` asserts the probe preset, both
probe scenes and both per-section bindings are walked back out of the model by
the app's own history.

⚠ **Probe ids are namespaced** — `aurora_local_rampmode_*`. A sibling harness's
`ramp_probe` collided with a preset aeon shipped hours later and silently began
editing their document; the prefix is the fix.

### 7.2 Red-first — three plants, each on a **committed** baseline (`448b884b`)

Each was applied to a clean tree, shown on disk with `git diff --stat`, rebuilt
with `VITE_AURORA_DEBUG=1 npm run build` where a rendered surface was involved,
**grepped out of the bundle the app actually serves**, run, and restored with
`git checkout --` (verified `git status` clean).

| plant | mutation, on disk | in `dist/` | went red |
|---|---|---|---|
| **A** the sentence hard-wired to the FULL arm | `ramp-scroll-mode.ts` `if (true) return { short: 'FULL-SCREEN: this ramp scrolls the FULL WIDTH of the plane.', … }` (`git diff --stat`: 1 file, 1 insertion) | `short: "FULL-SCREEN: this ramp scrolls the FULL WIDTH of the plane."` | **11** node rows + **6** harness rows: `[c0] [c1] [c2] [av] [c3] [c4]` — **11/11 → 5/11** |
| **B** `sceneRef: null` read as absent | `effects-preset.ts` `const via = 'section'; const ref = s.sceneRef;` (1 file, 2 ins / 2 del) | not rebuilt — see the note below | **3** node rows |
| **C** the span "tidied" to `0-15` | `ramp-scroll-mode.ts` `Object.freeze({ first: 0, last: 15 })` (1 file, 1 ins / 1 del) | `RAMP_SCROLL_COLUMN_SPAN = Object.freeze({ first: 0, last: 15 })` | **1** node row + harness **`[c2]`** — **11/11 → 10/11** |

**Plant A is the anti-vacuous demonstration and it is the row worth reading.**
`[av]` holds the preset document byte-identical across two readings (compared by
full JSON equality, read back from the model both times), holds the binding
identical, and moves **one key on a different document**. Under plant A the two
sentences became the same string and `[av]` went red — which is precisely what a
hard-wired answer cannot survive. Note that `[c1]`, the FULL-arm row, **also**
went red: the hard-wired sentence names no section and no scene, so even the arm
it was wired to could not satisfy a row that asserts the derivation.

**Plant B is honestly reported as node-only.** ⚠ The harness cannot see it, and
the reason is §4: aeon's act has `sceneRef: null`, so both the correct and the
broken derivation land on `act-unset` for every section in the real project. The
act-default path is only reachable in the running app once an act names a scene,
which no act in aeon's tree does. The node rows cover both directions (the act
default deciding the answer, and a section's own ref winning over it) and each
carries an anti-vacuous half asserting the other path would have said the other
arm.

**Plant C isolates the fabrication hazard.** Only the row about the *measured*
span and the harness row that reads the sentence went red; every other row stayed
green, which is the split the design intends — the arm is right, the number is
somebody else's measurement, and only the rows about the number move.

Every plant's run was read as **its own first run**, and the clean run was taken
before the plants and again after the restore.

### 7.3 Aggregates

| | Test Files | Tests |
|---|---|---|
| **Master `09abdab3`** (`vitest run` in a throwaway worktree, **measured here**) | 484 passed / 2 skipped (486) | **6813 passed** / 8 skipped (6821) |
| **This branch** (`npm test`, whole chain incl. typecheck + 7 `check:*`) | 486 passed / 2 skipped (488) | **6843 passed** / 8 skipped (6851) |

**+2 files, +30 tests, 0 failures** — 21 + 5 + 4, exactly the three files. Nothing
was deleted or skipped; the 8 skips are unchanged.

⚠ **THE BRIEF'S MASTER FIGURE WAS 6814 AND IT IS 6813.** I measured it rather
than subtracting: a before/after pair where only the "after" was measured is how
a +29 gets reported as a +30 or the reverse, and this branch adds exactly 30 `it`
rows (counted in the diff). One row is not a defect in anything, but the number I
publish is one I ran.

Harness: **11/11** on a clean tree, first run, twice (before the plants and after
the restore).

---

## 8. Design calls I made, and why

- **Above the controls, not below.** §1's reason: the sentence changes what the
  numbers under it mean.
- **Painted short / contract long, on the same element.** `presetLimitsShort()`'s
  split. Painted arms are 177-443 characters; the hover is 1,522. This panel once
  rendered 8,059 characters before its first control and that was a real defect —
  but a rule an author must act on cannot be hover-only either, which is why the
  arm and the sections it names are painted and the aeon revision is not.
- **The capability conjunct is painted only on a column-claiming arm.** It is the
  one condition under which that arm would be wrong; on the full-screen arm it
  cannot change the answer, and a clause on every arm is a clause nobody reads.
  Both halves are on the hover unconditionally.
- **Neutral tone, no warning colour, no gate.** Both arms are features. The
  alternative — a warning on the column arm — would be the panel expressing a
  preference dressed as a rule.
- **`unknown` is a first-class answer, not a silent fallback.** Four sub-reasons,
  each with its own sentence, because "cannot say" is useless without "and here
  is what would decide it".
- **The strip's POSITION is never stated as a constant of the ramp.** The
  sentence prints the aeon lane's measured `x = 4-19`, says explicitly *not*
  `0-15`, and tells the author the position belongs to the scene they bind. The
  WIDTH is stated flatly, because 16 px is the hardware granule
  (`VSCROLL_COL_PAIRS = SCREEN_WIDTH / 16`, with aeon's own `ensure` that it is
  20 on H40) rather than a measurement.

**Not built, and named rather than left implicit:** no drawn preview of the
strip. `NO_PREVIEW` stands at the top of the panel, this editor has never drawn a
raster program, and a *drawn* 16-pixel column is exactly where a relayed position
would become a fabricated one.

**Nothing is blocked.** Nothing here has seen a ROM obey a ramp in either mode,
and nothing here claims one has: the register chain is aeon's source, the
on-screen strip is aeon's measurement, and both are labelled as such.
