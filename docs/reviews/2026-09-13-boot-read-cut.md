# Boot-read cut: `docs/OVERSEER.md` to about 40 KB, by when a rule is read

**Go:** the owner, verbatim at empyrean `492a2ac` `docs/OVERSEER.md` line 79 (2026-09-13T21:53:38Z):
*"cut sounds good."* It answered the hub's proposal (same file, line 81) that each lane cuts its own
`OVERSEER.md` to about 40 KB. **Method:** his 2026-09-04 ruling: split by when a rule is read, never
by size, nothing reworded, proven lossless. **Models:** aurora `f47c07f3` (the review-bars split) and
empyrean `origin/main:docs/2026-09-13-protocol-cut-plan.md` steps 1-4.

Base: `300085ea` (the branch's merge-base with master). The 15 declared-new lines and both proof outputs are
tracked under `docs/captures/2026-09-13-boot-read-cut/`: to re-run the proof, check out `2b632321` and pass
`docs/captures/2026-09-13-boot-read-cut/new-lines.md` as `--new` (the transcripts below name the scratch copy it came from).

| Commit | Purpose |
|---|---|
| `2b632321` | the split alone: three sections moved whole to `docs/OVERSEER-REFERENCE.md`, stubs and index in the boot file |
| `a2dff91b` | cross-reference repair, by name, after the proof |
| `9637ce86` | one sentence banking the owner's go in "This file is bounded" |

## Sections before (bytes at `300085ea`, `LC_ALL=C awk` over `## ` headings, each including its trailing blank line)

| Section | Bytes | Where |
|---|---:|---|
| preamble (lines 1-11) | 457 | kept |
| `## ⚠ Read the shared protocol at a COMMITTED REVISION…` | 2,449 | kept |
| `## ⚠ Boot also reads the OWNER'S STANDING DIRECTIVES…` | 2,748 | kept |
| `## The queue` (with "This file is bounded") | 5,451 | kept |
| `## Owner state…` (with its four subsections) | 12,880 | kept |
| `## What the overseer implements` | 276 | kept |
| `## Aurora-specific review bars → …` | 1,107 | kept (pointer) |
| `## Editor↔engine coordination points` | **25,068** | **moved**: read before any Aether/bus/emulator work, any aeon build, or a brief touching those |
| `## How a landing goes, and the gap it exists to close` | **5,844** | **moved**: read before merging or landing anything |
| `## Instruments` | **21,509** | **moved**: read before running or dispatching any CDP harness, rig or emulator work |
| `## Quirks` | 6,241 | kept |
| `## ⚠ A CROSS-REPO GREP IS SCOPED…` | 1,999 | kept |
| `## Decision closures made before rule 8d` | 379 | kept (the file has no final newline, so awk over-counts this row by 1) |

⚠ **The brief's figures (24,891 / 5,812 / 21,344) were CHARACTER counts**: `awk length()` under a UTF-8 locale.
The bytes are above. The reference body is `cmp`-identical to base lines 312-747, which is 52,420 B.

## After (`wc -c`)

| File | At base | After the split (`2b632321`) | At tip (`9637ce86`) |
|---|---:|---:|---:|
| `docs/OVERSEER.md` | 86,407 | 35,331 | 35,652 |
| `docs/OVERSEER-REFERENCE.md` | (none) | 52,794 | 52,890 |

The boot file lands under the ~40 KB target without trimming anything.

## Proof (oracle `tools/prove_doc_split.py`, run from this worktree by absolute path)

Original non-blank lines, derived independently: `git show 300085ea:docs/OVERSEER.md | grep -c .` gives **737**.

**Control, on the unmodified base tree, before any edit:**

```
python3 /home/volence/sonic_hacks/oracle/tools/prove_doc_split.py --original 300085ea:docs/OVERSEER.md --output docs/OVERSEER.md --no-new --headings --repo .
  original : git 300085ea:docs/OVERSEER.md   (read from git tree /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ade3dc000f6e264b9)
  original non-blank lines            : 737
  1a ORIGINAL lines ABSENT after split: 0
  1b lines present but NOT DECLARED   : 0
  1c declared NEW but already present : 0
  [heading-aware] flagged in original: 1    seams INTRODUCED by the split: 0    file-edge cuts: 0  <= GATE
  [heading-blind] flagged in original: 19   seams INTRODUCED by the split: 0    file-edge cuts: 0
VERDICT: PROVED - the split is lossless by all three proofs
CONTROL exit=0
```

**Real run, on the split's tree (`2b632321`), declaring only the two files this cut writes:**

```
python3 /home/volence/sonic_hacks/oracle/tools/prove_doc_split.py --original 300085ea:docs/OVERSEER.md --output docs/OVERSEER.md --output docs/OVERSEER-REFERENCE.md --new .boot-cut-scratch/new-lines.md --headings --repo .
  original non-blank lines            : 737
  OVERSEER.md           non-blank lines : 336
  OVERSEER-REFERENCE.md non-blank lines : 416
  declared NEW non-blank lines        : 15
  outputs - new  (must == original)   : 737
  1a ORIGINAL lines ABSENT after split: 0
  1b lines present but NOT DECLARED   : 0
  1c declared NEW but already present : 0
      RESULT: PASS - every original line sits in exactly one
        OVERSEER.md           holds 324 original line(s) + 12 declared-new
        OVERSEER-REFERENCE.md holds 413 original line(s) + 3 declared-new
  original tokens                     : 13632
  outputs - new  (must == original)   : 13632
  tokens LOST                         : 0
  tokens GAINED undeclared            : 0
  [heading-aware] flagged in original: 1    seams INTRODUCED by the split: 0    file-edge cuts: 0  <= GATE
  [heading-blind] flagged in original: 19   seams INTRODUCED by the split: 5    file-edge cuts: 0
  derived cut points: 3   failing the predicate: 0
PROOF 3 seams introduced: heading-aware 0 / heading-blind 5 (edge cuts 0 / 0) -- heading-aware GATED (--headings: a heading is a title, not a torn sentence)
VERDICT: PROVED - the split is lossless by all three proofs
REAL exit=0
```

**The 15 declared-new lines** are the reference title and its two header lines, the index heading, its intro line and four bullets, and the three stub headings with their three pointer lines. **The stub headings have to be declared.** The tool counts any line that appears more often across the outputs than in the original as an extra (`extra = cn - co`, then `unexplained = extra - declared`). A heading kept in the boot file AND present in the reference is such a line, so leaving the three out would make 1b read 3 and exit 1.

**Both PROOF 3 counts read.** The gate (heading-aware) is 0. The heading-blind figure is 5, and the gated run does not itemise it, so it was itemised with a diagnostic run without `--headings` (same inputs; exit 1 by design, since that mode holds every heading to the sentence predicate). All five seams have a heading the split ADDED on the left and a line the split ADDED on the right:

```
before: '## Read at a specific moment → `docs/OVERSEER-REFERENCE.md` and `docs/OVERSEER-REVIEW-BARS.md`'   after: 'None of these is read at boot. …'
before: '## Editor↔engine coordination points'                    after: 'Moved whole to `docs/OVERSEER-REFERENCE.md` (same heading); read it before any Aether/bus/emulator work, …'
before: '## How a landing goes, and the gap it exists to close'   after: 'Moved whole to … read it before merging or landing anything.'
before: '## Instruments'                                          after: 'Moved whole to … read it before running or dispatching any CDP harness, rig or emulator work.'
before: '# Aurora Overseer — reference sections, read at a specific moment'   after: 'Three sections moved whole and byte-identical …'
```

None of the five touches original prose. `docs/OVERSEER-LOG.md` and `docs/OVERSEER-REVIEW-BARS.md` were NOT declared as outputs: they hold lines moved by earlier cuts and would produce the vacuous red the protocol warns about.

## Cross-reference sweep (`a2dff91b`, after the proof)

**Searched:** in the base file split at the cut, every `above`, `below`, `this file`, `this section`, `sections up/down` and bare `bar N` inside the moved range (base lines 312-747); every `above`/`below`/`harness`/section name in the kept range; the reference file for the names of the kept sections; `docs/OVERSEER-REVIEW-BARS.md` and the non-history docs for the moved sections' names; and `scripts/`, `test/`, `src/`, `scratchpad/` and `package.json` for `docs/OVERSEER.md`.

**Changed (repointed by name, never by direction):**
- boot to moved: "What the overseer implements" said the foreground harnesses are "(below — agents cannot)". It now names "Instruments" in `docs/OVERSEER-REFERENCE.md`.
- moved to boot: "the mechanism behind this file's bar 18b". "This file" is now the reference file, which holds no bars, so it now names `docs/OVERSEER-REVIEW-BARS.md` bar 18b.
- moved to boot, bare numbers: "bar 5" and "Bar 2d cause (ii)" were resolved by the boot file's rule for reading bar citations, which a reader of the reference file does not have loaded. One sentence in the reference header now says a bare "bar N" there names `docs/OVERSEER-REVIEW-BARS.md` bar N. The row text is untouched.

**Checked and left:**
- Every other `above`/`below` in the moved text resolves inside its own section or inside the reference file, including "see the row above" in the Emulators row, which still sits below the REFUTED banner row there.
- "This file" at reference lines 29 and 33 describes the coordination list, which moved with it.
- Every `above`/`below` in the kept text resolves inside the boot file.
- The preamble advertises no moved section.

**Live pointers outside docs: none point at a moved section.**
- The only printed message citing `docs/OVERSEER.md` (`scratchpad/bganim-ui-authored-composition-harness.mjs:145,156`) cites review bar 19, which did not move.
- The bganim Python docstrings are never printed: none of the three files uses `__doc__` or argparse `description=`.

**History left as written (code comments citing `docs/OVERSEER.md` for text now in the reference file; each still lands on a stub that names where the text went):**
- `scratchpad/band-trunk-demo.mjs:23` (§Instruments)
- `scratchpad/effects-column-harness.mjs:117`
- `scratchpad/palette-drag-harness.mjs:62`
- `scratchpad/palette-grid-harness.mjs:62`
- `scratchpad/mapviewport-baseline-harness.mjs:226`
- `scratchpad/lib/run-root.mjs:147`
- `test/support/run-root.test.ts:347`
- the socket-chain-arbiter comments in `src/` (`agent-handler.ts:1718`, `busStore.ts:22`, `AetherStatus.tsx:22,40`, `aetherStore.ts:59`, `client.ts:424`, `ipc-types.ts:178`, and three tests)
- the three bganim Python docstrings

## Left open

- The "This file is bounded" subsection now carries both "target ~100 KB" (the shared protocol's bound, still 100,000 B at empyrean `origin/main`) and the owner's go for about 40 KB. Only the latter was added; aligning the older sentence is rule text and is not this parcel's call.
- Other repos' citations of aurora's moved sections were not swept. That work is cross-repo, and the stubs catch them anyway.
