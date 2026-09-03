# Five harnesses read a peer's preset id — the technique was right, the spelling was not

**Branch** `fix/shared-preset-namespace` · **2026-09-03** · base `master c66e9b12`

**One sentence.** Five harnesses key off `authored_probe`, a preset id that belongs to **aeon**;
all five read it *on purpose*, four of the five hunted it **through the running app**, aeon has
**booked a rename of it**, and under the old spelling their rename would have turned this repo's
harnesses red hundreds of lines into an Electron run with an empty diff — a failure **later, and
somewhere else, pointing at Aurora's code**. The reads are now **by path, at import, before an app
launches**, and they refuse **naming the absolute path** and the booking.

---

## 1. Why this is not tidying

Aeon booked the collision on their own side the same night, in both directions —
`aeon docs/DEFERRED_WORK.md`, entry **"PRESET-ID NAMESPACE COLLISION"**, their `ddaab282`
(2026-09-03T21:38:24Z). Read here through git objects at that revision, never through their working
tree. Their words, quoted because the deferral is the thing being discharged:

> **`ramp_probe` and `authored_probe` are RESERVED in the shared namespace.**
> … a rename is a parcel, not a rename — `effects_scenes.emp` (`EditorRaster_OJZ_Act1_ramp_probe`,
> `EditorRaster_OJZ_Act1_authored_probe`), `ojz_scroll_test.emp`'s `use` import and `.raster_table`
> rows 2 and 4, and five of their tools.

They offered to warn this lane before pushing it. **The answer given was: do not let Aurora's
harnesses become the reason aeon cannot rename aeon's own files.** This branch is that answer.

**The trap that produced the row**, restated because it generalises past these two ids: a panel's
`New` is a **namespace WRITE that reads like a namespace ALLOCATION**. Every other allocation in the
world fails loudly on a collision; this one silently hands you the existing document. It bit
`ramp-control-harness` — its probe id was `ramp_probe`, aeon landed a real `ramp_probe.json` hours
later, and from then on `New` selected **their** document and eighteen rows measured somebody else's
file. Caught only by `[f0]`, an anti-vacuous row asserting the fixture *was what it claimed* before
anything read it.

---

## 2. The five sites — what each actually does, and the verdict

**Telling the two kinds apart was the work.** A constant's name is a hint, not evidence; the verdict
below comes from reading what each file *does* with the id.

| Harness | What it does with `authored_probe` | Verdict |
|---|---|---|
| `save-file-count` | **Selects** it in the raster dropdown and binds it to section 0, to measure how many files one Ctrl+S rewrites. Creates no preset. | **Deliberate read** |
| `section-raster-select` | **Selects** it to prove the per-section select binds and unbinds, all the way to the sidecar bytes. Creates no preset; its Ctrl+S rewrites the copy, not aeon's tree. | **Deliberate read** |
| `effects-refusal` | **Selects** it and types into its band — an illegal `Top: 40112` that must be refused, then a legal value as the anti-vacuous floor. Model only; **no save is ever issued**. Creates no preset. | **Deliberate read** |
| `variant-cycle` | Opens it, shows its section, **touches nothing**, and requires it byte-identical after a save that re-serialises the whole library. Authors its own separate document. | **Deliberate read** |
| `band-preset` | Reads its bytes before and after a save and requires them identical. Authors its own separate document. | **Deliberate read** |

**All five are deliberate reads. None is the defect.** No site presses the panel's `New` on that id,
none authors a document under it, and none believes it made a fresh one — every one of them already
carried a comment saying it reads aeon's document *so that a green here is not Aurora agreeing with
itself*. `variant-cycle`'s constant being named `SHIPPED_ID` was a correct hint; the other four were
correct too, and only their spelling was wrong.

**No site was left ambiguous.** The discriminator that settled each one: does it *create* a document
under that id (a namespace write), or does it *select* one that must already be there (a read)? All
five select.

### What was wrong, per site

| Harness | The old spelling | How aeon's rename would have surfaced |
|---|---|---|
| `save-file-count` | `[3a]` `[...select.options].includes('authored_probe')` | "the control this harness edits through is not reachable" |
| `section-raster-select` | `[2b]` the same, as the floor row | "the select does not offer aeon's preset" |
| `effects-refusal` | `[1b]` `presets().some(p => p.id === …)`, **and the string again inside `[3c]`'s refusal regex** | "the preset is absent", or a refusal sentence failing a pattern nobody would think to blame |
| `band-preset` | `[1b]` hunted the id through the model **and pinned `bands === 2`**, a number typed on 2026-08-29; the path existed, but its absence surfaced only at `[5b]` — the **last** row of a 1277-line run | "the shipped file was ABSENT", 26 seconds and 44 rows later |
| `variant-cycle` | already refused a missing file **by path** — the mildest exposure of the five — but never proved the document's `id` matches its filename | correctly, already |

