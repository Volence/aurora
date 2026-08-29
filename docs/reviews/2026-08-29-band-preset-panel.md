# The raster band preset panel — authoring surface, and the promise it carries

Branch `ew-band-preset-panel`, based on master `7609750` (the merge that landed the
curve dropdown). 2026-08-29.

---

## 1. What the two authorities say, and whether they disagree

**They do not disagree.** Checked field for field, at these revisions, read through git
objects and never through a sibling working tree.

| | read at | blob |
|---|---|---|
| **Normative wire schema** (writer side) | empyrean `6664b61:contract/schema/aurora-effects-preset.schema.json` | `29c1c5ee619717ac1694fd4e152f7e3ed6c771d8` |
| **Worked example** | aeon `origin/master` (`abc14be1`) `docs/EDITOR_RASTER_PRESETS.md` | `94db6b3a52c33d4e59011ba7043b8b9827fab38b` |

Both blob hashes were re-derived here rather than taken from the dispatch. The schema is
**byte-identical at `6664b61` and at `origin/main`**, so the pin is current at tip and not
merely correctly cited; `6664b61` is an ancestor of `origin/main`. aeon `23006094` is an
ancestor of `abc14be1`, so the page was read after the window in which the parcel had been
accidentally reverted off the branch.

### The comparison, row by row

aeon's page carries a machine-checked block
(`<!-- KEYS-CHECKED-AGAINST-effects_gen.py -->`) that their
`tools/test_effects_gen.py::TestEditorRasterPresetsDoc` reads and compares against
`effects_gen.py`'s `PRESET_KEYS` / `BAND_KEYS` / `BAND_ON_ARMS` on every build. All seven
rows agree with the schema:

| page row | page says | schema says | verdict |
|---|---|---|---|
| `preset` | `bands, id, schema` | `required: [schema, id, bands]` | agree |
| `preset-ignored` | `name` | `name`, no type constraint, "read by nothing" | agree |
| `preset-refused` | `cycles, fires, variants` | named in `description` as reserved; refused structurally by `unevaluatedProperties: false` | agree (see nuance below) |
| `band` | `bot, on, sh, top` | `required: [top, bot, sh, on]` | agree |
| `on-arms` | `cram, pal_region` | `oneOf` over exactly those two; `vsram` absent | agree |
| `on.cram` | `addr, colours` | `required: [addr, colours]` | agree |
| `on.pal_region` | `addr, count, entry, pal_line, slot` | `required: [addr, slot, pal_line, entry, count]` | agree |

Types agree too: `colours` is an array of integers, every other arm field a bare integer,
`sh` is `boolean | 0 | 1`, `schema` is `const 1`, `id` matches `^[a-z][a-z0-9_]{0,31}$`,
`bands` has `minItems: 1`.

**One nuance, not a disagreement.** The page separates `preset-refused` (reserved by NAME,
with a reason) from a plain unknown key. The schema refuses both the same way — it is
closed — and names the three only in its prose `description`. So the *distinction* is
aeon's, and the *refusal* is the schema's. Aurora keeps the distinction because it produces
a better sentence for an author who read empyrean §7 and wrote one of those names in good
faith; `EFFECTS_PRESET_RESERVED_KEYS` derives the list from the schema's own sentence and
**throws at module load** if that sentence ever stops matching, rather than silently
degrading to "unknown property" with nothing going red.

**Nothing needs reporting upstream.** If that ever changes, a gate now notices — see §5.

---

## 2. What was built

### Core (the document)

- `src/core/formats/effects/aurora-effects-preset.schema.json` — the contract schema,
  vendored byte-identical (`git show`, redirected, never retyped).
- `src/core/formats/effects/aurora-effects-preset.schema.provenance.json` — the pin of
  record. The hash lives here **once**, and the gate reads it; the scene schema's lesson
  (three prose copies, one of them three re-pins stale, nothing red) is applied at birth.
- `src/core/formats/effects/preset.ts` — the codec. `parseEffectsPreset` /
  `serializeEffectsPreset` / `loadEffectsPresetLibrary`, paths, the exactly-one-arm rule,
  constants derived from the schema.

### Plumbing (so the document round-trips)

