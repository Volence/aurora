# Regions panel: the overlap mark, the `preset` badge, the `act` row

**2026-09-16. A ruling on the three calls `docs/reviews/2026-09-16-regions-step6.md` left
open, taken under the owner's standing instruction of 2026-09-16T05:2xZ** (empyrean
`docs/OVERSEER.md` at `origin/main`: *"if anything needs decisions just ask a fable agent"*, the
hub's application: the look/taste park is lifted for REGIONS PHASE 2 items only, each call booked
as a ruling and **overturnable by one word from him in the morning**). Aurora read at master
`651ece89`; the spec and the precedent ruling read from empyrean `origin/main` `d96ed6cc` through
git objects. No code was changed; the lane applies what follows. No emulator was used.

## 1. Verdicts

**CALL 1 — KEEP the `overlaps <id>` mark, symmetric, in the warning tone, and give the status
line's overlap row the `ok` arm it is missing.** It is not a substitute for "hidden"; it is the
warning arm of an invariant the panel's own rect editor can break today.

**CALL 2 — KEEP the third badge kind and KEEP the wording `explicit (required)`.** No badge is
the wrong answer; a bare `required` is the second-wrong answer.

**CALL 3 — The `act` row STAYS, is called `act`, and stays read-only; the sentence now in its
tooltip goes into visible text on the row.** Read-only is a correct scoping, not a gap: Aurora
has no writer for any of the three act-side values.

One consequence outside the three calls is flagged in §5 rather than ruled.

## 2. CALL 1: the overlap mark

### Reasons, strongest first

**1. Overlap is reachable today, by the only editing gesture step 6 has.** `RegionsPanel.tsx:304-317`
(`RectFields.set`) clones the document, writes `region.rect = { ...region.rect, [key]: value }`,
and runs a `set-regions` command. Nothing carves. The comment above it says why:
`RegionsPanel.tsx:295` *"The marquee, move, resize and carve are step 8."* So the premise of the
brief's first question ("is this marking a state that should be impossible") does not hold for
the panel as landed: type `w 2064` into forest beside night and the document overlaps. A mark
for a state the author can reach from the panel is not noise.

**2. Even after step 8 the state stays reachable, because the carve maintains the invariant only
for writes that go through it.** Spec §3.2's banner: *"Carve is what EVERY draw over an existing
region does."* A draw, not a load. `validate.ts:36-45` (*"COVERAGE AND NON-OVERLAP ARE NOT
CHECKED HERE … deliberately not load notices"*) and the step-5 ruling
(`docs/reviews/2026-09-16-regions-step5.md:314-322`: *"They belong in the Regions facet's status
line (§3.4, step 6), where the author is looking at the thing being judged"*) together mean a
hand-edited `regions.json` opens with its overlap intact and the panel is the ONLY place it is
ever said. The schema does not check it either (empyrean `AURORA_REGIONS_SCHEMA.md` §6: *"that
regions tile the act without gaps, or how overlaps resolve"* is listed under what the contract
does NOT check). And the build refuses it: `region-geometry.ts:312-315` records that two rows
covering one pixel *"is the exact thing aeon's `region_first_overlap` refuses"*. A state that the
editor cannot prevent, the loader will not refuse, and the build WILL refuse must be visible in
the editor, or the author learns of it from a red build — the failure §2.5's first sentence exists
to prevent (*"an author never learns of a refusal from a red build"*).

**3. The status line row is not enough on its own; the mark on the row is the precedent's own
reason applied.** The overlap status row exists (`regions-aeon.ts:511-522`) and names both ids
and the shared rectangle. The precedent ruling's §3 rejected exactly the argument that a corner
sentence covers a per-thing fact: *"a corner sentence reassures about the act, not about the
forest he is staring at"*. The list row IS the forest he is staring at. Keep both: the status row
carries the geometry, the row mark carries the fault to the row that has it.

**4. Symmetric is right, and the tree has already said why twice.**
`region-geometry.ts:305`: *"Every overlapping pair, not just the first: an author fixing one wants
to see the rest."* `test/renderer/regions-panel.test.ts:144-145`: *"A one-directional mark would
leave the author staring at a clean-looking row that is half the problem."* An overlap has two
owners and either edit fixes it; a mark on one row would tell the author which row to edit, which
is a decision the panel has no basis to make.

**5. The wording `overlaps <id>` stands.** It is the status row's own id (`'overlap'`,
`regions-aeon.ts:516`), the geometry's own finding code (`region-geometry.ts:749`), and aeon's own
name for the refusal (`region_first_overlap`, as cited at `region-geometry.ts:315`). One word for
one fact across four sites. "shares pixels with" says the same thing in more letters and matches
nothing.

