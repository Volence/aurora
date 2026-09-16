# The regions document codec: vendor, validate, refuse, and what it cannot check

Queue row REGIONS-CODEC, regions part 2 step 9. Aurora can now read and write an act's
regions document against empyrean's contract schema. This is the **file half only**: no
drawing UI, no project migration, no region list panel.

Branch `parcel/regions-codec`, based on master `618496fb`.

## The pin, re-derived here

Every number below was produced in this worktree by the command beside it, not copied from
the dispatch that booked the parcel. `<empyrean>` is what `test/support/sibling-root.mjs`
answers for `empyrean`; no absolute peer path is written into a committed file.

| claim | command | answer |
|---|---|---|
| the ONLY commit that has ever touched the schema path | `git log origin/main -- contract/schema/aurora-regions.schema.json` | `c3f892f` |
| the ONLY commit that has ever touched the vectors path | `git log origin/main -- contract/schema/tests/regions-vectors.json` | `c3f892f` |
| its full id | `git rev-parse c3f892f^{commit}` | `c3f892f99e160648322a493ecdce5086bbdc8151` |
| its subject | `git log -1 --format=%s c3f892f` | *step 10: the regions schema, its prose doc, and Q8 ruled as A with a key split; gate G8 green (doc-existence check proven red first)* |
| it is published | `git merge-base --is-ancestor c3f892f origin/main` | exit 0 |
| empyrean tip at vendoring | `git rev-parse origin/main` | `5a02846b5b579972b32aed2bfa2af8fbcbd033c2` |
| schema blob at the pin | `git rev-parse c3f892f:<schema path>` | `438b604eafdb717c24ae411a730de16abf8eb2fe` |
| schema blob at `origin/main` | same, at `origin/main` | `438b604e`, identical |
| vectors blob at the pin | `git rev-parse c3f892f:<vectors path>` | `cf599c8acc5cababd57455d8da8480eb35054db4` |
| vectors blob at `origin/main` | same, at `origin/main` | `cf599c8a`, identical |
| the extracted schema bytes, RE-HASHED on this side | `git hash-object src/core/formats/regions/aurora-regions.schema.json` | `438b604e`, 7849 bytes, sha256 `a5417686…` |
| the extracted vectors bytes, RE-HASHED on this side | `git hash-object test/fixtures/regions/regions-vectors.json` | `cf599c8a`, 6232 bytes |

Both files were extracted by **redirecting `git show` straight into place**, never retyped
and never reformatted, and re-hashed here before anything was believed about them.

**The pin is the last-touching commit, not the tip**, and here they are three commits apart.
`5a02846` resolves both paths to the same blobs only because it does not touch them; a tip
citation dates the repository rather than the change. The scene sidecar's
`why_this_revision_and_not_the_tip` warns that the effects drift test's remediation text
names the tip and is wrong to follow literally. The regions drift gate's remediation text
does **not** repeat that mistake: it prints `git log <tip> -- <path>` first and tells the
reader to show the commit that comes back.

## Where things live, and why