`s4-types.ts` (required `effectsPresets`) · `project/adapter.ts` (the `presets` alias) ·
`aeon/load.ts` (loads the library, notices join the project's) · `aeon/save.ts` (writes it,
throwing rather than skipping on an unreadable path) · `editing/commands.ts`
(`SetEffectsPresetCommand`) · `editing/history.ts` (`placeEffectsPreset`, apply + undo) ·
`projectStore.ts` · `editorStore.ts` (`selectedEffectsPresetId`) · `debug-hooks.ts`
(`__dbg.aeon.presets()` / `presetsJson()` / `selectPreset()`, for the harness).

### Surface

- `src/renderer/providers/effects-preset.ts` — every predicate, sentence and option list.
  The panel holds none.
- `src/renderer/components/effects/BandPresetPanel.tsx` — the panel.
- `src/renderer/workspace/facets/effects-facet.tsx` — mounted in the effects column, below
  the BgAnim bands, collapsed by default.

### One shared-module change that had to happen

`json-schema-subset.ts` **refused this schema outright**. It is the first committed contract
schema to put `unevaluatedProperties: false` beside an in-place applicator, at
`$defs.band.properties.on`:

```json
"properties": { "cram": {…}, "pal_region": {…} },
"oneOf": [ {"required": ["cram"]}, {"required": ["pal_region"]} ],
"unevaluatedProperties": false
```

That is the natural spelling of "exactly one arm, and no other key". The blanket refusal was
a **false positive**: a `required`-only branch contributes no property annotations, so the
`additionalProperties` equivalence the evaluator rests on holds exactly. The guard is now a
prover (`contributesPropertyAnnotations`) that clears a branch only when every keyword in it
is on a whitelist of provably-inert ones — a **whitelist and not a blacklist**, because the
failure this evaluator exists to prevent is silently accepting what the real schema rejects,
and a blacklist is wrong by default on every keyword nobody thought of. `$ref`/`$dynamicRef`
stay an unconditional refusal: their value is a string this evaluator does not follow.

---

## 3. The three limits, in the panel's own text

Rendered as **body text**, in a bordered block, **above every control**, always — not a
tooltip, not behind a disclosure, not conditional on a preset existing. Verified in the
running app (§6, rows 3a–3g) and guarded by `band-preset-wording.test.ts`.

The headline, first, because a limits block with no headline is a scolding:

> **An author can author a raster band. A programmer wires it up in one line.**

> **Saving does not install the band.** Nothing binds a preset to a section. The
> per-section key that would carry it (effectsRef) is not implemented in either repo, so a
> programmer binds this preset by hand in aeon's ojz_effects.emp. Until then the document
> costs ROM whether or not anything installs it.

> **Seeing it is a debug chord.** aeon steps a band-demo table with START held + UP to
> install the next program and START + DOWN to remove it. That table is a hand-typed dc.l
> list — this document does not add itself to it. aeon's build fails loudly when a preset
> has no row, so the omission is not silent, but the fix is a programmer's edit.

> **Nothing checks that a band is visible.** A perfectly legal band over an unused palette
> entry, or one whose colour matches the base it repaints, builds green and shows nothing.
> No check anywhere in the pipeline catches that — not this panel, not the schema, not the
> build.

And, because an empty space where a preview would be reads as "coming soon" rather than
"there is no ground truth":

> No preview. A raster band has never been looked at on screen anywhere in this suite, so
> there is nothing to draw a faithful preview from — and an unfaithful one would be worse
> than none.

A wording row asserts that **no string on this surface** claims anyone has seen a band, and
that the word "preview" appears only in the sentence saying there is not one.

---

## 4. The narrowed control, and the strictness question

Copied from `tableRefParamOptions`, which was ruled the reference. Its test is: **disable
only when no document content can make the value legal**; when the precondition is another
control's value, advise instead.

- **The ON-arm picker disables nothing**, and that is the answer rather than an omission.
  Both arms are legal in every document, so the test forbids disabling either. `vsram` is
  not offered-and-greyed because it is not a value the schema declares — offering it
  disabled would advertise a capability the contract does not have.
- **An unknown arm a FILE already carries IS rendered, disabled, with the reason.** A
  `<select>` whose current value has no option silently shows a different one — the quiet
  lie `unassignableSceneRef` exists to stop, and here the author would read `cram` off a
  file holding something else.
- **The last band cannot be removed.** `bands` is `minItems: 1` unconditionally, so no
  document content can license it — it passes the test in the disabling direction. The
  greyed button and the sentence under it both read `lastBandRefusal`; the component does
  not re-compare a length.

