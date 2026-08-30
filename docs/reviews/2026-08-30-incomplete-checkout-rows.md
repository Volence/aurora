# A real checkout missing one directory, and the 22 rows that blamed Aurora for it

2026-08-30 · branch `fix/incomplete-checkout-rows` · Aurora

This closes Scenario C of `docs/reviews/2026-08-30-s1disasm-test-coupling.md` §4.1
— the tail that parcel disclosed rather than let a green run stand for.

**Peer read-only throughout.** `/home/volence/sonic_hacks/s1disasm` was never
written, committed, checked out or cleaned. Every measurement below ran against
**copies** built with `rsync -a --exclude build_tools` into a scratchpad, pointed
at by `AURORA_S1DISASM_REPO`. Peer state at start and finish:

```
$ git -C ../s1disasm rev-parse HEAD && git -C ../s1disasm status --porcelain
f6ece657c1cf253404312137dfcb8ec15fa42318
 M "artnem/GHZ Bridge.nem"
 M artnem/Signpost.nem
?? .aurora/
?? Test.hsproject
```

— unchanged by this parcel.

---

## 0. The list was 20. It is 22, and the count is scenario-dependent

The predecessor note listed 20 rows in 12 files. **Re-derived here rather than
trusted**, over twelve incomplete-checkout scenarios instead of one: **22 rows in
13 files**. The two it could not have seen are in
`test/main/classic-save-integration.test.ts`, and they are invisible from a
markers-only tree — that scenario fails them earlier, in words that DO name a
path. They only misdirect when a *single* directory is missing (`map16/`,
`map256/`, `objpos/`), which is the realistic shape of an incomplete checkout and
not the shape the first audit used.

That is the general lesson and it is worth more than the two rows: **"which rows
misdirect" is a function of WHICH part is missing.** No single scenario finds
them all. `no-artnem` finds 14 of the 22; `no-artunc` finds 5; `no-maps-sub`
finds 3; the markers-only tree finds 20. Only the union finds 22.

Two more findings the note's framing did not contain, both below: a file that
**died at collection** and took four rows that read nothing with it, and a row
that **passed vacuously** on a checkout it could not read.

---

## 1. The per-row disposition table

Every one of the 22, plus the two adjacent findings. "Scenarios" names the
removals under which the row misdirected (§3 defines them).

### 1a. Rows that now SKIP, naming the file they read (19)

