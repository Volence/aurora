# THREADED-SET-COMMENT-STALE: the expiry fired on schedule and nobody was listening

**Parcel** `parcel/threaded-set-comment`, base `master` `cb714bbb`.
**Tip** `cc026384`. Five commits: `3962cc77`, `c051e769`, `fb84f568`, `d4311fa0`, `cc026384`.
**Row** `docs/lens-findings.jsonl` id `THREADED-SET-COMMENT-STALE`, filed 2026-09-10T09:12:57Z, severity **low**.

---

## VERDICT ON THE PRICE: the row was UNDERPRICED, and the reason is instructive

The row said this was **prose staleness in a source comment**, with *"BEHAVIOUR IS SAFE:
the set is derived by parsing, not hardcoded"*. Both halves of that are true and neither
is the finding.

**What the row measured** — `src/core/formats/effects/section-wiring.ts` derives
`threadedBy` from aeon's file at runtime, so the panel's per-section strip is correct.
That is right, and checking it first was the correct instinct.

**What the row did not open** — the same file exports
`RASTER_SECTION_BINDING_LIMIT`, a **string, not a comment**, published to a person and
to an agent in **four** places:

| surface | site |
|---|---|
| band-preset panel's limit block | `src/renderer/providers/effects-preset.ts:332` |
| `assign_section_preset` agent reply | `src/renderer/agent/agent-handler.ts` |
| `set_effects_preset` MCP tool description | `src/main/editor-methods.ts` |
| `assign_section_preset` MCP tool description | `src/main/editor-methods.ts` |

It said, in capitals: **`WHICH SECTION YOU BIND NOW DECIDES WHAT HAPPENS, AND ONLY
SECTION 5 IS WIRED.`** That sentence had been false since 2026-09-03. The severity of a
false comment and the severity of a false sentence a tool shows a person are not the
same severity, and the row treated the whole file as the first kind.

So: **`low` -> the fix belonged in the `medium`/`high` band**, not because the count was
wronger than the row said, but because of *where the count was standing*.

---

## GROUND TRUTH, re-derived rather than taken from the row

Read at aeon `origin/master` = **`a6aaf5811b711b3cb7097e6f3bc914f7fda89f3e`** (2026-09-10),
through `git show <rev>:<path>`, never their working tree. The aeon checkout was resolved
through this repo's own `test/support/sibling-root.mjs` (answer: *step 3, git
rev-parse --git-common-dir*), never typed.

| claim | truth at `a6aaf581` |
|---|---|
| threaded sections | **{5, 6}** — `ojz_effects.emp:1665` `OJZ_Preset_Sec5 sec: 5`, `:1723` `OJZ_Preset_Sec6 sec: 6` |
| bound sidecars | **{5, 6}** — `section_5.meta.json` -> `ojz_sec5_showcase`, `section_6.meta.json` -> `ojz_sec6_baseswap` |
| `EditorRaster_OJZ_Act1_Bindings` | **2** (`games/sonic4/data/generated/ojz/act1/effects_scenes.emp:315`; chooser arms `:399`, `:400`) |
| aeon's content test | **renamed**: `test_section_5_and_6_are_the_bound_ones_and_their_ids_are_the_shipped_documents`, `sorted(bound) == [5, 6]`, message *"the bound sections are ..., not [5, 6]"* |
| shared preset records | **none** — `act_descriptor.emp` binds nine distinct records to nine sections, so "sections 6-8 share one record" is also false |
| the `FAST=1` qualifier | **false** — `build.sh:712-721` runs `tools/effects_seam_gate.py --source-only` unconditionally under `FAST == 1 && GAME == sonic4` |

The two aeon tests the sentence names by path still exist and still carry the arms it
describes (`tools/test_effects_seam_gate.py`,
`tools/test_raster_cycle_table_lint.py::test_every_preset_document_is_REACHABLE`).

---

## THE CENSUS, in the three classes the row conflated

### (b) A string that reaches a person or a gate — the expensive class