**No range on any spinner, and no clamp anywhere.** aeon §E.4: "Do not validate ranges, and
do not clamp. Forward what the author typed", so the author reads the engine's refusal with
the measurement behind it. Asserted in the source (`band-preset-wording.test.ts`) *and* on
the live DOM element (harness row 4e), because a source grep cannot see what React actually
put on the input. Field `title`s quote the **schema's own `description`**, read out of the
vendored bytes, so the author learns where the refusal will come from without Aurora
asserting a bound it does not own.

---

## 5. Red-first plants

Every one was run, failed with the assertion quoted, and restored.

**P1 — the subset evaluator refuses this schema.** Before the fix:

> `UnsupportedSchemaError: unevaluatedProperties at /bands/0/on sits beside the in-place applicator "oneOf"; this evaluator implements it as additionalProperties, which is only equivalent when no in-place applicator can contribute annotations. Refusing.`

**P2 — the narrowed guard still refuses a real annotator.** `effects-schema-drift.test.ts`'s
row now asserts **both sides**, because a narrowed guard only ever tested on its accepting
side is a guard that has been deleted: a `properties`-declaring branch, a `$ref` sibling,
and an applicator nested one level down all still throw; the preset's `required`-only shape
is accepted *and* still enforces both halves it exists for.

**P3 — the aeon-page agreement gate is not vacuous.** Planted `vsram` into the expected arm
list:

> `AssertionError: A SPLIT BETWEEN aeon docs/EDITOR_RASTER_PRESETS.md (at abc14be19c619a3c40dccd08fcbbc32fb3d46f9a) AND contract/schema/aurora-effects-preset.schema.json (blob 29c1c5ee…). THE SCHEMA WINS — but report this: aeon asked to hear about it immediately.: expected [ 'cram', 'pal_region' ] to deeply equal [ 'cram', 'pal_region', 'vsram' ]`

The named revision in the message proves it really read aeon at a commit, not a working tree.

**P4 — delete the limit block's render.**
> `AssertionError: expected '\n\n\n…' to match /<LimitBlock\s*\/>/`

**P5 — hide it behind a condition** (`{entries.length > 0 && <LimitBlock />}`).
> `AssertionError: expected '          {entries.length > 0 && <Lim…' not to match /&&|\?|selected|entries\.length/`

**P6 — bury the limit bodies in a `title=`.**
> `AssertionError: expected '\n\n\n…' not to match /title=\{(?:l|limit)\.body\}/`

**P7 — add a range clamp** (`min={3} max={223}` on the `top` spinner).
> `AssertionError: <NumberField title={BAND_FIELD_TITLES.top} min={3} max={223} width={72} value={band.top}`

**P8 / P9 — the harness's own two plants.** `PLANT=rot-selector` rots the limit-block
finder: row 2b goes red and the run **aborts** rather than passing section 3 vacuously.
`PLANT=rot-section` restores the `\b`-before-an-action-label rot that really failed here:
rows 4c–4f and 5c go red.

### The slice bound, asserted rather than applied

The wording gate reads the panel source. Its trap is **comments**: the panel's docblock
discusses `PRESET_LIMITS` and `LimitBlock` at length, so a naive `includes()` would stay
green after the render call was deleted, satisfied entirely by the prose explaining why it
should be there. The gate strips comments first, and a row asserts the strip **really
removed** the prose that would have fooled it (>500 chars) while leaving a real component
behind (>2000 chars).

### Two defects this discipline caught in my own work

1. **The dedupe regex.** `parseEffectsPreset` de-duplicates the schema's generic `oneOf`
   complaint where the band already has a specific arm sentence. My first version matched
   `matches \d+ of the \d+ allowed forms` — but the evaluator says "matches **none** of the
   2 allowed forms" for zero matches. A zero-arm band was told off twice, in two
   vocabularies, which is the exact defect the function exists to prevent. Caught by the
   codec test.

2. **The harness polluted its own fixture — and passed on it.** Run 2 saved
   `harness_band.json` into the writable copy. Run 3 then *opened* it, so the preset already
   existed before any click, `presetIdRefusal` refused the id as taken, `create` returned
   early — and **"clicking New created the preset in the MODEL" went green** on a document
   the click had nothing to do with. Two paths, one observable. Fixed with both halves: the
   artifact is deleted before each run, *and* row 1c2 asserts it is absent in the model
   before anything is clicked, so a failed delete cannot quietly restore the same false
   green.

