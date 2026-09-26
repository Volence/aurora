// Reading aeon's `clip_manifest.py validate --json` document (ROADMAP row 213)
// and `clip_act_bake.py bake --json` (row 213 open item (a)), which answers in
// the same shape.
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
// ═══ THE BAKE'S ANSWER: THE SAME SHAPE, THREE DIFFERENCES ═════════════════
//
// aeon `tools/clip_act_bake.py` header ("`bake --json`") at 71ae3433, research
// note "Ask 3": the document is built by the same `clip_manifest.refusal_record`
// and `json_text`, exit codes unchanged (0 baked, 1 refused). What differs, and
// what this reader does about each:
//   1. its `schema` is BAKE_JSON_SCHEMA, a number of its OWN (1 today), bumped
//      independently of validate's: so each tool is held to its own constant;
//   2. `rule` takes more values: the loader's tags (a ClipManifestError reaches
//      the bake too), the bake's own C1..C3, "FG_PAGE_BUDGET" (a named tag, not
//      read from the message) and null. Every one is a string or null, which is
//      all this reader requires; only C1 names a clip, the others are act-level;
//   3. a refusal can come AFTER the tree is written (--expect-worst, the page
//      budget): `ok: false` means "do not use that tree". Aurora's channel reads
//      the tree only on exit 0 (main/clip-tool.ts), and the page uses it only
//      when this reader says `accepted`.
// So one reader holds both documents to the contract; only the schema number
// and the words that name the tool differ (`readClipToolJson`'s first argument).
//
// ═══ THE THREE ANSWERS, AND WHY A CRASH IS ITS OWN ════════════════════════
//
// Only a refusal aeon's human mode calls REFUSED is a refusal (for validate a
// ClipManifestError; for the bake that, a ClipBakeError, or the page budget).
// A manifest that is not JSON, or a path that does not exist, raises out of
// either tool with a traceback, exit 1 and NOTHING on stdout; aeon deliberately
// did not wrap those, because reporting a bug as `rule: null` would disguise it
// as a verdict. So "exit 1 and no JSON" is a CRASH here, never a refusal and
// never an acceptance: nothing was judged. The same goes for anything else this
// reader cannot hold to the contract (another exit code, a schema it does not
// know, `ok` disagreeing with the exit code, a malformed entry): each is
// reported as "the tool's answer could not be read", with stdout and stderr,
// and the paste writes nothing.

/** The `schema` this reader understands. aeon bumps its VALIDATE_JSON_SCHEMA on any change a reader could see. */
export const VALIDATE_JSON_SCHEMA = 1;
/**
 * The `schema` of `bake --json` this reader understands: aeon's BAKE_JSON_SCHEMA,
 * the same shape as validate's but a number of its own, bumped on its own.
 */
export const BAKE_JSON_SCHEMA = 1;

/** Which of aeon's two clip tools answered. */
export type ClipJsonTool = 'validate' | 'bake';

const TOOL: Record<ClipJsonTool, { name: string; schema: number; judged: string }> = {
  validate: { name: 'aeon\'s loader', schema: VALIDATE_JSON_SCHEMA, judged: 'the manifest was NOT judged' },
  bake: { name: 'aeon\'s bake', schema: BAKE_JSON_SCHEMA, judged: 'the act was NOT judged' },
};

export interface ClipSubject { kind: 'clip' | 'corridor'; index: number; id: string | null }
export interface ClipNote { rule: string | null; subjects: ClipSubject[]; message: string }

export type ClipJsonVerdict =
  | { kind: 'accepted'; warnings: ClipNote[] }
  | { kind: 'refused'; refusals: ClipNote[]; warnings: ClipNote[] }
  | { kind: 'crashed'; why: string; exitCode: number | null; stdout: string; stderr: string };
/** The validate stage's verdict: the same three answers as the bake's. */
export type ValidateVerdict = ClipJsonVerdict;

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
 * The verdict in one run's exit code and output, for either tool. `exitCode`
 * null means the process did not exit normally (killed, a timeout): a crash,
 * not a verdict.
 */
export function readClipToolJson(tool: ClipJsonTool, exitCode: number | null, stdout: string, stderr: string): ClipJsonVerdict {
  const { name, schema, judged } = TOOL[tool];
  const crash = (why: string): ClipJsonVerdict => ({ kind: 'crashed', why, exitCode, stdout, stderr });
  if (exitCode !== 0 && exitCode !== 1) {
    return crash(`${name} exited ${exitCode === null ? 'without an exit code' : exitCode}, which is neither accepted (0) nor refused (1)`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(stdout);
  } catch {
    return crash(exitCode === 1
      ? `${name} exited 1 and printed no JSON: it crashed, so ${judged}`
      : `${name} exited 0 but printed no JSON, so there is no verdict to read`);
  }
  if (!isObj(doc)) return crash(`${name} printed JSON that is not an object`);
  if (doc.schema !== schema) {
    return crash(`${name} answered in schema ${JSON.stringify(doc.schema)}; Aurora reads schema ${schema}`);
  }
  if (typeof doc.ok !== 'boolean') return crash(`${name}'s answer has no boolean "ok"`);
  if (doc.ok !== (exitCode === 0)) {
    return crash(`${name}'s answer says ok=${String(doc.ok)} but the tool exited ${exitCode}; the two disagree, so neither is read`);
  }
  const refusals = readNotes(doc.refusals, 'refusals');
  if (typeof refusals === 'string') return crash(`${name}'s answer is malformed: ${refusals}`);
  const warnings = readNotes(doc.warnings, 'warnings');
  if (typeof warnings === 'string') return crash(`${name}'s answer is malformed: ${warnings}`);
  if (doc.ok) {
    if (refusals.length > 0) return crash(`${name}'s answer is ok but lists a refusal`);
    return { kind: 'accepted', warnings };
  }
  if (refusals.length === 0) return crash(`${name}'s answer is a refusal that lists no refusal`);
  return { kind: 'refused', refusals, warnings };
}

/** `clip_manifest.py validate --json`. */
export function readValidateJson(exitCode: number | null, stdout: string, stderr: string): ClipJsonVerdict {
  return readClipToolJson('validate', exitCode, stdout, stderr);
}

/** `clip_act_bake.py bake --json`. */
export function readBakeJson(exitCode: number | null, stdout: string, stderr: string): ClipJsonVerdict {
  return readClipToolJson('bake', exitCode, stdout, stderr);
}

/** "clip 1 cpz_s2", "corridor 0 ehz_to_cpz", "clip 2 (no id)". */
export function subjectLabel(s: ClipSubject): string {
  return `${s.kind} ${s.index} ${s.id === null ? '(no id)' : s.id}`;
}

/** Who a note is about, for a person: the subjects, or "the act as a whole" when it names none. */
export function subjectsLabel(subjects: ClipSubject[]): string {
  return subjects.length === 0 ? 'the act as a whole' : subjects.map(subjectLabel).join(' and ');
}
