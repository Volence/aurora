# O31 — a background library that promises seventeen entries and ships none of them

2026-08-30. Branch `fix/dangling-bg-refs`; commits `49bdd529`, `0155dc45`,
`482b18c4` and this note.

## The measurement, re-verified

Taken from `/home/volence/sonic_hacks/aeon` **read-only**, and re-taken at run
time by `scratchpad/bg-dangling-ref-harness.mjs` rows M1–M5 rather than quoted
from this file.

| fact | value |
|---|---|
| `games/sonic4/data/editor/ojz_bglib.json` | **TRACKED** |
| entries it names | **17** |
| body files those entries imply (`ojz_bg_<id>.bin` + `_tiles.bin`) | 34, all present on the authoring disk |
| of those, **tracked** | **0** |
| why | `.gitignore:2` blanket `*.bin`; no `!` rule un-ignores them. The nearby comment (line ~118) aims the blanket at "dead timestamped bg experiments" |
| `ojz/act1/section_0.meta.json` | **TRACKED**, `{"bgLayoutRef":"ingame-forest-v15-1786630615596","paletteRef":null,"sceneRef":"ojz_act1_start"}` |
| `ojz/act1/section_4.meta.json` | **TRACKED**, `bgLayoutRef: null`, `sceneRef: "ojz_act1_depth"` |
| other tracked sidecars | none — sections 0 and 4 are the only two |

Every figure in the dispatch held. Two additions the dispatch did not carry:

* the ignore is **deliberate and commented** — this is not an oversight in
  `.gitignore`, it is a rule that was written on purpose and whose blast radius
  is wider than its comment describes;
* **`section_4` is the control.** It is the same tracked shape with
  `bgLayoutRef: null`, so "the sidecar is tracked" is not what breaks — a
  sidecar with no BG ref is fine. It is the ref-into-untracked-bytes that does.

## The sidecar framing: it holds, and it is sharper than the row's

`section_0.meta.json` is one tracked file carrying two refs of identical shape
and opposite fate:

* **`sceneRef: "ojz_act1_start"`** resolves. `games/sonic4/data/editor/effects/ojz_act1_start.json` is
  tracked, and effects scenes genuinely bake (`effects_gen.py`, wired since
  2026-08-22).
* **`bgLayoutRef: "ingame-forest-v15-1786630615596"`** dangles. Its two
  binaries are untracked.

Nothing in the file, the schema, or the loader distinguishes them. Both are
`string | null` scalars written by the same save path in the same gesture.

## What the row's premise got wrong, and the honest statement

The row said "a study reading a clean export concludes the feature is broken
when it is not." Merge `f0df2e2f` re-measured the surrounding fact: **nothing
bakes a per-section background at all.** No aeon generator reads `bgLayoutRef`
or the bglib manifest, and the shipped act's only templated `sec_bg_layout` is
`default`. The background that reaches a ROM is the act-wide
`editor_bg_override.json`, through `inject_editor_bg.py`.

So the honest statement is not the row's:

> **The dangling body costs the EDITOR, not the ROM.** A clean clone is not
> building the wrong game — the per-section binding was never going to reach the
> ROM either way. It is *authoring against a picture that is not the one the
> project names*, and it was doing so silently. The feature is not "broken and
> looks fine"; it is "editor-only, and the editor was lying about the
> editor-only part too."

That is a smaller claim than the row's and a more useful one. It also relocates
the urgency: this is not a release blocker, it is a **correctness-of-authoring**
problem, and the second-order data loss below is the part that actually bites.

## The defect Aurora owned, and the one nobody had named

`src/core/project/aeon/load.ts` dropped each bodyless manifest entry with a
`console.warn` and produced a SHORTER `bgLibrary` — an array that is correct
about what it contains and carries nothing about what it is missing. Everything
downstream then read it correctly and said something false:

1. `resolveDisplayedBg` (providers/bganim-preview-aeon) falls through to the act
   default and returns `source: 'act'` — indistinguishable from a section that
   asked for nothing.
2. The Properties select's `value` is the ref and its options are the library.
   A `<select>` whose value answers no option renders at `selectedIndex -1`:
   **a blank box** under the label "Background". (Measured live — harness R1.)
3. `SectionGridNav`'s tooltip fell back to `?? sec.bgLayoutRef`, printing the
   raw id — which reads exactly like a name — under a **green dot meaning
   "assigned"**.
