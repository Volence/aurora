# Pinning the absent `schema` key: two rows, and the vector that could not be written here

Follow-up to `docs/reviews/2026-09-12-preset-schema-key.md` (merge `958dde2a`), whose answer
— no Aurora save path can write an effects preset lacking a top-level `"schema"` — was
established from source and by execution, and which closed with: *"Open: no test pins the
refusal of a schema-less preset; the packet proposes two rows and a contract vector."*

Both rows are added. The contract vector is **NOT** added, and the reason is a provenance rule;
see the last section.

Branch base: `a186472578229e9708fbd4fd086edfaf286fc296`.

| commit | what |
|---|---|
| `62ae20ef0ab83c78dbb3e72e4b8d61376ea32cb9` | Parcel A, the two rows |
| `04f94ccb9d99cdef3de67986c2eb994bbaeba3c4` | Parcel B1, the panel's stale narrowing comment |
| `82579561c3c5b3025dc3a9e8fe350d3c9ae2f0ef` | Parcel B2, the rig's self-refuting grep counts |

## The two rows

Both live in `test/formats/effects-preset.test.ts`, beside their neighbours: the reading row
follows `refuses a schema version other than 1, naming the absence of migration` inside
`describe('reading a preset')`, and the writing row follows `REFUSES to write an invalid
document rather than emitting one` inside `describe('writing a preset')`.

| # | row | rule it pins | needle |
|---|---|---|---|
| 1 | `refuses a document with NO schema key, quoting the absence back` | `parseEffectsPreset`'s version check, `src/core/formats/effects/preset.ts:2070-2076` | `/declares "schema": undefined/` |
| 2 | `REFUSES to write a preset with NO schema key, naming the MISSING key` | the vendored schema's `required` clause, evaluated at `src/core/formats/effects/json-schema-subset.ts:437`, through `serializeEffectsPreset` (`preset.ts:2165-2176`) | `/missing required property "schema"/` |

**Runner: `vitest run`, the last stage of `npm test`** (`package.json` `"test"`). Not a
scratchpad harness: `scratchpad/preset-schema-key-probe.mjs` (registered
`harness:preset-schema-key`) stays what it was, read-only execution evidence outside the suite,
and these rows do not duplicate it — they pin two of the properties it demonstrates.

**One property per row, deliberately.** Load and save are not folded together: they are two
different code paths, and on the read side the absent key is not even caught by the schema.
`preset.ts:2070` is `obj.schema !== 1`, which fires before `validateAgainstSchema` runs at
:2078, so on load the absence and the wrong value hit the SAME line; on write there is no
version check at all and the schema's two clauses — `required` at json-schema-subset.ts:437
and `const` at :352-353 — are two paths with two sentences. The `const` clause cannot fire for
an absent key, because :441 only descends into a property that is `in obj`.

### Why the needles are what they are

The naive needle for row 1 is `/wave 2 refuses anything but 1/`. **That is the neighbouring
row's needle**, and it matches the missing-key document too, because both documents reach
`preset.ts:2070` and are handed the same sentence. A row spelled that way would have been a
second copy of the row above it, catching a rule it was not about — the shape this repo has
been bitten by before (`/has only \d+ tiles/` catching the codec's prefix check). The ONE thing
that separates the two sentences is the value the message quotes back:
`JSON.stringify(obj.schema)` at :2072, which renders `undefined` for a key that is not there.

Uniqueness of the two needles, as greps, run in the worktree:

```
$ grep -rn 'missing required property' src/ test/ | grep -i schema
src/core/formats/effects/json-schema-subset.ts:437:        if (!(key in obj)) issues.push({ path, message: `missing required property "${key}"` });
```

One hit, and it is the composition site. (The bare phrase `missing required property` is NOT
unique — `refuses a band missing ANY of the four keys` builds the same sentence for `bot`,
`on`, `sh` and `top` — so the `"schema"` half is load-bearing and the row must carry it.)

```
$ grep -rn 'declares "schema"' src/ test/ scratchpad/
src/core/formats/effects/scene.ts:562: ... wave 1 ...
src/core/formats/effects/preset.ts:2072: ... wave 2 ...
```

Two composition sites, one per codec; the preset row only ever sees the preset one.

### Discrimination, proved by execution

Each row carries a control that runs on every suite run: it feeds the OTHER rule's document to
the same function, asserts the other rule's sentence comes back, and asserts this row's needle
does NOT. To show those controls are not vacuous, both were flipped from `.not.toMatch` to
`.toMatch` on disk and run. Both went red, with the other document's message printed:

```
FAIL  reading a preset > refuses a document with NO schema key, quoting the absence back
AssertionError: expected 'minimal.json declares "schema": 2; wa…' to match /declares "schema": undefined/
+ Received:
"minimal.json declares \"schema\": 2; wave 2 refuses anything but 1. A new schema version is a
 contract change to both halves, not a file the reader upgrades."

FAIL  writing a preset > REFUSES to write a preset with NO schema key, naming the MISSING key
AssertionError: expected 'refusing to write preset "minimal": i…' to match /missing required property "schema"/
+ Received:
"refusing to write preset \"minimal\": it does not match the raster preset schema
  - /schema: expected the constant 1, got 2"
```

That is the discrimination in both directions and in the artifact's own words. The
wrong-version document is refused by BOTH functions, and by neither of these rows' sentences.
The flip was restored with `git checkout --` from `62ae20ef`, a committed baseline.

### Red-first, with the mutation shown applied

Each row was proved red by a mutation to PRODUCTION code that removes exactly its rule, applied
on disk and quoted back from disk, run, then restored from the committed baseline `62ae20ef`
(the rows were committed green first, so the restore was never a `checkout` over a dirty tree).

**Row 1.** `src/core/formats/effects/preset.ts:2070`, mutated so an absent key walks past the
version check:

```
$ git diff --stat
 src/core/formats/effects/preset.ts | 2 +-
$ grep -n "MUTATION: absent key walks past" src/core/formats/effects/preset.ts
2070:  if (obj.schema !== undefined && obj.schema !== 1) { // MUTATION: absent key walks past
```

```
 FAIL  reading a preset > refuses a document with NO schema key, quoting the absence back
AssertionError: expected [Function] to throw error matching /declares "schema": undefined/
+ Received:
"minimal.json does not match the raster preset schema
  - <document>: missing required property \"schema\""
 Tests  1 failed | 61 passed (62)
```

⚠ **Read that received message.** With the rule removed, the document is STILL refused — by the
schema's `required`, one layer down. So a row asserting only `.toThrow(EffectsPresetError)`
would have stayed GREEN through this mutation and pinned nothing. That is the shape the scene
codec's sibling row has today (`test/formats/effects-scene.test.ts:154`,
`refuses a missing schema key`, whose whole assertion is the error class); this is noted as a
neighbouring observation, not touched, and not a claim measured about the scene codec's own
mutations.

