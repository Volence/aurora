# EW-REELS-PANEL — `reels` is authorable, and one hazard was already closed

**Parcel** EW-REELS-PANEL (project EFFECTS-W1, DoD item 10's *panel half*; the follow-on to EW-REELS-CODEC)
**Branch** `feat/ew-reels-panel`, off `e04eed21`
**Date** 2026-09-04
**No emulator was touched, and nothing here claims a runtime result.** aeon's generator arm for `reels` does not exist yet (their EFFECTS-W1-REELS-STEP4) and the effect is DEBUG-tier, so a scene authored through this panel is a document nothing consumes today and a release build would render nothing from it in any case.

---

## 1. Commits

| SHA | What |
|---|---|
| `6a128b4c` | `scene-ui.ts` §2.7 (derivations), `effects-aeon.ts` §2.7 (the model), the Scene form's Reels block |
| *(gates)* | `test/formats/effects-reels-panel.test.ts` — 36 rows |
| *(runner)* | `scratchpad/poisons-reels-panel.sh` — 10 poisons |
| *(harness)* | `scratchpad/reels-panel-harness.mjs` + `harness:reels-panel` in `package.json` |
| `be98e5da` | the harness's own defect: its floor value collided with the seed |
| `f6dc1491` | ROADMAP row 151 |
| *(this file)* | the packet |

Files changed:

- `src/core/formats/effects/scene-ui.ts`
- `src/renderer/providers/effects-aeon.ts`
- `src/renderer/components/effects/EffectsScenePanel.tsx`
- `test/formats/effects-reels-panel.test.ts` *(new)*
- `scratchpad/poisons-reels-panel.sh` *(new)*, `scratchpad/reels-panel-harness.mjs` *(new)*, `package.json`
- `docs/ROADMAP.md`, `docs/reviews/2026-09-04-ew-reels-panel.md`

**Nothing the codec half owns was touched.** No schema re-vendor, no sidecar edit, no change to `scene.ts` or `json-schema-subset.ts`. The vendored schema is read, never written; poisons I and J mutate it and restore it from the committed tip.

---

## 2. ⚠⚠ THE FINDING — the codec packet's one named hole is not a hole

EW-REELS-CODEC §4.1, in its own words:

> **⚠ THE ONE HOLE, NAMED RATHER THAN PAPERED OVER.** `0 × 256 = 0`, which is legal. A panel that applied the drift conversion to a document of all-zero rates would emit a *legal* document. Nothing catches that — not the schema, not aeon, not this suite.

That is **correct about the bound and one keyword short of the schema.** `rates` also carries `uniqueItems` — which that same packet added to `json-schema-subset.ts` and describes at length in its own §3.1 and §4.2. An all-zero `rates` is `EFFECTS_REEL_BAND_COUNT` **equal** values, and `uniqueItems` refuses it.

The full argument, which is a computation over two constraints and not a claim:

1. `|256r| ≤ 127` holds only for `r = 0`. So the only rate whose ×256 survives `items` is 0.
2. A ×256'd document therefore survives `items` only if **every** rate is 0.
3. An all-zero array of five is not pairwise distinct, so it fails `uniqueItems`.
4. ∴ **every ×256'd document is refused** — by the bound if any rate is nonzero, by `uniqueItems` if none is. There is no surviving document.

`EFFECTS_REEL_X256_SURVIVORS` is step 1 as a census computed from the schema's own `items` bounds and drift's own factor (`[0]`, length 1). `EFFECTS_REEL_X256_FULLY_CAUGHT` is step 3–4 as `survivors.length < EFFECTS_REEL_BAND_COUNT`. Neither is a literal, so a contract that widened the bound or dropped `uniqueItems` flips the conclusion rather than leaving a comment claiming a defence the schema no longer provides — **poisons I and J are exactly those two mutations and both fire.**

**And the test does not stop at the arithmetic.** It walks the census by hand from the schema node, then **measures** the all-zero document against the committed schema through the codec's own `validateAgainstSchema`, requiring a refusal that names uniqueness — with a **one-zero-among-four control beside it** that validates clean, so the refusal is provably about the repetition and not about the value.

### What I am *not* claiming

- Not that the codec is wrong. Its §4.1 sentence is scoped to the bound and is true of the bound.
- Not that the ×256 is therefore safe to write. It is refused at *load*, which is a build-time or open-time failure; the panel refuses it at the *box*, which is where an author can act on it. Both matter and neither replaces the other.
- Not anything about aeon. aeon has no magnitude ensure yet; that is still true and still theirs.

---

## 3. The four hazards, and the artifact carrying each

### 3.1 ⚠ The unit collision

`reels.rates` is **signed whole pixels per frame**; its neighbour `drift.rate` is 1/256 px and Aurora multiplies by 256 on export. The defence is structural and then asserted three ways:

- **No conversion exists on this path.** `setReelRateCommand` stores the integer it was handed. There is no `reelPxPerFrameToRate` and the §2.7 banner says there must never be one — the moment this key has a converter, it and drift's differ by a factor of 256 and are one autocomplete apart.
- **Asserted behaviourally, not by comment.** The write is the **identity over the whole legal span**: every rate the schema admits is written and read back equal, with the count derived (span minus the seeded values that would be a no-op or a duplicate), so a command that returned `null` throughout fails before any ×256 row is reached. A ×256, a ÷256, a clamp and a round all fail it.
- **A second, different discriminator.** `Function.prototype.toString()` over the reels functions asserts none of them names `driftPxPerFrameToRate`, `driftRateToPxPerFrame` or `EFFECTS_DRIFT_UNITS_PER_PIXEL` — which catches a converter applied and then undone, the one mutation identity would survive. It reads the function bodies rather than the file, which is full of legitimate drift code.
- **And on screen.** The spinner's `min`/`max` are the **schema's** span; `refuse` is what withholds a commit, because `min`/`max` on an `<input type="number">` stop no typed value (EFFECTS-W1 defect 5). The harness types `768` with real key events and reads the model back.

The one place the factor appears in this parcel is `EFFECTS_REEL_X256_SURVIVORS`, which is **the adversary, not a converter** — it computes what the mistake *would* produce, and it is not on the write path.

### 3.2 Zero is a value

`reelRateRefusal` does not refuse 0, deliberately unlike `drift.rate`'s `not: {const: 0}`. Asserted as a **contrast** — `reelRateRefusal(0)` is null AND `driftRateRefusal(0)` is not — because a row checking only reels would pass if someone gave both keys the same ruling.

What caps it at one strip is `uniqueItems`, a property of the **array**. So the box's `refuse` is `reelRateWriteRefusal`, which builds the candidate array and asks `reelRatesRefusal` about it. **This is the load-bearing split, and poison F is the reason it exists**: a control that handed `NumberField` the per-value `reelRateRefusal` looks right, reads right, and authors a document the codec refuses at load. Three rows go red under it.

The readout says **"stationary"**, never a blank: 0 is the one control state meaning "this strip deliberately does not move", and rendering it as an em-dash would make it look like a control nobody filled in.

### 3.3 Screen order is array order

Nothing sorts, reorders, filters or normalises. There is **no add, remove or reorder affordance at all** — the length is aeon's `REEL_BAND_COUNT`, which sizes a RAM array and is compiled into a shift. `setReelRateCommand` replaces exactly one index.

The label column carries the **pixels**, not a strip number: `x 0–63` … `x 256–319`, derived from the description's own `screen X 64i..64i+63` and cross-checked against its `column-pairs 4i..4i+3`. That is the only defence an author *sees*, and a strip number would just be a second copy of the array index.

**Every order row uses a DESCENDING subject and compares the EXACT SEQUENCE**, and each also asserts its subject differs from its own sorted form — so the discriminator is proven present rather than assumed. A membership assertion passes under a sort and would be worthless here. The harness drives it at the **rightmost** strip with the value at the bottom of the span, which would sort to the front.

### 3.4 ⚠⚠ DEBUG tier — the disclosure the panel is required to paint

`OJZ_Reel_Speed`'s emitted length is 0 in release, so a scene saved with `reels` validates, builds, ships and shows nothing. No JSON keyword can carry that; the contract's own description says the editor panel must.

`EFFECTS_REELS_DEBUG_NOTE` is that sentence **extracted from the description**, in both lengths — `short` painted, `full` on the same element's `title` (the ramp card's split). The panel is asserted to contain **neither** as a literal, which is the one mutation that would let the required disclosure drift from the fact (poison E). If aeon ever ships the effect in release, the clause goes, the extraction throws, and the module's import fails loudly — instead of leaving a stale caution nobody has a reason to revisit.

