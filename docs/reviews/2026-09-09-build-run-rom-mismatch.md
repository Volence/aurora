# Build & Run reloaded a ROM from another project

**Branch** `parcel/build-run-rom-mismatch` · **base** `5c107282` · **2026-09-09**

Field report: Ctrl+Shift+B, *"build successful"*, the emulator reloads, and the chunk the
owner had just changed is not in the game, and he is not put back where he was.

Measured, it was worse than a failed build: the build **succeeded** and wrote a fresh,
correct `aeon/s4.debug.bin` containing his chunk. Aurora then asked the emulator to reload
a **completely different ROM**, from an unrelated experiment directory, two and a half
hours old. He got a real reload of a stale file. The chunk was missing because it was a
different ROM. The position was not restored because that ROM is not the build whose boot
override the restore keys on.

---

## 1. The mechanism

`src/main/aether/build-run.ts`, pre-fix, in the reload block:

```ts
const romPath = runningRom ?? join(plan.cwd, plan.romPath);
```

`runningRom` came from `emulator/status`, and it won unconditionally.

**The comment above that line is right and stays.** Its argument: the plan's default is
`s4.bin`, the emulator is frequently on `s4.debug.bin` (the flavour carrying the warp
mailbox and the boot override), and reloading the configured default there *"would swap
the debug ROM for the release one and silently remove the symbols a feature depends on,
with a cheerful 'Build succeeded' toast on top."* So ask the running machine rather than
assuming.

**The defect is its extent, not its direction.** The design means *ask the running machine
which **flavour** you are on*. The implementation asks *what file is loaded* and never
checks it is even this project's file. It is a guard that is correct about its mechanism
and unbounded on a second axis.

Inverting it would be the same silent substitution the other way: preferring the built
path yanks a user off a ROM they deliberately chose, which is precisely the bug the
preference was written to end. So the fix is neither preference. It is a **bound**, and
where the bound is exceeded, a **refusal**.

Refusing is this file's own established behaviour, one gate up. When the connected server
does not serve `emulator/status`, `runBuild` already declines rather than guessing:

> `oracle-next does not serve emulator/status: the build ran, but Aurora refused to reload
> rather than guess which ROM is loaded (a wrong guess reloads a file the build never
> touched, and the game comes back byte-identical).`

That is this exact hazard, already ruled on. The new refusal is the same ruling one axis
over: here we *know* which ROM is loaded, and it is somebody else's.

---

## 2. The "same project" rule, and why it is this one

**A running ROM is used iff it IS one of the artifacts this plan's build writes**, compared
as a full path, with the artifact pair derived from `plan.cwd` and `plan.romPath`:

```
release = <dirname(cwd/romPath)>/<stem><ext>            e.g. /a/aeon/s4.bin
debug   = <dirname(cwd/romPath)>/<stem>.debug<ext>      e.g. /a/aeon/s4.debug.bin   (aeon only)
```

`<stem>` is recovered by stripping a trailing `.debug` first, so a project that declares
the *debug* artifact directly still names the same pair. The only literal is `.debug`
itself, hoisted to `DEBUG_ARTIFACT_SUFFIX` in `src/main/aether/build-run.ts` and read by
**both** decisions that depend on it (which flavour to build, and which running ROM counts
as ours) so the two cannot disagree.

Three candidate rules were rejected, each by a row in the suite:

| Rule | Fails on | Row |
|---|---|---|
| **Path identity** (`running === cwd/romPath`) | rejects `s4.debug.bin` against a plan whose `romPath` is `s4.bin` — the *only* case the preference exists for | `still accepts the DEBUG flavour sibling of this project ROM` |
| **Bare basename** | two projects both have an `s4.debug.bin`. In the incident **both ROMs were called exactly that**; the name is the least discriminating thing about the file | `refuses a ROM with the SAME NAME in a different directory` |
| **Directory membership** | aeon's build writes `s4.bin` *and* `demo.bin` into one tree since the engine/game split, so "beside the artifact" is not "is the artifact" | `refuses a DIFFERENT artifact sitting in the same directory` |

