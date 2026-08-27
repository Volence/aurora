# A pinned aeon checkout stopped reproducing its own ROM, with a clean tree

**aurora, 2026-08-27.** Found while doing the ROM half of ROADMAP row 51. Recorded because
it silently invalidates the "build the pin and measure" method this lane uses constantly,
and because the tell is one nobody would look for: **`git status` says clean the whole time.**

## What happened, in order

1. `scratchpad/fixtures/aeon-build-pin`, tracked tree clean, built to **`crc=4b4f1b5b`**,
   `len=718999`. Verified byte-identical to the `s4.bin` that shipped with the checkout, by
   reconstructing the exact image I had been measuring against and comparing (`IDENTICAL`).
2. I edited `editor_bg_override.json` (a regenerated band), which put the level tree on the
   staleness gate's **input** side, so the next build ran a **re-bake**. Built to `f6f41a67`.
3. I restored the override, and the two files the re-bake had modified
   (`DONOR_PROVENANCE.json`, `project.json`), with `git checkout`. **Tree clean, 0 modified.**
4. It now builds to **`f33b157e`** — three consecutive times, including via the
   no-re-bake path, so it is deterministic. **It never returns to `4b4f1b5b`.**

Difference between the two ROMs: **1,273 bytes**, first at **`0x18E`** — the Genesis header
checksum, which follows from everything else — and last at `0x291DE`, a span covering the
band data region.

## Where the drift lives, and why the tree cannot show it

Every tracked candidate is clean and byte-identical to the pin, including the injector's own
outputs, which the re-bake **reproduced exactly**:

| file | tracked | after re-bake |
|---|---|---|
| `generated/ojz/act1/bg_tiles.bin` | yes | clean |
| `generated/ojz/act1/bg_anim_banks.bin` | yes | clean |
| `generated/ojz/act1/zone_bg.bin` | yes | clean |
| `generated/ojz/act1/bg_anim.emp` | yes | clean |
| `data/collision/*` (9 files) | yes | clean |

The drift is in **gitignored build inputs that every build regenerates**:
`engine/debug/generated/` (`s4lz_dict.bin`, `s4lz_dict_blob.bin`, `zx0.bin`,
`compression_vectors.emp`) and `engine/sound/generated/`.

**The coherent reading: the checkout SHIPPED a set of these artifacts that is not what the
current tools regenerate.** The first build consumed the shipped set; every build since has
consumed a regenerated set. That is why it is deterministic *now* and still cannot return to
the CRC it started at — the shipped artifacts were overwritten the first time anything
regenerated them, and being ignored, nothing in git can restore them.

A drifting compression dictionary also explains the *shape* of the diff: 1,273 scattered
bytes over a 168 KB span is what re-packing the same content against a different dictionary
looks like, rather than a content change.

## Why this is worth a document rather than a shrug

**Every "build the pin and measure" result carries an unstated assumption that the pin still
builds to the pin, and nothing checks it.** `git status` is clean, the tracked tree is
byte-perfect, the build succeeds, the ROM is a plausible size — and it is a different ROM.
This is the same family as a stale binary answering a source-derived question: the artifact
disagrees with the tree and only the artifact is authoritative.

**No measurement taken tonight is invalidated**, and that is checkable rather than asserted:
the band-lens and `rate_shift` work verified byte-identity against the image actually loaded
at the time, and the regenerated-band experiment built and measured its own ROM within one
build cycle. But a *later* session comparing its build against tonight's CRCs would have
found a mismatch with no cause visible anywhere in the tree.

## Cheap defence, adopted here

**Record the CRC a fixture produces on its FIRST build of a session, before touching
anything**, and treat a later mismatch as a build-input question rather than a content one.
The one-line version: a pinned tree is not a pinned build unless the ignored generated inputs
are pinned too.

Reported to the aeon lane; the artifacts and the generator are theirs.

---

# ⚠ CORRECTION, 2026-08-27 — THE CENTRAL PREMISE ABOVE IS FALSE, AND THE REAL CAUSE IS THE UNPINNED TOOLCHAIN

