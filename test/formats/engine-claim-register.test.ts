/**
 * STANDING COPY THAT ASSERTS WHAT AEON'S ENGINE DOES MUST NAME THE CLAUSE IT
 * TRANSCRIBES, AND THAT CLAUSE IS RE-READ FROM AEON ON EVERY RUN.
 *
 * ═══ THE FINDING, AND WHY A NUMERIC GATE COULD NOT SEE IT ═══
 *
 * `CROSS-SYSTEM-STRINGS-UNPOLICED`: an author-facing string that asserts the
 * BEHAVIOUR of another repo's engine is policed by nothing in this suite unless
 * it happens to contain an integer. `scripts/check-prose-constants.mjs` finds a
 * re-typed CONSTANT and says so in its own header; `scripts/check-guide-text.mjs`
 * is markdown only. Neither can see a wrong QUANTIFIER, a wrong SCOPE, or a
 * promise about behaviour, and those are the three shapes that have actually bit.
 *
 * They bit on 2026-09-09. Three strings on the ship-silent path told an author
 * that marking ONE tile animation to ship silent meant the whole act boots with
 * BG animation off. aeon's emitter writes the count word as the number of bands
 * NOT carrying the key, so that is true only when EVERY tile animation carries
 * it: one marked plus one live boots ON. The strings were wrong for months,
 * every gate in this repo was green over them, and what finally caught them was
 * aeon correcting a message they had sent us. The pre-fix text is recoverable at
 * this repo's `b6660f23`, and THE CONTROL AT THE BOTTOM OF THIS FILE READS IT
 * FROM GIT AND REQUIRES ALL THREE TO STILL BE CAUGHT.
 *
 * ═══ THE POPULATION: STANDING COPY, NOT EVERY STRING ═══
 *
 * The distinction that makes this gate small enough to be honest is between
 *
 *   · STANDING copy, typed as a literal and shown in every state: a module-level
 *     string constant, JSX text, an author-facing JSX attribute. `SHIP_SILENT_LEAD`
 *     is one; so is the `ships silent (...)` option label. Nothing about the
 *     document licenses what it says, so it must be true of every document.
 *   · CONDITIONAL copy, composed inside a function that has just tested the
 *     condition: a `throw new Error('... the build refuses it')` in a writer, or
 *     an advisory pushed only when the state it describes holds. Those sentences
 *     are licensed by their own guard. `the build refuses it` is a true statement
 *     of the document that reached that line, and demanding a quantifier of it
 *     would be hostile noise the next lane would rightly delete.
 *
 * Measured on this tree: the predicate below flags 37 sentences over all of
 * `src` with no standing/conditional split, and 7 with it. That ratio is the
 * whole argument for the split.
 *
 * ═══ WHAT THE PREDICATE LOOKS FOR ═══
 *
 * A WIDER SUBJECT taking a BEHAVIOUR VERB, unconditioned. `the act boots`,
 * `the ROM gets`, `the engine refuses` -- a subject no per band, per strip or per
 * layer control can speak for, in the main clause, with no conditional attached.
 *
 * It is NOT the vacuous version, and the vacuous version is worth writing out
 * because the parcel that fixed the high found it first: a gate asserting "the
 * act sentence must carry an all-quantifier" PASSES the false sentence, which
 * already said *"in every ROM"* -- of ROM SHAPES, not of tile animations. This
 * one keys on a CONDITIONAL being attached to the wider-subject predication, and
 * `in every ROM` is not one. Checked both ways in the control block below: all
 * three pre-fix sentences flag, all three repaired sentences do not.
 *
 * Two exclusions, both principled rather than tuned:
 *
 *   · A subordinate lead-in (`when the ROM runs`, `what the engine runs`) is a
 *     CONDITION or a relative clause, not an assertion, so the subject is not
 *     read as predicated.
 *   · A conditional token in the same sentence (`only when`, `only in`, `unless`,
 *     `any other`, ...) licenses the wider subject. This is what the repaired
 *     lead relies on: *"The act as a whole boots with BG animation OFF only when
 *     every tile animation in it is silenced"*.
 *
 * ═══ WHAT A REGISTER ROW IS ═══
 *
 * A VERDICT with an ARBITER, never a mute. Each row names the source clause the
 * sentence transcribes and the gate READS THAT CLAUSE:
 *
 *   · `aeon` rows are read at aeon `origin/master` through git objects
 *     (`readAtRev`), never through the sibling working tree, which on this
 *     machine is a peer lane's live checkout. A clause that has moved is a FAIL
 *     naming both sides; no aeon checkout is a LOUD SKIP.
 *   · `repo` rows are read from a vendored contract inside this repo, which has
 *     its own currency gate against aeon (`bg-override-contract-currency.test.ts`).
 *
 * There is no unchecked row kind. A new standing engine claim cannot be added
 * without locating the clause that licenses it, which is the step nobody took on
 * the ship-silent path.
 *
 * ═══ WHAT THIS DOES NOT DO, STATED BECAUSE THE HONEST SCOPE IS NARROWER ═══
 *
 *   · IT CANNOT READ ENGLISH. A register row whose quote is present but whose
 *     Aurora sentence misreads it still passes. What the row buys is that the
 *     author must FIND and QUOTE the clause, and that every later reader sees the
 *     clause beside the claim: on the ship-silent path the only clause available
 *     was a per-band one, so quoting it puts the missing quantifier in front of
 *     whoever writes the row.
 *   · COMMENTS ARE OUT, on `check-prose-constants.mjs`'s ruling that this class
 *     of gate is about text a tool shows a person. Two JSX comments in
 *     `EffectsScenePanel.tsx` carry the same flat-path claim as the advisories
 *     and are not covered here.
 *   · CONDITIONAL copy is out, per the split above. `the build refuses it` in a
 *     writer's throw is unpoliced by this file and is meant to be.
 *   · JSX text is treated as standing copy even when its element is rendered
 *     conditionally, which over-includes. Zero JSX sites flag today, so the cost
 *     is nil; a future one lands as a register row with that reason.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

import { peerRepo, resolveRev, readAtRev, AURORA_DIR } from '../support/peer-repo';

/** The branch whose tip answers "what does aeon ship TODAY". Committed, never a working tree. */
const AEON_TIP = 'origin/master';

