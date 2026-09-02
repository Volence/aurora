# EW-USABILITY wave 1 — EFFECTS-W1, the parcel

**What this answers.** The owner tried to use Aurora's parallax/raster/band tooling and
could not: *"it's just so confusing and convoluted and difficult to understand and
use… I tried using it last time and I was just lost. It kept giving errors during
build time that I would have to stop and revert the changes, and some seem like
they're just a repeat of things."*

A cold reader reproduced it — `docs/reviews/2026-09-02-effects-cold-walkthrough.md`:
21 confusions, 5 build failures, 7 apparent duplicates, 9 missing affordances. The
defect numbering below is that log's.

**Branch** `feat/effects-usability-w1`, six commits, one per defect (or pair).
**Suite** 6293 → 6357 passing, 0 failing, 8 skipped (each naming its reason), tsc
clean. **Harnesses** 39 rows across three files, all green, each with a plant.

---

## What shipped, per defect

| # | defect | what shipped | proven on screen by |
|---|---|---|---|
| **1** | No help affordance anywhere in the app | `docs/guides/effects-first-run.md` rendered IN the app, three doors to it | `effects-guide-harness` 11/11 |
| **2** | "Band" named two features across six controls | tile animation / raster band — names sharing no word | `effects-guide` [2a], vocabulary gate |
| **5** | No authoring-time validation | `refuse` on the number box; L0, the fire bound, `top < bot`, cycle line 0 | `effects-refusal-harness` 13/13 |
| **7** | Errors could not be walked back to a control | every message opens with preset · card · field | `effects-refusal` [3c], [4a] |
| **3** | 8,059 characters of prose before the first control | 875 painted; the contract on `title` + in the guide | `effects-section-picker` [5a], [5b] |
| **4** | No section picker; two bindings 4,000px apart | picker first in the column, with the derived wiring | `effects-section-picker` 15/15 |
| **11** | Deleting a bound preset was unguarded | refused, naming the sections and the escape | `effects-section-picker` [6a] |
| **12** | Undo left the toolbar advertising tile 33 | `staticBaseAuthored` provenance flag | `band-verbs.test.ts` ×3 |
| **14** | The parallax preview existed and was buried | `Parallax preview` chip on the Effects bar | `effects-section-picker` [6b] |

**Not attempted, and why.** Defects 2, 6, 8, 10 in the log are aeon's (the repeating
stale build, the FAST wrapper's message, the section-wiring itself). Defect 9 (one
Ctrl+S rewrites 25 files) is a save-plan change and was not reached. Defect 13's
colour picker was not reached; its "no band preview" half is `NO_PREVIEW`'s standing
ruling, not a bug.

---

## The two names

**tile animation** — a cols × rows block of *background tiles* with 8 phase banks,
DMA'd over the same slots. Costs tile slots; ceiling of four per act.

**raster band** — a range of *screen lines* over which CRAM is repainted. Costs no
tiles.

They share no word, which was the ruling. **The raster side kept "band" and the other
gave it up**, and the asymmetry is deliberate: aeon's own `band()` and every build
error the author will meet call the raster thing a band (`band: top 200 must be above
bot 100`). Renaming it would have put Aurora's vocabulary at odds with the messages
an author has to walk back to a control — the defect this whole parcel is about.

Wire spellings did **not** move: `set-bg-override-band`, `anims`, the `bands` key,
`mark-band`/`stamp-band` tool ids and every `CollapsibleSection` id are protocol and
persistence names. Internal symbols (`bandVerbs`, `BgAnimBandPanel`) are untouched —
already disambiguated by their module prefixes.

---

## The premise correction, and what it changed

My brief said **"only section 5 is wired"**. That is false, and it came from prose
inside Aurora's own panel — the cold reader inherited it from there and wrote it into
the guide. The correction I was sent said **"1-5"**; aeon's lane produced that with an
ad-hoc parse that windowed to the first 800 characters after each `sec: N`, and
section 0's `effects:` field sits at offset 964. *A window that finds nothing and a
field that does not exist print the same thing.*

I derived it before building on it, and got **0-5**. Both lanes then agreed.

**Three answers in one day, all lists, all snapshots.** So this repository holds no
list. `core/formats/effects/section-wiring.ts` parses aeon's own
`act_descriptor.emp` and `<zone>_effects.emp` at load time, per act, and keeps two
facts apart:

| fact | meaning | today, ojz/act1 |
|---|---|---|
| **own preset** | no other section binds this section's preset record | 0, 1, 2, 3, 4, 5 |
| **wired** | a preset also threads the chooser on this index | 5 |

