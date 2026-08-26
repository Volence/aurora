/**
 * WHAT THE MAP'S ESCAPE KEY CLEARS, decided out of `.tsx` so the node suite
 * can pin the order. `MapViewport`'s keydown effect asks this and acts.
 *
 * Pasting wins first: Escape exits paste mode without touching the marquee
 * (Ctrl+C leaves the marquee committed for repeat copies, and exiting paste
 * shouldn't discard it). Then a committed marquee, from any tool. Then — in
 * the Effects facet only, because that facet owns it — a lit band lens: any
 * left-click on the Plane-B rectangle seeds one (`commitBandMark`), and until
 * this branch nothing ever put it out (triage 2026-08-26 §A.2).
 */
export type EscapeAction = 'paste' | 'marquee' | 'lens' | null;

export function resolveEscape(
  ed: { pasting: boolean; marquee: unknown; bandLensTarget: unknown },
  inEffectsFacet: boolean,
): EscapeAction {
  if (ed.pasting) return 'paste';
  if (ed.marquee) return 'marquee';
  if (inEffectsFacet && ed.bandLensTarget) return 'lens';
  return null;
}
