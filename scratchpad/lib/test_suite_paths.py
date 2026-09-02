"""Rows for `suite_paths.py` — the PYTHON half of this repo's peer-path resolver.

    node scripts/check-python-resolver.mjs        (and it is in the `npm test` chain)
    python3 -m unittest discover -s scratchpad/lib -t scratchpad/lib -p 'test_*.py' -v

WHY THIS FILE EXISTS
--------------------
Until it did, `scratchpad/lib/suite_paths.py` had **no test file, in any language, at
any path** — enumerated over the whole tree, not guessed at by filename
(`docs/reviews/2026-09-02-python-twin-untested.md`). Six instruments import it. Its
JavaScript twin, `test/support/sibling-root.mjs`, has a whole suite including a step-3
proof in three beds; this module had zero rows in zero configurations.

That is the flattest member of a failure class four lanes hit inside one hour on
2026-09-02: a check whose population is DISJOINT from where the defect lives. The other
three shipped a green artifact that looked like coverage. This one shipped no artifact at
all, which is worse to notice: a module with no test contributes no skip, no failure and
no line to any suite total, so a failing command and an empty world print the same thing.

WHAT IT PROVES, AND WHERE
-------------------------
Step 3 of the four-step ladder — the derivation of the suite root from this checkout's
own location, `git rev-parse --path-format=absolute --git-common-dir` with `cwd` pinned
to the module's own directory — in **both configurations**, because `git rev-parse
--git-common-dir` has THREE output shapes and the obvious bed exercises exactly one:

    from a linked worktree            -> an ABSOLUTE path, whether asked or not
    from a main checkout's ROOT       -> `.git`
    from a main checkout SUBDIRECTORY -> `../../.git`

Only the first is absolute for free. `_suite_root` derives the root with
`pathlib.Path(common).parent.parent`, which — exactly like Node's lexical `dirname` in
the twin — resolves the string against NOTHING, so a relative `common` can only ever
yield a relative root (`.git` -> `.`, `../../.git` -> `..`). The two twins' arithmetic
was compared on all three shapes and is identical. That is why dropping
`--path-format=absolute` is a discriminating mutation here, and it is why these rows were
worth writing rather than assumed away by reading the flag off line 211.

⚠ DROPPING THAT FLAG IS **NOT** THE DEFECT A SIBLING LANE SHIPPED, and the distinction
has teeth. Theirs was resolving git's RELATIVE answer against the PROCESS CWD instead of
against the directory git ran in. Dropping the flag is a DIFFERENT MECHANISM producing
the same class of observable. It matters at exactly the moment it would be needed: if
such a plant ever comes back GREEN, one live reading is *the mutation was harmless
because this resolver never had that defect* — a fourth reading absent from the usual
three (matcher too loose / two code paths one observable / measuring the wrong quantity),
and the one that would otherwise send someone to "fix" a row that was already right.

THE SHAPE IS COPIED FROM `test/support/sibling-root.test.ts`, DELIBERATELY
-------------------------------------------------------------------------
Its step-3 block is a settled design, argued in its own comments, and this file extends
it rather than inventing a second one:

  · the bed is CHOSEN BY THE ROW — it creates the repository, and the SUBJECT IS COPIED
    INTO IT, because `_AURORA_DIR_DERIVED` is `Path(__file__).resolve().parents[2]`, so
    the module's own location IS the bed. A row that merely changed directory would be
    PROVABLY INERT — git would run in the real checkout and the row would pass under a
    bed-shaped name with nothing in its output to be suspicious of. That claim is
    load-bearing, so it is a row here (`test_process_cwd_cannot_steer_the_derivation`)
    rather than a comment.
  · the bed REFUSES LOUDLY when it cannot discriminate, and a refusal is not an
    assertion failure: it says FIX THE BED, NOT THE RESOLVER, because a bed that
    silently stops discriminating decays into precisely the vacuous green this file
    exists to close.
  · the row PROVES THE RESOLVER STOOD IN THE BED before asserting anything, by reading
    the announce string back off the child's stdout and requiring it to name the bed's
    own anchor.
  · the expectation is DERIVED FROM THE BED, never typed, and is asserted to differ both
    from what a flag-less derivation gives AND from what the resolver answers when it
    ignores the bed entirely — the latter MEASURED live in the same run by running the
    real module, not argued.

Everything the rows print — beds, git answers, both derivations, the announce line — goes
to stdout on GREEN runs too, not only on failure, because whether the production
configuration was measured must be readable from the run rather than inferred from its
colour.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

#: The module under test, beside this file. Derived, never typed.
SUBJECT = pathlib.Path(__file__).resolve().parent / "suite_paths.py"

sys.path.insert(0, str(SUBJECT.parent))
import suite_paths  # noqa: E402  (the subject; the path insert above is what finds it)

#: This checkout, as the SUBJECT observes it — read off the module rather than
#: recomputed here, since it is what step 3 hands git as `cwd` and therefore the only
#: directory whose git output shape says anything about this run.
REPO = suite_paths.AURORA_DIR

#: The JavaScript twin, for the cross-twin alias row.
JS_TWIN = REPO / "test" / "support" / "sibling-root.mjs"

#: Variables a child process must NOT inherit, taken from the SUBJECT'S OWN tables so
#: this list cannot fall behind the resolver it is scrubbing for.
#:
#: Both families would silently destroy a bed. A suite-root variable short-circuits the
#: ladder at step 2 and step 3 never runs — the row would measure nothing and pass. An
#: `AURORA_DIR` spelling is worse: for a copy living in a bed it DISAGREES with the
#: module's observed location, so the import raises and every row dies with a message
#: about a consistency check rather than about what it was measuring.
SCRUBBED_ENV = (
    suite_paths.SUITE_ROOT_ENV, *suite_paths.SUITE_ROOT_ENV_ALIASES,
    suite_paths.AURORA_DIR_ENV, *suite_paths.AURORA_DIR_ENV_ALIASES,
)

#: Points the linked-worktree bed at another repository, so that bed's SKIP PATH is
#: reachable on demand: aim it at a directory that is not a checkout and `git worktree
#: add` fails exactly as it would on a machine without git or on an exported tarball.
#: Not a variable the resolver owns, so reading it here is not a second reader.
REPO_OVERRIDE_ENV = "AURORA_PY_STEP3_REPO_FOR_TEST"

_ANNOUNCE = re.compile(
    r"^step 3: git rev-parse --git-common-dir from (.*) -> (.*)$")

#: Asks the resolver, in a FRESH PROCESS, from whatever directory the copy of the module
#: it is handed happens to live in. A fresh process every time because import-time state
#: (`_OWN_CHECKOUT_CLAIM`, the alias nag set) is computed once per interpreter, and
#: because the whole point is to let the copy's own file location choose the answer.
_PROBE = """
import sys
sys.path.insert(0, sys.argv[1])
import suite_paths as R
try:
    root = str(R.suite_root())
