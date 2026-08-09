// Rel-path safety — shared by the main-process file IO and the renderer
// FileAccess bridge (Task 9). A FileAccess deals only in project-relative POSIX
// paths; a path must never escape the project root. We reject absolute paths and
// any `..` segment outright. The bundled profiles are pre-normalized (the s1
// profile flattens the INI's `../../foo` to `foo`), so no legitimate project
// path contains `..` — rejecting all of them is the safe superset.

/**
 * True when `rel` is a safe project-relative path that cannot escape the root:
 * not absolute (no leading `/`, no drive letter, no UNC), and containing no
 * `..` segment. The empty string / `.` denotes the root itself and is safe.
 */
export function isRelPathSafe(rel: string): boolean {
  if (rel === '' || rel === '.') return true;
  // Absolute POSIX, Windows drive (C:\…), or UNC (\\host) paths escape the root.
  if (rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) return false;
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '..') return false;
  }
  return true;
}
