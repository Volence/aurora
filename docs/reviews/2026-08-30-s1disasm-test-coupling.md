# The suite is wired to one home directory, and to a tree we do not own

2026-08-30 · branch `fix/s1disasm-test-coupling` · Aurora
Peer read-only throughout: `/home/volence/sonic_hacks/s1disasm` was never
written, committed, checked out or cleaned. Its state at start and at finish:
`f6ece657c1cf253404312137dfcb8ec15fa42318` (2026-08-01), 2 modified files and 2
untracked entries — unchanged by this parcel.

---

## 0. The measurement first, because the queue row was stale

The row said *"37 tests read the s1disasm folder live, and it is edited right
now."* Both halves were wrong by the time it was acted on, and so were parts of
the dispatch that replaced it. What is actually true:

| Claim | Measured |
|---|---|
| "37 tests" | **306 rows** in **36 files** change behaviour when the tree is absent |
| "edited right now" | last commit **2026-08-01**; 4 uncommitted entries, none touched since |
| dispatch: 78 files / 206 lines under `src/`+`test/` | **confirmed exactly** |
| dispatch: 32 hardcoded `/home/volence/sonic_hacks/s1disasm` | **36 lines**, of which **34 executable** and 2 comment records |
| dispatch scope `src/` + `test/` | **missed `scripts/`** — 5 files, 17 lines, **3 more executable** hardcoded paths |
| — | and `test/` held **2 more** executable hardcoded paths for a DIFFERENT peer (`s4_engine`) that an `s1disasm`-only grep cannot see |

So the executable machine-locked total across `src/`+`test/`+`scripts/` was
**39**, not 32: 34 (s1disasm, tests) + 3 (s1disasm, scripts) + 2 (s4_engine,
tests).

**The 306 is the number that matters and it is not a count of literals.** A file
can hold one literal and gate 51 rows behind it; another holds one and gates one.
Counting `const S1DIR = …` lines answers "how much editing", never "how much
coverage".

---

## 1. The categories

Four, and they are not a severity ranking.

| | Name | What it looks like | Urgency |
|---|---|---|---|
| **(a)** | **Machine-locked** | The path names one machine's home. Elsewhere the row skips, or worse passes, having measured nothing. | **IMPORTANT and PERMANENT.** Nothing hurts, so nothing ever prompts the fix. A green row in a suite is trusted immediately and by construction — there is no grace period before the cost starts. |
| **(b)** | **Coupled to a tree we do not own** | The answer is decided by a peer's live working directory. | Depends entirely on what the row asks. See §4 — this is the category that must NOT be swept. |
| **(c)** | **Baked-and-loud-elsewhere** | The input is missing; the row goes red naming a parser, a symbol, a store — never the input. | **URGENT and SELF-LIMITING.** It hurts, so it gets fixed. It costs reverts while it lives and stops costing the moment it is repaired. |
| **(—)** | **Neither** | A comment citing provenance; a fictitious path passed to a pure function; a vendored fixture. | None. Several of these must be left exactly as they are. |

(a) and (c) are different *urgencies*, not different *seriousnesses*. Order the
work (c) first because it is bleeding; never let that ordering imply (a) can be
dropped once (c) is clear. (a) is never dropped, only scheduled.

---

## 2. The classification table

### 2.1 The 36 files whose rows depend on the tree — (a) + (b), all of them

Row counts are **measured**, not counted by eye: per-test status differential
between a run with the tree and a run with it denied (§3). "Rows" = rows that
changed status *or* stopped being registered at all.

