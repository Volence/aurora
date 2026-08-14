// Classic's armed object placement, derived rather than stored.
//
// Classic used to have a single `object` tool that meant two things depending on
// whether an id was armed: unarmed it selected / moved / deleted, armed it
// placed. The one-vocabulary merge (spec §3.6) split those into the two aeon
// tools they always were — `select` and `place-object` — which leaves
// `armedObjectId` as a payload rather than a mode.
//
// A payload can go stale: switching tools does not clear the armed id, and
// nothing should have to remember to. So no consumer reads `armedObjectId`
// directly; they read it THROUGH this, and a tool switch implicitly disarms.
// The alternative — clearing the id at every tool-change call site — is the kind
// of invariant that holds until someone adds the seventh call site.

import type { EditorTool } from './editorStore';

/**
 * The object id an armed classic placement would drop, or null when no
 * placement is armed — including when an id is armed but the user has since
 * moved to another tool.
 */
export function armedPlacementId(tool: EditorTool, armedObjectId: number | null): number | null {
  return tool === 'place-object' ? armedObjectId : null;
}
