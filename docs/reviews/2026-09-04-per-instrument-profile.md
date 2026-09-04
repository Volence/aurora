# SHARED-PROFILE-HAZARD — one Chromium profile per instrument RUN

**Two Aurora-launching instruments could wipe each other's `localStorage`, and the victim then
reported a fault that was not there.** `docs/reviews/2026-09-04-canvas-flake-explained.md` closed
the canvas-flake row with two causes, fixed one, and left this one explicitly live: *"(a) is
untouched and is concurrency-dependent … Nothing is credited with fixing (a), because nothing
did."* This packet is (a).

Branch `feat/per-instrument-profile`, off `0680b0d6`. **Code tip `9fd8ce73`**; this packet, the
ROADMAP row and the lane-log entry land in one further commit on top of it, so the branch tip is
that doc commit — a tip SHA cannot name the commit that would have to contain it.

    46268627  the rig, before the fix
    466e17e2  why the rig does not gate on build freshness
    64aa358f  HAZARD 6: the pin itself
    9fd8ce73  the unit rows, and cleanupProfile made testable
    (+1)      doc sync: this packet, ROADMAP §5.1 row 156, lane-log

---

## 1. The concurrent-pair proof, both arms, measured here

`scratchpad/profile-isolation-proof.mjs` (`npm run harness:profile-isolation`) forks **two
independent node processes** — the unit the fix is keyed to — and launches the real built app from
each. The victim writes a session-shaped key and closes its first session; the attacker then runs
`localStorage.clear()`; only then is the victim told to relaunch and read.

**A single-instrument run proves nothing here.** One harness can only clear its own profile, which
is not a defect. It is also deliberately not a race *in timing*: a run is "mid-run" for the whole
interval between its launches, which for `canvas-cdp-harness` is most of ~190 s, so making the
window deterministic is what turns a rate into a gate.

### BEFORE — the tree at `466e17e2`, with the fix stashed

```
FAIL  [p1] the two instruments hold DIFFERENT profiles open
        victim  /home/volence/.config/Electron/Local Storage/leveldb
        attacker /home/volence/.config/Electron/Local Storage/leveldb
        (observed: held open by the launched tree (11 pid(s)))
control-ok  [p2] the attacker's localStorage.clear() was effective on its own key
        its own sentinel before="attacker-3179445-1788532399622" after=null
control-ok  [p3] the victim's key reached disk before the attacker ran
        bytes of "victim-3164013-1788532394616" found in
        /home/volence/.config/Electron/Local Storage/leveldb: true
FAIL  [p4] the victim reads its own key back after the attacker cleared
        expected "victim-3164013-1788532394616", got null
        keys the victim could see: ["aurora.profileproof.done","aurora.session.v1:no-project"]
```

The last line is the whole finding in one row: **the keys the victim could still see were the
attacker's.** `aurora.profileproof.done` is a marker the *other process* wrote after its clear,
sitting in the victim's own storage.

### AFTER — the tree at `64aa358f`, both arms

```
PASS  [p1] the two instruments hold DIFFERENT profiles open
        victim  /tmp/aurora-harness-profiles/profile-isolation-proof-3236326-72beb260/Local Storage/leveldb
        attacker /tmp/aurora-harness-profiles/profile-isolation-proof-3242234-3e34ac98/Local Storage/leveldb
control-ok  [p2] the attacker's clear was effective on its own key
control-ok  [p3] the victim's key reached disk before the attacker ran
PASS  [p4] the victim reads its own key back after the attacker cleared
        expected "victim-3236326-1788532446352", got "victim-3236326-1788532446352"
        keys the victim could see: ["aurora.session.v1:profile-isolation-proof","aurora.session.v1:no-project"]

PASS  [s1] the two instruments share ONE profile (the arm's premise)
        both /tmp/aurora-profile-shared-wPqN8X/profile/Local Storage/leveldb
control-ok  [s2] / [s3]
PASS  [s4] RECONSTRUCTION: sharing one profile DOES destroy the victim's key
        expected "victim-3272885-1788532461111", got null
        keys the victim could see: ["aurora.profileproof.done","aurora.session.v1:no-project"]

=== profile-isolation-proof: 0 FAIL, 0 broken control(s) ===
```

