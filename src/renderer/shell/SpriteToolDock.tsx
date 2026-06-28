import React from 'react';
import { ToolButton, Icons } from '../components/ui';
import { useSpriteStore, type SpriteTool } from '../state/spriteStore';

// The 8 sprite tools, in column order, with their dock icons. Mirrors the icon
// mapping specified for the Aurora shell (same glyphs as the Art tool dock).
const TOOLS: [SpriteTool, string, React.FC<{ size?: number }>][] = [
  ['pencil', 'Pencil (paint pixels)', Icons.IconPencil],
  ['eraser', 'Eraser (paint color 0)', Icons.IconEraser],
  ['fill', 'Fill (flood fill)', Icons.IconFill],
  ['eyedropper', 'Eyedropper (pick color)', Icons.IconEyedrop],
  ['line', 'Line', Icons.IconLine],
  ['rect', 'Rectangle', Icons.IconRect],
  ['select', 'Select (marquee + move)', Icons.IconSelect],
  ['dither', 'Dither brush', Icons.IconDither],
];

export default function SpriteToolDock() {
  const tool = useSpriteStore((s) => s.tool);
  const setTool = useSpriteStore((s) => s.setTool);
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