| Rows | File | What it reads | What it did on an incomplete tree | Disposition |
|---:|---|---|---|---|
| 3 | `src/core/project/__tests__/reserved-tiles-real-act.test.ts` | GHZ 1, LZ 1, SBZ 3 through the real adapter | `Error: act ghz/1 unavailable: missing 2 required file(s): ghz.act1.tiles.0, …` — profile KEYS, no path, no tree | `whenS1Act('ghz',1)` / `whenS1Acts(['lz',1],['sbz',3])`. Guard derives each act's gating files from `enumerateProfileEntries(s1Profile)` — the same list the adapter resolves — so it cannot drift from what actually gates. |
| 1 | `src/core/level-classic/__tests__/occlusion.test.ts` | GHZ 1 | same `act ghz/1 unavailable` | `whenS1Act('ghz',1)` |
| 1 | `src/core/project/__tests__/editable-tiles.test.ts` | GHZ 1 | same | `whenS1Act('ghz',1)` |
| 1 | `src/core/level-classic/__tests__/render.test.ts` | GHZ 1 | `AssertionError: expected undefined to be defined` — the `.find(r => … && r.available)` that returned nothing | `whenS1Act('ghz',1)`, **replacing** a guard on `levels/ghz1.bin` alone. That guard was the right IDEA and too narrow: one of the act's ~11 files, and not the one that goes missing. |
| 1 | `src/core/project/__tests__/s1-adapter.test.ts` (`readPalettes` golden) | GHZ 1 | same `act ghz/1 unavailable` | `whenS1Act('ghz',1)` |
| 2 | `test/main/classic-save-integration.test.ts` | GHZ 1, copied to a temp dir | `Error: ENOENT: … open '/tmp/aurora-classic-save-MIgEeK/map256/GHZ.kos'` — a temp directory `afterEach` had **already deleted**, for a file missing in s1disasm all along | `whenS1Act('ghz',1)` on both rows, **plus** `resolveVariant` hardened: its last line was `return v.path` for a path known not to exist. Backstop, not the primary guard — a hole in the guard is now audible instead of misdirecting. |
| 3 | `src/core/formats/classic/__tests__/s1-compression-goldens.test.ts` | `map256/*.kos`, `artnem/8x8 - *.nem` | `AssertionError: expected 0 to be greater than 0` — an enumeration of nothing, reported as arithmetic, pointing at the codec | `whenS1Glob(dir, pattern, matches)` per row. The `describe`-level marker gate is **removed**, so each row answers for its own directory. |
| 2 | `src/core/formats/classic/__tests__/s1-binary.test.ts` | `objpos/*.bin`, `startpos/*.bin` | same `expected 0 to be greater than 0` | `whenS1Glob` per row; the three `topLevelBins` calls hoisted to the describe body so the count is available at collection. `topLevelBins` already answered `[]` for an absent dir, so hoisting is safe inside a skipped describe. |
| 1 | `src/core/formats/classic/__tests__/enigma.test.ts` | `map16/*.eni` | same | `whenS1Glob`. **This file already had the right answer one row above**: `decodes GHZ.eni …` skips with a reason naming `map16/GHZ.eni`. The sibling row was simply never given the same treatment. |
| 3 | `src/renderer/components/sprite/__tests__/s1-open-refusal.test.ts` | `_maps/Sonic.asm`, `artunc/Sonic.unc`, `artnem/Spring *.nem`, `_maps/Signpost.asm`, … | `expected false to be true` (the open returned false), `expected null not to be null` — read as refusal-logic bugs | `whenS1Files(what, spriteSetFiles(SET))`, deriving the list **off the set the row opens**, `frameSources` included. The inline Signpost set was hoisted to `SIGNPOST_SET` so its guard reads the same object the row passes. |
| 1 | `src/renderer/components/sprite/__tests__/s1-raw-grid-open.test.ts` | three `artunc/*.unc` grids | `TypeError: .toMatch() expects to receive a string, but got object` — the refusal object it got because the open read nothing | `whenS1Files` over the three named grids, hoisted to constants the rows themselves use. |

### 1b. Rows that keep FAILING — the loud anchor (3)

These are **not** skipped, deliberately. Their subject *is* the presence of the
data, so "a file is missing" is the proposition under test. If they skipped too,
an incomplete checkout would go entirely green — the loud-to-silent trade this
repo has lost before. They lacked address, not loudness.

| Rows | File | Before | Disposition |
|---:|---|---|---|
| 1 | `src/core/project/__tests__/s1-adapter.test.ts` — `detects and resolves 100% of profile entries` | `AssertionError: expected null to deeply equal { type: 's1', …(1) }`, or a list of repo-relative paths with no root | Stays red. Message names the tree, the unresolved entries, the unavailable acts, **and which part of `detect()`'s fingerprint was absent or empty** — which required exporting `S1_FINGERPRINT` from the adapter, because `detect()` returns `null` for all four of its checks alike and a second hand-written copy of that list would drift from the one that decides. |
| 1 | `src/renderer/state/__tests__/classicProjectStore.test.ts` — `opens s1disasm → report 100%, 18 acts` | `expected 'error' to be 'opened'` (read as a store bug), `expected 195 to be 231` (read as arithmetic) | Stays red. Names the directory it opened, the store's own error text, and every unresolved entry. |
| 1 | `src/core/project/profiles/__tests__/s1-object-art.test.ts` — `every linked art + mappings file exists on disk` | `AssertionError: missing files:` then 107 **repo-relative** paths — informative about WHAT, silent about WHICH TREE | Stays red. Prefixes the root and says that a list which is all one directory means an incomplete checkout, not a broken link table. |

**The anchor was verified, not asserted.** In each of the nine scenarios where a
subtree named by the s1 profile or the object-art link table was removed, at
least one of these three goes red — eight of the nine at two or more. Its reach
is exactly those two tables and no wider: under `no-anim` (the sprite animation
scripts, which neither table names) **no anchor fires**, and that scenario stays
loud a different way — 4 failures naming absolute paths, plus 55 rows announcing
`NOTHING ENUMERATED` / `BLOCK NOT COLLECTED`. Two scenarios (`no-artkos`,
`no-tilemaps`) are fully green because nothing reads them at all — see §5.

### 1c. Two findings outside the note's list

