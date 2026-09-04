# O78-RESIDUAL-72 — the residual closed by census, and two claims of the packet corrected

**Branch** `parcel/o78-residual-census`, cut from `master` `ad4d2bda`.
**Subject** `docs/reviews/2026-09-03-o78-harness-exit-code.md` §9: *"The other 72
self-killing harnesses were not run… I did not measure the other 72 and do not
extrapolate to them."*
**Deliverables** this file and `docs/reviews/2026-09-04-o78-residual-census.json`.
**Instrument** `scratchpad/o78-reap-trace-{register,loader}.mjs`,
`scratchpad/o78-reap-trace-control.mjs`, `scratchpad/o78-census-run-one.sh`,
`scratchpad/o78-census-prove-tell.sh`. No app source and no library source changed.

---

## 0. The answer, in one sentence

**36 of the 133 registered harnesses reach the X reaper with their process tree
still alive — 35 of the 37 `killTree` callers and 1 of the 79 self-killers —
so the packet's residual is closed by measurement rather than inference, and
both of its structural claims need amending: `killTree` is not sufficient, and
self-killing is not safe.**

## 1. THE COUNTEREXAMPLE — "deterministically affected by construction" is not deterministic

The packet's §4:

> **Deterministically affected by construction: the 32 harnesses that call
> `killTree`/`killTreeSync` themselves** — the pre-signal capture is not
> conditional on timing. 4 sampled, 4 affected, 0 counterexamples.

**Two of the 37 `killTree` callers are counterexamples: `harness:ozone-x11` and
`harness:canvas-cdp`.** Both launch an app, both call `killTree`, both run
green, and neither reaches the reaper with a live tree. Their own teardown
lines say why:

```
ozone-x11   cleanup: tree under pid 546602 (1 process(es)):
            cleanup: ORDERED — app 0 pid(s) SIGTERMed first, gone in 0 ms;
                     then the wrapper group with the X server absent …
canvas-cdp  cleanup: tree under pid 118357 (1 process(es)):     (×4 sessions)
            cleanup: ORDERED — app 0 pid(s) SIGTERMed first, gone in 0 ms;
                     then the wrapper group with the X server absent …
```

`1 process(es)`, `app 0 pid(s)`, `X server absent`. The tree had **already
exited on its own** before the teardown ran, so the pre-signal capture read an
already-dead tree, found no `XAUTHORITY` in any descendant's environ, and
claimed nothing. `ozone-x11` deliberately runs short-lived probe launches;
`canvas-cdp` runs four sessions whose app is gone before each teardown.

The packet's *discriminator* is right and its *proxy* is wrong. The question is
the one it states in §3 — **does the teardown reach the X reaper while the
process tree is still ALIVE** — and "calls `killTree`" is a proxy for it that
holds 35 times in 37 and fails twice. Calling `killTree` guarantees the capture
is *pre-signal*; it does not guarantee there is anything alive to capture.

## 2. The other correction: a self-killer IS affected, and it is a RACE

`harness:bganim-insert-roomy` is a self-killer — it imports `killTree` and
never calls it — and one run printed the tell:

```
cleanup: X artifacts reaped (3): /tmp/.X690-lock /tmp/.X11-unix/X690 /tmp/xvfb-run.3VXOsl/
cleanup: X artifact REFUSED — /tmp/xvfb-run.g0FR08 — INHERITED (not claimed):
         our own XAUTHORITY names it, so it is an outer xvfb-run's tempdir and its Xvfb is still up
```

**It does not reproduce on demand, and that is the more useful half of the
result.** Four runs of the same harness:

| run | rows | exit | seconds | tell |
|---|---|---|---|---|
| sweep (primary) | 25/26 | 1 | 86 | **REFUSED — INHERITED** |
| repeat 1 | 38/38 | 0 | 36 | none |
| repeat 2 | 38/38 | 0 | 36 | none |
| repeat 3 | 38/38 | 0 | 35 | none |

The affected run took a **different path**: it failed a row and aborted at 26
rows instead of completing 38. Its teardown is a bare
`process.kill(-child.pid, 'SIGTERM')` followed by a **fixed** `await sleep(1500)`
with no `SIGKILL` escalation and no check that the tree is gone
(`bganim-insert-roomy-harness.mjs:504-506` and `:546-548`). The packet's clean
example, `d27-effects-focus`, escalates to `SIGKILL` and then **polls
`portFree()`** until the port is actually released
(`d27-effects-focus-harness.mjs:842-847`). **A fixed-duration wait is not a
wait; only a verified one is.**

