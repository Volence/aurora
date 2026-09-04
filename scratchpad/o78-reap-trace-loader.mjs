// See trace-register.mjs for why. Rewrites exactly one call site in
// harness-guard.mjs so the exit net's reap prints its refusals.
const NEEDLE = 'reapDisplays(art, { quiet: true })';
const PATCH = 'reapDisplays(art, { quiet: false })';

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (!url.endsWith('/lib/harness-guard.mjs')) return r;
  const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
  const n = src.split(NEEDLE).length - 1;
  if (n !== 1) {
    // LOUD ON UNMEASURABLE. If the call site moved, every row measured after
    // this point would be silently blind again; say so on stderr and let the
    // run be marked UNMEASURABLE rather than pass.
    console.error(`O78-TRACE-LOADER: expected 1 occurrence of the quiet reap, found ${n} — NOT PATCHED`);
    return r;
  }
  console.error('O78-TRACE-LOADER: exit-net reap un-quieted (printing only)');
  return { ...r, source: src.replace(NEEDLE, PATCH) };
}
