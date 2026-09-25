# F7 in the running app lands Sonic on the cursor's world pixel

**2026-09-25 · branch `parcel/f7-warp-landing` · base `44ba3d7f` · row MAPVIEWPORT-UNTESTED, item "the warp's landing in the running game"**

**In one sentence:** `scratchpad/f7-warp-landing-harness.mjs` (`npm run harness:f7-warp-landing`) hovers the real map in the real Electron app at an integer client pixel, presses a real F7, and reads `Player_1`'s position out of the RAM of its own private emulator over a second connection. At two points far apart and at two zooms, Sonic lands exactly on the world pixel the map's own screen-to-world contract puts under the cursor: delta (0,0), on both axes, at dpr 1 and at dpr 1.35.

---

## 1. The gap, and what already covered part of it

`test/live/aeon-warp-correspondence.test.ts` (row 140, `docs/reviews/2026-09-04-warp-correspondence.md`) proved the math. It hands a world pixel to the shipped `warpTargetFor` and `warpTo` and reads the player out of RAM. Its own §9 says what it does not cover: `screenToWorld`, the key, the cursor, the IPC, the main-process client. That chain is what a person uses when they press F7, and nothing measured it.

This harness covers that chain from the key to RAM:

```
CDP Input.dispatchMouseEvent (integer client px) -> MapViewport cursorClient
CDP Input.dispatchKeyEvent F7 -> window keydown "F7 — play from cursor"
  -> screenToWorld -> warpTargetFor -> aetherStore.warp -> IPC AETHER_WARP
  -> main's AetherClient (bridge.ts) -> warpTo -> Warp_Req_* mailbox -> Player_1 in RAM
```

## 2. How it is built

* **Its own emulator, on a socket it made.** `oracle-aether <copy of s4.debug.bin> --socket <mkdtemp>/o.sock`. The app is launched under xvfb with `ORACLE_SOCKET` set to that path (and `EXODUS_SOCKET` removed from its environment). Nothing touches `/tmp/oracle.sock` or `$XDG_RUNTIME_DIR/oracle.sock`. No `mcp__oracle__*` tool was used.
* **A copy of the ROM and listing, taken at the start of the run.** aeon's HEAD moved twice while this parcel ran (`63013da2` to `820bd68a`). The copy means a rebuild in another lane cannot swap the machine out mid-run.
* **Constants come from the ROM's own listing, not from aeon source.** `EQU SST_x_pos = $00000002`, `EQU SST_y_pos = $00000006`, `SCREEN_HEIGHT`, `SECTION_SIZE_SHIFT`. The listing's `DIGEST-ROM crc=62238a15 size=848075` is checked against the CRC32 of the ROM copy (row 0b), so the constants belong to the same build as the ROM bytes. No aeon source file is read. For the record, each run prints aeon HEAD and the newest aeon commit at or before the ROM's mtime: `946bb82c` (2026-09-25T01:40:18-04:00). The ROM was built at 05:53:16Z by sigil `d7e6aa15` (`tree=clean`).
* **The observer does not call `loadSymbols`.** Measured in a probe before the harness was written: `oracle-aether` loads the `.lst` beside the ROM by itself (`symbols: 3220 symbols from …/s4.debug.lst (bound to this image)`). The app's client relies on that and never calls `loadSymbols` itself. If the observer loaded symbols, the app would get a symbol table that no real session has. Row 0c asserts that the server's `romPath` and `symbolsPath` are this run's copies.
* **The expectation comes from the map's contract, not from `warpTargetFor`.** It is `world = vp + (client - canvasRect.origin) / zoom` (MapViewport `screenToWorld` together with `canvasYToWorldY`). `vp` and `zoom` are read back from the app's view store (`__dbg.view()`) and the rect from `#map-canvas`, after the hover and before the key. The view is set so the world point under the integer aim is an exact integer. The residual is printed and must be below 0.01, so the expectation does not depend on any rounding convention.
* **Unmeasurable aborts loudly.** No level live, no attach, a short RAM read, a missing listing constant, or a digest mismatch each end the run as `HARNESS ABORTED` with exit 2. None of them can produce a green row.

## 3. Rows (26 native, 27 with `SCALE`)

