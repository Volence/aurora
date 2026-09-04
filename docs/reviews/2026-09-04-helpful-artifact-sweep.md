# The helpful artifact, swept — a gate for the mechanical half, a census for the rest

**2026-09-04 · branch `fix/helpful-artifact-sweep` · base `eb426df3`**

On 2026-09-03 this repo found and fixed six comments that were **worse than their own
absence**: a stale `spare` on bits that had been the loop crossover for weeks; two
headers saying the band limits *render in full* nine lines above the code that hovers
them; both of those headers citing a gate file **`effects-preset-wording.test.ts` that
has never existed**; a refusal that computed and named `-1` as a nearest usable rate; a
docblock contradicted by its own next two lines; and ten stale *contested* notes, one
of them a painted `title`. Every one of them reads as care, and that is what kept
anybody from re-checking it.

All six were fixed. This parcel is about the ones nobody had hit.

---

## 1. The gate: `scripts/check-cited-paths.mjs`

    npm run check:cited-paths          # and in the `npm test` chain

It reads the **whole-line comments** of every `.ts/.tsx/.mjs/.mts/.py/.sh` file under
`src/`, `test/`, `scripts/`, `scratchpad/` and fails when a comment cites an in-repo
path or a bare source filename that is not on disk.

**Final tree: 1,257 files, 1,877 in-repo citations, two rules, both fired on their
canaries, eight negative canaries silent.**

### Which surface, and why not one of the two that already exist

The brief asked for an extension rather than a duplicate. Both candidates were read
first, and neither can carry this rule:

* **`scripts/check-peer-path-literals.mjs`** is the closest, and its central thesis is
  the exact inverse of this one — *"comments are records, executable lines are
  coupling"*. It calls `stripComments()` before any rule runs, so **the text this gate
  reads is the text that one deletes first**. A comments-only rule bolted into it would
  also falsify its own summary line (*"no **executable** line …"*), which is the one
  sentence a reader of that gate trusts. It is also blind to `.md` and has no notion of
  a bare filename.
* **`scratchpad/check-harness-guards.mjs`** is scoped to launcher safety in
  `scratchpad/` and never reaches `src/`, where five of the six defects lived.

So: a separate instrument, with its own population, its own extraction, and its own
summary line — wired into the same `npm test` chain, immediately after
`check-peer-path-literals`.

### The two rules

| id | what fails |
|---|---|
| `cited-path-missing` | a comment naming a path rooted at `src/`, `test/`, `scripts/` or `scratchpad/` that is not on disk (as a file, a directory, or a module once one of `.ts/.tsx/.mjs/.mts/.js/.py/.sh` is appended) |
| `cited-file-missing` | a comment naming a bare source filename (`.ts/.tsx/.mjs/.mts`) matching no file under those roots |

`cited-file-missing` exists because **the defect that prompted this gate was spelled
that way**: `effects-preset-wording.test.ts`, no directory in front of it at all.

### What it does NOT cover — eleven holes, in the file's own header

A gate that hides its coverage is an instance of this family, so every exclusion is
written down where the next reader will meet it:

1. **Peer paths are never failed on.** `aeon`, `sigil`, `empyrean`, `seraph`, `oracle`,
   `s1disasm` may simply not be present (an agent worktree usually has none of them), so
   "not on disk" says nothing about the citation. They are **not silently skipped**:
   every comment line naming one is counted, and the count is on the summary line —
   **575 lines this run**.
2. **`docs/…` is not checked at all**, and this is the biggest hole. Every repo in the
   suite has a `docs/`, and this repo's comments cite the peers' by exactly that
   spelling: `docs/DEFERRED_WORK.md` and `docs/BUGS.md` in four files are **aeon's**,
   `docs/LOOP_CROSSOVER_ENCODING.md` is aeon's. Judging the token would fail correct
   citations. Counted with the peer traffic above.
3. **Markdown is not scanned.** `docs/plans/*`, `docs/reviews/*` and the ROADMAP are
   **dated records** — a 2026-05-02 plan naming a file renamed in June was right on its
   own day. Measured before deciding: **387 distinct rooted paths in this repo's
   markdown do not resolve**, nearly all of that shape. The rule enforced here is for
   *live instructions to a maintainer*.