**No capability note**, and its absence is deliberate: there is no `CAP_` bit for reels and the contract says a generator arm must not emit a check that does not exist. That is the **opposite** call from `EFFECTS_ROW_REMAP_CAPABILITY_NOTE` on the card above it, where a real capability exists and is not a function of the document. The no-CAP row is anti-vacuous: `CAP_` is asserted to be a real string in the reels description, so "absent from the reels path" is a finding rather than a spelling accident.

---

## 4. Absent is absent, and the advisory that must not read as a clearance

**Off DELETES the key.** `reels` has no `"none"` spelling — `"reels": "none"` is refused by the schema, asserted — so unlike `drift`/`curve`/`vsplit`/`rowRemap`, whose toggles choose between a payload and a `"none"` arm, absent is the only representation of off. `v_deform`'s precedent.

**On seeds all five**, because there is no partial state: `minItems`/`maxItems` are both the band count. `REEL_RATE_SEED` is the smallest distinct positive rates, and the rule matters more than the numbers:

- **not zeroes** — refused outright by `uniqueItems`, *and* the exact shape §2 names as where a ×256 error would hide;
- **not one value repeated** — same refusal, and it is the version a reader would not question, which is why it is checked;
- **inside the contract's own useful range**, so a new scene is never born on a strobe.

