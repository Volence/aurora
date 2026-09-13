# RIGS-DEAD-NEEDLE-LEFTOVERS: the two effects rigs row 170 could not close, re-aimed, and the anchor-toggle needle in the gate

Parcel size S, branch `fix/rigs-dead-needle-leftovers`, cut from origin/master `519b0347`. The
OPEN tail of ROADMAP row 170 and of its packet, `docs/reviews/2026-09-13-effects-rigs-five-more.md`
("Stopped on, and left open"): `rowremap-author` BLOCKED and held in the gate by name, and
`scene-anchor-writer` still selecting on the dead anchor toggle. The five rigs row 170 converted
are the worked examples; their door (`openEffectsSectionState` in
`scratchpad/lib/effects-sections.mjs`) is used here unchanged.

**In one paragraph.** Both rigs died on the same line before their door: an uncaught
`window.__dbg.aeon.open(...)`, which answers the CDP error
`Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}` while the project opens anyway.
That includes `scene-anchor-writer`, which row 170 recorded only as "not run". With the sibling
rigs' `.catch` added and nothing else changed, both reached their door and the dead needles spoke.
`rowremap-author`'s opener matched no header. `scene-anchor-writer`'s opener, whose prose needle
was alive, **opened the scene form and then shut it again**, because it judged "open" by probing
for the dead anchor needle. Re-aimed on `data-section` and on the anchor's contract key, the rigs
go from **death after 1 row** and **death before any row** to **32/35** and **34/34**. The door
rows go red under a welded-shut section, and the aim rows go red under two more mutations. The
three reds left in `rowremap-author` are wording and contract changes the app made on purpose
(`208ef48b`, `f432e4e6`), not this class. The gate's hold is deleted, and the gate now also forbids
the retired anchor needle: 3 live hits on origin/master's rigs, 0 after, no false positive on
either side. **Its shape is new (caret form only), because the existing quote form would have
fired on two prose lines.** Nothing here is a finding about the app.

## What was found first

Every run used this worktree's own debug build (`dist/build-flavour.json` `flavour: debug`,
`VITE_AURORA_DEBUG: 1`). Every log printed
`root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ae99ac85185024f3e` and
`pinned: AURORA_BUILT_TREE=` naming the same worktree.

### The death, unmodified

| Rig, origin/master `519b0347` | wall clock (-0400) | load | how it ends |
|---|---|---|---|
| `rowremap-author` | 05:42:30 to 05:42:34 | 1.66 to 1.66 | `PASS [0a]`, then `HARNESS ERROR: Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}`, exit 1, no summary line |
| `scene-anchor-writer` | 05:42:38 to 05:42:42 | 1.61 to 1.56 | the same error before its first row, exit 1, 0 rows |

Both call `aeon.open` without the `.catch((e) => console.log('aeon open threw:', e.message))`
that every sibling carries. **Why the promise is collected was not investigated**; it is a
different defect. What was seen: with the catch, every run in this parcel printed
`aeon open threw: Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}`, and `[1a]`
read `{"open":true,"zone":"ojz","act":"act1","sections":9,…}` in every one of them. So the project
opens regardless.

### The catch alone (commit `05c73cfa`): the needles speak

| Rig | whole run | what the old door did |
|---|---|---|
| `rowremap-author` | **25/33**, 8 failed, exit 1 (05:44:02 to 05:44:28, load 1.48 to 1.32) | `{"open":false,"attempt":1,"why":"no header span matched"}`, then `anchor on` and `anchor channel` returned `no-element`, so `[4a]` `[8b]` `[9d]` `[10a]` went red. `[9h]` was red too: 471 B written against the committed capture's 561 B, which carries the anchor block |
| `scene-anchor-writer` | **12/23**, 11 failed, **7 unmeasured**, exit 1 (05:44:33 to 05:44:57, load 1.30 to 1.45) | the header span `Scene: aurora_anchor_waterline` was found and **clicked twice** at (1220, 789), and ended `{"open":false,"attempt":2}` |

