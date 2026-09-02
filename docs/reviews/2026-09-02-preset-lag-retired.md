# EFFECTS-W1 — retiring the preset lag disclosure (the consumer half of aeon's DoD item 5)

**Date** 2026-09-02 · **ROADMAP** §5.1 row 97 (RETIREMENT paragraph) · **Branch**
`fix/retire-preset-lag-disclosure` off master `368c3f11` · **Peer read** aeon
`origin/master` `a5e2b618ffa2dcaae8d45aaac7a799bb43b12405`, `docs/EDITOR_RASTER_PRESETS.md`
blob `518492e37f9cff25801f9aad20fc85f8acd6f35f`, through git objects — never a working tree.

---

## 1. The premise, confirmed before it was acted on

The band-preset panel carried a sentence telling the author *"Not consumed by the engine yet"*
above its `cycles` and `variants` controls. That is a claim about what aeon's generator will do
with their work, so retiring it on a doc heading would be worse than leaving it. What was
actually read, at the committed revisions named above:

| Evidence | At aeon `a5e2b618` |
|---|---|
| `docs/EDITOR_RASTER_PRESETS.md` KEYS block | `preset: bands, cycles, id, schema, variants`; `preset-refused: fires` — the two names have moved from refused to accepted, and three new rows appeared: `cycle-channel`, `cycle-channel-optional`, `variant` |
| The page's own prose | "`variants` and `cycles` were here until 2026-09-02 and are now built (DoD item 5)" |
| `tools/effects_gen.py` `PRESET_KEYS` | `frozenset({"schema", "id", "bands", "cycles", "variants"})` |
| Shape checking | `_check_cycles` (three states, `[]` refused, channel-count bound) and `_check_variants` (positional, slot bound, no key-level `null`) both run from `load_preset` |
| Lowering | `render_cycle_channel` → `cycle_channel(line:, first:, count:, period:, dir:)`, `render_variant` → `variant(...)`, wired through `render_preset_cycle` / `render_preset_variants` |
| Committed generated output | `games/sonic4/data/generated/ojz/act1/effects_scenes.emp` carries `pub data EditorVariant_OJZ_Act1_ojz_sec3_shimmer_0: pal_variant = variant(shift_r: 1, shift_g: 1)` |

**The premise holds.** These keys are read, validated and lowered through the real constructors,
not merely mentioned. The measured lag is `[]`.

> ⚠ Note on revision drift: aeon's `origin/master` moved three times during this parcel
> (`56a9ca83` → `4dbbd947` → `a5e2b618`). Every reading above is at `a5e2b618`; the KEYS block
> was identical at all three. The merge that landed item 5 is `445a5856`.

### MERGED, NOT CERTIFIED — and the condition that revives the sentence

Item 5 is **merged on aeon's master**. It is **not** a certified chain: sigil `dd5eaad2`
(reachable on sigil `origin/master`) records *"chain 198 recorded RED — 3 failures, no ROM byte
moved"*, and aeon supersedes it with chain 199. Nothing in Aurora has seen a ROM obey these keys
and nothing in this parcel claims one has; what retired is a claim about aeon's **generator**,
which is a fact Aurora can and does measure.

**RE-OPEN CONDITION — stated so the retirement cannot become permanent by accident:**
**if any of chain 199's seven goldens differs from chain 198's, the ROM did not behave as the
sentence's absence now implies, and the sentence comes back** — re-fill
`PRESET_KEYS_AWAITING_AEON` and re-date it. That check is aeon's and sigil's to run; Aurora
cannot measure it, and no row in this repo pretends to. The same condition is written into
`src/core/formats/effects/preset-lag.ts`, which is the file a future reader opens.

---

## 2. Two red rows, ONE event, TWO causes

The brief asked not to assume one cause explained two reds. It did not.

**Row `the contract-leads-consumer lag … is exactly PRESET_KEYS_AWAITING_AEON`** — discharged by
the event, exactly as designed. The measured lag moved from `['cycles','variants']` to `[]`.

**Row `agrees with docs/EDITOR_RASTER_PRESETS.md … on every shape the schema and the page both
spell`** — a **separate latent defect the event exposed**, not the same fact twice. It asserted

```ts
expect(keys.preset, SPLIT(tip)).toEqual(schemaRequired);
```

