// A MARKDOWN SUBSET, PARSED IN ~150 LINES, SO THE GUIDE NEEDS NO DEPENDENCY.
//
// ═══ WHY THIS EXISTS AT ALL ═══
//
// The cold walkthrough (docs/reviews/2026-09-02-effects-cold-walkthrough.md,
// defect 1) measured the thing this file is the answer to: searching the WHOLE
// renderer DOM for any element whose text, `title` or `aria-label` matched
// `help|guide|docs|manual|tutorial|?` returned ZERO HITS. There was no help
// affordance anywhere in Aurora. `docs/guides/effects-first-run.md` existed and
// was reachable only by someone already reading the repository.
//
// `package.json` carries no markdown renderer — no `marked`, no
// `react-markdown`, no `remark`, no `mdx` — and the brief for this parcel was
// explicit that one must not be added for a help page. So the guide is parsed
// here into a small block list and painted by `GuideTab.tsx`.
//
// ═══ WHAT IT DELIBERATELY DOES NOT DO ═══
//
// This is NOT a markdown implementation and must never grow into one. It reads
// ONE document — the first-run guide — and the honest way to keep a hand-rolled
// parser correct is to keep its input in the same repository as itself. What it
// handles is exactly what that guide uses:
//
//   #/##/###  headings          |  pipe tables (with the --- separator row)
//   paragraphs                  |  ```fenced``` code
//   - / * / 1. lists            |  > blockquotes
//   ---  rules                  |  **bold** and `code` inline
//
// Anything else falls through as literal paragraph text rather than being
// dropped: a guide sentence that renders as plain prose is a cosmetic defect,
// and a guide sentence that VANISHES is a lie about what the reader has read.
// That rule is the reason `inline` never throws and never returns an empty run
// for non-empty input.
//
// NESTING IS NOT SUPPORTED and is not needed: a list inside a list, or a table
// inside a quote, renders as its own top-level block. The guide is checked
// against this by `src/renderer/components/guide/__tests__/guides.test.ts`
// (there is no `markdown-lite.test.ts`, and never has been), which parses the
// REAL shipped file rather than a fixture, so a guide edit that reaches for a
// construct
// this parser drops fails the suite instead of silently losing a paragraph.

/** One run of inline text. `code` and `strong` are the only two marks. */
export interface InlineRun {
  text: string;
  code?: boolean;
  strong?: boolean;
}

export type GuideBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: InlineRun[]; slug: string }
  | { kind: 'para'; runs: InlineRun[] }
  | { kind: 'quote'; runs: InlineRun[] }
  | { kind: 'list'; ordered: boolean; items: InlineRun[][] }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: InlineRun[][]; rows: InlineRun[][][] }
  | { kind: 'rule' };

/**
 * Split one line into `**bold**` / `` `code` `` runs.
 *
 * ONE PASS, NO RECURSION, and marks do not combine — `**a `b`**` yields a bold
 * run and a code run, not a bold-code one. That is a real limitation and it is
 * stated rather than hidden; the guide does not nest marks, and the test that
 * parses the real file is what keeps that true.
 *
 * ⚠ IT NEVER DROPS TEXT. An unclosed `**` or a lone backtick is emitted as
 * literal characters. A parser that swallowed the tail of a sentence on a typo
 * would make the guide quietly wrong, which is worse than making it ugly.
 */
export function inline(src: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let buf = '';
  const flush = (): void => { if (buf !== '') { runs.push({ text: buf }); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 1) {
        flush();
        runs.push({ text: src.slice(i + 2, end), strong: true });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        runs.push({ text: src.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    buf += src[i];
    i += 1;
  }
  flush();
  return runs;
}

/**
 * A heading's anchor id — lower case, non-word runs collapsed to one dash.
 *
 * ⚠ A LEADING SECTION NUMBER IS STRIPPED FIRST, and that is what makes the deep
 * links survive an edit. The guide's headings are numbered ("## 3. Make a raster
 * band"), which readers use and which renumbers the moment a section is inserted
 * — so an anchor carrying the number would silently break every `?` button
 * downstream of the insertion. `GUIDE_ANCHORS` names the meaning, not the
 * position.
 */
export function slugify(text: string): string {
  return text
    .replace(/^\s*\d+\.\s*/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const rowCells = (line: string): string[] =>
  line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

/**
 * The document as blocks.
 *
 * LINE-ORIENTED on purpose: every construct the guide uses is decided by the
 * first characters of a line, so the whole parser is one walk with no lookahead
 * beyond "is the next line still part of this block".
 */
export function parseGuide(src: string): GuideBlock[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: GuideBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i += 1; continue; }

    // Fenced code. An UNCLOSED fence runs to the end of the document rather
    // than throwing — see the header's no-dropped-text rule.
    if (/^```/.test(line.trim())) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i += 1; }
      i += 1;
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) { out.push({ kind: 'rule' }); i += 1; continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      out.push({
        kind: 'heading',
        level: h[1].length as 1 | 2 | 3,
        runs: inline(text),
        slug: slugify(text.replace(/[`*]/g, '')),
      });
      i += 1;
      continue;
    }

    // A table: a pipe row followed by a separator row of dashes.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const head = rowCells(line).map(inline);
      i += 2;
      const rows: InlineRun[][][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(rowCells(lines[i]).map(inline));
        i += 1;
      }
      out.push({ kind: 'table', head, rows });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push({ kind: 'quote', runs: inline(body.join(' ').trim()) });
      continue;
    }

    const bullet = /^\s*([-*]|\d+\.)\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: InlineRun[][] = [];
      let current: string | null = null;
      while (i < lines.length && lines[i].trim() !== '') {
        if (bullet.test(lines[i])) {
          if (current !== null) items.push(inline(current));
          current = lines[i].replace(bullet, '');
        } else if (current !== null) {
          // A continuation line of the item above it.
          current += ` ${lines[i].trim()}`;
        } else break;
        i += 1;
      }
      if (current !== null) items.push(inline(current));
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    // A paragraph: everything up to a blank line or a line that starts another
    // block. Soft-wrapped source lines join with a space, as markdown does.
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== ''
      && !/^(#{1,3}\s|```|\s*>|\s*([-*]|\d+\.)\s)/.test(lines[i])
      && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length === 0) { i += 1; continue; }
    out.push({ kind: 'para', runs: inline(para.join(' ')) });
  }

  return out;
}

/** The `##` headings, in order — the guide tab's contents index. */
export function guideOutline(blocks: GuideBlock[]): { slug: string; text: string }[] {
  return blocks
    .filter((b): b is Extract<GuideBlock, { kind: 'heading' }> => b.kind === 'heading' && b.level === 2)
    .map((b) => ({ slug: b.slug, text: b.runs.map((r) => r.text).join('') }));
}
