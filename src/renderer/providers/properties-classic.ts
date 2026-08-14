// Classic (S1 disasm) port for the neutral shared/PropertiesPanel.
//
// CLASSIC HAS NO PROPERTIES TO SHOW, and this file exists to say so in one
// place rather than have four facet modules each rediscover it.
//
// The question this port was asked is: what did the legacy classic shell
// (components/classic/ClassicProjectView.tsx) display about the open act that
// the shared surfaces do not already carry? Going through it line by line:
//
//  - the act's dimensions and its chunk/block/object counts → the status bar,
//    via providers/map-status-classic.ts (classicScopeInfo);
//  - the act label and the S1 badge → the status bar's zone name;
//  - the loading / load-failed states → the status bar's scope line;
//  - the unsaved-changes dot → the tab strip (shell/dirty-tabs.ts), which is
//    where map-status-classic already declined to repeat it;
//  - "N/M files resolved" → a project-level fact, owned by the resolution
//    report, not by a panel about the open act;
//  - the selected object's fields → shared/ObjectInspector, which classic has
//    mounted since plan 3 and which EDITS them rather than printing them.
//
// That is the whole of it. Nothing is left over, so the honest port is an empty
// one: the panel renders nothing for it, and the classic facet modules simply do
// not mount it. Inventing a "Zone: GHZ / Act: 1" block to fill the space would
// be restating the tab title in a box — the dead chrome panel the UX overhaul
// exists to remove.
//
// Keep this port (rather than deleting the file) as the place the answer is
// written down: when classic grows a genuinely act-scoped read-only fact — level
// music, water level, the palette cycle id — it lands here, and the facet gains
// the mount. Reads only either way; the panel is a readout, so nothing here
// calls a classic command.

import type { PropertiesPort } from '../components/shared/properties-model';

/** No sections and no empty message: PropertiesPanel renders null for this. */
const NO_PROPERTIES: PropertiesPort = { sections: [] };

export function useClassicPropertiesPort(): PropertiesPort {
  return NO_PROPERTIES;
}
