# O20 + O23 — the leak's cause was in `/usr/bin/xvfb-run`, and the gate could not see a shell script

**Branch** `fix/xvfb-display-guards` · **2026-08-30** · aurora
**Commits** `1016fd73` (guard + proof), `b6860658` (checker + runner)

Two queue rows, one defect family: a cleanup discipline that exists for `.mjs`
harnesses and does not reach shell. Both are closed, and both rows were wrong
about something load-bearing.

---

## 1. What the rows said, and what is actually true

| The row said | Measured |
|---|---|
| O20: "four unguarded **launcher scripts** still leak on every run" | The four are **`.mjs` files, not shell** — `effects-foreground-harness.mjs`, `effects-foreground-2-harness.mjs`, `priority-zoom-probe.mjs`, `short-viewport-harness.mjs`, all **untracked in the owner's working tree**. ROADMAP row 89 already recorded them as "4 unguarded untracked launchers no worktree could see". |
| O20: the cause is those four | They are **a** cause and not the live one. **Zero Xvfb processes are alive on this box right now**, yet 1505 leaked artifacts are. The accruing leak comes from the *guarded* launchers. |
| O23: shell scripts are "latent — none launches the app today" | **False for two of them.** `fg2-sequence.sh` and `effects-foreground-timed.sh` launch the app by proxy — they are the only path by which two of O20's four unguarded launchers are ever run. |
| The 2026-08-29 17:38:58Z lane-log re-measure: "0 Xvfb, 0 locks, 0 sockets, so the 10:35Z sweep held" | **Contradicted by the mtimes on disk.** 72 lock files carry mtimes strictly between that session's own sweep (06:35 EDT) and its own re-measure (13:38 EDT). I did not sweep and cannot reconstruct what it saw; recorded as a discrepancy, not an accusation. |

**The two rows disagreed about whether a `.sh` launches the app, and the
disagreement was the finding.** O20 was calling `.mjs` files "scripts"; O23 read
"does not contain `xvfb-run`" as "does not launch". Both halves are shell's
problem only in the sense that shell is how two of them are reached.

---

## 2. The cause: `xvfb-run` has no trap

`/usr/bin/xvfb-run` is a shell script. Its entire cleanup —

```
185  kill $XVFBPID
188  XAUTHORITY=$AUTHFILE xauth remove ":$SERVERNUM"
190  if ! rm -r "$XVFB_RUN_TMPDIR"; then
```

— sits at `:184-192`, **after** the line that runs the command at `:180`, and
there is no `trap` anywhere in the file. Signal the wrapper and none of it runs.

Signalling the wrapper is exactly what `killTree` does on **every** teardown. So
**O16's fix for the orphaned Electron is what guarantees this leak.** It is the
same vacuous-guard shape this repo keeps meeting, living inside a distro script:
cleanup written after a command that need not return is cleanup that does not
exist.

It is not cosmetic. `xvfb-run -a` picks its display with `find_free_servernum`
(`:88-99`), which walks **up** from 99 while `/tmp/.X$i-lock` exists — every
leaked lock permanently burns a display number. That is why numbers had climbed
to `:1030`.

### There are two leak rates, and the big one had never been counted

**The first measurement got this wrong, and the RED row refusing to reproduce is
how the real shape turned up.** The draft asserted all three artifacts survive a
graceful teardown; they do not.