4. **Only whole-line comments are read** (first non-blank characters `//`, `/*`, `*`,
   `*/`, or `#`). A trailing comment after code is not read. That is a real loss, taken
   on purpose: separating a trailing `//` from a division sign or a regex needs the
   tokenizer whose desync produced **two** of 2026-09-03's other defects, and a citation
   gate that can be blinded by one apostrophe is not worth having. Judging each line on
   its own cannot desync.
5. **A line number is not checked** — `effects-preset.ts:58` passes on the file alone.
6. **A symbol name is not checked** — `presetLimitsShort()` in prose is invisible here.
7. **A path built at runtime is invisible** — this reads comments, not code.
8. **Git-ignored paths pass unchecked** (17 this run): `scratchpad/shots-*/`, the
   hardlinked aeon fixtures, the one-off probes named individually in `.gitignore`. They
   are legitimately absent in a fresh checkout.
9. **Placeholders are skipped**: a token containing — or immediately followed by, with
   at most one intervening `-` — `<`, `>`, `*`, `?`, `…`; and a token ending a line whose
   last character is `-` (a path hyphen-wrapped onto the next line).
10. **`cited-file-missing` only judges a compound name** (stem contains `-`, `_`, or an
    uppercase letter). `emit.ts`, `test.ts`, `proof.mjs`, `app.mjs` and `classic.ts` are
    used in this repo's comments as generic nouns and cannot be told from real one-word
    filenames. **So a citation to a genuinely one-word module — `guides.ts` — is not
    checked** unless it is written as a path.
11. **A line may declare its own absence** (`has never existed`, `there is no …`, and six
    more spellings; **13 citations this run**). The best repair for a fabricated citation
    keeps the wrong name and says it is wrong — that is what O79 wrote — and a gate that
    taxed that repair would be paid in deleted history. The hole: a marker silences every
    in-repo citation **on its line**, the accidental one included. It must be on the same
    line as the token.

### Two mechanisms that keep the gate from becoming the thing it polices

* **A written `EXEMPT` table — 8 rows, each with its reason** — and a run **FAILS when an
  exemption no longer matches any citation**, naming the row to delete. That fired three
  times while this was being written, which is the demonstration.
* **Loud on unmeasurable, exit 2 not 0**: an unreadable source, a `git` that will not
  answer, a root that is not a directory, an empty population, a population yielding no
  citations at all, a canary that stopped firing, a *negative* canary that started.

### Red-first evidence — three poisons, mutation quoted from disk, restored from the committed baseline `26f738eb`

| # | mutation | result |
|---|---|---|
| **P1** | appended to `src/core/aether/warp-math.ts`: `// See src/core/aether/no-such-file-planted.ts for the derivation.` | **RED, exit 1** — `warp-math.ts:89 [cited-path-missing] src/core/aether/no-such-file-planted.ts` |
| **P2** | inserted in `src/renderer/components/guide/markdown-lite.ts`: ``// The parser is gated by `markdown-lite-parser.test.ts`, which is thorough.`` | **RED, exit 1** — `markdown-lite.ts:45 [cited-file-missing] markdown-lite-parser.test.ts`. Note P2's own preamble line contains "never existed" two lines above and did **not** silence it: markers are per-line. |
| **P3** | `isCommentLine` returns `false` in both dialects — a reader that sees nothing | **COULD NOT MEASURE, exit 2** — *"rule `cited-path-missing` did not fire on its canary"*. Not a green. |

Each restored with `git checkout --` from the committed baseline and the gate re-run to
`OK` before the next was planted. The canaries themselves are the standing regression
control: three positive (both dialects for `cited-path-missing`, one for
`cited-file-missing`) and **eight negative** — a present path, a present bare name, an
executable line, a `docs/` token, a peer token, a placeholder, a generic one-word name,
and a hyphen-wrapped path — all built from tokens **derived** from the population, with
the absent ones asserted absent before use.

---

## 2. What the gate found: nine fabricated citations

Every replacement was checked against the tree, not against plausibility, and where the
tree gave no answer the comment now says so.