Everything above from *"The coherent reading"* onward rests on one sentence — **"the checkout
SHIPPED a set of these artifacts"** — and that sentence is **wrong**. It is kept, unedited,
because it is the worked example: the aeon lane read this packet, accepted the premise, and
built a careful and entirely inapplicable explanation on top of it (`cp -r` fixture
construction carrying stale ignored files). **Neither lane cited a line for the premise.
Two commands settle it, and neither of us ran either** — this repo's bar 2f, committed by
its own author two days after writing it down.

## What the artifacts actually say

- **The fixture is a `git clone`, not a copy.** Its reflog:
  `clone: from /home/volence/sonic_hacks/aeon` at `2026-08-27 00:55:58 -0400`, `origin` set.
- **The pinned commit tracks none of it.** `git ls-tree -r dcc692d1` has **no `s4.bin`** and
  **no `engine/debug/generated/` or `engine/sound/generated/`**. A clone cannot carry ignored
  files, so **nothing shipped with this checkout.** Every one of those 25 files was produced
  in place — mtimes `03:35:31/32`, two minutes before this packet was committed.
- **The persistent cache is not the varying input either.** `tools/.cache/blockgen/` (content
  addressed) and `tools/.cache/blockmemo/*.memo` were written at `00:58:17-18` on the first
  build and **never rewritten**, while `generated/` was rewritten every build.

**Consequence for the fix that was offered: `git worktree add --detach` buys nothing here.**
The recommendation was to build fixtures as worktrees rather than copies, on the reasoning
that a worktree cannot carry ignored files. True, and it is the property this fixture
**already had**. A `cp -r` pin has this hazard; that is not the hazard that bit.

## What is actually unpinned: the assembler

`build.sh` in the pinned tree takes **two binaries from the environment**, neither of which
the checkout pins, both of which live in the **sigil lane's live working tree**:

- `SIGIL_EMIT` (`:317`) — `--aeon . --out-dir engine/sound/generated`, i.e. it *writes* one of
  the two drifting directories outright.
- `SIGIL_BUILD` (`:558`) — the assembler itself.

**Both were rewritten inside my build window:**

| binary | mtime | my builds |
|---|---|---|
| `sigil/target/release/emit_sound_blob` | `2026-08-27 01:41:19` | build #1 `4b4f1b5b` ≈ 00:58 |
| `sigil/target/release/sigil` | `2026-08-27 03:14:00` | later builds `f33b157e` ≈ 03:35 |

A pinned tracked tree, a clean `git status`, and a toolchain that moved twice underneath it.
That is deterministic-now and cannot-return, with no cause visible anywhere in the tree —
which is the whole phenomenon, without needing a drifting dictionary to explain it.

**The pinned tree already knew.** `build.sh:245-256` documents this exact class from a prior
incident — *"the shared `target/release/sigil` sat three days behind while aeon builds invoked
it, and nothing in the pipeline was capable of noticing"* — and prints an
`Assembler: sigil <rev>` banner for it. **My builds did not capture that banner**, which is
the only reason this took measurement instead of a `grep`.

## Stated honestly, because the packet above was not

**An mtime proves the binary was rewritten, not that its behaviour changed** — a rebuild can
be byte-identical. I cannot close it the clean way (rebuild with the 00:58 vintage and watch
`4b4f1b5b` return) because that binary no longer exists. So: the alternatives are eliminated
(tracked tree byte-identical, cache stable, generated dirs written by an external binary that
demonstrably moved), and the positive confirmation is **not** in hand. The dictionary
hypothesis is neither confirmed nor needed.

## What this does to the aeon lane's experiment

Their fresh-worktree test is sound and answers a **different question**: *does regeneration
reproduce, from empty, with today's tools?* Their worktree and their main tree were built
**at the same moment with the same binaries**, so the comparison holds the varying quantity
fixed by construction. It cannot detect an input that varies **over time**, which is the one
that bit. Their green result and my drift are fully compatible, and the finding is **not**
closed as fixture construction.

## The defence, replacing the one above

The first-build-CRC rule still detects, but it does not explain, and it costs a build. Better,
and free: **capture `build.sh`'s own `Assembler: sigil <rev>` banner with every recorded CRC**,
and treat a CRC comparison across sessions as meaningless unless both sides carry the same
assembler revision. The banner already exists; nothing needed building. **A pinned tree is not
a pinned build, and the unpinned part is the toolchain, not the ignored artifacts.**

Re-sent to the aeon lane; sigil's binary is the varying input, so that lane is named too.
