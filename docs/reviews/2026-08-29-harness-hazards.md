# O16 — every harness that launches Aurora could hijack the owner's running app

**Branch** `o16-harness-hazards` · **2026-08-29** · aurora

Both hazards named in the parcel fired last night against the owner's own
running editor, and were found by accident. A third — worse than either — was
found while fixing them.

---

## 1. The three hazards

### 1a. The shared discovery file, written

Aurora publishes its Aether port to `~/.aurora/mcp.json` and the legacy
`~/.sonic-level-editor/mcp.json` (`src/main/mcp-server.ts:188`). Both paths are
**shared**: the owner's Aurora writes them, and so does every throwaway instance
a harness launches. The harness's app overwrites them, so the owner's tooling
starts resolving to an app on a port that dies with the run. `stopMcpServer`
also **deletes** them on clean shutdown, so a harness can leave the owner with
no discovery file at all.

### 1b. The shared discovery file, read — the dangerous direction

A harness that reads that file to find "the app" can find the **owner's**
Aurora, write into his open document, and read its own writes straight back.
Every row green, describing nothing, while corrupting his work. The failure
mode is **silent success**, which is why nothing ever caught it.

### 2. The orphaned Electron

`child.kill()` signals the `xvfb-run` **wrapper**, not the Electron under it.
Measured in this parcel (row `[k1]`): the wrapper died and **ten** processes
survived, including the Electron main and the Xvfb server, still holding the CDP
port and the discovery file. Reading the tree *after* the signal finds nothing —
the orphans have already reparented to init (row `[k2]`). That is why the tree
must be captured before the first signal.

### 3. `pkill -f`, which was hazard 2's "fix" and is worse — NEW FINDING

Twenty-eight harnesses tried to solve hazard 2 with

```
pkill -f 'aurora/dist/main/inde[x].mjs'
```

That is not an ownership test. It matches **any** Electron whose argv contains
that path — and the owner's Aurora, running from
`/home/volence/sonic_hacks/aurora/dist/main/index.mjs`, **matches it**. Worse, a
harness run from a worktree launches
`.../aurora/.claude/worktrees/agent-X/dist/main/index.mjs`, which does **not**
match. So from a worktree that line **killed the owner's editor and spared its
own orphan.** Exactly backwards.

Sixteen files carried that pattern; six more carried a stale
`ux-plan6/dist/main/index.mjs` that matches nothing, so their cleanup was a
silent no-op. All twenty-eight are gone.

This one shipped inside `scratchpad/canvas-cdp-harness.mjs`'s `session()`, which
**fifteen** other harnesses import — so fifteen harnesses ran that line on every
teardown.

---

## 2. What changed

One shared module, imported everywhere. No machinery pasted.

| File | What |
|---|---|
| `scratchpad/lib/harness-guard.mjs` | **NEW.** The single copy of all three guards. |
| `scratchpad/check-harness-guards.mjs` | **NEW.** Derived aggregate gate — `npm run check:harness-guards`. |
| `scratchpad/harness-guard-proof.mjs` | **NEW.** Red-first live evidence — `npm run harness:guard-proof`. |
| 96 launchers | `spawn(` → `spawnGuarded(`, guard import added, `pkill` line removed. |
| `scratchpad/canvas-cdp-harness.mjs` | `session()` teardown: `killTree` + discovery restore, both printed; re-exports `resolveOwnedDiscovery`. |
| `collision-agent`, `art-agent`, `collision-gesture`, `loop-cell-probe`, `skipped-cells-probe` | open-coded `discoverPort()` deleted; ownership-checked resolution. |
| `tile-attribute-harness`, `collision-read-harness` | the two files that carried the pasted treatment now **consume** the module. |
| `package.json` | two scripts. |

### The guards

- **`snapshotDiscovery()` / `restoreDiscovery()`** — both files captured
  byte-for-byte before launch, put back (or deleted, if they did not exist) in
  the same `finally` as the CDP teardown. One refinement on "byte for byte": if
  the file now names a **live** pid that is not ours, the owner started his
  Aurora mid-run and our bytes are stale — the file is left alone and that is
  said out loud. Restoring is a promise not to make things worse, not a promise
  to write.

