# O53 — the two palette harnesses stop opening the LIVE aeon tree

Branch `parcel/o53-palette-harness-live-tree`. Fix commit `14133491`.
Measured 2026-09-03 on this machine (`up 8 days, 17:40`, load 14.33/10.22/8.10 at
the time of the survey; the harness runs below were taken at load ~6–7).

---

## 1. The defect, and why no existing gate could see it

`scratchpad/palette-drag-harness.mjs:40` and `scratchpad/palette-grid-harness.mjs:40`
both read

```js
const AEONDIR = siblingPathOrUnresolved('aeon') + '/';
```

and then handed that directory to `window.api.addRecentProject(...)` and clicked the
resulting recent row to **open it as a project**
(`palette-drag-harness.mjs:278,287`; `palette-grid-harness.mjs:552,561` — pre-fix line
numbers). On this machine that path is the aeon lane's live checkout, mid-edit at any
moment. Both harnesses then drive palette drags that **commit**
(`palette-drag-harness.mjs:216,243`; `palette-grid-harness.mjs:367-370`, pre-fix), so a
run could write an edited palette into another lane's working tree.

Review bar 19 (`docs/OVERSEER.md:578`) names the shape, and its corollary (b) names
this exact variant: *"Routing a read through a helper that derives the peer's location
removes the literal while leaving the read pointed at the same live tree — a change
that looks like this bar was met."*

**`scripts/check-peer-path-literals.mjs` cannot catch this, and that observation is
wanted either way.** The gate runs **four** rules today, not three — `sibling-literal`,
`session-scratchpad`, `unratified-env`, `checkout-as-build-tree` (its own banner names
them). All four ask *how the path was spelled*; none asks *what the path is then used
for*. These two files spelled it perfectly: no `/home/volence/sonic_hacks/...` literal,
no session scratchpad path, no raw `process.env.AEON_DIR`, no build path composed out
of `AURORA_DIR`. The gate printed OK over them for their whole life, and it is right
to — a resolver default is exactly what you want for a *read*. The hazard is the
**verb**, and no rule in the gate has a verb.

## 2. What changed

The fix is **copied** from the two harnesses that already do this correctly —
`scratchpad/guard-surface-harness.mjs:44,91-107` and
`scratchpad/section-raster-select-harness.mjs:98-120` — not invented:

- `checkoutOverride('aeon')` (`test/support/sibling-root.mjs:592`) with **no default**,
  refusing at import when nothing is set. Going through the resolver's own instrument
  rather than `process.env.AEON_DIR` also buys the transitional aliases (`LIVE_AEON`,
  `AEON_ROOT`, `AURORA_AEON_REPO`), the two-spellings-disagree refusal and the
  set-but-wrong error.
- a **second** refusal against `siblingDefaultPathOrUnresolved('aeon')`
  (`test/support/sibling-root.mjs:653`), which answers with where aeon lives *by
  default beside this repo* while ignoring `AEON_DIR` — the only way to compare the
  operator's value against the tree being guarded without comparing it to itself.
- both messages name `AEON_DIR` and carry a working `cp -r <resolved default>
  $(mktemp -d)/aeon` recipe, matching the existing two.

**No dead-path default**, per the SUITE-PATHS note in `docs/OVERSEER.md`: a dead path
never trips the second guard, so the run gets past the refusal and dies later and
further away, which reads as a broken harness rather than a missing variable.

**`palette-grid` gates the refusal on `ENGINE`.** `ENGINE=classic` never names the aeon
tree, so refusing an aeon variable there would demand an environment that run has no
use for. The refusal is still at module load for the runs that can touch aeon, because
`ENGINE` is read above it. Demonstrated in §3.4.

### Two pieces of rot the fix uncovered

Both were invisible while the harness died earlier, and both were fixed because
otherwise the "it gets past the refusal" proof would have been meaningless:

1. **The trailing `/` searched for a recent row the app cannot render.**
   `addRecentProject` stores through `normalizeProjectPath`
   (`src/main/recent-projects.ts:52`, `src/shared/project-path.ts:29`), which strips
   trailing separators; the row renders `title={r.path}`
   (`src/renderer/components/home/HomeTab.tsx:95`). So
   `button[title=".../aeon/"]` never matched and **every aeon run of these two
   harnesses died at `aeon recent row unreachable`**. Corroborated by the guard's own
   snapshot line, which prints the owner's stored row as
   `"path": "/home/volence/sonic_hacks/aeon"` — no trailing slash.
   `scratchpad/capture-harness.mjs:34` still carries the same `+ '/'`; see §5.
2. **`chipEnabled` could not see the Undo chip at all.** It looked only at `<span>` and
   read `opacity`, but an *interactive* `Chip` has been a real `<button disabled>` since
   the accessibility change (`src/renderer/components/ui/primitives.tsx:147-159` — a
   chip with an `onClick` is a button, one without stays a span). Undo is interactive,
   so the helper answered `null` — **could not measure** — and `palette-drag` rendered
   that as three FAILs asserting the edit was *not recorded*. `null` is now kept
   distinct from `false` on purpose. The same stale helper was in
   `palette-grid-harness.mjs:299` and is fixed there too.
   `palette-drag` additionally queried `div[title]` for swatches, which
   `PaletteGrid.tsx:108` has not rendered for some time.

## 3. Proof

### 3.1 Variable unset → refusal at import, naming the variable (verbatim)

```
$ env -u AEON_DIR -u LIVE_AEON -u AEON_ROOT -u AURORA_AEON_REPO \
    node scratchpad/palette-drag-harness.mjs
root: /home/volence/sonic_hacks/aurora  BORROWED — this script lives in …/agent-a88f3b7db08d416a9, which has no built app, so the app under test is /home/volence/sonic_hacks/aurora's build
      walked up 3 level(s) from …/agent-a88f3b7db08d416a9 to the nearest built tree /home/volence/sonic_hacks/aurora
file:///…/scratchpad/palette-drag-harness.mjs:77
  throw new Error(
        ^

Error: AEON_DIR is unset, and this harness has no honest default: it OPENS the tree it is
pointed at as a project and drives palette drags that COMMIT, so it must be pointed at a
throwaway copy of aeon. Make one (e.g. `cp -r /home/volence/sonic_hacks/aeon
$(mktemp -d)/aeon`) and set AEON_DIR to it. Refusing rather than guessing: the guess this
replaced was the aeon lane's LIVE checkout. (empyrean contract/SUITE_PATHS.md, precedence
step 4; aurora docs/OVERSEER.md review bar 19)
    at file:///…/scratchpad/palette-drag-harness.mjs:77:9
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)
```

```
$ env -u AEON_DIR -u LIVE_AEON -u AEON_ROOT -u AURORA_AEON_REPO \
    node scratchpad/palette-grid-harness.mjs          # ENGINE defaults to aeon
… EXIT=1
file:///…/scratchpad/palette-grid-harness.mjs:90
    throw new Error(
          ^

Error: AEON_DIR is unset, and this harness has no honest default: ENGINE=aeon OPENS the
tree it is pointed at as a project and drives palette drags that COMMIT, so it must be
pointed at a throwaway copy of aeon. Make one (e.g. `cp -r /home/volence/sonic_hacks/aeon
$(mktemp -d)/aeon`) and set AEON_DIR to it. Refusing rather than guessing: the guess this
replaced was the aeon lane's LIVE checkout. (empyrean contract/SUITE_PATHS.md, precedence
step 4; aurora docs/OVERSEER.md review bar 19)
    at file:///…/scratchpad/palette-grid-harness.mjs:90:11
    at file:///…/scratchpad/palette-grid-harness.mjs:109:3
```

### 3.2 Variable set to the LIVE `../aeon` → refused by the `siblingDefaultPath` guard

```
$ AEON_DIR=/home/volence/sonic_hacks/aeon node scratchpad/palette-drag-harness.mjs
… EXIT=1
file:///…/scratchpad/palette-drag-harness.mjs:89
  throw new Error(
        ^

Error: AEON_DIR=/home/volence/sonic_hacks/aeon is the real aeon tree — this harness commits
palette edits into the project it opens and must never write there. Point it at a throwaway
copy (e.g. `cp -r /home/volence/sonic_hacks/aeon $(mktemp -d)/aeon`).
(aurora docs/OVERSEER.md review bar 19)
```

