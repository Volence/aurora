# Dash sweep: the non-component `src/` bucket

Branch `parcel/dash-sweep-src`. Owner ruling, 2026-09-05, all tools: no U+2014
and no U+2013 in any user facing text, labels, panel prose, tooltips, refusals
or generated help. The components bucket (`src/**/*.tsx`) was swept earlier the
same day and is recorded in `docs/reviews/2026-09-05-dash-sweep-components.md`.
This parcel is the OTHER half of `src/`: the non-test `.ts` files, plus one
generated stylesheet, plus the generator that writes it.

## Counts, by two independent routes, before and after

Both routes were run on the same tree at the same two points. The scripts live
in the session scratchpad, not in the repo; the gate that replaces them is
`scripts/check-src-dashes.mjs`.

| route | how it decides what is source text | before | after |
|---|---|---|---|
| A: TypeScript AST | classifies every dash by the syntactic node containing it; counts StringLiteral and every part of a template literal, in both spellings; excludes comments by walking to leaf tokens and taking their trivia | **598** in 92 files | **2** in 2 files |
| B: esbuild | transforms each file with the `ts` loader and `minifyWhitespace`, which drops comments outright; counts what survives | **599** in 92 files | **2** in 2 files |

The two agreed file by file at both ends. B is one higher at the start because
it also sees a **regex literal**, `/ <dash>.*$/` in `effects-aeon.ts`, which route A
classifies as non-stringy and reports separately. That regex is not prose but it
is code that READS this file's own prose, and it is discussed below.

A third route, a plain character count over the same files INCLUDING comments,
reconciles with both: **6,388 before, 5,791 after**, a difference of 597, which
is 599 non-comment dashes minus the 2 that remain. The 5,791 are comments and
are not in scope, for the reason written into the gate.

### Proving each route sees a known positive first

A lone after run of zero is unverified, and a comparison that measures nothing on
both sides reports agreement. So before either number was believed, four
mutations were planted in a tracked file and both routes rerun, restoring
between each:

| canary | route A | route B |
|---|---|---|
| a literal em dash in a string literal | +1 | +1 |
| a literal en dash in a template literal | +1 | +1 |
| the backslash-u **escape** spelling | +1, labelled `escape` | +1 |
| a dash in a **comment** (negative canary) | +0 | +0 |

The first attempt at that canary script FAILED SILENTLY and is worth recording:
the em dash arm passed its escape sequence as a printf ARGUMENT rather than in
the format string, so nothing was planted and both routes correctly reported no
change. That reads exactly like "the instrument is broken". The rule it enforces
is the one this whole section exists for: a canary that shows no change is a
canary you have to debug before you may quote the measurement it sits beside.

**No escape spelling exists in this bucket** (both routes: 0). The components
bucket had one, which is why both routes look for it here.

## Two sentences are left, and they are the same finding twice

Both are **verbatim quotations of another tool's own message**, where the dash
belongs to aeon and not to Aurora. Rewriting either would make Aurora quote a
message aeon does not emit, so an author matching a build log would no longer
find it.

1. `src/renderer/providers/effects-preset.ts:2109`, `VARIANT_LINE_0_LAW`. It
   quotes aeon's build refusal for a variant mask that selects palette line 0.
   The identical string is at aeon `engine/effects/palette_dsl.emp:43`, checked,
   not assumed. The sentence Aurora writes AROUND the quotation was repaired.
2. `src/core/formats/raster-binding.ts:625`, inside
   `RASTER_SECTION_BINDING_LIMIT`. It quotes three of aeon's pytest failure
   messages by name so an author can match a build log; one of the three carries
   a dash. The identical string is at aeon
   `tools/test_effects_seam_gate.py:758`, checked.

Both are on the gate's allowlist with those citations, and **an allowance that
matches nothing is a failure**, so neither permission can outlive its subject.

The two assertions that pin quotation 2 were deliberately NOT updated, for the
same reason. Three other assertions in the same files DID move, because they pin
Aurora's own prose around it.

### The brief's hazard 2, answered

The brief warned that `channel-bands.ts` and `scene-ui.ts` derive author-facing
sentences from vendored contracts, and that `channel-bands.ts` parses four exact
literals out of aeon's prose at import time and throws if they move.

