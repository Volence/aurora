# O20 + O23 — the leak's cause was in `/usr/bin/xvfb-run`, and the gate could not see a shell script

**Branch** `fix/xvfb-display-guards` · **2026-08-30** · aurora
**Commits** `1016fd73` (guard + proof), `b6860658` (checker + runner), `341fd9ea` (docs), `18e7fbfa` (**fail-closed + gate-isolating rows — read §9 first**)

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

Five gates before any removal, each refusal returned in words: **gate 0** —
refuse everything if the socket table could not be read (§9); **gate 1** — never
`:0`; **gate 2** — never while the recorded Xvfb still runs; **gate 3** — never
while `/proc/net/unix` shows the socket still **bound**; **gate 4** — never a
directory outside the pattern.

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

## 4. Evidence — `npm run harness:xvfb-reap`, **20/20**

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
PASS [o1] GATE 1 — display :0, the owner's session, is refused BY THE NEVER-REAP LIST, and its socket is still there
PASS [o2] GATE 2 — a display whose recorded process is LIVE is refused BY THE LIVENESS CHECK (:4242)
PASS [o6] GATE 3 — a LIVE X server is refused BY THE BOUND-SOCKET CHECK even when gates 1 and 2 both pass
PASS [o3] GATE 4 — a directory outside XVFB_TMPDIR_RE is refused BY THE PATTERN CHECK — /tmp and $HOME are untouched
PASS [o5] an Xvfb it could not attribute a display to is reported UNMEASURABLE
PASS [b1] an unreadable socket table returns the NULL sentinel, distinguishable from a readable empty one
PASS [b2] BLIND — with the socket table unreadable the reap refuses EVERYTHING, and the live server keeps its socket
PASS [b3] and it refuses in the blindness's own words, not by accidentally matching another gate
```

`[n1]` exists because `[g1]` alone is the vacuous shape — it passes just as
green over a launch that never started an X server. `[o*]` exist because a
cleanup that only ever says yes is the `pkill` hazard wearing a new name; each
checks the path is **still on disk** afterwards rather than trusting the refusal,
and each names **which gate** refused — see §9 for why that is not pedantry.

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

---

## 9. The coordinator planted the poison this proof had not — two defects

Both found by emptying `NEVER_REAP_DISPLAYS` (deleting gate 1 outright) and
watching `[o1]` stay **GREEN** at 16/16.

### 9a. The rows did not say WHICH gate refused

Bar 2d cause **(ii)**: two independent code paths, one observable. With gate 1
gone, **gate 3** refused `:0` anyway, because the owner's live Xwayland binds
`/tmp/.X11-unix/X0`. `[o1]` asserted only *that* it refused —
`if (r.removed.length === 0 && sock0)` — while `r.refused` already carried the
reason the row was throwing away.

Fixed for **all four gates, not just the one that was planted in**. The
structural reason `[o1]` could rest on a neighbour is that **nothing tested gate
3 on its own**, so `[o6]` is new: a real running Xvfb, a recorded pid that is a
genuinely dead `/bin/true` (gate 2 passes) at a display that is not 0 (gate 1
passes), leaving the socket binding as the only thing between the guard and a
live server. `[o2]` additionally shows no neighbour *could* have covered —
`:4242` is not in the never-reap list and has no socket on disk.

**Verified by deleting each of the four in turn, not reasoned about:**

| Plant | Result |
|---|---|
| gate 1 emptied | `[o1]` **RED**, and the message names the neighbour: `refused=:0 — /tmp/.X11-unix/X0 is still BOUND by a live process` |
| gate 2 removed | `[o2]` **RED** — `refused=` empty |
| gate 3 removed | `[o6]` **RED**, having really deleted a **live** server's lock and socket: `removed=/tmp/.X205-lock /tmp/.X11-unix/X205` — the damage the gate exists to prevent |
| gate 4 widened | `[o3]` **and** `[o4]` **RED** — `removed=/tmp/xvfb-run-not-really/` |

⚠ Gate 4's plant was widened **only** to the `-not-really` fixture, never to
anything `/tmp` or `$HOME` could match — a plant that deletes `$HOME` to prove a
point is not a proof. And it **ate its own fixture**: the second run of the same
plant was already green on `[o3]`, because the first run had removed the
directory. *Read the first run, never the second.*

### 9b. `boundSocketPaths()` failed OPEN, against its own docstring

This is the one that matters. Its catch returned an **empty `Set`** while the
comment beside it promised the caller would treat "unknown" as "do not touch".
The caller did not: `bound.has(sock)` over an empty Set is `false`, and `false`
is the value that means **proceed to delete**. An unreadable `/proc/net/unix`
silently **inverted gate 3 from a refusal into a permission** — leaving
`NEVER_REAP_DISPLAYS`, the guard nothing tested, as the only thing between the
reaper and the owner's desktop socket.

**Latent, not live.** `/proc/net/unix` is readable in practice, and
`displayArtifacts` only lists displays from an `Xvfb` inside our own tree, so
`:0` does not realistically reach the gate at all — `[o1]` gets there with a
synthetic list. That is precisely why gate 1 is defence-in-depth for the case
where attribution goes wrong, and why leaving it resting on a neighbour was the
wrong call.

Fixed the right way round rather than by correcting the comment: it returns
`null` for unknown, and `reapDisplays` reads that as **gate 0 — refuse
everything, loudly**, tempdirs included. Half a reap is a policy nobody can
reason about, and "I cannot tell live from dead" is a reason to stop, not a
reason to stop partly. Refusing costs a leaked file — visible, recoverable;
acting blind costs somebody's desktop.

### The general form, which is the better teaching instance

> **The failure state and the success state emitted the same artifact.**

"I could not look" and "I looked and nothing is bound" were both an empty `Set`
— indistinguishable to any caller, however carefully written. That is the sigil
lane's general form of the vacuous check, and it was firing **inside the guard
written to close a vacuous-guard incident**. It now sits at the top of
`harness-guard.mjs`'s hazard-4 header, above the `xvfb-run` story, because it
teaches more than the bug it was found next to.

`G4` also guards `boundSocketPaths` and `NEVER_REAP_DISPLAYS` now (18/18): the
null-means-unknown contract is what gate 0 reads, and a row has to be able to
show that no other gate covered for it.

**Re-run after the fix:** `harness:xvfb-reap` **20/20**; `harness:guard-proof`
**12/12** against a real Electron; `npm test` **426 files passed / 2 skipped,
5817 passed / 7 skipped, 0 failed**; `check:harness-guards` `152 clean / 152
classified · 0 failure(s)`. Box residue **108/91/1522 before and after** every
run. (The box moved from 91/74/1505 to 108/91/1522 between rounds — `+17` in
each class, another lane's abrupt teardowns, not this parcel's: every run here
is measured either side and nets zero.)