| | File | Finding | Disposition |
|---|---|---|---|
| **10 rows lost** | `src/core/level-classic/__tests__/priority-mask.test.ts` | Its `describe` BODY read `map16/SBZ.eni` (`const blocks = S1_PRESENT ? loadSbzBlocks() : []`, and `S1_PRESENT` was the marker gate). On a checkout with markers and no `map16/`, the ENOENT was a **COLLECTION** failure: `1 failed \| no tests`, and **all ten rows left the totals — including the four in the two synthetic describes, which read nothing at all.** Invisible to a failure-message audit, because it produces no failing rows. | Guard on `map16/SBZ.eni` by name. The four synthetic rows run again; the six real-data rows become one named skip each. |
| **1 vacuous pass** | `src/renderer/components/sprite/__tests__/s1-open-refusal.test.ts` — `animations stay ABSENT — the sonani dialect is not parsed (honest empty timeline)` | Asserts an **empty** timeline, which an open that read nothing satisfies. It **PASSED** on a checkout it could not read — the permanent, never-prompted defect class. | Inside the same `whenS1Files` guard as its siblings. Silent pass → named skip; the only `passed → skipped` transition in the whole measurement, and it is the good direction. |

### 1d. Left alone, on purpose

| What | Why |
|---|---|
| `s1-binary`'s `collide/…` rows, `s1-nonlevel-families` (30 rows), `object-sprite`, `s1-art-write`, `object-subtype-rules`, `s1-multi-source-pool` | They already fail with `ENOENT: … open '<absolute path>'`. That **names the missing input** — the bar is met. Adding guards would convert loud, correct failures into skips for no gain. |
| `s1-io.test.ts` (21 rows) | Already fixed by the previous parcel's `requireSingle`; its message names the absolute path and says "INCOMPLETE s1disasm checkout, not an Aurora defect". Verified still true. |
| `s1-anim-sweep` (48) and `sonic-anim-import` (7) losing every row under `no-anim` | They **announce it**: `… — NOTHING ENUMERATED (0 rows registered)` and `BLOCK NOT COLLECTED — its body reads the fixture`. Working as designed. |
| `test/live/s1-warp-live.test.ts` (1) | Opt-in live row, honest under absence. Out of scope, as the predecessor recorded. |
| The pinned goldens against peer data (`s1-derived-frames`, `s1-sonic-dplc`, `priority-mask`'s hand-derived words, `object-sprite`, `s1-nonlevel-families`' family pins) | Item 2 of the predecessor's "left alone" list, and **still open**. Vendoring or deriving them is `docs/reviews/2026-08-28-golden-live-tree.md`'s question, not this parcel's; nothing here touches a pin. |
| The three `scripts/*.mjs` hardcoded paths | Predecessor §2.3. Unchanged. |

---

## 2. The rule this parcel applied, stated so it can be argued with

Two dispositions, and the split is a judgement:

- **A row that measures AURORA against real data it cannot find measures
  nothing → SKIP, naming the file.** This is the repo's existing house answer,
  not an invention: `enigma.test.ts`'s `map16/GHZ.eni` guard and
  `render.test.ts`'s `levels/ghz1.bin` guard both already did it, and
  `test/support/fixture-tree.ts`'s header states it outright — *"every one of
  those tests has exactly one honest thing to report: SKIPPED, and here is the
  specific file I could not read."*

- **A row whose SUBJECT is the checkout's completeness → keep FAILING, and name
  the tree.** §1b. Without these, the first rule alone would make an incomplete
  checkout silent.

**⚠ Every guard predicate is a direct `existsSync` on a named path — never a read
of Aurora's own answer.** That is the whole reason a guard here cannot mask a
bug: if the file is on disk and Aurora still cannot resolve it, the guard does
not fire and the row fails exactly as before. Proved by plant, §4.

**What was NOT done, and why.** Widening `REFERENCE_MARKERS` to cover everything
any row reads would make one missing file skip **all 306** dependent rows — a far
larger silent zero than the defect it fixes. The answer to "does this checkout
hold what I read" is different for every row, so the guard has to be per-row.
What `test/support/s1-checkout.ts` supplies is the **derivation**, so no row
hand-lists its inputs.

---

## 3. The three numbers, per scenario

Twelve scenarios, each a full `rsync` copy of the real checkout with named
subtrees removed and `AURORA_S1DISASM_REPO` pointed at it. The copy is a control
in its own right: with **nothing** removed it reproduces the real tree's run
exactly — 5874 passed, 7 skipped, 0 failed.

