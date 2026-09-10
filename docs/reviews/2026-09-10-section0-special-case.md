# SECTION0-SPECIAL-CASE — applied, three-way, and derived

Branch `parcel/section0-special-case`. 2026-09-10.

Commits: `b3ec66f7` (the derivation), `6361ed64` (the rows), `81af0ddf` (the
standing refusal narrowed, and one scope clause corrected).

---

## 1. What the decision was, and why there was no fork left

The row was filed with a rule decided **before** the answer was known:

> A permanent property earns a disabled control with a reason; an incidental gap
> earns the enabled control with a disclosure we ship today.

Aeon supplied the missing input at `92d744fc` (`docs/DEFERRED_WORK.md`,
`SECTION0-SPECIAL-CASE`), so the rule applies itself. What it does **not** do is
apply itself uniformly, because the answer is three-way:

| sec | today | verdict |
|---|---|---|
| 0 | `patched: OJZ_TwoChannel` | STABLE PROPERTY. Control disabled, reason on screen. |
| 1 | `raster: OJZ_TestRaster` | incidental, OCCUPIED. Content. Refused nothing. |
| 2 | `raster: OJZ_TestGradient` | incidental, OCCUPIED. Content. Refused nothing. |
| 3 | `raster: Raster_Program_None` | incidental and FREE. Refused nothing. |
| 4 | `raster: OJZ_DepthVSplit` (d-15 showcase) | incidental, OCCUPIED. Content. Refused nothing. |
| 5, 6 | threaded | already wired. |
| 7 | `patched: OJZ_WorldWater` | **BARRED, and aeon's ruling does not say so.** See §3. |
| 8 | `OJZ_Preset_Plain`, no arm | refused nothing. |

---

## 2. Re-derived at the artifact, not taken on report

Read at aeon `origin/master` = `f93f9f6fc9d29e8503a00442d36d41696c2c685c`,
through this repo's own resolver (`test/support/sibling-root.mjs`, which
answered `step 3: git rev-parse --git-common-dir`). No sibling path was typed.

`engine/effects/preset.emp:141-154`:

```
pub comptime fn preset(pal: Label, parallax: Label = 0, raster: Label = 0,
                       patched: Label = 0, cycle: Label = 0, …)
    ensure(raster == 0 || patched == 0,
           "preset(): ep_raster and ep_patched are mutually exclusive. Whichever
            installs last wins DESTRUCTIVELY …")
```

`patched:`'s own default is `0`, so "binds an arm" is exactly "passes a non-zero
`patched:`". Grepping the `preset()` records in `ojz_effects.emp` at that
revision returns **two** and only two: `OJZ_Preset_Sec0` (`:1516`) and
`OJZ_Preset_Sec7` (`:1871`).

**So the property Aurora derives is not a section index. It is:**

> a section is barred ⟺ the preset record it binds passes a non-zero `patched:`

That is `sectionArmExclusivity` in `src/core/formats/effects/section-wiring.ts`,
re-parsed from aeon's own library on every project load, alongside the three
conditions that were already derived there.

### The parse strips comments first, and the hazard is live

`ojz_effects.emp:1459` carries, **in prose**:

```
// UNBINDING `patched: OJZ_TwoChannel` would have done the same thing to the picture
```

The record split runs declaration-to-declaration, so that comment sits inside
the body of `OJZ_DepthVSplit` (`:1366`). This is not a hypothesis: with the
stripper mutated off, the real-tree row goes red reporting
`['OJZ_DepthVSplit', 'OJZ_Preset_Sec0', 'OJZ_Preset_Sec7']`. Today that false
positive lands on a raster program no section binds as its preset, so it would
have been harmless — luck, not a property. A refusal sourced from a sentence
explaining why somebody did **not** do the thing is the worst kind this repo
could publish.

---

## 3. The derivation already disagrees with the ruling's prose, and that is the point

Aeon's ruling states, as one of the four rules closing the door:

> **Section 0 is the only section in the tree with live patch channels**

That sentence is a faithful quotation of their own `OJZ_Preset_Sec5` docblock
(`:1649-1658`), written 2026-09-03. Their `ojz_effects.emp` has contradicted it
since 2026-09-05, at `:1726`:

> SECTION 7 IS THE ACT'S SECOND SECTION WITH LIVE PATCH CHANNELS (EFFECTS-W1
> item 9c precondition, 2026-09-05). It carries OJZ_WorldWater — two
> `patchable()` records with world anchors

Both sentences are in the same file at the same revision. The ruling's own table
also stops at section 6 and gives no verdict for 7 or 8.