| Artifact | Leaks on | On the box 2026-08-30 |
|---|---|---|
| `/tmp/xvfb-run.XXXXXX/` | **every** teardown, graceful included — only the wrapper's own `rm -r` removes it | **1504**, back to 25 Aug |
| `/tmp/.X<N>-lock` | abrupt teardown only — a SIGTERMed Xvfb removes it itself | 89 (+ `:0`, the owner's) |
| `/tmp/.X11-unix/X<N>` | abrupt teardown only, same reason | 73 |

"Abrupt" is `killTreeSync` — Ctrl-C, uncaught throw, process exit — and a crash.

Apples-to-apples, in the 8.5 h since the previous session's re-measure: **55
tempdirs, 17 locks, 17 sockets.** Counting only locks and sockets is precisely
why the leak looked contained.

---

## 3. The fix — `reapDisplays()`, scoped by descent

In `scratchpad/lib/harness-guard.mjs`, wired into `killTree` and `killTreeSync`
so all 103 guarded launchers get it without a single file being edited.

Ownership is the hazard-3 rule, not a pattern:

- a **display number** comes only from the argv of an `Xvfb` **inside a tree
  this process launched** — never from a `DISPLAY` env var, which our own
  process may have inherited from the desktop and which would name `:0`;
- a **tempdir** comes only from an owned process's own `XAUTHORITY`, and must
  match `XVFB_TMPDIR_RE`.

Artifacts are captured **before the first signal**, for the same reason the tree
is: an orphaned Xvfb cannot be attributed to us afterwards, and unattributable
must never become safe-to-delete.

Four gates before any removal, each refusal returned in words: never `:0`; never
while the recorded Xvfb still runs; never while `/proc/net/unix` shows the
socket still **bound**; never a directory outside the pattern.

### `stillRunningAs()` — three-valued where `alive()` is two

Both distinctions have already cost somebody a wrong answer here:

- a **zombie** answers signal 0 and is not running. On the Ctrl-C path the Xvfb
  we just SIGKILLed is briefly one, and reading that as "alive" would refuse to
  reap on the one path where nothing else ever will.
- a **recycled pid** answers signal 0 and is somebody else — exactly how display
  `:151` was held back by a Vivaldi renderer thread on 2026-08-29.

`/proc/net/unix` is the strong instrument and a lock file's pid is the weak one:
a path in `/proc/net/unix` is a live binding by construction.

---

## 4. Evidence — `npm run harness:xvfb-reap`, **16/16**

No build and no Aurora: `/bin/sleep` under `xvfb-run` isolates the X leak from
the app, so this cannot collide with the owner's editor.

```
PASS [r1] RED (graceful) — the wrapper tempdir survives EVERY teardown, lock and socket do not
        left: /tmp/xvfb-run.Ue0f8Z/
PASS [r2] RED (abrupt) — a SIGKILLed Xvfb cannot clean up, so ALL THREE artifacts leak
        /tmp/.X187-lock /tmp/.X11-unix/X187 /tmp/xvfb-run.O071vt/
PASS [n1] the artifacts EXIST while :187 is running — the green row below is a removal, not an absence
PASS [g1] GREEN (graceful) — killTree leaves NO lock, NO socket and NO tempdir
PASS [g3] GREEN (abrupt) — killTreeSync SIGKILLs and still leaves nothing behind
PASS [s1] SIGINT mid-run — the harness never reached a `finally`, and the display is still cleaned up
        during: /tmp/.X187-lock /tmp/.X11-unix/X187 /tmp/xvfb-run.K0qf54 → after: nothing
PASS [s2] SIGTERM mid-run — …
PASS [o1] display :0 — the owner's session — is REFUSED, and its socket is still there
PASS [o2] a display whose recorded process is LIVE is REFUSED (:4242)
PASS [o3] a directory that is not an xvfb-run tempdir is REFUSED — /tmp and $HOME are untouched
PASS [o5] an Xvfb it could not attribute a display to is reported UNMEASURABLE
```

`[n1]` exists because `[g1]` alone is the vacuous shape — it passes just as
green over a launch that never started an X server. `[o*]` exist because a
cleanup that only ever says yes is the `pkill` hazard wearing a new name; each
checks the path is **still on disk** afterwards rather than trusting the refusal.

Six `xvfb-run` launches, display **`:187` reused every time** (nothing leaked
between phases, or the number would have climbed), box residue **90/73/1504
before and after: unchanged**.

**Nothing on this machine was killed that this parcel did not start.** No
`pkill`, no pattern match, no sweep.

---

## 5. O23 — the checker could not see a shell script

`listMjs` filtered on `.mjs` and nothing else — `check-harness-guards.mjs:146`
before this change, one line, a whole file class outside the gate. Confirmed
firsthand before touching anything.

### Widening the file set is not widening the check

`G1` asks *does this call `spawnGuarded`?* A shell script has no `spawnGuarded`
and never will — the ownership machinery is a Node module. Running `G1` over
`.sh` files would classify every one of them "no launch" and **return green
forever**. That is the trap, and the answer is not to stretch `G1`.

Five shell-shaped rules instead:

| | Rule | Fires today? |
|---|---|---|
| **S1** | must not start `xvfb-run`/`Xvfb`/`electron` itself unless it traps `EXIT` **and** `INT` **and** `TERM` | prohibition, holds |
| **S2** | every `.mjs` it dispatches must be one this check calls guarded | **yes — 2 files** |
| **S3** | no `pkill` (G2, in shell) | prohibition, holds |
| **S4** | no hand-read of `mcp.json` (G3, in shell) | prohibition, holds |
| **S5** | backgrounding a child (`&`/`nohup`/`setsid`) needs the same full trap | prohibition, holds |

**S2 is the rule with teeth, and it is the right quantity for a `.sh`.** A shell
script here is a *launcher by proxy*: it leaves the same orphaned Electron and
the same leaked display as if it had spawned them. What to watch is **which
launcher it names**, not whether it contains a call it structurally cannot
contain.

`S1`'s trap requirement is deliberate: `trap ... EXIT` alone does **not** fire on
`SIGINT`/`SIGTERM` in POSIX sh. That is the vacuous-guard shape, and it is
exactly what `/usr/bin/xvfb-run` does not even have.

### Red-first, all five

Planted at the single dispatch site. **Grepped first**, per the standing warning:
`run-layer-bound.sh` has exactly one `.mjs` line (`:64`); `run-handover.sh` has
six `node` lines and one `.mjs`. Each plant restored, `md5sum` verified.

```
S2 run-layer-bound.sh: dispatches 1 UNGUARDED launcher(s) — _plant-unguarded-harness.mjs.
S1 run-layer-bound.sh: starts xvfb-run itself with no trap covering EXIT+INT+TERM (has: no trap at all).
S1 run-layer-bound.sh: starts xvfb-run itself with no trap covering EXIT+INT+TERM (has: EXIT).      ← trap EXIT alone
S3 run-layer-bound.sh: calls pkill. Same reason as G2 …
S4 run-layer-bound.sh: names mcp.json. Reading the shared discovery file from shell …
S5 run-layer-bound.sh: backgrounds a child (& / nohup / setsid) with no trap covering EXIT+INT+TERM …
```

Each exited **1**. `S1` proven three ways — untrapped RED, `trap … EXIT` alone
still RED *naming what it has*, full `trap … EXIT INT TERM` GREEN — because the
whole point of the rule is the middle case.

### S2 against the real files

Run with the owner's untracked scripts staged into a worktree copy:

```
UNGUARDED BUT UNTRACKED (4) — present in THIS working tree only.
  G1 effects-foreground-2-harness.mjs: 1 Aurora launch(es) still use bare spawn()
  G1 effects-foreground-harness.mjs:   1 Aurora launch(es) still use bare spawn()
  S2 effects-foreground-timed.sh: dispatches 1 UNGUARDED launcher(s) — effects-foreground-harness.mjs.
  S2 fg2-sequence.sh:             dispatches 1 UNGUARDED launcher(s) — effects-foreground-2-harness.mjs.
```

Loud, and not fatal, by the rule already here: the repo cannot fix a file it
does not carry, and a permanently-red gate is a gate people learn to ignore.

### The alternative green-path, named and checked

> If the widened checker went green for a reason **other** than the scripts
> being guarded, what would that reason be?

**The `.sh` set could come back empty** — wrong extension, wrong directory, or a
`fixtures/` filter that swallowed everything — and the headline would read
`0 failure(s)` with nobody the wiser. Checked specifically: the headline now
prints the split, `152 classified (149 .mjs + 3 .sh)`, and the count matches
`find scratchpad -name '*.sh' -not -path 'scratchpad/fixtures/*'` = 3, listed by
name. A zero would be visible on the face of the report.

Two more, both closed by the plants: the rules could be structurally incapable
of matching (five plants say otherwise), and `S2` could resolve unknown targets
to "guarded" by default — it does not, it reports **UNMEASURABLE**, observed
firing on a plant that named `index.mjs`.

### Two smaller holes found while doing it

- The tracked/untracked split matched `^\s*G\d+ `. Left alone, **every shell
  failure would have been filed as tracked** (the rule id stays in the key and
  never matches a path), making an untracked `.sh` fatal. Now `[GS]\d+`.
- `G4` now guards `displayArtifacts` / `reapDisplays` / `XVFB_TMPDIR_RE`, so
  renaming one cannot quietly turn `killTree`'s reap into dead code while every
  launcher still "imports the guard".

---

## 6. The instrument that policed the leak was contributing to it

`harness-guard-proof.mjs`'s RED `[k]` phase is the one teardown in the repo that
bypasses `killTree` on purpose — that is its evidence. It therefore leaked a
lock, a socket and a tempdir **on every run**. Reaped by hand there now.

Measured both sides: **91/74/1505 before and after** a full run that launches
four real Aurora Electrons under Xvfb. It was `+1/+1/+1` before.

---

## 7. Verification

| What | Result |
|---|---|
| `npm run harness:xvfb-reap` | **16/16**, red-first on both teardown paths |
| `npm run harness:guard-proof` (real Electron) | **12/12** — unchanged by the `killTree` edit |
| `npm test` (now runs the widened gate) | **426 test files passed / 2 skipped**, **5817 tests passed / 7 skipped, 0 failed** |
| `npm run check:harness-guards` | `152 clean / 152 classified (149 .mjs + 3 .sh) · 0 failure(s) · 0 unmeasurable` |

**Runner named:** `npm test` now executes `check-harness-guards.mjs`. It had an
npm script and no runner, which is the "a check nobody runs" shape.

⚠ `node_modules/.bin/electron` does not exist in an agent worktree (npm resolves
up to the main tree for everything else). `harness:guard-proof` therefore reports
**UNMEASURABLE** — correctly, not falsely green — until run with
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`.
Worth knowing before someone reads that as a regression.

Machine uptime at measurement: **4 days 13:58**. No emulator was touched.

---

## 8. Still open

1. **The four unguarded `.mjs` launchers are not fixed.** They are untracked in
   the owner's working tree; an isolated worktree cannot write there, and
   adopting four of his scratch files into the repo is not this parcel's call.
   **They are not one shape, and the difference matters** — checked file by
   file rather than assumed from the first one read:

   | File | Teardown | What leaks |
   |---|---|---|
   | `effects-foreground-harness.mjs:498` | `process.kill(-child.pid, 'SIGKILL')` | group kill, so no live orphan — but no snapshot, no ownership, and now no reap: **all three X artifacts, every run** |
   | `effects-foreground-2-harness.mjs:989` | same | same |
   | `priority-zoom-probe.mjs:189` | `child.kill('SIGTERM')` | **hazard 2 itself** — signals the wrapper only, so the Electron *and* the Xvfb survive the run |
   | `short-viewport-harness.mjs:76` | `child.kill()` | same |

   The last two are how a live `Xvfb` reparents to `systemd --user` and sits
   there for 35 hours. **The gate names all four on every run, and committing
   one makes it fatal.** Owner's call whether to fix in place or delete.
2. **1505 tempdirs, 91 locks and 74 sockets are still on the box.** Not swept —
   this parcel fixed the cause and deliberately touched nothing it did not
   create. That is foreground process work.
3. **The 2026-08-29 re-measure discrepancy** (§1, last row) is recorded and not
   resolved.