but aeon's `preset` row is its **accepted** root set (`PRESET_KEYS`), while `schemaRequired` is
the schema's **required** set. Those are different things that were **equal only by coincidence**
while the two optional keys were refused. The page did nothing wrong; the assertion was wrong in
general and had been since the 12aecd5 re-vendor. It is now the pair of one-sided claims that
actually hold across a lag:

- every key the schema **requires** must be one aeon accepts (else a document the schema demands
  would be refused);
- nothing aeon accepts may be a name the schema does not **declare** (a rename or a typo).

The gap between them **is** the lag, and only the pin row is entitled to an opinion about it.

This is **not** a split, and nothing needs reporting to aeon: the two sides know the same
vocabulary, aeon refuses everything the schema reserves, and every optional key is accepted.

---

## 3. What now catches a regression — the question that gates the deletion

Deleting the red row is the most dangerous edit in this parcel, so this was measured rather than
argued. **Under P1 below — aeon reverting item 5 — every other row in the file stays GREEN.**
The vocabulary row compares the *union* of `preset` + `preset-ignored` + `preset-refused`, and a
revert merely moves two names between those rows; the shape row's new one-sided claims tolerate
it by design. So a straight deletion would have produced exactly the quieter suite the brief
warns about: Aurora shipping cycle and variant controls with no sentence above them and no red
row anywhere.

**So the row was not deleted — its VALUE changed.** From *"the lag is exactly these two names"*
to *"the lag is EMPTY"*. It still reads aeon's `preset-refused` row at a committed revision every
run, still carries no copy of any key name, and now goes red in **both** directions:

- aeon **un-builds** a key → a regression; the message says to report it to aeon *before*
  re-filling anything;
- the contract **declares** a key aeon has not built → a new lag, the legitimate 12aecd5 state;
  the message says to re-fill the premise list in `preset-lag.ts`, which puts the sentence back
  on screen by construction.

Three further things now watch this, and each was proven by making it red:

1. `preset-lag-disclosure.test.ts` requires the drift test to **still compute the lag from
   aeon's refusal list and assert it empty** — so the retirement cannot itself rot into an
   unmeasured claim (P3).
2. The shape row now checks the `cycle-channel`, `cycle-channel-optional` and `variant` field
   lists against the schema's own `$defs` — the shapes item 5 added, and field names an Aurora
   panel writes into a document. Nothing checked them before (P2).
3. The harness's `[2f]` reads the premise out of `preset-lag.ts` and asks whichever question it
   makes true — sentence painted and first while the premise is open, no such element at all
   while it is empty.

---

## 4. The disclosure test was RE-AIMED, not inverted

Three rows asserting `null` would have passed a leaf hard-wired to `return null`, which is the
"suite that asserts nothing about a retired feature" failure mode. Instead:

- **the retirement is asserted** (`PRESET_KEYS_AWAITING_AEON` is `[]`; both the derivation and
  the leaf are silent; and the same derivation with a non-empty list still speaks, so it is the
  premise that silenced them);
- **the wording stays fully asserted**, driven by an explicit replay of the retired premise's own
  value — so a re-opened lag gets the same sentence it would have got, with the same three
  claims, date and re-measure pointer;
- **the poison is flipped to the load-bearing direction**: stub the premise back NON-empty and
  the leaf must render the whole sentence, equal to `presetLagDisclosure(...)` rather than merely
  containing the right words;
- **the panel rows are untouched** — the leaf is still mounted first, unconditional and propless,
  which is what makes re-arming the disclosure a one-line edit in one file.

The two rows that encoded the old state as an invariant (`PRESET_KEYS_AWAITING_AEON.length > 0`,
and the empty-branch that only checked for a dangling reference) now assert the new truth and
carry the instructions for re-aiming the file if a lag re-opens.

---

## 5. Proofs — five poisons, red then restored

Every poison was applied to a **committed** baseline (`fd04170c`), shown on disk with
`git diff`, run with `node_modules/.vite` deleted first (verified absent, then verified
repopulated by the run — Vitest caches transforms on mtime+size), and restored with
`git checkout --`.