**Checked rather than assumed, and nothing had to be refused there.** The
repairs in those two files are to the `fail()` and `throw` MESSAGES, which are
Aurora's own; the four regexes that read the contract carry no dash and were not
touched. Module load is exercised by the suite, which is what proves it.

The vendored documents themselves: `aeon-effects-channel-bands.json`,
`aurora-effects-preset.schema.json` and `aurora-effects-scene.schema.json` carry
**0** U+2014 and **0** U+2013 each. `aurora-effects-preset.schema.provenance.json`
(23) and `bganim-consumer-contract.json` (80) do carry them and were left alone.

**But the count is the wrong reason,** and the hub corrected the brief on this
during the parcel. A vendored file's whole point is byte identity with an
upstream revision, so it must keep upstream's punctuation whatever it is, and
the drift gate that proves the identity is what would go red if a sweep touched
it. So the gate's exclusion is a PATH RULE derived from the presence of a
sibling `.provenance.json`, not from an observation that these files happen to
be clean today. `test/fixtures/effects/ojz_act1_depth.json` carries one right
now, from aeon, and stripping it would be the defect.

The exclusion was proven to work rather than assumed: a `.ts` file carrying a
dash was planted beside a `.provenance.json` sidecar and the gate stayed green;
the sidecar was then deleted and the same file went red. Without that second
arm, "the gate was green" would have been consistent with the exclusion doing
nothing.

## The generated file, fixed at both ends

`src/renderer/styles/theme.css` is inside this bucket and is GENERATED, by
`scripts/gen-theme.mjs` from the Empyrean design tokens. **Both of its dashes are
emitted BY the generator**, in the header string and in the accent section
comment.

Sweeping either end alone is a defect. Editing the `.css` is futile: the next
`npm run gen:theme` puts the dash straight back. Editing the generator alone
leaves the committed artifact stale, and grepping afterwards finds nothing,
because the source is genuinely clean by then. So the two emitted strings moved
in the generator, the file was regenerated, and both landed in one commit
(`4b50e9bf`). Regeneration was then run a SECOND time and added nothing, which
is what proves the artifact and the generator agree rather than having been
edited to look alike.

**One thing went wrong there and was caught by distrusting a clean result.** The
first regeneration was driven with `EMPYREAN_TOKENS` set, because this worktree
is not a sibling of the contract repo. The generator RECORDS WHICH ROUTE IT USED
in the header, so the artifact came back with its provenance line rewritten to
name the environment variable: a change my invocation caused, not one the sweep
wants. The run was redone through the generator's own default sibling route and
the provenance line is byte identical to what was committed before. The token
values were identical either way, which is the check that the two routes read
the same document.

`scripts/` is outside this parcel's scope, so the generator's own COMMENTS were
left; only the two strings it PUSHES INTO THE ARTIFACT moved.

**The general rule this puts in the record**, for the tests bucket after this
one: the population is the files you swept PLUS every artifact a generator
produces from them, and the check is re-running the generator, never a second
grep. `theme.css` is the only tracked file under `src/` that declares itself
generated from a script; the other self-declaring file is a vendored contract.

## The selector check, and its result

**Harness selectors are keyed on strings, and `npm test` never runs the `.mjs`
ones.** A selector this sweep breaks goes red NOWHERE. It stops matching, and
the next person to drive the real app gets "not found" and starts debugging the
app.

**Result: 49 lines across 25 files migrated (`87262540`), and 0 broken
selectors remain.**

### The instrument took three tries, which is the more useful half

* **v1** asked "does this selector match a WHOLE bucket string" and found 14. It
  is blind to the commonest shape here, a title COMPOSED at the component from a
  prefix and a provider fragment: a selector reading
  `startsWith('Layer 1 curve.to <dash> ')` is LONGER than anything in the bucket, so it
  matched nothing and was filed under "about some other surface".
* **v2** asked the opposite containment and missed the same class from the other
  end.
* **v3** anchored on the dash and walked outward counting agreement. It found
  1,088 "breaks" that were almost all harness PROSE: right about the mechanism,
  useless about the extent.
