# PROFILE-RESIDUAL — the obvious fix breaks the parcel's own proof. NOT LANDED.

**Attempted, measured, withdrawn.** The change is committed on `fix/profile-default-closed`
and is **not** on master. It is recorded here rather than deleted because the next person
to look at this residual will reach for exactly the same edit.

## What was tried, and it is still the right shape

`resolveLeveldbDir`'s `profileDir` defaulted to `null`, which means *"search the shared
`~/.config/<app>` candidates"*. So a caller that never thought about the profile watched a
directory the run never writes, and could be told *"never flushed"* about a flush that
happened. `spawnGuarded` pins **every** launch to `RUN_PROFILE_DIR`, so the honest default
for the OBSERVER is the directory the LAUNCHER used.

The edit: default `profileDir = RUN_PROFILE_DIR`, keep `profileDir: null` as an explicit,
typed opt-in for the shared search.

**It worked at the unit level and the discriminating row is real:**

- 30 rows green with the change.
- Red-first: reverting the default on disk fails **exactly one row — the new one** — and
  leaves the other 29 green. That is the row's own claim, confirmed: every pre-existing row
  passes `profileDir` explicitly and is therefore **blind to this hazard**. Nine of them now
  say `profileDir: null` out loud, which is a gain regardless of this parcel's fate.

## ⚠ Why it is not landed — it breaks `harness:profile-isolation`

| tree | proof result |
|---|---|
| master, change absent (**control**) | **rc 0, 8 rows, 0 fails** |
| with the change | **rc 2, zero rows** — the victim arm produced no output at all |

`Error: ENOENT … victim-read.json`. **The control is what makes this mine rather than a
flake**: the same proof, same box, minutes apart, passes without the change and dies with it.

**One observation, offered as an observation and not a diagnosis:** on master the launching
child prints both `guard: pinned Ozone to x11` **and** `guard: private profile for this RUN:
…`. Under the change the victim printed the Ozone line and **not** the profile line — so its
`pinUserDataDir` did not pin. The edit adds `storage-flush.mjs → harness-guard.mjs`, the
first import in that direction, which makes module initialisation order a new variable.
**I did not chase it, and I am not asserting it is the cause.**

## Why it stopped here

A higher-priority item (the boundary runtime witness) came unblocked while this was in hand,
and **a change that breaks the rig proving the feature must not land to close a residual that
is currently documented and harmless.** The hazard is real but latent: only two callers exist
and both are correct today.

**For whoever takes it next:** the unit work is done and committed on that branch — the
default, the nine explicit `null`s, and the discriminating row. What is missing is the reason
the proof's victim arm dies, and the import direction is where I would start.
