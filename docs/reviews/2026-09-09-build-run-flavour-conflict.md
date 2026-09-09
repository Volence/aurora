# A declared flavour could still reload a ROM this build did not write

**Branch** `parcel/build-run-flavour-conflict` · **base** `866a426a` · **2026-09-09**

The residual §5.1 of [`2026-09-09-build-run-rom-mismatch.md`](2026-09-09-build-run-rom-mismatch.md),
closed. That packet bounded Build & Run's reload to *the artifacts this plan's build
writes* and named, in the same breath, the one hole the bound left: a plan writes **two**
artifacts and a build writes **one**.

A project declaring `buildEnv: { DEBUG: "0" }` builds `s4.bin` while the emulator sits on
this project's own `s4.debug.bin`. That is a family member, so the new rule accepted it —
and it is a file this build did not write. The same byte-identical-game failure as the
field bug, inside one project, which is what makes it worse to read: everything in sight
belongs to one tree, so it looks like a bug in Aurora rather than a mismatch.

---

## 1. The ruling, and the objection it answers

The packet hesitated because refusing seemed to override the documented ruling that
*"stated config outranks anything inferred"*. **It does not, and the distinction is the
whole of this parcel.**

- **Stated config governs what gets BUILT.** `buildEnv` says build release; that stands,
  untouched. `wantsDebug` is unchanged, the declaration still beats both the running ROM
  and the default, and nothing here changes which file the build writes or which symbols
  path is derived from it.
- **It says nothing about which ROM the emulator should be handed.** That target has
  exactly one correct value: **a file this build actually wrote.**

Both available substitutions are silent, which is why this refuses rather than picking:

| If it reloaded | What happens |
|---|---|
| the running `s4.debug.bin` | the emulator gets a file the build never touched, and *"the game comes back byte-identical"* — the field defect with one project instead of two |
| the built `s4.bin` | the flavour under the owner is swapped for another behind a "Build succeeded" toast, which is precisely what the running-ROM preference was written to prevent |

Refusing is this file's own established behaviour, now for the third time: it already
declines when `emulator/status` is unserved, and (since yesterday) when the running ROM
belongs to another project. This is that ruling one axis further in.

### The rule reads the build's outcome, not the file names

```ts
const flavourConflict = (running.ours !== null
  && canonicalPath(running.ours) !== canonicalPath(builtRom))
  ? running.ours
  : null;
```

`builtRom` is the artifact the chosen flavour actually produced. **This is the only
predicate that separates the refused case from the case the whole preference exists for,
because the two have the same file names.**

| | `romPath` | running | declared | build writes | verdict |
|---|---|---|---|---|---|
| the case the preference exists for | `s4.bin` | `s4.debug.bin` | — | `s4.debug.bin` | **accept** |
| §5.1 | `s4.bin` | `s4.debug.bin` | `DEBUG=0` | `s4.bin` | **refuse** |

Row 1 and row 2 are identical in every path they mention. With nothing declared,
`wantsDebug` reads the running ROM and the build then writes exactly the file that is
running, so the conflict cannot arise; in practice it can only fire on a declaration,
which is why the message is able to name one.

The refusal is emitted **before `emulator/pause`**, beside the two refusals above it, for
the reason they already give: stopping a machine and then declining to reload it leaves it
frozen, which looks like a hang.

### One thing more than the residual asked for

`declaredDebug` is now read **before** `plan.envOverrides.DEBUG` is overwritten with this
runner's own decision. The field is the project's declaration on the way in and Aurora's
answer on the way out; a message reporting the second as the first would tell the owner
his `project.json` says something it does not.

---

## 2. The exact user-visible text

**Printed from the real code paths**, not transcribed from source. `runBuild` was driven
against a served fake in a throwaway project directory, and the second string is the first
one carried through `AetherBuildResult` into `useAetherStore.build()`.

### `BuildRunResult.reloadError`

> the emulator is running /tmp/aurora-build-J2LIhv/s4.debug.bin, but this build wrote
> /tmp/aurora-build-J2LIhv/s4.bin: the same project, the other flavour. This project chose
> that itself, in project.json: buildEnv.DEBUG is "0", which outranks the flavour the
> running ROM would have selected. Aurora refused to reload rather than pick for you:
> reloading /tmp/aurora-build-J2LIhv/s4.debug.bin would hand the emulator a file this build
> never touched (it would come back without the change you just made, and look like the edit
> had vanished), and reloading /tmp/aurora-build-J2LIhv/s4.bin would silently swap the
> flavour you are running, which is the substitution this preference exists to prevent.
> Either set buildEnv.DEBUG in project.json to the flavour you want to run, or load
> /tmp/aurora-build-J2LIhv/s4.bin in the emulator.