* **What landed** asks the question by CONTEXT rather than by shape. The
  population is every dash inside a string or regex on a line that also mentions
  `title`, `querySelector`, `startsWith`, `includes`, `match`, `test`,
  `textContent` or a matcher; it compares against the WHOLE app's strings, `.tsx`
  included, because a title is routinely a component prefix plus a provider
  fragment; and it tries both containment directions.

|  | before | after |
|---|---|---|
| dash-bearing probes in a selector context | 92 | 68 |
| named an app string before and after (harmless) | 4 | 4 |
| named an app string before, **names nothing now** | **17** | **1**, a false positive |
| named no app string either way | 71 | 63 |

Both arms were shown to measure something before any zero was believed: a
CONTROL (base against base) reports 20 held and 0 broken; a CANARY (base against
a copy with every dash flattened) reports 0 held and 20 broken. Without that
pair, "0 broken" is what an instrument reports when it is looking at nothing.

The one remaining row is `ramp-scroll-mode-harness.mjs:681`, a `check()`
description that happens to contain the word title in backticks, so the context
filter admits it. It addresses nothing and was left.

### Eight of the seventeen were not this parcel's

Saying so is the point rather than a disclaimer, and it was checked by running
the same instrument against the components parcel's own base rather than
guessed. `Scene <dash> <id>`, `rows <dash> constrained...`, `v_offset <dash> ...`
and the composed `<layer> table <dash> ...` select title were all rewritten by the
COMPONENTS parcel at `1c2d6be6..24541886`, which did not migrate the eight
harness sites addressing them. **Its own selector instrument could not see them
for exactly the reason above:** it compared against whole component strings.
They have been dead since that merge. They are fixed here.

### The worst case in the set: two source-mutating fixtures

`scratchpad/band-strip-range-plants.mjs` and
`scratchpad/band-strip-range-poisons.mjs` patch the provider by EXACT SOURCE
TEXT, to plant a defect and prove a row catches it. The text they match on is a
line this sweep rewrote, so the mutation would have failed to apply and the
poison would have reported the row GREEN. **A poison that cannot apply is a
false all-clear, not a failure.** Three `from:` strings updated.

Also migrated: seven harness COMMENTS that quote a string this sweep changed
(the swatch titles, the guide caption, the collision resolution sentence, the
palette tooltips), and one fixture in `map-status-model.test.ts` that echoed the
armed-chunk line in its old spelling.

**What is not verified.** These are drive-the-real-app scripts, and running 25
of them is not something this parcel did. What stands behind that commit is the
instrument above, which tests each selector against the app's actual strings
rather than against a passing run.

## Which edited strings had a test asserting them, and which did not

Measured, not inferred, and by two different measurements because they answer
two different questions.

**Question 1: how many were NAMED by anything?** An instrument takes the string
CONTENT of every pre-sweep dash-bearing string in the bucket, cuts a prose run
of four words from either side of each dash, and asks whether that run appears
as an exact substring anywhere in the test and harness corpus AS IT STOOD AT
MASTER (read from git, because this parcel has since edited some of that corpus).

- **507 distinct strings** carried a dash before the sweep (598 dash characters).
- **128** are named by some test or harness.
- **379 are named by nothing at all.** 75 of those are too short to yield a
  four-word probe and so are unnamed by construction; **304 are genuinely
  unasserted prose.**

**Question 2: how many assertions actually PINNED THE PUNCTUATION?** Being named
is not being pinned: most of the 128 name a part of a sentence that did not
move. So the whole parcel's source changes were kept and every test file it
touched was reverted to master, and the suite run:

> **27 test rows across 19 files went red.**

That is the real coverage of this bucket's punctuation: **27 rows out of 507
strings**. All 27 were updated, which is the same change and not scope creep.

**So the suite staying green is evidence the strings are untested, not proof
nothing broke.** Roughly three of every four user-facing strings in this bucket
have no assertion of any kind, and the only thing standing behind those is that
each was read and repaired by hand.

## Repairs worth arguing with

Almost all 596 repairs are punctuation chosen for the job the dash was doing: a
colon for an appositive or a restatement, a comma or brackets for an aside, a
semicolon for two clauses that stand on their own, a full stop before a
consequence, and "to" or ".." for a range. The ones that are not:

**Code that reads this file's own prose.** `effects-aeon.ts`'s `anchorLine`
strips a gloss off an option label with `label.replace(/ <dash>.*$/, '')`. The two
labels it strips became `off (no deform)` and `divide-by-N (the whole table)`, and the
regex moved with them to a bracket-anchored cut. Leaving it would have printed
the whole gloss into a one-line readout with nothing red anywhere.

**The placeholder glyph.** `use-canvas-constraints.ts` printed a bare em dash as
a CHARACTER, for a palette line with no colour count. It is now `--`, the same
spelling and the same reasoning as the components parcel's `NO_READING`: the
readout joins its fields with a middle dot, so `--` sits between two dots and
cannot be read as one of them.

**Field separators.** Three sites were a dash used as a separator rather than as
punctuation: the Aether client's connection line, the map status bar's
armed-chunk line, and two object-type dropdown labels of the form "id then
name". All four now use the middle dot, which this codebase already spends on
exactly that job in the palette headings and the map status line.

**One rewrite rather than a repunctuation.** `canvas-commit-model.ts` said
"N blocks keep no shape <dash> their ids are past the end of the table". No
punctuation worked, because the tail is a REASON; it now reads "keep no shape
because their ids are past the end". It is the only sentence in the parcel whose
words changed rather than its punctuation.

**One repair was wrong and the suite said so.** `boundary.ts`'s `enforced_by`
field is rendered behind the words "Enforced by: ", so giving it a colon
produced "Enforced by: nothing: this document is legal and builds". It takes a
semicolon instead. That is the kind of defect a substitution pass ships and a
read does not, and it was only visible because a test happened to print the
composed string.

**One assertion improved rather than merely moved.** `coalesced-notices.test.ts`
SPLIT A NOTICE ON THE DASH to pull the paths out of it. It now splits on the
clause it actually wants, which is a better assertion than the one it replaces,
and the sweep is what exposed it.

Nothing else was left. Every one of the 596 took a repair that reads at least as
well as the original.

## The gate: built, and my argument

`scripts/check-src-dashes.mjs`, in the `npm test` chain and available as
`npm run check:src-dashes`.

**It is not ceremony.** The population it watches is at zero, so it is never red
on an unswept bucket, and a bucket that took a day to clear is worth one line of
the test chain. The defect class it catches is real and silent: nothing else in
this repo would notice a dash reappearing in a refusal message, because three of
every four of them are asserted nowhere (measured above).

**A sibling rather than a wider glob, and this is the arguable part.** Widening
`check-tsx-dashes` would make its own name false, and a name that outlives its
scope is how a reader learns to distrust a whole chain. Renaming it instead
would rot the citations in the components parcel's landed review and in
`docs/lane-log.jsonl`, neither of which this parcel gets to rewrite. Two gates,
each honestly named, each stating in its own docblock what it does NOT look at,
is the cheaper of the two mistakes. **If they ever drift, merge them and rename
in one change with the ledger citations updated** rather than letting a third
appear.

Every exclusion is written down with its reason: comments (the design record),
tests (a later pass), `.tsx` (the other gate's), and vendored files (structural,
by sidecar, argued above).

**The generated stylesheet is IN the gate**, scanned raw with comments included,
because in a generated file the comments are the generator's output as much as
the rules are. Its failure message names the generator and says that editing the
`.css` alone is undone by the next regeneration.

**It can see itself.** Its only dash is its own detector regex, and its success
line carries none; that was checked by grepping the gate's OUTPUT, not by
reading its source.

Red first, from commit `777016cc` as the baseline, each mutation printed as
applied and restored before the next:

| mutation | result |
|---|---|
| A: literal em dash in a string literal | rc=1, file, line, column, the sentence |
| B: literal en dash in a template literal | rc=1 |
| C: the backslash-u **escape** spelling | rc=1, labelled `(escape)`, while a character grep over that same line finds nothing |
| D: a dash in the GENERATED stylesheet | rc=1, and it names the generator and the regeneration |
| E: **negative canary**, a dash in a COMMENT | rc=0, still green |
| F: an allowance whose subject is deleted from the source | rc=1, stale allowance named with its aeon citation |
| G: a dash-bearing `.ts` beside a `.provenance.json` sidecar | rc=0; delete the sidecar and the same file is rc=1 |

