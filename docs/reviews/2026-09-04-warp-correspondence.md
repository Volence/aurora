# The assumption the owner relies on daily — the editor's world pixel IS the engine's

**2026-09-04 · branch `test/warp-correspondence` · base `f26aa29c`**

`src/core/aether/warp-math.ts` held a claim and, until today, an honest admission that
nothing checked it:

> *"The editor and the engine agree on world pixels TODAY … ⚠ THAT CORRESPONDENCE IS
> ASSUMED, NOT CHECKED."*

Until a sweep corrected it hours earlier, the same paragraph had claimed the opposite —
that it was *"checked at runtime by `scratchpad/warp-mailbox-harness`"*, **an instrument
that has never existed in this repo, in the tree or in its history**. The correction
made the gap visible. This parcel closes it.

**In one sentence:** `test/live/aeon-warp-correspondence.test.ts` warps a running aeon
DEBUG ROM to two known editor world pixels and reads `Player_1`'s position **out of
RAM**, asserting the player is at the cursor pixel, that two different cursor pixels
produce two different landings differing by exactly the distance asked for, and that the
one place editor and engine legitimately disagree — the act clamp — disagrees by exactly
the amount the engine's own margin constants say.

**It has been run.** The numbers below are measured, not reasoned.

---

## 1. Why the claim matters, and how narrow it is

`warpTargetFor` has exactly **one** consumer: `src/renderer/components/MapViewport.tsx:15`
(F7, play-from-cursor). So the claim in practice is *"click a spot on the map, play from
there, and Sonic is at that world pixel"* — a thing the owner uses daily and no
instrument has ever asked.

What existed answers **other** questions and is easy to mistake for coverage:

| instrument | what it actually establishes |
|---|---|
| `src/core/aether/__tests__/warp-math.test.ts` | Arithmetic only — rounding, the act clamp, the protocol clamp. It never leaves the editor, so an engine that disagreed would not move a single assertion. |
| `scratchpad/warp-tearing-harness.mjs` | That two **routes to the same destination** produce the same plane nametable. Silent about whether that destination is the pixel the editor meant. |
| `test/live/s1-warp-live.test.ts` | The same question on **Sonic 1** — a different engine, a different mailbox, a different coordinate contract. It is the shape this file copies, not coverage of this path. |

## 2. What the new row does

`test/live/aeon-warp-correspondence.test.ts`, modelled on its classic twin.

1. Spawns its **own** headless `oracle-aether` on a private `mkdtemp` socket, against
   `../aeon/s4.debug.bin`. The default socket chain is never consulted, so it cannot
   touch a window someone is looking at. (An MCP emulator tool is not an option here and
   was not used — those deadlock from a background agent; the headless bus script is the
   route, exactly as the S1 row does it.)
2. Loads `s4.debug.lst` through the **shipped** `AetherClient` and calls the **shipped**
   `warpTo` — no second copy of the mailbox sequence to drift from the one F7 uses.
3. Reads `Player_1`'s SST `x_pos`/`y_pos` (16.16 fixed; the integer pixel is the high
   word) **out of RAM**. Not a screenshot: a rendered frame is a post-hoc state render
   and cannot answer *where is the player*, and mistaking one for the other cost this
   suite a real defect on 2026-09-03.

Every number describing the engine is **derived from aeon's own source**, never typed:

| quantity | derived from |
|---|---|
| `Sst.x_pos` / `Sst.y_pos` offsets | `engine/objects/sst.emp`'s in-file `@ $NN` pins |
| `SECTION_SIZE_SHIFT`, `SCREEN_HEIGHT` | `engine/system/constants.emp` |
| `PBOUND_RIGHT_MARGIN` | `games/sonic4/player/player_common.emp` |
| the act's section grid | recovered from the **live** `Player_Bound_Right/Bottom` plus those margins |

Each derivation returns `null` — never a plausible default — if the source stops being
shaped that way, and the row turns that into a loud failure. A silently-zero SST offset
would read `code_addr` and report it as a position.

## 3. The measurement

    AURORA_LIVE_AEON_WARP=1 npx vitest run test/live/aeon-warp-correspondence.test.ts

Run 2026-09-04 on this machine, 1.73 s, **1 passed / 0 failed / 0 skipped**:

```
act: 3x3 sections = 6144x6144px; engine clamp edges = (6120, 5920)
A: editor (1024,96)  -> request (1024,96)  -> engine (1024,96)   delta (0,0)  polls=18
B: editor (1801,429) -> request (1801,429) -> engine (1801,429)  delta (0,0)  polls=17
clamp: editor (10000000,10000000) -> request (6143,6143) -> engine (6120,5920)
       editor-vs-engine gap (23,223)
clamp: editor (-500,96) -> request (0,96) -> engine (0,96)
protocol clamp: inert here — the act's last pixel is 6143, ceiling is 65535
```

**The correspondence HOLDS. Editor pixel = engine pixel, delta (0,0), on both axes, at
both points.**

## 4. The two-point control, and what it rules out

`A = (1024, 96)`, `B = A + (777, 333)`. The deltas are deliberately **not round**, so an
engine that snapped to a tile or section grid could not coincide with them.

A single-point check would have passed against **a stuck value, a clamped value, and an
engine that ignores the mailbox entirely**. That is not an argument — it was measured.
Red-first mutation 2 below pins `warpTargetFor` to A's coordinates: **point A still
passes**, point B fails. A one-point version of this row would have been green while the
editor's arithmetic was a constant.

The `b - a === (777, 333)` assertions are, given the identity assertions above them,
strictly implied — they are a net for a future weakening of the identity expectation, not
independent evidence. Said plainly so nobody counts them twice.

## 5. The clamps, asserted rather than avoided

A clamped coordinate is a case where the editor and the engine legitimately **disagree**,
and it is the one real finding in this parcel.

**The engine clamps tighter than the editor does.** `warpTargetFor` clamps to the act's
last addressable pixel (`grid * 2048 - 1` = 6143). aeon's `clamp_and_publish` clamps to
the game's own playable edges, `Player_Bound_Right = width - PBOUND_RIGHT_MARGIN` and
`Player_Bound_Bottom = height - SCREEN_HEIGHT`. Measured gap on the far corner:

| axis | editor asked | engine placed | gap | equals |
|---|---|---|---|---|
| x | 6143 | 6120 | 23 | `PBOUND_RIGHT_MARGIN - 1` (24 − 1) |
| y | 6143 | 5920 | 223 | `SCREEN_HEIGHT - 1` (224 − 1) |

So a cursor in the act's **last 24 px of width or last 224 px of height** lands short of
where the user put it. This is the engine behaving correctly — it publishes back where it
actually put the player, and `warpTo` reports `clamped: true`, so F7's toast already tells
the truth. It is **not** a bug filed against aeon and nothing was changed on either side.
It is now written into `warp-math.ts`'s header, where the next person to compute act
bounds client-side will meet it, and asserted here against the two margin constants so a
change to either lands on this row instead of silently widening the disagreement.

The negative-cursor clamp **agrees**: editor `(-500, 96)` → both sides `(0, 96)`.

**The u16 protocol clamp cannot fire on this ROM, and the row says so rather than
skipping quietly.** The act's last pixel is 6143 against a 65535 ceiling; only an act
wider than 32 sections would reach it. That is asserted as an inert-by-construction fact
(`lastPixel <= WARP_COORD_MAX`, `clampedToProtocol === false`), so if an act ever does
reach the ceiling this row fails and says it must grow a live case. The arithmetic itself
stays covered by `warp-math.test.ts`.

## 6. What makes it non-vacuous

1. **The expectation is the CURSOR POINT, never `warpTargetFor`'s output.** If it were
   the latter, perturbing `warpTargetFor` would move the request and the expectation
   together and the row would be green forever. This is the single most important line
   in the file.
2. **Two points** (§4).
3. **The machine is paused throughout, and the pause is asserted.** `warpTo` resumes and
   polls a machine it finds running, and each poll is a round trip — so an unknown number
   of frames of gravity would fall between the ack and the read, and the `y` figure would
   be a measurement of the network. Paused, `warpTo` steps one frame per poll and leaves
   the machine stopped, so the read is a fixed **one** frame after the consume. If the
   pause silently did not take, every number above would be off by an unknown amount, so
   `wasRunning === false` is checked with that wording.
4. **It refuses to report unless a level is live** — `Current_Act_Ptr` must be a plausible
   ROM pointer and the bounds must be non-zero. Its classic twin learned this the hard
   way: the spike measured a "player" drifting on the SEGA screen and produced a
   perfectly clean figure describing nothing.
