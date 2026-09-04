# Five "NOT CERTIFIED" claims, re-measured — and two of them were understating

**Branch:** `docs/certification-record` (off master `30e42383`)
**Date:** 2026-09-03
**Scope:** comments and their tests only. No constant, no disclosure behaviour, no
painted string, no gate semantics changed.

---

## The one-paragraph answer

Two of the five flagged comments were stale, in two different directions, and both
of the facts behind them **are on unmerged aeon branches**, not on aeon's master.
That distinction is the load-bearing half of this parcel: a merge announcement is
not a merge, and "witnessed on a peer's branch" is a different claim from
"witnessed". Every new fact below was read firsthand through git objects at a
committed revision (`git -C ../aeon show <rev>:<path>`, `git merge-base
--is-ancestor`), never by path into a peer's working tree.

**Ancestry, measured, both NO:**

| branch | tip | ancestor of aeon `origin/master` `ddaab282`? |
|---|---|---|
| `origin/parcel/aurora-ramp-witness` | `a1a76741` | **NO** (`merge-base --is-ancestor` → 1) |
| `origin/parcel/sec6-baseswap-certify` | `7b11f929` | **NO** (`merge-base --is-ancestor` → 1) |

---

## Site by site

### 1. `src/core/formats/effects/preset-lag.ts:25` — item 6, `ramp` — **STALE, rewritten**

**Before:** *"⚠ MERGED, NOT CERTIFIED. NOTHING IN THIS REPOSITORY HAS SEEN A ROM
OBEY `ramp` … 'accepted at the door' and 'obeyed by a ROM' are different facts and
only the first is measured here."*

**Why it was stale — technically true and misleading.** Every word about *this
repository* is still correct, and that is exactly the problem: since it was
written, aeon drove a running machine on **this editor's own ramp document** and
the flat sentence would have let a reader conclude no machine anywhere had. That
is the family this lane spends its days removing.

**Verified here, firsthand:**

- `7a5d237d` — `raster_ramp_program` never two's-complement encoded a NEGATIVE
  `start`/`step` into its `u32` image fields, so **no ROM could hold a downward
  ramp at all**; sigil refused the *emission* (`[emit.out-of-range] -98304 does
  not fit u32`). Found by Aurora's document, fixed on the branch with a
  two-directional zero-byte pin.
- `12c188e1` — the wire half: the 34-byte record decoded out of `s4.debug.bin`
  matches the document in every field, `rrp_step` = `$FFFE8000` = -98304 = the
  authored **-1.5 px/line**; subject `aurora_local_rampctl_probe`, copied
  byte-for-byte from Aurora `b7e95791`.
- `0c97af98` — the picture half: arm 3 diffs the ramp against **its own record
  with `rrp_step` zeroed** (a four-byte control in work RAM), so the change is
  attributable to the step and nothing else.

**What the comment now also says, because it is what the witness does NOT say:**
the on-screen **slope** was never matched line-by-line against -1.5 (the span arm
deliberately uses step-0 twins, which measure which lines the run *reaches*, not
the rate applied to them); it is **emulation, not silicon**; and it is on a
branch.

> ⚠ **THE PARAGRAPH BELOW IS A DATED RECORD AND ITS PRESENT TENSE IS NO LONGER
> TRUE (2026-09-04).** The one-line disagreement closed at empyrean `e9409dc`:
> the contract's `top` sentence was the wrong one, it now reads `top + 2`, and
> Aurora's constant derives that — so Aurora no longer derives `top + 1`.
> ⚠ **AND THE CLOSING IS NARROWER THAN "the measurement won"** (empyrean
> `bfc000e`): the number is **as read on oracle's Rust core**, oracle's legacy
> C++ core reads both raster tiers one line earlier on the same ROM bytes and is
> disqualified as a referee for disagreeing with **itself** by 79–83 of 224 rows
> between two identical boots, the landing line is **UNPINNED** in the Rust
> core's own recon, and **no hardware referee exists.** So what settled is that
> two readers agree — not that hardware has answered. This packet's own point,
> that a comment reporting only the good half is a defect, is exactly why the
> paragraph is annotated rather than deleted. See
> `docs/reviews/2026-09-04-lag-attribution-false.md`.

**And the span is contested by exactly one line — written in, deliberately.**
Aurora derives first-displayed-line `top + 1`
(`EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG`, parsed from the contract schema's own
sentence). aeon's arm 4 measured **`top + 2`** on two documents with different
tops — `top 3` first rendered on line **5**, a control at `top 128` first rendered
on line **130**; two tops, the same one-line disagreement. Aurora's constant is
**unchanged** (out of scope and correct: it is parsed from the contract on
purpose), and aeon has likewise marked its own three statements of the rule
CONTESTED rather than silently fixing them, pending a third `top` and a CRAM
target (aeon `01e57172`; `docs/DEFERRED_WORK.md` § "RAMP BOUNDARY" and
`docs/benchmarks/effects-p3/RAMP-EVIDENCE.md`, both on that branch). A comment
reporting only the good half would be this same defect pointing the other way.

