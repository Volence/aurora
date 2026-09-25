// Reading aeon's `clip_manifest.py validate --json` document (ROADMAP row 213).
//
// ═══ THE CONTRACT, AS AEON STATES IT ══════════════════════════════════════
//
// aeon `tools/clip_manifest.py` header and `docs/research/2026-09-25-clip-tooling-aurora-asks.md`
// at 1d9afb25: ONE JSON document on stdout,
//
//   { schema: 1, ok, refusals: [{rule, subjects, message}], warnings: [same shape] }
//
// with `ok` true iff the exit code is 0, at most one refusal today (a list so
// that can never change the shape), `rule` the message's leading tag (R1..R12,
// K1..K3, W2, W3) or null for an untagged refusal, and `subjects` naming WHICH
// clip or corridor: `{kind: 'clip'|'corridor', index, id|null}`, empty for an
// act-level refusal, two for a pair rule (first claimant first).
//
// ═══ THE THREE ANSWERS, AND WHY A CRASH IS ITS OWN ════════════════════════
//
// Only a ClipManifestError is a refusal. A manifest that is not JSON, or a path
// that does not exist, raises out of aeon's loader with a traceback, exit 1 and
// NOTHING on stdout; aeon deliberately did not wrap those, because reporting a
// bug as `rule: null` would disguise it as a verdict. So "exit 1 and no JSON"
// is a CRASH here, never a refusal and never an acceptance: the manifest was
// not judged. The same goes for anything else this reader cannot hold to the
// contract (another exit code, a schema it does not know, `ok` disagreeing with
// the exit code, a malformed entry): each is reported as "the tool's answer
// could not be read", with stdout and stderr, and the paste writes nothing.

/** The `schema` this reader understands. aeon bumps its VALIDATE_JSON_SCHEMA on any change a reader could see. */
export const VALIDATE_JSON_SCHEMA = 1;

export interface ClipSubject { kind: 'clip' | 'corridor'; index: number; id: string | null }
export interface ClipNote { rule: string | null; subjects: ClipSubject[]; message: string }

export type ValidateVerdict =
  | { kind: 'accepted'; warnings: ClipNote[] }
  | { kind: 'refused'; refusals: ClipNote[]; warnings: ClipNote[] }
  | { kind: 'crashed'; why: string; exitCode: number | null; stdout: string; stderr: string };

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function readSubject(x: unknown): ClipSubject | string {
  if (!isObj(x)) return 'a subject is not an object';
  const { kind, index, id } = x;
  if (kind !== 'clip' && kind !== 'corridor') return `a subject's kind is ${JSON.stringify(kind)}, not clip or corridor`;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return `a subject's index is ${JSON.stringify(index)}`;
  if (id !== null && typeof id !== 'string') return `a subject's id is ${JSON.stringify(id)}, not a string or null`;
  return { kind, index, id };
}

function readNote(x: unknown, where: string): ClipNote | string {
  if (!isObj(x)) return `${where} is not an object`;
  const { rule, subjects, message } = x;
  if (rule !== null && typeof rule !== 'string') return `${where}.rule is ${JSON.stringify(rule)}`;
  if (typeof message !== 'string') return `${where}.message is not a string`;
  if (!Array.isArray(subjects)) return `${where}.subjects is not a list`;
  const out: ClipSubject[] = [];
  for (const s of subjects) {
    const r = readSubject(s);
    if (typeof r === 'string') return `${where}: ${r}`;
    out.push(r);
  }
  return { rule, subjects: out, message };
}

function readNotes(x: unknown, name: string): ClipNote[] | string {
  if (!Array.isArray(x)) return `${name} is not a list`;
  const out: ClipNote[] = [];
  for (let i = 0; i < x.length; i++) {
    const r = readNote(x[i], `${name}[${i}]`);
    if (typeof r === 'string') return r;
    out.push(r);
  }
  return out;
}

/**
 * The verdict in one run's exit code and output. `exitCode` null means the
 * process did not exit normally (killed, a timeout): a crash, not a verdict.
 */
export function readValidateJson(exitCode: number | null, stdout: string, stderr: string): ValidateVerdict {
  const crash = (why: string): ValidateVerdict => ({ kind: 'crashed', why, exitCode, stdout, stderr });
  if (exitCode !== 0 && exitCode !== 1) {
    return crash(`aeon's loader exited ${exitCode === null ? 'without an exit code' : exitCode}, which is neither accepted (0) nor refused (1)`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(stdout);
  } catch {
    return crash(exitCode === 1
      ? 'aeon\'s loader exited 1 and printed no JSON: it crashed, so the manifest was NOT judged'
      : 'aeon\'s loader exited 0 but printed no JSON, so there is no verdict to read');
  }
  if (!isObj(doc)) return crash('aeon\'s loader printed JSON that is not an object');
  if (doc.schema !== VALIDATE_JSON_SCHEMA) {
    return crash(`aeon's loader answered in schema ${JSON.stringify(doc.schema)}; Aurora reads schema ${VALIDATE_JSON_SCHEMA}`);
  }
  if (typeof doc.ok !== 'boolean') return crash('aeon\'s answer has no boolean "ok"');
  if (doc.ok !== (exitCode === 0)) {
    return crash(`aeon's answer says ok=${String(doc.ok)} but the tool exited ${exitCode}; the two disagree, so neither is read`);
  }
  const refusals = readNotes(doc.refusals, 'refusals');
  if (typeof refusals === 'string') return crash(`aeon's answer is malformed: ${refusals}`);
  const warnings = readNotes(doc.warnings, 'warnings');
  if (typeof warnings === 'string') return crash(`aeon's answer is malformed: ${warnings}`);
  if (doc.ok) {
    if (refusals.length > 0) return crash('aeon\'s answer is ok but lists a refusal');
    return { kind: 'accepted', warnings };
  }
  if (refusals.length === 0) return crash('aeon\'s answer is a refusal that lists no refusal');
  return { kind: 'refused', refusals, warnings };
}

/** "clip 1 cpz_s2", "corridor 0 ehz_to_cpz", "clip 2 (no id)". */
export function subjectLabel(s: ClipSubject): string {
  return `${s.kind} ${s.index} ${s.id === null ? '(no id)' : s.id}`;
}

/** Who a note is about, for a person: the subjects, or "the act as a whole" when it names none. */
export function subjectsLabel(subjects: ClipSubject[]): string {
  return subjects.length === 0 ? 'the act as a whole' : subjects.map(subjectLabel).join(' and ');
}
