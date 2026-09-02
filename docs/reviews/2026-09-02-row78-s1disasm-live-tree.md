# Row 78 — do Aurora's tests read s1disasm's LIVE working tree?

**Phase 1 only. A measurement, and a hard gate before any conversion.**
Branch `fix/row78-s1disasm-live-tree`. Instrument
`scripts/classify-peer-tree-reads.mjs` (committed; this packet quotes its output,
it does not restate it from reading the tests).

Measured 2026-09-02, machine uptime 8 days 5:12–5:35 throughout. Peer checkout
`/home/volence/sonic_hacks/s1disasm` at HEAD `f6ece657c1cf253404312137dfcb8ec15fa42318`,
4 porcelain entries (` M "artnem/GHZ Bridge.nem"`, ` M artnem/Signpost.nem`,
`?? .aurora/`, `?? Test.hsproject`) — **unchanged at the end of every run**, confirmed
by the instrument itself, which re-reads HEAD and `git status --porcelain` after
its last suite and refuses its own result if either moved.

---

## The question, and why nothing cheaper answers it

84 files under `src/`+`test/` name `s1disasm`; 56 of them are test files. That count
is the population, not the finding. Bar 19's question is not *does this file mention
the peer* but **would a peer lane's uncommitted edit decide this row's colour** —
a question about the ASSERTION, not the read.

`node scripts/check-peer-path-literals.mjs` **passes**, and that is not coverage: it
polices absolute-path *literals*, and bar 19's own corollary (b) says routing a read
through a helper "removes the literal while leaving the read pointed at the same live
tree — a change that LOOKS like this bar was met".

Three cheaper instruments were tried. **Each would have reported a false zero:**

1. **Grep for `readFileSync`** finds the read and never the assert. It cannot separate
   a byte-exact golden from a `whenS1Files` existence guard.
2. **Monkeypatching `fs`** does not work under vitest at all. Measured with a throwaway
   setup file that replaced `fs.readFileSync` and a test that called both spellings:

   ```
   NAMED_SEEN=0 DEFAULT_ADDS=1
   ```

   `import { readFileSync } from 'node:fs'` — how essentially this whole tree is
   written — is invisible to the patch, because Node's ESM facade snapshots the named
   export. **A tracer built this way would have printed a confident, EMPTY class A.**
3. **`strace`** is not installed on this machine (`strace not found`).

So the instrument **perturbs the input and watches the colour**. It never touches the
peer: it copies the peer's tree and points `S1DISASM_DIR` at the copies.

| tree | what it is |
|---|---|
| `base` | plain copy of the peer's working tree — **the control** |
| `canary` | `base`, with the peer's two MODIFIED files reset to committed content |
| `canary-plus` | those same two paths given **each other's** content — the **positive control on the canary channel** |
| `swap` | every file's content replaced by another file of the **same extension** — a REALISTIC poison: every path exists, every file still valid, only the data wrong |
| `scram` | every file replaced by same-length deterministic noise — DESTRUCTIVE, deliberately second (a total break names itself, so it finds the least) |
| `empty` | `S1DISASM_DIR` at an EMPTY directory — the contract's recipe, since a variable naming an ABSENT directory is a hard error by design |

**`base` is run twice and the two result sets must be identical.** Both invocations
reported `CONTROL (base run twice): IDENTICAL — deltas below are real`. Without that,
every delta below would be unreadable.

## The classes, defined by what the experiment can see

- **A** — moves under `swap`. **Reads peer bytes AND asserts on them.** The exposure.
- **C** — moves under `scram` but not `swap`. Reads bytes; only needs them to parse.
- **B** — moves only under `empty`. Resolves the path; no observable content dependence.
- **D** — moves under none. Names the peer without depending on it.

⚠ **What B cannot distinguish, said plainly.** A row that reads bytes and asserts
something true of *all* bytes (`buffer.length > 0`) is invariant under both poisons and
lands in B. **B therefore means "no observable content dependence", not "provably opens
no file".** That is the honest reading of what a differential can see — and it is the
operationally useful one, since a row no input change can move is not a row a peer's
edit decides.

