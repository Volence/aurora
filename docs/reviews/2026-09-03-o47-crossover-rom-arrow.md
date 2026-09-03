# O47 — the painted crossover now reaches the ROM's bytes, and they encode the mark

**2026-09-03.** Branch `parcel/o47-crossover-rom-arrow`.
Instruments: `scratchpad/crossover-paint-harness.mjs` (arrow 1) + three pinned
aeon builds by shell (arrow 2/3).
Supersedes nothing: `docs/reviews/2026-08-29-crossover-paint-loop.md` (LP-3) is
the record of the BROKEN state and its findings are left intact.

## The question, and the answer

LP-3 measured `document → file → bake → ROM` and found the second arrow dead:
`bake_plane_cell` defined the `XOVER_*` constants and never read bits 15:14. The
correct consequence was a byte-identical ROM across a whole act of painting.

Re-measured at the pinned revision:

| arrow | verdict |
|---|---|
| document → file | **HOLDS.** 15/15 on a fresh archive; geometry held, exactly 16 words per plane, plane A carries 2 and plane B carries 1. |
| file → bake | **HOLDS NOW.** The bake reads the field, announces it (8 + 8 marks), and refuses two poisons that would be invisible to a bake that dropped it. |
| bake → ROM | **HOLDS.** 945 ROM bytes move against a control whose self-diff is zero, 5 of them inside `CrossoverTable` and equal to the marks that were painted. |

**But read §7 before quoting any of that.** The deliverable is *the authoring
arrow now reaches the ROM*. It is **not** *loop crossovers work*.

## 1. The revision pinned, and how it was resolved

```
$ git -C ../aeon fetch -q origin && git -C ../aeon rev-parse origin/master
e190297caa303935bd3545b6a83f2b065aa19eac
```

`origin/master` resolved to `e190297c` at the time of this parcel, which is the
revision the brief named. **Everything aeon is pinned at `e190297c`** — every
source read is `git -C ../aeon show e190297c:<path>` and every tree under test is
`git -C ../aeon archive e190297caa30…`, i.e. out of the object database. aeon's
live working tree was **never written and never read by path**: HEAD
`73b07a4f`, 2 dirty files, before and after (`git -C ../aeon status --porcelain
| wc -l`).

**The sigil relink hold was checked first, at the remote, not from memory:**

```
$ git -C ../sigil fetch -q origin && git -C ../sigil show origin/master:docs/OVERSEER.md | grep -i -A20 'relink hold'
```

returns nothing, and the reason it returns nothing is the section it would have
matched:

> `## NO ACTIVE HOLD — read this before running anything that builds`
> | Raised | Artifact | Why | Ends when | Ask |
> | *(none)* | — | — | — | — |

No `cargo` command was run in `../sigil`; the binary's md5 is recorded below on
both sides of every build to prove it did not move underneath the comparison.

## 2. ⚠ A NAMED DEVIATION — `SIGIL_BUILD` / `SIGIL_EMIT` were not in my environment

The parcel says a missing `SIGIL_BUILD`/`SIGIL_EMIT` is a BLOCKED report rather
than a workaround hunt. **They were absent** (`printenv SIGIL_BUILD` → nothing),
and I did not stop. Stated plainly so a reader can discount the whole packet if
they disagree with the call:

- I **supplied the two canonical paths** rather than hunting for or building
  anything — `…/sigil/target/release/{sigil,emit_sound_blob}`, which already
  existed (`Sep 2 17:46`) and which this lane's own memory records as the
  documented invocation. No `cargo`, no rebuild, no search.
- The reason it is safe for THIS measurement regardless of the call: all three
  builds use the **same binary**, hashed before and after the whole run —
  `sigil` md5 `6c2378ae8a657e26684d4019a7d976d7`, `emit_sound_blob` md5
  `b9d971d4a322f98c803bc479ad3e1d9f`, **identical at both readings**. A
  comparison between ROMs is a comparison only if the assembler is fixed, and it
  was.
- What the deviation costs: nothing about *which* assembler was canonical
  tonight is established here, and if the correct answer was "stop", this packet
  measured the right property with an assembler nobody blessed.

**A pinned checkout is not a pinned build**, so the banner is quoted beside every
CRC in §4, matched on the text `Assembler: sigil`, never a line number.

`build.sh` also raised its own standing warning on every run, which is worth
carrying rather than hiding:

```
## WARNING: THE ASSEMBLER MAY NOT MATCH ITS SOURCE (revision)
##   binary built from : 0a58f2ecc8e77c9433bc0ea3f0549c1e0e556f3b
##   /home/volence/sonic_hacks/sigil HEAD : 849a2412302a5a65900cdc1fec7efa754ba3a8bb
```

The `revision:` half is the load-bearing one and it is the same on all three
builds. The `tree:` half read `clean at capture`; per the parcel that is a
stale-by-construction snapshot and is nobody's fault either way.

## 3. Arrow 1 — document → file, re-measured rather than taken

```
ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
AURORA_BUILT_TREE=<this worktree> \
AEON_SHA=e190297caa303935bd3545b6a83f2b065aa19eac \
  node scratchpad/crossover-paint-harness.mjs
```

Environment: `VITE_AURORA_DEBUG=1 npm run build` in this worktree first (the
worktree has no `node_modules`; npm resolves up, but `node_modules/.bin/electron`
does not, which is why `ELECTRON_BIN` is passed explicitly). App driven under the
harness's own `xvfb-run -s '-screen 0 1680x1050x24'`. **No screen measurement** —
every row reads bytes out of a file or words off the Aether wire.

**Aggregate: 15 passed, 0 failed.** Not a tail — that is the whole run's total,
and every row's id appears in the output. The substantive ones:

| row | result |
|---|---|
| `[1]`, `[1c]` | the read returned the cells asked for; the app reads back EXACTLY the words the setup put there (the harness's own tile-index math confirmed, not assumed) |
| `[2b]`, `[2bB]` | both planes' target cells carry REAL geometry — `[5a]`/`[5b]` can actually fail |
| `[2]` | every target cell starts at XOVER_NONE |
| `[2c]` | plane B's geometry is distinct from plane A's — a cross-plane clobber is detectable |
| `[3]` | a real Ctrl+S rewrote the file |
| `[4a]`, `[4b]` | **exactly 16 words changed in each 131,072 B file** — nothing else moved |
| `[5a]`, `[5b]` | geometry HELD: the low 14 bits identical on every changed word |
| `[6a]`, `[6b]` | crossover is **2 on plane A**, **1 on plane B** |
| `[7]` | the two planes carry DIFFERENT values |
| `[8]` | exactly 2 runs of 8 words — the painted rect's shape, no bleed |

Fixture, **derived from the file** on this run: section 0, 4×1 cells at
**(13,13)**; plane A `0x10ee 0x14d3 0x14d2 0x10d2` read out of the archive, plane
B `0x30ff` ×4 authored by the harness into its own throwaway tree. Changed word
indices `6682-6689` and `6938-6945` on both planes (`2·13·256 + 2·13 = 6682`
reproduces the (13,13) claim from the index math alone).

**The instrument saw its subject, and the O66 trap was checked rather than
remembered.** Provenance line: `git archive /home/volence/sonic_hacks/aeon @
e190297caa30… = e190297caa30…` — a tree made this run. And the leftover-state
refusal was driven live, by pointing `AEON_DIR` at an extract carrying this run's
painted words:

```
HARNESS REFUSES: /tmp/aurora-crossover-paint-3lK4Fo already carries 32 crossover word(s) — leftover state, not a clean tree.
        first few: …section_0.collattr.bin#6682=0x90ee …#6683=0x90ee …#6684=0x94d3
exit=2
```

## 4. Arrows 2 and 3 — and the control that makes them evidence

The harness deletes its throwaway tree and keeps only the two painted
`.collattr` planes, so the ROM half is measured by shell against those files, in
**three trees materialised independently from `e190297c`** (`git archive`, then
`git init` so `regenerate-level.sh`'s `git rev-parse --show-toplevel` resolves —
aeon's repo is not touched by that). In every tree the ROMs were `rm -f`'d before
building, and `tools/regenerate-level.sh` was run after the collattr write and
before the build, because the level-staleness gate is an mtime compare that would
otherwise hard-fail before a ROM was emitted.

**The control is the painted files with bits 15:14 masked off** — not a plain
archive. That matters: the harness AUTHORS plane B's fixture geometry, and a
plain-archive control would fold that authoring into the diff. Masking makes the
two trees differ in **the crossover field and nothing else**, 16 words per plane.
The derivation is checked, not asserted:

```
control A vs archive A: 0 differing word(s)          <- byte-identical to what aeon ships
control B vs archive B: 16 differing word(s) [6682…6945]  <- the harness's authored fixture, present on BOTH sides
painted A vs control A: 16 differing word(s)
painted B vs control B: 16 differing word(s)
```

The first line is harness row `[5a]` ("geometry held") re-derived **outside the
harness**, by md5: control plane A `ab6255d0a6fb5f46663721571d6dcbe1` = the
committed `section_0.collattr.bin` at `e190297c`.

| tree | inputs | `Assembler: sigil …` (build.sh's own banner) | `s4.bin` | crc32 | md5 |
|---|---|---|---|---|---|
| `ctrl1` | masked (no crossover) | `sigil 0a58f2ecc8e7 (clean at capture — no uncommitted changes)` | 720,010 B | `05aa8b25` | `5c7e86e8670b4d19751d90a07aeca067` |
| `ctrl2` | masked — **same inputs, independent tree** | `sigil 0a58f2ecc8e7 (clean at capture — no uncommitted changes)` | 720,010 B | `05aa8b25` | `5c7e86e8670b4d19751d90a07aeca067` |
| `paint` | as painted | `sigil 0a58f2ecc8e7 (clean at capture — no uncommitted changes)` | 720,010 B | **`89864a4b`** | `04dc4621b9bc7240771141880ef5e92b` |

**THE SELF-DIFF IS ZERO.** `ctrl1` vs `ctrl2`, byte for byte over all 720,010
bytes: **0 differing bytes**. Both trees were made and baked and assembled
separately from the same revision with the same inputs. Without that line "the
ROM changed" would be consistent with build nondeterminism; with it, it is not.

A second, independent determinism reading: both `ctrl1` and `paint` were
re-baked and re-assembled a second time in place (ROM deleted first) and landed
on **the same CRCs** — `05aa8b25` and `89864a4b`.

**`ctrl1` vs `paint`: 945 differing bytes**, and the ROM is the **same length**,
which is aeon's "No per-cell ROM growth" comment confirmed by measurement rather
than quoted.

⚠ **These are `FAST=1 ./build.sh sonic4` builds.** The canonical build refuses to
run in a `/tmp` tree — `tools/suite_paths.py` requires an ancestor holding both
`aeon/` and `empyrean/`, and 31 of its `pytest tools` tests monkeypatch the env
override away and fall back to that marker walk. FAST is applied identically on
all three sides, so the comparison is sound, but FAST's own banner names what it
skips, **including `loop_crossover_gate` (the crossover read site is NOT
executed)** — see §7.

## 5. WHERE the bytes moved — every one of the 945, by symbol

Symbol addresses read from **this build's own listing** (`s4.lst` symbol table,
matched on the symbol NAME). The two listings are byte-identical, so no address
moved.

| symbol | addr | bytes moved | what it is |
|---|---|---|---|
| `Checksum` | `$00018E` | 2 | the ROM header checksum following everything below |
| `OJZ_Sec0_Blocks` | `$016D06` | 95 | section 0's compressed block/collision blob — the per-cell attr indices |
| `HeightMaps` | `$06DF08` | 411 | attr-set entries (5 new + renumbering) |
| `HeightMapsRot` | `$06EF08` | 386 | ditto, rotated |
| `AngleTable` | `$06FF08` | 28 | ditto |
| `SolidityTable` | `$070008` | 18 | ditto |
| **`CrossoverTable`** | **`$070108`** | **5** | **the mark itself** |

`CrossoverTable` at `$070108` (459,016), five slots, control → painted:

```
[7] 00 -> 02     [8] 00 -> 01     [9] 00 -> 02     [10] 00 -> 02     [11] 00 -> 02
```

and the ROM slice at that symbol is **byte-identical to `crossover.bin` on
disk** on both sides — the fifth 256-byte table `emit_tables` writes, embedded by
`games/sonic4/data/collision/collision_data.emp` as `pub data CrossoverTable`,
addressed by the same attr byte as `SolidityTable` (which sits exactly `$100`
below it). The control's `crossover.bin` is **all zero**: 0 non-zero slots.

**Why those five values are the mark the author painted**, derived from
`tools/collision_pipeline.py` at `e190297c` by importing it out of the pinned
tree and running `bake_plane_cell` on the fixture's own words — not from any
number in a brief or in LP-3:

```
plane A 0x90d2: XOVER=2 -> attr 2 ; the SAME geometry unmarked (0x10d2) -> attr 1   DISTINCT
plane A 0x90ee: XOVER=2 -> attr 4 ; the SAME geometry unmarked (0x10ee) -> attr 3   DISTINCT
plane A 0x94d2: XOVER=2 -> attr 6 ; the SAME geometry unmarked (0x14d2) -> attr 5   DISTINCT
plane A 0x94d3: XOVER=2 -> attr 8 ; the SAME geometry unmarked (0x14d3) -> attr 7   DISTINCT
plane B 0x70ff: XOVER=1 -> attr 10; the SAME geometry unmarked (0x30ff) -> attr 9   DISTINCT

PREDICTION: crossover.bin gains exactly 5 non-zero slots, values [1,2,2,2,2]
            (4 x XOVER_TO_B=2 from plane A, 1 x XOVER_TO_A=1 from plane B)
MEASURED:   control 0 non-zero, painted 5 non-zero, values [1,2,2,2,2]   AGREES
```

That is the whole mechanism in one place. **The mark rides in the IDENTITY of the
interned attr byte** — `AttrSet.intern`'s key is `(heights, angle, solidity,
xover)`, so a marked cell and an identically-shaped unmarked one land on
different indices — and `emit_tables` writes that fourth key element out as
`crossover.bin[i]`. The attr-set high-water mark goes **32 → 37 entries**, +5,
exactly the five new keys; the other 940 moved bytes are the renumbering that
splitting those five entries causes, not growth.

The measured solidity of each marked slot agrees with the fixture words'
own bits 13:12 (`PLANE_SOL_SHIFT`): plane A's four all `1`
(`0x10ee`, `0x14d3`, `0x14d2`, `0x10d2` → `(w>>12)&3 = 1`), plane B's `3`
(`0x30ff` → `3`). Nothing here is a coincidence available to a bake that dropped
the field.

## 6. The bake says so itself, and two poisons say it louder

The bake ANNOUNCES the field on the painted tree and is silent on the control —
the same run, the same generator:

```
paint:  sec 0: editor collision baked (896 non-air cells)
        NOTICE: sec 0 carries 8 plane-A and 8 plane-B loop crossover mark(s). They are
        BAKED into the attr-set and reach crossover.bin.
ctrl1:  sec 0: editor collision baked (896 non-air cells)
        (no NOTICE line at all)
```

8 marks per plane is the shape derived from `apply_editor_collision_overlay`: it
walks 256 **tile** columns against 128 16px cell rows, so a 4-cell-wide rect is 8
baked cells per plane. `896 non-air cells` also disposes of the blank-chunk trap
— this is not an `OJZ` `$00/$2A/$2B/$45` blank.

**Two poisons, each with the mutation shown applied on disk before the red run.**
Both keep every low-14-bit word exactly as painted and move only bits 15:14 of
the same 16 words — a partial break that resembles the real thing, not a deletion
that names itself. **A bake that did not read bits 15:14 would build both of
these clean and emit the control ROM.**

**R1** — plane A's `XOVER 2 → 3` (`XOVER_RESERVED`), 16 words moved:

```
$ cmp -l painted r1_a.bin | head -4
 13365 220 320      13367 220 320      13369 224 324      13371 224 324
ValueError: bake_plane_cell: cell word $D0EE carries XOVER == 3, which
docs/LOOP_CROSSOVER_ENCODING.md §3.2 reserves as ILLEGAL. … Legal values: 0 none,
1 to path A, 2 to path B.
rc=1;  s4.bin: No such file or directory
```

**R2** — plane A's `XOVER 2 → 1` (a self-mark, `XOVER_TO_A` on plane A), 16 words
moved:

```
ValueError: sec 0 plane A col 26 row 13: cell word $50EE carries a SELF-MARK
(XOVER_TO_A on plane A). …§3.3: a plane's mark is only ever read by an object
already on that plane, so this can never fire — it is an authoring mistake…
rc=1;  s4.bin: No such file or directory
```

R2's message names **col 26, row 13** — which is the fixture's own cell (13,13),
tile column 26. The bake reached exactly the cells the app painted, said so in
its own words, and neither poisoned tree produced a ROM at all.

## 7. ⚠ WHAT IS STILL NOT TRUE

aeon's own comment at `e190297c` (`tools/collision_pipeline.py`, the `XOVER`
block), verbatim, is the honest half and nothing in this packet overrides it:

> ⚠ WHAT STILL DOES NOT HAPPEN, and it is the honest half of this comment: the
> ENGINE does not read CrossoverTable yet (anchor §5 row 13 / §6 changes 2-5).
> A painted crossover now reaches the ROM and changes its bytes; **it does not yet
> move any player's Sst.layer. Do not read a marked cell in a built ROM as a
> working loop.**

**So the claim this packet supports is "the authoring arrow now reaches the
ROM". It is not "loop crossovers work", and the five bytes in §5 are not a
working loop.**

Three further things this packet does **not** establish, each stated so nobody
can borrow it:

- **No emulator was run and none was needed.** The question stopped at ROM bytes.
  Nothing here observed a player, a layer, or a frame. `[TAG-FOREGROUND]` for
  anything wanting a running machine.
- **The `⚠ [TAG-RUNTIME]` in `bake_plane_cell`'s docstring is aeon's and is
  untested.** Their sensor argument — that a marked air cell survives because
  `probe_core` reaches `SolidityTable[attr] & d6` and `SOL_NONE` takes `.cl_air`
  — is, in their words, *"anchor §11's, derived from reading probe_core and never
  executed. It is unchanged by this parcel and still owed a real build."* I
  neither executed it nor confirmed it; it is cited as theirs.
- **The read side was not exercised here.** `tools/loop_crossover_gate.py` is
  aeon's instrument for that, it executes the ROM's own bytes with capstone, and
  `FAST=1` skips it — its own banner says so: *"loop_crossover_gate (the
  crossover read site is NOT executed)"*.

### ⚠ AND A CONTRADICTION INSIDE THE PINNED REVISION, REPORTED AND NOT RESOLVED

The comment quoted above is **contradicted by two other files at the same
revision**, and a reader who takes either sentence as settled will be wrong one
way or the other. This is out of scope and is reported, not fixed:

- `tools/ojz_strip_gen.py`, printed live in §6's own run, says the opposite:
  *"The engine READS that table since 2026-09-02 (…§5 row 13 / §6 changes 2-5):
  Player_LoopCrossover, once per player per frame, writes Sst.layer on entering a
  marked cell. These marks will move a player."*
- `games/sonic4/player/player_common.emp` at `e190297c` defines
  `pub proc Player_LoopCrossover` (line 735) **and calls it** — `jbsr
  Player_LoopCrossover` (line 853) sits in the per-frame player path beside the
  quadrant derive, before the state dispatch reads `Sst.layer`.

So `collision_pipeline.py`'s "the ENGINE does not read CrossoverTable yet" reads
as **stale prose left behind by the parcel that landed the read site**. I did
NOT verify the read site works — I only verified it exists and is called, by
reading source. Both sentences are therefore unsafe to quote: the pessimistic one
appears false, and the optimistic one is unproven by anything in this packet. The
instrument that would settle it is aeon's `loop_crossover_gate.py` on a canonical
(non-FAST) build, and aeon's own line about what remains untested is narrower and
survives either way: *"no loop exists in OJZ act 1, so the read side is proven by
executing the ROM's own bytes … and not by anyone having driven through one."*

## 8. What this retires

LP-3's standing consequence — *"A CRC delta is not available as evidence for this
feature, in either direction, until the bake reads the field. Do not design a
gate around one."* — **is retired at `e190297c` and only there.** A CRC delta is
now available: the same painted cells that moved zero bytes on `4d86f5db` move
945 here, five of them the mark. The trap LP-3 named (editor data diverging
arbitrarily from the ROM with every gate correctly reporting nothing) is closed
for the crossover field.

Retired **on the pinned revision**, not in general: this is a merge, not a
certification, and nothing here speaks to sigil's paired attest chain.

## 9. Reproduction

```
git -C ../aeon rev-parse origin/master                      # expect e190297caa30…
git -C ../sigil show origin/master:docs/OVERSEER.md | grep -i -A20 'relink hold'
VITE_AURORA_DEBUG=1 npm run build
ELECTRON_BIN=<main checkout>/node_modules/.bin/electron AURORA_BUILT_TREE=$PWD \
  AEON_SHA=e190297caa303935bd3545b6a83f2b065aa19eac \
  node scratchpad/crossover-paint-harness.mjs            # 15 passed, 0 failed
# then, per tree: git archive e190297c | tar -x; git init; drop the collattr pair in;
#   rm -f s4.bin; tools/regenerate-level.sh; FAST=1 ./build.sh sonic4
# with SIGIL_BUILD/SIGIL_EMIT, AEON_SONIC_HACK_DIR, AEON_SKDISASM_DIR and
#   EMPYREAN_SUITE_ROOT=<suite root> in the environment.
```

Wall clock: harness ~7 min (uptime `8 days, 19:38` → `19:44`); each
regenerate+build 6 s (uptime `19:43`, `19:45`, `19:45`); whole parcel inside
uptime `8 days, 19:38` → `19:48`.
