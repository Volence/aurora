# EW-BOUNDARY-CODEC — the fourth arm, and the list that was answering two questions

**Parcel** EW-BOUNDARY-CODEC (project EFFECTS-W1) · **branch** `feat/ew-boundary-codec`
· **cut from** `24d5911d` · **tip** `668d3ae8` · **2026-09-04**

Four commits: `83f15b2b` (re-vendor), `46bfbb58` (codec + provider), `3394e8f6`
(tests, golden, the lag re-arm), `668d3ae8` (the base_swap seed row).

**Scope note the brief set and this parcel kept: NO AUTHORING UI FOR `boundary`.**
The Raster program row does not offer it, there is no seed for it and no card.
What this parcel did build on the panel side is *refusals* — the existing
controls were silently wrong on a document that can now exist, and that is a
defect, not a feature.

---

## 1. The re-vendor, verified rather than taken on report

The dispatch quoted three hashes and asked to be contradicted. All three were
re-derived here and all three agreed:

| | pinned before | pinned now |
|---|---|---|
| empyrean revision | `dfd11bb` | **`c4a1da23fd17f2e343b152e275283193ef0d46ab`** |
| schema blob | `13473a43` | **`0295b21b9f60e48685aff245695eaf7dc445ad59`** (38 092 → 49 508 bytes) |
| vectors blob | `af5b5cee` | **`6dff76769e39186f0b4a332d990b297bd7a83794`** (13 327 → 19 525 bytes) |

`git merge-base --is-ancestor c4a1da2 origin/main` exits 0; both blobs resolve to
the same ids at the pinned revision and at tip; `git log --follow` names `c4a1da2`
as the last touching commit of **both** paths, so nothing sits between the pin and
the tip. Bytes were extracted with `git show <rev>:<path>` straight into the tree
and re-hashed on disk before anything believed them. The peer repo was never read
by filesystem path; `EMPYREAN_DIR` came from running
`test/support/sibling-root.mjs` `requireSiblingPath('empyrean')` in this worktree.

### What actually moved — measured, not read off the CR message

`scratchpad/schema-revendor-proof.mjs` (recovered from `43093fc6`; not re-committed,
it is a scratch instrument) run on both files. Both its readings agree and both say
**STRUCTURE MOVED** — this is a migration, not a re-vendor.

* **schema**: 58 added, 0 removed, **3 changed in place**. 209 → 267 leaves;
  descriptions-stripped 3 935 → 4 859 chars, the first time that count has moved
  since `5bd76ba`. Additions live only in `oneOf/3`, `properties/boundary`,
  `$defs/boundary` (39) and `$defs/tint_region` (16).
* **vectors**: 193 added, 0 removed, **2 changed in place** — `/cases/17/name`
  and `/cases/17/why`. **Case 17's document did not move**: no leaf under
  `/cases/17/doc` changed. 24 → 36 cases, 5 pass / 19 fail → **7 pass / 29 fail**,
  counted from the bytes here.

### ⚠ Where the dispatch's summary and the bytes disagree — they don't, with one refinement

Every claim in the brief's step B checked out: fourth arm, `properties.boundary`,
the closed `$defs.boundary` with those six required members and `offscreen_ship`
optional, `$defs.tint_region` = `pal_region` minus `addr`, one `on` arm with no
cram and no vsplit reserved, title extended, no retype, twelve vectors 2 pass /
10 fail.

One refinement worth stating because a later reader will count differently: the
brief said *"three leaves changed … two description strings changed"*. Both are
true and they are **the same three leaves** — `/title` plus the two `base_swap`
descriptions. And the second half of that sentence, *"a re-pin of vector case 17's
`base_swap` line description"*, understates what it is: the two changed schema
descriptions record that **aeon moved the shipped section-6 fire line from 160
(`850d4c60`) to 3 (`8bf6df74`)**, and one of them is *parsed into the seed a fresh
`base_swap` document gets*. See §5.

---

## 2. The finding: one derived list was answering two questions

`boundary` needed **no evaluator change at all**. All 36 contract vectors pass
through `parseEffectsPreset` / `serializeEffectsPreset` with
`json-schema-subset.ts` untouched — measured, not assumed: the drift gate's
keyword census and its whole-schema `assertSchemaSupported` walk were re-run
against the new bytes and no keyword, type or value shape is new.

