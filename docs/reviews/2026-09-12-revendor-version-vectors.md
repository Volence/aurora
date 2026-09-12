# Re-vendoring the two schema-version vectors — and the negative result they came back with

`docs/reviews/2026-09-12-preset-schema-key-pinned.md` closed by **stopping** on a contract
vector it could not author, and naming two cases for empyrean to consider: a preset declaring a
schema version other than 1, and one with no `schema` key at all. Both have landed at empyrean
`d6cbac70710b19fb9e26be6faae1bbb19b694ec2`. This packet is the re-vendor, the proof that the
runner actually executes them, and the answer to the question the whole exchange was about.

**That answer is negative, and it is the reason this packet exists rather than a one-line pin
bump.** The two cases pin the SCHEMA's version rules, which nothing else in this repo pinned.
They do **not** discriminate through Aurora's codec, and the mutation proving it is below.

Branch base: `de9c61567026dd43c4c6680b074ee49182b0091b`.

## The pin, re-derived

Every number below was produced in this worktree by the command beside it, not copied from the
dispatch that booked the parcel.

| claim | command | answer |
|---|---|---|
| `d6cbac7` is an ancestor of `origin/main` | `git merge-base --is-ancestor d6cbac7 origin/main` | exit 0 |
| its subject | `git log -1 --format=%s d6cbac7` | *contract: two schema-version vectors for the preset document (wrong value, absent key)* |
| empyrean tip at re-vendoring | `git rev-parse origin/main` | `3a6b17b19ffb9159d05be7383c8d7fa831480bd7` |
| vectors blob at `d6cbac7` | `git rev-parse d6cbac7:contract/schema/tests/effects-preset-vectors.json` | `768cd01698b2d74c1d89d66c8a487545c0dd2104` |
| vectors blob at `origin/main` | same, at `origin/main` | `768cd016…` — identical |
| vectors blob previously vendored | `git hash-object test/fixtures/effects/effects-preset-vectors.json` | `87af55c98dfb8f873ca631d431e192c24b02aa56` |
| **schema** blob at `d299279`, `d6cbac7`, `origin/main` | `git rev-parse <rev>:contract/schema/aurora-effects-preset.schema.json` | `b4cec60553929ac32330e3c33b0af6ee4012efe2` at **all three** |

`d6cbac7` is **not** the tip — `3a6b17b` is, one commit later, a hub correction touching neither
contract path. So currency here is the blob equality above plus the history reading, not a tip
identity:

```
$ git log --follow --format='%h %s' origin/main -- contract/schema/tests/effects-preset-vectors.json | head -2
d6cbac7 contract: two schema-version vectors for the preset document (wrong value, absent key)
8f56c2c effects preset schema: base_swap is a LIST of bands ...
$ git log --follow --format='%h %s' origin/main -- contract/schema/aurora-effects-preset.schema.json | head -1
d299279 effects preset schema: the order-rule parenthetical said sort; ...
```

The vectors' last touching commit is `d6cbac7`; the schema's is still the *previous* pin
`d299279`. Hashing two ends proves they are equal; the log proves nothing in between moved a
file and moved it back.

### The schema side is a revision pin only — and the re-vendor was performed anyway

The sidecar says to re-vendor the schema at the same revision, so it was, by redirection:

```
$ git -C <empyrean> show d6cbac7:contract/schema/aurora-effects-preset.schema.json \
    > src/core/formats/effects/aurora-effects-preset.schema.json
$ git hash-object src/core/formats/effects/aurora-effects-preset.schema.json
b4cec60553929ac32330e3c33b0af6ee4012efe2          # unchanged, 51559 bytes
$ git diff --stat
 test/fixtures/effects/effects-preset-vectors.json | 51 +++++++++++++++++++++++
 1 file changed, 51 insertions(+)
```

Only the vectors file is in the diff. That is a stronger statement than "the blobs match":
the redirection actually ran and the file came back byte-for-byte identical.

The schema sidecar's revision still has to advance, because
`test/formats/effects-preset-vectors.test.ts:108-114` requires both sidecars to cite ONE
empyrean revision. That gate has fired before — the `d299279` pin-history line records it
taking the suite to 1 failed / 7221 passed and naming exactly that row. It fired again here,
mid-parcel, when the vectors sidecar had advanced and the schema's had not (see the run log
below); it is doing its job in both directions.

