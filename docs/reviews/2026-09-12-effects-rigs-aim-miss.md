# EFFECTS-RIGS-AIM-MISS: two rigs were reading a dash the app stopped writing

Parcel size M, branch `parcel/effects-rigs-aim-miss`, cut from master `fe8c2b21`. Booked as a
follow-up of ROADMAP row 161, whose packet records that *"`effects-deform` and `vsplit-advisory`
stop on pre-existing aim misses before their Parallax round trip, **identically on master**, so
neither measures this."* That is exactly what was found: the stops predate row 161, they are both
in the RIGS, and the app is not wrong anywhere this parcel looked.

Same class and same shape as `docs/reviews/2026-09-12-ramp-rig-reaim.md`, which is the model this
follows.

**In one paragraph.** Both rigs opened the Effects **Scene form** by hunting a header whose text
matched `/^SCENE\s*—/i`. That em dash died on 2026-09-05 in `24541886` ("dash sweep (effects
panels): the last 85, and two assertions moved with them"), which gave every effects section
header a colon; the header reads `Scene: <id>` today. So the form never opened, every control
inside it was unmounted, and neither rig reached the round trip it exists for — `effects-deform`
went as far as throwing `wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build` at a build
that was correct. With the door open, `effects-deform` hit **four more reds from the same three
commits**, one axis over: it read a control's contract key as "everything up to the first space",
which the colon glued to the key. Nothing here is a finding about the app. The re-aimed rows were
proved to discriminate with five mutations planted in the APP, each shown on disk, each run, each
restored from a committed baseline.

## What was found first

Both rigs, unmodified, on this worktree's own debug build (`dist/build-flavour.json` =
`{"flavour":"debug","VITE_AURORA_DEBUG":"1"}`), `root:` and `pinned:` both this worktree.

