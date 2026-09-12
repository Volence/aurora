# RAMP-RIG-DCB-NEEDLE: `[dc-b]` reads its sentence instead of retyping it

Parcel size S, branch `parcel/ramp-rig-reaim`, cut from master `b8090d5b`. This is the ruled
follow-up of the open item `docs/reviews/2026-09-12-timeline-rig-reaim.md` left behind:
*"dc-b's needle (the second (b)). Owner ruling on re-pointing it at the post-`boundary`
wording, preferably derived from source."* It is re-pointed, and it is derived from source.

**In one paragraph.** Row `[dc-b]` of `scratchpad/ramp-control-harness.mjs` required four
hand-typed fragments of the band-controls refusal, and one of them — `EXACTLY ONE raster
program` — had been dead since 2026-09-04. The row could not find that needle, so it reported
an app failure on a tree where nothing was wrong, and it measured three quarters of what it was
written to measure. The needles now come out of `bandControlsRefusal` itself. The re-aimed row
was proved to discriminate with two mutations planted in the APP, each shown on disk, each run
red, each restored from the committed baseline and run green again.

## What was found first

| | |
|---|---|
| **The rig** | `scratchpad/ramp-control-harness.mjs`, `npm run harness:ramp-control` |
| **The row** | `[dc-b]` — "the `Add raster band` refusal is PAINTED and SAYS THE THING" |
| **The dead needle** | `'EXACTLY ONE raster program'` |
| **What the app says today** | `... carries a ramp, not bands. A preset holds EXACTLY ONE program: the schema's top-level oneOf refuses a document carrying two, and the engine has no combinator that mixes them, which means the band controls cannot write here at all. Set the Program row above back to bands to author bands; that discards the ramp, and it is one undo step.` |
| **Where it is composed** | `src/renderer/providers/effects-preset.ts`, `bandControlsRefusal` (the `return`, and `PROGRAM_ARM_NOUNS` / `PROGRAM_ARM_SEEDS` it reads) |
| **Where it is painted** | `src/renderer/components/effects/BandPresetPanel.tsx` — the `<Chip title=…>` and the `<Hint tone="warning">` beside it, both reading the same one predicate |