All in `RASTER_SECTION_BINDING_LIMIT`. Nine false clauses:

1. `ONLY SECTION 5 IS WIRED`
2. `exactly one preset() ... passes the chooser to its raster: channel`
3. `EditorRaster_OJZ_Act1_Bindings is 1`
4. `BINDING ANY OTHER SECTION STILL REACHES NOTHING`
5. `nothing here warns, and FAST=1 skips that gate`
6. `section 5 bound to ojz_sec5_showcase is the ONLY state aeon's canonical build accepts`
7. `test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document` (renamed upstream)
8. `the exact-[5] assertion (sorted(bound) must equal [5])` and `"the bound sections are [], not [5]"`
9. `exactly one sidecar carries the key (section 5's) ... counts 1 sidecar rasterRef`

Plus `sections 6-8 share one record`, which was a snapshot in the hand-work clause.

### (a) Header comment — the cheap class, and the class the row named

- `raster-binding.ts` the `(1)`/`(2)` two-conditions paragraph (**the row's own subject**:
  *"Today: 5 alone (`ojz_effects.emp:1114`)"* — count, line and file offset all wrong,
  and `(1)`'s *"Today: 0,1,2,3,4,5"* wrong too)
- five more files carrying the same restated count: `src/shared/agent-protocol.ts`,
  `src/core/model/s4-types.ts`, `src/renderer/agent/agent-handler.ts` (two sites),
  `src/main/editor-methods.ts` (two sites), `src/renderer/providers/effects-preset.ts`

One of those deserves its own line. `editor-methods.ts` warned that an agent reading only
"aeon threads the chooser" *"would bind section 6 and report a band it will never get"*.
By 2026-09-10 section 6 was the **wired** example. **An illustration built from a snapshot
does not merely go stale: it inverts, and goes on reading as a warning while teaching the
opposite.**

### (c) Test expectation — and this class was ACTIVELY HARMFUL here

- `src/renderer/components/effects/__tests__/band-preset-wording.test.ts`
- `src/renderer/agent/__tests__/agent-handler.assign-section-preset.test.ts`

Both asserted `toMatch(/ONLY SECTION 5 IS WIRED/)`, plus aeon's test name, aeon's `[5]`
literal and aeon's message text. **Those rows were green exactly while the sentence was
false, and would have gone red on the correct repair.** A wording test pins a *string*, not
a *fact*; pointed at a claim about a peer repo it is an **anti-expiry** — it defends the
snapshot from the correction. That is the shape to look for elsewhere in this tree: a
peer-facing claim whose only automated reader checks that it has not changed.

---

## THE INTERESTING HALF: why the EXPIRES mechanism did not fire

`raster-binding.ts` carries **four** dated EXPIRES blocks. The first clause of every one is
*a second section is threaded*. `:194` says *"EVALUATE, DO NOT OBEY. If a second section is
threaded, this sentence is the lie it exists to prevent"*. `:533` says *"a second threaded
section would fire both"*.

**The plain answer, and it is not "there was no gate".**

| when | what |
|---|---|
| 2026-09-03 16:13:33 -0400 | aeon `6ae88363` authored ("EFFECTS-W1 item 11a authorable ... real section 6 binding") |
| 2026-09-03 **16:47:34 -0400** | it **arrived** in this machine's aeon checkout — first `origin/master` reflog entry containing it, `850d4c60`; the entry before it, `69bb4dce` at 16:38:59, does not |
| 2026-09-03 **17:22:20 -0400** | aurora `49dc5827` re-pinned `section-wiring.test.ts` to `wiredSections(...) === [5, 6]` — **35 minutes after arrival** |
| 2026-09-03 -> 2026-09-10 | `raster-binding.ts` untouched. Its last content edit was `54e6da47` (2026-09-02); `07058678` (2026-09-05) is a whole-tree dash sweep that changed no claim |

**A gate existed, it read aeon's real file, it went red at the right moment, and a person
fixed it inside the hour.** What did not exist was any *link* from that derivation to the
sentence. The repository held one fact twice — once **derived and gated**, once as
**prose pinned by wording tests** — and the two disagreed for seven days with every check
green. The alarm rang in the room next door.

**And a second clause of the same list had also fired, from a different cause.** *"nothing
here warns, and FAST=1 skips that gate"* was false from aeon's 2026-09-02 walkthrough
finding b4, eight days. Two independent clauses of one list, both fired, both unread: **the
failure is the list's readership, not any one clause's drafting.**

The corollary is the one worth carrying: the drafting rule this header adopted from aeon —
*"name the number, so the expiry is obvious"* — was right that the expiry becomes obvious
and wrong that anything would look. **Obvious to a reader is not the same as read by an
instrument.**

---

## WHAT CHANGED

### The sentence: rule, instrument, command, then a refutable reading

Every claim that rested on a snapshot of aeon's content now leads with what cannot go
stale:

- **THE RULE** — a section is wired exactly when some `preset()` in
  `games/sonic4/data/effects/ojz_effects.emp` passes `ojz_act1_sec_raster(sec: N, hand: ...)`
  to its `raster:` channel.
- **THE INSTRUMENT** — the editor re-derives that set per act on every load
  (`core/formats/effects/section-wiring.ts`); the panel strip renders the derivation, so
  nothing in the app quotes the reading.
- **THE COMMAND** — `grep -n sec_raster` over that file in an aeon checkout, at a committed
  revision.
- **THE READING** — *at aeon `a6aaf581` (2026-09-10) the wired set is {5, 6}*, with the
  line numbers, and the sentence says in the same breath that the grep is what refutes it.

The same treatment for the bound set, the sidecar count, the shared-record clause and the
`FAST` qualifier. Where a snapshot of another repo's **tests** survives (their pinned list,
their test names), the clause now **says it is a snapshot** and names the files to re-read,
because no local instrument reads it.