| Rows | File | (a) before | (b) — what the row asks | Disposition |
|---:|---|---|---|---|
| 109 | `test/sprite/s1-anim-sweep.test.ts` | derived (already) | *does our parser handle every real script* — **legitimately wants the real tree**; expectation derived from each file's own `dc.w` table | unchanged |
| 51 | `test/sprite/s1-nonlevel-families.test.ts` | hardcoded | mixed: real-render rows are derived; `family-specific pins (hand-transcribed…)` pin peer data | `referencePath`; pins left, see §5 |
| 22 | `src/core/level-classic/__tests__/s1-io.test.ts` | hardcoded | round-trip over real acts — derived | `referencePath` + `requireSingle` (§3.3) |
| 15 | `src/core/anim/__tests__/sonic-animate.test.ts` | hardcoded | formulas vs the real `_anim/Sonic.asm` — derived | `referencePath` |
| 11 | `src/core/level-classic/__tests__/model.test.ts` | hardcoded | real bg layouts fit the limit — derived | `referencePath` |
| 7 | `src/core/import/__tests__/sonic-anim-import.test.ts` | hardcoded | sonani round-trip — derived | `referencePath` |
| 7 | `src/core/level-classic/__tests__/object-sprite.test.ts` | hardcoded | golden renders — **pinned to peer data** | `referencePath`; pin kept, §5 |
| 7 | `test/sprite/s1-sonic-dplc.test.ts` | hardcoded | 88 DPLC entries, hand-derived | `referencePath`; pin kept, §5 |
| 6 | `src/core/level-classic/__tests__/priority-mask.test.ts` | hardcoded | hand-derived SBZ block words | `referencePath`; pin kept, §5 |
| 6 | `src/core/level-classic/__tests__/s1-object-anim.test.ts` | hardcoded | derived | `referencePath` |
| 5 | `src/core/formats/classic/__tests__/s1-binary.test.ts` | hardcoded | decode/re-encode identity — derived | `referencePath` |
| 5 | `src/core/formats/games/__tests__/s1-art-write-delta.test.ts` | hardcoded | derived | `referencePath` |
| 5 | `test/sprite/s1-derived-frames.test.ts` | hardcoded | hand-transcribed piece geometry — **pinned** | `referencePath`; pin kept, §5 |
| 4 | `src/core/level-classic/__tests__/s1-anim-art.test.ts` | hardcoded | derived | `referencePath` |
| 4 | `src/renderer/…/edit-art-handoff.test.ts` | hardcoded ×2 | derived | `referencePath` |
| 4 | `src/renderer/…/s1-open-refusal.test.ts` | hardcoded | derived | `referencePath` |
| 4 | `src/renderer/…/s1-raw-grid-open.test.ts` | hardcoded | derived | `referencePath` |
| 3 | `src/core/formats/classic/__tests__/s1-compression-goldens.test.ts` | hardcoded | derived | `referencePath` |
| 3 | `src/core/project/__tests__/reserved-tiles-real-act.test.ts` | hardcoded | derived | `referencePath` |
| 3 | `src/core/project/profiles/__tests__/s1-object-art.test.ts` | hardcoded | link table vs disk — derived | `referencePath` |
| 3 | `src/core/project/profiles/__tests__/s1-sync-anims.test.ts` | (via helper) | derived | unchanged |
| 3 | `src/renderer/…/s1-saveback-roundtrip.test.ts` | hardcoded | derived | `referencePath` + hook fix (§3.4) |
| 2 | `src/core/formats/classic/__tests__/enigma.test.ts` | hardcoded | derived | `referencePath` |
| 2 | `src/core/formats/games/__tests__/s1-art-write.test.ts` | hardcoded | derived | `referencePath` |
| 2 | `src/core/project/__tests__/s1-adapter.test.ts` | hardcoded | derived | `referencePath` |
| 2 | `src/core/project/profiles/__tests__/object-subtype-rules.test.ts` | hardcoded | derived | `referencePath` |
| 2 | `test/main/classic-save-integration.test.ts` | hardcoded | derived | `referencePath` + `requireSingle` |
| 1 | `src/core/aether/__tests__/s1-object-offsets.test.ts` | **walk-up, not redirectable** | derived from the same file | `referencePath` (§3.2) |
| 1 | `src/core/level-classic/__tests__/object-sprite-pri.test.ts` | hardcoded | pinned | `referencePath` |
| 1 | `src/core/level-classic/__tests__/occlusion.test.ts` | hardcoded | derived | `referencePath` |
| 1 | `src/core/level-classic/__tests__/render.test.ts` | hardcoded | derived | `referencePath` |
| 1 | `src/core/project/__tests__/editable-tiles.test.ts` | hardcoded | derived | `referencePath` |
| 1 | `src/renderer/…/canvas-commit-model.test.ts` | hardcoded | derived | `referencePath` |
| 1 | `src/renderer/state/__tests__/classicProjectStore.test.ts` | hardcoded | derived | `referencePath` |
| 1 | `test/live/s1-warp-live.test.ts` | **walk-up, not redirectable** | live, opt-in | `referencePath` (§3.2) |
| 1 | `test/sprite/s1-multi-source-pool.test.ts` | hardcoded | derived | `referencePath` |