### What a GREEN result rules out

A green `[p4]` on its own is exactly as green when the attacker's clear silently did nothing, when
the two never shared anything to begin with, or when the victim's key never reached disk. Each is
disproved by its own row — `[p2]` the attacker's own sentinel really disappeared, `[p3]` the
victim's bytes really were in the leveldb before the attacker started, `[s4]` the same assembly
with one shared profile still destroys the key **on demand**. `[p3]` is also what keeps cause (b)
— a flush that never reached disk — from being mistaken for cause (a) on any given run.

Every profile in `[p1]`/`[s1]` is read from `/proc/<pid>/fd` — **what the process actually opened**,
not what the launcher believes it passed.

---

## 2. The fix, and why it is one place

**`spawnGuarded` (`scratchpad/lib/harness-guard.mjs`) is the single choke point**, and rule G1 in
`scratchpad/check-harness-guards.mjs` already guarantees every Aurora launch goes through it
(this run: 146 guarded launchers, 0 failures). So this is one derivation, not 123 edits. It now
also injects `--user-data-dir=<RUN_PROFILE_DIR>`.

**Electron honours the switch — verified, not assumed.** A window-less probe against this repo's
own Electron:

| | `app.getPath('userData')` | `app.getPath('sessionData')` |
|---|---|---|
| no switch | `/home/volence/.config/Electron` | `/home/volence/.config/Electron` |
| `--user-data-dir=/tmp/claude-1000/probe-udd-1` | `/tmp/claude-1000/probe-udd-1` | same |

So the switch moves the `localStorage` profile **and** `recent-projects.json` together. No app
change was needed.

**Position matters**, for exactly the reason `pinOzoneToX11` documents: the command is `xvfb-run -a
-s '…' <electron> <app.mjs>`, so the switch cannot go at the front (xvfb-run eats it) or at the
back (it becomes an argument to the app). It goes immediately after the binary, and the unit row
asserts the *index*, because both wrong placements satisfy a `toContain`.

### ⚠ Per instrument RUN, not per launch

`canvas-cdp-harness` relaunches four times in one run and **depends on `localStorage` persisting
across them** — that persistence is what its restart suite measures. A fresh profile per launch
would break it in a way that looks exactly like the flake this parcel removes. `RUN_PROFILE_DIR` is
derived once per node process: `<tmp>/aurora-harness-profiles/<instrument>-<pid>-<8 hex>`. The pid
is the uniqueness that matters (two concurrent runs are two live processes); the random suffix is
for a **reused** pid, so a fresh instrument cannot inherit a dead run's storage.

Proven on the real consumer, not argued: all four `canvas-cdp-harness` sessions in the run below
report the same profile directory, and its restart rows pass.

---

## 3. The existing snapshot/restore is untouched, and here is why it must be

The guard that covers `~/.aurora/mcp.json`, `~/.sonic-level-editor/mcp.json` and the three
`recent-projects.json` files stays, entire.

* **The two discovery files are not in the profile at all.** `src/main/discovery-file.ts` joins
  `homedir()`, not `app.getPath('userData')`. A private profile does not move them by a byte, and
  hazard 1 — including its dangerous READ half, a harness resolving to the owner's live Aurora — is
  exactly as live as it was.
* **`recent-projects.json` does move, but only for a launch this module actually pinned.**
  `pinUserDataDir` returns its argument **unchanged by identity** when there is no Electron binary
  in the command, and defers to a `--user-data-dir` the caller passed itself. Those launches still
  write the shared file, and the restore is what covers them.

Its stated honest limit (a byte-for-byte restore also erases a project the owner opens *during* a
run) is unchanged and is not this parcel's to revisit.

---

## 4. The stale census is gone, replaced by a derivation

The refusal in `canvas-cdp-harness` told operators **"114 call sites"**. That was right the day it
was typed. It now renders `describeClearCensus()` at the moment it is thrown.

