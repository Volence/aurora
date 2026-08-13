// src/renderer/shell/LegacyWorkspace.tsx
// Classic (Sonic 1 disassembly) level-tab content — a thin wrapper around
// ClassicProjectView, kept as a singleton (one instance stays mounted for the
// app lifetime, hidden when a non-level tab is active) so the classic viewport /
// undo state survives tab switches. Classic-only until Stage 4 re-homes it onto
// the facet workspace; the former aeon (map/art) and sprite branches have
// dissolved into LevelWorkspace/facets and the App-level sprite-doc pane.
//
// The app bar saves through the single onSave prop: the SaveCoordinator
// (state/project-runtime.ts) saves every dirty surface.

import Toolbar from '../components/Toolbar';
import ClassicProjectView from '../components/classic/ClassicProjectView';
import { useClassicProjectStore } from '../state/classicProjectStore';

export interface LegacyWorkspaceProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => Promise<unknown> | void;
}

export default function LegacyWorkspace({ onOpenProject, onOpenRecent, onSave }: LegacyWorkspaceProps) {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  // Toolbar's onSave is `() => void | Promise<void>`; adapt the wider
  // `Promise<unknown>`-returning prop (saveAllDirty returns a result).
  const appBar = <Toolbar onOpenProject={onOpenProject} onOpenRecent={onOpenRecent} onSave={() => { void onSave(); }} />;
  return classicOpen ? <ClassicProjectView appBar={appBar} /> : null;
}
