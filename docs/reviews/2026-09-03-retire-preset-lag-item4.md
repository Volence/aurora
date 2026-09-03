# Retiring the preset-lag disclosure, again — aeon merged item 4's step 4

**Branch** `fix/retire-preset-lag-item4`, cut from master `c6a8ad9a`.
**Commits** `972e7a4d` (the retirement), plus this packet.
**Parcel** EFFECTS-W1 DoD item 4, the consumer half. ROADMAP rows 95 / 117 / 97.

---

## 1. What was on screen, and why it was false

`PRESET_KEYS_AWAITING_AEON` held `['patch_motion', 'patch_world_ys']`, so
`presetLagDisclosure` derived a sentence that the band-preset panel rendered
above BOTH the channels controls and the anchors controls:

> Not consumed by the engine yet. `patch_motion` and `patch_world_ys` are
> authored here and saved to this preset file, and that is as far as they go:
> aeon's generator (tools/effects_gen.py) does not accept them at origin/master
> and refuses the WHOLE DOCUMENT, so a preset carrying either key will not
> build, nothing set below reaches a ROM, and no emulator has shown either. …

Step 4 of the four-step chain has run, so every clause after the colon is now
wrong. The drift row caught it and master was RED on exactly that one row.

---

## 2. THE AEON REVISION I MEASURED AT, AND WHAT I READ THERE

Read through git objects — `git -C <aeon> show origin/master:<path>` — and never
by path into aeon's working tree, which is a live checkout being edited.

| | |
|---|---|
| aeon `origin/master` | **`b7f4bdeb6dee9449f2a6f46ec5883df61c1c790f`** |
| tip subject | `lane-log: item 4's reader lands, and the video-memory reframing` |
| `docs/EDITOR_RASTER_PRESETS.md` blob | **`22a420642a94cd7b690d25b312aac4c15731ef6f`** |

⚠ This is a LATER revision than the brief's (`b487d7f5`'s predecessor lineage) and
later than the `81b2a719` / `63fa3f8c` the re-arm was written against. aeon's
master moved during this session's own window. The drift row reads TIP on every
run by design, so it and not any comment answers the question on a later day.

**What is there:**