```
$ AEON_DIR=/home/volence/sonic_hacks/aeon node scratchpad/palette-grid-harness.mjs
… EXIT=1
file:///…/scratchpad/palette-grid-harness.mjs:101
    throw new Error(
          ^

Error: AEON_DIR=/home/volence/sonic_hacks/aeon is the real aeon tree — this harness commits
palette edits into the project it opens and must never write there. Point it at a throwaway
copy (e.g. `cp -r /home/volence/sonic_hacks/aeon $(mktemp -d)/aeon`).
(aurora docs/OVERSEER.md review bar 19)
```

### 3.3 Variable set to a fresh `cp -r` copy → past the refusal, and GREEN

The copy was re-materialised with `cp -r /home/volence/sonic_hacks/aeon <scratch>/aeon`
(3.3 GB) before **each** of the two runs below.

```
$ AEON_DIR=<scratch>/aeoncopy/aeon \
  ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
  node scratchpad/palette-drag-harness.mjs
MODE=after · port 9357 verified free
guard: discovery snapshot taken before launch:
        /home/volence/.config/Electron/recent-projects.json 112B [1 recent entry] …
guard: pinned Ozone to x11 (--ozone-platform=x11) — see HAZARD 5
NOTE  [env] facet pills — ["Layout","Objects","Effects","Rings","Collision","Palette","Art"]
PASS  [A0] a zone swatch opens the slider panel            word=$0044 sliders=3
NOTE  [A0] Undo chip before any edit — false
PASS  [A1] the drag previews live into the document        $0044 -> $004A (R 2->5)
NOTE  [A2] slider panel after the facet switch — 0 range inputs
NOTE  [A3] state after the interrupted drag — word $0044 -> $004A (kept=true) · Undo enabled=true
PASS  [A4] the interrupted drag left NOTHING stranded      kept AND on the undo stack
PASS  [A5] commit-on-teardown: the change is KEPT          $0044 -> $004A
PASS  [A6] one Ctrl+Z takes the interrupted edit back      $004A --ctrl+z--> $0044
PASS  [B1] an ordinary released drag still commits         $06AE -> $06A4
PASS  [B2] and it is undoable
neg-ok  [B3] (planted) a swatch nobody touched changed as well — same swatch read twice
port free after teardown: true

=== after: 0 FAIL, 0 broken negatives ===
```

```
$ AEON_DIR=<scratch>/aeoncopy/aeon ENGINE=aeon \
  ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
  node scratchpad/palette-grid-harness.mjs
… PASS [PAL.2] … [PAL.12], [X1], [X2], [D1] … [D6]
neg-ok on all 8 planted negatives
=== aeon: 0 FAIL, 0 broken negatives ===
```

Two facts worth pulling out of those runs, both of which the pre-fix harness could not
have produced:

- the facet pills are aeon's (`Layout / Objects / Effects / Rings / Collision / Palette /
  Art`), so the **copy** really was opened as a project — the recent row was reachable,
  which is the trailing-slash fix measured rather than argued;
- `Undo chip before any edit — false` and `Undo enabled=true` after it: the chip readout
  now moves, so rows A4/A6/B2 are anti-vacuous rather than three `null`s in a trench coat.

### 3.4 `ENGINE=classic` is NOT gated on `AEON_DIR` (the deliberate exception)

```
$ env -u AEON_DIR -u LIVE_AEON -u AEON_ROOT -u AURORA_AEON_REPO \
    ENGINE=classic ELECTRON_BIN=/bin/false timeout 12 node scratchpad/palette-grid-harness.mjs
root: /home/volence/sonic_hacks/aurora  BORROWED …
ENGINE=classic · port 9372 verified free
guard: discovery snapshot taken before launch:
        /home/volence/.config/Electron/recent-projects.json 112B [1 recent entry] …
