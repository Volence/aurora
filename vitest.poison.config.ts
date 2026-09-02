// TEMPORARY — a red-first proof harness's config, deleted after the run.
// It is the repo's own vitest config with vite's transform cache pointed at a
// throwaway directory, so a poison run cannot be decided by a transform cached
// against the pre-mutation file. Vitest 4 removed `--cache.dir`; `cacheDir` on
// the vite config is where that setting lives now.
import base from './vitest.config';

export default { ...base, cacheDir: process.env.POISON_CACHE_DIR ?? './node_modules/.vite' };