/** Prefix so nobody triages an aeon-side move as an Aurora regression. */
const NOT_OURS = 'NOT AN AURORA REGRESSION: aeon moved the clause an Aurora sentence transcribes.';

// ─── THE PREDICATE ───────────────────────────────────────────────────────────

/**
 * Subjects no per-band, per-strip or per-layer control can speak for. A claim
 * about one of these is a claim about the whole document or the whole engine.
 */
const SUBJECT = 'act|ROM|scene|game|build|engine|emitter';

/**
 * Verbs that assert BEHAVIOUR rather than describe a value. `flat-paths` is here
 * because the deduplicated flat-path claim uses it.
 */
const VERB = 'boots|ships|refuses|emits|renders|builds|animates|moves|gets|counts'
  + '|compiles|runs|stops|goes|raises|drops|clamps|flat-paths';

/** Adverbs allowed between the subject and its verb. Anything else breaks the match. */
const MODIFIER = '(?:\\s+(?:as a whole|still|always|then|now|already|therefore|itself))*';

/**
 * A subordinate or relative lead-in. `when the ROM runs` is the condition of
 * some other claim; `what the engine runs` is a relative clause. Neither
 * predicates on the wider subject, so neither is this gate's business.
 */
const LEAD_IN = /(?:when|while|once|what|where|which|whether|how|unless|before|after|until|whenever)$/i;

const PREDICATION = new RegExp(
  `\\b(?:the|this|that|a|an)\\s+(?:[A-Z]+\\s+)?(${SUBJECT})\\b(?!['’]s)${MODIFIER}\\s+(${VERB})\\b`,
  'gi',
);

/**
 * Tokens that attach a condition to the sentence. Deliberately NOT a bare
 * `every`: the false lead already carried one.
 */
