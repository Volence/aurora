import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * `docs/lane-log.jsonl` and `docs/decisions.jsonl` are ONE JSON OBJECT PER LINE,
 * and this repo is not their only reader — the Dominion console's Done feed
 * parses them line by line, as does any other lane.
 *
 * THE DEFECT THIS EXISTS FOR (2026-08-29, found by the empyrean hub, not by us):
 * two lines in `lane-log.jsonl` carried a stray trailing comma — `{...},` — as
 * though someone were assembling a JSON *array*. Each line still LOOKED right in
 * a diff and in an editor, `git` was happy, and every tool in this repo was happy,
 * because nothing in this repo ever parsed the file. A consumer doing the
 * contract-correct thing (`json.loads` per line) got `Extra data: line 1 column
 * 558` and dropped the entry. The two affected entries were a Sonic-1 live-warp
 * landing and a band-art landing — i.e. the owner silently did not hear about two
 * shipped things.
 *
 * WHY A LINE-BY-LINE PARSE AND NOT A WHOLE-FILE ONE: `JSON.parse` on the whole
 * file fails for the ordinary reason (it is not a JSON document), so a whole-file
 * check cannot distinguish "correct JSONL" from "broken JSONL" at all. The
 * quantity this is about is per-line parseability, which is exactly what the
 * external consumer does.
 *
 * ⚠ ANTI-VACUITY: a missing file, an empty file, or a file of blank lines must
 * NOT pass quietly — all three would satisfy "every line parses" for free. The
 * rows below assert the files exist and that a non-trivial number of entries were
 * actually examined, so this cannot report green having read nothing.
 */

const RECORDS = ['docs/lane-log.jsonl', 'docs/decisions.jsonl'] as const;

/** Split on newlines and drop only genuinely blank lines — never trim content. */
function entryLines(text: string): { lineNo: number; text: string }[] {
  return text
    .split('\n')
    .map((text, i) => ({ lineNo: i + 1, text }))
    .filter((l) => l.text.trim() !== '');
}

describe.each(RECORDS)('%s is strict JSONL', (rel) => {
  const path = resolve(__dirname, '../..', rel);

  it('exists — a missing record file would make every row below vacuous', () => {
    expect(existsSync(path), `${rel} is absent; the rows below would pass on nothing`).toBe(true);
  });

  it('every line is one complete JSON object, with NOTHING after it', () => {
    const lines = entryLines(readFileSync(path, 'utf8'));

    // Anti-vacuity: prove the instrument saw a real corpus, not an empty one.
    expect(lines.length, `${rel} has no entries — nothing was checked`).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const { lineNo, text } of lines) {
      try {
        const parsed: unknown = JSON.parse(text);
        // A bare string/number is valid JSON and is NOT a record. The contract
        // says object, so assert the shape rather than merely "it parsed".
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          offenders.push(`${rel}:${lineNo}: parsed, but is not a JSON OBJECT`);
        }
      } catch (e) {
        // Report the same way the external consumer sees it, and show the tail —
        // a stray suffix is invisible at the head of a 900-character line.
        const tail = text.length > 60 ? `…${text.slice(-60)}` : text;
        offenders.push(`${rel}:${lineNo}: ${(e as Error).message}  | line ends: ${JSON.stringify(tail)}`);
      }
    }

    expect(
      offenders,
      `these lines are not parseable as one JSON object each, so a line-by-line reader ` +
        `(the Dominion Done feed, any peer lane) DROPS OR MISREADS them:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('carries the fields a reader keys on, so a well-formed but empty record cannot pass', () => {
    const lines = entryLines(readFileSync(path, 'utf8'));

    // Judge only the lines that PARSE. Unparseable ones are the row above's
    // subject, and letting them throw here would bury that row's diagnostic
    // under a stack trace from this one. The count assertion below is what
    // stops the filter from turning this row vacuous on a wholly broken file.
    const parsed: { lineNo: number; obj: Record<string, unknown> }[] = [];
    for (const { lineNo, text } of lines) {
      try {
        parsed.push({ lineNo, obj: JSON.parse(text) as Record<string, unknown> });
      } catch {
        /* the row above owns this failure and reports it properly */
      }
    }
    expect(
      parsed.length,
      `no parseable entries in ${rel} — this row examined nothing, so its green would mean nothing`,
    ).toBeGreaterThan(0);

    const missing = parsed
      .filter(({ obj }) => typeof obj.at !== 'string')
      .map(({ lineNo }) => `${rel}:${lineNo}: no string \`at\``);

    expect(missing, `every entry carries a timestamp:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});
