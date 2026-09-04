# EW-TIMELINE-CLOCK — warning an author when a sweep cannot fit its band

**Parcel** EW-TIMELINE-CLOCK (the band-fit half; row 95's authoring surface and clock
shipped 2026-09-03 and are not re-litigated here).
**Branch** `ew-timeline-clock`, cut from `ae1d618b`.
**Date** 2026-09-04.
**Source of the data** aeon `games/sonic4/data/generated/effects_channel_bands.json`,
vendored at aeon **`776a3ea1ad30d59f0b43ec4f2b39a812390e5038`**, blob
**`a00e3bb0a7f4445a9d886734a14ee8b0a905bbd9`**.

---

## 1. What the feature is, and the one sentence that decides its whole shape

aeon publishes, for the first time, the screen band each raster patch channel's boundary is
confined to — the `patchable(lo:, hi:)` of the channel's own declaration. Its `how_to_use`
states the fit rule and then, in the same breath, states that **the rule only works in one
direction**:

> A sweep on channel c fits when its PEAK-TO-PEAK TRAVEL (2 \* (256 >> amp_shift), whole
> pixels) is <= channels\[c\].lines. … THE TEST IS ONE-DIRECTIONAL: travel > lines is a
> CERTAIN refusal and worth warning on; travel <= lines is CANNOT TELL, never a clearance —
> the latched line is (anchor - Camera_Y), so where the sweep sits inside \[lo, hi\] is
> camera-dependent and unknowable at author time.

So Aurora warns, and never reassures. The obvious build — a green "fits ✓" beside the
`Travel` select — is the one thing this data forbids, because an author who has been told it
fits stops looking and Aurora cannot honour the claim.

**That is enforced at the type level, not by a comment.** `AnchorBandFit` has three arms —
`no-band`, `cannot-tell`, `cannot-fit` — and **no `fits` arm exists to return**. A comment
saying "do not add a pass" is one `||` away from being ignored; an unrepresentable state is
not. The module-load guard on the contract sentence says the same thing to whoever re-vendors
next: *"If aeon has made the fit two-directional, `AnchorBandFit` can grow a `fits` arm —
until then it deliberately cannot."*

---

## 2. The claim I was asked to check, and it survived

> `ANCHOR_AMP_RUNGS` carries `peak_to_peak_px` … **verify that it really equals
> `2 * (256 >> amp_shift)` rather than assuming it does.**

**It does, on all seven rungs — and nothing had ever compared the two documents that say so.**

- `preset.ts` builds the ladder from **empyrean's preset schema**, parsing `256` out of its
  prose (*"peak excursion 256 >> amp\_shift px"*) and doubling it.
- The fit rule is stated in **aeon's bands sidecar** as `2 * (256 >> amp_shift)`.

Two contracts, two repos, one quantity. `channel-bands.ts` now parses aeon's multiplier and
base **out of its sentence** (never typed) and asserts the equality per rung at module load.
Measured: `128 64 32 16 8 4 2` from both sides.

**Why the factor is parsed and not remembered:** aeon's own sentence said `256 >> amp_shift`
— PEAK, half the travel — until aeon `8d217dd4`, a correction this lane reported. A fit test
built on that wording is wrong by 2× **in the permissive direction**: silent on sweeps that
certainly do not fit, which is the failure nobody reports. The pin is therefore deliberately
at or after that commit, and the sidecar records why.

---

## 3. The finding that matters most for anyone maintaining this

**With sonic4's declared bands, the warning is reachable on exactly ONE channel.**

| channel | band | lines | rungs that can be refused |
|---|---|---|---|
| 0 | \[3, 220\] | 218 | **none** — the widest rung travels 128 px |
| 1 | \[222, 223\] | 2 | **six of seven**; the seventh (travel 2 == lines 2) is the boundary CANNOT-TELL |
| 2, 3 | *not declared* | — | none — `no-band`, a different silence |

Channel 0 cannot produce a warning under any legal sweep. That is a property of the data, not
of the code, and it is the exact shape of this repo's dominant defect class: **a check aimed
at channel 0 would be green forever with the comparison inverted, deleted, or pointed at the
wrong field.**

Two things follow, and both are built:

1. Every firing row aims at **channel 1**; `[6b]` and `[10b]` state channel 0's
   unreachability as a *measured* fact rather than letting it hide.
2. `RASTER_MAX_PATCH` is 4 and only 2 channels have bands, so channels 2 and 3 are
   `no-band` — **never a warning and never a clearance**. `[6e]` asserts that by **verdict**,
   not by absence of a message, so it is distinguishable from `[6d]`'s silence.

---

## 4. The wording, and why "clipped" is not in it

Leaving the band is **asymmetric**, and one over-long sweep reaches both ends depending on
where the camera is:

- **past `hi`** — `drop`. The record is *not emitted this frame*: no boundary is drawn
  anywhere and the band vanishes. **It does not pin to `hi`.**
- **below `lo`** — `clamp_up`. The record *is* emitted, clamped up, so the boundary pins at
  the top of the band and **stays visible**.

A single tidy verb describes at most one of those. The sentence on screen (measured off the
live DOM, `[10a]`):

> 128 px of travel cannot fit channel 1: the engine confines this channel's boundary to
> screen lines 222–223, which is 2 lines counted inclusively, and 128 > 2. The camera decides
> where the sweep sits in that band, so both ends are reachable and they do not behave alike:
> past line 223 the record is not emitted at all — no boundary is drawn anywhere and the band
> vanishes for that frame, it does not pin to 223; below line 222 it is still emitted,
> clamped up to 222, so the boundary pins at the top of the band and stays visible. Pick a
> smaller Travel.

Both behaviours are read out of the sidecar's own `edges` block; `channel-bands.ts` throws at
load if either stops saying what it says today (proven: changing `hi.behaviour` to
`clamp_down` aborts with *"it must be rewritten, not re-pointed"*).

**Units: nothing converts.** `units` says SCREEN LINES, 1:1 with the authored
`patchable(lo:, hi:)`, and the engine's single `-1` is already applied in
`Raster_BuildSchedule`. `[6c]` asserts no `±1` reached the screen; the module refuses to load
a document whose `lines` is not the inclusive count over `[lo, hi]`.

---

## 5. Vendoring, and the currency question a pin cannot answer (bar 19)

`src/core/formats/effects/aeon-effects-channel-bands.json` + `.provenance.json`.

**It is in `src/`, not `test/fixtures/`, and that is deliberate**: it is read at RUNTIME to
compute the warning, so it sits beside the two vendored schemas and takes the *schema* gate's
shape (`effects-preset-schema-drift.test.ts`), not `aeon-fixture-currency.test.ts`'s, whose
table is scoped to `test/fixtures`. That is stated in the sidecar so nobody looks for it in
the wrong instrument.

`test/formats/effects-channel-bands-drift.test.ts`, 7 rows, four questions:

1. **Byte identity** — `gitBlobSha(on-disk bytes)` equals the recorded aeon blob. Needs no
   peer at all; the blob id is aeon's OWN object id, so the pin is *checkable*, not copied.
2. **The sidecar describes the file on disk** — path, blob, byte count.
3. **CURRENCY** — reads aeon at a **committed** revision through git objects
   (`git -C <aeon> show <rev>:<path>`), names the revision in every message, compares
   **content not commit SHAs**, fails prefixed *"NOT AN AURORA REGRESSION"*, and skips
   **loudly** (`SKIPPED, NOT PASSED: … CANNOT MEASURE …`).
4. **The pin is PUBLISHED** — `isAncestor(776a3ea1, origin/master)`.

Plus two interlocks that need no peer: the ladder agreement (§2) and the inclusive-count rule.

**Corollary (a) proven — the golden cannot be reading the peer.** With
`EMPYREAN_SUITE_ROOT` pointed at an empty directory:

```
Tests  44 passed | 2 skipped (46)
  ↓ … matches games/sonic4/data/generated/effects_channel_bands.json at aeon origin/master
      [note] SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR) —
             CANNOT MEASURE whether the pin 776a3ea1… is still current
  ↓ … the pinned aeon revision is PUBLISHED, not local-only
      [note] SKIPPED, NOT PASSED: … CANNOT MEASURE whether 776a3ea1… is reachable from origin/master
```

