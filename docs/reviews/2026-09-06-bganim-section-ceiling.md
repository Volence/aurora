# The second budget: the `ojz_bg_anim` ROM section (EFFECTS-W1)

**Branch** `parcel/bganim-section-ceiling` · **2026-09-06**

Aurora's tile-animation panel modelled ONE budget, `BG_TILE_CAPACITY`, a VRAM
allocation counted in tiles. aeon enforces a **second, independent** one counted
in ROM bytes: `check_bganim_section_fits` raises `SystemExit` when the emitted
`ojz_bg_anim` section exceeds `BGANIM_SECTION_CEILING`. On aeon's own shipped
document the panel offered **80** free slots where the section admits **47** more
animated ones.

---

## 1. The constants, where each was read, and which artifact governs it

Read with `git -C <AEON_DIR> show <rev>:<path>`, resolved through
`test/support/sibling-root.mjs`. aeon's `origin/master` moved during the
session; **every value and every cited line number is identical at both
revisions**, checked rather than assumed.

* read at **`78c994235fc51c54e2b03c075eda566123d6a02b`**
* re-verified at **`3a4321824e47d1a473ddb94ee1ba6db1fd598c61`** (a `git diff` of
  `tools/inject_editor_bg.py`, `tools/EFFECTS_CONSUMER_CONTRACT.md`,
  `games/sonic4/vram.toml` and `games/sonic4/data/editor_bg_override.json`
  between the two is **empty**)

| Constant | Value | Governing artifact | Line |
|---|---|---|---|
| `BGANIM_SECTION_CEILING` | 20480 | `tools/inject_editor_bg.py` — `min(BGANIM_SECTION_CEILINGS.values())` | :207 |
| … its ruled figure | 20480 | `BGANIM_SECTION_CEILING_RULED` | :202 |
| `BGANIM_COUNT_BYTES` | 2 | `tools/inject_editor_bg.py` | :214 |
| `BGANIM_RECORD_BYTES` | 44 | `tools/inject_editor_bg.py` | :215 |
| `BGANIM_BYTES_PER_SLOT` | 256 | `tools/inject_editor_bg.py` — the PRODUCT `BGANIM_PHASES * BGANIM_TILE_BYTES` | :218 (:216, :217) |
| `BGANIM_VIEW_COUNT` | 3 | `tools/inject_editor_bg.py` | :323 |
| `BGANIM_VIEW_DERIVED_PERIOD_PX` | 64 | `tools/inject_editor_bg.py` | :287 |
| `default_off` (band key) | — | `tools/inject_editor_bg.py` `views_emitted()` + `EFFECTS_CONSUMER_CONTRACT.md` §1.2 | :326-358 |

