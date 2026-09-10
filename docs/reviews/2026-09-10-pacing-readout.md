# The last open condition on CR-S: a client read a figure from the owner's live window

**2026-09-10, aurora, foreground (overseer's own — a live window is not an agent's to touch).**
Instrument: `scratchpad/pacing-readout-harness.mjs`, committed with this packet.

## What was open, and who said so

Protocol §11.42 (empyrean `contract/protocol.md`, read at `origin/main` `064def0`) adjudicated
oracle's CR-S — `emulator/pacing`, one read-only method reporting the pacing a presenting window
already computes for its own Pacing tab. Its adoption condition has four parts:

1. registered when the gate is green — done 2026-09-06T15:40:07Z;
2. oracle serves it on `oracle-player` only, and re-vendors — done;
3. oracle's suite carries the headless-does-not-advertise negative — done, `tests/pacing.rs:282`;
4. **"a client reads a figure from the owner's live window over the bus"** — open until tonight.

§11.42 names the reviewer: *"aurora, the lane whose conformance harness will be the first client
to read it."* That is this run. `F-VSYNC-NEVER-MEASURED` was held open by the same sentence.

## What was read

His window was up and untouched: `oracle-player --rom aeon/s4.debug.bin --aether`, pid 242670,
1h15m old, listening on `/run/user/1000/oracle.sock` (the `$XDG_RUNTIME_DIR` step of the socket
chain, printed by the harness rather than assumed). **10/10 rows.**

| | |
|---|---|
| fps | **60, 60, 61, 60** over a **1000 ms** window, `targetFps` **60** |
| frame time | p50 **15.656 ms**, p99 **18.853 ms**, samples 599 |
| audio | `unmeasured: false`, **underruns 86** (cumulative, since the window opened) |
| presented | 275927 → 276288, **+361 frames over 6.0 s** |
| server | `implementation: oracle-rs`, build `275f0a42fa4b` (vcs), 62 methods |
| box | load 7.90 → 7.91 at the reads (five other lanes working; 1-minute figure) |

**The reads are four, seconds apart, and that is a safety property rather than a sampling
choice.** §11.42 M1 picked a method over an event *because* "an event would tax a window the
owner is using per frame, a method costs one drain per call at the caller's rate" — so the
caller's rate is the argument that justified the method's shape, and a tight loop would spend
the thing the design bought. The load is printed beside every figure for the same reason: a
frame-rate number with no statement of what the box was doing is not re-readable later.

**Read a second time at 2.4× the load, after registering the harness by name** (`npm run
harness:pacing-readout`): **10/10 again, fps 60/60/60/60 at load 18.74** where the first run sat
at 7.90. The figure is not an artefact of a quiet moment on the box, and the two runs are stated
as two runs rather than stitched into one — the environment varies here between runs and a claim
needs its evidence from one of them.

## Why the schema rows are not the finding, and what is

Every M-row passed — `presented` and `targetFps` numeric (M1), `fps` an object carrying its own
window (M2), `audio.unmeasured` required with `underruns` present exactly when it is false and
`frameTimeMs.samples` required with the p50/p99 pair present exactly when samples exceeds 0
(M3/S2, asserted as an iff in both directions rather than in whichever arm the window happened
to be in).

**A schema-shaped reply proves the fields and says nothing about whether the numbers are being
measured.** Row `4a` is the one that discriminates: `presented` is frames put on the glass, so
on a drawing window it must ADVANCE between two reads seconds apart. It advanced by 361 over
6.0 s = **60.2 Hz, derived from a counter rather than from the server's own `fps` field** — an
independent corroboration of the 60 it reports. A constant there would have meant a literal,
and all nine other rows would still have passed.

**The control is what makes the membership row (2b) capable of failing.** M4 scopes
advertisement to processes that present frames. Run against a headless `oracle-aether`
(pid 3489879, build `8fd450031ceb`), the harness passes 4/4 with `emulator/pacing` **absent**.

⚠ **And the two builds are DIFFERENT, so "62 methods vs 61" proves nothing on its own** — this
repo's own bar says the banner's method count is not a freshness tell and never was. Measured
the set difference instead: **player-only = `['emulator/pacing']`, headless-only = `[]`.**
Exactly the one method, across two unequal builds. That is the claim; the counts are scenery.

## The half worth handing back to oracle

CR-S was filed because the owner reported his window **"lags super hard"** and the lane could
measure his process from outside (97% of one core) but could not state his frame rate. **It can
now, and the answer is that presentation is at target: 60 on a 60 target, p99 18.9 ms.** So
whatever he was seeing is not a dropped-frame story on this evidence, and the one nonzero
distress signal in the whole reply is **`audio.underruns: 86`** — which is the field §11.42's M3
exists to keep expressible.

⚠ **Stated as scope, not as an answer.** This is one 6-second sample on a box at load ~8 with
five lanes working, and it is not a claim about what he saw at the moment he said it. §11.42's
own S1 already says the method does not measure presented-under-vsync on the GPU. The useful
next question is oracle's and not this lane's: whether 86 underruns is the whole complaint.

## Status

Condition 4 is **met**, and `F-VSYNC-NEVER-MEASURED` is answerable by the lane that owns it.
The closing edit belongs to empyrean's `contract/protocol.md`, not to this repo — reported to
the hub with this packet named.