**Classic gets no sibling at all.** `build.lua` takes no switch and writes one artifact; an
`s1built.debug.bin` is a file AS never wrote, and admitting one to the family would let a
foreign ROM in on a convention borrowed from the other engine family. `romFamilyFor`
returns `debug: null` for `projectType: 'classic'`.

**Canonicalisation.** Comparison runs both sides through the *directory's* `realpathSync`
with the basename put back, so a checkout reached through a symlink is not refused for a
difference nobody can see, and a debug sibling that was never written still compares
correctly (realpath on a non-existent file would throw). The resolver is injected into
`classifyRunningRom`, the same shape `buildPlanFor` uses for `exists`, so the rule stays
pure and testable.

### The ordering matters as much as the rule

`classifyRunningRom` runs **before** the flavour decision, not after. `wantsDebug` reads
the running ROM's suffix, and reading it off *someone else's* ROM is the same unbounded
question one step earlier — it decides which file this build **writes**. A foreign
release ROM used to produce `DEBUG=0` and hence an `s4.bin` nobody asked for.

The refusal itself is emitted **before `emulator/pause`**, for the reason the unserved gate
already gives in this file: stopping a machine and then declining to reload it leaves it
frozen on someone else's ROM, which looks like a hang. Nothing has touched the emulator at
that point.

---

## 3. The exact user-visible text

Both strings below were **printed from the real code paths**, not transcribed from source.

### The refusal

`BuildRunResult.reloadError`:

> the emulator is running /tmp/scroll-experiment-1wh7Tk/s4.debug.bin, which is not a ROM
> this project builds. This build wrote /tmp/aeon-KU15wh/s4.debug.bin. Aurora refused to
> reload rather than hand the emulator a file this build never touched (it would come back
> without the change you just made, and look like the edit had vanished). Load
> /tmp/aeon-KU15wh/s4.debug.bin in the emulator, or open the project
> /tmp/scroll-experiment-1wh7Tk/s4.debug.bin belongs to.

As the toast renders it (`src/renderer/state/aetherStore.ts` supplies the prefix):

> Build succeeded (debug, fast), but the emulator did not reload: the emulator is running
> /tmp/scroll-experiment-1wh7Tk/s4.debug.bin, which is not a ROM this project builds. This
> build wrote /tmp/aeon-KU15wh/s4.debug.bin. Aurora refused to reload rather than hand the
> emulator a file this build never touched (it would come back without the change you just
> made, and look like the edit had vanished). Load /tmp/aeon-KU15wh/s4.debug.bin in the
> emulator, or open the project /tmp/scroll-experiment-1wh7Tk/s4.debug.bin belongs to.

Both paths are named because either alone is unactionable: the running one says what to
close, the built one says what to open and is the file the owner spent the build waiting
for. The build's own result is unchanged and still reported — an artist still learns their
level assembles, which is the property the no-emulator path already had.

The built path is the **flavour-adjusted** artifact, not `join(cwd, plan.romPath)`.
Naming the release name after a DEBUG build would send the owner to open a ROM that was
never written.

### The named-path success

> Build succeeded (debug, fast): reloaded /home/volence/sonic_hacks/aeon/s4.debug.bin, back
> at (1234, 560) · save 0.3s · build 1.3s · reload 0.4s · restore 0.6s

Previously: `Build succeeded (debug, fast): emulator reloaded, back at (1234, 560) · …`.

**This half is separable and is the more important one.** Every link in the chain that
misled the owner was individually honest — the build did succeed, the reload did happen,
the toast was accurate about both. The composite still told him his edit had vanished. The
cure is that each link names its object.

It must be the **full path**. Both ROMs in the incident were called `s4.debug.bin`, so a
toast naming the basename would have read identically on the good day and the bad one.
That is asserted directly: the row `is DIFFERENT for two ROMs that share a name` builds two
summaries whose only difference is the directory and requires them not to be equal.