**WHICH ARTIFACT GOVERNS, and it is not the usual one.** Unlike
`BG_TILE_CAPACITY` — whose authority is `games/sonic4/vram.toml`, with
`tools/vram_map.py` and `engine/system/constants.emp` as generated mirrors —
**every constant above has exactly ONE authority, `tools/inject_editor_bg.py`,
and no `.emp` declaration at all.** More: **the section ceiling has no row in
aeon's own `tools/EFFECTS_CONSUMER_CONTRACT.md`.** It is a writer-binding rule
that lives only in the consumer's source. That is the class aeon's own
`default_off` subsection names ("a constraint that was never in the copy at all
… invisible to a per-line check of the consumer's file, and to a currency gate
over values, because it is not a value"). Recorded in the vendored entry's
`notInAeonProse` field so a later reader does not conclude from the contract
doc's silence that no such rule exists. **Worth raising with aeon.**

`BGANIM_SECTION_CEILING` is an **owner ruling, not a measurement**: a budget
INSIDE the ROM room, which `tools/bganim_room.py` measures independently and
which fails aeon's build if the ceiling ever exceeds it. It has moved twice
(9,394 → 12,288 on 2026-08-26 → 20,480 on 2026-09-04). It will move again.

---

## 2. The arithmetic, the quantifier at each step, and the "80 / 47" framing

aeon's formula (`bganim_section_bytes`), with the quantifier of each term:

```
section_bytes = table                                   PER ACT   (one count word)
              + n_views * table                         PER ACT   (a whole table per twin)
              + total_animated_slots * BYTES_PER_SLOT   PER ACT   (summed over all bands)
    where table = COUNT_BYTES + RECORD_BYTES * n_bands   PER BAND inside a per-act total
```

| Step | Quantifier | Why it matters |
|---|---|---|
| the count word | **per act** | also the whole size of the disabled stub |
| a band record | **per band**, summed | and paid AGAIN inside every view twin |
| an animated slot | **per slot**, summed over ALL bands | the expensive term, and the only one authoring scales |
| view twins | **PER ACT** | ⚠ the trap — see below |
| the comparison to the ceiling | **per act, never per band** | aeon's source records a per-band cap being tried and refuted by this zone's own content (`32x4 + 16x4` passes any generous per-band limit while its SUM is 49,242 B) |

### The `default_off` quantifier trap (aeon `EFFECTS_CONSUMER_CONTRACT.md` §1.2)

`views_emitted` refuses when **any** band carries `default_off` and
`len(anims) != 1`. The constraint is on the **act's band count**, not on how many
bands carry the key — so the natural per-key validator ("are the bands
consistent about `default_off`?") **passes a two-band act in which BOTH bands
carry it**, which the build refuses. Aurora models it against the band count, and
`bg-override-section-ceiling.test.ts` has a row for the both-carry case
specifically. A second refusal: a `default_off` band's `pattern_px` must equal
`BGANIM_VIEW_DERIVED_PERIOD_PX`.

There is a third, unreachable-through-the-first: `default_off` bands must be the
TAIL of the band list (an inline assert in `main()`). Recorded in the vendored
contract; not enforced here, because obligation 1 already forces a single-band
act on every path that emits.

### Does the derivation agree with "80 offered where 47 admitted"?

**Yes, exactly, and it was derived here before that framing was read back.**
On aeon's shipped `games/sonic4/data/editor_bg_override.json` (320 tiles, one
`8x4` band, `default_off: true`, `pattern_px` 64, so the twins ARE emitted):

```
section       = (2 + 44) + 3*(2 + 44) + 32*256          = 8,376 B  of 20,480
slots allowed = floor((20480 - 46 - 3*46) / 256)        = 79       for the whole act
byte free     = 79 - 32                                 = 47
tile free     = 400 - 320                               = 80
```

**One correction to the framing's reach**, not to its numbers: 79 is the
allowance for the whole act **at any band count** (at 4 bands it is still 79),
so 47 is what is left after this act's own 32. The tile capacity is 400; a
document can be perfect against it and be five times over the section.

**Measured live in the running app** (§5): `binding: "bytes"`,
`byteSlotsRemaining: 47`, `tileSlotsRemaining: 80`.

---

## 3. Accepted before / refused after

**Instrument.** A temporary probe (`test/formats/zz-probe-*.test.ts`, deleted)
built a one-band document of `cols x 1` and printed `validateBgOverride`'s
verdict. Slot counts came in through the environment because HEAD's codec does
not export the byte constants at all, so a self-deriving fixture could not be
built there; the counts were derived once from the contract and printed.
`git stash` moved only `src/`, so the SAME probe ran against both codecs.

| slots | tiles | tile ceiling | **HEAD (08f5fe6b)** | **after** |
|---|---|---|---|---|
| 79 | 79 | 400 | ACCEPTED | ACCEPTED |
| **80** | 80 | 400 | **ACCEPTED** | **REFUSED** |
| 400 | 400 | 400 | ACCEPTED | REFUSED |

The refusal, verbatim:

> the emitted animation section would be 20526 bytes, over the ROM section
> ceiling of 20480. THE LIMIT IS ON THE ACT'S TOTAL, NEVER PER tile animation:
> the phase banks are one shared blob, and each animated slot costs 256 bytes of
> it. This act animates 80 slot(s) across 1 tile animation(s), and at that count
> the ceiling allows 79. This is a SECOND budget, independent of the tile
> capacity: a document can sit well inside the blob and still not fit the ROM
> section. Shrink or drop tile animations until the total fits.

Kept permanently as rows in `test/formats/bg-override-section-ceiling.test.ts`,
including the door form (`createBand` builds the 79 and refuses the 80) and, on
the REAL roomy fixture, the band the tile budget admits and the section refuses.

**The fixture that proves it was in the suite already, asserted backwards.**
`test/formats/bg-anim-band-roomy-insert.test.ts` had a row called *"accepts the
band that spends EXACTLY the free room"* which built a band of **80 slots on the
320-tile roomy document** — the 80 the panel offered. That row is now on the
BINDING budget, and the 80-slot band has a row of its own saying what it is.

---

## 4. What the panel says now

Read off the screen in the running app (§5), verbatim:

```
Blob 320/400 tiles · 80 free · 32 animated (slots 0..31) · 3 tile-animation slots left
ROM section 8376/20480 bytes · 47 more animated slots fit · this is the binding budget,
    not the 80 free blob slots above
costs 1 slot · 47 free (ROM section is the limit)
```

Both budgets stay on screen, because the answer to "why can I not add this" is
WHICH of the two ran out and a reader cannot see that from one number. When the
blob is the tighter one the second line says so instead. When the section cannot
be sized at all the line is a warning that says so and the spendable figure is
**zero** — never the looser tile number (§6).

The refusals name the budget too: the insert door explains the per-phase-bank
cost and says "This is a SECOND budget"; the promote door opens with *"promoting
does not grow the tile blob, but it DOES grow the ROM section"*, because
"promotion is free" is exactly the reading the old copy invited.

---

## 5. The CDP harness

`scratchpad/bganim-section-budget-harness.mjs`, `npm run harness:bganim-section-budget`.
**16/16 passed.** Screenshot: `docs/captures/2026-09-06-bganim-section-ceiling/panel-both-budgets.png`
(the harness writes its own copy into a git-ignored shots directory under
scratchpad; the path above is the tracked one, and it is the one to open).

```
AURORA_BUILT_TREE=<this worktree> \
ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
  npm run harness:bganim-section-budget
```

It reads the model back through `window.__dbg.aeon.bandBudget()` (widened with
the section fields for exactly this reason: the DOM cannot say WHICH budget a
number came from when the two agree) and recomputes aeon's formula independently
from the vendored contract. Row 3d is the anti-vacuous gate: it requires the two
budgets to DISAGREE on the document under test before believing anything on
screen. Row 5a hashes aeon's override file before and after: **the peer's live
tree is byte-identical**, measured rather than intended.

### Four false negatives it produced first, all of which looked like the defect

1. **It ran against the WRONG BUILD.** A linked worktree has no `node_modules`,
   so `runTarget`'s "both artifacts present" walk went up to the main checkout
   and served ITS `dist/` — reporting `tileCapacity: 448`, a number retired on
   2026-09-06. `AURORA_BUILT_TREE` pins it. The tool announced the borrow on
   stderr, which is the only reason this was caught.
2. **The section header selector was a styling guess.** Cribbed from
   `bganim-band-harness.mjs` (`text-transform: uppercase` + `letter-spacing:
   1px`); it matched nothing and returned `no-section`, i.e. "the feature is
   missing". Matching the TEXT works. ⚠ **`bganim-band-harness.mjs` is blind
   today for a second reason: it looks for a section titled "BG animation
   bands", which the rename to "Tile animations" retired.** Not fixed here.
3. **The panel is behind a SUB-TAB.** The Effects facet has three (`parallax`
   default), so clicking the Effects pill alone reaches a column where
   `BgAnimBandPanel` is not mounted at all. The DOM then reads exactly like "the
   readout does not render".
4. **Clicking every ancestor of the title toggled the section twice**, and an
   `innerText` read taken immediately after a click happens before React
   re-renders — so the toggle looked like a no-op. One click per attempt, and
   verify after a settle, back in node.

---

## 6. Plant proofs

Mutation quoted from `git diff` on disk, red run, restore with `git checkout --`
from the **committed** baseline, green run. Scoped to the affected files, not the
whole suite (stated as the bound).

| # | Planted | Red |
|---|---|---|
| P1 | the section check never fires (`if (true) return []`) | **10** failed / 54 passed |
| P2 | the quantifier becomes the natural per-key one (`off.length !== bands.length`) | **5** failed / 37 passed |
| P3 | unmeasurable falls back to the TILE budget (the permissive direction) | **2** failed / 9 passed |
| P4 | `sectionHarm` returns null: growth is never refused | **3** failed / 28 passed |
| P5 | the view-twin term dropped from the size formula | **2** failed / 40 passed |
| P6 | vendored `BGANIM_SECTION_CEILING` 20480 → 20481 | **2** currency rows failed (the ruled literal AND the `min`-over-the-table derivation) |
| P7 | vendored `BGANIM_BYTES_PER_SLOT` 256 → 128 | **1** currency row failed, naming the product it re-derives |

Each restored to green on the same files.

**NOT PLANTED, and it cannot be from here:** the currency extractor's guard that
every row of aeon's `BGANIM_SECTION_CEILINGS` still names
`BGANIM_SECTION_CEILING_RULED` (so the vendored ruled figure is still the
enforced minimum). Planting it means editing aeon, which is another lane's live
tree and read-only to this parcel. The guard throws with a message; nothing has
made it throw.

---

## 7. Two questions, not one rule — and DO NO HARM

The section ceiling is **not** in `validateBgOverride`, and the reason is a
finding rather than a convenience.

**Aurora's own `test/fixtures/bg-override/editor_bg_override.b0e5a661.json` does
not fit its ROM section, and never did.** Its two bands cover 192 animated slots
= **49,242 B against a 20,480 B ceiling (2.4x)** — the exact figure aeon's source
quotes when it records a per-band cap being refuted, and the reason aeon deleted
that content. Roughly forty rows across eight files were ADDING or PROMOTING on
it: the same finding one level down.

So:

* `validateBgOverride` answers *"is this document well-formed / would it bake
  correct art"*. `bganimSectionIssues` / `bgOverrideSectionIssues` answer *"will
  it FIT"*. Folding them together makes a budget failure indistinguishable from
  a corruption one for every caller that only wants the first.
* **READ** reports the section as a `notice`, never a refusal. A document can
  arrive over this budget and Aurora is the only tool that can bring it back
  under; refusing to open one leaves hand-edited JSON as the only recourse,
  which is the outcome the codec's docblock names as the thing sole ownership
  exists to prevent.
* **WRITE** carries it through, for the stronger version of the same reason:
  refusing to save would block the repair.
* **GROWTH** refuses. `refuseIfResultInvalid` takes the BEFORE document and
  refuses only a step backwards, so `demote` and `remove` stay open. Four cases,
  written down at `sectionHarm`.
* `createBand` refuses a band too large to exist in ANY act. Deliberately NOT
  inside `validateBandInIsolation`, which also runs on RESTORE
  (`planBandPromotion` re-admits a band the document already had) — a section
  rule there refuses to put back what a demotion just removed.

`test/support/bg-override-fixtures.ts` derives a section-roomy document from the
same real fixture through the codec's own demotion (same art, same blob, same
4096-word nametable, fewer ANIMATED slots) for the editing rows. Read, renumber
and remove rows keep the fixture as it ships, and the golden now asserts the one
notice it earns.