| file | why there |
|---|---|
| `src/core/formats/regions/aurora-regions.schema.json` | a SOURCE file the app imports, beside its consumer, not under `test/fixtures/`. The scene sidecar's `$why_not_under_test_fixtures` reason applies unchanged, and a schema the renderer needs at runtime cannot live under `test/` at all. |
| `src/core/formats/regions/aurora-regions.schema.provenance.json` | the pin of record, machine readable, once. Nothing hashes a comment. |
| `src/core/formats/regions/document.ts` | the codec. |
| `test/fixtures/regions/regions-vectors.json` + sidecar | the vectors ARE test fixtures, and the effects vectors set the precedent one directory over. The published-revision sweep in `test/formats/aeon-fixture-currency.test.ts` knows an `empyrean` block, so the hazard the scene sidecar warns about (an empyrean SHA checked against aeon's master) does not arise. |
| `test/support/json-pointer.ts` | RFC 6901 helpers plus single-pointer surgery, used by the reject-reason derivation. |

**The vectors are VENDORED, not read at a pinned revision at test time.** Read through
`git show` at test time they would vanish on a machine with no empyrean beside it, and a
conformance suite that skips when it cannot find its cases certifies by being absent. The
extraction still went through git objects at a named revision; the currency block pays for
the staleness.

## The measured keyword gap: ONE keyword

Measured with `collectSchemaKeywords` and `assertSchemaSupported` over the vendored bytes
**before a line of the codec was written**, not guessed.

Keywords the schema uses:

```
$defs $id $ref $schema const description items maxLength minItems
minimum pattern properties required title type unevaluatedProperties
```

Missing from `SUPPORTED_KEYWORDS`: **`maxLength`**, and nothing else.
`assertSchemaSupported` agreed, naming `/$defs/region/properties/name` and no other node.

So the candidate list that arrived with the parcel was wrong on six of seven guesses:
`const`, `$ref` with `$defs`, `unevaluatedProperties`, `pattern`, `minItems`, the union
type `["string","null"]` and `minimum` were **all** already implemented. The two union
types (`rasterRef`, `sceneRef`) matter because a type array is exactly the shape that
passed the effects keyword census and threw on the first document; here the per-node walk
was run and came back clean.

### How `maxLength` is implemented

Over **code points**, not UTF-16 code units. JSON Schema 2020-12 defines a string
instance's length as its number of characters per RFC 8259; `String.prototype.length`
counts code units, so every astral character counts twice. `name` is the first key in
either committed contract schema whose value is free author prose rather than an identifier
matched by a `pattern` (a pattern carries its length inside its `{0,31}` repetition count),
so this is a label a person types, and `.length` would refuse a 33-emoji name the contract
accepts. That would be Aurora speaking a refusal in the contract's name that the contract
never made. Same reasoning `canonical-json.ts`'s `byCodePoint` already applies to key order.

It also joins `NON_ANNOTATING_KEYWORDS`, on exactly the terms `pattern` already sits there
on: it asserts a property of a string, and a string has no properties to name as evaluated,
so it cannot change what `unevaluatedProperties` sees.

The scene and preset schemas keep validating exactly as before. Their own suites are the
control and are green; `test/formats/json-schema-max-length.test.ts` also states it
directly, with the sweep made non-vacuous by asserting the regions schema DOES use the
keyword while the other two do not.

## The design calls

**Key order on write: aeon `EFFECTS_CONSUMER_CONTRACT.md` section 5, alphabetical and
RECURSIVE, indent 2, exactly one trailing newline.** That clause binds every editor-owned
JSON in aeon's tree, not only the effects documents, and `canonicalJsonPretty` is the one
place Aurora spells it. Schema-declaration order was the alternative and was rejected for
the reason section 5 itself gives: it needs the same key list maintained in two repos and
has no answer for ordering across writers.

**The round-trip property, stated exactly.** Because writes are canonical, a document whose
author typed the keys in some other order is NORMALIZED on its first save. What holds, and
what is proven, is a pair:

- CONTENT identity: `JSON.parse(serialize(parse(text)))` deep-equals `JSON.parse(text)` for
  every accept vector. Nothing gained, nothing lost, nulls included.
- BYTE identity at the fixed point: for canonical text `t`, `serialize(parse(t)) === t`
  exactly. The row that asserts it also asserts the FIRST write really did move the bytes,
  so the fixed point is a property of the second write and not of a no-op.

**Refusal shape.** `RegionsDocumentError` with an `issues` list, each line
`<JSON pointer>: <message>`, and `<document>` for the root rather than an empty pointer.
The version rule is spoken FIRST in the codec's own words, before the schema runs, for the
reason `preset.ts` and `scene.ts` both give.

**No filename identity rule.** A preset's `id` becomes an `.emp` label component and its
codec checks it against the filename stem; `act` is not that. Inventing the rule here would
be a refusal Aurora speaks in the contract's name that the contract never asked for, and it
would make a contract reject vector indistinguishable from a loader complaint. The `label`
argument is presentation only and a row asserts no rule is derived from it.

**Nothing is rebuilt from a field list.** `parse` hands back the object `JSON.parse`
produced. That is what makes "carry what you do not understand" structural rather than a
promise, and it is why an explicit `rasterRef: null` survives a write instead of folding
into absent.

## The span hole, and the other four

`bg.span` is **derived from the referenced layout and never typed by hand** (part 2 section
6.2 item 1). Nothing at this layer can check it: the derivation needs the background layout
library, which is a later row, and the schema can only say "integer, at least 1". A
hand-edited span that disagrees with its layout is accepted here and round-tripped
unchanged.

**This is asserted as an open hole, not left as a silence.**
`test/formats/regions-codec.test.ts` has a row that PROVES the hole is open (a span of 1
beside a real layout is accepted) with the anti-vacuous control beside it (a span of 0 is
refused, so the row is about the DERIVATION being unchecked and not about span being
unchecked). The day the derivation lands, that row goes red and names the three places to
update: the module header, the `RegionBg.span` doc comment, and the schema sidecar's
`the_hole_this_pin_carries`.

The schema's own description lists four more of the same kind, and none is checked here:
that `preset` names a record that exists (the generator's check, and a row asserts Aurora
accepts an invented name while still refusing one that is not shaped like a symbol), that
`bg.layoutRef` names a layout in the library, that a rectangle lies inside the act or that
regions tile it without gaps, and that the union of referenced layouts fits
`BG_TILE_CAPACITY`.

**TAGGED FOR FOREGROUND FOLLOW-UP:** none of this parcel wanted an emulator, and none was
run. The span derivation is a row, not a follow-up: it is blocked on the layout library.

## Conformance: the ten vectors, and how a reject is checked

Three accepts, seven rejects, counted from the vendored bytes.

**These are NOT a golden and the files say so twice.** Aeon has not built the generator half
of regions part 2, so no generated artifact exists to compare against. Nothing here was
invented to stand in for one.

"It threw" is passed by a codec that refuses everything, and each case's reason is PROSE
that no assertion can read. Copying a pointer out of a measurement into the test would be a
constant that stops measuring at the first re-pin. So the location is **derived**, from the
vectors' own promise that each FAIL case perturbs a PASS document in exactly one forbidden
way:

1. search every SINGLE-POINTER REPAIR that makes the document valid: delete one pointer, or
   write at one pointer the value an ACCEPT vector holds there. The whole document is
   excluded as a pointer or every case is trivially repairable;
2. keep the DEEPEST repairs, which is the most specific localization;
3. turn each into the pointer the refusal must be reported at: a wrong VALUE at the pointer
   itself, an extra or a missing key on the containing object, which is where JSON Schema's
   closure and `required` rules live;
4. assert EVERY issue is at that pointer, and that it NAMES THE KEY when the container is
   an object.

Derived and measured, per case:

| vector | derived repair | refusal must be at | names |
|---|---|---|---|
| effectsRef on a region row | delete `/regions/0/effectsRef` | `/regions/0` | `effectsRef` |
| a region with no preset | set `/regions/0/preset` from an accept | `/regions/0` | `preset` |
| a per-section binding key | delete `/regions/0/section` | `/regions/0` | `section` |
| the anchor triple on the region | delete `/regions/0/v_offset` | `/regions/0` | `v_offset` |
| a zero-width rectangle | set `/regions/0/rect/w` from an accept | `/regions/0/rect/w` | (a value, not a key) |
| an empty regions array | set `/regions/0` from an accept | `/regions` | (an array container) |
| an unknown key inside bg | delete `/regions/0/bg/anchorY` | `/regions/0/bg` | `anchorY` |

A census row then asserts, from that same derivation, that **at least one refusal lands
deeper than a region object**. That is the nested-closure case, the only one that proves the
document is closed anywhere other than the root, and a re-pin that drops it fails there.

**What the vectors do not reach, asserted so the silence is not read as coverage.** All ten
declare `"schema": 1`, so no vector exercises the version rule and none reaches the writer.
A row asserts that this is still true and says what to re-read if a future re-pin changes
it. Aurora's own version rows, including the ABSENT-key case as a separate row, are in
`test/formats/regions-codec.test.ts`, because the effects lane proved by mutation that a
codec checking only `schema !== undefined && schema !== 1` keeps every contract vector
green.

## Red-first log

Baseline for every mutation is the committed tree, never `git checkout --` on a dirty one.
The mutation is quoted back from disk and `git diff --stat` names the file before each red
run; `git status --porcelain` was empty after every restore. Runner: `vitest run` (the
`vitest` stage of `npm test`).

| # | mutation, applied on disk | subject | result |
|---|---|---|---|
| M1 | `"minimum": 1` to `"minimum": 2` in the vendored schema (line 89) | drift blob row | **RED**, 1 failed / 8 passed. `expected '3012a969...' to be '438b604e...'`. The byte-count row stayed green (same length), so M1 hit only its subject. |
| M2 | sidecar `"bytes": 7849` to `7850` | sidecar-describes-the-file row | **RED**, 1 failed / 8 passed. `expected 7850 to be 7849` |
| M3 | `maxLength` removed from `ASSERTION_KEYWORDS` | keyword coverage + per-node walk + every maxLength row | **RED**, 12 rows across two files |
| M4 | `"unevaluatedProperties": false` deleted from the schema's `bg` node | the closure walk | **RED**, 3 failed. `these object nodes declare properties and are NOT closed: expected [ '/$defs/bg' ] to deeply equal []`, plus the blob and byte rows, which is correct: editing the vendored file is drift. |
| M5 | `"w": 3400` to `3401` in the vendored vectors | vectors blob row | **RED**, 1 failed / 20 passed |
| M6 | the closed-schema refusal reported at `path: ''` instead of the offending object | the reject-reason POINTER half | **RED**, 4 failed / 17 passed, each naming the derived pointer it expected |
| M7 | the closed-schema message no longer names the key | the reject-reason KEY-NAMING half | **RED**, 4 failed / 17 passed. M6 and M7 fail independently, so the two halves are separate instruments. |
| M8 | `canonicalizeBySchema` deleted from the writer | the writer's erasure rows | **GREEN, AND THAT IS A FINDING.** See below. |
| M8b | `canonicalizeBySchema`'s leftover-key list forced empty | the three direct second-guard rows | **RED**, 4 failed / 31 passed |
| M9 | `Array.from(value).length` to `value.length` in `maxLength` | the code-point unit row | **RED**, 1 failed / 10 passed |
| M10 | `obj.schema !== 1` to `obj.schema !== undefined && obj.schema !== 1` | the ABSENT-key version row | **RED**, 1 failed; **all 21 vector rows stayed green**, which is the claim that row exists to carry |
| M11 | the writer stops using `canonicalJsonPretty` | key order + both fixed-point rows | **RED**, 5 failed / 40 passed |
| M12a | `EMPYREAN_DIR` pointed at a directory that is not a repo | currency, loud on unmeasurable | **4 LOUD SKIPS**, each printing `SKIPPED, NOT PASSED ... CANNOT MEASURE`, never a pass |
| M12b | `branch_that_answers_currency` deleted from the schema sidecar | the currency-steering assertion | **RED**, 3 failed, not skipped |
| M12b2 | the same key deleted from the vectors sidecar | same, in the vectors file | **RED**, 3 failed, not skipped |
| M12c | the pinned revision replaced with an unpublished 40-hex | published-not-local-only, and the same-revision row | **RED**, 2 failed |
| M13 | a blanket refusal appended to the parser's issue list | every accepting control in both files | **RED**, 14 rows |

### M8: the finding, and the retroactive correction

`serializeRegionsDocument` validates on the way out and THEN canonicalizes. The schema is
closed, so `validateAgainstSchema` refuses an unknown key and throws before
`canonicalizeBySchema` is ever reached. Deleting `canonicalizeBySchema` from the writer left
all 21 rows green, **including the three that say "WRITING refuses an unknown key rather
than erasing it"**. Those rows were true sentences about the writer and proved nothing about
the line anyone would name if asked which guard stops an erasure.

The module header had made exactly the wrong claim: *"that refusal is the only thing
standing between a serialize and a silent erasure"*. It is not the only thing, and today it
is not the thing at all.

Corrected in `09040834`: the header now says which guard speaks and that it was MEASURED by
this mutation, and three new rows call `canonicalizeBySchema` DIRECTLY, one per closed
level, because through the writer it is unobservable and a row that cannot go red is not a
row. M8b proves those three are real. 21 rows became 24.

**M8 re-run after the correction is still green, and that is now a recorded property rather
than a hidden gap.** On this schema the two refusals are exactly equivalent: every key
`canonicalizeBySchema` would refuse is a key `unevaluatedProperties: false` already refuses,
so no document exists that distinguishes them and no test can. The second guard is kept for
the amendment that loosens the closure, and it is asserted where it can fail.

Nothing was weakened to reach green: the writer still runs both refusals in the same order.

## Totals

`npm test` in this worktree, foreground, `VITEST_MAX_WORKERS=4`:

```
Test Files  626 passed | 3 skipped (629)
     Tests  9795 passed | 9 skipped (9804)
  Duration  39.91s
failure-class: no failures in this run (629 module(s) reported).
```

Zero failures. The 9 skips are all pre-existing and none is in a regions file: the opt-in
band-art foreground gate (3), the opt-in compose bench (1), the two live-emulator warp rows,
two rows whose `s4_engine` tree is gone from this machine, and `sibling-root`'s step 3,
which cannot run from a linked worktree and says so at length. The whole `npm test` chain
ran, so the fifteen `check:*` gates and `tsc --noEmit` are included in that green.

The four new files measured on their own: `regions-schema-drift` 9, `regions-vectors` 21,
`regions-codec` 24, `json-schema-max-length` 11.

## What is left open

- **`bg.span` is not derived.** Blocked on the background layout library. The hole has a
  row that proves it is open and names what to update when it closes.
- **No existence checks of any kind**, by the contract's design: `preset`, `bg.layoutRef`,
  rectangles inside the act, regions tiling the act, and the `BG_TILE_CAPACITY` union are
  all outside a shape schema.
- **No golden**, because aeon has not built the generator half. When it does, the shared
  artifact is the thing to compare against and these vectors stay what they are.
- **The drawing UI, the migration of existing projects and the region list panel** are
  separate rows and nothing here anticipates them.
- **A re-vendor will need both files at one revision.** The same-revision row asserts it,
  and M12c shows it going red.
