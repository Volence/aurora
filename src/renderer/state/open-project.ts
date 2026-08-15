// The ONE answer to "which engine is open, and what can it do".
//
// Four call sites used to derive this independently and TWO OF THEM DISAGREED:
// App keyed aeon off projectStore.config, while tab-activation and
// project-runtime keyed off projectStore.project. Those differ during an aeon
// load, so a mid-load render could route a save or a tab activation at the
// wrong engine. This module picks `project` — the fully-loaded signal, and the
// one the safety-critical consumers already used.
//
// A window holds exactly one project at a time. Classic wins the tie because a
// classic open leaves a previously-resident aeon project in the store (see
// project-runtime's saver ownership tests, which encode the same precedence).

import type { CapabilityManifest, ArtTier } from '../../core/project/adapter';
import { useProjectStore } from './projectStore';
import { useClassicProjectStore } from './classicProjectStore';

export type OpenEngine = 's1' | 'aeon';

/** Which engine's project is open, or null when none is. */
export function openEngine(): OpenEngine | null {
  if (useClassicProjectStore.getState().status === 'open') return 's1';
  if (useProjectStore.getState().project !== null) return 'aeon';
  return null;
}

/**
 * The open project's ROOT DIRECTORY — the base every per-project relative path
 * resolves under (guarded writes, readBinaryFile, listDir). Null when no project
 * is open.
 *
 * Lives here for the reason in the header: four call sites deriving "which
 * engine is open" independently is how two of them came to disagree, and
 * "where is it on disk" is the same question with the same two answers
 * (classicProjectStore.dir / projectStore.config.basePath). session-lifecycle
 * derives the same pair for its storage key; a per-feature copy is what this
 * module exists to prevent.
 */
export function openProjectDir(): string | null {
  const engine = openEngine();
  if (engine === 's1') return useClassicProjectStore.getState().dir;
  if (engine === 'aeon') return useProjectStore.getState().config?.basePath ?? null;
  return null;
}

/** The open project's capability manifest, or null when none is open. */
export function openCapabilities(): CapabilityManifest | null {
  const engine = openEngine();
  if (engine === 's1') return useClassicProjectStore.getState().capabilities ?? null;
  if (engine === 'aeon') return useProjectStore.getState().capabilities ?? null;
  return null;
}

/** The open profile's art tier ladder, outermost tier first. Empty when the
 *  profile declares none (the field is optional — see adapter.ts). */
export function openArtTiers(): readonly ArtTier[] {
  return openCapabilities()?.artTiers ?? [];
}

/** Hook forms. Subscribe to both stores so a project switch re-renders. */
export function useOpenEngine(): OpenEngine | null {
  const classicOpen = useClassicProjectStore((s) => s.status === 'open');
  const aeonResident = useProjectStore((s) => s.project !== null);
  if (classicOpen) return 's1';
  if (aeonResident) return 'aeon';
  return null;
}

export function useOpenCapabilities(): CapabilityManifest | null {
  const classicCaps = useClassicProjectStore((s) => s.capabilities);
  const aeonCaps = useProjectStore((s) => s.capabilities);
  const engine = useOpenEngine();
  if (engine === 's1') return classicCaps ?? null;
  if (engine === 'aeon') return aeonCaps ?? null;
  return null;
}
