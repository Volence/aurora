# EFFECTS-RIGS-FIVE-MORE: five more rigs reading a dash the app stopped writing, and one row that was green for it

Parcel size S to M, branch `parcel/effects-rigs-five-more`, cut from master `c611b10f`. The
follow-up that `docs/reviews/2026-09-12-effects-rigs-aim-miss.md` booked in its "Stopped on"
section: *"FIVE MORE RIGS CARRY THE SAME DEAD NEEDLE, AND THEY ARE BLIND RIGHT NOW."* That packet
is the model this one follows, and its helper (`scratchpad/lib/effects-sections.mjs`,
`openEffectsSectionState`) is the one used here, unchanged.

**In one paragraph.** Five rigs opened the Effects **Scene form** by hunting a header whose text
matched `SCENE` followed by an em dash. That dash died on 2026-09-05 in `24541886` (the effects
panel dash sweep); the header reads `Scene: <id>` today, composed per document. So none of the
five ever opened the form. With the door re-aimed on the section id, two of them hit **more reds
from the same sweep, one axis over**: `effects-scene` selected the factor pickers by
`Layer N fa` plus an em dash, and `writer-originated-scene` read two contract keys (`speed`,
`period`) as "everything up to the first space", which the colon glued to the key. Both are
fixed by the rule `effects-deform` already states: the key is contract, the punctuation after it
is prose. The sixth case, `effects-sub-tabs`' `TITLE_OF` map, was the quiet one: its absence row
was **green, vacuously**, for the two sections whose titles died, and a mutation in the app
proves it (old row green, re-aimed row red, same build). The gate
(`test/harness-effects-selectors.test.ts`) now forbids both dead headers in a live selector
position, red-first on master's rigs (10 live lines) and green on the converted tree (0), with
zero false positives on either side. **A seventh rig, `rowremap-author`, carries the same needle
and could not be proven**: it dies at startup on a different defect before its door. It is
STOPPED, recorded, and held in the gate by name with a tested end condition. Nothing here is a
finding about the app.

## What was found first

Every rig, unmodified, on this worktree's own debug build (`dist/build-flavour.json` =
`{"flavour":"debug","VITE_AURORA_DEBUG":"1"}`), `root:` and `pinned:` both this worktree.

**The one dead needle in all five.** Four of the eight lines spell the dash as the character and four as its
backslash-u escape (listed per line under "Both sides" below); the shape is the same:

```
[...document.querySelectorAll('div')]
  .filter((d) => d.style && d.style.cursor === 'pointer'
              && /^SCENE\s*—/i.test((d.innerText || '').trim()))[0]
```

