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
