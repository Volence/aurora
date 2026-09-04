# Retiring the negative-ramp-value disclosure — aeon encoded the sign

**Branch** `fix/retire-ramp-sign-lag`, cut from master `eb426df3`.
**Commits** `38bc71fc` (the retirement), `383a33a4` (two holes the poison run
found in my own new rows), plus this packet.
**Parcel** the sign disclosure armed by ROADMAP §5.1 row 132. New row **138**.

---

## 1. What was on screen, and why it had become the defect

`RAMP_SIGN_FIELDS_AWAITING_AEON` held `['start','step']`, so two surfaces spoke
whenever a ramp document actually held a negative 16.16:

- the **ramp card's** leaf, `RampSignLagDisclosure` — *"A NEGATIVE value here does
  not reach the game. … `raster_ramp_program` declares `rrp_start` and `rrp_step`
  as `u32` and forwards the signed value RAW … the WHOLE ROM fails to build."*
- the **caveat inside `rampRateRefusal`** — *"⚠ AND A NEGATIVE ONE WILL NOT BUILD
  TODAY: -1 is negative …"*, appended to a refusal that RECOMMENDS `-1`.

aeon fixed the constructor. Every clause after the colon is now false, and a
warning that outlives its premise is a **false warning** — the same class of
defect the disclosure was written against, wearing the other hat. The drift row
caught it and **master was RED on exactly that one row**, which is the instrument
working, not a regression.

---

## 2. THE AEON REVISION I MEASURED AT, AND THE LINES I READ

Read through git **objects** (`git -C <aeon> show origin/master:<path>`), never
by path into aeon's working tree, which is a live checkout being edited. Nothing
in aeon was written to.

| | |
|---|---|
| aeon `origin/master` | **`065dc7903c43e6e52d918084a9b1c2e5eaffe85f`** |
| tip subject | `rename: aurora_local_rampctl_probe -> aurora_ramp_witness, before it shipped` |
| `engine/effects/raster.emp` blob | **`20896f04900e7c03c5661adfc4947ca178f6e52c`** |

`raster_ramp_program`'s last four statements before its `return`, verbatim:

```
comptime var start_img = start
if start_img < 0 { start_img = start_img + $100000000 }
comptime var step_img = step
if step_img < 0 { step_img = step_img + $100000000 }
```

and the returned literal now spells `rrp_start: start_img, rrp_step: step_img`.

Adding `$100000000` (2^32) to a negative int **is** its two's-complement `u32`
image, and it is a **no-op for everything non-negative** — so no ramp already in
the tree moves. aeon pins both directions for zero ROM bytes (`RAMP_SIGN_PIN_NEG`
/ `RAMP_SIGN_PIN_POS`, two `const`s and two `ensure`s), the positive arm being
the control against an unconditional encode that would have passed a
negative-only pin while moving every existing ramp by four gigabytes.

### ⚠ Why it runs AFTER the range ensures — the half that makes it correct

The constructor bounds `start`/`step` to `fp16(-512,255)..fp16(511,255)`, and
`fp16_min` is **negative**. aeon's own comment states the consequence: *"run them
on an already-encoded value and every negative step would read as ~4.2 billion
and fail the upper bound with a number the author never wrote."* Encoding first
would have converted this disclosure's build failure into a range refusal quoting
an unrecognisable integer — the same author blocked, worse diagnosed. The
ordering is also what makes the single add **total**: both values are already
`|v| <= 33619968 < 2^31`, so nothing can wrap past 0 or collide with a
legitimate large positive.

### The ancestry claim this file used to carry was checked, not assumed

`ramp-sign-lag.ts` recorded that the fix existed on `parcel/aurora-ramp-witness`
(`7a5d237d`) and was **not** an ancestor of aeon's master. `git merge-base
--is-ancestor 7a5d237d origin/master` now says **YES**. That paragraph is
replaced by the measurement above rather than left to read as current.

### ⚠ MERGED, NOT CERTIFIED

What cleared is a claim about aeon's **source** at a committed revision.
**Nothing in this repository has seen a ROM ramp downward.** That is aeon's
pytest lane and sigil's attest chain, and no row here stands in for either. The
re-open condition is mechanical and needs no judgement: if the constructor ever
forwards a bare parameter again, the drift row reddens and says *"RE-FILL … and
re-date it"*.

### My own baseline, before I changed a line

```
Test Files  1 failed | 486 passed | 2 skipped (489)
      Tests  1 failed | 6862 passed | 8 skipped (6871)

