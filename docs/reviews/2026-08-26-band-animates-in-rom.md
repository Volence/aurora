# A band authored in Aurora animates in a built ROM — 2026-08-26

**The last link of EFFECTS-W1's BgAnim road.** Item 29's row recorded what was still
missing: *"STILL NOT PROVEN: no build, no ROM, no staleness gate. Nothing assembles the
emitted .emp and the band has never run."* All four are now closed.

This is the OVERSEER's foreground pipeline probe. It deliberately uses a MODEL-made band,
so that the separate UI-authored handover band (branch `parcel/handover-band`) changes
exactly one variable — the band's provenance — rather than two.

## What was run

Clean checkout of aeon at their pushed `bc95e32e174e28c62c9d167053e6f3487ed1413b`
(`ls-remote`-resolved, never the sibling working tree), built in an isolated directory so
nothing could collide with the aeon session's live tree.

| Step | Result |
|---|---|
| Baseline build (no band) | `s4.bin` crc **b96319e3**, 699,408 B |
| Band emitted (8x4 promoted from tile 2, `phaseFill: 'shift'`, timer/rate_shift 3) | 1,260 layout words rewritten; tiles 320 -> 320; bank 7 != bank 0 |
| Staleness gate | Fired **STALE**, exactly as the row predicts — `editor_bg_override.json` is on the gate's INPUT side |
| `tools/regenerate-level.sh` | `verify_level_bin: OK`; needs `AEON_SKDISASM_DIR` when the checkout has no sibling donor |
| Build with band | `s4.bin` crc **4b85b9ce**, 699,444 B |

## The 36-byte trap, and why the CRC alone proves nothing

The ROM file grew **36 bytes** while the band section is **8,238 B**. A CRC change proves
something moved; 36 bytes is equally consistent with the table record landing and the
banks blob being silently dropped. Resolved by instrument rather than by argument:

- `bg_anim_banks.bin` is **8,192 B** = 32 slots x 8 phases x 32 B, derived.
- aeon's own `tools/bganim_room.py --lst s4.lst` reports **"8238 B the section already
  holds"** — matching the figure derived independently from their constants
  (`2 + 44*1 + 32*256`), from the built listing rather than from the emitter.

The file barely grew because the section expands into pre-existing `$00` fill below the
`dac_banks` hardware anchor — which is what aeon's own comment predicts.

## Does it ANIMATE — the check, and the control that made it trustworthy

First attempt reported the band's art was nowhere in VRAM. That was **not** a finding: the
nibble->byte packing was an unverified assumption, and a wrong packing produces exactly
that result. Control run first: 40/40 **static** tiles were found in VRAM under `hi_lo`
packing and 0/40 under `lo_hi`, and static tile 32 sits at VRAM `0x8400` — exactly 1024 B
past `0x8000`, confirming the band's 32 slots occupy `0x8000..0x83FF` as the prefix model says.

With the packing established, the naive check (does VRAM equal a bank?) is still wrong:
the coarse two-piece DMA means VRAM is generally a **column rotation** of a bank, equal to
a bank verbatim only at coarse step 0. The model is all 64 (bank, rotation) pairs:

```
[model] 8 banks x 8 rotations = 64 combos -> 64 distinct images   (non-vacuous: no collisions)
28 samples, unmatched 0
  distinct banks visited     : [0, 1, 2, 3, 4, 5, 6, 7]
  distinct rotations visited : [0, 1, 2]
frame 1080 -> (bank 2, rot 0)   frame 1105 -> (bank 5, rot 0)
frame 1085 -> (bank 3, rot 0)   frame 1110 -> (bank 6, rot 0)
frame 1095 -> (bank 4, rot 0)   frame 1120 -> (bank 7, rot 0)
frame 1125 -> (bank 0, rot 1)
```