---

## 3. The fix

**`scratchpad/lib/aeon-shipped-preset.mjs`** — one module, so their rename is one edit here. It reads
the document **by path at import**, before any app launches, and throws **naming the absolute path**
and the booking when the document is absent, unreadable, not JSON, not an object, `id`-less, or when
its `id` disagrees with its own filename.

**The id/filename agreement is not decoration.** Aeon's rename moves both halves; a tree where only
one moved is a **half-landed rename** — a document that no longer means what its name says — and a
harness reading either half alone would report on it without noticing.

**`band-preset`'s band count now comes off aeon's file** (`SHIPPED_DOC.bands`) instead of out of a
number typed a week earlier, with an import-time refusal if the count is zero so the row cannot go
vacuous.

### The authoring half, while in these files

`band-preset` and `variant-cycle` create their **own** fixture through the panel's `New` — the
namespace write above. Their ids were `harness_band` and `harness_vc`: plausible, and nothing an
outsider would recognise as ours. They are now **`aurora_local_bandpreset_probe`** and
**`aurora_local_vc_probe`**, matching `ramp-control`'s `aurora_local_rampctl_probe`. **Not shortened.**

---

## 4. The gate — `test/support/aeon-shipped-preset.test.ts`, 19 rows, in `npm test`

- **§1 the module.** Every refusal exercised: absent (message must carry the path, the booking, the
  `PRESET_ID` escape hatch, and *must not* tell the reader to re-create the file in aeon's tree),
  half-landed rename, not-JSON, not-an-object, `id`-less, and a root that is empty or relative. A
  refusal nobody has watched fire is a comment.
- **§2 the coupling.** A helper the harnesses stop calling protects nothing. Derived from the five
  sources: each imports the module and calls it, and **carries no bare literal in CODE**. Comment
  prose quoting a panel string observed in a past run is deliberately left alone — rewriting history
  to keep a grep quiet is worse than the grep — so the hunt skips lines opening `//`, `*` or `/*`.
  An anti-vacuous floor sits under both rows (five real files, each > 100 code lines, and the id
  still a real string in the module).
- **§3 the seam.** Aeon at `origin/master`, through **git objects, never their working tree**
  (`test/support/peer-repo.ts` for why). Skips **loudly** when aeon is not beside this checkout or
  the revision does not resolve; **fails** when the revision resolved and the document is gone —
  the failure message says *"AEON HAS LANDED THE RENAME … this is the seam, and it fired where it
  was meant to"*, then gives the recipe. **This is the row that goes red the day their parcel lands,
  in this repo, naming the path.**

### Red-first, each mutation shown applied and restored from the committed baseline

| Plant | Mutation (quoted from `git diff`) | Result |
|---|---|---|
| P1 | `- if (doc.id !== expectedId) {` → `+ if (false && doc.id !== expectedId) {` | 1 failed / 18 passed — the half-landed-rename row |
| P2 | effects-refusal `[3c]`: `${reQuote(PRESET_ID)}` → the bare literal | 1 failed / 18 — and **only** that file's coupling row, the other four still green |
| P3 | band-preset drops the import, hand-rolls `SHIPPED_DOC` | 2 failed / 17 — import row **and** literal row |
| P4 | `AEON_SHIPPED_PRESET_FILE = 'authored_probe.json'` → `'aeon_authored_probe.json'` — **the rename itself** | 3 failed / 16, §3 among them, with the recipe printed |
| P5 | `- if (!existsSync(path)) {` → `+ if (false && !existsSync(path)) {` | 1 failed / 18 — the ABSENT row |

**And the deliverable proved live, without an emulator and without an Electron launch.** A copy of
aeon `ddaab282` with `authored_probe.json` deleted, handed to each harness as `AEON_DIR`:

```
save-file-count        exit=1  names-the-path=1  launched-electron=0
section-raster-select  exit=1  names-the-path=1  launched-electron=0
effects-refusal        exit=1  names-the-path=1  launched-electron=0
variant-cycle          exit=1  names-the-path=1  launched-electron=0
band-preset            exit=1  names-the-path=1  launched-electron=0
```

---

## 5. Two pre-existing reds, found because the parcel had to run these files

**Not this parcel's subject, and reported as found.** Both are the same class: an app change made the
panel **better**, nobody re-ran the harness, and the row sat red on master asking for the old
behaviour back.

- **`section-raster-select` `[6c]`.** `unassignablePresetRef` grew a `${where}` prefix in `9c387987`
  (EFFECTS-W1 defect 7) so the advisory names *which* section's sidecar carries the dangling id —
  one control draws every section in turn. The row still matched `^Assigned to "ghost_preset"…`. The
  expectation now names the section and is **derived from `SEC_A`**, so moving the planted section
  moves it. **22/23 → 23/23.**
- **`variant-cycle` `[6d]`, with `[6e]`/`[7b]` downstream.** The row asked for `L0 → 15` — *setting*
  bit 0 of a variant's `lines` mask. `variantLineRefusal` (EFFECTS-W1 defect 5 / b1) now refuses
  exactly that: line 0 is the character's palette line, so setting the bit is refused while clearing
  one a hand-written file carries is still allowed, because **L0 used to be a one-click red build
  with no feedback**. The row was asking the panel to reintroduce the trap.
  ⚠ **The claim is unchanged and still whole:** one toggle flips ONE bit. Seed `14 = 0b1110` already
  has bit 0 clear, so L0 is the refused direction and the mask must **not** move; L2 then clears bit
  2 only, `14 → 10`, bits 1 and 3 intact. **`l0 === true` is what keeps the refused half honest** —
  a REFUSED click and a MISSING button leave the model identically unmoved, and without it the
  repair would have been "assert nothing happened", which is green however the code behaves.
  **28/31 → 31/31.**

---

## 6. The anti-vacuous fixture census

**The question:** does a harness that creates a fixture assert the fixture **is what it claims**
before anything reads it? That row is the only thing between the `New`-collision trap and a witness
authored on a stranger's file — it is what caught `ramp-control`.

| Harness | Authors a fixture through `New`? | Guard | Verdict |
|---|---|---|---|
| `band-preset` | **yes** — `aurora_local_bandpreset_probe` | `rmSync(MINE)` + an assertion it is gone, then `[1c2]` "ANTI-VACUOUS: … is ABSENT before anything is clicked" | **has it** |
| `variant-cycle` | **yes** — `aurora_local_vc_probe` | import-time LEFTOVER refusal, then `[1d]` "ANTI-VACUOUS: the loaded shipped doc has NEITHER key in the MODEL, and … is absent" | **has it** |
| `save-file-count` | no — selects only | import-time LEFTOVER refusal naming the sidecar; `[1a]`/`[1b]` floor; `[3a]` the select offers the id; `[4b]` reads the sidecar bytes | **n/a; subject proven** |
| `section-raster-select` | no — selects only | import-time LEFTOVER refusal; `[1c]` floor; `[2b]` the select is found, populated and offers the id **before** anything is picked | **n/a; subject proven** |
| `effects-refusal` | no — selects only, model-only edits, no save | `[1b]` loaded + throw; `[2c]` reads the band from the model before typing; `[5a]` the legal-value floor | **n/a; subject proven** |

**And the three `aurora_local_*` siblings, checked while the census was open** — all three carry it:
`ramp-control` `[f0]`, `base-swap-control` `[f0]`, `ramp-scroll-mode` `[f0]` + `[f1]` + `[av]`.

**Nothing is missing.** Every harness in this repo that authors a preset fixture through the panel
has the row. Adding one where none is needed was out of scope and was not done.

---

## 7. Measurements

**The app under test** is the main checkout's `VITE_AURORA_DEBUG=1` build of `master` — announced
`BORROWED` on every run, which is honest and also correct: **this branch changes no file under
`src/`**, so master's bundle *is* the app these harnesses describe.

Each harness on its **own fresh copy** of aeon `ddaab282` (`git archive | tar -x`), never the live
tree; `ELECTRON_BIN` pinned to the main checkout's binary.

| Harness | Rows | Time |
|---|---|---|
| `harness:save-file-count` | **8/8** | 25.0 s |
| `harness:section-raster-select` | **23/23** | 30.6 s |
| `harness:effects-refusal` | **13/13** | 17.4 s |
| `harness:variant-cycle` | **31/31** | 32.3 s |
| `harness:band-preset` | **44 rows, 0 failed** | 26.2 s |

**Suite:** see the ROADMAP row for the aggregate. ⚠ `npm test` reads **one fewer pass and one more
skip** in a linked worktree than in the main checkout (`sibling-root` step 3); the totals are
identical and this is not a discrepancy.

**No emulator. No ROM. Nothing written to any sibling checkout.**
