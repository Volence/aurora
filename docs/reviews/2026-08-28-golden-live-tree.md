# A golden pinned against a peer's WORKING TREE — 2026-08-28

Branch `fix/golden-live-tree-read`, off `origin/master` `19b76d5`.

Protocol read at a committed revision before starting, as its own most upstream rule
requires: `git -C ../empyrean fetch -q origin && git -C ../empyrean show
origin/main:docs/OVERSEER-PROTOCOL.md`, at **`2fd7b5f0ae8605104105c22b13d9cf2e494b2ac5`**.
Two passages govern this parcel and are quoted where they bind:

> *"`../empyrean/docs/OVERSEER-PROTOCOL.md` is **one peer's live working tree**. Reading it
> by path means the suite's shared contract is delivered to every lane by reading somebody's
> uncommitted directory … and **nothing about it ever looks wrong**."*

> *"**Operational form**: prefer `git show <rev>:<path>` over reading a sibling's working
> file, because the first names a revision and the second silently names 'whatever is on
> disk right now'."*

That rule had been applied to **documentation** and never swept through **test fixtures**.

---

## 1. The defect

`test/formats/effects-scene-curve-vsplit.test.ts:136` pinned a byte-exact golden against

```
/home/volence/sonic_hacks/aeon/games/sonic4/data/editor/effects/ojz_act1_depth.json
```

On this machine that path is the **aeon lane's live checkout**. Measured at the start of
this parcel:

```
$ git -C ../aeon status --porcelain -- games/sonic4/data/editor/effects/ojz_act1_depth.json
 M games/sonic4/data/editor/effects/ojz_act1_depth.json
```

So the golden compared Aurora's serializer against a document **no revision names**, and it
flipped green or red as a peer typed.

**The failure, root-caused rather than waved past.** The uncommitted aeon edit (read-only
`git -C ../aeon diff`) moved two layers and, decisively, **deleted `vsplit` from the curved
layer**:

```diff
-      "vsplit": {
-        "at": 20
-      },
-      "world_y": 112
+      "world_y": 304
```

The golden then ran `setLayerFieldCommand(…, 'vsplit', undefined)!`, which is a **no-op
returning `null`** on a layer that has no `vsplit`, and the `!` handed that `null` to
`EditHistory.execute`:

```
TypeError: Cannot read properties of null (reading 'type')
 ❯ applyCommand src/core/editing/history.ts:99:11
```

Nothing in that trace mentions aeon, a peer, or a working tree — which is exactly why
**three agents and one overseer reported it as "pre-existing, unrelated"** without anyone
asking why it failed. Everyone agreed on a premise; nobody cited a line for it.

## 2. Why this was worse than a flaky test — the part worth keeping

For its whole life before 2026-08-28 this test was **green, and its green meant nothing
verifiable.** It could not have detected drift, because **it had no fixed thing to drift
from**: its success state and its failure state were both decided by a directory outside
this repository's control. A check written this way can only ever report the state of
somebody else's working tree, and it reports it in the voice of a codec assertion.

Note also that the repo **already had the right pattern** and this test did not use it:
`test/fixtures/bg-override/*.provenance.json` records
`"resolved_by": "git -C ../aeon ls-remote origin refs/heads/master, read via git archive
into a mkdtemp — never the sibling working tree"`. The convention existed; the sweep never
happened.

**A live demonstration arrived unbidden, mid-parcel.** aeon's `origin/master` advanced from
`88909bb3e05e0e10b979b2c492259d8db377a0e5` to `5b09649c1493d6a574c2f4911d07d431a9ba9384`
**within five minutes** of the fixture being vendored, while its working copy of this very
file stayed dirty throughout. Any check whose answer depends on that directory is being
re-rolled continuously.

## 3. What was built — the two questions, separated

They are different questions and they need different instruments.

**Question 1 — "does Aurora's parser/serializer round-trip this document byte-exactly?"**
A property of *Aurora's own code*. A pinned blob is the correct and legitimate instrument,
because the property is about the round trip, not about currency.

