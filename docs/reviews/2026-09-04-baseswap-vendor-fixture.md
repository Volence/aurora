# The section-6 rows read aeon's working tree — and carried its values as constants

Parcel **BASESWAP-READS-PEER-TREE**, branch `parcel/baseswap-vendor-fixture`, cut from
master `297fba95`. 2026-09-04, box uptime 9 days 17:10 at the first measurement.

Review bar: `docs/OVERSEER.md` **bar 19** (*a test must not read a peer repo's working
tree*), and its shape for a fixture that comes from a peer. This is the second instance of
that bar in this repo — the first is ROADMAP row 78 — and the interesting part is that it
recurred **in a file written after the bar existed**, in a form the bar's own sweep would
not have caught: the read was not the whole defect. The constants were.

---

## 1. What was measured, before anything was changed

`test/formats/effects-preset-base-swap.test.ts`, `describe('the shipped section-6 document
opens')`, resolved aeon with `siblingPathOrUnresolved('aeon')` and `readFileSync`'d two
files straight out of that checkout:

```
games/sonic4/data/editor/effects/presets/ojz_sec6_baseswap.json
games/sonic4/data/editor/ojz/act1/section_6.meta.json
```

Two of its four rows compared those bytes against constants spelled out in the test file:
`BASE_SWAP = { line: 160, target: 57344 }`, and a nine-line serialized string with
`"line": 160` in it.

```
$ npx vitest run test/formats/effects-preset-base-swap.test.ts     # at master 297fba95
Tests  2 failed | 26 passed (28)
AssertionError: expected { line: 3, target: 57344 } to deeply equal { line: 160, target: 57344 }
  at test/formats/effects-preset-base-swap.test.ts:381
```

**Neither failure is an Aurora regression, and the drift was COMMITTED, not dirt.** Checked
in aeon rather than assumed:

```
$ git -C ../aeon status --porcelain
 M docs/lane-status.json                 # the ONLY dirty file; neither of ours
$ git -C ../aeon show origin/master:games/…/ojz_sec6_baseswap.json
  …  "base_swap": { "line": 3, "target": 57344 }
$ git -C ../aeon log -1 --format='%H (%ad) %s' --date=short origin/master -- …/ojz_sec6_baseswap.json
8bf6df74d85101cf1969a9c7cebc4f19d708fd1b (2026-09-03) owner asks 1-3: the swap goes to the
top, the canopy goes quiet, and the camera drives it
```

So: the owner moved the swap to the top of the frame, aeon committed and pushed it, and
Aurora's suite went red about it. The agent that hit the two rows filed them as
"pre-existing, not mine" and moved on — **which is exactly the triage failure bar 19 was
written from, happening again, to a different reader, on a different file.**

### The part that is worth more than the fix

The bar's sweep looks for a *read* of a peer tree. This file had one, but the read alone
would have been survivable: a fixture read and then asserted against **derived** properties
follows the peer's edits harmlessly. What made it fail was that the read was paired with a
**second copy of the peer's document, transcribed into the test as a constant**. Two
documents in two repos, no mechanism keeping them equal, and an `expect` between them.

A constant is not a stronger assertion than a derivation. It is a *duplicate of the input*
wearing the costume of an expectation — and, being local and deterministic, it is the
pleasanter of the two to write (bar 2e: *the costume is always convenience*). Its failure
mode is the one seen here: it goes red for something that is not a defect, in a voice that
says "Aurora's codec is wrong about base_swap".

---

## 2. The repair — the two questions, separated

### (1) "Does OUR codec open, keep and re-write this document?" — vendored, pinned

Both documents extracted **through git objects at a committed revision**, never copied out
of the working tree:

```
$ git -C ../aeon rev-parse origin/master
d8d2c952a50cd7ad48f0510c160bb708ce01d4cf
$ git -C ../aeon ls-remote origin refs/heads/master
d8d2c952a50cd7ad48f0510c160bb708ce01d4cf   refs/heads/master     # published, not local-only
$ git -C ../aeon show d8d2c952…:games/…/presets/ojz_sec6_baseswap.json  > test/fixtures/effects/ojz_sec6_baseswap.json
$ git -C ../aeon show d8d2c952…:games/…/ojz/act1/section_6.meta.json    > test/fixtures/effects/ojz_act1_section_6.meta.json
```

**Re-hashed after extraction rather than believed:**

| vendored file | `git hash-object` of the extracted bytes | aeon's own blob id | bytes |
|---|---|---|---|
| `ojz_sec6_baseswap.json` | `b415b959632474dcbc430e65162e48cd2e7f7291` | `b415b959…` ✔ | 191 |
| `ojz_act1_section_6.meta.json` | `2fa39a2c8db54996c5f9531cac95030de03588c2` | `2fa39a2c…` ✔ | 104 |

