# EW-CHANNELS-WRITER — the item-4 authoring key lands in Aurora's codec

**Branch** `feat/ew-channels-writer` · **2026-09-03** · parcel EW-CHANNELS-WRITER, ROADMAP row 117.

Step **3 of a four-step cross-repo chain**. aeon named the key shape (step 1,
`docs/superpowers/specs/2026-09-03-anchor-authoring-key-shape.md` at aeon `81b2a719`); the hub
filed the CR (step 2, empyrean `d36d704`, `docs/AURORA_EFFECTS_SCHEMA.md` §7.3); **this is step 3,
Aurora vendoring the schema and writing the key**; aeon's `tools/effects_gen.py` reads it in step 4,
which has not run and is why a lag re-opened here (below).

---

## 1. What the contract added, read at a committed revision

Read through git objects, never a sibling working tree:

| What | Where | Verified |
|---|---|---|
| Schema | empyrean `d36d704:contract/schema/aurora-effects-preset.schema.json` | blob `c1147071773714124c7da4e13fdb31e431899af0`, 22001 bytes, re-hashed with `git hash-object` on the vendored copy |
| Currency | empyrean `origin/main` = `4dcd520e` after `git fetch origin` | same blob `c1147071` at tip; `d36d704` is an ancestor by `git merge-base --is-ancestor` |
| Normative prose | empyrean `d36d704:docs/AURORA_EFFECTS_SCHEMA.md` §7.3 | read in full |
| aeon's shape artifact | aeon `81b2a719:docs/superpowers/specs/2026-09-03-anchor-authoring-key-shape.md` §2 | read in full, incl. §2.4's ladders |
| Contract vectors | empyrean `d36d704:contract/schema/tests/effects-preset-vectors.json` | **unchanged** — blob `cc3f0f96` at both 12aecd5 and d36d704; `git show --stat d36d704` touched exactly two files |

**`patch_world_ys`** — the anchor SEED per patch channel, positional. Integer-or-null,
`0..65535`, `not: {const: 32767}`, `maxItems: 4`.
**`patch_motion`** — the anchor MOTION, same index space. `$ref` to the new
`$defs.patch_motion_entry` (`{sweep}` and nothing else) → `$defs.anchor_sweep`
(`amp_shift` 2..8, `period_shift` 0..8, `phase` 0..255 optional).

---

## 2. What changed here

**`src/core/formats/effects/aurora-effects-preset.schema.json`** — re-vendored by extraction, never
retyped, never hand-edited to match a diff. Sidecar `…schema.provenance.json` updated on every field
the re-vendor ritual names (`empyrean.revision`, `revision_subject`, `blob`, `resolved_by`,
`revision_published`, `vendored.bytes`, `vendored.git_blob`, `pin_history_current_last`).

**`test/fixtures/effects/effects-preset-vectors.provenance.json`** — revision advanced to `d36d704`
with the blob and the vendored bytes **untouched**, so the two sidecars keep naming ONE revision and
the `same_revision` invariant keeps meaning something. Recorded there in as many words that the
bytes did not move and nothing was re-extracted.

**`src/core/formats/effects/preset.ts`** — `EffectsPresetAnchorSweep`,
`EffectsPresetPatchMotion`, and the two optional root keys. Everything else DERIVED from the
vendored schema:

- `EFFECTS_PRESET_MAX_PATCH` = 4, `EFFECTS_PRESET_WORLD_Y_RANGE` = `{0, 65535}`,
  `EFFECTS_PRESET_PATCH_ANCHOR_NONE` = 32767 (read off the schema's own `not`),
  `ANCHOR_PHASE_RANGE` = `{0, 255}`.
- `ANCHOR_AMP_RUNGS` (7) and `ANCHOR_PERIOD_RUNGS` (9), computed from the schema's
  `minimum`/`maximum` plus three engine constants **parsed out of the schema's prose** (256 px base,
  256 tick base, 60 Hz) with a loud throw at module load if a sentence moves — the posture
  `EFFECTS_PRESET_RESERVED_KEYS` already takes, one level down. Measured output reproduces aeon
  §2.4's table exactly: 64/32/16/8/4/2/1 px peak, 256…65536 ticks, 4.27 s…1092.27 s.
- `EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL` = **1**, read from the schema's own
  "NEITHER SIDE CONVERTS, 1:1" sentence rather than typed.
- `anchorAmpRungForPeakPx` / `anchorPeriodRungForTicks` return **null** off-ladder — never the
  neighbour, because rounding a shift is the silent doubling §7.3 names. `anchorSnapPeakPx` /
  `anchorSnapCycleSeconds` snap in the **log domain**, where the ladder is uniform, and hand back the
  rung so a caller can show what the value became. Carried in the codec so EW-TIMELINE-CLOCK's panel
  does not re-derive them.