**The second one is the quiet finding.** The old opener was "idempotent by measurement": click the
header, probe for a control inside the section, click again if the probe comes back empty. The
probe was the dead anchor needle. So the first click opened the section, the probe said it was
shut, and the second click shut it. The prose needle that looked alive was only half the door.
Three rows went **green over a shut form**:
- `[3b]`: the ladders are absent while the anchor is off; they were absent because the form was shut.
- `[6b1]`: the warning clears; it never appeared.
- `[8d]`: the saved file carries no table; the table control was `no-element`.

`scene-anchor-writer`'s migration commit `089e90b6` (2026-09-05 13:54:35) landed two and a half hours
before `d70da895` (16:20:55) reworded the anchor toggle, so the rig died after its own repair,
exactly as row 170's packet said.

### The dead needles

| Rig | line on origin/master | needle | the app today | composed at | the commit |
|---|---|---|---|---|---|
| `rowremap-author` | `:525` | `/^anchor \u2014/` (the backslash-u escape) | `anchor: the world-anchored band split. The engine splits…` | `ANCHOR_ROW.title` in `src/renderer/providers/effects-aeon.ts`, rendered as `title={ANCHOR_ROW.title}` at `EffectsScenePanel.tsx:1803` | `d70da895` (`git show` has `-` `title: 'anchor` + em dash, `+` `title: 'anchor:`) |
| `rowremap-author` | `:526` | `/^Scene \u2014 /` | `Scene: <id>`, composed per document | `EffectsScenePanel.tsx:1379` | `24541886` |
| `scene-anchor-writer` | `:505` | `/^anchor ` + the em dash character + `/` | as the first row | as the first row | `d70da895` |
| `scene-anchor-writer` | `:506` | `/^Scene: /` | alive, and prose: row 170's rule moves off it | `EffectsScenePanel.tsx:1379` | none |

## The derivation

**The door** is `openEffectsSectionState(c, SECTION_SCENE_FORM, { settleMs: 900 })`, the helper and
the row shape the five converted rigs use. The new door row is `[4s0]` in `rowremap-author` and
`[3s0]` in `scene-anchor-writer`. It is judged on the app's own `data-section-collapsed` read back
AFTER the click, prints the whole verdict, and then the run stops (`throw new Error(r.why)`). Both
private openers (`HEADER_SPAN_RECT` and `openSection`) are deleted. The title is not a door: it is
composed per document.

**The anchor toggle is found by its KEY, inside the section**:

```
[...document.querySelectorAll('[data-section="aeon.effects.scene"] select')]
  .find((e) => /^anchor(?![a-z0-9_.])/.test(e.title || ''))
```

The key is contract (`scene.anchor`); the colon after it is prose. That is `effects-deform`'s rule,
and the one row 170 applied to the factor pickers (`/^Layer \d+ f[ab](?![a-z0-9_])/`). **The dot is
excluded as well**, and that is derived: the anchor's own three rows are titled
`anchor.at.channel`, `anchor.at.dsa` and `anchor.at.dsb` (`EffectsScenePanel.tsx:1814` and `:1831`).
A boundary that let the dot through would match all four.

**The aim rows are new and count, rather than find.** `[4s1]` and `[3s1]` run with the anchor ON,
so the three `anchor.at.*` rows are on screen beside the toggle. Each asserts exactly one match and
at least one `anchor.at` row; `[4s1]` also checks the options are `["none","on"]`. **Why a count:**
M3 below shows that with the dot let through, every other row in `scene-anchor-writer` stays
green, because the toggle renders first and `.find()` returns it anyway. The count is the only
thing that sees an over-wide aim.

**No app change was needed.** The section already carries `data-section`, and the toggle's title
already carries its key, so no `data-*` attribute was added.

## How it was verified

