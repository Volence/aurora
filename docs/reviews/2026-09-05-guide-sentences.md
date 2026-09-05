# Two wrong sentences in the in-app Effects guide — C6 and C10

**Branch** `parcel/guide-sentences` · **2026-09-05** · aurora, base master `738ba1d1`
**Source** `docs/reviews/2026-09-05-effects-cold-read.md` **C6** and **C10**;
`docs/reviews/2026-09-05-coldread-fixes.md` §6, which left both rather than
"swap one unverified number for another".

The guide is `docs/guides/effects-first-run.md`, imported into the app with
Vite's `?raw` by `src/renderer/components/guide/guides.ts` — **the markdown file
is the only copy**, so the page an author reads and the document a reviewer reads
are the same bytes. It lives in none of the four files the concurrent
`scene.anchor` lane holds.

Four sentences ended up wrong, not two. §1 and §2 are the commissioned pair; §3
is two more that the same derivation refuted and that I was not going to leave
sitting beside them; §4 and §5 are what I left, with the reason.

---

## 1. C6 — the save warning over-warns

### What it said

> **Ctrl+S.** … Saving rewrites every editor file in the act, not just the ones
> you touched, so expect a large `git status` — most of it is re-serialisation,
> not change.

### The derivation

The authority the fixes packet names is `save-writes-only-what-changed`. It is
`src/core/project/aeon/save-skip.ts` (landed 2026-09-02,
`docs/reviews/2026-09-02-save-writes-only-what-changed.md`). Its `SaveCompare`
type is the rule, quoted whole:

```ts
export type SaveCompare =
  /** Byte identity, and nothing else. The default, and what every binary uses. */
  | 'bytes'
  /** Same parsed JSON value: whitespace, indentation, key order and the
   *  trailing newline do not count; a null and a missing key DO. */
  | 'json'
  /** `json`, plus the sidecar's ruled two-state relaxation for its ref keys. */
  | 'section-meta';
```

and its header states the consequence for the author directly:

> A skip needs neither. The writer's canonical form is untouched: when a
> document's meaning HAS changed, it is written in full canonical form, newline
> and all. **What changes is only whether an unchanged document is touched at
> all.**

**The coverage is asserted, not assumed.** A `'json'` rule that only some push
sites carried would leave untagged JSON writing on formatting alone.
`src/core/project/aeon/__tests__/save-compare-tags.test.ts` has two rows for
exactly that — *"tags every JSON write, and only ever as section-meta for a
.meta.json"* and *"leaves every non-JSON write untagged"* — so every JSON
document is compared by meaning and every binary by bytes.

### Why not "two"

Because two is a count somebody observed once. The cold reader's save moved two
files because that reader made two changes. An author who edits eight sections
will see eight and conclude the guide is wrong again. **The rule is what
survives**, and the rule is the thing the save path actually guarantees.

### What §6 says now

> **A save writes a file only when that file's meaning changed.** Every JSON
> document Aurora writes is compared against the one already on disk as a parsed
> value, so indentation, key order and the trailing newline do not count as a
> change, and a document you did not touch is left alone. So read your
> `git status` after a save — it is the work you actually did, and a file in it
> you never opened is worth opening rather than scrolling past.

The old warning's honest residue is kept, moved onto the axis where it is still
true: a document that *has* changed is rewritten in full canonical form, so its
**diff** can be larger than the edit. That is the diff, not the file count.

### The gate, and why it exists

The sentence went stale because nothing connected the prose to the predicate.
`guides.test.ts` now carries three rows that do
(`describe("§6's save claim is the save path's actual rule")`), in the direction
that matters: weaken `planFileNeedsWrite` and the suite goes red naming the guide
sentence that would then be a lie.

| plant | applied | result |
|---|---|---|
| **1** — `planFileNeedsWrite` reverted to the byte-only skip it replaced (`if (!compare \|\| compare === 'bytes') return true;` → `return true;`), diff shown | on disk | **1 failed \| 10 passed** — "a document whose MEANING did not move" |
| **2** — the retracted over-warning put back into §6 | on disk | **1 failed \| 10 passed** — "the retracted over-warning is back in §6 — see C6" |

Both restored from a pre-plant copy in the scratchpad, never `git checkout --`
on a dirty tree; `git status` clean on `save-skip.ts` afterwards.

---

## 2. C10 — the re-bake, and the two things I was told that the artifact changed

Derived from aeon at `origin/master` **1f2aab07**, and **measured** in a
throwaway `git clone` — the live aeon tree was read only through `git show` and
never built in.

### What the build actually does

`tools/level_staleness.py`, its own docstring:

> ```
> canonical build -> STALE is a HARD FAILURE naming tools/regenerate-level.sh
> FAST=1 build    -> STALE auto-runs the re-bake (that is the edit/look/edit
>                    loop's whole point) and reports how long it took
> ```