```

Truncated at 12 s on purpose with a deliberately broken `ELECTRON_BIN`, so nothing was
ever opened; the point is only that module load did not refuse.

### 3.5 `npm test`

```
Test Files  469 passed | 2 skipped (471)
     Tests  6476 passed | 8 skipped (6484)
  Duration  14.20s
skip-report: OK — every skip named its reason.
```

`node scripts/check-peer-path-literals.mjs` — OK; 1218 files, 4 rules, all four fired on
their canaries.

## 4. The recent-projects question — ANSWERED: real config, and already contained

**They write the owner's real application config, not a run-scoped one.**
`window.api.addRecentProject` (`src/preload/index.ts:18`) → `src/main/ipc-handlers.ts:75`
→ `src/main/recent-projects.ts:51`, which writes
`join(app.getPath('userData'), 'recent-projects.json')` (`recent-projects.ts:9-11`).
On Linux that is `$XDG_CONFIG_HOME`/`~/.config` joined with the Electron app name — and
for a harness launch (`electron <root>/dist/main/index.mjs`, a FILE, so no package.json
at the app path) the name is Electron's own default, i.e.
`~/.config/Electron/recent-projects.json`. Confirmed live in every run above: the guard
prints that path in its snapshot.

**The containment already exists and both harnesses are already wired into it.** O52 put
that file under the same snapshot/restore that covers the discovery files —
`scratchpad/lib/harness-guard.mjs:237-274` (the incident record), `:296-320`
(`APP_NAMES` / `RECENT_PROJECT_FILES` / `GUARDED_GLOBAL_FILES`), `:331-369`
(`snapshotDiscovery` / `restoreDiscovery`), `:973-1012` (`installNet` /
`spawnGuarded`). Both palette harnesses launch through `spawnGuarded`
(`palette-drag-harness.mjs:256`, `palette-grid-harness.mjs:520`, pre-fix numbering), so
the snapshot is taken before the app can write and the exit / SIGINT / SIGTERM /
uncaughtException net restores it. **Nothing invented here; nothing needed to be.**

Measured, not assumed:

- a purpose-built probe that calls `spawnGuarded`, clobbers the file to an 80-byte
  poison, then reads it in a later-registered `exit` handler printed
  `at exit, file is 303 B RESTORED`;
- the owner's `~/.config/Electron/recent-projects.json` was byte-identical (112 B, one
  entry, `/home/volence/sonic_hacks/aeon`) before and after the green `palette-drag` run
  and before and after the green `palette-grid` run.

**One honest wart, observed once and NOT reproduced.** After my *third* harness run of
the night — the one that exited 1 with three FAILs, before the `chipEnabled` fix — the
owner's file was left holding an extra row naming my `/tmp` copy. The two runs that
followed restored correctly, and the probe above shows the net works, so the only
mechanism I can construct is an Electron that survived both `killGroup()` and the net's
`killTreeSync` and wrote after the restore. I could not reproduce it and did not chase
it. **The file was put back**: the harness's own snapshot line recorded it as
`112B [1 recent entry] "[{ "path": "/home/volence/sonic_hacks/aeon", "name": "Sonic 4",
"lastOpened": 178841152918…`, and `JSON.stringify([{path:"/home/volence/sonic_hacks/aeon",
name:"Sonic 4",lastOpened:1788411529180}],null,2)` is exactly 112 bytes, so the
reconstruction is checkable rather than remembered. It is back on disk and verified 112 B.
Worth a row: *does a harness that exits non-zero always win the race against a dying
Electron?*

## 5. Survey — the same shape, elsewhere in `scratchpad/`. NOT FIXED.

**This class is live in far more than the two files.** A resolver DEFAULT
(`siblingPath` / `siblingPathOrUnresolved` / `requireSiblingPath`, no `checkoutOverride`,
no materialised copy) whose value is then handed to `window.__dbg.aeon.open`,
`window.__dbg.openDir` or `window.api.addRecentProject`:

**92 sites across 82 files** — 51 aeon sites in 51 files, 41 s1disasm sites in 36 files.

⚠ That is a **lower bound**. The scan only recognises `const X = siblingPath…('peer')`
used directly at the open; a path built through an intermediate (`const dir = …`) is
invisible to it, and several harnesses do exactly that.

### 5.1 THE ONE THAT ACTUALLY WRITES — highest priority

`scratchpad/bganim-ui-authored-composition-harness.mjs` is **worse than the two this
parcel fixed**, because it does not merely risk a write, it *requires* one:

- `:76` `const AEONDIR = siblingPathOrUnresolved('aeon');` — the live tree;
- `:77` `const OVERRIDE_FILE = \`${AEONDIR}/games/sonic4/data/editor_bg_override.json\`;`
- `:335` opens it as a project;
- `:416-419` dispatches a real **Ctrl+S**;
- `:423-424` row `5a` asserts *"Ctrl+S actually changed the bytes on disk"* and
  `throw new Error('nothing was written …')` when it did not.