**6. The conditional shape is not the precedent's trap, and the one place it IS the trap is the
status line.** The precedent's reason 1 is about a VALUE shown by absence (which background); its
own reason 3 keeps a conditional WARNING arm (`bg MISSING <id>`) and counts it as the design's
third state. The row mark is a warning arm of the same kind: the value being represented is
"this region's identity is a function of the camera centre", and its warning arm is the overlap.
But the panel currently represents the GOOD state of that value by absence: `regions-aeon.ts:512`
pushes the `overlap` row only `if (overlaps.length > 0)`, while coverage (`:539-544`, *"Every
pixel of the act is assigned"*) and sidecars (`:558`, *"sidecars: none carry refs."*) both
have an `ok` arm. The overlap row is the only status row that says nothing when it passes, so a
reader cannot tell "disjoint" from "not checked" — the exact confusion the `unmeasurable` tone
was added to prevent (`:428-432`). **Add the `ok` arm**, on the model of the two beside it
(something of the shape *"No two regions overlap."*). The per-row mark stays conditional, because
the positive statement then exists once, where the other rules' positive statements are.

### The strongest argument against, at full strength

The ruling made non-overlap an invariant the editor ENFORCES (§2.5 banner: *"author-visible rules
the editor ENFORCES"*). A mark for a broken invariant, placed on the primary surface, is the
editor advertising that it does not keep its own promise; the honest shapes are to refuse the
document at load (a hand-edit that breaks the model is a malformed document, like a bad id) or to
make every rect write carve so the state is unreachable, and either way the row mark is dead
weight that every future reader has to reason about. The packet itself calls it a "successor
hazard", and a hazard nobody can trigger is a comment pretending to be a feature.

Why it loses. Load-time refusal was ruled out at step 5 for a reason that applies here too:
under Q1 a half-finished document is an ordinary editing state, and `validate.ts:36-45` names
overlap alongside coverage in that decision. Making every write carve is the right end state and
is flagged in §5, but it is a step-8 question and it does not close the hand-edit path (a file is
not a draw). Until every path into the document goes through the carve, the invariant is a
promise about gestures, not about documents, and a mark that says so on the row is the editor
being accurate about the extent of its promise. When the last path closes, the mark costs one
conditional line and catches a bug in the carve; that is not dead weight.

### What would overturn it

- The owner says the status row alone is enough; then the row mark goes and the status row
  gains its `ok` arm anyway (that half is house style, not taste).
- The owner says a hand-edited overlap should be REFUSED at open like a schema error; then the
  mark and the status row both go, the refused screen names the pair, and the step-5 ruling is
  re-opened for overlap only (coverage stays an editing state).
- Every path into `regions[].rect` — numeric edit, marquee, migration, and load — is shown to
  carve or refuse, with a test that plants an overlapping document at each. Then the mark is
  provably unreachable and may be reduced to an assertion.

## 3. CALL 2: the `preset` row's badge

### Reasons, strongest first

**1. The badge column answers one question per row and no row may be silent on it.**
`regions-aeon.ts:276-277`: *"this badge is about where the value comes from."* `preset`'s answer
is "the region, and nowhere else is possible". No badge would be the only row in the column with
no answer, and the tree already ruled that shape out on this panel: the bg picker ships DISABLED
with its reason rather than hidden, because *"a control that is absent reads as 'not built'"*
(packet §3, and the precedent's reason 4: *"represent a state, never represent it by absence"*).
The brief's worry — a badge appearing only under a condition is a mode — cuts the other way here:
a badge on EVERY row is the unconditional form; a row that lacks one is the conditional form.

**2. `required` is a genuinely third state, not a spelling of `explicit`.** `regions-aeon.ts:257-261`:
*"A row that can never be inherited is not the same fact as one that happens to be explicit
today, and collapsing them would put a 'revert to inherited' control on a row where reverting is
a schema violation."* The behavioural difference is on screen: `canRevert` is false for `preset`
and true for every other explicit row (`:325`, `:348`; test `:243-253`). A missing revert control
on a row badged plain `explicit` would be the absent-control-reads-as-broken defect again. The
badge's parenthetical is what explains the missing control.

**3. The wording is pattern-consistent with the row beside it.** `inherited (act: default)` is
SOURCE + `(detail)`. `explicit (required)` is SOURCE + `(detail)`. A bare `required` drops the
source word and turns the column from "where does this come from" into "what does the schema say"
on one row only. `explicit` is not a word doing no work: it is the column's answer, and it is
true — `regionBindingValue` reads `region.preset` (`:299`), the region's own stored value.

**4. `required` is the contract's own word, and this tree already uses it as vocabulary.**
`src/core/formats/regions/aurora-regions.schema.json:33` is `"required": ["id", "rect", "preset"]`;
spec §2.3 gives the reason in the same word (*"`defaults.preset` is REQUIRED because `rg_effects`
is required and there is no act-level preset in the engine"*). `effects-preset.ts:3085` and
`effects-aeon.ts:4937` both name schema-`required` keys with that word. `always` would state the
same constraint in a word the contract does not use.

**5. The alternative parentheticals were considered and are worse.** `explicit (no act preset)`
names the cause rather than the rule and duplicates the act row's line (`RegionsPanel.tsx:144`,
`no act preset`), which is the right place for that sentence. `explicit (act: none)` was already
refused at `regions-aeon.ts:286-291` because `none` *"would read as 'the act has one and it is
empty'"*. `explicit (always)` is `required` in a non-contract word.

### The strongest argument against, at full strength

The information in a badge column is in its variation. The three nullable rows flip between two
words and that flip is the whole point of the column; `preset`'s badge can never change, so it
teaches the reader nothing and takes the space that the varying rows use. Worse, the word
`explicit` on a row that has no inherited alternative implies one exists, so an author who has
just reverted `scene` will look for the same control on `preset` and find nothing. The honest
rendering is no badge and a control-less row, which reads as what it is: a plain required field.

Why it loses. "Reads as what it is" is the claim the precedent's reason 4 rejects: absence has
no readable meaning; a row without a badge in a column of badges reads as "the badge did not
render" as easily as "there is nothing to say". The implied-alternative objection is answered by
the parenthetical itself: `(required)` is the disclaimer of the alternative, on the row, in the
place the reader is looking. And the row IS a plain required field only from the schema's side;
from the author's side it is the one binding whose revert is a refusal (`setRegionBinding`,
`:378`), and a refusal the surface never explains is the shape this tree refuses everywhere.

### What would overturn it

- The owner reads the row and asks what `required` means; then the parenthetical should say the
  cause (`explicit (no act value)` or the like) rather than the rule, and the act row's line
  should say the same words.
- The contract gains an act-level preset. Then `preset` becomes nullable, the third kind
  disappears BY CONSTRUCTION (the `key === 'preset'` arm at `:318-327` must go, not be kept as a
  fossil), and no ruling is needed.

## 4. CALL 3: the `act` row

### Reasons, strongest first

**1. Three of the four bindings resolve act-side, and the row is the only place the act's side
of that resolution is shown in one piece.** Packet §1.2's table, verified: `scene` resolves to
`Act.sceneRef` (`s4-types.ts:440-459`; the panel reads it at `regions-aeon.ts:681`,
`actBindingDefaults(act.sceneRef)`); `raster` resolves to nothing (`:103-110`, typed `null` so a
future act-level home is a deliberate type change); `bg` resolves to the `@act` sentinel
(`:111-116`). The badges show each of these per row, one at a time; the act row shows them
together and shows the act's own background through the same function a region's is
(`actListRow`, `:225-236`). Delete the row and "what does null mean here" is answered only one
binding at a time, on a selected region, and never for the act with nothing selected.

**2. The name is `act`, and `defaults` is the word that died.** §3.4 says *"a fixed bottom row
labelled 'act'"*; the mock's `act      defaults` shows the dead `defaults` object's preset
(`OJZ_Preset_Plain`), which has no referent (§2.3 banner: *"no `defaults`"*). `regions-aeon.ts:185`
already types the label as the literal `'act'` with the comment *"§3.4's word, and the only part
of that sentence that survives."* Keep it. Not `act defaults`, not `inherited from`: the row is
the act, and the Card title says what a region's null does with it.

**3. Read-only is correct scoping, and editable would be a contract change, not a panel call.**
`s4-types.ts:455-457`: *"Aurora does not WRITE this key. The save re-serialises the raw parsed
project.json … there is no act-level assignment UI yet."* A grep of `src/` finds no writer for
`Act.sceneRef` (the hits in `effects-preset.ts` are read-only parameters). `raster` has no
act-level home to write to. `bg` is generator-gated to `@act`/null (§2.3 rule 6; the region-side
picker is disabled for the same reason, `RegionsPanel.tsx:226-235`). So an editable act row would
be Aurora's FIRST writer of a project.json act key — aeon's file, a contract question, and not a
phase 2 item. The row is read-only because there is nothing Aurora is entitled to write, not
because the panel ran out of time.

**4. The read-only state must be said on the row, not only in a tooltip.** The row today has no
`onClick`, so `Card` renders it without the pointer cursor (`column-layout.tsx:508`,
`...(onClick ? { cursor: 'pointer' } : {})`) — hover tells the author it is not a region row.
But the reason lives only in `title=` (`RegionsPanel.tsx:136`, *"The act's own values. A region
binding left null inherits these."*). That is a state represented by the absence of a control
plus a hover. The bg picker on the same panel set the house shape: disabled, *"with its reason on
it"* (packet §3). Put one visible line on the row saying it is the act's own values and not
edited here (the tooltip's sentence, or shorter). This is a mark, reversible, and the smallest
change that meets the precedent's reason 4.

### The strongest argument against, at full strength

A fixed row that cannot be selected and cannot be edited is a fossil of the two-level model:
§3.4 wanted it because `defaults` was a document object with editable bindings, and that object
is gone. What is left is three words of act metadata that the badges already carry per row, sitting
in the list's last position where an author expects a region, costing a click that does nothing.
The act's scene is a project.json fact that belongs in a project panel, not at the bottom of a
list of rectangles. Cut it, and let the badges say `inherited (act: X)` as they already do.

Why it loses. The badges are shown for the SELECTED region only; with nothing selected the act's
side of the model is invisible, and an author opening the facet for the first time sees a list of
regions with no statement of what a null would mean. The row also carries the act's own background
line through `regionBgLabel`, which the precedent ruling makes an unconditional statement on every
row "including the all-shared launch state" — the act's own row is the launch state's anchor. And
"a click that does nothing" is answered by reason 4: say on the row that it is not a region. The
fossil objection is right about `defaults` and wrong about `act`; the packet already cut the
former and kept the latter, and that is the correct cut.

### What would overturn it

- The owner says the bottom of the list is the wrong place for act facts; then the same three
  lines move to the panel header beside `REGIONS ojz/act1` and nothing else changes.
- Aurora gains an act-level scene assignment (a writer for `Act.sceneRef`, which the type's own
  comment anticipates). Then THIS row is where it is edited, and read-only lifts for `scene` only;
  `raster` and `bg` stay as they are until their own homes exist.

## 5. Flagged, not ruled: numeric rect edits and the carve

Call 1's reason 1 rests on `RectFields` writing rects without carving. Spec §3.2's banner says
carve is what *every draw* over an existing region does; whether a typed number is a "draw" is
step 8's question and not one of the three calls, so it is not ruled here. Provisional lean, for
the lane to raise when step 8 is briefed: a numeric edit that produces an overlap should carve the
other region exactly as a marquee would, because the model is "each region holds exactly its own
area" and the input device is not part of the model. Until that is decided, the overlap mark of
call 1 is the only thing standing between a typed number and a red build.

## 6. Not verified

- No running app. The badge strings and the act row's text are read from
  `regions-aeon.ts` / `RegionsPanel.tsx` and from the test and harness rows that pin them
  (`test/renderer/regions-panel.test.ts:226-231`, `scratchpad/regions-facet-harness.mjs:564-567`);
  not re-rendered here.
- aeon's `region_first_overlap` refusal is cited as `region-geometry.ts:315` cites it; the aeon
  source was not opened.
- "No writer for `Act.sceneRef`" is one quoted grep over `src/` plus the type's own comment; a
  writer reached through a generic `raw` re-serialisation path would not match the pattern.

## 7. What the lane changes, if this stands

- Call 1: add an `ok` arm to the `overlap` status row (`regions-aeon.ts:511-522`) on the model of
  `unassigned` and `sidecars`; the row mark, its wording and its symmetry are unchanged, and the
  existing rows M7 / `:132-158` keep pinning it.
- Call 2: nothing. `explicit (required)` stands; the test at `:226-231` and harness `[5h]` keep
  pinning it.
- Call 3: one visible line on the act row carrying the sentence now in its `title`
  (`RegionsPanel.tsx:136`); the row's name, position and read-only state are unchanged.
