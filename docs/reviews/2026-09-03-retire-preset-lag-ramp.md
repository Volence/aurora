# Retiring the preset-lag disclosure, a third time — aeon merged item 6's step 4

**Branch** `fix/retire-preset-lag-ramp`, cut from master `90e134e7`.
**Commits** `13ea7ccd` (the retirement), plus this packet.
**Parcel** EFFECTS-W1 DoD item 6, the consumer half. ROADMAP rows 127 / 128 / 97.

---

## 1. What was on screen, and why it was false

`PRESET_KEYS_AWAITING_AEON` held `['ramp']`, so `presetLagDisclosure` derived a
sentence the band-preset panel rendered above the channels controls, the anchors
controls, **and the ramp card itself**:

> Not consumed by the engine yet. `ramp` is authored here and saved to this
> preset file, and that is as far as it goes: aeon's generator
> (tools/effects_gen.py) does not accept it at origin/master and refuses the
> WHOLE DOCUMENT, so a preset carrying the key will not build, nothing set below
> reaches a ROM, and no emulator has shown it. …

Step 4 of the four-step chain has run, so every clause after the colon is now
wrong. The drift row caught it and **master was RED on exactly that one row**.

---

## 2. THE AEON REVISION I MEASURED AT, AND THE LINE I READ

Read through git objects — `git -C <aeon> show origin/master:<path>` — and never
by path into aeon's working tree, which is a live checkout being edited.

| | |
|---|---|
| aeon `origin/master` | **`c7ee7075f884fd4637b7bed7fed6cac0362474d4`** |
| tip subject | `lane-log: the plane swap and the ramp generator both land` |
| `docs/EDITOR_RASTER_PRESETS.md` blob | **`5514719913f550b309f33e7d1ae22f08270a4b1b`** |

The machine-checked block, verbatim:

```
preset:          bands, cycles, id, patch_motion, patch_world_ys, ramp, schema, variants
preset-ignored:  name
preset-refused:  fires
```

**`ramp` is in the accepted `preset:` row.** The premise has retired.

### ⚠ The artifact is the PAGE, not `tools/effects_gen.py`

`PRESET_LAG_MEASUREMENT` names *"…against aeon `docs/EDITOR_RASTER_PRESETS.md`
at `origin/master`"*, and that is exactly what the drift row consults —
`const PAGE = 'docs/EDITOR_RASTER_PRESETS.md'`, read at a resolved revision. The
page's block is what aeon's own test compares against the generator; evidence
about `effects_gen.py` is evidence about a **different artifact**. The brief
flagged that it had been handed generator-source evidence and had to go read the
page instead. **The constant needed no restatement — it already named the right
artifact** — so instead of editing it I added a row that pins the distinction:

> `the sentence names the PAGE at origin/master as its measurement, not the
> generator source`

which asserts `PRESET_LAG_MEASUREMENT` contains the page path and `origin/master`,
does **not** contain `effects_gen.py`, and that the drift test really reads that
path. `PRESET_LAG_MEASURED_ON` is `2026-09-03` and was already correct — the
re-measurement happened the same day — so it is unchanged, deliberately, rather
than touched to look busy.

### My own baseline, before I changed a line

```
× the contract-leads-consumer lag at aeon c7ee7075 is exactly ["ramp"] …
AssertionError: … the schema declares [], and aeon's page does not ACCEPT them
  - Expected: [ "ramp" ]   + Received: []
Tests  1 failed | 15 passed (16)
```

The row measured the closure independently, named the fix, and was the only
failure. ⚠ **Master is therefore NOT green today** — not from any Aurora
regression, but because aeon's master moved after `90e134e7` landed and this row
reads TIP on every run. That is the instrument working.

### ⚠ MERGED, NOT CERTIFIED

**Nothing in this repository has seen a ROM obey `ramp`.** What retired is a
claim about what aeon's **page accepts**. The engine half of item 6 shipped long
ago (`RasterRampProgram` since 2026-08-14, gated at aeon `cf3dfb1a`) and the
generator has now been taught the key — but *accepted at the door* and *obeyed by
a ROM* are different facts and only the first is measured here. Certification is
**aeon's pytest lane and sigil's attest chain**, not this landing.