Conflating those two is how "only 5" and "0-5" were both published as *the* answer on
one day. `sectionRasterState` returns one of five states — `wired`, `unthreaded`,
`shared`, `unbound`, `unknown` — and the sentence for each states a fact about the
**level data**, never a prohibition by Aurora:

> Sections 6, 7 and 8 all share the preset record `OJZ_Preset_Plain`, so giving section 7 a band would give sections 6 and 8 the same band. aeon's build refuses that and asks for the record to be split first.

**It advises; it does not gate.** `core/formats/raster-binding.ts` carries a STANDING
REFUSAL against gating this select, on the grounds that a gate written from a
snapshot would be silently wrong for the next act and read to an author as authority.
That refusal named its own escape — a statement re-derived per act rather than a
cached literal — and this is it. Its hardest clause is honoured exactly: **if the
files cannot be read the sentence says "could not read", never "not allowed"**,
because a control greyed out because a file was missing is indistinguishable, to the
author, from one greyed out because the thing is impossible.

---

## Three things the instruments told me I had wrong

**1. "Not written." was not the whole truth.** `NumberField` commits per keystroke —
its own long-standing contract, deliberately not changed here — so typing `40112`
over a selected `112` walks through the legal `4` and `40`, which land. The box then
shows `40112` and the document holds `40`. Measured in the running app, not reasoned
about. Every refusal sentence now names what the document still holds
(`Refused; Top is still 40.`), and the harness asserts the property that matters: the
document never holds a value the build refuses.

**2. `min`/`max` would have bought nothing.** On `<input type="number">` they govern
the spinner and `:invalid` and stop no typed value. The refusal is a `refuse`
callback that withholds the commit, and the harness types with real key events
because a source-level assertion about validation is the shape of the bug. Row [2b]
asserts the box carries **no** min/max, so the refusal measured is the real one.

**3. Select-on-focus was the root, not a symptom.** `40112` was a defect the panel
itself caused. `e.currentTarget.select()` on focus kills the class; the refusal is
the backstop.

---

## The before/after that matters, measured on both sides

Not quoted from the walkthrough — run in one instrument against two builds:

```
the cold reader's own DOM search for help|guide|docs|manual|tutorial|?
  master's build (AURORA_BUILT_TREE=<main checkout>) →  0 painted hits
  this build                                        →  1, the `? Guide` chip
```

```
the limit block, painted, at the top of RASTER BAND PRESETS
  before →  8,059 characters
  after  →    875 painted, 6,474 still reachable on `title`, plus a guide link
```

---

## Red-first, from a committed baseline

`scratchpad/poisons-effects-usability.sh` — three poisons, each showing the mutation
on disk, the gate red, and the baseline restored with `git checkout --`. A fresh vite
transform cache per poison, its file count printed before (0) and after (1).

| poison | mutation | vitest | harness |
|---|---|---|---|
| 1 | `Add blank tile animation` → `Add blank band` | 1/4 red, naming the file and string | — |
| 2 | `refuse` removed from the `Top` box | 1/22 red | `effects-refusal` 10/13 — [3b] [3c] [4a] |
| 3 | the descriptor parse windowed to 800 chars | 7/14 red | `effects-section-picker` 13/15 — [4b] [4d] |

**Poison 3 is the one worth reading.** Reintroducing aeon's own windowing bug makes
the app print `own preset 1,2,3,4,5` — *exactly* the wrong answer their lane
published — and the harness catches it because it re-derives the set **in its own
process** from the aeon copy's files rather than importing Aurora's module. An
instrument that shared the derivation would have produced two matching wrong answers.

Plants: `PLANT=rot-finder`, `PLANT=rot-picker` each abort their harness at the floor
row rather than reporting the sections below as green. `rot-finder` leaves row [2a]
green — the help search finds the chip independently — which is the honest
discriminating power, reported rather than hidden.

---

## What the instruments cannot see

- **Nothing here ran a ROM.** No emulator, no `mcp__oracle__*`. What a bound band
  looks like on screen stays `NO_PREVIEW`'s subject: one measured frame exists, in
  aeon's tree, and Aurora draws none of it.
- **The vitest rows read source.** Every claim about a pixel is a harness row, and
  each harness header says which of its rows could go green without the property
  holding.
- **The section-wiring numbers are today's**, asserted so a changed world is
  distinguishable from a broken parser. When aeon splits `OJZ_Preset_Plain` those
  rows go red; the fix is to read the new numbers off the file, not to touch the
  derivation. The product never sees a literal.
