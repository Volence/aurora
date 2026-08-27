# `rate_shift` verified on a watched band

**aurora, 2026-08-27.** ROADMAP §5.1 row 43 shipped the `rate_shift` field and tagged its
own claim as **NOT VERIFIED ON HARDWARE**:

> The claim `rate_shift: 3` halves the speed of `rate_shift: 2` rests on aeon's cited
> `step = driver_value >> rate_shift`, not on a watched band.

It is now watched. Instrument: `scratchpad/band-rate-shift-probe.mjs`, committed.

## Result

| ROM | `rate_shift` in the band record | changes in 48 frames | gaps observed | mean period |
|---|---|---|---|---|
| as built | 2 | 12 | `[4]` | **4.00 frames** |
| one word patched | 3 | 6 | `[8]` | **8.00 frames** |

**Ratio exactly 2.00.** `rate_shift: 3` steps half as often as `rate_shift: 2`, on a band
running in a real machine. Every inter-change gap was uniform — `[4]` and `[8]` are the
complete sets of observed gaps, not averages hiding spread — which is what
`step = driver_value >> rate_shift` predicts for a `Logic_Tick` driver advancing once per
frame: the period is `1 << rate_shift` driver ticks.

## Why this is a stronger experiment than two builds

**The two ROMs differ by exactly one byte** (`cmp -l` → 1 line), at the `rate_shift` word of
band 0's record. No rebuild, so no toolchain, no layout and no art can differ. Two separately
built ROMs would have introduced build variance for what is a one-word difference.

The record layout is aeon's own (`engine/level/bg_anim.emp`): `dc.w band_count`, then a
44-byte record per band with `$00 driver, $02 rate_shift, $04 step_mask, $06 col_shift,
$08 tile_count, $0A vram_dest`. Band 0's `rate_shift` is therefore `BgAnim_Table + 4`.

## The identity check that makes the number mean anything

Before either measurement, the probe reads the whole record and requires it to **match the
document being described**: `tile_count == cols*rows` (32), `step_mask == pattern_px - 1`
(63), `vram_dest == BG_TILE_BASE_SLOT * TILE_BYTES` (32768), `band_count == anims.length`.
It refuses and stops if any disagree — otherwise a clean cadence figure could be describing
some other memory entirely. On the patched ROM the same check passes **and the record reads
back `rate_shift: 3`**, which is what says the patch reached the word the driver consumes.

The observable is VRAM tile **bytes** at the band's own slots, sampled every frame. A band
steps by DMA-ing pixels into fixed slots, so the nametable tile index never moves and a
screenshot diff cannot see this at all — see `docs/reviews/2026-08-27-band-lens.md`.

## An attempt that failed, and the refusal that was correct

The first version patched the `rate_shift` word **in memory** on one running machine, to
avoid a second ROM entirely. The server refused:

```
-32004  0x000273B6: only the work-RAM window ($E00000-$FFFFFF) is writable;
        ROM and I/O writes are refused
```

That is the right behaviour and the probe reported **BLOCKED** for those values rather than
producing numbers. Worth recording as the loud-refusal property working: a silently ignored
ROM write would have produced four identical cadences and an apparently clean refutation of
the claim.

## Scope

One band, `Logic_Tick` driver, `pattern_px 64`, on the pinned trunk fixture. Shifts 2 and 3
are measured; 0 and 1 are not (the in-memory route that would have swept them is refused,
and each additional value costs another patched ROM). The formula's *shape* is now
confirmed at two points an octave apart, which is what the row's claim was about.
