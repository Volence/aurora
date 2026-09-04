# EW-NOBAND-SILENCE — the channel aeon documents nothing about now says so

**Parcel** EW-NOBAND-SILENCE, the tail of EW-TIMELINE-CLOCK's band-fit half
(`docs/reviews/2026-09-04-ew-timeline-clock.md`, row 145 — read that first, this is one
sentence added to it).
**Branch** `ew-noband-silence`, cut from `d488d6a2`.
**Date** 2026-09-04.
**Bands** unchanged: aeon `776a3ea1ad30d59f0b43ec4f2b39a812390e5038`, blob `a00e3bb0`,
vendored at `src/core/formats/effects/aeon-effects-channel-bands.json`. **Nothing about the
pin, the currency gate, the ladder interlock or the refusal wording was touched.**

---

## 1. The defect, in one paragraph

`EFFECTS_PRESET_MAX_PATCH` is 4. aeon's bands sidecar declares channels **0 and 1**. So an
author who reaches channel 2 gets the `no-band` verdict, and the panel rendered **nothing** —
the same nothing a well-fitting sweep on channel 1 renders. **Nothing reads as "we looked and
it is fine",** which is exactly the reassurance the whole band-fit feature exists to withhold,
one layer up. The previous parcel recorded this as open (§9, *"the `no-band` silence for
channels 2 and 3 is invisible to an author… a wording call I did not make unilaterally"*); the
overseer and the hub ruled it, and this is the build.

`anchorSweepNoBandAdvisory` now states the coverage gap. Painted, measured off the live DOM:

> aeon declares no screen band for channel 2. In sonic4 only channels 0 and 1 declare a
> patchable(lo:, hi:) range, so there is no boundary to measure this sweep against and nothing
> here can tell you whether it will land where you intend. Read this silence as missing
> information, never as a clearance: the over-long-sweep warning under Travel cannot fire on
> this channel at all.

The channel list and the game name are read from the data (`EFFECTS_CHANNEL_BANDS_DECLARED`,
`EFFECTS_CHANNEL_BANDS_GAME`), never typed — so the day aeon declares a band for channel 2 the
sentence stops appearing there and stops claiming two channels.

**No `fits` arm was added.** `AnchorBandFit` still has three arms and still cannot express a
clearance; this parcel put a sentence on an existing arm and changed no verdict.

---

## 2. THE QUESTION I WAS ASKED TO SETTLE — and I agree with the lean, for a sharper reason

The brief's own argument reaches further than the ruling: **`cannot-tell` is permanently silent
too.** Channel 0 is 218 lines against a widest sweep of 128 px, so nothing an author can pick is
ever refused there, and by the identical reasoning that silence also reads as a clearance.
Should it speak?

**No — and the deciding reason is structural, not taste.** Three arguments, in the order they
should be weighed. The third is the one usually offered and it is the weakest.

**(1) They are different kinds of fact, and only one of them is Aurora's to report.**
`cannot-tell` is a state **aeon's contract names and defines**: the check RAN, compared travel
against lines, and the contract itself says the answer is unknowable at author time because the
latched line is `anchor - Camera_Y`. `no-band` is **not in that contract at all** — it exists
only because Aurora offers four channels while aeon documents two. That gap is Aurora's own,
and an author has no way to discover it. A negative result and an un-run check are not the same
report, and only the second one is a fact about the tool the author is holding.

**(2) The refusal's slot must stay empty where a refusal can land.** Both hints render in the
same position under `Travel`. On a channel **with** a band, leaving that position blank in the
healthy case is what makes the refusal legible by **appearing** — a permanent cannot-tell note
would turn "nothing becomes a warning" into "text is replaced by other text", which is read,
not noticed. On a `no-band` channel **no refusal can ever land in that slot**: `anchorBandFit`
returns `no-band` for every rung, so the new sentence collides with nothing. That is a
structural property of the data and not a hope, so `[6i]` asserts it — the advisory appears on
exactly the channels aeon does not declare, is all-or-nothing per channel, and never coexists
with a refusal.

**(3) And only then, noise.** Every well-authored sweep in the editor lands in `cannot-tell`. A
note under every one of them is how the one sentence that IS certain gets skipped.

**The asymmetry is therefore deliberate and is written down in three places** so a future reader
finds the reason and not just the behaviour: `anchorSweepNoBandAdvisory`'s header (the three
arguments, headed *"READ BEFORE 'FIXING'"*), the `else` branch of the `[6j]` census (which is
the code a consistency-minded editor would have to delete), and the `no-band` arm's own doc
comment in `channel-bands.ts`. **And it is defended by a plant**: `N2` below is precisely the
"make them consistent" edit, and it goes red.

