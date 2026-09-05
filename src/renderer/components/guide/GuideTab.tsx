// THE IN-APP GUIDE PAGE — Aurora's first help affordance of any kind.
//
// Before this tab, a DOM-wide search of the running application for any element
// whose text, `title` or `aria-label` matched `help|guide|docs|manual|tutorial|?`
// returned ZERO HITS (measured, docs/reviews/2026-09-02-effects-cold-walkthrough.md
// §a1/§d1). The owner's own words were that he opened the Effects tab and "was
// just lost"; Photoshop, his comparison, has a Help menu.
//
// ═══ WHAT THIS IS AND IS NOT ═══
//
// It is a READER, not a document. Every word on screen comes from
// `docs/guides/*.md` through `guides.ts`, so there is exactly one copy of the
// guide in this repository and the app cannot drift from it.
//
// It is a TAB, not a modal. A guide the reader has to dismiss to try the thing
// it describes is a guide read once and never re-opened; a tab sits beside the
// level tab, keeps its scroll position (the shell keeps non-level tabs mounted,
// App.tsx §keep-alive), and can be returned to mid-edit. That is also what
// makes the four deep links worth having: `?` on a control opens the guide AT
// the paragraph about that control, and the author's level is still one click
// away.
//
// THE CONTENTS RAIL IS NOT DECORATION. §a8 of the walkthrough measured the
// Effects panel at 8.3 screens with no index, and named that as the reason its
// shape had to be learned by enumerating the DOM. A ten-minute document with no
// index would repeat the defect it is documenting.

import React from 'react';
import { T } from '../ui';
import type { GuideBlock, InlineRun } from './markdown-lite';
import { guideBlocks, guideSections, type Guide } from './guides';

function Runs({ runs }: { runs: InlineRun[] }): React.ReactElement {
  return (
    <>
      {runs.map((r, i) => {
        if (r.code) return <code key={i} style={styles.code}>{r.text}</code>;
        if (r.strong) return <strong key={i} style={styles.strong}>{r.text}</strong>;
        return <React.Fragment key={i}>{r.text}</React.Fragment>;
      })}
    </>
  );
}

