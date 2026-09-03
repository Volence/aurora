# O80 — a harness deleted the owner's artwork as setup, and nothing stopped it

**Branch** `fix/canvas-harness-live-tree-delete`, off master `8285ef0f`.
**Commits** `2f43ca04` (the fix + gate rule), `176eb6fb` (the gate gap the second
plant found), plus this packet and the ROADMAP row.
**Policy** d-28 `COPY ONLY WHERE IT CAN WRITE` (`docs/decisions.jsonl`, id
`d-28-peer-tree-open-policy-answered`).

---

## 1. The defect

`scratchpad/canvas-cdp-harness.mjs` resolved

```js
const S1DIR = siblingPathOrUnresolved('s1disasm');   // :50 pre-fix
const CANVAS_DIR = `${S1DIR}/.aurora/canvas`;        // :51 pre-fix
```

and `main()` opened, unconditionally, with

```js
if (existsSync(CANVAS_DIR)) rmSync(CANVAS_DIR, { recursive: true, force: true });
```

at `:1171` (`secondPass`) and `:1194` (`main`, the first statement of it).

`siblingPathOrUnresolved` falls back to the **live sibling checkout** at step 4
when nothing is set. On 2026-09-03 `<sibling>/s1disasm/.aurora/canvas` held **20
files** of the owner's canvas artwork (`commit-a.canvas.json`, `commit-a.png`,
eight `sectioncol*` pairs, `test.*`) — verified read-only before any work here,
and re-verified byte-identical after every run below.

So `npm run harness:canvas-cdp` with no environment set **recursively deleted
all twenty**, silently, before the first Electron session launched. It had not
happened only because the agents who ran it happened to point at throwaway
copies.

### 1.1 Four more harnesses shared the destination

Not in the brief, and not visible to the o53 §5.2 enumeration, which sees the
resolver call and the OPEN but not what a *different* file does with the export.
`CANVAS_DIR` is exported, and four instruments import it and delete inside it:

| file:line | verb | blast radius |
|---|---|---|
| `scratchpad/commit-cdp-harness.mjs:42` | `rmSync(\`${CANVAS_DIR}/${f}\`, …)` over `readdirSync(CANVAS_DIR)` | **every file in the directory** — the same total loss as the recursive `rmSync`, spelled as a loop |
| `scratchpad/constraints-cdp-harness.mjs:38` | same shape | **every file in the directory** |
| `scratchpad/art-agent-harness.mjs:117,121,122` | `mkdirSync` + two `writeFileSync` | writes into the live tree by design |
| `scratchpad/art-agent-harness.mjs:130` | `rmSync(join(CANVAS_DIR, f))` for `stage5-*` | bounded |
| `scratchpad/commit-collision-harness.mjs:100` | `rmSync` for `stage4-*` | bounded |

Fixing the one derivation fixes all five, which is why the guard lives where the
derivation does.

---

## 2. What changed

### 2.1 The guard (`scratchpad/canvas-cdp-harness.mjs`)

`scratchpad/band-preset-harness.mjs:114-118`'s shape, both clauses, because both
matter:

1. **No default at all.** An unset `S1DISASM_DIR` throws at module evaluation,
   naming the variable — before `main()` exists, let alone runs.
2. **A refusal when it is pointed at the live tree anyway** (`startsWith`
   `siblingDefaultPathOrUnresolved('s1disasm')`). Without it a dead-path default
   never trips the guard and the run dies later and further away.

Both messages say how to satisfy the refusal — `cp -r <sibling>/s1disasm
/tmp/s1disasm-copy` then the variable — and say the copy must be **populated**,
because the harness opens it as a project and loads GHZ act 1. They also say
that `EMPYREAN_SUITE_ROOT` does *not* satisfy it, since that resolves the live
checkout, which is the thing being refused.

**⚠ THE GUARD IS SCOPED TO AN ENTRY-POINT LIST, AND THAT IS A DELIBERATE
NARROWING, NOT AN OVERSIGHT.** This file is two things: the harness
`harness:canvas-cdp` runs, and the shared library **17** other instruments
import for `session()` / `openProjectAndAct()`. Twelve of those only OPEN a peer
tree — the half d-28 explicitly **defers** — so an unconditional top-level throw
would have converted twelve read-only sites the ruling leaves alone. The
`CANVAS_WRITERS` set names the five entry points that reach the write surface.

