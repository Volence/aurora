# O50 — the unregistered-harness red sweep

**Branch** `test/o50-harness-red-sweep` · **started** 2026-09-03T04:02:29Z (uptime 8 days 15:51)
**Companion machine-readable file** `docs/reviews/2026-09-03-harness-red-sweep.json`, one row per file.

This is a **triage report, not a fix**. Nothing in the swept set was repaired, and no
`package.json` was edited (a sibling lane owns registration on `fix/o49-harness-registration`).

---

## Why this sweep exists

Twice on the night of 2026-09-02/03 an instrument was found to have been silently
non-functional for days, and both times the *reason it was invisible was the same*: it
was not reachable by a `package.json` script, so no sweep could name it.

- `docs/lane-log.jsonl` @ `2026-09-03T01:38:37Z` — a harness **RED for six days at 30/31**.
  It held a rule overturned on 2026-08-27 at `7ba5a638`. The repair had deliberately dropped a
  parameter so stale call sites would fail to compile — which works for TypeScript and
  **does not reach a `.mjs` harness**. It hid because the two rules agree at `vp.y === 0`,
  only one row of 31 pans, and the harness was not in `package.json`.
- `docs/lane-log.jsonl` @ `2026-09-03T02:31:42Z` — O48 found `crossover-paint` at 12/13 and
  read it as the known reused-copy shape.
- `docs/lane-log.jsonl` @ `2026-09-03T03:03:07Z` — O48c ran it on a **fresh** tree and found
  something sharper: it fails `[2c]`, **its own anti-vacuous row**, on a clean checkout. The
  harness has *never* been runnable on a clean tree; it only ever passed against a tree a
  previous session had painted into, and its own guard is the thing that says so.

The question this report answers is exactly: **which of the 101 unregistered instruments are
red, and which cannot run at all?**

---

## Population, as derived

```
git ls-files 'scratchpad/*-harness.mjs' 'scratchpad/*-probe.mjs' 'scratchpad/*-proof.mjs'
```

(`git ls-files`, not `ls` — the filesystem also carries `.gitignore`d instruments that are
outside this repo's contract, and an agent worktree carries none of them, so the two commands
answer differently. See the count discipline in `scratchpad/lib/run-root.mjs`.)

| | count |
|---|---|
| tracked instruments matching the three suffixes | **145** |
| reachable by a `package.json` script (basename appears in `scripts`) | 44 |
| **unregistered — the population of this sweep** | **101** |

Note the glob is a git pathspec, whose `*` crosses `/`; that is why
`scratchpad/handover/handover-band-harness.mjs` is in the population. It is counted.

---

## Stage 1 — static classification (no launches)

Every one of the 101 was read for **what it needs** before anything was run. The buckets sum
to the population.

| bucket | count |
|---|---|
| needs a live emulator / Aether socket → **NOT RUN (needs emulator)** | **12** |
| needs the owner's display / foreground-only | **0** |
| headless-safe, needs a copy of the **aeon** project tree | 40 |
| headless-safe, needs a copy of the **s1disasm** project tree | 36 |
| headless-safe, needs **both** trees | 8 |
| headless-safe, needs **no** project tree | 5 |
| **total** | **101** |

The 89 non-emulator files are the runnable set.

### The 12 tagged for the overseer's foreground pass — NOT RUN (needs emulator)

These were **not attempted**, per the standing invariant. Several of them spawn a *private*
`oracle-aether` on a `mkdtemp` socket and claim never to touch the default socket chain; that
claim is plausible from the source and is **not** why they were skipped. They were skipped
because the invariant is absolute.

```
scratchpad/band-lens-harness.mjs
scratchpad/band-rate-shift-probe.mjs
scratchpad/band-step-proof.mjs
scratchpad/bo-probe.mjs
scratchpad/boot-override-harness.mjs
scratchpad/bus-probe.mjs
scratchpad/classic-playtest-harness.mjs
scratchpad/init-probe.mjs
scratchpad/live-palette-e2e-harness.mjs
scratchpad/palette-push-harness.mjs
scratchpad/s1-vplayer-spike-probe.mjs
scratchpad/warp-tearing-harness.mjs
```

### Foreground-only: none found

No file in the 101 sets `headless: false`, pins `DISPLAY=:0`, or shells out to `xdotool`.
The whole non-emulator set is written for `xvfb-run`. This is a real finding and not an
absence of looking: the predicate was run over all 101 and returned zero, and the zero is
consistent with every header in the set describing an `xvfb` launch.

---

## Environment facts measured before running

These are the conditions the run stage executes under, recorded because several of them
change what a result means.

1. **This worktree has no `node_modules/` and no `dist/`.** Confirmed by direct test. Every
   harness in the CDP family therefore resolves its run target through
   `scratchpad/lib/run-root.mjs`, whose `resolveRunRoot` **walks up** and lands on the main
   checkout, printing `BORROWED`. The app under test is the main checkout's build, not this
   branch's. That is acceptable for a red sweep *only because this branch changes no
   product source* — it adds two files under `docs/reviews/` and nothing else.
2. **The main checkout carries a debug build.** `dist/renderer/assets/debug-hooks-*.js` is
   present, so `window.__dbg` exists; `dist/main/index.mjs` mtime `2026-09-02 23:17:57 -0400`.
   Without that, every harness here fails in a way that looks like the harness being broken.
3. **`ELECTRON_BIN`.** `node_modules/.bin/electron` does not exist in an agent worktree; on
   this machine the main checkout's is at `/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`.
   That path is an example *for this machine*, deliberately not written into any committed
   default.
4. **Machine load.** 1-minute load average was **14.28** at sweep start with other lanes
   active. Any timing figure below is reported with a wall-clock uptime beside it, and none
   of them should be read as a clean-machine measurement.
5. **`devicePixelRatio` varies between runs on this machine** (observed at both 1 and 1.35
   hours apart in one prior session). Where a row fails only on a fractional-rect
   off-by-one, this report says so as a caveat and does **not** resolve it by re-running
   until it agrees.
6. **Disk free at sweep start:** 577,031,475,200 bytes (537.4 GiB) on `/`.
   `s1disasm` is 49 MB; a fresh copy per destructive run costs about that. The live `aeon`
   tree is 3.3 GB and is never copied wholesale.

---

## Stage 2 — run results

*(Filled in below as batches complete. Until a file has a result here, its verdict in the
JSON is `NOT RUN` with a reason, never `GREEN` and never a zero. A file that was not run is
never green — that is the single property this report exists to preserve.)*

<!-- STAGE2 -->

---

## Standing caveats on how to read this

- **A skip is not a pass.** Every one of the 101 carries an explicit verdict from the closed
  set GREEN / RED / NOT RUN / UNRUNNABLE. `NOT RUN` and `UNRUNNABLE` are first-class results.
- **One run, one claim.** No row's evidence is stitched from two runs.
- **Re-runnability.** Where a harness writes into the project tree it opens, the tree was
  re-materialised fresh for that run, and this report says which ones that was done for.