| row | what it asserts |
|---|---|
| 0a | the listing is `debug=1` (the mailbox exists only in the DEBUG build) |
| 0b | listing `DIGEST-ROM` crc equals the ROM copy's crc32 |
| 0c | the server runs this run's ROM copy and bound this run's listing copy |
| 1a to 1c | gate: `Current_Act_Ptr` is plausible, the camera leader is `Player_1`, and the act bounds are live |
| 2a, 2b | gate: the aeon project is open with an act, and the app's Aether link is up |
| 2c | the app's link `socketPath` is this run's mkdtemp socket |
| 2d | (only with `SCALE`) the forced dpr took effect |
| P.in | target P is inside the engine's clamp edges (row 140: tighter than the editor's) and inside the app's act |
| P.hit | `elementFromPoint(aim)` is `#map-canvas` (a hover must not land on a panel) |
| P.aim | the world point derived from the app's report is the intended target |
| P.pre | before F7 the player is not at the target on either axis |
| P.hover | hovering alone does not move the player |
| P.view | the camera did not move between the expectation's read and the key |
| P.x, P.y | **the claim**: `Player_1` x/y in RAM equal the derived world pixel |
| AB | the two landings differ by exactly the distance between the two cursor points |

The targets are A = (1024, 96) at zoom 1 and B = (1801, 429) at zoom 0.5. These are row 140's points: high in the act, in open air, with non-round deltas.

## 4. The measurement, per run

Every run: `root:` is the worktree, `pinned: AURORA_BUILT_TREE=<worktree>`, build flavour DEBUG, app act `ojz/act1` grid 3x3, engine clamp edges (6120, 5920).