What did need changing is a constant that had been right by coincidence for two
re-vendors. `EFFECTS_PRESET_RASTER_CHANNELS` was derived from the schema's
top-level `oneOf` and **named for raster channels**. Through `9233883` (`ramp`)
and `5bd76ba` (`base_swap`) those were the same set, so nothing distinguished:

* **"may these two keys coexist?"** — the `oneOf`'s question. Four arms.
* **"does this key write `ep_raster`?"** — three. `boundary` lowers into
  `EffectsPreset.ep_patched`, the *sibling* field, and `preset()` refuses a record
  carrying both because whichever installs last wins **destructively**
  (aeon `preset.emp:153-154`).

Split into `EFFECTS_PRESET_PROGRAM_ARMS` (the `oneOf`, read back) and
`EFFECTS_PRESET_RASTER_CHANNELS` (the complement of `EFFECTS_PRESET_PATCHED_ARMS`
within it). The patched set is **derived from the schema's own sentence** — the arm
description that reads `lowers into EffectsPreset.ep_patched` — never a list Aurora
maintains beside the contract, with a module-load interlock asserting the two lists
partition the arms and that the raster side is non-empty.

**The failure direction is deliberate and is proven, not argued.** A regex that
matches nothing returns an empty list, which is indistinguishable from a contract
with no patched arms. A poison row re-imports the codec against a schema with that
sentence removed: `boundary` falls **into** the raster channels, and the renderer's
per-channel registries then **refuse to load**. Loud, not a patched program quietly
offered a raster editor. That is the alternative green-path this parcel eliminated.

---

## 3. Three provider defects the fourth arm created, all the same shape

`presetRasterChannel` returns null on a boundary document — correctly — and every
caller that read null as *"this preset carries nothing, write what you like"* was
wrong the moment the key was vendored:

1. **`bandControlsRefusal` woke the band controls.** A click would have grown a
   `bands` key onto a preset that already carries a program: the two-arm document
   the `oneOf` refuses, authored on every click, with no sentence anywhere.
2. **`setRasterChannelCommand`'s delete loop ran over the RASTER list**, so
   switching a boundary document to bands would have *left the boundary in place* —
   the same defect the `if`/`else` it replaced had, one list wider.
3. **`presetListEntries` / `rasterEditorGap` / `rasterChannelSwapAdvisory`** would
   have rendered a whole patched program as `0 bands`, offered no
   no-editor-here sentence, and promised to discard `0 raster bands`.

All four now ask `presetProgramArm`. `RASTER_CHANNEL_NOUNS` became
`PROGRAM_ARM_NOUNS`, keyed by **arm**, with its module-load guard widened to match.
`RASTER_CHANNEL_LABELS` and `RASTER_CHANNEL_OPTIONS` still read the **raster** list
alone, because offering `boundary` in the Raster row would be offering to *seed*
one — the follow-on parcel.

---

## 4. The rules the CR settled, and how they are held

* **No null spelling.** Absent means none. Asserted through the codec (vector 27)
  *and* on the property node's shape — a bare `$ref`, no `type`, no `oneOf` over a
  null branch the way `cycles` has.
* **A boundary MOVES only when the same index is seeded AND swept.** A boundary
  alone is legal, builds, and sits still — **nothing anywhere refuses it**, which is
  exactly why a sentence must. `boundaryAdvisories`' `no-motion` rule names whichever
  half is missing, and names the index: the same two keys authored at index 1 while
  the boundary follows channel 0 leave it just as still, and a check that only asked
  *"does this document have `patch_motion`?"* would go quiet there.
* **`lo <= hi` and `line` inside `[lo, hi]` are the generator's.** The schema
  **accepts** both violations today (asserted, so the advisories are not theatre) and
  so does the codec, on both paths. `BoundaryAdvisory` carries `advisory: true` and
  an `enforced_by` field **rather than a docblock**, so a surface that paints `text`
  cannot drop the attribution; every sentence says *"EDITOR-SIDE WARNING, not the
  refusal"* and *"Saving is not blocked"* in its own words, and a swept row asserts
  no advisory ever names Aurora as the enforcer.