FAIL  test/formats/aeon-ramp-sign-drift.test.ts
  × ⚠ THE PREMISE: `raster_ramp_program` FORWARDS the signed parameter raw, with no encode
```

One failure, and it is the row that names its own fix.

---

## 3. The pin changed VALUE. It was not deleted.

`RAMP_SIGN_FIELDS_AWAITING_AEON` is `Object.freeze<RampSignField[]>([])`.

Deleting the constant would have retired the **coverage** along with the
sentence, and then nothing would notice if `raster_ramp_program` ever went back
to forwarding. The **drift row was not deleted either**: its question is
unchanged — *does the returned literal assign the bare parameter, or put it
through something?* — and only the answer it demands has flipped. With the
premise empty it asserts the constructor still encodes, and reddens on a bare
forward with the re-fill handover. §5's **P5** proves that fires.

`RAMP_SIGN_LAG_MEASURED_AT` moved `ddaab282` → **`065dc790`**.
`RAMP_SIGN_LAG_MEASURED_ON` was already `2026-09-03` — the arming and the
retirement fell on the same day — so it is unchanged deliberately, not touched to
look busy. `RAMP_SIGN_LAG_MEASUREMENT` already named the engine source and
`origin/master`, which is the artifact that can see this defect, so it is
unchanged too; drift row *"the sentence names the ENGINE SOURCE"* still pins it
against `EDITOR_RASTER_PRESETS.md` and `effects_gen.py`.

### The measurement lives where the constant lives

`ramp-sign-lag.ts` gained a **"THE RETIREMENT, MEASURED FIRSTHAND"** section
carrying the revision, the tip subject, the blob, the four lines of the encode,
the 2^32 arithmetic, the both-directions pin, and the after-the-ensures argument
in full — so a future reader can see what cleared the premise without opening
another repository. Everything that describes the old constructor is retitled to
past tense, and a `⚠⚠ RETIRED — READ THIS FIRST` banner sits above it all,
because the file's first sentence is still *"A NEGATIVE ramp value does not reach
the game"* and that is a re-arm's inheritance, not today's fact.

---

## 4. The eleven re-aimed rows, and how each still pins the wording

Emptying the pin reddens **eleven** rows in
`src/renderer/components/effects/__tests__/ramp-sign-lag-disclosure.test.ts`.
Not one was inverted into `expect(...).toBeNull()` and not one was deleted.

**⚠ Why inversion would have been wrong.** A row that only checks *"renders
nothing"* passes against a leaf hard-wired shut, against a deleted mount, and
against a sentence that has rotted into gibberish — and the rot is the real risk,
because the wording is what a re-arm inherits verbatim, in a WARNING tone, on an
author's screen. So every content row is re-aimed onto an **explicit replay of
the filled premise**:

```ts
const THE_LAG_THAT_WAS: readonly RampSignField[] = Object.freeze(['start','step']);
```

Row 2 asserts it is exactly `RAMP_SIGN_FIELDS`, so the replay is real vocabulary
and not fiction, and that both cardinalities are reachable from it — the
derivation branches on `fields.length` (`is`/`are`, one name / `X and Y`), and a
single-field replay would leave the plural half asserted by nothing.

Both surfaces read the constant from their **own module scope** (that is the
point of the leaf: the panel gets no say), so the replay cannot be passed in at a
call site. `withPremise(awaiting)` re-imports the sign module, the leaf and the
provider with the constant stubbed, **and asserts the stub took** — a mock that
silently misses looks exactly like a correct retirement.

| # | Row | How it still pins the wording |
|---|---|---|
| 1 | *BOTH ramp fields are lagging* | → **the premise is EMPTY**; message distinguishes a legitimate re-arm (drift row) from a hand edit / merge announcement |
| 11 | a negative `step` speaks | replayed leaf; text `.toBe(rampSignLagDisclosure(['step']))` — a literal cannot pass — plus `step` named and `start` not |
| 12 | a negative `start` speaks too | replayed leaf; equal to the derivation; `` `start` (px) is negative `` |
| 13 | both negative names both | replayed leaf; the **plural** branch, equal to `rampSignLagDisclosure([...THE_LAG_THAT_WAS])` |
| 14 | the leaf renders in WARNING tone | replayed leaf; `props.tone === 'warning'` |
| 16 | it carries the caveat, naming -1 | replayed **provider**; `-1 is negative`, `does not fit u32`, `still the nearest value this ENCODING can spell` |
| 17 | the caveat fires ONLY on a negative offer | replayed provider; all four branches (off-grid up, above-range, below-range, and the positive control) |
| 18 | an off-grid NEGATIVE offer carries it | replayed provider; both named neighbours below zero |
| 25 | the CDP harness's `[ns]` needles are the constants' own words | sentence half unchanged; **refusal half driven through the replay**, because those needles are the caveat's words and checking them against production would be vacuously true of any string |
| 29 | *POISON: with the premise FILLED, a negative document must SPEAK* | **inverted in role** — see §5 |
| 31 | *…and unstubbed, both are back* | → *…and unstubbed, **both are silent***, with the caveat's absence asserted on the same input |

Rows that were already premise-independent are untouched and stay on production:
the sign-hole **arithmetic** (`-1` and `0` really are the nearest spellable
values — true in both states, and falsifying it to route around a build
limitation would have put a lie in the panel to hide a defect in a peer), the
"a fine rate gets no sentence" row, and the source-text rows.

**Six rows are new**, all asserting the retirement itself rather than assuming
it: the premise is empty (1); the replay is real vocabulary (2); both surfaces
render nothing (3); it is the **premise** that silenced them, not a derivation
that stopped working (4); the recorded revision is the retirement's and not the
arming's (8); and **no** negative-offer branch carries the caveat in production
(20) — three inputs, because the caveat was appended per-branch and a partial
retirement is exactly the corner a single-input row never visits.

### The mount stays, and is pinned harder than before

`BandPresetPanel.tsx` still mounts `<RampSignLagDisclosure />` on the ramp card.
It is now **the most deletable element in the panel**: it was added *for* this
disclosure, the disclosure has retired, and it renders nothing — so a "tidy away
the silent leaf" edit is invisible to a user and would make the re-arm reach no
screen. That is exactly what happened to the sibling `PresetLagDisclosure`'s
third mount, which no row named for a whole parcel. §5's **P3** measures it.

Its comment, and the leaf's, and the provider's, all carried the now-false claim
in prose above code that does nothing — the O62/O64 class in a source comment.
All three are rewritten to say the surface is silent, why it stays, what
measurement cleared it, and **MERGED, NOT CERTIFIED**.

---

## 5. Poison evidence — red-first, mutation quoted from disk, restored from a committed baseline

Every mutation was applied, **read back from disk before the run**, run against a
named runner, and restored with `git checkout HEAD -- <path>` from the committed
baseline `383a33a4` on a clean tree. Final `git status --short` empty.

Runner throughout:
`npx vitest run src/renderer/components/effects/__tests__/ramp-sign-lag-disclosure.test.ts test/formats/aeon-ramp-sign-drift.test.ts`
— **39 rows** (33 disclosure + 6 drift).

⚠ **All eight were re-measured against the FINAL tree**, after `383a33a4` added
row 33 and strengthened row 26, so every denominator below is the same 39. The
first pass ran at 38 and its numbers are not quoted here.

**C0 — CONTROL.** A fixture aeon: `git clone --shared --no-checkout` of the real
checkout (read-only; nothing written to aeon), `refs/remotes/origin/master`
pointed at `065dc790`, handed to the suite via `AEON_DIR`. Fixture blob
`20896f04900e7c03c5661adfc4947ca178f6e52c` = real blob. **39/39 GREEN** — so the
fixture itself explains none of P5's red.

| | Mutation (quoted from disk) | Result |
|---|---|---|
| **P1** | `return null; // P1` at the top of `RampSignLagDisclosure` — the "tidy away the silent leaf" edit | **RED 5/39**: rows 11, 12, 13, 14, **29** |
| **P2** | `rampSignRateCaveat(field, named) ?? // P2` — the third argument dropped | **RED 6/39**: rows 16, 17, 18, **24**, 25, **30** |
| **P3** | the ramp card's mount deleted (`grep -c` on disk: 1 → **0**) | **RED 2/39**: rows 21, 22 |
| **P4** | the premise re-filled by hand, aeon unchanged | **RED 8/39** across **both** files: the drift TIP row, the drift recorded-revision row, and 1, 3, 4, 20, 26, 31 |
| **P5** | the **fixture aeon** regressed to `rrp_start: start, rrp_step: step` | **RED 1/39**: the drift TIP row **alone** |
| **P6** | `const NS_PREMISE_OPEN = false; // P6` in the CDP harness | **RED 1/39**: row 26 |
| **P7** | the drift row's `const TIP = 'HEAD'` | **RED 2/39**: row 33 and the drift row's own measurement-naming row |