| removed | scenario |
|---|---|
| everything but `sonic.asm`, `_maps`, `levels` and the top-level `.asm`/`.bat`/`.lua` files | `minimal` |
| `artnem/` | `no-artnem` |
| `map256/` | `no-map256` |
| `map16/` | `no-map16` |
| `objpos/` + `startpos/` | `no-objpos` |
| `artunc/` | `no-artunc` |
| `palette/` | `no-palette` |
| `collide/` | `no-collide` |
| `_maps/Sonic.asm` + `_maps/Springs.asm` (two files, not a subtree) | `no-maps-sub` |
| `_anim/` | `no-anim` |
| `artkos/` | `no-artkos` |
| `tilemaps/` + `sslayout/` + `demodata/` | `no-tilemaps` |

"Rows that reference the input" = rows whose status differed from the
complete-copy run, plus rows that stopped being registered at all.

| scenario | rows that reference the input | failed NAMING it | failed WITHOUT naming it | reasoned skips | rows never registered |
|---|---:|---:|---:|---:|---:|
| **minimal** before | 274 | 102 | **20** | 95 | 66 ¹ |
| minimal after | 271 | 100 | **0** | 124 | 56 ¹ |
| **no-artnem** before | 80 | 61 | **14** | 12 | 0 |
| no-artnem after | 80 | 62 | **0** | 25 | 0 |
| **no-map256** before | 37 | 21 | **12** | 11 | 0 |
| no-map256 after | 37 | 23 | **0** | 21 | 0 |
| **no-map16** before | 49 | 22 | **12** | 12 | **10** ² |
| no-map16 after | 45 | 24 | **0** | 28 | **0** ² |
| **no-objpos** before | 38 | 21 | **13** | 11 | 0 |
| no-objpos after | 38 | 23 | **0** | 22 | 0 |
| **no-artunc** before | 27 | 22 | **5** | 7 | 0 |
| no-artunc after | 28 | 22 | **0** | 13 | 0 |
| **no-palette** before | 47 | 33 | **9** | 12 | 0 |
| no-palette after | 47 | 33 | **0** | 21 | 0 |
| **no-collide** before | 39 | 24 | **11** | 11 | 0 |
| no-collide after | 39 | 26 | **0** | 20 | 0 |
| **no-maps-sub** before | 17 | 14 | **3** | 7 | 0 |
| no-maps-sub after | 18 | 15 | **0** | 10 | 0 |
| **no-anim** before/after | 138 | 4 | **0** | 88 | 55 ¹ |
| **no-artkos** before/after | **0** | 0 | **0** | 7 | 0 |
| **no-tilemaps** before/after | **0** | 0 | **0** | 7 | 0 |

¹ The `never registered` figure is dominated by `s1-anim-sweep` (48) and
`sonic-anim-import` (7), which **announce** their non-enumeration under a
different row name (`NOTHING ENUMERATED` / `BLOCK NOT COLLECTED`) and are
therefore accounted for, not lost. Plus `s1-warp-live` (1, opt-in).

² **The one real loss, and it is closed.** Ten rows of `priority-mask.test.ts`,
four of which read nothing at all. §1c.

**Union across all twelve: 22 misdirected rows in 13 files before, 0 after.**

---

## 4. How it was proved

The audit cannot be done by running the suite: a green run is exactly what the
defect produces. Every figure above is a differential against the complete copy.

