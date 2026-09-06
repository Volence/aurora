# Two sentences a person reads: one clipped, one ambiguous — and one that went false mid-parcel

**Branch** `parcel/two-sentences` · **2026-09-06**

Two small sentences on the Effects tab. Half A was a 385-character refusal painted
across the top of the window; Half B was a byte figure that could not be
reconciled with aeon's own helper. Between the brief and the work, aeon landed a
decoupling fix and **Half A's sentence stopped being true**, which turned the
parcel from a layout repair into a retirement plus a layout repair.

Everything below is measured on this worktree, one run per claim, `dpr` and the
raw rects beside every geometric number.

---

## 0. The three answers, up front

| | Verdict |
|---|---|
| **Half A, the overflow** | **PRE-EXISTING.** Identical at current master `1e770b0c` and at `60e265b9`, the master the `default_off` parcel branched from. It first became visible one parcel EARLIER than the capture that reported it. |
| **Half A, the sentence** | **FALSE, and retired.** aeon's decouple removed the wall the sentence described. The refusal an author met came from the CODEC, not from the disclosure the brief named. |
| **Half A, the layout** | **STILL BROKEN after the retirement**, proved with a synthetic long line, and fixed in `OptionBar` for all five facets that mount one. |
| **Half B** | Shipped. The figure names its shape, and the byte count is derived. |

---

## 1. Half A, part one: the measurement the brief asked for

`scratchpad/effects-bar-overflow-harness.mjs`, `npm run harness:effects-bar-overflow`.
It opens aeon's project read-only, clicks the Effects pill, and compares the
trailing line's rect **to the bar's own box** — never to the viewport, which goes
green on a bar overflowing by 200px as long as the window is tall.

**dpr 1, window 1400x872, one run per revision. All five rows below come from the
final instrument** (see §1.2 — the first one had a defect of its own).

| Revision | What the bar says | `barRect` | `spanRect` | over top / bottom |
|---|---|---|---|---|
| `08f5fe6b` — before the section-ceiling parcel | `Click + drag to pan, scroll to zoom` (35 ch) | 74..106, h 32 | 91..106, h 15 | **inside** (−8 / −9) |
| `60e265b9` — master before the `default_off` parcel | the twin refusal (385 ch) | 74..106, h 32 | 67..112, h 45 | **+7 / +6** |
| `1e770b0c` — current master | the twin refusal (385 ch) | 74..106, h 32 | 67..112, h 45 | **+7 / +6** |
| this branch, refusal retired | `Click + drag to pan, scroll to zoom` (35 ch) | 74..106, h 32 | 91..106, h 15 | inside |
| this branch + a **synthetic** long line + no fix | the same 385 chars, planted (392 ch) | 74..106, h 32 | 67..112, h 45 | **+7 / +6** |
| this branch + that plant + **the fix** | the same 392 chars | 74..**122**, h **48** | 75..120, h 45 | **inside** (−1 / −2) |
| this branch + the fix, resting | 35 ch | 74..106, **h 32** | 91..106 | inside |

**Captures, tracked, one per row of that table:**
`docs/captures/2026-09-06-two-sentences/0-pre-ceiling-08f5fe6b-clean.png`,
`1-master-1e770b0c-overflow.png`, `2-branch-refusal-retired.png`,
`3-synthetic-long-line-no-fix.png`, `4-synthetic-long-line-with-fix.png`,
`5-fix-resting-still-32px.png`. (The harness writes its own copies to a
git-ignored shots directory under the scratchpad, which is why these are copied
here instead of cited there.)

**So: PRE-EXISTING.** `60e265b9` and `1e770b0c` are byte-identical in every rect,
so the parcel that landed at `1e770b0c` did not introduce it — which is what its
own packet said it could not rule on, and it was right.

**But not "always there" either, and that is the third row's job.** At `08f5fe6b`
the same state renders a 35-character tool hint 15px tall and the bar is clean,
8/8. The layout has always been *able* to do this; the 385-character string that
`0944d4a7` (the section-ceiling parcel, 08:26) put on that bar is the first line
long enough to make it happen. Neither of the two revisions the brief named is
where it started.

### 1.1 What "clipped" turned out to mean

**Nothing is hidden, on any revision.** `spanScrollHeight === spanClientHeight`
(45 = 45) and the nearest clipping ancestor is 838px tall, so every word of the
sentence is on screen. What the capture reads as clipping is the sentence painting
**over** the facet pills above it and under the chips beside it — three text lines
in a 32px box, centred, 7px out of the top and 6px out of the bottom.

That fact decided the fix. See §3.

