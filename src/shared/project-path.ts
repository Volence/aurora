// Project-path normalization — THE single choke point for every store keyed by
// a project directory string (recent-projects.json, the per-project session key,
// the Home tab's "is this recent the open project?" comparison). The bug it
// kills: keying by the raw string mints duplicate identities for the same
// directory — `proj` vs `proj/` vs `proj//sub/..` — so the recents list showed
// the same project twice and a session saved under one spelling never restored
// under the other.
//
// LEXICAL ONLY, deliberately: trailing separators stripped, `.` and empty
// segments dropped, `..` resolved against the preceding segment. Symlinks are
// NOT resolved (no realpath): two symlinked spellings of one target are treated
// as distinct projects on purpose — resolving them would merge entries the user
// created as genuinely different doors into the tree, and would make the
// normalized key depend on filesystem state at call time instead of being a
// pure function of the string.
//
// Case is preserved: Linux paths are case-sensitive, so `proj` and `Proj` are
// different directories and must stay different keys.
//
// Pure string code (no node:path import) so the renderer can share it.

/**
 * Normalize a project directory path to its canonical lexical spelling.
 * `/a/b/`, `/a//b`, `/a/./b`, `/a/c/../b` all become `/a/b`.
 * Relative inputs stay relative (`./p/` → `p`); `..` that walks above a
 * relative root is kept (`../p` stays `../p`), while on an absolute path it
 * clamps at `/` (as path.resolve would).
 */
export function normalizeProjectPath(raw: string): string {
  const absolute = raw.startsWith('/');
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..'); // can't resolve above a relative root
      // absolute: `/..` clamps at the root, segment dropped
      continue;
    }
    out.push(seg);
  }
  const joined = out.join('/');
  if (absolute) return '/' + joined;
  return joined === '' ? '.' : joined;
}

// ---------------------------------------------------------------------------
// THE SECOND DOOR'S PARSER (UX seat A, F1)
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS. Aurora's one advertised entry point is a native folder
 * picker (`window.api.selectDirectory()` -> `dialog.showOpenDialog`). A UX seat
 * walking the app cold on 2026-09-07 clicked `Open Project…`, observed nothing
 * at all, and had nowhere else to go: no path field, no recents on a fresh
 * profile, no drop target. That seat explicitly REFUSED to call the missing
 * dialog an app defect and neither does this comment - a native modal under a
 * headless X server with no window manager renders nothing and looks exactly
 * like a dead button, and this workspace has hit that before. What survives the
 * attribution question either way is the shape: one door, native, and no
 * second one. This is the second one.
 *
 * PURE ON PURPOSE. It cannot stat anything, so it does not pretend to: whether
 * the directory exists and whether it is a project are `openDirectory`'s
 * questions and it already answers them with a good notice. What this settles
 * is the far narrower one a text field owns - is this string even a path this
 * app can open, and if not, WHY, in a sentence the person can act on.
 */
export type TypedProjectPath =
  | { ok: true; dir: string }
  /** `why` is shown to the person verbatim, so it names the rule and the fix. */
  | { ok: false; why: string };

/** Every refusal this parser can produce, so a caller (and a test) can name one
 *  without matching on prose. The message text still travels with the result. */
export type TypedPathRefusal = 'empty' | 'tilde' | 'relative' | 'remote' | 'undecodable' | 'root';

/**
 * Turn a hand-typed or pasted directory path into one Aurora can open.
 *
 * Each transformation below is a real spelling a person arrives with, not a
 * defensive guess:
 *   • surrounding quotes - a shell quotes a path containing spaces, and the
 *     quoted form is what gets copied out of the terminal.
 *   • a `file://` URI - what a file manager, a browser address bar and most
 *     desktop drag payloads hand over, percent-encoded.
 *   • a trailing separator, `.` and `..` segments - `normalizeProjectPath`,
 *     shared with recents and the session key so a typed path and a browsed
 *     one mint the SAME project identity rather than two.
 *
 * And refusals rather than a silent best guess, because a wrong open is worse
 * than a refusal that says what to type:
 *   • `~` is expanded by the shell, never by the program it launches, so a
 *     literal `~/proj` here is a directory named `~` and would not exist.
 *   • a relative path has nothing to resolve against: a renderer has no
 *     working directory a person could reason about.
 */
export function parseTypedProjectPath(raw: string):
  TypedProjectPath & { kind?: TypedPathRefusal } {
  const EMPTY = {
    ok: false as const, kind: 'empty' as const,
    why: 'Type the full path to a project directory, or use Open Project... to browse for one.',
  };
  let s = raw.trim();
  if (s === '') return EMPTY;

  // One matched pair of surrounding quotes, both spellings.
  if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2)
    || (s.startsWith("'") && s.endsWith("'") && s.length >= 2)) {
    s = s.slice(1, -1).trim();
    if (s === '') return EMPTY;
  }

  if (s.startsWith('file://')) {
    // `file:///a/b` -> `/a/b`; a host component (`file://host/a`) is not a
    // local path this app can open, so it is refused rather than silently
    // reinterpreted as `/a`.
    const rest = s.slice('file://'.length);
    if (!rest.startsWith('/')) {
      return {
        ok: false, kind: 'remote',
        why: `"${raw.trim()}" points at another host. Aurora opens local directories only.`,
      };
    }
    try {
      s = decodeURIComponent(rest);
    } catch {
      return {
        ok: false, kind: 'undecodable',
        why: `"${raw.trim()}" is not a readable file:// address. Paste the plain path instead.`,
      };
    }
  }

  if (s === '~' || s.startsWith('~/')) {
    return {
      ok: false, kind: 'tilde',
      why: 'Your shell expands ~, not Aurora, so a pasted ~ is a directory named "~". '
        + 'Type the full path instead, starting with /.',
    };
  }

  if (!s.startsWith('/')) {
    return {
      ok: false, kind: 'relative',
      why: `"${s}" is not an absolute path. Aurora has no working directory to resolve a `
        + 'relative path against, so type the full path, starting with /.',
    };
  }

  const dir = normalizeProjectPath(s);
  if (dir === '/') {
    return { ok: false, kind: 'root', why: 'That is the filesystem root, not a project directory.' };
  }
  return { ok: true, dir };
}