Every pin, interlock and behaviour row still passes with the peer gone; only the two rows
that *are about the peer* skip, and each names the revision it could not measure.

**One repair the plants forced.** The first form of the currency message said *"changed
between them"* while printing the same blob on both sides — because I had mutated **our**
copy, not aeon's. A reader would have gone to the wrong repo. It now hashes the on-disk bytes
and branches: `THE VENDORED COPY HERE has been edited away from the pin — that is an
Aurora-side change, not aeon drift`.

---

## 6. Red-first — every plant, with the mutation quoted

Node suite (`src/renderer/providers/__tests__/effects-preset-anchors.test.ts`,
`test/formats/effects-channel-bands-drift.test.ts`). Each mutation applied on disk, shown by
`git diff -U0`, and restored with `git checkout HEAD --` from a **committed** baseline on a
clean tree.

| # | mutation | result |
|---|---|---|
| P1 | `travelPx > band.lines` → `travelPx < band.lines` | **RED 4**: `[6b] [6c] [6d] [6f]`. `AssertionError: expected Set{ 'cannot-fit' } to deeply equal Set{ 'cannot-tell' }` |
| P2 | `> band.lines` → `> band.lines + 1` (the ±1 the units field forbids) | **RED 1**: `[6b]` only — `expected 'cannot-tell' to be 'cannot-fit'`. Only the boundary probe catches it, which is why it exists |
| P3 | `anchorSweepBandRefusal` returns `'Fits — this sweep stays inside the band.'` on `cannot-tell` | **RED 1**: `[6d]` — `expected 'Fits — this sweep stays inside the ba…' to be null` |
| P4 | vendored JSON: `lines: 218` → `217` (leaving `hi` alone) | **module-load THROW**, loudly: *"channel 0 declares lines 217 for the band \[3, 220\], but an INCLUSIVE count over that range is 218"* — the file never imports |
| P5 | vendored JSON: `hi: 220 → 219` **and** `lines: 218 → 217` (internally consistent, so the load guard cannot swallow it) | **RED 2**: byte-identity and CURRENCY, the latter with the revision named and the Aurora-side diagnosis |
| P6 | vendored JSON: `PEAK-TO-PEAK TRAVEL (2 * …` → `(1 * …` — *aeon's own pre-`8d217dd4` defect* | **module-load THROW** listing all seven rungs: *"amp\_shift 2: the preset schema's ladder says 128 px peak-to-peak, aeon's fit formula says 64 px"* … |
| P7 | vendored JSON: `edges.hi.behaviour` `drop` → `clamp_down` | **module-load THROW**: *"it must be rewritten, not re-pointed"* |
| P8 | vendored JSON: the one-directional sentence softened to *"travel <= lines is a clearance"* | **module-load THROW**: *"If aeon has made the fit two-directional, `AnchorBandFit` can grow a `fits` arm — until then it deliberately cannot"* |

**"If this row went green for a reason other than the rule holding, what would that reason
be?"** — asked separately from "does it fire", and three candidates ruled out by name in the
test's own header: (i) the channel under test cannot express a refusal at all → `[6b]` states
channel 0's unreachability as a measurement and every firing row uses channel 1; (ii) the
helper returns `null` for an unrelated reason (off-ladder shift, undeclared channel) →
`[6d]`, `[6e]`, `[6g]` assert the **verdict**, not the sentence, so the three silences are
told apart; (iii) a matcher loose enough to catch a neighbouring refusal → `[6c]` pins the
numbers *inside* the sentence and `[6f]` pins both edge behaviours, which no other refusal on
this panel mentions.

---

## 7. On screen — and a trap every worktree agent here will hit

`scratchpad/anchor-authoring-harness.mjs` gained rows `[10a]`–`[10c]`. **31/31**, 42.7 s,
xvfb 1680×1050, fresh `VITE_AURORA_DEBUG=1` build.

The rows had to be written against a **second card**: `IN_ROW` takes the FIRST element whose
row-label matches, which for `Travel` is always channel 0's — the one channel where the
warning can never fire. `IN_CARD_ROW` / `CARD_TEXT` scope a control and its sentences to
channel N's own `Card`. `CARD_TEXT` rather than the section-wide `WARNINGS` on purpose: a
section-wide match is satisfied by the seed refusal, the extend refusal or the
motion-without-seed advisory.

