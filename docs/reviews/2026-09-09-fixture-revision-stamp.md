# Fixture provenance: making a run say which peer revision decided it

Parcel `parcel/fixture-revision-stamp`, 2026-09-09. Lens ledger row
FIXTURE-REVISION-UNSTAMPED: *"No harness records which revision of a sibling
repo it ran against, so a stale fixture is indistinguishable from a fresh one."*

## The row is real, but it was pointed one layer off

The brief expected the gap to be in how fixtures are ACQUIRED, and named three
mechanisms as a guess: fresh clones, `mkdtemp` copies, direct reads. The tree
has a different set, and the acquisition side is in far better shape than the
row implies.

There are no fresh clones anywhere in this repo. `test/support/peer-repo.ts`
already reads peers through git plumbing at a named revision and distinguishes
"could not measure" from "measured, and it is not there".
`test/support/sibling-root.mjs` is already the one derivation of where peers
live. Several harnesses already materialise a peer with
`git -C <peer> archive <SHA> | tar -x` into a `mkdtemp` and never open the
working tree, and `scratchpad/crossover-paint-harness.mjs` already prints a
provenance string, including the honest `revision unverifiable` branch for a
plain extract with no `.git`.

What was missing is the REPORTING side. Nothing a run PRINTS said which revision
it consumed. The two runs the row describes, one against a three week old copy
and one against today's tip, produced identical output.

## The census

Counted by `scratchpad/peer-fixture-acquisition-census.mjs`, which prints its
own timestamp; re-run it rather than quoting these figures. Run of
2026-09-09T08:28Z, 293 files under `src/`, `test/`, `scripts/`, `scratchpad/`
that name a peer in code, comments stripped:

| group | files | what it means |
|---|---|---|
| `objects` | 47 | bytes come from the object database at a revision (`git archive`, `git show <rev>:<path>`, `readAtRev`). A revision DOES name them. |
| `revparse` | 10 | resolves a revision without reading content by it: the resolver, the currency gates, the path checkers. |
| `worktree` | 180 | names a peer, reads bytes, never goes through git. **The row's real population.** |
| `names-only` | 56 | names a peer and reads nothing by it. |

The census is a regex over source and says nothing about whether a row's colour
depends on those bytes. That question has a real instrument and it is a
differential, not a grep: `scripts/classify-peer-tree-reads.mjs`.

The 180 is where a stale fixture is genuinely invisible. Nothing a revision
names was read, so there is nothing to compare a later run against.

## What landed

`scratchpad/lib/fixture-provenance.mjs`, gated by
`test/support/fixture-provenance.test.ts` (21 rows, `vitest run` inside
`npm test`).

A record is an ordered list of CLAIMS, each with a `label`, a `value`, a
`tracks` sentence saying what the value follows and what it may not be read as
saying, and its own `at`. Nothing renders a fused string: this suite has been
burned by a banner whose `revision:` followed git refs while its dirty marker
followed a build, in one line, with nothing saying so.

The caller must declare a MODE, because the mode is what decides what the
revision means:

- `committed`: the bytes came from the object database. The revision names them.
  The peer's dirty state is informational and is labelled as NOT being in the
  fixture.
- `worktree`: the bytes came off disk. The revision names the BASE only, and the
  rendering says so in words. A `ref` passed in this mode is refused, because a
  ref printed beside working-tree bytes reads as a claim they came from it.

Unknown is loud. No path renders "could not determine" as blank, zero or an
omitted field. Unmeasurable claims throw unless accepted by their own named
allowance, and then render `UNKNOWN: <why>` under a banner. A ref git cannot
resolve throws even with every allowance set: that is a question asked and
unanswered, not a gap.

The dirty read uses `--no-optional-locks`, so it does not take `.git/index.lock`
in another lane's live checkout.

## Converted, and not

Three, one per mechanism, so the pattern is demonstrated rather than asserted:

- `test/formats/bg-anim-band-axis-aeon-gate.test.ts` (`objects`, pinned SHA)
- `src/core/formats/effects/__tests__/section-wiring.test.ts` (`worktree`)
- `scratchpad/f7-frame-09-harness.mjs` (`objects`, `git show`), which runs
  without Electron and was executed here.

**290 of 293 are unconverted.** That is deliberate and it is a gap, not a
finish. The follow-up below is what closes it.

## What the stamps measured while being written

This is the row restated as an observation. During one session aeon's checkout
was DIRTY with 33 uncommitted paths, and its HEAD moved three times
(`37e543c2`, `944c5cc0`, with `origin/master` at `65bb5af9` differing from
both). The 180 files in the `worktree` group are reading a moving target, and
until now said nothing about it.

## Follow-up, stated rather than left silent

A DERIVED RULE over the `worktree` group: a file that resolves a peer path and
reads bytes under it must either announce its fixture provenance or say why it
does not. It is not written here for one reason worth recording: the
`worktree` group is 180 files, a rule that fires on all of them at once is a
rule the next lane disables, and the honest sequencing is to convert in batches
and let the gate follow the conversion rather than lead it.

Two smaller pieces are also open:

1. Nothing yet asserts that a stamp's declared MODE matches how the file
   actually reads. A file could declare `committed` while calling
   `readFileSync` under the peer path. The plant that proves the row catches a
   misdeclaration is in `section-wiring.test.ts`'s history, but only for that
   one file.
2. The `names-only` group (56) has not been read one by one. Some of those are
   comments and helper modules; whether any of them is a fixture read the regex
   missed is unmeasured.