A `.provenance.json` sits beside each: repo, source path, revision, `branch_that_answers_
currency`, blob, `resolved_by`, `last_changed_by`, the fixture's sha256/bytes, and the
re-vendor command.

**Why `test/fixtures/effects/` and not somewhere outside it.** The scene *schema* sidecars
live outside `test/fixtures/` on purpose, because the sweep in
`aeon-fixture-currency.test.ts` reads every 40-hex on a `revision*` key under that tree **as
an aeon revision**. Here the revision genuinely *is* an aeon revision, so being swept —
and having its reachability from aeon's published master re-asserted every run — is the
behaviour we want, not a hazard to route around.

### (2) "Is that pin still what aeon ships?" — the EXISTING instrument, extended

No second mechanism was built. `test/formats/aeon-fixture-currency.test.ts` already reads
aeon at a committed revision, names it, fails on drift with a `NOT AN AURORA REGRESSION`
prefix, and skips loudly when it cannot run. Its two rows became **loops over a `VENDORED`
table** (three entries now: the depth scene, the section-6 preset, the section sidecar).

The pre-existing sidecar sweep — *"every peer-repo revision recorded in test/fixtures is
PUBLISHED"* — picked up the two new sidecars **with no change at all**, because they name
`aeon` as a top-level block. That half genuinely needed nothing.

The content-currency half did need the table rows: the sweep answers *is the pinned SHA
reachable*, which is a different question from *do the pinned bytes still match*.

**One row was added that did not exist before**, and it exists because a table is a list and
lists go stale silently: *"every sidecar claiming a verbatim aeon blob is IN the table
above"*. Without it, vendoring a fourth fixture and forgetting the row would produce **no
currency check and no complaint** — a silent zero inside a green total, the exact defect
this file was written to abolish. Its population is deliberately "a sidecar whose `aeon`
block names both a `path` and a `blob`", which excludes the two `test/fixtures/bg-override/`
sidecars: those have an `aeon` block but describe a **derived** artifact, with no aeon file
to compare byte-for-byte against.

### What happened to the loud skip

The old `need(ctx)` guard at `:362-369` is **gone, on purpose, and this is not a regression
into silence.** A vendored fixture is committed in this repo, so *"could not reach aeon"* is
no longer a state those four rows can be in — the branch could never execute, and a branch
that can never execute is the vacuous construct bar 2e names. The loud-skip discipline did
not disappear; it **moved to the file where unmeasurability is real**, and §4 below shows it
firing there by name, per fixture, with the pin quoted.

---

## 3. Which rows were kept, re-cut, or deleted

| row | verdict | why |
|---|---|---|
| `parses through the real codec, with the id/filename rule enforced` | **RE-CUT** | `expect(preset.base_swap).toEqual(BASE_SWAP)` was the failing row. Deriving `BASE_SWAP` from the fixture would have made it compare the fixture to itself. It now asserts what the CODEC is responsible for: the filename rule (plus a negative — a wrong stem throws), the exact declared key set from `EFFECTS_PRESET_BASE_SWAP_KEYS`, integer types, the schema's own line/target bounds and `$2000` alignment, and `toEqual(RAW.base_swap)` where `RAW` is the fixture's own `JSON.parse` — **not** a tautology: a codec that coerced, defaulted, renamed or rescaled would fail it, and §4's poison 4b proves it does. The channel is derived too: whichever of `bands`/`ramp`/`base_swap` the document carries is the one `presetRasterChannel` must report, so re-authoring section 6 as a `bands` document would not redden us about a number. |
| `is what section 6 is BOUND to` | **KEPT, re-pointed** | Now `meta.rasterRef === preset.id`, where the id is parsed out of the preset fixture beside it. A cross-file claim about the vendored PAIR (both pinned at one aeon revision) — it fails if one is ever re-vendored alone. Proven red in §4 poison 5. |
| `round-trips byte-for-byte through serialize` | **RE-CUT** | ⚠ **`serialize(parse(x)) === x` is FALSE here for a correct writer**, and writing it that way would have been a real defect: aeon authors `id/name/schema/base_swap`, canonical order is alphabetical (aeon §5), so the vendored input is not canonical. The property is *"the writer emits the canonical rendering of what it read"*, and the expectation is now computed by a **second canonicaliser written from the spec** in the test file — a different route to the same answer, not the writer agreeing with itself. Plus the two halves of "inventing and dropping nothing" stated separately (`JSON.parse(out)` deep-equals `RAW`; the key order is `Object.keys(RAW).sort()`), plus idempotence. |
| `THE CONTROL: the writer pads no absent channel` | **KEPT unchanged** | It already read only the schema's declared key list and the writer's output; nothing about it was cross-repo. |

**No row was found to be unable to fail, and none was deleted.** Every one of the four was
put under a violation in §4 and every one went red.

