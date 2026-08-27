# Item 48's gate: what poking `v_player` on a running S1 machine actually costs

**aurora, 2026-08-27.** ROADMAP §5.1 row 48 books the classic playtest loop's last link
(play-from-cursor on the s1disasm path) and says the only route is poking `v_player`,
that this is the link's **unmeasured spike**, and that *anyone picking the item up
measures the spike FIRST* — because shipping an unmeasured mechanism would reverse the
original decline by silence rather than by evidence.

This measures it. **It implements nothing**, and it does not decide whether the link
should be built.

Instrument: `scratchpad/s1-vplayer-spike-probe.mjs`, committed. Own headless
`oracle-aether` on a private mkdtemp socket — the default socket chain is never
consulted, so nothing touches the owner's window.

## Method

Every address is derived, none typed: `v_player` and `v_gamemode` and `v_screenposx/y`
from `sonic.lst` via `lookup_symbol`; `obX`/`obY` **read out of
`../s1disasm/_Constants.asm`** (`obX: equ 8`, `obY: equ $C`), because equates cannot
answer an address lookup in either direction.

Bar 4 (same-destination-two-ways): all three runs start from **one checkpoint**, and the
control path is run **twice and required to be identical** before the poke run is
believed. It was — byte-identical samples and matching state hash — so what follows
measures the poke rather than the machine's nondeterminism.

## Result 1 — once the level has settled, the poke simply holds

| | player x | camera x |
|---|---|---|
| control, 60 frames | 80 → 80 | 0 → 0 |
| poked to x=592 | 592 → **592** (drift **0**) | 0 → 160 → 320 → **432** |

The write reads back immediately, survives 60 frames with **zero** drift, and the state
hash **differs** from the control — so it is a real change, not a no-op that happens to
look stable.

**The camera follows on its own.** It pans 0 → 432 over roughly 30 frames and settles.
Player 592, camera 432, on a 320-wide screen puts him 160px from the left edge — centred.
Nothing had to drive the camera; S1's ordinary follow does it.

So the mechanism is not fought by the engine, and the visible cost is about **half a
second of camera pan**.

## Result 2 — the hazard is the WRITE WINDOW, and it fails silently

Poking at the instant `v_gamemode` becomes `0x0C` is **silently discarded**: the write
reads back correctly, and ten frames later the player is back at the start position with
a state hash **byte-identical to the control**.

That is not the engine snapping him back — it is S1's level init clearing object RAM and
re-seeding Sonic from the start-position table, still running. The two look identical
from outside, and the byte-identical hash is what distinguishes them: a genuine
snap-back would perturb *something*.

**Consequence for anyone building this link: entering the level is not the same as the
level being ready.** This probe settles 180 frames past mode `0x0C` before it trusts
anything. A play-from-cursor that pokes on the mode transition would work on a fast
machine and fail on a slow one, and its failure mode is a silent no-op.

## What this does NOT establish

- Only **x** was displaced, on **GHZ act 1**, with the player standing still. Poking into
  a wall, into a loop, mid-air, or mid-roll is unmeasured, and S1's collision resolves
  against the position it is given.
- Nothing here says the link should be built, or where the write should sit. It removes
  the reason the row gave for not costing it.

## Three defects in this probe, all of which produced clean confident wrong answers

Kept because each is this repo's own bar firing.

1. **A hex-prefix strip by character class shifted every byte.** `"0x04000000"` run
   through `replace(/[^0-9a-fA-F]/g,'')` drops the `x` but **keeps the leading `0`**,
   giving `"004000000"`, so byte 0 read `0x00` instead of `0x04`. That reported the title
   screen as the SEGA screen for a whole debugging pass, and the position reads carried
   the identical defect. Fixed with an explicit prefix check.
2. **An anti-vacuous gate caught a measurement of nothing.** Before the game-mode check
   existed, the probe read a "player" drifting a pixel or two a frame and would have
   produced a perfectly clean spike figure describing the **SEGA screen**.
3. **A silently-failed `restore` made the control diverge from itself.** `checkpoint`
   takes `label` and `restore` takes `id`; passing `name` to both was refused, so run B
   continued from where run A ended. The control-against-itself gate caught it and the
   probe refused to report a figure — the right outcome from the wrong cause, and it now
   throws on a failed restore instead of carrying on.

Each refusal was correct and each was **my** bug, not the machine's. The server named
every bad parameter and its accepted spelling, which is what made them cheap to find.