4. The map status line said `Section 0` and nothing else.
5. `list_bgs` returned `entries: []` while its own `sections` column printed an
   id, and `assign_section_bg` refused that id with **"not found in the
   library"** — a sentence an agent cannot act on, since the manifest does name
   it.

**And the one nobody had named: `buildAeonSavePlan` wrote the manifest from
`project.bgLibrary`** — the entries that resolved. On aeon's tree that means an
author on a clean clone who makes ONE background replaces a seventeen-name
tracked manifest with one name on the next save. Sixteen ids gone from the
tracked file, their (untracked, present on the authoring machine) bodies left as
orphans nothing points at. Same shape as the section-meta erasure: a reader that
could not understand a file became a writer that replaced it.

## What Aurora changed

One predicate, `danglingBgRef` (`src/core/formats/bg-library.ts`), read by five
surfaces. One carried fact, `S4Project.bgLibraryUnresolved`, required rather
than optional on the rule `effectsScenes` already states — an optional field
reads as "nothing was missing", which is a different claim from "nobody looked".
One merge, `mergeBgLibraryIndex`, so a save never narrows the manifest to what
it could read (and on a whole checkout emits byte-identical output, pinned).

Surfaces: the Properties select gets an honest option; the section grid gets a
hollow warning dot and a tooltip that says MISSING; the map status line names
the entry; `list_bgs` gains `unresolved` and a per-section `dangling`;
`assign_section_bg` gains a second, actionable refusal; and opening such a
checkout raises a **warning** toast.

**Nothing blocks.** A missing body stays fully editable — the first row of the
new agent block is the control that proves the tool still writes.

`DisplayedBg` deliberately does NOT carry the fact. Its readers ask about
sections it never resolves (the whole grid) or about the manifest rather than
the picture, so a field there would have had no reader.

### One general defect found in passing

`PropertiesPanel`'s select is `maxWidth: 120`. The first version of the honest
label led with the id and rendered as `ingame-forest-v15-1` — the entire signal
off the end of the box. Fixed by leading with the state and adding a `title` to
the select and every option, which helps every long label: a library entry
called "Deep Forest v15 (marching colonnade)" was already being cut to
"Deep Forest v15 (" with no way to read the rest.

### Two things left alone, on purpose

* `aeon-open.ts` toasts every `notices` entry as **`'success'`**, including
  `markUnreadable`'s *"exists but could not be read … fix it by hand"*. A green
  2.2s toast for an unreadable file is the same defect class, in a channel this
  parcel does not own. The new warning is routed around it rather than through
  it. **Open.**
* `resolveDisplayedBg`'s fallback itself. It is correct and must stay.

## The recommendation for aeon, with its cost

**Verbatim, for relay:**

> Aurora's O31 work found that `games/sonic4/data/editor/ojz_bglib.json` is
> tracked and names 17 background entries, while all 34 of the per-entry
> binaries it implies (`ojz_bg_<id>.bin`, `ojz_bg_<id>_tiles.bin`) are untracked
> — caught by `.gitignore`'s blanket `*.bin`, under a comment aimed at "dead
> timestamped bg experiments". The tracked sidecar
> `ojz/act1/section_0.meta.json` points `bgLayoutRef` at one of the seventeen.
> On any clean clone the manifest advertises seventeen backgrounds, none opens,
> and that sidecar points into the void. On the authoring machine everything
> resolves, so the failure is invisible to exactly the person who could fix it.
>
> Aurora has made this legible rather than silent — the editor now names the
> missing entry in four places, `list_bgs` reports an `unresolved` column, and a
> save can no longer narrow the manifest to the entries it could open. That is
> the whole of what Aurora can do alone. **The bytes are yours.** Two options,
> and the choice is aeon's:
>
> **(A) Track the bodies.** Un-ignore the referenced entries — at minimum the
> one `section_0.meta.json` names, ideally the whole seventeen. *Cost, measured
> on this checkout with `du -b`:* all 34 files total **315,394 bytes (308 KiB)**;
> the single referenced pair
> (`ojz_bg_ingame-forest-v15-1786630615596{,_tiles}.bin`) is **22,530 bytes
> (22 KiB)**. That is small enough that size is not the argument. The argument
> against tracking all seventeen is that sixteen of them are
> `deep-forest-v1..v16`, which read as exactly the iteration history the ignore
> rule was written to keep out — so if they are dead, DELETE them and shorten the
> manifest rather than tracking them. Tracking only the referenced pair fixes the
> dangling sidecar for 22 KiB, at the price of a manifest that still advertises
> sixteen entries nobody else can open (Aurora will now say so out loud, which is
> a tolerable steady state but not a good one).
>
> **(B) Stop tracking the sidecar's BG ref.** If a per-section background is
> genuinely never going to be baked — which is where MCP.md's re-measurement
> currently stands — then `section_0.meta.json`'s `bgLayoutRef` is an
> editor-only preference in a tracked file, and tracking it is what turns a
> local convenience into a broken promise for everyone else. *Cost:* the
> author's own section binding stops travelling with the repo, and Aurora would
> need to be told (it is the sole writer of that field; it will keep writing it
> unless the field is removed from the schema, which is an empyrean contract
> change, not a `.gitignore` edit).
>
> Aurora's recommendation is **(A), for all seventeen** — the manifest is
> already tracked, so the repo has already decided these names are shared state;
> the bodies are the only reason that decision does not work. **(B)** is the
> right answer only if the per-section BG binding is being retired outright, and
> that is a decision neither lane should make in a `.gitignore`.
>
> Aurora will not touch the aeon tree either way.