⚠ **The instrument's own blind spot, printed by the instrument.** Four files are the
only file carrying their extension, so `swap` could not give them different content:
`Test.hsproject`, `Utility Project Files/Legacy Utility Project Files.zip`, `sonic.lst`,
`sound/dac/pcm/generated/sega.pcm`. A row reading only one of those would look like B.
None of the 56 files reads any of them (they survive `scram` too).

---

## RESULT

```
COUNTS over the 56 test files:  A=28   B=2   C=6   D=20
```

Reproduced identically by two independent full invocations (13:29:56–13:31:07, six
suite runs; and 13:33:09–13:43:45, 47 suite runs with `--attribute`).

### Class A — 28 files, and what each reads

Attribution is measured, not read: one further run per top-level peer entry, poisoning
only that subtree.

| test file | reads |
|---|---|
| `src/core/aether/__tests__/s1-object-offsets.test.ts` | `_Constants.asm` |
| `src/core/anim/__tests__/sonic-animate.test.ts` | `_anim` |
| `src/core/formats/classic/__tests__/s1-binary.test.ts` | `collide`, `levels`, `objpos`, `startpos` |
| `src/core/formats/games/__tests__/s1-art-write-delta.test.ts` | `_maps` |
| `src/core/formats/games/__tests__/s1-art-write.test.ts` | `_maps` |
| `src/core/import/__tests__/sonic-anim-import.test.ts` | `_anim` |
| `src/core/level-classic/__tests__/model.test.ts` | `levels` |
| `src/core/level-classic/__tests__/object-sprite-pri.test.ts` | `_maps`, `artnem` |
| `src/core/level-classic/__tests__/object-sprite.test.ts` | `_maps` |
| `src/core/level-classic/__tests__/occlusion.test.ts` | `_maps`, `levels`, `map256`, `objpos` |
| `src/core/level-classic/__tests__/priority-mask.test.ts` | `map16` |
| `src/core/level-classic/__tests__/s1-anim-art.test.ts` | `artunc` |
| `src/core/level-classic/__tests__/s1-io.test.ts` | `levels`, `map256`, `objpos`, `startpos` |
| `src/core/level-classic/__tests__/s1-object-anim.test.ts` | `_anim` |
| `src/core/project/__tests__/reserved-tiles-real-act.test.ts` | `_maps`, `artnem`, `map16` |
| `src/core/project/profiles/__tests__/object-subtype-rules.test.ts` | `_maps` |
| `src/core/project/profiles/__tests__/s1-object-art.test.ts` | `_maps` |
| `src/core/project/profiles/__tests__/s1-sync-anims.test.ts` | `_incObj`, `sonic.asm` |
| `src/renderer/components/canvas/__tests__/canvas-commit-model.test.ts` | `map16` |
| `src/renderer/components/sprite/__tests__/edit-art-handoff.test.ts` | `_anim` |
| `src/renderer/components/sprite/__tests__/s1-open-refusal.test.ts` | `_maps`, `artnem` |
| `src/renderer/components/sprite/__tests__/s1-raw-grid-open.test.ts` | `artunc` |
| `src/renderer/components/sprite/__tests__/s1-saveback-roundtrip.test.ts` | `_maps` |
| `test/sprite/s1-anim-sweep.test.ts` | `_anim` |
| `test/sprite/s1-derived-frames.test.ts` | `_maps` |
| `test/sprite/s1-multi-source-pool.test.ts` | `_maps`, `artnem` |
| `test/sprite/s1-nonlevel-families.test.ts` | `_maps`, `artnem`, `artunc`, `palette` |
| `test/sprite/s1-sonic-dplc.test.ts` | `_maps`, `artunc` |

These are real byte-exact goldens, not incidental reads. Sample colour changes under
`swap`, quoted from the run:

```
passed -> failed   s1 binary goldens over real s1disasm data > levels/*.bin decode,
                   consume the whole file, and re-encode byte-identically
passed -> failed   priority bits of real SBZ blocks (hand-derived) > block $11 decodes
                   to the hand-derived words and pri [0,0,1,1]
passed -> failed   S1 Sonic DPLC — real-file parse, hand-derived entries > parses 88
                   DPLC entries, 1:1 with the 88 mapping frames
```

### Class C — 6 files (weakly exposed: reads bytes, needs them only to parse)

`src/core/formats/classic/__tests__/enigma.test.ts`,
`src/core/formats/classic/__tests__/s1-compression-goldens.test.ts`,
`src/core/level-classic/__tests__/render.test.ts`,
`src/core/project/__tests__/editable-tiles.test.ts`,
`src/core/project/__tests__/s1-adapter.test.ts`,
`test/main/classic-save-integration.test.ts`.

No attribution: attribution uses the `swap` poison, and class C is by definition
invariant under it. Saying "(nothing this instrument could attribute)" is the honest
report; it is not a claim they read nothing.

### Class B — 2 files (resolve the path; no observable content dependence)

`src/renderer/state/__tests__/classicProjectStore.test.ts`,
`test/live/s1-warp-live.test.ts`.

### Class D — 20 files (name the peer without depending on it)

`src/core/aether/__tests__/build-plan.test.ts`, `src/core/aether/__tests__/palette-push.test.ts`,
`src/core/import/__tests__/raw-grid.test.ts`, `src/core/model/__tests__/screen.test.ts`,
`src/core/project/__tests__/join-path.test.ts`, `src/core/project/__tests__/mapping.test.ts`,
`src/core/project/profiles/__tests__/s1-levelart-reservations.test.ts`,
`src/main/aether/__tests__/build-run.test.ts`, `src/main/aether/__tests__/s1-warp.test.ts`,
`src/renderer/components/art-shared/__tests__/zoom-anchor.test.ts`,
`src/renderer/components/classic/__tests__/viewport-math.test.ts`,
`src/renderer/shell/__tests__/explorer-data.test.ts`,
`src/renderer/shell/__tests__/session-storage.test.ts`,
`src/renderer/state/__tests__/aether-warp-message.test.ts`,
`src/renderer/state/__tests__/canvas-file.test.ts`, `test/main/guarded-write.test.ts`,
`test/sprite/adapters/s1-adapter.test.ts`, `test/sprite/adapters/sprite-discovery.test.ts`,
`test/support/s1-checkout.test.ts`, `test/support/sibling-root.test.ts`.

---

## THE LIVE CANARY — and it is a negative, proven rather than assumed

The dispatch named the two currently-modified art files as the live canary. **No row in
this suite changes colour when they are put back to their committed bytes.**

An empty differential is indistinguishable from a differential that never ran, so the
zero is backed twice by the instrument's own output:

```
THE PERTURBATION WAS REAL — the bytes, before believing any zero:
  artnem/GHZ Bridge.nem: live 512B sha1 4deecb560b5f -> committed 235B sha1 a4276646bd0e  DIFFER
  artnem/Signpost.nem:  live 2931B sha1 5e3336a6e57a -> committed 1147B sha1 f151d2822043  DIFFER

Reverting ONLY artnem/GHZ Bridge.nem and artnem/Signpost.nem to their committed content moved:
  NOTHING — no row changed colour.

POSITIVE CONTROL ON THAT CHANNEL — the same two paths given EACH OTHER's content
  NOTHING moved here either. So the zero above is a property of THESE TWO FILES — no row in
  this suite asserts on their content at all — rather than a differential that never ran.
```

Both files **are** named by tests — `s1-open-refusal.test.ts:82` and
`edit-art-handoff.test.ts:100,117,236` — and both of those files ARE class A. But the
rows naming them assert **linkage and path**, not decoded content
(`expect(s.s1ArtSource!.relPath).toBe('artnem/Signpost.nem')`,
`toMatchObject({ mappings: '_maps/Bridge.asm', art: 'artnem/GHZ Bridge.nem' })`), and
their `whenS1Files(...)` guards only require the files to exist. Those two files' bytes
are load-bearing for nothing.