const CONDITIONAL = /\bonly (?:when|if|for|once|in)\b|\bunless\b|\biff\b|\bwhen every\b|\bif every\b|\bprovided\b|\bany other\b/i;

interface Flag { file: string; line: number; sentence: string; subject: string; verb: string }

/** Split standing copy into sentences. A colon does NOT split: it joins a clause to its condition. */
const sentences = (text: string): string[] =>
  text.replace(/\s+/g, ' ').trim().split(/(?<=[.;])\s+/);

function flagsIn(file: string, line: number, text: string): Flag[] {
  const out: Flag[] = [];
  for (const sentence of sentences(text)) {
    PREDICATION.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PREDICATION.exec(sentence)) !== null) {
      const before = sentence.slice(0, m.index).replace(/[^A-Za-z]+$/, '');
      if (LEAD_IN.test(before)) continue;
      if (CONDITIONAL.test(sentence)) continue;
      out.push({ file, line, sentence, subject: m[1], verb: m[2] });
      break;
    }
  }
  return out;
}

// ─── THE POPULATION ──────────────────────────────────────────────────────────

const FACING_JSX_ATTRS = new Set([
  'title', 'label', 'placeholder', 'alt', 'aria-label', 'aria-description',
  'hint', 'help', 'tooltip', 'summary', 'caption', 'legend', 'noneLabel',
]);

/** Fold a string expression the way `check-prose-constants.mjs` does: a hole becomes a marker. */
function fold(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return fold(node.expression);
  if (ts.isJsxExpression(node) && node.expression) return fold(node.expression);
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce((acc, s) => `${acc} <value> ${s.literal.text}`, node.head.text);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = fold(node.left);
    const r = fold(node.right);
    return l === null || r === null ? null : l + r;
  }
  return null;
}

const MIN_LENGTH = 25;

/**
 * Standing copy in one file: literals reachable without entering a function
 * (module-level constants and the objects they hold), plus JSX text and
 * author-facing JSX attributes wherever they sit.
 */
function standingCopyOf(file: string, src: string): { line: number; text: string }[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const out: { line: number; text: string }[] = [];
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node, inFunction: boolean): void => {
    if (ts.isJsxAttribute(node) && node.initializer
        && FACING_JSX_ATTRS.has(node.name.getText(sf))) {
      const folded = fold(node.initializer);
      if (folded !== null && folded.length >= MIN_LENGTH) out.push({ line: at(node), text: folded });
      return;
    }
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (text.length >= MIN_LENGTH) out.push({ line: at(node), text });
      return;
    }
    const folded = fold(node);
    if (folded !== null) {
      if (!inFunction && folded.length >= MIN_LENGTH) out.push({ line: at(node), text: folded });
      return;
    }
    const nowInFunction = inFunction || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
    ts.forEachChild(node, (child) => visit(child, nowInFunction));
  };
  visit(sf, false);
  return out;
}

const standingCopy = (file: string): { line: number; text: string }[] =>
  standingCopyOf(file, readFileSync(resolve(AURORA_DIR, file), 'utf8'));

/**
 * Every foldable string literal in a file, wherever it sits. Used only by the
 * single-authorship check below, which asks how many times a human typed a
 * sentence rather than which of them is standing copy.
 */