| site | cited | verdict |
|---|---|---|
| `src/core/aether/warp-math.ts:15` | `scratchpad/warp-mailbox-harness` | **Never existed, in tree or history.** The comment claimed the editor/engine origin correspondence *"is checked at runtime … rather than assumed"* — **a citation that names a proof carries the authority of a proof.** No instrument checks it: `warp-math.test.ts` is arithmetic only, `warp-tearing-harness.mjs` diffs two routes to the *same* destination (silent about whether that destination is the pixel the editor meant), and `boot-restore`/`warp-route` test the mailbox, not the origins. The paragraph now says the correspondence is **assumed**, and names what each nearby instrument does instead. |
| `src/renderer/components/ui/act-and-drop-focus.ts:51` | `scratchpad/d27-focus-survey-harness.mjs` | Never existed, under the heading **"WHAT PROVES IT"**. The survey's nine are six in `d27-sprite-focus-harness.mjs` and three in `d27-effects-focus-harness.mjs` — read off both headers, which count them. Repointed to both. |
| `src/renderer/providers/effects-preset.ts:2820` | `ramp-control.test.ts` | Never existed. The cross-check is `__tests__/effects-preset-ramp-control.test.ts` **§2** (lines 221-236 assert exactly *"returns null exactly when that returns an object"*). |
| `src/renderer/providers/effects-preset.ts:3057` | `ramp-control.test.ts` | Never existed. Both halves of the display-lag claim are **§3** (lines 262-361). |
| `src/renderer/components/guide/markdown-lite.ts:37` | `markdown-lite.test.ts` | Never existed. The real gate is `guide/__tests__/guides.test.ts`, which imports `parseGuide/inline/slugify` and parses the **real shipped guide** via `?raw` — exactly the property the comment claimed. |
| `src/core/level-classic/object-sprite.ts:9` | `classic-object-art.ts` | Never existed; sole mention in the repo. The module that reads the art/mappings files and wraps the indices in an `ImageBitmap` is `src/renderer/state/classicObjectArtStore.ts` (its own header states both halves). |
| `src/renderer/state/__tests__/classicLevelStore.test.ts:975` | `classic-write.ts` | Never existed. The overhang refusal lives in `src/core/level-classic/collision-write.ts`. |
| `src/renderer/canvas/__tests__/loop-lens-wiring.test.ts:1` | `overlay-priority-wiring.ts` | The sibling of a test file is a test file: `overlay-priority-wiring.test.ts`. |
| `src/renderer/debug-hooks.ts:4` | `scratchpad/crash-investigation/launch.sh` | Never existed. The flag is set by the operator as `VITE_AURORA_DEBUG=1 npm run build` — the command `scratchpad/lib/run-root.mjs` names when it refuses a stale bundle — and `scratchpad/crash-harness.mjs` is the driver this module was written for. |

### The eight exemptions, and why each is right to name something absent

Four **worked examples and counterfactuals**: `check-peer-path-literals.mjs`'s
`sibling-root-RENAMED.mjs` (the sentence's subject is a file deliberately not readable),
`check-test-collection.mjs`'s `src/renderer/foo.test.ts` and `scratchpad/x.test.ts`, and
`check-harness-guards.mjs`'s `scratchpad/x.mjs`.

Four **provenance and quotation**: `map-status-model.ts` and `map-status-classic.test.ts`
naming `ClassicProjectView.tsx` (the pre-re-home classic bar — **verified deleted** in
`git log --diff-filter=D`, so the sentence about "the legacy bar" is a record, not a
pointer); `aeon/load.ts`'s two spellings of `src/renderer/hooks/load-collision.ts` (the
file this module was ported *from*, deleted by that port — also verified in history).

That history check is what separated these from the nine above: `ClassicProjectView.tsx`
and `load-collision.ts` **did exist and were deleted**; `classic-write.ts`,
`ramp-control.test.ts`, `markdown-lite.test.ts`, `classic-object-art.ts` and
`overlay-priority-wiring.ts` have **never** appeared in this repo's history at all.

`test/support/run-root.test.ts`'s four quoted basenames needed no exemption in the end:
they are named individually in `.gitignore`, so exclusion 8 already covers them — which
is the paragraph's own point.

---

## 3. Census (b): a stated condition that may have resolved

Grepped for `contested`, `pending`, `awaiting`, `not yet`, `once … lands`, `blocked on`,
`temporarily`, `for the moment`, `as of now`, `will land`, `soon to be` in comments under
`src/` and `scripts/`: **56 hits**, of which the great majority are *in-flight UI state*
("a pending paste", "pending timers", "pending writeGuarded") and not stated conditions
at all. The nine that are:

| site | claim | verdict |
|---|---|---|
| **All five `contested` sites** — `preset-lag.ts:62`, `ramp-scroll-mode.ts:99`, `BandPresetPanel.tsx:1462`, `effects-preset-ramp-scroll-mode.test.ts:28`, `ramp-scroll-mode-harness.mjs:41` | the `top + 1` display-span disagreement | **CORRECT AS-IS.** Every one already says **SETTLED**, names empyrean `e9409dc`, gives the direction it settled in, and two of them add *"do not re-add a caveat saying it is"*. The `BandPresetPanel` one is a JSX `{/* … */}` comment and paints nothing — checked, because instance 6 of the original six **was** a painted `title`. |
| `ramp-sign-lag-disclosure.test.ts:254` / `ramp-sign-lag.ts:128` | `RAMP_SIGN_FIELDS_AWAITING_AEON` | **CORRECT AS-IS, and exemplary.** Dated `2026-09-03`, pinned to aeon `origin/master ddaab282`, with a named retirement detector (`test/formats/aeon-ramp-sign-drift.test.ts`) that reports the day the constructor starts encoding. A hold that carries its date, its owner and what ends it. |
| `bganim-preview-aeon.ts:260,273` | *"THE VERTICAL WORD IS NOT YET WATCHED"* | **CORRECT AS-IS.** It labels itself `DERIVED-FROM-A-CONFIRMED-MECHANISM, not watched`, states which half was confirmed on the ROM and when, and is structured so a contradicting run edits **one constant**. Confirming it needs a ROM run this lane is not permitted to make. |
| `explorer-data.ts:6` | *"Level Art / Palettes / UI & Screens are still pending"* | **CORRECT AS-IS, checked**: only the `Canvases` and `Object Library` groups are built in that file. |
| `agent-handler.ts:460`, `editorStore.ts:229` | *"not blocked on aeon's encoding anchor"* | **CORRECT AS-IS.** A structural claim (each plane carries its own 16-bit word), not a temporal one; `both-planes-paint.ts` derives it at length. |
| `effects-aeon.ts:1971`, `effects-aeon.test.ts:1183` | *"the rule … is pending the owner's review (it touches ROADMAP rows 37/58/66)"* | **LEFT, AND FLAGGED AS UNSURE.** Rows 37, 58 and 66 are all now **DELIVERED**, but none of them is the rule quoted, and a search of the ROADMAP for `originate`/`advisory` found no row recording a ruling on *"the control that owns a value refuses to originate an illegal one"*. Absence of a record is not evidence the hold expired, and rewriting it on that basis would be the same defect with a fresh date. **It carries no date and no owner — that is the improvement to make when someone can ask.** |

---

## 4. Census (c): a comment asserting a rendered behaviour

Grepped for `renders in full`, `never a tooltip`, `always shown`, `always visible`,
`is not a tooltip`, `spare`, `unused`, `reserved for`, `no longer used`, then a second
sweep for `never a hover`, `no tooltip`, `never hidden`, `always painted`,
`never truncat`: **52 + 6 hits**. Most are domain vocabulary — *unused* palette slots,
*spare* tile slots — and are about data, not rendering. The ones that assert a rendered
behaviour:

| site | claim | verdict |
|---|---|---|
| `effects-preset.ts:280` | *"the author still reads it here, **in full**, in the block that never truncates"* — sitting on `body: RASTER_SECTION_BINDING_LIMIT` | **FIXED. This is instance 2's exact defect, in the very file whose header (lines 25-34) states the amended rule.** `LimitBlock` paints `SHORT_BODIES` and carries `body` on the same element's `title`. |
| `effects-preset.ts:824` | *"`RASTER_SECTION_BINDING_LIMIT`, **rendered in full** by `LimitBlock`"* | **FIXED**, same defect, same file, 544 lines further down. |
| `section-raster-select.test.ts:234` | *"**renders in full** at the top of this very section"* | **FIXED**, third surviving site, in the gate for the very control the sentence is about. |
| `core/editing/collision-word.ts:39` | *"any feature that might one day use **the spare bits**"* | **FIXED.** The same stale `spare` as instance 1, four paragraphs above that file's own section explaining that bits 15:14 **are** the loop crossover. The mask-complement rule the paragraph defends is correct and untouched; only the adjective was left over. |
| `BandPresetPanel.tsx:32`, `band-preset-wording.test.ts:26,638`, `collision-cell-word.ts:10-12` | | **CORRECT AS-IS** — these are yesterday's repairs, and they read correctly. |
| `theme.ts:67` | *"toast always visible, even over a dialog"* | **CORRECT AS-IS**: `Z.toast` 1300 > `Z.modal` 1100, in the same declaration. |
| `effects-aeon.ts:2060,2064` | *"Never hidden"* on `diagnosis`/`remedies` | **CORRECT AS-IS** — a **requirement on any surface**, stated as such in the docblock above ("a surface that hides `remedies` has inverted the ruling"), not a report of current rendering. |
| `agent-handler.ts:129` | *"`section.tiles` — unused today, reserved for future per-section art"* | **LEFT.** The field is *read* in four places (`section.tiles ?? zone.tileset.tiles`) but nothing writes it, and `atlas-migration.ts` nulls it; `MapViewport.tsx:884` says the same thing independently. Ambiguous rather than wrong. |
| `classic-save.ts:107`, `art-commit.test.ts:23` | *"unused … but kept"* | **CORRECT AS-IS**, both verified at the call site (`_handle`; and `art-commit.ts:24` really does import all three names the mock carries). |