### The gate: `src/core/formats/__tests__/raster-binding-threaded-set.test.ts`

Five rows. The load-bearing one re-derives the wired set from aeon's real file with **this
repo's own** `libraryRasterChooserCalls` — the same parser the panel renders, so the
expectation is *derived*, not a second pin that could drift from the product — and refuses
to let it disagree with the sentence's reading. The sentence carries that reading in one
canonical, machine-findable spelling: `at aeon <sha> (<date>) the wired set is {a, b}`.

**Runner:** `vitest run`, inside the `npm test` chain (`package.json` `"test"`), so it runs
on every full suite. Not a standalone script.

---

## THE GATE AGAINST INVARIANT 7

**(a) Proven red-first, with the mutation applied and quoted from disk.** Four mutations,
each applied and shown before the run.

*M1 — the sentence shrinks (a "just update the number" regression).*

```
$ sed -i "s/the wired set is {5, 6}/the wired set is {5}/" src/core/formats/raster-binding.ts
$ grep -n "the wired set is" src/core/formats/raster-binding.ts
735:  + 'a6aaf581 (2026-09-10) the wired set is {5} — OJZ_Preset_Sec5 with sec: 5 at :1665, and '
$ git diff --stat
 src/core/formats/raster-binding.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

RED, exit 1, `Tests 1 failed | 4 passed (5)`:

> the published limit says the wired set is {5} as read at aeon a6aaf581 (2026-09-10), and
> aeon's file today threads {5, 6}. THIS IS THE EXPIRY FIRING, not a regression: ...
> expected [ 5, 6 ] to deeply equal [ 5 ]

*M2 — no aeon checkout (loud on unmeasurable).* `EMPYREAN_SUITE_ROOT` pointed at an
**empty existing directory** (the recipe `sibling-root.mjs` prescribes; a *missing* path is
now a hard `SuitePathError`). Exit 0, `Tests 2 passed | 3 skipped (5)`, and the skip
reporter printed the reason on each of the three:

> SKIPPED, NOT PASSED: no aeon effects library at .../aeon/games/sonic4/data/effects/ojz_effects.emp.
> ... Nothing was measured: the sentence may be right or may be as wrong as it was for the
> seven days this row exists to prevent.

The two rows that passed read only the constant, and correctly do not depend on aeon.

*M3 — aeon present but threading nothing (anti-vacuous).* A fake suite root whose
`ojz_effects.emp` is one line:

```
pub data OJZ_Preset_Plain: EffectsPreset = preset(pal: OJZ_Palette, raster: Raster_Program_None)
```

RED, exit 1, with the message that stops the wrong repair:

> this repo's own libraryRasterChooserCalls found NO chooser call in ... That is a parser or
> a path failure, not a fact about aeon: at least one section has been threaded continuously
> since aeon 9cdf32d8. Do not "fix" the sentence to match this.

*M4 — aeon grows a third threaded section (the real-world firing direction, i.e. an exact
replay of 2026-09-03).* Fake library threading `sec: 5`, `sec: 6` and `sec: 7`. RED, exit 1:

> the published limit says the wired set is {5, 6} ... and aeon's file today threads
> {5, 6, 7}. THIS IS THE EXPIRY FIRING ... Do NOT simply widen this matcher.

**(b) Restored from a COMMITTED baseline.** M1's mutation was undone with
`git checkout HEAD -- src/core/formats/raster-binding.ts` against commit `3962cc77`, and
the restored line quoted back from disk. M2/M3/M4 never touched a tracked file — the
poison lived entirely in a scratch suite root, removed afterwards.

**(c) Actually red.** Exit codes captured on their own line (`EXIT=$?`), never grepped out
of piped output: M1 `EXIT=1`, M3 `EXIT=1`, M4 `EXIT=1`. M2 is `EXIT=0` **by design** and its
evidence is the skip reporter's three notes, not the exit code.

**(d) Wired into a runner that executes it; expectations derived; loud on unmeasurable.**
Runner named above. The expectation comes from this repo's own parser over aeon's bytes.
Absence (`ctx.skip` with a reason) and blindness (an unparseable sidecar throws; a
zero-length derive fails with "parser or path failure") carry **three distinct outcomes**,
never two.

**(e) Retroactive when the METHOD changes.** The method did change: the wording tests'
method of *quoting a peer's content back at ourselves* is retired. Re-established:
`band-preset-wording.test.ts` and `agent-handler.assign-section-preset.test.ts` now pin the
**shape** of the disclosure (a dated anchor of *some* revision, the stable halves of aeon's
test names, the rule and the command), plus **negatives** so the retired absolutes cannot
return by revert or by re-typing a number. Every matcher those files lost is listed inline
at its site with the date and the reason, so the loss is auditable rather than silent.

### THE COST OF THE CHOICE, STATED

The gate reads a **LIVE sibling working tree**, so it goes red on a change nobody in this
repo made. That is deliberate: it is the alarm four dated EXPIRES blocks asked for and never
got, and a **FROZEN pin** (a SHA committed here) would go stale in *silence*, which is
precisely the defect being repaired. Neither is free. This one fails loudly and on the right
side, and the precedent is on the same axis — `section-wiring.test.ts` already reads that
live tree for the same fact, and it is what worked on 2026-09-03. The run prints its own
provenance stamp (which checkout, `WORKING TREE` mode, the base SHA plus the sentence that
stops the SHA reading as an identity for the bytes), so a stale read is distinguishable from
a fresh one.

---

## AEON'S SHARE, stated as a sendable ask

**Nothing in this parcel is aeon's to fix.** Their tree is correct: they threaded section 6,
bound it, re-emitted the generated module, and *renamed their own content test and moved its
literal* in the same commit. The staleness was entirely on our side.

There is one thing worth **sending**, and it is a courtesy rather than a defect:

> **To aeon's lane.** Aurora publishes a sentence to authors and to agents describing which
> OJZ act-1 sections are wired for a raster preset, and it names three of your tests by path
> and `::name`
> (`tools/test_effects_seam_gate.py::TestRasterSeamAgainstTheRealTree::test_the_bound_sections_are_exactly_the_threaded_ones`,
> its sibling `test_section_5_and_6_are_the_bound_ones_and_their_ids_are_the_shipped_documents`,
> and `tools/test_raster_cycle_table_lint.py::test_every_preset_document_is_REACHABLE`).
> We now gate the *threaded set* against your real `ojz_effects.emp` on every test run, so
> that half self-corrects. The *test names* are still a snapshot we cannot see change: the
> sibling one was renamed at `6ae88363` and we carried the old name for seven days. No ask
> to change anything — just: if that test is renamed again, a line in the commit message
> saying so is enough for us to catch it, and the booking you already have to publish the
> wired set as generated output would let us drop the snapshot entirely.

Filing that as a cross-repo *claim* in our tree would be exactly the "a cross-repo claim has
no local reader" failure, so it is written here as a message to send, not as a fact asserted
in our source.

---

## VERIFICATION

Full chain, `npm test` (14 static gates + `tsc --noEmit` + `vitest run`), run to completion
three times during this parcel; final state:

```
EXIT=0
Test Files  598 passed | 3 skipped (601)
     Tests  8935 passed | 9 skipped (8944)