All of that is checked at module load rather than asserted in a comment (poison B: the module throws and the test file fails to *collect*, which is the designed failure for a derivation that cannot be satisfied).

**`advisoryReelsBinding` had no caller until now.** It is one-sided by construction — it speaks only in the negative case, names aeon as the authority, does not block saving, and says in its own words that its silence is not a clearance. A surface that rendered *only* that warning would turn its silence into an all-clear, which is the defect its own docblock names. So the panel pairs it: aeon's binding **RULE** (`EFFECTS_REELS_BINDING_NOTE`, extracted) is painted whenever the key is present, and the warning appears only in the negative case. An absent warning then reads as "Aurora has nothing to add", not "the build will accept this". A row asserts the two are different sentences, because if they were the same string the pairing would be a repeat and the silence would be bare again.

Empty act slots are **dropped** before the advisory sees them, so an act of empty sections lands in its "this project has no sections" case (silence) rather than its "no section binds this scene" case (a warning about nothing).

---

## 5. Guidance is not a bound

The description carries two UI notes the panel uses and one qualifier that governs them: *"the useful slider range is about -16..16 and that is UI guidance, never a refusal"*, and *"64 and up is a strobe"*.

`EFFECTS_REEL_RATE_GUIDANCE` is kept strictly apart from `EFFECTS_REEL_RATE_BOUNDS` — the split is `rowRemapBuildableToday`'s beside `rowRemapHeightShiftRefusal`, and a control that folded them together would refuse a legal 100 for ever. An interlock at module load requires guidance to sit **inside** the legal span and the strobe threshold **outside** the guidance, so a contract that confused the two quantities fails the import. The spinner's range is the schema's; the guidance renders at the **hint** tier, never the warning tier, and only when it has something to say. Poison H moves the spinner onto the guidance and the row falls.

---

## 6. Verification

### 6.1 `npm test` aggregate — both states measured by me, in this worktree

| State | Test Files | Tests |
|---|---|---|
| **BEFORE** (`e04eed21`, the branch point) | 494 passed, 3 skipped (497) | **7046 passed, 9 skipped (7055)** |
| **AFTER** (tip) | *(see §6.5)* | *(see §6.5)* |

Both are full `npm test` runs — `check-test-collection`, `check-pseudo-skip`, `check-peer-path-literals`, `check-cited-paths`, `check-object-stringify`, `check-ledger-timestamps`, `check-python-resolver`, `check-harness-guards`, `npm run typecheck` (`tsc --noEmit`), then `vitest run` — run to completion, not exited early at a gate.