**Three fixed sites of one claim, one stale adjective, three left with reasons.** The
three "renders in full" survivors matter more than their count: O79 fixed this sentence
in three places on 2026-09-03 and a grep for the *phrase* would have found these — which
is the argument for the census running on phrases rather than on the files that were
touched.

---

## 4b. The gate's own environment-shaped arm (found in review, 2026-09-04)

A reviewer reported the gate dying in the main checkout with *"COULD NOT MEASURE — git
check-ignore failed"* and diagnosed it as `ignoredSet` reading exit 1 as a failure.

**The stated mechanism does not reproduce, and it was measured before anything was
changed** — a plausible fix to code that is not broken is this parcel's own defect
family:

* `e.status` **is** `1` on the "nothing ignored" exit, and the catch has read it since
  `26f738eb`. Probed with the identical `execFileSync` options on node v24.15.0:
  `none-ignored → THREW status=1` (caught, empty Set); `some-ignored → RESOLVED`.
* Every run in this worktree had already taken that arm for the file population — every
  summary line says *"0 git-ignored file(s) excluded"*, which is only reachable through it.
* `/home/volence/sonic_hacks/aurora/scripts/check-cited-paths.mjs` **does not exist**, and
  that checkout's `package.json` test chain still reads
  `check-peer-path-literals && check-object-stringify` with no cited-paths step. That tree
  is at base `eb426df3`, unmerged, so the quoted run did not come from this code there.

**The report was still right about the thing that matters.** That arm was never *proven*,
and it is worse than untested: **which arm a run takes depends on which tree it stands
in.** The population query takes exit 0 on the owner's machine (nine untracked probes
named individually in `.gitignore` sit at `scratchpad/` depth 1 there) and exit 1 in an
agent worktree carrying none of them. The **citation** query is worse — it only runs when
there is already a violation, and every red run during construction happened to include an
ignored path, so its exit-1 arm had **never once executed**.

`proveIgnoredSet()` now drives both arms deterministically before any real work, and the
summary line reports it, naming the `.gitignore` pattern used. Both probes are **derived**:
the ignorable one is built from the first literal, glob-free, un-negated pattern in
`.gitignore` (`node_modules/` today) rather than typed, so it cannot go on "proving" a rule
that has been deleted. The positive query asks about both probes at once, which also proves
the output is parsed onto the right member and that a not-ignored path is not swept in.

**Red-first, and the discriminator is the point.** P4 = comment out the `e.status === 1`
branch, i.e. exactly the defect described:

| tree | gate | result |
|---|---|---|
| one git-ignored source file present (the owner's shape) | **OLD** (self-check removed) + P4 | **exit 0, GREEN** — the bug is live and invisible |
| the same tree, the same bug | **NEW** (self-check on) | **exit 2, COULD NOT MEASURE**, naming exit 1 and saying it should have been handled |

OLD's green there was an artifact of the environment. **128 stays fatal** — the catch was
not widened; the loud refusal is the property worth keeping and it behaved correctly
throughout. One genuine adjacent hazard was found while probing and is now guarded: an
**embedded** empty line makes the query exit **128** (`fatal: empty string is not a valid
pathspec`) while a *lone* empty input is a plain exit 1 — so an empty token would make this
gate refuse loudly for a fault of its own. No call site can produce one; if one ever does,
it now says whose fault it is.

**All three original mutations re-run against the new baseline `283bb415`**, since the
plant path goes through this code: P1 **RED exit 1**, P2 **RED exit 1**, P3 (blinded
comment reader) **still exit 2 COULD NOT MEASURE** — not turned green by the fix.

---

## 4b-ii. Review round 3 — the real cause, and the reason two rounds were spent guessing

**`check-ignore` refuses any path that leaves the repository, and one such path poisons
the whole batch it travels in.** Measured, stderr captured:

| input | exit | git said |
|---|---|---|
| `../aeon/tools/effects_gen.py` | **128** | `fatal: … is outside repository` |
| `/abs/path.ts` | **128** | `fatal: Invalid path '/abs'` |
| `src/../../aeon/x.ts` | **128** | `fatal: … is outside repository` |
| `engine/effects/raster.emp` | 1 | *(a bare peer path is fine — just not ignored)* |
| one good path **+** one escaping | **128** | the good one went unjudged with it |

**The mechanism is the reviewer's; the spelling is not.** A bare `../aeon/src/foo.ts` in a
comment yields **no token at all** — `BEFORE`'s lookbehind blocks a path preceded by `/`,
measured over eight sample lines. What *is* reachable is a token that starts at one of this
repo's own roots and then climbs out, because `PATH_RE`'s body eats `../`:
`src/../../aeon/x.ts`, `scratchpad/../aeon/probe.mjs`. Recording the difference matters —
the wrong spelling would send the next reader hunting for a filter that was already there.

**Three fixes.**

1. **stderr is captured, never `'ignore'`, and git's line goes into the `die()`.** This is
   worth more than the fix it accompanies. The gate knew a query had failed and could not
   say *why*, and that is precisely what cost two review rounds. It now prints
   `git said: …` and points at `judgeable()`. Even the exit-1 case is now informative —
   it reports *"git said nothing on stderr"*, which distinguishes it from a 128 at a glance.
2. **A token that leaves the repo is unjudgeable** — header rule 1 already says peer paths
   are not judged — so it is dropped at extraction, counted on the summary line, and never
   sent to git. `ignoredSet` filters again as a belt. A path outside the repo can never be
   git-ignored, so this costs no coverage.
3. **A third arm in `proveIgnoredSet`**: two escaping probes travelling with two good paths
   must not take the batch down.

**Red-first discriminator, on one tree, with P5 = a real violation and a repo-escaping
citation in the same run:**

| gate | result |
|---|---|
| the `283bb415` shape (no filter, no third arm) | **exit 2, status 128**, `git said: fatal: src/../../aeon/x.ts … is outside repository` — the reviewer's failure, exactly |
| current | **exit 1** — the real violation reported, the escaping token counted and not sent |

⚠ **The token that killed it came from this gate's own header** — the docblock in which I
wrote down the hazard. At `283bb415` my documentation of the trap would itself have sprung
it on the next red run.

**This arm had never executed, like the exit-1 arm before it**: zero traversal citations
existed in the tree (measured), and the citation query only runs when there is already a
violation. So the proof is synthetic and permanent rather than a hostage to what happens to
be written in the tree this week. **That is now three consecutive defects in this gate of
one shape — a branch whose coverage depended on the tree it was standing in.**

**Also fixed, found while probing:** `...` (three ASCII dots) was in the placeholder rule's
first draft and lost on the way into the gate, so an elided path like `src/.../seam.ts`
would have been reported as a citation nobody wrote. `…` was covered; its plain spelling
was not.

### And the irreproducibility was itself an instance of tonight's theme

My round-2 report said the main checkout had no `check-cited-paths.mjs` and concluded the
quoted run could not have come from this code. **Both measurements were right and we were
looking at different trees an hour apart** — the reviewer ran against the merge; I read the
tree after it had been backed out. My reading was accurate, correctly sourced, and led to a
wrong conclusion about *someone else's* run, because a working tree is a mutable artifact
with no timestamp on it. The reviewer's `git reflog`-style evidence had a clock; my
`ls` did not. **A measurement of a mutable tree is only a measurement of a moment**, and
saying "this tree does not contain X" without saying *when* is the same missing-date defect
this parcel's §3 flagged in `effects-aeon.ts`.

---

## 4b-iii. Review round 4 — the general fix: ask git, stop losing to the tree

A third distinct 128, and the stderr capture named it in one run instead of two rounds:
`fatal: pathspec 'scratchpad/fixtures/aeon-build-pin/aeon-current/' is beyond a symbolic
link`. That is four defects of one shape, so this round replaces the mechanism rather than
patching a fourth cause. **All four were the same thing: the gate's input set was a
property of the machine it stood on rather than of the repository.**

### The population now comes from git

    git ls-files --cached --others --exclude-standard -z -- src test scripts scratchpad

Ignored files are absent by construction — `--exclude-standard` *is* the rule the gate was
calling `check-ignore` to apply — so that query leaves the population path entirely, taking
all of its fatal modes and its exit-1 arm with it. `node_modules/` and `dist/` need no
special-casing. `--others` keeps untracked-but-not-ignored files, which is the point: a
brand-new comment is untracked at the moment its author runs the suite.

### The 1256/1257 reconciliation — and it is not two methods disagreeing

| measurement | count |
|---|---|
| the walk, in this worktree | **1257** |
| `git ls-files …`, in this worktree | **1257** |
| files in one and not the other | **0, both directions** |
| `git ls-tree eb426df3` under the same roots | **1256** |
| present now, absent at base | `scripts/check-cited-paths.mjs` |

**The one file is the gate counting itself.** The reviewer measured the backed-out tree;
I measured the branch. Same lesson as §4b-ii, one layer down: a working tree is a moment,
not a fact.

### ⚠ And a cause I asserted instead of measuring, in this very file

The first version of the new header said *"the walk DESCENDED THROUGH SYMLINKS"*. **It does
not.** `readdirSync(dir, {withFileTypes: true})` reports a symlink-to-directory as
`isDirectory() === false` — probed on a purpose-built tree, the walk collected only the
real file and never entered the link. I also mis-read my own discriminator mid-round: the
old gate's 1258 was 1257 **+ the untracked probe file I had just created**, not a file from
inside the symlink.

I wrote a plausible causal claim into a permanent header one round after saying that a
plausible fix to unbroken code is this parcel's own defect family. Corrected in place
(`8d48100c`) rather than quietly, because the wrong sentence would send the next reader
after the wrong mechanism. What is actually true, and both halves still justify their fix:

* **The 5,821-vs-1,257 gap is the hardlinked aeon copies** that `.gitignore` lists
  (`scratchpad/fixtures/aeon-*`, made with `cp -al`, so *real* directories). The walk
  enumerated them and then paid a `check-ignore` call to throw 79% of its own population
  away — and that call is the one with three fatal modes.
* **The 128 came from the citation query, not the population.** A comment naming a path
  beyond the symlink — `check-harness-guards.mjs:448` names
  `scratchpad/fixtures/aeon-build-pin/aeon-current` itself — makes git refuse and lose
  every other citation in the batch. That is fixed by the per-path fallback, not by the
  population change.

### The general rule for what remains: no single token may kill the query

The citation query must still ask git about individual cited paths (hole 8). Rather than
naming a fifth shape: recognised-unsendable paths are filtered up front, and **any other
refusal falls back to asking one path at a time**, which cannot lose more than the single
path git objected to. Those land in `UNQUERYABLE`, are counted on the summary line **with
git's own reason**, and are treated as *not* ignored — so a citation the gate could not
classify stays a violation rather than passing quietly. A query that fails for *every*
path is still fatal: that is a broken git, not a bad path. A **fourth proven arm** asserts
that a refusal is *visible* to the fallback rather than reading as an empty answer —
without it, every unanswerable citation would be silently classified and the count would
read zero forever.

### Red-first, with the reviewer's shape planted: a symlink to a foreign checkout, and a violating citation beyond it

| gate | result |
|---|---|
| pre-`74ba870f` | **exit 2, COULD NOT MEASURE** — `git said: fatal: pathspec '…/aeon-current/absent-probe.ts' is beyond a symbolic link` |
| current | **exit 1** — the real violation reported, and the unanswerable path counted with git's reason |

### The exposure beyond this gate

`grep` for hand-rolled walks that skip `node_modules`/`dist` **by name** — the signature of
a filesystem walk standing in for a repository query — finds **four more gates in the
`npm test` chain**: `check-object-stringify.mjs`, `check-peer-path-literals.mjs`,
`check-pseudo-skip.mjs`, `check-test-collection.mjs`. On the owner's machine each of them
is enumerating the hardlinked aeon copies and paying to discard them, and any of them that
hands a walked path to git carries the same refusal modes. **Reported, not fixed** — one
line here, not a parcel, as asked.

---

## 4c. ⚠ The suite is RED, and the red is the census's own subject arriving live

`test/formats/aeon-ramp-sign-drift.test.ts` fails on the finished tree. **It is not mine**,
and it is the most interesting thing this parcel produced.

Section 3 above called `RAMP_SIGN_FIELDS_AWAITING_AEON` **exemplary** — dated, pinned to
aeon `origin/master ddaab282`, with a named retirement detector. **Within the same session
that detector fired.** aeon's `origin/master` moved `ddaab282 → 065dc790` at
**2026-09-03 20:41:52 -0400** (`git reflog show origin/master` in aeon); my second full run
was green just before that push and the third, minutes later, red. `ddaab282` is precisely
the revision the constant pins.

**Confirmed by reading the blob, not the announcement** — aeon `065dc790`,
`engine/effects/raster.emp`:

```
comptime var start_img = start
if start_img < 0 { start_img = start_img + $100000000 }   // 2^32 — two's complement
comptime var step_img  = step
if step_img  < 0 { step_img  = step_img  + $100000000 }
...
    rrp_start:      start_img,
    rrp_step:       step_img,
```

and the constructor's `ensure`s at `:802`/`:804` now bound `start`/`step` to
`fp16(-512,255)..fp16(511,255)` — **negatives are intended to be authorable**. So the
premise has cleared: **the ramp card's disclosure and the caveat inside the rate refusal
are now a FALSE WARNING** — an artifact that looks like care and is wrong, which is this
parcel's entire subject, arriving three hours after the census praised the hold.

**NOT RETIRED HERE, deliberately.** The fix is one constant
(`src/core/formats/effects/ramp-sign-lag.ts`, which retires both surfaces by construction),
but it changes author-facing warnings across 5 files and deserves its own branch, its own
red-first proof that the disclosure disappears, and its own row. The confirmation the
detector asks for is done and recorded above, so whoever takes it can move immediately.

**Attribution, measured not asserted:** my branch touches none of the five ramp-sign files
(`git diff --name-only eb426df3..HEAD`), and between the green second run and the red third
the only repo change was `scripts/check-cited-paths.mjs`.

---

## 5. Deliberately not done

* **No markdown gate.** Exclusion 3 above, with the 387-path measurement behind it.
  Making the ROADMAP's dated rows pass would mean either exempting them wholesale (a
  gate that is green over its largest population) or rewriting history.
