# paste-status-bar-and-art-only: the status bar says what a paste click does, and no line offers a paste of nothing

Branch `parcel/paste-status-bar-and-art-only`, from master `8fb17e10`.
Commits (from `git log`):

| commit | purpose |
|---|---|
| `4ce3d64a` | PASTE-STATUS-BAR-HINT rows, red on base `8fb17e10` |
| `846fcaf2` | the status bar takes its paste line from the armed offer |
| `99dd025c` | PASTE-SAME-ZONE-ART-ONLY-SHIFT rows (plus the deliberate edits to HC1 and HO1), red on `846fcaf2` |
| `5292b5bb` | a paste line never offers a gesture that writes nothing |

Code tip `5292b5bb`. This packet follows it, together with a one-line pointer
to it in the new test file's header.

Both rows are the open items O-1 and O-2 of
`docs/reviews/2026-09-12-paste-hint-and-chosen.md`.

---

## Verdict: BUILT, both. Nothing BLOCKED.

While pasting in aeon, the status bar under the map now says the same gestures
as the Paste panel's hint, taken from the same string, so the two cannot
disagree. In another zone it no longer offers a plain click (Layers on Both or
Art) or Alt+click, which the commit click refuses there. In the zone an
art-only copy was made in, neither line offers Shift+click (nor, with Layers on
Collision, a plain click) as a paste: both name those as pasting nothing. With
a clipboard that carries collision, at home, the panel's line is `PASTE_HINT`
byte for byte.

One suite failure at the tip, outside this parcel and measured as such (section
5): aeon's origin/master moved a sidecar Aurora vendors.

---

## 1. Where paste-gesture text is said: every surface, with a verdict

Enumerated by what renders text about a paste click, not by where the rule
lives. `grep` for `MapStatusPort`/`statusLabel`/`statusContext` producers, for
`pasting` in `src/renderer`, and for the gesture words (`Alt+click`,
`Shift+click`, `hold Alt`, `Alt: art`, `collision only`) outside tests.

| # | surface | verdict |
|---|---|---|
| 1 | aeon's status bar port, `useAeonMapStatusPort` (`src/renderer/providers/map-status-aeon.ts`). It is the bar under all five aeon map facets: `mapFacet`'s default `StatusBar` (`src/renderer/workspace/facet-registry.ts`). | **FIXED** (row 1). In the Collision, Objects, Rings and Palette facets the Paste panel is not mounted (it mounts in Layout only), so there the bar was the only paste hint on screen, and it was the wrong one. |
| 2 | the same port with the **stamp tool** armed and a paste pending. Found while enumerating; not in the brief. | **FIXED**. The port passed the stamp's `contextInfo`, so the bar read "Chunk: grass · Alt: art only" while a click pastes, and in another zone Alt+click is refused. Pasting now beats the stamp's line, as it already beat the tool label. |
| 3 | the neutral model's own paste hint, `statusLabel` (`src/renderer/components/shared/map-status-model.ts`), the fallback for any port that says nothing | **FIXED**: it names no gesture now, only `PASTE_ESC` ("Esc to stop"), true anywhere. It cannot see where the author is. |
| 4 | classic's port, `useClassicMapStatusPort` (`src/renderer/providers/map-status-classic.ts`) | **NOT REACHABLE**. It sets `ownHintLine: true`, so `statusContext` shows no hint at all, the paste hint included (a landed row in `map-status-model.test.ts` holds that). And classic has no map paste: `setPasting(true)` has one production caller, aeon's MapViewport Ctrl+V. The label "Paste" names no gesture. |
| 5 | any other `MapStatusPort` producer | none exists (aeon and classic only). `ArtStatusBar` is a different bar and reads no `pasting`. |
| 6 | the Paste panel's hint line (`MarqueePasteOptions.tsx`, `offer?.hint ?? PASTE_HINT`) | **FIXED** (row 2). Row 1 moved its store reads into a shared hook without changing what it shows. |
| 7 | the panel's notice (`COLLISION_ONLY_HERE`, `stickyRefusedHere`) | left: true as landed. `COLLISION_ONLY_HERE` offers only Shift+click, and it is shown only where Shift+click lands (another zone, a clipboard with collision). |
| 8 | the Ctrl+V arming toast (`COLLISION_ONLY_HERE`, MapViewport) | left: same string, same place, same truth. |
| 9 | the click's "This clipboard carries no collision" toast | left: true. Row 2's wording defers to it rather than restating it. |
| 10 | the Layers buttons' titles | left: a refused choice shows the notice, an art-only Collision the no-collision title. |
| 11 | `TOOL_HINTS.marquee` ("... Ctrl+V paste ...", `workspace/tool-meta.ts`) | left: not shown while pasting (`statusLabel` overrides it), and says nothing about a click. |
| 12 | the Art composer's Ctrl+V (`ComposerCanvas.tsx`) | out of scope: a different paste with its own gestures, not the map's commit click. |
| 13 | the docblock above `MarqueePasteOptions` ("per-click with Alt (art)/Shift (collision)") | a code comment, never on screen. |

