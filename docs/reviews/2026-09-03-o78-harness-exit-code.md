# O78 — a green harness that reports RED to anything reading its exit code

**Branch** `fix/o78-harness-exit-code`, cut from `master` `68c35aff`.
**Subject** `npm run harness:band-preset` prints `44 rows, 0 failed` and the
command a sweep ran exits **1**.
**Files changed** `scratchpad/lib/harness-guard.mjs`, `scratchpad/xvfb-reap-proof.mjs`.
No app source changed.

---

## 0. The one-line answer

**The harness's own exit code was never wrong. It exits 0.** The `1` is produced
by the **outer `xvfb-run`**, minutes after it captured `RETVAL=0`, because the
harness's teardown had **deleted that wrapper's own `Xauthority` file**.

## 1. Reproduced, and localised in one run

`AEON_DIR` pointed at a throwaway copy of `../aeon`; app built with
`VITE_AURORA_DEBUG=1 npm run build`; box uptime `9 days, 4:36`, load average
`6.54 8.91 8.82`.

```
xvfb-run -a  <script that runs `npm run harness:band-preset` and echoes $?>

  OUTER_DISPLAY=:287
  XVFB_BEFORE:  2438930 Xvfb :287 -screen 0 640x480x24 -nolisten tcp
  NPM_EXIT=0                     ← the harness. 44 rows, 0 failed.
  XVFB_AFTER:   2438930 Xvfb :287 …   ← the outer X server is STILL RUNNING
  OUTER_EXIT=1                   ← what a sweep reads
```

`NPM_EXIT=0` with `OUTER_EXIT=1` settles it before any theory: nothing signalled
the harness, and no exit-code path inside it is involved. The failure is
downstream of the harness, in the wrapper's own epilogue.

**The prior record's cause is wrong, and this is why it matters.**
`docs/reviews/2026-09-03-harness-red-sweep.md` §8 says:

> `xvfb-run` returns non-zero when its X server has already gone
> (`kill: (…) - No such process`) *after* a harness has printed
> `20/20 rows passed`.

That names `kill $XVFBPID` at `/usr/bin/xvfb-run:185`. **The X server had not
gone** — pid 2438930 is in the `XVFB_AFTER` line above, alive, on the same
display. §8's *symptom* was right and its *mechanism* was not, and a mechanism
that is not the mechanism is why the row survived as "teardown noise" instead of
being fixed.

## 2. The mechanism, named

The next run instrumented the wrapper's own environment:

```
OUTER_XAUTHORITY=/tmp/xvfb-run.Lcc8Qz/Xauthority.fYDqRu
OUTER_TMPDIR=/tmp/xvfb-run.Lcc8Qz  exists=yes
… npm run harness:band-preset → NPM_EXIT=0
AFTER OUTER_TMPDIR=/tmp/xvfb-run.Lcc8Qz  exists=NO           ← deleted
harness log line 125:
  cleanup: X artifacts reaped (1): /tmp/xvfb-run.Lcc8Qz/     ← by name
replayed by hand:
  xauth: error in locking authority file /tmp/xvfb-run.Lcc8Qz/Xauthority.fYDqRu
  XAUTH_REMOVE_EXIT=1
OUTER_EXIT=1
```

The chain, every link measured:

1. `xvfb-run -a` mints `/tmp/xvfb-run.Lcc8Qz/`, puts its `Xauthority` in it, and
   runs the command as `DISPLAY=:287 XAUTHORITY=/tmp/xvfb-run.Lcc8Qz/Xauthority.fYDqRu "$@"`
   (`/usr/bin/xvfb-run:150-180`). **That variable is exported to the command.**
2. The harness inherits it. Harnesses build the child env as
   `{ ...process.env, … }` and then `delete env.DISPLAY` — **`DISPLAY` is
   removed, `XAUTHORITY` is not**. So every process in the harness's *own* tree
   carries the *outer* wrapper's `XAUTHORITY`.
3. `displayArtifacts()` read `XAUTHORITY` out of `/proc/<pid>/environ` for each
   process in our tree, stripped the filename, matched `XVFB_TMPDIR_RE`, and
   **called the directory ours**.
4. `reapDisplays()` `rm -r`'d it.
5. The outer wrapper then reached its epilogue and ran
   `XAUTHORITY=$AUTHFILE xauth remove ":$SERVERNUM"` at `:188` against a file
   that no longer existed. `xauth` exits 1. **`set -e`** — armed at `:26`,
   re-armed at `:182` — aborts the script **before `exit $RETVAL` at `:197`**.
   The wrapper exits 1 with `RETVAL` still holding 0.

