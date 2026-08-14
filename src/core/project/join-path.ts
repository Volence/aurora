/**
 * Join a directory to a relative path with exactly one separator.
 *
 * The renderer runs in a browser context with no `node:path`, so display paths
 * were built with template literals — and `${config.basePath}/project.json`
 * printed `…/aeon//project.json`, because an aeon project's basePath carries a
 * trailing separator and a classic one does not. A doubled separator still
 * RESOLVES, so nothing failed; it just made the Project Setup tab look wrong
 * about the one thing it exists to report.
 *
 * Display-oriented and POSIX-only, which is all the renderer needs: it prints
 * paths and hands them to the main process, which does its own joining with the
 * real `path` module.
 */
export function joinPath(dir: string, rel: string): string {
  return `${dir.replace(/\/+$/, '')}/${rel.replace(/^\/+/, '')}`;
}