function Block({ block }: { block: GuideBlock }): React.ReactElement | null {
  switch (block.kind) {
    case 'heading': {
      const style = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
      // The id is what a deep link scrolls to; `scroll-margin-top` keeps the
      // heading clear of the sticky rail rather than under it.
      return <div id={block.slug} style={style}><Runs runs={block.runs} /></div>;
    }
    case 'para':
      return <p style={styles.para}><Runs runs={block.runs} /></p>;
    case 'quote':
      return <blockquote style={styles.quote}><Runs runs={block.runs} /></blockquote>;
    case 'rule':
      return <hr style={styles.rule} />;
    case 'code':
      return <pre style={styles.pre}><code>{block.text}</code></pre>;
    case 'list':
      return block.ordered ? (
        <ol style={styles.list}>
          {block.items.map((it, i) => <li key={i} style={styles.li}><Runs runs={it} /></li>)}
        </ol>
      ) : (
        <ul style={styles.list}>
          {block.items.map((it, i) => <li key={i} style={styles.li}><Runs runs={it} /></li>)}
        </ul>
      );
    case 'table':
      // WRAPPED IN ITS OWN SCROLLER. The guide's widest table is four columns of
      // prose; letting it set the page width would make every paragraph beside
      // it unreadable at narrow window sizes.
      return (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>{block.head.map((c, i) => <th key={i} style={styles.th}><Runs runs={c} /></th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => <td key={i} style={styles.td}><Runs runs={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export default function GuideTab({ guide, anchor }: {
  guide: Guide;
  /** A heading slug to scroll to on mount — how a control's `?` deep-links. */
  anchor?: string | null;
}): React.ReactElement {
  const blocks = guideBlocks(guide);
  const sections = guideSections(guide);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // The deep link. Re-run on every `anchor` change, not only on mount: opening
  // the guide from a second `?` while the tab is already open must move the
  // page, and the shell keeps this tab mounted between visits.
  React.useEffect(() => {
    if (!anchor) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const target = scroller.querySelector(`#${CSS.escape(anchor)}`);
    if (target instanceof HTMLElement) target.scrollIntoView({ block: 'start' });
    else scroller.scrollTop = 0;
  }, [anchor, guide.slug]);

  return (
    <div style={styles.scroll} ref={scrollRef} data-guide={guide.slug}>
      <div style={styles.column}>
        <div style={styles.kicker}>Guide</div>
        <nav style={styles.rail} aria-label="Contents">
          {sections.map((s) => (
            <a key={s.slug} href={`#${s.slug}`} style={styles.railLink}
              onClick={(e) => {
                e.preventDefault();
                const el = scrollRef.current?.querySelector(`#${CSS.escape(s.slug)}`);
                if (el instanceof HTMLElement) el.scrollIntoView({ block: 'start' });
              }}>
              {s.text}
            </a>
          ))}
        </nav>
        {blocks.map((b, i) => <Block key={i} block={b} />)}
        <div style={styles.footer}>
          This page is <code style={styles.code}>docs/guides/{guide.slug}.md</code> in the project
          repository: the same file, rendered here.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scroll: { flex: 1, overflowY: 'auto', background: T.surface },
  column: {
    maxWidth: 760, margin: '0 auto', padding: '32px 32px 96px',
    display: 'flex', flexDirection: 'column', color: T.textBase, fontSize: T.tBase,
    lineHeight: 1.6,
  },
  kicker: {
    fontSize: T.t2xs, fontWeight: T.wSemibold, color: T.textLo,
    textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 4,
  },
  rail: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 6,
    padding: '10px 12px', margin: '4px 0 20px',
    background: T.void, border: `1px solid ${T.border}`, borderRadius: T.rLg,
  },
  railLink: {
    fontSize: T.tXs, color: T.accent, textDecoration: 'none',
    padding: '2px 8px', border: `1px solid ${T.border}`, borderRadius: T.rPill,
    cursor: 'pointer',
  },
  h1: {
    fontSize: T.t2xl, fontWeight: T.wSemibold, color: T.textHi,
    margin: '8px 0 4px', scrollMarginTop: 16,
  },
  h2: {
    fontSize: T.tXl, fontWeight: T.wSemibold, color: T.textHi,
    margin: '28px 0 6px', scrollMarginTop: 16,
  },
  h3: {
    fontSize: T.tMd, fontWeight: T.wSemibold, color: T.textHi,
    margin: '18px 0 4px', scrollMarginTop: 16,
  },
  para: { margin: '0 0 12px' },
  quote: {
    margin: '0 0 12px', padding: '6px 0 6px 14px',
    borderLeft: `2px solid ${T.accent}`, color: T.textLo,
  },
  rule: { border: 'none', borderTop: `1px solid ${T.border}`, margin: '24px 0' },
  pre: {
    margin: '0 0 12px', padding: '10px 12px', overflowX: 'auto' as const,
    background: T.void, border: `1px solid ${T.border}`, borderRadius: T.rMd,
    fontFamily: T.fontMono, fontSize: T.tXs, lineHeight: 1.5, color: T.textBase,
  },
  code: {
    fontFamily: T.fontMono, fontSize: '0.92em', background: T.raised,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '0 4px',
    color: T.textHi,
  },
  strong: { color: T.textHi, fontWeight: T.wSemibold },
  list: { margin: '0 0 12px', paddingLeft: 22 },
  li: { margin: '0 0 4px' },
  tableWrap: { overflowX: 'auto' as const, margin: '0 0 16px' },
  table: { borderCollapse: 'collapse' as const, width: '100%', fontSize: T.tSm },
  th: {
    textAlign: 'left' as const, padding: '6px 10px', color: T.textHi,
    borderBottom: `1px solid ${T.borderStrong}`, verticalAlign: 'top' as const,
  },
  td: {
    padding: '6px 10px', borderBottom: `1px solid ${T.border}`,
    verticalAlign: 'top' as const,
  },
  footer: { marginTop: 32, fontSize: T.tXs, color: T.textFaint },
};