**And a raw grep is not the fix either.** It counts every block comment that *names* the call — so
the census grew every time somebody documented the hazard. Measured on this branch, one tree, one
instant: **138 with comments, 130 without.** Comments are stripped before counting; the one known
blind spot (a call inside a string literal) errs toward over-reporting, which is the safe
direction.

**The number is therefore not stated as a fact anywhere in this repo's prose, including here.** Run
it: `node -e "import('./scratchpad/lib/harness-guard.mjs').then(m=>console.log(JSON.stringify(m.clearCallSiteCensus())))"`.
At `9fd8ce73` it answered `{"sites":130,"files":123}` for `.mjs/.cjs/.js/.ts/.tsx` under
`scratchpad/`, comments stripped — a different population from the parcel brief's 136/123 and from
a plain `grep -r`'s 133/120, which is the point: **a census has a method and a unit, and two counts
that do not state theirs cannot be reconciled.**

---

## 5. The two navigate-by-recents rigs — checked specifically, and the census widened

The brief flagged `palette-drag-harness` and `palette-grid-harness` as most likely to break,
because they navigate by the recent-projects list and a private profile has no recents.

**They do not break, and the reason is that they never depended on the shared list.** Both call
`window.api.addRecentProject(<their project>, …)` themselves, *then* reload, *then* click the row.
`tile-editor-harness` says why in its own comment: the card only exists if the machine's list
already names the resolved checkout, "and that file is a ten-entry LRU that every harness in this
population rewrites … whether row 18 could run depended on which instrument had run last."

**Found by what they READ, not by name.** Every `scratchpad/*.mjs` that either calls
`addRecentProject` or queries `button[title=…]`:

| file | seeds | clicks a `button[title=]` |
|---|---|---|
| `capture-harness.mjs` | 3 | 2 |
| `palette-grid-harness.mjs` | 2 | 2 |
| `palette-drag-harness.mjs` | 2 | 2 |
| `shell-flip-harness.mjs` | 2 | 2 |
| `tile-editor-harness.mjs` | 1 | 3 |
| `d27-sprite-focus-harness.mjs` | 0 | 3 — **not recents**: "Delete current" and "remove step" |

Five rigs navigate by recents; all five seed. **A private profile is a strict improvement for
them**: it removes the LRU eviction they were each working around.

Two of the five were RUN, on the fixed tree, with an empty private profile:

    palette-drag  (AEON_DIR = a throwaway clone)   0 FAIL, 0 broken negatives
    palette-grid  (ENGINE=aeon, same clone)        0 FAIL, 0 broken negatives

`capture-harness`, `shell-flip-harness` and `tile-editor-harness` were **read, not run** — see §7.

---

## 6. A hazard the fix would have introduced, closed in the same commit

`resolveLeveldbDir` (`scratchpad/lib/storage-flush.mjs`) observes the profile from `/proc` and,
when that is silent, falls back to `$XDG_CONFIG_HOME/<app name>/Local Storage/leveldb`. **Exactly
one of those exists on this box**, left by every pre-O80 run — so the fallback would have
confidently returned a directory the run never writes and reported "never flushed" for a flush that
happened. That is the precise defect that module's own header was written about, arriving from a
new direction one cause later.

It now takes the pinned `profileDir`, which is knowledge and not a candidate. The observation still
comes first and still wins. The test file carries the pair RED-then-GREEN so the change is visible
as a change rather than as a lone green tick.

---

## 7. What was run, and what was not

**Run by me, on this branch:**