* **The sweep-fits rule is reused, not re-derived.** `anchorBandFit` was split into
  `anchorFitAgainstBand` (the rule) plus a lookup; `effectsChannelBandFromDocument`
  builds a band from the document's own `lo`/`hi` with `lines` computed the one way
  aeon's `how_to_use` defines it. `boundary.ts` supplies band and travel and asks for
  the verdict — no constant, formula or comparison restated. **The one-directional
  rule came with it**: there is still no `fits` arm, so "does not exceed the band" is
  *silence* and never a clearance.

---

## 5. The thing the re-vendor broke outright, and the repair that would have looked right

`BASE_SWAP_SEED_LINE` parsed *"the shipped section-6 preset fires on 160"* and
**threw at module load, taking 34 test files with it**. The sentence now names two
lines. The obvious repair — relax `/fires on/` to `/fired on/` — matches, is green,
and seeds **160**, the value the sentence exists to say is superseded.

⚠ **Every existing row in the base-swap control file stays green through that.**
The seed rows check *legality*: 160 is inside the line range, refused by nothing,
and a stale binding is perfectly legal. The wrong repair was invisible to the whole
file. Two things now stop it:

* the derivation reads the `since` clause, **parses the superseded one too**, and
  refuses at module load if they are ever equal — with one number present, a matcher
  aimed at either half is indistinguishable from a matcher aimed at the other;
* a new row checks `newBaseSwap().line` against a **second, independent document** —
  aeon's own section-6 preset, byte-for-byte in the golden fixture. Not a second
  reading of the same sentence, which would agree with a wrong derivation for the
  same reason. Two repos, one number.

---

## 6. Round-trip stability, measured before/after

*"Nothing shipped carries the key, so nothing is refused today"* is a claim about
**refusal** and says nothing about **bytes**. `serializeEffectsPreset` canonicalises
the whole document against the whole schema, and this amendment added 58 leaves.

`test/fixtures/effects/preset-canonical-golden.json` holds Aurora's canonical
output for all six presets aeon ships, produced under the **previous** schema blob
`13473a43`. Generated by driving `canonicalizeBySchema` + `canonicalJsonPretty` —
the two modules this parcel did **not** touch — because `preset.ts` at the new
revision cannot load the old schema at all (it reads `$defs.boundary`), so a naive
before/after would have compared the new codec to itself. Re-run against the new
blob `0295b21b`: **all six byte-identical**. A CURRENCY row beside it reports when
the fixture's source documents drift from aeon's tip, so the golden cannot quietly
become a copy of Aurora's own opinion.

⚠ It is **not** a claim that Aurora agrees with aeon. aeon's own bytes are in the
fixture and are **not** the canonical form — aeon's generator writes its own key
order, Aurora's writer sorts recursively. My first attempt at this row asserted
byte-identity against aeon's file and was red for exactly that reason; the fixture
now holds both halves and the row asserts them separately.

---

## 7. The lag is armed again — and it is the sharper flavour