**A literal `sectionIndex === 0` would have shipped two days stale on the day it
was written.** The derivation bars section 7 on the same `ensure`, and a test row
carries the contradiction in its title (`SECTION 7 IS BARRED TOO, AND THE
RULING'S PROSE SAYS IT IS NOT`) so a future reader meets it rather than infers
it. Booked to the ledger as `AEON-RULING-QUOTES-ITS-OWN-STALE-BLOCK`.

**What is open and is aeon's, not mine:** their `:1775-1780` note gestures at a
different route into section 7 — a `rasterRef` document carrying `boundary`,
which lowers into `patched:` and is "purely additive on this record". That route
does not pass through `bands` and so does not touch the raster arm. What closes
it today is hub ruling Q1a ("a document must carry `bands`") — and Aurora's own
`aurora-effects-preset.schema.json` does **not** list `bands` as required, so the
two repos do not agree about that premise either. Aurora refuses today's raster
binding on today's mechanism and takes no position on the boundary route.

---

## 4. The sentence a person actually sees

Rendered from the real tree (printed from the shipped function, not retyped):

> **Section 0 binds the preset record OJZ_Preset_Sec0, which passes patched:
> OJZ_TwoChannel. aeon's preset() refuses a raster: beside a patched:, because
> they are the same channel and whichever installs last destroys the other
> (engine/effects/preset.emp: "ep_raster and ep_patched are mutually
> exclusive"). A preset document authored here carries bands, bands lower to a
> raster program, and effects_seam_gate.py requires it be threaded through
> ojz_act1_sec_raster(sec: 0). So binding one here would have to take
> OJZ_TwoChannel out of section 0 first. That is a property of the mechanism and
> not a choice about this section (aeon, 2026-09-10: "THAT IS A STRUCTURAL GAP
> AND NOT A CHOICE"), and it is the only kind of thing that greys this control
> out: a section nothing threads yet, or one whose raster channel is already
> occupied, is refused nothing here. A programmer unbinds the patched arm in
> that record if this section is really the one you want.**

And the `unknown` sentence, which leaves the control **enabled**:

> **Aurora could not read games/sonic4/data/effects/ojz_effects.emp (ENOENT: no
> such file or directory), so it could not check whether section 0's preset
> record binds a patched: program, which would make an editor-authored band
> structurally impossible here, since aeon's preset() refuses a raster: beside a
> patched:. The control is left ENABLED and the binding is still written: a
> control greyed out because a file could not be read is indistinguishable from
> one greyed out because the thing is impossible. aeon's build is the
> authority.**

### Verdict: mechanism, not apology

It reads as a mechanism, and I would defend that on four properties rather than
on tone:

1. **Every noun in it is a thing the reader can go and look at** — a record name,
   a program name, a file, a function, a generated chooser call. There is no
   sentence whose subject is Aurora deciding something.
2. **It says what would have to change, and who changes it.** "A programmer
   unbinds the patched arm in that record" is a request an author can make. An
   apology ends at the refusal.
3. **It states its own scope**, and that clause was wrong on the first draft. It
   read "this control is disabled here and nowhere else", which is false the
   moment the derivation bars two sections. Corrected in `81af0ddf` to name the
   contrast that actually matters to an author: an unthreaded or occupied
   section is refused nothing.
4. **It quotes aeon's own words for the load-bearing claim** ("THAT IS A
   STRUCTURAL GAP AND NOT A CHOICE"), attributed and dated, so the reader can
   tell whose fact it is.

The honest weakness: **it is long** — 3 lines of prose plus wrap, in a column the
owner already calls confusing, and it renders permanently for section 0 and
section 7 whether or not the author is doing anything near it. The trade this
repo has made before (condition 3's third row) is that a verdict which is long
beats one which is wrong, and I made it the same way. If the owner wants it
shortened, the first two sentences carry the mechanism and the last two carry
the remedy; either pair can stand alone.

---

## 5. The disable has a second clause, and it is the one that matters most

`sectionBindingControlDisabled(w, sectionIndex, rasterRef)`:

```
barred AND rasterRef === null  ->  disabled
barred AND rasterRef !== null  ->  LIVE
```

A barred section that **already carries a** `rasterRef` (an older build, the
agent tool, a hand-edited sidecar) is a tree aeon's seam gate is refusing right
now, and this select is the only control in the app that can take the binding
back out. Greying it there would trap the broken state and hide its one fix. The
refusal sentence stays on screen either way — it does not read `rasterRef` at
all.

The predicate lives in `section-wiring.ts` and not inline in the JSX **because
this repo's node suite cannot render React**: written in the component, this
second clause would be asserted by nothing but a CDP harness, and it is exactly
the sort a never-run assertion lets rot.

---

## 6. `unknown` never collapses

With the effects library unread:

* not `barred` — that would state a mechanism nobody measured;
* not silently `open` — a structural impossibility would present as an ordinary
  binding.

The control stays **enabled**, and `sectionArmExclusivityUnknownNotice` names the
file and the reason. `armBarredSections` returns `[]` rather than "everything",
which is the safe direction for a set whose only use is to grey controls out.
`raster-binding.ts`'s hardest clause is honoured unchanged.

---

## 7. How it was verified

**Rows.** `src/core/formats/effects/__tests__/section-wiring.test.ts`: **62
passed** (was 43). New blocks: `the patched arm: parsing the one thing preset()
will not share`, `arm exclusivity: the three verdicts, and none of them is the
others`, `the disable rule, both clauses`, `against aeon's real ojz/act1: which
sections are structurally barred`.

**Mutations, each applied to the committed baseline, quoted from disk with
`git diff --stat`, and restored with `git restore --source=HEAD` before the
next:**

| # | mutation (quoted from disk) | red |
|---|---|---|
| M1 | `return s; // MUTATION M1: stripper disabled` | 2 rows — the plant **and** the real file, reporting `OJZ_DepthVSplit` |
| M2 | `if (!w.library.parsed) return { verdict: 'barred', … }` | 2 rows |
| M3 | `if (sectionIndex !== 0) return { verdict: 'open', … }` | 2 rows — section 7, and the derived set |
| M4 | `return … === 'barred'; // traps a bound section` | 1 row |
| M5 | `if (hit) out[…] = hit[1]; // patched: 0 read as a binding` | 1 row |
| M6 | `if (sectionIndex <= 4) return { verdict: 'barred', … }` | 6 rows |

Baseline restored, tree clean, 62/62 green.

**Full suite.** `npm test`, exit **0**:

```
Test Files  599 passed | 3 skipped (602)
     Tests  8957 passed | 9 skipped (8966)
  Duration  23.29s
```

Load average 8.97 at start, uptime 10:27. Every skip named its reason; none of
them is in this parcel's population.

---

## 8. ⚠ WHAT NEVER OBSERVED A RENDERED PIXEL

This repo's node suite has no jsdom, and my invariants bar Electron, CDP and the
emulator. So **every claim below is unproven and is tagged for a foreground
run** (`npm run harness:section-raster-select`, which drives the real app):

* that the `disabled` attribute reaches the real `<select>` in the DOM;
* that the control **looks** disabled (the `opacity: 0.5` / `cursor: default`
  pair added to `Select`);
* that the refusal `Hint` renders **above** the control rather than below it,
  which is the whole reason it was placed there;
* that it renders in the **warning** tier and the unknown notice in the plain
  tier;
* that either sentence fits its box without clipping, and what it costs the
  column's height (the strip is already ~147px of a 742px column);
* that the `unknown` path renders at all, since it needs a project whose aeon
  library is missing.

What **is** proven, in node: the rule, the three verdicts, both disable clauses,
the parse, the comment hazard, and the exact text of both sentences.

---

## 9. `raster-binding.ts` — what I touched, and the overlap

**Another agent is editing this file right now** on `parcel/threaded-set-comment`,
fixing stale comments in its header block (notably `Today: 5 alone
(ojz_effects.emp:1114)`, around line 583).

**I added exactly one comment block and no code**, at the **end** of the standing
refusal's docblock — after its last clause ("Fail toward the honest sentence…"),
around line 594, roughly ninety lines below theirs. Nothing was moved,
restructured or deleted. The block records: what now disables the select, why an
`ensure` re-read per load is not the snapshot the refusal forbids, that the four
incidental sections are refused nothing, and that the unreadable-file clause is
untouched.

If git conflicts at merge, **take both**: the two edits are in different
paragraphs and neither depends on the other's text.

---

## 10. Open, and why

* **Section 3 is information for the owner, not work.** Nothing here threads it,
  selects it or defaults to it. Booked as `SECTION-3-IS-THE-FREE-ONE`. Threading
  it is one line in aeon (`raster: ojz_act1_sec_raster(sec: 3, hand:
  Raster_Program_None)` inside `OJZ_Preset_Sec3`) plus whatever choosers a bound
  document's other keys owe; whether the editor should point authors at it is the
  owner's call.
* **Sections 1, 2 and 4 stay enabled with today's disclosure.** No new refusal
  was invented for them. What occupies them is content and it is reversible.
* **Whether section 7 should be barred to an editor document is aeon's to say.**
  Aurora bars it today on the raster arm, which is the mechanism their own ruling
  names. Booked with the ruling's staleness.
* **`bands` is not required by Aurora's preset schema**, while hub ruling Q1a
  says a document must carry it. Noticed while checking the ruling's premises;
  out of this parcel's scope and not touched.
