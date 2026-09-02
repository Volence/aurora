# A real checkout missing ONE file — what O39 left, measured file by file

2026-09-02 · branch `fix/o45-partial-checkout-file-guards` · Aurora · O45

O45's booking carried numbers from O25 — *"27 files / 135 tests"* — and said in
the same breath that they predate O39. They do. **This note is the re-measurement
first and the fix second**, and the re-measurement is the more useful half:
O39 substantially closed this, the residual was **9 rows in 7 files**, and all
nine came from **one mechanism nobody had named**.

**Peer read-only throughout.** `/home/volence/sonic_hacks/s1disasm` was never
written, committed, checked out or cleaned. Every scenario ran against a copy
built from a **committed revision** —
`git -C ../s1disasm archive f6ece657c1cf253404312137dfcb8ec15fa42318` — extracted
into a scratchpad and pointed at with `S1DISASM_DIR`. Peer state at start and at
finish:

```
f6ece657c1cf253404312137dfcb8ec15fa42318
 M "artnem/GHZ Bridge.nem"
 M artnem/Signpost.nem
?? .aurora/
?? Test.hsproject
```

— unchanged by this parcel. No emulator tool was called.

---

## 0. The two states, and which one O39 closed

| state | what it is | who covers it |
|---|---|---|
| **not a checkout at all** | absent, empty, wrong directory, a clone that died before content landed | `referenceCheckout()` — O39's marker test (`sonic.asm`, `_maps`, `levels`) |
| **a real checkout missing what a row reads** | a sparse checkout, a file gitignored on that machine, an artifact not yet built | **this row** |

O39 did more than its marker test: it also shipped `test/support/s1-checkout.ts`,
which is a **per-file** derivation (`whenS1Files`, `whenS1Act`, `whenS1Glob`),
and converted 22 rows onto it. So the booking's "explicitly NOT covered" was
already half wrong when it was written. What O39 could not see is that its
scenarios were **directory-shaped** — `no-artnem`, `no-map16`, `no-collide` — and
some defects are only visible one file at a time.

---

## 1. The measurement

**The frame.** Which peer files does the suite actually READ? Derived from
execution, not grep: a `setupFiles` shim wrapping `fs`/`fs.promises` logged every
read under the copy's root during one full run — **440 distinct files**. That
instrument is a **lower bound**, and this note says so rather than claiming a
census: `_anim/Sonic.asm` is read through a named `import { readFileSync } from
'fs'` and does **not** appear in the log, so the two grep-visible hand-named
paths (`_anim/Sonic.asm`, `_Constants.asm`) were added by hand. Population:
**178 distinct repo-relative paths** after collapsing the per-act enumeration.

**The scenarios.** A stratified sample of **46 files** — up to four per top-level
directory, across all eleven directories the suite reads — each removed from an
otherwise **complete** copy, one at a time, followed by a full `vitest run`. The
copy is its own control: with nothing removed it reproduces the real tree's run
**exactly** (2 failed / 6279 passed / 8 skipped, 6289 rows; the two failures are
pre-existing and read `../aeon`, not s1disasm).

**The result, over 243 new failing rows in 46 runs:**

| class | rows | share |
|---|---:|---:|
| **NAMED** — the message contains the missing file AND says the checkout is incomplete | 152 | 63 % |
| **ANCHOR** — one of O39's three deliberate keep-failing rows, naming the tree | 61 | 25 % |
| **MISDIRECT** — the message does not name the missing file at all | **28** | 11.5 % |
| **NAMES-FILE-ONLY** — names a path, but a temp copy's path, not the checkout | 2 | 0.8 % |

Distinct misdirecting rows: **9 rows in 7 files**. Twelve of the 46 sampled files
(26 %) produce at least one. One run shrank the suite (`_anim/Sonic.asm`,
6289 → 6283), and that shrink is **announced** — `BLOCK NOT COLLECTED — its body
reads the fixture` — so it is working as designed.

So: **the honest answer to "did O39 cover this" is *mostly*.** 88 % of the
failure mass on a partial checkout is already either a named refusal or a
deliberate anchor. The residual is real, small, and — this is the part worth the
dispatch — **concentrated**.