### Diffed BY NAME, never by index

The `8f56c2c` re-vendor **deleted seven cases**, so a growing count is not evidence that the
existing rows survived. `scratchpad` diff keyed on `case.name`:

```
OLD: 41 cases, 8 pass / 33 fail
NEW: 43 cases, 8 pass / 35 fail
removed by name: 0 []
added by name: 2
  + "a document declaring a schema version other than 1" | expect: fail | doc.schema: 2
  + "a document with no schema key at all"               | expect: fail | doc.schema: ABSENT
shared: 41 changed in place: 0 []
doc.schema census (new): [["1",41],["2",1],["ABSENT",1]]
```

A pure append: `git diff` on the vendored file is **51 insertions, 0 deletions**. empyrean's own
commit message says *"G7 goes 33 -> 35 red-vectors"*, which agrees with the count taken here
from the vendored bytes.

The census is the point of the CR: before `d6cbac7`, every one of the 41 cases carried
`"schema": 1` and none omitted the key, so **neither half** of the version rule was exercised by
any published vector.

## 41 → 43, by name, in the runner

A case the runner silently skips looks exactly like a case that passed, so the totals were not
trusted. The per-case row names were read out of vitest's JSON report before and after
(`test/formats/effects-preset-vectors.test.ts` emits one `accepts: <name>` or `refuses: <name>`
row per case):

| run | accepts rows | refuses rows | **executed cases** |
|---|---|---|---|
| HEAD bytes (`87af55c9`) | 8 | 33 | **41** |
| re-vendored (`768cd016`) | 8 | 35 | **43** |

and the diff of the two sorted name lists is exactly:

```
> refuses: a document declaring a schema version other than 1
> refuses: a document with no schema key at all
```

Nothing removed, nothing renamed. The two new cases really run.

### They went red on arrival, and not for a stale-fixture reason

Both new rows failed the moment the bytes landed:

```
AssertionError: expected 'ojz_sec1_tint.json declares "schema":…' to match /does not match the raster preset sche…/
+ Received:
"ojz_sec1_tint.json declares \"schema\": 2; wave 2 refuses anything but 1. A new schema version
 is a contract change to both halves, not a file the reader upgrades."
```

`parseEffectsPreset` speaks the version rule **in its own words, before it runs the schema** —
`src/core/formats/effects/preset.ts:2067-2076`, whose comment says why: *"expected the constant
1" does not tell an author there is deliberately no migration machinery to ask for.* The REJECT
row's single regex over the schema sentence had been correct only because **no vector had ever
exercised the version rule.** An empty population, invisible until it was filled.

### The fix measures the row's own title instead of reading prose

Widening a prose regex is how a gate gets weaker, so the prose check is no longer what carries
the row. `test/formats/effects-preset-vectors.test.ts:215-221` now runs the vendored schema over
each reject document **directly** and requires a non-empty refusal:

```ts
expect(
  validateAgainstSchema(c.doc, EFFECTS_PRESET_SCHEMA),
  `${c.name}: the contract says FAIL (${c.why}) and the vendored SCHEMA accepts it. `
  + 'Whatever refused this document, it was not the schema.',
).not.toEqual([]);
```

That is the literal claim in the describe's title, and it is **strictly more** than the old
regex asserted on the 33 cases that predate `d6cbac7` — prose can be reworded, a refusal cannot.
Measured before being written, over the newly vendored bytes:

- reject vectors: **35**, of which **0** are accepted by the schema alone
- accept vectors: **8**, of which **0** are refused by the schema alone

The codec's sentence is still checked, against **two** named shape sentences
(`:203-205`) — never the loader's identity rule — and a census row at `:237-249` asserts
**both** branches have real vectors behind them, so the version branch cannot quietly become
the empty population it just was.

## The discrimination verdict — NEGATIVE

**The question.** `docs/reviews/2026-09-12-preset-schema-key-pinned.md` found that in Aurora's
codec an absent key and a wrong value hit the *same* line, and that a key-absent document is
still refused one layer down by the schema validator. Do the two new contract vectors catch that
class?