**The consequence applies to this census as much as to the packet.** One clean
run of a self-killer does not establish that it is unaffected. That caveat
covers the packet's 6/6 and all 74 of my own negative rows equally, and it is
why §5's floor/ceiling language below is worded the way it is.

## 3. Step 1 — the population, re-derived, and the delta

Every `harness:*` script in `package.json`, resolved to its `scratchpad/*.mjs`
file, classified on source with `//` and `/* */` comments stripped (strings and
template literals respected).

| | packet, 2026-09-03 | measured, 2026-09-04 | delta |
|---|---|---|---|
| `harness:*` scripts | 126 | **133** | +7 |
| launch an app (`spawnGuarded`) | 110 | **116** | +6 |
| call `killTree`/`killTreeSync` | 32 | **37** | +5 |
| self-kill, rely on the exit net | 78 | **79** | +1 |
| never launch | 16 | **17** | +1 |

`37 + 79 + 17 = 133`. Nothing unresolved, no missing file. **The delta is about
the packet's age, not its accuracy** — the population moved by 7 scripts in one
day.

**The comment-stripping trap is far bigger than the packet's "two files".**
**19 of the 133** name `killTree()` only inside a comment, and several of those
`import { spawnGuarded, killTree }` without ever calling it. An unstripped grep
puts all 19 in the `killTree` class and inflates it from **37 to 56**.

The 17 non-launchers cannot reach the reaper, and this is structural rather
than measured: `installNet()` (`harness-guard.mjs` ~1044) loops only over
children registered by `spawnGuarded`, so with none registered
`killTreeSync`/`reapDisplays` is never called.

## 4. The instrument, and why the obvious method could not have answered this

**The affirmative tell is blind on the exact class this parcel exists to
census.** `killTree` calls `reapDisplays` loudly, which is why the packet could
read `cleanup: X artifact REFUSED` off `band-preset`. The exit net does not:

```js
// harness-guard.mjs:900, killTreeSync
const reaped = art ? reapDisplays(art, { quiet: true }) : null;
```

A sweep that read the absence of that line as "unaffected" would have reported
**all 79 self-killers clean while covering none of them** — partial coverage
that goes green in the corner it cannot see.

**The instrument** is a Node module loader (`--import`) that rewrites the reap
call sites in memory to `{ quiet: false }`. Nothing in the repo changes;
printing only — no deletion, attribution or signalling decision is touched. It
prints `NOT PATCHED` on stderr if a site moves, and the runner records
`MARK_LOADER=ABSENT/FAILED` so such a row is `UNMEASURABLE`, never a negative.

**Proved in five legs** (`npm`-free, each one run under a real outer
`xvfb-run -a`), and the loader-v1 column is a genuine red:

| leg | shape at the reaper | v1 | v2 |
|---|---|---|---|
| `live`, no loader | `root=S descendants=3 inherited=[…]` | 0 | 0 |
| `live`, loader | same live tree | **1** | **1** |
| `dead`, loader | `root=Z descendants=1 artifacts={}` | 0 | 0 |
| `quietkill`, no loader | live tree, `killTree(child,{quiet:true})` | 0 | 0 |
| `quietkill`, loader | same | **0 ← RED** | **1 ← GREEN** |

Leg 1 *is* the blindness, measured rather than argued. Leg 3 is a real negative
and not a blind one — its artifact set is empty at the reaper. The v1 baseline
was restored with `git stash push` of the loader from the committed tree, not
`git checkout --` on a dirty tree.

### Four instrument defects found on the way, each of which would have manufactured a false answer

1. **Tempdir survival must be stat'd INSIDE the wrapper**, after the command
   returns and before the wrapper's epilogue. From outside it reads `NO` on
   every healthy run, because a healthy `xvfb-run` deletes its own tempdir.
2. **The control's first version never reached the exit net with a live tree.**
   An un-unref'd `ChildProcess` handle holds the event loop open, so node
   waited the full 25 s for `sleep` to finish (`child 'exit' event t=28009`)
   and the net ran over a tree that had died of old age. The positive leg was
   green with the patch applied — a runner defect, not a pass. A harness
   reaches the net with a live tree only by exiting explicitly, which is what a
   harness does after printing its tally.
3. **`alive()` is TRUE for a zombie**, so the first negative leg reported "tree
   dead: false" about a `SIGKILL`ed wrapper with no live descendants. The
   control now reports the descendant set the reaper actually reads.
4. **Loader v1 patched only `:900`.** `killTree` reaps as
   `reapDisplays(art, { quiet })`, forwarded from the caller, and five
   registered harnesses pass `quiet: true` — `capture`, `shell-flip`,
   `tool-split`, `guard-proof`, `xvfb-reap`. Under v1 all five looked
   unaffected. **The packet names this blind spot for `capture-harness` in its
   own §9; I read it and did not carry it into the instrument.** Under v2 all
   five are `REFUSED=YES`.