### 1.2 Two instrument defects, both mine, both found by their own subject

**The finder inherited the defect it measures.** My first predicate matched
`height === '32px'`. The repair lets the bar grow, so the first run after it
reported *"the Effects tool-options bar was found: no"* for a bar that was on
screen and correct. The height is now READ, never matched on. Every number in the
table above was re-taken with the final instrument — including `1e770b0c`, which
reproduced its rects exactly.

⚠ `60e265b9` and `08f5fe6b` were measured with the FIRST finder and not re-taken.
The two finders were shown to agree on the same state at `1e770b0c`, which is why
their rows stand; it is an inference, not a re-run, and it is the one place in
this table where that is true.

**And a node the harness could not run.** Two backticks inside a `String.raw`
template ended it mid-sentence, twice. The comments now say so, the way the
harness next door does.

---

## 2. Half A, part two: the sentence went false, and the brief named the wrong site

Mid-parcel the coordinator reported aeon's decouple and asked for
`TWIN_COUPLING_DISCLOSURE`, `twinCouplingApplies` and the one `Hint` to come down.

**I read aeon myself at a committed revision before touching anything**, as
instructed, and it changes the scope rather than confirming it.

### 2.1 What I read, and where

`364b7bce042ba380d192be2d5960a5f59fb597b5` — **verified an ancestor** of aeon's
`origin/master` `d070d6d71d1be63ac00dddf2e87616b8fce22614` with
`git merge-base --is-ancestor` before anything moved. Both documents read at
`origin/master`. **aeon's checkout is another lane's live tree; nothing was
written to it and nothing was read from its worktree state.**

* `tools/inject_editor_bg.py` — `view_emission(anims)` now returns
  `(n_views, note)`; `views_emitted(anims)` is its count half. Both
  `AssertionError`s are gone, from BOTH arms (the band count and the period).
  `band_emission_order(anims)` replaced the tail assertion with a reorder.