- **`killTree()`** — walks `/proc` for every descendant, SIGTERMs, gives
  Chromium a grace period to flush localStorage, then SIGKILLs. The tree is
  captured **before the first signal**, and the argv of everything killed is
  printed.

- **The ownership rule (`resolveOwnedDiscovery`)** — a port from the discovery
  file is used **only** if the pid the file names is a descendant of a process
  this harness spawned. Anything else returns `ok:false` with every refusal
  spelled out, and the caller reports **UNMEASURABLE**. It never falls back to
  "well, something answered".

`spawnGuarded()` also installs `exit` / `SIGINT` / `SIGTERM` /
`uncaughtException` handlers that kill every registered tree and restore the
files — so a harness that throws, is Ctrl-C'd, or simply never had a `finally`
still leaves the owner's environment as it found it.

### `collision-agent-harness.mjs` — what its check did and did not establish

Its `discoverPort()` read the first of `~/.aurora`, `~/.config/aurora`,
`~/.aether` `mcp.json` that existed, took its `port`, and returned `j.pid`
alongside it — **printed, never compared**. The only provenance downstream was
row 1: *does `initialize` advertise `editor/set_block_collision`?*

- **Established:** the app on that port is *a* build carrying that method.
- **Not established:** that it is *the app this harness launched*.

Two holes, and the reasoning read like rigour, which is what made it dangerous:

1. **The premise expired.** The comment said the method "exists only on this
   branch". It is on master now, so the test distinguishes nothing.
2. **Even when true it was a capability test, not an identity test.** It cannot
   tell this app from any other app with the same method — and the app most
   likely to be running with the same method is the owner's.

Row 1 is kept, demoted in the prose to what it always was. Identity is now
settled by descent, before any POST, and a failure aborts with UNMEASURABLE and
`process.exitCode = 2`.

### Why a shared module was practical

The parcel allowed "a shared module is impractical for these standalone `.mjs`
scripts" as a real finding. It is not impractical: they are ES modules, fifteen
of them already import `canvas-cdp-harness.mjs`, and the retrofit was two
mechanical edits per file — one import and one identifier. The lesson in
`src/core/editing/brush-word.ts` applies unchanged.

---

## 3. Red-first evidence

### The guards themselves — `npm run harness:guard-proof`, **12/12**, live Electron

Every guard runs **both ways in the same process**, and every row prints the
artifact it judged (bar 2d cause (iii)).

**Ownership rule — constructed, never against the owner's app.** A `/bin/sleep`
is spawned *outside* the guard's tree: alive, real, and as foreign to the rule
as the owner's Aurora would be. Its pid goes into `~/.aurora/mcp.json`:

```
· planted: /home/volence/.aurora/mcp.json now names pid 23072 (/bin/sleep 120), alive=true
· planted bytes: { "url": "http://127.0.0.1:38473/mcp", "port": 38473, "pid": 23072, ... }
PASS [o1] a LIVE, REAL, foreign pid in the discovery file is REFUSED
        refused: this harness spawned nothing through spawnGuarded — there is no app it may own
PASS [o2] the rule ACCEPTS an app this harness did launch, and only via descent
        accepted port 38473 pid 45034; descendant of 24630=true; plant pid was 23072
PASS [o3] the accepted pid is a REAL Electron, not the plant
        argv of 45034: .../electron .../dist/main/index.mjs
```

The row proves a **refusal**, not the absence of a crash. Nothing in this parcel
ever pointed a harness at the owner's Aurora.

**Discovery restore — red, then green.**

```
PASS [d1] RED — the launched app OVERWRITES the shared discovery file
        pre-run: { "url": "http://127.0.0.1:1/mcp", "port": 1, "pid": 999999, "marker": "PRE-RUN-SENTINEL" }
        now:     { "url": "http://127.0.0.1:38473/mcp", "port": 38473, "pid": 76399, ... }
PASS [d2] RED — with the restore disabled, the file is left WRONG and this check SEES it
        (both files printed in full, still holding the app's bytes)
PASS [d3] GREEN — after restoreDiscovery both files are byte-identical to the pre-run state
PASS [d4] and d2/d3 actually differ — the restore is not a no-op over an untouched file
```

`[d4]` exists because `[d3]` alone is the vacuous shape: it passes just as green
when nothing was ever disturbed.

**killTree — red, then green.**

