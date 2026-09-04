# EW-BOUNDARY-LAG-RETIRE — the panel was painting a false sentence, and retiring it inverted a poison

**Parcel** EW-BOUNDARY-LAG-RETIRE (project EFFECTS-W1) · **branch**
`feat/retire-boundary-lag` · **cut from** `abf35dcc` · **tip** `57a0a2eb` ·
**2026-09-04**

Four commits: `6c51e240` (the premise, the drift row, the disclosure test),
`315c2f73` (the CDP harness + its package.json registration), `37b4e19f` (the
harness's own instrument fix, found by its paired poison run), `57a0a2eb` (the
fourth reader of the premise, found by the full suite and not by anything scoped
to this parcel).

This closes the item `docs/reviews/2026-09-04-ew-boundary-panel.md` (row 152)
tagged as blocked on aeon: *"the no-build warning is on screen … aeon's generator
arm for this key has not landed yet."* It has landed. The warning is gone.

---

## 1. The premise, re-measured rather than relayed

The dispatch said aeon's arm had landed and told me not to take it from them.
Correct: the drift row's own message ends *"do NOT empty it on a merge
announcement, this row reads TIP."*

**aeon `origin/master` `b3af9847`** — "merge(boundary): an author can write the
boundary key and the bake reads it", 2026-09-04 08:35:23 -0400 —
`docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block, read through
`git show`:

```
preset:          bands, base_swap, boundary, cycles, id, patch_motion, patch_world_ys, ramp, schema, variants
preset-ignored:  name
preset-refused:  fires
```

`boundary` is in the **`preset:`** row — the ACCEPTED list. The arming
(`3394e8f6`, 05:54) was read at `8e45ebac`, where the key was in **none** of the
three rows, which is why the sentence said the sharper thing (aeon's
`_check_keys` meets an unmentioned key as an unknown property and `_refuse`
raises on the whole document).

**Three independent reads agree the lag closed**, and they were not the same
instrument:

1. this comment's `git show` of `b3af9847`'s blob;
2. the drift row itself, which resolves `origin/master` on every run — its
   baseline failure line reads *"the schema declares `[]`, and aeon's page does
   not ACCEPT them … expected `[]` to deeply equal `['boundary']`"*, and its
   title had independently resolved the tip to `b3af9847`;
3. a re-read at **`75cd390f`** ("status+log: boundary arm, gate class and the
   boot-read ratchet all landed", 08:47:16 -0400) — aeon's master moved
   mid-session, and `boundary` is in the `preset:` row there too.

⚠ **THAT THIRD READ WAS NOT PLANNED.** aeon's tip moved *during* a poison run and
the drift row printed the new SHA in its own title. Re-measuring was one command;
had the arm been reverted between the two revisions, emptying the premise on the
first read would have put the false sentence back in the other direction.

---

## 2. What changed

| file | change |
|---|---|
| `src/core/formats/effects/preset-lag.ts` | `PRESET_KEYS_AWAITING_AEON` → `Object.freeze([])`; header re-aimed; the item-6 block demoted to history |
| `test/formats/effects-preset-schema-drift.test.ts` | the `LAGGING` constant and the `PRESET_KEYS_AWAITING_AEON` import removed; the lag row asserts `[]`; two `&& !LAGGING.includes(k)` relaxations dropped |
| `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts` | re-aimed ARMED → RETIRED, for the fourth time; the poison's load-bearing direction inverted |
| `src/renderer/components/effects/__tests__/boundary-control-wording.test.ts` | **not in the parcel's scope** — the fourth reader; its ARMED row retired per its own message (§6 item 4) |
| `scratchpad/lag-retire-harness.mjs` | new; registered `npm run harness:lag-retire` |

**`BandPresetPanel.tsx` IS UNTOUCHED, AND THAT WAS THE CLAIM UNDER TEST.** Row
152's design claim was that the disclosure retires across all five mount sites
with no edit to any card: one constant, one derivation, `presetLagDisclosure()`
returning `null` on an empty list. It held. Had a component edit been needed,
that would have been the finding.

`PRESET_LAG_MEASURED_ON` stays `'2026-09-04'`. Not an oversight: the arming and
the retirement were measured the same day, hours apart, and a day is the field's
resolution. Said in the source so the next reader does not "fix" it.

---

## 3. ⚠ The poison's load-bearing direction inverted — which one, and why

`preset-lag-disclosure.test.ts` keeps **both** poison directions in **both**
states. Only which one carries weight changes, and it changed twice on 2026-09-04.

| premise | production state | the row that PROVES something | the row that restates production |
|---|---|---|---|
| `['boundary']` (05:54–now) | sentence on screen | stub **EMPTY** → demand SILENCE | stub NON-empty → demand the sentence |
| `[]` (this parcel) | silence | stub **NON-EMPTY** → demand the whole sentence | stub empty → demand silence |

**Today the load-bearing rows are the NON-EMPTY stubs.** With the list empty, the
empty stub *is* production: a leaf hard-wired to `return null` sails through it,
and the machinery could be dead while every row stayed green. The non-empty stub
is the only thing proving a re-armed lag would still reach an author at all five
surfaces.

Both are kept because between them they pin the gate **open and shut**. The row
titles now say which is which (`LOAD-BEARING TODAY: …`, and `POISON, the
direction that carried the weight while the lag was open: …`), so a reader
cannot take a green from the restating row as evidence the machinery works.

**Measured, not asserted.** Premise stubbed back to `['boundary']` on disk
(mutation shown in the commit), the two files run: **9 rows red**, including all
four per-surface silence rows. Restored with `git checkout` from the committed
baseline, not by hand.

⚠ **The drift test stayed GREEN under that poison, and that is correct.** In the
retired state it no longer reads the constant, so poisoning the constant cannot
move it — its subject is aeon's page. It was proven non-vacuous by its **own**
poison: a fake optional root key (`zzz_poison_key`) added to the vendored schema
on disk turned the lag row red (plus three neighbours). Restored from the
committed baseline. Two mutations, because the two rows have two different
subjects and a single poison would have left one of them unproven.

---

## 4. All five mount sites, on the running app

The node suite cannot see React — ~7,100 rows pass while a surface is visibly
broken, because they call the leaf as a plain function and walk what it returns.
`scratchpad/lag-retire-harness.mjs` drives the built app under CDP.

`BandPresetPanel.tsx` **654, 686, 1560, 1799, 1925**. The two sections are opened
by their own headers; the three cards are reached by **converting the document's
arm** through the Program select, since each card renders only for its own arm.

| id | site | arm | surface control | absent? |
|---|---|---|---|---|
| `ch` | channels section (654) | `bands` | `cycles` state select | **yes** |
| `an` | anchors section (686) | `bands` | `Channel 0` seed select | **yes** |
| `rp` | ramp card (1560) | `ramp` | `Top` spinner | **yes** |
| `bs` | base-swap card (1799) | `base_swap` | `Line` spinner | **yes** |
| `bd` | boundary card (1925) | `boundary` | `Lo` spinner | **yes** |

**13/13, 0 unmeasured, exit 0.** `dpr = 1` on every reading, printed beside every
rect.

### 4.1 ⚠ Why none of those greens is the vacuous kind

"The sentence is absent" passes on a blank screen, an unloaded project, a
collapsed section, a card that never rendered, and a typo in the selector. So no
absence is reported on its own:

- **`[<site>-a]` THE INSTRUMENT SAW ITS SUBJECT.** The document is in that card's
  arm — read back from `window.__dbg.aeon.presetsJson()`, **not inferred from the
  screen** — and a control only that surface has is PRESENT, VISIBLE, ENABLED and
  **inside its own scroller** (the rect compared against the scrolling ancestor's
  box; `checkVisibility()` and `getClientRects()` both go green on an element
  scrolled thousands of pixels out of its scroller).
- **`[<site>-b]`** runs only then. A site whose `-a` fails reports `-b` as
  **UNMEASURED**, never as a pass.
- **`[ctl]`** aims the *identical* finder at a sentence that IS on the same screen
  at the same moment and requires it painted. An absence measured by a finder
  that can find nothing is not a measurement.
- **The needle is READ OFF `preset-lag.ts`** (`PRESET_LAG_LEAD`), never typed — a
  harness carrying its own copy would report ABSENT for ever after a rewording,
  and the absence would be its own typo. It reads from `RUN.root`, the tree the
  **build** came from, which is a different directory from this script's checkout
  whenever a harness borrows a build.

**WHAT A GREEN RULES OUT**, stated because it is narrower than "it works": a card
that hard-coded the sentence; a mount still rendering it from a stale copy; and a
retirement that reached some surfaces and not others. It does **not** rule out
anything about aeon's build.

### 4.2 The paired run is what makes the absence a measurement

One file, one switch (`LAG_EXPECT`). Production is `absent`. The poison run is
`present`: the premise stubbed back on disk, **the tree rebuilt**, the same five
sites, the same selectors, the same gestures — the sentence required PAINTED and
carrying the whole claim.

```
premise []            rebuilt, LAG_EXPECT=absent    13/13, 0 unmeasured
premise ['boundary']  rebuilt, LAG_EXPECT=present   13/13, 0 unmeasured
premise []            rebuilt again, absent         13/13, 0 unmeasured   (after §5)
```

The run **refuses** when `LAG_EXPECT` disagrees with the premise on disk: running
the poison expectation against a production tree would fail five rows and read as
a broken panel rather than a mis-invoked rig.

---

## 5. ⚠ The finding the paired run produced, which a production-only rig could not have

The presence run reported the disclosure **NOT PAINTED at all five sites** on a
build where it was fully on screen — a 268×231 DIV, squarely in its scroller.

`PresetLagDisclosure` renders its lead words in their **own 31-character
`<span>`** inside the Hint carrying the rest. `PAINTED` selects the *shortest*
element containing the needle; with only the lead as a needle that is the span,
and every other needle then reads as absent.

⚠ **`scratchpad/boundary-control-harness.mjs` DOCUMENTS THIS EXACT TRAP**, in the
docblock above its own copy of the helper, and says what it cost there. This file
walked into it anyway, in the act of *simplifying* the helper to one needle. The
caution was one file away and reading it was not the same as keeping it.

Fixed by restoring the multi-needle selection: among elements carrying **every**
needle, take the shortest; fall back to the shortest overall so a real failure is
honest rather than null.

**Only the paired run could see it.** The absence run never reaches that
selection — absence is `all.length === 0`, computed before any element is chosen
— so it was green before the fix and green after, and its result stands
unchanged. A production-only harness would have reported 13/13 with a finder that
could not have identified the sentence if it *had* been there. Everything was
re-measured after the fix, because a method that tightens partway invalidates
what was claimed before it.

The `[ctl]` row also caught **itself**: its first needle, `'Saved to'`, matched 16
elements and the shortest was a different hint entirely ("Saved to
section_0.meta.json as rasterRef."), so the row failed against a finder working
perfectly. A control has to name something only its own subject says; the needle
is now the probe preset's own file path.

---

## 6. Four more things found, none of them asked for

1. **The header banner of `preset-lag.ts` was stale for seven hours.** Between
   `3394e8f6` (the arming) and this parcel it read *"THE LAG IS EMPTY. RETIRED
   (AGAIN) 2026-09-03"* while the constant below it held `['boundary']`. The
   arming re-aimed the constant's docblock and both test files and left the prose
   above them saying the opposite. **Nothing measures a banner, so nothing went
   red.** Same class as the sentence this parcel retires — a label outliving its
   justification — one layer up, in a comment.

2. **A coverage hole opened by a correct edit elsewhere.** The row asserting the
   drift test hardcodes no key name iterated `[...LIVE, ...THE_LAG_THAT_WAS,
   ...THE_LAG_BEFORE_THAT, 'cycles', 'variants']`. Moving `THE_LAG_THAT_WAS` from
   `['ramp']` to `['boundary']` — the *right* edit, since that constant means "the
   premise that JUST retired" — silently drops `ramp` from the checked set. Now
   written out (`cycles, variants, ramp, base_swap, boundary`) so it stops
   shrinking when a replay moves on.

3. **That staleness would have been invisible in the replay itself.** `ramp` and
   `boundary` are both sharper-flavour and both singular, so every row driven by
   `THE_LAG_THAT_WAS` reads *identically* either way. Recorded in its docblock.

4. ⚠ **THE PREMISE HAD A FOURTH READER, AND EVERY CHECK SCOPED TO THIS PARCEL
   MISSED IT.** `boundary-control-wording.test.ts` asserts *"the premise this
   card discloses is currently ARMED for `boundary`"* — a different file, about a
   different subject (the boundary card's wording rules). After the three scoped
   files were re-aimed, **both named suites, the typecheck and the whole CDP
   harness were green and the repo was still red.** Only `npm test` across the
   repo saw it. It was retired per its own message (*"do not re-arm the list to
   make this green"*), not relaxed, and its replacement asserts the mirror plus
   the sentence a re-opened lag would put back — without that second half the
   retirement could have silently disabled the disclosure and the row would not
   have cared.

   **The census, and the pattern in it:**

   | reader | how it holds the state | needed an edit |
   |---|---|---|
   | `preset-lag.ts` | the premise itself | — |
   | `PresetLagDisclosure.tsx` | derives | no |
   | `BandPresetPanel.tsx` | five mounts, no premise reference | **no** (§2) |
   | `preset-lag-disclosure.test.ts` | hand-typed expectation | yes |
   | `effects-preset-schema-drift.test.ts` | hand-typed expectation | yes |
   | `boundary-control-wording.test.ts` | hand-typed expectation | **yes — missed** |
   | `scratchpad/lag-retire-harness.mjs` | reads off disk, branches | no |
   | `scratchpad/variant-cycle-harness.mjs` | reads off disk, branches | no |

   The two harnesses are immune to a flip **in either direction** because they
   READ the premise and branch on it. The three test files hand-type the state
   they expect — which is why three had to be re-aimed by hand and why one got
   missed. A census of who reads a premise is not the same as the list of files a
   change was scoped to.

Also corrected: `preset-lag.ts`'s "TWO readers" section described the leaf as
mounted "in BOTH the channels section and the anchors section". It has been five
since EW-BOUNDARY-PANEL.

---

## 7. Verification

| | result |
|---|---|
| `npm test` **before** (master, `abf35dcc`) | **1 failed / 7164 passed / 9 skipped (7174)** · 1 failed / 499 passed / 3 skipped (503 files) · rc 1 |
| `npm test` **mid-parcel** (after `37b4e19f`) | **1 failed / 7165 passed / 9 skipped (7175)** · rc 1 — §6 item 4, the fourth reader |
| `npm test` **after** (`57a0a2eb`) | **0 failed / 7166 passed / 9 skipped (7175)** · 500 passed / 3 skipped (503 files) · **rc 0** |
| `npm run typecheck` | clean |
| `npm run harness:lag-retire` | **13/13, 0 unmeasured, exit 0** |
| `LAG_EXPECT=present` (poisoned build) | **13/13, 0 unmeasured, exit 0** |
| `node scratchpad/check-harness-guards.mjs` | **216/216 clean, 0 failures** |

All three suite runs measured in this session, in this worktree, aggregate totals
read off the runner's own summary line — never a tail.

**THE BEFORE FAILURE WAS THE LAG ROW AND NOTHING ELSE**, so master was red on
exactly the thing this parcel retires and green everywhere else. No other row was
red at any point, and nothing unrelated was folded in.

⚠ **THE MIDDLE ROW IS NOT BOOKKEEPING.** Three files were re-aimed and the two
named suites, the typecheck and the CDP harness were all green — and the repo was
still red, on a reader in a fourth file the parcel was not scoped to. It is
recorded because a report that showed only the first and last rows would have
implied a clean sweep that did not happen. See §6 item 4.

Test count 7174 → 7175 (+1): the disclosure test's retired shape trades one row
for two (`the LIVE sentence says the SHARPER flavour` retires; `NO SURFACE IN THE
PANEL IS DISCLOSED AGAINST ANY MORE` and the boundary card's
`carries no hand-typed copy` arrive).

The harness runs against a **fresh `git archive origin/master` copy** of aeon in a
temp dir, deleted after — never the live checkout — so no save can reach the
owner's tree and a preset aeon lands mid-run cannot change what was measured.

The final harness figure is from a run on the **committed tree at `d2534d83`**,
after a rebuild — not carried over from the earlier run.

### 7.1 ⚠ Two instrument notes from the final pass, both near-misses

1. **`assertFreshBuild` REFUSED the first attempt at that final run, correctly.**
   The §6-item-4 fix edits a file under `src/`, so `dist/` became staler than
   `src/` and the gate threw rather than measuring. It cannot know the edited file
   is a test that never enters the bundle, and it should not guess: a run whose
   bundle cannot be shown fresh is a run whose every row may be vacuous. Rebuilt,
   re-run, 13/13. **This is the "loud on unmeasurable" property working**, and it
   is recorded because the tempting reading — "it's only a test file, the number
   still stands" — is exactly how a stale measurement gets reported as a fresh
   one.

2. ⚠ **AN `rc=0` I ALMOST BELIEVED WAS THE GREP'S, NOT THE HARNESS'S.** The run
   before that was invoked as `npm run -s harness:lag-retire | grep … ; echo
   rc=$?`, which reports the **last** command in the pipeline. It printed `rc=0`
   over a harness that had already died on the freshness gate, and the grep
   pattern happened to match nothing alarming. Caught by re-running with the
   output redirected to a file and `$?` read off the harness itself. Every exit
   code quoted in this packet was read that way.

---

## 8. ⚠ What this does NOT say

- **Nothing here has seen a boundary preset BUILD**, let alone a ROM obey one.
  What retired is a sentence about what aeon's **page ACCEPTS** — the vocabulary,
  which is the only fact this repo can measure. "Accepted at the door", "obeyed
  by a machine" and "certified" are three different facts and only the first
  exists here.
- **No emulator was touched**, by invariant. Nothing in this parcel used
  `mcp__oracle__*`.
- aeon's own merge message records two findings the CR did not carry — `boundary`
  lowers into `ep_patched` rather than `ep_raster`, and a fourth
  `{stem}_sec_patched` chooser was added to keep a patched image out of the static
  raster channel. That is aeon's build's business; no row here stands in for it.

**RE-OPEN CONDITION**, in `preset-lag.ts` so it cannot become permanent by
accident: if aeon's build REFUSES a document Aurora actually writes under
`boundary` — a bound, a unit, a sentinel, an `offscreen_ship` spelling, or the
capability behind the patched arm — then "aeon reads this key" is true of the
vocabulary and false of the documents this editor produces, and the disclosure
comes back with wording that says so. That condition has fired before, on `ramp`:
see `ramp-sign-lag.ts`.

---

## 9. Open — for a foreground lane

- **TAGGED, NOT DONE: nobody has built a `boundary` preset.** The natural next
  measurement is to run aeon's generator over a document this panel writes and
  confirm it lowers — which needs aeon's toolchain, not Aurora's. Until then the
  honest claim is exactly the one in §8.
- `ramp-sign-lag.ts` remains correctly **ARMED**; it measures a different fact
  (aeon's constructor encoding a negative step) and nothing here touches it.
- **NOT FIXED, DELIBERATELY OUT OF SCOPE:** `scratchpad/variant-cycle-harness.mjs`
  carries a comment reading *"EMPTY again since 2026-09-03 … this flag has flipped
  four times"*. The value it describes is derived from disk, so the harness is
  CORRECT in both states and needs no edit — but the prose is now wrong about the
  date and the count. It is the same class as §6 item 1 (a label outliving its
  justification, in a comment nothing measures), noted rather than folded into a
  parcel that was not scoped to that file.
- **The re-open condition is worth re-reading if `ramp`'s history repeats.** The
  narrower `ramp-sign-lag.ts` exists because aeon accepted the `ramp` key at the
  door and then refused a document Aurora actually wrote under it. `boundary`'s
  authoring surface writes eight numbers, four of which have **no schema range at
  all** (row 152 §1), so it has more room for that same shape than `ramp` did.
