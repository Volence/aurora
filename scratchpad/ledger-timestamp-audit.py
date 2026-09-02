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
* A repair commit that alters an entry's `at` is indistinguishable from a new entry. That
  is correct: changing a stamp IS the thing being audited.
* A squashed or rewritten history moves committer times, so deltas after a rebase describe
  the rebase. The tool says so rather than pretending; check `git log` before believing a
  bulk shift.
* The default threshold is not a law. It is ~7x the clean cohort's p90 measured above.
  Pass --threshold to set it from your own ledger's distribution, which is the honest way.

USAGE
-----
    python3 ledger-timestamp-audit.py docs/lane-log.jsonl
    python3 ledger-timestamp-audit.py docs/decisions.jsonl --repo ../empyrean
    python3 ledger-timestamp-audit.py docs/lane-log.jsonl --threshold 60 --quiet

The ledger path is an argument and the repo is an argument; there are no paths, repo names
or environment variables baked in, so this file lifts into any suite repo unedited.

Exit status: 0 clean, 1 entries over threshold, 2 COULD NOT MEASURE. Never green on
unmeasurable -- a missing file, a path git does not track, or no git at all is exit 2 with
a sentence saying what was not measured.
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


def collect(repo: str, ledger: str) -> tuple[list[dict], list[dict], list[str]]:
    """Return (judged, duplicates, unparsed) for the ledger, keyed on first appearance."""
    log = git(repo, "log", "--format=%H %cI", "--reverse", "--", ledger).strip()
    if not log:
        die_unmeasurable(
            f"git knows no commits touching {ledger!r} in {repo}. Either the path is wrong "
            f"or the file is untracked; both mean the audit did not run."
        )

    seen: dict[str, str] = {}
    judged: list[dict] = []
    duplicates: list[dict] = []
    unparsed: list[str] = []

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
                unparsed.append(f"{sha[:8]}  {dline[1:][:100]}")
                continue
            if not isinstance(entry, dict) or "at" not in entry:
                continue

            at_raw = str(entry["at"])
            at = parse_at(at_raw)
            if at is None:
                unparsed.append(f"{sha[:8]}  unparseable at={at_raw!r}")
                continue

            # FIRST APPEARANCE ONLY. Everything after is a repair re-adding a correct line.
            if at_raw in seen:
                duplicates.append({"at": at_raw, "first": seen[at_raw], "again": sha[:8],
                                   "label": label_of(entry)})
                continue
            seen[at_raw] = sha[:8]

            judged.append({
                "at": at_raw,
                "sha": sha[:8],
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
    args = ap.parse_args()

    judged, duplicates, unparsed = collect(args.repo, args.ledger)
    if not judged:
        die_unmeasurable(
            f"{args.ledger} in {args.repo} yielded no entries carrying an `at` field, so "
            f"nothing was compared. An empty result here is not a clean result."
        )

    ahead = [e for e in judged if e["delta"] < 0]
    over = sorted((e for e in judged if abs(e["delta"]) > args.threshold),
                  key=lambda e: -abs(e["delta"]))

    # Coverage FIRST, and on the same line as the total. A tool that reports only what it
    # judged lets a reader take the total for the population; the entries it could not
    # judge are exactly where a defect would sit unseen.
    unjudged = len(duplicates) + len(unparsed)
    print(f"{args.ledger} in {args.repo}: {len(judged)} entries judged at first appearance, "
          f"{unjudged} NOT JUDGED ({len(duplicates)} repeated stamps, {len(unparsed)} "
          f"unparseable)  (threshold {args.threshold:g}s)")

    if not args.quiet:
        clean = [abs(e["delta"]) for e in judged if not e["round"]]
        rnd = [abs(e["delta"]) for e in judged if e["round"]]
        for name, xs in (("seconds != 00", clean), ("seconds == 00", rnd)):
            if xs:
                p90 = sorted(xs)[max(0, int(len(xs) * 0.9) - 1)]
                print(f"  {name}: n={len(xs)} median={statistics.median(xs):.0f}s "
                      f"p90={p90:.0f}s max={max(xs):.0f}s")
            else:
                print(f"  {name}: none")

    if duplicates:
        print(f"\nDUPLICATE STAMPS ({len(duplicates)}) — re-added later, NOT re-judged. "
              f"Innocent for a repair commit; look if you did not run one.")
        for d in duplicates:
            print(f"  {d['at']}  first {d['first']}  again {d['again']}  {d['label']}")

    if unparsed:
        print(f"\nUNPARSED LINES ({len(unparsed)}) — these were NOT checked:")
        for u in unparsed:
            print(f"  {u}")

    if ahead:
        print(f"\nSTAMPED AHEAD OF ITS OWN COMMIT ({len(ahead)}) — `at` is LATER than the "
              f"commit that introduced it, so it cannot have been read off a clock before "
              f"that commit. Any amount is a finding, not a threshold question. This is NOT "
              f"the future-timestamp failure lane-status rejects (that compares against the "
              f"reader's wall clock); these files read fine.")
        for e in ahead:
            print(f"  {e['at']}  {abs(e['delta']):.0f}s ahead of {e['sha']}  {e['label']}")

    behind = [e for e in over if e["delta"] > 0]
    if behind:
        print(f"\nOVER THRESHOLD ({len(behind)}) — `at` predates its commit by more than "
              f"{args.threshold:g}s, so it was probably remembered or backfilled:")
        for e in behind:
            mark = " [also ends :00]" if e["round"] else ""
            print(f"  {e['delta']:9.0f}s  {e['at']}  {e['sha']}  {e['label']}{mark}")

    if not over:
        print("\nNothing over threshold.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