**306 rows, 36 files.**

### 2.2 Everything else that matches `s1disasm` — category (—), left alone

| Count | What | Why it is not a defect |
|---:|---|---|
| **37 lines / 22 files** in `src/` non-test code | prose citations: *"transcribed from s1disasm's SonLVL object definitions"*, `sonic.asm:3136`, `_inc/HUD Update.asm:` | Provenance. No filesystem access; nothing to derive. Rewriting them destroys the citation. |
| **17 test files** naming it without touching it | comments; `'/home/x/s1disasm'` passed to `joinPath`; `'/p/s1disasm'` in a recent-projects table | Test DATA. A blanket `/home/` rule would have flagged these, which is why the gate's rule is the derived sibling root instead. |
| `test/sprite/adapters/s1-adapter.test.ts`, `sprite-discovery.test.ts` | *"vs REAL s1disasm mapping data"* — reading **vendored** `test/fixtures/mappings/*.bin` | This is the model answer to (b): the property is about Aurora's round trip, so a pinned blob is the right instrument. Nothing to do. |
| 3 comment lines still quoting the absolute path | a historical ENOENT (×2) and the sentence describing this conversion | Records. A comment opens no file. |

### 2.3 Category (a) knowingly left in place — `scripts/`

| File | Line | Why left |
|---|---|---|
| `scripts/probe-sonic-dplc-sharing.mjs` | 26 | Hand-run instruments in **no runner**. They cannot report a false green, because nothing reports them at all. Converting them needs a **second** copy of the sibling-root derivation in JS — and one derivation is the entire point of `referencePath`; a second is a hole in whatever the first promises. |
| `scripts/verify-s1-roundtrip.mjs` | 29 | " |
| `scripts/render-classic-act.mjs` | 32 | " |

The gate says this out loud on every run rather than leaving its coverage to be
inferred: `(canary OK; scripts/ deliberately NOT scanned)`.

---

## 3. What changed

### 3.1 `referencePath()` — 36 executable literals

`test/support/fixture-tree.ts` already had `referenceFile(name, …rel): string |
null`, deriving the sibling root from this repo's own git common dir and honouring
`AURORA_PEER_ROOT` / `AURORA_<NAME>_REPO`. It was not used by the 34 sites for a
concrete reason: they use the value as a plain `string`, and `string | null`
turns one mechanical substitution into 34 hand-edited null cases, each an
opportunity to write a different guard.

`referencePath()` returns a `string`, mapping the unresolvable case to a path
under `/nonexistent/aurora-unresolved-peer-root` so every downstream `existsSync`
still decides exactly as before. On this machine it resolves to the very
directory the literals named, so **no guard, no skip reason and no total changed
here.**

### 3.2 The two rows the environment variable could not reach

Neither was hardcoded, and neither was wrong on this machine, so nothing looked
amiss. `s1-object-offsets.test.ts` walked up twelve directories for a sibling
`s1disasm/`; `s1-warp-live.test.ts` did the same via `findSibling`. Both resolve
correctly from a plain clone and from an agent worktree.

They were caught by asking a different question: **with the override pointed
somewhere absent, does anything still open the real tree?** An fs-level trace
(§4.2) answered with exactly two paths:

```
/home/volence/sonic_hacks/s1disasm/_Constants.asm
/home/volence/sonic_hacks/s1disasm/s1built.bin
```

Both now go through `referencePath`. Re-run: the log file is never created.

### 3.3 `referenceCheckout()` — the directory was never the question

27 files guarded on `existsSync(S1DIR)`. An empty directory satisfies all 27.
`referenceCheckout(name)` requires marker entries (`sonic.asm`, `_maps`,
`levels`); `referenceCheckoutReason(name)` distinguishes *absent* from *present
but not a checkout*, because those send a reader to two different places and the
second was being reported in the words of the first.

Two rows' worth of `resolveSingle(t)!` (in `s1-io` and
`classic-save-integration`) now throw naming the file: the `!` asserted a fact
the guard does not establish, and `path.join(root, undefined)` is where 23 of the
misdirected failures came from.

### 3.4 A test that littered the repo root when its fixture was incomplete

`s1-saveback-roundtrip.test.ts` mkdtemps into `process.cwd()` — the repo root —
and its `afterEach` called `restoreApi()` *before* the `rmSync`. On an incomplete
checkout the copy throws before `restoreApi` is assigned, the hook dies on
`restoreApi is not a function`, and the directory survives. One partial-tree run
left **nine** `.tmp-s1-saveback-*` directories in the repo root, untracked and
**not gitignored** — one `git add -A` from committing a copy of somebody else's
disassembly into this repo. The removal is now in `finally`; the same scenario
re-run leaves zero.

### 3.5 A gate, because the sweep is one-time and the defect is invisible here

`scripts/check-peer-path-literals.mjs`, wired into `npm test` **before** vitest,
with `test/config/peer-path-literal-wiring.test.ts` guarding the one line that
invokes it (a static pass is not run by vitest, so dropping it changes no test's
output). It forbids executable lines containing this repo's own **derived**
sibling root — not `/home/` in general, because three files legitimately pass
fictitious `/home/u/proj` strings to pure functions. Comments are exempt on
purpose.

---

## 4. The absent-input audit

### 4.1 Three numbers, as asked

The audit cannot be done by running the suite: a green run is exactly what the
defect produces. It is done by making the input absent and reading **where the
red lands**, not merely whether one lands.

**Scenario A — the tree is gone** (fs-level denial of the real path; the
environment variable, post-fix, produces an outcome-identical run):

| | Count |
|---|---:|
| Rows whose behaviour depends on `s1disasm` | **306** (36 files) |
| Rows that failed **naming** the absent input | **0** |
| Rows that failed **without** naming it — category (c) | **0** |
| Rows that noticed and said so (reasoned skip, or an announced non-enumeration) | **306** |
| Rows that did not notice | **0** |

**The (c) bucket is empty here, and it was looked for.** Method: both runs were
captured with `--reporter=json`, indexed per test by `file::fullName`, and every
row with `status: "failed"` in the absent run was enumerated with its first
failure message. The enumeration returned an empty list — from a differential
that simultaneously reported 239 status changes and 67 unregistered rows, so it
was demonstrably reading the data. Credit where due: this is the 2026-08-29
lane's work holding (`docs/reviews/2026-08-29-fixture-absent-honesty.md`).

**Scenario B — the tree is present but EMPTY.** This is where (c) lived, and it
is the scenario the previous lane booked and deferred:

| | Before | After |
|---|---:|---:|
| Failed, **naming** the absent input | 92 | **0** |
| Failed, **not** naming it — **category (c)** | **43** | **0** |
| Reasoned skips | 102 | **250** |
| Exit | 1 | **0** |

The 43, quoted because the message is the damage:

| Rows | File | Message a reader actually got |
|---:|---|---|
| 21 | `s1-io.test.ts` | `TypeError: The "path" argument must be of type string. Received undefined` |
| 3 | `s1-compression-goldens.test.ts` | `AssertionError: expected 0 to be greater than 0` |
| 3 | `s1-binary.test.ts` | `AssertionError: expected 0 to be greater than 0` |
| 3 | `s1-open-refusal.test.ts` | `AssertionError: expected false to be true` / `expected null not to be null` |
| 3 | `reserved-tiles-real-act.test.ts` | `Error: act ghz/1 unavailable: missing 11 required file(s): ghz.act1.tiles.0, …` |
| 2 | `classic-save-integration.test.ts` | `TypeError: The "path" argument must be of type string. Received undefined` |
| 2 | `s1-adapter.test.ts` | `AssertionError: expected null to deeply equal { type: 's1', …(1) }` |
| 1 | `classicProjectStore.test.ts` | `AssertionError: expected 'error' to be 'opened'` |
| 1 | `enigma.test.ts` | `AssertionError: expected 0 to be greater than 0` |
| 1 | `s1-raw-grid-open.test.ts` | `TypeError: .toMatch() expects to receive a string, but got object` |
| 1 | `editable-tiles.test.ts` | `Error: act ghz/1 unavailable: missing 11 required file(s): …` |
| 1 | `occlusion.test.ts` | `Error: act ghz/1 unavailable: missing 11 required file(s): …` |
| 1 | `s1-object-art.test.ts` | `AssertionError: missing files:` |

Not one names s1disasm, the override, or a directory. A reader of the first goes
hunting a path bug in Aurora; of the third, a codec regression; of the eighth, a
store bug. All three hunts are for something that does not exist.

**Scenario C — a REAL but INCOMPLETE checkout** (markers present, content
missing). Measured because the §3.3 fix must not be claimed to cover it:

| | Before this parcel | After |
|---|---:|---:|
| Failed, naming the absent input | 79 | **100** |
| Failed, **not** naming it — **category (c)** | **43** | **20** |
| Total failures | 122 | 122 |

The 20 that remain, each needing that row's own answer to *"which file is
representative here"* — 20 decisions, not one sweep:

`reserved-tiles-real-act` (3) · `s1-compression-goldens` (3) ·
`s1-open-refusal` (3) · `s1-adapter` (2) · `s1-binary` (2) ·
`editable-tiles` (1) · `occlusion` (1) · `render` (1) · `enigma` (1) ·
`s1-object-art` (1) · `s1-raw-grid-open` (1) · `classicProjectStore` (1)

### 4.2 The instrument, and its control

Absence was produced two ways, and they had to agree:

1. **`AURORA_S1DISASM_REPO` pointed at a non-existent directory.** Only meaningful
   after the conversion; before it, it reached **110 rows out of 306** (63 that
   began skipping, 47 that stopped being registered).
2. **An fs-level deny shim** preloaded with `NODE_OPTIONS=--require` (a vitest
   `setupFile` cannot do this: vite's SSR interop snapshots a module's named
   exports on first import). Every read under the real path returns ENOENT /
   `false` and is logged. **Nothing was written to the peer tree; the shim only
   intercepts.**

Post-fix, the two produce **identical** per-row outcomes: 0 changed, 0 vanished,
0 appeared across all 5,819 rows. That equality is the property — the environment
variable now reproduces true absence rather than approximating it.

**The leak log's zero is a real zero.** Control, run at the finished revision:
the same shim with **no** override logs an access to the real tree
(`/home/volence/sonic_hacks/s1disasm`, from `s1-io.test.ts`), so an empty log
means nothing read it, not that the logger is dead.

**One error worth recording.** The shim's first version replaced `fs`'s functions
without carrying their own properties, dropping `realpathSync.native`. Vite's
config loader died with `safeRealpathSync is not a function` **before the suite
collected**, i.e. the instrument's first "result" was not a measurement at all.

---

## 5. What was deliberately left alone

1. **The three `scripts/*.mjs` hardcoded paths** — §2.3. Named in the gate's own
   output so its coverage is never inferred.