`BASE_SWAP` itself survives, but its docblock was lying and is corrected. It is **empyrean's
published PASS vector** (5bd76ba; case 17 of the vendored vector set), used by the synthetic
schema-matrix rows, and it is **no longer what aeon ships**. The old comment claimed it was
aeon's document, which is what made the cross-document `toEqual` look reasonable.

⚠ **A fact for the owner, not adjudicated here.** empyrean's published vector set still
carries `{line: 160}` and describes it as *"the exact document aeon bound at 850d4c60"*;
aeon ships `{line: 3}`. That is a disagreement between two peers, neither of which is this
repo. Aurora asserts nothing about it and must not — a check here would be a cross-repo
claim about two other people's documents. It is recorded in
`test/fixtures/effects/ojz_sec6_baseswap.provenance.json` so a reader who finds both numbers
knows why they differ, and **it is tagged for the foreground** below.

---

## 4. Proofs

### (a) It passes with the peer UNREACHABLE

`EMPYREAN_SUITE_ROOT` pointed at an **empty** directory (a `<NAME>_DIR` naming something
absent is a hard error by design; an empty root is the "no peers here" case):

```
$ EMPYREAN_SUITE_ROOT=<empty dir> npx vitest run test/formats/effects-preset-base-swap.test.ts \
      test/formats/aeon-fixture-currency.test.ts
Tests  32 passed | 4 skipped (36)
skip-report: 4 SKIPPED test(s) in 1 file(s). A SKIP IS NOT A PASS —
  ↓ CURRENCY … > ojz_sec6_baseswap.json matches games/…/ojz_sec6_baseswap.json at aeon origin/master
      [note] SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR) —
             CANNOT MEASURE whether the pin d8d2c952a50cd7ad48f0510c160bb708ce01d4cf
             for ojz_sec6_baseswap.json is still current
  (…the same, by name and by pin, for ojz_act1_depth.json and ojz_act1_section_6.meta.json,
   plus the reachability sweep, which lists all 8 unmeasurable revisions)
```

**All 28 codec rows pass with aeon absent.** The four skips are all in the currency file,
all loud, and each names the pin it could not measure. Whole suite, same environment:

```
$ EMPYREAN_SUITE_ROOT=<empty dir> npx vitest run
Test Files  489 passed | 4 skipped (493)
     Tests  6895 passed | 59 skipped (6954)          exit 0
```

### (b) The currency check ACTUALLY FAILS on drift — red-first

Poison 1 is the real drift scenario: the pin is **self-consistently wrong** — the fixture
edited back to `line: 160` and its sidecar's `blob`/`git_blob`/`sha256`/`bytes` recomputed to
match — so pin-integrity stays green and only the currency question can catch it.

```
$ git diff --stat
 test/fixtures/effects/ojz_sec6_baseswap.json            |  2 +-
 test/fixtures/effects/ojz_sec6_baseswap.provenance.json | 28 ++++++++---------
$ grep -n '"line"' test/fixtures/effects/ojz_sec6_baseswap.json
6:    "line": 160,
$ grep -n '"blob"' test/fixtures/effects/ojz_sec6_baseswap.provenance.json
10:    "blob": "0a772315bee90e4bf0a53bdf74eb825632855f32",
```

```
FAIL … CURRENCY … > ojz_sec6_baseswap.json matches games/…/ojz_sec6_baseswap.json at aeon origin/master
AssertionError: NOT AN AURORA REGRESSION — a vendored aeon fixture is stale.
  pinned at aeon d8d2c952a50cd7ad48f0510c160bb708ce01d4cf (blob 0a772315…)
  aeon origin/master is now d8d2c952a50cd7ad48f0510c160bb708ce01d4cf (blob b415b959…)
  games/sonic4/data/editor/effects/presets/ojz_sec6_baseswap.json changed between them.
  Re-vendor:  git -C ../aeon show d8d2c952…:games/…/ojz_sec6_baseswap.json > test/fixtures/effects/ojz_sec6_baseswap.json
  then update test/fixtures/effects/ojz_sec6_baseswap.provenance.json (revision, blob, sha256, git_blob),
  and re-check the codec rows that read it.
Tests  1 failed | 35 passed (36)
```

⚠ **Read what else that run says.** Exactly ONE row went red, and **all 28 codec rows stayed
green** — they follow the fixture because their expectations are derived from it. That is
the property the whole parcel is for, visible in a single run: a value change in aeon's
document now produces **one** failure, in the file whose name says it is about aeon, with a
message that begins by telling the reader it is not our bug.

Restored from the committed baseline `69165fa3` (`git checkout 69165fa3 -- <paths>`), tree
clean, green again. Four more poisons, each planted, quoted, run red, and restored the same
way:

| # | mutation (quoted from disk / `git diff --stat`) | expected red | result |
|---|---|---|---|
| 2 | sidecar `aeon.blob` → `0000…0000` | pin integrity for that fixture | **RED**, `expected 'b415b959…' to be '0000…'`; 7 passed |
| 3 | `'ojz_sec6_baseswap.json'` removed from the `VENDORED` table | the completeness row | **RED**, *"a sidecar claims to hold a verbatim aeon blob but its fixture is not in VENDORED, so it gets NO currency check"*; `expected [ …(3) ] to deeply equal [ …(2) ]` |
| 4a | `serializeEffectsPreset` drops `name` on the way out (`src/core/formats/effects/preset.ts`) | the round-trip row | **RED**; 27 passed |
| 4b | `parseEffectsPreset` rewrites `base_swap.line = line * 2` | the parse row AND the round-trip row | **RED** ×2, `expected { line: 6, … } to deeply equal { line: 3, … }` — this is the run that proves `toEqual(RAW.base_swap)` is not a tautology |
| 5 | vendored `section_6.meta.json` `rasterRef` → `some_other_preset` | the binding row (+ pin integrity + currency) | **RED** ×3, `expected 'some_other_preset' to be 'ojz_sec6_baseswap'` |

No poison came back green, so the three-cause diagnosis of bar 2d was not needed. The
alternative green-path considered and ruled out for poison 1 specifically: *could the row
have gone red for the pin-integrity reason instead?* No — the sidecar was recomputed to
match the mutated bytes, and the pin-integrity row for that fixture **passed** in the same
run, so the red came from the aeon comparison and nothing else.

---

## 5. Suite totals — all four runs mine

| run | files | tests |
|---|---|---|
| **BEFORE**, master `297fba95`, `npx vitest run` | 1 failed / 489 passed / 3 skipped (493) | **2 failed** / 6944 passed / 9 skipped (6955) |
| **AFTER**, `npx vitest run` | 490 passed / 3 skipped (493) | **0 failed** / 6951 passed / 9 skipped (6960) |
| **AFTER, peer unreachable** | 489 passed / 4 skipped (493) | **0 failed** / 6895 passed / 59 skipped (6954) |

`+5` tests: the currency file went 3 rows → 8 (two loops over three fixtures, plus the
completeness row). The base-swap file is 28 rows before and after.

### ⚠ `npm test` DOES NOT REACH VITEST ON MASTER, AND DID NOT BEFORE THIS PARCEL

Reported rather than worked around, because the parcel brief predicted "`npm test` has
exactly 2 failing tests" and that is not what the command does:

```
$ npm test        # on master 297fba95, before any change of mine
check-ledger-timestamps: FAIL — 1 of 2 ledger(s) did not pass:
  docs/lane-log.jsonl: exit 1
TWO IN-SCOPE ENTRIES SHARE ONE STAMP (1)
  2026-09-04T05:07:57Z  297fba95 then 297fba95  The Hydrocity-style waterline effect can now…
EXIT=1
```

The gate chain aborts **before vitest runs**, on a duplicate `at` stamp introduced by
master's own tip commit. That is a genuine in-repo defect and it is **not mine and not
fixable by me honestly**: the remedy the gate itself prescribes is to give the later entry
*"the second the clock actually read"*, and that second is not recoverable now — inventing a
plausible one is the exact failure (`Not from memory, not rounded…`) the gate exists to
stop. **STOPPED on that item** per the escape hatch; it belongs to whoever wrote the entry.
All suite figures above are therefore `npx vitest run`, which is the half of `npm test` this
parcel can speak for; the gates that run *before* the ledger check all passed on both sides,
including `check-peer-path-literals` and `check-cited-paths`.

---

## 6. What is left open, and what is tagged

- **TAGGED FOR THE FOREGROUND — the contract and the engine disagree about section 6.**
  empyrean's published vector (5bd76ba, case 17) says `line: 160` and calls it the document
  aeon binds; aeon ships `line: 3` since 8bf6df74. Both are committed and pushed. Aurora is
  correct either way and asserts nothing about it, but somebody outside this repo should
  decide whether empyrean re-publishes the vector. Aurora's `base_swap` schema accepts both.
- **STOPPED (escape hatch): `docs/lane-log.jsonl` duplicate stamp at master `297fba95`**
  blocks the whole `npm test` gate chain, for everyone, before vitest. §5.
- **No lane-log entry was written for this parcel**, deliberately: the ledger gate is
  already red on that file and adding an entry while it is red risks a second collision on
  the same clock second. Flagged rather than done.
- **ROADMAP row 78's `s1disasm` half remains open and untouched** — 37 sites, out of scope,
  and its own row already explains why half-fixing it is worse than leaving it legible.
- Not re-run or re-measured: the parcel live on `parcel/o78-residual-census`. Nothing under
  `scratchpad/` was read, written, or moved by this parcel.