`build.sh` runs that gate at line 438 of ~900; the sigil assemble is at line 775.

### The measurement (clone at 1f2aab07, `python3 tools/level_staleness.py sonic4`)

| tree | rc | what it printed |
|---|---|---|
| pristine | **0** | `mtime ok` / `stamp ok (113 editor source(s) match)` |
| one sidecar rewritten (a save) | **2** | STALE on **both** arms |
| one preset deleted (a revert) | **2** | STALE on the **stamp arm only** — `removed since the bake (1)`; the mtime arm still says ok |
| …then the guide's own `touch …/effects/*.json` | **2** | STALE on **both** arms — the touch lit the arm that had been quiet |

### ⚠ Two corrections to the brief, both in the artifact's favour

1. **"The documented happy path always fails" is true of one of its two
   commands.** §6 listed `FAST=1 ./build.sh` **first**, and the FAST arm re-bakes
   automatically, so an author following the printed order literally never hit
   it. The cold reader went straight to the plain `./build.sh` — which is what
   anyone wanting "the real one" does — and *that* refuses 100% of the time after
   a save. So the defect is real and narrower than stated: the guide never named
   the step, and its second command cannot be run where it is printed.

2. **"A staleness stop presents as something else entirely / mis-attributes to a
   later stage" — not so.** The stop names itself, names the arm, lists the
   author's files, and gives the remedy before anything is assembled; the cold
   reader called it *"the best error message I saw all day"*. What *did*
   mis-attribute was the FAST re-bake's failure banner, and aeon fixed that on
   2026-09-02 — see §3.2, where the guide is the thing still carrying the stale
   mis-attribution.

### The design call: should the guide mention aeon's re-bake at all?

**Yes, and it now does — naming the tool and the ordering, quoting nothing.**

For:
- The build's message is only reachable by **failing the build first**. "The
  error explains itself" and "the documented path works" are different claims,
  and a guide exists to buy the second.
- §6's command block is a recipe an author copies. A recipe whose second line
  cannot succeed where it is printed is wrong however good the failure is.

Against, and honoured:
- Transcribing a peer's message is duplication that goes stale on the peer's
  schedule. **It already did here** (§3.2). So §6 names `tools/regenerate-level.sh`
  and describes the *ordering*; it quotes no aeon output at all.

What §6 adds that the build's message cannot say about itself: **a red build at
the staleness gate is not a verdict on what you authored**, because nothing
downstream has looked at it yet. That is the sentence a first-time author needs
and the only one the build is not in a position to write.

### `touch`, which §6 prescribed

The old troubleshooting section explained the stuck-build trap by mtime and gave
`touch games/sonic4/data/editor/effects/*.json` as the fix. aeon's own refusal
names it:

> `NOT a remedy: \`touch\`. Deleting an editor document lowers no mtime, so
> touching a file only silences the timestamp arm — the tree stays stale and the
> same build error comes back.`

and `level_staleness.py` says why the trap is closed:

> Arm B closes it by construction. It compares the SET and the CONTENT of the
> editor sources against a manifest written at bake time … **THE ESCAPE HATCH IS
> NOT `touch` and cannot be**: nothing about a file's timestamps is an input to
> arm B.

Measured above: the advice was worse than nothing. Replaced with "re-bake".

### The gate

`test/formats/aeon-build-path-currency.test.ts`, built on the shape ruled by
`test/formats/aeon-fixture-currency.test.ts`: committed revision through git
objects (never the sibling working tree), revision named in every message, loud
skip when unmeasurable, failures prefixed `NOT AN AURORA REGRESSION`. It keys on
**structure**, so aeon may reword any of these messages freely.

| plant (a throwaway clone, `origin/master` moved onto the planted commit) | result |
|---|---|
| **A** — the FAST arm's re-bake call replaced with `true` | ⚠ **GREEN TWICE FIRST** — see below. Now red: *"the FAST arm … no longer RUNS the re-bake"* |
| **B** — the canonical arm's `exit 1` → an `echo` | **red** — it no longer refuses |
| **C** — `--stamp` / `sha256` renamed out of `level_staleness.py` | **red on 2 rows** |
| restored (`reset --hard 1f2aab07`) | **3 passed, 0 skipped** |
| `EMPYREAN_SUITE_ROOT=$(mktemp -d)` | **3 SKIPPED**, each naming what could not be measured; `skip-report: OK — every skip named its reason` |

**⚠ Plant A came back green twice, and that is the finding.** The first row
matched `regenerate-level.sh` anywhere in the arm — green, because the staleness
branch carries a 25-line **comment** naming the tool while explaining it.
Stripping comments was not enough: still green, because the arm's failure banner
**echoes** the name four more times. A grep for a feature's words finds the prose
about it before the code doing it, and the prose survives the deletion of the
code. The file now has two views — `shellCode` (comments gone) and `shellExec`
(comments and output statements gone) — and each row says which it needs.