Also worth recording: **the first `PLANT=rot-selector` I wrote was itself vacuous.** It
end-anchored the presets section title — but that section has no `right` action, so the
header renders the title bare and `$` matched happily. A plant has to rot something the
shape of the DOM can actually break. Both plants were rewritten and re-verified.

---

## 6. Live verification

`scratchpad/band-preset-harness.mjs`, `npm run harness:band-preset`. Drives the real
Electron app under CDP against a **writable copy** of the aeon tree (it refuses to run
against `/home/volence/sonic_hacks/aeon` — it saves).

**29 rows, 0 failed, 21.2s.** Not stitched: dpr, rects and clip are read in one session and
printed together. Observed dpr **1.35 on one run and 1 on another**, which is exactly why
every coordinate is an integer derived from the rect printed beside it.

What it establishes that the node suite cannot:

- aeon's shipped `authored_probe.json` **loads into the model** (2 bands), and no preset
  file is unreadable.
- All three limits are visible as **`innerText`** — which excludes `title=` attributes and
  `display:none` subtrees, so a limit in a tooltip reads as absent — and the block is
  **contained in its scroller's painted box** and sits **above the first control**.
- The feature works: New creates the document *and selects it*, the document is
  schema-shaped, editing `top` reaches the document (`96`), the spinner carries **no
  min/max on the live element**, the arm picker offers both arms enabled.
- A **real Ctrl+S** writes it, and aeon's shipped document comes back **byte-identical**
  (484B → 484B) — the round-trip claim, on a file this repo did not write.
- The written bytes are aeon's canonical form, checked by an **independent** recursive sort
  in the harness rather than by agreeing with the codec, including that the recursion
  reached *inside* a band (`bot` before `top`).
- The scene library is untouched — bands never went near a scene file.

**Screenshots** (gitignored by repo convention, parked on disk):

- `scratchpad/shots-band-preset/2-band-preset-panel-limits.png` — the authoring surface with
  all three limits. dpr `1.35`, viewport `1400x1600`, clip `{x:1092, y:489, w:298, h:572}`.
- `scratchpad/shots-band-preset/3-band-card.png` — the band card, including the disabled
  Remove button with its reason. clip `{x:1100, y:1106, w:285, h:424}`.
- `scratchpad/shots-band-preset/1-effects-column.png` — the whole column.

---

## 7. Suite

`npm test`: **420 files passed, 2 skipped (422); 5724 tests passed, 7 skipped (5731)**.
`npx tsc --noEmit` clean. All 7 skips are pre-existing and each names its reason
(`skip-report: OK`); none is in code this parcel touched.

New: `test/formats/effects-preset.test.ts` (33), `test/formats/effects-preset-schema-drift.test.ts` (8),
`src/renderer/components/effects/__tests__/band-preset-wording.test.ts` (19).

---

## 8. Scope held, and what is left open

**Held, not re-litigated.** Nothing here touches how a band **anchors to layout or camera**
— no `band_moving`, no layout-anchored bands. The shipped band is screen-locked by design
and "moving bands after" is the owner's sequencing. No `drift` authoring. No `.emp` file and
no cycle-table row was written, and nothing was written into any sibling repo — aeon and
empyrean were read only through `git show <rev>:<path>`.

**TAGGED for foreground follow-up — no emulator was run, and none may be from here:**

1. **Nobody has still looked at one of these bands on screen.** This parcel photographs the
   *authoring surface*; it produces no evidence about what a band renders as. The panel says
   so in as many words.
2. **The cycle-table lint is not exercised from Aurora.** aeon's
   `tools/test_raster_cycle_table_lint.py` fails their build when a preset document has no
   `dc.l` row. A preset authored here and saved into a real aeon tree would trip it. That is
   the designed loud failure, but it has not been observed from this side.

**Open, small:**

- The preset section is fifth in a 300px scrolling column, so an author scrolls to reach it.
  That is a property of the column, not of this panel, and harness row 3f scrolls first and
  then asserts paint. Worth a look if the column grows again.
- `name` is typed `unknown` because the schema puts no type on it. The panel offers a text
  input and writes a string; a document carrying a non-string `name` round-trips untouched
  but renders its label as the id. Correct, but the control cannot author what the schema
  permits.