| # | Mutation (shown applied on disk) | Expected red | Result |
|---|---|---|---|
| P1 | aeon's page text rewritten as a **revert of item 5**: `preset` loses the two keys, `preset-refused` regains them | the pin row only | **RED** — `A LAG HAS RE-OPENED … expected ['cycles','variants'] to deeply equal []`. **The vocabulary row and the shape row both stayed GREEN**, which is the entire argument for keeping a pin row. |
| P2 | the page's `variant:` row renames `shift_r` → `shift_red` | the shape row's new `$defs` assertion | **RED** — `A SPLIT BETWEEN aeon docs/EDITOR_RASTER_PRESETS.md …`. No pre-existing row caught this. |
| P3a | the pin row's measured line rewritten `.sort()` → `.slice().sort()` (behaviour-identical, shape changed) | the "STILL MEASURES" row | **RED** |
| P3b | **the pin row deleted outright** (36 lines) — the literal "follow the old instruction and delete it" scenario | the "STILL MEASURES" row | **RED** — *"Nothing now watches whether aeon still lowers cycles and variants…"* |
| P4 | `PRESET_KEYS_AWAITING_AEON` re-filled to `['cycles','variants']` | the retirement rows | **RED** ×4 (premise-empty, both-silent, unstubbed-silent, no-coupling) |
| P5 | `PresetLagDisclosure` hard-wired `return null` | the inverted poison row | **RED** — *"the gate is stuck shut, and a re-opened lag would reach an author with no disclosure at all"*. Confirms the assert-null rows alone would have passed it. |

**Cross-repo behaviour with the peer UNREACHABLE.** With `AEON_DIR` pointed at an empty
directory (the resolver refuses an *absent* path outright and says so, which is itself the right
behaviour), all three aeon rows **skip loudly** and `skip-report` prints each reason:
`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO) — CANNOT MEASURE
whether aeon's worked example still agrees with the schema`. Never silent, never green. The
cross-repo failure messages keep their `NOT AN AURORA REGRESSION` / `THE SCHEMA WINS — but report
this` prefixes.

**Runner named:** `npx vitest run` (and the full `npm test` gauntlet: `check-test-collection`,
`check-pseudo-skip`, `check-peer-path-literals`, `check-object-stringify`,
`check-ledger-timestamps`, `check-python-resolver`, `check-harness-guards`, `typecheck`).

**Suite:** **6279 passed / 2 failed / 8 skipped** before → **6283 passed / 0 failed / 8 skipped**
after. `tsc --noEmit` clean; `check-harness-guards` 170 clean / 170 classified / 0 failures.

---

## 6. Where the now-false claim survived, and what was done about it

`git grep` for the sentence's distinctive words, for `awaiting`, and for the constant name — not
just the constant:

| Location | Disposition |
|---|---|
| `src/core/formats/effects/preset-lag.ts` docblock | rewritten: the retirement, the evidence, MERGED-not-certified, the re-open condition |
| `src/renderer/components/effects/BandPresetPanel.tsx` (JSX comment above the section) | said the sentence was "already on screen" — rewritten to say it is silent and why the leaf stays mounted |
| `src/renderer/providers/__tests__/effects-preset-channels.test.ts` header | said "the keys are not consumed by aeon's generator yet" as a live reason — rewritten; the file's real reason (no engine here) stands on its own |
| `scratchpad/variant-cycle-harness.mjs` header + `[2f]` | asserted the sentence was painted and first — inverted, and made premise-driven so it re-arms |
| `docs/ROADMAP.md` row 97 | the delivery paragraph quoted the sentence in the present tense — marked as the state at that landing, with a RETIREMENT paragraph appended |
| `docs/reviews/2026-09-02-variant-cycle-controls.md` §3 | quotes the sentence verbatim. **Not rewritten** — it is a dated record of a past landing — but given a SUPERSEDED banner pointing here, so it cannot be read as current |
| `docs/lane-log.jsonl` | append-only ledger of past entries; left alone by design |

---

## 7. TAGGED for the controller — not claimed here

- **`npm run harness:variant-cycle` was NOT re-run.** Row `[2f]` was inverted to require the
  sentence GONE and the header prose updated, but the harness needs Electron + a display + an
  aeon copy, which this lane does not have. Its premise parse was verified by hand in **both**
  directions (empty → `PREMISE_OPEN=false`, re-filled → `PREMISE_OPEN=true`) and
  `check:harness-guards` is green, but **the pixel claim that no element on the open section
  still carries the lead sentence is unverified.** It wants one foreground run.
- **No ROM, no emulator, no aeon build**, per the standing invariant. Chain 199's goldens — the
  re-open condition in §1 — are aeon's and sigil's to run.