```

Zero failures. The 9 skips are pre-existing absent-fixture rows in 7 files
(`bg-override-art-injector-gate`, `compose-bench`, `aeon-warp-correspondence`,
`s1-warp-live`, `anim-import`, `sprite-import`, `sibling-root`), none of them this parcel's;
the new gate's 5 rows all **ran** against a present aeon checkout. `skip-report: OK. Every
skip named its reason.` `failure-class: no failures in this run (601 module(s) reported).`

Wall clock at the final green run: **2026-09-10T09:56:54Z**, box uptime 10:17, load average
15.42 / 11.98 / 10.81 — a busy box, which is why only assertion outcomes are quoted as
findings above and no timing figure is offered as a measurement.

Two gates in the chain went red on the rewrite and both were real:
`check-src-dashes` (6 dashes) and `check-test-dashes` (3). One of those was **not a dash
problem**: the constant carries a verbatim aeon pytest message whose dash is sanctioned by
name in `scripts/check-src-dashes.mjs`'s `ALLOWANCES`, and that allowance matches *on the
offending line* — a rewrap had pushed the quotation's leading `"no` onto the previous source
line, so the allowance stopped matching while the dash remained. The gate said so plainly
("1 allowance(s) match NOTHING in the tree") and the repair was to put the quotation back on
one line with a comment saying why it must stay there.