**This is the `DISPLAY` trap one field over.** The docstring above
`displayArtifacts` already forbids taking a display number from an environment
variable, *"which our own process may have inherited from the desktop and which
would therefore name `:0`"*. The same reasoning was never applied to
`XAUTHORITY`, which is inherited by exactly the same mechanism.

It is not only an exit code. Deleting a live wrapper's `Xauthority` while its
`Xvfb` is up breaks X authentication for anything else that wrapper still has to
run.

### It is library-level, not band-preset-level

A 4-second synthetic with no Electron — `spawnGuarded('/usr/bin/xvfb-run', […,
'/usr/bin/sleep', '25'])` then `await killTree(child)` — reproduces it exactly:

```
SYNTH inherited XAUTHORITY = /tmp/xvfb-run.iXFpMq/Xauthority.XRimyE
SYNTH tmpdirs claimed = ["/tmp/xvfb-run.iXFpMq","/tmp/xvfb-run.QtvJeS"]
SYNTH outer dir claimed?  true
cleanup: X artifacts reaped (1): /tmp/xvfb-run.iXFpMq/
SYNTH outer tmpdir survives?  false
NODE_EXIT=0        OUTER_EXIT=1
```

Two tempdirs are claimed: the inner one we really own, and the outer one we
merely inherited.

## 3. What distinguishes an affected harness from an unaffected one

**Not `-n` vs `-a`, and not the harness's own exit-code style.** The
discriminator is:

> **Does the teardown reach the X reaper while the process tree is still
> ALIVE?**

`displayArtifacts` must be called *before the first signal* (its own docstring
says so, for a good reason — after that the children reparent and cannot be
attributed). So the environs it reads are read while the tree is up, and the
inherited `XAUTHORITY` is there to be found.

| teardown shape | reaper sees | affected |
|---|---|---|
| `await killTree(child)` / `killTreeSync(child)` — the capture is pre-signal **by construction** | a live tree | **yes** |
| harness signals `-child.pid` itself and waits, then the exit net's `killTreeSync` runs | a tree already dead → no environ to read → nothing claimed | no |
| never launches an app | never calls the reaper | no |

That is why `harness:d27-effects-focus` was clean under the same outer wrapper:
its `finally` is a hand-rolled `process.kill(-child.pid, 'SIGTERM')`, a 500 ms
wait, `SIGKILL`, and then a poll on `portFree()`. By the time the exit net runs,
`descendants(child.pid)` is empty.

## 4. Blast radius — measured, and the 101 figure CORRECTED

### The 101 is real, and it is a count of something else

The queue row said *"O50 classified 101"*. Traced:

- `docs/reviews/2026-09-03-harness-registration.md` (**O49**) — *"the 101
  harnesses nobody could run by name"*: 145 tracked instruments, 44 registered,
  **101 unregistered**. ROADMAP row 115.
- `docs/reviews/2026-09-03-harness-red-sweep.json` (**the O50 sweep**) —
  `"unregistered_population_of_this_sweep": 101`, `"total": 101`. The sweep ran
  **exactly O49's 101 newly-registered files**.

So 101 is **the size of the sweep's population**, never a count of harnesses
hit by this defect. It reached this row by being the nearest number in the
neighbourhood.

### What that same 101-row sweep actually recorded about this defect

Mining its JSON — a contemporaneous, independent, 101-row census:

| sweep verdict × exit code | rows |
|---|---|
| GREEN, exit 0 | 45 |
| **GREEN, exit 1** | **2** |
| RED, exit 1 / 2 / 124 | 20 / 5 / 3 |
| UNRUNNABLE, exit 1 / 2 / 124 | 7 / 4 / 3 |
| NOT RUN | 12 |

The two are `scratchpad/animated-art-harness.mjs` and
`scratchpad/chunk-links-harness.mjs`, and the sweep's own `reason` field names
this defect in as many words: *"harness tally: 20/20 rows passed (process exit 1
— teardown noise from the xvfb wrapper, after every row had passed)"*.

**On the sweep's own population and configuration the blast radius was 2, not
101.** The RED and UNRUNNABLE rows cannot be disentangled — a masked green
inside them would be invisible — so 2 is a floor for that run, not a ceiling.