---

## 8. Corrections to this repo's own records

Found while re-vendoring; all three were in the `notVendored.default_off` entry
that this parcel deleted, and all three are recorded in the new amendment's
`correctionsToThisFile`.

1. It cited **`validate_default_off_coherence`**. **There is no such function**
   at either aeon revision: both refusals live in `views_emitted` and the
   tail-ordering assert is inline in `main()`. The currency gate did not catch
   it because that row greps for the disclosure's KEY (`default_off`), which
   appears all over the file — **a real bound on that instrument: it checks that
   a disclosed SYMBOL exists, and a `default_off` in prose satisfies it.**
2. It said aeon "refuses `default_off` set on some-but-not-all bands". That is
   the trap restated as the rule (§2).
3. It said adding the key to `bandKeys` "changes `BAND_KEYS`, which is the
   canonical WRITE ORDER". **It is not, and has not been since
   `canonical-json.ts` landed**: `serializeBgOverride` sorts keys alphabetically
   and recursively per empyrean §5.

---

## 9. What this does NOT establish

* **The unmeasurable arm was not driven on screen.** `binding: 'unmeasurable'`
  needs a two-band `default_off` act; no document on this machine is one, and
  the harness does not author one. Unit-covered (P2, P3), not CDP-covered.
* **`resolveStripDrag` is not bounded by the second budget.** The strip drag
  clamps to the BLOB, so on an act with little section room the gesture can
  still resolve a range the promote door refuses. Not a dead button — the panel
  prints the refusal and the strip is a proposal — but it is a gesture the new
  budget does not bound. Recorded in that file's own row.
* **No emulator, and no ROM was built.** Everything here is Aurora-side against
  aeon's source and its shipped document. Nothing claims what a built ROM does.
* **Line numbers in the vendored `authorities` entries are still checked by
  nothing** but a reader, including the eight added here. That bound is the
  currency gate's own disclosure and this parcel did not move it.
* **The plants were scoped to affected files**, not to whole-suite runs; the
  whole-suite figure is the green run below, not seven of them.
* **`bganim-band-harness.mjs` is blind after the "Tile animations" rename** (§5).
  Diagnosed, not fixed.

---

## 10. Runner

```
npm test:  517 files passed | 3 skipped (520)
           7543 tests passed | 9 skipped (7552)      rc=0
baseline:  515 files passed | 3 skipped (518)
           7492 tests passed | 9 skipped (7501)      rc=0
```