| | |
|---|---|
| **What the app paints today** | `Scene: <id>` (e.g. `Scene: ojz_act1_start`), uppercased by CSS |
| **Where it is composed** | `src/renderer/components/effects/EffectsScenePanel.tsx:1379`, <code>title={\`Scene: ${selected.id}\`}</code> |
| **Where it is painted** | `src/renderer/components/ui/CollapsibleSection.tsx`, the header `div` inside `<div data-section={id} data-section-collapsed=…>` |
| **The commit** | `24541886` 2026-09-05 13:44:59 -0400, "dash sweep (effects panels): the last 85, and two assertions moved with them". `git show 24541886` shows `-` <code>title={\`Scene — ${selected.id}\`}</code> / `+` <code>title={\`Scene: ${selected.id}\`}</code> |

| Rig | Live selector lines on master | Row on the door before |
|---|---|---|
| `curve-editor` | `:667` | `[6a0]`, judged on the click's return value |
| `layer-bound` | `:436` | `[3a3b]`, the same |
| `effects-scene` | `:470`, `:679` | `[4c0]`, `[10a0]`, the same |
| `effects-bob` | `:198`, `:236` (the section locator in `FORM_PROBE` and `setSelect`), `:268` (the opener) | `[i2b]`, the same |
| `writer-originated-scene` | `:323` | **none**: the answer was thrown away |

And the two further needles the open door exposed:

| Rig, rows | The dead needle | What the app says today | Where it is composed | The commit |
|---|---|---|---|---|
| `effects-scene` `[4a]` `[4b]` `[11b]` `[11d]` | `/^Layer \d+ f[ab]` + space + em dash + space `/` at `:411` and `:651` | `Layer 0 fa: how far Plane A, the foreground level plane, scrolls per pixel of camera movement` | `src/renderer/providers/effects-aeon.ts` `PLANE_FACTOR_ROWS` (`title: 'fa: how far Plane A …'`), composed as `Layer ${i} ${…title}` at `EffectsScenePanel.tsx:730` | `d70da895` 2026-09-05 16:20:55 -0400, "dash sweep, group 2: the effects scene provider, 80 repairs" |
| `writer-originated-scene` `[8a]` `[8b]` | the key is `t.slice(prefix.length + 1).split(/[ (]/)[0]`, over number inputs | `deform_fg speed: how fast the sample point walks the table each frame; 0 holds it still` | `effects-aeon.ts:1568`, `SCENE_DEFORM_ROW_SHARED.speedTitle` | `d70da895` (`git log -S "speed — how fast"`) |
| `writer-originated-scene` `[8b]` `[8f]` | the same split, over selects, then an identifier filter that DROPS what it cannot read | `deform_fg period: must divide the 256-byte table; the build refuses any other value` | `EffectsScenePanel.tsx:357-358` | `24541886` (`git show` has `-` `${p.key} — must divide` / `+` `${p.key}: must divide`) |

**The rewordings were deliberate and correct; the rigs are what was wrong.** Both commits are
the owner's 2026-09-05 dash ruling applied to the app. `24541886`'s own body said two assertions
moved with it; these openers were not among them, and nothing in the repo could see it.

## The red before

All six unmodified, quoted from the whole-run output (aeon `251f51fe`, a fresh archive per run).

```
$ npm run harness:curve-editor                         # 03:22:52 to 03:23:35, exit 1
FAIL  [6a0] INSTRUMENT: the Scene form is open, so the v_offset sweep below writes a real field
        open -> no-scene-header
PASS  [6a] CALIBRATION: some rows inside the frame are the COMPOSITE's own pixels
        at v_offset 0: 224/224 rows move when the composite is toggled, lines 0..223
FAIL  [7d] BLANKET: no selector or pixel probe came back empty all run
        6 v_offset: "no-element"
28/30 rows passed
```

`[6a]` passed only because the sweep's first candidate is 0 and the scene already sat at 0: the
field was never written. `[7d]` is the only row that saw it, which is the job it was written for.

```
$ npm run harness:layer-bound                          # 03:23:45 to 03:24:23, exit 1
FAIL  [3a3b] INSTRUMENT: the Scene form is open …      open -> no-scene-header
FAIL  [3a4] ANTI-VACUOUS: the scene's v_offset field exists and took the owner's value
        set result = "no-element" (wanted 64)
FAIL  [3b] ANTI-VACUOUS: the scene exists, is LOCKED, and holds v_offset
        id=bound_probe v_factor=15 v_offset=undefined
… 16 more FAIL downstream of v_offset ([5a] to [10a0]) …
28/47 rows passed
```

```
$ npm run harness:effects-scene                        # 03:24:23 to 03:25:19, exit 1
FAIL  [4a] both of a layer's factor pickers are on screen        []
FAIL  [4b] the factor picker offers all 16 schema factors …      no picker
FAIL  [4c0] INSTRUMENT: the Scene form is OPEN …                 open -> no-scene-header
FAIL  [4c1] ANTI-VACUOUS for [4c] …                              v_factor spinner present=false
PASS  [4c] there is NO precision picker …                        precision picker options: null
FAIL  [10a0] … FAIL [10a] … Name:MISSING V factor:MISSING … FAIL [10b]
FAIL  [11b] every packed-factor form is genuinely OPEN …         0 packed spinners; opened: []
FAIL  [11d] … FAIL [12d] the scan found ONE small cluster …      cluster 712x390px on a 876x721 canvas
32/42 rows passed
```

**`[4c]` stayed GREEN against a shut form**, next to its own red guard. That is the exact vacuity
its guard was added to end ("a check whose success state and failure state emit the same
artifact"); the guard itself was blind.

```
$ npm run harness:effects-bob                          # 03:25:19 to 03:25:32, exit 1
FAIL  [i2b] the Scene form is open …                   open → no-scene-header
FAIL  [i3] the Scene form was found, with labelled rows [instrument]
HARNESS ERROR: no "Scene:" section header on screen
```

5 rows reached of 14; not one Bob row ran. The error message already named the new spelling, one
line below a needle still asking for the old one.

```
$ npm run harness:writer-originated-scene              # 03:25:44 to 03:26:19, exit 1
        ["Scenes","Scenes","Layers (5/16 per scene)",…,"Scene: ojz_act1_start",…]   ← [2b]'s own artifact
FAIL  [3d0] the Name field was found and took a real keystroke    named=no-element
FAIL  [3d] the typed name reached the DOCUMENT                    name=undefined
FAIL  [6d] … FAIL [6f] … "vFactorInputs":0 … FAIL [6a] the transition select has options in it
TypeError: Cannot read properties of null (reading 'length')
    at main (…/writer-originated-scene-harness.mjs:663:69)
```

21 rows reached of 38. **`[3d0]` reads as a missing FIELD and was a shut FORM**: the door had no
row, so the first thing to speak was one row downstream and about the wrong subject.

```
$ npm run harness:effects-sub-tabs                     # 03:26:19 to 03:26:51, exit 1
FAIL  [3a] each tab paints ITS OWN sections …
        Parallax: ["SCENES","LAYERS (5/16 PER SCENE)","SCENE: OJZ_ACT1_START","SECTION ASSIGNMENT","PROPERTIES"]
        Colour: ["RASTER BAND PRESETS","PRESET: AURORA_RAMP_WITNESS",…]
PASS  [3b] and NONE of the other two jobs' sections is in the DOM at all …
FAIL  [4a] … FAIL [5b] …
10/13 rows
```

## The derivation from source

### The door

Unchanged from the model packet, and used as it built it: `openEffectsSectionState(c,
SECTION_SCENE_FORM)` activates the owning sub-tab, clicks the section header, waits, and re-reads
the app's own `data-section-collapsed`. **The needle is RETIRED, not repaired**: the title is
composed per document, so there is no stable string to type, and swapping to `Scene:` would still
be selecting on prose. **Each door is a row that can fail**: `ok` comes from the attribute read
back AFTER the click, never the click's return value, the row prints the whole verdict
(`{"tab","section","collapsed","ok","why"}`), and only then does the rig stop. For
`writer-originated-scene` that row is new (`[3s0]`); the other four already had a row, but it was
judged on `'clicked' || 'already-open'`, which a header with a dead handler still returns.

`effects-bob`'s two locators read `document.querySelector('[data-section="aeon.effects.scene"]')`.
**The scope is unchanged, and that is derived, not hoped**: `CollapsibleSection` renders
`<div data-section>` > the clickable header `div` > `PanelHeader`'s uppercase `div`
(`ui/primitives.tsx`, `textTransform: 'uppercase', letterSpacing: 1`) > `span`, so the old
`header.parentElement.parentElement` WAS the `data-section` div.

### The keys

`effects-scene`: `/^Layer \d+ f[ab](?![a-z0-9_])/`. The boundary is "not another key character",
never a punctuation mark. `FactorField`'s packed triple is titled `s1:`, `s2:`, `op:`
(`EffectsScenePanel.tsx:280-288`), so the wider boundary cannot reach it.

`writer-originated-scene`: the key is the leading run of key characters,
`/^[a-z][a-z0-9_]*/`, over both the number-input scan and the picker scan. The picker scan's
identifier filter stays: it still keeps an attachment's own on/off toggle from being collected as
a parameter. Fixing the speed key alone took `[8a]` green and left `[8b]`/`[8f]` red on
`"periodMax":null`; fixing the period key took them green and **raised the gesture count from 76
to 78**, the two period pickers that had been silently neither driven nor counted.

## How it was verified

Runner: `npm run harness:<name>` for all six, through a wrapper that extracts a **fresh
`git archive` of aeon `251f51fe2afcebbc236b8d51c963b03891678511`** (`ls-remote origin
refs/heads/master` at the start of the parcel) per run into the session scratchpad, and sets
`ELECTRON_BIN=<main checkout>/node_modules/.bin/electron`, `AURORA_BUILT_TREE=<this worktree>`,
`AEON_DIR=<that copy>`. The wrapper prints the app's `HEAD`, the tree's `git status --porcelain`
and `dist/build-flavour.json` at the top of every log, and the harness prints `root:` and
`pinned:`; every run named this worktree. Nothing was written to the aeon checkout.
`node_modules` in this worktree is a `cp -al` hardlink copy, not a symlink.

`dpr` was 1 in every run that printed it (`curve-editor`'s `frame rect={"x":320,"y":0,"w":320,
"h":224}`, `layer-bound`'s `rect={"left":284,"top":106,"width":816,"height":742}` aim `692`). The
five doors are clicked through `element.click()` by the helper, not by a pointer aim. No claim
below is assembled from two runs.

**Clock**: run times are local, -0400. Build stamps in `dist/build-flavour.json` are UTC: the
weld-shut build `07:59:43Z` is 03:59:43 local.

| run | wall clock | app | rig code | curve-editor | layer-bound | effects-scene | effects-bob | writer-orig. | effects-sub-tabs |
|---|---|---|---|---|---|---|---|---|---|
| A | 03:22 to 03:26 | baseline | **unmodified** | 28/30 | 28/47 | 32/42 | 5 of 14, ERROR | 21 of 38, ERROR | 10/13 |
| B | 03:35 to 03:39 | baseline | re-aimed | **30/30** | **47/47** | 41/42 | **14/14** | 35/38 (door only) | 11/13 |
| C | 03:40 to 03:41 | baseline | + speed key | | | | | 36/38 | |
| D | 03:43 to 03:43 | baseline | final | | | | | **38/38** | |
| E | 03:45 to 03:49 | baseline | final | **30/30** | **47/47** | 41/42 | **14/14** | **38/38** | 11/13 |
| M1 | 03:59 to 04:01 | **M1** (build 07:59:43Z) | final | `[6a0]` RED, stops | `[3a3b]` RED, stops | `[4c0]` RED, stops | `[i2b]` RED, stops | `[3s0]` RED, stops | |
| F | 04:01 to 04:06 | **restored** (build 08:01:28Z) | final, HEAD `14a18b3a`, porcelain `[]` | **30/30** | **47/47** | 41/42 | **14/14** | **38/38** | 11/13 |
| Msub | 04:06 to 04:07 | **Msub** (build 08:06:25Z) | final / **old** | | | | | | 9/13 (`[3a]` `[3b]` RED) / old: 10/13 (`[3b]` PASS) |
| G | 04:08 | **restored** (build 08:08:08Z) | final | | | | | | 11/13 |

Individual wall clocks and exits are in the per-run logs; every run was whole and foreground,
13 to 70 seconds each.

The three greens of the final code, whole runs:

- `curve-editor`: **28/30, exit 1** → **30/30, exit 0**, three times (B, E, F).
- `layer-bound`: **28/47, exit 1** → **47/47, exit 0**, three times (B, E, F).
- `effects-scene`: **32/42, exit 1** → **41/42**, three times (B, E, F). The one red left is
  `[12d]`, byte-identical in all four runs including A (see "left open").
- `effects-bob`: **5 of 14 reached, HARNESS ERROR** → **14/14 gated rows, exit 0**, three times
  (B, E, F).
- `writer-originated-scene`: **21 of 38 reached, TypeError** → **38/38, exit 0**, three times
  (D, E, F).
- `effects-sub-tabs`: **10/13** → **11/13**, four times (B, E, F, G); `[3a]` `[3b]` `[3c]` PASS
  with `missing=[] strays=[]` on all three tabs. `[4a]` and `[5b]` are byte-identical in every run
  including A (see "left open").

E ran before the commits, on the same bytes they carry; F ran on `HEAD 14a18b3a` with an empty
porcelain, so at least one green of every rig is on the committed code.

### M1: the scene section is welded shut (one mutation, all five rigs)

The model packet's M1, the case `'clicked'` cannot see. Shown applied, from disk, before the
build:

```
$ git diff --stat
 src/renderer/components/effects/EffectsScenePanel.tsx | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ sed -n '1379,1380p' src/renderer/components/effects/EffectsScenePanel.tsx
        <CollapsibleSection id="aeon.effects.scene" title={`Scene: ${selected.id}`}
          collapsedOverride
```

(`defaultCollapsed` → `collapsedOverride`, which `CollapsibleSection` documents as making "the
header toggle a no-op".) Rebuilt (`VITE_AURORA_DEBUG=1 npm run build`, exit 0; the bundle then
carried exactly one `collapsedOverride:!0`) and run, each rig once, each log's header reading
`porcelain: [ M src/renderer/components/effects/EffectsScenePanel.tsx;]`:

```
FAIL  [6a0]   (curve-editor)             exit 2
FAIL  [3a3b]  (layer-bound)              exit 2
FAIL  [4c0]   (effects-scene)            exit 1
FAIL  [i2b]   (effects-bob)              exit 1
FAIL  [3s0]   (writer-originated-scene)  exit 1
  open -> {"tab":"already-active","section":"clicked","collapsed":"true","ok":false,
  "why":"AIM MISSED: [data-section=\"aeon.effects.scene\"] is still collapsed after clicked
  (data-section-collapsed=\"true\"). The header took the click and the section did not open."}
```

All five: `section` was `'clicked'`, the row went red on the app's own attribute, and the run
stopped there rather than reporting the section's controls as missing.

**The restore**: `git restore --source=HEAD -- src/renderer/components/effects/EffectsScenePanel.tsx`,
`git status --porcelain` empty, the line read back as `defaultCollapsed`, rebuilt (exit 0, zero
`collapsedOverride:!0` in the bundle), and run F above: every rig green again. Applied-and-still-
green never happened, so the rebuild really does reach the harness.

## The `TITLE_OF` verdict

**Vacuous today, for two of its eleven entries, and in one of its three uses.** Fixed under the
same bar.

`TITLE_OF` (`effects-sub-tabs-harness.mjs:115`) mapped each section id to "the HEADING an id
draws, so an absence can be asserted against what an author would look for", on the stated
premise that "ids never reach the DOM". Checked per entry against what the app paints (run A's own
`heads` artifact):

- **Dead, 2**: `'aeon.effects.scene': 'SCENE — '` (the app paints `SCENE: OJZ_ACT1_START`) and
  `'aeon.effects.preset.bands': 'PRESET — '` (the app paints `PRESET: AURORA_RAMP_WITNESS`,
  composed at `BandPresetPanel.tsx:643` as <code>\`Preset: ${selected.id}\`</code>). Both died in
  `24541886`.
- **Alive, 9**: `SCENES`, `LAYERS (`, `SECTION ASSIGNMENT`, `RASTER TIMELINE`,
  `RASTER BAND PRESETS`, `CYCLES` (inside `PRESET: … · CYCLES, VARIANTS`), `MOVING ANCHORS`,
  `TILE ANIMATIONS (`, `NEW TILE ANIMATION`: each is a substring of a heading in run A.

Its uses, via `titlesOf`:

- **`[3a]`, presence**: RED on every run, looking for a spelling no heading has. Blind, but loud.
- **`[3b]`, absence**: GREEN, and **vacuous for the two dead entries**. "The scene form is not on
  the Colour tab" was asserted against a string no tab can paint. Green where it should be
  measuring, which is worse than a blind rig.
- `[3c]` does not use `TITLE_OF` (two fixed literals, both alive), but it rests on the same finder
  as `[3a]` and says so, so it moved with it.

And the premise was false too: `CollapsibleSection` renders `data-section={id}`. So `HEADERS` also
collects every `[data-section]` id in the column, and `[3a]` `[3b]` `[3c]` judge
`mounted(seen, id)`, the mount marker itself, which is `[3b]`'s literal claim ("in the DOM at
all, unmounted, not hidden": a collapsed section still carries its marker). The painted headings
are still printed beside it. `[5a]`/`[5b]` keep the title finder: their headings are fixed
literals the app still paints, and a working selector changed without a red-first proves nothing.

### Msub: the vacuity, shown on a mutation

A section mounted on a tab the routing table does not give it: exactly the stray `[3b]` exists to
catch. The app's table moves the scene form to Colour while the panel still mounts it on
Parallax. Shown applied, from disk:

```
$ git diff --stat
 src/renderer/providers/effects-sub-tabs.ts | 4 ++--
$ sed -n '73,74p;95,97p' src/renderer/providers/effects-sub-tabs.ts
    sections: ['aeon.effects.scenes', 'aeon.effects.layers',
      'aeon.effects.assign'],
    sections: ['aeon.effects.presets', 'aeon.effects.preset.bands',
      'aeon.effects.preset.channels', 'aeon.effects.preset.anchors',
      'aeon.effects.timeline', 'aeon.effects.scene'],
```

Rebuilt (exit 0) and run twice on that one build: the re-aimed rig, then the OLD rig
(`git show c611b10f:scratchpad/effects-sub-tabs-harness.mjs`, written to an untracked scratch
path beside `lib/` and deleted afterwards):

```
re-aimed rig, 9/13:
FAIL  [3b] and NONE of the other two jobs' sections is in the DOM at all …
        Parallax: … data-section [… "aeon.effects.scene" …] missing=[] strays=["aeon.effects.scene"]
        Colour:   … missing=["aeon.effects.scene"] strays=[]
old rig, 10/13:
PASS  [3b] and NONE of the other two jobs' sections is in the DOM at all …
        Parallax: ["SCENES","LAYERS (5/16 PER SCENE)","SCENE: OJZ_ACT1_START","SECTION ASSIGNMENT","PROPERTIES"]
```

The old row's own artifact shows the scene form on Parallax and still passes. Restored
(`git restore --source=HEAD -- src/renderer/providers/effects-sub-tabs.ts`, the copy deleted,
porcelain empty, rebuilt), run G: 11/13, `[3a]` `[3b]` `[3c]` PASS.

## The gate

`test/harness-effects-selectors.test.ts`, row 3 ("no live line in scratchpad/ selects on a retired
label"), gains the two dead headers, `Scene` and `Preset` followed by an em dash, in both
spellings.

**Selector, not prose.** As a selector the needle is ANCHORED: a regex caret (`/^SCENE\s*`) or
the opening quote of a string that BEGINS with the header (the `TITLE_OF` shape). A check message
that says the words mid-sentence stays green, and so does every comment (the existing
comment-stripper, unchanged). **Row 4** is widened from one panel to the panel that owns each
label, and each entry names a section id that panel must render, so asking `BgAnimBandPanel.tsx`
whether it paints a scene header (green for the wrong reason) can no longer happen.

**No dash is spelled in the test file.** `scripts/check-test-dashes.mjs` counts every dash in a
string, template or regex literal in the test tree; the first cut carried 18 and was red. The
repair follows that gate's own SELF-VISIBILITY idiom: the character and its escape text are built
from the code point (`String.fromCharCode(0x2014)`), and no failure message prints a pattern or a
plant. `check-test-dashes`: OK.

### Both sides, measured with the committed gate

**Before** (master's six rigs restored into the tree with
`git restore --source=c611b10f -- <the six>`): **RED, 10 live lines**, exactly the eight openers
the overseer listed plus `TITLE_OF`'s two. Quoted as the run printed them, which is also each
file's own spelling of the dash:

```
AssertionError: 10 live line(s) still select on wording the app retired:
  scratchpad/curve-editor-harness.mjs:667          && /^SCENE\s*—/i.test(…
  scratchpad/effects-bob-harness.mjs:198           .find(h => /^SCENE\s*—/i.test(…
  scratchpad/effects-bob-harness.mjs:236           .find(h => /^SCENE\s*—/i.test(…
  scratchpad/effects-bob-harness.mjs:268           && /^SCENE\s*\u2014/i.test(…
  scratchpad/effects-scene-harness.mjs:470         && /^SCENE\s*\u2014/i.test(…
  scratchpad/effects-scene-harness.mjs:679         && /^SCENE\s*\u2014/i.test(…
  scratchpad/effects-sub-tabs-harness.mjs:118      'aeon.effects.scene': 'SCENE — ',
  scratchpad/effects-sub-tabs-harness.mjs:122      'aeon.effects.preset.bands': 'PRESET — ',
  scratchpad/layer-bound-harness.mjs:436           && /^SCENE\s*—/i.test(…
  scratchpad/writer-originated-scene-harness.mjs:323   && /^SCENE\s*\u2014/i.test(…
      Tests  1 failed | 5 passed (6)
```

**False positives before: zero.** None of the six known non-selector hits fired:
`effects-deform-harness.mjs:613` and `vsplit-advisory-harness.mjs:554` (comments),
`lib/effects-sections.mjs:108` (docblock), `deleted-scene-returns-harness.mjs:447` (comment),
`writer-originated-scene-harness.mjs:2` (header comment), `effects-scene-selection-harness.mjs:443`
(a check message). Nor did `effects-column-harness.mjs:1360` or `band-preset-harness.mjs:833`,
two more comments quoting the dead headers that a raw grep finds.

**After** (HEAD's rigs restored, porcelain showing only the test file): **GREEN, 6/6, zero live
hits**, one DECLARED HOLD printed.

### Red-first on the other two claims

**Row 4, the app painting the old header again.** Planted on disk:

```
$ git diff --stat
 .../components/effects/EffectsScenePanel.tsx       |   2 +-
$ sed -n '1379p' src/renderer/components/effects/EffectsScenePanel.tsx
        <CollapsibleSection id="aeon.effects.scene" title={`Scene — ${selected.id}`}
```

```
     × and the retired labels really are retired: no owning panel renders one of them
+   "src/renderer/components/effects/EffectsScenePanel.tsx paints the label retired for
     aeon.effects.scene (harnesses were told: now Scene: <id>, …)"
      Tests  1 failed | 5 passed (6)
```

Row 4 alone red. Restored from HEAD, porcelain back to the test file only, the line read back as
`Scene:`, re-run: 6/6.

**The hold's end condition.** `rowremap-author-harness.mjs:526` neutralised on disk
(`/^Scene \u2014 /` → `/^Scene: /` with `sed`, `git diff --stat` 1 line, the line read back as
`openSection(c, String.raw`/^Scene: /`, toggleSel, 'Scene')`):

```
AssertionError: the hold on scratchpad/rowremap-author-harness.mjs (aeon.effects.scene) matches
no live line any more: the rig was re-aimed, so delete the hold in the same change
      Tests  1 failed | 5 passed (6)
```

Restored from HEAD, re-run: 6/6. So the hold cannot outlive the defect it names.

## The whole node suite

```
$ VITEST_MAX_WORKERS=4 npm test          # exit 0, on HEAD 14a18b3a, porcelain empty
 Test Files  618 passed | 3 skipped (621)
      Tests  9595 passed | 9 skipped (9604)
failure-class: no failures in this run (621 module(s) reported).
```

## Method note: what was re-established after the method changed

- `writer-originated-scene` runs B and C were staging while its keys were still being found. No
  claim rests on them; its three greens are D, E and F on the final code, and its M1 red is on the
  final code.
- The gate was first run with the dash spelled literally (18 hits in `check-test-dashes`, and the
  run that discovered `rowremap-author:526`). It was rewritten before any measurement quoted here:
  the before/after, the row-4 plant and the hold plant were all taken with the committed gate.
- `rowremap-author`'s first unmodified run could have been a flake. It was run three times (A, A2,
  and A3 with `VERBOSE=1`), all dying the same way at 4 to 5 seconds, before it was called.

## Stopped on, and left open

- **STOPPED: `rowremap-author` (BLOCKED), and a hold in the gate for it.** It carries two dead
  needles side by side, both spelled with the backslash-u escape: `:525` `/^anchor \u2014/`, the
  anchor toggle, reworded to `anchor: the world-anchored band split…` by `d70da895`; and `:526`
  `/^Scene \u2014 /`, the scene header. **It was not in the overseer's list**, because it spells
  the needle in title case and without a `\s*`; the gate's wider pattern found it. It could not be
  re-aimed with a red-first because it never reaches its door: three runs, each dying after `[0a]`
  with `HARNESS ERROR: Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}`.
  The cause is visible in every other rig's log from this parcel: `window.__dbg.aeon.open(…)`
  answers the same CDP error there too, and the siblings survive it because they call it with
  `.catch((e) => console.log('aeon open threw:', e.message))`. All 27 runs of the five door rigs
  print `aeon open threw: Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}`,
  and the project opens anyway. `rowremap-author-harness.mjs:440` has no `.catch`. That is a
  different defect class from this parcel's, so it was not fixed here. Lift: add the catch (or
  whatever its owner rules), reproduce the door red, re-aim both needles, prove red-first, and
  delete the HOLD in `test/harness-effects-selectors.test.ts` in the same change (the gate will
  demand it).

- **`scene-anchor-writer-harness.mjs` carries the anchor needle too** (`:505`, `/^anchor —/`,
  the character this time). Its "migrated" commit `089e90b6` (13:54:35) landed ten minutes after
  `24541886` and two and a half hours before `d70da895` (16:20:55) reworded the anchor toggle, so
  it died after its own repair. It also opens the scene form by `/^Scene: /` (`:506`), which is
  alive today and is the prose repair this parcel's rule rules out. Not run, not touched. The
  anchor needle is not in the gate's `RETIRED` list; this parcel added only the two section
  headers it was asked about.

- **`effects-scene` `[12d]`**: "the scan found ONE small cluster, not reddish artwork everywhere",
  `cluster 712x390px on a 876x721 canvas`, byte-identical in A, B, E and F. It is a pixel scan of
  the Layout canvas for the object box's red and reads no prose, so it is not this class. Not
  investigated: the aeon fixture's art changing under the rig is one hypothesis and is unmeasured.

- **`effects-sub-tabs` `[4a]` and `[5b]`**: `{"found":true,"section":165,…}` against a row wanting
  more than `FLOOR + 40` = 200px, and a tile-animation card `"cardInsideScroller":false,
  "cardHit":false`. Byte-identical in every run including A, layout measurements, no prose. Not
  this class, not investigated.

- **Teardown**: `effects-scene-harness.mjs` (`finally`, `process.kill(-child.pid, 'SIGTERM')`) and
  `writer-originated-scene-harness.mjs` (the same) import `killTree` and tear down by process group
  instead. Pre-existing, untouched, recorded like the model packet recorded `vsplit-advisory`'s.

- **No emulator was touched**; every claim is about a DOM control, an attribute, or a source line.

## Draft ROADMAP row (for the overseer to adapt)

EFFECTS-RIGS-FIVE-MORE, landed from `parcel/effects-rigs-five-more`: five rigs that opened the
Effects scene form by `SCENE` plus an em dash (dead since `24541886`, the 2026-09-05 effects panel
dash sweep) now open it by `data-section` through `openEffectsSectionState`, each door a row judged
on `data-section-collapsed` read back after the click; with the door open, `effects-scene`'s
factor-picker key and `writer-originated-scene`'s `speed`/`period` keys (reworded by `d70da895`
and `24541886`) are read as keys, not "up to the first space". Before → after, whole runs:
curve-editor 28/30 → 30/30, layer-bound 28/47 → 47/47, effects-scene 32/42 → 41/42 (`[12d]`
left open, pixel scan, not prose), effects-bob 5 of 14 with an error → 14/14, writer-originated
21 of 38 with a TypeError → 38/38, each three times, each red on the door under a welded-shut
scene section. `effects-sub-tabs`' `TITLE_OF` absence row was green vacuously for the two dead
headers; it now judges `data-section`, and a routing-table mutation turns the new row red where
the old one stayed green (10/13 → 11/13; `[4a]`/`[5b]` left open, layout). The gate
`test/harness-effects-selectors.test.ts` forbids both dead headers in a live selector: 10 hits on
master's rigs, 0 after, no false positives either side. OPEN: `rowremap-author` carries the same
needle and is BLOCKED (it dies on an uncaught `aeon.open` CDP error before its door), held in the
gate by name until re-aimed; `scene-anchor-writer` still selects on the dead anchor toggle.
