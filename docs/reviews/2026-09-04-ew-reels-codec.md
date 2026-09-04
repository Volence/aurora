# EW-REELS-CODEC — `reels` parses, round-trips and refuses

**Parcel** EW-REELS-CODEC (project EFFECTS-W1, DoD item 10's *authoring half*; unblocks the row tracked as EW-7-11)
**Branch** `feat/ew-reels-codec`
**Date** 2026-09-04
**Scope ruling honoured** codec only. **No authoring UI was built** — that is a separate follow-on parcel, and starting it was out of bounds.
**No emulator was touched.** Nothing here claims anything about rendered behaviour, and the effect is DEBUG-tier so a runtime look would have proven nothing about a release build anyway.

---

## 1. Commits

| SHA | What |
|---|---|
| `914dc145` | Re-vendor `aurora-effects-scene.schema.json` at empyrean `ff3f43f` + sidecar re-pin |
| `477f5509` | `uniqueItems` in `json-schema-subset.ts` + 3 rows in `effects-schema-drift.test.ts` |
| `a199a6c6` | `EffectsReels`, two schema-derived constants, `advisoryReelsBinding`, golden fixture, `effects-reels.test.ts` (16 rows) |
| *(this file)* | ROADMAP row 150 + this packet |

Files changed:

- `src/core/formats/effects/aurora-effects-scene.schema.json` (extracted, never typed)
- `src/core/formats/effects/aurora-effects-scene.schema.provenance.json`
- `src/core/formats/effects/json-schema-subset.ts`
- `src/core/formats/effects/scene.ts`
- `test/fixtures/effects/canopy_dusk.json`
- `test/formats/effects-schema-drift.test.ts`
- `test/formats/effects-reels.test.ts` *(new)*
- `docs/ROADMAP.md`, `docs/reviews/2026-09-04-ew-reels-codec.md`

Nothing with `preset` in its name was touched: that is the parallel EW-BOUNDARY-CODEC lane's surface.

---

## 2. The re-vendor, verified rather than accepted

The dispatch handed me a revision and a blob. I re-derived all three facts rather than trusting the lines:

```
revision   ff3f43f2e9c2b0b98e6c283f5cb87eb106f0fe5c
scene blob 05f58fb9a68d03ea79e672e41d9daec1517b3b87
origin/main 188b656214ceac06b6178e8ce967645be2dccab3
```

- `merge-base --is-ancestor ff3f43f origin/main` → yes.
- `origin/main:contract/schema/aurora-effects-scene.schema.json` resolves to the **same blob**, so the pin is current at tip, not merely correctly cited.
- `git log --follow` names `ff3f43f` the **last** touching commit, so no revision sits between the pin and the tip.
- The extracted bytes were re-hashed with `git hash-object` **before anything was believed about them**: `05f58fb9`, 27,006 bytes.

The peer repo was read **only through `git show <rev>:<path>`**, never by filesystem path, and the empyrean path itself was derived by running `test/support/sibling-root.mjs`'s `siblingPath('empyrean')` in this worktree rather than typed from memory.

### What moved — measured twice, not relayed

`scratchpad/schema-revendor-proof.mjs --old <HEAD bytes> --new <vendored>` exits 1 and **both readings agree**:

| Reading | Result |
|---|---|
| 1 — parsed leaf diff | **12 added, 0 removed, 0 changed-in-place**; 282 leaves → 294; every added pointer under `/properties/reels` |
| 2 — descriptions stripped at every depth, keys sorted | 5,904 → 6,122 chars, not byte-identical — the correct verdict for a structural addition |

Twelve agrees with empyrean's own commit message. Unlike the `rowRemap` pin, there is **no empty-container node** here (`reels` declares no `"not": {}`), so the scalar-leaf walk is not blind to anything this time — which I checked rather than assumed, because that blindness is exactly what the previous pin's sidecar records.

### Where the schema bytes contradicted the dispatch

Nowhere materially. Two notes for the record:

1. The dispatch said the key was "inserted between `v_deform` and `anchor`" — correct, and worth stating explicitly that this makes `reels` a **ROOT** key, not a layer key like item 9's `rowRemap`. Anyone reading the two parcels side by side could easily assume otherwise.
2. **One internal looseness in the schema's own prose**, recorded in the sidecar under `one_wording_to_read_past`: the description's *opening* sentence says "**up to** five … strips" while its normative sentence says "**EXACTLY FIVE**" and the keywords say `minItems`/`maxItems` 5. The keywords govern — a four-element `rates` is refused, asserted. Noted so a later panel author does not derive an optional-length control from the looser clause.

---

## 3. What the gates named — and what I did about each

The re-vendor commit was landed with the suite deliberately red, because the gates naming the forced edits *is* the vendoring design working. Three things went red, all three by derivation rather than by anyone reading a diff:

### 3.1 `uniqueItems` — the first in either committed contract schema

`effects-schema-drift`'s keyword census and its whole-schema walk (`assertSchemaSupported`) went red together.

The part that is not boilerplate: **it does not use the file's existing `deepEqual`.** That helper is `JSON.stringify(a) === JSON.stringify(b)`, which preserves key insertion order, so it calls `{a:1,b:2}` and `{b:2,a:1}` **distinct** where the spec calls them equal. For `const`/`enum` that skew errs toward refusing something legal — loud, visible, the safe side. For `uniqueItems` **the sign flips**: it would call a real duplicate distinct and **accept an array the real schema rejects**, which is the one failure mode `json-schema-subset.ts`'s header promises not to have. So `uniqueItems` got `sameInstance`, order-insensitive at every depth; `deepEqual` was left alone deliberately.

The committed schema has no object-valued array items today, which is exactly why nothing but a deliberate row catches the substitution — the same reason the `anyOf`-is-not-`oneOf` row beside it exists.

Also: `uniqueItems: false` is accepted as the no-op the spec defines it to be; a **non-boolean** is refused by *shape* at `assertSupported`, so the whole-schema walk catches it rather than the first document that reaches the node (the type-array lesson, empyrean `12aecd5`). And it joined `NON_ANNOTATING_KEYWORDS` — not a widening of trust, since it asserts a property of the array instance and names no object property as evaluated.

### 3.2 The shape-coverage golden

`effects-scene-golden`'s derived top-level sweep went red naming `reels`. `test/fixtures/effects/canopy_dusk.json` gained the key carrying **aeon's own shipped rates** — `OJZ_REEL_SPEEDS = [3, -5, 2, -4, 6]`, `games/sonic4/data/effects/ojz_effects.emp:1756` at aeon `660aabc0` — so the fixture is the corpus rather than five numbers this repo invented.

Re-emitted by the **other** implementation §5 names (`json.dumps(sort_keys=True, indent=2, ensure_ascii=False)` plus the §8 terminator), never by `serializeEffectsScene`, so the byte round-trip stays cross-implementation evidence. The formatter was verified to be a **fixed point on the file before the edit**, so the diff is provably the one key: 2,666 → 2,751 bytes, 149 → 158 lines, sha256 `a8195cdad5f6eb63…` → `1834c08cd1e33cf4…`.

### 3.3 The codec needed no structural change

Parse hands back what `JSON.parse` produced; serialize is schema-driven. An absent key stays absent, a present one round-trips in document order. What was added is a type, two schema-derived constants, and the facts no keyword can carry.

---

## 4. The five constraints the schema cannot state

### 4.1 The unit — and why the ×256 mistake cannot be routed into

`reels.rates` is **signed whole pixels per frame**. There is no fixed point anywhere on this path (`add.b (a2)+, d0` into a byte phase that wraps mod 256). `drift.rate`'s ×256 export conversion **must not** be applied.

**The dispatch's BLOCKED clause does not fire, and here is the measurement rather than the assurance:** there is no shared rate converter to route through. `grep` over `src/` and `test/` finds the ×256 in exactly two functions, `driftPxPerFrameToRate` and `driftRateToPxPerFrame` in `scene-ui.ts`, both named for drift, with `EFFECTS_DRIFT_UNITS_PER_PIXEL` the only place the factor is spelled. Nothing in the reels path calls any of them, and `EffectsReels`'s docblock says a future panel must keep it that way.

The catch itself is **asserted, not promised**: for every legal rate in the span, the ×256 of it is refused. Both numbers come from the two contracts (`EFFECTS_DRIFT_UNITS_PER_PIXEL` out of the drift node's description, the span out of the reels node), so a widened bound moves the row rather than leaving it asserting yesterday's arithmetic.

> **⚠ THE ONE HOLE, NAMED RATHER THAN PAPERED OVER.** `0 × 256 = 0`, which is legal. A panel that applied the drift conversion to a document of all-zero rates would emit a *legal* document. Nothing catches that — not the schema, not aeon, not this suite. It is a narrow case (every rate zero means every strip stationary, which an author would probably notice) but it is a real hole in "the bound is the only place the mistake is caught", and it should be written into whatever panel lands next.

### 4.2 Zero is a value

Deliberately unlike `drift.rate`, whose node spells `not: {const: 0}`. Asserted as a **contrast between the two committed nodes**, so the row cannot pass by both having been given the same ruling. `uniqueItems` is what caps a stationary strip at one occurrence — asserted too.

### 4.3 Absent = no reels

There is no `"none"` spelling. `v_deform`'s absent-key precedent governs, **not** the `oneOf`-with-a-`"none"`-arm of `drift`/`curve`/`vsplit`/`rowRemap`. Both directions asserted: `"reels": "none"` is *refused*, and the writer never materialises the key on a scene that does not carry it.

### 4.4 Screen order is array order

Index *i* owns screen X `64i..64i+63`. The contract's own words: an editor that sorts `rates`, or round-trips them through a dict keyed by band name, "silently relocates every strip".

Aurora's codec structurally cannot: `canonicalizeBySchema` maps arrays **positionally** and `canonicalJsonPretty` sorts **object keys only**. Two rows guard it, because one is not enough:

- the **exact sequence** comes back (a membership assertion would pass under a sort — that is the vacuous version of this test);
- two **permutations** of the same rates render to **different bytes** (if the writer sorted, both would render identically).

### 4.5 Geometry is fixed; DEBUG tier; no capability check

`minItems`/`maxItems` 5 is a copy of aeon's `REEL_BAND_COUNT` (with `REEL_COLS_PER_BAND` = 4, i.e. 64 px per strip). `EFFECTS_REEL_BAND_COUNT` reads it from the node **and cross-checks the two bounds against each other**, throwing if they disagree — both spell one engine constant, and a contract that moved one would otherwise leave this module quietly reporting a band count no schema means. A `cols_per_band` key is refused by closure; asserted, since that is the key a panel author is likeliest to reach for.

**DEBUG tier**: the table, proc and on-switch all sit inside `if DEBUG == 1` (`OJZ_Reel_Speed`'s emitted length is 0 in release, `ojz_effects.emp:1766-1767`), so a scene saved with `reels` validates, builds, ships and renders **nothing**. This is written in capitals in `EffectsReels`'s docblock — the place a panel author will be reading — with the instruction that a panel must put it **on screen**.

**No capability check was added.** There is no `CAP_` bit for reels; the contract says a generator arm must not emit a check that does not exist. Do not pattern-match this onto `CAP_BAND_DRIFT`.

---

## 5. The binding advisory, and why it is one-sided

aeon's generator **refuses** `reels` on a scene whose sections resolve through a preset (`Effects_ResolveParallax` rung 2) or the act default (rung 3), because the association table is keyed on the scene's lowered config label and that label is unique only at rung 1 — an editor `sceneRef`.

That refusal is aeon's. `advisoryReelsBinding(scene, sceneRefs)` is the early warning the dispatch called welcome, shaped so it can never be mistaken for the guarantee:

- it speaks **only in the negative case** — no section in the project names this scene by `sceneRef`, so no section can reach it at rung 1;
- its message says **"EDITOR-SIDE WARNING, not the refusal"**, names aeon as the authority, says **"Saving is not blocked"**, and says **in its own words** that *its silence is not a clearance*;
- there is deliberately **no "looks fine" return value** for a surface to render as one;
- an **empty section list returns nothing at all** — "this project has no sections" is a different fact from "no section binds this scene", and warning on the first is the loud-on-nothing failure that trains people to ignore the channel;
- nothing in the read or write path calls it, which is **asserted** rather than promised.

---

## 6. Verification

### Aggregate totals, measured on both states by me

Both figures are from `npx vitest run` / `npm test` in this worktree, not carried from the dispatch.

| State | Test Files | Tests |
|---|---|---|
| **BEFORE** (master `8f67bb35`, old schema restored) | 3 failed, 489 passed, 3 skipped (495) | **3 failed, 6977 passed, 9 skipped (6989)** |
| **After the re-vendor alone** (no other edit) | 4 failed, 488 passed, 3 skipped (495) | 8 failed, 6972 passed, 9 skipped (6989) |
| **AFTER** (tip `a199a6c6`), full `npm test` chain | 2 failed, 491 passed, 3 skipped (496) | **2 failed, 6997 passed, 9 skipped (7008)** |

`npm test` ran the **whole** chain to completion in this worktree — `check-test-collection`, `check-pseudo-skip`, `check-peer-path-literals`, `check-cited-paths`, `check-object-stringify`, `check-ledger-timestamps`, `check-python-resolver`, `check-harness-guards`, `npm run typecheck` (`tsc --noEmit`), then `vitest run`. It did **not** exit early at a gate; every gate printed OK and `tsc` was clean.

**The 2 remaining failures are not mine.** They are `effects-preset-schema-drift` and `effects-preset-vectors` CURRENCY rows, both already red on the BEFORE state before I touched anything, both belonging to the parallel EW-BOUNDARY-CODEC lane's re-vendor. The third BEFORE failure was the *scene* schema currency row, which this parcel closes.

Arithmetic that should sum: 6989 → 7008 is +19 tests (16 new in `effects-reels.test.ts`, 3 new in `effects-schema-drift.test.ts`); 6977 → 6997 is those 19 plus the one previously-failing scene currency row now passing. 495 → 496 test files is the one new file.

### Poisons planted — each with its mutation, its red run, and a restore from a committed baseline

Every mutation was applied to a **clean tree at a committed tip**, quoted back from disk (`grep` on the planted marker) with `git diff --stat` naming the file, run, then restored with `git checkout HEAD -- <path>` — never `git checkout --` over uncommitted work.

| # | Mutation | File | Red rows |
|---|---|---|---|
| **A** | `if (schema.uniqueItems === true)` → `if (false)` | `json-schema-subset.ts` | 2 — *implements `uniqueItems`…*, *compares array items by members…* |
| **B** | `sameInstance` first line → `return JSON.stringify(a) === JSON.stringify(b)` | `json-schema-subset.ts` | **1 — only** *compares array items by members, not by key order* |
| **C** | the `uniqueItems` non-boolean shape refusal → `if (false)` | `json-schema-subset.ts` | 1 — *treats uniqueItems:false as the no-op it is…* |
| **D** | `serializeEffectsScene` sorts `reels.rates` ascending | `scene.ts` | 5 — both order rows, both golden round-trips, the §8 terminator row |
| **E** | `items.maximum` 127 → 32767 in the **vendored schema** | schema JSON | **1 — only** *the schema refuses every ×256 of a legal nonzero rate* |
| **E2** | `rates.minItems` 5 → 4 (bounds disagree) | schema JSON | whole file fails to collect: the interlock throws at module load, `Test Files 1 failed`, exit 1 |
| **G** | `advisoryReelsBinding` → `return []` | `scene.ts` | 2 — the warn row and the *is not enforcement* row |
| **H** | `serializeEffectsScene` materialises a default `reels` when absent | `scene.ts` | 1 — *never invents the key on a scene that does not carry it* |

*(The labels are the markers actually planted in the source — `POISON A`…`POISON H` — with no `F`; the letters were assigned as the plants were written and are reported as they were run rather than renumbered tidy.)*

**Poison B is the load-bearing one and deserves its own sentence.** Under a stringify equality, the row asserted on the *committed* `reels.rates` node stayed **green** — the committed items are integers, where the two equalities agree. Only the deliberate object-key-order row went red. That is precisely the "implemented as its near neighbour" failure, and it is why that second row exists rather than being folded into the first.

**Poison E likewise:** widening the bound left the *bounds-edge* row green, correctly — that row asks "the schema enforces its own bound", which is still true of a wrong bound. The ×256 row is the one carrying the semantic claim, and it is the one that fell.

### The alternative green-paths I ruled out

- **"A round-trip over a document with no `reels` passes trivially."** Named in the dispatch, and the trap is real. Every round-trip row asserts the key is present **in the text going in and in the text coming out** — never on a parsed object, where an absent key and a dropped key are indistinguishable. Poison H confirms the "never invents" row is not the same assertion wearing a different hat.
- **"A permutation test passes because both sides sorted."** Ruled out by the second order row, which compares two permutations' *rendered bytes* rather than a parse result.
- **"The `uniqueItems` matcher matches some other error."** The refusal message names both indices and the value, and the poisoned runs show the exact rows falling; the duplicate subject differs from the accepted one **only in its last element**, so length and range still hold and no other keyword can be producing the refusal.
- **"The constants row passes because two people typed 5."** No literal appears: `EFFECTS_REEL_BAND_COUNT` is read from `minItems`, cross-checked against `maxItems`, and asserted by *behaviour* — one short is refused, one long is refused, one at the count is accepted.
- **"The ×256 row passes because nothing was multiplied."** Anti-vacuous assertions inside it: the span is a real span, it contains 3 (the contract's own worked example), `EFFECTS_DRIFT_UNITS_PER_PIXEL > 1`, and `3 × units === 768` is spelled out.

---

## 7. Open, and why

1. **No authoring panel.** Out of scope by instruction; this is the follow-on parcel. Everything it needs is in `EffectsReels`'s docblock, `EFFECTS_REEL_BAND_COUNT` / `EFFECTS_REEL_RATE_BOUNDS`, and §4 above. The two things it must not get wrong: apply no ×256, and say DEBUG-only on screen.
2. **The `0 × 256` hole** (§4.1). Not closable by this parcel — the schema accepts 0 and should.
3. **Nothing authored here can reach a ROM.** aeon's generator arm for `reels` does not exist yet; the schema's own description describes it in the future tense ("aeon's implementing parcel adds one"). Until it lands, a scene carrying `reels` is a document nothing consumes.
4. **No runtime confirmation, and none is claimed.** Two reasons: the workspace rule against calling an emulator from a background agent, and the fact that the effect is DEBUG-tier — a release build would show nothing whether or not the codec is right. **TAGGED for the foreground lane** if anyone wants to see five strips move: it needs a DEBUG build, and aeon's `tools/reels_witness.py` is the only thing that sets `OJZ_Reel_Active`.
5. **`advisoryReelsBinding` has no caller.** Same posture as `advisoryLayerDeformConflicts` beside it — a pure function for a future surface, asserted to be outside the read and write paths.