```
PASS [k1] RED — child.kill() kills the xvfb-run wrapper and LEAVES the Electron alive
        wrapper 3911495 alive=false; 10 survivor(s):
        3911505 Xvfb :1057 -screen 0 800x600x24 -nolisten tcp
        3911592 .../electron .../dist/main/index.mjs
        3911595 .../electron --type=zygote --no-zygote-sandbox
        (six more, each with its argv)
PASS [k2] RED — and the orphan has ESCAPED the tree: it no longer descends from the wrapper
PASS [k3] the RED orphans are gone before the GREEN phase starts
PASS [k4] GREEN — killTree leaves ZERO survivors from the same tree
        tree was 11 process(es) [...]; survivors: none
PASS [k5] and it killed MORE than the wrapper — the Electron itself was in the tree it signalled
```

The proof harness takes its **own** meta-snapshot outside the mechanism under
test, restores unconditionally in a `finally`, and **refuses to start** if a
discovery file names a live pid that is not ours — that would be the owner's
Aurora, and phase `[d]` clobbers the file on purpose.

### The aggregate check — planted, caught, restored

| Plant | What the check said |
|---|---|
| `camera-harness.mjs`: `spawnGuarded(` → `spawn(` | `G1 ... 1 Aurora launch(es) still use bare spawn()` |
| `probe-once.mjs`: `execSync("pkill -f electron")` | `G2 ... calls pkill` |
| `loop-cell-probe.mjs`: `join(homedir(), '.aurora', 'mcp.json')` | `G3 ... names mcp.json directly` |
| `lib/harness-guard.mjs`: `killTree` → `killTreeRenamed` | `G4 ... exports 12/13 — MISSING killTree` |
| `probe-swatch.mjs`: a spawn with a literal `(` inside a string arg | `UNMEASURABLE ... could not be bracketed` |

All five restored. The check is back to `141 clean / 141 · 0 failures ·
0 unmeasurable`, **exit code 0** (verified directly, not inferred from a pipe).

### Two vacuous guards the red-first pass caught in my own work

Both would have shipped green. This is the argument for planting rather than
reading.

1. **G2 and G3 were dead.** `stripInert` blanked string bodies, and `pkill` and
   `mcp.json` **only ever appear inside string literals** —
   ``execSync(`pkill -f '...'`)``, `join(homedir(), '.aurora', 'mcp.json')`. The
   check went green over both planted defects.

2. **G1 had a hole of the same shape.** With strings blanked,
   `` spawn(`${ROOT}/node_modules/.bin/electron`, [`${ROOT}/dist/main/index.mjs`]) ``
   reads as `spawn("", [""])` — nothing to recognise. Four real Aurora launchers
   (`camera-`, `crash-`, `restore-`, `tool-split-harness`) classified as "spawns
   something else", and the *oracle exclusion* was dead for the same reason.
   Found by reading the per-file enumeration, not by a red run. Fixed: the
   launcher count went **92 → 98**.

### One ordering bug in the guard itself, found by running it

`spawnGuarded` snapshots at the **first launch**. The proof harness plants a
foreign pid *before* launching, so the guard's snapshot was a picture of the
plant — and the exit-handler net faithfully restored **the plant**, seconds
after the `finally` had deleted it, leaving `~/.aurora/mcp.json` holding a dead
pid. Observed on disk after the first run. Fixed with `setDiscoveryBaseline()`:
one authority, not two. The leftover file was removed by hand after confirming
its pid was dead; both discovery files are now **absent**, their true
pre-parcel state.

---

## 4. What was executed vs. only edited

**Actually executed, end to end:**

| Harness | Result |
|---|---|
| `harness-guard-proof.mjs` | **12/12**, real Electron, both directions of all three guards |
| `collision-read-harness.mjs` | **32/32**, 9.9s — the file whose pasted machinery was replaced |
| `skipped-cells-probe.mjs` | green — the `session()` path plus the ownership-checked reader |
| `check-harness-guards.mjs` | green, and red under five separate plants |

**Only edited, not executed: the other ~94 launchers.** They received two
mechanical changes (`spawn(` → `spawnGuarded(`, import added) and, where
present, deletion of the `pkill` line. Every file is syntax-checked
(`node --check`, 141/141 clean) and covered by the aggregate check. **Their rows
were not re-run**, and nothing here claims their assertions still pass.