The re-open condition is written into `preset-lag.ts`: if aeon's build refuses a
document Aurora actually writes under `ramp` — a unit, a bound, a fixed-point
spelling or a capability Aurora does not know about — then *"aeon reads this
key"* is true of the vocabulary and false of the documents this editor produces,
and the sentence comes back with wording that says so.

**RELAYED, NOT MEASURED BY ME:** aeon's generator half reportedly routes
`start`/`step` only through `fp16()` and carries a `-1.5` witness beside it — the
sign rule this lane caught earlier today, now guarded on both sides. I did not
read aeon's generator source; that sentence is a relay and is written down as one
in `preset-lag.ts` and in the commit message.

---

## 3. Which rows were re-aimed, and what each now asserts

### `test/formats/effects-preset-schema-drift.test.ts`

**The pin changed VALUE. It was not deleted.** §5 proves that with a live poison
rather than asserting it.

| Row | Was | Is |
|---|---|---|
| the lag row | `lag` **equals `PRESET_KEYS_AWAITING_AEON`** | `lag` **is `[]`** — red in both directions, message distinguishing a REGRESSION from a NEW LAG |
| vocabulary (→ direction) | schema-minus-page, with `LAGGING` subtracted | schema-minus-page, plain; still a PAIR of one-sided claims |
| refusal side-check | `preset-refused` minus reserved minus `LAGGING` | `preset-refused` minus reserved, `[]` |

The import of `PRESET_KEYS_AWAITING_AEON` and the `LAGGING` constant are gone,
because a row asserting *"the measured lag equals `<a constant known to be
empty>`"* is one claim spelled twice through an indirection nobody can read. The
coupling row below enforces that in both directions.

The **wide** measurement is untouched: `schemaOptional.filter((k) => !keys.preset.includes(k))`
— every schema-declared root key aeon does not **ACCEPT**, whichever way it
declines. §5's P1b shows why that still matters even though the narrow form
measures `[]` today.

### `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts`

Re-aimed for the **fifth** time (armed → retired → armed → retired → armed →
retired). Not inverted into assertions of `null`, and no row deleted. 16 rows → 21.

1. **The retirement is asserted, not assumed.** The premise is `[]`; the leaf and
   the derivation both return null; and it is the PREMISE that silenced them —
   the same derivation with a non-empty list still speaks.
2. **The wording is still fully asserted**, driven by TWO explicit replays:
   `THE_LAG_THAT_WAS = ['ramp']` (the premise that just retired) and
   `THE_LAG_BEFORE_THAT = ['patch_motion','patch_world_ys']`. Both are checked in
   row 1 to be OPTIONAL root keys the schema really declares, so the replays are
   real vocabulary and not fiction.
   ⚠ **Two replays, not one, because the derivation branches on cardinality**
   (`is`/`are`, `it goes`/`they go`, `the key`/`either key`). `ramp` alone is
   singular and would have left the PLURAL half of the sentence asserted by
   nothing. Both are deliberately the SHARPER flavour and not `['cycles','variants']`,
   whose softer *refused-by-name* wording would quietly weaken what the next
   re-arm inherits.
3. **The poison flips to the load-bearing direction.** Stub the premise back
   NON-empty and the leaf must render the WHOLE sentence, equal to
   `presetLagDisclosure(replay)` — so a literal cannot pass — with `tone="warning"`,
   on **both** cardinality branches. A leaf hard-wired to `return null` passes the
   retirement rows and fails here (proven: **P4**).
4. **The measurement is still pinned, in SHAPE and not only value.** The drift
   test must still `peerRepo('aeon')` / `readAtRev(…, 'origin/master', PAGE)`,
   compute the wide lag and assert `[]`. Deleting the row reddens this (**P2**);
   *narrowing it back* to the `preset-refused` filter also reddens it (**P3**).
5. **The coupling rule inverts with the premise**, and both directions are right
   in their own state: while the list is NON-empty the drift test MUST name it;
   while EMPTY it must NOT.

---

## 4. ⚠ A THIRD MOUNT SITE — AND NOTHING WAS WATCHING IT

**The brief said two mount sites. There are three.**

`BandPresetPanel.tsx` mounts `<PresetLagDisclosure />` in the channels section
(`:551`), the anchors section (`:583`) **and the `ramp` control card** (`:1375`).
The third was added by the ramp-control parcel (row 128) and **no row anywhere
named it** — the two section rows located their own mounts by section id and
asked no question about a total.

That made the ramp card the single most deletable mount in the panel: it was
added *for* `ramp`, `ramp` is the key that just retired, and the leaf there now
renders nothing. A "tidy away the silent leaf" edit would have taken it with no
test objecting.

**Measured retroactively, not asserted.** I applied the exact deletion (P6) to
**master's** rows and ran the disclosure test:

```
Test Files  1 passed (1)
      Tests  16 passed (16)
