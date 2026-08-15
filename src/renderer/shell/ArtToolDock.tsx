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
  ['palette-apply', 'Palette line (apply selected line to cells)', Icons.IconPalette],
];

/**
 * The art tool rail.
 *
 * `tools` narrows the rail to a SUBSET of the same list — the icons, labels,
 * column order and button styling stay here, so a host that offers fewer tools
 * cannot drift into a second dock look. Omitted = every tool (aeon's Art facet,
 * which drives a document all eleven can act on). Classic's tile tier passes
 * `CLASSIC_TILE_TOOLS` (core/art/tool-config), the eight the PixelEditController
 * implements, because the other three are tile-space and route through aeon's
 * composer, which classic does not have.
 *
 * Filtering the shared list rather than mapping over `tools` is deliberate: the
 * column order is a property of the DOCK, not of the caller's array, so two
 * hosts can never disagree about where the eraser sits.
 */
export default function ArtToolDock({ tools }: { tools?: readonly ArtTool[] }) {
  const tool = useArtStore((s) => s.tool);
  const setTool = useArtStore((s) => s.setTool);
  const shown = tools ? TOOLS.filter(([t]) => tools.includes(t)) : TOOLS;
  return (
    <>
      {shown.map(([t, label, Icon]) => (
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