The suite was **fully green at the branch point**. (EW-REELS-CODEC's packet recorded 2 failures in the parallel boundary lane; those landed and are gone.)

### 6.2 The ten poisons — each with its mutation on disk, its run, and its restore

`bash scratchpad/poisons-reels-panel.sh`, run at a committed tip on a clean tree. Every mutation is applied by exact-string substitution that **aborts unless it finds exactly one anchor**, the changed line is quoted back from disk, `git diff --stat` names the file, and the restore is `git checkout HEAD -- <path>`.

| # | Mutation | File | Red rows |
|---|---|---|---|
| **A** | `rates[index] = rate` → `rate * 256` | `effects-aeon.ts` | 2 — the identity walk, and the one-strip write row |
| **B** | the seed becomes one value repeated | `effects-aeon.ts` | **the file fails to COLLECT** — the module throws at load, `Test Files 1 failed` |
| **C** | `reelRatesValue` returns a sorted copy | `effects-aeon.ts` | 3 — the exact-sequence row, the no-reorder row, and a duplicate row that reads through it |
| **D** | the row label becomes `Strip ${i}` | `EffectsScenePanel.tsx` | 1 — *the LABEL carries the pixels…* |
| **E** | the DEBUG sentence typed into the component | `EffectsScenePanel.tsx` | 1 — *…carries no typed copy of it* |
| **F** | the box's `refuse` asks the VALUE, not the array | `effects-aeon.ts` | **3 — all three `uniqueItems` rows** |
| **G** | off writes `"none"` instead of deleting | `effects-aeon.ts` | 2 — both absent-is-absent rows |
| **H** | the spinner is bounded by the GUIDANCE | `EffectsScenePanel.tsx` | 1 — *bounded by the SCHEMA, never by the guidance* |
| **I** | `uniqueItems: true` → `false` in the vendored schema | schema JSON | **1 — only the census row**, which is the point |
| **J** | `items.maximum` 127 → 32767 in the vendored schema | schema JSON | 2 — the ×256 span row and the census row |

**Poison F is the load-bearing one.** `reelRateRefusal` and `reelRateWriteRefusal` differ only in whether they can see a sibling, and the version that cannot is the natural thing to write. Three rows fall, all in hazard 2's block, and none of them is a restatement of another: one is the zero case, one the nonzero case, one the "the box asks about the array" claim itself.

**Poison I likewise deserves its own sentence.** Dropping `uniqueItems` leaves the survivor census unchanged (`[0]`, still shorter than the band count) — so `EFFECTS_REEL_X256_FULLY_CAUGHT` stays `true` while the schema has stopped providing the defence. **Only the row that MEASURES the all-zero document against the validator falls.** That is exactly why the census row does not stop at its own arithmetic, and it is the difference between a row that checks a computation and a row that checks a contract.

### 6.3 The CDP harness — 25/25

`npm run harness:reels-panel` against a `VITE_AURORA_DEBUG=1` build of **this branch**, driving the real app under xvfb at 1680×1050, typing with real `Input.dispatchKeyEvent` and reading the model back through `__dbg.aeon.scenesJson()` — never the widget.

```
════ 25/25 rows · 20.6s ════
```

Every bound and the DEBUG sentence are read **from the vendored schema at startup** — not imported from `scene-ui.ts` (which would make the row "the panel paints what the module says", true of a module that says the wrong thing) and not typed into the harness (which drifts the moment the contract does).

What the green rows rule out, beyond what the node suite can:

- **[4c]** typing a legal rate lands **exactly** that integer in the document. This is the anti-vacuous floor and it runs **before** every refusal row, so a dead input cannot bank a refusal first.
- **[5a]/[5b]** typing `768` never reaches the document, and a **painted** refusal naming the unit and the prohibition sits under the box.
- **[3a]/[3b]** the DEBUG sentence is on screen — `checkVisibility()`, non-empty `getClientRects()`, a strict `elementFromPoint` at the leaf's own centre, **and the rect inside its scroller's box** — and the painted text contains the sentence read from the schema.
- **[6a]/[6b]/[6c]** writing the rightmost strip leaves the other four at their indices; the result is not its own sorted form; the five labels are `["x 0–63","x 64–127","x 128–191","x 192–255","x 256–319"]`, checked against spans derived from the contract's 64px stride.
- **[7a]/[7b]/[7c]** zero commits; a **second** zero does not; a painted refusal names both strips and says zero is legal.
- **[9a]/[9b]** off deletes the key and the five boxes go with it.

`devicePixelRatio` and the rect are printed beside every aim.

### 6.4 ⚠ The harness's own defect, found by running it

Run 1 read **24/25**. The red row was `[4c]`, the anti-vacuous floor: it typed the contract's worked example `3` into strip 0 — and `3` was already strip 2's seeded rate, so `uniqueItems` **correctly** refused it. The panel was behaving exactly as specified and the instrument reported a hazard-1 failure. **A control that acts inside its own sample window manufactures a false refutation that looks like the rule failing.**

Fixed at `be98e5da`: the floor's value is now derived from what the document already holds (the smallest positive rate absent from it) and printed with the array it was derived against; the ×256 row keeps `768` unconditionally, because that is the contract's own worked example and tying it to the floor's value would have made the number it types depend on the seed. Run 3 read 25/25.

Recorded rather than quietly fixed, because the failure mode is general: this is the second harness in this repo to be caught choosing a subject that collides with the state it is measuring.

### 6.5 The ×256 plant, against the RUNNING APP

The poison runner mutates source and runs the node suite. The hazard this parcel exists for is a UI hazard, so it was also planted against the built app: `scene.reels.rates[index] = rate` → `rate * 256` in `effects-aeon.ts` (quoted back from disk, `git diff --stat` naming the one file), then a full `VITE_AURORA_DEBUG=1 electron-vite build`, then the harness, then `git checkout HEAD -- <path>` and a rebuild.

```
════ 19/25 rows · 21.0s ════        (clean: 25/25)
```

**Six rows red**, and *which* six is the honest size of the hazard:

| Red under ×256 | Why |
|---|---|
| `[4c]` the floor | typing 6 landed 1536 — the row this hazard is named for |
| `[5a]` the ×256 never reaches the document | the per-keystroke prefixes `7` and `76` committed as 1792 and 19456, **outside the schema's own span**, so the document held values no build would take |
| `[6a]` one-strip write | the other four strips were unchanged but strip 4 held `-128 × 256` |
| `[7a]`,`[7b]`,`[7c]` the zero rows | with out-of-bound values already in the array, `reelRatesRefusal` refuses at the first bad element and no zero ever commits |

**Nineteen rows still passed**, and that number is the point rather than a footnote: the toggle, the seed, the painted disclosure, the labels and the delete are all *correct* under a panel that emits 768 for an intended 3. A parcel that had shipped only those rows would have been green over the one defect it was written to prevent.

### 6.6 The alternative green-paths I ruled out

- **"The identity row passes because nothing was written."** Ruled out by the derived count: the row asserts the number of writes that actually landed, computed from the schema's span minus the values that would be a no-op or a duplicate. A command returning `null` throughout fails it.
- **"The order rows pass because both sides were sorted."** Ruled out by asserting each subject differs from its own sorted form, in the same row that compares the sequences.
- **"The DEBUG row passes because the panel typed the same words."** Ruled out by asserting the panel source contains **neither** extracted string as a literal, and by poison E, which types exactly that sentence in and turns the row red.
- **"The painted rows pass on hidden text."** Ruled out by four readings per leaf, including the rect-inside-scroller comparison, because `checkVisibility()` and `getClientRects()` both go green on an element scrolled far out of its scroller.
- **"The no-CAP row passes because `CAP_` is not a string in this repo."** Ruled out in the row: `CAP_` is asserted to appear in the reels description itself.
- **"The census row passes because it is comparing a module to itself."** Ruled out: the census is walked **by hand** from the schema node inside the test, and the conclusion is measured through the codec's validator rather than read back off the constant. Poison I fires on exactly that half.
- **"The guidance rows pass because guidance equals the bound."** Ruled out by an explicit anti-vacuous check that guidance sits **strictly** inside the span.

---

## 7. Open, and why

1. **Nothing authored here reaches a ROM.** aeon's generator arm for `reels` does not exist yet (EFFECTS-W1-REELS-STEP4 is their doing row), and the effect is DEBUG-tier regardless. A scene carrying `reels` is a document nothing consumes today.
2. **No runtime confirmation, and none is claimed.** Two reasons, both standing: the workspace rule against calling an emulator from a background agent, and the DEBUG tier — a release build would show nothing whether or not this panel is right. **TAGGED for the foreground lane** if anyone wants to see five strips move: it needs a DEBUG build and aeon's `tools/reels_witness.py`, which is the only writer of `OJZ_Reel_Active`.
3. **The binding advisory is still one-sided, and must stay so.** Aurora does not model `Effects_ResolveParallax` and cannot see a preset's contents. The panel now surfaces it and pairs it with the rule; it does not and must not become a verdict.
4. **The codec packet's §4.1 sentence is left standing where it is.** ROADMAP row 151 records the correction and row 150 is not rewritten — the rows are append-only history, and a packet edited after the fact stops being the record of what was believed when it was written.
5. **`EFFECTS_REEL_COLS_PER_BAND` and `EFFECTS_REEL_PHASE_SPAN` have one consumer each** (the box title and the cycle readout). They are derived and cross-checked rather than convenient, because both are cited to an author in prose the panel paints.