---

## 2. PASTE-STATUS-BAR-HINT

**The defect.** While pasting in aeon the bar under the map showed
`statusLabel`'s paste line, "Click to paste · Alt: art only · Shift: collision
only · Esc to stop", in every zone. In another zone the commit click refuses a
plain click with Layers on Both or Art, and Alt+click. The panel's hint stopped
saying otherwise last night; the bar did not.

**The cause.** A second statement of the gesture rule, in a place that cannot
know the answer. The neutral model restated the modifier mapping in its own
words and could not see the zone. Aeon's port passed no `contextInfo` while
pasting (except, wrongly, the stamp's), so the neutral line was what painted.

**What changed.**

- `src/core/editing/map-clipboard.ts`. The part of the hint that depends on where
  the author is, `pasteGestureLine` (last night's `pasteHintLine`, which now
  returns the gesture segments without the tail), is built once. From it:
  `PasteLayerOffer.hint` is those segments, then the flip keys and Esc (the
  panel's line, unchanged); the new `PasteLayerOffer.statusHint` is those
  segments, then Esc. `PASTE_HINT` is rebuilt from named pieces and is byte for
  byte what it was (row A3 and HC1 hold it). `PASTE_ESC` is exported.
- `src/renderer/components/armed-paste-offer.ts` (new): `useArmedPasteOffer()`,
  the five store reads behind the offer (pasting, armed clipboard, Layers, open
  tile set, open project), asked through `pasteFit` exactly as the commit click
  asks them. The panel's offer expression and its two subscriptions that fed only
  it (project, open tile set) moved here; the panel keeps its own subscriptions
  for everything else it shows. The panel and the bar now share these reads.
- `src/renderer/providers/map-status-aeon.ts`: while pasting, `contextInfo` is
  `pasteOffer?.statusHint`. Pasting beats the stamp's line.
- `src/renderer/components/shared/map-status-model.ts`: `statusLabel`'s paste
  hint is `PASTE_ESC`; the `contextInfo` and `statusContext` docs say who
  supplies the paste line.
- `src/renderer/components/MarqueePasteOptions.tsx`: `const offer =
  useArmedPasteOffer();` in place of its own five reads. What it shows is
  unchanged.

**The seam, and why this one.** The packet suggested the aeon port passing
`contextInfo` from `pasteLayerOffer(...).hint`. Taken, with two refinements the
tree argued for:

1. **The reads are shared, not restated.** The port computing
   `pasteLayerOffer(clipboard, pasteFit(clipboard, openTileset, project),
   pasteLayers)` itself would be the same five store reads written twice: two
   surfaces each deciding which tile set counts, the same kind of second
   statement last night's parcel removed from the hint. One hook, called by both.
2. **`statusHint`, not `hint`.** See section 4.

A new port field was the alternative, e.g. a required `pasteHint`. It would
force every port to state a paste line, but classic has no map paste and would
state an empty one. `contextInfo` is already documented as "engine-specific
context", and what a paste click does is exactly that: it depends on aeon's one
tile set per zone.

## 3. PASTE-SAME-ZONE-ART-ONLY-SHIFT

**The defect.** In the zone the copy was made in, over an art-only clipboard,
both lines offered Shift+click (and with Layers on Collision a plain click).
Those write nothing: the click toasts "This clipboard carries no collision".

**The cause.** `pasteGestureLine` returned the landed line wherever every
CHOICE's verdict was null. A gesture can go unrefused and still have nothing to
write: `pasteRefusal` of null layers is null by contract. At home an art-only
copy has every verdict null and a Shift+click that writes nothing.

**What changed** (`src/core/editing/map-clipboard.ts`, `pasteGestureLine`). Each
gesture is sorted three ways by the click's own two checks, in its order:
refused, nothing to write, lands. The landed line is kept only where every
GESTURE lands. The gestures with nothing to write get one segment after the
landing ones, "... pastes nothing". They are never offered and never called
refused, because the click does not refuse them. Where nothing at all lands the
line is "Nothing can be pasted here", as before.

**The row that pinned this line.** The brief calls it "HC1", a name from last
night's packet table; `HC1` appears nowhere in the tree. Found by content: the
CONTROL row "in the zone the copy was made in, the hint is the one the panel
always carried" in `paste-hint-and-chosen.test.ts`, which looped over both
clipboard kinds. **A second pin the packet did not name:** HO1's
first branch ("every refusal null: the landed line") held the same line over
every fit. Deliberate edits, both in `99dd025c`:

- HC1 now covers a clipboard that carries collision; its art-only half moved to
  the new rows, which assert the opposite.
- HO1 keys on "every GESTURE lands", and splits what does not land into refused
  (named "refused") and nothing to write (named as pasting nothing). Its reader
  gained that third class.

The status bar picked this up with no change of its own: `statusHint` is built
from the same gesture string.

## 4. Wording: what each line says, and why

**The status bar** shows `offer.statusHint`: the panel's gesture segments, then
"Esc to stop", without the flip keys.

- **Agreement by construction.** The bar and the panel are one string of
  gestures, so they cannot disagree about which gestures work. Row B1 holds the
  construction over 24 offers; rows S1, S2 and A2 hold what it says against the
  click.
- **No new vocabulary.** Every word is the landed line's. The bar's old compact
  words ("Alt: art only · Shift: collision only") are not reused: they were a
  second statement of the gesture mapping, the thing this parcel removes.
- **Why no flip keys.** The bar's paste line never carried them, and the bar is
  one 24px row the width of the shell (`StatusBar`, `EditorShell`), shared with
  the tool label, plane, zone, section, zoom and Aether badge, with no overflow
  handling. The flips are true everywhere, so dropping them loses nothing the
  author needs to get right. The panel keeps them.
- **The cost, measured** (character counts of the generated lines): the old bar
  line was 68. The bar's home line is 78, and its longest (another zone, Layers
  Both or Art) is 96. Whether 96 fits is a foreground question (F-1).

**Row 2's segment** is "Shift+click pastes nothing" / "a plain click and
Shift+click paste nothing". "Paste" is the verb the line already uses ("to paste
art only"). It carries no reason, like the "refused here" segments: in the
panel the art-only warning sits directly above it ("Clipboard is art only: ..."),
and the click's toast says the rest. The segment **names** the gestures rather
than omitting them, following the other-zone lines, which name every gesture
that does not land. Omitting them is the other choice the brief allowed. Plant
Q9 shows which rows hold this choice (A1, A2, HO1), should the owner prefer
omission.

## 5. The lines, printed

Printed by a scratch run of `pasteLayerOffer` over the fit each place gives, not
typed. The panel renders `hint`; the bar renders `statusHint` (rows S1, S2, A1
and A2 read both off the rendered surfaces over the real stores).

| clipboard | where | Layers | panel hint (`offer.hint`) | status bar (`offer.statusHint`) |
|---|---|---|---|---|
| with collision | home | both | Click to paste · hold Alt for art only, Shift for collision only · X flips it left↔right, Y top↕bottom · Esc to stop | Click to paste · hold Alt for art only, Shift for collision only · Esc to stop |
| with collision | home | art | Click to paste · hold Alt for art only, Shift for collision only · X flips it left↔right, Y top↕bottom · Esc to stop | Click to paste · hold Alt for art only, Shift for collision only · Esc to stop |
| with collision | home | collision | Click to paste · hold Alt for art only, Shift for collision only · X flips it left↔right, Y top↕bottom · Esc to stop | Click to paste · hold Alt for art only, Shift for collision only · Esc to stop |
| with collision | another zone | both | Shift+click to paste collision only · a plain click and Alt+click are refused here · X flips it left↔right, Y top↕bottom · Esc to stop | Shift+click to paste collision only · a plain click and Alt+click are refused here · Esc to stop |
| with collision | another zone | art | Shift+click to paste collision only · a plain click and Alt+click are refused here · X flips it left↔right, Y top↕bottom · Esc to stop | Shift+click to paste collision only · a plain click and Alt+click are refused here · Esc to stop |
| with collision | another zone | collision | Click or Shift+click to paste collision only · Alt+click is refused here · X flips it left↔right, Y top↕bottom · Esc to stop | Click or Shift+click to paste collision only · Alt+click is refused here · Esc to stop |
| with collision | another project | both | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| with collision | another project | art | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| with collision | another project | collision | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| art only | home | both | Click or Alt+click to paste art only · Shift+click pastes nothing · X flips it left↔right, Y top↕bottom · Esc to stop | Click or Alt+click to paste art only · Shift+click pastes nothing · Esc to stop |
| art only | home | art | Click or Alt+click to paste art only · Shift+click pastes nothing · X flips it left↔right, Y top↕bottom · Esc to stop | Click or Alt+click to paste art only · Shift+click pastes nothing · Esc to stop |
| art only | home | collision | Alt+click to paste art only · a plain click and Shift+click paste nothing · X flips it left↔right, Y top↕bottom · Esc to stop | Alt+click to paste art only · a plain click and Shift+click paste nothing · Esc to stop |
| art only | another zone | both | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| art only | another zone | art | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| art only | another zone | collision | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| art only | another project | both | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| art only | another project | art | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |
| art only | another project | collision | Nothing can be pasted here · X flips it left↔right, Y top↕bottom · Esc to stop | Nothing can be pasted here · Esc to stop |

The three rows that changed this parcel are the art-only home rows (row 2). On
the bar every row changed (row 1): it read "Click to paste · Alt: art only ·
Shift: collision only · Esc to stop" in all eighteen. As last night, the
"Nothing can be pasted here" states are not reachable through the UI (Ctrl+V is
refused there, and a zone or project change clears `pasting`); the lines cover
them because the click does.

---

## 6. The rows

New file `src/renderer/components/__tests__/paste-status-bar-and-art-only.test.ts`,
8 rows. The bar rows render the REAL aeon bar (`mapFacet(...).StatusBar`, which is
`AeonMapStatusBar`) through `renderHooked` over the real stores, then call the
neutral `MapStatusBar` on the port it was handed (it holds no hook, so calling it
is rendering it) and read the trailing span it paints, behind a five-span
shape guard. The panel rows render the REAL `MarqueePasteOptions`. Every
expectation is the click's own two checks (`verdict`: `pasteRefusal` over
`pasteFit`, then `effectivePasteLayers`) under the modifier mapping, or a
constant (`PASTE_HINT`, `statusLabel`). A line is read segment by segment into
three classes: offered, named refused, named as pasting nothing. The matrix is
clipboard {with collision, art only} x place {home, another zone, another
project} x Layers {Both, Art, Collision}, 18 cells, counted.

