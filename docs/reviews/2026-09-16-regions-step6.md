# Regions step 6 (EDITOR spec): the facet, the list, the bindings rows, the badges

2026-09-16, branch `regions-step6` off master `9c06b72d`.

⚠ **STEP 6 OF THE EDITOR SPEC** — the empyrean document
`empyrean docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`, read
at `origin/main` through git objects, never through a sibling path. **Not** part 2's
step 6: the two specs number their steps independently and the collisions are
live. Every step number in this document is the editor spec's.

Its §7 row 6, verbatim:

> | 6 | aurora | the Regions facet with the list, bindings rows and badges (§3.4), no painting yet: regions are created from the migration or by typing rect numbers | panel snapshot: badge text differs per row; facet gating test | M |

Step 5 landed first (`docs/reviews/2026-09-16-regions-step5.md`, master
`b70ec81b`) and step 4 before it (`docs/reviews/2026-09-16-regions-codec.md`).
Nothing here re-derives either.

---

## 1. The headline: §3.4 is the section that draws this panel, and it carries no supersession banner

The owner's Q1 ruling of 2026-09-14T14:54:34Z ("Yeah probablyy go with how we
think about it" = **A, cut right away**) replaced painter's order with a set of
**disjoint** regions. The spec carries supersession banners on §2.3, §2.5, §3.2
and §5.2. **It does not carry one on §3.4** — and §3.4 is the mock and the prose
this parcel builds from. Three of its sentences have no referent in the document
this panel edits. Each is answered in the module header of
`src/renderer/providers/regions-aeon.ts` rather than quietly dropped.

### 1.1 "top to bottom in painter's order with the topmost entry first"

There is no painter's order. `src/core/editing/region-geometry.ts`'s own header,
landed at step 5, says it in as many words: *"There is NO painter's order here,
no layering, no z-index … list order carries no meaning."*

**`regionListRows` preserves DOCUMENT ORDER, 1:1 with `regions[]`, and sorts
nothing.** A sort would invent a mapping between list index and document index
that step 8's editing would then have to maintain, in service of an order the
ruling deleted. The row proving this uses a fixture whose x-order **differs**
from its document order, so "preserved" is distinguishable from "happened to
agree".

### 1.2 "the act `defaults` as a fixed bottom row labelled 'act'"

There is no `defaults` object. The landed contract is `{schema, act, regions[]}`
(`src/core/formats/regions/aurora-regions.schema.json`; the §2.3 banner says the
JSON sketch above it is not the document shape).

**The act ROW survives anyway, and it is not a fossil.** Three of the four
bindings are genuinely nullable and a null genuinely resolves act-side:

| binding | where the act's value lives | shown as |
|---|---|---|
| `scene` | `Act.sceneRef` (project.json's act entry) | the id, or `default` |
| `raster` | **nothing at all** — there is no act-level `rasterRef` in this repo | `none` |
| `bg` | the act's own background, the `@act` sentinel | `@act` |
| `preset` | **there is none, in the document or in the engine** | — |

`preset` is `required` and non-null per region in the schema, and §2.3's own
reason for making it required is that the engine has no act-level preset. So the
act row is read-only and not selectable — there is nothing there to edit — and
`preset` gets a **third** badge kind rather than being called "explicit".

### 1.3 "a listed region entirely covered by later ones is marked 'hidden'"

**Impossible under the ruling.** Regions are disjoint, so no region is ever
covered and nothing can be hidden.

The hazard the mark existed for — §3.4's *"so a region that paints nothing is
never a mystery"* — has a different shape now, and it is one the ruling
**created**: overlap is no longer legal layering but a rule violation a
hand-edited file can carry, and where two regions share a pixel the engine's
answer depends on its own scan order. So the list mark is
**`overlaps <other id>`**, derived from `disjointness`, symmetric (each row names
the other, because a one-directional mark leaves the author staring at a
clean-looking row that is half the problem).

> ⚠ **THIS IS A SUBSTITUTION, NOT A TRANSCRIPTION, AND IT IS THE OWNER'S TO
> OVERTURN.** The alternative readings are (a) drop the mark entirely, since the
> state it described cannot occur, or (b) keep a mark for a different degenerate
> case. I chose the successor hazard because §3.4's stated purpose — a region
> that paints nothing must not be a mystery — is still live under the new model,
> just for a different reason. One word reverses it.

---

## 2. What is on screen

`src/renderer/workspace/facets/regions-facet.tsx` (a `mapFacet`, the map viewport
unchanged), `src/renderer/components/regions/RegionsPanel.tsx`,
`src/renderer/providers/regions-aeon.ts` (every sentence on screen, derived).

* **The list**, document order, each row two lines: name/id/size, then the
  background it resolves to **in words**. An `act` row fixed at the bottom.
* **The four bindings rows** for the selected region, in §3.4's order, with a
  rect editor above them (four numbers — the only editing gesture step 6 has,
  and the one §7 row 6 names).
* **The status line**: §2.5 live.

### 2.1 The badges, and which half of §3.4 is normative

§3.4's **prose** puts the resolved value inside the badge
(*"inherited (act: X)"*); its **ASCII mock** puts it inside the select and leaves
the badge as a bare `inherited`. The prose is followed, because §7 row 6's gate
is *"badge text differs per row"* and **only the prose form discriminates** — four
bare `inherited`/`explicit` badges would collapse to two strings and the gate
would be satisfied by nothing. The select keeps this app's existing vocabulary
("Act default", from `sceneRefOptions`).

Measured on screen, on a wholly-inherited region:

```
preset   explicit (required)
scene    inherited (act: default)
raster   inherited (act: none)
bg       inherited (act: @act)
```

**`explicit (required)` is a wording proposal, not a ruling.** The fact it states
is not negotiable (this binding can never be inherited, so no revert control
appears on it); the words are overturnable.

### 2.2 The background label: ALWAYS, and its warning arm

Per empyrean `docs/superpowers/notes/2026-09-16-region-background-label-ruling.md`
(verdict: **ALWAYS**). `regionBgLabel` is that sentence's **one** derivation, with
the ruling's three arms:

| case | line | tone |
|---|---|---|
| a BG-library entry | `bg <entry.name>` — the **name**, not the id | normal |
| `@act`, or a null inheriting a `@act` act default | `bg act` | normal |
| an id the BG library does not hold | `bg MISSING <id>` | **warning** |

**The warning arm exists regardless of how many backgrounds the act has**, which
is the point the ruling makes in its reasons 3 and 5: a dangling id is reachable
in a one-background act (a hand-edit, a rename, a partial checkout), so the
CONDITIONAL design it rejected would have been three states rather than two. It
follows `SectionGridNav.tsx:158-165`'s precedent, where the dot and its tooltip
say **which** of two states a section is in rather than relying on absence.

The spelling `bg MISSING <id>` is the ruling's own, not a fresh wording call.

**Today's all-shared launch state is the case the ruling is about, and it is
asserted as such:** every row says `bg act`, identically, and the CDP row asserts
**presence and content**, never that rows differ from one another. Under the
rejected design every one of those lines would be absent.

> **STEP 8 INHERITS THIS, AND SHOULD NOT RE-DECIDE IT.** The ruling's subject is
> the **map** label, which is out of step 6's scope. `regionBgLabel` is the
> function the overlay should call; the list row is merely its first reader. The
> ruling also fixes: the name goes on the label, the hue never changes meaning,
> and there is no colour-by mode.

### 2.3 The status line, and what it will not pretend to know

| row id | what it says |
|---|---|
| `binding-N` | §2.5 rules 2 and 3, **through `regionsValidationNotices`** — the load's own function, so the panel and the load cannot disagree about one document |
| `overlap` | rule violation under Q1; **the only place two regions still make one rectangle** |
| `unassigned` | coverage; `ok` when the act tiles exactly |
| `sidecars` | rule 5: "N sidecars still carry refs: migrate" |
| `min-span` | **rule 4: NOT CHECKED** |

**Coverage and non-overlap are here because the step-5 landing put them here.**
That landing note ruled them out of load-time notices — under Q1 an UNASSIGNED
area is a first-class editing state, not a malformed document, and an error toast
on every open would make an ordinary half-finished act shout at its author — and
named §3.4's status line as where they belong. This is that surface.

#### Rule 4 is `unmeasurable`, and that is a refusal, not an omission

The 32 px minimum span and the reachable-edge family need `REGION_MIN_SPAN` and
`CENTRE_{X,Y}_{MIN,MAX}` from aeon's act descriptor. **Aurora does not read an
act descriptor**, and `region-geometry.ts`'s header forbids a default in as many
words: *"a value typed into this file would be a second home for a number aeon
owns."* Typing `32` here to turn the row green would be a number with no source
quietly producing verdicts. The row therefore renders in its own register — not
`ok`, not `warning` — and names the constants it is missing.

> ⚠ **AND §3.4's OWN SENTENCE FOR THIS ROW IS SUPERSEDED TOO.** *"A piece below
> 32 px names the TWO REGIONS that make it"* is a **flattening** sentence: under
> painter's order a sliver was the gap between two rectangles, neither region's
> own. Under a disjoint set a piece **is** one region's rectangle, so when this
> row can run it will name **one**. The two-region sentence survives in the
> `overlap` row.

### 2.4 Three states, three screens

`ActRegionsState`'s `none` / `open` / `refused` stay distinguishable on screen,
and **`unreadable` is read before `document`**: a refused file leaves `document`
null, so testing the document first would report the refusal as "no regions" —
the collapse `ActRegionsState` exists to prevent, arriving from the surface
instead of from the save. The refused screen names the file and the codec's
reason and says nothing is editable.

---

## 3. Decisions worth reading

**No `region` ToolId.** §3.1 calls the facet the disambiguator for a drag that
means marquee in Map and collision brush in Collision. The region rectangle is
step 8, so `FACET_TOOLS.regions = ['view']`. Adding a tool id now would be a
vocabulary entry no canvas answers — precisely what `TOOL_IDS`' own `eraser` note
records as a promise nothing keeps, and `eraser` was **deleted** for it rather
than implemented. An EMPTY list is the other wrong answer: `toolForFacet` returns
the CURRENT tool for an empty set, so arriving from Collision would leave
`paint-collision` armed over a canvas with no dock to disarm it from.

**`selectedRegionId` is BY ID and lives in `editorStore`.** An index survives
nothing: step 7's migration rewrites `regions[]` whole, step 8's carve can delete
the region under the cursor, and an undo restores a document whose positions
moved — the panel would then show one region's bindings under another's name and
an edit would land on the wrong row. An id that no longer exists resolves to
"nothing selected", a visible state. It is in the store because §3.4 says
selecting a row selects it ON THE MAP: the canvas is the sibling it exists for,
and the state is put in the right place now rather than moved out of a component
later.

**One vocabulary builder, two readers.** §2.5 rule 3's seven fields were built
inline in `src/core/project/aeon/load.ts`. Step 6 gave that question a second
reader, so the mapping **moved** to `src/core/formats/regions/vocabulary.ts`
rather than being copied — two mappings of the same four libraries is how a panel
and a load come to disagree about one document, which is the failure
`validate.ts` already refuses inside itself. `documentIdFromPath` moved with it,
carrying its booked limit (it is the inverse of `effectsScenePath` by
transcription, not construction).

**The `bg layout` picker ships DISABLED with its reason on it** (§2.3 rule 6,
step 11). The generator refuses any value other than `@act`/null while the engine
has no consumer, so an enabled picker would author values the build rejects.
Hidden was the other option and it is wrong for the background ruling's own
reason 1: a control that is absent reads as "not built".

**The preset picker is DISABLED when the library is unreadable, not emptied.**
`presetRecords: null` means Aurora could not read `<zone>_effects.emp`, which is
not an empty vocabulary; an empty list would silently let the author clear a
binding aeon declares.

---

## 4. Verification

### 4.1 The node suite

Foreground, `VITEST_MAX_WORKERS=4`:

```
Test Files  632 passed | 3 skipped (635)
     Tests  9905 passed | 9 skipped (9914)
```

Zero failures. `npx tsc --noEmit` exit 0. New rows this parcel: 33 in
`test/renderer/regions-panel.test.ts`.

**Three transcribed vocabularies went red and were updated deliberately**, each
with a comment saying it is a vocabulary and not a fixture:
`src/core/project/__tests__/adapter-contract.test.ts`,
`src/core/project/aeon/__tests__/aeon-adapter.test.ts`,
`src/core/shell/__tests__/facets.test.ts` ("the seven built-in facets" → eight).
Two more gates caught real mistakes rather than transcriptions:
`panel-columns.test.ts` (the census `owner` must be the file the `<Panel scroll>`
call site is in, i.e. the panel, not the facet module) and
`panel-scrollers.test.ts` (a `variant="list"` section must supply the scroller
that variant promises — without it, content sized by the DATA sits in a box sized
by the COLUMN and draws over the sections beneath, the 954px overhang that test
was written for).

### 4.2 The CDP harness

`scratchpad/regions-facet-harness.mjs`, registered as `npm run harness:regions-facet`.
**50 rows, 50 passed, 0 failed, 0 unmeasurable**, driving the real app under
Xvfb+CDP against **this worktree's own build**:

```
root: /home/volence/sonic_hacks/aurora-wt/regions-step6
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora-wt/regions-step6
```

It covers: the facet pill and column for aeon and their absence for classic; the
tool disambiguator in both directions; the list and the act row; the background
label including its warning arm; the four badges; detach-on-edit and revert; the
status line including rule 4's NOT CHECKED and a punched hole.

**Both of §7 row 6's gates are absence-shaped and are kept non-vacuous:**

* *"badge text differs per row"* passes on an empty list — four distinct strings
  out of zero nodes is `new Set([]).size === 0`. `[5a]` asserts that vacuous
  state exists and is empty; `[3c]` asserts the model holds two regions; `[5d]`
  pins the badge count at **exactly 4** rather than bounding it below; `[5h]`
  pins the shape (one `required`, three `inherited (act: X)`) so "distinct"
  cannot be four meaningless strings.
* *"the facet does not appear for classic"* is what a failed open, a blank window
  and a crashed renderer all produce. `[8a]` asserts classic's OTHER pills are on
  screen in the same breath, and the run reports UNMEASURABLE — loudly, never 0,
  never green — if no classic checkout is present.

**The aim is on TEXT, which is what the property is about.** `[5f]` reads
`textContent`. The boxes are read too, but only as a separate claim on `[5g]` —
a `display: none` badge has zero client rects and must not count as rendered
text. Neither row can stand in for the other, and **C3 below proves they
measure different quantities**.

**`[2a]` went red on its first draft for the right reason, and the correction is
kept in the file.** It asserted "a facet switch ARMS the facet default". It does
not: `toolForFacet` **keeps** the current tool when the target facet allows it,
and collision's set is `['paint-collision', 'view']`, so arriving there from
`view` correctly stays on `view` — the default is a fallback, not a force. The
brush is now armed through its own dock button, the gesture an author makes, and
the claim is the one §3.1 is about: the facet takes it away again. Without that
arming row, "view is armed on Regions" is equally true of a facet system that
arms `view` everywhere.

**Nothing the app owns is typed in the harness.** `FACET_TOOLS.regions/collision/layout`
are parsed out of `src/renderer/workspace/facet-tools.ts` and the parse **throws
"CANNOT MEASURE"** rather than falling back. The fixture's rectangles are built
from the act's own grid, read off the running app. The warning-tone row compares
two rows **on screen** rather than a retyped colour token.

### 4.3 The red-first log

Baseline for every mutation is the **committed** tree; `git status --porcelain`
was empty before each mutation and after each restore, and every mutation is
shown by `git diff -U0` **naming the file and quoting the changed line before the
red run**.

#### Node suite (`test/renderer/regions-panel.test.ts`, 33 rows)

| # | mutation, applied on disk | subject | result |
|---|---|---|---|
| M1 | `regionListRows` sorts by `rect.x` | document order | **RED**, 1 failed / 32 passed |
| M2 | `regionBgLabel`'s dangling arm returns `{text: 'act', missing: false}` | the ruling's warning arm | **RED**, 1 / 32 |
| M3 | the preset badge collapses to `'explicit'` | the §7 row 6 gate | **RED**, 1 / 32 |
| M4 | rule 4's row is `tone: 'ok'` | loud-on-unmeasurable | **RED**, 1 / 32 |
| M5 | `coverage(...)` spread with `unassigned: []` (the instrument stubbed dead) | the coverage row's vacuity | **RED**, 1 / 32 |
| M6 | `preset` gets `canRevert: true` | the required row | **RED**, 2 / 31 |
| M7 | the overlap mark drops its `indexB` half | symmetry | **RED**, 2 / 31 |

M5 is the seam review's own named vacuity: a stubbed `uncoveredRects` returning
`[]` leaves a coverage row GREEN, because `[]` is what a correct document and a
dead instrument both produce.

#### CDP harness (a full `VITE_AURORA_DEBUG=1` rebuild per mutation)

| # | mutation, applied on disk | node suite on the mutated tree | harness |
|---|---|---|---|
| C1 | `RegionsPanel` renders the literal `explicit` for **every** badge | **33/33 GREEN** | **RED**: `[5f] [5h] [6e] [6g]`, 46/50 |
| C2 | `regionsFacet` removed from `registerAeonFacetModules` (granted, not registered) | **59/59 GREEN** | **RED**: `[1b] [1e] [3e] [4a]` |
| C3 | the `MISSING` line keeps its TEXT but loses the warning tone | **33/33 GREEN** | **RED**: `[4h]` only, 49/50 |

**Two of the three left the node suite fully green, which is the measurement of
what the node suite cannot see.** C1 and C2 are defects a 9,900-row suite cannot
express at all.

**C3 is the sharpest, and it is the answer to "is the guard measuring the
quantity the property is about".** `[4g]` (the TEXT) stayed **green** while
`[4h]` (the TONE) went **red**. The two rows are therefore demonstrably not
redundant and neither stands in for the other.

**C2 also showed which rows are load-bearing and which are not.** `[1d]`
(*"switching to regions lands on regions"*) stayed green under C2, because
`setFacet` writes the workspace store whether or not a module is registered.
`[1b]` (the pill) and `[1e]` (the column) are the rows that actually see the
registration. Recorded so nobody reads `[1d]` as the gating row.

---

## 5. Two environment findings, neither caused by this branch

> ⚠ **FINDING 1 IS CLOSED, AND IT WAS ALREADY CLOSED WHEN THIS PACKET WAS
> WRITTEN — added by the overseer at the landing, 2026-09-16.** The agent's
> measurement was CORRECT AT ITS BASE and stale by the time it reported, because
> master moved underneath it: repair (b), the EXEMPT row, landed at `058bf11b`
> while this branch was in flight. The exemption is keyed on the citing document
> and the token, so it holds whether or not the file is on disk, and
> `node scripts/check-doc-citations.mjs` on the merged tree exits **0** — measured,
> not reasoned. **Nothing about the agent's report was wrong**: it reproduced at
> `9c06b72d` in a clean detached worktree, said so, and refused to route around a
> decision it judged was not its own. That refusal was right and is the reason this
> correction is an amendment rather than a criticism.
>
> **The general shape, which is the part worth keeping:** a long-running agent's
> environment findings are measurements of a BASE, and a base is a moving target
> when the controller is landing work in parallel. **Re-measure an inherited
> blocker on the MERGED tree before acting on it** — the agent cannot, because the
> merge has not happened yet from where it sits.

**1. `npm test` CANNOT go green from any linked worktree, and it is inherited.**
`node scripts/check-doc-citations.mjs` fails on
`docs/reviews/2026-09-16-regions-step5.md:350`, which cites the board file
`lane-status.json` under this repo's `docs/`.
That file **exists in the main checkout as an UNTRACKED file** and therefore does
not exist in a linked worktree at all. **Reproduced at my BASE commit `9c06b72d`
in a clean detached worktree with none of this branch's work**, and the same gate
passes in the main checkout. So a gate is green for whoever has the untracked
file and red for every worktree lane.

> **BLOCKED, not routed around.** The two repairs are (a) track that
> `lane-status.json` or (b) add an EXEMPT row to the gate for another lane's
> landing note. Both are somebody else's decision about somebody else's file, and
> a lane board may be deliberately untracked. Flagged rather than fixed. **Every
> other gate and `tsc --noEmit` were run individually and are green** (see 5.3).

**2. Two dash gates and one harness-registration gate caught this parcel**, which
is them working: `check-tsx-dashes` (two em dashes in user-facing panel text —
repaired to a colon and to brackets), `check-test-dashes` (nine in test names —
each repaired by reading the sentence, not by blind substitution), and
`check-harness-guards` **G6: a tracked harness no `package.json` script can reach
is invisible — nobody can run it by name, so nothing sweeps it and a red row in
it is unseen.** `"harness:regions-facet"` is registered.

### 5.3 Gate-by-gate, run individually in this worktree

`check-test-collection` 0 · `check-pseudo-skip` 0 · `check-peer-path-literals` 0 ·
`check-cited-paths` 0 · **`check-doc-citations` 1 (INHERITED, see above)** ·
`check-object-stringify` 0 · `check-tsx-dashes` 0 · `check-src-dashes` 0 ·
`check-test-dashes` 0 · `check-guide-text` 0 · `check-prose-constants` 0 ·
`check-scripts-dashes` 0 · `check-ledger-timestamps` 0 · `check-python-resolver` 0 ·
`check-harness-guards` 0 · `typecheck` 0 · `vitest run` 0.

---

## 6. What is left open

* **No emulator, no ROM.** None was run and none was wanted. Electron under CDP
  was, and is above.
* **Rule 4 stays BLOCKED on a parcel, not on effort** — "Aurora reads an act
  descriptor", booked at the step-5 landing. Step 6 surfaces the gap loudly
  instead of closing it.
* **No creation and no deletion of regions.** §7 row 6 says regions arrive "from
  the migration or by typing rect numbers". The rect NUMBERS are editable; there
  is no `[+ New]` and no `[Delete]`, because creating a region needs an id and a
  preset and that is step 7's migration or step 8's marquee. The mock's
  `[Migrate sections]`, `[Rename]`, `[Carve]` and `[Fit to 16]` are likewise not
  built.
* **The map half of selection is step 8.** `editorStore.selectedRegionId` is
  written and is correct; nothing draws it.
* **Step 8 inherits the background-label ruling** through `regionBgLabel` —
  including its warning arm — and should not re-derive it. See §2.2.
* **The `overlaps` mark is my substitution for §3.4's "hidden"** and is the
  owner's to overturn. See §1.3.
* **`explicit (required)` is a wording proposal.** The fact is fixed; the words
  are not.
* **One act, one document.** `ojz_act1` is still the only act any of this has
  been seen on, and there is no `regions.json` on disk anywhere — the CDP fixture
  is injected through the real codec and the real command, and touches no disk in
  either direction.
* **The refused screen has never been seen.** `__dbg.aeon.setRegions` cannot
  produce `unreadable` (it deliberately touches no disk), so the `refused` arm of
  the panel is under a node row and under `tsc`, and has not been on screen. It
  would need a real `regions.json` in a checkout, which is step 7's territory.