**Forgetting to add a future writer to that list is loud and harmless**, which
is the property that makes the list safe to maintain. Unarmed, `CANVAS_DIR` is
not the live tree; it is `resolve(UNRESOLVED_ROOT, 's1disasm-canvas-NOT-ARMED')`
— under `/nonexistent`, not creatable by accident — so the write fails with an
ENOENT naming `/nonexistent/…` instead of deleting somebody's art.

`S1DIR` keeps the resolver default for the read-only half and becomes the copy
when the entry point writes, so the project the app opens and the directory the
harness deletes are the same tree. Pointing them apart would make every row read
the wrong disk.

### 2.2 Documentation that tells someone how to run it

- The file header (`scratchpad/canvas-cdp-harness.mjs`, top) now opens with the
  requirement and the two-line recipe.
- The four sibling harnesses carry the same banner at their own heads.
- `package.json` gains a `"//harness-canvas-writers"` comment key listing all
  five scripts, the reason, the recipe, and the gate.

### 2.3 The gate — `scripts/check-peer-path-literals.mjs` rule 5 `peer-tree-write`

Registered: it is in the **`npm test`** chain (`package.json` `"test"`), and
separately as `npm run check:peer-path-literals`.

It fails when an executable line applies a `node:fs` **write** — `rmSync`,
`rmdirSync`, `unlinkSync`, `writeFileSync`, `appendFileSync`, `mkdirSync`,
`truncateSync`, `createWriteStream`, `writeSync`, `cpSync`, `copyFileSync`,
`renameSync`, `linkSync`, `symlinkSync` — to a destination derived from a
resolver **default**. It is file-scoped for rule 4's reason and one more: the
destination is three hops from the resolver call (`S1DIR` → `CANVAS_DIR` →
`PNG`), so a line-local grep returns zero and reads as an empty world.

Rules 1-4 are structurally blind to this class. All four ask **how a path was
spelled**, and here the spelling is entirely correct — right resolver, right
peer name, right module. What is wrong is what the code then **does** with the
answer. That is the observation o53 §5.3 recorded and could not act on.

**Why this is not the repo-wide outage §5.3 argued against.** That section
rejected a verb-aware rule that would fire on the ~82 files which merely *open*
a peer tree. Rule 5 does not look at opens at all. Its whole population was 13
sites in 5 files, every one fixed on this branch, so it lands green with an
**empty** `WRITE_RULE_EXEMPT`.

---

## 3. Proof

### 3.1 Unset → refusal at import, naming the variable, before any `rmSync`

```
$ node scratchpad/canvas-cdp-harness.mjs          # S1DISASM_DIR unset
EXIT=1
Error: S1DISASM_DIR must point at a WRITABLE COPY of an s1disasm checkout — canvas-cdp-harness.mjs DELETES
  inside <that checkout>/.aurora/canvas as setup, and must never do that to the live tree.
  There is deliberately NO DEFAULT: the default used to be the live sibling checkout, and
  running with nothing set recursively deleted the canvas artwork stored there.
  …
      cp -r /home/volence/sonic_hacks/s1disasm /tmp/s1disasm-copy
      S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:canvas-cdp
    at …/scratchpad/canvas-cdp-harness.mjs:145:11
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)
```

**The ordering is in the stack, not in a claim.** `ModuleJob.run` with no frame
below it is module evaluation: `main` has not been defined yet, so neither
`rmSync` call can have run. §3.4 measures the same ordering on disk.

### 3.2 Pointed at the live tree → the second clause refuses

```
$ S1DISASM_DIR=/home/volence/sonic_hacks/s1disasm node scratchpad/canvas-cdp-harness.mjs
EXIT=1
Error: S1DISASM_DIR points at s1disasm itself (/home/volence/sonic_hacks/s1disasm) — canvas-cdp-harness.mjs DELETES inside
  <that checkout>/.aurora/canvas, and must never write there. Copy it first:
    at …/scratchpad/canvas-cdp-harness.mjs:160:11
    at ModuleJob.run (…)
```

