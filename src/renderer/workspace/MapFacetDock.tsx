import React from 'react';
import { ToolButton, Icons } from '../components/ui';
import { useEditorStore, type EditorTool } from '../state/editorStore';
import { FACET_TOOLS } from './facet-tools';
import type { FacetCapability } from '../../core/project/adapter';

// Glyph/label map — superset of the old MapToolDock TOOLS list (same icons).
const TOOL_META: Record<EditorTool, [string, React.FC<{ size?: number }>]> = {
  view: ['View', Icons.IconView],
  select: ['Select', Icons.IconSelect],
  marquee: ['Marquee', Icons.IconSelect],
  'paint-tile': ['Paint Tile', Icons.IconPencil],
  'paint-block': ['Paint Block', Icons.IconRect],
  'stamp-chunk': ['Stamp Chunk', Icons.IconStamp],
  'paint-collision': ['Paint Collision', Icons.IconCollision],
  'place-object': ['Place Object', Icons.IconObject],
  'place-ring': ['Place Ring', Icons.IconRing],
  eraser: ['Eraser', Icons.IconPencil],
};

export function MapFacetDock({ facet }: { facet: FacetCapability }) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const tools = FACET_TOOLS[facet] ?? [];
  return (
    <>
      {tools.map((t) => {
        const [label, Icon] = TOOL_META[t];
        return <ToolButton key={t} icon={<Icon size={18} />} label={label} active={tool === t} onClick={() => setTool(t)} />;
      })}
    </>
  );
}