### And two defects in the rig, not the harnesses

The first 19 rows of the first sweep were thrown away and everything re-run,
because reading the rows instead of the aggregate showed my own rig failing
them:

- **Cross-device hard link.** The per-run `AEON_DIR`/`S1DISASM_DIR` copies were
  on `/tmp` (tmpfs) and the repo is on ext4. Harnesses materialise their own
  fixture into `$AEON_DIR` with `cp -al` out of `scratchpad/fixtures/`, which a
  cross-device target makes impossible (`Invalid cross-device link`). Seeds
  moved to `/home/volence/sonic_hacks/.o78-census`.
- **No `.git` in the copy.** `classic-playtest` runs `git status --short`
  inside it. The seeds now keep `.git`; only `.claude` is excluded.

A fresh copy is re-materialised per run, so the harnesses that refuse a reused
copy by design (`section-raster-select`) are satisfied, and no variable ever
pointed at a peer's live tree.

## 5. The census

Every one of the 133 was run under `xvfb-run -a npm run <harness>` with
`ELECTRON_BIN` set to the main checkout's binary. **The counts sum to the
step-1 population by class.**

| class | reached the reaper ALIVE | did not | UNMEASURABLE | total |
|---|---|---|---|---|
| `killTree` caller | **35** | 2 | 0 | **37** |
| self-killer | **1** | 74 | 4 | **79** |
| never launches | 0 | 17 | 0 | **17** |
| **total** | **36** | **93** | **4** | **133** |

- The 2 are §1's counterexamples, `ozone-x11` and `canvas-cdp`.
- The 1 is §2's `bganim-insert-roomy`, on 1 of its 4 runs.
- The 17 are structural (§3), not a measured silence.
- **36 is a floor, not a ceiling**, for the reason in §2: a negative row is one
  run, and one run of a self-killer does not establish safety.

### The 4 UNMEASURABLE rows, itemised — never a pass and never a zero

| harness | why |
|---|---|
| `harness:camera` | capped: killed at the 900 s run timeout (also at 240 s) |
| `harness:crash` | capped: killed at 900 s — it was passing (`20/20 act switches, no crash`) and had not finished |
| `harness:restore` | capped: killed at 900 s |
| `harness:bganim-motion` | dies in 4 s on a fixture absent from this checkout — `ENOENT … scratchpad/fixtures/aeon-bganim-coherent/games/sonic4/data/editor_bg_override.json` — before `harness-guard` is imported, so the tell cannot print either way |

A capped run's log aggregates clean; none of these is read as a pass.

### Rows that needed a second run, and why — disclosed rather than folded in

- **5 quiet-`killTree` harnesses** were re-run under loader v2 (§4 defect 4).
  All 5 flipped to `REFUSED=YES`.
- **7 harnesses died in 3-4 s** on `HARNESS ERROR: dist/ is STALER than src/ in
  /home/volence/sonic_hacks/aurora` — the borrowed main checkout's
  `src/renderer/providers/effects-aeon.ts` was edited by another session
  **during** the sweep, 5532 s ahead of its `dist/main/index.mjs`. This
  worktree has no `node_modules/.bin/electron`, so `isRunnableTree` sends every
  harness to the main tree's build (`scratchpad/lib/run-root.mjs:271-295`). All
  7 were re-run after the drift cleared: `base-swap-control`, `ramp-control`,
  `ramp-scroll-mode`, `chunk-links`, `collision-say-both`,
  `composer-collision-gesture`, `composer-priority` — **all 7 `REFUSED=YES`**.
  Had the two re-runs not been done, the first sweep's 8 `killTree` rows that
  did not print the tell — `base-swap-control`, `canvas-cdp`, `capture`,
  `ozone-x11`, `ramp-control`, `ramp-scroll-mode`, `shell-flip`, `tool-split`
  — would have been reported as 8 counterexamples. Six of the eight were
  artefacts: three of my instrument, three of the borrowed tree drifting. Two
  were real.

Every timing figure above was taken with the box at `up 9 days, 15:36`
through `up 9 days, 18:22`; load average ranged `4.29 6.79 7.23` to
`10.55 11.53 10.41` across the sweep, and the per-row `uptime` is in the JSON.

## 6. What this does and does not say about the fix

Nothing here re-tests the O78 fix; it censuses **who would have needed it**. On
the population as it stands today the fix's blast radius is **36 harnesses
measured, of 133**, against the packet's estimate of "at least the 32 that tear
down with `killTree`, measured on 4". The estimate was the right shape and the
wrong membership at both edges: 2 of the `killTree` class never needed it, and
at least 1 harness outside that class did.

