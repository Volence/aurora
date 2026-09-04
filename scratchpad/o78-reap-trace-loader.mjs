// See o78-reap-trace-register.mjs for why. Rewrites exactly one call site in
// harness-guard.mjs so the exit net's reap prints its refusals.
// TWO call sites, and missing the second one manufactured false negatives.
//   :900 killTreeSync — the exit net, hard-coded { quiet: true }.
//   :841 killTree     — { quiet } forwarded from the CALLER, and five
//                       registered harnesses (capture, shell-flip, tool-split,
//                       guard-proof, xvfb-reap) pass quiet: true. Under v1 of
//                       this loader those five could not print the tell at all
//                       and came back looking unaffected.
const SITES = [
  ['reapDisplays(art, { quiet: true })', 'reapDisplays(art, { quiet: false })'],
  ['reapDisplays(art, { quiet })', 'reapDisplays(art, { quiet: false })'],
];

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (!url.endsWith('/lib/harness-guard.mjs')) return r;
  let src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
  for (const [needle, patch] of SITES) {
    const n = src.split(needle).length - 1;
    if (n !== 1) {
      // LOUD ON UNMEASURABLE. If a call site moved, every row measured after
      // this point would be silently blind again; say so on stderr and let the
      // run be marked UNMEASURABLE rather than pass.
      console.error(`O78-TRACE-LOADER: expected 1 occurrence of ${JSON.stringify(needle)}, found ${n} — NOT PATCHED`);
      return r;
    }
    src = src.replace(needle, patch);
  }
  console.error('O78-TRACE-LOADER: exit-net reap un-quieted (printing only)');
  return { ...r, source: src };
}