| | |
|---|---|
| **The rig** | `scratchpad/effects-deform-harness.mjs`, `npm run harness:effects-deform` |
| **The row** | `[2c]` — "the Scene form is open — it arrives collapsed since d-26b" |
| **The dead needle** | `/^SCENE\s*—/i` over a `div` with inline `cursor: pointer` |
| **What the app says today** | `Scene: deform_probe` — a header composed per document |
| **Where it is composed** | `src/renderer/components/effects/EffectsScenePanel.tsx:1379`, <code>title={\`Scene: ${selected.id}\`}</code> |
| **Where it is painted** | `src/renderer/components/ui/CollapsibleSection.tsx` — the header `div` inside `<div data-section={id} data-section-collapsed=…>` |

| | |
|---|---|
| **The rig** | `scratchpad/vsplit-advisory-harness.mjs`, `npm run harness:vsplit-advisory` |
| **The row** | `[5a0]` — "the v_factor spinner took a camera-tracking shift" (and twelve after it) |
| **The dead needle** | the same `/^SCENE\s*—/i`, in a private copy of the same opener |
| **What the app says today** | the same `Scene: <id>` |
| **Where it is composed** | the same call site |
| **Where it is painted** | the same header |

And, with the door open, four more in `effects-deform`:

| Row | The dead needle | What the app says today | Where it is composed |
|---|---|---|---|
| `[4b]` `[4e]` | the key is `title.slice(prefix.length).trim().split(' ')[0]`, i.e. everything before the first SPACE | `deform_fg speed: how fast the sample point walks the table…` | `src/renderer/providers/effects-aeon.ts:1568` (`SCENE_DEFORM_ROW_SHARED.speedTitle`) and `EffectsScenePanel.tsx`'s period picker |
| `[4f]` `[4g]` | `/^deform_fg bin —/` — the dash spelled out | `deform_fg bin: a path under data/editor/effects/ ending in .bin…` | `EffectsScenePanel.tsx`, `TableRefField`'s `<input title=…>` |
| `[5a]` | nothing of its own | — | downstream of `[4f]`: two of its five gestures never happened |

**The rewordings were deliberate and correct, so the rigs are what was wrong.** `git log -S` names
three commits, all 2026-09-05: `24541886` (the effects panels), `d70da895` ("dash sweep, group 2:
the effects scene provider, 80 repairs") and `2434f9d9` ("group 6: src/renderer and src/main, the
last 149"). `24541886`'s own body states the rule these two rigs then broke:

> PriorityChips' three titles are DOCUMENTED CDP HARNESS SELECTORS: the file says KEEP THESE
> STRINGS STABLE … **TWO ASSERTIONS MOVED**, and the first one is why prose edits are not find and
> replace.

Two assertions moved with the sweep. These openers were not among them, and nothing in the repo
could see it: both rigs are run by hand, and a selector that matches nothing looks exactly like a
control that is missing.

## The red before

```
$ npm run harness:effects-deform                     # unmodified rig
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a2f8ab7f662709137
      pinned: AURORA_BUILT_TREE=<the same>
PASS  [2b] ANTI-VACUOUS: the Effects panel is mounted
        ["Scenes","Scenes","Layers (5/16 per scene)","Layers (5/16 per scene)",
         "Section assignment","Section assignment"]
FAIL  [2c] the Scene form is open — it arrives collapsed since d-26b [instrument]
        open → no-scene-header
...
FAIL  [0a] the build under test contains the deform rows (this branch, not master)
        …/dist — controls titled deform_fg: []
HARNESS ERROR: Error: wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build
```

`[2b]`'s own artifact is the proof the app was fine: it lists the section headings on screen, and
**no heading says `SCENE —` because none of them is spelled that way any more**. Nine rows
reached, of 43. The verdict the run ended on — "wrong build" — was false in both halves: the build
was a correct debug build, and the deform controls exist.

```
$ npm run harness:vsplit-advisory                    # unmodified rig
PASS  [4b] ⚠ DISCRIMINATING (silence): a LOCKED scene with a split says NOTHING on screen
FAIL  [5a0] the v_factor spinner took a camera-tracking shift
        set result = "no-element" (wanted 3)
FAIL  [5a1] ANTI-VACUOUS: the DOCUMENT now holds the illegal combination
        v_factor=15 (lock is 15) L0.vsplit={"at":0}
FAIL  [5a] … FAIL [5b] … FAIL [5b2] … FAIL [5c] … FAIL [5d] … FAIL [5e] … FAIL [5j]
FAIL  [5f] … FAIL [5f2] … FAIL [5g] … FAIL [5g2]
HARNESS ERROR: TypeError: Cannot read properties of undefined (reading 'blockH')
```

10 of 23 rows reached, of 45; the run died at `vsplit-advisory-harness.mjs:865`. **`[5a0]` reads
as a missing CONTROL and is a missing DOOR** — and that is the second finding here, separate from
the needle: this rig opened the scene form and threw the answer away. It had no row on the door at
all, so the first thing that spoke was eleven rows downstream and about the wrong subject.

## The derivation from source

### The door

`CollapsibleSection` renders `<div data-section={id} data-section-collapsed={…}>`, and its own
docblock says why: so a harness can tell an open section from a shut one *"without a scan for a
rotated chevron that would break on the next icon change"*. `scratchpad/lib/effects-sections.mjs`
already exists for exactly this argument applied to the title, written for BGANIM-HARNESS-REPAIR
after the same defect hit eight other rigs. It gains:

- `SECTION_SCENE_FORM = 'aeon.effects.scene'` — the id the app itself routes on
  (`providers/effects-sub-tabs.ts` lists it under `parallax`; `revealEffectsSection` reveals by
  it), so a rename breaks the app rather than silently breaking a harness.
- `PARALLAX_SUB_TAB`, and the `SECTION_SUB_TAB` entry that routes the section to it — the sub-tab
  must be activated first or the section is not mounted at all.
- `openEffectsSectionState(c, id)` → `{ tab, section, collapsed, ok, why }`, and
  `openEffectsSectionOrThrow` on top of it.

**The needle is RETIRED, not repaired.** The title is composed per document
(<code>\`Scene: ${selected.id}\`</code>), so there was never a stable string to type: a harness
that swapped `SCENE —` for `Scene:` would still be selecting on prose, and would break on the day
the panel names the scene differently.

**`ok` is the app's own attribute, re-read AFTER the click, and not the click's return value.** A
header whose handler was removed still takes a click and `openEffectsSection` still answers
`'clicked'`. That distinction is not theoretical: mutation **M1** below is exactly it.

**And the door is a row that can fail.** The first cut of this made the helper throw on every bad
answer, which would have given both rigs a door row that can only pass — success and failure
emitting the same artifact, the defect class this repo pays for most often. `openEffectsSectionState`
returns the verdict, the rigs `check` it and print it, and only then stop.

### The key

`[4b]` and `[4e]` ask "does the panel render one control per schema parameter". They read the
parameter's name off the control's `title` by taking everything before the first space, which
worked only while a glossed title read `deform_fg speed — how fast …`, because the dash is its own
word. With the colon glued to the key the extractor answered `'speed:'`; `[4e]` compared that to
the schema and went red, and `[4b]`'s filter (`/^[a-z][a-z0-9_]*$/`) **dropped `period:` and
`speed:` entirely**, so the row reported the app rendering ONE control where the schema asks for
three. The panel renders all three.

The replacement: **the key is contract and the punctuation after it is prose.** `keyOfTitle`
matches the SCHEMA's own keys — every `$defs/tableRef` branch's `required` parameters, plus
`$defs/sceneDeform`'s `shared.required` (which is where `speed` now comes from; it used to be
typed into three expectations), plus `bin` — longest-first so `max_offset` is never read as `max`,
and requires only that the next character is not a key character. `CONTROL_WITH_KEY` is the
selector side of the same rule, and replaces `/^deform_fg bin —/`.

**What was NOT dropped.** `[4b]` still requires any parameter drawn as a PICKER rather than a
spinner to carry the divisor rule in its own title (ROADMAP row 63's "a set, not a range"). That
clause is what stops a picker quietly replacing a spinner, the sweep did not touch it, and
mutation **M3** proves it is still live.

## How it was verified

Runner: `npm run harness:effects-deform` and `npm run harness:vsplit-advisory` (`package.json` →
`node scratchpad/<name>.mjs`); `npx vitest run test/harness-effects-selectors.test.ts` and the full
`npm test` chain for the node rows.

Every run: `ELECTRON_BIN=<main checkout>/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=<this worktree>`, `AEON_DIR=<a git archive of aeon
a38ce7c961ef83136ac2f7c35e09b2ded7a109ea, extracted to the session scratchpad>` — an archive rather
than the peer working tree, which is dirty in the effects data these rigs read. Every run
announced `root:` and `pinned:` as this worktree; **`dpr` was 1 in every run**, printed beside the
rect each time (`deform_fg select rect={"left":1177,"top":1115.03125,…}`, aim `(1221, 1128)`;
vsplit's `[5c]` aim `rect={"left":1182,"top":427.53125,"width":175,"height":99}` aim `(1270,477)`).
No claim below is assembled from two runs.

| run | wall clock | app source | rig | `effects-deform` | `vsplit-advisory` |
|---|---|---|---|---|---|
| A | 22:07–22:08 | baseline | **unmodified** | 9 rows reached of 43, ERROR | 10/23 reached of 45, ERROR |
| B | 22:12–22:14 | baseline | door re-aimed | 39/43 | **47/47** |
| C | 22:16 | baseline | key re-aimed | **43/43** | — |
| D | 22:20 | baseline | final | **43/43** | **47/47** |
| M1 | 22:21–22:22 | **mutation M1** | final | FAIL `[2c]`, stops | FAIL `[3s0]`, stops |
| E | 22:22–22:24 | **restored** | final | **43/43** | **47/47** |
| M2 | 22:24 | **mutation M2** | final | 41/43 | — |
| M3 | 22:25 | **mutation M3** | final | 42/43 | — |
| M4 | 22:26 | **mutation M4** | final | 42/43 | — |
| M5 | 22:28 | **mutation M5** (control) | final | **43/43** | — |
| F | 22:29–22:30 | **restored** | final | **43/43** | **47/47** |

Aggregate, before and after, whole runs and not a tail:

- `effects-deform`: **9 rows reached of 43, exit 2** → **43/43, exit 0**, three times (D, E, F).
- `vsplit-advisory`: **10 of 23 reached of 45, exit 2** → **47/47, exit 0**, three times (C/D, E,
  F). 47, not 45, because the door is now two rows (`[3s0]` `[3s1]`) that did not exist.

### M1 — the scene section is welded shut

The case the door row exists for, in the CONSUMER, and the case `'clicked'` cannot see. Shown
applied, from disk:

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 2 +-
$ sed -n '1380p' src/renderer/components/effects/EffectsScenePanel.tsx
          collapsedOverride
```

(`defaultCollapsed` → `collapsedOverride`, which `CollapsibleSection` documents as making "the
header toggle a no-op".) Rebuilt (`VITE_AURORA_DEBUG=1 npm run build`, exit 0) and run. Both rigs:

```
FAIL  [2c] the Scene form is open — it arrives collapsed since d-26b [instrument]     (deform)
FAIL  [3s0] INSTRUMENT: the Scene form is open — it arrives collapsed since d-26b     (vsplit)
HARNESS ERROR: Error: AIM MISSED: [data-section="aeon.effects.scene"] is still collapsed
  after clicked (data-section-collapsed="true"). The header took the click and the
  section did not open.
```

`section` was `'clicked'` — the click landed, the header was found, and the row still went red on
the app's own attribute. That is the whole reason `ok` is not the click's return value.

### M2 — the sub-form renders one control too few

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 2 +-
$ sed -n '342p' src/renderer/components/effects/EffectsScenePanel.tsx
      {tableRefParams(form).slice(1).map((p) => {
```

Rebuilt (exit 0), run: **41/43**, `[4b]` and `[4e]` RED and nothing else.

```
FAIL [4b] rendered=["period:SELECT","speed:INPUT"] schema sine requires ["amplitude","period"] (+ speed)
FAIL [4e] rendered=["max_offset","speed"] schema v_column_perspective requires ["focal","max_offset"]
```

**This is the row proving the re-aim is a measurement and not a widening.** The re-aimed reader
sees `period:SELECT` and `speed:INPUT` perfectly well — it names them in the artifact — and the
row still fails, because a control really is missing. Under the OLD extractor those two were
invisible and the row failed for the opposite reason.

### M3 — the picker stops carrying the rule that justifies it

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 3 +--
$ sed -n '357p' src/renderer/components/effects/EffectsScenePanel.tsx
                title={`${titlePrefix} ${p.key}: pick one`}
```

Rebuilt (exit 0), run: **42/43**, `[4b]` alone RED — with the control list entirely correct:

```
FAIL [4b] rendered=["amplitude:INPUT","period:SELECT","speed:INPUT"] schema sine requires ["amplitude","period"] (+ speed)
          picker titles=["deform_fg period: pick one"]
```

So the second half of `[4b]` survived the re-aim: a picker may still not quietly replace a spinner
without carrying the engine constraint (ROADMAP row 63).

### M4 — the bin refusal is composed and never painted

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 2 +-
$ sed -n '395p' src/renderer/components/effects/EffectsScenePanel.tsx
      {false && refusal !== null && <Hint under tone="warning">{refusal}</Hint>}
```

Rebuilt (exit 0), run: **42/43**, `[4f]` alone RED:

```
FAIL [4f] refusal on screen=false document bin="../escape.bin"
```

**Compare that artifact with run A's**, which was `refusal on screen=false document bin=""`. Same
red, two different worlds: today the gesture landed and the refusal is genuinely missing; before,
nothing had been typed at all and the row was asserting about a screen no author had put into the
state. `[5a]` passed here (5 undos, 5 gestures), which is the same fact from the other side.

### M5 — the CONTROL: put the em dashes back, and nothing moves

Not a red-first — the opposite, and it is the claim this parcel is actually making. The three
titles the sweep changed are reverted to their pre-`24541886` spelling:

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 4 ++--
 src/renderer/providers/effects-aeon.ts                | 2 +-
$ sed -n '357p;390p' src/renderer/components/effects/EffectsScenePanel.tsx
                title={`${titlePrefix} ${p.key} — must divide the `
            title={`${titlePrefix} bin — ${TABLE_REF_ROW.binRule}`}
$ sed -n '1568p' src/renderer/providers/effects-aeon.ts
  speedTitle: 'speed — how fast the sample point walks the table each frame; 0 holds it still',
```

Rebuilt (exit 0), run: **43/43**, `rendered=["amplitude:INPUT","period:SELECT","speed:INPUT"]` and
`rendered=["focal","max_offset","speed"]` — identical to the unmutated run. The re-aimed reader
would have survived the dash sweep in either direction, which is the difference between repairing
this instance and retiring the needle.

### The restores, and the runner is executing what was patched

Every restore was `git restore --source=HEAD -- <path>` from a **committed** baseline, never
`git checkout --` over a dirty tree, each followed by `git status --porcelain` empty and the line
read back from disk. Applied-and-still-green never happened: every mutation moved the tally on the
first run after its rebuild, so the rebuild really does reach the harness.

### The node row, red-first too

The mutation is in the HELPER, because that is what this row judges — the helper routes the scene
form to the wrong sub-tab:

```
$ grep -n "SECTION_SCENE_FORM\]:" scratchpad/lib/effects-sections.mjs
137:  [SECTION_SCENE_FORM]: TILE_ANIM_SUB_TAB,
$ npx vitest run test/harness-effects-selectors.test.ts
AssertionError: the helper routes aeon.effects.scene to a tab the app does not put it on: the
  app moved the section and the helper still names the old tab: expected 'tileAnim' to be 'parallax'
      Tests  1 failed | 4 passed (5)
```

Restored from `HEAD`, re-run: `Tests 5 passed (5)`, `failure-class: no failures`.

That row was also **generalised**, and the pin it dropped is the point. It asserted
`toBe('tileAnim')` and searched one panel file, because the helper held only the two
tile-animation sections — a pin copied from the population of the day, which would have gone red
about a correct entry the moment the helper gained a `parallax` section. The owning tab now comes
from the app's own `EFFECTS_SUB_TABS` and the owning panel from a search of every effects panel.
It also now resolves the helper's map VALUES, so an entry naming the WRONG tab is caught and not
only an entry that is absent — which is what the plant above exercises.

### The whole node suite

```
$ VITEST_MAX_WORKERS=4 npm test          # exit 0
Test Files  616 passed | 3 skipped (619)
     Tests  9584 passed | 9 skipped (9593)
failure-class: no failures in this run (619 module(s) reported).
```

⚠ The first attempt was **red, and correctly**: `check-test-dashes` caught an em dash in an
assertion message this parcel added to `test/harness-effects-selectors.test.ts:193`. A parcel about
prose that moved is a bad place to add prose the repo forbids. Repaired to a colon before the
suite was re-run.

## Method note (invariant 8e): what was re-established after the method changed

Runs B and C were taken while `openSceneForm` could only THROW. Making the door a row that can
fail changed the rigs' row counts and the door's failure mode, so **no claim rests on B or C**:
every number quoted above for the final state comes from D, E and F, and every mutation was run
against the final code. B and C appear in the table only as the staging that located the second
family of reds.

## Stopped on, and left open

- **Nothing was stopped on as an app defect.** Every red this parcel touched was the rig reading a
  word the app deliberately stopped writing, on a tree where the panel renders all of it.

- ⚠ **FIVE MORE RIGS CARRY THE SAME DEAD NEEDLE, AND THEY ARE BLIND RIGHT NOW.** Measured, not
  guessed — eight live selector lines, no comments among them:

  ```
  scratchpad/curve-editor-harness.mjs:667
  scratchpad/layer-bound-harness.mjs:436
  scratchpad/effects-scene-harness.mjs:470, :679
  scratchpad/effects-bob-harness.mjs:198, :236, :268
  scratchpad/writer-originated-scene-harness.mjs:323
  ```

  All eight are `/^SCENE\s*—/i` (or its `—` spelling) over a `cursor: pointer` header, the
  same private copy. The conversion is mechanical now:
  `openEffectsSectionState(c, SECTION_SCENE_FORM)` from `scratchpad/lib/effects-sections.mjs`.
  **NOT done here**: honestly re-aiming each needs its own reproduce-then-red-first run of that
  rig, and that is five more rigs, not this parcel. This is the same call the ramp packet made
  about `base-swap-control-harness`, and it is worth more attention than that one was, because
  these five are already failing rather than merely fragile.

- **A gate that would have caught all seven, NOT added, and here is why.**
  `test/harness-effects-selectors.test.ts` already holds "no live line in `scratchpad/` selects on
  a retired label", with a `RETIRED` list. Adding `/\^SCENE\\s\*—/` to it is the right end state
  and would go RED TODAY on the five rigs above, so it cannot land until they are converted. It
  belongs in the same row as the conversion, not before it.

- **`scratchpad/effects-deform-harness.mjs:1385` still opens a section by its title**
  (`openCollapsible('Raster band presets', …)`). It is ALIVE today — `BandPresetPanel.tsx:380`
  renders `title="Raster band presets"` — and it is a fixed literal rather than a composed one, so
  it is a weaker case than the scene form's. It is named because it is the same shape at the stage
  before it shows, and the helper covers it (`aeon.effects.presets`, on the `colour` tab). Left
  alone: a working opener changed without a red-first proves nothing.

- **`scratchpad/vsplit-advisory-harness.mjs` imports `killTree` and does not use it** (line 92; its
  `finally` calls `process.kill(-child.pid, 'SIGTERM')` at line 1053). Pre-existing, untouched, and
  `check-harness-guards` passes over it in the green run above — recorded because the next person
  to read that import will expect the guarded teardown and will not get it.

- **No emulator was touched**, and nothing here needs one: every claim is about a DOM control or
  an attribute on a rendered surface. There is nothing in this parcel to tag for a foreground ROM
  seat.