No emulator was touched. Several harnesses (`classic-playtest`,
`live-palette-e2e`, `warp-tearing`, `palette-push`, `boot-override`,
`aether-method-gate`) spawn **their own** headless `oracle-aether` on a private
`ORACLE_SOCKET` with their own ROM; no `mcp__oracle__*` tool was called and no
shared or on-screen instance was attached. Verified across every file naming
`ORACLE_SOCKET`.

## 7. This parcel's own instruments, held to the repo's gates

Both gates that police `scratchpad/` were run against the files this parcel
adds, and both failed them first.

- **`node scripts/check-peer-path-literals.mjs`** flagged **6 executable lines**
  in the two `.sh` files under `sibling-literal` and `session-scratchpad` — an
  absolute `/home/…` naming the suite root, and a line naming this agent
  session's own tmpdir, which stops existing when the session does. Both
  scripts now spell the suite's four steps in-file the way
  `scratchpad/handover/run-handover.sh` does, and `ELECTRON_BIN` is an override
  over a derived default that **refuses loudly** when the binary is absent. The
  gate now reports **0 hits in `scratchpad/o78-*`**. It still fails repo-wide
  with 37 lines, none of them mine: all are in the untracked
  `scratchpad/fixtures/aeon-band-art-fg/`, mtime `2026-09-03 22:29`, before
  this branch existed.

- **`node scratchpad/check-harness-guards.mjs`** failed both scripts under rule
  **S1** — a `.sh` that starts `xvfb-run`/`electron` itself must trap EXIT
  **and** INT **and** TERM. Neither had a trap at all, and the leak was real:
  an interrupted run left the display lock, the socket, the wrapper tempdir and
  ~330 MB of per-run copies behind, which this sweep did repeatedly. Both now
  trap all three, signal the wrapper's group, and remove what they own. Gate:
  **206 clean / 206, 0 failures** (was 204/206, both failures mine).

  Proven in both directions on a genuinely interrupted run — no `MARK_DONE` in
  either log, so the normal exit path did not do the cleaning:

  | | exit | tempdir | aeon copy | s1 copy |
  |---|---|---|---|---|
  | with the trap | 143 | gone | gone | gone |
  | `trap _cleanup EXIT INT TERM` → `:` | 143 | **left** | **left** | **left** |

  **The first version of that test was wrong and looked right.** It signalled
  with `SIGINT`, and a background job in a non-interactive shell inherits
  `SIG_IGN` for INT — a signal ignored on entry cannot be trapped. The run
  simply finished (`MARK_DONE` present, 30 s) and the normal path cleaned up,
  which is indistinguishable from the trap working. `SIGTERM` is not ignored
  that way, and the `MARK_DONE` count is what tells an interrupted run from a
  finished one.

### Reproducing the census

```sh
VITE_AURORA_DEBUG=1 npm run build            # a plain build has no debug hooks
rsync -a --exclude=.claude <suite>/aeon/     $O78_SEEDS/aeon-seed/
rsync -a --exclude=.claude <suite>/s1disasm/ $O78_SEEDS/s1-seed/
sh scratchpad/o78-census-prove-tell.sh <logdir>            # the instrument's 5 legs
sh scratchpad/o78-census-run-one.sh <name> <logdir> <workdir> [timeout]
```

`O78_SEEDS` defaults to `<suite root>/.o78-census` and is a hard error when
absent, not a skip. The seeds must be on the same filesystem as this repo (§4).

## 8. Open, and tagged

- **TAGGED for foreground follow-up — `harness:camera`, `harness:crash`,
  `harness:restore` do not finish in 900 s** under `xvfb-run -a npm run`.
  `crash` was demonstrably making progress when killed. Nothing about this
  parcel's question can be answered for them from a killed run.
- **`bganim-insert-roomy`'s teardown is the real defect this census found**: a
  fixed `sleep(1500)` with no escalation and no verification, where
  `d27-effects-focus` escalates and polls. Not fixed here — this parcel
  measures, and changing a harness's teardown mid-census would have invalidated
  the rows already taken. Worth a row of its own.
- **The negative rows are single runs.** A stability pass — every self-killer
  run 3× — would turn the 36 floor into something closer to a number. Not paid
  for here, and §2 is the reason it is worth paying for.
- **`bganim-motion`'s fixture is absent from this checkout**; it is red for a
  reason that has nothing to do with this defect.
- The packet's own open item, `harness:xvfb-reap`'s `[s*]`/`[g1]` flake under
  load, is untouched.