| row | claim | plant that reddens it |
|---|---|---|
| `[10a]` | the sentence is PAINTED in channel 1's card, names travel/band/inequality, names BOTH edge behaviours, contains no "clip", and the control is inside the scroller and hit-testable | `if (fit) return null;` → **RED**, 30/31 |
| `[10b]` | CONTROL: the same rung on channel 0 paints no warning **and no clearance** | — (see below) |
| `[10c]` | at travel == lines — the widest that FITS — nothing replaces the warning: no "fits", no "ok", no ✓ | the `Fits … ✓` plant → **RED**, 30/31 |

**⚠ `[10b]` was found weak by running a plant, and is stated rather than quietly fixed.** The
clearance plant painted "Fits ✓" on every cannot-tell channel — including channel 0 — and
`[10b]` stayed **GREEN**, because a clearance is not a warning and `[10b]` only forbade the
warning. `[10c]` caught it. `[10b]` now also refuses `/fits/i` and `✓`.

**⚠ AND `[10b]`/`[10c]` CAN ONLY EVER GO GREEN ON A SILENTLY-BROKEN FEATURE.** They are
absence assertions; an app with no band warning at all satisfies both. `[10a]` is the
discriminator, and it has two independent red-firsts (the deliberate plant, and run 1 below).

**THE TRAP, and it cost a run.** `scratchpad/lib/run-root.mjs` walks *up* for a tree with
BOTH `dist/main/index.mjs` and `node_modules/.bin/electron`. A linked worktree has no
`node_modules`, so my in-worktree `electron-vite build` was **not what ran** — the harness
announced `BORROWED` on stderr and drove the main checkout's app, which does not have this
feature. `[10a]` came back red against an app that never had the code, and `[10b]`/`[10c]`
came back **green** against that same app. Fix: symlink the electron binary into the
worktree (`node_modules/` is gitignored), after which the banner reads `in-tree`. Row 117's
retirement note records the same class with `AURORA_BUILT_TREE`; this is a second instance
and the banner is the instrument — read it before believing any harness row.

Screenshot: `scratchpad/shots-anchor-authoring/anchors-section-open.png` (gitignored),
captured with channel 1 back on the violating rung so the new sentence is in frame.

---

## 8. Verified

- `npm test` — **492 files passed / 3 skipped (495); 6977 tests passed / 9 skipped (6986); 0
  failed.** All 9 skips pre-existing and loud (absent `s4_engine` tree ×2, opt-in bench,
  live-warp ×2, `sibling-root` step 3 unmeasurable in a linked worktree, and the two currency
  rows only when the peer is hidden). `tsc --noEmit` clean; all eight `check:*` scripts in the
  chain green.
- The two touched files alone: **46/46**.
- Peer-absent run (`EMPYREAN_SUITE_ROOT` → empty dir): **44 passed / 2 skipped (46)**.
- `npm run harness:anchor-authoring`: **31/31**.

## 9. Open, and tagged rather than claimed

- **NO EMULATOR, NO ROM, NO aeon BUILD.** Nothing here has watched an anchor leave a band.
  The engine behaviours in the sentence are aeon's written statements at `776a3ea1`, not
  observations of mine. **TAGGED for foreground follow-up** if runtime confirmation is
  wanted.
- **The bands are `game: "sonic4"`.** The module exposes `EFFECTS_CHANNEL_BANDS_GAME` and the
  sidecar records the scope, but nothing today refuses to apply sonic4's bands to a
  hypothetical other game's preset, because Aurora has no other game to apply them to.
  Left legible rather than guarded against a case that does not exist.
- **`cannot-tell` says nothing on screen, deliberately.** The only true sentence would be
  "we cannot tell", which is what an empty hint already means everywhere on this panel. If an
  author ever asks for it, the verdict is already exposed by `anchorSweepBandFit`.
- **The `no-band` silence for channels 2 and 3 is invisible to an author.** They see nothing
  and cannot tell it apart from a fit. Making that visible needs aeon to declare bands for
  those channels, or a sentence saying "aeon declares no band for this channel", which is a
  wording call I did not make unilaterally.
