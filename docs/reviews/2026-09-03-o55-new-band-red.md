# O55 — `no "New band" section on screen`: is the app broken, or are the harnesses?

**Branch** `parcel/o55-new-band-red` · **Commit** `cea24414` · 2026-09-03
**Instrument** `scratchpad/o55-new-band-door-probe.mjs` (`npm run harness:o55-new-band-door`), 16/16
**Fixture** a `rsync` copy of aeon at `$SCRATCH/aeon-copy` (`.claude` and `.git` excluded; 154 MB of aeon's 3.3 GB)

---

## The verdict, before anything was changed

**(b) — the harnesses are broken. The app is not.**

A person authoring a background tile animation can make one. Two doors work, and both
respond to exactly the gesture the harnesses send. The harnesses cannot reach either
because they ask for a screen that has not existed since 2026-09-02.

There are **two independent causes**, and each alone is sufficient to produce the throw.
That matters, because fixing one would leave all three harnesses red and look like a
failed diagnosis.

### Cause 1 — the label is stale

Commit `023e0ed9` (2026-09-02 15:29, "effects: `band` names ONE feature now") renamed:

| harnesses ask for | the app renders |
|---|---|
| `New band` | `New tile animation` |
| `BG animation bands (n/4)` | `Tile animations (n/4)` |

`BgAnimBandPanel.tsx:635` — `<CollapsibleSection id="aeon.bganim.new" title="New tile animation" defaultCollapsed>`.
The `CollapsibleSection` **id** did not move (`aeon.bganim.new`); the ruling explicitly
kept wire and persistence names. Only the on-screen title moved, which is the one thing
the harnesses match on.

### Cause 2 — the panel is not mounted on the tab the harnesses land on

`72cebd1c` (d-26b) put the Effects column behind three sub-tabs, and
`workspace/facets/effects-facet.tsx:120` mounts `BgAnimBandPanel` **only** when
`effectsSubTab === 'tileAnim'`. `state/editorStore.ts:671` defaults it to `'parallax'`.
The facet's own docblock is explicit that this is unmount, not hide:

> ⚠ AND THE SECTIONS ARE UNMOUNTED, NOT HIDDEN. `display: none` would have kept every
> harness's text finder green while the control was unreachable […] A tab that is not
> shown renders nothing.

So on arrival the section is **absent from the DOM**, not collapsed. The harnesses click
the Effects pill and immediately look for a header; they never click `Tile anim`.

### The measurement that decided it

Probe rows, run against a live Electron build (`VITE_AURORA_DEBUG=1`) under xvfb:

```
PASS [2b] sub-tab bar present, defaulting to Parallax
          [{"label":"Parallax","selected":true},{"label":"Colour",…},{"label":"Tile anim",…}]

     SECTIONS ON THE DEFAULT (Parallax) TAB (9):
       Levels · Object Library · Canvases · Tools · Scenes ·
       Layers (5/16 per scene) · Scene — ojz_act1_depth · Section assignment · Properties

PASS [2c] on arrival NO tile-animation section is mounted   ← cause 2
PASS [2d] the "Tile anim" sub-tab activates on the SAME .click() the harnesses send

     SECTION HEADERS ON THE "Tile anim" TAB (7):
       Levels · Object Library · Canvases · Tools ·
       Tile animations (1/4) · New tile animation · Properties

PASS [3b] NO section is titled "New band"                   ← cause 1
PASS [3c] a creation section IS on screen: "New tile animation"
PASS [4a] opening by "New band" returns no-section          ← reproduces the throw
PASS [4b] opening by "New tile animation", same .click(), returns "clicked"
PASS [4c] the section is now OPEN — its children exist
PASS [5a] both creation controls are live:
            "Add blank tile animation"  (toolbar chip, enabled)
            "Promote"                   (enabled)
            "Add"                       (panel chip, enabled)
```

The probe finds headers **structurally** — a div whose computed `textTransform` is
`uppercase` whose parent has `cursor: pointer` — and *prints every title it finds*
before asserting anything about them. A probe that searched for one hard-coded string
would have reproduced the mistake under investigation.

### The hypothesis I was asked to test first, and why it is refuted

The `assign-black-harness` precedent — a harness sending `click()` at a component that
listens on `onMouseDown` — **does not apply here**. Both handlers in the path are
`onClick`:

- `ui/CollapsibleSection.tsx:94` — `<div onClick={onHeaderClick} style={{cursor:'pointer'}}>`
- `effects/EffectsSubTabBar.tsx:71` — `<button role="tab" onClick={onClick}>`

Probe rows 2d and 4b drive both with `HTMLElement.click()` and both take. The gesture
was never the problem.

### A correction to the red sweep's finding 1

`docs/reviews/2026-09-03-harness-red-sweep.md:145-160` rebuilt `src/` at `adefc7aa` and
got the identical throw, and concluded **"the sub-tab commit is exonerated; these
failures predate it."**

The control was sound and its conclusion is half right. `adefc7aa` is a **descendant of
`023e0ed9`** (verified: `git merge-base --is-ancestor 023e0ed9 adefc7aa` → true), so
cause 1 was already present in the control build and by itself produced the throw. The
sub-tab commit is correctly cleared of causing the *pre-existing* red.

But it is not innocent of the *current* one: at HEAD, cause 2 is now also sufficient.
Anyone who fixes only the labels will see all three harnesses still throw and may
reasonably conclude the diagnosis was wrong. Both causes must be fixed together.

---

## What each harness needs (recorded, not done)

`scratchpad/bganim-band-harness.mjs`, `bganim-rate-shift-harness.mjs`,
`bganim-ui-authored-composition-harness.mjs`, and — same root cause, same throw —
`bganim-insert-roomy-harness.mjs`:

1. Before looking for any section, click the sub-tab:
   `[...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === 'Tile anim').click()`
2. `'New band'` → `'New tile animation'`; `/^BG animation bands/` → `/^Tile animations/`.
3. `/^Add band$/` → `/^Add$/` (this commit; see below).

The three harnesses' `isHeader` predicate also pins `letterSpacing === '1px'` and
`firstElementChild.tagName === 'SPAN'`, which are `PanelHeader`'s current computed
styles and happen to still hold. They are a latent third failure the moment that
component is restyled; the probe's `cursor: pointer` parent test is the more durable
shape and is the one to copy.

## Why I fixed none of them

The scope rules a harness fix in only if it gates real work. **None of the three does.**
All are historical proof artifacts of closed rows:

| harness | row | state |
|---|---|---|
| `bganim-band-harness.mjs` | ROADMAP item 28 | `~~…~~` **CLOSED**, delivered 2026-08-22 at 35/35 |
| `bganim-ui-authored-composition-harness.mjs` | ROADMAP item 29 | `~~…~~` **CLOSED**, delivered 2026-08-26 at 18/18 |
| `bganim-rate-shift-harness.mjs` | ROADMAP item 44 | **CLOSED** (`0f6ff618`), row since compacted out of ROADMAP.md |

No open ROADMAP row, no open OVERSEER-LOG row and no DoD names any of them. The only
repo-wide gate touching them is **G6** in `npm run check:harness-guards`, which asserts
*reachability by name* (all three satisfy it) and says nothing about pass/fail. The
"Effects-panel cluster" the sweep and the O54 packet both defer is **not booked
anywhere** — it exists only as recommended future work in two review packets.

**Deliberately left red:** all four harnesses above. Now with a determined cause and a
three-line repair each, which is the difference between a red row and an open question.

---

## The usability finding, which is not a diff

The owner, 2026-09-02: *"The whole tooling in aurora around bands/parallax/raster, it's
just so confusing and convoluted and difficult to understand and use imo… I tried using
it last time our wwweekly was full and I was just lost."*

Three things this measurement says about that, in plain language.

**1. The creation form is two clicks deep, and neither click announces itself.** To make
a tile animation from the panel an author must (i) notice the Effects column has
sub-tabs at all and pick `Tile anim`, then (ii) notice `New tile animation` is a closed
accordion header and open it. Both defaults are individually defensible — d-26b's
sub-tabs fixed a 727px column holding 6008px of content; item 41's `defaultCollapsed`
fixed a 474px creation form crushing the Layers list. Stacked, they put the primary
creation surface behind two disclosures with nothing on the arrival screen saying it
exists.

**2. There is a second door, and it is the good one.** The tool-options bar carries
`Add blank tile animation` and `Promote from tile N`, running the same commands, visible
from every sub-tab with no disclosure to open (probe row 5a, measured on the *Parallax*
tab). `workspace/__tests__/facet-modules.test.ts:204` already says the collapsed section
"is not the only door to making one." The finding is that **the app leads with the worse
door**: the accordion is what the panel presents as the creation surface, and the toolbar
chip is what actually works on arrival. Nothing tells an author that.

**3. The word the walkthrough cost a session over was still on the button.** See below.

None of these is a bug I was asked to fix, and the layout arithmetic behind (1) is real.
But if the owner opens the Effects tab and cannot find how to make a tile animation, the
mechanism is now measured rather than guessed at.

---

## The app defect this found, and fixed

Not the one O55 asked about — the one the measurement walked into.

`023e0ed9` ruled that the tile-animation side may never say "band" and moved every
label. It moved every **quoted** label. `band-vocabulary.test.ts` scanned quoted string
and template literals only, so it stayed green over a panel that still rendered, measured
live with every section of the Tile anim sub-tab opened first (probe row 6b):

```
RENDERED TEXT SAYING "band" ON THE TILE-ANIM TAB (4):
  <SPAN>    "Parallax, raster bands, palette cycles and tile animations — …"   ← correct
  <DIV>     "lossless — Demote keeps a band's art, it just stops animating"
  <BUTTON>  "Add band"
  <DIV>     "The band arrives blank and unreferenced; nothing on screen changes …"
```

`Add band` is the exact control EFFECTS-W1 defect 2 was booked against — the cold
reader's **first click**, which built a tile animation while he read the word as a
raster band (`2026-09-02-effects-cold-walkthrough.md` §a4/§a5/§c1). It survived the
rename that exists to end it, for three weeks, under a green gate.

**Ten JSX text nodes moved** — the three on screen above, plus seven behind conditional
branches the screen sweep could not reach (no aeon project open, an unreadable
`editor_bg_override.json`, an absent one, an empty animation list, and the preview
strip's three caveat/warning branches). All JSX text children, in `BgAnimBandPanel.tsx` and
`BgAnimPreviewStrip.tsx`. The chip is now `Add`, under the `Blank tile animation` field
label that already names it — mirroring the bare `Promote` in the sibling group. Two
stale code comments moved with them.

### The gate now reads JSX

`jsxText()` walks the TypeScript parser's `JsxText` nodes, not a `>text<` regex: a regex
cannot distinguish a JSX child from the tail of `n > 0 ? a : b` followed by the next `<`,
and a gate that has to guess about its own subject cannot state its coverage.

**Red-first, on the real defect.** With `BgAnimBandPanel.tsx` **unmodified on disk** —
`git diff --stat` naming only the test file, and `sed -n '859p'` printing back
`              Add band` — the extended gate reported **10 offenders in 2 files**. Green
after the ten fixes. No synthetic mutation was needed; the defect was the mutation.

**Its anti-vacuous row is a fixture, not a per-file count.** The first shape asserted
every listed `.tsx` yields JSX text, and failed on `BandBankStrip.tsx` — which renders a
canvas, a row of thumbnails, and an `IconButton` whose label is a constant, so every
child of every element is an element or a `{…}` expression and it correctly has none.
**A row that fails on a file with nothing wrong with it is wrong, not strict.** So the
extractor is proved on a fixture it cannot be right about by accident (including the
multi-line child every long hint in these files is written as, and a `n > 0` line that
must *not* be read as JSX), plus an aggregate over the real files and a
`.ts`-yields-nothing check.

**One more stale pointer, corrected.** The gate's docblock named
`scratchpad/effects-vocabulary-harness.mjs` as "the instrument that reads the running
app's rendered text". **That file has never existed in this repo.** A gate that declares
its own blind spot and points at an imaginary instrument to cover it declares nothing.
It now points at `o55-new-band-door-probe.mjs` rows 6a/6b, which exist and are
registered in `package.json`.

Row 6a is the anti-vacuous companion: it opens `Tile animations (n/4)` and `New tile
animation` before sweeping, because a collapsed section renders no children and a sweep
over the arrival state would have found nothing and read as a clean bill.

---

## Verification

| what | result |
|---|---|
| `npm test` | **6477 passed · 8 skipped · 0 failed** (469 files passed, 2 skipped) — every skip named its reason |
| `npx tsc --noEmit` | clean, no output |
| `npm run check:harness-guards` | 187 clean / 187 classified · 0 failures · 0 unmeasurable |
| `npm run harness:o55-new-band-door` | **16/16**, on a fresh `VITE_AURORA_DEBUG=1` build |
| `git -C ../aeon status --porcelain` | ` M docs/lane-status.json` / ` M tools/freeze_preflight.sh` — the aeon lane's own two edits, nothing of mine |

The 8 skips are pre-existing and unrelated: 3 foreground-gate rows needing
`AURORA_FG_GATE_FILE`, 1 opt-in bench, 1 live-S1 row, 2 rows whose `s4_engine` fixture
tree is gone from this machine, and 1 `sibling-root` row that cannot run from a linked
worktree.

**Environment caveat.** A linked agent worktree has no `node_modules` and no `dist/`.
`node_modules` was symlinked to the main checkout's and `dist/` was built in place, so
`runTarget()` reported `in-tree` rather than `BORROWED` — the probe ran against a build
of **this branch's** source, not the main checkout's. The announcement line is in the
run output.

## Not done, and why

- **The four red harnesses.** None gates open work (table above). Their repair is three
  lines each and is written down; making them green for their own sake is the thing the
  scope forbids.
- **The 78 read-only peer-tree sites.** Untouched — owner call d-28.
- **`bganim-motion-harness.mjs` `[0d]`** (`the BG animation bands section is open`) and
  **`screen-frame-guides-harness.mjs` `[7c]`** (`the Add blank band chip`) are the same
  stale-label class and are named here so a future lane does not re-diagnose them. Both
  were already red before this branch.
