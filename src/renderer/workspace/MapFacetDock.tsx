import React from 'react';
import { ToolButton, Icons } from '../components/ui';
import { useEditorStore, type EditorTool } from '../state/editorStore';
import { toolsForFacet } from './facet-tools';
import { TOOL_LABELS } from './tool-meta';
import type { FacetCapability } from '../../core/project/adapter';

// Glyph map — superset of the old MapToolDock TOOLS list (same icons). The
// LABELS half moved to tool-meta.ts so classic's chip row can share it; what
// stays here is the part that needs React.
const TOOL_ICONS: Record<EditorTool, React.FC<{ size?: number }>> = {
  view: Icons.IconView,
  select: Icons.IconCursor,
  marquee: Icons.IconSelect,
  'paint-tile': Icons.IconPencil,
  'paint-block': Icons.IconRect,
  'stamp-chunk': Icons.IconStamp,
  'paint-collision': Icons.IconCollision,
  'place-object': Icons.IconPlaceObject,
  'place-ring': Icons.IconRing,
  eraser: Icons.IconEraser,
};

export function MapFacetDock({ facet }: { facet: FacetCapability }) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const tools = toolsForFacet(facet);
  return (
    <>
      {tools.map((t) => {
        const Icon = TOOL_ICONS[t];
        return <ToolButton key={t} icon={<Icon size={18} />} label={TOOL_LABELS[t]} active={tool === t} onClick={() => setTool(t)} />;
      })}
    </>
  );
}