The live directory was `md5sum`ed before and after this run: **20 files,
identical**.

### 3.3 Pointed at a throwaway copy → proceeds, and passes

`cp -r <sibling>/s1disasm <scratch>/s1-copy` (48 MB, its `.aurora/canvas`
carrying the same 20 files), then

```
$ S1DISASM_DIR=<scratch>/s1-copy ELECTRON_BIN=…/aurora/node_modules/.bin/electron \
  node scratchpad/canvas-cdp-harness.mjs
EXIT=0
… four sessions: A create/draw/undo/save/reopen, B restart, C PNG deleted, D bad sidecar …
================ SUMMARY ================
checks: 52, fails: 0, unexercised: 0
all negative controls correctly reported FAIL
```

Aggregate, not a tail: **52 checks, 0 fails, 0 unexercised, every negative
control reported FAIL, exit 0.** (`PASS=2` selects the second-pass rows; the
default entry is `main`, which is what ran.)

**Where the writes landed.** The copy's `.aurora/canvas` afterwards holds the
harness's own fourteen files (`ghz-cliffs.*`, `backdroptest.*`, `entertest.*`,
`escapetest.*`, `gridtest.*`, `nozone.*`, `second.*`) and **none of the original
twenty** — so the delete demonstrably still happens, in the copy. The live
tree's twenty re-hash identical to the pre-task snapshot.

### 3.4 THE LOAD-BEARING NEGATIVE — sentinel files, pre-fix vs post-fix

The only evidence that speaks to the actual hazard. A throwaway
`<scratch>/fakeroot/s1disasm/.aurora/canvas` holding three sentinels named after
the real artwork, reached by pointing `EMPYREAN_SUITE_ROOT` at `fakeroot` so the
resolver's **default** lands on it. `EMPYREAN_SUITE_ROOT` is used precisely
because it exercises the defaulting path rather than an override.

**⚠ The fixture is re-created from scratch before each run and only the FIRST
run of each is read** — this is exactly the shape of plant that eats its own
fixture, and a second run against a deleted directory would be green for the
wrong reason.

| | pre-fix (`git show 8285ef0f:scratchpad/canvas-cdp-harness.mjs`) | post-fix (this branch) |
|---|---|---|
| before | `commit-a.canvas.json`, `commit-a.png`, `sectioncol-real.canvas.json` | the same three, same md5s |
| command | identical: `EMPYREAN_SUITE_ROOT=<fakeroot> ELECTRON_BIN=/bin/false PORT=9377 node <harness>` | identical |
| after | **`.aurora/canvas` does not exist** — "No such file or directory"; `.aurora` empty | all three present, **md5s unchanged** (`eb9f750b…`, `4f38361d…`, `a504aaa0…`) |
| exit | 2 (killed after the delete, waiting for a CDP target that `/bin/false` never produced) | 1, at the refusal |

Same fixture, same environment, same command: the pre-fix code destroys it, the
post-fix code refuses before touching it.

**No version of this was ever run against the real `/home/volence/sonic_hacks/s1disasm`.**

### 3.5 The gate, red-first, with the mutation shown on disk

**Plant 1 — the harness regains a default for the checkout it writes to.**
`const CANVAS_DIR = S1_COPY ? … : …` replaced with the pre-fix
`` const CANVAS_DIR = `${S1DIR}/.aurora/canvas`; ``.

```
$ grep -n "const CANVAS_DIR" scratchpad/canvas-cdp-harness.mjs
175:const CANVAS_DIR = `${S1DIR}/.aurora/canvas`;
$ git diff --stat
 scratchpad/canvas-cdp-harness.mjs | 4 +---
$ node scripts/check-peer-path-literals.mjs ; echo $?
check-peer-path-literals: FAIL — 6 executable line(s) across 1 rule(s):
  [peer-tree-write] 6 line(s):
    scratchpad/canvas-cdp-harness.mjs:1266  rmSync(CANVAS_DIR, { recursive: true, force: true });
    scratchpad/canvas-cdp-harness.mjs:1289  rmSync(CANVAS_DIR, { recursive: true, force: true });
    scratchpad/canvas-cdp-harness.mjs:1304  … rmSync(PNG);
    scratchpad/canvas-cdp-harness.mjs:1312  writeFileSync(PNG, shared.pngBackup);
    scratchpad/canvas-cdp-harness.mjs:1315  writeFileSync(SIDE, …);
    scratchpad/canvas-cdp-harness.mjs:2317  writeFileSync(`${CANVAS_DIR}/ghz-cliffs.png`, …);
1
```