### My own controlled sample — 10 harnesses, all three shapes

Population today: **126** registered `harness:*` scripts; **110** launch an app
through `spawnGuarded`; **16** never launch anything. Structural classification
with comments stripped (an earlier pass matched a `killTree()` *inside a
comment* and mis-sorted two files): **32** call `killTree`/`killTreeSync`
themselves, **78** self-kill and rely on the exit net.

Sample run under `xvfb-run -a npm run <harness>`, before and after the fix:

| harness | class | outer exit BEFORE | outer exit AFTER |
|---|---|---|---|
| `harness:band-preset` | killTree | **1** (44 rows, 0 failed) | 0 |
| `harness:capture` | killTree | **1** (all checks pass) | 0 |
| `harness:collision-read` | killTree | **1** (32/32) | 0 |
| `harness:loop-paint` | killTree | **1** | 0 |
| `harness:d27-effects-focus` | self-kill | 0 (19/19) | — |
| `harness:micro-type` | self-kill | 0 (5/5) | — |
| `harness:numberfield-empty` | self-kill | 0 (13/13) | — |
| `harness:toast-overflow` | self-kill | 0 (15/15) | — |
| `harness:marquee` | self-kill | 0 | — |
| `harness:object-label` | self-kill | 0 | — |

**4 / 4 of the sampled `killTree` callers were affected. 6 / 6 of the sampled
self-killers were not.** Every affected one deleted the outer wrapper's tempdir
(`outer_tmpdir_survives=NO`) while reporting `npm_exit=0`.

### The honest number

**This is a sample, not a census.** 10 of 126 were run under the reproducing
shape; a full census is 110 app-launching runs at 25-45 s each plus fixtures,
and I did not pay for it.

- **Deterministically affected by construction: the 32 harnesses that call
  `killTree`/`killTreeSync` themselves** — the pre-signal capture is not
  conditional on timing. 4 sampled, 4 affected, 0 counterexamples.
- **The 78 self-killers are affected only if their tree is still alive when the
  exit net runs.** 6 sampled, 0 affected. I did not measure the other 72 and do
  not extrapolate to them.
- **The 16 non-launchers cannot be affected**; they never reach the reaper.

**Correction to the row: the blast radius is not 101. It is at least the 32
harnesses that tear down with `killTree`, measured on 4 of them; 101 was O49's
count of unregistered instruments, reused as the O50 sweep's population size.**

## 5. The fix

`scratchpad/lib/harness-guard.mjs`:

- **`inheritedXauthDirs()`** (new, exported) — the `xvfb-run` tempdirs named by
  `XAUTHORITY` in our own env and in every ancestor's `/proc/<pid>/environ`.
  These belong to a wrapper we run **under**.
- **`displayArtifacts()`** no longer claims such a directory. It is not dropped
  silently: it comes back in a new `inherited` field, and `reapDisplays` prints
  a refusal line for it. (`mergeArtifacts` carries the field through the
  `inFlight` merge.)
- **`reapDisplays()` GATE 5** — refuses an inherited tempdir even when handed
  one directly, in its own words. Belt and braces on purpose: a caller may build
  the artifact set by hand, and "somebody else assembled the list" has never
  been a licence to delete in this file.

**Nothing about the O20/O65/O66 machinery changed.** The ordered teardown, the
`ORDERED` line, `killTree`'s pid-or-child acceptance and the four existing gates
are untouched; `xvfb-reap-proof` still passes r0-r2, g1-g4, n1, s1-s2, o1-o6 and
b1-b3, and the reap still removes the dirs it really owns.

**What was NOT done, deliberately:** nothing makes a harness exit 0
unconditionally, and nothing was added to swallow the wrapper's status. The
defect was a real deletion of somebody else's file; the fix is to stop deleting
it.

## 6. Proof, in both directions, across all three invocation shapes

`harness:band-preset`, after the fix. Wall-clock uptime `9 days, 4:49` /
`4:52`; load average `4.45 5.16 6.61` and `3.96 4.79 6.28`.

**Green direction — 44 rows, 0 failed:**

| shape | exit |
|---|---|
| `node scratchpad/band-preset-harness.mjs` | **0** |
| `npm run harness:band-preset` | **0** |
| `xvfb-run -a npm run harness:band-preset` | **0** (was **1**) — harness 0, outer wrapper 0, outer tempdir survives |

