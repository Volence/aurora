# REVENDOR-AEON-SONG-BANK-2: the song bank move reaches no vendored pin (review packet, 2026-09-28)

ROADMAP row 243. Branch `worktree-agent-a6391929bd26410bf`, cut from master `b756ecba`. Method as packets
`docs/reviews/2026-09-28-revendor-77fc6fb6.md` (row 231) and `docs/reviews/2026-09-28-revendor-228.md` (row 228).

## 1. The pin

aeon **`713f039d576c1f557d611bccaee98bbae396a90c`**, `origin/master` after `git fetch -q origin` at
2026-09-28T14:13:29Z. A second fetch at 2026-09-28T14:18:06Z found `origin/master` still at `713f039d`.
`git merge-base --is-ancestor e03c6f1d origin/master` exits 0, so the song-bank landing aeon named is in the pin.

aeon was read only through git objects. The tools ran in a `git archive 713f039d` copy at
`$HOME/.cache/aurora-243/tree` (no `.git`), with `EMPYREAN_SUITE_ROOT` exported. In that copy,
`tools/s2_zone_convert.py convert --all-six` reported 6 zones, 2219040 cells round-tripped, 0 differing, 0 FAILED.
No aeon build ran, and I never ran cargo.

## 2. The moved set, derived

The row relays aeon's list: `games/sonic4/map.toml`, `games/sonic4/config/sound_ids.emp`, `s2_mtz_cpz/clips.json`,
and the `anchors.toml` of `s2_ehz_cpz`, `s2_mtz_cpz` and `s2_woven`.

`git diff --stat 8dbd134b 713f039d` gives 208 files. 8dbd134b is the revision the six `aeon-outputs` markers are
pinned at, and it is the merge base with `e03c6f1d`. All six paths aeon named are in that diff. So are other song-bank
files aeon did not list, for example `mt_bank.emp`, `song_bank2.emp`, `sfx_bank_blob.emp`, `soundbankhead.emp` and
`tools/clip_anchors.py`. None of those is vendored either.

**Census.** A script walked every `*.provenance.json` under `test/fixtures` and `src`: 29 sidecars, 23 with an
`aeon` block. It compared each `path`/`blob` and `tool_path`/`tool_blob` pair, pin history excluded, with the blob at
the revision. That is 141 pairs over 37 distinct paths.
- At `713f039d`: **0 moved.**
- Control, the same script at `8dbd134b`: 1 moved. `engine/system/constants.emp` is `2915ee35` in the
  `engine_constants` sidecar and `b86134bf` at `8dbd134b`. It moved at `41697d36` (tile-cache arming), which is inside
  this range. An earlier re-vendor already re-pinned that fixture at `41697d36`, and its blob is the tip's. So the
  census can see a move.

**None of aeon's six paths is one of the 37 Aurora pins.** Aurora vendors no `map.toml`, `sound_ids.emp`,
`anchors.toml` or `s2_mtz_cpz` file. `grep` over `src`, `test` and `scripts` found one `map.toml` reader, and nothing
reads `sound_ids`, `anchors.toml`, `mt_bank` or `song_bank`. That reader is `test/formats/bg-anim-band-axis-aeon-gate.test.ts`,
which archives aeon at its own fixed `AXIS_REV` (`3a4712fa`), not at the tip.

The markers pin `engine/system/constants.emp` by value (row 234). At the tip, the currency rows report 0 of those
values moved: 26 on each bake marker, 29 on `s2_woven`, 8 on validate-json and 5 on paste-music.

## 3. Baseline and red-at-new-pin

**Order, stated:** I fetched aeon before I ran the baseline. Every currency row compares at aeon `origin/master`, so
the baseline already measured the new pin. `origin/master` was `713f039d` at dispatch, so there was no older tip to
compare against. The census in section 2 stands in for a before/after.

`TMPDIR=$HOME/.cache/aurora-tmp VITEST_MAX_WORKERS=4 npm test` on `b756ecba`, exit 0:
- Files: 0 failed / 693 passed / 3 skipped (696).
- Tests: **0 failed / 11909 passed / 20 skipped (11929)**.
- `run-completeness: COMPLETE, 696 of 696 module(s) this run selected finished.`
- `failure-class: no failures in this run (696 module(s) reported).`
- `skip-report: OK. Every skip named its reason.`

**Currency rows red at the new pin: none.** The clip-tool-outputs rows printed `tools/clip_act_bake.py` as
`958958b5` and `tools/clip_manifest.py` as `4392dc52` at `713f039d`, both equal to the pins. `donor-fixture-currency`
printed `tools/s2_zone_convert.py` as `94a6580f`, also equal to its pin.