Runner: `npm run harness:<name>` through a session-scratchpad wrapper (not committed). It extracts
a **fresh `git archive` of aeon `62fe88f7214c64de13eeb3ca71c3542a93d3da9c`** (aeon `origin/master` at
the start of the parcel) per run into the session scratchpad. It sets
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=<this worktree>` and `AEON_DIR=<that copy>`, and logs the app `HEAD`,
`git status --porcelain`, `dist/build-flavour.json`, `uptime` before and after, and the exit code.
Nothing was written to the aeon checkout. `node_modules` in this worktree is a `cp -al` hardlink
copy, not a symlink.

**Both rigs write into `docs/captures/`** of the tree they run in: the screenshots, and
`rowremap-author`'s `aurora_rowremap_waterline.json`. The wrapper printed what each run touched and
then restored those two directories from `HEAD`, so no run's pictures rode into a commit.

`dpr` was 1 in all 34 rect prints across the 18 runs. The doors are clicked by the helper through
`element.click()`, not by a pointer aim. No claim below is assembled from two runs.

| run | wall clock (-0400) | load before to after | app `HEAD` | build stamp (UTC) | rowremap-author | scene-anchor-writer |
|---|---|---|---|---|---|---|
| before | 05:42:30 to 05:42:42 | 1.66 to 1.56 | `519b0347`, porcelain `[]` | 09:42:24Z | 1 row, then HARNESS ERROR | 0 rows, HARNESS ERROR |
| catch | 05:44:02 to 05:44:57 | 1.48 to 1.45 | `519b0347` + the catch | 09:42:24Z | 25/33 | 12/23, 7 unmeasured |
| aim | 05:48:24 to 05:49:26 | 1.55 to 1.32 | `05c73cfa` + the re-aim | 09:42:24Z | 32/35 | **34/34** |
| M1 weld | 05:50:21 to 05:51:36 | 1.72 to 1.46 | `3f01e64f` + M1 | **09:50:09Z** | `[4s0]` RED, stops | `[3s0]` RED, stops |
| M2 title | 05:54:22 to 05:55:12 | 0.71 to 0.89 | `2fbcea89` + M2 | **09:54:04Z** | 26/35, `[4s1]` RED | 13/25, `[3a]` `[3s1]` RED |
| M3 dot | 05:55:39 to 05:56:30 | 1.15 to 2.30 | `2fbcea89` + M3 (rigs) | 09:55:30Z (restored) | 31/35, `[4s1]` RED | 33/34, `[3s1]` alone RED |
| final 1 | 05:56:59 to 05:57:26 / 05:58:28 to 05:58:53 | 2.15 to 1.67 / 1.58 to 1.58 | `2fbcea89`, porcelain `[]` | 09:55:30Z | **32/35** | **34/34**, exit 0 |
| final 2 | 05:57:34 to 05:58:01 / 05:58:53 to 05:59:18 | 1.69 to 1.57 / 1.58 to 1.60 | `2fbcea89`, porcelain `[]` | 09:55:30Z | **32/35** | **34/34**, exit 0 |
| final 3 | 05:58:01 to 05:58:28 / 05:59:18 to 05:59:43 | 1.57 to 1.58 / 1.60 to 1.47 | `2fbcea89`, porcelain `[]` | 09:55:30Z | **32/35** | **34/34**, exit 0 |

Every run was whole, foreground and sequential (each log's start is at or after the previous end),
13 to 27 seconds each. The three finals ran on the committed code with an empty porcelain, and
their door and aim rows printed the same verdict every time:

```
[4s0] [3s0]  open -> {"tab":"already-active","section":"clicked","collapsed":"false","ok":true,"why":null}
[4s1]        {"toggles":1,"atRows":3,"options":["none","on"]} for /^anchor(?![a-z0-9_.])/ in [data-section="aeon.effects.scene"]
[3s1]        {"toggles":1,"atRows":3} for /^anchor(?![a-z0-9_.])/ in [data-section="aeon.effects.scene"]
```

**`rowremap-author` `[9h]` went green byte-identical**: `561 B now vs 561 B in the committed
capture`. So the document the re-aimed rig authors is the one the ROM hand-off in
`docs/captures/2026-09-05-rowremap/` was built from, anchor block included.

### M1: the scene section welded shut (row 170's mutation, found at the same line)

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 2 +-
$ sed -n '1379,1380p' src/renderer/components/effects/EffectsScenePanel.tsx
        <CollapsibleSection id="aeon.effects.scene" title={`Scene: ${selected.id}`}
          collapsedOverride
```

The build exited 0, and the bundle then carried exactly one `collapsedOverride: true`. Both rigs
went red at their door and stopped:

```
FAIL  [4s0]  (rowremap-author)       exit 1, 05:50:21 to 05:50:35
FAIL  [3s0]  (scene-anchor-writer)   exit 1, 05:51:23 to 05:51:36
  open -> {"tab":"already-active","section":"clicked","collapsed":"true","ok":false,
  "why":"AIM MISSED: [data-section=\"aeon.effects.scene\"] is still collapsed after clicked
  (data-section-collapsed=\"true\"). The header took the click and the section did not open."}
HARNESS ERROR: AIM MISSED: [data-section="aeon.effects.scene"] is still collapsed after clicked …
```

`section` was `'clicked'` in both, which is the case a door judged on the click's return value
cannot see. **Restored** with `git restore --source=HEAD`: porcelain showed only the uncommitted
test file, and the line read back `defaultCollapsed`.

### M2: the toggle's title no longer opens on its key

```
-                  <Select title={ANCHOR_ROW.title} value={at === null ? 'none' : 'on'}
+                  <Select title={`toggle: ${ANCHOR_ROW.title}`} value={at === null ? 'none' : 'on'}
```

The build exited 0 (stamp 09:54:04Z) and the bundle carried `toggle: ${ANCHOR_ROW.title}` once. The
door stayed green, and the aim went red:

```
PASS  [4s0]  … "collapsed":"false","ok":true
FAIL  [4s1]  {"toggles":0,"atRows":0,"options":null} for /^anchor(?![a-z0-9_.])/ in [data-section="aeon.effects.scene"]
FAIL  [3a]   no select in the Scene form has a title opening on the key /^anchor(?![a-z0-9_.])/
FAIL  [3s1]  {"toggles":0,"atRows":0} for /^anchor(?![a-z0-9_.])/ in [data-section="aeon.effects.scene"]
```

Restored from `HEAD` (src porcelain empty, `:1803` read back) and rebuilt (stamp 09:55:30Z). The same
bundle grep that had found each mutation found neither.

### M3: the key boundary lets the dot through (a rig mutation, same restored build)

```
-const ANCHOR_KEY = String.raw`/^anchor(?![a-z0-9_.])/`;
+const ANCHOR_KEY = String.raw`/^anchor(?![a-z0-9_])/`;
```

In both rigs:

```
FAIL  [4s1]  {"toggles":4,"atRows":3,"options":["none","on"]}      rowremap-author 31/35
FAIL  [3s1]  {"toggles":4,"atRows":3}                              scene-anchor-writer 33/34, the ONLY red
```

In `scene-anchor-writer` every other row stayed green under M3, the gesture ledger `[9a]` included
(`28 gesture(s); 0 did not return 'ok'`). An over-wide aim is invisible to every row except the
count. Restored from `HEAD`, porcelain `[]`, and the three finals ran on that tree.

## The gate