except R.SuitePathError:
    root = "None"
sys.stdout.write(root + "\\n" + R.suite_root_source() + "\\n" + str(R.AURORA_DIR))
"""


class BedUnmeasurable(AssertionError):
    """NOT a resolver failure — the BED cannot tell a right answer from a wrong one.

    Raised instead of a plain assertion because the two send a reader to opposite
    places. A failing `assertEqual` reads as "the resolver is broken"; what these checks
    detect is that the row is standing somewhere the wrong method is not wrong, which is
    fixed in the bed. And a bed that silently stopped discriminating — a git version
    changes a path shape, the temp root moves under it, a copy lands somewhere new —
    would otherwise degrade into exactly the vacuous green this file exists to close,
    arriving through this file's own fix.
    """


def _loud(message: str) -> None:
    """Print on stdout, on green runs too. A green log and an absent run are the same
    artifact, so what was measured has to be legible from the run itself."""
    sys.stdout.write(message.rstrip("\n") + "\n")
    sys.stdout.flush()


def _child_env() -> dict[str, str]:
    env = dict(os.environ)
    for name in SCRUBBED_ENV:
        env.pop(name, None)
    return env


def _probe(subject_dir: pathlib.Path, cwd: pathlib.Path | None = None) -> tuple[str, str, str]:
    """`(root, source, aurora_dir)` from a copy of the subject living in `subject_dir`."""
    out = subprocess.run(
        [sys.executable, "-c", _PROBE, str(subject_dir)],
        cwd=None if cwd is None else str(cwd),
        capture_output=True, text=True, check=True, env=_child_env())
    parts = out.stdout.split("\n")
    if len(parts) != 3:
        raise BedUnmeasurable(
            "the probe did not produce three lines, so nothing below can be trusted.\n"
            f"    stdout: {out.stdout!r}\n    stderr: {out.stderr!r}")
    return parts[0], parts[1], parts[2]


def _real_subject_answer() -> str:
    """What the resolver answers from its REAL location, ignoring every bed — measured
    by running the real module, never typed. This is the control for the sharpest
    question a bed row can be asked: *could this row pass with the resolver ignoring the
    bed?*"""
    return _probe(SUBJECT.parent)[0]


def _git(args: list[str], cwd: pathlib.Path) -> str:
    return subprocess.run(
        ["git", *args], cwd=str(cwd),
        capture_output=True, text=True, check=True).stdout.strip()


class Step3AnnounceTest(unittest.TestCase):
    """The cheapest row, and the one that names the command — kept separate so a subject
    broken enough to break every bed still reports this property red on its own."""

    def test_names_step_3_and_the_command_it_used(self) -> None:
        _root, source, _anchor = _probe(SUBJECT.parent)
        self.assertTrue(
            source.startswith("step 3: git rev-parse --git-common-dir"),
            f"the resolver answered from {source!r}; in this tree, with no suite-root "
            f"variable set, step 3 is the step that should answer")


class Step3CwdPinTest(unittest.TestCase):
    """THE PIN, AS A ROW — why every bed below COPIES the subject instead of chdir-ing.

    `_AURORA_DIR_DERIVED` is `Path(__file__).resolve().parents[2]` — the MODULE'S OWN
    FILE, not the process cwd — and `_suite_root` hands exactly that to git as `cwd`. So
    the process cwd is INERT: a bed that built a scratch repository and only changed
    directory into it would measure the real checkout, pass, and prove nothing. Every
    bed in this file rests on that claim, and it is measured here rather than asserted
    in a comment.

    The cwd used is a `mkdtemp` OUTSIDE ANY REPOSITORY: if the subject consulted the
    process cwd at all, git would find no repository there and step 3 would fall through
    to step 4, so this row would go red loudly rather than subtly.
    """

    def test_process_cwd_cannot_steer_the_derivation(self) -> None:
        elsewhere = pathlib.Path(tempfile.mkdtemp(prefix="aurora-py-step3-cwd-")).resolve()
        try:
            home = _probe(SUBJECT.parent)
            away = _probe(SUBJECT.parent, cwd=elsewhere)
            _loud(
                "step 3 with the process cwd moved outside any repository\n"
                f"    cwd for the second run = {elsewhere}\n"
                f"    from its own directory -> {home[0]}\n    {home[1]}\n"
                f"    from {elsewhere} -> {away[0]}\n    {away[1]}")
            self.assertEqual(
                away[2], home[2],
                "AURORA_DIR is the module's own location and must not move with the cwd")
            self.assertEqual(away[2], str(REPO))
            self.assertEqual(
                away[1], home[1],
                f"run with cwd={elsewhere} (outside any repository) the resolver announced "
                f"{away[1]!r}; it should be identical to the announce from its own "
                f"directory, {home[1]!r}, because step 3 passes AURORA_DIR as git's cwd "
                f"rather than inheriting the process cwd")
            self.assertIn(f"from {REPO}", away[1])
            self.assertEqual(away[0], home[0])
            self.assertNotEqual(away[0], "None")
        finally:
            # In a `finally` because this row is planted red on purpose and the FAILING
            # run is the one that leaks.
            shutil.rmtree(elsewhere, ignore_errors=True)


class Step3LinkedWorktreeTest(unittest.TestCase):
    """THE CONFIGURATION WHERE THE TWO DERIVATIONS DISAGREE, and the only one where they
    do. `--git-common-dir` answers the MAIN checkout's `.git` from inside a linked
    worktree, where `--show-toplevel` answers the worktree's own directory. In a main
    checkout the two COINCIDE, so a row asserting the difference there proves nothing.

    `--no-checkout` because the row needs git's PLUMBING — the `.git` file pointing at
    the common dir — not this repo's files; the one file it does need is COPIED IN FROM
    THE WORKING TREE rather than checked out of HEAD, so the row measures the subject as
    it is edited RIGHT NOW. A checked-out HEAD copy would go green against the committed
    subject while the working tree's was broken, which is exactly how a red-first plant
    would be laundered into a pass.
    """

    def test_answers_the_main_checkouts_parent(self) -> None:
        repo = pathlib.Path(os.environ.get(REPO_OVERRIDE_ENV) or REPO)
        scratch = pathlib.Path(tempfile.mkdtemp(prefix="aurora-py-step3-worktree-")).resolve()
        wt = scratch / "wt"
        try:
            try:
                subprocess.run(
                    ["git", "worktree", "add", "--no-checkout", "--detach", str(wt), "HEAD"],
                    cwd=str(repo), capture_output=True, text=True, check=True)
            except (OSError, subprocess.CalledProcessError) as e:
                shutil.rmtree(scratch, ignore_errors=True)
                reason = (
                    "SKIPPED, NOT PASSED: could not build a linked worktree to measure from, so "
                    "the property step 3 exists for — --git-common-dir answering where "
                    "--show-toplevel answers wrongly — was NOT measured by this run. "
                    f"`git worktree add` in {repo} failed: {e}")
                _loud(reason)
                self.skipTest(reason)

            subject = wt / "scratchpad" / "lib" / "suite_paths.py"
            subject.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SUBJECT, subject)

            toplevel = pathlib.Path(_git(["rev-parse", "--show-toplevel"], wt))
            common = pathlib.Path(
                _git(["rev-parse", "--path-format=absolute", "--git-common-dir"], wt))
            via_common = common.parent.parent
            main_checkout = common.parent
            wrong_root = toplevel.parent

            pair = (f"    WRONG derivation  parent(--show-toplevel)               = {wrong_root}\n"
                    f"    RIGHT derivation  parent(parent(--git-common-dir))      = {via_common}")

            def unmeasurable(why: str) -> None:
                raise BedUnmeasurable(
                    "UNMEASURABLE — this bed cannot discriminate, so it proves NOTHING about "
                    f"step 3. FIX THE BED, NOT THE RESOLVER.\n{pair}\n    reason: {why}")

            # (1) It must be a LINKED worktree. If it is not, the two derivations agree,
            # the "wrong" branch is never exercised, and the row goes green having
            # re-measured the main-checkout case under a worktree's name.
            if wrong_root == via_common:
                unmeasurable(
                    f"the worktree at {wt} is not behaving as a linked worktree — the two "
                    "derivations AGREE here, which is the main-checkout case wearing a "
                    "worktree's name")

            # (2) RUNNING FROM A LINKED WORKTREE IS NECESSARY, NOT SUFFICIENT. A worktree
            # sitting BESIDE the suite root lets the wrong derivation land on the right
            # peer by accident. The bed takes the contract's second arm and PROVES it
            # rather than enjoying it by luck of the temp path: the scratch dir is a
            # fresh mkdtemp holding only `wt`, so the checkout that exists under the
            # right root is absent under the wrong one. The name comes from
            # --git-common-dir, never typed.
            if not main_checkout.is_dir():
                unmeasurable(
                    f"the main checkout {main_checkout} named by --git-common-dir does not exist")
            if (wrong_root / main_checkout.name).exists():
                unmeasurable(
                    f"the WRONG derivation would still find {main_checkout.name} beside it, at "
                    f"{wrong_root / main_checkout.name} — so a resolver using --show-toplevel "
                    "could land on the right peer by accident and this row could not tell")

            # (3) PROVE WE WERE ACTUALLY STANDING IN IT. The step-source is recomputed per
            # call, arrives on stdout, and embeds the cwd git was handed, so it is the one
            # artifact that separates "measured in the bed" from "measured elsewhere and
            # right by accident". A bed whose announce names the real checkout has
            # measured nothing, so this is a bed refusal too.
            derived, source, anchor = _probe(subject.parent)
            m = _ANNOUNCE.match(source)
            if m is None:
                unmeasurable(
                    f"the resolver did not announce a step-3 derivation; it said {source!r}")
            if m.group(1) != str(wt):
                unmeasurable(
                    f"the resolver announced {source!r} — it derived from {m.group(1)}, not from "
                    f"the linked worktree {wt} this row built, so the measurement is of that "
                    "tree instead. The bed must EXECUTE THE WORKTREE'S OWN COPY of the module")
            if m.group(2) != str(common):
                unmeasurable(
                    f"the resolver saw --git-common-dir = {m.group(2)}, this row saw {common}")

            _loud(
                f"step 3 measured from a LINKED worktree, built by this row at {wt}\n{pair}\n"
                f"    resolver answered -> {derived}\n    {source}\n"
                f"    subject's own AURORA_DIR = {anchor}")

            # ONLY NOW is a failure the RESOLVER's fault.
            self.assertEqual(
                derived, str(via_common),
                f"the resolver, run from the linked worktree {wt}, answered {derived}. It "
                f"should be the MAIN checkout's parent (via --git-common-dir), not the "
                f"worktree's (via --show-toplevel):\n{pair}")
            self.assertNotEqual(derived, str(wrong_root))
        finally:
            try:
                subprocess.run(
                    ["git", "worktree", "remove", "--force", str(wt)],
                    cwd=str(repo), capture_output=True, text=True, check=False)
            except OSError:
                pass
            shutil.rmtree(scratch, ignore_errors=True)
            try:
                subprocess.run(
                    ["git", "worktree", "prune"], cwd=str(repo),
                    capture_output=True, text=True, check=False)
            except OSError:
                pass


class MainCheckoutBed:
    """A main checkout whose `.git` is a real one, with the subject `nest` levels below.

    `nest` is what selects the git output shape: `[]` puts the subject's anchor AT the
    repository root (`.git`) and two segments put it two levels down (`../../.git`), the
    shape a resolver anchored in a package or crate subdirectory sees. No commit is made
    — `--git-common-dir` answers in an empty repository, and a commit would need a
    configured identity.

    `resolve()` on the mkdtemp result because the subject reports the path Python
    resolved its module through; where the temp root is a symlink an unresolved path
    would make the announce comparison refuse a bed that is actually fine.
    """

    def __init__(self, nest: list[str]) -> None:
        self.scratch = pathlib.Path(
            tempfile.mkdtemp(prefix="aurora-py-step3-main-")).resolve()
        self.suite = self.scratch / "suite"
        self.repo = self.suite / "aurora"
        self.anchor = self.repo.joinpath(*nest)
        self.subject = self.anchor / "scratchpad" / "lib" / "suite_paths.py"
        self.subject.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "init", "-q", str(self.repo)],
            capture_output=True, text=True, check=True)
        shutil.copyfile(SUBJECT, self.subject)

    def remove(self) -> None:
        shutil.rmtree(self.scratch, ignore_errors=True)


class Step3MainCheckoutTest(unittest.TestCase):
    """THE MAIN-CHECKOUT TWIN, AND WHY IT IS A SEPARATE BED.

    The linked-worktree row is necessary and it is also a DISJOINT POPULATION from where
    production runs. Only the worktree shape is absolute for free; a resolver that
    consumes the other two as if they were absolute is WRONG IN THE MAIN CHECKOUT ONLY,
    and green on every branch sweep, because agents run in worktrees.

    WHY THE BED IS A SCRATCH `git init` AND NOT THIS REPOSITORY. "The real main
    checkout" is the shape to cover; using the real tree as the BED is not the way to
    cover it. It cannot be reached from here at all when the suite runs in a worktree —
    and, fatally, its expected suite root is THE ANSWER A RESOLVER THAT IGNORED THE BED
    ENTIRELY WOULD GIVE, so the row would pass while proving nothing. The bed is
    therefore a repository this row creates, at a path no other run has, with the
    subject COPIED INTO IT; the expected suite root is a mkdtemp path only this bed can
    produce. The real checkout is covered by its own row below, which says in its own
    header which property it cannot reach.
    """

    def _prove(self, bed: MainCheckoutBed, expected_raw: str, label: str) -> None:
        # What git says when it is NOT asked for a format — the shape a resolver that
        # dropped `--path-format=absolute` would be handed…
        raw = _git(["rev-parse", "--git-common-dir"], bed.anchor)
        # …and when it is. This is the operand the subject's derivation runs on.
        common = _git(["rev-parse", "--path-format=absolute", "--git-common-dir"], bed.anchor)

        # THE EXPECTATION, DERIVED FROM THE BED. `_suite_root` computes the suite root as
        # `Path(common).parent.parent` — a purely LEXICAL operation on whatever string
        # git returned, with no resolve() and no join against AURORA_DIR anywhere. So the
        # same two `.parent`s over git's DEFAULT output is exactly what a flag-less
        # resolver would answer, and both are computed here rather than typed.
        expected = pathlib.Path(common).parent.parent
        without_the_flag = pathlib.Path(raw).parent.parent
        ignoring_the_bed = _real_subject_answer()

        facts = (
            f"    bed anchor, which is git's cwd and the subject's AURORA_DIR = {bed.anchor}\n"
            f"    git rev-parse --git-common-dir                              = {raw!r}\n"
            f"    ...--path-format=absolute --git-common-dir                  = {common}\n"
            f"    RIGHT derivation parent(parent(absolute))                   = {expected}\n"
            f"    same derivation on git's DEFAULT output                     = {str(without_the_flag)!r}\n"
            f"    what the resolver answers from the REAL tree, ignoring this bed = {ignoring_the_bed}")

        def unmeasurable(why: str) -> None:
            raise BedUnmeasurable(
                "UNMEASURABLE — this bed cannot discriminate, so it proves NOTHING about step 3 "
                f"from {label}. FIX THE BED, NOT THE RESOLVER.\n{facts}\n    reason: {why}")

        # (1) IT MUST BE A MAIN CHECKOUT. From a linked worktree git answers
        # --git-common-dir absolutely whether or not it is asked to, so an absolute
        # default answer means this bed is the WORKTREE case wearing a main checkout's
        # name — already covered, and blind to precisely the defect this row exists for.
        if pathlib.Path(raw).is_absolute():
            unmeasurable(
                f"git answers {raw!r} — already absolute — at {bed.anchor}, so this bed is not a "
                "main checkout and re-measures the linked-worktree case")

        # (2) …AND THE ONE WHOSE SHAPE THIS ROW NAMES. The two rows differ only in where
        # the subject sits, and that difference is the whole point of there being two, so
        # a bed that produced the other shape would silently make them one row run twice.
        if raw != expected_raw:
            unmeasurable(
                f"{label} should make git answer {expected_raw!r}; it answered {raw!r}, so this "
                "bed is not the configuration this row names")

        # (3) THE FLAG MUST MATTER HERE. If both derivations agreed, the row would go
        # green against a resolver that never asked git for an absolute answer.
        if without_the_flag == expected:
            unmeasurable(
                "the derivation gives the same answer with and without --path-format=absolute "
                "at this bed, so a resolver that never asked for an absolute path would pass")

        # (4) THE EXPECTATION MUST BE UNREACHABLE WITHOUT THE BED. The sharpest form of
        # the question: if the bed's suite root happened to be what the real tree
        # derives, a resolver that ignored the bed would satisfy the assertion below.
        if str(expected) == ignoring_the_bed:
            unmeasurable(
                f"the suite root this bed implies ({expected}) is the same one the resolver "
                "derives from the real tree, so a resolver that ignored this bed would pass "
                "the assertion below")

        # (5) PROVE THE RESOLVER ACTUALLY STOOD HERE.
        derived, source, anchor = _probe(bed.subject.parent)
        m = _ANNOUNCE.match(source)
        if m is None:
            unmeasurable(f"the resolver did not announce a step-3 derivation; it said {source!r}")
        if m.group(1) != str(bed.anchor):
            unmeasurable(
                f"the resolver announced {source!r} — it derived from {m.group(1)}, not from the "
                f"main checkout {bed.anchor} this row built, so it measured that tree instead")

        _loud(
            f"step 3 measured from {label}, built by this row at {bed.repo}\n{facts}\n"
            f"    resolver answered -> {derived}\n    {source}\n"
            f"    subject's own AURORA_DIR = {anchor}")

        # ONLY NOW is a failure the RESOLVER's fault.
        self.assertEqual(
            derived, str(expected),
            f"the resolver, run from {label} at {bed.anchor}, answered {derived}. It should be "
            f"the directory holding that checkout, derived from --git-common-dir:\n{facts}")
        # The two named ways to be wrong, asserted rather than implied by the line above,
        # so a failure says WHICH failure it is.
        self.assertNotEqual(
            derived, str(without_the_flag),
            "this is the answer a resolver that consumed git's default (relative) output "
            "would give")
        self.assertNotEqual(
            derived, ignoring_the_bed,
            "this is the answer a resolver that ignored the bed and measured the real tree "
            "would give")

    def _bed_or_skip(self, nest: list[str], what: str) -> MainCheckoutBed:
        try:
            return MainCheckoutBed(nest)
        except (OSError, subprocess.CalledProcessError) as e:
            reason = (
                "SKIPPED, NOT PASSED: could not build a scratch main checkout to measure from, "
                f"so {what} was NOT measured by this run. `git init` failed: {e}")
            _loud(reason)
            self.skipTest(reason)
            raise  # unreachable; keeps the return type honest

    def test_derives_the_suite_root_from_a_main_checkout_root(self) -> None:
        bed = self._bed_or_skip(
            [], "the configuration production actually runs in — a main-checkout root, where "
                "`git rev-parse --git-common-dir` answers the relative `.git`")
        try:
            self._prove(bed, ".git", "a main-checkout ROOT")
        finally:
            bed.remove()

    def test_derives_it_from_a_main_checkout_subdirectory(self) -> None:
        # Two levels down: the shape a resolver anchored in a package or crate
        # subdirectory is handed, and the one a lexical trim of git's answer walks up
        # past. This module's own anchor is two levels above itself, i.e. the checkout
        # root, so this is not this repo's production shape — it is the shape the
        # derivation must survive if the module ever moves.
        bed = self._bed_or_skip(
            ["packages", "editor"],
            "the third git output shape — `../../.git`, relative WITH `..`, from a "
            "subdirectory of a main checkout")
        try:
            self._prove(bed, "../../.git", "a main-checkout SUBDIRECTORY two levels down")
        finally:
            bed.remove()


class Step3RealCheckoutTest(unittest.TestCase):
    """AND THE CHECKOUT THIS CODE IS ACTUALLY CHECKED OUT AS.

    The rows above prove the derivation in a repository they BUILT. This one proves it
    where the module actually lives, and the difference is why both are wanted: a
    derivation verified where it could be constructed says nothing about where it runs.

    ⚠ THIS ROW DOES NOT DISCRIMINATE A BED-IGNORING RESOLVER, AND SAYING SO IS PART OF
    ITS JOB. Its expectation is the real tree's own suite root, which is exactly the
    answer a resolver that ignored every bed would give — so unlike the rows above it
    cannot tell "measured here" from "measured elsewhere and right by luck". That is not
    a defect to fix here and not a reason to delete the row; it is a NARROWER row on an
    axis the constructed beds cannot reach:

        bed-ignoring resolver  -> caught by the constructed rows above, whose expectation
                                  is a mkdtemp path no other run has
        the FLAG defect        -> caught HERE as well, and here it is the PRODUCTION
                                  path: from a main-checkout root without
                                  --path-format=absolute the derivation yields `.`

    WHY IT MAY SKIP, AND WHY THAT IS NOT A PASS. Agent sessions run in a linked
    worktree, where this configuration does not exist to be measured — the disjoint
    population this file is about, arriving one level up. There is nothing to assert
    there, so it says so in the run's own output and contributes zero.

    THE DETECTOR IS THE SAME ONE THE BED REFUSALS USE — a RELATIVE answer from `git
    rev-parse --git-common-dir` means a main checkout, an absolute one means a linked
    worktree — deliberately, so there are not two ways of asking the same question that
    could drift apart.
    """

    def test_and_this_checkout_when_it_is_a_main_one(self) -> None:
        anchor = pathlib.Path(_probe(SUBJECT.parent)[2])
        try:
            raw = _git(["rev-parse", "--git-common-dir"], anchor)
        except (OSError, subprocess.CalledProcessError) as e:
            reason = (
                "SKIPPED, NOT PASSED: this checkout is not a git repository at all, so step 3 "
                "could not be measured in the configuration production runs in. `git rev-parse` "
                f"in {anchor} failed: {e}")
            _loud(reason)
            self.skipTest(reason)
            return

        if pathlib.Path(raw).is_absolute():
            reason = (
                "SKIPPED, NOT PASSED: step 3 was NOT measured in this repo's real MAIN CHECKOUT "
                f"by this run — the production configuration. This run is standing in a LINKED "
                f"WORKTREE ({anchor}), where `git rev-parse --git-common-dir` answers the "
                f"absolute {raw} whether it is asked to or not, so the relative output shape "
                "production consumes does not exist here to be measured. The main-checkout rows "
                "above measured that shape on a repository they built; this row is the one that "
                "would have measured it where the code actually lives, and it measured nothing. "
                "Run the suite from the main checkout to close this.")
            _loud(reason)
            self.skipTest(reason)
            return

        common = _git(["rev-parse", "--path-format=absolute", "--git-common-dir"], anchor)
        expected = pathlib.Path(common).parent.parent
        without_the_flag = pathlib.Path(raw).parent.parent
        derived, source, _ = _probe(SUBJECT.parent)

        _loud(
            "step 3 measured in THIS repo's REAL MAIN CHECKOUT — the production configuration\n"
            f"    anchor, which is git's cwd and the subject's AURORA_DIR = {anchor}\n"
            f"    git rev-parse --git-common-dir                          = {raw!r}\n"
            f"    ...--path-format=absolute --git-common-dir              = {common}\n"
            f"    RIGHT derivation parent(parent(absolute))               = {expected}\n"
            f"    same derivation on git's DEFAULT output                 = {str(without_the_flag)!r}\n"
            f"    resolver answered -> {derived}\n    {source}\n"
            "    (this row does NOT discriminate a bed-ignoring resolver — see its header)")

        self.assertEqual(
            derived, str(expected),
            f"run in this repo's own main checkout at {anchor}, the resolver answered "
            f"{derived}; the directory holding this checkout, derived from --git-common-dir, "
            f"is {expected}")
        self.assertNotEqual(
            derived, str(without_the_flag),
            "this is the answer a resolver consuming git's default (relative) output would "
            "give HERE, in the configuration production runs in")
        self.assertIn(f"from {anchor}", source)


#: Reads the JavaScript twin's own tables out of the JavaScript twin, in node. Written
#: to a temp file rather than passed with `-e` so the argument handling is the ordinary
#: one and cannot be mistaken for a different argv shape.
_JS_DUMP = """
import { pathToFileURL } from 'node:url';
const R = await import(pathToFileURL(process.argv[2]).href);
const peers = R.SUITE_PEERS;
process.stdout.write(JSON.stringify({
  peers,
  suiteRoot: [R.SUITE_ROOT_ENV, ...R.SUITE_ROOT_ENV_ALIASES],
  auroraDir: [R.AURORA_DIR_ENV, ...R.AURORA_DIR_ENV_ALIASES],
  checkout: Object.fromEntries(
    [...peers, ...process.argv.slice(3)]
      .map((n) => [n, [R.checkoutEnv(n), ...R.checkoutEnvAliases(n)]])),
}));
"""


class CrossTwinAliasTest(unittest.TestCase):
    """THE TWO TWINS MUST ACCEPT THE SAME ENVIRONMENT VARIABLES, AND THIS IS THE ROW
    THAT NOTICES WHEN THEY STOP.

    Aurora resolves peer checkouts through two implementations — `sibling-root.mjs` for
    the JavaScript instruments, `suite_paths.py` for the Python ones. They are separate
    files on purpose (the Python half cannot import the JavaScript one, and importing a
    peer's tree to find out where peers live is the circularity the whole contract
    removes), which means their environment-variable tables are two copies of one fact.

    They had already drifted: the JavaScript twin accepted `AEON_ROOT` as a transitional
    alias and the Python one did not, so an operator who exported that variable got a
    JavaScript instrument that resolved and a Python instrument that refused — the same
    machine, the same environment, two answers. Making the two lists match by hand fixes
    today and nothing else; this row is the deliverable, because it fails the next time
    either side gains, loses or reorders an alias.

    ORDER IS COMPARED, NOT JUST MEMBERSHIP. Both resolvers take the FIRST spelling that
    answers, so a reordered list is a different precedence, which is a different
    resolver.

    THE DOMAIN COMES FROM THE JAVASCRIPT SIDE, deliberately: `SUITE_PEERS` is the roster
    and only that twin carries one (the Python half derives each name on demand and
    needs no list). A peer added there is therefore automatically compared here. A name
    that is NOT a peer is included too, so the generic branch of both `checkoutEnv`
    implementations is compared rather than only the special-cased ones.
    """

    #: Not a peer, and not intended to become one — it exercises the generic branch,
    #: including the non-alphanumeric squashing both twins do.
    NON_PEER = "no-such-peer"

    def test_the_two_twins_accept_the_same_variables(self) -> None:
        if not JS_TWIN.is_file():
            reason = (
                "SKIPPED, NOT PASSED: the JavaScript twin was not found at "
                f"{JS_TWIN}, so the two resolvers' environment-variable tables were NOT "
                "compared by this run and a divergence between them would go unnoticed.")
            _loud(reason)
            self.skipTest(reason)
            return

        scratch = pathlib.Path(tempfile.mkdtemp(prefix="aurora-py-crosstwin-")).resolve()
        try:
            script = scratch / "dump.mjs"
            script.write_text(_JS_DUMP, encoding="utf8")
            try:
                out = subprocess.run(
                    ["node", str(script), str(JS_TWIN), self.NON_PEER],
                    capture_output=True, text=True, check=True, env=_child_env())
            except (OSError, subprocess.CalledProcessError) as e:
                stderr = getattr(e, "stderr", "")
                reason = (
                    "SKIPPED, NOT PASSED: could not read the JavaScript twin's tables, so the "
                    "two resolvers' environment-variable lists were NOT compared by this run. "
                    f"`node` on {JS_TWIN} failed: {e}\n{stderr}")
                _loud(reason)
                self.skipTest(reason)
                return
            js = json.loads(out.stdout)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)

        # The JS side is asked for every peer in ITS OWN roster plus the non-peer above;
        # `checkout` therefore covers both branches of both implementations.
        names = list(js["peers"]) + [self.NON_PEER]
        if not js["peers"]:
            raise BedUnmeasurable(
                "UNMEASURABLE — the JavaScript twin reported an EMPTY peer roster, so this row "
                "would compare the generic branch alone and report a clean tree while every "
                "per-peer alias list went unexamined. FIX THE BED, NOT THE RESOLVER.")
        missing = [n for n in names if n not in js["checkout"]]
        if missing:
            raise BedUnmeasurable(
                "UNMEASURABLE — the JavaScript twin returned no alias list for "
                f"{missing}, so those names went uncompared. FIX THE BED, NOT THE RESOLVER.")

        py = {
            "suiteRoot": [suite_paths.SUITE_ROOT_ENV, *suite_paths.SUITE_ROOT_ENV_ALIASES],
            "auroraDir": [suite_paths.AURORA_DIR_ENV, *suite_paths.AURORA_DIR_ENV_ALIASES],
            "checkout": {
                n: [suite_paths.checkout_env(n), *suite_paths.checkout_env_aliases(n)]
                for n in names
            },
        }

        lines = [f"    suite root  js={js['suiteRoot']}\n                py={py['suiteRoot']}",
                 f"    own checkout js={js['auroraDir']}\n                 py={py['auroraDir']}"]
        for n in names:
            lines.append(f"    {n}: js={js['checkout'][n]}\n{' ' * (6 + len(n))}py={py['checkout'][n]}")
        _loud(
            "the two resolvers' environment-variable tables, read live from both twins\n"
            f"    javascript twin = {JS_TWIN}\n    python twin     = {SUBJECT}\n"
            + "\n".join(lines))

        self.assertEqual(
            py["suiteRoot"], js["suiteRoot"],
            "the two twins accept different suite-root spellings, in this order, so the same "
            "environment resolves for one kind of instrument and refuses for the other")
        self.assertEqual(
            py["auroraDir"], js["auroraDir"],
            "the two twins accept different spellings for aurora's own checkout")
        for n in names:
            self.assertEqual(
                py["checkout"][n], js["checkout"][n],
                f"the two twins accept different checkout variables for {n!r}, in this order. "
                "Whichever is right, they must agree: an operator exporting one of these gets "
                "a resolving JavaScript instrument and a refusing Python one otherwise")


if __name__ == "__main__":
    unittest.main(verbosity=2)