### ⚠ P1 is the whole argument for flipping the poison

Under P1 **every retirement row stayed green** — the premise is empty, the leaf
returns null, both surfaces are silent, and all of that is exactly as true of a
dead component as of a live one. The only rows that saw it are the five that
replay the filled premise. A retirement that had inverted those to `toBeNull()`
would report **34/39 green against a leaf that can never speak again**.

### ⚠ P2 shows the default-parameter trapdoor is caught behaviourally now

`rampSignRateCaveat(field, named, awaiting = RAMP_SIGN_FIELDS_AWAITING_AEON)` —
**a default parameter is a hidden import**: it resolves in its own module's scope,
so an omitted argument reads the real constant straight through a stub. That
exact shape produced a vacuous guard in this file's provider two hours before
this parcel. It has **not** come back (row 24 passes on the committed tree), and
it is now caught by **six** rows rather than one source-text pin — because with
the premise empty a caller that omits the argument reads `[]` and the replay
cannot put the caveat back. While the lag was open, the same mutation was
invisible to every behavioural row, since the default read the *filled* constant
and the caveat still worked.

### P5's failure message is the handover

```
AssertionError: THE PREMISE IS BACK AND THE DISCLOSURE IS EMPTY.
`raster_ramp_program` at aeon a8acad4f forwards a signed parameter into a `u32`
field again (rrp_start: start, rrp_step: step), so a negative ramp value fails at
emission and NOTHING ON SCREEN SAYS SO. Re-fill `RAMP_SIGN_FIELDS_AWAITING_AEON`
in src/core/formats/effects/ramp-sign-lag.ts and re-date it.
```

