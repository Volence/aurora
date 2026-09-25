# EXPIRY-LISTS-WITH-NO-READER: the census, and the fixes (review packet, 2026-09-25)

ROADMAP row 212. Branch `parcel/expiry-lists-census`, cut from aurora master `778228b8`.
Peer revisions read, through git objects only (`git -C ../<peer> show <rev>:<path>`, never a
working tree): aeon `origin/master` **`a0c63764`** (it was `dbbacd33` when the census began; the six
commits between touch only clip tooling, and every aeon fact below was re-checked or is re-derived
by a test at the tip); empyrean `origin/main` `4b893285`; oracle `origin/main` `669a8e0`.

## 1. What the row asked, and what a census here can and cannot say

The finding it generalises (lane log `2026-09-10T10:02:43Z`): `ONLY SECTION 5 IS WIRED` was pinned
by three `toMatch` rows that were green exactly while the sentence was false. A test that pins a
sentence's WORDING holds the claim still; it does not read it. The row: census every durable,
shipped or read-by-someone sentence that states a present-tense fact about something that can
change, a hold, or an end condition; name each one's automated reader (NONE, WORDING-PIN,
DERIVED); say whether it is TRUE today; fix the false ones and the pin-only ones.

**Reader classes as used below.** NONE: no test or gate reads it. WORDING-PIN: a test or gate
matches its text (including an absence pin, and an exemption row that excuses it from a check).
DERIVED: a test asserts the claim against its source. "DERIVED at runtime" means the sentence is
only emitted when code has computed the condition it states (a refusal, an empty state, a drift
guard's own message); it is true by construction and is not an expiry defect.

## 2. Populations and the spellings tested

A census reports the spellings it tested; its silence on any other spelling is not a result.

**(a) Shipped strings in `src/`** (non-test `.ts`/`.tsx`). Extracted with the TypeScript AST, not
grep: every string literal, template literal and JSX text, with `+` chains and `[...].join()` arrays
of literals folded into one sentence. **16,338 strings.** Patterns, applied per string (all
case-insensitive except P3b):

| id | pattern | hits |
|---|---|---|
| P1 | `\buntil\b` | 33 |
| P2 | `\byet\b` | 31 |
| P3 | `\bonly (sections?\|[0-9]+\|one\|two\|three\|four\|five\|six)\b` | 3 |
| P3b | `\bONLY\b` (case-sensitive) | 8 |
| P4 | `\bno (section\|act\|zone\|preset\|region\|game\|peer\|consumer\|reader\|caller)s? (has\|have\|is\|are\|uses\|reads\|writes\|exists?)\b` | 5 |
| P5 | `currently\|for now\|at the moment\|today\|as of\|at present\|right now\|presently` | 13 |
| P6 | `while ... (is\|are\|remains\|stays) (open\|pending\|unshipped\|unwired\|missing\|blocked)` | 2 |
| P7 | `ships\|shipped\|lands\|landed\|once ... (lands\|ships)` | 41 |
| P8 | `(un)?wired` | 9 |
| P9 | an ISO date `20dd-dd-dd` | 13 |
| P10 | `(verified\|measured\|checked\|read) at` or `(aeon\|sigil\|oracle\|empyrean\|seraph) <sha>` | 5 |
| P11 | `no longer\|not any more\|anymore` | 91 |
| P12 | `nothing (reads\|consumes\|uses\|writes\|calls)\|no (reader\|consumer\|caller)\|does not (yet )?(read\|exist\|ship)\|is not (yet )?(read\|built\|implemented\|supported)` | 33 |
| P13 | `not (yet )?(implemented\|supported\|available)\|coming soon\|planned\|TODO\|pending\|later version\|future version\|when ... (ships\|lands\|exists)` | 15 |

**262 of 16,338 strings matched at least one.** Every one was read. The full per-row table is
§8 (appendix A).

**Spellings NOT in the pattern set, stated because two of the ten false claims below were found
outside it by reading:** a plain present-tense claim about a peer with no temporal word ("aeon's
bake refuses it", "reached by neither a table row nor a section binding"). That population, strings
naming aeon, the engine, the build, the generator, sigil or oracle and longer than 40 characters,
is **261 strings** (P14). It is enumerated by the same extractor and **NOT truth-checked row by
row** in this parcel; the rows below that belong to it were reached by following a hit. It is the
largest OPEN item (§7).

**(b) Code comments** asserting a fact about another repo or a runtime-derived set. Comment blocks
extracted with the TypeScript scanner (6,300 blocks, consecutive `//` lines merged). Population:
blocks naming a suite peer (`aeon|sigil|oracle|empyrean|seraph`) that contain a snapshot spelling
(`not yet`, `none yet`, `no <x> yet`, `until (aeon|it|the|...) ... (lands|ships|adds|exists|threads|arrives|builds)`,
`ONLY SECTION`, `only sections? N`, `currently`, `today`, `is (not )?wired`, `unwired`, `still (does not|has no|carries|reads|refuses)`).
**69 blocks, 109 sentences.** Truth for each was judged by a read-only sub-agent against aeon
`a0c63764` through git objects; every FALSE that was then fixed was spot-re-verified by hand, and
one of its TRUE verdicts is overruled (C3, §4.2). Full table: §9 (appendix B). Comments have no
automated reader by nature (`check-cited-paths` checks a comment's paths, not its claims), so the
reader column is NONE throughout.

**(c) Boot docs** `docs/OVERSEER.md`, `-REFERENCE.md`, `-REVIEW-BARS.md`, `-PARKED-ROWS.md`, same
spellings as (b) plus `expires?`: 25 lines. History files (`docs/reviews/*`, `lane-log.jsonl`,
`decisions.jsonl`, `OVERSEER-LOG.md`) are out of scope by the brief. Not edited here (§6).

**Plus the in-app guide**, `docs/guides/effects-first-run.md`, imported with `?raw` and rendered
verbatim in the Guide tab, so it is shipped text (scope a) though it lives under `docs/`. Grepped
with the (a) spellings: 34 lines. See §4.1 for why it was fixed here despite "src/test only".

## 3. Totals

**(a) strings, 262 rows:** 26 hand-judged in the expiry/snapshot class (E), 166 runtime-gated (R,
true by construction), 70 not an expiry claim (S: a timeless rule, a hardware fact, or this
editor's own fixed behaviour).

Of the 26 E rows, plus four found by reading outside the patterns (the LIMIT 2 short body at
`effects-preset.ts:430`, the guide's quoted refusal, the guide's installer sentence, and
`crossover-audit.ts:632`'s R2 note), 30 rows, before this parcel:

| | TRUE | FALSE or lapsed | total |
|---|---|---|---|
| reader NONE | 6 | 6 | 12 |
| reader WORDING-PIN only (incl. an absence pin, an exemption row, a CDP-harness regex) | 2 | 4 | 6 |
| reader DERIVED (in part or whole) | 11 | 0 | 11 |
| not re-derived (P14 population) | | | 1 |

Every FALSE one had a reader of NONE or WORDING-PIN. **No claim with a DERIVED reader was false.**
That is the row's hypothesis, and on this tree it held in all 29 judged cases. The 10 false or
lapsed ones had been false for up to 26 days (set_effects_preset's "installs nothing yet", written 2026-08-30 and lapsed the same day at aeon c9a462be).

**(b) comments, 109 sentences:** TRUE 60, FALSE 19, HISTORICAL-OK 28 (dated readings or explicit
past tense, still correct as written), UNCLEAR 2. Reader NONE for all.

**(c) boot docs, 25 lines:** 2 FALSE or lapsed, listed for the overseer in §6; the rest are rules,
dated history, or hypotheticals.

## 4. Fixes, each with its red-first proof

Every new or rewritten row was committed first, then mutated on disk (the mutated line quoted
below), run red, restored with `git restore --source=HEAD <path>` from the committed baseline, and
run green again. Every derived row reads peers through `test/support/peer-repo.ts` (git objects at
`origin/master`), and `ctx.skip`s with a named reason when the peer or revision is absent; none
falls back to a working tree. Each reddens on the PEER's change, not ours, which is the chosen
cost: a frozen pin goes stale in silence.

### 4.1 FALSE claims corrected (strings and the in-app guide)

| # | site | claim | truth at aeon a0c63764 | reader before | reader after | commit |
|---|---|---|---|---|---|---|
| F1 | `src/main/editor-methods.ts` get_collision_region description (MCP) | "as of 2026-08-29 the bake does not read this field, so NOTHING downstream refuses it" (crossover value 3) | FALSE since aeon 8a4313b5 (2026-09-02): `bake_plane_cell` raises on `XOVER_RESERVED` | NONE | DERIVED: `test/collision/crossover-reserved-bake-claim.test.ts` (4 rows) | ec58017a, ed823206 |
| F2 | `src/main/editor-methods.ts` set_effects_preset description (MCP) | "binding it ... and even that installs nothing yet:" + RASTER_SECTION_BINDING_LIMIT | FALSE: the appended constant itself says a binding on a wired owner installs; lapsed at aeon c9a462be (2026-08-30) | NONE | clause removed; the install fact is left to the constant, whose reading is DERIVED by `raster-binding-threaded-set.test.ts` | 7d86fe11 |
| F3 | `src/core/formats/bg-binding.ts` BG_SECTION_BINDING_LIMIT (2 MCP descriptions, 2 agent replies) | evidence: "every section of the shipped act still carries sec_bg_layout: default" | FALSE: aeon deleted `Sec.sec_bg_layout` 2026-09-16 (engine/structs.emp, Sec 26 -> 22). The conclusion (no aeon build reads a sidecar bgLayoutRef) is TRUE and kept | WORDING-PIN `toMatch(/sec_bg_layout: default/)`, green exactly while false | DERIVED: 3 rows in `agent-handler.bg-binding.test.ts` | 7f152eb0 |
| F4 | `src/renderer/components/regions/RegionsPanel.tsx` no-regions hint | "Regions arrive from Migrate sections below, or from painting (step 8, not built yet)" | FALSE both halves: step 8 shipped, and over an act with no document the rectangle toasts `NO_REGIONS_HERE` and makes nothing | NONE | clause removed; the hint now states what the map does (NONE; nothing left to expire) | c82de155 |
| F5 | `src/renderer/components/setup/ProjectSetupTab.tsx` aeon card | "the full mapping-layer editor arrives when aeon becomes a profile (Stage 3)" | LAPSED: Stage 3 passed, aeon is not in core/project/profiles/ | NONE | promise removed | ecca8c5c |
| F6 | `docs/guides/effects-first-run.md` §6 (rendered in-app) | aeon refuses with "no preset threads `ojz_act1_sec_raster(sec: N)`" | FALSE since aeon bcd844aa: `effects_seam_gate.py` prints `no preset threads {fn}(preset: {rec}_KEY)` | an EXEMPTION: `check-guide-text.mjs` NOT_A_LABEL row "aeon build message, quoted" excused it from every check | DERIVED: `guide-aeon-quote.test.ts` (chooser from `rasterChooserName`, shape from aeon's f-string); plus every aeon path the guide backticks must exist | 32fd05b1 |
| F7 | `src/renderer/providers/effects-preset.ts` LIMIT 2, long and short bodies (panel + agent reply) | reachable by "neither a table row nor a section binding" | FALSE on OJZ act 1 (REGION mode since aeon e2af59ea): aeon's own check names a region row's rasterRef as the installer | WORDING-PIN `/neither a table row nor a section binding/`, plus a CDP-harness regex on the short body | DERIVED: installers read out of `test_every_preset_document_is_REACHABLE`'s message | ce217cb2 |
| F8 | `docs/guides/effects-first-run.md` §6 | "exactly two installers: a rasterRef in some section's sidecar, or a row in aeon's DEBUG raster table" | FALSE, same fact as F7 | NONE | DERIVED: same derivation, row in `guide-aeon-quote.test.ts` | 453b2590 |

**Why F6 and F8 were edited although the brief says "src/test only".** The guide is not a boot
doc: `guides.ts` imports it with `?raw` and the app renders it verbatim, and the brief's own scope
(a) names "guide text". The two instructions only conflict if "src/test only" is read by path
rather than by what ships. Read by what ships, it is in scope. Flagged here so the overseer can
overrule.

**One fix broke a gate, and the gate was right.** F1's first form concatenated the clause with a
bare `+ IDENT`, which makes `check-prose-constants.mjs`' fold return null for the whole description,
so the gate silently dropped `get_collision_region` from its population and reported the
description's `Max 4096 cells per call` exemption stale (npm test EXIT=1). The clause now rides in a
template hole, which the gate folds to a space (ed823206). A reminder that `+ SOME_CONSTANT` in a
description, as the pre-existing `+ RASTER_SECTION_BINDING_LIMIT` and `+ BG_SECTION_BINDING_LIMIT`
sites do, takes that description out of the prose-constants population; listed OPEN (§7).

### 4.2 TRUE claims whose only reader pinned wording: derived rows added

| # | site | claim | truth | reader before | reader after | commit |
|---|---|---|---|---|---|---|
| D1 | `effects-preset.ts` NO_PREVIEW (panel title) | a dated EXPIRES list: (a) the capture directory leaves aeon or its README stops saying so, (b) a second section or camera position is measured, (c) this editor draws a band | not expired: (a) README at a0c63764 still says VERDICT: BAND SEEN, $0EA4, $0000, and 4a4d3474 is on origin/master; (b) exactly one capture README carries a band verdict | WORDING-PIN (4 rows pinned the list's text; none evaluated it) | DERIVED for (a); a stated PROXY for (b); (c) has no derivation and the docblock now says so and names who owes the retirement | 328e5180 |
| D2 | `bg-anim-aeon.ts` SHIP_SILENT_OBLIGATIONS | "They no longer refuse the build" | TRUE: `inject_editor_bg.py` returns the decline with status 0 ("THIS IS THE TWINS DECLINING, NOT A REFUSAL") | WORDING-PIN (absence of the retired wording) | DERIVED, with a control at aeon 01a45ede^ where both conditions raised | dfe71e5c |

### 4.3 Red-first proofs (mutation on disk, then the red, then the restored green)

| row(s) | mutation quoted from `git diff` | red |
|---|---|---|
| F1 claim row | `'rule R1 makes it a bake hard error, and aeon\'s bake does not enforce it: ...'` | `aeon origin/master RAISES on XOVER_RESERVED in bake_plane_cell, and CROSSOVER_RESERVED_BAKE_CLAUSE claims the opposite` (1 failed / 3 passed) |
| F1 shipped row | description restored to `... (rule R1 specifies a bake hard error; as of 2026-08-29 the bake does not read this field, so NOTHING downstream refuses it), '` | `expected 'READ a w*h CELL rectangle ...' to contain 'rule R1 makes it a bake hard error, a...'` (1 failed / 3 passed) |
| F1 control | not a mutation: the detector is run at aeon `8a4313b5^`, where `XOVER_RESERVED = 3` exists and nothing raises, and must answer false | green, so the detector does discriminate |
| F3 field row | constant restored to `... bgLayoutRef and every section of the shipped act still carries sec_bg_layout: default, so ...` | `BG_SECTION_BINDING_LIMIT names sec_bg_layout, which engine/structs.emp at aeon origin/master does not declare` (1 failed / 16 passed) |
| F3 key-read row | `const TOOLS = ['tools/*.py'];` (test exclusion dropped) | `expected [ 'tools/test_effects_gen.py', 'tools/test_regions_doc.py' ] to deeply equal []`, which also proves the detector sees a quoted bgLayoutRef where one exists |
| F6 quote row | guide restored to `` `ojz_act1_sec_raster(sec: N)`") until that line is added. `` | `the guide quotes "ojz_act1_sec_raster(sec: N)", but aeon's refusal names ojz_act1_preset_raster(preset: <Record>_KEY)` (1 failed / 1 passed) |
| F6 path row | `` `tools/level_staleness.py` `` -> `` `tools/level_staleness_gone.py` `` | `MEASURED: tools/level_staleness_gone.py is ABSENT at origin/master (a0c63764...)` (1 failed / 1 passed) |
| F7 | short body restored to `'A preset also needs a row in aeon\'s band-demo table or a section binding to be reachable '` | `aeon's reachability check counts a region row; LIMIT 2 (short) does not name it` (1 failed / 35 passed) |
| F8 | `(a region row, or on an` -> `(a regional row, or on an` | `aeon's reachability check counts a region row; the guide's installer sentence does not name it` (1 failed / 2 passed) |
| D1 (a)+(b) | `const TIP = '4a4d3474^';` (evaluate before the capture existed) | `aeon 4a4d3474 is not on 4a4d3474^` and `EXPIRED (b)? ... expected [] to deeply equal [ Array(1) ]` (2 failed / 33 passed) |
| D1 (a) README check | ``const README = `${CAPTURES}/2026-08-29-d41/README.md`;`` (an aeon capture with no band verdict) | `EXPIRED (a): docs/research/reference_captures/2026-08-29-d41/README.md no longer carries its verdict` (2 failed / 33 passed) |
| D2 | `const src = read(ctx, '01a45ede^');` (the claim row evaluated where aeon still refused) | `declines-with-status-0=false, raises-about-view-twins=true. SHIP_SILENT_OBLIGATIONS says the conditions no longer refuse the build` (1 failed / 25 passed) |
| D2 control | not a mutation: its FIRST run was red, `expected { declines: false, refuses: false } to deeply equal { declines: false, refuses: true }`, because aeon splits the phrase across adjacent string literals. The detector was widened to allow quotes in the gap, and the control went green. The control caught a detector that would have been green forever on a refusal. | |

Every restored file was checked clean (`git status --short` empty) and the file re-run green before
the next step.

### 4.4 FALSE code comments corrected (scope b)

Twelve comment sentences about aeon were false at a0c63764 and are annotated in place with a
dated `[FALSE NOW (...)]` note, keeping the original as the record (08a932e7, plus ec58017a for the
two crossover comments):

- `crossover-audit.ts` (2 places) and `collision-word.ts`: "R2 is still unimplemented / nothing
  downstream catches a mistake / the bake does not read 15:14". aeon 8a4313b5 (2026-09-02) made
  `bake_plane_cell` raise on 3 AND put R2 in `ojz_strip_gen.py` `apply_editor_collision_overlay`
  ("RULE R2 — SELF-MARKS ARE REFUSED HERE"). **C3 overrules the sub-agent**, which read
  `collision_pipeline.py`'s "R2 IS NOT IMPLEMENTED" docstring and marked the comment TRUE: that
  docstring is about `bake_plane_cell` only, one layer shallower than the overlay that refuses.
  The same shallow read produced the 2026-09-09 "re-checked" note this parcel corrects.
- `scene.ts` drift "does not build today"; reels "aeon has no magnitude ensure yet";
  `adapter.ts` "editor/effects/ does not exist in the aeon tree"; `raster-binding.ts` Sec5
  "byte-identical to Plain" and "already disagrees with aeon's ruling prose";
  `SectionPicker.tsx` section 0 "until aeon threads it"; `effects-aeon.ts` patchable "NOT reachable
  from the editor path"; `preset-lag.ts` "ON A BRANCH, NOT ON THEIR MASTER" (and the "unmerged"
  sentence under it); `section-wiring.ts` the 2026-09-02 "today" parse numbers; `bg-binding.ts`
  "no aeon generator reads {zone}_bglib.json".

## 5. Suite totals

Run in this worktree, `VITEST_MAX_WORKERS=4 npm test`, foreground, redirected to a log in the session scratchpad (not the tree, so it cannot be committed by accident), read for the summary lines.

| | Test Files | Tests | failure-class | EXIT |
|---|---|---|---|---|
| before (base 778228b8) | 668 passed, 3 skipped (671) | 10421 passed, 13 skipped (10434) | no failures (671 modules) | 0 |
| after (fix commits, at ed823206) | 670 passed, 3 skipped (673) | 10436 passed, 13 skipped (10449) | no failures (673 modules) | 0 |

+2 files, +15 tests: crossover-reserved-bake-claim (4), guide-aeon-quote (3), bg-binding derived
rows (3), NO_PREVIEW expiry rows (2), LIMIT 2 installers (1), ship-silent derived rows (2). The
two pins removed (`/sec_bg_layout: default/`, `/neither a table row nor a section binding/`) were
expectations inside existing rows, not rows.

## 6. Boot-doc items for the overseer (not edited here)

| site | claim | truth | read at |
|---|---|---|---|
| `docs/OVERSEER.md:290` | "⚠ RELAY, not yet in the committed record" (the context-clear rule, relayed 2026-09-09) | FALSE: empyrean `origin/main:docs/OVERSEER.md:68` carries it, with the owner's words verbatim. The hedge "a successor must not read this as an owner directive witnessed here" is now stale in the cautious direction | empyrean 4b893285 |
| `docs/OVERSEER-REFERENCE.md` (the `write_vram` row, "When `write_vram` is eventually built, require `bypassesVdpPort: true` in the reply") | a conditional requirement | LAPSED: oracle serves `emulator/write_vram` (`crates/oracle-aether/src/engine.rs:496`), and its docblock states the port-bypass property "in §6 rather than as a caveat on every reply"; no `bypassesVdpPort` field was found in the reply. Whether that satisfies Aurora's condition is a ruling, not a census call | oracle 669a8e0 |

The other 23 matched boot-doc lines are rules, dated history, or hypotheticals, and state their
own dates; none was found false.

## 7. What is left OPEN, and why

1. **The P14 population: 261 shipped strings that name aeon, the engine, the build or a peer, not
   truth-checked row by row.** F7's short body and F8 were found by reading, outside every
   pattern, and so was the (TRUE) crossover R2 note; the pattern set alone would have missed them. It is the
   biggest remaining exposure and the natural next row. Suggested shape: the same extractor, a
   sub-agent truth pass like §2(b)'s, and derived rows for the claims that turn out load-bearing.
2. **`ramp-scroll-mode.ts:284` (panel string) and its docblock (comment C25): PARTLY FALSE on a
   region-mode act.** The `act-unset` sentence says the section's scroll config is "aeon's
   hand-authored `act_parallax_config`". At a0c63764 the engine's precedence is `rg_parallax` >
   preset `ep_parallax` > act default, the act default is a generated chooser
   (`ojz_act1_act_default(hand: ParallaxConfig_OJZ_Default)`), and section 5's record carries
   `ParallaxConfig_OJZ_Underwater`. This is a derivation gap in `rampScrollBinding` (it reads
   sidecar sceneRefs, not region rows or preset parallax), not copy, so it is not patched with
   words here. BLOCKED on a model change that this parcel's scope does not include.
3. **Guide §6's section-mode framing.** Beyond F6/F8, §6 still teaches bindings as a section
   sidecar's `rasterRef` ("it reads the sidecar's rasterRef and says nothing at all about a section
   that has none"), while OJZ act 1 is in region mode. A rewrite of a teaching section is the
   owner's copy, not a census fix.
4. **TRUE claims with reader NONE that could take a derived row cheaply:** `RegionsPanel.tsx`
   "Engine-gated until part 2 lands" (aeon `effects_gen.py:3784` refuses any `bg.layoutRef` but
   `@act`); the row-remap "engine-side guard aeon landed" (`effects-aeon.ts:519`,
   `scene-ui.ts:1730`; aeon `scene_dsl.emp:1067` ensures `< 512`); `crossover-audit.ts:632` "aeon's
   bake refuses it (rule R2)"; `DonorsPanel.tsx` "gitignored in aeon". Listed, not churned: each is
   true today.
5. **RASTER_SECTION_BINDING_LIMIT's other dated readings** (`EditorRaster_OJZ_Act1_Bindings is 2`
   at `effects_scenes.emp:315`, `raster:` at `:1739`/`:1797`, "bindings moved at e2af59ea") are TRUE
   at a0c63764 and dated, but only the wired-homes reading is derived. Line numbers are the most
   fragile of them.
6. **Six FALSE comments about Aurora itself** (outside scope b as briefed, which is comments about
   ANOTHER repo or a runtime-derived set), reported by the sub-agent and not re-verified or edited
   here: C2 `rasterize.ts:235` ("nothing produces one today": marquee save-as-chunk makes any
   size), C10 `region-marquee.ts:445` (both consumers fixed), C34 `scene.ts:358` (decline_borrow is
   an enabled option), C70 `push-palette.ts:64` ("aeon-only caller": no production caller), C79
   `use-anchored-zoom.ts:5` (the 16000px cap is reachable), C103 `canvas-file.ts:1` (the pins now
   exist). For the owning lanes.
7. **`+ IDENT` in MCP descriptions hides them from `check-prose-constants`.** Pre-existing at the
   `RASTER_SECTION_BINDING_LIMIT` and `BG_SECTION_BINDING_LIMIT` sites; the gate counts
   unfoldable prose on its summary line, so it is disclosed, but those descriptions are outside
   its population.
8. **Two UNCLEAR comments** (C71 oracle `serverName`, C77 "cheap today" performance) and one E row
   not re-derived (`effects-aeon.ts:4893`, "DEBUG BUILDS ONLY") remain unjudged.
9. **Runtime.** Nothing here needed the emulator. The changed panel strings (F4, F5, F7) were not
   looked at in the running app; the CDP harness regex for LIMIT 2 was updated to the new wording
   and not run (`scratchpad/band-preset-harness.mjs`). [TAG-RUNTIME] for the overseer if a
   screenshot is wanted.

## 8. Appendix A: every matched shipped string (262 rows)

Site is `file:line` at base 778228b8 (the line where the string or its `+` chain starts). Class: E
= expiry/snapshot claim, hand-judged; R = emitted only when code has computed its condition (true by
construction); S = not an expiry claim (a rule, a hardware fact, this editor's fixed behaviour).
For R and S rows the reader column is a heuristic: "possible pin" means some test, gate or harness
shares a five-word window with the sentence, which is where a wording pin would be, not proof of
one. Excerpt = the matched sentence(s), truncated.

| # | site | patterns | excerpt | class | truth | reader | action |
|---|---|---|---|---|---|---|---|
| S1 | `src/core/art/canvas-file-format.ts:280` | P1_until | the canvas is unconstrained until this is fixed, and the sidecar file will not be overwritten on save | R | by construction (state-gated) | DERIVED at runtime | none |
| S2 | `src/core/art/canvas-file-format.ts:302` | P11_nolonger | this PNG's colours no longer match its sidecar, as if another tool (e.g. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S3 | `src/core/art/indexed-png.ts:398` | P13_planned | interlaced PNGs are not supported; | S | n/a (not an expiry claim) | NONE | none |
| S4 | `src/core/collision/collision-region-read.ts:229` | P3b_ONLY_caps | read cells[][].sub ${…} full block ${…} vertical face ${…} hangs from the top ${…} rises to the right ${…} rises to the left ${…} flat parti | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S5 | `src/core/editing/bg-override-art.ts:123` | P12_nothing_reads | band ${…} does not exist (the document has ${…}) | R | by construction | DERIVED at runtime | none |
| S6 | `src/core/editing/bg-override-band.ts:261` | P12_nothing_reads | tile animation ${…} does not exist (the document has ${…}) | R | by construction | DERIVED at runtime | none |
| S7 | `src/core/editing/map-clipboard.ts:431` | P3b_ONLY_caps | collision is stored per 16px block, so this selection is ART ONLY. | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S8 | `src/core/editing/migrate-sections.ts:527` | P4_no_X_has | the act descriptor could not be read, so no section has a preset to bind and 'preset' is required on every region: | S | n/a (not an expiry claim) | possible pin (4 file(s) share a 5-word window) | none |
| S9 | `src/core/editing/migrate-sections.ts:647` | P12_nothing_reads | aeon deleted the section fields they fed, for having no reader) | S | historical | NONE | none |
| S10 | `src/core/formats/bg-binding.ts:42` | P7_ships | It persists in the section's .meta.json sidecar and the viewport composites it, but no aeon generator reads a per-section bgLayoutRef and ev | E | FALSE (evidence clause) | WORDING-PIN | FIXED + pin replaced by 3 DERIVED rows |
| S11 | `src/core/formats/bg-override/bg-anim-art.ts:144` | P12_nothing_reads | band ${…} does not exist (the document has ${…}) | R | by construction | DERIVED at runtime | none |
| S12 | `src/core/formats/bg-override/bg-anim-band.ts:1222` | P12_nothing_reads | band ${…} does not exist (the document has ${…}) | R | by construction | DERIVED at runtime | none |
| S13 | `src/core/formats/bg-override/bg-override.ts:1005` | P7_ships | the no-bands document has NO 'anims' key at all (that is what the consumer's own gate asserts of the shipped file). | S | n/a (not an expiry claim) | possible pin (2 file(s) share a 5-word window) | none |
| S14 | `src/core/formats/bg-override/bg-override.ts:1077` | P1_until | Shrink or drop tile animations until the total fits. | R | by construction (state-gated) | DERIVED at runtime | none |
| S15 | `src/core/formats/bg-override/bg-override.ts:1162` | P3b_ONLY_caps | The consumer wraps "${…}" ONLY when "anims" is absent, so it would silently ignore one of them and bake the other. | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S16 | `src/core/formats/effects/channel-bands.ts:102` | P11_nolonger | it is computed from these sentences, and a warning built on a rule the contract no longer holds is worse than no warning. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S17 | `src/core/formats/effects/channel-bands.ts:111` | P11_nolonger | no longer carries a "${…}" string | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S18 | `src/core/formats/effects/channel-bands.ts:122` | P11_nolonger | no longer names the 'game' its bands belong to | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S19 | `src/core/formats/effects/channel-bands.ts:129` | P11_nolonger | no longer states that its numbers are SCREEN LINES, 1:1 with the authored patchable(lo:, hi:), and that they must not be converted. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S20 | `src/core/formats/effects/channel-bands.ts:140` | P11_nolonger | no longer says that travel > lines is a CERTAIN refusal, the only thing Aurora warns on | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S21 | `src/core/formats/effects/channel-bands.ts:143` | P1_until P11_nolonger | no longer says that travel <= lines is CANNOT TELL and never a clearance. / until then it deliberately cannot | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S22 | `src/core/formats/effects/channel-bands.ts:148` | P11_nolonger | no longer says that 'lines' is an INCLUSIVE COUNT over [lo, hi], which is what makes travel == lines the widest sweep that fits rather than  | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S23 | `src/core/formats/effects/channel-bands.ts:189` | P1_until P9_date P10_revision P11_nolonger | no longer states the fit formula as "PEAK-TO-PEAK TRAVEL (2 * (256 >> amp_shift), whole pixels) EXCEEDS channels[c].lines". / it was wrong b | R | dated history in a drift message | DERIVED | none |
| S24 | `src/core/formats/effects/channel-bands.ts:230` | P1_until | Until they agree, the band warning is computed from a quantity the panel does not display | R | by construction (state-gated) | DERIVED at runtime | none |
| S25 | `src/core/formats/effects/channel-bands.ts:268` | P11_nolonger | no longer carries a 'channels' object | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S26 | `src/core/formats/effects/channel-bands.ts:276` | P11_nolonger | channel ${…} no longer declares an integer '${…}' | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S27 | `src/core/formats/effects/channel-bands.ts:288` | P11_nolonger | channel ${…} no longer names the source line it is declared on | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S28 | `src/core/formats/effects/channel-bands.ts:321` | P11_nolonger | no longer describes what happens at the '${…}' edge | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S29 | `src/core/formats/effects/channel-bands.ts:329` | P11_nolonger | 'edges.${…}.note' no longer says ${…}: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S30 | `src/core/formats/effects/curve-rate.ts:121` | P9_date | docs/witness/depth-curve-rate-2026-09-06.md (an aeon path) | S | n/a (not an expiry claim) | NONE | none |
| S31 | `src/core/formats/effects/json-schema-subset.ts:183` | P7_ships P12_nothing_reads P13_planned | JSON Schema keyword "${…}" at ${…} is not implemented by json-schema-subset.ts. / Implement the keyword (and extend SUPPORTED_KEYWORDS) befo | R | by construction | DERIVED at runtime | none |
| S32 | `src/core/formats/effects/json-schema-subset.ts:192` | P12_nothing_reads P13_planned | an empty type array at ${…} is not implemented | R | by construction | DERIVED at runtime | none |
| S33 | `src/core/formats/effects/json-schema-subset.ts:197` | P12_nothing_reads P13_planned | type ${…} at ${…} is not implemented by json-schema-subset.ts | R | by construction | DERIVED at runtime | none |
| S34 | `src/core/formats/effects/json-schema-subset.ts:247` | P13_planned | not implemented. | S | n/a (not an expiry claim) | NONE | none |
| S35 | `src/core/formats/effects/json-schema-subset.ts:289` | P12_nothing_reads P13_planned | type "${…}" is not implemented | R | by construction | DERIVED at runtime | none |
| S36 | `src/core/formats/effects/json-schema-subset.ts:627` | P7_ships P12_nothing_reads P13_planned | 'anyOf' over an object value is not implemented; / Implement it before the schema ships that shape. | R | by construction | DERIVED at runtime | none |
| S37 | `src/core/formats/effects/json-schema-subset.ts:729` | P13_planned | boolean and array schemas are not implemented | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S38 | `src/core/formats/effects/preset-lag.ts:427` | P9_date | 2026-09-04 | E | TRUE (premise empty) | DERIVED (schema-drift lag row) | none |
| S39 | `src/core/formats/effects/preset-lag.ts:435` | P2_yet | Not consumed by the engine yet. | E | TRUE (renders nothing) | DERIVED | none |
| S40 | `src/core/formats/effects/preset.ts:710` | P11_nolonger | aurora-effects-preset.schema.json no longer states ${…} at ${…} in the shape ${…} that this module reads it from. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S41 | `src/core/formats/effects/preset.ts:761` | P11_nolonger | aurora-effects-preset.schema.json no longer carries the "NEITHER SIDE CONVERTS, 1:1" sentence that EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S42 | `src/core/formats/effects/preset.ts:859` | P11_nolonger | aurora-effects-preset.schema.json no longer bounds ${…} with both a numeric minimum and maximum, which this module reads its range from. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S43 | `src/core/formats/effects/preset.ts:911` | P11_nolonger | aurora-effects-preset.schema.json no longer carries a top-level oneOf, which is where the exactly-one-program rule lives and where EFFECTS_P | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S44 | `src/core/formats/effects/preset.ts:1222` | P11_nolonger | aurora-effects-preset.schema.json's two ramp display sentences no longer agree: / One of the two moved, or j no longer starts at 1. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S45 | `src/core/formats/effects/preset.ts:1353` | P11_nolonger | aurora-effects-preset.schema.json no longer states the worked NEGATIVE fp16 example ("{whole: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S46 | `src/core/formats/effects/preset.ts:1365` | P11_nolonger | the worked fp16 example in aurora-effects-preset.schema.json is no longer NEGATIVE, so it no longer exercises the sign rule it exists to sta | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S47 | `src/core/formats/effects/preset.ts:1371` | P11_nolonger | the worked fp16 example in aurora-effects-preset.schema.json no longer distinguishes the correct value from the naive one, so it can no long | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S48 | `src/core/formats/effects/preset.ts:1445` | P10_revision P11_nolonger | aurora-effects-preset.schema.json no longer declares $defs.base_swap as an ARRAY (read: / Since empyrean 8f56c2c the key is a LIST of per-pl | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S49 | `src/core/formats/effects/preset.ts:1456` | P11_nolonger | aurora-effects-preset.schema.json no longer bounds $defs.base_swap with an integer minItems >= 1 (read: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S50 | `src/core/formats/effects/preset.ts:1499` | P11_nolonger | aurora-effects-preset.schema.json no longer closes $defs.base_swap.items.properties.plane to an enum of at least two string spellings (read: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S51 | `src/core/formats/effects/preset.ts:1562` | P11_nolonger | aurora-effects-preset.schema.json no longer bounds $defs.base_swap.items.properties.target with an integer multipleOf >= 2 (read: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S52 | `src/core/formats/effects/preset.ts:1625` | P11_nolonger | aurora-effects-preset.schema.json no longer states which rows a base_swap band actually swaps, in the shape "the fully swapped rows are line | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S53 | `src/core/formats/effects/preset.ts:1636` | P11_nolonger | aurora-effects-preset.schema.json states the swapped-row rule but no longer carries the MEASURED witness ("a 3..64 band is INSIDE 4..63") th | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S54 | `src/core/formats/effects/preset.ts:1724` | P11_nolonger | aurora-effects-preset.schema.json no longer states, at $defs.base_swap, that the flattened fire sequence must be strictly ASCENDING and that | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S55 | `src/core/formats/effects/preset.ts:1892` | P11_nolonger | aurora-effects-preset.schema.json's $defs.tint_region is no longer $defs.pal_region minus addr: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S56 | `src/core/formats/effects/preset.ts:1929` | P11_nolonger | aurora-effects-preset.schema.json no longer carries the "Reserved and refused by name" sentence its reserved-key list is derived from. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S57 | `src/core/formats/effects/ramp-scroll-mode.ts:199` | P9_date | 2026-09-03 | E | dated reading | DERIVED (awaiting premise) | none |
| S58 | `src/core/formats/effects/ramp-scroll-mode.ts:284` | P12_nothing_reads | ${…} takes the act default and this act names no editor scene, so its scroll config is aeon's hand-authored 'act_parallax_config' in 'act_de | E | PARTLY FALSE (region mode: rg_parallax > ep_parallax > act default) | NONE | OPEN: model-level, needs the derivation extended |
| S59 | `src/core/formats/effects/ramp-scroll-mode.ts:338` | P2_yet | ${…} no section binds this preset, so nothing decides it yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S60 | `src/core/formats/effects/ramp-sign-lag.ts:197` | P9_date | 2026-09-03 | E | TRUE (retired, premise empty) | DERIVED (aeon-ramp-sign-drift) | none |
| S61 | `src/core/formats/effects/ramp-sign-lag.ts:217` | P5_nowish | ⚠ AND A NEGATIVE ONE WILL NOT BUILD TODAY: | E | TRUE (renders nothing) | DERIVED | none |
| S62 | `src/core/formats/effects/ramp-sign-lag.ts:276` | P5_nowish | A POSITIVE value in the same field builds and runs today: | E | TRUE (renders nothing) | DERIVED | none |
| S63 | `src/core/formats/effects/scene-ui.ts:54` | P11_nolonger | a UI constraint that used to be derivable no longer is; | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S64 | `src/core/formats/effects/scene-ui.ts:209` | P11_nolonger | effects scene schema $defs.factor.oneOf is no longer [string-enum, packed-object]; | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S65 | `src/core/formats/effects/scene-ui.ts:215` | P11_nolonger | effects scene schema $defs.factor.oneOf no longer has exactly two branches | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S66 | `src/core/formats/effects/scene-ui.ts:355` | P11_nolonger | effects scene schema $defs.tableRef no longer describes itself as an N-byte signed table: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S67 | `src/core/formats/effects/scene-ui.ts:441` | P11_nolonger | period's maximum (${…}) is no longer the ${…}-byte table length its own description names. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S68 | `src/core/formats/effects/scene-ui.ts:546` | P11_nolonger | effects scene schema $defs.layer.properties dsa/dsb no longer share a maximum - the no-deform sentinel is per FIELD from here on; | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S69 | `src/core/formats/effects/scene-ui.ts:612` | P11_nolonger | effects scene schema properties.anchor is no longer a oneOf | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S70 | `src/core/formats/effects/scene-ui.ts:627` | P11_nolonger | effects scene schema properties.anchor's const arm (${…}) is no longer its default (${…}). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S71 | `src/core/formats/effects/scene-ui.ts:682` | P11_nolonger | effects scene schema $defs.factor no longer publishes FACTOR_0: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S72 | `src/core/formats/effects/scene-ui.ts:754` | P11_nolonger | effects scene schema properties.v_factor no longer names ${…} as its LOCK SENTINEL: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S73 | `src/core/formats/effects/scene-ui.ts:797` | P11_nolonger | effects scene schema properties.bob_shift no longer has exactly two 'anyOf' arms: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S74 | `src/core/formats/effects/scene-ui.ts:844` | P11_nolonger | effects scene schema properties.bob_shift's default (${…}) is no longer its no-bob sentinel (${…}): | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S75 | `src/core/formats/effects/scene-ui.ts:853` | P11_nolonger | effects scene schema properties.bob_shift no longer names ${…} as its NO-BOB SENTINEL: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S76 | `src/core/formats/effects/scene-ui.ts:892` | P11_nolonger | effects scene schema properties.bob_shift's description no longer states its amplitude in the shape EFFECTS_BOB_AMPLITUDE_BASE derives it fr | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S77 | `src/core/formats/effects/scene-ui.ts:945` | P11_nolonger | effects scene schema properties.bob_period's description no longer states its timing in the shape Aurora derives it from. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S78 | `src/core/formats/effects/scene-ui.ts:1226` | P11_nolonger | effects scene schema ${…} no longer excludes an integer constant via 'not': | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S79 | `src/core/formats/effects/scene-ui.ts:1260` | P11_nolonger | effects scene schema ${…}'s description no longer states its unit in the shape EFFECTS_DRIFT_UNITS_PER_PIXEL derives it from. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S80 | `src/core/formats/effects/scene-ui.ts:1662` | P3b_ONLY_caps P5_nowish P11_nolonger | effects scene schema ${…} still says "TODAY ONLY ${…} BUILDS" but no longer names the one ladder function it builds from, so the claim canno | E | TRUE by construction | DERIVED (from vendored schema) | none |
| S81 | `src/core/formats/effects/scene-ui.ts:1730` | P7_ships | This bound is ONE OF TWO ENFORCEMENTS of the ceiling, with the engine-side guard aeon landed alongside it; | E | TRUE (same guard) | NONE | OPEN: candidate derived row |
| S82 | `src/core/formats/effects/scene-ui.ts:1806` | P1_until P2_yet P5_nowish P7_ships | ${…} (${…} lines) is a legal shift that does NOT BUILD yet: / the engine can generate only the ${…}-line ladder, so aeon refuses every other | E | TRUE by construction | DERIVED (EFFECTS_ROW_REMAP_BUILDABLE_SHIFT) | none |
| S83 | `src/core/formats/effects/scene-ui.ts:1850` | P11_nolonger | effects scene schema ${…}'s description no longer carries a "REFUSALS THIS SCHEMA DOES NOT ENCODE ...:" clause. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S84 | `src/core/formats/effects/scene-ui.ts:1869` | P11_nolonger | effects scene schema ${…}'s refusal clause no longer states the "${…}" condition (looked for ${…}). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S85 | `src/core/formats/effects/scene-ui.ts:1964` | P3b_ONLY_caps | Four of this key's constraints (the DEBUG tier, the screen-order map, the unit prohibition and the binding rule) exist ONLY in that prose, a | S | n/a (not an expiry claim) | NONE | none |
| S86 | `src/core/formats/effects/scene-ui.ts:1978` | P11_nolonger | effects scene schema properties.reels's description no longer states the "${…}" clause (looked for ${…}). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S87 | `src/core/formats/effects/scene-ui.ts:2045` | P11_nolonger | effects scene schema properties.reels no longer maps an index to a screen X span ("screen X 64i..64i+63"). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S88 | `src/core/formats/effects/scene-ui.ts:2060` | P11_nolonger | effects scene schema properties.reels no longer states the column-pair span, so the screen stride cannot be cross-checked against the geomet | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S89 | `src/core/formats/effects/scene-ui.ts:2114` | P11_nolonger | effects scene schema properties.reels no longer states BOTH the phase modulus ("wraps mod N") and the cycle gloss ("N//rate/ frames"); | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S90 | `src/core/formats/effects/scene-ui.ts:2188` | P11_nolonger | effects scene schema properties.reels no longer states its useful slider range and its strobe threshold. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S91 | `src/core/formats/effects/section-wiring.ts:1113` | P8_wired | wired | S | n/a (not an expiry claim) | NONE | none |
| S92 | `src/core/formats/effects/section-wiring.ts:1126` | P8_wired | wired | S | n/a (not an expiry claim) | NONE | none |
| S93 | `src/core/formats/effects/section-wiring.ts:1165` | P8_wired | wired | S | n/a (not an expiry claim) | NONE | none |
| S94 | `src/core/formats/effects/section-wiring.ts:1186` | P2_yet | nothing threads the raster chooser into it yet, so aeon's build refuses a binding here ("no preset threads ${…}(preset: | R | TRUE by construction | DERIVED at runtime | none |
| S95 | `src/core/formats/effects/section-wiring.ts:1191` | P8_wired | Section ${…}'s preset record ${…} is not wired: | S | n/a (not an expiry claim) | NONE | none |
| S96 | `src/core/formats/effects/section-wiring.ts:1350` | P8_wired | wired | S | n/a (not an expiry claim) | NONE | none |
| S97 | `src/core/formats/effects/section-wiring.ts:1494` | P2_yet P9_date | That is a property of the mechanism and not a choice about this section (aeon, 2026-09-10: / a section nothing threads yet, or one whose ras | R | TRUE by construction | DERIVED at runtime | none |
| S98 | `src/core/formats/effects/section-wiring.ts:1637` | P8_wired | wired | S | n/a (not an expiry claim) | NONE | none |
| S99 | `src/core/formats/effects/section-wiring.ts:1647` | P8_wired | wired | S | n/a (not an expiry claim) | NONE | none |
| S100 | `src/core/formats/effects/section-wiring.ts:2114` | P12_nothing_reads | A row nothing calls is a row nothing reads, which presents as an assignment that did nothing, and aeon's build refuses it by name: | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S101 | `src/core/formats/raster-binding.ts:763` | P8_wired P9_date P10_revision P12_nothing_reads | Verified at aeon c7ebe7a1 (2026-09-17): / WHICH OWNER YOU BIND DECIDES WHAT HAPPENS, AND THE WIRED SET IS DERIVED, NEVER FIXED. / an owner ( | E | TRUE at a0c63764 | DERIVED (wired homes) + WORDING-PIN (rest) | none; other dated readings listed OPEN |
| S102 | `src/core/formats/regions/flatten.ts:427` | P9_date | The editor cuts on draw (owner ruling 2026-09-14), so an overlap in the file means the document was hand-edited or written by something that | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S103 | `src/core/level-classic/collision-write.ts:80` | P7_ships | this zone ships ${…} blocks against ${…} entries, so a clone would grow the table over the same overhang. | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S104 | `src/core/project/aeon/load.ts:562` | P1_until | Aurora will not write this file back until it is the full ${…} bytes, so palette edits in zone "${…}" will not save. | R | by construction (state-gated) | DERIVED at runtime | none |
| S105 | `src/core/project/aeon/player-palette.ts:133` | P1_until | Aurora will not write this file back until it is at least ${…} bytes, so palette line 0 edits will not save. | R | by construction (state-gated) | DERIVED at runtime | none |
| S106 | `src/core/project/aeon/shared-palette-warning.ts:273` | P1_until | If you change one of the spring's colours here, the spring will change colour when you switch character, and that check will fail until ${…} | R | by construction (state-gated) | DERIVED at runtime | none |
| S107 | `src/core/project/aeon/shared-palette-warning.ts:340` | P1_until | A running game will not show a line 0 edit until it is rebuilt: | R | by construction (state-gated) | DERIVED at runtime | none |
| S108 | `src/core/project/aeon/shared-palette-warning.ts:342` | P6_while_open | You will not be asked again while this project stays open. | S | n/a (not an expiry claim) | NONE | none |
| S109 | `src/core/project/profiles/s1-object-presentation.ts:172` | P2_yet | No sprite art linked in Aurora's table yet | R | by construction (state-gated) | DERIVED at runtime | none |
| S110 | `src/main/aether/adapter.ts:46` | P13_planned | batches are not supported in this slice | S | n/a (not an expiry claim) | NONE | none |
| S111 | `src/main/editor-methods.ts:216` | P3b_ONLY_caps | ⚠ A TWO-WAY CROSSOVER ONLY WORKS AT "left" OR "right". | E | TRUE (engine 8px trigger) | NONE (in description) | listed; not churned |
| S112 | `src/main/editor-methods.ts:275` | P5_nowish P9_date P12_nothing_reads | as of 2026-08-29 the bake does not read this field, so NOTHING downstream refuses it), which is reported rather than normalised away). | E | FALSE | NONE | FIXED + DERIVED (crossover-reserved-bake-claim.test.ts) |
| S113 | `src/main/editor-methods.ts:341` | P1_until | those ids cannot be assigned or displayed until the files arrive, and Aurora keeps their names when it saves. | R | by construction (state-gated) | DERIVED at runtime | none |
| S114 | `src/main/editor-methods.ts:459` | P2_yet | binding it to a section is a separate call (assign_section_preset), and even that installs nothing yet: | E | FALSE | NONE | FIXED (clause removed; install fact left to the derived RASTER_SECTION_BINDING_LIMIT) |
| S115 | `src/main/editor-methods.ts:581` | P1_until | copy (the default here) leaves the band visually inert until its frames are drawn; | R | by construction (state-gated) | DERIVED at runtime | none |
| S116 | `src/main/editor-methods.ts:600` | P1_until | by default banks 1-${…} arrive as copies of it (the band is inert until its frames are drawn), and phaseFill=shift derives them as pre-shift | R | by construction (state-gated) | DERIVED at runtime | none |
| S117 | `src/main/editor-methods.ts:639` | P5_nowish | how banks 1..${…} are derived from phase 0 when 'phases' is omitted (a new band's phase 0 is blank art, so all three agree today; | S | TRUE (self) | NONE | none |
| S118 | `src/main/editor-methods.ts:650` | P1_until | The art arrives unreferenced, so nothing on screen changes until layout cells point at it. | R | by construction (state-gated) | DERIVED at runtime | none |
| S119 | `src/main/editor-methods.ts:674` | P7_ships | A slot inside the animated prefix (list_bg_anim_bands reports each band's slot range) is a band's phase-0 art, and the write lands in that b | S | n/a (not an expiry claim) | possible pin (3 file(s) share a 5-word window) | none |
| S120 | `src/main/editor-methods.ts:800` | P7_ships | a push only lands when it matches the open project), and the last push error. | S | n/a (not an expiry claim) | NONE | none |
| S121 | `src/main/editor-methods.ts:826` | P1_until | on classic (S1) the push PERSISTS until the next level transition or fade (only the zone's few palette-cycled entries keep repainting themse | R | by construction (state-gated) | DERIVED at runtime | none |
| S122 | `src/main/editor-methods.ts:837` | P7_ships | Reports where the player LANDED: | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S123 | `src/main/editor-methods.ts:844` | P7_ships | 'restoredVia' says which ran, 'restoredTo' is where the engine says the player LANDED after clamping). | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S124 | `src/renderer/App.tsx:355` | P2_yet | This canvas has no file yet, so there is nowhere to save it. | R | by construction (state-gated) | DERIVED at runtime | none |
| S125 | `src/renderer/agent/agent-handler.ts:1832` | P12_nothing_reads | palette line ${…} does not exist in the open act | R | by construction | DERIVED at runtime | none |
| S126 | `src/renderer/agent/agent-handler.ts:1837` | P12_nothing_reads | palette line ${…} does not exist in this zone | R | by construction | DERIVED at runtime | none |
| S127 | `src/renderer/canvas/raster-timeline.ts:489` | P1_until | from its line to the bottom of the frame, until the next split supersedes it: | R | by construction (state-gated) | DERIVED at runtime | none |
| S128 | `src/renderer/components/MapViewport.tsx:3535` | P11_nolonger | the background it was stamping is no longer the one on screen | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S129 | `src/renderer/components/MarqueePasteOptions.tsx:51` | P7_ships | Collision is stored per 16px block, so a selection that lands off that grid carries art only. | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S130 | `src/renderer/components/MarqueePasteOptions.tsx:222` | P5_nowish | ${…} (Ctrl/Cmd is held, so a drag right now snaps to ${…}; | S | n/a (not an expiry claim) | NONE | none |
| S131 | `src/renderer/components/MarqueePasteOptions.tsx:236` | P7_ships | tiles (8px, art only unless it lands even) | S | n/a (not an expiry claim) | NONE | none |
| S132 | `src/renderer/components/MarqueePasteOptions.tsx:297` | P2_yet | Nothing to flip yet: | R | by construction (state-gated) | DERIVED at runtime | none |
| S133 | `src/renderer/components/art/ComposerCanvas.tsx:415` | P7_ships | tile #${…} used ${…}× in this act, so this edit lands everywhere | S | n/a (not an expiry claim) | NONE | none |
| S134 | `src/renderer/components/art/open-document.ts:258` | P2_yet | Chunk "${…}" is not applied to this act yet | R | by construction (state-gated) | DERIVED at runtime | none |
| S135 | `src/renderer/components/art/stale-document.ts:94` | P11_nolonger | The tile this document was editing (#${…}) no longer exists (undone). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S136 | `src/renderer/components/art/stale-document.ts:96` | P11_nolonger | The band art this document was editing no longer exists (undone). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S137 | `src/renderer/components/art/stale-document.ts:98` | P11_nolonger | The chunk this document was editing no longer exists. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S138 | `src/renderer/components/canvas/CommitPlanView.tsx:84` | P2_yet | This is smaller than one 256×256 chunk, so there is nothing to commit yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S139 | `src/renderer/components/canvas/CommitPlanView.tsx:134` | P7_ships | Where this part of the art lands | S | n/a (not an expiry claim) | NONE | none |
| S140 | `src/renderer/components/classic/ClassicCollisionPanel.tsx:248` | P2_yet | , not used in this zone yet | R | by construction (state-gated) | DERIVED at runtime | none |
| S141 | `src/renderer/components/classic/TileTab.tsx:405` | P2_yet | Nothing copied yet | R | by construction (state-gated) | DERIVED at runtime | none |
| S142 | `src/renderer/components/donors/DonorPasteSection.tsx:97` | P1_until | Nothing is written until the first paste: | R | by construction (state-gated) | DERIVED at runtime | none |
| S143 | `src/renderer/components/donors/DonorPasteSection.tsx:104` | P2_yet | not written yet | R | by construction (state-gated) | DERIVED at runtime | none |
| S144 | `src/renderer/components/donors/DonorTargetPane.tsx:132` | P2_yet | ${…} has no clips yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S145 | `src/renderer/components/donors/DonorsPanel.tsx:67` | P1_until P12_nothing_reads | / does not exist. / The trees are derived and gitignored in aeon, so this is the normal state until the converter runs. | E | TRUE (aeon .gitignore:205) | NONE | listed; not churned |
| S146 | `src/renderer/components/effects/BandPresetPanel.tsx:459` | P2_yet | No raster presets yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S147 | `src/renderer/components/effects/BandPresetPanel.tsx:733` | P13_planned |  | S | n/a (not an expiry claim) | NONE | none |
| S148 | `src/renderer/components/effects/BandPresetPanel.tsx:1325` | P1_until | each is the constructor's default until set. | R | by construction (state-gated) | DERIVED at runtime | none |
| S149 | `src/renderer/components/effects/BandPresetPanel.tsx:2287` | P7_ships | That is the shipped single-edge shape, not a missing value. | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S150 | `src/renderer/components/effects/BgAnimBandPanel.tsx:470` | P1_until | There is nothing to animate until it exists. | R | by construction (state-gated) | DERIVED at runtime | none |
| S151 | `src/renderer/components/effects/BgAnimBandPanel.tsx:484` | P2_yet | No tile animations yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S152 | `src/renderer/components/effects/BgAnimBandPanel.tsx:638` | P7_ships | it changes what ships and changes nothing you can see in this editor. | S | n/a (not an expiry claim) | NONE | none |
| S153 | `src/renderer/components/effects/BgAnimBandPanel.tsx:660` | P7_ships | ships animating (default: | S | n/a (not an expiry claim) | NONE | none |
| S154 | `src/renderer/components/effects/BgAnimBandPanel.tsx:665` | P7_ships | ships silent (this tile animation does not run in the game) | S | n/a (not an expiry claim) | NONE | none |
| S155 | `src/renderer/components/effects/BgAnimBandPanel.tsx:984` | P5_nowish | The tile animation moves at whatever aeon's own default is, today and after any change to it. | S | n/a (not an expiry claim) | NONE | none |
| S156 | `src/renderer/components/effects/BgAnimBandPanel.tsx:1101` | P1_until | nothing on screen changes until you point layout cells at it. | R | by construction (state-gated) | DERIVED at runtime | none |
| S157 | `src/renderer/components/effects/EffectsScenePanel.tsx:562` | P2_yet | No effects scenes yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S158 | `src/renderer/components/effects/SectionPicker.tsx:179` | P1_until P2_yet | Not yet, and not something you did: / It is what you cannot author here until aeon adds it. | R | TRUE by construction (mark legend) | DERIVED at runtime | none |
| S159 | `src/renderer/components/effects/SectionPicker.tsx:375` | P12_nothing_reads | Without it the generator emits the binding and nothing reads it, which presents to the author as an assignment that did nothing. | S | n/a (not an expiry claim) | possible pin (2 file(s) share a 5-word window) | none |
| S160 | `src/renderer/components/effects/SectionPicker.tsx:382` | P5_nowish | This row is about the document bound here TODAY: | S | n/a (not an expiry claim) | possible pin (5 file(s) share a 5-word window) | none |
| S161 | `src/renderer/components/map-gesture-witness.ts:243` | P11_nolonger | the background it was painting is no longer on screen | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S162 | `src/renderer/components/regions/RegionsPanel.tsx:280` | P1_until P7_ships | Engine-gated until part 2 lands: | E | TRUE (effects_gen.py:3784 refuses) | NONE | OPEN: candidate derived row |
| S163 | `src/renderer/components/regions/RegionsPanel.tsx:395` | P7_ships | Like a drag, it trims any region it now lands on. | S | n/a (not an expiry claim) | NONE | none |
| S164 | `src/renderer/components/regions/RegionsPanel.tsx:620` | P4_no_X_has | No act is open. | S | n/a (not an expiry claim) | NONE | none |
| S165 | `src/renderer/components/regions/RegionsPanel.tsx:627` | P2_yet | below, or from painting (step 8, not built yet). | E | FALSE | NONE | FIXED (clause removed) |
| S166 | `src/renderer/components/setup/ProjectSetupTab.tsx:32` | P13_planned | pending | S | n/a (not an expiry claim) | NONE | none |
| S167 | `src/renderer/components/setup/ProjectSetupTab.tsx:39` | P13_planned | pending | S | n/a (not an expiry claim) | NONE | none |
| S168 | `src/renderer/components/setup/ProjectSetupTab.tsx:67` | P13_planned | pending | S | n/a (not an expiry claim) | NONE | none |
| S169 | `src/renderer/components/setup/ProjectSetupTab.tsx:72` | P13_planned | pending | S | n/a (not an expiry claim) | NONE | none |
| S170 | `src/renderer/components/setup/ProjectSetupTab.tsx:141` | P5_nowish | Aeon projects configure through their own project.json today; | E | LAPSED (Stage 3 passed) | NONE | FIXED (promise removed) |
| S171 | `src/renderer/components/setup/ProjectSetupTab.tsx:255` | P1_until | Apply is disabled until the file is valid JSON: | R | by construction (state-gated) | DERIVED at runtime | none |
| S172 | `src/renderer/components/setup/ProjectSetupTab.tsx:310` | P13_planned | ${…} change${…} pending | S | n/a (not an expiry claim) | NONE | none |
| S173 | `src/renderer/components/sprite/S1ObjectSection.tsx:64` | P5_nowish | ${…} (currently open) | S | n/a (not an expiry claim) | possible pin (3 file(s) share a 5-word window) | none |
| S174 | `src/renderer/components/sprite/S1ObjectSection.tsx:112` | P5_nowish | ${…} (currently open) | S | n/a (not an expiry claim) | possible pin (3 file(s) share a 5-word window) | none |
| S175 | `src/renderer/components/sprite/SpriteMode.tsx:286` | P2_yet | -- none saved yet -- | R | by construction (state-gated) | DERIVED at runtime | none |
| S176 | `src/renderer/components/sprite/export-sprite.ts:222` | P8_wired | its frames are synthesized cells of a raw tile grid (the engine blits this art with no mappings file), and grid save-back isn't wired. | S | n/a (not an expiry claim) | NONE | none |
| S177 | `src/renderer/components/sprite/export-sprite.ts:528` | P9_date | docs/reviews/2026-08-21-sonic-animate-live-study.md. | S | n/a (not an expiry claim) | NONE | none |
| S178 | `src/renderer/components/ui/fields.tsx:154` | P7_ships | It commits on every keystroke, so a shorter number that is legal on its own lands on the way to a longer one. | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S179 | `src/renderer/debug-hooks.ts:1506` | P4_no_X_has | no act is open | S | n/a (not an expiry claim) | NONE | none |
| S180 | `src/renderer/providers/bg-anim-aeon.ts:209` | P11_nolonger | 'step & (BGANIM_PHASE_BANKS - 1)' is no longer the driver's bank selector, and the sentences that print it as a mask are now wrong. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S181 | `src/renderer/providers/bg-anim-aeon.ts:225` | P1_until | the tile animation draws the same art at every step, so nothing moves until you author its frames. | R | by construction (state-gated) | DERIVED at runtime | none |
| S182 | `src/renderer/providers/bg-anim-aeon.ts:228` | P1_until | banks 1 to ${…} arrive as copies of phase 0, so the tile animation is inert until you draw its frames. | R | by construction (state-gated) | DERIVED at runtime | none |
| S183 | `src/renderer/providers/bg-anim-aeon.ts:242` | P1_until | The picture holds at rest but BREAKS on the tile animation’s second phase until you draw the frames, a deliberate authoring start. | R | by construction (state-gated) | DERIVED at runtime | none |
| S184 | `src/renderer/providers/bg-anim-aeon.ts:244` | P1_until | the picture BREAKS on the tile animation’s second phase until you draw the frames. | R | by construction (state-gated) | DERIVED at runtime | none |
| S185 | `src/renderer/providers/bg-anim-aeon.ts:1039` | P7_ships | Changes what SHIPS, not what you see here. | S | n/a (not an expiry claim) | NONE | none |
| S186 | `src/renderer/providers/bg-anim-aeon.ts:1061` | P11_nolonger | They no longer refuse the build. | E | TRUE | WORDING-PIN (absence) | DERIVED row added (+ control at 01a45ede^) |
| S187 | `src/renderer/providers/effects-aeon.ts:361` | P11_nolonger | the drift row's seed (1/8 px/frame = ${…}) is no longer a legal rate: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S188 | `src/renderer/providers/effects-aeon.ts:519` | P7_ships | This range is ONE OF TWO enforcements of the ceiling, the other being the engine-side guard aeon landed beside it; | E | TRUE (scene_dsl.emp:1067 ensure < 512) | NONE | OPEN: candidate derived row |
| S189 | `src/renderer/providers/effects-aeon.ts:529` | P5_nowish | (builds today) | E | TRUE by construction | DERIVED | none |
| S190 | `src/renderer/providers/effects-aeon.ts:983` | P9_date P11_nolonger | aeon drove this on a live machine (2026-09-06) and refuted the DIRECTION Aurora used to warn about: / aeon's other reading, the band's total | E | TRUE | DERIVED (aeon-curve-rate-drift Q4) | none |
| S191 | `src/renderer/providers/effects-aeon.ts:1009` | P4_no_X_has | this strip's Plane B ramps from ${…} over a band ${…}, and NO ACT IS OPEN, so Aurora cannot say how far this camera travels. | S | n/a (not an expiry claim) | NONE | none |
| S192 | `src/renderer/providers/effects-aeon.ts:1015` | P1_until | Until then this is neither a warning nor a clearance. | R | by construction (state-gated) | DERIVED at runtime | none |
| S193 | `src/renderer/providers/effects-aeon.ts:2774` | P7_ships | this split lands on screen line ${…}, which is not BELOW layer ${…}'s split at line ${…}: | S | n/a (not an expiry claim) | NONE | none |
| S194 | `src/renderer/providers/effects-aeon.ts:2882` | P7_ships | the parallax step recomputes Plane B's vertical scroll every VBlank and ships it at frame top, while the split writes an ABSOLUTE constant t | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S195 | `src/renderer/providers/effects-aeon.ts:2962` | P7_ships | VSRAM entry 1 is PLANE B OF COLUMN 0, the frame-top writer ships the whole 80-byte column buffer every frame, and the split's whole-plane wr | S | n/a (not an expiry claim) | possible pin (2 file(s) share a 5-word window) | none |
| S196 | `src/renderer/providers/effects-aeon.ts:3817` | P2_yet P4_no_X_has | ${…}, which no section uses yet: | R | by construction (state-gated) | DERIVED at runtime | none |
| S197 | `src/renderer/providers/effects-aeon.ts:3863` | P2_yet | ${…} Edits below change ${…}, which no region binds yet: | R | by construction (state-gated) | DERIVED at runtime | none |
| S198 | `src/renderer/providers/effects-aeon.ts:3957` | P12_nothing_reads | Deleting it would leave ${…} naming a document that does not exist, and aeon's build refuses that by name. | R | by construction | DERIVED at runtime | none |
| S199 | `src/renderer/providers/effects-aeon.ts:4006` | P12_nothing_reads | Deleting it could leave a binding naming a document that does not exist, which aeon's build refuses by name. | R | by construction | DERIVED at runtime | none |
| S200 | `src/renderer/providers/effects-aeon.ts:4019` | P12_nothing_reads | Deleting it would leave ${…} naming a document that does not exist, and aeon's build refuses that by name. | R | by construction | DERIVED at runtime | none |
| S201 | `src/renderer/providers/effects-aeon.ts:4893` | P3b_ONLY_caps | DEBUG BUILDS ONLY: | E | not re-derived | NONE | OPEN (P14 population) |
| S202 | `src/renderer/providers/effects-aeon.ts:5002` | P12_nothing_reads | strip ${…} does not exist: | R | by construction | DERIVED at runtime | none |
| S203 | `src/renderer/providers/effects-preset.ts:369` | P10_revision | aeon's build fails loudly when a preset document is reached by neither a table row nor a section binding (aeon 4aa2abc0), so the omission is | E | FALSE in region mode | WORDING-PIN | FIXED + pin replaced by DERIVED row |
| S204 | `src/renderer/providers/effects-preset.ts:497` | P9_date P10_revision | aeon 4a4d3474 (2026-08-30), docs/research/reference_captures/2026-08-30-sec5-band/, section 5 at one camera position in aeon's emulator, CRA | E | TRUE (conditions a, b hold) | WORDING-PIN | DERIVED rows added for (a), proxy (b); (c) NONE, site says so |
| S205 | `src/renderer/providers/effects-preset.ts:963` | P12_nothing_reads | Deleting it would leave ${…} naming a document that does not exist, and aeon's build refuses that by name. | R | by construction | DERIVED at runtime | none |
| S206 | `src/renderer/providers/effects-preset.ts:1033` | P12_nothing_reads | Deleting it could leave a binding naming a document that does not exist, which aeon's build refuses by name. | R | by construction | DERIVED at runtime | none |
| S207 | `src/renderer/providers/effects-preset.ts:1046` | P12_nothing_reads | Deleting it would leave ${…} naming a document that does not exist, and aeon's build refuses that by name. | R | by construction | DERIVED at runtime | none |
| S208 | `src/renderer/providers/effects-preset.ts:1131` | P12_nothing_reads | Aurora does not read that table, so it cannot tell you whether "${…}" has a row there. | S | n/a (not an expiry claim) | possible pin (2 file(s) share a 5-word window) | none |
| S209 | `src/renderer/providers/effects-preset.ts:1942` | P11_nolonger | the schema's 'cycles' description no longer carries its "An EMPTY array is legal JSON here" sentence. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S210 | `src/renderer/providers/effects-preset.ts:2740` | P11_nolonger | the schema's 'patch_world_ys' description no longer carries its "A seed without a motion is legal and stationary" sentence. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S211 | `src/renderer/providers/effects-preset.ts:2761` | P7_ships P11_nolonger | the schema's 'anchor_sweep' description no longer names its shipped hand-authored precedent in the shape anchor_sweep(amp_shift: | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S212 | `src/renderer/providers/effects-preset.ts:3154` | P2_yet | Channel ${…}'s ${…} is not spelled yet, and a positional array cannot have a hole. | R | by construction (state-gated) | DERIVED at runtime | none |
| S213 | `src/renderer/providers/effects-preset.ts:3386` | P11_nolonger | aurora-effects-preset.schema.json no longer states the per-line-curve MUST NOT in its 'ramp' property description, which is the only contrac | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S214 | `src/renderer/providers/effects-preset.ts:3697` | P3_only_count | only 0 and 2 are established | S | n/a (not an expiry claim) | NONE | none |
| S215 | `src/renderer/providers/effects-preset.ts:3831` | P11_nolonger | aurora-effects-preset.schema.json no longer states, in its 'ramp' property description, that the display line is an INSTRUMENT'S READING rat | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S216 | `src/renderer/providers/effects-preset.ts:3858` | P11_nolonger | aurora-effects-preset.schema.json no longer names the INSTRUMENT its ramp display line was read on, in $defs.ramp.properties.top's descripti | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S217 | `src/renderer/providers/effects-preset.ts:3869` | P11_nolonger | the ramp instrument clause in aurora-effects-preset.schema.json no longer states ${…}; | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S218 | `src/renderer/providers/effects-preset.ts:3898` | P7_ships P9_date | the interpreter adds the step before it writes, so 'start' itself is never emitted and the FIRST value an author sees lands on top + ${…}, n | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S219 | `src/renderer/providers/effects-preset.ts:4354` | P11_nolonger | aurora-effects-preset.schema.json no longer states base_swap's two asymmetries with ramp (no capability gate, not DEBUG-gated) in its 'base_ | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S220 | `src/renderer/providers/effects-preset.ts:4394` | P11_nolonger | aurora-effects-preset.schema.json no longer states what an author sees (the swap line down, the untouched frame top, the self-restore) in it | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S221 | `src/renderer/providers/effects-preset.ts:4618` | P11_nolonger | aurora-effects-preset.schema.json no longer shows the lowering call 'vdp_base_reg(VdpBase.<variant>, target)' in its 'base_swap' property de | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S222 | `src/renderer/providers/effects-preset.ts:4666` | P7_ships P11_nolonger | aurora-effects-preset.schema.json no longer states the CURRENT shipped section-6 fire line in its 'base_swap' property description, in the s | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S223 | `src/renderer/providers/effects-preset.ts:4677` | P3_only_count P11_nolonger | aurora-effects-preset.schema.json states a CURRENT section-6 fire line but no longer states the superseded one it replaced. / with only one  | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S224 | `src/renderer/providers/effects-preset.ts:4727` | P7_ships P11_nolonger | aurora-effects-preset.schema.json no longer states the shipped section-6 target in its 'base_swap' property description, in the shape "{line | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S225 | `src/renderer/providers/effects-preset.ts:4737` | P11_nolonger | aurora-effects-preset.schema.json states a superseded section-6 binding but no longer says WHICH of its two numbers is superseded. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S226 | `src/renderer/providers/effects-preset.ts:4746` | P11_nolonger | aurora-effects-preset.schema.json now disclaims the section-6 TARGET (${…}) as "not the current binding", so it may no longer be used as a s | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S227 | `src/renderer/providers/effects-preset.ts:4778` | P7_ships P11_nolonger | aurora-effects-preset.schema.json no longer describes an ABSENT restore_line as "the shipped single-edge shape" at $defs.base_swap.items.pro | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S228 | `src/renderer/providers/effects-preset.ts:5274` | P11_nolonger | aurora-effects-preset.schema.json no longer declares exactly one 'on' arm for $defs.boundary (reads ${…}). | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S229 | `src/renderer/providers/effects-preset.ts:5294` | P11_nolonger | aurora-effects-preset.schema.json no longer states what an author sees for 'boundary' (the boundary line down, the staged variant's colours, | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S230 | `src/renderer/providers/effects-preset.ts:5343` | P7_ships P11_nolonger | aurora-effects-preset.schema.json no longer quotes aeon's shipped moving water as a 'patchable(fx_tint_band(…), …)' call in its 'boundary' p | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S231 | `src/renderer/providers/effects-preset.ts:5367` | P7_ships P11_nolonger | aurora-effects-preset.schema.json no longer states the LOWERING template for 'boundary' (patchable(fx_tint_band(line, slot, pal_line, entry, | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S232 | `src/renderer/providers/effects-preset.ts:5383` | P7_ships | the shipped-water call in aurora-effects-preset.schema.json does not give a value for the tint region's required member "${…}" (parsed ${…}) | S | n/a (not an expiry claim) | NONE | none |
| S233 | `src/renderer/providers/effects-preset.ts:5406` | P7_ships | $defs.boundary requires "${…}" and the shipped-water call in the schema's own description does not supply it (parsed ${…}). | S | n/a (not an expiry claim) | NONE | none |
| S234 | `src/renderer/providers/effects-preset.ts:5452` | P7_ships P11_nolonger | aurora-effects-preset.schema.json no longer states the shipped water's fire line in $defs.boundary.properties.line ("The shipped water uses  | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S235 | `src/renderer/providers/effects-preset.ts:5461` | P7_ships | the schema's two statements of the shipped water's fire line disagree: | S | n/a (not an expiry claim) | NONE | none |
| S236 | `src/renderer/providers/effects-preset.ts:5479` | P7_ships | the schema's own shipped-water ${…} (${…}) is outside the range the same schema declares for it (${…}..${…}). | S | n/a (not an expiry claim) | NONE | none |
| S237 | `src/renderer/providers/effects-preset.ts:5505` | P3_only_count P7_ships | a fresh boundary earns the advisories ${…}, and the only one it may earn is "no-motion", the deliberate one, which says a boundary with no s | S | n/a (not an expiry claim) | possible pin (6 file(s) share a 5-word window) | none |
| S238 | `src/renderer/providers/effects-preset.ts:5618` | P3b_ONLY_caps | ⚠ THAT IS THE ONLY THING REFUSED HERE: | S | n/a (not an expiry claim) | possible pin (1 file(s) share a 5-word window) | none |
| S239 | `src/renderer/providers/effects-preset.ts:5690` | P7_ships | re-ship at the frame top (the shipped water) | S | n/a (not an expiry claim) | NONE | none |
| S240 | `src/renderer/providers/effects-preset.ts:5983` | P2_yet | a ${…} cannot be authored in this panel yet: | R | by construction (state-gated) | DERIVED at runtime | none |
| S241 | `src/renderer/providers/effects-preset.ts:6009` | P1_until P2_yet | preset "${…}" carries a ${…}, and this panel has no editor for it yet. / The document opens, reads and saves correctly and nothing here has  | R | by construction (state-gated) | DERIVED at runtime | none |
| S242 | `src/renderer/providers/effects-preset.ts:6097` | P11_nolonger | if the DERIVATION has quietly collapsed (an ep_patched sentence that no longer matches yields an EMPTY patched set, which is indistinguishab | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S243 | `src/renderer/providers/effects-preset.ts:6110` | P2_yet | ${…} (not authorable here yet) | R | by construction (state-gated) | DERIVED at runtime | none |
| S244 | `src/renderer/shell/effects-delete-guard.ts:102` | P1_until | Until then Ctrl+Z puts it back; | R | by construction (state-gated) | DERIVED at runtime | none |
| S245 | `src/renderer/shell/project-open-guard.ts:277` | P6_while_open | Unsaved aeon project edits are resident while a CLASSIC project is open, so the aeon saver skips them and Save cannot write them. | S | n/a (not an expiry claim) | possible pin (3 file(s) share a 5-word window) | none |
| S246 | `src/renderer/shell/project-open-guard.ts:284` | P2_yet | ${…} canvas(es) have no file yet, so Save cannot write them. | R | by construction (state-gated) | DERIVED at runtime | none |
| S247 | `src/renderer/shell/tab-activation/canvas.ts:282` | P2_yet | This canvas has no file yet, so there is nowhere to save it. | R | by construction (state-gated) | DERIVED at runtime | none |
| S248 | `src/renderer/state/art-composer-save.ts:116` | P11_nolonger | The chunk "${…}" is no longer in the chunk library, so Save has nothing to write those strokes back to. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S249 | `src/renderer/state/art-composer-save.ts:156` | P11_nolonger | Chunk no longer exists. | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S250 | `src/renderer/state/canvas-file.ts:186` | P1_until | the canvas is unconstrained until this is fixed, and the sidecar file will not be overwritten on save | R | by construction (state-gated) | DERIVED at runtime | none |
| S251 | `src/renderer/state/chunk-doc-commit.ts:171` | P11_nolonger | The chunk "${…}" is no longer in the chunk library, so this edit cannot be recorded on it | R | by construction (drift/refusal message) | DERIVED at runtime | none |
| S252 | `src/renderer/state/classicLevelStore.ts:967` | P12_nothing_reads | chunk ${…} does not exist (1..${…}) | R | by construction | DERIVED at runtime | none |
| S253 | `src/renderer/state/classicLevelStore.ts:995` | P12_nothing_reads | block ${…} does not exist (0..${…}) | R | by construction | DERIVED at runtime | none |
| S254 | `src/renderer/state/classicLevelStore.ts:1018` | P12_nothing_reads | tile ${…} does not exist (0..${…}) | R | by construction | DERIVED at runtime | none |
| S255 | `src/renderer/state/classicLevelStore.ts:1059` | P12_nothing_reads | tile ${…} does not exist (0..${…}) | R | by construction | DERIVED at runtime | none |
| S256 | `src/renderer/state/classicLevelStore.ts:1116` | P12_nothing_reads | block ${…} does not exist (0..${…}) | R | by construction | DERIVED at runtime | none |
| S257 | `src/renderer/state/classicLevelStore.ts:1129` | P12_nothing_reads | chunk index ${…} does not exist (0..${…}) | R | by construction | DERIVED at runtime | none |
| S258 | `src/renderer/state/classicLevelStore.ts:1250` | P12_nothing_reads | chunk index ${…} does not exist (0..${…}) | R | by construction | DERIVED at runtime | none |
| S259 | `src/renderer/state/collision-dispatch.ts:40` | P2_yet | no cell has been probed yet; | R | by construction (state-gated) | DERIVED at runtime | none |
| S260 | `src/renderer/workspace/LevelWorkspace.tsx:220` | P2_yet | editor yet. | R | by construction (state-gated) | DERIVED at runtime | none |
| S261 | `src/shared/recents.ts:79` | P1_until | Your list is still on disk and has NOT been changed, and Aurora will not record the projects you open until it can read it again. | R | by construction (state-gated) | DERIVED at runtime | none |
| S262 | `src/test/render-hooked.ts:38` | P11_nolonger | this harness can no longer install a hook dispatcher, so every row that uses it is unmeasurable rather than passing. | R | by construction (drift/refusal message) | DERIVED at runtime | none |

## 9. Appendix B: comment sentences about a peer with a snapshot spelling (109 rows)

Truth from a read-only sub-agent pass at aeon a0c63764 (git objects), with C3 overruled by hand
(§4.4). Reader is NONE for every row: no test reads a comment's claim.

| id | site (block start) | sentence | truth | reader | action |
|---|---|---|---|---|---|
| C1 | `src/core/aether/warp-math.ts:1` | The editor and the engine agree on world pixels TODAY: an aeon act is flat world coordinates end to end ('section.emp:3' | TRUE | NONE | none |
| C2 | `src/core/art/rasterize.ts:235` | nothing produces one today (importChunks is 16x16) and clipping is the honest behaviour. | FALSE | NONE | OPEN (Aurora-self, listed) |
| C3 | `src/core/collision/crossover-audit.ts:1` | R2 being unimplemented in aeon's bake therefore ships nothing wrong TODAY — it is an unguarded door, not a leak. | FALSE (sub-agent said TRUE; overruled) | NONE | FIXED (my re-read: FALSE, see note) |
| C4 | `src/core/collision/layer-transition.ts:1` | ═══ WHY THERE IS NO "TOGGLE" VALUE, AND WHY EACH PLANE CARRIES ITS OWN ═══ Both planes carry the field independently, an | TRUE | NONE | none |
| C5 | `src/core/editing/collision-word.ts:1` | ═══ UPDATE 2026-08-29 — 15:14 NOW MEAN SOMETHING, AND THIS FILE STILL DOES NOT KNOW WHAT ═══ Aeon committed the anchor ( | HISTORICAL-OK | NONE | none |
| C6 | `src/core/editing/collision-word.ts:1` | A literal '0xC000' anywhere in that parcel would have had to be revisited here today. | HISTORICAL-OK | NONE | none |
| C7 | `src/core/editing/collision-word.ts:114` | Handing it a saturated shape and every flag on makes it OR together each field's full width, so the mask is whatever the | TRUE | NONE | none |
| C8 | `src/core/editing/map-clipboard.ts:43` | Two tile sets whose pixels happen to agree today are still two tile sets: either can be edited without the other, and a  | TRUE | NONE | none |
| C9 | `src/core/editing/region-flip.ts:1` | ═══ AIR IS AIR, ON THE COLLISION PLANE ONLY ═══ 'collision-cell-word.ts' declares 'AIR_CELL = 0' and 'selectedCollisionW | TRUE | NONE | none |
| C10 | `src/core/editing/region-marquee.ts:445` | Two consumers written against one-entry-per-region do not yet hold it up, and both are named in 'docs/reviews/2026-09-16-regions-step8-gestures.md | FALSE | NONE | OPEN (Aurora-self, listed) |
| C11 | `src/core/export/vram-coloring.ts:13` | The ceiling is its own declared quantity and it MOVES: aeon's own 'tiles' comment records 960 -> 896 (the dust carve) -> | TRUE | NONE | none |
| C12 | `src/core/formats/bg-binding.ts:1` | All of that is real and none of it reaches a ROM: no aeon generator reads '{zone}_bglib.json' or a sidecar's 'bgLayoutRe | FALSE | NONE | FIXED |
| C13 | `src/core/formats/bg-binding.ts:1` | The Properties panel's "Background" select ('properties-aeon.ts') does NOT yet render it — the panel has no equivalent w | TRUE | NONE | none |
| C14 | `src/core/formats/bg-override/bg-override-io.ts:1` | aeon's shipped instance does not yet, so the FIRST save adds exactly that byte and the no-op resumes from there.) The co | TRUE | NONE | none |
| C15 | `src/core/formats/bg-override/bg-override-io.ts:93` | Nothing is written in that state TODAY, which is why it is not a loss on its own - but the user is then looking at an ed | HISTORICAL-OK | NONE | none |
| C16 | `src/core/formats/effects/channel-bands.ts:1` | ─── WHAT A GREEN ON THIS MODULE DOES *NOT* RULE OUT ─────────────────────── With the bands sonic4 declares today, the re | TRUE | NONE | none |
| C17 | `src/core/formats/effects/channel-bands.ts:1` | ⚠ AND 'no-band' IS CURRENTLY UNREACHABLE THROUGH THE PANEL. | TRUE | NONE | none |
| C18 | `src/core/formats/effects/curve-rate.ts:1` | It is where a reader checks HOW STRONGLY this module holds its cause, exactly as 'CURVE_RATE_ARMS' is where they check t | TRUE | NONE | none |
| C19 | `src/core/formats/effects/preset-lag.ts:1` | What is actually true today, measured here through git objects rather than relayed: ⚠ IT IS ON A BRANCH, NOT ON THEIR MA | FALSE | NONE | FIXED |
| C20 | `src/core/formats/effects/preset-lag.ts:1` | "Accepted at the door", "obeyed by a machine on a peer's unmerged branch" and "certified" are THREE different facts, and | FALSE | NONE | FIXED (same note as C19) |
| C21 | `src/core/formats/effects/preset-lag.ts:1` | Measured firsthand through git objects at aeon 'origin/master' 'b7f4bdeb', page blob '22a42064' — a revision LATER than  | HISTORICAL-OK | NONE | none |
| C22 | `src/core/formats/effects/preset.ts:580` | A document still carries exactly one raster program — see 'ramp' below and 'EFFECTS_PRESET_RASTER_CHANNELS'. | TRUE | NONE | none |
| C23 | `src/core/formats/effects/ramp-scroll-mode.ts:1` | Aurora's project model is aeon's 'sonic4' data (its 'project.json' declares one zone, 'ojz'), so the conjunct holds for  | TRUE | NONE | none |
| C24 | `src/core/formats/effects/ramp-scroll-mode.ts:1` | So every sentence below is a NEUTRAL statement of what the bindings currently produce, no control is disabled by it, and | TRUE | NONE | none |
| C25 | `src/core/formats/effects/ramp-scroll-mode.ts:137` | So today, in the real project, the honest answer for a freshly bound section is 'act-unset': the scroll config is the en | FALSE | NONE | OPEN (model-level, ramp-scroll-mode) |
| C26 | `src/core/formats/effects/ramp-sign-lag.ts:1` | 'RAMP_SIGN_FIELDS_AWAITING_AEON' is '[]', both surfaces derive nothing, and NOTHING IN THIS FILE REACHES A SCREEN TODAY. | TRUE | NONE | none |
| C27 | `src/core/formats/effects/ramp-sign-lag.ts:1` | it is NOT what aeon ships today. | TRUE | NONE | none |
| C28 | `src/core/formats/effects/ramp-sign-lag.ts:1` | ═══ WHY THIS EARNED A SENTENCE RATHER THAN A SILENT WAIT ═══ ⚠ Past tense throughout, as of the retirement: '-1' builds  | TRUE | NONE | none |
| C29 | `src/core/formats/effects/ramp-sign-lag.ts:1` | '-1' is one of them, and '-1' is exactly what cannot be built today. | HISTORICAL-OK | NONE | none |
| C30 | `src/core/formats/effects/ramp-sign-lag.ts:1` | So today an author types '-0.5', the panel tells them to use '-1', and the document that produces cannot build. | HISTORICAL-OK | NONE | none |
| C31 | `src/core/formats/effects/scene-ui.ts:1` | the codec still refuses anything they let through. | TRUE | NONE | none |
| C32 | `src/core/formats/effects/scene.ts:134` | aeon's 'tools/effects_gen.py' REFUSES the key until their 'CAP_BAND_DRIFT' emission parcel lands, so a scene carrying 'd | FALSE | NONE | FIXED |
| C33 | `src/core/formats/effects/scene.ts:211` | A panel or converter copied from the drift path emits **768 for an intended 3**, and the '-128..127' bound is the ONLY p | FALSE | NONE | FIXED |
| C34 | `src/core/formats/effects/scene.ts:358` | today the value round-trips and the advisories reason about it. | FALSE | NONE | OPEN (Aurora-self, listed) |
| C35 | `src/core/formats/effects/scene.ts:372` | AND A DOCUMENT THAT STILL CARRIES IT IS NOW REFUSED, which is worth stating HERE because the paragraph above ("a field t | TRUE | NONE | none |
| C36 | `src/core/formats/effects/section-wiring.ts:1` | ═══════════════════════════════════════════════════════════════════════════ THE QUESTION, AND THE THREE WRONG ANSWERS IT | HISTORICAL-OK | NONE | none |
| C37 | `src/core/formats/effects/section-wiring.ts:1` | they are what the parse below returns today, recorded here so a future reader can tell a changed world from a broken par | FALSE | NONE | FIXED |
| C38 | `src/core/formats/effects/section-wiring.ts:1` | Everything the three conditions above derive is still ADVISORY and still refuses nothing: what separates the new one is  | TRUE | NONE | none |
| C39 | `src/core/formats/effects/section-wiring.ts:536` | aeon has none today, and nothing here goes looking to make one reachable. | TRUE | NONE | none |
| C40 | `src/core/formats/raster-binding.ts:1` | **False since aeon '9cdf32d8'** ("close: the unwired- section refusal landed inside step 5's own gate", an ancestor of t | HISTORICAL-OK | NONE | none |
| C41 | `src/core/formats/raster-binding.ts:1` | Before it, every section was uniformly unwired and one universal sentence was true. | HISTORICAL-OK | NONE | none |
| C42 | `src/core/formats/raster-binding.ts:1` | 'OJZ_Preset_Sec5' is byte-identical to 'OJZ_Preset_Plain' today. | FALSE | NONE | FIXED |
| C43 | `src/core/formats/raster-binding.ts:1` | the gate prints *"the sidecar arm is VACUOUS today and says so rather than reading green"*. | HISTORICAL-OK | NONE | none |
| C44 | `src/core/formats/raster-binding.ts:1` | this sentence cites the capture and still does not preview anything. | TRUE | NONE | none |
| C45 | `src/core/formats/raster-binding.ts:1` | That is aeon's drafting rule and it is adopted here: "section 5 is wired; | HISTORICAL-OK | NONE | none |
| C46 | `src/core/formats/raster-binding.ts:1` | (a) A second 'raster:' argument in 'games/sonic4/data/effects/ojz_effects.emp' calling '<act>_sec_raster' — then "only s | HISTORICAL-OK | NONE | none |
| C47 | `src/core/formats/raster-binding.ts:1` | • 'tools/effects_seam_gate.py' — 'raster_seam_faults' still carries the case-3 arm and still names the section and the i | HISTORICAL-OK | NONE | none |
| C48 | `src/core/formats/raster-binding.ts:1` | '_load_section_refs' reads '<aeon repo>/<dataPath>/section_N.meta.json' — their checkout — and until the commit lands, ' | HISTORICAL-OK | NONE | none |
| C49 | `src/core/formats/raster-binding.ts:1` | Retiring now would buy a sentence that is false today in exchange for one that would have become true later, which is th | HISTORICAL-OK | NONE | none |
| C50 | `src/core/formats/raster-binding.ts:1` | • 'tools/effects_seam_gate.py' — 'raster_seam_faults' (':133') still carries the case-3 arm (':195-202', *"section N's s | HISTORICAL-OK | NONE | none |
| C51 | `src/core/formats/raster-binding.ts:1` | Its OK line (':381-385') prints *"N sidecar rasterRef(s)"* and appends *"the sidecar arm is VACUOUS today and says so"*  | HISTORICAL-OK | NONE | none |
| C52 | `src/core/formats/raster-binding.ts:1` | So the 'FAST=1' qualifier is still earned, and Aurora still has no such gate (the STANDING REFUSAL below is unchanged). | HISTORICAL-OK | NONE | none |
| C53 | `src/core/formats/raster-binding.ts:1` | 'ONLY SECTION 5 IS WIRED'; | HISTORICAL-OK | NONE | none |
| C54 | `src/core/formats/raster-binding.ts:1` | only section 5's carries 'rasterRef'. | HISTORICAL-OK | NONE | none |
| C55 | `src/core/formats/raster-binding.ts:1` | Its last content edit before today is '54e6da47' (2026-09-02); | HISTORICAL-OK | NONE | none |
| C56 | `src/core/formats/raster-binding.ts:1` | 'band-preset-wording.test.ts' and 'agent-handler.assign-section-preset.test.ts' asserted 'toMatch(/ONLY SECTION 5 IS WIR | HISTORICAL-OK | NONE | none |
| C57 | `src/core/formats/raster-binding.ts:1` | WHAT WAS RETIRED, EXACTLY: • 'ONLY SECTION 5 IS WIRED' and *"exactly one preset() … passes the chooser to its raster: ch | HISTORICAL-OK | NONE | none |
| C58 | `src/core/formats/raster-binding.ts:1` | Any gate written from what we can see today would hardcode ONE act's current content layout into the editor, be silently | HISTORICAL-OK | NONE | none |
| C59 | `src/core/formats/raster-binding.ts:1` | It used to end "(1) Today: 0,1,2,3,4,5" and "(2) Today: **5 alone** ('ojz_effects.emp:1114')". | HISTORICAL-OK | NONE | none |
| C60 | `src/core/formats/raster-binding.ts:1` | If you want today's numbers at a terminal rather than in the app: 'grep -n preset_raster' over aeon's 'games/sonic4/data | TRUE | NONE | none |
| C61 | `src/core/formats/raster-binding.ts:1` | It is the ensure, re-read from aeon's own library on every load — and it already disagrees with aeon's ruling PROSE, whi | FALSE | NONE | FIXED |
| C62 | `src/core/formats/regions/act-constants.ts:365` | 'GRID_W << SECTION_SIZE_SHIFT' is small today, but the same reader folds whatever aeon writes next, and a width that sil | TRUE | NONE | none |
| C63 | `src/core/formats/regions/document.ts:1` | The same 'validateAgainstSchema' runs FIRST on the way out, and the closed schema already refuses an unknown key there,  | TRUE | NONE | none |
| C64 | `src/core/formats/regions/document.ts:1` | That is a defect the generator must catch, and until the derivation lands in Aurora it is a hole, not a check. | TRUE | NONE | none |
| C65 | `src/core/formats/regions/flatten.ts:79` | Today every legal document reaches here with no 'span' at all, because a 'layoutRef' other than the sentinel is refused  | TRUE | NONE | none |
| C66 | `src/core/model/s4-types.ts:214` | neither describes today. | TRUE | NONE | none |
| C67 | `src/core/model/s4-types.ts:214` | So a written 'rasterRef' still has no observable consequence here, which is why the agent tool answers with 'RASTER_SECT | TRUE | NONE | none |
| C68 | `src/core/project/adapter.ts:291` | An ABSENT '{dataRoot}editor/effects/' directory yields an empty library and no error — §2 says so in as many words, and  | FALSE | NONE | FIXED |
| C69 | `src/core/project/aeon/save-skip.ts:1` | ═══════════════════════════════════════════════════════════════════════════ THE DIRECTION THAT WOULD BE A DEFECT ═══════ | TRUE | NONE | none |
| C70 | `src/main/aether/push-palette.ts:64` | (aeon-only caller today) | FALSE | NONE | OPEN (Aurora-self, listed) |
| C71 | `src/main/aether/server-identity.ts:1` | It still returns 'oracle-next' from the Rust core today, which proves nothing about which core is running. | UNCLEAR | NONE | none |
| C72 | `src/renderer/canvas/bg-wrap.ts:1` | So this half DOES produce an advisory — one that is silent on every scene that exists today, silent on every locked scen | TRUE | NONE | none |
| C73 | `src/renderer/canvas/bg-wrap.ts:364` | The advisory for a background that runs out of picture before the act runs out of camera — or 'null', which is the answe | TRUE | NONE | none |
| C74 | `src/renderer/canvas/bg-wrap.ts:364` | ⚠ SO THIS FIRES ON NOTHING TODAY, AND THAT IS THE POINT, NOT A DEFECT IN IT. | TRUE | NONE | none |
| C75 | `src/renderer/canvas/row-remap-span.ts:1` | ═══ ADVICE, NOT PREVENTION, AND THE RULING IS NOT NEW ═══ aeon's generator accepts these documents today and has separat | TRUE | NONE | none |
| C76 | `src/renderer/canvas/tile-lens.ts:1` | The fill edge still carries the truth there. | TRUE | NONE | none |
| C77 | `src/renderer/components/AeonPropertiesPanel.tsx:5` | Cheap today, but the shape is what the remaining plan-5 tasks copy. | UNCLEAR | NONE | none |
| C78 | `src/renderer/components/art-shared/palette-grid-model.ts:73` | No mount locks a line today. | TRUE | NONE | none |
| C79 | `src/renderer/components/art-shared/use-anchored-zoom.ts:5` | That needs a canvas already at the 16000px ceiling — no host reaches it today. | FALSE | NONE | OPEN (Aurora-self, listed) |
| C80 | `src/renderer/components/art-shared/use-anchored-zoom.ts:5` | @param scrollerRef the overflow:auto container element @param canvasRef the CANVAS inside it — the element the art is dr | TRUE | NONE | none |
| C81 | `src/renderer/components/classic/TileTab.tsx:135` | SEAM PREVIEW is the same CROSS-ENGINE SINGLETON as zoom, for the same reason: 'artStore.repeatPreview' is the exact fiel | TRUE | NONE | none |
| C82 | `src/renderer/components/classic/TileTab.tsx:171` | An 8x8 tile never gets near the 16000px ceiling even at zoom 64 * 3, so this cannot change what renders today — it keeps | TRUE | NONE | none |
| C83 | `src/renderer/components/classic/classic-overlays.ts:180` | the fill edge still carries the truth there. | TRUE | NONE | none |
| C84 | `src/renderer/components/effects/BgAnimBandPanel.tsx:1` | A document being full today is one import run's property, not a fact to shape an interface around. | TRUE | NONE | none |
| C85 | `src/renderer/components/effects/BgAnimBandPanel.tsx:1` | 'tileSlotsRemaining' and 'bandsRemaining' stay on screen beside both actions, and a refused control still carries the co | TRUE | NONE | none |
| C86 | `src/renderer/components/effects/BgAnimBandPanel.tsx:865` | Same '(default)' contract as the driver and rate pickers: the empty option LEAVES THE KEY OUT, so the document tracks wh | TRUE | NONE | none |
| C87 | `src/renderer/components/effects/RampSignLagDisclosure.tsx:1` | ⚠ SILENT SINCE 2026-09-03 — THIS COMPONENT RENDERS NOTHING TODAY, for a negative document as much as a positive one. | TRUE | NONE | none |
| C88 | `src/renderer/components/effects/SectionPicker.tsx:94` | Section 0 genuinely cannot carry an editor-authored raster band until aeon threads it. | FALSE | NONE | FIXED |
| C89 | `src/renderer/components/effects/SectionPicker.tsx:94` | It says what you cannot author here until aeon adds one line. | TRUE | NONE | none |
| C90 | `src/renderer/components/effects/SectionPicker.tsx:235` | CONDITION 3 IS ABOUT A PAIR — this section AND the document it binds today — because which choosers a section owes is a  | TRUE | NONE | none |
| C91 | `src/renderer/components/effects/column-layout.tsx:1` | Measured on the live aeon tree at 1680x1050, in px: fa 10 · fb 11 · Cols 22 · Rows 27 · Name 32 · Driver 32 · world_y 38 | HISTORICAL-OK | NONE | none |
| C92 | `src/renderer/components/regions/RegionsPanel.tsx:1` | A 'regions.json' Aurora refused is not an act without regions: the save neither overwrites nor removes it, so a panel sa | TRUE | NONE | none |
| C93 | `src/renderer/components/shared/SpriteBindingRow.tsx:4` | it lives in shared/ for that reason even though only the aeon port uses it today. | TRUE | NONE | none |
| C94 | `src/renderer/providers/band-follow.ts:1` | 'bandLensTarget' keeps an index that may now name no band, which is the staleness 'resolveBandLens' (providers/bganim-pr | TRUE | NONE | none |
| C95 | `src/renderer/providers/bg-anim-aeon.ts:1` | 'camera_y' still does NOT mean vertical motion, and that is now a sharper correction rather than a softer one, because t | TRUE | NONE | none |
| C96 | `src/renderer/providers/bganim-preview-aeon.ts:74` | The preview's licence check is a claim about the blob ON SCREEN, so it has to resolve the background through the SAME fu | TRUE | NONE | none |
| C97 | `src/renderer/providers/effects-aeon.ts:2490` | 'patchable''s sibling rule (raster_dsl.emp:432) is therefore NOT reachable from the editor path today; | FALSE | NONE | FIXED |
| C98 | `src/renderer/providers/effects-preset.ts:272` | the author still reads it here, on the 'title' of the block's own element, with 'SHORT_BODIES.unbound' painted beside it | TRUE | NONE | none |
| C99 | `src/renderer/providers/parallax-preview.ts:1` | THE PARALLAX COMPOSITE, SCOPED TO THE JOB IT BELONGS TO — EW-SHAPE-PREVIEW, the third and last clause of the owner's 'th | HISTORICAL-OK | NONE | none |
| C100 | `src/renderer/shell/project-open-guard.ts:119` | THE CLASSIC HALF IS DEFENSIVE ONLY — 'classicDirty' implies 'openEngine() === 's1'' by construction (see CLASSIC below), | TRUE | NONE | none |
| C101 | `src/renderer/shell/project-open-guard.ts:119` | "It would drop the Save button in states this guard is right about today" has no example: the classic-level saver's own  | TRUE | NONE | none |
| C102 | `src/renderer/shell/tab-activation/dispatch.ts:29` | Neither is a hole today — the agent path only ever focuses level tabs, and the restore path clears nothing because nothi | TRUE | NONE | none |
| C103 | `src/renderer/state/canvas-file.ts:1` | Both call sites are pinned by name-escape tests below precisely because deleting either one currently leaves the suite g | FALSE | NONE | OPEN (Aurora-self, listed) |
| C104 | `src/renderer/state/classic-placement.ts:1` | The alternative — clearing the id at every tool-change call site — is the kind of invariant that holds until someone add | HISTORICAL-OK | NONE | none |
| C105 | `src/renderer/state/classicLevelStore.ts:1` | classicLevelStore — the currently-open classic (Sonic 1) level: which act is selected, its loaded LevelDoc, per-domain d | TRUE | NONE | none |
| C106 | `src/renderer/state/editorStore.ts:246` | Each plane already carries its own 16-bit word, so "solid on both" is fully expressible today as the same shape in both  | TRUE | NONE | none |
| C107 | `src/renderer/state/history-factories.ts:81` | The closures capture the DOC ID, not "the active document", so a stack can restore a sprite that isn't currently checked | TRUE | NONE | none |
| C108 | `src/renderer/state/spriteStore.ts:247` | It IS, however, the id of the "New Sprite…" TAB (shell/tabs.ts) — the entry point that lets a project with no sprites ye | TRUE | NONE | none |
| C109 | `src/renderer/workspace/facets/s1-facets.tsx:1` | 'rings' still has no module on purpose: the s1 profile does not grant it (core/project/s1/index.ts, where the absence is | TRUE | NONE | none |