**`src/core/formats/effects/preset-lag.ts`** — premise re-filled (§4).

No edit to `json-schema-subset.ts` was forced, and that is **measured, not assumed** — the keyword
census, `assertSchemaSupported`'s whole-schema walk and the contract's vendored vectors all run green
on the new bytes. Every construct the amendment uses was already implemented: `$ref` inside a `oneOf`
branch (the `variants` null-slot shape), `not: {const: N}` (the scene schema's `drift.rate` hole),
`minimum`/`maximum`, `maxItems`, and `unevaluatedProperties: false` beside plain
`properties`/`required`. The one shape that LOOKS like the 6664b61 false positive and is not:
`$defs.patch_motion_entry` closes with **no** in-place applicator beside it, so the
additionalProperties equivalence holds without the `contributesPropertyAnnotations` prover being
consulted at all — asserted on the committed node.

---

## 3. Every place an `EffectsPreset` is constructed, cloned or serialised

Enumerated by the TYPE and by every constructor and copier, not by the field name (the 13-vs-8
lesson). The whole population:

| Site | Shape | Safe? |
|---|---|---|
| `parseEffectsPreset` | returns what `JSON.parse` produced | yes, structurally |
| `serializeEffectsPreset` | `canonicalizeBySchema` walks the SCHEMA, refuses undeclared keys | yes, structurally |
| `newPreset` (`renderer/providers/effects-preset.ts:561`) | the one literal constructor; authors neither key | yes — asserted |
| `clonePreset` (`:522`) | `structuredClone`, whole-object | yes — asserted, both sides of the undo record |
| `placeEffectsPreset` (`core/editing/history.ts:109`) | whole-object swap | yes |
| `agent-handler.ts:1054` | `JSON.stringify(req.preset)` where `preset: unknown` (`shared/agent-protocol.ts:132`) | yes — no key enumeration |
| `buildAeonSavePlan` (`core/project/aeon/save.ts:376`) | calls `serializeEffectsPreset` | yes |

**There is no hand-enumerating copier of an `EffectsPreset` anywhere in the tree.** That is the
finding, and the two clone/construct rows exist so a later one has something to break.

---

## 4. A LAG RE-OPENED, and the old measurement had a hole

aeon's generator does not know these names at all. Measured at aeon `origin/master` `81b2a719`
through git objects, re-read at `63fa3f8c` after aeon's master moved mid-session (three unrelated
DMA-reserve commits; the block is unchanged): `PRESET_KEYS` (`effects_gen.py:280`) is
`{schema, id, bands, cycles, variants}` and the page's machine-checked block lists the same five.
So `_check_keys` (`:444-453`) takes the **generic unknown-key path** and `_refuse` **raises** — a
preset carrying either key **fails aeon's build outright** rather than lowering without it. That is
sharper than the 12aecd5 lag, where the two names sat in `preset-refused` and were declined BY NAME,
and the disclosure sentence is rewritten to say it.

`PRESET_KEYS_AWAITING_AEON` is re-filled to `['patch_motion','patch_world_ys']`, dated 2026-09-03,
and the panel's sentence comes back on screen by construction.

**AND THE DRIFT ROW HAD A HOLE THIS RE-VENDOR EXPOSED.** The lag was computed as
`keys['preset-refused'] minus the reserved names` — which sees only the refused-BY-NAME flavour and
is **blind to a key aeon's page does not mention at all**. That is precisely the flavour `d36d704`
produced, and that clause stayed **GREEN** through it; only the one-sided check underneath it went
red. The lag is now `schemaOptional.filter(k => !keys.preset.includes(k))` — every root key the
schema declares that aeon's page does not ACCEPT — which covers both flavours and is what the
premise constant always meant. `preset-lag-disclosure.test.ts` pins the wider form on the drift
test's source so the hole cannot be reintroduced. The vocabulary row was likewise split into two
one-sided claims (aeon knows no name the schema does not; every name the schema knows that aeon does
not is a DECLARED lag), the same repair the `preset` row got on 2026-09-02.

---

## 5. Verification

**Full suite: `6498 passed / 0 failed / 8 skipped` (471 files), `tsc --noEmit` clean, all seven
`check:*` scripts green** (`harness-guards` 188/188, `ledger-timestamps`, `object-stringify`,
`peer-path-literals` 1220 files / 4 rules, `pseudo-skip` 5904 bodies, `python-resolver` 7 rows,
`test-collection` 471/471). All 8 skips are pre-existing and each names its reason; none is mine.