The path could not reach the toast at all before this parcel: `BuildRunResult.romPath` has
existed in the main process since the reload path was written, and `src/main/aether/bridge.ts`
dropped it on the floor — `AetherBuildResult` in `src/shared/ipc-types.ts` had no such
field. The renderer could not name what it had just reloaded even in principle.

The old wording survives as the fallback when no path comes back, so a main-process bug
shows as the sentence that was always there rather than as `reloaded .`.

---

## 4. Red-first evidence

Runner: **`npm test`** (the repo's own chain: fourteen `check-*` scripts, then
`npm run typecheck`, then `vitest run`). Individual files driven with
`npx vitest run <path>`. No emulator was contacted at any point; `emulator/status` and the
whole reload sequence are client calls, and every row drives a served fake, which is the
pattern the existing rows in `src/main/aether/__tests__/build-run.test.ts` already use.

### 4.0 A finding before the fix: the fixtures encoded the defect

Every aeon row in `src/main/aether/__tests__/build-run.test.ts` built in a
`mkdtemp()/aurora-build-XXXXXX` directory and told the fake emulator it was running
`/engine/s4.bin`. That is a cross-project pair — the literal shape of this defect —
written into the fixtures of the rows that were supposed to be watching for it, and all
41 were green. (The *classic* rows already used `join(dir, 's1built.bin')`; only the aeon
half drifted.)

Committed separately at `ff2b27b2`, before any source change, and **still 41/41 green
against the unfixed runner**, which is what makes it a fixture change and not a fix.
`dir` is now a **required** field of both fakes rather than an option with a plausible
default, because a default is how this comes back.

### 4.1 Red

Committed at `d899fb89`, on the tree it fails against:

```
Test Files  2 failed (2)
     Tests  10 failed | 45 passed (55)          rc=1
```

The sharpest line is the toast row:

```
AssertionError: expected 'Build succeeded (debug, fast): emulat…'
             not to be 'Build succeeded (debug, fast): emulat…'
```

Two different ROMs, byte-identical toasts. That is the composite the owner read as "my
edit vanished": every link true, no link naming its object.

Three of the 45 green rows are green **before and after on purpose** — they are the
`s4.bin` ↔ `s4.debug.bin` pairing the preference exists for, and a fix that breaks them is
the wrong fix in the other direction.

### 4.2 Which predicate does each row read

Every refusal row asserts the **call log**, not the message. There is exactly one row
about the wording, and it is labelled as such.

```ts
expect(client.calls.filter((c) => c.startsWith('emulator/reload_rom'))).toEqual([]);
expect(client.calls.filter((c) => c.startsWith('load_symbols'))).toEqual([]);
expect(client.calls.filter((c) => c.startsWith('emulator/pause'))).toEqual([]);
expect(r.romPath).toBeUndefined();
```

### 4.3 Planted violations

Four mutations, each applied to the fixed tree and reverted:

| Plant | Result |
|---|---|
| rule loosened to **basename only** | 4 red, including `refuses a ROM with the SAME NAME in a different directory` |
| rule loosened to **directory only** | 2 red: `refuses a DIFFERENT artifact sitting in the same directory` and `gives classic no debug sibling to be fooled by` |
| **refusal moved to AFTER the write** — the message is still produced, the foreign ROM is reloaded anyway | **4 state rows red, and the message row `names BOTH paths in the refusal` stayed GREEN** |
| toast reverted to `'emulator reloaded'` | 3 red renderer rows |

The third is the hazard reproduced on demand. A suite that asserted only the refusal's
wording would have called that mutation correct.

### 4.4 Totals, both ends, with exit codes

| | rc | Test Files | Tests |
|---|---|---|---|
| base `5c107282` | **0** | 574 passed \| 3 skipped (577) | 8584 passed \| 9 skipped (8593) |
| tip | **0** | 575 passed \| 3 skipped (578) | 8598 passed \| 9 skipped (8607) |