| row | claim | on its base | reddened by |
|---|---|---|---|
| S1 | over the matrix the bar offers every gesture that lands and none the click refuses; where something lands it names the refused as refused | **RED** on `8fb17e10`: "with collision, another zone, Layers both: the status bar offers a gesture the click refuses ("Click to paste · Alt: art only · Shift: collision only · Esc to stop"): expected [ 'click', 'alt' ] to deeply equal []" | Q1 Q4 Q5 Q6 Q8 Q10 |
| S2 | the bar and the panel read the same, cell by cell, and what they agree on is the click (non-empty, no refused gesture offered, every landing one offered, 3 or more distinct offered sets) | **RED** on `8fb17e10`: the bar ("Click to paste · Alt: art only · ...") and the panel ("Shift+click to paste collision only · a plain click and Alt+click are refused here · ...") disagree | Q1 Q4 Q5 Q6 Q10 |
| S3 | pasting overrides the armed tool: with every `TOOL_IDS` tool armed, the bar offers exactly what the click lands (every tool read before any assert) | **RED** on `8fb17e10`: every tool read click+alt+shift where the click lands shift only; `stamp-chunk` read "Chunk: grass · Alt: art only" | Q1 Q2 Q4 Q5 Q6 Q10 |
| B1 | `offer.statusHint` is `offer.hint` without the flip segment, over 2 clipboards x 4 fits (the unreachable one included) x 3 settings; no dash | added with the fix | Q4 Q6 |
| B2 | the seam: the port and the panel call `useArmedPasteOffer()`, neither makes the reads, the port passes `statusHint`; the neutral paste hint names no gesture and is `PASTE_ESC` | added with the fix | Q1 Q3 Q11 |
| A1 | home, art only, every setting: both surfaces offer exactly what lands, name the rest as pasting nothing, none as refused (both surfaces read before any assert) | **RED** on `846fcaf2`: both surfaces read click+alt+shift where the click lands click+alt | Q1 Q4 Q5 Q6 Q7 Q8 Q9 |
| A2 | over the matrix, each surface offers exactly what lands, and where something lands names the refused and the nothing-to-write exactly | **RED** on `846fcaf2`: "art only, home, Layers both: the panel offers other than what the click lands (...): expected [ 'click', 'alt', 'shift' ] to deeply equal [ 'click', 'alt' ]" | Q1 Q4 Q5 Q6 Q7 Q8 Q9 Q10 |
| A3 | CONTROL home, with collision, every setting: the panel says `PASTE_HINT` byte for byte, the bar the same without the flip segment | green on `846fcaf2` and after | Q1 Q6 Q11 |