2. **The pinned goldens against peer data** — `s1-derived-frames`,
   `s1-sonic-dplc`, `priority-mask`, `object-sprite`, and the
   `family-specific pins` block of `s1-nonlevel-families`. These are category (b)
   in its real form: they hand-transcribe values out of a tree we do not own, so
   they will rot when it moves. Every one of them, though, states its derivation
   in the source and asserts a property of *Aurora's* reader against it, and the
   honest fixes — vendor the excerpt, or derive the expectation — are per-row
   judgements about what each is for. **Not swept.** The repo already has the
   pattern for doing it properly
   (`test/fixtures/effects/*.provenance.json`, `test/support/peer-repo.ts`), and
   `docs/reviews/2026-08-28-golden-live-tree.md` books the question.
3. **The 20 remaining misdirected failures under an incomplete checkout** — §4.1
   Scenario C. Cut from 43 by fixing the two that were the *test's* own fault; the
   rest need per-row fixture knowledge.
4. **`src/core/model/__tests__/screen.test.ts`'s walk-up for `aeon`.** Same shape
   as the two fixed here, different peer, outside this parcel's subject. It is
   honest under absence; it is not redirectable.
5. **The `[name]`-channel skip reasons** in `s1-warp-live` and
   `s1-object-offsets`. The skip reporter accepts them and documents them as
   legacy; converting them is churn with no property behind it.
6. **The 37 provenance citations in `src/`** — §2.2. Records, not defects.
7. **Nothing was confirmed at runtime in the app or an emulator**; no emulator
   tool was called. The diff is tests, one test-support module, one gate, one
   wiring test, and `package.json`. No shipped code is touched.

---

## 6. Verification

Every gate added here was proved red-first against the **real** defect, never a
plant, and both of its could-not-measure guards were proved by breaking them.

| Check | Proof |
|---|---|
| the gate fires | `git checkout HEAD~1 -- src test` → `FAIL — 36 executable line(s) hardcode /home/volence/sonic_hacks`, exit 1 |
| the gate cannot pass vacuously (matcher) | comment stripper made to eat string literals → `COULD NOT MEASURE — the canary did not behave: expected exactly 1 violation on line 3, got 0 (none)`, exit 2, **no clean line printed first** |
| the gate cannot pass vacuously (root) | run where no sibling root derives → `COULD NOT MEASURE — the sibling root could not be derived`, exit 2 |
| the wiring test fires | gate removed from the `test` script → 2 of its 4 rows fail, its 2 anti-vacuous rows stay green — the correct signature |
| `referenceCheckout` is load-bearing | empty-directory run: 135 failures → 0, 96 skips → 250 |
| the temp-dir fix is load-bearing | same partial-tree run: 9 `.tmp-s1-saveback-*` in the repo root → 0 |

Aggregate totals, never a tail excerpt:

| Run | Test files | Tests | Exit |
|---|---|---|---|
| `npm test`, before this parcel | 429 passed, 2 skipped (431) | 5870 passed, 7 skipped (5877) | 0 |
| **`npm test`, after** | **430 passed, 2 skipped (432)** | **5874 passed, 7 skipped (5881)** | **0** |
| absent via `AURORA_S1DISASM_REPO`, after | 419 passed, 12 skipped (431)¹ | 5565 passed, 250 skipped (5815)¹ | 0 |
| absent via fs denial, after | identical, row for row | identical | 0 |
| empty directory, after | — | 5569 passed, 250 skipped, **0 failed** | 0 |

¹ measured before the wiring test was added; the +1 file / +4 tests is that test.

The only difference between the before and after present-runs is the new wiring
test. **No coverage was traded for the green.** `skip-report: OK — every skip
named its reason` and `check-pseudo-skip: OK` on every run above.

Commits on `fix/s1disasm-test-coupling`:

```
cee4bde8 tests: a directory that exists but holds nothing defeated all 27 guards, and 43 rows then failed in the wrong vocabulary
dc935471 gate: nothing stopped the 36 home-directory literals coming back, and nothing would have noticed
a7a75339 tests: 36 rows could only ever run on one machine, and two more could not be redirected
```