- `tools/effects_gen.py:285-286` —
  `PRESET_KEYS = frozenset({"schema", "id", "bands", "cycles", "variants",
  "patch_world_ys", "patch_motion"})`, with a comment above it dating the join to
  2026-09-03 and naming empyrean §7.3 as the authority (and noting §7.3 is
  STRICTER than aeon's own artifact, on purpose).
- `_check_patch_world_ys` (:882) and `_check_patch_motion` (:928) shape-check
  them — positional, `<= 4`, `PATCH_WORLD_Y_MAX = 0xFFFF`, `PATCH_ANCHOR_NONE`
  refused AS AN INTEGER — plus the cross-key refusal for a motion on a null seed
  (:981-989) and the `CAP_ANCHOR_MOTION` capability check (:1018, :1125).
- `render_patch_motion` (:1749) and the `fn_sec_patch_world_y` /
  `fn_sec_patch_motion` emitters (:2425-2427, :2462) lower them as VALUES into
  `ep_patch_world_ys` / `ep_patch_motion`.
- The page's machine-checked block lists `preset: bands, cycles, id,
  patch_motion, patch_world_ys, schema, variants`, `preset-refused: fires` alone,
  and grew `sweep: amp_shift, period_shift` / `sweep-optional: phase`.

**So the lag is EMPTY**, and my own baseline run of the drift test measured it
independently as `[]` before I changed a line:

```
AssertionError: THE LAG BETWEEN contract/schema/aurora-effects-preset.schema.json
(blob c1147071…) and aeon docs/EDITOR_RASTER_PRESETS.md at b7f4bdeb… is [], and
PRESET_KEYS_AWAITING_AEON says ["patch_motion","patch_world_ys"].
```

⚠ **MERGED, NOT CERTIFIED.** Nothing in this repository has seen a ROM obey
either key, and no row here claims one has. What retired is a claim about aeon's
GENERATOR. The re-open condition is written into `preset-lag.ts`: if aeon's build
refuses a document Aurora actually writes — a length, a sentinel, a unit, or a
capability Aurora does not know about — then "aeon reads these keys" is true of
the vocabulary and false of the documents this editor produces, and the sentence
comes back with wording that says so. That is aeon's pytest lane and sigil's
attest chain, not Aurora's, and nothing here pretends otherwise.

---

## 3. Which rows were re-aimed, and what each now asserts

### `test/formats/effects-preset-schema-drift.test.ts`

**The pin changed VALUE. It was not deleted.** Same argument as 2026-09-02, and
§5 below proves it with a live poison rather than asserting it.

| Row | Was | Is |
|---|---|---|
| the lag row | `lag` **equals `PRESET_KEYS_AWAITING_AEON`** | `lag` **is `[]`** — red in both directions, message distinguishing a REGRESSION from a NEW LAG |
| vocabulary (→ direction) | schema-minus-page equals `PRESET_KEYS_AWAITING_AEON.filter(…)` | `[]`, and the row STAYS A PAIR of one-sided claims (folding it into one `toEqual` is what went red on a blameless page on 2026-09-03) |
| refusal side-check | `preset-refused` minus reserved minus the premise | `preset-refused` minus reserved, `[]` |
| shapes | `cycle-channel` / `cycle-channel-optional` / `variant` | **plus `sweep` / `sweep-optional`**, derived from the schema's own `$defs.anchor_sweep` |

The import of `PRESET_KEYS_AWAITING_AEON` is gone, and the two failure messages
that named it in prose now say "the premise list in
src/core/formats/effects/preset-lag.ts" instead — because a row asserting *"the
measured lag equals `<a constant known to be empty>`"* is one claim spelled
twice through an indirection nobody can read. (The coupling row below caught
exactly this on the first run: my messages named the constant in a string
literal and `stripComments` does not strip strings. Red-first by accident, and
kept as evidence that the row bites.)

**Why `sweep` was added rather than left alone.** The page grew those rows when
step 4 landed, exactly as it grew three rows for item 5, and this is the same
question one level down. `amp_shift` / `period_shift` are base-2 LOGARITHMS: a
spelling the two halves disagree about breaks nothing anywhere and doubles or
halves whatever the next author builds against the wrong half.

### `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts`

Re-aimed for the **third** time (armed → retired → armed → retired). Not
inverted into assertions of `null`, and no row deleted.

1. **The retirement is asserted, not assumed.** The premise is `[]`; the leaf and
   the derivation both return null; and it is the PREMISE that silenced them —
   the same derivation with a non-empty list still speaks.
2. **The wording is still fully asserted**, driven by `THE_LAG_THAT_WAS =
   ['patch_motion', 'patch_world_ys']` — an explicit replay of the retired
   premise, checked in row 1 to be OPTIONAL root keys the schema really declares,
   so it is real vocabulary and not fiction. ⚠ **Deliberately this pair and not
   `['cycles','variants']`**: their lag was the softer *refused-by-name* flavour,
   and `refuses the WHOLE DOCUMENT` / `will not build` is the sentence THESE keys
   earned. Replaying the item-5 pair would have quietly softened the wording the
   next re-arm inherits.
3. **The poison flips to the load-bearing direction.** Stub the premise back
   NON-empty and the leaf must render the WHOLE sentence, equal to
   `presetLagDisclosure(THE_LAG_THAT_WAS)` — so a literal cannot pass — with
   `tone="warning"`. A leaf hard-wired to `return null` passes rows 1 and 2 and
   fails here (proven: **P5**).
4. **The measurement is still pinned, in SHAPE and not only value.** The drift
   test must still `peerRepo('aeon')` / `readAtRev(…, 'origin/master', PAGE)`,
   compute `schemaOptional.filter((k) => !keys.preset.includes(k))`, and assert
   `[]`. Deleting the row reddens this (**P2**); *narrowing it back* to the
   `preset-refused` filter also reddens it (**P3**) — which is the guard the
   brief asked for, because the narrow form was blind to precisely the flavour
   d36d704 produced.
5. **Both mount sites end coherent.** The channels-section and anchors-section
   rows still require the leaf MOUNTED, first, propless, unconditional in each
   `<SectionBody>`. A mounted leaf rendering `null` IS the retired state; an
   unmounted one is a re-arm that never reaches the screen. The anchors row's
   old "today" clause had a branch that would have thrown on `null`; it now
   asserts BOTH halves — the live premise names neither of this section's keys,
   AND the sentence a re-opened lag would produce still names them and still says
   `refuses the WHOLE DOCUMENT` / `will not build`.

### Two scratchpad instruments repaired

- `scratchpad/variant-cycle-harness.mjs` `[2f]`'s **open** branch still pinned the
  12aecd5 phrasing `/refuses (?:it|both) by name at origin\/master/`, which
  EW-CHANNELS-WRITER re-worded — one of the four pre-existing failures the
  EW-TIMELINE-CLOCK control run isolated. It now matches the two clauses BOTH
  wordings carry (`at origin/master`, `nothing set below reaches a ROM`) and
  leaves the exact phrasing to the vitest rows that drive the derivation
  directly. A copy of today's sentence there would be a second source of truth
  that goes stale on the next flavour change.
- `scratchpad/poisons-anchor-authoring.sh` P8's banner asserted the premise names
  both keys; it now says why an already-silent leaf stays mounted.

⚠ **The harness's premise regex was re-verified against the new one-line
declaration** (`grep -rn PRESET_KEYS_AWAITING_AEON src/ test/ scratchpad/`, then
executing the regex against the file): `PREMISE_MATCH=""`, `LAG_KEYS=[]`,
`PREMISE_OPEN=false`. `npm test` does not run `.mjs` harnesses, so a break there
is invisible to the suite — that blind spot bit three times in one night.

---

## 4. "If the lag re-opened tomorrow, which row goes red?"

**The drift test's lag row, and it is the only one — which is the entire argument
for not deleting it.** Measured, not asserted, by P1 below: with aeon's page
reverted so that `patch_motion` / `patch_world_ys` move from `preset:` back to
`preset-refused:`, the drift file reports **1 failed / 15 passed**. The
vocabulary row stays green (the union is unchanged; the names merely move between
rows), the shape rows stay green, and every disclosure row stays green — because
Aurora's own constant has not moved. Nothing else in 6545 rows notices.

Secondary coverage, each proven separately:

| If someone… | …this goes red |
|---|---|
| deletes the drift lag row | disclosure test, *"…but it STILL MEASURES the WIDE lag"* (**P2**) |
| narrows the lag back to `preset-refused` | the same row (**P3**) |
| re-fills the premise without aeon changing | 5 disclosure rows (**P4**) |
| hard-wires the leaf shut | the poison row (**P5**) |

---

## 5. Poison evidence — red-first, mutation quoted from disk, restored from HEAD

Every mutation was applied, `git diff`'d **from disk before the run**, run against
a NAMED runner, and restored with `git checkout HEAD -- <path>` from the
committed baseline `972e7a4d` on a clean tree. Final `git status --short` empty.

**C0 — CONTROL.** A fake aeon repo built by `git -C aeon archive origin/master
docs/EDITOR_RASTER_PRESETS.md`, committed, with `refs/remotes/origin/master`
pointed at it, handed to the suite via `AEON_DIR`. Fixture blob
`22a42064…` = real blob `22a42064…`. Drift test **16/16 GREEN** — so the fixture
itself does not explain P1's red.

**P1 — aeon REVERTS step 4** (the regression the pin exists to catch). Mutation
on the fixture page:

```
-preset:          bands, cycles, id, patch_motion, patch_world_ys, schema, variants
+preset:          bands, cycles, id, schema, variants
 preset-ignored:  name
-preset-refused:  fires
+preset-refused:  fires, patch_motion, patch_world_ys
```

Runner `npx vitest run test/formats/effects-preset-schema-drift.test.ts`.
**RED 1/16**, and it is the pin row alone:
`× the contract-leads-consumer lag at aeon 11575909 is EMPTY …`

**P2 — the pin row's assertion deleted.** Runner: the disclosure test.
**RED 1/15** — *"…but it STILL MEASURES the WIDE lag, at a committed revision,
and asserts it EMPTY"*.

**P3 — the wide lag narrowed back** to
`keys['preset-refused'].filter((k) => !schemaReserved.includes(k))`. Runner:
disclosure + drift. **RED 1/31** — the same row. ⚠ Note the drift test itself
stays GREEN under P3, which is the point: the narrow form measures `[]` today
too. Only the shape pin notices.

**P4 — the premise re-filled** to `['patch_motion', 'patch_world_ys']` with aeon
unchanged. Runner: disclosure + drift. **RED 5/31** — the premise-is-empty row,
the both-silent row, the unstubbed-silent row, the no-coupling row, and the
anchors-section row. (The drift file stays green: its pin no longer reads the
premise, by design.)

**P5 — the leaf hard-wired shut** (`… ; return null;` before the gate). Runner:
disclosure. **RED 1/15** — *"with PRESET_KEYS_AWAITING_AEON re-filled, the leaf
renders the WHOLE sentence as body text"*. Rows 1 and 2 stay green, which is
exactly why the poison had to flip direction.

**P6 — NOT RUN, DELIBERATELY.** Unmounting the leaf from the anchors section
would mutate `BandPresetPanel.tsx`, which a live agent on
`fix/effects-label-widths` owns. The two mount rows are unchanged from `12e12b3e`
and were red-first there (`poisons-anchor-authoring.sh` P8). The one row in that
block that I DID change is reddened by P4, which needs no panel edit.

---

## 6. Verification

**Suite**, `npm test`, both sides measured in this session in this worktree:

| | Test Files | Tests |
|---|---|---|
| master `c6a8ad9a` (baseline) | 1 failed \| 470 passed \| 2 skipped (473) | **1 failed \| 6536 passed \| 8 skipped (6545)** |
| branch `972e7a4d` | 471 passed \| 2 skipped (473) | **0 failed \| 6537 passed \| 8 skipped (6545)** |

Arithmetic closes with nothing unaccounted: **total unchanged at 6545** — no row
added or removed — and **+1 passed** is the single row that turned green. The
baseline failure was the lag row and nothing else.

⚠ **8 skips here vs the controller's 7 in the main checkout**, and the instrument
names the difference itself: `test/support/sibling-root.test.ts` step 3 is
structurally unmeasurable in a linked worktree and skips there by design. That is
one legitimate skip, not drift, and it accounts for the whole gap (6537 + 8 =
6545 = 6537 + 7 + 1).

`npx tsc --noEmit` clean. All seven `check:*` scripts GREEN —
`harness-guards` **190 clean / 190 classified (182 .mjs + 8 .sh) · 0 failures ·
0 unmeasurable**, `peer-path-literals` 1225 files / 4 rules (all 4 fired on their
canaries), `test-collection` 473/473, `pseudo-skip` 5941 bodies, plus
`ledger-timestamps`, `object-stringify`, `python-resolver`.

### The CDP harness — and a trap worth naming

`npm run harness:variant-cycle`, `VITE_AURORA_DEBUG=1 npm run build`,
`ELECTRON_BIN` at the main checkout's binary, a fresh
`git archive origin/master | tar -x` of aeon on ext4 as `AEON_DIR`, under
`xvfb-run` at 1680×1050.

⚠ **RUN 1 WAS NOT A MEASUREMENT AND I ALMOST REPORTED IT AS ONE.** It printed
`27/31` with `[2f]` RED, and `[2f]` is this parcel's row. It announced
`root: /home/volence/sonic_hacks/aurora BORROWED — this script lives in
<worktree>, which has no built app`. So it read the PREMISE from **my** source
(`"premise":[]`) and drove **master's** built app, which still renders the
sentence. Source from one tree, binary from another: the red was an artifact of
the pairing and said nothing about either tree. This is O72's split doing exactly
what it was built to announce, and the announcement is the only reason it was
caught.

**RUN 2, pinned with `AURORA_BUILT_TREE=<this worktree>` onto this branch's own
build: 28/31 in 33.1s**, and

```
PASS  [2f] the disclosure is RETIRED (premise empty in preset-lag.ts) —
          NO element on the open section says "Not consumed by the engine yet."
          {"premise":[],"leaf":false}
          screenshot: scratchpad/shots-variant-cycle/disclosure-retired.png
```

The retirement is photographed the way the sentence was. The remaining three
failures — `[6d]`, `[6e]`, `[7b]`, all about the `lines` integer bitmask — are the
pre-existing ones the EW-TIMELINE-CLOCK packet isolated with a control run, are
unrelated to this parcel, and were failing before it. Run 1 vs run 2 is itself a
control for `[2f]`: the ONLY difference between them is which built tree the app
came from.

---

## 7. NOT CLAIMED

**No emulator, no ROM, no aeon build was run from this lane.** Nothing here has
seen a ROM obey `patch_world_ys` or `patch_motion`. What this parcel measured is
what aeon's GENERATOR accepts at a committed revision, and what Aurora's panel
says about it.

**For the controller's foreground follow-up:** whether aeon's own pytest lane
accepts a document Aurora actually writes under these keys (the §2 re-open
condition), and whether any sigil chain has moved a ROM byte for item 4.

**Left stale on purpose, because it is not this branch's to edit:**
`docs/OVERSEER-LOG.md`'s EW-TIMELINE-CLOCK entry says *"the on-screen disclosure
says aeon's generator still refuses the whole document, so nothing authored here
builds today"*. That is the overseer's own file. ROADMAP row 117's *"A LAG
RE-OPENED"* paragraph is accurate as history; a retirement note is appended to it
here.