`failure-class: no failures in this run` at both ends. `skip-report: OK. Every skip named
its reason.` The +14 is the 10 new `build-run` rows and the 4 new renderer rows.

**This worktree shows none of the 77 phantom React failures.** Its `node_modules` was
installed fresh (`npm install`, 259 packages) because the worktree had none at all; base
and tip are both green, so nothing here is standing on a pre-existing red.

Loud-when-it-cannot-measure was observed rather than assumed: an early run with a filter
that matched nothing printed

```
skip-report: COULD NOT MEASURE: the run reported no test modules at all.
failure-class: COULD NOT MEASURE: the run reported no test modules at all.
```

rather than a clean zero. The reporters already have this property.

### 4.5 The grep hazard

`grep` in this shell is a `ugrep` wrapper. It was measured rather than trusted: a
positive control (`grep -rln runBuild src`) returned the four real files, and a canary
write into `node_modules/` could not be attempted because **this worktree had no
`node_modules` at the time**, which is itself why the absence would have been
uninformative. Every population statement in this packet rests on a positive control or on
a Python `str.count` over the file's bytes (the fixture rewrite asserts an exact
occurrence count for all 27 of its substitutions and would have thrown on any miss).

---

## 5. Found and not fixed

**5.1 A DECLARED flavour can still reload a file this build did not write.** `project.json`
may state `buildEnv: { DEBUG: "0" }`, and this file's own comment rules that stated config
beats both the running ROM and the default. With that declared, the build writes `s4.bin`
while the emulator sits on this project's `s4.debug.bin` — a **family member**, so it is
accepted and reloaded, and it is a file this build did not touch. The game comes back
byte-identical: the same failure mode, inside one project.

Not fixed, deliberately. The brief's rule explicitly admits "its flavour sibling within
the same project", and the alternative treatments both cross a line this parcel should not
cross alone: reloading `s4.bin` instead is the substitution the preference forbids, and
refusing would override a documented owner ruling about declared config. The fixture is
one line — `raw: { buildEnv: { DEBUG: '0' } }` with `romPath: join(dir, 's4.debug.bin')` —
and the honest treatment is probably a refusal naming the declaration, since the
configuration and the running machine genuinely contradict each other. **Owner call.**

**5.2 The canonicaliser resolves symlinks, not mounts.** A running ROM reached through a
bind mount or a different mount point of the same filesystem compares unequal and is
refused. The failure is loud and names both paths, which is recoverable in a glance, and a
false *accept* is the silent one — so the asymmetry is deliberate. But it is a way to be
wrong.

**5.3 The refusal does not check the ROM's mtime.** A running ROM that is a family member
but predates the build (the emulator was pointed at this project's ROM and the build then
failed to write it, say) is accepted and reloaded. The build's own exit code covers the
common case; a stale-but-ours artifact is not otherwise detected.

**5.4 `emulator/status`'s `romPath` is trusted verbatim** as the reload target once it
matches. Empty is now treated as "no answer" (`|| null`, not `?? null`, since a connected
server with nothing loaded can answer with an empty string); a *relative* path would be
resolved for comparison but handed back to the emulator as given.

---

## 6. Files

| Path | Change |
|---|---|
| `src/main/aether/build-run.ts` | `DEBUG_ARTIFACT_SUFFIX`, `romFamilyFor`, `classifyRunningRom`, `canonicalPath`; the gate, the flavour ordering, the flavour-adjusted `builtRom`, the refusal |
| `src/shared/ipc-types.ts` | `AetherBuildResult.romPath` |
| `src/main/aether/bridge.ts` | carry `romPath` across the boundary |
| `src/renderer/state/aetherStore.ts` | the toast names the reloaded path |
| `src/main/aether/__tests__/build-run.test.ts` | fixture coherence + 10 rows |
| `src/renderer/state/__tests__/aether-build-names-the-rom.test.ts` | 4 rows, new file |

**No emulator was called.** No `mcp__oracle__*` tool was invoked at any point.