**Suite:** `npx tsc --noEmit` → exit 0, no output. `npm run test` → **407 passed
/ 2 skipped (409 files); 5504 passed / 7 skipped (5511 tests)**, 11.32s, exit 0.
Note `test/` is outside tsconfig's `include`, so the clean tsc does not cover it.

---

## 5. Open / observed

- **20 orphaned `Xvfb` servers** are alive on this machine from harness runs
  that predate this parcel (screens `1600x1000`, `1680x1050`, `1280x1024`; none
  from my runs, which used `800x600`). **Reported, not killed** — they are not
  my descendants. `pgrep -c Xvfb` = 20, `pgrep -c electron` = 0. This is
  hazard 2's accumulated fingerprint, and cleaning it is the owner's call.

- **`session()` shuts the app down gracefully** (`window.close()`, 4s) before
  `killTree` runs, so in that path killTree usually finds an already-empty tree.
  Correct, but it means the fifteen `session()` harnesses exercise the *net*
  rather than the tree walk. The tree walk is proven in `[k4]`/`[k5]` and in
  `collision-read-harness`.

- **The exemption mechanism is a hole by construction.** Any file may declare
  `harness-guard:allow-raw-launch` and G1 stops applying to it. It is printed on
  every run so it cannot be silent, and exactly one file uses it
  (`harness-guard-proof.mjs`, which must launch unguarded or its RED rows prove
  nothing). A second one appearing without a reason in review is the hole being
  used.

- **`node_modules` was missing in this worktree** for the first part of the
  session (a mangled setup command). `npm` and `node` resolve upward, so builds
  and tests were unaffected — but the literal path
  `${ROOT}/node_modules/.bin/electron` did not exist, which is why the first
  proof run reported every phase UNMEASURABLE instead of green. That is the
  design working: it refused to guess rather than reporting a hollow pass.

- **Nothing was run against the emulator.** No `mcp__oracle__*` call anywhere.

---

## 6. Complete launcher enumeration

`VERBOSE=1 npm run check:harness-guards` regenerates this. It is **derived from
the directory**, never a list — a new file appears here automatically, and an
unguarded one turns the check red.

- `LAUNCHER (guarded)` — spawns an Aurora Electron; fixed by this parcel.
- `driver (guarded via canvas-cdp-harness)` — does **not** launch. Imports
  `session()`, guarded transitively. Stated, not silently skipped.
- `spawns something else` — the oracle emulator or a build tool. Out of scope:
  those binaries never touch the discovery files and never publish a port.
- `no launch — not applicable`.

