// Objects facet — instance placement (spec §5): same canvas, object tools only,
// object palette + inspector on the right. Deliberate delta from the legacy
// every-tool panel set: the map.art ArtBrowser section is dropped here — it's
// layout-editing context, not object-placement context (spec §4).

import React from 'react';
import ObjectList from '../../components/shared/ObjectList';
import { useAeonObjectListPort } from '../../providers/object-list-aeon';
import ObjectInspector from '../../components/shared/ObjectInspector';
import { useAeonObjectInspectorPort } from '../../providers/object-inspector-aeon';
import AeonPropertiesPanel from '../../components/AeonPropertiesPanel';
import { Panel, CollapsibleSection } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

function ObjectsPanels() {
  // ObjectPalette became the neutral shared/ObjectList (stage-4 plan 3): the
  // rows, the arm/disarm toggle and the sprite-binding footer now arrive through
  // the aeon port, and the list itself is the same one classic renders.
  const objectListPort = useAeonObjectListPort();
  // NEW capability: aeon had no object property editor at all — PropertiesPanel's
  // "Selected Object" block was four lines of uneditable text (now removed, since
  // this supersedes it). The form is classic's, shared; the aeon port supplies the
  // fields aeon actually has and converts executeCommand's throw into a result.
  const objectInspectorPort = useAeonObjectInspectorPort();
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Objects">
        <ObjectList port={objectListPort} label="Object palette" />
      </CollapsibleSection>
      <CollapsibleSection id="map.object" title="Selected Object">
        <ObjectInspector port={objectInspectorPort} />
      </CollapsibleSection>
      {/* No showObjectSelection: the inspector above IS the selected-object
          readout. Subscriptions live in the AeonPropertiesPanel leaf. */}
      <CollapsibleSection id="map.props" title="Properties"><AeonPropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const objectsFacet: FacetModule = mapFacet('objects', { RightPanel: ObjectsPanels });