**Every sample is art this editor authored.** All eight banks are visited, and the coarse
rotation steps 0 -> 1 exactly when the fine phase wraps past bank 7 — the fine and coarse
halves in lockstep, which is the tearing condition the codec's own header warns about.

Probe: `scratchpad/bganim-rom-animation-probe.py`.

## Two findings worth carrying

1. **`planBandInsertion` never points a layout cell at the new slots** — it only remaps
   existing words (`idx < slotBase ? idx : idx + n`). An INSERTED band is therefore real in
   the blob and **invisible on screen**; the 128 free slots on the regenerated background
   are room, not something watchable on their own. PROMOTION is visible by construction and
   is why this probe promotes. Relayed to aeon so they do not expect otherwise.
2. **The layout-word count disagrees slightly with the measured reference count** — 1,260
   words rewritten against 1,244 cells measured as referencing tiles 2..33 (mask `w & 0x7ff`).
   Not load-bearing here and not chased; recorded so it is not silently absorbed later.

## Provenance caveats, stated rather than buried

- The assembler binary reports `sigil 0.1.0 (ac84536f-dirty)` — built from a modified tree,
  so this ROM was produced by an uncommitted assembler. Fine for a watch-it-move proof;
  **not** a landing artifact.
- `FAST=1` was used: the s4lint / effects_budget / pytest / verify_level_bin lanes are
  SKIPPED. The canonical `./build.sh` must run before anything here is landed.
- The 16 tool-suite failures seen on the first canonical attempt were the isolated
  checkout's missing sibling donors (`skdisasm`, paired `sigil`), not aeon breakage.
- VRAM reads carry the server's own `bypassesVdpPort` caveat (debug read, not the VDP port path).

---

## Addendum — the UI-AUTHORED band, and a defect in this document's own probe

**The handover band (authored through Aurora's real UI, merged at `54a7b2c`) animates too.**
Rebuilt the isolated checkout with `test/fixtures/bg-override/editor_bg_override.handover-band.json`
in place: `verify_level_bin: OK`, `s4.bin` crc **7e889eca**, banks blob 8,192 B.

```
[control] 40/40 STATIC tiles found in VRAM under hi_lo packing
[control] first static tile at VRAM 0x8400; band prefix expected at 0x8000 (consistent)
[model]   8 banks x 8 rotations = 64 combos -> 64 distinct images
28 samples, unmatched 0 | banks visited [0..7] | rotations visited [0, 6, 7]
[verdict] BAND ANIMATES — every sample is art this editor authored
```

So the chain is closed end to end: real UI -> real Ctrl+S -> aeon's injector -> built ROM
-> moving on screen. The UI-saved document is **byte-identical** to what the model path
emits for the same spec (110,660 B, sha256 `9d05f512…`), verified with an independently
written emitter — which answers ROADMAP row 29 by hash rather than by agreeing numbers.

**⚠ The probe first committed with this document was the NAIVE bank-only version** — the
very trap described in section "Does it ANIMATE" above. Re-run against the handover band it
reported *"banks found NOWHERE"* and exited claiming the art was not in VRAM: **a false
negative, shipped next to a write-up describing the rigorous method.** A reader would have
concluded the band was broken. `scratchpad/bganim-rom-animation-probe.py` now implements
what was actually used — the control, the 64-pair model, and an explicit vacuity refusal if
the pair images ever collide. Recorded rather than quietly replaced, because the failure is
the interesting part: **the write-up was right and the artifact beside it was wrong**, and
nothing about the pairing looked suspicious.

**Ratified deviation:** `rate_shift: 3` was briefed and is **unreachable through the UI** —
the band panel builds its spec from `cols`/`rows`/`phaseFill`/`driver` only. The agent left
the key out rather than hand-editing the JSON, which would have falsified "authored through
the real UI". aeon's default (2) applies, so the band steps every 4 ticks instead of 8 —
faster than briefed, which is not a downgrade for a first watchable band. The missing panel
control is booked as an open item.
