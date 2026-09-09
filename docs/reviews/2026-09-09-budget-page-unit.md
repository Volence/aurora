# The FG budget's second defect in one night: the ceiling's value was wrong, and so was its unit

**Row:** `GUARD-SEAT-RESIDUE` follow-on (appended to `docs/lens-findings.jsonl`)
**Branch:** `parcel/budget-page-unit`, cut from `master` at `145de20c`
**Date:** 2026-09-09

Hours before this parcel, `FG_TILE_LIMIT` was found to be 1024 against an engine
that declares 768: a 33% overstatement of the budget Aurora shows an author,
fixed and landed at master `145de20c` (`docs/reviews/2026-09-09-guard-residue-offschema.md`).
That corrected the ceiling's **value**.

**The unit was also wrong.** The quantity that can refuse an act is its **packed
page count** against aeon's **page-frame count**, not its tile count against a
tile ceiling. This parcel corrects the unit and the wording around it.

---

## 1. What changed

| file | what |
|---|---|
| `src/core/export/vram-coloring.ts` | `FG_PAGE_TILES`, `deriveFgPageFrames`, `FG_PAGE_FRAMES` (derived), with a citation block |
| `src/core/agent/budget.ts` | `ActBudget` reshaped to lead with page frames; `fits` removed; `unquantified[]` added |
| `src/main/editor-methods.ts` | `check_budget`'s description rewritten and its numbers interpolated |
| `test/agent/budget.test.ts` | the unit rows, the derivation rows, and two source-text prose gates |
| `test/formats/fg-page-frame-currency.test.ts` | new; the quantum and the derivation, read at a committed aeon revision |
| `test/formats/fg-pool-ceiling-currency.test.ts` | two claims about `fits` that had become false |
| `docs/MCP.md` | still carried the `1024` defect **and** a `fits` field; both corrected |

Three commits, each carrying its finding in the body.

---

## 2. What the engine actually refuses you on

Read at aeon `origin/master` = `49a8144cc8d286483c131f69bbc4ca9f91b8bc90`
(tree: **aeon**; `6d92821f8b7a2bd0626cbfb63aa56bc64e10f19d`, the revision the
brief named, is an ancestor of it — aeon advanced by one commit mid-parcel):

| path | blob |
|---|---|
| `games/sonic4/vram.toml` | `ebbf4afba83beb8d79bd0ae74090041565684813` |
| `engine/system/constants.emp` | `3b7f1b5fef0257b572785f858835082bf88b90ce` |
| `engine/level/page_cache.emp` | `699f4cf2a35d658c7cf173b0bae724d09d5570ca` |
| `games/sonic4/config/constants.emp` | `3ee19baeb11762223d0fdce68bc3306746336dbf` |

**The carve.** `page_cache.emp`: *"The FG art window (POOL_TILE_CEILING tiles) is
carved into PAGE_FRAMES fixed 64-tile frames."* The VRAM map declares the same
size as the `fg_art_pool` region's `quantum`, and the engine as
`ART_POOL_PAGE_TILES`.

**A half-full page still costs a whole frame.** An act's art is split into pages
of that size at bake time and each page occupies one frame however full it is. So
an act costs its **packed** page count, which is decided by aeon's packer, not by
`ceil(tiles / quantum)`.

**Fragmentation is closed and is not the hazard.** Because the frames are
fixed-size there are no variable-size holes: any free frame takes any page. The
waste is entirely *inside* a partly-filled page. This question was answered by
the engine lane and is not re-litigated here.

**Pinning is named and unquantified.** `page_cache.emp`: *"a page whose refcount
is 0 and is not pinned is an eviction candidate"*. A pinned frame is never a
victim, so the capacity that must cover a **moving** view is the **unpinned**
frame count. aeon holds this open with no measurement behind it, and **no number
is invented for it here**.

---

## 3. How the numbers are derived and gated