**Measured firsthand** through git objects at aeon `origin/master` `8e45ebac`
(aeon's tip moved to `864a90c7` later in the session; still absent there):
`docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block reads

```
preset:         bands, base_swap, cycles, id, patch_motion, patch_world_ys, ramp, schema, variants
preset-ignored: name
preset-refused: fires
```

`boundary` is in **none** of the three rows. A key in `preset-refused:` is a name
aeon knows and declines; a key its page does not mention at all is one its generator
meets as an unknown property and rejects the **whole document** for. **So a preset
Aurora writes under `boundary` today does not build.**

`PRESET_KEYS_AWAITING_AEON = ['boundary']`, measured 2026-09-04. The disclosure's
existing sentence already says exactly that, so the arming needed no new wording —
only the premise and its date. The drift row is flipped back to asserting that list
(its own message named the fix; `git log`'s 2026-09-03 shape is what it was restored
to), and `preset-lag-disclosure.test.ts` is re-aimed from RETIRED to ARMED —
**including its poison, whose load-bearing direction inverts with the premise**: with
the list non-empty a NON-empty stub *is* production and proves nothing, so the row
that matters now is the one that empties it and demands silence. Both directions are
kept; only which one is load-bearing changes.

Three per-section rows (*"the sentence is retired for THIS card's own keys"*) were
**re-aimed rather than relaxed**. The leaf is no longer silent, and the claim worth
making is narrower than silence: the live sentence must not name this surface's own
keys, and it must be the derivation's own output rather than a literal.

---

## 8. Verification

| | before (measured here) | after (measured here) |
|---|---|---|
| `npm test` | **2 failed / 6 978 passed / 9 skipped (6 989)** | **1 failed / 7 026 passed / 9 skipped (7 036)** |

The **two** baseline failures were the preset schema's and the preset vectors'
CURRENCY rows — the two this parcel answers. The **one** remaining failure is **not
this parcel's and not an Aurora regression**: empyrean pushed `ff3f43f` mid-session
(the **scene** schema's `reels` key, EFFECTS-W1 item 10), so
`test/formats/effects-schema-drift.test.ts`'s CURRENCY row for
`aurora-effects-scene.schema.json` correctly went red. Measured: that blob was
`b3e0ab31` at empyrean `a8a115bc` when this session's baseline ran green, and is
`05f58fb9` at `188b6562` now. **The preset schema and vectors pins are still current
at that new tip.** Left open deliberately — see §9.

Both figures are full-suite `npm test` runs on this machine, in the foreground, not
tail excerpts. The suite never exited early at a gate.

### Poisons planted, each mutation shown on disk, each restored from the committed tip `668d3ae8`

| # | mutation | result |
|---|---|---|
| 1 | `preset.ts`: `/lowers into EffectsPreset\.ep_patched/` → `/POISON_NEVER_MATCHES_ep_patched/` | **RED**. `effects-preset-boundary.test.ts` cannot even load — `RASTER_CHANNEL_LABELS` throws for `boundary`; `effects-preset-base-swap.test.ts` red at the codec level too (`expected 4 to be greater than 4`) |
| 2 | golden fixture: `ojz_sec6_baseswap`'s canonical `"line": 3` → `"line": 4` | **RED**, 1 of 32, with the do-not-regenerate message |
| 3 | `channel-bands.ts`: `travelPx > band.lines` → `>=` | **RED**, 4 rows across two files (the boundary rows and the existing anchors rows) |
| 4 | `effects-preset.ts`: `presetProgramArm` → `presetRasterChannel` in `bandControlsRefusal`, **and** the delete loop back to `EFFECTS_PRESET_RASTER_CHANNELS` | **RED**, exactly the two rows written for them |
| 5a | the tempting repair: `/and on (\d+) since aeon …/` → `/preset fired on (\d+)/` | **RED at module load** — the two-clause interlock fires |
| 5b | past the interlock: `newBaseSwap()` returns a literal `line: 160` | **RED**, and **exactly one row of 33** — confirming the other 32 are blind to a stale binding, which is the finding |
| 6 | `PRESET_KEYS_AWAITING_AEON` back to `[]` | **RED** in both files: the drift lag row *and* the disclosure's armed rows |
| 7 | `boundary.ts`: `loHi` returns null always, **and** `no-motion`'s `enforced_by` → `'Aurora refuses this'` | **RED**, 4 rows, including the swept `enforced_by` check |

Each was applied on a clean tree at a committed tip, shown with `git diff -U0`,
run red, then restored with `git checkout HEAD -- <path>` and re-run green.

---

## 9. Left open, deliberately

1. **The authoring UI for `boundary`.** Explicitly out of scope. A boundary document
   opens, reads, saves and round-trips correctly, and the panel *says* it has no
   editor for it (`rasterEditorGap`) rather than rendering nothing.
2. **The scene schema is stale** at empyrean `188b6562` (`ff3f43f`, the `reels` key,
   EFFECTS-W1 item 10). Different contract file, different codec, different parcel.
   Half-doing it inside a boundary parcel would be worse than leaving the CURRENCY
   row red with a message that says exactly what to do.
3. **⚠ TAGGED FOR FOREGROUND FOLLOW-UP — nothing here has seen a ROM.** No emulator
   was touched (workspace invariant). Every claim in this packet is about *documents*
   and *node-level codec behaviour*. In particular §7 means a boundary preset
   currently **fails aeon's build outright**, so there is nothing to confirm on a
   machine yet; when aeon's step 4 lands, the loop worth driving is
   boundary + `patch_world_ys[c]` + `patch_motion[c]` → generator → ROM → a tint line
   that actually moves.
4. **`lo <= hi` / `line ∈ [lo, hi]` remain advisory** by the CR's ruling, and the
   sweep-fit verdict remains one-directional. Aurora is not, and must not become, the
   only check for any of the three.
