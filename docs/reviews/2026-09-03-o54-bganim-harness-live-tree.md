# O54 — the bganim composition harness stops writing into aeon's live tree

Branch `parcel/o54-bganim-harness-live-tree`, cut from master `01cb4f76`
("merge: O53 — the palette harnesses stop opening the aeon lane's live checkout").

| commit | what |
|---|---|
| `735eee0e` | `scratchpad/bganim-ui-authored-composition-harness.mjs`, `scratchpad/capture-harness.mjs` |
| (this file) | the packet |

---

## 1. The defect, stated precisely

`scratchpad/bganim-ui-authored-composition-harness.mjs` did not merely *read* the aeon
lane's working tree. It **wrote into it, by design, and required the write to succeed.**

Pre-fix line numbers:

- `:76` — `const AEONDIR = siblingPathOrUnresolved('aeon');` — the resolver's **default**,
  i.e. `<suite root>/aeon`, which on this machine is the aeon lane's live checkout.
- `:77` — `OVERRIDE_FILE = ${AEONDIR}/games/sonic4/data/editor_bg_override.json`.
- `:335` — `window.__dbg.aeon.open(AEONDIR)` — opens that tree as a project in the app.
- `:416-419` — dispatches a real **Ctrl+S** through `Input.dispatchKeyEvent`.
- `:423-426` — row 5a asserts the file's sha256 changed, and
  `throw new Error('nothing was written — the comparison would judge the OLD file')`
  otherwise.

So a **successful** run overwrote a 110 KB tracked file in another lane's working
directory, and an **unsuccessful** run was *defined* as the write not happening. This is
review bar 19 (`docs/OVERSEER.md`, "A TEST MUST NOT READ A PEER REPO'S WORKING TREE") in
its worst form — the bar's original instance only read.

`scripts/check-peer-path-literals.mjs` cannot see it, for the reason O53 already recorded:
all four of its rules ask *how the path was spelled*, and this file spelled it perfectly
(no sibling literal, no session scratchpad, no raw `process.env`, no build path composed
out of `AURORA_DIR`). The hazard is the **verb**, and no rule in the gate has a verb. The
gate prints OK over this file both before and after this parcel (§5).

### 1.1 The file's prose asserted the opposite of its code

This is the part worth keeping. The header block claimed, in four separate sentences, a
containment the code did not have:

> It is HERMETIC. It copies aeon's project to a tempdir and opens THAT, with
> `editor_bg_override.json` taken from the `ls-remote`-resolved pushed revision rather
> than the sibling working tree — which is somebody's live directory. **aeon's real tree
> is never written to.**

There is no copy step, no tempdir, and no `ls-remote` anywhere in the file. `AEONDIR` is a
`const` bound once at `:76` and never reassigned. `main()` then *printed* the claim to the
operator every run:

```
console.log(`  (aeon's real tree is NOT this path unless you overrode AEON_DIR)\n`);
```

— which is exactly backwards: without an override, that path **is** aeon's real tree. And
`:334` carried `// ---- 1. Open the TEMP COPY. ----` immediately above the line that opens
the live one.

A prose containment is not a containment. All four claims are replaced with an accurate
description plus a ⚠ block recording what they used to say, so a reader who finds the old
text in `git log` knows it was tested and false rather than aspirational.

### 1.2 It does NOT build a ROM — checked before scoping, and re-checked

`grep` over the file for `build.sh`, `regenerate-level`, `FAST=`, `s4.bin`, `SIGIL_` and
`p2bin` finds nothing. The run opens the project, saves, hashes the file, and writes three
JSON documents into aurora's own `scratchpad/item29-emit/` for a later python stage. **No
step requires aeon's real checkout**, so a copy serves identically and this is not a
BLOCKED report. Demonstration 3 (§3.3) confirms it empirically: against a fresh copy the
run reaches the app, opens the project with 9 sections, and passes three rows before dying
of an unrelated pre-existing defect.

---

## 2. What changed

The fix is **copied** from the four files that already do this correctly —
`scratchpad/palette-drag-harness.mjs` and `scratchpad/palette-grid-harness.mjs` as O53
landed them, and the older `scratchpad/guard-surface-harness.mjs:91-107` and
`scratchpad/section-raster-select-harness.mjs:98-120` — not invented.

- **`checkoutOverride('aeon')`** (`test/support/sibling-root.mjs:592`) with **no default**,
  refusing at import when nothing is set. Going through the resolver's own instrument
  rather than `process.env.AEON_DIR` also buys the transitional aliases (`LIVE_AEON`,
  `AEON_ROOT`, `AURORA_AEON_REPO`), the two-spellings-disagree refusal and the
  set-but-wrong error.
- a **second** refusal against `siblingDefaultPathOrUnresolved('aeon')`
  (`test/support/sibling-root.mjs:653`), which answers with where aeon lives *by default
  beside this repo* while ignoring `AEON_DIR` — the only way to compare the operator's
  value against the tree being guarded without comparing it to itself. A literal would
  stop guarding the moment the suite moves.
- both messages name `AEON_DIR` and carry a working `cp -r <resolved default>
  $(mktemp -d)/aeon` recipe, matching the existing four.
- **No dead-path default.** A dead path never trips the second guard, so the run gets past
  the refusal and dies later and further away, which reads as a broken harness rather than
  a missing variable (`docs/OVERSEER.md`, SUITE-PATHS).

**One gate per condition.** "Nothing was set" and "what was set is the live tree" are
different environments needing different fixes, so they are two `throw`s at two lines —
**127** and **141**, demonstrated separately in §3.1 and §3.2.

The run banner now tells the truth rather than the opposite of it:

```
  project under test: <AEON_DIR>  (from AEON_DIR)
  THIS TREE IS WRITTEN TO. The guards above have already checked it is
  not /home/volence/sonic_hacks/aeon.
```

---

## 3. The three demonstrations, verbatim

Environment for all three: this worktree
(`/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a34d1a0515ce03766`), which has
no `node_modules` and no `dist/`, so `runTarget` borrows the main checkout's build and says
so. Wall clock at the start of the sequence: `2026-09-03T01:59:23-04:00`, `up 8 days,
17:48`, load average 6.61.

### 3.1 `AEON_DIR` unset → refuses at import, line 127

```
$ env -u AEON_DIR -u LIVE_AEON -u AEON_ROOT -u AURORA_AEON_REPO \
    node scratchpad/bganim-ui-authored-composition-harness.mjs
root: /home/volence/sonic_hacks/aurora  BORROWED — this script lives in /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a34d1a0515ce03766, which has no built app, so the app under test is /home/volence/sonic_hacks/aurora's build
      walked up 3 level(s) from /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a34d1a0515ce03766 to the nearest built tree /home/volence/sonic_hacks/aurora
file:///home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a34d1a0515ce03766/scratchpad/bganim-ui-authored-composition-harness.mjs:127
  throw new Error(
        ^

Error: AEON_DIR is unset, and this harness has no honest default: it OPENS the tree it is pointed at as a project, presses Ctrl+S, and REQUIRES games/sonic4/data/editor_bg_override.json to change on disk (row 5a), so it must be pointed at a throwaway copy of aeon. Make one (e.g. `cp -r /home/volence/sonic_hacks/aeon $(mktemp -d)/aeon`) and set AEON_DIR to it. Refusing rather than guessing: the guess this replaced was the aeon lane's LIVE checkout, under a header claiming a tempdir copy the code never made. (empyrean contract/SUITE_PATHS.md, precedence step 4; aurora docs/OVERSEER.md review bar 19)
    at file:///…/bganim-ui-authored-composition-harness.mjs:127:9
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)

Node.js v24.15.0
EXIT=1
```

True exit code, measured with the harness's own status and nothing piped:

```
$ env -u AEON_DIR node scratchpad/bganim-ui-authored-composition-harness.mjs >/dev/null 2>&1; echo $?
1
```

### 3.2 `AEON_DIR=/home/volence/sonic_hacks/aeon` → refused by the default-path guard, line 141

```
$ AEON_DIR=/home/volence/sonic_hacks/aeon node scratchpad/bganim-ui-authored-composition-harness.mjs
file:///…/scratchpad/bganim-ui-authored-composition-harness.mjs:141
  throw new Error(
        ^

Error: AEON_DIR=/home/volence/sonic_hacks/aeon is the real aeon tree — this harness saves through the app and requires the override document it opens to be REWRITTEN, so it must never write there. Point it at a throwaway copy (e.g. `cp -r /home/volence/sonic_hacks/aeon $(mktemp -d)/aeon`). (aurora docs/OVERSEER.md review bar 19)
    at file:///…/bganim-ui-authored-composition-harness.mjs:141:9

Node.js v24.15.0
```

```
$ AEON_DIR=/home/volence/sonic_hacks/aeon node scratchpad/bganim-ui-authored-composition-harness.mjs >/dev/null 2>&1; echo $?
1
```

**Different lines: 127 and 141.** One gate per condition, confirmed by
`grep -n 'throw new Error(' …` — the next `throw` in the file is at 185
(`CDP target never appeared`), well past both.

### 3.3 `AEON_DIR=<a fresh copy>` → gets past the refusal, then dies of a PRE-EXISTING defect

The copy: `rsync -a --exclude=.claude --exclude=.git /home/volence/sonic_hacks/aeon/ <tmp>/`.
`.claude` is excluded because it is 3.1 GB of other agents' worktrees and 3.2 GB of aeon's
3.3 GB total; `.git` (74 MB) is excluded because Aurora's project loader does not read it.
The copy is 154 MB and its
`games/sonic4/data/editor_bg_override.json` is byte-identical to the original
(`9d05f5125004b250…` on both).

```
$ AEON_DIR=<copy> ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
    PORT=9394 node scratchpad/bganim-ui-authored-composition-harness.mjs
root: /home/volence/sonic_hacks/aurora  BORROWED — this script lives in …/agent-a34d1a0515ce03766, which has no built app, so the app under test is /home/volence/sonic_hacks/aurora's build
      walked up 3 level(s) from …/agent-a34d1a0515ce03766 to the nearest built tree /home/volence/sonic_hacks/aurora

DERIVED FROM THE VENDORED CONTRACT (aeon@1ee8f8e):
  BG_TILE_CAPACITY = 448   TILE_BYTES = 32   PHASE_BANKS = 8
  project under test: /tmp/…/o54-aeon-copy  (from AEON_DIR)
  THIS TREE IS WRITTEN TO. The guards above have already checked it is
  not /home/volence/sonic_hacks/aeon.

  before: 110660 B  sha256 9d05f5125004b250…

guard: discovery snapshot taken before launch:
        /home/volence/.aurora/mcp.json 203B [pid 4032361 DEAD — STALE FILE] …
        /home/volence/.config/aurora/recent-projects.json 362B [3 recent entries] "[\n  {\n    \"path\": \"/home/volence/sonic_hacks/aeon\", …
guard: pinned Ozone to x11 (--ozone-platform=x11) — see HAZARD 5
PASS  [0a] window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)
PASS  [1a] the project opened, with sections
        {"open":true,"zone":"ojz","act":"act1","sections":9,"gridWidth":3,"gridHeight":3,"tool":"view","dirty":false,"dirtyActs":[]}
PASS  [2a] the Effects pill is on the facet bar [instrument check]
        clicked

HARNESS ERROR: no "New band" section on screen
HARNESS_EXIT=2
```

**This is not a full green, and it is not a regression.** Electron launched, the copy
opened as a real 9-section project, and three rows passed — so the refusal is cleared and
the harness reaches the app. The throw is
`docs/reviews/2026-09-03-harness-red-sweep.md:545`, recorded the same day against the
**pre-fix** harness pointed at the live tree, and shared with two siblings
(`bganim-band-harness.mjs:543`, `bganim-rate-shift-harness.mjs:544`). That sweep's finding
1 built a control at `adefc7aa` — the commit *before* the Effects sub-tab change — rebuilt,
and re-ran `bganim-band-harness`: **identical throw**. The cause is undetermined and
explicitly out of that sweep's scope and this parcel's.

So the honest statement is: **row 3 passes its purpose (the refusal is cleared and the app
is reached) and the harness remains RED for a documented pre-existing reason.** Fixing the
"New band" cluster is a separate item; see §6.

Note the run reached row 2a and threw at the `OPEN_NEW_BAND` step, which is **before** the
Ctrl+S at row 5a. Nothing was written to the copy either — its override file still hashes
`9d05f5125004b250…`, matching the live one.

---

## 4. The two-rot check — one present, one not

O53's parcel found both harnesses it touched had been silently broken for their whole
lives, hidden behind the live-tree defect. Checked for the same two shapes here.

### 4.1 Trailing `/` on the project path — **NOT present in this harness; present in `capture-harness.mjs` and fixed**

`grep -n 'addRecentProject\|recent\|button\[title'` over
`bganim-ui-authored-composition-harness.mjs` returns **nothing**. This harness does not
navigate by the recent-projects list at all; it calls
`window.__dbg.aeon.open(AEONDIR)` directly, and `AEONDIR` never carried a trailing slash.
Checked, shape absent.

`scratchpad/capture-harness.mjs` **did** carry it — the third site O53 §5 named — and it is
in scope, so it is fixed:

- `:34` `const AEONDIR = siblingPathOrUnresolved('aeon') + '/';`
- `:464` `window.api.addRecentProject(<AEONDIR>, 'Sonic 4')`
- `:473` `document.querySelector('button[title=<AEONDIR>]')`

Derived from source rather than asserted — `src/main/recent-projects.ts:52` stores through
`normalizeProjectPath` (`src/shared/project-path.ts:29`), and
`src/renderer/components/home/HomeTab.tsx:95` renders `title={r.path}`. Executing the real
`normalizeProjectPath` body on both spellings:

```
OLD (+ "/")      seeded="/home/volence/sonic_hacks/aeon/"
                 addRecentProject stores -> "/home/volence/sonic_hacks/aeon"
                 HomeTab renders title    -> "/home/volence/sonic_hacks/aeon"
                 selector matches?        -> NO — the row can never be found  (button[title="/home/volence/sonic_hacks/aeon/"])
NEW (no slash)   seeded="/home/volence/sonic_hacks/aeon"
                 addRecentProject stores -> "/home/volence/sonic_hacks/aeon"
                 HomeTab renders title    -> "/home/volence/sonic_hacks/aeon"
                 selector matches?        -> YES  (button[title="/home/volence/sonic_hacks/aeon"])
```

Corroborated independently by the guard's own discovery snapshot in the §3.3 run, which
prints the machine's real stored row as `"path": "/home/volence/sonic_hacks/aeon"` — no
trailing slash. The `+ '/'` is removed and the reason recorded at the site.

### 4.2 A `null`-for-unmeasurable rendered as a verdict — **one mild instance, fixed**

Every probe in the file was walked:

| probe | "could not measure" value | how the caller renders it | verdict |
|---|---|---|---|
| `window.__dbg.aeon.state()` | `null` via `.catch` | row 1a prints `JSON.stringify(st)` → `null`, then throws with its own message | distinguishable — OK |
| `CONTROL_BY_TEXT` (`promoteBtn`) | `null` | row 4b prints `JSON.stringify(promoteBtn)` → `null`, then throws `Promote unavailable` | distinguishable — OK |
| `OPEN_NEW_BAND` | `'no-section'` | throws by name | OK |
| `SET_INPUT` | `'no-element'` | row 4a prints `cols=… rows=…` | OK |
| **`clickByText` (row 2a)** | **`false` = not on screen, `'disabled'` = found but off** | **`check(… clickedPill === true)` with NO detail argument** | **rot** |

Row 2a collapsed three outcomes into one bare `FAIL` line with nothing printed, so "the
Effects facet is not in the document" and "the facet is there but disabled" — different
environments needing different fixes — were indistinguishable from the output. The row now
prints which:

```js
check('2a', 'the Effects pill is on the facet bar [instrument check]', clickedPill === true,
  clickedPill === true ? 'clicked'
    : clickedPill === 'disabled' ? 'found but DISABLED'
      : 'NOT FOUND — no button matching /^Effects$/ in the document');
```

The assertion is unchanged; only the evidence line is added. `clicked` is visible in the
§3.3 run above.

**One shape found and not fixed, recorded rather than silently left:** `:351`
`await c.evalExpr(OPEN_BAND_LIST)` discards its return value entirely, so `'no-section'`
from the band-list opener is invisible. It is currently harmless — every probe below reads
the *model* (`window.__dbg.aeon.bands()`, `bandBudget()`), not the collapsed DOM — and
touching it is gate extension under the standing "cut the ceremony" ruling. Noted for
whoever takes the "New band" cluster.

---

## 5. Gates and suite

```
$ node scripts/check-peer-path-literals.mjs
check-peer-path-literals: scanned 1218 .ts/.tsx/.mjs/.mts/.py/.sh file(s) under src, test, scripts, scratchpad against 4 rule(s) — sibling-literal, session-scratchpad, unratified-env, checkout-as-build-tree (all 4 fired on the canaries, both dialects; 0 git-ignored file(s) excluded, nothing else).
check-peer-path-literals: OK — no executable line names a sibling checkout by absolute path, names a session scratchpad, reads a suite path variable outside the resolver, or composes a build path out of AURORA_DIR.
GATE_EXIT=0
```

It printed OK before this parcel too, for the reason in §1 — recording it so nobody reads
the OK as evidence the hazard is covered.

```
$ npm test
 Test Files  469 passed | 2 skipped (471)
      Tests  6476 passed | 8 skipped (6484)
   Duration  12.22s
skip-report: OK — every skip named its reason.
```

Zero failures. The 8 skips are the standing opt-in/absent-tree set (`AURORA_FG_GATE_FILE`,
`AURORA_BENCH`, `AURORA_LIVE_S1_WARP`, the two `s4_engine` rows, and the sibling-root
main-checkout row that a linked worktree cannot measure) — none introduced here.

### The aeon lane's working tree, after every run above

```
$ git -C /home/volence/sonic_hacks/aeon status --porcelain
 M docs/lane-status.json
 M tools/freeze_preflight.sh
```

Only the aeon lane's own two edits. **No run of this parcel wrote into aeon** — no
`games/sonic4/data/editor_bg_override.json`, and that file still hashes
`9d05f5125004b2508fc978bb3747b7fb6ae7d46973c4beff34ebb67d95346a77`, identical to the copy
the §3.3 run was pointed at.

---

## 6. What is left open, and why

1. **The harness is still RED**, on `no "New band" section on screen` — pre-existing,
   shared with `bganim-band-harness` and `bganim-rate-shift-harness`, cause undetermined,
   and proven at `docs/reviews/2026-09-03-harness-red-sweep.md` finding 1 to predate the
   Effects sub-tab commit. This parcel is scoped to the live-tree write; diagnosing the
   Effects-panel cluster is a separate item and would be the thing that finally makes this
   harness's green meaningful.
2. **`scratchpad/capture-harness.mjs` still resolves aeon to the live tree** at `:34`
   (`siblingPathOrUnresolved('aeon')`) and opens it as a project at `:473`. It only
   *reads* — its only `writeFileSync` calls target aurora's own `scratchpad/shots-*`
   (`:208`, `:512`) — so it is bar 19's **original** form, not this parcel's. Out of scope
   per O54's scope note; recorded here so the survey row does not read as closed.
3. **The other 49 aeon sites** in `docs/reviews/2026-09-03-o53-palette-harness-live-tree.md`
   §5.2 are untouched, per the standing "cut the ceremony" ruling: bug tier only, no
   instrument sweeps. That survey was read, not redone.
4. **No emulator was touched**, per the standing invariant. Nothing here builds or runs a
   ROM, so no runtime confirmation is owed or claimed.
5. `docs/ROADMAP.md` and `docs/lane-log.jsonl` are the overseer's to update; this parcel
   changed neither.