---

## WHAT IS LEFT OPEN, and why

1. **Aeon's test names remain a snapshot with no local reader.** Gating them would mean
   parsing their Python test file for identifiers, which is a second derivation of someone
   else's harness and would break on a refactor that changes nothing we care about. The
   clause now *declares* it is a snapshot and names the files to re-read. Their booked
   "publish the wired set as generated output" would close it properly.

2. **The `FAST`/`NO_LINT` claims are a snapshot of `build.sh`.** Same reasoning; same
   declaration. Re-read at `a6aaf581` and correct as written today.

3. **The other `PRESET_LIMITS` sentences were not audited.** This parcel's population was
   `raster-binding.ts` and the sites that carry its constant. `NO_PREVIEW` and the other
   limits carry their own dated EXPIRES lists with, as far as this parcel checked, the same
   absence of a reader. **That is the generalisation worth booking and it is not booked
   here**: a sweep for "a dated EXPIRES list in this repo whose only automated reader is a
   wording test" is a separate parcel, and it is the one this finding argues for.

4. **Nothing was run in an emulator or a browser.** Per the standing invariants: no
   `mcp__oracle__*`, no Electron, no CDP, no ROM build. The four surfaces the string reaches
   were verified **by reading the code that carries it** and by the existing tests that
   assert the reply and the registry entry carry the constant by reference. **TAGGED for the
   controller's foreground follow-up:** seeing the corrected sentence rendered in the live
   band-preset panel, which no test in this repo can do.