**What was NOT built, either way:** no green tick, no checkmark, no "fits". The advisory is
asserted not to contain `fits`, `ok` or `✓`, on every rung of every undeclared channel.

---

## 3. Tone — measured, not asserted

`Hint` has two tones: `NOTE` (`--text-lo`) and `tone="warning"` (`--warning`). **This renders
neutral.** Reaching channel 2 is not the author's mistake and there is nothing to fix — there is
no smaller Travel to pick, because there is no band. **Every warning on this panel ends in an
action** (*"Pick a smaller Travel"*, *"Spell channel 1 first"*); this one ends in a limit, and a
warning with no remedy teaches an author that the warning colour means nothing.

`anchorMotionWithoutSeedAdvisory` is `tone="warning"` and that is right for it: a motion with no
seed is a state the AUTHOR produced and can undo. This is not that.

The harness reads `getComputedStyle` off the live node and resolves **both** tokens off the
document root in the same call, so the row compares three measured values rather than one
measured value against a colour typed into the harness:

```
hint colour rgb(110, 117, 137)   (--text-lo rgb(110, 117, 137), --warning rgb(251, 191, 36))
```

Plant `H2` (`<Hint under tone="warning">`) moved that first value to `rgb(251, 191, 36)` and
reddened the row, so the tone half of `[10d]` is a measurement and not decoration.

---

## 4. Red-first — every plant, with the mutation quoted

Each applied on disk, shown by `git diff -U0`, and restored with `git checkout HEAD --` from a
**committed** baseline (`86611fbe`) on a clean tree.

### Node suite — `src/renderer/providers/__tests__/effects-preset-anchors.test.ts`

| # | mutation (`git diff -U0`) | result |
|---|---|---|
| N1 | `+  return null; // PLANT N1` at the top of `anchorSweepNoBandAdvisory` — the feature reverted | **RED 3**: `[6h] [6i] [6j]`. `AssertionError: channel 2, amp_shift 2: expected null not to be null` |
| N2 | `-  if (fit === null \|\| fit.verdict !== 'no-band') return null;` → `+  if (fit === null) return null;` — **the "make cannot-tell consistent" edit** | **RED 2**: `[6i] [6j]` — `expected 'aeon declares no screen band for chan…' to be null` at *channel 0, amp_shift 2*. `[6h]` correctly stays green: the sentence is still right where it belongs, it has merely leaked |
| N3 | the sentence rewritten as `'This sweep fits — no band constrains channel ' + index + '. ✓ '` | **RED 1**: `[6h]` — `expected 'this sweep fits — no band constrains …' not to contain 'fits'` |
| N4 | `channelList(EFFECTS_CHANNEL_BANDS_DECLARED)` → `…DECLARED.slice(0, 1))` — one declared channel dropped from the coverage claim | **RED 1**: `[6h]` — `expected … to contain 'channels 0 and 1'` |

`N2` is the one that matters. The asymmetry this parcel argues for is not held by a comment.

### Harness — `scratchpad/anchor-authoring-harness.mjs` `[10d]`

Each plant rebuilt (`VITE_AURORA_DEBUG=1 npx electron-vite build`) and re-run; **every run
`in-tree`**, banner quoted in §5.

| # | mutation | result |
|---|---|---|
| H1 | `+  return null; // PLANT H1` — the advisory silenced | **RED, 31/32** |
| H2 | `<Hint under>` → `<Hint under tone="warning">` | **RED, 31/32**, with `hint colour rgb(251, 191, 36)` printed beside both resolved tokens |
| H3 | the `no-band` guard dropped so the sentence is a constant under every sweep | **RED, 31/32** — caught by the clause requiring a **declared** channel's card NOT to carry it |