| | result |
|---|---|
| `npm test` at `0680b0d6` (before) | **500 files passed / 3 skipped; 7166 tests passed / 9 skipped; exit 0** |
| `npm test` at `9fd8ce73`, code only | **500 files / 7166 tests, exit 0** — identical to before, which is the point: no existing row moved |
| `npm test` at the tip, with this parcel's rows | **501 files passed / 3 skipped; 7188 tests passed / 9 skipped; exit 0** — `+1` file and `+22` rows, all of them added here (18 profile, 4 leveldb-resolver) |
| `node scratchpad/check-harness-guards.mjs` | 217 clean / 217 classified · 0 failures · 0 unmeasurable |
| `harness:profile-isolation` before / after | §1 |
| `canvas-cdp-harness` (S1DISASM_DIR = a copy) | **52 checks, 0 fails, 0 unexercised, all negative controls correctly FAIL** — and all four sessions on one profile |
| `palette-drag-harness` (AEON_DIR = a clone) | 0 FAIL, 0 broken negatives |
| `palette-grid-harness` ENGINE=aeon | 0 FAIL, 0 broken negatives |

**NOT run, and this change can affect any harness that launches the app.** The population is 146
guarded launchers. I ran four of them. The three I did not run that read the recents list
(`capture-harness`, `shell-flip-harness`, `tile-editor-harness`) all seed their own row by the same
call, so the argument covers them, but an argument is not a run. Nothing else was executed, and
nothing below should be read as implying the set.

`npm test` cannot reach any of this: every one of these rigs needs an Electron and an X server. That
is why the pure functions are asserted in `test/support/harness-guard-profile.test.ts` and
`test/support/storage-flush.test.ts`, where a rename or an inverted condition fails the suite.

**Every unit row was planted against**, not read for plausibility — mutation, note which rows go
red, revert, tree byte-identical afterwards:

| planted | rows that went red |
|---|---|
| flag appended at the END of argv | *inserts the switch IMMEDIATELY after the electron binary* |
| comment stripping removed from the census | *counts calls, not the comments describing them* |
| `RUN_PROFILE_DIR` keyed on the instrument name alone | *is a DIFFERENT value in two processes*; *carries a random suffix* |
| `resolveLeveldbDir`'s `profileDir` branch disabled | the GREEN pinned-profile row; the empty-profile refusal |

**One real defect was found by writing them.** `cleanupProfile` read all four of its inputs from
module state, and `profileUsed` is module-private and set only by `spawnGuarded` — so the only
branch a unit test could reach was "none used". Three of the four decisions, **including the one
that deletes a directory**, had no test that could fail. The inputs are injectable now, with the
real state as defaults.

---

## 8. Rulings recorded, not omissions

* **`profile-isolation-proof.mjs` does not call `assertFreshBuild`.** Eighteen instruments do, so a
  missing call reads as a forgotten one. No row in that file reads anything the app *renders* — the
  only app behaviour it uses is `localStorage` and `location.origin`, Chromium primitives a blank
  page has. The verdict is printed and not obeyed; the first run of the rig refused because another
  lane had touched `src/` in the shared built tree 82 s earlier, and that refusal carried no
  information about what the rig measures.
* **The profile is deleted at exit**, after the trees are killed, unless `AURORA_HARNESS_KEEP_PROFILE`
  is set or the directory was named by `AURORA_HARNESS_PROFILE_DIR` — a directory this process did
  not create is not this process's to remove.
* **`AURORA_HARNESS_PROFILE_DIR` exists so the negative control can exist.** Without a way to make
  two processes share one profile, the shared arm would have to reconstruct the hazard by pointing
  something at `~/.config/Electron`, and a proof of a data-loss guard must not cause the data loss
  to make its point. The rig refuses to start if that variable is set in the operator's own
  environment, because both children would inherit it and the private arm would become a second
  shared arm — green rows over a false premise.

---

## 9. Open

* **142 of the 146 guarded launchers have not been run against this change.** Nothing in the change
  is instrument-specific, and the four that were run include the one with the hardest dependency
  (four launches sharing one profile), but the set is not covered.
* **`candidateLeveldbDirs`' shared-profile fallback is still reachable** for any caller that does
  not pass `profileDir`. Only `canvas-cdp-harness` passes it today, because it is the only caller.
* **`~/.config/Electron` is now dead weight on this box** — every pre-O80 run's leftovers. Nothing
  reads it any more; nobody has swept it. A sweep is a separate, owner-facing decision.
* **Nothing here was run under an emulator**, per the parcel's invariant.