---

## 3. Two more the same derivation refuted — fixed, not commissioned

**3.1 The FAST verification claim.** §6 said `FAST=1` *"skips the effects seam
gate and the whole test lane, so a section binding the real build refuses builds
green under `FAST=1`"*. The example it picked is the one case that is no longer
true. `tools/effects_seam_gate.py` at 1f2aab07:

> `--source-only` — THE FAST LOOP'S ARM (2026-09-02, walkthrough finding b4). …
> `--source-only` runs 1/2/2b before the build so that class fails in the loop,
> with the same message.

`build.sh` calls it unconditionally under FAST for sonic4, before the assemble.
The paragraph's *advice* was right and is kept; its reason is now the limit the
gate states about itself — *"it does NOT say the module reached the ROM"*.

**3.2 A quoted message that no longer exists.** §6's troubleshooting heading was
"If the build says the re-bake failed and mentions donors" and it quoted a banner
whose text `git show master:build.sh | grep -c` finds **0** times in aeon today.
It was replaced on 2026-09-02 for the reason build.sh now records at the site:
*"A wrapper that replaces a specific diagnosis with a generic one is worse than
no wrapper."* The guide was sending an author to look for a symptom they cannot
get. Rewritten, and this time it quotes nothing.

Both of these are the exact failure the §2 ruling is about, which is why the
surviving cross-repo claims in §6 are now rows in the currency test and these two
were not.

---

## 4. What I left, and what derivation was missing

- **Nothing in C6 or C10 is left unfixed.** Both derived, both measured.
- **The rest of the cold read's LEFT list** (C1, C2, C3, C5, R1, R2, T1–T4, D1)
  is untouched — it is `docs/reviews/2026-09-05-coldread-fixes.md` §6's list and
  none of it is a guide sentence.
- **C5** (`B curve to`'s "(engine refuses)" entry) is still the one cheap item
  blocked on a derivation nobody has done: the reader's *"you cannot curve to the
  value you started at"* is a deduction, and the rule has not been read in aeon's
  source. I did not do it — it is not a guide sentence and it was not this
  parcel's scope. **It stays BLOCKED for the same reason it was before.**

---

## 5. ⚠ Found by looking at the capture: the guide's renderer paints markdown it does not support

`markdown-lite.ts`'s `inline()` handles exactly `**strong**` and a `` ` `` code
span, and **neither nests**. Everything else is copied through as text. So on the
shipped page:

- five single-asterisk spans on master render with the asterisks visible —
  §2 `*lower*`, §2 `*rounds*`, §4 `*keep the section's…*`, §4 `*off (null)*`,
  §4 `*every slot keeps…*`;
- every `**\`code\`**` span — sixteen of them on master, e.g. **`` `FAST=1` ``
  does not check what you just authored.** — shows its backticks, because a code
  span inside a strong run is nesting.

`before-section6.png` shows both in one frame. My first draft of §6 added five
more single-asterisk spans; they are gone (commit 4). I did **not** fix the
renderer: that is a change to `inline()` plus a sweep of the whole document, a
bigger parcel than two sentences, and it should be booked as one. **Recorded
here so it is not rediscovered from a screenshot a third time.**

---

## 6. Evidence

`docs/captures/2026-09-05-guide-sentences/`, all three from the running
application under `xvfb`, `devicePixelRatio = 1`, run-root **pinned** to this
worktree (printed each run; a `borrowed` root would have meant photographing the
main checkout's build):

| file | |
|---|---|
| `before-section6.png` | master's §6 — the `git status` warning and the `touch` recipe, both in frame |
| `after-section6.png` | the rewritten §6 down to the `touch` paragraph |
| `after-section6-continued.png` | the rest of §6, `SCROLL_EXTRA=690` |

`scratchpad/guide-section6-capture.mjs` (`npm run harness:guide-section6`,
registered in `package.json` in the same commit). It drives the real gesture —
the Guides card on Home — and refuses to photograph anything it has not first
asserted: `PLANT=no-anchor` aborts with **rc 1** and writes **no file**, rather
than saving a picture of the top of the document and calling it §6. It compares
the heading's rect to the **scroller's** box rather than trusting
`checkVisibility()`, and with `SCROLL_EXTRA` it asserts the displacement instead
of dropping to "we scrolled somewhere".

**No emulator was run. No aeon working tree was written.**

---

## 7. Suite

`npm test` aggregate is in the parcel report. `npx tsc --noEmit` clean;
`scripts/check-peer-path-literals.mjs` OK; `scratchpad/check-harness-guards.mjs`
221 clean / 221 classified, 0 failures.