### 1a. The nine rows, and the one mechanism behind eight of them

| rows | file | what it said |
|---:|---|---|
| 7 | `occlusion`, `render`, `editable-tiles`, `reserved-tiles-real-act` ×3, `s1-adapter` (`readPalettes`) | `Error: required collision table 'collision.angleMap' did not resolve` |
| 1 | `classic-save-integration` | the same, plus a sibling that ENOENTs on a **temp** path an `afterEach` has already deleted |
| 1 | `object-sprite` (B6 golden) | `Error: act ghz/1 unavailable: missing 1 required file(s): ghz.act1.tiles.0` |

**`gating` and "what `read()` needs" are two different propositions, and the gap
between them is invisible.** `ProfileEntry.gating` means *"a miss makes THE
OWNING ACT unavailable"*. The shared collision tables have no owning act, so they
are `gating: false` — correctly — and the availability report goes on saying all
eighteen acts are available. `read()` then throws for **all eighteen**.

Every guard O39 installed derives an act's inputs by filtering
`enumerateProfileEntries` on `zone`/`act`. A global entry matches no act. So a
checkout missing **one file out of 970** — `collide/Angle Map.bin` — failed
**33 rows**, and **eight of them failed straight through a `whenS1Act(...)` guard
that had just answered, truthfully, about the wrong list.**

That is the O45 finding in one sentence: *a guard can be correct, derived,
drift-proof, and still answer a question adjacent to the one that matters.*

### 1b. What the file-level probe found that the directory-level one could not

O39's §1d ruled `object-sprite` **left alone, on purpose**, on the grounds that
it "already fails with `ENOENT: … open '<absolute path>'`". Under `no-artnem`
that is true. Under a **single missing file** it is not: the act goes unavailable
first, so the row dies on a profile key instead, 100 lines earlier. Same row,
same tree, different granularity of absence, different failure. Neither audit was
wrong; the scenario was.

---

## 2. What changed

Four commits on `fix/o45-partial-checkout-file-guards`.

**`S1_GLOBAL_REQUIRED_KEYS`** (`src/core/project/s1/index.ts`) — the second
proposition, stated: what `read()` needs whatever the act is. Exported for the
same reason `S1_FINGERPRINT` is, so the guard asks rather than re-deriving a list
that would drift. **It is measured, not trusted** (§3).

**The adapter's three key-only refusals now name the file, the entry and the
tree.** `missingInputMessage(fa, what, missing)` puts the repo-relative path
beside the key and `fa.rootDir` beside both:

```
the shared collision table 'collision.angleMap', which EVERY act needs:
1 required file(s) not in this s1disasm checkout under <root>:
collide/Angle Map.bin (entry 'collision.angleMap'). This tree opened as an
s1disasm project and then did not hold this data, so it is an INCOMPLETE
checkout rather than a defect in what reads it.
```

⚠ **They deliberately do NOT name the environment variables.** This is shipped
core, reached from a folder the user picked in a dialog as often as from a test.
Naming `S1DISASM_DIR` is the harness's job, and `test/support/` now does it.

**The guard covers what `read()` needs** (`test/support/s1-checkout.ts`) —
`s1ActRequiredFiles` / `missingS1ActFiles` merge the global required entries, so
`whenS1Act('ghz',1)` went from 11 files to 13. Its skip reason gained the
resolver's own step-source, so the line ends with *which variable put the run in
that tree*:

```
SKIPPED, NOT PASSED: cannot measure GHZ act 1 through the real adapter — the
s1disasm checkout at <root> is INCOMPLETE: 1 required file(s) absent:
<root>/artnem/8x8 - GHZ1.nem. … (step 1: S1DISASM_DIR=<root> — if that is the
wrong tree, that is the thing to change.)
```

That is the brief's bar met in one line: **which file, which checkout, which
variable.**

