# A vertical band authored in Aurora steps vertically in the running ROM

Closes the runtime half of EFFECTS-W1 DoD **item 8** on Aurora's side. The editor half
landed at aurora `1ed3b32a`; this is the evidence that what it writes reaches the machine.

## What was proven, and by which instrument

Four links, each measured separately, because a single green at the end would not say
which of them held.

**1 — Authored through Aurora's own codec, not hand-written JSON.**
`scratchpad/author-vertical-band.vitest-script.ts` parses the act's real
`editor_bg_override.json` with `parseBgOverride`, flips band 0 to `axis: "vertical"`,
regenerates its eight phase banks with `shiftedPhaseBanks`, and writes back through
`serializeBgOverride`. Hand-writing the JSON would walk around the exact seam the proof
exists to exercise and would still produce a green-looking ROM. (Same reasoning, and the
same file shape, as the drift proof of 2026-09-02.)

`pattern_px` is read from `bandPatternPx`, never typed in.

**Its anti-vacuous rows, which are the reason the later links mean anything.** A band whose
phase 0 is uniform along an axis is a vertical roll *and* a horizontal roll at once — aeon
admits that case as ambiguous, and it would satisfy every assertion below while proving
nothing about direction. The script therefore refuses to proceed unless phase 0 varies along
**both** axes, and then asserts the property in **both directions**: bank 1 **is** phase 0
rolled along Y, and bank 1 is **not** a horizontal roll.

**2 — aeon's own guard admits it.** `validate_band_phase_axis`, called from a copy of aeon
materialised at a committed revision, returns clean. That is the guard whose whole purpose is
refusing a vertical band written by a horizontal writer.

**3 — the generator lowers it as vertical.** `tools/inject_editor_bg.py` emits:

```
// band 0: 32 tiles at BG slot 0, driver timer, vertical (scrolls up), 1px per 4 units
data _BgAnim_Band0_hdr: [u16; 6] = [2, 2, 31, 8, 32, $8000]
```

`step_mask` **31** = `rows*8 - 1` — the period along **Y**. `col_shift` **8**, so the
rotation unit is `1<<8 = 256 = cols*32`, a whole row of tiles. The same band declared
horizontal lowers to **63** and **7**. Both figures are derived from the band's own
geometry (`cols=8, rows=4`), not copied from a neighbouring pin.

**4 — it steps in the running machine, and the control does not.**
A screenshot diff cannot answer this: a band DMAs new pixels into fixed slots, so the
nametable tile index never moves and the picture differs on every capture whether or not the
band is stepping. The quantity that answers it is **VRAM tile bytes at the band's own slots,
against a control run of slots the band does not own** (this repo's standing bar, established
2026-08-27).

Band slots are VRAM `0x8000` — which is the `$8000` in the emitted header above, so the
address is taken from the artifact rather than assumed. Control is `0x8400`, blob art the
band does not own.

| frame | band `0x8000` (first 64 B) | control `0x8400` (first 64 B) |
|---|---|---|
| 600 | `9A988AA9AAAAAAAB…888AAAA888A` | `88888888889A98AA…888AAA88AA` |
| 640 | `A88888888998A999…98AAAC88A8` | `88888888889A98AA…888AAA88AA` *(identical)* |
| 680 | `888BAA888A9CAAA8…A9AAAAAA889` | `88888888889A98AA…888AAA88AA` *(identical)* |

**Three distinct band contents across three captures; the control byte-identical at all
three.** That is what separates stepping from a wholesale art reload and from the screen
merely scrolling.

## What this does NOT prove — stated rather than left to be assumed

- **The VRAM bytes prove the band STEPS. They do not, by themselves, prove the step is
  vertical.** Direction rests on links 1 and 3: the authored banks are Y-rolls and provably
  not X-rolls, and the lowering emits the vertical period and unit. A reader who wants
  direction from the runtime alone does not have it here, and I am not going to imply
  otherwise by putting links 3 and 4 in the same sentence.
- **No human has looked at it.** "Scrolls up" is the generator's word and the engine's
  documented sign convention, not an observation of a screen. The taste look is the owner's.
- **A FAST=1 DEBUG ROM**, which the build itself banners as a dev artifact. Byte-identical to
  the canonical ROM on this tree by the build's own claim, but nothing here checked that.
- **One band in the act**, so the control is other blob slots rather than a second band that
  must stay still. A second, horizontal band beside it would be a stronger control.

## Provenance — the parts that can move on different clocks

- aeon materialised as a **git clone** at `8d6e64de`, checked out detached, `git status`
  clean. Not aeon's live tree: their lane was mid-build on chain 214 while this ran, and a
  clone was needed rather than a `git archive` because the re-bake runs git **inside** the
  tree it is given (the archive had no `.git` and the bake refused).
- empyrean materialised at `b6b5d16954505fbb315c8c199c12ffd4e0826a45`; `EMPYREAN_SUITE_ROOT`
  points at the constructed pair, so nothing resolved to a live sibling.
- Assembler: the binary **actually executed** hashes `43bce708797c94d306594ca7…`; it reports
  itself as `sigil 0a58f2ecc8e7`, and sigil's `origin/master` is `f222c1be`. **The build
  printed its own stale-assembler warning and it is recorded rather than suppressed** — a
  stale assembler emits a byte-identical ROM when the source has not changed, so no CRC
  downstream could detect it. Hashing the executed binary is the check that survives that.
- Donors: `AEON_SONIC_HACK_DIR`, `AEON_SKDISASM_DIR` pointed at the legacy reference trees.
- Emulator: a **private** instance (`mode: own-instance`), not the owner's window — verified
  before any call, and the owner's player was not running at all.

## Reproducing it

```sh
BG_OVERRIDE_PATH=<copy>/games/sonic4/data/editor_bg_override.json \
  npx vitest run --config scratchpad/author-vertical-band.vitest.config.ts
# then, in the copy, with SIGIL_BUILD / SIGIL_EMIT / EMPYREAN_SUITE_ROOT set:
DEBUG=1 FAST=1 ./build.sh
```