So every successful run of that harness overwrites a file in the aeon lane's working
tree, by design, and fails if it cannot. Left alone per this parcel's scope; it should be
the next one.

For contrast, two neighbours that open the same live tree and say in their own headers
that they write nothing — `scratchpad/bganim-band-harness.mjs:103` and
`scratchpad/effects-scene-harness.mjs:61`, both *"⚠ IT WRITES NOTHING TO DISK. Ctrl+S is
never pressed and `saveAeonProject` is …"*, and `bganim-band-harness` row `9a` hashes the
override file before and after to prove it. Those are OPEN-only, which is a genuinely
lesser hazard than a save but still decides this repo's colours from another lane's
uncommitted edits.

### 5.2 Full list

### aeon — 51 site(s)
- `scratchpad/aeon-priority-lens-harness.mjs:113` -> OPEN at `scratchpad/aeon-priority-lens-harness.mjs:477`
- `scratchpad/bg-wrap-harness.mjs:75` -> OPEN at `scratchpad/bg-wrap-harness.mjs:289`
- `scratchpad/bganim-band-harness.mjs:137` -> OPEN at `scratchpad/bganim-band-harness.mjs:388`
- `scratchpad/bganim-band-lens-harness.mjs:115` -> OPEN at `scratchpad/bganim-band-lens-harness.mjs:389`
- `scratchpad/bganim-rate-shift-harness.mjs:81` -> OPEN at `scratchpad/bganim-rate-shift-harness.mjs:326`
- `scratchpad/bganim-strip-range-harness.mjs:94` -> OPEN at `scratchpad/bganim-strip-range-harness.mjs:330`
- `scratchpad/bganim-ui-authored-composition-harness.mjs:76` -> OPEN at `scratchpad/bganim-ui-authored-composition-harness.mjs:335`
- `scratchpad/capture-harness.mjs:34` -> OPEN at `scratchpad/capture-harness.mjs:464`
- `scratchpad/chunk-links-harness.mjs:76` -> OPEN at `scratchpad/chunk-links-harness.mjs:206`
- `scratchpad/chunkgrid-hint-harness.mjs:51` -> OPEN at `scratchpad/chunkgrid-hint-harness.mjs:214`
- `scratchpad/collision-after-capture.mjs:37` -> OPEN at `scratchpad/collision-after-capture.mjs:227`
- `scratchpad/collision-before-capture.mjs:37` -> OPEN at `scratchpad/collision-before-capture.mjs:227`
- `scratchpad/collision-destructive-harness.mjs:107` -> OPEN at `scratchpad/collision-destructive-harness.mjs:286`
- `scratchpad/collision-ghost-capture.mjs:37` -> OPEN at `scratchpad/collision-ghost-capture.mjs:227`
- `scratchpad/collision-legibility-harness.mjs:85` -> OPEN at `scratchpad/collision-legibility-harness.mjs:319`
- `scratchpad/collision-mark-normal-harness.mjs:81` -> OPEN at `scratchpad/collision-mark-normal-harness.mjs:430`
- `scratchpad/collision-preservation-harness.mjs:117` -> OPEN at `scratchpad/collision-preservation-harness.mjs:363`
- `scratchpad/collision-read-harness.mjs:76` -> OPEN at `scratchpad/collision-read-harness.mjs:307`
- `scratchpad/composer-collision-gesture-harness.mjs:121` -> OPEN at `scratchpad/composer-collision-gesture-harness.mjs:277`
- `scratchpad/composer-priority-harness.mjs:113` -> OPEN at `scratchpad/composer-priority-harness.mjs:334`
- `scratchpad/curve-editor-harness.mjs:114` -> OPEN at `scratchpad/curve-editor-harness.mjs:451`
- `scratchpad/effects-column-harness.mjs:227` -> OPEN at `scratchpad/effects-column-harness.mjs:1095`
- `scratchpad/effects-deform-harness.mjs:103` -> OPEN at `scratchpad/effects-deform-harness.mjs:335`
- `scratchpad/effects-guides-harness.mjs:117` -> OPEN at `scratchpad/effects-guides-harness.mjs:327`
- `scratchpad/effects-scene-harness.mjs:99` -> OPEN at `scratchpad/effects-scene-harness.mjs:263`
- `scratchpad/fromtile-typing-probe.mjs:43` -> OPEN at `scratchpad/fromtile-typing-probe.mjs:75`
- `scratchpad/guide-aim-probe.mjs:31` -> OPEN at `scratchpad/guide-aim-probe.mjs:111`
- `scratchpad/label-measure-probe.mjs:27` -> OPEN at `scratchpad/label-measure-probe.mjs:129`
- `scratchpad/layer-bound-harness.mjs:126` -> OPEN at `scratchpad/layer-bound-harness.mjs:358`
- `scratchpad/live-palette-e2e-harness.mjs:46` -> OPEN at `scratchpad/live-palette-e2e-harness.mjs:159`
- `scratchpad/loop-paint-harness.mjs:104` -> OPEN at `scratchpad/loop-paint-harness.mjs:404`
- `scratchpad/mapviewport-baseline-harness.mjs:232` -> OPEN at `scratchpad/mapviewport-baseline-harness.mjs:879`
- `scratchpad/marquee-flip-button-harness.mjs:83` -> OPEN at `scratchpad/marquee-flip-button-harness.mjs:410`
- `scratchpad/marquee-flip-harness.mjs:81` -> OPEN at `scratchpad/marquee-flip-harness.mjs:450`
- `scratchpad/marquee-harness.mjs:104` -> OPEN at `scratchpad/marquee-harness.mjs:437`
- `scratchpad/marquee-paste-probe.mjs:33` -> OPEN at `scratchpad/marquee-paste-probe.mjs:139`
- `scratchpad/marquee-snap-modifier-harness.mjs:120` -> OPEN at `scratchpad/marquee-snap-modifier-harness.mjs:304`
- `scratchpad/marquee-stamp-harness.mjs:60` -> OPEN at `scratchpad/marquee-stamp-harness.mjs:175`
- `scratchpad/numberfield-empty-harness.mjs:34` -> OPEN at `scratchpad/numberfield-empty-harness.mjs:70`
- `scratchpad/object-label-harness.mjs:81` -> OPEN at `scratchpad/object-label-harness.mjs:355`
- `scratchpad/paste-pan-harness.mjs:86` -> OPEN at `scratchpad/paste-pan-harness.mjs:259`
- `scratchpad/probe-once.mjs:21` -> OPEN at `scratchpad/probe-once.mjs:87`
- `scratchpad/raster-timeline-harness.mjs:97` -> OPEN at `scratchpad/raster-timeline-harness.mjs:377`
- `scratchpad/screen-frame-harness.mjs:61` -> OPEN at `scratchpad/screen-frame-harness.mjs:202`
- `scratchpad/section-column-harness.mjs:276` -> OPEN at `scratchpad/section-column-harness.mjs:1273`
- `scratchpad/section-header-action-harness.mjs:102` -> OPEN at `scratchpad/section-header-action-harness.mjs:358`
- `scratchpad/slot-range-onscreen-harness.mjs:36` -> OPEN at `scratchpad/slot-range-onscreen-harness.mjs:116`
- `scratchpad/sweep-fix-harness.mjs:38` -> OPEN at `scratchpad/sweep-fix-harness.mjs:222`
- `scratchpad/tile-attribute-harness.mjs:132` -> OPEN at `scratchpad/tile-attribute-harness.mjs:448`
- `scratchpad/timeline-edit-harness.mjs:113` -> OPEN at `scratchpad/timeline-edit-harness.mjs:469`
- `scratchpad/vsplit-advisory-harness.mjs:108` -> OPEN at `scratchpad/vsplit-advisory-harness.mjs:623`

