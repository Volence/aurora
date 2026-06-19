import React from 'react';
import { ToolButton, Icons } from '../components/ui';
import { useArtStore, type ArtTool } from '../state/artStore';

// The 10 art tools, in column order, with their dock icons. Mirrors the icon
// mapping specified for the Aurora shell.
const TOOLS: [ArtTool, string, React.FC<{ size?: number }>][] = [
  ['pencil', 'Pencil (paint pixels)', Icons.IconPencil],
  ['eraser', 'Eraser (paint color 0)', Icons.IconEraser],
  ['fill', 'Fill (flood fill)', Icons.IconFill],
  ['eyedropper', 'Eyedropper (pick color)', Icons.IconEyedrop],
  ['line', 'Line', Icons.IconLine],
  ['rect', 'Rectangle', Icons.IconRect],
  ['select', 'Select (marquee)', Icons.IconSelect],
  ['dither', 'Dither brush', Icons.IconDither],
  ['tile-stamp', 'Tile stamp', Icons.IconStamp],
  ['collision', 'Collision paint', Icons.IconCollision],
];

export default function ArtToolDock() {
  const tool = useArtStore((s) => s.tool);
  const setTool = useArtStore((s) => s.setTool);
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
