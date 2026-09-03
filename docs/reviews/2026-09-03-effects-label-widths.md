# Effects label widths — the column is zero-sum, and the width did not move

**Branch** `fix/effects-label-widths`, three commits (SHAs in §8).
**Parcel** the wrapping layer-card labels (O50 triage D-1) and the truncating
anchor selects, ruled as one defect with two faces.
**Started** 2026-09-03 05:40Z, uptime 8 days 21:29 · **finished** 06:20Z, uptime
8 days 22:09.

**Environment, printed beside every figure.** Every run is against **this
worktree's own** `VITE_AURORA_DEBUG=1 npx electron-vite build`, pinned with
`AURORA_BUILT_TREE=<worktree>`; the electron binary is the main checkout's
(`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` — a
worktree has none). `AEON_DIR` is a fresh `git archive` extract of aeon
`origin/master` **`5cdc5c19`** onto this worktree's own filesystem; the live
aeon tree was never opened and never written to. Screen 1680x1050,
**`devicePixelRatio` read 1 on every run** and is printed by the harnesses.
**No emulator was touched** — no `mcp__oracle__*` call, no Aether socket, no ROM.

---

## 1. The answer, up front

**`LABEL_W` stays at 64.** The two offending labels were shortened instead, and
the anchor option strings were shortened too. `effects-column-harness`
**23/25 → 25/25**; `anchor-authoring-harness` **27/28 → 28/28** (28 rows because
this parcel added three).

The brief framed this as one defect with two faces. It is — but the two faces
**pull in opposite directions**, and that is the finding the parcel turns on.

| | face 1: labels wrap | face 2: selects truncate |
|---|---|---|
| where | layer card, Parallax tab | anchors card, Colour tab |
| widening `LABEL_W` | **fixes it** | **makes it worse** |
| narrowing `LABEL_W` | makes it worse | helps, but cannot fix it |

They share one 300px column and **every pixel in it is zero-sum**. Measured
directly, not inferred: at `LABEL_W = 64` a `flex: 1` select in these rows gets
**190px**; planting `LABEL_W = 24` (−40px) moved it to **230px** (+40px),
exactly compensating.

---

## 2. The width call, and the measurement behind it

The O50 triage proposed `LABEL_W` 64 → 100 and measured it **25/25** on
`effects-column-harness`. It is right about that file and wrong about the app,
and the reason is that the constant is shared by a facet that harness does not
look at.

At `LABEL_W = 100` the select falls from 190px to **154px**. Measured widths of
what would then be inside it:

```
±16 px (32 px of travel)      157px   GENERATED ladder rung — would truncate
8.53 s (512 ticks)            159px   GENERATED ladder rung — would truncate
follow a world Y (whole …)    195px   already 5px over; would be 41px over
```

So the proposed width **breaks two controls that currently work**, and both are
generated strings that no one reading the source would ever see at full length.
That is the whole argument for keeping 64.

**And the other direction is not available either.** `keep the section's
hand-authored anchor (array ends here)` needs **347px**. Even at `LABEL_W = 0`
the select reaches only ~254px. **No label-column width can fix face 2** — it
was never a `LABEL_W` problem, only a `LABEL_W` tax.

That left one move for each face:

- **Face 1** — shorten the two labels. `Plane B curve to` (84px) → `B curve to`
  (52px); `Plane B split at` (77px) → `B split at` (45px). The plane is not
  lost: the row **directly above both** already reads `Plane B (bg)`, and the
  titles still spell `curve.to` and `vsplit.at` out in full.
- **Face 2** — shorten the option text, which is the only lever that exists.

The widest label the column now carries is `Plane B (bg)` at **62px in 64**, so
the honest statement of headroom is **2px**, not the docblock's old 9. The
tightest select is 8px. This column has roughly ten pixels of total slack and it
is shared between the two sides; that is recorded in `column-layout.tsx` so the
next reader does not spend it twice.

---

## 3. What was traded — stated, because it is a real loss

The brief was right that these words are doing work. What went, and why each was
recoverable:

| was | now | what was traded |
|---|---|---|
| `keep the section's hand-authored anchor (array ends here)` | `keep hand-authored anchor` | `the section's` and the file spelling. **The rule itself — *keep* + *hand-authored* — survives.** The full sentence is the select's `title`, which is the schema's own description, and `anchorExtendRefusal` says "anything but ... will do" at the moment the array shape actually constrains anybody. |
| `keep the section's hand-authored motion (array ends here)` | `keep hand-authored motion` | as above |
| `follow a world Y (whole pixels)` | `follow a world Y` | `(whole pixels)`. The unit is on the World Y row itself (`px, level space`) and `anchorSeedRefusal` states the whole-pixel rule in a sentence *at the moment a fraction is typed*, which is the only moment it is actionable. |
| `no motion — the anchor stays on its seed (null)` | `no motion (null)` | `the anchor stays on its seed`. `(null)` is kept — null-versus-a-number is this key's documented hazard. |
| `sweep — up and down about the seed (object)` | `sweep up and down` | `about the seed` and `(object)`. The section's own opening paragraph already says a sweep "makes that point drift up and down on a timer"; the object becomes visible the instant `sweep` is picked, as the three rows Travel / Cycle / Start at. |
| `every 8.53 s (512 ticks)` | `8.53 s (512 ticks)` | the word `every`, which was pure redundancy beside a row labelled `Cycle`. |

**Nothing that distinguishes one state from another was traded.** All three
seed spellings and all three motion spellings remain mutually distinguishable at
a glance, which is what the three-state rule needs from a picker.

⚠ **My first attempt at these was wrong, by 4px and 10px.** I sized two of them
by extrapolating characters-per-pixel from a couple of samples; an em-dash
between spaces costs more than the letters around it. Both were caught by `[W1]`
and re-cut. The provider docblock now says: re-run the harness, do not count.

---

## 4. The root cause, and why it had to be fixed twice

`column-layout.tsx` listed **fifteen** labels and the column had **twenty-four**.
The constant was never wrong; the **population it was derived from** stopped
being the population on screen when a later parcel added two labels without
re-measuring. The docblock's own annotation — *"nothing here needed
re-measuring"* — is exactly the reasoning that let it through.

**The instrument that would re-derive it could not see the condition either**,
and I confirmed the O50 repair rather than taking it on trust. Run against a
label I knew was too wide, `[r4]` now prints:

```
Plane B curve to = 42px (needs 84px unwrapped)
```

The first number is a Range over an already-wrapped label — the union of its
line boxes, bounded by the column. **A re-derivation from that number would have
confirmed the very width causing the wrap.** The repair is real: the unwrapped
width is reported beside it and `[L2]` gates on line-box count. I built on it
rather than re-deriving from the old list.

**The same blind spot exists in a second place and is worse there.** A
`<select>` does not wrap and does not overflow — it ellipses. `scrollWidth` is
clamped to `clientWidth`, the option text is not a DOM text node a Range can
select, and `checkVisibility()` is `true` on a select showing three words of
eight. **Every quantity the element volunteers about itself is
post-truncation**, and unlike a label there are no line boxes to count instead.
That is why face 2 needed a new observable rather than a new threshold.

### 4a. Why ~6,535 node tests were green throughout

Two node guards exist over this exact wording and **both are character counts**:

- `effects-wording.test.ts` — no new label longer, **in characters**, than the
  longest existing label literal.
- `label-column-align.test.ts` — no label whose longest **token** exceeds the
  longest token among the static labels.

Neither knows what a pixel is, and `Plane B curve to` violates neither. They are
not wrong — the token bar guards the one failure a fixed wrapping column still
has, an unbreakable token — they are simply **proxies that do not track the
constraint**. I did not retune them: a character bar calibrated against a
measured pixel width would be inventing a fixture, and the honest answer is that
the pixel question belongs to the harness. This is written into the docblock so
the next reader does not mistake their green for coverage.

---

## 5. The new gates, and the question that decides whether they are worth anything