**Also folded in:** the block's old closing sentence — *"RELAYED, NOT MEASURED
HERE: aeon's generator half reportedly routes `start`/`step` only through
`fp16()` and carries a `-1.5` witness beside it"* — was a relay this parcel has
now measured, so it was replaced rather than left standing beside a firsthand
reading of the same thing. And the RE-OPEN CONDITION for item 6 now records that
it **already fired once, in the smallest possible way**: the negative-emission
failure *is* "a fixed-point spelling Aurora does not know about", found by an
Aurora document.

### 2. `src/core/formats/effects/preset-lag.ts:81` — item 4, `patch_world_ys` / `patch_motion` — **NOT stale, left, and said so**

Checked rather than assumed, because after site 1 a reader could easily take this
block for the same wording with two key names swapped in. There is **no witness
for either key anywhere this lane can see**: aeon `origin/master` `ddaab282`
carries none, and `origin/parcel/anchor-motion-key` / `origin/parcel/anchor-mover`
— the two branch names that could plausibly hold one — are both fully merged and
carry **zero commits of their own** (`git log origin/master..<branch>` empty for
each). Added exactly that paragraph; the claim itself is untouched.

### 3. `src/core/formats/effects/preset-lag.ts:119` — item 5, `cycles` / `variants` — **headline accurate; its pending condition has since been DECIDED**