**Row 2.** `src/core/formats/effects/json-schema-subset.ts:437`, mutated so the `required`
clause stops refusing an absent `schema`:

```
$ git diff --stat
 src/core/formats/effects/json-schema-subset.ts | 2 +-
$ grep -n "MUTATION: absent schema not required" src/core/formats/effects/json-schema-subset.ts
437:        if (!(key in obj) && key !== 'schema') issues.push({ path, message: `missing required property "${key}"` }); // MUTATION: absent schema not required
```

```
 FAIL  writing a preset > REFUSES to write a preset with NO schema key, naming the MISSING key
AssertionError: expected '' to match /refusing to write preset "minimal"/
+ Received: ""
 Tests  1 failed | 61 passed (62)
```

The empty message is the point: with the clause gone, `serializeEffectsPreset` does not throw
at all — it returns text, and `save.ts:607` → `aeon-save.ts:99` would put a schema-less preset
on disk. That is precisely the outage the earlier packet's answer rests on not being possible.

**Each mutation reddened ONE row and only one**: row 1's mutation left row 2 green and left the
neighbouring wrong-version row green; row 2's mutation left row 1 green. The two rows are
independent, and neither is standing in for the other.

## The contract vector: STOPPED, and why

The earlier packet proposed a third deliverable, "a row asking empyrean to add a key-less case
to the contract vectors". It does not belong in this repo, and the fixture's own provenance
says so. `test/fixtures/effects/effects-preset-vectors.provenance.json` records the vendored
file as byte-identical to an empyrean blob:

> `"identical_to_source": "byte-for-byte; the git blob id above is the SAME object empyrean
> stores, which is what effects-preset-vectors.test.ts recomputes from these bytes on every
> run"`

and states the ONLY way its bytes may move:

> `"re_vendor": "git -C <empyrean> fetch origin && git -C <empyrean> show
> origin/main:contract/schema/tests/effects-preset-vectors.json >
> test/fixtures/effects/effects-preset-vectors.json — then update empyrean.revision,
> empyrean.blob, vendored.bytes, vendored.git_blob and pin_history_current_last here,
> re-vendor the SCHEMA at the same revision, and re-run the full suite."`

This is a writer-ORIGINATED fixture, not a writer-CERTIFIED one. The gate is real and was read,
not assumed: `test/formats/effects-preset-vectors.test.ts:86` asserts
`gitBlobHash(BYTES)).toBe(PROV.empyrean.blob)`, with the git object id computed at :68-71.
Adding a key-less case by hand would go red there; "fixing" the sidecar's hash to match would
leave a green suite behind while destroying the only property the fixture exists for — that
Aurora runs the contract's own document vectors and not a local copy of them. So: **STOPPED on
this item.** The vector is empyrean's to author at
`contract/schema/tests/effects-preset-vectors.json`, and Aurora's part is the re-vendor above.

**Re-measured here rather than inherited, and it is worse than the earlier packet reported.**
The packet said all the vectors carry `"schema": 1` and none omits it. Counted from the
vendored bytes this run (41 cases, 8 expected-pass and 33 expected-fail, every case carrying a
`doc`):

- cases whose `doc` omits `schema`: **0**
- distinct `doc.schema` values across all 41 cases: **`1`, and nothing else**

So the contract vectors exercise NEITHER half of the version rule: not the absent key, and not
a wrong value either. Two cases for empyrean to consider, not one. Aurora's own suite now pins
both halves on both sides (the wrong value by the pre-existing row and by row 2's control; the
absence by rows 1 and 2), which is the local answer while the contract has none.

## What is NOT claimed

- Aeon's half is unchanged and unexecuted here. `tools/effects_gen.py load_preset` refuses an
  absent key at its own :1208, as the earlier packet read; no aeon tree was read or run for
  this parcel.
- The rows pin the CODEC, which is the gate. They do not execute `buildAeonSavePlan` or the IPC
  write; that remains CANNOT TELL #2 of the earlier packet, needing a fixture project.
- No runtime, no emulator, no CDP run was involved in Parcel A.