Landed rows edited deliberately: **HC1** and **HO1** in
`paste-hint-and-chosen.test.ts` (section 3). **D3** in `paste-layers-grey-out.test.ts`,
the seam row, asked the PANEL for `pasteFit(clipboard, openTileset, project)` and
`pasteLayerOffer(`. It now asks the hook, holds the panel to calling
`useArmedPasteOffer()`, and keeps its no-second-copy check on both (`846fcaf2`).

Red runs: `4ce3d64a`'s rows on base source, 3 failed of 3, all AssertionError.
`99dd025c`'s rows on `846fcaf2` source, 3 failed | 28 passed (31) over the three
paste files, all AssertionError (A1, A2, and the edited HO1: "home, art only true,
setting both: "Click to paste · hold Alt for art only, ...": expected [ 'click',
'alt', 'shift' ] to deeply equal [ 'click', 'alt' ]").

**Anti-vacuous: for each green row, the other way it could be green, and the
plant that rules it out.**

- **S1.** It could read a span that is not the hint. The five-span guard, and Q1
  (the port reverted) reddens it. It could also be green on a bar that offers
  nothing false because it offers nothing. S1 requires every landing gesture
  offered, and Q6 (the bar falls back to Esc alone) reddens it.
- **S2.** Agreement could come from both being one wrong string. S2 checks the
  agreed read against the click: Q5 (both back to `PASTE_HINT`) and Q10 (both
  wrong through the shared reads) redden it. Both could be empty: the Esc check,
  and Q6 reddens it.
- **S3.** The tool could simply never matter to the bar. Q2 moves only the
  precedence of the stamp's line and reddens S3 alone.
- **B1.** `statusHint` and `hint` could each be hand-built to agree today. Q4
  desyncs one side and reddens it. B1 cannot see a gesture string that is wrong
  for both (by design); S1 and A2 are what hold the truth (Q5).
- **B2.** Its source checks are locks on the seam, not readers. Q1 and Q11 show
  the lock moves with the behaviour. Q3 shows it is the only holder of the
  neutral line, which aeon always overrides, so no render row can see it.
- **A1, A2.** The reader might not see a "pastes nothing" segment: Q9 (the
  segment omitted) reddens both. It might read "refused" and "nothing" alike: Q8
  (nothing-to-write named refused) reddens both.
- **A3.** The bar could be the panel's line: Q11 reddens it.

---

## 7. Plants

A scratch runner outside the repo, never committed, which never runs git. It
makes an exact-anchor replacement, refused unless the anchor occurs once. Before
each plant it checks all five mutable files byte for byte against copies taken
from the clean tree at `5292b5bb` (`git status --porcelain` empty), which is how
the previous restore is proven. It reads the mutated line back from disk and
prints it, then runs six files: the new file, `paste-hint-and-chosen`,
`paste-layers-grey-out`, `map-clipboard`, `map-status-model` and
`map-status-aeon` (87 rows). Then it restores from the copy and re-checks.
`git status --porcelain` was empty after each batch.

**The method was tightened midway, and the whole batch was re-run.** The first
batch had two instrument faults: its parser stripped the failure-class counts,
and Q9's read-back printed nothing, because that mutation rewrites the head of a
line and the read-back matched whole lines. Both were fixed and all eleven
plants re-run. The table is the second batch; its reds are identical, row for
row, to the first's. Every red was ASSERTION; TIMEOUT 0 and UNCLASSIFIED 0 in
every run.

| plant | the mutation on disk | reds |
|---|---|---|
| Q1 | `map-status-aeon.ts:90` `const contextInfo = tool === 'stamp-chunk' ? stampContext(chunkCount, selectedChunkId) : '';` (the port reverted) | 7: S1 S2 S3 B2 A1 A2 A3 |
| Q2 | `map-status-aeon.ts:90` `const contextInfo = tool === 'stamp-chunk' ? stampContext(...) : pasting ? (pasteOffer?.statusHint ?? '') : '';` (precedence only) | 1: S3 |
| Q3 | `map-status-model.ts:82` `if (s.pasting) return { label: 'Paste', hint: 'Click to paste · Alt: art only · Shift: collision only · Esc to stop' };` | 1: B2 |
| Q4 | `map-clipboard.ts:336` `` const statusHint = `${EVERY_GESTURE_LANDS} · ${PASTE_ESC}`; `` (**desync**: the bar's line leaves the gesture string) | 6: S1 S2 S3 B1 A1 A2 |
| Q5 | `map-clipboard.ts:334` `const gestures = EVERY_GESTURE_LANDS;` (**both** surfaces back to the landed line) | 8: H1 H2 HO1 S1 S2 S3 A1 A2 |
| Q6 | `map-clipboard.ts:335` `const hint = ''; const statusHint = '';` (**both** empty; the bar falls back to Esc) | 15: H1 H2 HC1 HC2 HO1 K1 K2 KC S1 S2 S3 B1 A1 A2 A3 |
| Q7 | `map-clipboard.ts:277` `if (PASTE_LAYER_ORDER.every((v) => refusals[v] === null)) return EVERY_GESTURE_LANDS;` (row 2 reverted) | 3: HO1 A1 A2 |
| Q8 | `map-clipboard.ts:273` `if (refusals[layers] !== null \|\| writes === null) refused.push(listed);` (nothing-to-write named refused) | 5: HO1, grey-out C3, S1 A1 A2 |
| Q9 | `map-clipboard.ts:283` `if (false) parts.push(...)` (nothing-to-write omitted, the alternative the brief allowed) | 3: HO1 A1 A2 |
| Q10 | `armed-paste-offer.ts:29` `? pasteLayerOffer(clipboard, pasteFit(clipboard, clipboard.tileset, project), pasteLayers)` (the SHARED reads wrong: both surfaces move together) | 13: H1 H2 K2, grey-out G1 G2 G3 D1 D2 D3, S1 S2 S3 A2 |
| Q11 | `map-status-aeon.ts:91` `? (pasteOffer?.hint ?? '')` (the bar takes the panel's long line) | 2: B2 A3 |

**Why Q6 reddens K1, K2 and KC.** The panel's hint element goes empty, and the
sibling file's `render()` requires exactly one hint line while pasting. That is
its loud-on-unmeasurable guard firing, not those rows' own claims.
**Why Q8 spares S2.** Both surfaces say "Shift+click is refused here" alike, and
no refused gesture is offered, so they agree. S1 is the one that holds "refused
only where the click refuses" on the bar. **Why Q10 spares A1 and A3.** Both are
home cells, where the wrong fit happens to be the right one. **Q2 and Q3 each
redden exactly one row**: the stamp precedence and the neutral line have one
holder each.

---

## 8. Suite

| | Test Files | Tests |
|---|---|---|
| code tip `5292b5bb` | 1 failed \| 610 passed \| 3 skipped (614) | 1 failed \| 9234 passed \| 9 skipped (9244) |

`npm test` exit 1. Every gate before vitest passed, the typecheck included (the
chain reached vitest). The skip reporter says every skip named its reason. The
failure-class reporter: ASSERTION 1, TIMEOUT 0, UNCLASSIFIED 0. The new file is
collected (named in the run) and holds 8 rows. `npx tsc --noEmit` exit 0 at
`846fcaf2` and at `5292b5bb`.

**The one failure is not this parcel's, measured.**
`test/formats/effects-channel-bands-drift.test.ts`, "CURRENCY: is the vendored
channel-bands sidecar still what aeon publishes?": the gate says "NOT AN AURORA
REGRESSION: the vendored aeon channel-bands sidecar is stale", pinned at aeon
`c93abbad`, aeon origin/master now `7a938fbe`. The control: `git rev-parse` of
`src/core/formats/effects/aeon-effects-channel-bands.json` at base `8fb17e10` and
at `HEAD` both give `0af86cdb66efd112ef6d644082a0c6edc3234401`, the very blob the
gate calls stale. This branch's diff (8 files, section 2 and 3) touches neither
the sidecar, its provenance nor the test. The aeon side is read from aeon's git
objects, independent of any Aurora commit. So base fails it identically. No
base full-suite run: the failure's inputs are identical at base by the blob id,
and no delta is claimed against another parcel's totals.

---

## 9. Open

- **O-1. Width** (F-1). The longest bar line is 96 characters, up from 68, on
  one 24px row with no overflow handling. If it wraps or clips at the owner's
  window width, the remedy is a layout or wording call (the bar's geometry, or a
  shorter derived form), which is the owner's. BLOCKED-for-owner only then.
- **O-2. The stale aeon sidecar** (section 8). The gate names the re-vendor
  command. Not this parcel's: it re-vendors a runtime document from aeon.
- **O-3. After the paste ends, the stamp's line returns.** The code path is the
  one that shipped (not pasting, `contextInfo` is the stamp's line), but no row
  renders the bar after Esc with the stamp armed. Tagged F-3.
- **O-4. B2 reads source.** Its checks are locks on the seam; the behaviour is
  held by the render rows.

## 10. Foreground only, tagged, not attempted

No emulator, no CDP. The instrument cannot see paint or width. Needs an aeon
project with two zones (the grey-out packet's 6e).

- **F-1.** Layout facet, marquee, copy a block-aligned region in zone A. Open a
  level of zone B, Ctrl+V, Layers on Both. The bar reads **Paste**, then "Shift+click
  to paste collision only · a plain click and Alt+click are refused here · Esc to
  stop", and the panel hint says the same gestures with the flip keys. Check the
  bar at the owner's usual window size and at 1280 wide: the left half stays on
  its one row, unclipped, and does not push the zoom controls or the Aether badge
  off. Switch Layers to Collision: "Click or Shift+click to paste collision only ·
  Alt+click is refused here · Esc to stop".
- **F-2.** The same from the **Collision** facet (no Paste panel there): Ctrl+V
  in zone B. The bar is the only paste hint on screen and reads as in F-1.
- **F-3.** Stamp tool armed (K), a chunk selected, Ctrl+V in zone B: the bar
  reads the paste line of F-1, not "Chunk: ... · Alt: art only". Press Esc: the
  stamp's line comes back.
- **F-4.** Zone A, marquee on Tile, copy a 3x3-tile selection, Ctrl+V: the panel
  hint reads "Click or Alt+click to paste art only · Shift+click pastes nothing ·
  X flips it left↔right, Y top↕bottom · Esc to stop", and the bar the same
  without the flip keys. With Layers already on Collision (set before the
  unaligned copy; it stays set, marked chosen and unavailable): "Alt+click to
  paste art only · a plain click and Shift+click paste nothing · ...". Shift+click
  still shows the "carries no collision" toast.
- **F-5.** Zone A, a block-aligned copy, Ctrl+V: the panel hint as it always was;
  the bar "Click to paste · hold Alt for art only, Shift for collision only · Esc
  to stop" (it was "Click to paste · Alt: art only · Shift: collision only · Esc
  to stop").