- `test/fixtures/effects/ojz_act1_depth.json` — aeon's shipped scene, **vendored into this
  repo**, byte-for-byte, read with `git -C ../aeon show <rev>:<path>`. Git blob id
  `e5a334f0f54e1ed00bf6c691f7ad4ec18d33fa36` — **the same object aeon stores**, which is
  what makes the pin checkable rather than merely copied.
- `test/fixtures/effects/ojz_act1_depth.provenance.json` — records repo, path, revision
  (`88909bb3…`, aeon `origin/master` at the moment of vendoring, agreed by `git ls-remote`),
  blob id, the commit that last changed it (`1d1c96d4…`, 2026-08-26), how it was resolved,
  what each of the two checks measures, and the re-vendor command.
- Both goldens now read **only** that fixture:
  `test/formats/effects-scene-curve-vsplit.test.ts`
  and `src/renderer/providers/__tests__/effects-aeon.test.ts`. Their `existsSync`/skip
  guards are (in `effects-scene-curve-vsplit.test.ts` and `effects-aeon.test.ts`) **gone on purpose** — a fixture committed to this repo cannot be legitimately
  absent, so absence is a broken checkout and must be loud.
- One row added where the 2026-08-28 failure needed it: the golden now asserts *the curved
  layer carries a `vsplit` to clear* **before** the edit, so a re-vendored fixture that lost
  the key says which property went missing instead of throwing a `TypeError` out of
  `EditHistory` two lines later.

**Question 2 — "is the document we pinned still what aeon ships?"**
A **pinned blob can never answer this** — it equals itself by construction, so a check
written that way passes forever and cannot detect the drift it exists for. It gets its own
instrument: `test/formats/aeon-fixture-currency.test.ts`, over
`test/support/peer-repo.ts`.

- Reads aeon **at a committed revision through git objects** (`git -C <aeon> show
  <rev>:<path>`), never through the sibling working tree.
- **Names the revision** in every message it prints.
- **Fails** on drift, with a message prefixed *"NOT AN AURORA REGRESSION — a vendored aeon
  fixture is stale"* and carrying both SHAs, both blob ids, and the exact re-vendor command.
  That prefix is deliberate: the triage failure in §1 was three readers mistaking a
  cross-repo signal for an in-repo one.
- **Skips loudly** when it cannot run — no aeon checkout, unfetched ref — with
  `SKIPPED, NOT PASSED: … CANNOT MEASURE …`. It never renders "could not measure" as green.
- Compares **content, not commit SHAs**, so aeon's ordinary commits (see the five-minute
  advance above) do not turn Aurora red; only a change to *this document* does.
- Third row, from the protocol's *"the revision you VERIFIED AT is an anchor too"*: every
  40-hex `"revision*"` recorded in **any** `test/fixtures/**/*.provenance.json` must be
  reachable from aeon's published `origin/master`. Four such revisions across three
  sidecars are checked today; a pin at a local-only SHA looks perfect from this machine and
  is unresolvable from anywhere else.

`test/support/peer-repo.ts` writes **no absolute peer path**: the sibling root is derived
from this repo's own `--git-common-dir` (correct from a plain clone *and* from a linked
worktree), overridable by `AURORA_PEER_ROOT` / `AURORA_<NAME>_REPO`. Everything goes through
git plumbing, so it reads **objects**; it never opens a file inside a peer checkout and
never writes to one.

## 4. How it was proved