## 4. Re-vendor: nothing to re-vendor

Every fixture's `re_measure` trigger is a moved tool blob, a moved input blob or a moved by-value constant. None of
them fired. Precedent (rows 228 and 231) changes a sidecar's `revision` only when a pinned blob moved, and sets it to
the last commit on the path. So no fixture or sidecar changed.

**The brief's "re-vendor the clip fixtures" and "re-pin to origin/master" could not be carried out as written.**
There is no moved pinned file. Rewriting every `revision` to `713f039d` would not follow the convention, because it
would stop naming the commit that produced each blob. I did not do it.

## 5. Row 222's paste-music currency, against the new `music` names

**The vendored fixture: current, byte for byte.** I ran the marker's own `fixture.command`
(`gen_paste_music.py ../pm <out>`) in the tip copy. It produced 3 cases (exits 0, 1, 0), and the output is
**byte-identical** to the vendored `paste-music.cases.json` (`cmp` exit 0, sha256 `af3b6164`). This is expected:
- The fixture names only `SONG_S2_EHZ` (2) and `SONG_S2_CPZ` (3), and neither value moved in `sound_ids.emp`.
  Song bank 2 adds `SONG_S2_MTZ = 4` and renumbers `SONG_DRUMTEST` 4 -> 5 and `SONG_HCZ2` 5 -> 6.
- `clip_manifest.py` never opens `sound_ids.emp`. R3 checks a clip's `music` against `^SONG_[A-Z0-9_]+$` and checks
  that a zone's clips agree. It does not resolve the name to an id.

**The new name through Aurora's paste path, measured.** A one-off vitest file (deleted, not committed) parsed aeon's
`s2_mtz_cpz/clips.json` at `8dbd134b` and at `713f039d`. It ran `zoneSong`/`zoneSongLine` and `withClip` on each for
one pasted s2disasm MTZ clip, src (0,0,2048,1024) and dst (0,4096,2048,1024).

| s2_mtz_cpz at | MTZ line the paste form shows | `music` written | aeon `validate --json` |
|---|---|---|---|
| `8dbd134b` | `Song: none inherited (the act's s2disasm MTZ clips name no song)` | absent | exit 0, ok, 0 refusals, 2 warnings |
| `713f039d` | `Song: SONG_S2_MTZ (from s2disasm MTZ)` | `SONG_S2_MTZ` | exit 0, ok, 0 refusals, 2 warnings |
| `713f039d`, same paste with `music` removed (control) | n/a | absent | **exit 1, R3**: "clips 'mtz_west' and 'mtz_1' are both s2disasm MTZ but name different music ('SONG_S2_MTZ' vs None)" |

Aurora's paste into the new Metropolis act inherits the new name and aeon accepts it. The control shows the inherited
name is what aeon's R3 requires. CPZ in the same act reads `SONG_S2_CPZ` at both revisions. No Aurora code needed a
change.

## 6. Suite at the tip

`TMPDIR=$HOME/.cache/aurora-tmp VITEST_MAX_WORKERS=4 npm test`, run with this packet in the tree after the one-off
file was deleted (exit 0; aeon `origin/master` still `713f039d`):
- Files: 0 failed / 693 passed / 3 skipped (696).
- Tests: **0 failed / 11909 passed / 20 skipped (11929)**, the same as the baseline.
- run-completeness: COMPLETE, 696 of 696.
- failure-class: no failures.
- skip-report: OK, every skip named its reason.

No fixture, test or expectation changed, and no gate was added or changed.

## 7. Open

- Nothing is blocked. Aurora vendors no `s2_mtz_cpz` manifest, so no suite row watches this Metropolis inheritance.
  Section 5 measured it once. If the overseer wants it held, the red-first row would be a fourth
  paste-music-style case on `s2_mtz_cpz`, generated by `gen_paste_music.py`.
- The validate-json marker's prose says "s2_mtz_cpz ... carry W3" and is dated "at the pin" (`8dbd134b`). That still
  describes that revision. The claim also holds at the tip: both pasted `s2_mtz_cpz` manifests in section 5, at
  either revision, carry exactly two warnings, and both are W3 (section 0 holds `mtz_west` and `cpz_loop_cluster`;
  section 2 holds `cpz_loop_cluster` and `mtz_east`).
- Row 228's TAG still stands: `test/live/aeon-warp-correspondence.test.ts` spawns `oracle-aether`, so I did not run it.