**Never typed, because the value is about to move.** The engine lane has an open
recommendation to shrink `POOL_TILE_CEILING`, which moves the frame count with it
and announces nothing to this repo. aeon does not store the count either:

```
pub const PAGE_FRAMES        = POOL_TILE_CEILING / ART_POOL_PAGE_TILES
ensure(PAGE_FRAMES * ART_POOL_PAGE_TILES == POOL_TILE_CEILING,
       "PAGE_FRAMES*ART_POOL_PAGE_TILES must tile the FG art window exactly")
```

— `engine/system/constants.emp` at the revision above, whose own comment says
why: *"NO LITERAL HERE, DELIBERATELY: this comment read 'POOL_TILE_CEILING(960)
... = 15 frames' for two relayouts after the value stopped being 960."*

Aurora mirrors that exactly:
`FG_PAGE_FRAMES = deriveFgPageFrames(FG_TILE_LIMIT, FG_PAGE_TILES)`, and
`deriveFgPageFrames` **throws** on an inexact split rather than yielding a
fractional frame count.

**`test/formats/fg-page-frame-currency.test.ts`** holds it, on the three rules
the neighbouring currency files established (read at a committed revision through
git objects; every message names the revision; an absent checkout is a **loud
skip**). Its rows:

1. the quantum against `games/sonic4/vram.toml`'s `fg_art_pool` `quantum` key;
2. the quantum against the engine's `ART_POOL_PAGE_TILES`;
3. **the shape of the derivation**, then the values *divided* — aeon spells no
   frame count anywhere, so there is nothing to pin, and this row reads aeon's
   `POOL_TILE_CEILING` and `ART_POOL_PAGE_TILES` at the tip and divides them;
4. that the pinning rule still exists, because `unquantified[]` makes a claim
   about it;
5. that **Aurora** declares `FG_PAGE_FRAMES` by division and not by a literal.

**Nothing in this repo pins a frame count.** A pool resize is expected and stays
green — a gate that reddened on a correct landing would be worse than no gate,
because it trains a reader to dismiss it.

**aeon holds one half of this itself,** which is why our gate is about *our* copy
rather than policing theirs: `games/sonic4/config/constants.emp` carries
`ensure(POOL_TILE_CEILING == 768, "vram.toml fg_art_pool drifted from engine
POOL_TILE_CEILING ...")`, making toml/engine drift build-fatal on their side.

---

## 4. The exact wording an author now sees

`check_budget`'s description, every figure interpolated (shown here with today's
values substituted):

> The act's FG art cost in PAGE FRAMES, which is the unit that can actually
> refuse it. aeon carves the 768-tile fg_art_pool (POOL_TILE_CEILING) into 12
> fixed 64-tile frames, and a half-full page still consumes a whole frame, so an
> act costs its PACKED page count, which is decided at bake time in aeon's
> tooling and not knowable here. So pageFramesAtLeast is a LOWER BOUND,
> ceil(tiles/64): the real cost is AT LEAST that and can be higher. verdict is
> 'over' (the lower bound alone exceeds the frames, so aeon will refuse the act)
> or 'undetermined' (the bound fits; whether the packed count does is not
> measured here). There is deliberately no 'fits': this cannot tell you an act
> fits. Also returns the flip-aware unique-tile counts per section and per VRAM
> color group, and unquantified[], which you should read: the tile count sums the
> two color groups separately so a tile in both is counted twice (conservative by
> an amount nobody has measured), and frames can be PINNED, which leaves fewer
> than 12 to cover a moving view by an amount aeon has not measured either.

And in every reply, `unquantified[]`:

> A LOWER BOUND, NOT A FIGURE: pageFramesAtLeast is ceil(tiles / 64) = N. aeon
> packs the act's art into pages at BAKE TIME, in its own tooling, and a half-full
> page still consumes a whole frame, so the real cost is AT LEAST this and can be
> several frames higher. Aurora cannot run that packing and does not know the
> packed count.
>
> CONSERVATIVE BY AN UNQUANTIFIED AMOUNT: the tile count sums the unique tiles of
> the TWO checkerboard VRAM color groups separately, which is the shape of a
> retired per-section VRAM-base scheme. aeon holds act FG art in one
> globally-deduped pool, so a tile used by both groups is counted twice here and
> once there. Nothing in Aurora measures the overcount, so the margin this buys
> you is unknown in size.
>
> UNMEASURED, AND IT REDUCES THE CAPACITY: a page frame can be PINNED, and a
> pinned frame is never an eviction candidate, so the frames available to cover a
> moving view are fewer than the 12 the window is carved into. aeon has this open
> with no measurement behind it; do not assume a number for it.
>
> NOT A HAZARD, AND CLOSED: fragmentation cannot refuse an act whose page count
> fits. The frames are fixed 64-tile slots, so there are no variable-size holes
> and any free frame takes any page. The waste is inside a partly-filled page,
> which is what the lower bound above cannot see.

**`fits` is gone.** A boolean answering "does it fit" is an output that cannot be
told apart from a materially different outcome, which is this defect's whole
shape. The two honest verdicts are `over` (a refusal, which is the one thing a
lower bound can prove) and `undetermined`.

**One arithmetic note, kept out of the product deliberately.** At today's twelve
frames, one wasted page is 8% of the whole budget; at the recommended ten it is
10%. That is illustration at a value that is expected to move, so it is written
here and nowhere a tool shows a person.

---

## 5. Red-first evidence

Every row was planted with the mutation **applied on disk** (the diff shown in
each case) and restored from the **committed** baseline afterwards.

| # | mutation | result |
|---|---|---|
| M1 | `Math.ceil(cursor / FG_PAGE_TILES)` to `Math.floor(...)` | **RED**, 2 failed / 8 passed: the boundary row (`expected 1 to be 2`) and the refusal row (`expected 'undetermined' to be 'over'`) |
| M2 | `${FG_PAGE_FRAMES}` to a typed `12` in `budget.ts` | **GREEN at first — see below.** After the row was rewritten: **RED**, "check_budget's prose TYPES the number 12" |
| M2b | the same plant in `editor-methods.ts`'s description | `check-prose-constants` **rc 0**, "0 re-typed in author-facing prose"; the new row: **RED** |
| M3 | `fits:` added back to the returned object | **RED**, "offers no `fits`, because Aurora cannot say an act fits" |
| M4 | the inexact-split guard neutered to `if (false)` | **RED**, "expected [Function] to throw an error" |
| M5 | `FG_PAGE_TILES` 64 to 32 | **RED**, 3 of 6 currency rows: both quantum authorities and the divided-value row ("Aurora derives 24 FG page frames from its vendored 768 / 32") |
| M6 | `FG_PAGE_FRAMES` declared as the literal `12` | **RED**, "FG_PAGE_FRAMES is declared as `12`" — **and every value row stayed green**, which is exactly why that row exists |
| M7 | the derivation pattern changed to `(POOL_TILE_CEILING - FRAME_RESERVE) / ART_POOL_PAGE_TILES`, simulating aeon reserving frames | **RED**, "aeon's PAGE_FRAMES is no longer POOL_TILE_CEILING / ART_POOL_PAGE_TILES at 49a8144c..." |

**Loud skip proven, not assumed.** With `AEON_DIR` pointed at an empty directory
(the resolver refuses an *absent* one by design, and says so), the currency file
reports **2 passed | 4 skipped**, every skip printing "SKIPPED, NOT PASSED: no
aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE ...". The two that
still pass are the two that read Aurora's own source and need no peer.

### 5.1 M2: my own check was vacuous, and only planting showed it

The row first shipped scanned the **returned strings** and required every
multi-digit run to be one of the derived values. Planting the defect it forbids
left it green at 10 passed. It could not have done otherwise: a hand-typed `12`
and an interpolated `${FG_PAGE_FRAMES}` **produce the same string**, so the two
are only distinguishable *before* evaluation. The row now reads the module's
source, strips `${...}` spans, and refuses any figure left in the typed text.