⚠ **This corrects row 78's own text**, which states the two files are ones
"**Aurora's own tests read by absolute path**" and offers them as the evidence that the
corpus "is mutated by the suite that measures against it". The tests **name** them; no
row **asserts on their content**. The exposure class A carries is entirely real — 28
files, hundreds of rows — but *these particular edits* are not currently exercising it.
A near neighbour was probably the source of the impression: `test/sprite/s1-anim-sweep.test.ts`
has a row `Signpost.asm parses fully…`, which reads `_anim/Signpost.asm` — a different
file, and one whose content IS asserted.

---

## PHASE 2 SIZING — the cost is far smaller than row 78 assumed

Row 78 records a judgement that the corpus "**cannot be vendored**; the right shape is a
`git archive` at a pinned revision into a temp dir". **Measured, that is wrong**, and the
difference decides the parcel: `git archive` still needs the peer present, so rows built
that way SKIP when the peer is absent — they can never satisfy bar 19's corollary (a).
Vendoring can.

The 49 MB figure is the whole checkout. The set class A actually reads, at HEAD:

```
class-A dependency set at HEAD: 656 files, 2.18 MB
```

| subtree | files | size | read by |
|---|---:|---:|---|
| `startpos` | 35 | 0.1 KB | 2 files |
| `palette` | 44 | 2.7 KB | 1 file |
| `levels` | 29 | 5.6 KB | 4 files |
| `collide` | 9 | 10.8 KB | 1 file |
| `map16` | 6 | 13.2 KB | 3 files |
| `_Constants.asm` | 1 | 23.0 KB | 1 file |
| `_anim` | 49 | 31.5 KB | 5 files |
| `objpos` | 38 | 33.1 KB | 3 files |
| `artunc` | 12 | 53.9 KB | 4 files |
| `map256` | 8 | 69.2 KB | 2 files |
| `artnem` | 156 | 174.6 KB | 5 files |
| `sonic.asm` | 1 | 218.7 KB | 1 file |
| `_maps` | 132 | 237.8 KB | 12 files |
| **`_incObj`** | **136** | **1353.1 KB** | **1 file, 2 rows** |

**`_incObj` is 62% of the bytes and is read by one test file for two rows** —
`s1-sync-anims.test.ts`'s *"each consumer instruction exists where the table says it
does"* and *"no fifth consumer hides in `_incObj` (the table is complete)"*. Those are
not "does our code handle this document" questions at all; they are **currency questions
about the peer's source**, which bar 19 sends to a committed-revision check, not to a
vendored blob. A pinned copy of `_incObj` would answer them by construction and detect
nothing — the exact defect bar 19 exists for.

**So the split proposes itself:**

- **Vendor** everything except `_incObj`: **520 files, 0.83 MB.** For scale,
  `test/fixtures/` already holds 940 KB. Every one of the 28 class-A files then passes
  with the peer absent, satisfying corollary (a) outright.
- **Currency-check** `_incObj` and `sonic.asm`'s `SynchroAnimate` cross-check at a
  committed revision, in the `test/formats/aeon-fixture-currency.test.ts` shape already
  proven in this repo (names the revision, fails on drift, compares content not SHAs,
  skips loudly, prefixes `NOT AN AURORA REGRESSION`).

**Not started — this is the gate.** Phase 1 was to be reported before any conversion,
and it is reported here. Awaiting the overseer's ruling on the split above.

---

## What did NOT change

No test, source or gate file was touched. Suite before and after this branch:
**6290 passed / 8 skipped / 0 failed**, 457 files, all six `check:*` gates green plus
`check-harness-guards` and `tsc --noEmit`.

`../s1disasm` is byte-for-byte as found: HEAD `f6ece657c1cf253404312137dfcb8ec15fa42318`,
4 porcelain entries, verified programmatically after each of the 53 suite runs.