**`whenS1ActReservations`** — the ninth row's own case, and a genuinely different
one. `_maps/Collapsing Ledge.asm` is **not a profile entry at all**, and
`readMapText` treats an absent mappings file as *"this request does not apply"*
(deliberately permissive, matching `editableTileRange`'s null convention). So
removing it left the reservation set **smaller** rather than failing, and the row
that measures the set reported `expected 48 to be greater than or equal to 150`.
The new guard derives the mapping list from `levelArtReservationRequests` — the
function the adapter itself calls — and only the row whose SUBJECT is the
reservation set takes it.

**`unmeasurable()` stopped misattributing** (`test/support/fixture-tree.ts`). It
said `…/_anim/Sonic.asm is absent on this machine`, which reads as *there is no
disassembly here* and was measurably false — printed beside a checkout that was
right there. It now reports the **deepest surviving ancestor**, so a reader can
tell "clone the tree" from "complete the tree" from evidence rather than from a
caller's claim.

**`object-sprite`'s B6 golden** takes `whenS1Act('ghz', 1)` — the treatment its
three siblings already had.

---

## 3. How it is proved

### 3a. The guard module's first test

`test/support/s1-checkout.ts` decides what every act-level row in this repository
believes about its inputs and **had no test at all** — the same shape that let
`sibling-root`'s predecessor ship a silently disagreeing second copy for weeks.
`test/support/s1-checkout.test.ts`, 7 rows, **touches no peer checkout**: every
fake tree is built from `enumerateProfileEntries(s1Profile)`, so the rows measure
the real relationship between the guard and the adapter on a machine with no
disassembly, and none can pass by naming a string that happens to be right here.

The load-bearing row **drops each global entry in turn** and records which ones
make `read()` refuse *by name*; that measured set must equal
`S1_GLOBAL_REQUIRED_KEYS`. Adding a `global(...)` call without adding its key
reopens exactly this gap and goes red. It prints the artifact it judges:

```
[O45] global entry → read() refusal:
  collision.normal:  … collide/Collision Array (Normal).bin (entry 'collision.normal') …
  collision.rotated: Nemesis input too short for a header      ← measured NOT required
  collision.angleMap: … collide/Angle Map.bin (entry 'collision.angleMap') …
[O45] s1ActRequiredFiles('ghz',1) = 13 file(s): artnem/8x8 - GHZ1.nem, … ,
      collide/Collision Array (Normal).bin, collide/Angle Map.bin
```

⚠ **A trap this file fell into first, recorded because it is the general one.**
The first draft omitted entries by KEY. `artnem/8x8 - GHZ1.nem` is the path of
three acts' entries, so dropping one key left the file on the tree, the act
stayed available, and the refusal under test never fired — the row came back on
`Nemesis input too short for a header`, i.e. **green for a reason other than the
rule holding**. Omission is by PATH now, because a checkout is missing FILES.

### 3b. Red first, with the mutation quoted from disk

Four mutations, each applied, `git diff --stat`'d and grepped back out of the
file before its run, each restored from the **committed** HEAD (never
`git checkout --` on a dirty tree). Full transcript in the parcel's scratchpad;
the shape of each is in the table.

| # | mutation | result |
|---|---|---|
| baseline | none | **7 passed** |
| M1 | `global()`'s refusal reverted to `required collision table '${key}' did not resolve` | **3 failed / 4 passed** — and the row's own `console.log` printed the mutated text, which is proof the patched code ran rather than a cached copy |
| M2 | the global merge deleted from `s1ActRequiredEntries` | **1 failed / 6 passed** |
| M3 | `'collision.rotated'` added to `S1_GLOBAL_REQUIRED_KEYS` | **2 failed / 6 passed (8)** — the constant is measured, not asserted |
| M4 | the act reason reverted to profile keys only | **1 failed / 6 passed** |
| restored | — | **7 passed**, tree clean |

**Why the cache hazard does not apply here, stated rather than assumed.** Every
mutation changes the file's length as well as its mtime, and the measured row
*prints the live message*, so a red run showing the mutated wording is direct
evidence the mutated file executed.

### 3c. The whole-suite effect, before and after, on the same trees

Every one of the twelve files that produced a misdirecting row, re-run on the
branch:

| | before | after |
|---|---|---|
| MISDIRECT rows | 28 | **0** |
| NAMES-FILE-ONLY rows | 2 | **0** |
| NAMED rows | 96 | 96 |
| ANCHOR rows | 23 | 23 |
| rows that never registered | 0 | 0 |

The decisive scenario, `collide/Angle Map.bin`: **35 failed / 12 skipped →
26 failed / 21 skipped**, nine conversions, every one a skip **naming the file,
the tree and the variable**.

**No loud-to-silent trade**, checked the way O39 checked it: across all twelve
scenarios, **0 rows went failed → passed**, **0 went failed → gone**, and
**0 new failures were introduced**. Every row that stopped failing is in the skip
report with a reason. (The check itself needed a correction: a `beforeAll` throw
is reported at the DESCRIBE level while its skips are per-`it`, so a name-equality
comparison read eleven correct conversions as rows that had gone quiet. Matching
by prefix — and reading the four B6 skip lines by hand — resolves it to zero.)

### 3d. With the peer unreachable entirely

```
EMPYREAN_SUITE_ROOT=$(mktemp -d) npx vitest run
  Test Files  444 passed | 13 skipped (457)
       Tests  5950 passed | 278 skipped (6228)     0 failed
```

### 3e. Full `npm test` on the complete real tree

```
  Test Files  1 failed | 454 passed | 2 skipped (457)
       Tests  2 failed | 6286 passed | 8 skipped (6296)
```

The two failures are **pre-existing and unrelated**: both are
`test/formats/effects-preset-schema-drift.test.ts`, which reads `../aeon`. They
fail identically on the branch point (2 failed / 6279 passed / 8 skipped, 6289).
Row count 6289 → 6296 is this parcel's seven new rows.

---

## 4. Two findings outside the brief

**(a) A test row whose NAME contains a peer's moving revision is not a stable
identifier.** `effects-preset-schema-drift`'s row is titled *"the
contract-leads-consumer lag at aeon `<sha>` …"*, and that sha changed **three
times** during this parcel's ninety minutes of sweeping — `73b07a4f` →
`56a9ca83` → `a5e2b618`. A before/after comparison keyed on test names therefore
silently stops matching that row, and it leaked into this note's first
MISDIRECT tally as 30 phantom instances. Excluding by FILE fixes the analysis; the
row itself is a live instance of the peer-working-tree coupling already booked
under `docs/reviews/2026-08-28-golden-live-tree.md`, now with the added observation
that it makes the row **unstably named**, not merely unstably valued. Not fixed
here.

**(b) This parcel contaminated its own measurement, caught it, and re-measured.**
Cases 30–46 of the 46-file sweep ran while the fix was being typed into the same
worktree, and one of them reported a **71-row silent shrink** that does not exist.
All seventeen were re-run from a detached HEAD at the branch point, and every
number in §1 comes from that clean set. The general lesson is small and sharp: a
long background measurement and an edit in the same tree are the same experiment.

---

## 5. What is left open

1. **The residual is not zero, it is unsampled.** 46 of 178 read paths were
   probed. The nine rows found all trace to two mechanisms, both now closed at
   their source (the global-entry gap in the derivation, and one non-enumerated
   mappings file), so a wider sweep is expected to find few new *classes* — but
   "expected" is not "measured", and the honest statement is that 132 paths were
   not individually removed.
2. **`gating: false` on a file that gates every act** is left as-is, deliberately.
   Flipping the flag would be inert (the availability bucket already requires
   `zone !== undefined`) while changing what `gating` means for every other
   reader. The two propositions are now two names instead of one flag.
3. **The pinned goldens against peer data** — unchanged from O39's list, still
   `docs/reviews/2026-08-28-golden-live-tree.md`.
4. **Nothing was confirmed at runtime in the app or an emulator.** The shipped
   change is three error strings in `src/core/project/s1/index.ts` — better text
   for the editor's own "this folder is missing files" path, which no test in this
   repo drives through the UI. **Tagged for the overseer's foreground follow-up.**

Commits:

```
996b6be5 tests: a real checkout missing ONE file defeated eight of O39's act guards
cc7d4c6d tests: the guard module gets its first test, and it MEASURES the constant
5e0a7eb2 tests: a mappings file nothing enumerates turned a missing input into arithmetic
```