* `tools/EFFECTS_CONSUMER_CONTRACT.md` §1.2 — the `default_off` table row (*"No
  longer refuses anything"*), the subsection *"⚠ THE TWO OBLIGATIONS BELOW ARE NO
  LONGER OBLIGATIONS"*, and the numbered list kept *"ONLY BECAUSE IT IS NOW THE
  SIZE MODEL"*, with the instruction: *"Read each item as 'if this does not hold,
  `views_emitted()` returns 0', never as 'the build refuses'."*

**No disagreement with the coordinator's reading.** Their account of the mechanism
is correct in every particular I could check.

### 2.2 Where the scope was one layer too shallow

**The 385-character sentence on that bar is not the disclosure.** It is
`viewsEmitted`'s refusal, in `src/core/formats/bg-override/bg-override.ts`,
reaching the bar through `verbs.promote.reason`. Deleting the three named sites
would have left the false sentence exactly where an author meets it — and left
the overflow with it.

The retirement was WRITTEN correctly and SUMMARISED shallow. Its own docblock,
step 1: *"If the band-count `AssertionError` is gone, the codec's `viewsEmitted`
per-act refusal goes with it and that is the real change."* So the site the brief
under-specified was named in the artifact the brief pointed at.

### 2.3 What actually changed

* **`viewsEmitted` returns `{ ok: true, value: 0 }` where it refused.** Both arms.
  The CONDITIONS are unchanged word for word — both still quantified over the ACT,
  which is still the trap — only their consequence.
* **`bganimViewTwinBytes` is new.** ONE derivation of what the twins cost, so no
  sentence quoting the figure holds a typed number.
* **`TWIN_COUPLING_DISCLOSURE`, `twinCouplingApplies` and the `Hint` are DELETED.**
  A comment block stands where they were, recording the three steps as done.
* **`SHIP_SILENT_OBLIGATIONS` ended *"Either one refuses the build outright."***
  It does not any more. A test now names both claims the copy may not make.
* **The vendored contract** has all three `writerObligations` rewritten,
  `auroraStatusNow` extended, and a `bganim-decouple` amendment naming aeon's
  revision and the ancestry check. Content hash re-pinned in
  `bg-override-contract-drift.test.ts`, with the previous hash recorded beside it.

**What an author gets:** `Promote` and `Add` are OPEN on aeon's shipped act, where
both doors refused. aeon's stated reason for the decouple is our own control —
their words: *"your `Promote` control appends a band, so an author did the one
thing the editor invites and got a build failure about DEBUG view twins they had
never heard of."*

### 2.4 A third obligation moved, and nobody mentioned it

The tail assertion (*"`default_off` bands must be the TAIL of the band list"*) is
now a **REORDER**: the emitter puts live bands ahead of silenced ones and
announces it on stdout and in the generated `bg_anim.emp`. **So a round-trip
through the build can hand Aurora back a table in a different band order than it
wrote.** Slots, art and bank offsets are unaffected — each record carries its own
and the bank blob keeps authoring order — and no size depends on it, so nothing
here models it. It is recorded in `writerObligations[2]` rather than left for a
future diff to reveal. **Flagged as an open item; it is not this parcel's.**

### 2.5 ⚠ The trap, and it fired exactly as predicted

**Retiring the sentence made the overflow disappear.** With the refusal gone the
bar falls back to a 35-character tool hint and the harness goes 8/8 green — row
four of the table in §1. That is a symptom removed and a latent defect left
standing, and it would have read as a fix. Row five is the same tree with a
synthetic long line planted in `EffectsToolOptions` (the retired refusal's own
385 characters, so the numbers compare directly): **+7 / +6, unchanged.** The real
Half A was still there.

---

## 3. The fix, and why it hides none of the refusal

`OptionBar` (`src/renderer/components/ui/primitives.tsx`) went from
`height: 32` to `min-height: 32` with `box-sizing: border-box` and 1px of
vertical padding.

**Why this and not the obvious repairs.** A flex row with a fixed height and
`align-items: center` neither clips nor grows: a trailing text item longer than
the free width wraps, the wrapped box is centred on the 32px line, and every line
past the first paints outside. The three repairs that suggest themselves —
`nowrap` + `text-overflow: ellipsis`, `overflow: hidden`, a line clamp — **all
work by hiding part of the sentence.** The sentences that reach this bar are
refusals explaining why a control an author just aimed at is off; truncating one
re-creates the defect it was written to close while looking like a success. The
brief ruled that out and it was right to.

`min-height` hides nothing: the bar grows to its content and the layout below
moves down. `spanScrollHeight === spanClientHeight` in every run, before and
after.

**Relocating it was considered and is not needed.** The bar's line is also the
armed tool's hint, which is short and belongs there; and the long strings that
still reach it after the retirement are the byte-budget refusals, which are about
the control the author is aiming at. What was wrong was the box, not the address.

**The resting bar is byte-identical to master** — `74..106, h 32` — which is what
`box-sizing: border-box` plus the 1px pad buys: no other harness's pinned geometry
moves. All five facets that mount an `OptionBar` get the repair; Effects is only
where it was seen.

---

## 4. Half B: the figure names its shape

The panel printed `ROM section 8376/20480 bytes`. **The arithmetic was right and
shape-aware.** The sentence did not say which shape, and aeon's own
`bganim_section_bytes()` defaults `n_views` to 0 and answers for the release
shape, so the two figures differ and neither side can tell which is wrong. aeon
worked it out by hand and wrote the conclusion into their contract: **"Say which
shape any figure is for."**

On screen now, measured (rows `4c`/`4d`/`4e`):

```
ROM section 8376/20480 bytes in the debug shape · 47 more animated slots fit ·
this is the binding budget, not the 80 free blob slots above
```

(`docs/captures/2026-09-06-two-sentences/6-rom-section-debug-shape.png`; the other
shape is `7-rom-section-every-shape.png`) with the tooltip carrying the
reconciliation:

> This act qualifies for the 138 bytes of debug view twins, so the figure beside
> it is the DEBUG ROM's section and the release ROM's is 138 smaller. aeon's own
> bganim_section_bytes() defaults to no twins, so a bare call there answers for
> the release shape and will differ by exactly that much. Neither is wrong; they
> are two questions.

**⚠ The second branch is NOT "release".** An act the twins decline for emits none
in ANY shape, so naming a debug/release distinction there would invent one. It
reads `in every ROM shape`.

**Where the 138 is derived.** `bganimViewTwinBytes(bands)` in the codec —
`viewsEmitted(bands).value * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES *
bands.length)` — surfaced through `bandBudget.viewTwinBytes`. **No sentence in
this parcel types it**, in source, in a test, or in the harness (which reads the
three operands out of `bganim-consumer-contract.json`).
`scripts/check-prose-constants.mjs` is in `npm test`.

**The arithmetic was not touched.** `bganimSectionBytes` is unchanged.

---

## 5. Plant proofs

Every row below: mutation quoted from `git diff --stat`, red run, restore from the
**committed** baseline, green run.

| # | Plant | Result |
|---|---|---|
| **P1** | `viewsEmitted`: restore the band-count refusal (`ok: false`) | **15 rows RED** across 4 files — every retirement row in the suite |
| **P2** | `bganimViewTwinBytes`: `return 0` unconditionally | **4 rows RED** — the twin-cost row, the shipped-shape row, the quantifier row, the DISCRIMINATING row |
| **P3** | `SHIP_SILENT_OBLIGATIONS`: restore *"Either one refuses the build outright."* | **1 row RED** — the copy row |
| **P4** | the new over-ceiling row's fixture made in-budget | **RED at its own anti-vacuous guard** (`the fixture must be over budget: expected 0 to be greater than 0`) |
| **P5** | a synthetic 392-char line planted in `EffectsToolOptions`, fix absent | **harness `[3c]` RED**, +7 / +6 — *this is the plant that re-creates the overflow the brief demanded* |
| **P5 + fix** | the same plant with `min-height` in place | **`[3c]` GREEN**, bar 48px, span inside, nothing truncated |
| **P6** | the shape clause deleted from the JSX | **`[4d]` and `[4f2]` RED** |
| **P7** | `twinsEmitted: true` — the clause hard-coded to one shape | **`[4f2]` RED**, `[4d]` still green: *"before: … in the debug shape / after: 8238 … in the debug shape"*. This is why `4f2` exists — `4d` alone passes on a hard-coded sentence. |

The strongest Half B row, `4f2`, drives the document across the boundary with a
real control (the band card's In-the-ROM picker) rather than asserting a string:

```
before: "ROM section 8376/20480 bytes in the debug shape"
after:  "ROM section 8238/20480 bytes in every ROM shape"
delta:  138 = 3 * (2 + 44), derived from the vendored contract
```

8,376 and 8,238 are aeon's own two figures for this act. The run writes nothing to
disk (`4g` hashes `editor_bg_override.json` either side) and undoes its own edit.

---

## 6. What I did NOT establish

1. **`60e265b9` and `08f5fe6b` were not re-measured with the final instrument.**
   Their rows come from the first finder. `1e770b0c` was measured with both and
   reproduced exactly, which is the ground for carrying them — an inference, not a
   run.
2. **One window size, one dpr.** Everything is 1400x872 at dpr 1 inside
   `xvfb-run -s '-screen 0 1680x1050x24'`. A narrower window wraps the sentence
   further and the fix grows the bar further; that direction is argued, not
   measured.
3. **`BgAnimSizeResult`'s `ok: false` arm is now UNREACHABLE from any document.**
   `viewsEmitted` was its only producer. The type is KEPT and said out loud in
   three docblocks rather than collapsed: the safe-direction machinery around it
   (unmeasurable collapses to zero, never to the looser tile budget) is what the
   section-ceiling parcel landed, and deleting it across six call sites buys an
   author nothing. **Collapsing it is a parcel, not a side effect of this one.**
   Two UI branches are unreachable with it: the panel's `ROM section: cannot say`
   hint and `bganimSectionIssues`' `the build refuses this act` notice.
4. **The band-reorder drift (§2.4) is recorded, not modelled.** Nothing in Aurora
   knows the build may hand back a different band order.
5. **The other two long sentences on the same axis are untouched.** The
   promote/insert byte refusals in `bg-anim-aeon.ts` print `N bytes of 20480`
   without naming a shape. They are not wrong and the brief scoped Half B to the
   panel readout; naming the shape there is a follow-up. It is a live case now
   that promotion changes the shape as well as the size.
6. **I did not run the app at any window size a person actually uses**, and no
   claim here is about how the grown bar looks to the owner. The capture is at
   `docs/captures/2026-09-06-two-sentences/4-synthetic-long-line-with-fix.png`.
7. **`scratchpad/bganim-band-harness.mjs` is still blind** and was not repaired
   (a booked parcel). Nothing here depends on it.

---

## 7. An instrument hazard worth the next lane's time

**A `node_modules` copied from the sibling checkout builds an app that renders
NOTHING.** rollup gives the `project-runtime` chunk its own copy of react,
`ReactSharedInternals.H` is null, and `App` throws at the first `useCallback`; the
window is blank, `window.__dbg` still installs, and every harness row reads an
18-node document as *"the Effects facet does not exist"*. It reproduced at four
different revisions and at a short path outside the repo, so it looked exactly like
a broken master.

`npm ci` fixes it, and then reproduces the sibling checkout's own dist
**byte-for-byte** — identical content hashes on every chunk, which is what proved
the drift was in the copy and not in the source. Cost about an hour before the
first real measurement.

The harness now subscribes to `Runtime.exceptionThrown` and `Log.entryAdded`, so a
blank page says why instead of being reported as a missing feature.
