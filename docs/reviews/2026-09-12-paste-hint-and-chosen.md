# paste-hint-and-chosen: the paste hint says what a click does, and a set Collision shows as chosen

Branch `parcel/paste-hint-and-chosen`, from master `ba727d1e` (which carries the
grey-out merge `408cbd0e`).
Commits: `5e1d9031` PASTE-HINT-LINE-MISLEADS (rows and fix); `821e2dcc`
ART-ONLY-COLLISION-NO-CHOSEN (rows and fix). Code tip `821e2dcc`. This packet
follows it (with one comment correction in the test file, see 6).

Both rows were booked when PASTE-LAYERS-GREY-OUT landed
(`docs/reviews/2026-09-11-paste-layers-grey-out.md`, its 5c and 5d).

---

## Verdict: BUILT, both. Nothing BLOCKED.

The paste hint line is now a field of the same offer the Layers buttons are
greyed from, so in another zone it offers only the gestures the click lands and
names the rest as refused. In the zone the copy was made in it is the line it
always was. With Layers on Collision over an art-only source, Collision now shows
as the author's chosen, unavailable choice, in the mark the grey-out parcel
already ruled for that meaning. The setting is never rewritten.

---

## 1. PASTE-HINT-LINE-MISLEADS

**The defect.** `src/renderer/components/MarqueePasteOptions.tsx` rendered the
paste hint as a literal while pasting: "Click to paste · hold Alt for art only,
Shift for collision only · X flips it left↔right, Y top↕bottom · Esc to stop".
In another zone of the project the commit click (MapViewport's paste branch,
`pasteRefusal(pasteFit(...), effectivePasteLayers(clip, layers))`) refuses a
plain click with Layers on Both or Art, and Alt+click, because tile words fit only
their own tile set. So the line offered two refused gestures, directly under
buttons greyed for that very reason.

**The cause.** Two statements of one rule: the buttons asked `pasteLayerOffer`,
the hint asked nothing. And the gesture mapping itself (Alt art, Shift collision)
was an inline ternary in MapViewport that the hint restated in prose.

**What changed.**

- `src/core/editing/map-clipboard.ts`:
  - `pasteClickLayers(mods, sticky)`: Alt+click art, Shift+click collision, a plain
    click the setting. The map's commit click now takes its layers from it
    (`MapViewport.tsx`, the paste branch), and the hint describes the gestures
    through it. Behaviour of the click is unchanged.
  - `PasteLayerOffer.hint`, computed in `pasteLayerOffer` by `pasteHintLine`. Where
    every choice's verdict is null it is `PASTE_HINT`, the landed text, unchanged.
    Elsewhere each gesture is said by the click's two checks: the offer's own
    `refusals[pasteClickLayers(gesture)]` (the verdicts the buttons are greyed
    from), then `effectivePasteLayers` (is anything left to write).
- `MarqueePasteOptions.tsx`: while pasting the hint is `offer?.hint ?? PASTE_HINT`.
  The panel holds no hint text of its own now.
- `src/renderer/components/map-flip.ts`: a comment that quoted the old inline
  ternary now names `pasteClickLayers`.

**What the line says now** (printed from `pasteLayerOffer(...).hint` by a scratch
run, not typed):

| clipboard | where | Layers | hint |
|---|---|---|---|
| with collision | home | any | Click to paste · hold Alt for art only, Shift for collision only · X flips it left↔right, Y top↕bottom · Esc to stop |
| with collision | another zone | Both or Art | Shift+click to paste collision only · a plain click and Alt+click are refused here · X flips it left↔right, Y top↕bottom · Esc to stop |
| with collision | another zone | Collision | Click or Shift+click to paste collision only · Alt+click is refused here · X flips it left↔right, Y top↕bottom · Esc to stop |
| with collision | another project | any | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop |
| art only | home | any | the landed line, unchanged (see open item O-2) |
| art only | another zone, another project | any | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop |

The "Nothing can be pasted here" states are not reachable through the UI
(Ctrl+V is refused there, `armRefusal`, and a zone or project change clears
`pasting`); the panel covers them because the click does. The notice line above
the hint (the grey-out parcel's) already carries the reason, so the hint does not
repeat it.

**Wording** is mine (the owner defers look calls). "Refused" is the word the
grey-out notice already uses for the same click ("a plain click here is
refused"). The `·` segments and the flip/Esc tail are the landed line's own.

## 2. ART-ONLY-COLLISION-NO-CHOSEN

**Reproduced first.** Same zone, an art-only clipboard (a 3x3 tile copy), Layers
on Collision: the Collision button rendered with exactly the style it has when
Layers is on Both, and Both and Art rendered alike. No button looked chosen.

**Why.** `effectivePasteLayers(artOnly, 'collision')` returns `null`: the
clipboard has no collision to write. `pasteRefusal(fit, null)` returns `null` by
contract ("null layers is not refused here: the caller has its own sentence"),
so `pasteLayerOffer(...).refusals.collision` is `null`. The panel greys Collision
through the older no-collision rule (`layersLocked`, `noCollision`), and its two
"chosen" marks were gated on:

- `pasteLayers === value && !dead` for the accent highlight: false, it is dead;
- `refusal !== null && pasteLayers === value` for the grey-out parcel's
  chosen-and-unavailable mark: false, the verdict is not a refusal.

So the panel did compare the setting against the button, and then each gate
dropped the result, because each looks at only one of the two reasons a choice
can be unavailable. Both premise lines are asserted in row K1.

**The fix.** `MarqueePasteOptions.tsx`: the chosen-and-unavailable mark is keyed
on `dead && pasteLayers === value`, i.e. the author's own setting unavailable for
EITHER reason. The setting is never touched. The same line also covers the copy
side (marquee tool, a selection that is not block-aligned, Layers on Collision),
which had the same defect for the same reason; row K3 holds it.

**Why this was not stopped as a look call.** The question "which button is
chosen" has one answer: the setting is Collision and a plain click acts on it
(and writes nothing, with the "carries no collision" toast). The question "how
does a chosen, unavailable choice look" was already ruled by the grey-out parcel
(dashed warning border at 0.7 opacity, "so his setting stays visible as his").
Its 5d kept this case out for a SCOPE reason (the same-zone panel had to stay as
it was under that ruling), not a look reason. The options, for the record:

| option | what the author sees |
|---|---|
| (a) the ruled chosen-and-unavailable mark (built) | Collision greyed with the dashed warning border, as a refused Both is in another zone |
| (b) the live accent highlight on a disabled button | Collision looks selectable and live, contradicting `disabled` |
| (c) no mark (base) | no choice looks chosen; the setting is invisible |

If the owner wants a different mark for "nothing to write" than for "refused",
row K2 ("one meaning, one look") is the one that says otherwise and is the one to
change.

---

## 3. The rows

All in the new file `src/renderer/components/__tests__/paste-hint-and-chosen.test.ts`.
The panel rows run the REAL component through `renderHooked`. Every expectation
is the click's own checks (`clickLands`: `pasteRefusal` over `pasteFit`, then
`effectivePasteLayers`) over the same stores, with the modifier mapping as
MapViewport had it; the seam row holds the click and `pasteClickLayers` to that
mapping. The hint is read segment by segment (`readHint`): which gestures a
segment names, and whether that segment says "refused".

| row | before the fix | reddened by |
|---|---|---|
| H1 another zone: the hint offers exactly the gestures the click lands, names the rest refused, says what the landing ones paste | **RED**, ASSERTION: "setting both: the hint offers a gesture the click refuses here (...): expected [ 'click', 'alt', 'shift' ] to deeply equal [ 'shift' ]" | P1, P2, P4 |
| H2 nothing lands (another project; art only in another zone): no gesture offered | **RED**, ASSERTION: "another project, setting both: the hint offers a gesture that lands nothing (...): expected [ 'click', 'alt', 'shift' ] to deeply equal []" | P1, P2 |
| HC1 CONTROL home, both clipboard kinds, every setting: the hint is the landed line; the reader sees all three gestures in it | green before and after | P5 |
| HC2 CONTROL the flip keys and Esc stay in every hint | green before and after | none planted |
| HO1 `offer.hint` over every fit, clipboard kind and setting (the unreachable fit included); "refused" only where the click refuses (not where it merely has nothing to write) | added with the fix | P2, P4, P5 |
| HO2 the seam: the click calls `pasteClickLayers`; it maps as the oracle does; the panel shows `offer?.hint` and holds no hint text | added with the fix | P1, P3, P4 |
| HO3 no hint carries a dash | added with the fix | none planted |
| K1 art only, Layers on Collision: Collision unavailable AND marked chosen, setting kept; premise lines state the cause | **RED**, ASSERTION: "no choice shows as chosen: the set Collision looks exactly as it does when Layers is on Both" | P6, P7, P8 |
| K2 one meaning, one look: that mark equals the refused-setting mark | **RED**, ASSERTION: "the set, unavailable Collision is marked unlike the set, refused Both" | P6, P7, P8 |
| K3 the copy side: unaligned selection, Layers on Collision | **RED**, ASSERTION: "no choice shows as chosen on the copy side" | P6, P7 |
| KC CONTROL art only, Layers on Both or Art: that choice highlighted; the unset Collision in the plain unavailable look, NOT the chosen mark | green before and after | P7 |

Runs of the file before each fix: item 1 on base source, 2 failed | 2 passed (4),
both `AssertionError`; item 2 on `5e1d9031` (whose chosen logic is base's),
3 failed | 8 passed (11), all three `AssertionError`.

**The whole parcel reverted to base, rows kept** (P9). `git checkout ba727d1e --`
on the four source files the parcel changes (`map-clipboard.ts`,
`MapViewport.tsx`, `MarqueePasteOptions.tsx`, `map-flip.ts`); that form writes
the index too, so the mutation shows under `git diff --cached --stat` (see
section 4). Then this file and the grey-out file: 8 failed | 15 passed (23).
The grey-out file 12 of 12 green on base. In this file the three controls (HC1,
HC2, KC) green; the five rows red on base (H1, H2, K1, K2, K3) all
`AssertionError`, with the messages quoted above; the three rows added with the
fix fail there because what they test does not exist on base: HO1
`AssertionError` ("expected undefined to be 'Click to paste ...'", no
`offer.hint`), HO2 `TypeError: pasteClickLayers is not a function`, HO3
`TypeError: .toMatch() expects to receive a string, but got undefined`.
Restored with `git checkout HEAD -- <the four files>`.

---

## 4. Plants

A scratch runner kept outside the repo and never committed: an exact-anchor
replacement, refused unless the anchor occurs once; before each plant it checks
the three mutable files equal copies taken while the tree was clean at
`821e2dcc` (so the previous restore took); it reads the mutated line back from
disk and prints it, then runs the new file, `paste-layers-grey-out.test.ts` and
`src/core/editing/__tests__/map-clipboard.test.ts` (61 rows). It never runs git:
each restore was a plain `git checkout HEAD -- <file>` against the committed
`821e2dcc`, by hand. Every red was ASSERTION; TIMEOUT 0 in every run.

| plant | the mutation on disk | reds |
|---|---|---|
| P1 | `MarqueePasteOptions.tsx:344` `? PASTE_HINT` (the panel ignores the offer's hint: item 1 reverted in the panel) | 3: H1, H2, HO2 |
| P2 | `map-clipboard.ts:249` `if (writes !== null) lands.set(...)` (**desync**: the hint forgets the fit refusal, a second and weaker condition) | 3: H1, H2, HO1 |
| P3 | `MapViewport.tsx:3297` `const layers: PasteLayers = e.altKey ? 'art' : e.shiftKey ? 'collision' : useEditorStore.getState().pasteLayers;` (**desync from the click side**: the mapping inlined again) | 1: HO2 |
| P4 | `map-clipboard.ts:209` `return mods.altKey ? 'collision' : mods.shiftKey ? 'art' : sticky;` (the keys swapped: click and hint move together) | 3: H1, HO1, HO2 |
| P5 | `map-clipboard.ts:243` `if (false) return PASTE_HINT;` (the same-zone hint generated too) | 3: HC1, HO1, and the grey-out file's C3 |
| P6 | `MarqueePasteOptions.tsx:269` `...(refusal !== null && pasteLayers === value ? styles.planeChosenDead : {}),` (item 2 reverted) | 3: K1, K2, K3 |
| P7 | `MarqueePasteOptions.tsx:269` `...(dead ? styles.planeChosenDead : {}),` (every unavailable choice marked chosen) | 6: K1, K2, K3, KC, and the grey-out file's G2, G3 |
| P8 | `MarqueePasteOptions.tsx:171` `if (pasting && clipboard?.artOnly && pasteLayers === 'collision') setPasteLayers('both');` (the setting rewritten) | 2: K1, K2 |

**Why P3 reddens only the seam.** The re-inlined ternary behaves identically
today, so only HO2 can see it; that row exists so a second copy of the mapping
cannot come back and drift later. **Why P8 spares K3.** The plant fires only
while pasting; K3 is the copy side. **P5 is also held by the grey-out file**
(its C3 forbids "refused" at home), so the same-zone property has two holders.
**HC2 and HO3 were not planted.**

**P9, the whole parcel reverted to base** (result in section 3). With the four
source files checked out at `ba727d1e`, `git diff --cached --stat`:

    src/core/editing/map-clipboard.ts               | 70 ++-----------------------
    src/renderer/components/MapViewport.tsx         |  6 +--
    src/renderer/components/MarqueePasteOptions.tsx | 15 ++----
    src/renderer/components/map-flip.ts             |  4 +-
    4 files changed, 12 insertions(+), 83 deletions(-)

---

## 5. Suite

| | Test Files | Tests |
|---|---|---|
| code tip `821e2dcc` | 607 passed \| 3 skipped (610) | 9154 passed \| 9 skipped (9163) |

`npm test` exit 0; the failure-class reporter says "no failures in this run (610
module(s) reported)"; the skip reporter says every skip named its reason. The new
file is collected (named in the run) and holds 11 rows. `npx tsc --noEmit` exit 0
after each fix (`5e1d9031`, `821e2dcc`).

No base full-suite run: nothing fails at the tip, so there is no failure to
compare, and the grey-out packet's base totals are for `c3899d56`, not this base,
so no delta is claimed from them. The packet commit adds this file and changes one
comment line of the test file; the run at that tip is in the report that hands
the branch over.

---

## 6. Open, and where the tree refined the brief

- **O-1. The status bar says the same thing.** `src/renderer/components/shared/map-status-model.ts`
  `statusLabel` returns "Click to paste · Alt: art only · Shift: collision only · Esc to stop"
  while pasting, and aeon's port (`src/renderer/providers/map-status-aeon.ts`) sets
  no `ownHintLine` and no `contextInfo` outside the stamp tool, so in aeon that
  line is on screen under the map while the panel's hint is now correct. Same
  defect, second surface. Not changed: outside the booked row, and the bar is a
  neutral surface with its own wording. The fix path is the aeon port passing
  `contextInfo` from the same `pasteLayerOffer(...).hint` when pasting where a
  choice is refused. A candidate row.
- **O-2. The same-zone hint over an art-only clipboard** still offers Shift+click
  (and, with Layers on Collision, a plain click), which write nothing there (the
  "carries no collision" toast). Kept as it was because the brief keeps the
  same-zone hint unchanged; HC1 pins it, so fixing it is a deliberate change to
  that row. The hint derivation already knows the answer (`effectivePasteLayers`),
  so the fix is narrowing the early return in `pasteHintLine` and updating HC1.
- **The click file changed.** The brief did not ask for it; the grey-out parcel
  had kept the click untouched. The inline modifier ternary is now
  `pasteClickLayers(e, ...)`, same result, so the hint and the click read the
  modifiers through one function. The grey-out seam row (D3) is unchanged and
  green.
- **The test file cited this packet as `2026-09-11-...`**; UTC rolled to
  2026-09-12 before the packet was written, so the packet commit corrects that
  one comment line.
- **Classic** is not served: `MarqueePasteOptions` mounts only in aeon's layout
  facet (the grey-out packet's section 6).

## 7. Foreground only, tagged, not attempted

No emulator, no CDP. The instrument cannot see paint or layout.

- **F-1.** Another zone, Ctrl+V with a block-aligned copy from zone A, Layers on
  Both: the hint line under the panel reads "Shift+click to paste collision only ·
  a plain click and Alt+click are refused here · ..." and wraps inside the 240px
  column. Switch Layers to Collision: "Click or Shift+click to paste collision
  only · Alt+click is refused here · ...".
- **F-2.** Same zone, copy a 3x3-tile (unaligned) selection with the marquee on
  Tile, set Layers to Collision, Ctrl+V: Collision is greyed with the dashed
  warning border, visibly different from a greyed button the author did not pick.
  The same before Ctrl+V, with the unaligned selection standing.