### As the toast renders it

> Build succeeded (release, fast), but the emulator did not reload: the emulator is running
> /tmp/aurora-build-rvOYBW/s4.debug.bin, but this build wrote /tmp/aurora-build-rvOYBW/s4.bin:
> the same project, the other flavour. This project chose that itself, in project.json:
> buildEnv.DEBUG is "0", which outranks the flavour the running ROM would have selected.
> Aurora refused to reload rather than pick for you: reloading
> /tmp/aurora-build-rvOYBW/s4.debug.bin would hand the emulator a file this build never
> touched (it would come back without the change you just made, and look like the edit had
> vanished), and reloading /tmp/aurora-build-rvOYBW/s4.bin would silently swap the flavour
> you are running, which is the substitution this preference exists to prevent. Either set
> buildEnv.DEBUG in project.json to the flavour you want to run, or load
> /tmp/aurora-build-rvOYBW/s4.bin in the emulator.

Four things it has to do, and the reason for each:

1. **Name what is running and what was built, and say which is which.** Either alone is
   unactionable; and unlike the cross-project refusal, here the two paths differ by six
   characters in one filename, so a sentence that did not label them would be read wrong.
2. **Say the project's own config chose the flavour that differs.** Without it the whole
   situation reads as Aurora malfunctioning rather than as a tree disagreeing with itself.
   It quotes the declared value rather than restating a flavour name.
3. **Say why neither substitution was taken.** Both consequences are spelled out, because
   a refusal that does not is indistinguishable from a bug.
4. **Name both remedies and pick neither.** `buildEnv.DEBUG`, or relaunch the emulator on
   the built ROM. Which one is right depends on what the owner was doing, and Aurora does
   not know that.

The build's own result is unchanged and still reported: `ok: true`, `exitCode: 0`,
`debugBuild: false`. An artist still learns their level assembles.

---

## 3. Red-first evidence

Runner: **`npm test`** (the repo's own chain — fourteen `check-*` scripts and a harness
guard, then `npm run typecheck`, then `vitest run`). Individual files driven with
`npx vitest run <path>`. **No emulator was contacted at any point**; `emulator/status` and
the whole reload sequence are client calls and every row drives a served fake, the pattern
the existing rows in `src/main/aether/__tests__/build-run.test.ts` already use.

### 3.1 The pre-fix state, measured rather than argued

Driven through `runBuild` on the base tree with `buildEnv: { DEBUG: '0' }` declared and the
fake reporting this project's own `s4.debug.bin`:

```json
{
  "debugBuild": false,
  "reloaded": true,
  "romPath": "/tmp/aurora-build-rnXW42/s4.debug.bin",
  "reloadError": null,
  "calls": [
    "emulator/status:", "emulator/read_memory:", "emulator/pause:",
    "emulator/reload_rom:/tmp/aurora-build-rnXW42/s4.debug.bin",
    "load_symbols:/tmp/aurora-build-rnXW42/s4.debug.lst",
    "emulator/resume:"
  ]
}
```

The build wrote `s4.bin` (`debugBuild: false`) and Aurora reloaded `s4.debug.bin` and its
listing, under a green result. §5.1 reproduced.

### 3.2 Red

Committed at **`14ecc671`**, on the tree it fails against, before any source change:

```
Test Files  1 failed (1)
     Tests  3 failed | 54 passed (57)          rc=1
failure-class: 3 assertion failure(s) above are findings NOW.
```

Seven rows added. **Three red; four green here and after, on purpose.** The three reds:

```
[ASSERTION] ... > REFUSES, and touches the machine not at all
    AssertionError: expected true to be false          <- r.reloaded
[ASSERTION] ... > names what was built, what is running, and BOTH remedies
    AssertionError: expected '' to contain '/tmp/aurora-build-Q5EFLe/s4.debug.bin'
[ASSERTION] ... > refuses the mirror case too: DEBUG=1 declared while the release ROM runs
    AssertionError: expected true to be false          <- r.reloaded
```

An eighth row (§3.5 below) was added after the fix and shown red against the pre-fix source
by stashing the source change alone.

