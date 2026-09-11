# paste-layers-grey-out: the Paste layers panel offers only what a click can land

Branch `parcel/paste-layers-grey-out`, from master `c3899d56`.
Commits: `f4f94ca0` rows first (six red on base); `19ecde82` the panel reads the
click's decision; `2d4de168` a control for the unarmed panel. Code tip
`2d4de168`. This packet and the ledger row follow it and change no code or test.

Lens row `PASTE-LAYERS-GREY-OUT`. Opened from section 6c of
`docs/reviews/2026-09-11-collision-paste-across-tilesets.md`: "The Paste layers
panel does not grey out Both and Art in another zone."

---

## Verdict: BUILT. Nothing BLOCKED, no new plumbing, the click untouched.

In another zone of the same project, Both and Art now show unavailable and the
reason is a line of text under the control. Collision stays available. The
author's own setting is never changed. In the zone the copy was made in, the
panel is as it was. Each choice's verdict is the commit click's own expression,
computed by one function the panel calls, so the panel cannot offer a choice the
click refuses.

---

## 1. Where the panel reads its state, and where the click decides

**What the panel knew on base** (`src/renderer/components/MarqueePasteOptions.tsx`,
base `c3899d56`): the setting (`:125`
`const pasteLayers = useEditorStore((s) => s.pasteLayers);`), whether a paste is
armed (`:130` `const pasting = useEditorStore((s) => s.pasting);`) and the armed
clipboard (`:132` `const clipboard = useEditorStore((s) => s.mapClipboard);`).
Its only unavailability rule was `:157`
`const layersLocked = pasting ? (clipboard?.artOnly ?? false) : !aligned;` and
`:233` `const dead = layersLocked && value === 'collision';`. The component body
read no zone and no project (only its `SelectionPreview` child reads the project
store). So it knew WHAT was armed and never asked WHERE.

**So no new plumbing was needed.** The clipboard carries its tile set by
reference (`MapClipboard.tileset`), and the open zone and project are in
`useProjectStore`, which the panel already imported. Neither the paste contract
nor the save contract changed.

**Where the decision lives** (`src/core/editing/map-clipboard.ts`, unchanged by
this parcel): `pasteRefusal` (`:159`):

    const artBad = layers !== 'collision' && !fit.art;
    const collisionBad = layers !== 'art' && !fit.collision;
    if (artBad && collisionBad) return OTHER_PROJECT_REFUSAL;
    if (artBad) return OTHER_TILESET_REFUSAL;
    if (collisionBad) return OTHER_PROJECT_COLLISION_REFUSAL;
    return null;

with `pasteFit` (`:139`) giving `{ art: clipboardFitsTileset, collision:
clipboardFromProject }`, and `armRefusal` (`:178`) refusing Ctrl+V only when
`!(fit.art || (fit.collision && !clip.artOnly))`.

**The click** (`src/renderer/components/MapViewport.tsx:3296-3309`, unchanged):
`const layers: PasteLayers = e.altKey ? 'art' : e.shiftKey ? 'collision' :
useEditorStore.getState().pasteLayers;` then
`pasteRefusal(pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project),
effectivePasteLayers(clip, layers))`. A refusal toasts and leaves paste mode.
**Ctrl+V** (`:1972-1979`): `armRefusal(clip, fit, pasteLayers)`, and when it
arms over another tile set it toasts `COLLISION_ONLY_HERE`.

**How a zone change reaches the panel.** `src/renderer/state/editorStore.ts:988-995`
clears `pasting` (and the marquee) on any change of project `config`, zone or
act. So "armed in another zone" happens only by a Ctrl+V made there. That is the
sequence the "entering another zone" row replays.

---

## 2. What was built

**`pasteLayerOffer(clip, fit, sticky)`** (`src/core/editing/map-clipboard.ts:234`).
Per choice, `refusals[v]` is the click's expression
`pasteRefusal(fit, effectivePasteLayers(clip, v))` (`:235`). The notice is chosen
by what can land:

| what can land | notice |
|---|---|
| every choice | none |
| nothing (another project; an art-only copy in another zone) | the Ctrl+V refusal, `armRefusal`, word for word |
| the collision, not the tiles (another zone) | `COLLISION_ONLY_HERE`, plus `stickyRefusedHere(sticky)` when the setting is a refused choice |
| the tiles, not the collision (the map cannot reach this) | the click's refusal for the setting, or for the first refused choice |

`PASTE_LAYER_LABEL` (`:189`) is the one table of button labels, and the panel's
buttons now read it, so a sentence about the setting names the choice exactly as
its button does. `stickyRefusedHere` (`:196`) is the only new sentence: "Layers is
set to Both, so a plain click here is refused. Choose Collision to paste with a
plain click." (Art likewise.)

**The panel** (`src/renderer/components/MarqueePasteOptions.tsx`): subscribes to
the project (`:169`) and the open zone's tile set (`:170`) and, only while
pasting, computes
`pasteLayerOffer(clipboard, pasteFit(clipboard, openTileset, project), pasteLayers)`
(`:171`). A choice is disabled when the old art-only rule says so or when its
verdict is a refusal (`:252`). The notice is a text line directly under the
Layers row, in the existing warning style (`:271`). A refused choice's hover
title repeats the notice.

**What the panel shows now:**

| case | Both | Art | Collision | text under the control |
|---|---|---|---|---|
| same zone | as before | as before | as before | none (as before) |
| another zone, setting Collision | unavailable | unavailable | available, chosen | "Only the collision can be pasted here: the copied tiles belong to another tile set. Shift+click pastes collision only." |
| another zone, setting Both | unavailable, marked as chosen | unavailable | available | the above, then "Layers is set to Both, so a plain click here is refused. Choose Collision to paste with a plain click." |
| another zone, setting Art | unavailable | unavailable, marked as chosen | available | the above with "Art" |
| another project (not reachable in the UI, see 5b) | unavailable | unavailable | unavailable | the Ctrl+V refusal for the setting, verbatim |
| not pasting (marquee tool) | as before | as before | as before | none |

**Look calls** (the owner defers these). The notice sits directly under the
control it explains, in the colour and size of the panel's existing warning
line. The author's own choice, when unavailable, keeps a dashed warning-colour
border at 0.7 opacity, against 0.4 for the choice he did not pick, so his setting
stays visible as his. Unavailable choices are `disabled`: one cannot pick a
choice that cannot land.