The headline ("merged on aeon's master, not a certified chain, nothing here has
seen a ROM obey these keys") is still exactly true and was not weakened. But the
block's own revival condition — *"IF ANY OF CHAIN 199'S SEVEN GOLDENS DIFFERS FROM
CHAIN 198'S … the sentence COMES BACK"* — was written while chain 199 was
outstanding, and a reader stopping there goes looking for an answer that already
exists. Measured firsthand on sigil:

- `1eef8681` (freeze, chain 199, reachable on sigil `origin/master`): **FIXPOINT
  PASSED — all seven regenerated goldens byte-identical to 198's, this chain moves
  no ROM byte.** Four canonical shapes rebuilt from a fresh clean worktree with
  the ROMs deleted first; all four matched. **So the condition did NOT fire.**
- `1da03b9e` (attest): chain 199's run is recorded **RED on one test**, 4231
  passed / 1 failed — `no_landing_path_invokes_the_drift_job`, *sigil's own guard*
  that its drift job stays reachable only from its timer, tripped by sigil's own
  drift fix arriving on a master merge. Unrelated to item 5.

Appended as an appendix, with the point that "all seven goldens byte-identical"
means **no ROM byte moved**, so the chain cannot be, and is not, a ROM seen
obeying `cycles` or `variants`. Item 5 stays MERGED, NOT CERTIFIED.

### 4. `src/renderer/components/effects/BandPresetPanel.tsx:1447` — ramp card mount — **STALE, rewritten**

**Before:** *"⚠ MERGED, NOT CERTIFIED: nothing here has seen a ROM obey `ramp`."*

Same fact as site 1, so the same correction in the card's own register: aeon drove
a running machine on this editor's own document, the authored -1.5 is in the ROM
record and moves the picture against a four-byte control — **on a branch that is
not an ancestor of aeon's master**, in emulation not silicon, and with **this
card's own span readout's first-line rule contested by one line by that same
run**. Points at `preset-lag.ts` for the full record.

### 5. `src/renderer/components/effects/BandPresetPanel.tsx:1657` — base-swap card mount — **STALE, rewritten, and it understated differently**

**Before:** *"⚠ MERGED, NOT CERTIFIED HERE: aeon measured a generated section-6
program in the release listing; nothing in Aurora has seen a ROM."*

**Why this one understates in a different way from the ramp.** The ramp comment
denied a fact outright. This one described a **static** reading ("in the release
listing") that has since been superseded by a **running-machine** certification —
so it was not wrong, it was one layer too shallow, and it named the weaker of two
available proofs.

**Verified here** (aeon `1dbfc3c5`, totals at `4d20dcfa`, rebase re-verification
at `7b11f929`; the block in `docs/DEFERRED_WORK.md` on that branch):

- A running machine obeys the **GENERATED** program, separated from the
  hand-written `OJZ_BaseSwap` demo **three independent ways** — by ADDRESS
  (`Raster_Program` after the crossing = the generated symbol `$013C7A`, not the
  demo `$013D52`), by PATH (reached through the engine's own crossing: warp
  mailbox → `Parallax_CheckBoundary` → `Effects_InstallPreset` → `Raster_Install`,
  not a poke), and BY CONSTRUCTION in release (`OJZ_BaseSwap` emits **zero bytes**
  there, collapsing onto `OJZ_TestPal`).
- Footprint **lines 161..223 contiguous, 0..160 byte-identical**, in both shapes;
  control-vs-control 0/0 on both pairs; unchanged after 3× the frames.
- **The boundary was DERIVED, not fitted:** moving the document's `base_swap.line`
  160 → 100, regenerating and rebuilding, moved the measured boundary to **101**;
  the same mutated ROM read against the **unmutated** tree went cleanly **RED**.

**The two limits are carried into the comment verbatim in substance, because a
certification that hides its own boundary is what these flags existed to prevent:**
the **release-shape binding is proved STATICALLY, NOT WALKED** (the warp mailbox is
DEBUG-only, so the crossing itself is witnessed only in DEBUG), and this is
**EMULATION, NOT SILICON**. Plus the branch/ancestry fact, and that nothing in
Aurora has measured a ROM.

---

## Two more of the same family, found while in these files

### 6. `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts:64` — **fixed**

Header carried the same *"RELAYED, NOT MEASURED HERE … reportedly routes
`start`/`step` through `fp16()` and carries a `-1.5` witness"* sentence. Upgraded
to a reading, with the branch/ancestry, emulation-not-silicon and contested-span
qualifiers — and an explicit note that **none of it changes a single row in that
file**, which measures aeon's *page* at `origin/master` and nothing else. The
"no emulator, no build, no attest chain ran from this lane" clause is still true
and was kept.

### 7. `src/core/formats/effects/ramp-sign-lag.ts` — **fixed (a relay upgraded, the premise deliberately untouched)**

Carried *"(Aeon's fix is reported to live on their branch `parcel/aurora-ramp-witness`
— RELAYED, not measured here, and unmerged at the revision above.)"* Both halves
are now measured: the fix is aeon `7a5d237d`, and the branch is **not** an ancestor
of `origin/master` `ddaab282`.

**`RAMP_SIGN_FIELDS_AWAITING_AEON` STAYS FILLED, and that is the correct state, not
an oversight.** The drift row reads TIP; the constructor at TIP still forwards the
bare parameter; an author ramping downward today still cannot build. The paragraph
was written precisely so the next reader who hears "the sign fix landed" checks the
ancestry instead of emptying the list — the row reddens by itself on the merge,
which is the design.

---

## A citation this parcel refused to write

The brief pointed at an Aurora row `RAMP-BOUNDARY-CONTESTED` for the contested
span. **No such row exists in this tree** (`grep -rn 'RAMP-BOUNDARY-CONTESTED' src
test docs` → nothing). Citing it would have been the exact defect aeon fixed on
the same branch hours earlier (`a1a76741`: *"make the record-layout claim real
instead of citing a test that does not exist … a reader trusts it and stops
looking"*). The comments cite aeon's `docs/DEFERRED_WORK.md` § "RAMP BOUNDARY" and
`RAMP-EVIDENCE.md` — both read here — and `EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG`
in `preset.ts`, all of which exist.

---

## Wording pins

**None broke, and none needed updating.** Checked rather than assumed, because
several of these files have wording gates that read the panel source raw:

- `preset-lag-disclosure.test.ts` runs `stripComments()` over
  `BandPresetPanel.tsx` before every source assertion, so JSX comments are outside
  its reach by construction.
- `band-preset-wording.test.ts` (32), `ramp-control-wording.test.ts` (18),
  `band-vocabulary.test.ts` (5), `section-raster-select.test.ts`,
  `authoring-refusals.test.ts`, `ramp-sign-lag-disclosure.test.ts`,
  `effects-preset-schema-drift.test.ts` (16), `aeon-ramp-sign-drift.test.ts` (5)
  — all run green unchanged.

Targeted run of the seven closest files: **127 passed / 0 failed**, 0 skipped.

## Verification

`npm test`: **6843 passed / 8 skipped (6851 total)**.

**Reconciliation, so this is not filed as a discrepancy for the fourth time:**
master `30e42383` reads **6844 passed / 7 skipped** in the main checkout and
**6843 / 8** in a linked worktree — the `sibling-root` step-3 row is unmeasurable
in a worktree and skips instead of passing. **Identical totals (6851)**, and this
parcel adds and removes no rows: it is comments only.

`npm test` is ~27 s wall here, well inside the foreground cap, so it was run in
the foreground with the leg count read off its own summary.