### 3.3 The green row that must not move

```
runBuild when a DECLARED flavour contradicts the running ROM
  > still reloads when the running ROM chose the flavour itself
```

It is **byte for byte the first red fixture minus the declaration**: `romPath` still the
release name, the emulator still on `s4.debug.bin`. It asserts `reloaded: true`,
`reloadError: undefined`, `romPath === <dir>/s4.debug.bin`, and the literal
`emulator/reload_rom:<dir>/s4.debug.bin` in the call log. **Green before the change, green
after, and it is the case the whole preference exists for.** Two more sit beside it: a
declaration that *agrees* with the running ROM still reloads, and classic is untouched
(`build.lua` takes no switch, so `buildEnv.DEBUG` there is inert and the family has one
member).

### 3.4 Which predicate does each row read

Every refusal row asserts the **call log and the result state**, not the message:

```ts
expect(r.reloaded).toBe(false);
expect(r.romPath).toBeUndefined();
expect(client.calls.filter((c) => c.startsWith('emulator/reload_rom'))).toEqual([]);
expect(client.calls.filter((c) => c.startsWith('load_symbols'))).toEqual([]);
expect(client.calls.filter((c) => c.startsWith('emulator/pause'))).toEqual([]);
```

There is exactly one row about the wording and it is labelled as such. Plant 4 below is
why.

### 3.5 Planted violations

Four mutations, each applied to the fixed tree from a pristine copy by anchored
substitution (the driver counts its anchor's occurrences and refuses unless there is
exactly one), scored against the whole file, and reverted.

| Plant | Result |
|---|---|
| **rule reads the PATHS, not the outcome** (compare `running.ours` to `family.debug ?? family.release` instead of to `builtRom`) | **7 red**, including `still accepts the release artifact itself`, `drops to release when the emulator is on the release ROM` and four reload-order rows — the legitimate cases such a rule costs |
| **reload target back to `running.ours ?? builtRom`** | 1 red: `reloads by the path the BUILD names, not the string the server handed back` |
| **attribution sentence deleted** | 1 red: the message row |
| **refusal moved to AFTER the write** (message still produced and attached, reload happens anyway) | **2 STATE rows red, and the message row `names what was built, what is running, and BOTH remedies` stayed GREEN** |

**Plant 4 is the predecessor's hazard reproduced on demand**, on the same file, one parcel
later. A suite that asserted only the refusal's wording would have called that mutation
correct.

### 3.6 A finding against my own row, from plant 3

**The attribution plant was GREEN against the first draft of the message row.** That draft
asserted `expect(msg).toContain('buildEnv.DEBUG')` — and the *remedy* sentence
("Either set buildEnv.DEBUG in project.json…") contains that substring too, so deleting
the entire attribution clause left the row passing. The row now asserts
`buildEnv.DEBUG is "0"`, quoting the value the fixture declared, which no other sentence in
the message produces. Re-planted afterwards: 1 red.

Same class as plant 4 one level down: an assertion that names the right *subject* can still
be satisfied by something other than the thing it is about.

### 3.7 Totals, both ends, with exit codes

| | rc | Test Files | Tests |
|---|---|---|---|
| base `866a426a` | **0** | 575 passed \| 3 skipped (578) | 8598 passed \| 9 skipped (8607) |
| tip | **0** | 575 passed \| 3 skipped (578) | 8605 passed \| 9 skipped (8614) |

`failure-class: no failures in this run (578 module(s) reported)` at both ends.
`skip-report: OK. Every skip named its reason.` at both ends. The +7 is the seven new rows;
no new file, so the file count is unchanged.

**This worktree shows none of the 77 phantom React failures.** It had no `node_modules` at
all and one was installed fresh (`npm install`, rc=0) before the base run, so neither end
stands on a pre-existing red.

### 3.8 The grep hazard, measured

`grep` in this shell is a `ugrep` wrapper carrying `--ignore-files`. Measured with a canary
rather than trusted:

```
$ echo CANARYTOKENXYZZY42 > node_modules/.canary-probe.txt
$ git check-ignore -q node_modules            -> node_modules IS gitignored
$ grep -rl CANARYTOKENXYZZY42 .               -> (nothing)          rc=1
$ grep -rl CANARYTOKENXYZZY42 node_modules    -> node_modules/.canary-probe.txt   rc=0
```

