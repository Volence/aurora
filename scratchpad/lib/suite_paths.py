"""Where the OTHER Empyrean repos live, for the Python instruments in scratchpad/.

THE SAME FOUR STEPS AS EVERY OTHER RESOLVER IN THE SUITE (empyrean
`contract/SUITE_PATHS.md` at origin/main 82982b7ff3c057f347d538fcf61b7c62b18ee813,
ruled 2026-09-02):

  1. the explicit checkout variable — `AEON_DIR`, `S1DISASM_DIR`, `ORACLE_DIR`, …;
  2. `EMPYREAN_SUITE_ROOT` joined with the repo's directory name;
  3. derivation from this checkout's own location, `git rev-parse --git-common-dir`
     (never `--show-toplevel`, which answers with the worktree);
  4. refuse, naming what was looked for and where.

THOSE FOUR STEPS ARE FOR NAMING ANOTHER TOOL'S CHECKOUT. THIS repo's own
checkout is not on that ladder: it is OBSERVED from this module's file location,
its step-source is `own`, and `AURORA_DIR` — if set — is a consistency check that
raises on disagreement rather than an override (the hub's 2026-09-02 ruling, "A
resolver's OWN checkout is observed, not resolved", @ fba68d5). See
`_check_own_checkout_claim` below.

`AURORA_BUILT_TREE`, the OTHER question — which BUILT tree a run executes
against, a directory of artifacts rather than a checkout — is deliberately not
here: no Python instrument in this tree runs an app, so it lives only in the
JavaScript resolver (`test/support/sibling-root.mjs`). The first Python
instrument that needs it adds it there-and-here; it must not be spelled
`AURORA_DIR`.

`AURORA_<NAME>_REPO`, `AURORA_PEER_ROOT`, `LIVE_AEON`, `AEON_ROOT`, `S1_DIR`,
`AURORA_ROOT` and `AURORA_REPO` are accepted as transitional aliases and
announced once on stderr, naming the spelling to switch to. That roster is held
IDENTICAL to the JavaScript twin's by a row in
`scratchpad/lib/test_suite_paths.py`, which reads both tables live and fails when
either side gains, loses or reorders a spelling — the two files are two copies of
one fact, and they had already drifted over `AEON_ROOT` before that row existed. A variable that is SET BUT NAMES SOMETHING ABSENT is a hard error at
the step that read it, not a null that lets the next step run — the contract's
rule, and the reason a typo in `AEON_DIR` stops a run instead of quietly
becoming a reading of the owner's live tree.

WHY THIS IS A MODULE AND NOT FIVE COPIES. Five instruments here spelled the
same home path. Five in-file resolvers would be five things to drift, and the
JavaScript half of this repo learned that lesson expensively: the gate that
FORBIDS hand-typed peer paths carried its own copy of the derivation, which
silently ignored the one environment variable the rest of the tree honoured
(`test/support/sibling-root.mjs`, "WHAT THE SECOND COPY COST"). This module is
the Python-side equivalent of that file. It is deliberately NOT an import of
aeon's `tools/suite_paths.py`: reading a peer's working tree to find out where
peers live is the circularity this whole contract exists to remove.

Import it with a two-line bootstrap that names no path but its own::

    import pathlib, sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))   # scratchpad/x.py
    from suite_paths import sibling_path

(from `scratchpad/<sub>/x.py` the second line is `.parent.parent / "lib"`.) The
bootstrap names no path but its OWN location, which is the property that makes it
worktree-safe.
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import sys

__all__ = [
    "SuitePathError", "SUITE_ROOT_ENV", "SUITE_ROOT_ENV_ALIASES",
    "AURORA_DIR", "AURORA_DIR_ENV", "AURORA_DIR_ENV_ALIASES", "aurora_dir_source",
    "checkout_env", "checkout_env_aliases",
    "suite_root", "suite_root_source", "sibling_path", "sibling_path_source",
    "sibling_default_path", "checkout_override",
]


class SuitePathError(RuntimeError):
    """Every refusal from this module. Never a None that lets the next step run."""


#: The suite-root variable. THIS is the name; the rest are aliases.
SUITE_ROOT_ENV = "EMPYREAN_SUITE_ROOT"

#: Transitional aliases for the suite root, accepted and announced.
SUITE_ROOT_ENV_ALIASES = ("AURORA_PEER_ROOT",)

#: Where this module's own file sits — `<aurora>/scratchpad/lib/suite_paths.py`,
#: so parents[2]. In a linked worktree this is the WORKTREE, which is what an
#: instrument measuring "this tree" wants. The RAW observation; `AURORA_DIR`
#: below is the answer, and there must be exactly one of those.
_AURORA_DIR_DERIVED = pathlib.Path(__file__).resolve().parents[2]

#: The canonical variable naming THIS repo's checkout. THIS is the name.
AURORA_DIR_ENV = "AURORA_DIR"

#: Transitional aliases for it, accepted and announced. ``AURORA_ROOT`` is the
#: spelling 64 JS instruments read before O69; ``AURORA_REPO`` is a third one
#: two of them grew for the same fact.
AURORA_DIR_ENV_ALIASES = ("AURORA_ROOT", "AURORA_REPO")

_ANNOUNCED: set[str] = set()


def checkout_env(name: str) -> str:
    """`aeon` -> `AEON_DIR`."""
    return "".join(c if c.isalnum() else "_" for c in name.upper()) + "_DIR"


def checkout_env_aliases(name: str) -> tuple[str, ...]:
    """Transitional aliases for one peer's checkout variable.

    THIS LIST AND `checkoutEnvAliases` IN `test/support/sibling-root.mjs` ARE TWO COPIES
    OF ONE FACT, and they drifted: `AEON_ROOT` was accepted there and not here, so an
    operator who exported it got a JavaScript instrument that resolved and a Python one
    that refused — the same machine, the same environment, two answers. Both twins
    accept it now. Order is part of the contract, not decoration: the first spelling
    that answers wins, so a reordering is a different precedence.

    `scratchpad/lib/test_suite_paths.py` compares the two tables live, over the
    JavaScript twin's own peer roster plus a non-peer name, and fails when either side
    gains, loses or reorders an alias. Change one twin without the other and that row
    goes red; that is the point of it, and it is why the lists are not merely made to
    match by hand.
    """
    extra = {"aeon": ("LIVE_AEON", "AEON_ROOT"), "s1disasm": ("S1_DIR",)}.get(name, ())
    upper = "".join(c if c.isalnum() else "_" for c in name.upper())
    return (f"AURORA_{upper}_REPO",) + extra


def _announce(alias: str, canonical: str) -> None:
    if alias in _ANNOUNCED:
        return
    _ANNOUNCED.add(alias)
    sys.stderr.write(
        f"suite-paths: {alias} is a transitional alias — set {canonical} instead "
        "(empyrean contract/SUITE_PATHS.md)\n")


def _pick(canonical: str, aliases) -> tuple[str, str] | None:
    """`(variable, value)` for the spelling that answers, or None.

    Two spellings set to DIFFERENT directories is refused naming both: one
    question with two answers is a wrong environment, not a preference.
    """
    found = [(n, os.environ[n]) for n in (canonical, *aliases) if os.environ.get(n)]
    if not found:
        return None
    first_name, first_value = found[0]
    first = pathlib.Path(first_value).expanduser().resolve()
    for name, value in found[1:]:
        if pathlib.Path(value).expanduser().resolve() != first:
            raise SuitePathError(
                f"{first_name}={first_value} and {name}={value} DISAGREE — this names one "
                f"directory, so two different answers is a wrong environment. Unset {name} "
                f"(a transitional alias) and set only {canonical}.")
    return first_name, first_value


def _require_dir(name: str, value: str, step: int, what: str) -> pathlib.Path:
    p = pathlib.Path(value).expanduser()
    if not p.is_dir():
        raise SuitePathError(
            f"{name}={value} is not a directory — {what}. Precedence step {step} refuses rather "
            "than falling through: a variable that is set but wrong is evidence of a wrong "
            "environment, and the next step would hide it. To reproduce a machine WITHOUT the "
            f"reference trees, point {name} at an EMPTY directory ($(mktemp -d)), not an absent "
            "one. (empyrean contract/SUITE_PATHS.md @ 82982b7f)")
    return p.resolve()


def _check_own_checkout_claim() -> tuple[str, str] | None:
    """`AURORA_DIR`, IF SET, IS A CONSISTENCY CHECK — never an override.

    The four steps at the top of this file are for naming ANOTHER tool's
    checkout, which is what the contract's title says. For THIS repo the module's
    file location is a direct observation and steps 1 and 2 are guesses about a
    fact already in hand (empyrean `contract/SUITE_PATHS.md` @ fba68d5, "A
    resolver's OWN checkout is observed, not resolved", ruled from aurora's own
    O69 question). So set-and-agreeing is fine and set-but-wrong raises, for the
    same reason a wrong `AEON_DIR` raises: it is evidence of a wrong environment,
    and the alternative is relocating the repo under test in silence.

    Symlinks are followed for the COMPARISON only — `/tmp` and
    `.claude/worktrees/` are reached through them on some machines, and an
    operator who exports the realpath has agreed.
    """
    pick = _pick(AURORA_DIR_ENV, AURORA_DIR_ENV_ALIASES)
    if pick is None:
        return None
    name, value = pick
    if name != AURORA_DIR_ENV:
        _announce(name, AURORA_DIR_ENV)
    claimed = pathlib.Path(value).expanduser()
    if claimed != _AURORA_DIR_DERIVED and claimed.resolve() != _AURORA_DIR_DERIVED.resolve():
        raise SuitePathError(
            f"{name}={value} does not agree with where this module actually is. "
            f"{AURORA_DIR_ENV} is a CONSISTENCY CHECK on aurora's own checkout, NOT an override: "
            f"the own checkout is observed from {pathlib.Path(__file__).resolve()}, which makes it "
            f"{_AURORA_DIR_DERIVED}. Setting it to something else cannot move this repo; it can "
            "only relocate the repo under test silently, so it is refused. That row in the "
            "contract's variable table exists so OTHER tools can name aurora. "
            "(empyrean contract/SUITE_PATHS.md @ fba68d5)")
    return name, value


_OWN_CHECKOUT_CLAIM = _check_own_checkout_claim()

#: This repository's own root — OBSERVED from this module's file location, never
#: from the environment and never from the cwd.
AURORA_DIR = _AURORA_DIR_DERIVED


def aurora_dir_source() -> str:
    """Which step produced `AURORA_DIR` — `own`, always — to print before work."""
    checked = "" if _OWN_CHECKOUT_CLAIM is None else (
        f" ({_OWN_CHECKOUT_CLAIM[0]}={_OWN_CHECKOUT_CLAIM[1]} agrees — a consistency check, "
        "not an override)")
    return (f"own: this module's own location ({pathlib.Path(__file__).resolve()}) "
            f"-> {AURORA_DIR}{checked}")


def _suite_root() -> tuple[pathlib.Path | None, str]:
    pick = _pick(SUITE_ROOT_ENV, SUITE_ROOT_ENV_ALIASES)
    if pick is not None:
        name, value = pick
        root = _require_dir(name, value, 2, "it is meant to hold the suite checkouts")
        if name != SUITE_ROOT_ENV:
            _announce(name, SUITE_ROOT_ENV)
            return root, f"step 2: {name}={value} (transitional alias; the name is {SUITE_ROOT_ENV})"
        return root, f"step 2: {name}={value}"
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=str(AURORA_DIR), capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        common = ""
    if common:
        return (pathlib.Path(common).parent.parent,
                f"step 3: git rev-parse --git-common-dir from {AURORA_DIR} -> {common}")
    return None, (
        f"step 4: REFUSED — {SUITE_ROOT_ENV} is unset (aliases: "
        f"{', '.join(SUITE_ROOT_ENV_ALIASES)}) and `git rev-parse --git-common-dir` in "
        f"{AURORA_DIR} produced nothing")


def suite_root() -> pathlib.Path:
    """The directory holding aurora and its peers. Raises rather than guessing."""
    root, source = _suite_root()
    if root is None:
        raise SuitePathError(f"cannot resolve the suite root. {source}. Set {SUITE_ROOT_ENV}.")
    return root


def suite_root_source() -> str:
    """Which step produced `suite_root()`, to print before doing work against it."""
    return _suite_root()[1]


def _sibling(name: str, allow_checkout_env: bool = True) -> tuple[pathlib.Path, str]:
    if allow_checkout_env:
        canonical = checkout_env(name)
        pick = _pick(canonical, checkout_env_aliases(name))
        if pick is not None:
            var, value = pick
            p = _require_dir(var, value, 1, f"it is meant to be the {name} checkout")
            if var != canonical:
                _announce(var, canonical)
                return p, f"step 1: {var}={value} (transitional alias; the name is {canonical})"
            return p, f"step 1: {var}={value}"
    root, source = _suite_root()
    if root is None:
        raise SuitePathError(
            f"cannot resolve the {name} checkout: looked for {checkout_env(name)} (aliases: "
            f"{', '.join(checkout_env_aliases(name))}), then {SUITE_ROOT_ENV} (aliases: "
            f"{', '.join(SUITE_ROOT_ENV_ALIASES)}), then a derivation from {AURORA_DIR}. "
            f"{source}. Set {checkout_env(name)} or {SUITE_ROOT_ENV}.")
    return root / name, source


def sibling_path(name: str, *rel: str) -> pathlib.Path:
    """The path a peer checkout WOULD have. Does NOT check that it exists."""
    p, _ = _sibling(name)
    return p.joinpath(*rel) if rel else p


def sibling_path_source(name: str) -> str:
    """Which precedence step answered for this peer."""
    return _sibling(name)[1]


def sibling_default_path(name: str, *rel: str) -> pathlib.Path:
    """Where a peer lives IGNORING its own `<NAME>_DIR` — for a guard that must
    refuse to touch the live tree, which cannot compare against a value that IS
    the override it is checking."""
    p, _ = _sibling(name, allow_checkout_env=False)
    return p.joinpath(*rel) if rel else p


def checkout_override(name: str) -> tuple[str, pathlib.Path] | None:
    """`(variable, path)` when an explicit checkout variable is set, else None."""
    canonical = checkout_env(name)
    pick = _pick(canonical, checkout_env_aliases(name))
    if pick is None:
        return None
    var, value = pick
    p = _require_dir(var, value, 1, f"it is meant to be the {name} checkout")
    if var != canonical:
        _announce(var, canonical)
    return var, p


if __name__ == "__main__":   # "where does this think the suite is?"
    print(f"aurora {AURORA_DIR}")
    print(f"from   {aurora_dir_source()}")
    root, source = _suite_root()
    print(f"suite  {root if root else '(unresolved)'}")
    print(f"from   {source}")