### s1disasm — 41 site(s)
- `scratchpad/animated-art-harness.mjs:51` -> OPEN at `scratchpad/animated-art-harness.mjs:246`
- `scratchpad/camera-harness.mjs:21` -> OPEN at `scratchpad/camera-harness.mjs:102`
- `scratchpad/canvas-cdp-harness.mjs:50` -> OPEN at `scratchpad/canvas-cdp-harness.mjs:595`
- `scratchpad/canvas-cdp-harness.mjs:50` -> OPEN at `scratchpad/canvas-cdp-harness.mjs:627`
- `scratchpad/capture-harness.mjs:33` -> OPEN at `scratchpad/capture-harness.mjs:291`
- `scratchpad/chunkgrid-hint-harness.mjs:50` -> OPEN at `scratchpad/chunkgrid-hint-harness.mjs:187`
- `scratchpad/classic-playtest-harness.mjs:76` -> OPEN at `scratchpad/classic-playtest-harness.mjs:281`
- `scratchpad/collision-edit-harness.mjs:38` -> OPEN at `scratchpad/collision-edit-harness.mjs:201`
- `scratchpad/collision-lens-harness.mjs:33` -> OPEN at `scratchpad/collision-lens-harness.mjs:195`
- `scratchpad/collision-needle-harness.mjs:33` -> OPEN at `scratchpad/collision-needle-harness.mjs:149`
- `scratchpad/composer-fill-harness.mjs:38` -> OPEN at `scratchpad/composer-fill-harness.mjs:246`
- `scratchpad/crash-harness.mjs:15` -> OPEN at `scratchpad/crash-harness.mjs:90`
- `scratchpad/label-measure-probe.mjs:28` -> OPEN at `scratchpad/label-measure-probe.mjs:140`
- `scratchpad/micro-type-harness.mjs:33` -> OPEN at `scratchpad/micro-type-harness.mjs:173`
- `scratchpad/object-label-harness.mjs:82` -> OPEN at `scratchpad/object-label-harness.mjs:517`
- `scratchpad/paint-through-harness.mjs:46` -> OPEN at `scratchpad/paint-through-harness.mjs:339`
- `scratchpad/palette-grid-harness.mjs:110` -> OPEN at `scratchpad/palette-grid-harness.mjs:622`
- `scratchpad/priority-lens-harness.mjs:46` -> OPEN at `scratchpad/priority-lens-harness.mjs:223`
- `scratchpad/probe-classic-hooks.mjs:22` -> OPEN at `scratchpad/probe-classic-hooks.mjs:95`
- `scratchpad/probe-click-paint.mjs:21` -> OPEN at `scratchpad/probe-click-paint.mjs:168`
- `scratchpad/restore-harness.mjs:17` -> OPEN at `scratchpad/restore-harness.mjs:98`
- `scratchpad/row8-probe.mjs:22` -> OPEN at `scratchpad/row8-probe.mjs:87`
- `scratchpad/row8-probe.mjs:22` -> OPEN at `scratchpad/row8-probe.mjs:96`
- `scratchpad/row8-probe.mjs:22` -> OPEN at `scratchpad/row8-probe.mjs:114`
- `scratchpad/s1-anim-harness.mjs:56` -> OPEN at `scratchpad/s1-anim-harness.mjs:163`
- `scratchpad/s1-boss-sprites-harness.mjs:67` -> OPEN at `scratchpad/s1-boss-sprites-harness.mjs:170`
- `scratchpad/s1-layout-anim-harness.mjs:56` -> OPEN at `scratchpad/s1-layout-anim-harness.mjs:250`
- `scratchpad/s1-library-presentation-harness.mjs:53` -> OPEN at `scratchpad/s1-library-presentation-harness.mjs:237`
- `scratchpad/s1-nonlevel-families-harness.mjs:59` -> OPEN at `scratchpad/s1-nonlevel-families-harness.mjs:219`
- `scratchpad/s1-priority-occlusion-harness.mjs:77` -> OPEN at `scratchpad/s1-priority-occlusion-harness.mjs:531`
- `scratchpad/s1-sonic-preview-harness.mjs:56` -> OPEN at `scratchpad/s1-sonic-preview-harness.mjs:217`
- `scratchpad/s1-sonic-sprite-harness.mjs:46` -> OPEN at `scratchpad/s1-sonic-sprite-harness.mjs:168`
- `scratchpad/section-column-harness.mjs:275` -> OPEN at `scratchpad/section-column-harness.mjs:1254`
- `scratchpad/shell-flip-harness.mjs:29` -> OPEN at `scratchpad/shell-flip-harness.mjs:240`
- `scratchpad/sprite-restore-harness.mjs:55` -> OPEN at `scratchpad/sprite-restore-harness.mjs:157`
- `scratchpad/sprite-restore-harness.mjs:55` -> OPEN at `scratchpad/sprite-restore-harness.mjs:187`
- `scratchpad/sprite-restore-harness.mjs:55` -> OPEN at `scratchpad/sprite-restore-harness.mjs:235`
- `scratchpad/tile-editor-harness.mjs:36` -> OPEN at `scratchpad/tile-editor-harness.mjs:406`
- `scratchpad/tool-keys-harness.mjs:39` -> OPEN at `scratchpad/tool-keys-harness.mjs:188`
- `scratchpad/tool-split-harness.mjs:21` -> OPEN at `scratchpad/tool-split-harness.mjs:129`
- `scratchpad/zone-blocks-probe.mjs:39` -> OPEN at `scratchpad/zone-blocks-probe.mjs:144`

