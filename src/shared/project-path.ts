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
