// The activation generation counter, shared by ALL THREE activation systems.
//
// It lives in its own module because it is the one piece of state the level,
// sprite and canvas paths genuinely share, and the sharing is load-bearing
// rather than incidental: bumping it from any of them supersedes an in-flight
// flow in either of the others. A canvas activation cancels an open classic
// dirty-switch confirm (runCanvasActivation's comment says so explicitly), and
// a level activation cancels a sprite load that has not landed yet.
//
// Putting it in one of the three kind modules would have made the other two
// import that one for a reason that has nothing to do with it, and would have
// hidden a cross-kind rule inside whichever file happened to win.
//
// ONE ACTIVATION FLOW COMPLETES AT A TIME: a newer call bumps the counter, so an
// older flow that was awaiting a confirm answer or a save aborts instead of
// racing its openAct in after the user's newer choice already landed.

let activationGen = 0;

/** Start a new activation, superseding every flow already in flight. The
 *  returned token is what that flow later checks itself against. */
export function beginActivation(): number {
  return ++activationGen;
}

/** False once a NEWER activation has begun — the caller must abandon whatever
 *  it was about to commit. */
export function isCurrentActivation(token: number): boolean {
  return token === activationGen;
}