```
_select-key-probe.mjs                              LAUNCHER (guarded)
aeon-priority-lens-harness.mjs                     LAUNCHER (guarded)
animated-art-harness.mjs                           LAUNCHER (guarded)
art-agent-harness.mjs                              driver (guarded via canvas-cdp-harness)
artmode-repro-harness.mjs                          driver (guarded via canvas-cdp-harness)
assign-black-harness.mjs                           driver (guarded via canvas-cdp-harness)
assign-toggle-harness.mjs                          driver (guarded via canvas-cdp-harness)
band-art-foreground-harness.mjs                    LAUNCHER (guarded)
band-coverage-plants.mjs                           no launch — not applicable
band-lens-harness.mjs                              spawns something else (oracle emulator or a tool)
band-lens-poisons.mjs                              no launch — not applicable
band-rate-shift-probe.mjs                          spawns something else (oracle emulator or a tool)
band-step-proof.mjs                                spawns something else (oracle emulator or a tool)
band-strip-range-plants.mjs                        no launch — not applicable
band-strip-range-poisons.mjs                       no launch — not applicable
band-trunk-demo.mjs                                LAUNCHER (guarded)
bg-override-paints-harness.mjs                     LAUNCHER (guarded)
bg-tile-picker-harness.mjs                         LAUNCHER (guarded)
bganim-band-harness.mjs                            LAUNCHER (guarded)
bganim-band-lens-harness.mjs                       LAUNCHER (guarded)
bganim-insert-roomy-harness.mjs                    LAUNCHER (guarded)
bganim-marquee-resolution-probe.mjs                no launch — not applicable
bganim-motion-harness.mjs                          LAUNCHER (guarded)
bganim-phase-shift-harness.mjs                     LAUNCHER (guarded)
bganim-preview-fixture.mjs                         spawns something else (oracle emulator or a tool)
bganim-rate-shift-harness.mjs                      LAUNCHER (guarded)
bganim-strip-range-harness.mjs                     LAUNCHER (guarded)
bganim-tile-door-harness.mjs                       LAUNCHER (guarded)
bganim-ui-authored-composition-harness.mjs         LAUNCHER (guarded)
block-fanout-probe.mjs                             driver (guarded via canvas-cdp-harness)
bo-probe.mjs                                       spawns something else (oracle emulator or a tool)
bo-probe2.mjs                                      spawns something else (oracle emulator or a tool)
boot-override-harness.mjs                          spawns something else (oracle emulator or a tool)
build-console-overlap-harness.mjs                  LAUNCHER (guarded)
bus-probe.mjs                                      spawns something else (oracle emulator or a tool)
camera-harness.mjs                                 LAUNCHER (guarded)
camera-preview-harness.mjs                         LAUNCHER (guarded)
canvas-cdp-harness.mjs                             LAUNCHER (guarded)
capture-harness.mjs                                LAUNCHER (guarded)
check-harness-guards.mjs                           this check (reads source; launches nothing)
chunk-pool-check.mjs                               no launch — not applicable
chunkgrid-hint-harness.mjs                         LAUNCHER (guarded)
classic-emu-smoke.mjs                              spawns something else (oracle emulator or a tool)
classic-playtest-harness.mjs                       LAUNCHER (guarded)
collision-after-capture.mjs                        LAUNCHER (guarded)
collision-agent-harness.mjs                        driver (guarded via canvas-cdp-harness)
collision-before-capture.mjs                       LAUNCHER (guarded)
collision-edit-harness.mjs                         LAUNCHER (guarded)
collision-gesture-harness.mjs                      driver (guarded via canvas-cdp-harness)
collision-ghost-capture.mjs                        LAUNCHER (guarded)
collision-legibility-harness.mjs                   LAUNCHER (guarded)
collision-lens-harness.mjs                         LAUNCHER (guarded)
collision-mark-normal-harness.mjs                  LAUNCHER (guarded)
collision-needle-harness.mjs                       LAUNCHER (guarded)
collision-preservation-harness.mjs                 LAUNCHER (guarded)
collision-read-harness.mjs                         LAUNCHER (guarded)
commit-cdp-harness.mjs                             driver (guarded via canvas-cdp-harness)
commit-collision-harness.mjs                       driver (guarded via canvas-cdp-harness)
composer-fill-harness.mjs                          LAUNCHER (guarded)
constraints-cdp-harness.mjs                        driver (guarded via canvas-cdp-harness)
crash-harness.mjs                                  LAUNCHER (guarded)
curve-editor-harness.mjs                           LAUNCHER (guarded)
curve-vsplit-reachable-harness.mjs                 LAUNCHER (guarded)
effects-column-harness.mjs                         LAUNCHER (guarded)
effects-deform-harness.mjs                         LAUNCHER (guarded)
effects-guides-harness.mjs                         LAUNCHER (guarded)
effects-scene-harness.mjs                          LAUNCHER (guarded)
explorer-canvases-harness.mjs                      driver (guarded via canvas-cdp-harness)
flip-match-real-data.mjs                           no launch — not applicable
fromtile-typing-probe.mjs                          LAUNCHER (guarded)
guard-surface-harness.mjs                          LAUNCHER (guarded)
guide-aim-probe.mjs                                LAUNCHER (guarded)
handover/handover-band-harness.mjs                 LAUNCHER (guarded)
harness-guard-proof.mjs                            LAUNCHER (guarded)
import-cdp-harness.mjs                             no launch — not applicable
label-measure-probe.mjs                            LAUNCHER (guarded)
layer-bound-harness.mjs                            LAUNCHER (guarded)
lib/harness-guard.mjs                              the guard module itself
live-palette-e2e-harness.mjs                       LAUNCHER (guarded)
loop-cell-probe.mjs                                driver (guarded via canvas-cdp-harness)
mapviewport-baseline-harness.mjs                   LAUNCHER (guarded)
marquee-flip-button-harness.mjs                    LAUNCHER (guarded)
marquee-flip-harness.mjs                           LAUNCHER (guarded)
marquee-harness.mjs                                LAUNCHER (guarded)
marquee-paste-probe.mjs                            LAUNCHER (guarded)
marquee-snap-modifier-harness.mjs                  LAUNCHER (guarded)
marquee-stamp-harness.mjs                          LAUNCHER (guarded)
micro-type-harness.mjs                             LAUNCHER (guarded)
numberfield-empty-harness.mjs                      LAUNCHER (guarded)
object-label-harness.mjs                           LAUNCHER (guarded)
paint-regression-harness.mjs                       driver (guarded via canvas-cdp-harness)
paint-through-harness.mjs                          LAUNCHER (guarded)
palette-drag-harness.mjs                           LAUNCHER (guarded)
palette-grid-harness.mjs                           LAUNCHER (guarded)
palette-push-harness.mjs                           spawns something else (oracle emulator or a tool)
paste-pan-harness.mjs                              LAUNCHER (guarded)
png-import-real-palette.mjs                        no launch — not applicable
pool-headroom.mjs                                  no launch — not applicable
priority-lens-harness.mjs                          LAUNCHER (guarded)
probe-classic-hooks.mjs                            LAUNCHER (guarded)
probe-click-paint.mjs                              LAUNCHER (guarded)
probe-once.mjs                                     LAUNCHER (guarded)
probe-swatch.mjs                                   LAUNCHER (guarded)
probe-zoom-default.mjs                             LAUNCHER (guarded)
probe-zoom.mjs                                     LAUNCHER (guarded)
raster-timeline-harness.mjs                        LAUNCHER (guarded)
restore-harness.mjs                                LAUNCHER (guarded)
row8-probe.mjs                                     LAUNCHER (guarded)
s1-anim-harness.mjs                                LAUNCHER (guarded)
s1-boss-sprites-harness.mjs                        LAUNCHER (guarded)
s1-layout-anim-harness.mjs                         LAUNCHER (guarded)
s1-library-presentation-harness.mjs                LAUNCHER (guarded)
s1-mode-check.mjs                                  spawns something else (oracle emulator or a tool)
s1-nonlevel-families-harness.mjs                   LAUNCHER (guarded)
s1-priority-occlusion-harness.mjs                  LAUNCHER (guarded)
s1-saveback-cdp-harness.mjs                        LAUNCHER (guarded)
s1-sonic-preview-harness.mjs                       LAUNCHER (guarded)
s1-sonic-sprite-harness.mjs                        LAUNCHER (guarded)
s1-vplayer-spike-probe.mjs                         spawns something else (oracle emulator or a tool)
screen-frame-guides-harness.mjs                    LAUNCHER (guarded)
screen-frame-harness.mjs                           LAUNCHER (guarded)
section-column-harness.mjs                         LAUNCHER (guarded)
section-header-action-harness.mjs                  LAUNCHER (guarded)
shell-flip-harness.mjs                             LAUNCHER (guarded)
skipped-cells-probe.mjs                            driver (guarded via canvas-cdp-harness)
slot-range-onscreen-harness.mjs                    LAUNCHER (guarded)
sonic-anim-study.mjs                               spawns something else (oracle emulator or a tool)
sprite-restore-harness.mjs                         LAUNCHER (guarded)
storage-flush-probe.mjs                            LAUNCHER (guarded)
sweep-fix-harness.mjs                              LAUNCHER (guarded)
tier-zoom-harness.mjs                              driver (guarded via canvas-cdp-harness)
tile-attribute-harness.mjs                         LAUNCHER (guarded)
tile-editor-harness.mjs                            LAUNCHER (guarded)
tool-keys-harness.mjs                              LAUNCHER (guarded)
tool-split-harness.mjs                             LAUNCHER (guarded)
variant-families.mjs                               no launch — not applicable
verify-geom.mjs                                    no launch — not applicable
vsplit-advisory-harness.mjs                        LAUNCHER (guarded)
warp-tearing-harness.mjs                           spawns something else (oracle emulator or a tool)
writer-originated-scene-harness.mjs                LAUNCHER (guarded)
zone-blocks-probe.mjs                              LAUNCHER (guarded)
```

Totals: **98 guarded launchers · 15 drivers · 14 emulator/tool spawners ·
12 non-launchers · the guard module · this check = 141**.
