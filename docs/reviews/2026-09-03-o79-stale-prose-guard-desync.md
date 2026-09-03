# O79 — the two bug-tier rows O77 found, measured and declined to fix

**Branch** `fix/o79-stale-prose-guard-desync`, cut from `master` `ec691660`.
**Subject** `docs/reviews/2026-09-03-o77-band-preset-reds.md` §5 and §5b.
**Both halves shipped**, in two commits: `4de8ff59` (half A) and the half-B
commit below.

| | half A | half B |
|---|---|---|
| what | four stale comment blocks in app source and its gate | `stripInert` desynchronised on a regex literal |
| risk | prose that talks a maintainer into a regression | shared surface inside `npm test` |
| shipped | yes, comment-only | yes, against the bar the brief set |

`npm test` **before** (half A applied only) and **after** (both halves) are the
same aggregate: exit 0, **473 test files passed / 2 skipped**, **6570 tests
passed / 8 skipped**, `check:harness-guards` **190 clean / 190 classified
(182 .mjs + 8 .sh) · 0 failure(s) · 0 unmeasurable**.

---

## Half A — the comments said one half of a two-half rule

`b8d16256` (2026-09-02 16:05, EFFECTS-W1 defect 3) cut the painted limit block
from 8,059 characters to ~875 in a 285px column and put the contract wording on
the **same elements' `title`**. It amended a ruling. Four comment blocks still
asserted the un-amended version, each within a few lines of code doing the
opposite:

| site | what it said | what the code does |
|---|---|---|
| `BandPresetPanel.tsx:16-23` | "THE LIMIT BLOCK … IS NOT A TOOLTIP · `PRESET_LIMITS` renders in full, at the top of the section, always visible" | nine lines above `LimitBlock`, which paints `presetLimitsShort()` and hangs `l.full` on a `title` |
| `effects-preset.ts:24-27` | "the limits below are NOT tooltips … A limit an author has to hover to find is a limit the panel does not really carry." | `PRESET_LIMITS[k].body` is the hover half |
| `effects-preset.ts:96` | "The limit itself. Shown in full — never truncated, never a tooltip." on `PresetLimit.body` | that field IS the `title` |
| `band-preset-wording.test.ts:17-21` **(not in O77's row — found here)** | lists "A limit behind a `title=` … is a limit the panel does not carry" as what the gate defends, "the whole reason `LimitBlock` is not a tooltip" | its own rows at `:712`/`:721` require the hovers to be present |

**The hazard is not tidiness.** A maintainer reading `BandPresetPanel.tsx`
top-down concludes the hovers are a regression against a stated ruling and
"fixes" it by putting 8k characters back in front of the author — undoing
defect 3. That is O77's poison P2, arrived at by reading the file. The harness
catches it, but only after the change is written, built and run.

**And the gate they named does not exist.** Both file headers cited
`effects-preset-wording.test.ts`; `git ls-files` has no such path and
`effects-preset-wording` had zero other hits under `src/` or `docs/`. A reader
checking the claim could not tell a wrong filename from an absent gate. The
comments now name the real one and the rows that hold both halves:

* **source-level** — `src/renderer/components/effects/__tests__/band-preset-wording.test.ts`:
  *'the limits are BODY TEXT, not a title= attribute'*, *'and the contract
  wording is still REACHABLE, on the same elements'*, *'every contract limit has
  an author-length sibling — none can be dropped'*, *'the cut is real: the
  PAINTED block is a fraction of the contract text'*. **That file reads SOURCE**
  and the comments say so.
* **rendered** — `scratchpad/band-preset-harness.mjs` rows `[2c]` and
  `[3a]`–`[3e]`, which read `innerText` and `title` separately.

**No rendered behaviour changed, and here is how that is known rather than
assumed:** every added and removed line in `4de8ff59` is a comment. `git diff
-U0 | grep -E '^[+-]' | grep -vE '^[+-]\s*(//|\*|/\*\*|\*/)'` returns nothing.
The node suite cannot see React or canvas, so it could not have told me; the
diff shape can.

Two other `tooltip` mentions in `BandPresetPanel.tsx` were read and left alone —
`:505` (the anchor-channels hint) and `:819` (the L0 chip) describe different
surfaces and are accurate.

---

## Half B — the checker reported a comment as a `pkill` call

### What was broken

`stripInert` (`scratchpad/check-harness-guards.mjs`) strips comments, optionally
blanks string bodies, and the caller then hunts `\bpkill\b` (G2), `mcp.json`
(G3), the staleness idioms (G7) and spawn shapes (G1) in what is left. It had
**no regex-literal case**. On
`/a row in aeon's band-demo table/` it read the apostrophe as a string open, ran
to the next `'`, and desynchronised; under `keepStrings: true` the swallowed span
is emitted verbatim, `//` comments included, so `band-preset-harness.mjs`'s own
comment *"there is no `pkill` on a pattern anywhere in this file"* survived
stripping and tripped G2 **as a `pkill` call**.

There was a **second desync of the same class**, not in O77's row and found here:
the template-literal scan ran backtick-to-backtick, so a **nested template inside
a `${}`** closed the outer one early. Four files in this population do that
(`band-trunk-demo` ×2, `crossover-paint-harness`, `effects-column-harness`).

### Why O77 declined it, and what changed

O77's reasoning stands: this is shared surface in `npm test`, and a wrong `/`
guess makes the checker skip **real** `pkill` calls. What makes the fix
shippable is a design choice that removes the downside of guessing wrong:

> **Regex literals are emitted VERBATIM in both modes, never blanked.**
> Recognising a regex only stops the scanner mistaking its contents for a string
> or a comment. It never deletes a character the old scanner kept. So a `/`
> *misread as* a regex costs nothing — the same characters come out either way —
> and a `/` *misread as* division is exactly the status quo.

The disambiguation rule and its known-wrong cases are stated in the docblock at
`stripInert`. Summary: a `/` opens a regex iff the preceding significant token
cannot end an expression; `)` is resolved by looking back at what precedes its
matching `(` (an `if`/`while`/`for`/`switch`/`catch`/`with` head leaves statement
position); and two decisive nets — a regex that does not close on its own line is
retracted and re-read as division, a `'`/`"` scan that crosses a newline means the
scanner is out of sync and says so.

**The one case it refuses to guess** is a `/` immediately after `}` — block end
(regex) or object/function-expression end (division), with no local way to tell.
It is pushed to `notes` and rendered **UNMEASURABLE**, which fails. Zero
occurrences in this population.

### Evidence

Everything below is one tree: this worktree at the half-B diff, `node v24.15.0`.
"OLD" is `git show HEAD:scratchpad/check-harness-guards.mjs` (i.e. `4de8ff59`,
half A only) copied into place; "NEW" is the shipped file. Both were run from
`scratchpad/`, because `DIR` comes from `import.meta.url` and a copy elsewhere
would enumerate the wrong directory.

#### 1. Positive controls — a real `pkill` call that must still be found

Planted one at a time into `scratchpad/warp-tearing-harness.mjs` (tracked, clean
at HEAD), each mutation quoted back **from disk**, each restored from the
committed baseline and the restore verified byte-for-byte.

| # | context | plant (from disk) | OLD | NEW |
|---|---|---|---|---|
| 1 | plain code | `` execSync(`pkill -f 'aurora/dist/main/index.mjs'`); `` | G2 FIRED | **G2 FIRED** |
| 2 | after a regex literal | `const RE_SEC = /section \d+/;` then the call | G2 FIRED | **G2 FIRED** |
| 3 | after a division | `const half = TOTAL / 2;` then the call | G2 FIRED | **G2 FIRED** |
| 4 | inside a template literal | `` console.log(`teardown ran: ${execSync(`pkill -f …`)}`); `` | G2 FIRED | **G2 FIRED** |
| 5 | after a regex containing a quote | `const RE_Q = /a row in aeon's band-demo table/;` then the call | G2 FIRED | **G2 FIRED** |
| 6 | after a regex containing `//` | `const RE_URL = /https?:\/\/localhost:\d+/;` then the call | G2 FIRED | **G2 FIRED** |
| 7 | after a line ending in `/` | `const ratio = TOTAL /` ⏎ `  2;` then the call | G2 FIRED | **G2 FIRED** |
| 3b | SAME LINE after `TOTAL / 2 / 3;` | `const q = TOTAL / 2 / 3; execSync(…);` | G2 FIRED | **G2 FIRED** |
| 5b | SAME LINE after a quote-bearing regex | `const RE_Q2 = /a row in aeon's band-demo table/; execSync(…);` | G2 FIRED | **G2 FIRED** |
| 6b | SAME LINE after `/https?:\/\/localhost:\d+/` | one line | G2 FIRED | **G2 FIRED** |
| **8** | **SAME LINE after `/[//]/`** — an UNESCAPED `//` in a character class | `const RE_CC = /[//]/; execSync(`pkill -f 'aurora/dist/main/index.mjs'`);` | **DID NOT FIRE — `190 clean · 0 failure(s)` over a real `pkill` call on disk** | **G2 FIRED** |
| 9 | G5: a dropped `killTree` behind a NESTED template | `` console.log(`shots: ${[SHOTS].map((p) => `${p}/frame.png`).join(' ')}`); `` + `killTree(child);` + `process.exit(1);` | G5 FIRED | **G5 FIRED** |

**12 positive controls · NEW missed 0 · OLD missed 1.**

⚠ **Rows 2–7 do not discriminate and are reported as such**: they put the call on
its own line, where a desync that eats only the rest of a line cannot hide it.
Row **8** is the one that discriminates, and it is the blindness half: with a
real `pkill` call sitting on disk, the OLD checker reported the entire
population clean.

#### 2. The false positive is gone

The `\x27` workaround O77 left in `band-preset-harness.mjs:602,613` is
**retired**, because its defect is. The bare apostrophe is back on disk:

```
604:      /a row in aeon's band-demo table or a section binding/.test(debugChord.text)
615:        + `rowOrBinding=${/a row in aeon's band-demo table or a section binding/.test(debugChord.text)} `
```

* OLD over that file: `G2 band-preset-harness.mjs: calls pkill` — `189 clean · 1 failure(s)`.
* NEW over that file: `190 clean · 0 failure(s) · 0 unmeasurable`.

**The report was exactly backwards.** `grep -n pkill scratchpad/band-preset-harness.mjs`
returns 5 hits and **every one is inside a `//` comment** (`:81`, `:595`, `:598`,
`:599`, `:1260`); the file contains no `pkill` call and never has. The one the
old checker "found" was `:1260` — *"…there is no `pkill` on a pattern anywhere in
this file."*

The two spellings are the same matcher: `\x27` and `'` agree on every probe
(match, near-miss without the apostrophe, embedded, and a typographic `’`). No
harness run was needed to establish that and none was taken.

#### 3. Every existing file classified the same way

**Report diff, whole population, `\x27` still in place** (isolating the
`stripInert` change alone): OLD and NEW output **byte-identical** — all 190
rows, every per-file `kind`, both exemption lines, the tally. **Zero verdict
flips.**

**Report diff, workaround retired** (the shipped tree): **exactly one flip.**

```
< FAILING (1):
<   G2 band-preset-harness.mjs: calls pkill. …
< ════ 189 clean / 190 classified · 1 failure(s) · 0 unmeasurable ════
---
> ════ 190 clean / 190 classified · 0 failure(s) · 0 unmeasurable ════
```

`band-preset-harness.mjs` **FAIL → PASS. This is a FIX, not a new blindness** —
the file has zero `pkill` calls, evidenced above.

#### 4. Character-level: is the new strip blinder anywhere?

The report diff is coarse (two different strips can give the same verdict), so
both implementations were sliced out of the two real files at run time and run
over all **182 `.mjs` files × 2 modes = 364 comparisons**. 216 byte-identical,
148 differing. Guard tokens were counted **mode-aware**, because a token only
matters in the mode its guard reads (`keepStrings:true` → G1/G2/G3/G7;
`keepStrings:false` → G5 only).

**Guard-relevant tokens LOST by NEW: two in the whole population, both
classified.**

| file / mode | delta | what it actually was |
|---|---|---|
| `band-preset-harness.mjs` keepStrings=true | `pkill 1→0` | **the defect itself** — a `//` comment (`"…there is no \`pkill\` on a pattern anywhere in this file."`) that OLD failed to strip. Correct stripping, not blindness. |
| `check-harness-guards.mjs` keepStrings=false | `killTree( 1→0` | a **string body** — the text `'Spell it \`await killTree(child)\`.'` inside G5's own failure message, which `keepStrings:false` exists to blank and which OLD leaked. The file is `isThisChecker`-exempt from G5 anyway. |

One further keepStrings=true delta, also classified: `check-harness-guards.mjs`
`stat -c %Y 3→1` — two of the three were `//` comments OLD failed to strip; the
one real occurrence (the G7 regex literal `/stat -c %Y/`) is preserved verbatim.

**Coverage RECOVERED by NEW** (code OLD could not see at all):

| file | delta | meaning |
|---|---|---|
| `section-raster-select-poisons.mjs` | `process.exit( 0→4` | OLD saw **none**; G5 was vacuous on this file |
| `harness-guard-proof.mjs` | `process.exit( 2→4`, `killTree( 7→9` | OLD blanked half the file's teardown |
| `crossover-paint-harness.mjs` | `process.exit( 6→7` | |
| `screen-frame-guides-harness.mjs` | OLD lost the file's whole tail | |

**No loss of real code anywhere in the population.**

#### 5. The loud channel, red-first

Three constructs planted into `warp-tearing-harness.mjs`, each quoted back from
disk and restored:

| plant (from disk) | OLD | NEW |
|---|---|---|
| `const scale = { w: 320, h: 224 } / 2;` | `190 classified · 0 unmeasurable` — **silently ran over it** | exit 1, `1 unmeasurable`: *"a `/` follows `}` at line 42 — regex or division cannot be decided here without a parser, and this check will not guess"* |
| `const label = 'teardown for the section 5 run;` | `0 unmeasurable` | exit 1: *"a single-quoted string opened at line 42 never closed on its line — the scanner is out of sync here"* |
| ``console.log(`shots at ${SHOTS);`` | `0 unmeasurable` | exit 1: *"a template literal opened at line 42 could not be bracketed"* |

OLD's `1 failure(s)` in each of those runs was the **pre-existing false positive
on `band-preset-harness.mjs`**, not a detection of the plant — checked and
reported rather than counted as a catch.

A file that goes UNMEASURABLE has its guards reported as un-vouched-for rather
than passed, and `bad = trackedFails + unmeasurable`, so it fails the run. That
is deliberate: the alternative is a guard verdict over text the scanner could
not parse.

---

## What is NOT claimed

* **No app behaviour was verified by running the app.** Half A changed only
  comments (proven by the diff shape); half B changes no app code at all.
* **`band-preset-harness.mjs` was not re-run.** It needs a build, xvfb and an
  aeon fixture. The only change to it is `\x27` → `'` inside two regex literals,
  proven above to be the same matcher, plus comments. **TAGGED** for the
  controller if a live confirmation is wanted; nothing here depends on it.
* **No emulator, no ROM, no aeon build.** None was needed and none was attempted.
* The `}`-after-`/` case is **refused, not solved**. If a harness ever writes
  one, this check goes UNMEASURABLE on that file until a person decides it.