| Row | Evidence |
|---|---|
| **Red first** | On `origin/master` `19b76d5`, against the dirty aeon file: `1 failed`, `TypeError` at `history.ts:99` via `effects-scene-curve-vsplit.test.ts:154`. Root cause quoted in §1 from the peer's own diff. |
| **Green after** | The same golden passes against the vendored fixture. |
| **…and the property, not just today** | Re-run with `AURORA_PEER_ROOT` pointed at a directory containing **no aeon at all**: `4 passed (4) / 145 passed, 3 skipped`. Both goldens pass with aeon unreachable, while aeon's working copy of the file **is still dirty**. A test that passes with the peer repo absent entirely cannot be reading the peer's working tree. |
| **Currency catches drift** | A scratch repo standing in as aeon, with `"at": 20` → `"at": 21` at its `origin/master`: the check FAILS, printing `pinned at aeon 88909bb3… (blob e5a334f0…) / aeon origin/master is now 6bba82c0… (blob 69318b5f…)`, the changed path, and the re-vendor command — plus a unified diff of the one changed line. The reachability row fails in the same run, listing all four recorded revisions as unreachable from that tip. |
| **Currency skips loudly** | `AURORA_AEON_REPO=/nonexistent-aeon`: `↓ … [SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO) — CANNOT MEASURE whether the pin 88909bb3… is still current]`, while the pin-integrity row still runs and passes. |
| **Expectations derived, not transcribed** | Every SHA here was resolved locally: `git -C ../aeon rev-parse origin/master`, confirmed against `git -C ../aeon ls-remote origin refs/heads/master`; the fixture's blob id is `git hash-object`'s answer, recomputed inside the test from the fixture's own bytes and compared to the id aeon stores. None was copied from the dispatch. |
| **Typecheck** | `npx tsc --noEmit` clean. |

**Aggregate suite totals.**

| | Test files | Tests |
|---|---|---|
| Before (`19b76d5`) | 1 failed, 396 passed, 2 skipped (399) | **1 failed**, 5277 passed, 7 skipped (5285) |
| After | **398 passed**, 2 skipped (400) | **5281 passed**, 7 skipped (5288) |

The single failing name before was
`test/formats/effects-scene-curve-vsplit.test.ts > ojz_act1_depth.json round-trip golden
(triage §B row H) > is byte-stable through parse→serialize, and again after an edit and its
undo`. After: **no failing names.** The skip count is unchanged at 7 — the two `s4_engine`
rows in §5 were already skipping, silently; they now say what they could not measure.

## 5. THE FULL SWEEP — `grep -rn '/home/volence/sonic_hacks/' test/ src/ scratchpad/`

**46 hits in `test/` + `src/`**, over four peers, plus 140 files in `scratchpad/`.

### aeon — 4 hits. **All test-time reads FIXED.**

| Site | Judgement | Action |
|---|---|---|
| `test/formats/effects-scene-curve-vsplit.test.ts:136` | The defect. Byte-exact golden against a peer's live tree. | **FIXED** — reads the vendored fixture. |
| `src/renderer/providers/__tests__/effects-aeon.test.ts:451` | Same file, same live-tree read; every layer's extras derived from it. It was the *second* instance and nobody had noticed it. | **FIXED** — same fixture. |
| `test/formats/bg-override-binding.test.ts:68` | "THE ROW THAT TOUCHES REALITY" — reads aeon's `project.json` and asserts exactly one act binds. Its *intent* is currency, so vendoring would be wrong: it must keep looking outward. | **FIXED** — now reads `project.json` at aeon `origin/master` through `git show`, prints the resolved SHA **in the test name**, `ctx.skip`s loudly (not `it.skip`, whose reason never reaches the reader) when it cannot measure, and **fails** rather than skips if the revision resolves and `project.json` is absent at it — that is the rename it exists to catch. |
| `src/core/model/screen.ts:5` | A comment citing `aeon/engine/system/constants.emp` as the source of a constant. Not a read; nothing's colour depends on it. | **Left.** Low priority, but it names a file and not a revision — the same class in prose. Worth a revision when that constant is next touched. |

### s1disasm — 37 hits across 25 test files. **REPORTED, deliberately NOT fixed. Read this.**

Every one is `const S1DIR = '/home/volence/sonic_hacks/s1disasm'` (or a path beneath it),
guarded by `existsSync` and skipped when absent. This is a **different case from aeon** and
the difference is load-bearing: s1disasm is the classic half's **project corpus** — Aurora
*opens it in place* as a project (`disasm-as-project`, merged 2026-08-12) — not a peer
lane's in-flight source. Nobody else is typing into it.