### 5.3 Why I did not extend `scripts/check-peer-path-literals.mjs`

The dispatch permitted a rule only if the class turned out to be live in more than the
two files. It is — 82 files. But a fifth rule with a verb in it would go **red on 82
files on the day it lands**, which is not a gate, it is a repo-wide outage; and the only
way to land it green is an 82-entry allowlist, i.e. exactly the instrument sweep the
2026-09-02 "cut the ceremony" ruling puts out of scope. It also needs an owner call the
survey cannot make for it: is OPEN-only acceptable for a harness that provably writes
nothing (the `bganim-band-harness` row 9a shape), or does the bar mean *no peer working
tree, ever*? Booked, not built. **What is recorded instead is the observation the
dispatch asked for either way: none of the gate's four rules can catch this shape,
because all four ask how the path was spelled and the hazard is the verb** (§1).

## 6. Left open

| # | Item | Why not now |
|---|---|---|
| 1 | `bganim-ui-authored-composition-harness.mjs` Ctrl+S-es into the live aeon tree (§5.1) | Out of this parcel's scope (survey = report, not fix). Should be the next parcel; the fix is the same three lines. |
| 2 | 82 files open a live peer tree from a resolver default (§5.2) | Needs an owner ruling on OPEN-only, then a batch parcel. |
| 3 | `check-peer-path-literals` has no verb-aware rule (§5.3) | Would land red on 82 files; needs item 2 decided first. |
| 4 | `scratchpad/capture-harness.mjs:34` still has the `+ '/'` that cannot match a normalized recent row, and `:464` opens the live tree | Same class as items 1–2; it is the third `addRecentProject` site and its aeon path has been unreachable for the same reason. |
| 5 | A harness exiting non-zero left one extra row in the owner's recents once, unreproduced (§4) | Observed once in five runs; file restored and verified. Worth a row, not a guess. |
| 6 | `palette-grid-harness` `ENGINE=classic` still opens the live `s1disasm` checkout | Bar 19's own carve-out ("this parcel left `s1disasm`'s 37 sites alone"); left legible with a comment at the `S1DIR` definition rather than silently. |

Nothing here needed the emulator, and nothing here built a ROM.