* **`docs/` citations are unjudged**, exclusion 2. Distinguishing aurora's `docs/` from
  aeon's needs a marker convention nobody has agreed to; a heuristic here is exactly the
  "covers 70%, trusted for 100%" shape.
* **No emulator, no peer-tree write, no ROM run** — which is why the vertical scroll
  word in `bganim-preview-aeon.ts` is reported and not resolved.

## 6. Suite

⚠ **`npm test` is exit 1 on the finished tree — 489 files / 486 passed / 1 failed /
2 skipped, 6,871 tests / 6,862 passed / 1 failed / 8 skipped.** The single failure is
`aeon-ramp-sign-drift.test.ts` and is **external to this parcel** — see §4c for the
timing, the blob and the attribution. Two earlier full runs on this same branch were
**exit 0 at 6,863 passed / 0 failed**; aeon pushed the encode between them. All eight gates green:
`check-test-collection` 489/489 collected, `check-pseudo-skip` 6,232 bodies,
`check-peer-path-literals` 5 rules / 1,257 files, **`check-cited-paths` 1,877
citations**, `check-object-stringify`, `check-ledger-timestamps`,
`check-python-resolver` 7 rows, `check-harness-guards` 200 clean / 0 failures /
0 unmeasurable.

⚠ **This is a linked worktree, where `npm test` reads ONE FEWER PASS AND ONE MORE SKIP
than the main checkout** — `test/support/sibling-root.test.ts`'s step-3 row cannot
measure the main-checkout configuration from here and says so. Master `eb426df3` reads
**6864 / 7**; the totals are identical at **6871**. This is the sixth time an agent has
had cause to write this sentence; it is not a discrepancy.