**But it is not innocent, and here is the measurement:**

```
$ git -C ../s1disasm status --porcelain
 M "artnem/GHZ Bridge.nem"
 M artnem/Signpost.nem
?? .aurora/
?? Test.hsproject
```

**Both modified files are files Aurora's own tests read by absolute path**
(`src/core/project/profiles/s1-object-art.ts:318,430`;
`src/renderer/components/sprite/__tests__/s1-open-refusal.test.ts:176`), and the save-back
suites write into that tree. So the same exposure exists here in a self-inflicted form: the
corpus these goldens measure against is mutated by the suite that measures it.

**Why not fixed in this parcel, stated rather than glossed:** the corpus is a whole
disassembly and cannot be vendored; the right shape is a `git archive` of s1disasm at a
**pinned revision** into a temp dir once per run (the pattern
`editor_bg_override.roomy.provenance.json` already records for aeon), plus one location
helper — a real design with real regression surface across 25 files and ~40 sites. And the
**cheap** version of the fix is a trap: routing all 37 through `peerRepo('s1disasm')` would
delete the absolute paths while leaving every read pointed at the same live, self-mutated
tree — a change that *looks* like this bar was met and does not meet it. Half-fixing it
would be worse than leaving it legible. **Recorded as open; see ROADMAP row 78.**

### s4_engine — 2 hits. **The repo DOES NOT EXIST. Made audible.**

`test/sprite/anim-import.test.ts:42` and `test/sprite/sprite-import.test.ts:100` point at
`/home/volence/sonic_hacks/s4_engine`, which aeon replaced and which is **gone from this
machine**. Both used `(existsSync(FILE) ? describe : describe.skip)` — so two integration
blocks have measured **nothing at all**, for months, as a silent zero inside a green total.
That is this parcel's thesis in its purest form. Converted to a running `it` that
`ctx.skip`s with *"the s4_engine tree is gone from this machine, so this row measures
nothing at all and has not for some time"* — an invisible zero made visible. The rows are
**left in place, not deleted**: whether to re-point them at aeon or drop them is the sprite
lane's call, and it can now see that the question exists.

### programs/ — 3 hits. **Left, correctly.**

`src/renderer/components/classic/composer-shared.tsx:20`,
`src/core/level-classic/render.ts:22`, `src/core/level-classic/model.ts:16` — all
**comments** citing SonLVL C# source for a constant's provenance. Nothing reads them; no
outcome depends on them. `programs/` is a vendored third-party tool directory, not a lane's
working repo.

### scratchpad/ — 140 files. **Left, correctly, and NOT swept.**

These are CDP harnesses and probes that **drive the real app against a real project**, so an
absolute path to a peer *project directory* is exactly what they need — it is their input,
not a hidden dependency of a green check. They produce no suite colour, and rewriting them
for tidiness would break working instruments to no benefit. Judged individually by class:
app-driving harnesses (`*-harness.mjs`, `run-*.log`) and one-shot probes both legitimately
name a project on this machine.

## 6. What is left open

1. **s1disasm, 37 sites** (§5). The corpus is read from — and written into — a live git
   working tree with uncommitted state right now. Needs a pinned-revision `git archive`
   approach, not a path rewrite. ROADMAP row 78.
2. **The two `s4_engine` rows** are now audible but still measure nothing. Sprite lane's
   call: re-point at aeon, or delete.
3. **`src/core/model/screen.ts:5`** cites an aeon file with no revision.
4. **Currency freshness limit, stated in the test's own header:** the check resolves aeon's
   `origin/master` remote-tracking ref **without fetching**, so it is only as fresh as that
   checkout's last fetch. Deliberate — an offline-safe committed revision instead of network
   I/O in a unit test, which is the protocol's own trade of *"an invisible failure for a
   visible lag"*. It cannot regress into the defect it replaces: a remote-tracking ref is
   never somebody's uncommitted edit.
