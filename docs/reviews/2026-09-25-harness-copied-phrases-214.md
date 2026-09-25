# Harness copied phrases, ROADMAP row 214 (2026-09-25)

Branch `harness-copied-phrases-214`, cut from master `5345baba`. Both items were re-measured
on today's tree before any change; both were still true. No emulator and no `mcp__oracle__*`
tool was used. Every harness run below: `VITE_AURORA_DEBUG=1 npx electron-vite build` in the
worktree, `ELECTRON_BIN` = the main checkout's electron, `AURORA_BUILT_TREE` = the worktree
(the `root:` line named the worktree on every run), `AEON_DIR` = a fresh extract of a
`git archive` of aeon `c53dde84` (origin/master that day), re-extracted for every run of
either harness.

Precedent: `docs/reviews/2026-09-25-stale-wording-197-198.md` (row 3a).

## (a) band-preset rows 3b, 3c and 3e

**Still true.** Baseline: 44 rows, 0 failed. 3b, 3c and 3e matched regexes copied out of
`SHORT_BODIES.debug_chord`, `SHORT_BODIES.unchecked_visibility`, the matching
`PRESET_LIMITS` bodies, `NO_PREVIEW_SHORT` and `NO_PREVIEW`.

**Everything was derivable.** `LimitBlock` (`src/renderer/components/effects/BandPresetPanel.tsx`)
renders each limit whole, as `<span>{title}.</span> {body}` under `title={full}`, and the
no-preview line as `{NO_PREVIEW_SHORT}` under `title={NO_PREVIEW}`. None of it is composed
from runtime data, so every row is an exact comparison.

**Change (805b1e70).**
- 3b and 3c compare the element's painted `innerText` with `` `${title}. ${body}` `` and its
  `title` with `full`. The values come from the `presetLimitsShort()` 3a already imports,
  looked up by `key` (not by index).
- 3e compares the painted text with the imported `NO_PREVIEW_SHORT` and the `title` with
  `NO_PREVIEW`.
- Each red prints the first differing character.
- The run refuses to start if any of the four source values is missing or trivially short.
- 3e keeps its retired-phrase negative (`never been looked at on screen`). A negative cannot
  rot into a false red.
- The bare-apostrophe regex literal is kept as its own named literal. 3b's old regex was the
  regression control `check-harness-guards.mjs` relies on (O79). `check:harness-guards`: 0
  failures.

**Proofs.** Each mutation was applied by a script, shown with `git diff`, rebuilt, and
restored with `git checkout --` from the committed 805b1e70.

| run | mutation on disk | result |
|---|---|---|
| fix | none | 44 rows, 0 failed; 3b `painted(249B vs source 249B): identical; hover(482B vs source 482B): identical`, 3c 198/229 identical, 3e 160/796 identical |
| A: source reworded | `effects-preset.ts`: `aeon\'s canonical build fails loudly` → `MUTATION-214 build fails LOUDLY`; unchecked_visibility full `pipeline catches that: not this panel, …` → `pipeline MUTATION-214 catches that.`; `'No preview.` → `'MUTATION-214 no preview.` in both constants | new harness: 44 rows, 0 failed. Sizes followed the source: 3b painted 245B, 3c hover 195B, 3e 173B/809B. Committed OLD harness (from `HEAD~1`, deleted after) on the same build: 44 rows, 3 failed (3b, 3c, 3e) |
| B1: UI paints something else | `{l.body}` → `{l.body.replace('.', ';')}` | 44 rows, 3 failed. 3a/3b/3c, e.g. 3b `first difference at char 166: got "; aeon's canonical …" want ". aeon's canonical …"` |
| B2: UI hovers something else | `title={l.full}` → `title={l.full.slice(0, -1)}` | 44 rows, 3 failed. 3a/3b/3c, e.g. 3c `hover(228B vs source 229B): first difference at char 228: got "" want "."` |
| B3: no-preview line changed | `title={NO_PREVIEW + ' '}` and `{NO_PREVIEW_SHORT.replace('ROM', 'rom')}` | 44 rows, 1 failed. 3e only: `got "rom runs." want "ROM runs."` and `hover(797B vs source 796B)` |
| restored | none, rebuilt | 44 rows, 0 failed |

## (b) effects-guide: `.click()` → CDP Input

**Still true.** Baseline: 13/13. Two rows clicked with a synthetic `el.click()`:
- row 3 clicked the `? Guide` chip;
- row 4a clicked the last contents-rail link.

A third, row 1b's switch to the Effects facet (`clickByText`), is outside row 214 and was
left as is.

**Change (6d7331f0).** `realClick(c, x, y)` sends three `Input.dispatchMouseEvent` calls:
`mouseMoved`, `mousePressed` (left, `buttons: 1`, `clickCount: 1`) and `mouseReleased`. It
refuses a non-integer pixel.
- The chip is clicked at `btn.aim`, the integer centre row 2b has just hit-tested, in the same
  session.
- The rail link is scrolled to `nearest`. Its aim is `Math.round` of its rect centre, and
  `elementFromPoint` is checked there before dispatch.
- 4a now also requires `hitIsLink`, and prints dpr, rect and aim.
- `scrollTop` before the click is read after the positioning. The landing is read in a
  separate evaluation 300 ms after the dispatch. GuideTab's rail handler scrolls
  synchronously (`scrollIntoView({ block: 'start' })`).

**Proofs.** Each mutation offsets only the DISPATCHED pixel, so the aim and hit test are
unchanged. Each was edited on disk, shown with `git diff`, and restored with
`git checkout --` from the committed 6d7331f0.

| run | mutation | result |
|---|---|---|
| fix | none | 13/13; 4a `dpr 1, rect x 814.58 w 111.67, aim {870,46}, hitIsLink true, before 126, after 11913, inView true` |
| R1: rail click off the rail | `realClick(c, aimed.aim.x + 300, aimed.aim.y)` | 12/13, 4a FAIL: `hitIsLink true, before 126, after 126, inView false` |
| R2: chip click off the chip | `realClick(c, btn.aim.x, btn.aim.y + 300)` | 3a FAIL `{"found":false}`, then `HARNESS ABORTED: the guide pane never appeared` (by design) |
| restored | none | 13/13 |

## Re-run (overseer)

```
VITE_AURORA_DEBUG=1 npx electron-vite build
AEON_DIR=<fresh git archive of aeon origin/master> ELECTRON_BIN=<main>/node_modules/.bin/electron \
  AURORA_BUILT_TREE=<this tree> npm run harness:band-preset     # 44 rows, 0 failed
AEON_DIR=<fresh copy> ELECTRON_BIN=… AURORA_BUILT_TREE=… npm run harness:effects-guide   # 13/13
```

## Left open

- Row 1b of `effects-guide-harness.mjs` still switches to the Effects facet with `.click()`.
- Row 3d of `band-preset-harness.mjs` still matches copied `PRESET_HEADLINE` phrases
  (`An author can author a raster band`, `programmer wires it up in one line`). That is the
  shape row 214 removed from 3b/3c/3e.