A recursive grep from the repo root returns a **confident clean zero** for an ignored path.
Every population statement in this packet rests on an explicit path or on a positive
control (`grep -rln classifyRunningRom src` returned `src/main/aether/build-run.ts`).

---

## 4. The three smaller residuals

The brief's instruction was to close one cheaply **or** restate it with a reason, and not
to fix all three by reflex. One is closed, as a consequence of the ruling rather than as
extra work; two are restated, and one of those is now narrower than it was.

### 4.1 §5.4 — `emulator/status`'s `romPath` trusted verbatim: **CLOSED, the half that acts**

Falls out of the ruling. Reaching the reload line now means the running ROM is either
nothing of ours or **the very file `builtRom` names** — a family member of the other
flavour is refused above it — so the two spellings denote one file, and the choice between
them is free. `builtRom` is derived from `plan.cwd` and is absolute by construction;
`running.ours` is whatever string the server handed back, and §5.4's concrete complaint was
that a *relative* answer would be passed straight through to `emulator/reload_rom`. It no
longer can be.

```ts
const romPath = builtRom;   // was: running.ours ?? builtRom
```

Nothing is lost: the preference for the running ROM was never about the string, it was
about the flavour, and the flavour is already inside `builtRom` by that point.

Held by a row that would otherwise be untestable — a **symlinked checkout**, which makes
the two spellings differ while naming one file:

```
reloads by the path the BUILD names, not the string the server handed back
  pre-fix: AssertionError: expected '/tmp/aurora-link-Atlo28/checkout/s4.debug.bin'
                                 to be '/tmp/aurora-build-jFML5Y/s4.debug.bin'
```

**What remains of §5.4 and is not closed:** the string is still trusted as *evidence* — it
is what the comparison and the refusal message read. That is unavoidable; it is the only
report of what is loaded, and the alternative is the unserved gate's refusal.

### 4.2 §5.2 — the canonicaliser resolves symlinks, not mounts: **RESTATED, deliberately**

A running ROM reached through a bind mount compares unequal and is refused.

**It is measurable here**, which the original entry did not say and the next lane should
not have to rediscover: a **hard link** has the same `st_dev`/`st_ino` as its target with a
different realpath, and a bind mount shares the superblock so it does too. A
`statSync().dev/ino` comparison, tried when the paths differ and both files exist, would
close it and could be red-first tested without privileges.

**I judged it not worth taking, and the reason is this parcel's own asymmetry.** Such a fix
adds a new **accept** route. A false refusal here is loud, names both paths and is
recoverable in a glance; a false accept is the silent class that produced both the field
bug and §5.1. Buying a rarer loud failure with a new silent-failure surface, for a
configuration nobody has been observed to run, is the wrong side of that trade — and it
would land in the same commit as a refusal written *because* silent substitution is worse
than a stop.

Revisit if anyone actually hits it. The refusal names both paths, so the report will be
unambiguous when it arrives.

### 4.3 §5.3 — no mtime check: **RESTATED, and now narrower**

Narrower because the reload target moved. The entry's own example — *"the emulator was
pointed at this project's ROM and the build then failed to write it"* — splits in two:

- The **disagreeing** case (running is ours, but the other flavour, stale) is now refused
  outright by this parcel, before mtime enters into it.
- The **agreeing** case is unchanged: a build that exits 0 without writing its artifact
  leaves a stale-but-correct-name file, and it is reloaded.

**Not fixed, and the reason is that the surviving case fails loudly by other means.** A
build that fails is caught by its exit code and never reaches the reload. A build that
exits 0 and writes nothing at all makes `emulator/reload_rom` fail on a missing path, which
surfaces as a reload error naming the file. The genuinely silent residue is narrow: a build
that exits 0, leaves a *previous* artifact in place, and reloads it.

A cheap guard exists (`existsSync(builtRom)`, or the artifact's mtime against the build's
start time) and it is a **different guard** — "did this build write anything?" rather than
"whose ROM is this?". It wants its own red-first fixture and its own name, not a clause
bolted onto a rule about ownership. Named here so it is not lost.

---

## 5. Files

| Path | Change |
|---|---|
| `src/main/aether/build-run.ts` | `declaredDebug` read before the overwrite; `flavourConflict`; the third refusal; `romPath = builtRom` |
| `src/main/aether/__tests__/build-run.test.ts` | 7 rows, one new `describe` |

**No emulator was called.** No `mcp__oracle__*` tool was invoked at any point.