5. **It checks it is reading the right object.** `Debug_Warp_Consume` places the *leader*
   (`movea.w Camera_Target, a0`), so the row asserts the leader **is** `Player_1` rather
   than assuming it; a two-player build would otherwise move the subject out from under
   it. (Compared in the 68000's 24-bit space: `Camera_Target` is a word that sign-extends
   to `$FFFF8F72`, `lookup_symbol` answers `$FF8F72`. The first run failed here, correctly.)
6. **The scale half of the claim is checked source-against-source**: `1 << SECTION_SIZE_SHIFT`
   (aeon) must equal `SECTION_PX_WIDE` and `SECTION_PX_HIGH` (Aurora), and the act's live
   pixel extent must divide **exactly** into whole Aurora-sized sections. "The same grid at
   the same scale" was previously stated nowhere a change could trip over it.

## 7. Red-first evidence

Both mutations were planted **on disk** in `src/core/aether/warp-math.ts`, run, and
restored with `git checkout --` from the committed baseline `d453eba7`. The row was green
before, red under each, green after.

**Mutation 1 — a known offset.**

```diff
-  const ax = Math.round(worldX);
+  const ax = Math.round(worldX) + 8;   // RED-FIRST MUTATION
```

```
A: editor (1024,96) -> request (1032,96) -> engine (1032,96)  delta (8,0)
FAIL  editor asked for world x=1024; the engine put the player at 1032
```

Note what the engine did: it followed the perturbed request **exactly**, to 1032. The
correspondence is real; the row catches the editor lying about which pixel the user
pointed at, which is the failure this instrument exists for.

**Mutation 2 — a stuck value, to exercise the two-point control.**

```diff
-  const ax = Math.round(worldX);
-  const ay = Math.round(worldY);
+  const ax = 1024;   // RED-FIRST MUTATION 2: a STUCK value
+  const ay = 96;     // RED-FIRST MUTATION 2: a STUCK value
```

```
FAIL  editor asked for world x=1801; the engine put the player at 1024
```

Point A passed under this mutation. **A single-point check would have reported green.**

## 8. Gating, and who runs it

* **Opt-in:** `AURORA_LIVE_AEON_WARP=1`, the same idiom as `AURORA_LIVE_S1_WARP`.
* **Registered:** it lives at `test/live/aeon-warp-correspondence.test.ts` and is inside
  `vitest.config.ts`'s `test/**/*.test.ts` include, so it is collected by every
  `npm test` and appears in the skip report — it cannot evaporate the way an
  unregistered `.mjs` harness can.
* **Its skip names exactly what to set**, one clause per missing thing:
  `AURORA_LIVE_AEON_WARP=1 not set`; `no sibling aeon with a built s4.debug.bin —
  ./build.sh DEBUG=1`; `aeon has no s4.debug.lst beside the ROM — rebuild it`; `no sibling
  oracle with target/release/oracle-aether — cargo build --release`.
* **Who runs it and when:** whoever changes `src/core/aether/warp-math.ts`,
  `src/main/aether/warp.ts`, or lands an aeon change to `Debug_Warp_Consume`,
  `clamp_and_publish` or `Player_BoundsInit`. Not in CI — CI has neither a built
  `s4.debug.bin` nor a built `oracle-aether`. **Foreground only**: a background agent
  driving an emulator deadlocks.
* Peer trees are opened **read-only**: `s4.debug.bin`, `s4.debug.lst` and three `.emp`
  sources under `../aeon`, plus the `oracle-aether` binary. Nothing is written to any
  sibling checkout (d-28), and the ROM is loaded by a private server on a private socket.

## 9. What this does NOT cover

* **`screenToWorld`** — MapViewport's mouse→world step. The claim in `warp-math.ts` is
  about world pixels; this row starts at one. A pan/zoom defect upstream of
  `warpTargetFor` is still uncovered.
* **Whether the open project's act grid matches the ROM's.** The act dims here are
  derived from the *running engine*, because the subject is the coordinate space, not the
  act table. A project whose `gridWidth` disagrees with the ROM it launched is a different
  defect needing a different check.
* **The protocol clamp against a live engine** (§5) — unreachable on any act this build
  can hold.
* **Terrain interaction.** The two control points are high in the act (open air) because a
  warp seeds `PSTATE_AIR` and the one frame that runs before the read can snap the player
  onto a floor. That snap is the engine being correct and is not a coordinate finding, so
  the row is written not to sample it. A warp into solid ground is a real question — for
  the *toast wording*, which is row 48's still-open eyeball item, not for this claim.