Mutation C was planted WRONGLY on the first attempt, with two backslashes rather
than one, which the detector still matched for the wrong reason. It was replanted
with a single backslash so the poison resembles the thing it stands for, and the
character grep was run over that exact line to show it sees nothing.

**What I did not build, and think is worth more.** The components parcel
proposed a gate that asserts every title selector in the harness corpus still
matches some app string. This parcel is the evidence for it: that parcel broke 80
selectors, believed it had migrated all of them, and had in fact left eight
dead that its instrument could not see. A gate would have said so the same day.
It still needs design, because it must not go red on the tests bucket's pending
work. It is a proposal here, not a landing.

## A third route, on the SHIPPED artifact, and what it found beyond this bucket

Both counting routes read source. A build was made
(`VITE_AURORA_DEBUG=1 npm run build`) and the same esbuild comment-stripping
count run over `dist/`, which measures what actually ships rather than what the
tree says. The raw count is 2,910, and every one of those is a comment the
debug build preserves; with comments stripped, **291 dashes survive in the
built artifact's strings**. All 291 are attributed, by sampling rather than by
assumption:

| where | count | what it is |
|---|---|---|
| `dist/main/index.mjs` | 140 | `iconv-lite`'s codepage tables. Third party, and not text at all: they are character-set maps that happen to contain the characters. |
| `classicProjectStore` chunk | 80 | `bganim-consumer-contract.json`, vendored, bundled because it is imported. Excluded by the sidecar rule. |
| `index` chunk | 69 | `docs/guides/effects-first-run.md`, imported with Vite's `?raw` and rendered VERBATIM into the Guide tab. |
| `classic-surface-buffer` chunk | 2 | exactly the two sanctioned aeon quotations. |

**So the shipped tool text carries the 2 this parcel sanctioned, and 69 that
belong to a file outside it.** `docs/guides/effects-first-run.md` carries 65
U+2014 and 4 U+2013, and it is not documentation that sits beside the app: it
IS a page an author reads inside Aurora, on the Guide tab. The components
parcel found the same file and corrected exactly one quotation in it, naming
the rest as somebody's bucket. It still is. **It is a real residual under the
owner's ruling and it is named here so the next parcel does not have to
rediscover it**; `docs/` is outside this parcel's scope and it was not touched.

The vendored 80 were checked rather than relayed. `bg-override.ts` reads that
contract through one loud accessor, and every read is a value, a default, a key
name, an ownership tag or a requiredness flag. No `why`, `note` or `$comment`
prose field is read into any rendered string, so none of those 80 reaches an
author. That is the components parcel's claim, re-derived here rather than
quoted.

## Suite

Measured in this worktree, with the full `npm test` chain.

- **7,386 passed, 9 skipped, 0 failed** (510 files passed, 3 skipped).
- Master's stated baseline is 7,387 passed and 8 skipped in a main checkout. The
  totals agree (7,395 either way); the delta is the one row that skips by design
  in a linked worktree, `test/support/sibling-root.test.ts` step 3, which needs a
  main checkout to measure `--git-common-dir`'s relative output shape.
- All ten `check:*` gates green, including the new `check-src-dashes`.

`node_modules` is not present in a fresh linked worktree. It was first satisfied
with a SYMLINK to the main checkout's, and that broke `check-cited-paths`, which
probes `node_modules/` to prove its ignore query works and gets
`fatal: pathspec is beyond a symbolic link`. **The gate was right and the rig was
wrong**: a hardlinked copy fixed it. Worth recording because the failure names a
gate and looks like a gate defect.

## Commits

| sha | what |
|---|---|
| `1d038721` | the effects preset provider, 94 repairs |
| `d70da895` | the effects scene provider, 80 repairs |
| `4b50e9bf` | the GENERATED stylesheet, fixed at both ends in one change |
| `6499c1d6` | the agent tool descriptions and the effects core, 158 repairs |
| `07058678` | `src/core`, 120 repairs across 29 files |
| `2434f9d9` | `src/renderer` and `src/main`, the last 149 |
| `87262540` | the CDP selectors this sweep broke, and eight the last one did |
| `777016cc` | the ratchet, red first six ways |