**What a click does is unchanged.** A plain click with a sticky Both or Art in
another zone is still refused and still leaves paste mode (the landed rule; see
the landed packet's 6b). The panel now says so before the click.

---

## 3. The rows

All in the new file `src/renderer/components/__tests__/paste-layers-grey-out.test.ts`
(`map-viewport-mounted.test.ts` untouched). The panel rows run the REAL component
body over the real stores through `renderHooked` (`src/test/render-hooked.ts`) and
read its `disabled` and `title` props and its text children. "Visible without
hovering" is measured as TEXT CHILDREN: a title is a prop, never a child. The
expected verdict of every button is the click's own expression, evaluated by the
row over the same stores (`clickRefusal` in the file).

| row | on base `c3899d56` | reddened by |
|---|---|---|
| G1 another zone: Both and Art unavailable, the reason on screen, Collision available (and clickable) | **RED**, ASSERTION: "Both is offered where the click refuses it" | M1, M3, M5, M13 |
| G2 a sticky Both stays Both, shown chosen and unavailable; the panel says a plain click is refused | **RED**, ASSERTION | M1, M3, M4, M5, M8, M13 |
| G3 entering another zone keeps the setting (Art); returning restores the panel | **RED**, ASSERTION: "the sticky Art is shown as available" | M1, M3, M4, M5, M7, M8, M13 |
| C1 CONTROL same zone, clipboard with collision, each setting: all available, old titles, the setting highlighted, no notice | green | M7 |
| C2 CONTROL not pasting, clipboard from another zone: nothing greyed, old titles, no notice | added in `2d4de168` | M12, M13 |
| C3 CONTROL same zone, art-only clipboard: Collision unavailable with its old title, the old warning line | green | M7 |
| D1 THE DESYNC ROW: every button unavailable exactly where the click refuses it, over clipboard kind x zone x setting (anti-vacuous: both outcomes present) | **RED**, ASSERTION: "another zone, with collision, setting both: Both" | M1, M3, M13 |
| D2 another project: all unavailable, the Ctrl+V refusal shown | **RED**, ASSERTION | M1, M2, M4, M5, M13 |
| D3 the seam: the click still decides by the oracle's expression; the panel asks `pasteFit` and holds no copy of the rule | **RED**, ASSERTION: "the panel does not ask pasteFit" | M3, M6 |
| O1 `pasteLayerOffer`'s verdicts equal the click's, over every fit a `PasteFit` can hold, the unreachable one included | added with it | M2, M13 |
| O2 the notice, case by case | added with it | M2, M7, M10, M11, M13 |
| O3 the setting sentence names its button's label and carries no dash | added with it | M9 |

Base run of the file at `f4f94ca0` (rows only, no code): 6 failed, 2 passed, every
failure `AssertionError`.

---

## 4. Plants

Applied by a scratch script kept outside the repo, never committed:
exact-anchor replacement, refused unless the anchor occurs once, read back from
disk and the mutated line printed, then the new file plus
`src/core/editing/__tests__/map-clipboard.test.ts` run, then the file restored
with `git show HEAD:<path>` and checked with `git diff --quiet`. All against
`2d4de168`. Every red was ASSERTION; TIMEOUT 0; `git status` empty after the
batch.

| plant | the mutation on disk | reds |
|---|---|---|
| M1 | `MarqueePasteOptions.tsx:252` `const refusal = null as string \| null;` (the panel ignores the verdict) | 5: G1, G2, G3, D1, D2 |
| M2 | `map-clipboard.ts:235` `const click = (v: PasteLayers) => (v !== 'collision' && !fit.art ? OTHER_TILESET_REFUSAL : null);` (**desync**: a private copy of the rule, tiles only) | 3: D2, O1, O2 |
| M3 | `MarqueePasteOptions.tsx:172` the panel's fit is `{ art: clipboard.tileset === openTileset, collision: clipboard.tileset === openTileset }` (**desync**: the panel decides fit itself, by the old rule) | 5: G1, G2, G3, D1, D3 |
| M4 | `MarqueePasteOptions.tsx:174` `if (offer && offer.refusals[pasteLayers] !== null) setPasteLayers('collision');` (the setting rewritten) | 3: G2, G3, D2 |
| M5 | `MarqueePasteOptions.tsx:271` `{false && offer?.notice && ...}` (the reason only in a tooltip) | 4: G1, G2, G3, D2 |
| M6 | `MapViewport.tsx:3309` `layers);` (**desync from the click side**: the click stops collapsing layers) | 1: D3 |
| M7 | `map-clipboard.ts:238` a notice at home | 4: G3, C1, C3, O2 |
| M8 | `MarqueePasteOptions.tsx:264` the chosen-and-unavailable style dropped | 2: G2, G3 |
| M9 | `map-clipboard.ts:197` an em dash in the setting sentence | 1: O3; `check-src-dashes` also exits 1 |
| M10 | `map-clipboard.ts:241` `if (true) {` (the arming notice where the collision cannot land) | 1: O2 |
| M11 | `map-clipboard.ts:240` `if (false) return ...` (the Ctrl+V refusal not said where nothing lands) | 1: O2 |
| M12 | `MarqueePasteOptions.tsx:171` `const offer = clipboard` (greys out while not pasting) | 1: C2 |
| M13 | `map-clipboard.ts:161` `const artBad = false;` (the landed rule itself changes) | 10, incl. 7d-2 and 7d-3 in map-clipboard.test.ts |

**Why M2 does not redden D1.** A copy that forgets the collision half agrees
with the real rule in both places D1 covers (home, and another zone), so only the
another-project row and the rows over every `PasteFit` catch it. That is why D2
and O1 exist.

**What M13 shows.** When the rule itself changes, panel and click move together
(no desync), and the rows fail on their PREMISE lines, e.g. "the premise: the
click refuses Both and Art only" and D1's anti-vacuous "the click refused nothing
in this table", rather than passing quietly on a rule they no longer describe.

---

## 5. Trades, and where the tree contradicted or refined the brief

**5a. The reason sentence is the landed arming notice, not a new one.** The
brief's example ("Only collision can be pasted here: the copied tiles belong to
another tile set.") is within two words of the landed `COLLISION_ONLY_HERE`,
which Ctrl+V already toasts in that state. The panel shows that constant, so the
toast and the panel cannot word it two ways.

**5b. Another project is not reachable through the UI.** Ctrl+V is refused there
(`armRefusal`), and a project change clears `pasting`
(`editorStore.ts:988-995`), so the panel is never armed in another project except
through the public `setPasting`. The click checks there anyway, so the panel
mirrors it: every choice unavailable and the Ctrl+V refusal verbatim. No new
sentence; this is the "mirror the landed refusal" option.

**5c. The hint line is not changed.** While pasting it still reads "Click to
paste, hold Alt for art only, Shift for collision only" in another zone, where a
plain click with Both or Art, and Alt, are refused. Outside the ruling (which
names the Both and Art choices); the notice above it now says which gesture
lands. A candidate follow-up.

**5d. An older quirk left as is.** With an art-only clipboard and the setting on
Collision, the unavailable Collision loses its highlight, so no choice looks
chosen. That predates this parcel and is in the same-zone panel, which the ruling
says must stay as it is (C3 holds it). The new chosen-and-unavailable mark applies
only to fit refusals.

**5e. Unavailable choices cannot be picked.** In another zone an author with
Collision set cannot switch back to Both there. Both cannot land there, and at
home every choice is available again.

**5f. The brief held.** The panel knew what was armed; it did not know where.
Nothing contradicted the brief's premises.

**5g. The worktree had no `node_modules`.** Installed with `npm ci`, not symlinked.

---

## 6. Classic (Sonic 1)

Not served. `MarqueePasteOptions` is imported only by
`src/renderer/workspace/facets/layout-facet.tsx:9`, whose module is registered for
`['aeon']` only (`src/renderer/workspace/register-facets.ts:15-20`); classic
registers its own `s1LayoutFacet`.

---

## 7. Suite

| | Test Files | Tests |
|---|---|---|
| base `c3899d56` | 604 passed \| 3 skipped (607) | 9083 passed \| 9 skipped (9092) |
| code tip `2d4de168` | 605 passed \| 3 skipped (608) | 9095 passed \| 9 skipped (9104) |

Both `npm test` runs exit 0, and the failure-class reporter says "no failures in
this run" on both. `9104 - 9092 = 12`, the rows in the one new file.
`npx tsc --noEmit` exits 0 with no output at base and at the tip.

---

## 8. Foreground only, tagged, not attempted

No emulator was touched. Needs an aeon project with two zones (aeon's one
`project.json` has one; the landed packet's 6e).

- **F-1.** Layout facet, marquee, copy a block-aligned region in zone A. Open a
  level of zone B, Ctrl+V. The Paste panel: Both and Art greyed, Collision
  available, and under the Layers row the warning line "Only the collision can be
  pasted here: ...". With Layers on Both, a second sentence naming Both, and Both
  drawn with a dashed warning border, visibly different from the greyed Art.
  Check the line wraps inside the panel column without clipping.
- **F-2.** Press Collision: it highlights, the second sentence goes. A plain
  click on the map lands the collision (the landed rule).
- **F-3.** Back in zone A, Ctrl+V: the panel as before, no warning line, and the
  Layers setting as the author left it.
