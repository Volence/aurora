# Sonic_Animate live study — the animation audit's TAGs, closed

Date: 2026-08-21. Instrument: `scratchpad/sonic-anim-study.mjs` (headless oracle-aether
on `s1disasm/s1built.bin` + `sonic.lst`, run foreground by the controller).
Closes the standing TAGs from `2026-08-20-s1-animation-audit.md` §1.4/§5 (rotation
fan-out, live timing) for everything except push (see regime limits).

## Method

A JS **twin of `Sonic_Animate`** (`_incObj/01 Sonic.asm:2176`, FixBugs=0 as built) is
teacher-forced against per-frame reads of `v_player` ($40 bytes/tick, fields obFrame/
obAniFrame/obTimeFrame/obPrevAni/obInertia/obAngle/obStatus/obRender). Animation
scripts are read **out of the running ROM** (`Ani_Sonic` + label cross-check, exact
match for $00–$04) — zero transcription. Phases: idle 100 ticks → walk 260 → run 700
(with an early jump for roll coverage) → jump 130; `v_invinc` held at 1 each tick so
badnik contact cannot kill the run (two earlier captures died mid-phase and zeroed
their tails — those runs' data was discarded, not merged).

**Cadence finding (method-critical):** the emulator's frame boundary does not
coincide 1:1 with the game loop — observed `obTimeFrame` decrements arrive as 0 or 2
per stepped frame under load. Each observed transition is therefore classified as
exactly **0, 1 or 2 twin steps**, with global step-count conservation required.

## Results (final capture: 1,189 ticks)

- **1,180/1,189 transitions explained by exact interpreter steps** (782 single, 198
  double, 200 zero). Step conservation: 1,178 twin steps vs 1,189 frames (the gap ≈
  the unexplained ticks).
- **Walk/run duration formula CONFIRMED**: reload = `max(0, $800 − |inertia|) >> 8`,
  observed at every distinct duration 2–8.
- **Roll formula CONFIRMED**: `max(0, $400 − |inertia|) >> 8`, 72 reloads exact.
- **Rotation fan-out CONFIRMED at two octants (0 and 2), walk and run**: after the
  script lookup, `obFrame += d3` with walk `d3 = (oct + oct>>1)×2` (0,6,12,18) and
  run `d3 = oct×2×2` (0,4,8,12), octant = `(((xflip ? a : ~a) + $10) >> 4) & 6`.
  Non-degenerate: octant-2 samples show the +6 (walk) / +4 (run) offsets exactly.
- **Regular-script timing CONFIRMED**: duration byte N ⇒ N+1 tick hold
  (`subq.b/bpl`), and an anim change resets `obAniFrame`/`obTimeFrame` and advances
  **immediately** on the next Animate step (7 observed instances). Walk↔run selection
  at `|inertia| ≥ $600` confirmed (a boundary sample at exactly $600 took run).
- **9 unexplained ticks, all one class**: double-step merges whose inputs
  (inertia/angle/anim) changed *between* the two merged real steps — the twin feeds
  both steps the end-of-window values — plus mid-routine pause reads (obTimeFrame
  caught at $FF between the `subq` write and the reload write). None contradicts the
  interpreter; each self-corrects on the following tick.

## Regime limits

- **Push never observed** (no wall reached; `$FD` scripts and the `>>6` shift are
  static reading only).
- Octants 4/6 (steeper than ~45°) not reached; the octant *formula* is pinned by 0
  and 2, and the fan-out table is data (`fr_Walk*/fr_Run*` sets), not extrapolation.
- Cadence (game loop vs display frame under load) is a property of the running game,
  NOT of the interpreter — an editor preview drives the interpreter from its own
  clock and is unaffected.

## Consequence for Aurora

A faithful Sonic walk/run/roll preview is now implementable as a small interpreter:
`sonani` table parse (equates + macro) + the confirmed duration formulas + the
confirmed `+d3` rotation offset, parameterized on a user-scrubbed inertia/angle.
That is the follow-on parcel's spec base; nothing further needs the emulator except
push fidelity, which can ship as static N=($800−spd)>>6 with this study cited.