**The mutation**, applied on disk at `src/core/formats/effects/preset.ts:2070` — it deletes the
missing-key rule while leaving the wrong-value rule intact:

```diff
   // schema's `const` would refuse it anyway, but "expected the constant 1" does
   // not tell an author there is deliberately no migration machinery to ask for.
-  if (obj.schema !== 1) {
+  if (obj.schema !== undefined && obj.schema !== 1) {
     throw new EffectsPresetError(
```

read back from disk as `  if (obj.schema !== undefined && obj.schema !== 1) {`, and restored
afterwards with `git checkout -- src/core/formats/effects/preset.ts` from the committed
baseline `de9c6156` (`git status` on the file: empty; line 2070 back to `obj.schema !== 1`).

**The result.**

| suite under the mutation | verdict |
|---|---|
| `test/formats/effects-preset-vectors.test.ts` — all **43** contract vectors, both new ones included | **53 rows, all passed.** Nothing went red. |
| `test/formats/effects-preset.test.ts` — Aurora's own rows, landed the same day | **1 failed / 61 passed** |

The one red row is Aurora's:

```
FAIL  test/formats/effects-preset.test.ts > reading a preset
      > refuses a document with NO schema key, quoting the absence back
AssertionError: expected [Function] to throw error matching /declares "schema": undefined/
  but got 'minimal.json does not match the raster preset schema
  - <document>: missing required property "schema"'
```

**So the contract vectors still cannot catch the class we asked them to catch.** Both documents
are refused either way, because `validateAgainstSchema` one layer down refuses the key-absent
document on its own (`src/core/formats/effects/json-schema-subset.ts:437`). A vector asserts
only *accepted or refused*; it cannot assert **which rule did the refusing**, and that is
exactly the distinction the missing-key rule lives or dies on.

### What the two cases DO pin, which is not nothing

They discriminate at the **schema** layer, where the version rule is genuinely two rules —
`properties.schema.const: 1` and `required[0] == "schema"`. Run through the vendored schema
directly:

| case | schema's refusal |
|---|---|
| a document declaring a schema version other than 1 | `/schema: expected the constant 1, got 2` (`json-schema-subset.ts:353`) |
| a document with no schema key at all | `<document>: missing required property "schema"` (`json-schema-subset.ts:437`) |

Before `d6cbac7` neither of those two schema clauses had a published vector. Now both do, and
the new `validateAgainstSchema` assertion in the REJECT row is what holds them. The `const`
clause **cannot** fire for an absent key — `json-schema-subset.ts:441` only descends into a
property that is `in obj` — so the two really are independent rules at that layer.

## Follow-up for empyrean, not absorbed here

> A document vector states *accepted* or *refused*. It cannot state *which rule refused*, so no
> vector at `contract/schema/tests/effects-preset-vectors.json` can distinguish a consumer that
> implements the version rule from one that has deleted it and is coasting on the schema's
> `required` clause. If the contract wants that property held across consumers, it needs a
> shape that names the expected refusal — a `refused_by` or `message_matches` field beside
> `expect: fail` — and Aurora would then hold its codec to it. Until then the discrimination is
> Aurora's own row's to keep, and a second consumer gets no help from the contract.

Aurora is **not** proposing that unilaterally and has not implemented it. It is stated here so
the negative result reaches the hub instead of being quietly absorbed into a green suite.

## What is NOT claimed

- **No aeon tree was read or run.** `tools/effects_gen.py load_preset` refuses an absent key at
  its own `:1208` per the earlier packet; that is inherited, not re-measured.
- **No runtime, no emulator, no CDP.** Everything here is `git`, `vitest` and one file redirect.
- The two new vectors are **not** claimed to be redundant. They pin schema clauses nothing else
  in this repo pinned; they are claimed only to be no substitute for the codec-level row.
- The `d299279 → d6cbac7` schema pin is a **revision** advance. No schema byte moved, so no
  keyword, type or value shape is new and no `schemaNumberFromProse` derivation can have
  re-read anything — that follows from the byte identity rather than from a separate probe.