### 5.2 M2b: the repo's shared prose gate cannot see a DERIVED constant

`scripts/check-prose-constants.mjs` polices author-facing `description:` prose
against the constants a module can see, and `description` **is** in its key
population — so `editor-methods.ts` *looks* covered. It is not.

The gate builds its constant table with `numericInit`, which folds a **numeric
literal** or `constant('X')` and nothing else. `FG_PAGE_FRAMES` is declared as a
**call**, so it never enters the table, a typed twin of it matches no constant,
and nothing fires. Measured: with `12` on disk over `${FG_PAGE_FRAMES}`, the gate
printed *"0 re-typed in author-facing prose"*, rc 0.

**The general shape is worse than this one site.** The constants that gate cannot
fold are precisely the **derived** ones, and a derived constant is precisely the
kind whose value moves. This is partial coverage wearing full coverage's summary
line. **OPEN, and not fixed here:** widening `numericInit` (to fold arithmetic
over already-known names, and named derivation helpers) has a 523-file blast
radius and deserves its own red-first parcel. A row in `test/agent/budget.test.ts`
covers the one surface this parcel ships.

### 5.3 A gate whose population excluded a brand-new file

`check-test-dashes` passed on the run where `fg-page-frame-currency.test.ts` was
**untracked**, and found three em dashes in it on the very next run, once it was
committed. Its population comes from `git ls-files`. Nothing is wrong with the
gate; it is worth knowing that a new test file is first judged by parts of this
chain on the run **after** it lands.

---

## 6. Suite

Aggregates, whole, before and after — not a tail excerpt.

| | Test Files | Tests | exit |
|---|---|---|---|
| baseline, `master` `145de20c` | 565 passed / 3 skipped (568) | 8426 passed / 9 skipped (8435) | 0 |
| after, branch tip | 566 passed / 3 skipped (569) | 8439 passed / 9 skipped (8448) | 0 |

`+1` file and `+13` tests, no new skips.

---

## 7. What remains unquantified, and where the surface says so

1. **The double-count.** `computeActBudget` still sums the unions of the **two**
   checkerboard VRAM groups the retired per-section VRAM-base scheme needed,
   while aeon holds act FG art in one globally-deduped pool. A tile used by both
   is counted twice here and once there. **Conservative by an amount nobody has
   measured.** Answering the fragmentation question did **not** make this figure
   equivalent, and this parcel deliberately makes that caveat *more* prominent,
   not less: it is in `ActBudget`'s docblock, in `unquantified[]` on every reply,
   in the tool description, in `docs/MCP.md` and in both currency files.
2. **The packing waste**, which is why `pageFramesAtLeast` is a bound at all.
   Aurora cannot run aeon's packer and does not try to model it.
3. **Pinning.** Named by the engine, unmeasured by it, and unmeasured here. No
   number is invented.

**Whether the two-group split is the right model at all** is still open and is
still measured by nothing in this repo. It wants aeon's pager, not Aurora's copy.

## 8. Look calls, named and left alone

* **Where the readout lives.** The FG budget has **no renderer surface at all**:
  its only author-facing outlets are the `check_budget` tool's description and
  its JSON reply. So the "does the honest wording fit the panel" question does
  not arise — there is no panel. If one is ever wanted, that is a design call and
  it is the owner's.
* **The description is long** (1,065 characters, measured) because it now carries a
  unit, a bound, two verdicts and two unknowns. It is the only place an agent
  learns its budget before spending it, so it was not trimmed. Whether an MCP
  tool description should be that long is a call for the owner, not a correction
  for this parcel.
* **Field naming.** `pageFramesAtLeast` / `verdict` / `unquantified` were chosen
  to make the bound unmissable at the call site. If the owner prefers other
  names, they are a rename away and nothing else depends on them.