**+21 rows**, counted per file on both sides through git objects:
`effects-preset.test.ts` 41→58, `effects-preset-schema-drift.test.ts` 14→16,
`effects-preset-channels.test.ts` 30→32; `preset-lag-disclosure.test.ts` 12→12 (re-aimed, not grown).

**The round trip, byte-for-byte.** A document carrying both keys in all three states — index 0
authored, index 1 `null`, indices 2–3 unreached — comes back byte-identical through
`serialize(parse(doc))`, and the written arrays are asserted to still be length 2 while
`EFFECTS_PRESET_MAX_PATCH` is 4, because **a short array is legal and this writer must not pad**.

**The refusal that existed today is gone, and the control proves it.** The pre-`d36d704` refusal is
reproduced from the CURRENT bytes — the vendored schema with the two properties deleted, one
difference, the same evaluator, the same document — yielding
`unknown property "patch_world_ys" (the schema is closed)`, while the same document against the real
schema yields `[]`. Without that control every acceptance row could be green on a codec that never
refused anything.

**Malformed values are refused, naming what was wrong**: the sentinel as an integer
(`forbids the constant 32767`), both ends of the u16 range, a fifth channel on either key
(`has 5 items, maximum 4`), an `approach` arm (`unknown property "approach"` +
`missing required property "sweep"` at `/patch_motion/0`), zero and two arms, an unknown sweep field,
and each shift off the end of its ladder. Every legal counterpart is asserted accepted in the same
row, so none is green on a schema that refuses everything.

### 5.1 Seven poisons, red-first, each restored from a COMMITTED baseline

Every one: mutation applied and quoted back from `git diff` before the run; a red run; then
`git checkout --` on a **clean** tree (`git status --porcelain` empty before and after).

| # | Mutation | Result |
|---|---|---|
| P1 | `serializeEffectsPreset` pads short patch arrays to `MAX_PATCH` | **RED 3** — round-trip, `phase`-optional, unit |
| P2 | the writer routes the seed through a ×256 | **RED 3** — seed round-trip, three-state round-trip, **the unit row** |
| P3 | `parseEffectsPreset` coerces `null` → `0` | **RED 3** — seed round-trip, three-state, clone |
| P4 | the amplitude ladder computed one rung off | **RED 2** — ladder table, converters |
| P5 | `EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL` derived as 256 | **RED 1** — the unit row |
| P6 | `PRESET_KEYS_AWAITING_AEON` emptied while the lag is open | **RED 7** across both files — the drift vocabulary row, the drift lag row, and five disclosure rows |
| P7 | the drift lag measurement narrowed back to `preset-refused` | **RED 2** — the drift lag row and the disclosure row that pins the wide form |

**One blind spot found and left, stated rather than hidden:** under P1 the provider-side
`effects-preset-channels.test.ts` rows stayed GREEN, because they compare object fields and compare
two serialisations that were BOTH padded. The codec rows catch padding; the provider rows do not, and
should not be read as if they did.

---

## 6. Open, and tagged for the controller

- **NO ROM, NO EMULATOR, NO aeon BUILD.** Nothing in this parcel has seen a ROM obey these keys and
  nothing here claims one has. Background agents must not drive the emulator; this is tagged for the
  controller's foreground follow-up, not attempted.
- **The authoring UI is not this parcel.** The sliders and the timeline control are
  `EW-TIMELINE-CLOCK`. The ladders and converters are carried here so that panel does not re-derive
  them; nothing here authors a value.
- **Two warnings the hub flagged, RECOMMENDED and not built** (both are aeon's or a later row's):
  (a) aeon's `tools/test_anchor_sweep_band.py` does not see generated sweeps yet, so a sweep whose
  travel leaves `patchable(lo, hi)` has no comptime scope that holds both numbers — §7.3 calls
  extending it a hard prerequisite of step 4; (b) in a game without `CAP_ANCHOR_MOTION` (`demo`) an
  authored sweep is a **silent no-op**, and §7.3 says step 4 owes the generator refusal. If a
  sentence about either belongs anywhere in Aurora it is in an export warning, once those facts have
  an owner who measures them — not in a hint this repo would then have to keep true.
- **The schema's root `description` was NOT updated** by `d36d704` to mention the two new keys —
  its "Reserved and refused by name (still wave-2 open): `fires`." sentence is unchanged, which is
  why `EFFECTS_PRESET_RESERVED_KEYS` reads the same and correctly does not reserve them. Worth the
  hub knowing: the root description is the only prose in that file that now omits a declared key.
