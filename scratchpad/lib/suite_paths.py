"""Where the OTHER Empyrean repos live, for the Python instruments in scratchpad/.

THE SAME FOUR STEPS AS EVERY OTHER RESOLVER IN THE SUITE (empyrean
`contract/SUITE_PATHS.md` at origin/main 82982b7ff3c057f347d538fcf61b7c62b18ee813,
ruled 2026-09-02):

  1. the explicit checkout variable — `AEON_DIR`, `S1DISASM_DIR`, `ORACLE_DIR`, …;
  2. `EMPYREAN_SUITE_ROOT` joined with the repo's directory name;
  3. derivation from this checkout's own location, `git rev-parse --git-common-dir`
     (never `--show-toplevel`, which answers with the worktree);
  4. refuse, naming what was looked for and where.

`AURORA_<NAME>_REPO`, `AURORA_PEER_ROOT` and `LIVE_AEON` are accepted as
transitional aliases and announced once on stderr, naming the spelling to
switch to. A variable that is SET BUT NAMES SOMETHING ABSENT is a hard error at
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
    "SuitePathError", "SUITE_ROOT_ENV", "SUITE_ROOT_ENV_ALIASES", "AURORA_ROOT",
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

#: This checkout — `<aurora>/scratchpad/lib/suite_paths.py`, so parents[2]. In a
#: linked worktree this is the WORKTREE, which is what an instrument measuring
#: "this tree" wants.
AURORA_ROOT = pathlib.Path(__file__).resolve().parents[2]

_ANNOUNCED: set[str] = set()


def checkout_env(name: str) -> str:
    """`aeon` -> `AEON_DIR`."""
    return "".join(c if c.isalnum() else "_" for c in name.upper()) + "_DIR"


def checkout_env_aliases(name: str) -> tuple[str, ...]:
    extra = {"aeon": ("LIVE_AEON",), "s1disasm": ("S1_DIR",)}.get(name, ())
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
            cwd=str(AURORA_ROOT), capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        common = ""
    if common:
        return (pathlib.Path(common).parent.parent,
                f"step 3: git rev-parse --git-common-dir from {AURORA_ROOT} -> {common}")
    return None, (
        f"step 4: REFUSED — {SUITE_ROOT_ENV} is unset (aliases: "
        f"{', '.join(SUITE_ROOT_ENV_ALIASES)}) and `git rev-parse --git-common-dir` in "
        f"{AURORA_ROOT} produced nothing")


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
            f"{', '.join(SUITE_ROOT_ENV_ALIASES)}), then a derivation from {AURORA_ROOT}. "
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
    print(f"aurora {AURORA_ROOT}")
    root, source = _suite_root()
    print(f"suite  {root if root else '(unresolved)'}")
    print(f"from   {source}")