`anchor-authoring-harness` had **25 green rows** asking whether the anchor
controls exist, offer the schema's rungs, run a clock, and write what was asked
for. **Not one asked whether the author can read them**, and three were ellipsed
on the harness's own screenshot.

**The observable.** A clone of the live select carrying exactly one option,
appended **inside its own row** (so the font-family is the row's, not the
body's), at `position: absolute; width: max-content; flex: none; maxWidth: none`
— outside the flex line, so no column can bound the answer. Padding, border,
font size and the UA's dropdown arrow ride along on the clone; nothing guesses
at any of them.

**Asked of every option, not the selected one.** An option the fixture did not
select is one click from being what the author reads. This run authors a sweep,
so a gate on the current choice would never have measured `no motion — …` at
all — and would never have found **`every 1092.27 s (65536 ticks)`, 192px in a
190px box**: the period ladder's top rung, a generated string, already truncating
at the *current* width. Two of the six findings came from this alone.

### The two questions the brief said to ask separately

**Does it fire when something does not fit?** Yes — proven three times in §6.

**Is it measuring a quantity that can still be too wide after the layout has
absorbed the overflow?** This is the one that looks already-answered, and the
`[W0]` plant is the proof that it is. With `widthOf` mutated to hand back the
rendered width — the dishonest clone the row exists to catch — the run printed:

```
FAIL  [W0]  "Channel 0": real choice 190px → padded 190px in 190px (grew false, past the box false)
PASS  [W1]  all 28 options fit; tightest ... needs 190px, has 190px (0px to spare)
```

**`[W1]` goes vacuously green.** That is `[r4]`'s defect reproduced on purpose:
a clean-looking number, produced by an instrument bounded by the thing it was
measuring. `[W0]` is the only row that catches it.

**And `[W0]` is not "something did not fit".** A fit gate's healthy state is that
everything fits, so evidence of life drawn from the app's own defects expires on
the day they are fixed — the day the gate starts mattering. `[W0]` instead asks
the same `widthOf` for each select's own choice **with forty Ms welded on**, in
the same row and the same font, and requires it to come back strictly wider and
past the box. It was green before the fix and green after it, on the same
reasoning both times.

Both rows **print every number they judged beside the room available**, so the
aim can be audited by someone who did not write them.

---

## 6. Red-first, each from a committed baseline

Every mutation was quoted from disk with `git diff` **before** the red run, and
`src/` was restored with `git checkout` **from a committed baseline** (`0 dirty`
verified each time) and rebuilt.

| gate | plant | result |
|---|---|---|
| `[W1]` | restore `keep the section's hand-authored anchor (array ends here)` in `effects-preset.ts` | **RED**, 2 options × 157px over. `[W0]` and `[W2]` correctly unaffected — one plant, one arm |
| `[W2]` | `LABEL_W = 64 → 24` in `column-layout.tsx` | **RED**, all 6 labels, `Movement` over by 32px |
| `[W0]` | `widthOf` returns `sel.getBoundingClientRect().width` — the dishonest clone | **RED**, and `[W1]` went **vacuously green** beside it |

⚠ **A discarded plant, recorded because it matters.** My first `[W2]` plant
lengthened the `Movement` label literal, and the harness **aborted at `[4a]`**:
its own finder is `/^Movement$/`, so the plant broke navigation instead of the
property. Applied-and-aborted is not applied-and-red. The plant was replaced
with one that violates `[W2]`'s stated property directly.

⚠ **And the `[W2]` red is why the row is worth anything.** On its first red it
printed `"Channel 0" · "undefined": needs undefinedpx` six times — it had reused
`shown`, the formatter written for *option* records, on *label* records. The row
was correct, fired correctly, and its evidence was worthless. **A gate's failure
message is only ever exercised when it fails**, which is the one moment somebody
has to read it. No green run could have shown me this. Fixed in `2551de98` and
re-run red to confirm the message.

`[L2]`/`[L2b]` were not authored here and are not re-proven; they were observed
**red on the real defect** at the start of this parcel (23/25), which is a
stronger demonstration than a plant.

---

## 7. Verification

### Node suite

Run twice, and **the two runs disagree because a peer repo moved between them.**
Both are reported; neither is discarded.

| | 05:57Z | 06:16Z |
|---|---|---|
| passed | 6534 | 6533 |
| **failed** | **0** | **1** |
| skipped | 8 | 8 |
| total | 6542 | 6542 |

**Against the controller's master baseline of 6535 / 0 / 7 (6542):** the totals
match exactly, and **one row moved from passed to skipped for an environment
reason, not a regression.** The suite's own skip-report names it:

> `test/support/sibling-root.test.ts` — *"step 3 was NOT measured in this repo's
> real MAIN CHECKOUT by this run … This run is standing in a LINKED WORKTREE"*

That row runs only in a main checkout. The controller measured there; I cannot.
The other seven skips are pre-existing opt-in rows.

#### ⚠ The one failure, and it is not mine — proven, not asserted

`test/formats/effects-preset-schema-drift.test.ts`, the contract-lag row.

**It was GREEN at 05:57 and RED at 06:16 with my tree unchanged in between.**
The cause is dated: the row reads **aeon's** `docs/EDITOR_RASTER_PRESETS.md` at
`origin/master` through git objects, and that file moved at aeon `ce1dfcec`
(*"effects_gen: the generator reads the moving-band authoring key"*, 05:42
local). The local `origin/master` ref advanced to `b7f4bdeb` (06:09) between my
two runs.

Proven mine-or-not by re-running the row with **master `d79b6f06`'s versions of
all three files I touched** checked out: **still 1 failed / 15 passed.** I
changed UI label strings; this row compares a peer repo's prose against a
vendored schema. Zero overlap.

**And it is a real signal, not noise.** The measured lag SHRANK to `[]`: aeon
has now *built* `patch_motion` and `patch_world_ys`. Those are exactly the two
keys the anchors section authors — so `presetLagDisclosure` is currently
printing **"Not consumed by the engine yet."** on screen, about work that now
does reach the engine. The test's own message says the fix: empty
`PRESET_KEYS_AWAITING_AEON` in `src/core/formats/effects/preset-lag.ts` and
re-date it, after which the sentence retires by construction.

**Not fixed here, deliberately.** It changes a user-visible claim about engine
support on the strength of a peer repo's state, and burying that inside a label-
width parcel would hide it in the wrong review — the same call the O50 triage
made about this same file. §9 books it.

### Harnesses — both builds, so "already red" and "I broke it" cannot print alike

| harness | before (master src) | after | verdict |
|---|---|---|---|
| `effects-column` | **23/25** — `[L2]` `[L2b]` red | **25/25** | fixed, at `LABEL_W` 64 |
| `anchor-authoring` | **27/28** — `[W1]` red, 11 truncations | **28/28** | fixed |
| `curve-editor` | — | **30/30** | unaffected |
| `curve-option-disabled` | — | **27 rows, 0 failed** | unaffected |
| `layer-bound` | — | **47/47** | unaffected |
| `vsplit-advisory` | — | **45/45** | unaffected |
| `curve-vsplit-reachable` | **ABORTS** | **ABORTS** | ⚠ pre-existing, **not mine** — see below |

**`curve-vsplit-reachable` aborts identically on both builds** with
`Error: wanted 3 layers, model has 5`, at
`curve-vsplit-reachable-harness.mjs:520`. It is a fixture premise about how many
layers the aeon scene carries, it never reaches any label, and I proved it by
rebuilding master's `src/` and re-running. **Booked, not fixed** — it is not this
parcel's subject and repairing it inside a width parcel would hide it in the
wrong review.

---

## 8. Commits

| SHA | what |
|---|---|
| `226b6b1e` | the labels fit the column, and the column stopped being widened to fit them |
| `1c137f39` | `anchor-authoring` gains a fit gate — the selects were never asked whether they can be READ |
| `2551de98` | fix `[W2]`'s evidence, and measure the section next door without gating it |

All on `fix/effects-label-widths`; branch verified at each commit; nothing on
`master`. Every `git add` enumerated exact paths — no `-A`, no globs — and each
commit was verified with `git show --stat`.

---

## 9. Left open — measured, not fixed

1. **⚠ The same defect one section over, with numbers.**
   `aeon.effects.preset.channels` draws the same rows into the same selects from
   the same three-state vocabulary, and **three of its five options truncate**:

   ```
   keep the section's hand-authored cycle (key absent)     312px in 200px
   authored script (array of channels)                     217px in 200px
   every slot keeps its hand-authored value (key absent)   319px in 200px
   ```

   Measured by `[W3]`, which **reports and deliberately does not gate**: that
   wording is not this parcel's, and a gate would leave this file red over
   somebody else's strings and teach the next reader to skip the block. It needs
   a row and an owner. The gate that would hold it is `[W1]` pointed one section
   across.

2. **⚠ URGENT AND NOT MINE — the anchors panel now tells authors a falsehood.**
   aeon built `patch_motion` / `patch_world_ys` at `ce1dfcec` today (05:42), so
   `PRESET_KEYS_AWAITING_AEON` is stale and the section this parcel worked on is
   printing **"Not consumed by the engine yet."** about keys the engine now
   consumes. One-line fix in `src/core/formats/effects/preset-lag.ts` plus a
   re-date; the sentence retires by construction and
   `effects-preset-schema-drift` goes green with it. **This wants a foreground
   follow-up** — someone should confirm against aeon's generator before the
   claim is flipped, and that confirmation is the one thing in this parcel's
   orbit that a runtime check would settle. It is booked here rather than done
   because it is a user-visible engine-support claim and this is a width parcel.

3. **`curve-vsplit-reachable` aborts on a fixture premise** — §7, proven
   pre-existing on both builds.

4. **The node character bars are proxies** — §4a. Not retuned here, because a
   character bar calibrated to a pixel measurement would be an invented fixture.
   Named in the docblock instead.

5. **The layer card's own headroom is now 2px** (`Plane B (bg)` 62px in 64), and
   the tightest select has 8px. Anything added to either side of this column
   needs both harnesses run, which `LABEL_W`'s own comment now says.

---

## 10. Two things in the brief that were not so

Both are small; both would have cost someone time.

1. **The "committed screenshot" at
   `scratchpad/shots-anchor-authoring/anchors-section-open.png` is not committed
   and never was.** `.gitignore:10` excludes `scratchpad/shots*/`, so it is not
   tracked on this branch, on `master`, or anywhere in history
   (`git log --all --diff-filter=A` finds nothing). It is **generated** by
   `anchor-authoring-harness` row `[9a]` on every run, which is how I read it —
   but a reviewer told it was committed would have gone looking for an artifact
   that cannot exist. A fresh capture is at that path now, produced by the final
   green run.

2. **The anchors column is 300px, not 280px.** Measured `[i3]` /
   `[W0]`. The select inside it is 190px, which is the number the wording is
   actually constrained by, and it is the one I sized against.

---

## 11. Standing invariants

- **No emulator.** No `mcp__oracle__*` call, no Aether socket, no ROM. Nothing
  here says what any of this looks like running. **Nothing in this parcel wants
  runtime confirmation** — every claim is a layout measurement on the built app,
  and the screenshot is the visual half.
- **Branch/tree.** All three commits on `fix/effects-label-widths` in this
  worktree; branch verified at each commit; nothing on `master`. **Nothing under
  `src/renderer/workspace/facets/` or the gesture layer was read or written** —
  the second agent's files were never touched.
- **Exact-path commits.** Enumerated paths only; `git show --stat` on each.
- **Loud on unmeasurable.** `[W0]`/`[W1]` count `UNMEASURABLE` options
  separately and refuse to fold them into either verdict; `[W2]` prints
  `COULD NOT MEASURE` rather than a number; `[W3]` says "Not a pass — nothing
  was checked next door" if the neighbour cannot be found.
- **Nothing written to the live aeon tree.** Every run used a fresh
  `git archive` extract of `origin/master` `5cdc5c19`.