| Claim | Proof |
|---|---|
| **The copy is a faithful control** | Complete copy, `AURORA_S1DISASM_REPO` pointed at it: `5874 passed, 7 skipped (5881), 0 failed`, byte-for-byte the same totals as the real tree. |
| **A guard cannot mask an Aurora defect** | Planted `return out;` at the top of `renderChunk` (`src/core/level-classic/render.ts:151`), `git diff --stat` = `1 file changed, 1 insertion(+)`, run against the **complete** copy. The guarded golden went **RED**, not skipped: `× cell (0,0) is air (id 0) → transparent, and a ground cell renders opaque`, and `occlusion`'s guarded row with it: `AssertionError: expected 0 to be greater than 0`. Reverted; `git diff --stat` empty. |
| **The guards are not vacuously always-skipping** | Complete copy, after the change: skips still **7**, passes still **5874**. Not one row moved. |
| **No loud-to-silent trade** | Per-scenario status differential before → after, all twelve: **0 rows went `failed → passed`. 0 rows went `failed → gone`.** Every conversion is `failed → skipped`, which the skip reporter prints by name with its reason. |
| **…and one trade in the good direction** | Exactly one `passed → skipped`, in both scenarios where it can occur: the vacuous `animations stay ABSENT` row (§1c). |
| **Every skip says why** | `skip-report: OK — every skip named its reason` on every run, including the incomplete ones (25 skips under `no-artnem`, 15 files). |
| **The anchor fires** | Per scenario, which of the three §1b rows are RED: `minimal` 3/3 · `no-artnem` 3/3 · `no-artunc` 3/3 · `no-map256` 2/3 · `no-map16` 2/3 · `no-objpos` 2/3 · `no-palette` 2/3 · `no-collide` 2/3 · `no-maps-sub` 1/3 · **`no-anim` 0/3** · `no-artkos` 0/3 · `no-tilemaps` 0/3. Nonzero for every subtree the s1 profile or the object-art link table names; zero for the three it does not, of which `no-anim` is still loud by other means (4 path-naming failures + 55 announced non-enumerations) and the other two are read by nothing (§5). |
| **Expectations derived, not transcribed** | `whenS1Act` reads `enumerateProfileEntries(s1Profile)` — the adapter's own enumeration, REV00 fallback honoured the same way `resolveEntry` honours it. `spriteSetFiles` reads the set the row passes to `openDiscoveredSet`. `S1_FINGERPRINT` is now the single list `detect()` itself iterates. No path in any new guard is hand-copied. |
| **Typecheck** | `npx tsc --noEmit` clean. |

**Aggregate totals, against the real sibling tree.**

| Run | Test files | Tests | Exit |
|---|---|---|---|
| `npm test` before this parcel | 430 passed, 2 skipped (432) | 5874 passed, 7 skipped (5881) | 0 |
| **`npm test` after** | **430 passed, 2 skipped (432)** | **5874 passed, 7 skipped (5881)** | **0** |

Identical. **No coverage was traded for the green** — the four gates
(`check-test-collection`, `check-pseudo-skip`, `check-peer-path-literals`,
`check-harness-guards`) all pass, and `skip-report: OK — every skip named its
reason`.

`npm test` under `no-artnem`, for the shape of the honest failure:
`10 failed | 418 passed | 4 skipped (432)` files, `62 failed | 5794 passed | 25
skipped (5881)` tests, exit 1 — and every one of the 62 messages contains an
absolute path inside the checkout.

Wall clock: measurements ran 01:10–01:33 local on 2026-08-30, machine uptime
`4 days, 17:00`–`17:22`, load average 6–68 (peer lanes live). Suite runs took
13–23 s each.

---

## 5. Two subtrees no test reads at all

`no-artkos` and `no-tilemaps` (which also removed `sslayout/` and `demodata/`)
are **completely green**: 5874 passed, 7 skipped, 0 failed, and **zero** rows
changed status. Nothing in this suite opens `artkos/`, `tilemaps/`, `sslayout/`
or `demodata/`.

That is not a defect and nothing here should be read as calling it one — it is a
statement of where the coverage boundary is. Recorded because the anchor argument
in §1b is only as broad as the profile and the object-art link table, and these
four directories are outside both: a checkout missing them passes this suite in
full.

---

## 6. What is left open

1. **The pinned goldens against peer data** — unchanged from the predecessor's
   list. `docs/reviews/2026-08-28-golden-live-tree.md` books it.
2. **`s1-warp-live` and `s1-object-offsets`'s `[name]`-channel skip reasons** —
   predecessor §5.5, still legacy, still churn to convert.
3. **`src/core/model/__tests__/screen.test.ts`'s walk-up for `aeon`** — same
   shape, different peer, still outside this subject.
4. **Nothing was confirmed at runtime in the app or an emulator**; no emulator
   tool was called. The diff is tests, one new test-support module, and one
   exported constant in `src/core/project/s1/index.ts` (`S1_FINGERPRINT`, which
   `detect()` now reads so there is one copy of its list). No shipped behaviour
   changes.

Commits on `fix/incomplete-checkout-rows`:

```
97f45b2a tests: a checkout missing one directory made 19 rows blame the codec, the store and node's path module
477c7e08 tests: the three rows whose subject IS the checkout stay red, and now say which tree
```