| run | build | dpr | canvas rect (left, top, w x h) | aim A / aim B | result |
|---|---|---|---|---|---|
| first-1 | base | (aborted before geometry: `aeon.open`'s promise collected, see §7) | | | HARNESS ABORTED, 6/6 before it |
| first-2 | base | 1 | 284, 74, 876x721 | (634,170) / (634,288) | 24/24 |
| first-3 | base (+ hit rows) | 1 | same | same | 26/26 |
| green 1 to 3 | base (+ `SCALE` option, uncommitted) | 1, 1, 1 | same | same | 26/26 each |
| green 1.35 | same | 1.350000023841858 | 283.993, 73.993, 721.19x601.06 | (572,169) / (572,288) | 27/27 |
| **final 1** | `60ef75f8` rebuilt clean | 1 | 284, 74, 876x721 | (634,170) / (634,288) | **26/26** |
| **final 2** | same | 1 | same | same | **26/26** |
| **final 3** | same | 1 | same | same | **26/26** |
| **final 4 (`SCALE=1.35`)** | same | 1.350000023841858 | 283.993, 73.993, 721.19x601.06 | (572,169) / (572,288) | **27/27** |

The final runs print this:

```
A: aim (634,170) -> world (1024,96) -> engine (1024,96)  delta (0,0)
B: aim (634,288) -> world (1801,429) -> engine (1801,429)  delta (0,0)
```

At dpr 1.35 the view comes back as `{"x":735.9930419921875,"y":0.9930496215820312,"zoom":1}` for A and `{"x":1224.986083984375,"y":0.9860992431640625,"zoom":0.5}` for B. That view cancels the fractional canvas origin, and the derived world point is exact (residual 0).

On this host, native Xvfb came up at dpr 1 in every run. The fractional case is covered only because `SCALE=1.35` forces it. Row 2d asserts that the forced dpr took effect.

## 5. Red-first

Each mutation was planted on disk and shown with `git diff`. `VITE_AURORA_DEBUG=1 npm run build` then rebuilt the tree, the harness ran red, and the file was restored with `git checkout <committed sha> -- <file>`. Each red run printed the mutated landing, so the runner was running the patched build.

The first round ran against committed baseline `b4819f9b`. A second round ran against the final harness at committed baseline `60ef75f8`, because the `SCALE` option was added after round 1. The runs without `SCALE` launch the same way as before; the second round re-establishes the result on the committed file anyway.

**M1: `warpTargetFor` pinned to a constant** (`src/core/aether/warp-math.ts`)

```diff
-  const ax = Math.round(worldX);
-  const ay = Math.round(worldY);
+  const ax = 1024; // RED-FIRST MUTATION M1: warpTargetFor pinned to a constant (point A's x)
+  const ay = 96;   // RED-FIRST MUTATION M1: warpTargetFor pinned to a constant (point A's y)
```

```
A: aim (634,170) -> world (1024,96) -> engine (1024,96)  delta (0,0)
B: aim (634,288) -> world (1801,429) -> engine (1024,96)  delta (-777,-333)
23/26 rows passed — FAILED: B.x, B.y, AB
```

Round 1 and round 2 (dpr 1) gave identical results. **Point A passed under a constant.** A harness with one point would have been green.

**M2: +8 x in the F7 path** (`src/renderer/components/MapViewport.tsx`, the F7 branch)

```diff
-        const target = warpTargetFor(world.x, world.y, {
+        const target = warpTargetFor(world.x + 8 /* RED-FIRST MUTATION M2: +8 x in the F7 path */, world.y, {
```

Round 1 (dpr 1): `24/26 — FAILED: A.x, B.x` (engine 1032 against 1024, and 1809 against 1801).
Round 2 (`SCALE=1.35`, dpr 1.350000023841858): `25/27 — FAILED: A.x, B.x`, with the same deltas (8,0).

**M3: `/ zoom` dropped from `screenToWorld`'s x.** This mutation tests the header's claim that zoom 1 alone cannot see a missing `/ zoom`.

```diff
-      x: vpX + (clientX - rect.left) / zoom,
+      x: vpX + (clientX - rect.left) /* RED-FIRST MUTATION M3: the / zoom dropped */,
```

```
A: aim (634,170) -> world (1024,96) -> engine (1024,96)  delta (0,0)
B: aim (634,288) -> world (1801,429) -> engine (1451,429)  delta (-350,0)
24/26 rows passed — FAILED: B.x, AB
```

Round 1 and round 2 gave identical results. A (zoom 1) passes, as the claim predicts.

**Which rows do not discriminate.** `AB` stays green under M2: a constant offset cancels out of a difference. The identity rows `A.x` and `B.x` catch it. The `.y` rows stay green under M2 and M3 because both mutations touch only x. The gate and anti-vacuous rows are green under every mutation, which is correct: they describe the setup, not the claim.

## 6. `npm test` (whole chain, `VITE_AURORA_DEBUG` unset, `VITEST_MAX_WORKERS=4`, foreground)

* before (`44ba3d7f`): Test Files 671 passed | 3 skipped (674), Tests 10468 passed | 18 skipped (10486), exit 0
* after (harness and packet on the branch): Test Files 671 passed | 3 skipped (674), Tests 10468 passed | 18 skipped (10486), exit 0

The totals are unchanged by design. The harness is not a vitest row, because it needs xvfb, a built `oracle-aether` and aeon's DEBUG ROM. `check-harness-guards` (inside `npm test`) classifies the new file and passes.

## 7. Observations, not acted on

* **`__dbg.aeon.open(dir)`'s promise is collected in every run** (`Runtime.evaluate: Promise was collected`), yet the project is open when the state poll reads it. Something reloads or discards the renderer context around the first open after launch. The harness waits for `__dbg`, calls open, and gates on `__dbg.aeon.state()`. It does not trust the promise. Not investigated further.
* **`oracle-aether` is SIGKILLed at teardown** (`cleanup: SIGKILLed 1` for the emulator's one-process tree, in every run). Either it does not act on SIGTERM or it takes longer than `killTree`'s window. Nothing survives.
* **The toast is truthful.** It reads `Warped to (1024, 96)` and `Warped to (1801, 429)` (success). It is printed as a NOTE and never used as evidence.

## 8. Rejected

* **An expectation built from `warpTargetFor`'s output.** The request and the expectation would move together. M1 shows why it matters.
* **`loadSymbols` from the observer.** It would give the app symbols that a real session does not have (§2).
* **Reading `sst.emp` through `git show <rev>:<path>`, as the brief described.** The listing's `EQU` lines, bound to the ROM by the digest crc, answer the question for the exact build that is running. Any source revision is at best a guess at what the ROM was built from: the ROM predates aeon HEAD by hours, and HEAD moved twice during this parcel. The only aeon git reads are `git log` lines printed for provenance.
* **Clicking the Aether badge to connect.** The harness calls `__dbg.aether.connect()`, the same store action the badge calls. Connecting is setup here, not the subject. Rows 2b and 2c gate on its result.

## 9. What this closes, and what stays open

This closes the MAPVIEWPORT-UNTESTED item **"the warp's landing in the running game"**.

It **does not close the row.** The row's latest ledger line (2026-09-12T05:18:14Z, map-coverage-6) still lists these as FOREGROUND-ONLY items besides this one:

* in the running app, a clicked Plane button keeps focus through a press on the map, Tab reaches the other button, and Space fires it without ending the drag
* the stamp ghost during a link hover
* the Chunk links panel on screen
* the Effects-facet-gated guide drag
* the screen frame's locked-scene arm, and resolveEscape's lens arm
* the paste ghost
* the collision hover preview
* the band preview
* the hover bar's legibility

It also lists these BEHAVIOUR QUESTIONS: O1 and O2 from map-coverage-6, the stamp press not refreshing the link hover, and map-coverage-4's three. If any of those have been closed elsewhere, the ledger does not say so, and this parcel did not re-measure them.