**Red direction — row `[6b]`'s threshold mutated `5000` → `5000000`, so the run
completes and its own summary says `44 rows, 1 failed`:**

| shape | exit |
|---|---|
| `node scratchpad/band-preset-harness.mjs` | **1** |
| `npm run harness:band-preset` | **1** |
| `xvfb-run -a npm run harness:band-preset` | **1** — harness 1, outer wrapper 1 |

Two further red runs with the harness's own plants (`PLANT=rot-selector`,
`PLANT=rot-swatch`) exit 1 in all three shapes as well; both abort after their
failing row rather than reaching the tally, which is why the threshold mutation
above is the one quoted — it is the case where the summary itself says
`1 failed`. The mutation was restored with `git checkout --` and
`git status --short` is clean on that file.

## 7. The gate — `xvfb-reap-proof.mjs` rows `[o7]` and `[o8]`

Extends the existing OWNERSHIP section (`npm run harness:xvfb-reap`, registered,
and it is the file that already holds gates 1-4). **22 pass / 0 fail** with the
fix.

- **`[o7]` GATE 5** — a real `/tmp/xvfb-run.XXXXXX` directory is created (fresh
  random name per run, so no plant can eat the fixture), `process.env.XAUTHORITY`
  is pointed into it — *that is not a simulation of being under an outer
  wrapper, it is the condition, read the same way* — and `reapDisplays` must
  refuse it **in the inheritance check's own words** and leave it on disk. The
  fixture matches `XVFB_TMPDIR_RE`, so gate 4 cannot cover for gate 5.
- **`[o8]` ATTRIBUTION, on a real process tree** — one `/bin/sh` with two
  `sleep` children, one carrying the inherited `XAUTHORITY` and one carrying a
  foreign wrapper's. `displayArtifacts` must **not** claim the first, must
  **still** claim the second, and must report the first as `inherited`. Without
  the second half, a fix that claimed nothing at all would pass.

### Red-first, with the mutation shown applied

Mutation 1 — `if (inheritedDirs.has(dir)) {` → `if (false && inheritedDirs.has(dir)) {`,
on disk at `harness-guard.mjs:705`, `git diff --stat` naming the file:

```
FAIL [o7] gate 5 did not refuse an inherited tempdir in its own words
        inheritedXauthDirs saw it: true · removed=/tmp/xvfb-run.U0enB3/ refused= stillOnDisk=false
PASS [o8] …
════ 21 pass / 1 fail ════
```

The fixture was **really deleted** — this is a removal, not a pattern miss — and
`[o8]` stayed green, so the two rows isolate different halves.

Mutation 2 — `if (XVFB_TMPDIR_RE.test(dir)) { if (ours.has(dir)) inherited.add(dir); else tmpdirs.add(dir); }`
→ `if (XVFB_TMPDIR_RE.test(dir)) { tmpdirs.add(dir); }`, on disk at
`harness-guard.mjs:641`:

```
PASS [o7] …
FAIL [o8] attribution is wrong in one direction or the other
        claimedOuter=true (must be false) claimedOurs=true (must be true)
        reportedInherited=false (must be true) · tmpdirs=[…,…] inherited=[]
```

Both are **first runs**. Both mutations were reverted and the file re-verified.

### A pre-existing flake in this proof, not introduced here

The `[s*]` signal rows and `[g1]` are timing-sensitive under load. On **master
`68c35aff`, with my changes stashed**, four consecutive runs gave `19 pass / 1
fail` (`[s2]`), `20/0`, `19/1` (`[s2]`), `20/0`. Not caused by this parcel, not
fixed by it, and named here so the next reader does not spend the hour I nearly
did.

## 8. Suite

`npm test`: **474 test files passed, 2 skipped (476); 6580 tests passed, 8
skipped (6588)**; exit 0; `skip-report: OK — every skip named its reason`.

## 9. Not done / tagged

- **No emulator was touched.** Nothing here needs one.
- **The other 72 self-killing harnesses were not run.** The mechanism says they
  are safe iff their tree is dead by exit-net time; 6 of 6 sampled were. If a
  census is wanted, the cheap discriminator is now in the log: an affected run
  prints `cleanup: X artifact REFUSED — … INHERITED`, except where the harness
  passes `{ quiet: true }` (e.g. `capture-harness`).
- **`harness:xvfb-reap`'s `[s*]`/`[g1]` flake under load** is open and
  pre-existing (§7).
