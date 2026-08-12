// AeonProjectAdapter — fingerprints an Aurora "aeon" project directory (the
// engine's s4 project.json) and exposes a capability-marker ProjectHandle for it.
//
// Task 17 of the disasm-project abstraction (spec §2.7): migrate the aeon open
// path behind the ProjectAdapter seam with ZERO behavior change. Deliberately
// MINIMAL — the real aeon load still runs in the renderer via
// useProject.loadFromPath. This adapter exists so aeon participates in the single
// `detectProject` registry (routing) instead of an ad-hoc `fa.exists('project.json')`
// probe; its open() does NOT re-implement the aeon loader. See classic-bridge.ts
// for how the renderer routes an aeon match back to the untouched loader.
//
// Pure core: no fs / Electron imports — all IO goes through the injected FileAccess.

import type {
  FileAccess,
  ProjectAdapter,
  ProjectHandle,
  ProjectMatch,
  ProjectOverrides,
} from '../adapter';
import { buildReport } from '../report';

const LABEL = 'Aeon Project';

/**
 * The distinguishing fingerprint. An aurora aeon project is identified by a root
 * `project.json` that parses as JSON and declares `engine: "s4"` — the exact
 * field `loadS4Config` (core/config/s4-config) treats as its hard gate
 * (`engine !== 's4'` → throw). We sniff ONLY that field and defer all other
 * validation (name, zones, act shapes) to the existing loader, so:
 *   • a valid aeon project → detect matches → renderer runs loadFromPath (identical);
 *   • an aeon project.json that is engine:"s4" but otherwise broken → still matches
 *     here, so loadFromPath runs and surfaces its usual error (identical);
 *   • a non-aurora project.json (another tool's, or malformed JSON) → engine is not
 *     "s4" (or unparseable) → detect returns null → the unrecognized-project notice.
 *
 * This keeps the fingerprint DISJOINT from s1's (which keys on sonic.asm + data
 * dirs and never inspects project.json): an aeon dir has no sonic.asm, and a
 * random project.json without engine:"s4" matches neither adapter.
 */
async function readEngine(fa: FileAccess): Promise<string | null> {
  try {
    if (!(await fa.exists('project.json'))) return null;
    const raw = await fa.read('project.json');
    const json: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (json !== null && typeof json === 'object' && 'engine' in json) {
      const engine = (json as { engine: unknown }).engine;
      return typeof engine === 'string' ? engine : null;
    }
    return null;
  } catch {
    // Missing / unreadable / malformed JSON — not a recognizable aeon project.
    return null;
  }
}

/**
 * Explain WHY a directory that carries a `project.json` was NOT recognized as an
 * aeon project, for the unrecognized-project notice (store + MCP open_project).
 * `detect` stays deliberately null-returning (a clean routing signal); this helper
 * reconstructs the human reason so the notice doesn't hide it:
 *   • no project.json at all → null (the dir isn't aeon-adjacent; the generic
 *     "not a recognized project" text already explains what each type expects);
 *   • project.json present but unparseable → invalid-JSON detail;
 *   • project.json parses but engine ≠ "s4" → engine-mismatch detail (shows what
 *     was found), which also covers a missing / non-string engine field;
 *   • engine === "s4" → null (this is a valid aeon match — no reject to explain).
 * Returning null means "nothing aeon-specific to add"; a string is appended to the
 * generic notice. Kept next to detect so the two stay in lockstep.
 */
export async function explainAeonReject(fa: FileAccess): Promise<string | null> {
  let raw: Uint8Array;
  try {
    if (!(await fa.exists('project.json'))) return null;
    raw = await fa.read('project.json');
  } catch {
    // project.json vanished / unreadable between detect and here — nothing to add.
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return 'project.json found but contains invalid JSON';
  }
  const engine =
    json !== null && typeof json === 'object' && 'engine' in json
      ? (json as { engine: unknown }).engine
      : undefined;
  if (engine === 's4') return null; // a valid aeon match — not a reject
  const shown = typeof engine === 'string' ? engine : String(engine);
  return `project.json found but engine is "${shown}", expected "s4"`;
}

export const aeonAdapter: ProjectAdapter = {
  type: 'aeon',

  async detect(fa: FileAccess): Promise<ProjectMatch | null> {
    return (await readEngine(fa)) === 's4' ? { type: 'aeon', label: LABEL } : null;
  },

  async open(_fa: FileAccess, _overrides?: ProjectOverrides): Promise<ProjectHandle> {
    // v1 marker handle. The renderer never opens aeon through this path — it
    // detects the aeon match and runs the EXISTING useProject.loadFromPath
    // unchanged (see classic-bridge.ts). Reporting is intentionally NOT bolted
    // onto aeon in this task, so the report is empty; capabilities describe what
    // the aeon editor already supports so any future capability-gated UI has a
    // truthful manifest to read. `levels: null` because classic level access
    // does not apply — aeon owns its own level model in the renderer store.
    return {
      type: 'aeon',
      capabilities: {
        levels: 'aeon',
        sprites: true,
        objects: 'json',
        build: false,
        facets: ['layout', 'art', 'objects', 'rings', 'collision', 'palette'],
      },
      report: buildReport([]),
      levels: null,
    };
  },
};