H3 exists because the harness cannot see the provider: without that clause `[10d]` would pass on
a string rendered under every sweep in the editor.

---

## 5. The rows, and which kind each one is

**`[10d]` is a PRESENCE row — a discriminator.** It is stated because `[10b]` and `[10c]`, added
by the previous parcel, are absence assertions that go green against an app with no band feature
at all, and three rows in a section should not read as three proofs.

It aims at the **first undeclared channel read out of the vendored sidecar in this process** (2
today) — not at channel 0, which has a band and could never paint this sentence. If aeon ever
declares a band for every channel the panel offers, the row prints **`NOT MEASURED, NOT A
PASS`** and says the advisory cannot appear, rather than passing quietly.

Node rows: `[6h]` the sentence, its contents, and never a clearance (plus off-ladder → still
null, on an undeclared channel too); `[6i]` the structural property from §2(2); `[6j]` a
**CENSUS** over every channel × rung whose counts must sum to `MAX_PATCH × rungs` and which
asserts all three verdicts were actually reached — because "cannot-tell says nothing" is a claim
about every such cell, not about the two cells a suite happens to name.

Both `[6h]` and `[6i]` are loud on unmeasurable: `[6h]` fails with a written reason if aeon
closes the coverage gap (nothing left to measure) or grows past two declared channels (its
list-spelling expectation no longer applies).

---

## 6. Verified

- **`npm test` — 492 files passed / 3 skipped (495); 6980 tests passed / 9 skipped (6989); 0
  failed.** (+3 tests over the previous packet's 6977, which are `[6h]`–`[6j]`.) All 9 skips
  pre-existing and loud: absent `s4_engine` tree ×2, opt-in bench, live-warp ×2, `sibling-root`
  step 3 unmeasurable in a linked worktree, and the two currency rows' peer-absent form.
  `skip-report: OK — every skip named its reason.` The `test` script runs all eight `check:*`
  scripts and `typecheck` ahead of vitest, so those are inside that green.
- The one touched test file alone: **42/42** (was 39).
- `npm run harness:anchor-authoring`: **32/32**, 44.2 s, xvfb `:93` 1680×1050, fresh
  `VITE_AURORA_DEBUG=1` build.

**THE BORROW BANNER, QUOTED, ON EVERY HARNESS RUN IN THIS PARCEL** — the trap row 145 recorded
and the reason a row can come back green against code that is not in the tree:

```
      in-tree: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-acb5e537d87542beb
               has node_modules/.bin/electron and dist/main/index.mjs
```

Reached by symlinking the main checkout's electron binary into the worktree
(`node_modules/` is gitignored) and building in-tree, which is row 145's own fix. `AEON_DIR`
pointed at a **pinned, writable, `.git`-less copy** made with
`git -C …/aeon archive 776a3ea1 | tar -x -C <scratch>/aeon-pinned` — **the live aeon tree was
never written.**

---

## 7. Open, and tagged rather than claimed

- **NO EMULATOR, NO ROM, NO aeon BUILD.** The oracle server is down suite-wide this session and
  a background agent must not touch it regardless. Nothing here has watched an anchor on channel
  2 do anything; the claim the sentence makes is about what aeon **declares**, which is checkable
  from the sidecar, and it deliberately claims nothing about what the engine does there.
  **TAGGED for foreground follow-up** if runtime confirmation is wanted.
- **What channels 2 and 3 actually do in the engine is still unknown to Aurora.** The advisory
  says so — that is its whole content — but it is a disclosure, not a fix. The fix is aeon
  declaring `patchable(lo:, hi:)` for those channels, at which point this sentence disappears on
  its own and the refusal becomes reachable there. **Nothing in Aurora needs to change for that
  to happen**, which is the property `[6h]`'s loud-on-unmeasurable guard exists to preserve.
- **`cannot-tell` remains silent, on purpose.** §2 is the argument; `[6j]`'s `else` branch and
  `anchorSweepNoBandAdvisory`'s header are where a future reader finds it. If someone
  nonetheless wants a sentence there, the verdict is already exposed by `anchorSweepBandFit`
  and no type changes.