**The rewording was deliberate and correct, so the row is the thing that was wrong.**
`git log -S 'EXACTLY ONE raster program' -- src/renderer/providers/effects-preset.ts` names
`46bfbb58` (2026-09-04, *"codec: `boundary` parses and round-trips — and ONE list was
answering TWO questions"*). `boundary` joined the schema's top-level `oneOf` and lowers into
`EffectsPreset.ep_patched`, the sibling of `ep_raster`; the exclusivity rule therefore covers a
program that is not a raster program, and the sentence dropped a word it could no longer
justify. The app's own node row was carried across in that same commit —
`src/renderer/providers/__tests__/effects-preset-ramp-control.test.ts` reads
`expect(why).toMatch(/EXACTLY ONE program/)` with the reason in a comment beside it. Only the
CDP rig was left behind. Nothing here is a finding about the app.

## The red before the fix

Unmodified harness, this worktree's own debug build, `dist/build-flavour.json` =
`{"flavour":"debug","VITE_AURORA_DEBUG":"1"}`.

```
root:   /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-accd11db92686fadc
        pinned: AURORA_BUILT_TREE=<the same>
RESULT  22/23 rows passed
FAILED: [dc-b]
  "has":{"carries a ramp, not bands":true,
         "EXACTLY ONE raster program":false,
         "no combinator":true,
         "one undo step":true},  "allPresent":false, "inScroller":true
```

The sentence was on screen the whole time (`length:372`, `inScroller:true`): the row was not
finding a broken app, it was failing to find itself.

## What changed

**`scratchpad/lib/effects-control-aims.mjs`** gains `bandRefusalNeedles(root, arm, presetId)`,
beside the two aims the previous parcel put there. It reads `bandControlsRefusal`'s return
expression and returns `{noun, search, needles, where}`:

- a **scanner, not a regex** — the sentence is five `+`-joined chunks spanning two nested
  ternaries with escaped quotes (`schema\'s`) and a `${noun}` inside a branch. A regex over
  that matches one chunk, which is how a needle gets retyped one fragment at a time.
- `${preset.id}` and `${noun}` are resolved (`noun` from `PROGRAM_ARM_NOUNS`, read from the
  same file), so the needle names the document under test and the arm's own noun.
- the `convertible` ternary is followed into the branch **`PROGRAM_ARM_SEEDS` says is taken** —
  `bandControlsRefusal` offers "switch the Program row back to bands" only while `bands` has a
  seed. Read, not assumed: the day it loses one, the way out changes.
- the patched-channel clause between them is a **SPLIT**: its presence turns on the
  raster/patched partition, and duplicating that partition here would be a second source of
  truth for the very thing the app split in two on the day this needle broke. Splitting there
  costs only that the optional clause is not asserted.
- anything else it meets **throws**, naming the file. An unresolved substitution silently
  swallowed is a needle that quietly stops asserting the clause it was written for.

**`scratchpad/ramp-control-harness.mjs`**: `[dc-b]` searches by the derived `search` key and
asserts the derived `needles`. `[dc-c]` took the same treatment — it matched one retyped
fragment of the chip title and now requires the whole derived sentence. Both print the
derivation and its source on every run.

**`test/harness-effects-control-aims.test.ts`**: four rows running the reader against the real
`bandControlsRefusal`, over every non-bands arm the contract declares.

## The needle is unique to this rule, and here is the grep

The failure this repo has paid for is a re-pointed matcher that matches a *different* rule's
wording (a row matched `/has only \d+ tiles/` and caught an unrelated refusal for its whole
life). Both derived runs occur exactly once in the tree, at the one composition site:

```
$ grep -rn 'cannot write here at' src/ test/ scratchpad/
src/renderer/providers/effects-preset.ts:5483:    + 'has no combinator that mixes them, which means the band controls cannot write here at '

$ grep -rn 'back to bands to author bands' src/ test/ scratchpad/
src/renderer/providers/effects-preset.ts:5489:      ? 'Set the Program row above back to bands to author bands; that discards the '
```

The nearest sentence in the tree that could be confused for it is `src/main/editor-methods.ts:430`
("A preset carries exactly one program, so a preset whose program is not bands…"), an
agent-facing description in the MAIN process that this panel never paints; neither needle is a
substring of it. And the node rows assert the uniqueness directly rather than resting on a
grep: `bandControlsRefusal` is **null** on a bands document, and no other arm's sentence
contains the ramp needle (same rule, different noun).

## How it was verified

Runner: `npm run harness:ramp-control` (`package.json` → `node scratchpad/ramp-control-harness.mjs`)
for the CDP rows; `npx vitest run test/harness-effects-control-aims.test.ts`, in the `npm test`
chain, for the reader.

Every run: `ELECTRON_BIN=<main checkout>/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=<this worktree>`, `AEON_DIR=<a `git archive` of aeon
`a38ce7c961ef83136ac2f7c35e09b2ded7a109ea`, extracted to the session scratchpad>`. Every run
announced `root:` and `pinned:` as this worktree, and `build flavour: DEBUG`. The aeon copy is
opened read-only; the harness issues no save and the app has no autosave.

| run | app source | dpr | viewport / strip rect | tally | `[dc-b]` |
|---|---|---|---|---|---|
| A | baseline, rig **unmodified** | 1 | `1400x872` / `{x:1109, y:2477.90625, w:258, h:279.828125}` | 22/23 | **FAIL** — needle absent |
| B | baseline, rig **re-aimed** | 1 | same | **23/23** | PASS |
| C | **mutation M1** | 1 | same | 22/23 | **FAIL** — painted, wrong content |
| D | **mutation M2** | 1 | same | 22/23 | **FAIL** — no such sentence |
| E | **restored** from the committed baseline | 1 | same | **23/23** | PASS |

No claim above is assembled from two runs; each row is one run's own print.

### M1 — the panel paints only the first clause

A plausible "keep the hint short" regression, in the CONSUMER. Shown applied, from disk:

```
$ git diff --stat
 src/renderer/components/effects/BandPresetPanel.tsx | 2 +-
$ sed -n '738p' src/renderer/components/effects/BandPresetPanel.tsx
              <Hint tone="warning" style={{ marginTop: T.s2 }}>{bandControlsRefusal(selected)!.split('. ')[0]}</Hint>
```

Rebuilt (`VITE_AURORA_DEBUG=1 npm run build`, exit 0) and run. `[dc-b]` FAIL with an element
still painted — `"length":61, "inScroller":true, "text":"preset \"aurora_local_rampctl_probe\"
carries a ramp, not bands"`, both needles `false`. So the row failed on **content**, not on
absence. `[dc-c]` stayed green: the title was untouched, one property per row.

### M2 — the same rule, painted about the wrong document

A stale-selection bug, the kind React actually produces. Shown applied, from disk:

```
$ git diff --stat
 src/renderer/components/effects/BandPresetPanel.tsx | 2 +-
$ sed -n '738p' src/renderer/components/effects/BandPresetPanel.tsx
              <Hint tone="warning" style={{ marginTop: T.s2 }}>{bandControlsRefusal({ ...selected, id: 'aeon_ojz_sec6_baseswap' })}</Hint>
```

Rebuilt (exit 0) and run. `[dc-b]` FAIL, `painted refusal = null`: a full, well-formed sentence
of the **right rule about the wrong preset** does not satisfy this row. That is the discrimination
the "matcher caught somebody else's refusal" failure asks for. `[dc-c]` green again.

### The restore, and the runner is executing what was patched

`git restore --source=HEAD -- src/renderer/components/effects/BandPresetPanel.tsx` (a COMMITTED
baseline, not a `checkout --` over a dirty tree), `git status --porcelain` empty, line 738 read
back from disk, rebuilt, run E **23/23**. Applied-and-still-green never happened: every
mutation moved the tally on the first run after its build, so the rebuild really is reaching
the harness.

### The node rows, red-first too

Mutation in the PRODUCER, the case the reader exists to catch — the composer post-processes the
noun and the reader's derivation no longer matches what is composed:

```
$ grep -n "const noun = PROGRAM_ARM_NOUNS" src/renderer/providers/effects-preset.ts
5471:  const noun = PROGRAM_ARM_NOUNS[arm].toUpperCase();
```

`npx vitest run test/harness-effects-control-aims.test.ts` → **2 assertion failures**:
`is derived, not retyped: every needle is really in the sentence the app composes` and
`follows the arm noun and the way out rather than assuming either`. Restored with
`git restore --source=HEAD --` and re-run: **11 passed (11)**, `failure-class: no failures`.

## Stopped on, and left open

- **Nothing was stopped on.** The app's 2026-09-04 rewording is deliberate and right, and the
  row was not testing something the app stopped doing — it was testing the same thing in words
  the app no longer uses.
- **An app-prose staleness, NOT fixed, owner's call.**
  `src/renderer/components/effects/BandPresetPanel.tsx:80` still reads "a preset carries
  EXACTLY ONE raster program", the framing `46bfbb58` corrected. It is a comment on an import
  block, so nothing tests it and nothing paints it — but it is now the only `EXACTLY ONE raster
  program` left in the tree, so the next person grepping that phrase lands on prose instead of
  on the rule. A one-word edit in a file this parcel otherwise does not touch.
- **One peer still retypes this exact sentence, and it is the next one to break.**
  `scratchpad/base-swap-control-harness.mjs:671-673` and `:691` type four fragments of the same
  `bandControlsRefusal` output for the `base_swap` arm:
  `['carries a base swap, not bands', 'EXACTLY ONE program', 'no combinator', 'one undo step']`.
  They all match TODAY — that rig was written after the reword — which is precisely why it is
  worth naming: it is this defect at the stage before it shows. `bandRefusalNeedles` is already
  arm-parameterised and its node rows cover `base_swap` and `boundary`, so the conversion is
  `bandRefusalNeedles(RUN.root, 'base_swap', <its probe id>)`. **NOT done here**: honestly
  re-aiming that row needs its own red-first run of `harness:base-swap-control`, which is a
  different rig and outside this parcel. `grep -rn 'carries a ramp, not bands' scratchpad/` is
  clean after this change.
- **No emulator was touched**, and nothing here needs one: every claim is about a sentence on a
  rendered surface.