## What Aurora cannot fix alone

* **Making the seventeen backgrounds actually resolve on a clean clone.** That
  is bytes in aeon's repo. Aurora can only say so honestly.
* **Whether a per-section BG binding should exist at all.** MCP.md now records
  that nothing bakes one. If that is permanent, the field is dead weight in a
  tracked sidecar — an empyrean-contract question, not an editor one.
* **The tracked-sidecar/untracked-body asymmetry in general.** `paletteRef` is
  the next ref of the same shape with no consumer; whatever rule settles
  `bgLayoutRef` should settle it too.

## How it was verified

**Node suite: 5870 passed, 7 skipped, 0 failed (431 files).** Full totals, not a
tail.

Six red-first plants, each restored, each proven landed with `git diff --stat`
before the run (a no-op plant and a real one emit the same artifact otherwise):

| plant | what was broken | what went red |
|---|---|---|
| P1 | `mergeBgLibraryIndex` returns only the loaded entries | 4 rows across `bg-library.test.ts` + `aeon-save.test.ts` (`expected [] to deeply equal [{id:'a'…}]`) |
| P2 | `danglingBgRef` always returns null | 5 rows across **four** files — format, agent, map-status, properties — each of which is the only witness for its own surface |
| P3 | load warns and drops without carrying | 3 rows in `aeon-save.test.ts` (`expected [] to deeply equal [{…}]`) |
| P4 | one refusal message instead of two | `expected … /binaries are not in this checkout/ but got 'bg "ghost" not found in the library'` |
| P5 | `list_bgs.unresolved` hardcoded `[]` | `expected [] to deeply equal [{id:'ghost'…}]` |
| P6 | the honest `<option>` removed | `expected [{value:''…},…(2)] to deeply equal […(4)]` |

P2 is the one that matters for hidden second paths: the `unresolved` column row
stayed GREEN under it, because that column reads `bgLibraryUnresolved` rather
than the predicate. Two independent facts, two independent witnesses.

**The rendered surfaces were driven, not inferred.**
`scratchpad/bg-dangling-ref-harness.mjs`, 26 rows, 26 passed. It builds the
clean-clone state from the live aeon tree (hardlinked `cp -al`, every
`ojz_bg_*.bin` **unlinked** so the hardlink breaks rather than aeon being
written, manifest left byte-identical), opens it in the real Electron app over
CDP, and reads the DOM, the toast store, computed styles, and canvas text
metrics. Shots in `scratchpad/shots-bg-dangling/`.

Its red controls run in place, without a second build:

* **R1** sets the select's value to an id no option answers →
  `selectedIndex 1 -> -1, displayed null`. The blank box, live.
* **R1b** removes the option instead → `selectedIndex 0, displayed "Act
  default"`. **A correction to my own first claim:** I had asserted the failure
  was always a blank box. Removing an option from a rendered select does not
  blank it — the browser falls back to index 0, so the control *asserts* "Act
  default" on a section that names something else. That is worse than blank, and
  the first run of this harness went red telling me so.
* **R2** restores and re-reads, so a failure to restore cannot pass as a pass.

`S3b` measures the select's CSS width against canvas text metrics (erring 25px
wide for the arrow, so it cannot flatter the result) and is what caught the
120px truncation. `G3` is the anti-vacuous row: the eight sections with no ref
show no dot at all.

Not attempted, per standing invariant: any emulator MCP call. Nothing here needs
one — no part of this reaches a ROM.