```

Completely invisible. Against this branch the same mutation is **RED 2/21**.

Its comment was also carrying the now-false claim in prose —
*"THE KEY AEON'S GENERATOR DOES NOT ACCEPT YET … the WHOLE DOCUMENT is refused
and the build fails"* — nine lines above a leaf that renders nothing. That is the
O62/O64 class in a source comment, and it is rewritten to say the leaf is silent,
why it stays mounted, and **MERGED, NOT CERTIFIED**.

A new block pins the site: the mount is located by a control only that card has
(`setRampSpanCommand(`), not by a key name; it must be propless and unguarded;
nothing between it and the card's controls may open a different surface (so the
row cannot pass on a panel that deleted this mount and grew one elsewhere
earlier in the file); the total is exactly three; and the card carries no
hand-typed copy of the sentence.

---

## 5. "If the lag re-opened tomorrow, which row goes red?"

**The drift test's lag row, and it is the only one** — which is the entire
argument for not deleting it. Measured by P1: with aeon's page reverted so `ramp`
moves back to `preset-refused:`, the drift file reports **1 failed / 15 passed**
and the failing row is the pin alone.

| If someone… | …this goes red |
|---|---|
| aeon un-builds `ramp` (moves it to `preset-refused`) | the drift lag row alone (**P1**) |
| aeon drops `ramp` from the page entirely | the lag row **and** the vocabulary row (**P1b**) |
| deletes the drift lag row | disclosure, *"…but it STILL MEASURES the WIDE lag"* (**P2**) |
| narrows the lag back to `preset-refused` | the same row (**P3**) |
| hard-wires the leaf shut | the two inverted-poison rows (**P4**) |
| re-fills the premise without aeon changing | 6 disclosure rows (**P5**) |
| deletes the ramp card's mount | the count row + the new mount row (**P6**) |

---

## 6. Poison evidence — red-first, mutation quoted from disk, restored from HEAD

Every mutation was applied, read back **from disk before the run**, run against a
NAMED runner, and restored with `git checkout HEAD -- <path>` from the committed
baseline `13ea7ccd` on a clean tree. Final `git status --short` empty.

**C0 — CONTROL.** A fake aeon repo built by extracting the page blob out of
aeon's git objects, committed, with `refs/remotes/origin/master` pointed at it,
handed to the suite via `AEON_DIR`. Fixture blob `5514719913f550b309f33e7d1ae22f08270a4b1b`
= real blob `5514719913f550b309f33e7d1ae22f08270a4b1b`. Drift test **16/16 GREEN**
— so the fixture itself does not explain P1's red.

**P1 — aeon UN-BUILDS `ramp`** (the regression the pin exists to catch).
Mutation on the fixture page, read back from disk:

```
50:preset:          bands, cycles, id, patch_motion, patch_world_ys, schema, variants
52:preset-refused:  fires, ramp
```

Runner `npx vitest run test/formats/effects-preset-schema-drift.test.ts`.
**RED 1/16**, the pin row alone:
`× the contract-leads-consumer lag at aeon 2c552a45 is EMPTY …`

**P1b — `ramp` absent from the page ENTIRELY** (the flavour the narrow form is
blind to). `preset-refused:` back to `fires` alone with `ramp` in neither row.
**RED 2/16** — the wide pin **and** the vocabulary row. This is the case the
2026-09-03 hole let through, and it is why the wide form stays.

**P2 — the pin row's assertion deleted** (`git diff --stat`: 1 insertion, 20
deletions in the drift test). Runner: disclosure + drift. **RED 1/37** —
*"…but it STILL MEASURES the WIDE lag, at a committed revision, and asserts it
EMPTY"*. ⚠ **The drift file itself stays GREEN**, which is the whole point.

**P3 — the wide lag narrowed back** to
`keys['preset-refused'].filter((k) => !schemaReserved.includes(k)).sort()`.
Runner: disclosure + drift. **RED 1/37** — the same row. ⚠ The drift test stays
GREEN here too: the narrow form measures `[]` today. Only the shape pin notices.

**P4 — the leaf hard-wired shut.** Mutation, read back from disk:

```
22:  return null; // P4: the leaf hard-wired shut, as a "tidy away the silent leaf" edit would.
```

Runner: disclosure. **RED 2/21** — the two inverted-poison rows. ⚠ **Every
retirement row stayed GREEN** (premise empty, leaf silent, derivation silent),
which is exactly why the poison had to flip direction: the retired-state
assertions cannot tell a working gate from a dead one.

**P5 — the premise re-filled** to `['ramp']` with aeon unchanged. Runner:
disclosure + drift. **RED 6/37** — the premise-is-empty row, the both-silent row,
the unstubbed-silent row, the no-coupling row, the anchors-section row and the
new ramp-card row. (The drift file stays green: its pin no longer reads the
premise, by design.)

**P6 — the ramp card's mount deleted** (`git diff`: `-      <PresetLagDisclosure />`,
mounts on disk 3 → 2). Runner: disclosure. **RED 2/21** — the count row and the
new mount row. **Retroactive control: the SAME mutation against master's rows is
16/16 GREEN.**

---

## 7. Verification

**Suite**, `npm test`, both sides measured in this session in this worktree:

| | Test Files | Tests |
|---|---|---|
| master `90e134e7` (baseline) | 1 failed \| 477 passed \| 2 skipped (480) | **1 failed \| 6665 passed \| 8 skipped (6674)** |
| branch `13ea7ccd` | 478 passed \| 2 skipped (480) | **0 failed \| 6671 passed \| 8 skipped (6679)** |

Arithmetic closes with nothing unaccounted: **total +5** (the disclosure test
went 16 rows → 21; the drift test is 16 on both sides), and **passed +6** — those
5 new rows plus the lag row turning green. Nothing was deleted or skipped to get
there.

⚠ **8 skips here vs 7 in the main checkout**, and the instrument names the
difference itself: `test/support/sibling-root.test.ts` step 3 is structurally
unmeasurable in a linked worktree and skips there by design. One legitimate skip,
not drift.

`npx tsc --noEmit` clean. All seven `check:*` scripts GREEN — `harness-guards`
**195 clean / 195 classified (187 .mjs + 8 .sh) · 0 failures · 0 unmeasurable**,
`peer-path-literals` 1238 files / 5 rules (all 5 fired on their canaries),
`test-collection` 480/480, `pseudo-skip` 6060 bodies, plus `ledger-timestamps`,
`object-stringify`, `python-resolver`.

### The scratchpad instruments

- `scratchpad/variant-cycle-harness.mjs` needed **no edit**: its `[2f]` row reads
  the premise out of `preset-lag.ts` and asks whichever question the premise
  makes true. Its regex was re-verified against the new one-line declaration —
  it matches, and reports the premise as empty.
- `scratchpad/poisons-anchor-authoring.sh` P8's banner attributed the leaf's
  silence to item 4's step 4 alone; it now records the re-arm for `ramp` and the
  second closure, because that attribution is what a future reader would trust.

---

## 8. NOT CLAIMED

**No emulator, no ROM, no aeon build, and no CDP harness run from this lane.**
Nothing here has seen a ROM obey `ramp`. What this parcel measured is what
aeon's **page** accepts at a committed revision, and what Aurora's panel says
about it.

**TAGGED for the controller's foreground follow-up:**

1. `npm run harness:variant-cycle` row `[2f]` — the photographic proof that the
   sentence is off screen. Not run here (Electron/CDP, no display from this
   lane). ⚠ If it is run, **pin it with `AURORA_BUILT_TREE` onto this branch's
   own build**: the precedent's run 1 read the premise from a worktree's source
   while driving master's app and reported a red that measured neither tree.
2. Whether aeon's own pytest lane accepts a `ramp` document Aurora actually
   writes (the §2 re-open condition), and whether any sigil chain has moved a ROM
   byte for item 6.
3. The relayed `fp16()` / `-1.5`-witness claim about aeon's generator: I did not
   read that source and it is recorded as a relay, not a measurement.
