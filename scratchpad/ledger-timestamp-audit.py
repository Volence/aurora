#!/usr/bin/env python3
"""Audit an append-only JSONL ledger for timestamps that were not taken from a clock.

WHAT IT MEASURES, and why this and not the digit scan
-----------------------------------------------------
`contract/LANE_LOG.md` and `contract/DECISIONS.md` both say an entry's `at` comes from
`date -u +%Y-%m-%dT%H:%M:%SZ` and never from the writer's head. Nothing enforced it.

The obvious check is a digit scan -- flag `at` values ending `:00Z`. It is real signal
(measured on aurora's lane-log: 13 of 140 against 2.33 expected by chance; the joint
signature of seconds `00` AND minute divisible by five, 9 against 0.47, about 19x) but it
is weak in both directions: it fires on the 1-in-60 honest entry, and it is STRUCTURALLY
BLIND to backfilling, which is the defect the contracts prohibit by name.

This measures the distance between an entry's own `at` and the committer time of the
commit that FIRST introduced it. A time taken from the clock at write time sits on top of
its commit; a remembered or backfilled one does not, and the separation is not marginal.
Measured on aurora's lane-log, 2026-09-02:

    seconds != 00   n=127   median    0s   p90    17s
    seconds == 00   n=14    median  242s   p90  1192s

Median zero against median 242, with no assumption about which digits a human likes.

FIRST APPEARANCE IS THE WHOLE TRICK, and skipping it makes the tool worse than useless
-------------------------------------------------------------------------------------
Keying on "any commit whose diff added this line" mis-flags every reformat, migration and
repair, because such a commit re-adds old entries -- correctly preserving their `at` --
long after they were written. Worked example, aurora `9c2974e0` ("lane-log.jsonl was not
strict JSONL"): it re-added two entries whose stamps were right, and a naive pass reports
them ~2.5 DAYS adrift. Those are the two largest deltas in the whole ledger and both are
innocent. So an `at` value is judged only at the first commit it ever appears in.

THE SIGN IS REPORTED SEPARATELY, and the two directions are NOT equally strong evidence
---------------------------------------------------------------------------------------
`at` BEFORE its commit is the ordinary case -- you write, then you commit -- so only the
MAGNITUDE is suspicious there.

`at` AFTER its commit cannot come from a clock read before that commit, so any amount of it
is a finding rather than a threshold question. Be precise about what it is NOT, because the
tempting sentence is wrong: this is drift measured against the entry's OWN COMMIT, and it
is NOT the future-timestamp failure the lane-status reader rejects, which compares against
the reader's wall clock. An entry stamped 09:36:00 and committed at 09:34:12 is perfectly
readable by every tool in the suite; it is only proof that 09:36:00 was not read off a
clock. Reporting it as "the future" would be a verdict that happens to be right attached to
a reason that is fabricated -- the exact failure this suite banks as a review bar.

LIMITS, stated rather than left to be discovered
------------------------------------------------
* Entries are keyed by their `at` value. Two DISTINCT entries sharing one second are read
  as a repeat and the second goes unjudged -- a missed check, never a false alarm. Every
  such collision is printed under DUPLICATE STAMPS so it is visible rather than swallowed.
* THE ONE LIMIT OF THE COLLISION REMEDY: two BYTE-IDENTICAL appearances. --only-present
  asks whether a collision's own line survives at HEAD, and two identical lines are one
  string to a set, so correcting either of them leaves the other answering "still there"
  and the run stays red with no move left. Stated rather than papered over, because a
  check that appears to cover a case and does not is worse than one that says it doesn't.
  It errs RED (a stuck failure, never a silent pass), it cannot arise from the ordinary
  cause -- two entries written minutes apart differ in their headline -- and the way out
  is to make the duplicated entry's own text distinct, which is what a genuinely repeated
  line needs anyway. The alternative mechanism, comparing the NUMBER of occurrences at
  HEAD against the number of appearances recorded, would cover it and is a new mechanism
  with its own edges (a line legitimately present twice, a reformat changing the count);
  measured on the bed and rejected as a bigger change than the hole justifies.
* A repair commit that alters an entry's `at` is indistinguishable from a new entry. That
  is correct: changing a stamp IS the thing being audited.
* A squashed or rewritten history moves committer times, so deltas after a rebase describe
  the rebase. The tool says so rather than pretending; check `git log` before believing a
  bulk shift.
* The default threshold is not a law. It is ~7x the clean cohort's p90 measured above.
  Pass --threshold to set it from your own ledger's distribution, which is the honest way.

--since: THE RATCHET, and why the cutoff is on the COMMIT and not on `at`
------------------------------------------------------------------------
Added 2026-09-02 so this can also run as a GATE (aurora
`scripts/check-ledger-timestamps.mjs`) without either failing forever on entries written
before it existed or rewriting them, which the ledgers' append-only rule forbids.

`--since <ISO>` judges only the entries introduced by a commit whose COMMITTER TIME is at
or after that instant, and REPORTS the rest as grandfathered rather than dropping them
silently. The cutoff is on the commit, and getting that backwards reopens the hole:

  * cutoff on `at` -- "only check entries claiming to be newer than D" -- lets an entry
    BACKFILLED TODAY WITH AN OLD `at` slip under the cutoff unchecked, and backfilling is
    one of the two things the contract prohibits by name.
  * cutoff on COMMITTER TIME -- "every entry introduced after D complies, whatever `at` it
    claims" -- has no such hole. An entry committed today is judged today.

Under `--since` two silent misses become failures, for IN-SCOPE commits only: an
unparseable line, and a repeated stamp whose FIRST appearance is also in scope (two new
entries sharing one second, the second unjudged). A repair commit re-adding a line first
written before the cutoff is the innocent case above and is reported without failing.

`--only-present` is the REMEDY, and a gate without it has none. First appearance is keyed
on the stamp, so a bad entry that is CORRECTED in a later commit leaves its old stamp
findable in the diff forever: the run stays red and no commit anyone can make will clear
it, short of rewriting history that may already be pushed. Measured while building the
gate -- a planted bad entry was removed by a follow-up commit and the audit went on
reporting it. Under `--only-present` only stamps the file STILL CARRIES at HEAD are
judged, and the ones introduced-then-removed-or-corrected are COUNTED AND PRINTED rather
than dropped. A stamp no longer in the ledger is no longer a claim the ledger makes.

A COLLISION IS ASKED THE SAME QUESTION ABOUT ITS OWN LINE, not about its stamp. Keying a
repeated stamp on the stamp -- which is what it did until 2026-09-03 -- made the remedy
UNREACHABLE for the one case `--since` calls a hole: when two NEW entries share a second,
the innocent sibling keeps that second at HEAD forever, so correcting the offending entry
left the collision failing and only changing BOTH stamps cleared it, which nothing told
anyone to do. It happened for real in aurora on 2026-09-03 and the fix had to touch both
entries. Keyed on the line, correcting THE LATER APPEARANCE -- the one that went unjudged
-- clears the run and is reported as withdrawn. Correcting the FIRST does not clear it and
must not: the later entry is still in the file and was still never judged. The directions
are deliberately asymmetric. The limit of this keying is under LIMITS above.

WITHOUT `--since`, NOTHING ABOVE APPLIES and every verdict this file gave before that date
is unchanged. `--strict-ahead` and `--only-present` are likewise opt-in: the first makes
any `at` later than its own commit a failure at any magnitude, which is what the sign
section already says about the evidence and what the exit status alone did not say; the
second is described just above. The bare instrument still reports the whole history,
which is what an audit of history should do.

USAGE
-----
    python3 ledger-timestamp-audit.py docs/lane-log.jsonl
    python3 ledger-timestamp-audit.py docs/decisions.jsonl --repo ../empyrean
    python3 ledger-timestamp-audit.py docs/lane-log.jsonl --threshold 60 --quiet
    python3 ledger-timestamp-audit.py docs/lane-log.jsonl \
        --since 2026-09-02T12:00:00Z --strict-ahead          # gate mode

The ledger path is an argument and the repo is an argument; there are no paths, repo names
or environment variables baked in, so this file lifts into any suite repo unedited.

Exit status: 0 clean, 1 entries over threshold (plus, under --since, the two in-scope
misses above), 2 COULD NOT MEASURE. Never green on unmeasurable -- a missing file, a path
git does not track, or no git at all is exit 2 with a sentence saying what was not
measured. "No entry has been appended since the cutoff" is NOT unmeasurable: it is a real
clean state and exits 0. "This ledger holds no timestamps at all" still is not.
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
from datetime import datetime, timezone

# ~7x the p90 of the clean cohort measured on aurora's lane-log (17s). Override per ledger.
DEFAULT_THRESHOLD_S = 120


def die_unmeasurable(msg: str) -> None:
    print(f"COULD NOT MEASURE: {msg}", file=sys.stderr)
    print("NOT A PASS. Nothing about this ledger's timestamps was checked.", file=sys.stderr)
    raise SystemExit(2)


def git(repo: str, *args: str) -> str:
    """Run git, and treat a failure as unmeasurable rather than as an empty result.

    A failing command and an empty world produce the same stdout; only the exit status
    tells them apart, so it is checked here rather than discarded.
    """
    proc = subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0:
        die_unmeasurable(
            f"`git {' '.join(args)}` in {repo} exited {proc.returncode}: "
            f"{proc.stderr.strip() or '(no message)'}"
        )
    return proc.stdout


def parse_at(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def collect(repo: str, ledger: str) -> tuple[list[dict], list[dict], list[dict]]:
    """Return (judged, duplicates, unparsed) for the ledger, keyed on first appearance.

    Every record carries the COMMITTER TIME of the commit it came from (`ctime`), which
    `--since` filters on. That is the commit's time, never the entry's own `at`; see the
    note on --since in main().
    """
    log = git(repo, "log", "--format=%H %cI", "--reverse", "--", ledger).strip()
    if not log:
        die_unmeasurable(
            f"git knows no commits touching {ledger!r} in {repo}. Either the path is wrong "
            f"or the file is untracked; both mean the audit did not run."
        )

    seen: dict[str, tuple[str, datetime]] = {}
    judged: list[dict] = []
    duplicates: list[dict] = []
    unparsed: list[dict] = []

    for line in log.split("\n"):
        sha, ctime_raw = line.split()
        ctime = datetime.fromisoformat(ctime_raw).astimezone(timezone.utc)
        # `--diff-merges=off` because `git show` on a MERGE defaults to a COMBINED diff,
        # whose added lines carry TWO leading markers (`++{...}`) and parse as garbage.
        # Suppressing it is also the more correct attribution for first-appearance: the
        # branch commit is where an entry was written, and the merge only carries it in.
        # Cost, stated: a line introduced ONLY by a conflict resolution is then unjudged.
        diff = git(repo, "show", sha, "--format=", "--unified=0", "--diff-merges=off",
                   "--", ledger)

        for dline in diff.split("\n"):
            if not dline.startswith("+") or dline.startswith("+++"):
                continue
            try:
                entry = json.loads(dline[1:])
            except json.JSONDecodeError:
                unparsed.append({"sha": sha[:8], "ctime": ctime, "raw": dline[1:],
                                 "text": dline[1:][:100]})
                continue
            if not isinstance(entry, dict) or "at" not in entry:
                continue

            at_raw = str(entry["at"])
            at = parse_at(at_raw)
            if at is None:
                unparsed.append({"sha": sha[:8], "ctime": ctime, "raw": dline[1:],
                                 "text": f"unparseable at={at_raw!r}"})
                continue

            # FIRST APPEARANCE ONLY. Everything after is a repair re-adding a correct line.
            if at_raw in seen:
                first_sha, first_ctime = seen[at_raw]
                # `raw` is THIS appearance's own line, and it is what --only-present keys
                # on. Keying a duplicate on its stamp instead would ask "does ANY line at
                # HEAD still carry this second?", which the innocent sibling answers yes to
                # forever -- see the REMEDY note under --only-present in the header.
                duplicates.append({"at": at_raw, "first": first_sha, "again": sha[:8],
                                   "ctime": ctime, "first_ctime": first_ctime,
                                   "raw": dline[1:], "label": label_of(entry)})
                continue
            seen[at_raw] = (sha[:8], ctime)

            judged.append({
                "at": at_raw,
                "sha": sha[:8],
                "ctime": ctime,
                # Signed: negative means the stamp is AFTER its own commit, i.e. the future.
                "delta": (ctime - at).total_seconds(),
                "round": at_raw[17:19] == "00",
                "label": label_of(entry),
            })

    return judged, duplicates, unparsed


def label_of(entry: dict) -> str:
    for key in ("headline", "question", "id", "what"):
        if entry.get(key):
            return str(entry[key])[:72]
    return "(no headline)"


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Audit a JSONL ledger for timestamps not taken from a clock.",
        epilog="Exit 0 clean, 1 over threshold, 2 could not measure.",
    )
    ap.add_argument("ledger", help="repo-relative path to the .jsonl ledger")
    ap.add_argument("--repo", default=".", help="repo holding it (default: cwd)")
    ap.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD_S,
                    help=f"seconds of drift to flag (default {DEFAULT_THRESHOLD_S}; "
                         "set it from your own ledger's distribution)")
    ap.add_argument("--quiet", action="store_true", help="findings only, no distribution")
    # ---- THE RATCHET. Added 2026-09-02 for scripts/check-ledger-timestamps.mjs. -------
    # Without --since the tool behaves exactly as it always did; every rule below is
    # reached only when --since is given, so the instrument a human runs is unchanged.
    ap.add_argument("--since", metavar="ISO8601",
                    help="RATCHET. Judge only entries introduced by a commit whose "
                         "COMMITTER TIME is at or after this instant; report the rest as "
                         "GRANDFATHERED. The cutoff is on the COMMIT, never on `at` — a "
                         "cutoff on `at` would let an entry backfilled today with an old "
                         "`at` slip under it unjudged, and backfilling is half of what is "
                         "being audited. Also turns two silent misses into failures for "
                         "in-scope commits only: an unparseable line, and a repeated stamp "
                         "whose FIRST appearance is also in scope (two new entries sharing "
                         "one second — a repair re-adding an old line is not that, and is "
                         "reported without failing).")
    ap.add_argument("--only-present", action="store_true",
                    help="Judge only stamps the ledger STILL CARRIES at HEAD, and report "
                         "the rest as introduced-then-removed-or-corrected. Without this "
                         "there is NO REMEDY for a bad entry once it is pushed: the audit "
                         "keys on first appearance, so correcting the stamp in a later "
                         "commit leaves the old one findable forever and a gate stays red "
                         "with nothing anyone can do about it short of rewriting history. "
                         "A stamp no longer in the file is no longer a claim the ledger "
                         "makes. The count is printed, never swallowed. A REPEATED stamp "
                         "is asked about its OWN LINE, not its stamp — an innocent sibling "
                         "carries that second at HEAD forever, so keying the collision on "
                         "the stamp made this remedy unreachable for exactly the case "
                         "--since exists to catch. Correcting the LATER appearance clears "
                         "it; correcting the first does not, and must not.")
    ap.add_argument("--strict-ahead", action="store_true",
                    help="Make ANY entry stamped after its own commit a failure, not only "
                         "one past --threshold. This is what the header already says is "
                         "true of the evidence ('any amount is a finding, not a threshold "
                         "question'); the exit status did not say it, so a stamp pushed 5s "
                         "forward printed as a finding and exited 0. Off by default so the "
                         "instrument's existing verdicts do not move.")
    args = ap.parse_args()

    since = None
    if args.since is not None:
        since = parse_at(args.since)
        if since is None:
            die_unmeasurable(
                f"--since {args.since!r} is not an ISO 8601 instant, so the ratchet has no "
                f"cutoff and nothing was judged."
            )
        if since.tzinfo is None:
            die_unmeasurable(
                f"--since {args.since!r} carries no timezone. Committer times are compared "
                f"in UTC and a naive cutoff cannot be placed against them."
            )

    judged_all, duplicates, unparsed = collect(args.repo, args.ledger)
    if not judged_all:
        die_unmeasurable(
            f"{args.ledger} in {args.repo} yielded no entries carrying an `at` field, so "
            f"nothing was compared. An empty result here is not a clean result."
        )

    # THE UNMEASURABLE TEST IS ON THE POPULATION BEFORE THE CUTOFF, deliberately. Under a
    # ratchet, "no entry has been appended since the cutoff" is a genuine clean state and
    # must exit 0; "this ledger holds no timestamps at all" still cannot be measured.
    def in_scope(rec) -> bool:
        return since is None or rec["ctime"] >= since

    # WHAT THE LEDGER STILL SAYS, when --only-present is on. Keyed on the stamp for
    # entries and on the whole raw line for the ones that would not parse.
    present_at: set[str] | None = None
    present_lines: set[str] | None = None
    if args.only_present:
        head = git(args.repo, "show", f"HEAD:{args.ledger}")
        present_at, present_lines = set(), set()
        for hline in head.split("\n"):
            if not hline.strip():
                continue
            present_lines.add(hline)
            try:
                e = json.loads(hline)
            except json.JSONDecodeError:
                continue
            if isinstance(e, dict) and "at" in e:
                present_at.add(str(e["at"]))

    def still_there(rec) -> bool:
        if present_at is None:
            return True
        return (rec["raw"] in present_lines) if "raw" in rec else (rec["at"] in present_at)

    scoped = [e for e in judged_all if in_scope(e)]
    judged = [e for e in scoped if still_there(e)]
    grandfathered = len(judged_all) - len(scoped)
    # Introduced in scope and no longer in the file: corrected, or removed. Counted and
    # printed, because a population that vanishes from a report is how a check that judged
    # nothing reads as a check that found nothing.
    withdrawn = len(scoped) - len(judged)
    dup_scope = [d for d in duplicates if in_scope(d)]
    # A repeated stamp is a FAILURE only when BOTH appearances are in scope: that is two
    # new entries sharing one second, and the second went unjudged. A repair commit
    # re-adding a line first written before the cutoff is the innocent case the header
    # describes, and it is reported below without turning the run red.
    dup_both_in_scope = [d for d in dup_scope
                         if since is not None and d["first_ctime"] >= since]
    # …and the REMEDY applies here too: under --only-present a collision stops failing once
    # THE COLLIDING LINE ITSELF is gone from HEAD -- i.e. once the later appearance, the one
    # that went unjudged, has been corrected. Correcting the FIRST appearance instead does
    # NOT clear it, and must not: the second entry is still in the file and was still never
    # judged. The two directions are not symmetric, and `raw` is what makes them tell apart.
    dup_fail = [d for d in dup_both_in_scope if still_there(d)]
    # Withdrawn collisions are COUNTED AND PRINTED, never dropped -- same argument as
    # `withdrawn` above. A population that leaves the report is how "judged nothing" comes
    # to read as "found nothing".
    dup_withdrawn = [d for d in dup_both_in_scope if not still_there(d)]
    # Empty when the ratchet is off, so an in-scope unparseable line is a failure only in
    # gate mode and the instrument's own verdicts do not move.
    unparsed_scope = ([u for u in unparsed if in_scope(u) and still_there(u)]
                      if since is not None else [])

    ahead = [e for e in judged if e["delta"] < 0]
    over = sorted((e for e in judged if abs(e["delta"]) > args.threshold),
                  key=lambda e: -abs(e["delta"]))
    # `over` is the threshold question; `ahead` is the sign question. Under --strict-ahead
    # the two are unioned, because an `at` later than its own commit cannot have been read
    # off a clock at any magnitude.
    failing = over + [e for e in ahead if e not in over] if args.strict_ahead else over

    # Coverage FIRST, and on the same line as the total. A tool that reports only what it
    # judged lets a reader take the total for the population; the entries it could not
    # judge are exactly where a defect would sit unseen. The same argument is why the
    # GRANDFATHERED count is printed on every run and not only when it is zero.
    unjudged = len(duplicates) + len(unparsed)
    print(f"{args.ledger} in {args.repo}: {len(judged_all)} entries judged at first "
          f"appearance, {unjudged} NOT JUDGED ({len(duplicates)} repeated stamps, "
          f"{len(unparsed)} unparseable)  (threshold {args.threshold:g}s"
          f"{', strict-ahead' if args.strict_ahead else ''})")
    if since is not None:
        print(f"  RATCHET: cutoff {since.isoformat().replace('+00:00', 'Z')} on COMMITTER "
              f"TIME (not on `at`). {len(judged)} entr{'y' if len(judged) == 1 else 'ies'} "
              f"IN SCOPE — introduced at or after it, and judged below. "
              f"{grandfathered} GRANDFATHERED — introduced before it, measured and then "
              f"NOT held to the rule, because the ledgers are append-only and are not "
              f"rewritten; the cutoff exists so nothing NEW joins them. Of the "
              f"{unjudged} not judged, {len(dup_scope)} repeated stamps and "
              f"{len(unparsed_scope)} unparseable lines are in scope."
              + (f" {withdrawn} in-scope stamp(s) were introduced and are NO LONGER IN THE "
                 f"FILE — corrected or removed — so they are not judged (--only-present); "
                 f"that is the only remedy a pushed bad entry has."
                 if args.only_present and withdrawn else "")
              + (f" {len(dup_withdrawn)} in-scope REPEATED stamp(s) collided and the "
                 f"colliding line is NO LONGER IN THE FILE — the later appearance was "
                 f"corrected — so they no longer fail (--only-present); correcting the "
                 f"FIRST appearance would not have cleared them."
                 if args.only_present and dup_withdrawn else ""))

    if not args.quiet:
        # The distribution is calibration, so it covers EVERY first appearance including
        # the grandfathered ones. Restricting it to the handful in scope would make the
        # threshold unjustifiable from the tool's own output.
        clean = [abs(e["delta"]) for e in judged_all if not e["round"]]
        rnd = [abs(e["delta"]) for e in judged_all if e["round"]]
        if since is not None:
            print(f"  (distribution over all {len(judged_all)} first appearances, "
                  f"grandfathered included)")
        for name, xs in (("seconds != 00", clean), ("seconds == 00", rnd)):
            if xs:
                p90 = sorted(xs)[max(0, int(len(xs) * 0.9) - 1)]
                print(f"  {name}: n={len(xs)} median={statistics.median(xs):.0f}s "
                      f"p90={p90:.0f}s max={max(xs):.0f}s")
            else:
                print(f"  {name}: none")

    if duplicates:
        shown = dup_scope if since is not None else duplicates
        hidden = len(duplicates) - len(shown)
        print(f"\nDUPLICATE STAMPS ({len(duplicates)}) — re-added later, NOT re-judged. "
              f"Innocent for a repair commit; look if you did not run one."
              + (f" {len(shown)} in scope, listed; {hidden} grandfathered, counted only."
                 if since is not None else ""))
        for d in shown:
            if d in dup_fail:
                both = " [BOTH APPEARANCES IN SCOPE]"
            elif d in dup_withdrawn:
                both = " [BOTH APPEARANCES IN SCOPE, COLLIDING LINE WITHDRAWN]"
            else:
                both = ""
            print(f"  {d['at']}  first {d['first']}  again {d['again']}  "
                  f"{d['label']}{both}")

    if unparsed:
        shown = unparsed_scope if since is not None else unparsed
        hidden = len(unparsed) - len(shown)
        print(f"\nUNPARSED LINES ({len(unparsed)}) — these were NOT checked."
              + (f" {len(shown)} in scope, listed; {hidden} grandfathered, counted only."
                 if since is not None else ""))
        for u in shown:
            print(f"  {u['sha']}  {u['text']}")

    if ahead:
        print(f"\nSTAMPED AHEAD OF ITS OWN COMMIT ({len(ahead)}) — `at` is LATER than the "
              f"commit that introduced it, so it cannot have been read off a clock before "
              f"that commit. Any amount is a finding, not a threshold question. This is NOT "
              f"the future-timestamp failure lane-status rejects (that compares against the "
              f"reader's wall clock); these files read fine."
              + (" ALL OF THESE FAIL THIS RUN (--strict-ahead)." if args.strict_ahead
                 else " These fail only past the threshold; pass --strict-ahead to fail "
                      "them all."))
        for e in ahead:
            print(f"  {e['at']}  {abs(e['delta']):.0f}s ahead of {e['sha']}  {e['label']}")

    behind = [e for e in failing if e["delta"] > 0]
    if behind:
        print(f"\nOVER THRESHOLD ({len(behind)}) — `at` predates its commit by more than "
              f"{args.threshold:g}s, so it was probably remembered or backfilled:")
        for e in behind:
            mark = " [also ends :00]" if e["round"] else ""
            print(f"  {e['delta']:9.0f}s  {e['at']}  {e['sha']}  {e['label']}{mark}")

    if dup_fail:
        print(f"\nTWO IN-SCOPE ENTRIES SHARE ONE STAMP ({len(dup_fail)}) — both appearances "
              f"were introduced after the cutoff, so this is not a repair re-adding an old "
              f"line: it is a NEW entry whose stamp collides with another new one, and the "
              f"second was never judged. Give it the second the clock actually read.\n"
              f"  CORRECT THE LATER APPEARANCE — the one listed second below, which is the "
              f"one that went unjudged. Under --only-present that clears the run, and it is "
              f"reported as withdrawn rather than dropped. Correcting the FIRST appearance "
              f"does NOT clear it and should not: the later entry would still be in the "
              f"file, still carrying a stamp nothing ever judged.")
        for d in dup_fail:
            print(f"  {d['at']}  {d['first']} then {d['again']}  {d['label']}")

    if unparsed_scope:
        print(f"\nUNPARSEABLE IN SCOPE ({len(unparsed_scope)}) — introduced after the "
              f"cutoff and NOT JUDGED. A line the audit cannot read is not a line that "
              f"passed:")
        for u in unparsed_scope:
            print(f"  {u['sha']}  {u['text']}")

    if not failing and not dup_fail and not unparsed_scope:
        if since is not None:
            print(f"\nNothing wrong with the {len(judged)} entr"
                  f"{'y' if len(judged) == 1 else 'ies'} in scope. "
                  f"{grandfathered} grandfathered and not held to the rule.")
        else:
            print("\nNothing over threshold.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
