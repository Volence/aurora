import React from 'react';
import { ToolButton, Icons } from '../components/ui';
import { useEditorStore, type EditorTool } from '../state/editorStore';

// The 8 map tools, in toolbar order, with their dock glyphs. Mirrors the icon
// mapping specified for the Aurora shell. `eraser` is intentionally not a dock
// button (it was never one of the toolbar's 8 tools).
const TOOLS: [EditorTool, string, React.FC<{ size?: number }>][] = [
  ['view', 'View', Icons.IconView],
  ['select', 'Select', Icons.IconSelect],
  ['paint-tile', 'Paint Tile', Icons.IconPencil],
  ['paint-block', 'Paint Block', Icons.IconRect],
  ['stamp-chunk', 'Stamp Chunk', Icons.IconStamp],
  ['paint-collision', 'Paint Collision', Icons.IconCollision],
  ['place-object', 'Place Object', Icons.IconObject],
  ['place-ring', 'Place Ring', Icons.IconRing],
];

export default function MapToolDock() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  return (
    <>
      {TOOLS.map(([t, label, Icon]) => (
        <ToolButton
          key={t}
          icon={<Icon size={18} />}
          label={label}
          active={tool === t}
          onClick={() => setTool(t)}
        />
      ))}
    </>
  );
}
