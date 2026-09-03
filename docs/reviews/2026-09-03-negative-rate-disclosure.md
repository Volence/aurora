# The panel recommended a scroll rate that cannot reach a ROM

**Branch** `fix/negative-rate-disclosure`, cut from master `f496c026`.
**Commits** `0a61f19f` (the disclosure), `3667e32c` (the detector's own gate),
`8687fe76` (the harness rig fix), plus this packet.
**Parcel** EFFECTS-W1, the ramp control's consumer half. ROADMAP §5.1 row 132.

---

## 1. THE PREMISE, MEASURED FIRSTHAND BEFORE ANYTHING WAS BUILT

The brief said aeon's encode fix was unmerged **as of writing** and might land
while I worked, and that a disclosure for a condition that has cleared is worse
than none. So the first thing this lane did was read the artifact.

Read through git objects — `git --git-dir=<aeon>/.git show origin/master:<path>`
— never by path into aeon's working tree, which is a peer lane's live checkout.
Nothing was written to any sibling.

| | |
|---|---|
| aeon `origin/master` | **`ddaab2820eebc00b439ea51bc7b04363aa0f2157`** |
| tip subject | `docs(deferred-work): book the preset-id namespace collision, both directions` |
| tip date | 2026-09-03 17:50:57 -0400 |
| path | `engine/effects/raster.emp` |

Verbatim, from that revision:

```
struct RasterRampProgram {   ...
    rrp_start:      u32,    // 16.16 initial accumulator
    rrp_step:       u32,    // 16.16 per-line delta, signed
}

pub comptime fn raster_ramp_program(top: int, lines: int, cmd: int,
                                    start: int, step: int) -> RasterRampProgram {
    ...
    return RasterRampProgram{ ...
        rrp_start:      start,
        rrp_step:       step,
    }
}
```

**The fields are `u32`, the parameters are signed `int`, and the constructor
FORWARDS them.** No two's-complement encode. `parcel/aurora-ramp-witness` does
not appear in aeon's remote refs at this revision.

**THE PREMISE HOLDS.** Everything below was built on that reading.

The rest of the mechanism is **RELAYED, not measured here** (it is the brief's,
and it is aeon's and sigil's to certify): the runtime honours the sign via
`add.l`; sigil refuses the emission with
`[emit.out-of-range] -98304 does not fit u32 (0..=4294967295)`; nothing noticed
for the tier's whole life because every authored step was positive.

`-98304` is `fp16(-1, 128)` and that arithmetic **is** checked in aeon's own
source at the revision above (`ensure(fp16(-1, 128) == -98304, ...)`).

---

## 2. THE DEFECT IS A RECOMMENDATION, NOT AN OMISSION

`rampRateProblem` (`src/renderer/providers/effects-preset.ts`) refuses a rate
with no `fp16` spelling. `rampRateNeighbours` then **names the nearest values
that DO have one**, and for anything in the unreachable interval `(-1, 0)` the
pair it names is `-1` and `0`.

> `preset "…" ramp step: -0.5 px per scanline HAS NO SPELLING in this encoding.
> … **The nearest rates you CAN have are -1 and 0.** Refused, and not rounded to
> either — step is still 1 px per scanline.

A refusal that names a nearest-representable alternative **carries the authority
of a fix**. It is the sentence the author acts on without question. So today an
author types `-0.5`, the panel tells them to use `-1`, and that document cannot
build. On that path silence would have been strictly better than what we shipped.

### ⚠ AND THE ARITHMETIC WAS NOT TOUCHED

`-1` and `0` really **are** the nearest values this encoding can spell. That is a
true fact about `fp16`, and falsifying it to route around a **build** limitation
would put a lie in the panel to hide a defect in a peer. The caveat is **added
beside** the true arithmetic; a row asserts the neighbours are still named, and
mutation **D** below proves that row is real.

Authoring a negative was not removed either. The document is well-formed, the
schema accepts it, aeon's generator accepts it — the limitation is downstream of
all three, and Aurora refusing here would be Aurora inventing a rule.

---

## 3. THE SENTENCE, WHERE IT MOUNTS, AND WHO SEES IT

### 3.1 The scope, which is the hard part

**This is NOT "ramp does not reach the game."** That disclosure retired hours
earlier (`preset-lag.ts`, aeon `c7ee7075`), and re-arming it would be a **false
warning — this very defect wearing the other hat.** A positive ramp builds and
runs. The sentence says only the sign, and a wording row pins the clause that
makes that explicit on screen:

> …**A POSITIVE value in the same field builds and runs today — this is about the
> sign, not about `ramp`.**

### 3.2 The two surfaces

| where | who sees it |
|---|---|
| **The ramp card**, `RampSignLagDisclosure` — mounted once, fed the document's own `start`/`step` through `presetFp16ToNumber` | an author whose document **holds** a negative value, in either field. A positive or zero document sees **nothing at all** |
| **Inside the rate refusal**, appended by `rampSignRateCaveat` | an author who typed a value whose refusal **offers a negative alternative** — the `(-1, 0)` hole, an off-grid negative, and below-range. An offer of a positive value gets nothing appended |

Both fields are disclosed, because `rrp_start` and `rrp_step` are both `u32` and
both forwarded: a run that merely **begins** below the rest position is as
unbuildable as one that ramps upward.

### 3.3 One constant is the whole of it

`src/core/formats/effects/ramp-sign-lag.ts` holds the only hand-typed statement
of the fact:

```ts
export const RAMP_SIGN_FIELDS_AWAITING_AEON: readonly RampSignField[] =
  Object.freeze<RampSignField[]>(['start', 'step']);
```

Empty it and **both** surfaces retire — the leaf renders null on a negative
document, and the refusal keeps its true arithmetic while losing the caveat.
Poison 2 asserts exactly that, so the machinery cannot die quietly.

---

## 4. THE RETIREMENT CONDITION IS A PROPERTY OF AN ARTIFACT

`test/formats/aeon-ramp-sign-drift.test.ts` reads `engine/effects/raster.emp` at
aeon `origin/master` **through git objects** (`test/support/peer-repo.ts`, at a
resolved revision), slices `raster_ramp_program`'s **returned struct literal**,
and asks:

> does it assign `rrp_start` / `rrp_step` the **bare parameter**, or does it put
> them through something?

Bare → the lag is open. Anything else → **RED**, with the edit named in the
failure text.

**It slices the literal rather than grepping the file**, because the file also
*declares* `rrp_start: u32,` in the struct — a whole-file grep for `rrp_start:`
would match the declaration and answer a different question while looking
identical. A row proves the reader distinguishes the two.

### ⚠ It reads the ENGINE SOURCE, and that is stated three ways

Not `docs/EDITOR_RASTER_PRESETS.md` and not `tools/effects_gen.py`. **Both of
those accept `ramp` and neither can see this.** `RAMP_SIGN_LAG_MEASUREMENT`
names the path and `origin/master`; a row asserts it contains neither of the
other two artifact names **and** that the string names the file the row actually
opens. The precedent is the preset-lag row's own failure text — *"do NOT empty
it on a merge announcement, this row reads TIP"* — and the near-miss the brief
describes, where a check read a documentation page for a claim about a source
file.

### ⚠ And it is not a claim about a ROM

It measures aeon's **source**. Whether a ROM built from an encoded constructor
actually ramps upward is aeon's pytest lane and sigil's attest chain. Nothing in
this repository has seen a ROM obey a negative ramp, and no row here says it has.

---

## 5. RED-FIRST, BOTH DIRECTIONS, ON A COMMITTED BASELINE

Every mutation was applied to disk, read on its **first** run, and restored with
`git checkout --` from this branch's own commit.

### 5.1 The node gates

| # | mutation (the line, off disk) | result |
|---|---|---|
| **A** | leaf: `return null; // MUTATION A: hard-wired shut` | **6 red**, incl. POISON 1 |
| **B** | leaf: `rampSignLagFields({...}, ['start','step'])` — premise ignored | **1 red**: POISON 2, the retirement direction |
| **C** | provider: the caveat replaced by `''` | **5 red** |
| **D** | `rampRateNeighbours`: `: -1` → `: 0` — the arithmetic corrupted to route around the build limitation | **6 red across two files**, incl. the pre-existing `[ramp-control]` row |
| **E** | `RAMP_SIGN_FIELDS_AWAITING_AEON` emptied with no measurement | the **drift row** red, naming the re-fill |

**A and B are the point.** A hard-wired `return null` fails A and passes B; a
leaf hard-wired to speak passes A and fails B. Neither direction alone is a gate
— which is the lesson from aeon's own fix, pinned both ways because an
unconditional encode would pass a negative-only pin while silently moving every
ramp in the tree.

### ⚠ 5.2 THE POISON CAUGHT A DEFECT IN ITSELF

Poison 2 **went green** on the first attempt while the caveat stayed hard-wired
on. `rampSignRateCaveat`'s default parameter
`awaiting = RAMP_SIGN_FIELDS_AWAITING_AEON` is evaluated in **its own module's
scope**, so a caller that omits the argument reads the real constant through any
stub. The provider now passes the constant it imported, and a row pins that it
keeps doing so:

> `expect(prov).toContain('rampSignRateCaveat(field, named, RAMP_SIGN_FIELDS_AWAITING_AEON)')`

A default argument is a trapdoor under every module-stub poison in this repo.

### 5.3 The rendered surface

The node suite cannot see React, so both directions were re-run against the real
app under CDP, each with a `VITE_AURORA_DEBUG=1 npm run build` in between:

| poison | `[ns-a]` caveat | `[ns-b]` negative speaks | `[ns-c]` `start` too | `[ns-d]` positive silent |
|---|---|---|---|---|
| **none** (production) | PASS | PASS | PASS | PASS |
| leaf hard-wired **shut** | PASS | **FAIL** | **FAIL** | PASS |
| sign gate **removed** (speaks always) | PASS | **FAIL** | PASS | **FAIL** |

---

## 6. THE INSTRUMENT

**`npm run harness:ramp-control`** — already registered in `package.json`
(`node scratchpad/ramp-control-harness.mjs`), extended rather than duplicated.
The probe id is `aurora_local_rampctl_probe`; the `aurora_local_` prefix exists
because aeon shipped a real `ramp_probe.json` hours after this file first used
that id, and `[f0]` is the row that caught it.

```
RESULT  22/22 rows passed      (was 18/18 before this parcel)
```

Four new rows, each with both halves in one condition:

- **`[ns-a]`** — the sign-hole refusal **still names `-1` and `0`** *and* carries
  the caveat *and* the document did **not** move
  (`{whole:-1,frac256:128} → {whole:-1,frac256:128}`, unchanged). All four
  needles present in a 1122-character painted element inside its scroller.
- **`[ns-b]`** — `-1.5` **lands in the document** (`{whole:-1,frac256:128}`, so
  this is not a refusal that withheld the edit) **and** the sentence is painted
  with all six needles, in a 950-character Hint.
- **`[ns-c]`** — `start` set to `-2` in the model, and the sentence names **both**
  fields.
- **`[ns-d]`** — a positive document (`start {0,0}`, `step {1,128}`) and **both**
  probes null.

### ⚠ 6.1 THE FIRST RUN WAS 20/22 AND THE RIG WAS WRONG, NOT THE APP

`[ns-b]` and `[ns-c]` reported every body needle absent against a sentence that
was fully on screen. `paintedRect` takes the **last** `div,span` whose innerText
contains the needle — the innermost. The leaf paints its lead in its own `<span>`
and the rest as a sibling **text node**, so searching by the LEAD resolved to a
46-character span. `[ns-a]` never saw this because a rate refusal is one flat
Hint with no inner span.

Searching by a phrase that appears only in the **body** resolves to the
containing Hint, whose innerText is the whole sentence. That is `paintedRect`'s
own rule — *print a slice, assert on the whole* — applied one level up: choose
the search key so the element it lands on is the one whose text you mean.
`[ns-d]` gained a second absence probe for the same anatomy.

Commit `8687fe76` carries the fix and the reasoning. **Every number above is from
the fixed rig's own first run**; no two rows are quoted out of two different runs.

### 6.2 The rig cannot drift silently

The harness is `.mjs` and cannot import TypeScript, so its needles are **copies**.
A node row reads the harness file and asserts each needle is the exported
constant's own words *and* appears in the derivation's output — the retroactivity
link between the two. Mutation **C** turned that row red, which is the proof it
is not decorative.

---

## 7. TOTALS

| | |
|---|---|
| `npm test`, this branch | **6813 passed, 8 skipped** (484 files passed, 2 skipped) |
| master `f496c026`, relayed by the brief | 6782 passed |
| new rows | `ramp-sign-lag-disclosure.test.ts` **27**, `aeon-ramp-sign-drift.test.ts` **5** |
| CDP | `npm run harness:ramp-control` **22/22** |
| skips | 8, unchanged, every one named by the skip reporter |

The 2 skipped files and 8 skipped rows are master's, unchanged by this branch.

**No emulator was touched.** No sibling checkout was written to; aeon was read
only through git objects at `ddaab282`.

---

## 8. WHAT THIS DOES NOT CLAIM

- **Nothing here has seen a ROM.** The claim is about aeon's constructor source
  at a revision, and about what Aurora's panel says.
- **The disclosure does not block anything.** A negative value is still
  authorable, still saved, still round-tripped. Only the sentence is new.
- **`ramp` reaching the engine is a separate, retired fact** and this parcel does
  not re-open it. If a reader comes away thinking the ramp key is unbuilt, the
  sentence has failed and its wording rows are the place to fix it.
- **The re-open condition for the retired preset-key lag is untouched.**
  `PRESET_KEYS_AWAITING_AEON` is still empty and this branch does not fill it.