`test/harness-effects-selectors.test.ts`, row 3 ("no live line in scratchpad/ selects on a retired
label"), gains the retired anchor-toggle needle, in both spellings, through a new `dashKey`.

**Caret form only, and that is measured.** `dashHeader`'s entries accept a regex caret OR the
opening quote of a string that begins with the word (the old `TITLE_OF` shape). For `anchor` the
quote form fires on prose that this directory carries:
- `camera-preview-harness.mjs:567`, a check-message continuation string that BEGINS
  `anchor` + em dash + `because a locked plane…`;
- on origin/master, `scene-anchor-writer-harness.mjs:512`, the failure message
  `'no select whose title starts "anchor` + em dash + `" is on screen'`.

Neither selects anything. Every selector the rigs ever carried for this toggle was a title regex,
which the caret form catches. **What it does not catch** is a `startsWith(...)` of the old title; no
file has one. Offered for ratification below.

**Row 4 now asks the composer too.** The anchor title is composed in
`src/renderer/providers/effects-aeon.ts` and painted by `EffectsScenePanel.tsx`, so asking only the
panel would be green for the wrong reason. A `composer` field makes row 4 check three things: that
the panel renders `title={ANCHOR_ROW.title}`, that the composer declares `export const ANCHOR_ROW`,
and that neither file paints the old spelling. **A new anti-vacuous row** pins both caret spellings
and the live key aim, which must stay green, plus the three prose shapes and the painted side.
`check-test-dashes`: OK, since no dash is spelled in the test file (built from `EM` and
`EM_ESCAPE_TEXT`, as before).

### Both sides, measured with the committed gate (`2fbcea89`)

**Before** (origin/master's two rigs restored into the tree with
`git restore --source=origin/master -- <the two>`): **RED, 3 live lines**, `1 failed | 6 passed (7)`:

```
AssertionError: 3 live line(s) still select on wording the app retired:
  scratchpad/rowremap-author-harness.mjs:525 -> now anchor: <prose>, since d70da895; find the toggle by its key, …
      const toggleSel = SEL_BY_TITLE(String.raw`/^anchor \u2014/`);
  scratchpad/rowremap-author-harness.mjs:526 -> now Scene: <id>, composed per document; open it by data-section …
      const opened = await openSection(c, String.raw`/^Scene \u2014 /`, toggleSel, 'Scene');
  scratchpad/scene-anchor-writer-harness.mjs:505 -> now anchor: <prose>, since d70da895; find the toggle by its key, …
      const toggleSel = SEL_BY_TITLE(String.raw`/^anchor <the em dash character>/`);
```

`:525` and `:505` are the new entry's; `:526` is the existing scene entry's, which the deleted hold
used to excuse. **After** (this branch's rigs): **GREEN, 7/7**, and no hold printed.

**False positives: zero on both sides, from a census rather than the gate's own output.**
`git grep` for `anchor` followed by optional spaces and the em dash (either spelling) over
`scratchpad/` found 10 lines on origin/master and 7 on this branch:

| line | on | what it is | caught |
|---|---|---|---|
| `rowremap-author-harness.mjs:525` | master | the dead toggle selector | **yes, rightly** |
| `scene-anchor-writer-harness.mjs:505` | master | the dead toggle selector | **yes, rightly** |
| `scene-anchor-writer-harness.mjs:512` | master | a failure message quoting the old needle | no |
| `scene-anchor-writer-harness.mjs:298` / `:299` | both | a block comment (history) | no |
| `camera-preview-harness.mjs:567` | both | a check-message continuation beginning with the phrase | no |
| `row-remap-control-harness.mjs:742` | both | a check message, mid-sentence | no |
| `collision-legibility-harness.mjs:17` | both | a line comment | no |
| `collision-mark-normal-harness.mjs:503` | both | a line comment | no |
| `sec7-worldwater-harness.mjs:278`, `:281` | both | line comments | no |

The caret form alone (`\^anchor`, then optional spaces, then the dash) matches exactly the two
selectors on master and nothing on this branch. The live aim `/^anchor(?![a-z0-9_.])/` is not caught:
the anti-vacuous row asserts it, and the after run is green with it in both rigs.

### Red-first on the gate's other claims

**A dead needle planted into a converted rig** (`scene-anchor-writer`'s `ANCHOR_KEY` set to
`/^anchor \u2014/`, `git diff --stat` 1 line): row 3 alone red.

```
AssertionError: 1 live line(s) still select on wording the app retired:
  scratchpad/scene-anchor-writer-harness.mjs:332 -> now anchor: <prose>, since d70da895; …
      const ANCHOR_KEY = String.raw`/^anchor \u2014/`;
      Tests  1 failed | 6 passed (7)
```

Restored from `HEAD`, porcelain `[]`, 7/7.

**The composer painting the old title again** (`effects-aeon.ts:4752` set back to `title: 'anchor` +
em dash, `git diff --stat` 1 line): row 4 alone red.

```
× and the retired labels really are retired: no owning panel renders one of them
+   "src/renderer/providers/effects-aeon.ts composes the label retired for aeon.effects.scene
     (harnesses were told: now anchor: <prose>, since d70da895; …)"
      Tests  1 failed | 6 passed (7)
```

Restored from `HEAD`, porcelain `[]`, the line read back `anchor:`, 7/7.

### The hold, deleted in the re-aim's own change

The hold's end condition, run for real: the pre-parcel test file (with the hold, restored from
`05c73cfa`) over this branch's re-aimed rigs.

```
  DECLARED HOLD since 2026-09-13: scratchpad/rowremap-author-harness.mjs (aeon.effects.scene) - BLOCKED …
AssertionError: the hold on scratchpad/rowremap-author-harness.mjs (aeon.effects.scene) matches no
live line any more: the rig was re-aimed, so delete the hold in the same change
      Tests  1 failed | 5 passed (6)
```

The gate demanded it, and the deletion is in `3f01e64f` beside the re-aim. `HOLDS` is empty today;
its docblock records the lift. Restored from `HEAD`: 7/7.

## Alternative green paths, and why each is ruled out

- **The door green because the section arrived open.** Every run uses a private Electron profile
  (`guard: private profile for this RUN`), and every door verdict printed `"section":"clicked"`, not
  `'already-open'`. M1 then turned the door red on the app's attribute alone, with the click taken.
- **The toggle row green on the wrong select.** A `.find()` returns the first match, so a wrong aim
  can still drive the right control (M3 shows exactly that). The count rows are what rule it out:
  `toggles` 1 with `atRows` 3 on screen, and red at 4 under M3 and at 0 under M2.
- **`[4a]` / `[3c]` green from a seeded default.** The anchor is read off the document the app holds
  (`scenesJson`). It is `null` until the toggle is driven: `anchor.at = null` in the catch-only run
  and under M2.
- **The gate green because the scanner reads nothing.** The before side is red on 3 lines and
  both plants are red, each naming its file and line.
- **The whole thing green because the runner ran another tree.** Every log's `root:` and `pinned:`
  name this worktree, and each mutation's build stamp is newer than the last. A mutation on disk
  never left its row green.

## The whole node suite

```
$ VITEST_MAX_WORKERS=4 npm test          # exit 0, 06:04:58 to 06:06:03, load 7.93 to 13.38
 Test Files  618 passed | 3 skipped (621)
      Tests  9603 passed | 9 skipped (9612)
failure-class: no failures in this run (621 module(s) reported).
```

Run on `2fbcea89` with this packet and the ROADMAP row on disk and not yet committed.
`check-doc-citations` reads "tracked-or-new" documents, so it judged both ("OK, every path cited by
a document line written since 2026-09-06T00:39:36Z is tracked"), and `check-cited-paths` said
"OK". The only bytes changed after that run are this totals block and the row's totals phrase. The
load was high for this run; no row in it is a timing claim.

## Stopped on, and left open

- **`rowremap-author` `[6b]` `[6c]` `[7b]`: red on every run that reached them, not this class, not
  fixed.** `[6b]` and `[6c]` drive the height picker to its extreme and look for one option marked
  as building. `208ef48b` (2026-09-06, "revendor: height_shift is enum [4], so the picker derives
  from a SET not two ends") left one option, `4:16 lines (shift 4)`, so there is no extreme and no
  mark. `[7b]` looks for a downward-ramp warning that `f432e4e6` (2026-09-06, "curve advisory: aeon
  refuted the DIRECTION, and the sentence Aurora shipped rested on it") withdrew on purpose. All
  three are rows asserting behaviour the app changed deliberately, a different repair from
  re-aiming a selector, and they want their owner's reading.
- **`window.__dbg.aeon.open` answers `Promise was collected`** on this build, in every rig. Not
  investigated here, by instruction. The catch is the siblings' shape and changes nothing about it.
- **`scene-anchor-writer`'s block comment at `:299`** still quotes the old needle in its history
  paragraph. It is a comment, the gate strips it, and it is the record of the first run that went
  wrong on that needle.
- **Teardown** is untouched in both rigs (`await killTree(child)`).
- **No emulator was touched.** Every claim is about a DOM control, an attribute, a document the app
  holds, or a source line.

## For the overseer to ratify

1. **The anchor entry is caret-form only** (`dashKey`), not `dashHeader`'s caret-or-quote, because
   the quote form fires on two prose lines. The cost: a future `startsWith` of the old title would
   not be caught.
2. **The toggle is aimed by its title KEY, scoped by `data-section`**, not by a new `data-*`
   attribute on the select. This is row 170's precedent for control keys. The alternative (a pure
   attribute on the toggle) was not needed and was not added.
3. **`scene-anchor-writer` got the same `.catch`**, though the brief named it only for
   `rowremap-author`. It died on the same line, so its door could not be reached without it.
4. **Two new aim rows, `[4s1]` and `[3s1]`, that count rather than find.** M3 shows the count is the
   only row that sees an aim wide enough to match the `anchor.at.*` rows.