Restored with `git checkout --` from the committed baseline `2f43ca04` → **exit 0**.
Note the three-hop reach: `PNG` and `SIDE` are two bindings below `CANVAS_DIR`.

**Plant 2 — a NEW default, in a DIFFERENT file, under a RENAMED import.**
`scratchpad/constraints-cdp-harness.mjs` given
`import { siblingPathOrUnresolved as _sp }`, `const LOCAL_S1 = _sp('s1disasm')`,
`const LOCAL_CANVAS = \`${LOCAL_S1}/.aurora/canvas\``, `rmSync(LOCAL_CANVAS, …)`.

**The first run was exit 0 — the gate did not catch it.** The call site carries
none of the canonical text, so the regex over it saw an empty world: a failing
predicate and an absent population print the same output, one rule later than
rule 4 learned it. Fixed in `176eb6fb`: `resolverCalls(code)` builds the pattern
per file from the canonical names **plus that file's own import specifiers**,
which are derivable rather than a convention. Re-run with the same plant on disk:

```
check-peer-path-literals: FAIL — 1 executable line(s) across 1 rule(s):
  [peer-tree-write] scratchpad/constraints-cdp-harness.mjs:48
        rmSync(LOCAL_CANVAS, { recursive: true, force: true });
1
```

Restored → exit 0.

**Plant 3 — the canary for that seed must itself assert.** Canary lines 32-34
carry the renamed import. Disabling the seed (`if (false && PEER_DEFAULT_…`,
shown on disk, `git diff --stat` naming the file) takes the gate to **exit 2,
COULD NOT MEASURE**, naming the missing `34:peer-tree-write`. Restored → exit 0.

**Not vacuous by construction, either.** The canary also carries five lines that
must **not** fire, each of which was a real false positive before the rule was
narrowed (§3.6): a read off a peer path; a write of *content* read out of one; a
write to a destination taken from `checkoutOverride`; a write to this repo's own
output directory; and `cpSync(peer, local)` — the peer as **source**.

### 3.6 The gate's first draft was wrong in the loud direction, and that is recorded

The first draft propagated taint on any mention and matched the alias anywhere in
the argument list. It went red on **nine lines in four `scripts/` files my own
scratchpad-scoped sweep had never looked at** — and all nine were **false**:

| file:line | why it is not a violation |
|---|---|
| `scripts/verify-s1-roundtrip.mjs:135` | `cpSync(S1DIR, WORK, …)` — the peer is the **source**; copying it into a local scratch tree is precisely the d-28 remedy. The rule was reporting the fix as the defect. |
| `scripts/render-classic-act.mjs:339` | `writeFileSync(args.out, …)` — tainted through `mapText` → `doc` → `img`. **Content read out of a peer tree is not a peer path.** |
| `scripts/probe-sonic-dplc-sharing.mjs:41` | `rmSync(outfile)` where `outfile = join(os.tmpdir(), …)`; tainted the same way. |
| `scripts/vendor-s1-fixtures.mjs:215,216,226,227,235,263` | all write into this repo's vendored fixture tree; the taint came from a **shadowed** local `out` inside a function. |

So taint now propagates only through path **composition** (`join(X,…)`,
`resolve(X,…)`, `` `${X}/…` ``, `X + '/…'`, `const Y = X;`), and the destination
argument is the first for `rmSync`-shaped verbs and the **second** for
`cpSync`-shaped ones. Both directions are canary lines.

### 3.7 `npm test`

Aggregate, from the merged working tree of this branch:

```
Test Files  474 passed | 2 skipped (476)
     Tests  6580 passed | 8 skipped (6588)
  Duration  18.56s
EXIT=0
```

All seven gates in the chain exit 0, including
`check-peer-path-literals: OK — … or writes to a peer path the resolver
defaulted.` over **1231** files against **5** rules, all five fired on the
canaries in both dialects. `skip-report: OK — every skip named its reason.`