⚠ The drift's **recorded-revision** row stayed GREEN under P5, which is the
designed separation: TIP moved, the **record** (`065dc790`) did not, and a commit
is immutable. It reddens only when the citation is edited to name a revision that
does not say what the file claims — P4 shows that (`RED` on both drift rows).

---

## 6. Two holes the poison run found in my own new rows (`383a33a4`)

Both are the *guard that asserts nothing* shape, found by poisoning rows I had
just written rather than by reading them again.

**Row 26 could not see a hard-wired premise.** It asserted the CDP harness
*mentions* `RAMP_SIGN_FIELDS_AWAITING_AEON` and `NS_PREMISE_OPEN` — and a rig
that parses the premise and then ignores it (`const NS_PREMISE_OPEN = false`
beside a live read) passes a mention check while being exactly as pinned as one
that never read anything. It now pins the **derivation**: the flag comes from
`NS_PREMISE.length`, and `NS_PREMISE` is parsed out of `ramp-sign-lag.ts` on
disk. P6 was **green before this change and RED 1/39 after**.

**Row 33 is new — nothing asserted the measurement still existed.** Row 1's
message says only the drift row may move the premise, and until now no row
checked that file still did anything at all. Delete it, or reduce it to a claim
about Aurora's own constants, and the retirement becomes permanent and the re-arm
impossible: the premise would then only ever move by hand, the one route this
file's own message forbids. It pins the **shape** and deliberately not the value
— that would be the drift row's claim spelled twice through an indirection, and
would redden every time aeon's master moved.