function allStringLiterals(file: string): { line: number; text: string }[] {
  const src = readFileSync(resolve(AURORA_DIR, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    const folded = fold(node);
    if (folded !== null) {
      if (folded.length >= MIN_LENGTH) {
        out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: folded });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', '--', 'src'], { cwd: AURORA_DIR, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !f.includes('__tests__'));
}

function sweep(): Flag[] {
  const out: Flag[] = [];
  for (const file of sourceFiles()) {
    for (const { line, text } of standingCopy(file)) out.push(...flagsIn(file, line, text));
  }
  return out;
}

// ─── THE REGISTER ────────────────────────────────────────────────────────────

interface Row {
  /** The file the sentence is typed in. Informational; the key is the sentence. */
  file: string;
  /** The flagged sentence, exactly as the sweep normalises it. */
  sentence: string;
  /** Where the licensing clause lives: aeon at its tip, or a vendored contract here. */
  source: { repo: 'aeon' | 'this'; path: string };
  /** A substring of that file which must still be present. No dashes: the dash gates read this file. */
  quote: string;
  /** Why the clause licenses the sentence. */
  why: string;
}

const REGISTER: Row[] = [
  {
    file: 'src/renderer/providers/effects-aeon.ts',
    sentence: 'The engine flat-paths a live shift with no table: the build stays green and the plane '
      + 'does not move.',
    source: { repo: 'aeon', path: 'engine/level/scene_dsl.emp' },
    quote: 'A live shift with NO table is flat-pathed at runtime and does not count',
    why: 'aeon’s precondition-1 message, quoted whole. It is the clause both deform advisories '
      + 'transcribe, and it is now typed ONCE: see FLAT_PATH_CLAIM.',
  },
  {
    file: 'src/renderer/providers/effects-aeon.ts',
    sentence: 'the build refuses a scene that leaves it open',
    source: { repo: 'aeon', path: 'engine/level/scene_dsl.emp' },
    quote: 'declares NO left_column_mask policy',
    why: 'scene()’s ensure fires when a per-column scene declares no policy, so the refusal is '
      + 'real and is conditioned on per-column V scroll exactly as the sentence says.',
  },
  {
    file: 'src/renderer/providers/effects-preset.ts',
    sentence: 'a band covers top..bot-1, so top must stay above bot: the engine refuses top >= bot',
    source: { repo: 'aeon', path: 'engine/effects/raster_dsl.emp' },
    quote: 'ensure(top < bot,',
    why: 'band()’s own assertion. The Aurora sentence is its contrapositive.',
  },
  {
    file: 'src/renderer/providers/effects-preset.ts',
    sentence: 'lowest screen line: below it the engine clamps up and still draws',
    source: { repo: 'aeon', path: 'engine/effects/raster.emp' },
    quote: 'CLAMPED UP to the floor',
    why: 'Raster_GetChannelBand’s banner, which records that this banner itself said "clamps at '
      + 'BOTH edges" and was stale until 2026-09-04. The lo edge clamps up and still emits.',
  },
  {
    file: 'src/renderer/providers/effects-preset.ts',
    sentence: 'highest screen line: past it the engine drops the record',
    source: { repo: 'aeon', path: 'engine/effects/raster.emp' },
    quote: 'the record is DROPPED',
    why: 'The same banner, hi edge. Asymmetric with lo on purpose, which is why the two Aurora '
      + 'glosses must not be reworded into one.',
  },
  {
    file: 'src/main/editor-methods.ts',
    sentence: 'No numeric value is range-checked or clamped on this side, on purpose: the engine '
      + 'refuses out-of-budget bands with the measurement behind the rule.',
    source: { repo: 'aeon', path: 'engine/effects/raster_dsl.emp' },
    quote: "is below this ON op's minimum",
    why: 'band()’s height-versus-cycle-cost assertion, whose message carries the measurement the '
      + 'sentence promises an author.',
  },
  {
    file: 'src/main/editor-methods.ts',
    sentence: 'Reports where the player LANDED: the engine clamps to act bounds and the answer may '
      + 'differ from the request.',
    source: { repo: 'aeon', path: 'docs/ENGINE_ARCHITECTURE.md' },
    quote: "Clamping is against the game's own act edges",
    why: 'The warp mailbox section: the engine writes the clamped destination back before clearing '
      + 'the flag, which is what makes the reported landing meaningful.',
  },
  {
    file: 'src/renderer/providers/bg-anim-aeon.ts',
    sentence: 'Fail either and the act builds with no twins, which aeon announces as it builds.',
    source: { repo: 'this', path: 'src/core/formats/bg-override/bganim-consumer-contract.json' },
    quote: '`views_emitted()` returns 0',
    why: 'The vendored contract’s own instruction for reading the twins conditions after aeon '
      + 'decoupled them from the build. That file has its own currency gate against aeon.',
  },
];

const key = (f: { file: string; sentence: string }) => `${f.file}\n${f.sentence}`;

// ─── THE CHECKS ──────────────────────────────────────────────────────────────

describe('standing copy asserting engine behaviour is registered against a source clause', () => {
  const flags = sweep();

  it('the sweep found standing engine claims at all', () => {
    // Anti-vacuous. A selector that stopped matching would give every check
    // below nothing to object to and go green, which is the failure mode a
    // wording gate is most exposed to.
    expect(
      flags.length,
      'the predicate flagged NOTHING across src: the extractor or the pattern has stopped matching,'
      + ' and every check in this file is now vacuous',
    ).toBeGreaterThan(0);
  });

  it('every flagged sentence has a register row naming the clause it transcribes', () => {
    const registered = new Set(REGISTER.map(key));
    const unregistered = flags.filter((f) => !registered.has(key(f)))
      .map((f) => `${f.file}:${f.line} [${f.subject} ${f.verb}] ${f.sentence}`);
    expect(
      unregistered,
      'STANDING COPY ASSERTS ENGINE BEHAVIOUR WITH NO ARBITER.\n'
      + 'Each sentence below predicates on a subject no per-item control can speak for, with no'
      + ' condition attached, and nothing compares it to the engine.\n'
      + 'Either condition the sentence to the scope it is actually true at, or add a REGISTER row in'
      + ' this file naming the aeon clause it transcribes so the clause is re-read on every run.\n'
      + `  ${unregistered.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every register row still has a live subject', () => {
    const live = new Set(flags.map(key));
    const stale = REGISTER.filter((r) => !live.has(key(r))).map((r) => `${r.file}: ${r.sentence}`);
    expect(
      stale,
      'A REGISTER ROW HAS NO LIVE SUBJECT: the sentence it adjudicates is gone or reworded, so the'
      + ' row is a permission that outlived its reason. Delete it, or update it to the new wording'
      + ' and re-read the clause.\n'
      + `  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});

/**
 * A CLAIM THAT SOMETHING IN AEON HAS NOT LANDED YET IS A CLAIM WITH A CLOCK, AND
 * THIS ONE HAD RUN OUT.
 *
 * Found by the census the finding asked for, not by the finding itself. Four
 * author-facing sites told an author that `sprite_mask` was refused because
 * aeon's left-column strip emission *"has not landed"* / *"cannot emit this
 * yet"*, which reads as: wait, and it will arrive. aeon's own assertion message
 * at `origin/master` says the opposite in as many words:
 *
 *     "SpriteMask is declared, and it is RULED OUT ... The strip emission is
 *      cancelled, not pending"
 *
 * One of the four was self-contradictory on top of that: it said the build
 * *"refuses in every scene"* and, in the same sentence, that *"the declaration
 * would be accepted while the sliver stays uncovered"*. A comment eleven lines
 * away had the right answer the whole time (*"the engine refuses it
 * unconditionally"*), which is what a claim with no arbiter looks like: the file
 * disagreeing with itself, in prose, for months.
 *
 * ⚠ THE EXPECTATION IS DERIVED FROM AEON'S SENTENCE, NOT FROM MY READING OF IT.
 * The row below requires aeon to still say `cancelled, not pending` before it
 * requires anything of Aurora, so the day aeon revives the emission this check
 * fails LOUDLY and tells the next lane to re-read rather than quietly licensing
 * the old copy again. A pending-vocabulary ban with no producer-side anchor
 * would be the wrong instrument: it would forbid the true sentence too.
 */
describe('the sprite_mask copy states aeon position, which is cancelled and not pending', () => {
  const FILES = [
    'src/renderer/providers/effects-aeon.ts',
    'src/renderer/components/effects/EffectsScenePanel.tsx',
  ];
  /**
   * Forms that PROMISE ARRIVAL. Not bare `yet` or `until`, which appear all over
   * legitimate prose; each of these asserts that the engine will gain something.
   *
   * ⚠ AND THE POPULATION IS EVERY STRING IN THESE FILES, not the ones that
   * mention `sprite_mask`. The first version of this row filtered on that token
   * and came back green over two of the four offenders, because the two most
   * author-facing of them -- the disabled option's own tooltip and its label mark
   * -- never spell the value they are attached to: the tie is `value ===
   * 'sprite_mask'` in the code, not a word in the sentence. A matcher keyed on
   * the subject appearing in the text is exactly the shape that finds three of
   * four and reports a clean sweep.
   */
  const PENDING = /\b(has not landed|have not landed|not landed|cannot emit this yet|is not emitted yet|does not emit yet|when it lands|once it lands|still pending)\b/i;
  const aeon = peerRepo('aeon');

  it('aeon still calls the strip emission cancelled rather than pending', (ctx) => {
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT'
        + ' MEASURE whether the strip emission is still cancelled, so the Aurora-side row below'
        + ' would be asserting a position nothing confirms');
      return;
    }
    const tip = resolveRev(aeon, AEON_TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}; CANNOT MEASURE`
        + ' whether the strip emission is still cancelled');
      return;
    }
    const at = readAtRev(aeon, tip, 'engine/level/scene_dsl.emp');
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    expect(
      at.text.includes('cancelled, not pending'),
      `${NOT_OURS}\n`
      + `  aeon engine/level/scene_dsl.emp at ${AEON_TIP} (${tip}) no longer says the strip\n`
      + '  emission is "cancelled, not pending". READ THAT ASSERTION AGAIN before touching the\n'
      + '  Aurora copy: if the emission has been revived, the sprite_mask strings and the schema\n'
      + '  enum both need work, and the row below must be retired rather than satisfied.',
    ).toBe(true);
  });

  for (const file of FILES) {
    it(`${file} does not tell an author to wait for the strip emission`, () => {
      const offenders = allStringLiterals(file)
        .filter((s) => PENDING.test(s.text))
        .map((s) => `${file}:${s.line} ${s.text.slice(0, 140)}`);
      expect(
        offenders,
        'AN AUTHOR-FACING STRING SAYS AEON HAS NOT LANDED THE STRIP EMISSION YET. aeon calls it'
        + ' CANCELLED, not pending (owner decision d-40, 2026-08-29): the sliver is repaired in the'
        + ' engine and there is nothing left for a bar to cover, so a declaration is refused'
        + ' outright and always will be. Say that instead of promising arrival.\n'
        + `  ${offenders.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});

/**
 * ONE CLAIM ABOUT AEON, TYPED ONCE.
 *
 * The row that named this file's finding also named a duplicate: the flat-path
 * claim was typed out INDEPENDENTLY in `layerShiftAdvisories` and in
 * `anchorDeformAdvisories`, both transcribing the same aeon precondition-1
 * clause. Two authors and no arbiter, in the shape `check-prose-constants.mjs`
 * refuses for numbers: the two copies rot on separate clocks, and they had
 * already drifted in punctuation before anyone read them side by side.
 *
 * The fix is one exported constant both advisories interpolate, which is also
 * what puts the claim into the REGISTER above where its aeon clause is re-read.
 * This row is what stops it being typed out a third time.
 */
describe('the flat-path claim about aeon is authored once', () => {
  const FILE = 'src/renderer/providers/effects-aeon.ts';
  /** The claim's load-bearing words, short enough to survive a punctuation change around it. */
  const CLAIM = 'flat-paths a live shift with no table';

  it(`${FILE} types the claim in exactly one place`, () => {
    // Comments are not the population (see the header), so a docblock quoting
    // aeon's own message is not a second author. And advisory text is composed
    // inside a function, where the standing-copy walk cannot see it, so this
    // counts every string literal in the file: the question is how many times a
    // HUMAN typed the sentence, not which copy is standing copy.
    const copies = allStringLiterals(FILE).filter((s) => s.text.includes(CLAIM));
    expect(
      copies.map((c) => `${FILE}:${c.line}`),
      'THE SAME CLAIM ABOUT AEON IS TYPED MORE THAN ONCE. Two copies of a cross-system claim have'
      + ' two authors and no arbiter: they rot on separate clocks and the reader cannot tell which'
      + ' one the engine agrees with. Interpolate the single exported constant instead.',
    ).toHaveLength(1);
  });
});

describe('CURRENCY: the clause each registered claim transcribes is still there', () => {
  const aeon = peerRepo('aeon');

  for (const row of REGISTER.filter((r) => r.source.repo === 'this')) {
    it(`${row.source.path} still carries the clause behind "${row.sentence.slice(0, 48)}"`, () => {
      const text = readFileSync(resolve(AURORA_DIR, row.source.path), 'utf8');
      expect(
        text.includes(row.quote),
        `the vendored contract no longer carries ${JSON.stringify(row.quote)}, which is what licenses`
        + ` this sentence in ${row.file}:\n  ${row.sentence}\n  ${row.why}`,
      ).toBe(true);
    });
  }

  for (const row of REGISTER.filter((r) => r.source.repo === 'aeon')) {
    it(`aeon ${row.source.path} still carries the clause behind "${row.sentence.slice(0, 48)}"`, (ctx) => {
      if (aeon === null) {
        ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT'
          + ` MEASURE whether aeon still says what ${row.file} tells an author it says`);
        return;
      }
      const tip = resolveRev(aeon, AEON_TIP);
      if (tip === null) {
        ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}; CANNOT MEASURE`
          + ` currency of the clause behind ${row.file}'s claim`);
        return;
      }
      const at = readAtRev(aeon, tip, row.source.path);
      // Not a skip: the revision resolved, so this WAS measured, and a citation
      // pointing at source that no longer exists is drift of the loudest kind.
      expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
      if (!at.ok) return;
      expect(
        at.text.includes(row.quote),
        `${NOT_OURS}\n`
        + `  aeon ${row.source.path} at ${AEON_TIP} (${tip}) no longer carries\n`
        + `    ${JSON.stringify(row.quote)}\n`
        + `  which is what licenses this standing claim in ${row.file}:\n`
        + `    ${row.sentence}\n`
        + `  ${row.why}\n`
        + '  Re-read the clause at that revision, then repair the Aurora sentence AND this row'
        + ' together. Do not update the quote alone: the sentence is the thing an author reads.',
      ).toBe(true);
    });
  }
});

/**
 * THE ACCEPTANCE TEST, AND IT STAYS IN THE SUITE.
 *
 * A predicate written after a defect was fixed proves nothing about the defect.
 * This block reads the three pre-fix sentences OUT OF GIT at `b6660f23` (the
 * commit before the ship-silent repair) and requires the finished predicate to
 * flag all three, then requires it to pass the three repaired sentences that
 * replaced them. It is the same shape as the control
 * `bg-override-contract-drift.test.ts` added for its own loosening, and for the
 * same reason: a wording gate that has never been shown catching the sentence it
 * was built for is decorative.
 *
 * Reading from git rather than pasting the text keeps the fixture honest, and it
 * is why this is not simply a table of strings: a paste can be quietly edited
 * into something the predicate happens to catch.
 */
describe('CONTROL: the predicate catches the defect it was built for', () => {
  const PRE_FIX = 'b6660f23';

  const showAt = (rev: string, path: string): string =>
    execFileSync('git', ['show', `${rev}:${path}`], { cwd: AURORA_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  /** The three sentences the 2026-09-09 high was, extracted from the pre-fix blobs. */
  interface Case { name: string; path: string; pick: (text: string) => string }
  const CASES: Case[] = [
    {
      name: 'SHIP_SILENT_LEAD promised the whole act boots silent',
      path: 'src/renderer/providers/bg-anim-aeon.ts',
      pick: (text) => {
        const m = /export const SHIP_SILENT_LEAD =([\s\S]*?);\n/.exec(text);
        expect(m, `SHIP_SILENT_LEAD not found at ${PRE_FIX}: the fixture moved, not the predicate`)
          .not.toBeNull();
        return m![1];
      },
    },
    {
      name: 'SHIP_SILENT_EXCHANGE promised the debug twins unconditionally',
      path: 'src/renderer/providers/bg-anim-aeon.ts',
      pick: (text) => {
        const m = /export const SHIP_SILENT_EXCHANGE =([\s\S]*?);\n/.exec(text);
        expect(m, `SHIP_SILENT_EXCHANGE not found at ${PRE_FIX}: the fixture moved, not the predicate`)
          .not.toBeNull();
        return m![1];
      },
    },
    {
      name: 'the ships-silent option label spoke for the act',
      path: 'src/renderer/components/effects/BgAnimBandPanel.tsx',
      // Through the standing-copy extractor, not a line scan: the panel's own
      // docblock QUOTES the defective label, and a line scan finds the comment
      // first. Comments are not the population, so the extractor is the honest
      // way to reach the authored label on either side of the fix.
      pick: (text) => {
        const label = standingCopyOf(
          'src/renderer/components/effects/BgAnimBandPanel.tsx', text,
        ).map((s) => s.text).find((s) => s.includes('ships silent'));
        expect(label, `the ships silent label not found at ${PRE_FIX}: the fixture moved`).toBeDefined();
        return JSON.stringify(label!);
      },
    },
  ];

  /**
   * The extracted text is source, so it is run through the same fold the sweep
   * uses rather than through a second copy of the string logic.
   */
  const foldedClaim = (source: string): string => {
    const sf = ts.createSourceFile('pre-fix.tsx', `const x = (${source.trim().replace(/,$/, '')});`,
      ts.ScriptTarget.Latest, true);
    let folded: string | null = null;
    const visit = (n: ts.Node): void => {
      if (folded !== null) return;
      const f = fold(n);
      if (f !== null && f.length >= MIN_LENGTH) { folded = f; return; }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    // A JSX-text case is not an expression; fall back to the raw line.
    return folded ?? source.replace(/\s+/g, ' ').trim();
  };

  for (const c of CASES) {
    it(`RED ON THE REAL DEFECT: ${c.name}`, () => {
      const claim = foldedClaim(c.pick(showAt(PRE_FIX, c.path)));
      const flags = flagsIn(c.path, 0, claim);
      expect(
        flags.map((f) => `${f.subject} ${f.verb}`),
        'THE PREDICATE NO LONGER CATCHES THE 2026-09-09 HIGH. Whatever was just changed about the'
        + ' pattern, the exclusions or the standing/conditional split has made this gate unable to'
        + ' see the sentence it exists for.\n'
        + `  pre-fix text at ${PRE_FIX}: ${claim}`,
      ).not.toEqual([]);
    });
  }

  it('GREEN ON THE REPAIRS: the three sentences that replaced them do not flag', () => {
    const lead = readFileSync(resolve(AURORA_DIR, 'src/renderer/providers/bg-anim-aeon.ts'), 'utf8');
    const panel = readFileSync(
      resolve(AURORA_DIR, 'src/renderer/components/effects/BgAnimBandPanel.tsx'), 'utf8');
    const repaired = [
      /export const SHIP_SILENT_LEAD =([\s\S]*?);\n/.exec(lead),
      /export const SHIP_SILENT_EXCHANGE =([\s\S]*?);\n/.exec(lead),
    ].map((m) => {
      expect(m, 'a repaired ship-silent constant is gone: this control has lost its subject').not.toBeNull();
      return foldedClaim(m![1]);
    });
    const label = standingCopyOf('src/renderer/components/effects/BgAnimBandPanel.tsx', panel)
      .map((s) => s.text).find((s) => s.includes('ships silent'));
    expect(label, 'the repaired ships silent label is gone: this control has lost its subject').toBeDefined();
    repaired.push(label!);

    const flagged = repaired.flatMap((text) => flagsIn('repaired', 0, text))
      .map((f) => `[${f.subject} ${f.verb}] ${f.sentence}`);
    expect(
      flagged,
      'THE PREDICATE NOW FLAGS THE CORRECT SENTENCES. A gate that fires on the repair is a gate the'
      + ' next lane disables; the conditional it must recognise is the one the repair carries.\n'
      + `  ${flagged.join('\n  ')}`,
    ).toEqual([]);
  });
});
