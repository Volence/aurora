# The canvas harness's teardown flake — what it actually is, and what I could not reproduce

**Branch** `fix/canvas-harness-teardown-flake`, cut from master `90e134e7`.
**Parcel** the one item O50's triage C measured and deliberately did not fix
(`docs/reviews/2026-09-03-o50-triage-c.md` §3.5, carried open in its §6):
`scratchpad/canvas-cdp-harness.mjs` aborts with a named refusal in ~44% of runs
because the previous session's `localStorage` is not on disk when the next one
boots.

> ⚠ **READ §3 BEFORE §2. THE FLAKE DID NOT REPRODUCE** — 0 trips in 9 runs of
> the **committed master instrument**, unchanged, before anything was touched.
> The mechanism below is measured and certain; the *rate* is not, and no claim
> of a rate improvement is made anywhere in this packet.

**Why an instrument earns time under the standing cut ruling** (instrument work
only where it blocks a shipping item or ships wrong output). **A harness that is
green twice and then red once ships wrong output to every reader who does not
re-run it.** This lane fixed exactly that class twice today — O78, where a green
harness reported failure to any sweep reading exit codes, and the O50 triage,
where nine "product failures" were one shared Chromium profile. O50's own §6
spells out what it was leaving behind: *"this instrument needs a re-run on a
trip. It is green — twice consecutively in its shipping state — but not reliably
green."* **A rig that is green-but-not-reliably-green is a rig nobody can use as
a signal**, and the next reader of a red `canvas-cdp` run cannot tell a real
regression from the coin landing the other way. That is still true, and §4's
second finding — a run that ends at 45% with **exit 0** — is a worse instance of
the same class, found on the way.

**Environment for every figure.** Runs are against **this worktree's own**
`VITE_AURORA_DEBUG=1 npx electron-vite build`, pinned with
`AURORA_BUILT_TREE=<worktree>`; `ELECTRON_BIN` set explicitly to the main
checkout's binary; `xvfb-run` at 1680×1050; `S1DISASM_DIR` a **throwaway copy**
of s1disasm under this session's scratchpad — **the live sibling checkout was
never opened or written to**, and its `.aurora/canvas` is untouched. **No
emulator was touched — no `mcp__oracle__*` call was made.** Every run's uptime
and 1-minute load average are recorded in §3.

---

## 1. The mechanism, named

**Chromium does not write `localStorage` through to disk.** A renderer's
`setItem` mutates an in-memory area owned by the storage service; the leveldb
commit is scheduled on a **rate-limited timer**. Aurora's session persist
subscription (`src/renderer/shell/session-lifecycle.ts`) fires on *every*
session- or workspace-store change and rewrites the whole payload, so a harness
session generates a great many commit batches and buys a correspondingly long
delay.

**How long, measured** — printed per session by an instrument built for this
parcel (a pre-close barrier, since removed; see §2.2), one full run in each of
two arms:

| session | run 1 | run 2 |
|---|---|---|
| A (light — create, draw, save) | 1 713 ms | 1 908 ms |
| B (restart with a canvas active) | 53 980 ms | 54 229 ms |
| C (restart with the PNG deleted) | 48 316 ms | 48 294 ms |
| D (rejected sidecar) | 43 797 ms | 43 791 ms |

**Every busy session's own commit is three quarters of a minute away**, and the
two runs agree to within 25 ms on three of the four — a reproducibility that
rules load out and points at a *budget* rather than a race: the number of commit
batches a scripted session generates is fixed, so the delay it buys is too.

**And the app is gone ~50 ms after `window.close()`.** Measured over 12 launches
with a 50 ms poll: 49–51 ms, every one. (O50 recorded 99 ms; its loop polled at
100 ms, so the two agree — its figure is one poll of granularity, not a
disagreement.) So O50's conclusion about the old `sleep(4000)` is exactly right:
**~3.95 s of watching a process that had already exited, and nobody could have
fixed it by lengthening it.**

### 1.1 ⚠ BUT `window.close()` COMMITS THE AREA — and that is what the open item did not know

The two facts above make a compelling story that is **wrong**, and I built the
wrong fix out of it before measuring the last step. Measured with the same
predicate, on the **pristine master instrument**:

| teardown | the session's last write is on disk afterwards |
|---|---|
| as shipped (`window.close()`, then the ordered kill) | **20 of 20 sessions** (5 runs) |
| with the `window.close()` line **deleted** — a signal alone | **session A true; B, C and D false** (1 run) |

The three that lose it are precisely the three whose own commit is 44–54 s out;
light session A (1.7 s) survives inside `killTree`'s 4 s SIGTERM grace. **So the
close is the mechanism that carries the flush, the idle timer never comes into
it, and there is nothing to wait for.**

### 1.2 What that leaves the flake as

Cause (b) of the harness's own refusal — *"the previous session's flush never
reached disk"* — **is real, is reachable (§1.1's right-hand column constructs it),
and did not occur once in 36 sessions of the shipping teardown.** Cause (a) — the
shared `~/.config/Electron` profile, which 114 call sites in `scratchpad/*.mjs`
call `localStorage.clear()` on and which every Aurora-launching instrument on
this box writes — is the one the refusal already names first, and is the one this
parcel's evidence points at. **I did not prove that, and it is not claimed.**

---

## 2. The fix: verify the artifact, after the process is gone

`scratchpad/lib/storage-flush.mjs`, called from `session()`'s teardown in two
halves:

- **`armFlushCheck`, before the close** — resolve the profile from the still-live
  tree, read the stored session, write a unique marker into the same origin's
  `localStorage`, re-read the stored session (so the marker demonstrably covers
  the app's last write), and record whether Chromium had *already* committed.
- **`settleFlushCheck`, after the window is closed, the tree reaped and the
  teardown settled** — look for those bytes in the profile's
  `Local Storage/leveldb/*.{log,ldb}`. If they are not there, **refuse**, naming
  this teardown and how it went.

**It is split in two because the question has two moments.** The profile can only
be observed from a live tree and the marker can only be written to a live page,
but the answer is only final once the process is gone.

**⚠ The check does not wait and does not retry, on purpose.** The process is
dead; nothing will ever be written again. A bounded retry there would be the
exact mistake O50 diagnosed, with a longer timeout.

**Why a marker proves the session key.** Chromium accumulates an area's pending
writes into **one leveldb `WriteBatch`** and commits the batch, so a later write
cannot land ahead of an earlier uncommitted one to the same area. The check
asserts the ordering rather than assuming it: the stored session is read either
side of the marker and a fresh marker is spent if it moved (three, then a
refusal).

**Why not grep for the session key itself.** The leveldb log is append-only, so
the key's *name* survives on disk long after a `localStorage.clear()`. Its
presence proves nothing about the current value.

**⚠ And that is why the new check is strictly stronger than the guard it backs
up.** `waitRestored` asserts the key is PRESENT at the next boot; a
stale-but-present value passes it. **The negative-control run in §1.1 scored
52/52 with three sessions' last writes lost**, because what survived on disk
happened to still match.

**Cost: none.** The run is 173 s before and after.

### 2.1 The alternative, and why it was rejected

The other candidate was **asking the app to flush before close** — Electron's
`session.defaultSession.flushStorageData()`, which exists for precisely this.
Rejected on three grounds, and the third is decisive:

- **It is a main-process API and CDP reaches only the renderer**, so taking it
  means adding an IPC channel and a handler to the *shipped* app for a harness's
  benefit.
- **It would still need the check.** `flushStorageData()` *requests* a write; a
  call that silently no-ops is indistinguishable from one that worked — the
  vacuous-guard shape `docs/OVERSEER.md` keeps cataloguing (*"can it report its
  own blindness, or does not-looking render as a clean result?"*).
- **§1.1 says there is nothing to ask for.** The close already commits the area,
  20 of 20 sessions. An explicit flush would be a second request for something
  that is already happening, and it would still not tell you whether it worked.

### 2.2 The pre-close barrier: built, measured, and removed

The first fix on this branch (commits `e3b90e96`, `f1225ea0`) **polled the
profile for the marker BEFORE the close**, bounded at 180 s, and refused on
timeout. It worked, and it printed §1's table, which is what broke the
investigation open. It is gone because §1.1 measured what it was waiting for and
found the close pre-empts it: it cost the run **173 s → 320 s** to wait out a
timer that never fires. `storage-flush.mjs` carries the measurement and a ⚠ block
so it is not added back.

**A forcing step tried inside it and recorded so it is not re-tried**
(the way O50 recorded its two): `Page.navigate` to `about:blank` after the
marker, on the theory that dropping the renderer's binding to the area makes the
browser commit immediately. **The right-hand column of §1's table is that arm** —
identical to within 25 ms on three of four sessions, 320 s both ways.

### 2.3 ⚠ THE FALSE ZERO THAT NEARLY BECAME THE FINDING

The first pass of this investigation watched **`~/.config/aurora`** and reported
**0 of 6 flushes surviving, twice, once with a 30 s wait** — clean, reproducible,
and **wholly wrong**. A harness launched as `electron dist/main/index.mjs` gets
Electron's *default* app name, so it writes **`~/.config/Electron`**;
`~/.config/aurora` is the **owner's packaged Aurora's** profile. The tell was a
control relaunch reading the marker back while the watched directory's mtimes had
not moved to the nanosecond.

So the check **observes** the profile rather than naming one: `resolveLeveldbDir`
reads `/proc/<pid>/fd` across `descendants(child.pid)` and takes the database the
launched tree actually holds open (printed every session: *"observed: held open
by the launched tree (11 pid(s))"*), falls back to the `APP_NAMES` candidate list
only when exactly one candidate exists, and **REFUSES between two** rather than
picking. A resolver that picks can reproduce that false zero at any time.

---

## 3. The numbers, as counts over a stated number of runs

Every run below is one whole `node scratchpad/canvas-cdp-harness.mjs`, run
**serially** — the Chromium profile is shared, so parallel runs would pollute
each other, which is cause (a). Uptime and the 1-minute load average are taken at
the start of each run.

### 3.1 BEFORE — the committed master instrument, unchanged

`git show 90e134e7:scratchpad/canvas-cdp-harness.mjs` in the tree, nothing else
altered.

| # | verdict | tally | secs | uptime | load (1m) |
|---|---|---|---|---|---|
| 1 | clean | 52/52, 0 unexercised | 172 | 9d 7:29 | 2.30 |
| 2 | clean | 52/52 | 172 | 9d 7:32 | 3.11 |
| 3 | clean | 52/52 | 171 | 9d 7:34 | 3.57 |
| 4 | clean | 52/52 | 172 | 9d 7:37 | 2.25 |
| 5 | clean | 52/52 | 173 | 9d 7:40 | 3.29 |
| 6 | clean | 52/52 | 172 | 9d 7:43 | 5.59 |
| 7 | clean | 52/52 | 172 | 9d 7:46 | **10.70** |
| 8 | clean | 52/52 | 172 | 9d 7:49 | 1.54 |
| 9 | clean | 52/52 | 172 | 9d 7:52 | 4.68 |

**0 trips in 9 runs.** All 36 sessions reported `window.close() -> app EXITED on
its own` at 99–101 ms.

⚠ **At O50's measured 44%, nine consecutive clean runs happen about 0.9% of the
time.** So this is not a quiet stretch of the same distribution; the rate today
is different from the rate O50 measured, and I do not know why. Candidates I did
not test: their runs were on `test/o50-triage-c` rather than the merged master;
their machine had other lanes on it (mine spiked to load 10.70 in run 7 from
another agent, so the box is shared here too); and the shared profile's leveldb
has been compacted since.

### 3.2 The per-session control — the property the trip rate only samples

The run-level guard fires at most three times a run and only when the *value*
that survived happens to matter. So the **pristine master instrument plus a
read-only diagnostic** — one extra `localStorage` write immediately before the
close, and one `leveldb` read after the process is gone — measures the underlying
property four times a run.

| arm | runs | sessions | last write on disk after the teardown |
|---|---|---|---|
| master teardown, as shipped | 4 completed (of 5) | 16 | **16 true, 0 false** |
| **+ the barrier arm, printed live** | 1 | 4 | 4 true |
| **`window.close()` DELETED** (constructed) | 1 | 4 | **1 true (A), 3 false (B, C, D)** |

Loads 3.48–9.77, uptime 9d 7:55–8:09. The fifth master run is the abort of §4.2,
counted there and not here.

### 3.3 AFTER — the shipped fix, on the committed tree

`6cbd998f` checked out clean; nothing in the tree edited while these ran.

| # | verdict | tally | secs | uptime | load (1m) |
|---|---|---|---|---|---|
| 1 | clean | 52/52, 0 unexercised | 173 | 9d 8:26 | 7.84 |
| 2 | clean | 52/52 | 171 | 9d 8:29 | 3.86 |
| 3 | clean | 52/52 | 173 | 9d 8:32 | 4.28 |
| 4 | clean | 52/52 | 172 | 9d 8:35 | 9.00 |
| 5 | clean | 52/52 | 172 | 9d 8:38 | 2.04 |
| 6 | clean | 52/52 | 172 | 9d 8:41 | 3.70 |
| 7 | clean | 52/52 | 172 | 9d 8:43 | 1.24 |
| 8 | clean | 52/52 | 172 | 9d 8:46 | 1.38 |
| 9 | clean | 52/52 | 171 | 9d 8:49 | 1.87 |

**0 trips in 9 runs**, and — the part the before arm could not report —
**all 36 sessions verified their own flush**, every one printing:

```
   flush check: this session's last write is on disk: true
        (it was NOT before the close — the close is what carried it)
```

36 of 36. So §1.1's finding is not a one-run observation any more: on every
session of every run, Chromium had **not** committed on its own timer, and the
close carried it. **The run is 171–173 s, the same as before the fix.**

**Side by side, and read §3.4 before drawing anything from it:**

| arm | runs | trips | sessions | sessions whose flush was verified |
|---|---|---|---|---|
| BEFORE (master, unchanged) | 9 | **0** | 36 | not measurable — the instrument did not ask |
| AFTER (the fix) | 9 | **0** | 36 | **36 of 36** |

### 3.4 ⚠ What these counts do and do not support

- **They do NOT show the flake being fixed**, because **the flake did not occur
  in the before arm**. 0 in 9 against 0 in 9 is not evidence of an improvement,
  and is not offered as any. Anyone quoting "0 trips after" without "0 trips
  before" beside it would be laundering a number.
- **What changed is not the rate, it is what the run KNOWS.** Before, 36 sessions
  passed with their precondition unexamined; after, 36 sessions each carry a
  printed, checked statement that the thing the next session reads is on disk.
  That is the difference between a run that happened to be right and a run that
  can say so.
- **They DO show the mechanism**, from both sides: the close carries the flush
  (20 of 20 sessions), and removing it loses it for exactly the three sessions
  whose own commit is 44–54 s away.
- **They DO show the new check can fail** — §4.1.
- **N is small on both sides and the confidence is correspondingly small.** Nine
  runs bound a trip rate loosely at best: a rate of 10% survives nine clean runs
  about 39% of the time, and even 20% survives 13% of the time. Eighteen runs in
  total (about 52 minutes of wall clock) is what these two arms are worth, and
  no more.

---

## 4. The gates, and the proof each one fires

### 4.1 The flush check — red-first on the CONSTRUCTED state

**The mutation, quoted from disk** (`scratchpad/canvas-cdp-harness.mjs:843`,
`git diff --stat` naming that file):

```
      /* POISON: window.close() DELETED — the constructed state the flush check exists to catch */
```

**The first run of that plant** (never the second — the plant is in the teardown
and a plant near teardown can leave state that makes its own rerun green):

```
   flush check: this session's last write is on disk: true   [session A]
   flush check: this session's last write is on disk: false  [session B]
HARNESS ERROR: Error: LOCALSTORAGE NEVER REACHED DISK — session B — restart with a
  canvas active (row 13, first half) is gone and the marker it wrote a moment …
```

`rc=2`, the run stopped **at the teardown that lost the data**, not one session
later in the wording of an app defect. Restored from the committed baseline.

⚠ **And note what the same state did to the rest of the instrument**: on the
diagnostic-only arm of the same mutation, the run still printed **52/52** with
three sessions' last writes lost. That is the guard-that-asserts-nothing shape,
and it is why this check is a refusal and not a printed note.

### 4.2 ⚠ A SECOND DEFECT, FOUND BY THE MEASUREMENT AND WORSE THAN THE FIRST — a run that ends at 45% with EXIT 0

Two runs ended part way through with **`rc=0`**, no summary, no error, and an
ordinary `NOTE` as the last line of the log — `DIAG` run 2, which died at 121 s
with session A's teardown next, and one run of a batch that was discarded for an
unrelated reason (§5). **A sweep reading exit codes records those as passes.** That is the O78 class arriving by a different
road, and it is the class this parcel's justification is built on.

**The cause, named.** `cdp()`'s `send()` returns a promise settled **only** by a
matching `message`; nothing listened for `close` or `error`. When the target went
away with a request in flight, that promise never settled and never rejected —
the `await` never returned, the child's stdio pipes closed with the child, node's
event loop emptied, and **node exits 0 on an empty event loop, by design**.

**Two guards, because the first only closes the road that is known:**

1. `cdp()` now rejects every in-flight request on `close`/`error`, naming the
   socket and how many were pending, so the failure becomes a thrown error and a
   non-zero exit.
2. `installSummaryNet()` — a `process.on('exit')` that fires when either entry
   point leaves without having printed its SUMMARY, prints that the rows so far
   are *a prefix of a run, not a result*, and forces `exitCode = 3`. **This is
   not redundant with (1):** it closes the class, so a future dropped promise or
   swallowed rejection cannot reach exit 0 either.

Both are asserted by source-order rows in `test/support/storage-flush.test.ts`
(§4.3) — they have no runtime witness `npm test` can reach, and their absence is
silent.

### 4.3 `test/support/storage-flush.test.ts` — 25 rows, in `npm test`

The runner is **`npm test`** (`vitest run`, after the six `check:*` scripts and
`tsc`). The harness itself spawns Electron under an X server, so `npm test` can
never execute it; the check's decisions live in a module this file drives
directly with the filesystem injected — the same split, and the same reason,
as `test/support/run-root.test.ts`.

**Red-first, each mutation applied on disk and restored with
`git show HEAD:scratchpad/lib/storage-flush.mjs`:**

| # | mutation (quoted from disk) | went red |
|---|---|---|
| P1 | `if (now() - t0 >= maxMs) return { flushed: true, … };  // POISON P1` | the timeout row — *"⚠ RETURNS flushed:false ON TIMEOUT"* |
| P2 | `return { dir: present[0], how: 'POISON P2 — picked the first of several candidates' };` | *"⚠ REFUSES when /proc is silent and TWO candidate profiles exist"* |
| P3 | `if (false && !LEVELDB_DATA_RE.test(n)) continue;  // POISON P3` | *"⚠ IGNORES leveldb's own text LOG"* |

⚠ **P1 was taken against the barrier version of the module and its row is gone
with the barrier** — there is no timeout branch left to poison, because there is
no wait. Its replacement is the row *"answers false for a marker the database
never received"*, whose live proof is §4.1's negative control; that row is
asserted against a **populated** database, so a FALSE cannot come from an empty
or unreadable directory.

**Expectations are derived, not typed:** the profile candidates come from
`harness-guard.mjs`'s own `APP_NAMES`, the data-file set from the module's
exported `LEVELDB_DATA_RE`, and the source-order rows read the harness file.

**Loud on unmeasurable:** `resolveLeveldbDir` returns `{ dir: null, why }` for
every case it cannot answer, and `armFlushCheck` turns that into a refusal — a
teardown that cannot say where it writes cannot say what it left behind.

---

## 5. What is NOT proven

- **THE FLAKE WAS NOT REPRODUCED AND IS NOT CLAIMED FIXED.** 0 trips in 9 runs of
  the untouched master instrument. Whatever made O50 see 4 in 9 was not present
  today, and I did not identify it. **A future red `canvas-cdp` run should not be
  read as "the flake is back" on the strength of this packet.**
- **Cause (a) — the shared profile — is where the evidence points and is NOT
  demonstrated.** §1.1 shows cause (b) does not occur under the shipping
  teardown; it does not show that (a) does.
- **"Rate limiter" is an inference.** What is measured is the delay and its
  reproducibility (25 ms across runs). Attributing it to Chromium's per-area
  commit budget is reasoning from that reproducibility and from Chromium's
  documented design; I read no Chromium source and instrumented no browser.
- **The one-`WriteBatch`-per-area argument is reasoned, not measured here.** The
  check asserts the consequence it needs (the stored session did not move while
  the marker was placed) rather than the premise.
- **The silent-exit rate is a small sample and one of the two observations is
  contaminated.** 22 runs were executed in this session and two aborted this way.
  One is `DIAG` run 2, clean. The other is from the FIRST attempt at the before
  arm, which was **discarded and re-run from scratch** because I edited the
  harness file while those runs were in flight — a methodological error I caught
  after two runs. Node reads a module at process start, so an edit should not
  have reached a running process, but I cannot rule it out, so that observation is
  reported and not counted on. **The cleanest statement is 1 abort in the 20
  recorded runs.** The cause is named and fixed; the RATE is not established.
- **`installSummaryNet()` is proven by a source-order row, not by a run.**
  Constructing an exit-0-mid-run on demand needs the very defect that was fixed
  in the same commit, and a mutation that re-introduces it proves (1), not (2).
  This is stated rather than folded into the tally.
- **The 13 other instruments that import `session()`** — `art-agent`,
  `artmode-repro`, `assign-black`, `assign-toggle`, `collision-agent`,
  `collision-gesture`, `commit-cdp`, `commit-collision`, `constraints-cdp`,
  `crossover-paint`, `explorer-canvases`, `import-cdp`, `paint-regression`,
  `tier-zoom` — inherit the check and the two exit guards. **None was run.** The
  check costs one `localStorage` write and one directory read per session, so no
  material cost is expected, but that is reasoned.
- **`xvfb-reap-proof.mjs` was not run.** Nothing in this parcel touches
  `killTree`, `killTreeSync`, the ORDERED SIGTERM sequence, the display reaping
  or `inheritedXauthDirs`; its `[s*]`/`[g1]` rows are separately load-sensitive
  and pre-existing, and I have no reading of my own to compare.
- **Nothing here has seen a ROM, an emulator or an aeon build.**

---

## 6. ⚠ `npm test` — AND MASTER IS NOT GREEN, FOR A REASON THAT IS NOT THIS PARCEL

```
Test Files  2 failed | 477 passed | 2 skipped (481)
     Tests  6 failed | 6685 passed | 8 skipped (6699)
```

**The 6 are `src/core/formats/effects/__tests__/section-wiring.test.ts` (3) and
`test/formats/effects-preset-schema-drift.test.ts` (3), and they fail on master
`90e134e7` too — measured, not assumed.** The branch's working tree was stashed,
`src test scratchpad docs` checked out at `90e134e7`, those two files run, and
the result was the identical `6 failed | 32 passed (38)`; the tree was then
restored and `git diff 90e134e7 --stat` re-read to confirm the branch is back to
its four files.

They are **cross-repo drift**, not a regression here: the assertions name aeon's
own revisions and blobs —

```
A SPLIT BETWEEN aeon docs/EDITOR_RASTER_PRESETS.md (at 7cd6353e…) AND
contract/schema/aurora-effects-preset.schema.json (blob 6498a862…) … aeon accepts
a root key the schema does not declare: expected [ 'base_swap' ] to deeply equal []
A LAG HAS RE-OPENED … expected [] to deeply equal [ 'ramp' ]
expected 'OJZ_Preset_Sec6' to be 'OJZ_Preset_Plain'
```

— which is the `ramp` / `base_swap` contract lag that ROADMAP row 128 armed on
2026-09-03 doing exactly what it was built to do when the peer moves. **This
parcel touches four files, none under `src/` and neither of those two test
files.** ⚠ **It is flagged here rather than absorbed**: the brief said master was
green, and it is not any more. **TAGGED for foreground follow-up** — it belongs
to whoever owns row 128 and the aeon contract, not to this branch.

Excluding those six, the suite is **6685 passed, 8 named skips**, and
`skip-report` reports every skip named its reason. The six `check:*` scripts and
`check-harness-guards` are green (`196 clean / 196 classified · 0 failures ·
0 unmeasurable`), and `npx tsc --noEmit` is clean.

---

## 7. Commits on this branch

| SHA | what |
|---|---|
| `e3b90e96` | the pre-close barrier + `storage-flush.mjs` + the test — **superseded by `6cbd998f`** |
| `f1225ea0` | the 44–54 s measurement and the `about:blank` negative result — **superseded** |
| `6cbd998f` | the correction: check after the exit, no wait; the barrier removed with its measurement kept |
| *(head)* | the AFTER measurement's honesty note in the code, this packet, and ROADMAP row 129 |

⚠ **The first two are left on the branch rather than squashed away.** The barrier
they added is the instrument that produced §1's table, and the reason it is gone
is a measurement that only exists because it was built. A branch that showed only
the answer would hide the step that made the answer possible — and would leave
the next person to try the same wait.