---

## 7. The CDP harness inverts with the premise instead of going red on a correct screen

`scratchpad/ramp-control-harness.mjs`'s `[ns-a]`, `[ns-b]` and `[ns-c]` required
the sentence **painted**. With the premise empty that is false of a correct
screen, so the rig would have reported three failures on a repo where nothing is
wrong — the shape that already cost this suite a run on the sibling harness.

They now read the premise out of the file that owns it (the `variant-cycle`
`[2f]` precedent, including its `=\s*\n?\s*` lesson: a literal single space made
that harness **throw at import** for a day when a declaration wrapped) and ask
whichever question it makes true. `[ns-d]` — positive document, sentence gone —
is unchanged and true in both states.

One correctness fix beyond the inversion: `[ns-a]` now queries the **arithmetic**
half and the **caveat** half separately. Queried together, a vanished refusal
would have read as a retired caveat.

⚠ **NOT RUN FROM THIS LANE.** Electron/CDP, no display here. Its needles and its
premise-reading shape are pinned by node rows 25 and 26; whether it passes on a
real screen is untested and is tagged in §9.

---

## 8. Verification

**Suite**, `npm test`, both sides measured in this session in this worktree:

| | Test Files | Tests |
|---|---|---|
| master `eb426df3` (baseline) | 1 failed \| 486 passed \| 2 skipped (489) | **1 failed \| 6862 passed \| 8 skipped (6871)** |
| branch `383a33a4` | 487 passed \| 2 skipped (489) | **0 failed \| 6870 passed \| 8 skipped (6878)** |

Arithmetic closes with nothing unaccounted: **total +7** (the disclosure file
went 27 rows → 33, the drift file 5 → 6), and **passed +8** — those 7 new rows
plus the drift row turning green. **Skips unchanged at 8**; nothing was deleted
or skipped to get there.

⚠ **8 skips here vs 7 in the main checkout**, and the instrument names the
difference itself: `test/support/sibling-root.test.ts` step 3 is structurally
unmeasurable in a linked worktree and skips there by design. One legitimate skip,
not drift. **`npm test` reads one fewer pass and one more skip in a linked
worktree** — the figures above are all from this worktree, both sides.

`npx tsc --noEmit` clean. All `check:*` scripts green in the suite run
(`ledger-timestamps` with 17 canaries on throwaway repos and both ratchet
directions, `python-resolver` 7 rows, `skip-report` *"OK — every skip named its
reason"*).

---

## 9. NOT CLAIMED, and left for someone else

**No emulator, no ROM, no aeon build, no sigil chain, and no CDP harness run from
this lane.** Nothing here has seen a ROM ramp downward; §2's *MERGED, NOT
CERTIFIED* is the whole of what is claimed.

1. `npm run harness:ramp-control` — the photographic proof that both surfaces are
   off screen. Not run (Electron/CDP, no display). ⚠ If it is run, pin it with
   `AURORA_BUILT_TREE` onto this branch's own build: the precedent's run 1 read a
   premise from a worktree's source while driving master's app and reported a red
   that measured neither tree.
2. Whether aeon's pytest lane or a sigil attest chain has moved a ROM byte for
   the encode.

**⚠ A STALE COMMENT LEFT FOR THE LANE THAT OWNS IT.** `BandPresetPanel.tsx`
around line 1450, in the `PresetLagDisclosure` block (not mine), says the ROM
witness *"is on `origin/parcel/aurora-ramp-witness`, which is NOT an ancestor of
aeon's master"*. §2 measured that branch **is** an ancestor now, so the sentence
is false. It belongs to the `preset-lag.ts` / certification parcel, and an agent
is live on `fix/helpful-artifact-sweep` sweeping stale comments across `src/`, so
it is **listed rather than raced**.