---

## 4. The sweep — derived here, not quoted

Method: a fixpoint alias analysis over `git ls-files` (tracked) **plus**
`--others --exclude-standard` (untracked-not-ignored), seeded from the resolver's
defaulting exports, propagated through path composition, matched against
`node:fs` write verbs. The o53 §5.2 enumeration says it is a **lower bound** and
it is; the numbers below are mine.

### 4.1 WRITE-CAPABLE — all fixed on this branch

**13 sites across 5 files**, all `s1disasm`, all reaching the same
`CANVAS_DIR` derivation (directly, or imported from `canvas-cdp-harness`):

- `scratchpad/canvas-cdp-harness.mjs:1171` `rmSync(CANVAS_DIR, {recursive})`
- `scratchpad/canvas-cdp-harness.mjs:1194` `rmSync(CANVAS_DIR, {recursive})`
- `scratchpad/canvas-cdp-harness.mjs:1209` `rmSync(PNG)`
- `scratchpad/canvas-cdp-harness.mjs:1217` `writeFileSync(PNG, …)`
- `scratchpad/canvas-cdp-harness.mjs:1220` `writeFileSync(SIDE, …)`
- `scratchpad/canvas-cdp-harness.mjs:2222` ``writeFileSync(`${CANVAS_DIR}/ghz-cliffs.png`, …)``
- `scratchpad/art-agent-harness.mjs:117` `mkdirSync(CANVAS_DIR, {recursive})`
- `scratchpad/art-agent-harness.mjs:121` `writeFileSync(join(CANVAS_DIR, …))`
- `scratchpad/art-agent-harness.mjs:122` `writeFileSync(join(CANVAS_DIR, …))`
- `scratchpad/art-agent-harness.mjs:130` `rmSync(join(CANVAS_DIR, f))`
- `scratchpad/commit-cdp-harness.mjs:42` ``rmSync(`${CANVAS_DIR}/${f}`)`` over every entry
- `scratchpad/commit-collision-harness.mjs:100` ``rmSync(`${CANVAS_DIR}/${f}`)``
- `scratchpad/constraints-cdp-harness.mjs:38` ``rmSync(`${CANVAS_DIR}/${f}`)`` over every entry

(Line numbers are pre-fix, i.e. at master `8285ef0f`.)

**Zero write-capable sites for `aeon`** were found by this method — consistent
with O53 having landed two and O54 being out on the third. The one that remains
is invisible to a `node:fs` scan by construction: see §5.

### 4.2 READ-ONLY — recorded, NOT converted (the half d-28 defers)

Re-derived over 1071 tracked files (`scratchpad/**/*.mjs`, `scripts/*.mjs`,
`src/**/*.ts`, `test/**/*.ts`), matching a resolver-defaulted alias handed to
`openDir` / `aeon.open` / `addRecentProject` / `realFs` / `openProject`:

> **100 OPEN sites across 87 files.**

That is my own count over my own population, deliberately not comparable to
o53's 92/82 — different file set, different alias rule, and it counts `realFs`
and `src`/`test` which that scan did not. The full listing is reproducible with
the same method; the shape is uniform, so a sample with citations rather than
100 lines of the same line:

- `scratchpad/canvas-cdp-harness.mjs:825` and `:857` — `window.__dbg.openDir(S1DIR)`, the two this parcel deliberately left on the default (§2.1)
- `scratchpad/animated-art-harness.mjs:246`, `camera-harness.mjs:102`, `classic-playtest-harness.mjs:281`, `collision-edit-harness.mjs:201`, `collision-lens-harness.mjs:195`, `collision-needle-harness.mjs:149`, `composer-fill-harness.mjs:246`, `crash-harness.mjs:90`, `micro-type-harness.mjs:173`, `paint-through-harness.mjs:372`, `palette-grid-harness.mjs:622`, `d27-sprite-focus-harness.mjs:429`, `object-label-harness.mjs:517`, `label-measure-probe.mjs:140` — `openDir(S1DIR)`
- `scratchpad/aeon-priority-lens-harness.mjs:477`, `bg-wrap-harness.mjs:289`, `bganim-band-harness.mjs:388`, `bganim-band-lens-harness.mjs:403`, `bganim-rate-shift-harness.mjs:326`, `bganim-strip-range-harness.mjs:330`, `collision-*-capture.mjs:227` (three files), `collision-destructive-harness.mjs:319`, `collision-legibility-harness.mjs:319`, `collision-mark-normal-harness.mjs:430`, `collision-preservation-harness.mjs:363`, `collision-read-harness.mjs:307`, `composer-collision-gesture-harness.mjs:277`, `composer-priority-harness.mjs:334`, `curve-editor-harness.mjs:451`, `d27-effects-focus-harness.mjs:457`, `effects-column-harness.mjs:1174`, `effects-deform-harness.mjs:335`, `effects-guides-harness.mjs:327`, `fromtile-typing-probe.mjs:75`, `guide-aim-probe.mjs:111`, `label-measure-probe.mjs:129`, `layer-bound-harness.mjs:358`, `live-palette-e2e-harness.mjs:159`, `loop-paint-harness.mjs:404`, `mapviewport-baseline-harness.mjs:879`, `marquee-flip-button-harness.mjs:410`, `marquee-flip-harness.mjs:450`, `marquee-harness.mjs:437`, `marquee-paste-probe.mjs:139`, `marquee-snap-modifier-harness.mjs:304`, `marquee-stamp-harness.mjs:175`, `numberfield-empty-harness.mjs:70`, `o55-new-band-door-probe.mjs:179`, `o56-loop-authoring-door-probe.mjs:225`, `object-label-harness.mjs:355`, `paste-pan-harness.mjs:259`, `chunk-links-harness.mjs:206`, `chunkgrid-hint-harness.mjs:234` — `aeon.open(AEONDIR)`
- `scratchpad/capture-harness.mjs:421` (`openDir`) and `:640` (`addRecentProject`)
- `scripts/render-classic-act.mjs:319` — `realFs(S1DIR)`, the only `scripts/` site and the only non-CDP one

**These were NOT converted.** d-28 defers them, the brief forbids converting
them, and rule 5 does not look at them.

### 4.3 What this method cannot see, stated rather than left to be discovered

- **A write the app performs on the harness's behalf.** A dispatched Ctrl+S is
  `node:fs` in the main process, invisible to any scan of the harness. That is
  `scratchpad/bganim-ui-authored-composition-harness.mjs` — o53 §5.1's worst
  case, O54's parcel, still open at the time of writing.
- **A destination built inside a called function** from a parameter. The alias
  analysis is per-binding, not interprocedural.
- **The `hash` dialect.** Python writes are `open(…, 'w')` and no Python
  instrument under `scratchpad/` writes to a peer path today.
- **Shell.** `.sh` instruments are scanned by rules 1-3 only.

---

## 5. Left open / tagged

| # | Item | Why not here |
|---|---|---|
| 1 | `scratchpad/bganim-ui-authored-composition-harness.mjs` Ctrl+S-es into the live aeon tree | O54's parcel, out on it. Rule 5 cannot see it (§4.3) — a verb-aware **fs** rule is the wrong instrument for a write the app makes. |
| 2 | 100 read-only OPEN sites across 87 files (§4.2) | d-28 defers them explicitly. Re-open after EFFECTS-W1; re-derive rather than quoting §4.2's number, for the same reason §4.2 does not quote o53's. |
| 3 | An unlisted future writer that imports `CANVAS_DIR` is caught by the `UNRESOLVED_ROOT` fallback, not by rule 5 | Seeding rule 5 on the spelling `CANVAS_DIR` would fire on the four files that are now safe. The fallback makes the failure loud and harmless, which is the property that matters; the gate's coverage boundary is written into its own header. |
| 4 | `startsWith` will refuse a copy made at a path that is a string prefix of the live one (`…/s1disasm-copy` beside `…/s1disasm`) | Copied verbatim from `band-preset-harness.mjs` on purpose — one shape, one behaviour. It errs toward refusing, which is the safe direction. Worth a row if anyone trips it. |
| 5 | No emulator, no ROM, no aeon build touched | Standing invariant; nothing here wanted runtime confirmation beyond the CDP run in §3.3. |
