import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';
import type {
  AtlasData,
  Callout,
  Edge,
  LeanLink,
  LiteratureRef,
  PdfLocation,
  Phase,
  Section,
  Statement,
} from './types';

export const ATLAS_URL = 'https://gopalkgoel.github.io/majority-dynamics/atlas/';

/**
 * Proof regions the atlas does not label with a "Proof of …" heading or aria-label.
 * Each entry is justified by the atlas prose quoted alongside it.
 */
export const SECTION_PROOF_OVERRIDES: Record<string, { proves: string[]; why: string }> = {
  'sec:uniform-proof': {
    proves: ['thm:uniform-density'],
    why: 'Atlas, after Theorem 1.2: "Section 6.3 gives a proof sketch".',
  },
};

/** Statements whose proof is a run of lemmas that follow them in the prose. */
export const PROOF_BY_FOLLOWING_LEMMAS: Record<string, { lemmas: string[]; why: string }> = {
  'thm:nice_deg': {
    lemmas: ['lem:nice_deg_technical', 'lem:nice_deg_bulk', 'lem:nice_deg_cute'],
    why: 'Atlas, after Theorem C.2: "We prove this through a series of lemmas."',
  },
};

const KIND_WORDS: Record<string, string> = {
  theorem: 'Theorem',
  thm: 'Theorem',
  lemma: 'Lemma',
  lem: 'Lemma',
  proposition: 'Proposition',
  prop: 'Proposition',
  corollary: 'Corollary',
  corollaries: 'Corollary',
  cor: 'Corollary',
  fact: 'Fact',
  definition: 'Definition',
  def: 'Definition',
  conjecture: 'Conjecture',
};

const NUM = String.raw`(?:[A-E]\.\d+|\d+\.\d+)(?![.\d])`;
const REF_RE = new RegExp(
  String.raw`\b(Theorems?|Lemmas?|Propositions?|Corollar(?:y|ies)|Facts?|Definitions?|Conjectures?|Thm|Prop|Lem|Cor|Def)\.?[\s\u00a0]+(` +
    NUM +
    String.raw`(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*[–-]\s*)` +
    NUM +
    `)*)`,
  'g',
);

/** Statement numbers referenced in running text, e.g. "Lemmas 4.4 and 4.5" → ["4.4","4.5"]. */
export function findStatementRefs(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(REF_RE)) {
    for (const n of m[2].matchAll(new RegExp(NUM, 'g'))) out.push(n[0]);
  }
  return out;
}

export function phaseOf(topSection: string): Phase {
  switch (topSection) {
    case '1':
      return 'main';
    case '2':
      return 'setup';
    case '3':
    case 'B':
    case 'C':
      return 'transference';
    case '4':
    case '5':
    case 'D':
    case 'E':
      return 'recursion';
    case '6':
      return 'contraction';
    default:
      return 'toolbox';
  }
}

function isEl(n: Node): n is HTMLElement {
  return n.nodeType === NodeType.ELEMENT_NODE;
}

function hasClass(el: HTMLElement, c: string): boolean {
  return (el.getAttribute('class') ?? '').split(/\s+/).includes(c);
}

export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Text content; with `dropMath`, math spans are replaced by a placeholder. */
function textOf(n: Node, dropMath: boolean, skip?: (el: HTMLElement) => boolean): string {
  if (!isEl(n)) return n.nodeType === NodeType.TEXT_NODE ? n.text : '';
  if (skip?.(n)) return '';
  if (dropMath && n.tagName === 'SPAN' && (hasClass(n, 'math') || hasClass(n, 'citation'))) return ' ∎ ';
  return n.childNodes.map((c) => textOf(c, dropMath, skip)).join('');
}

function pdfLocations(root: HTMLElement | null, kind: 'new' | 'old'): PdfLocation[] {
  if (!root) return [];
  return root.querySelectorAll(`a.pdf-link.${kind}`).map((a) => {
    const page = a.getAttribute('data-page');
    return {
      text: squash(a.querySelector('span')?.text ?? a.text),
      page: page ? Number(page) : null,
      dest: a.getAttribute('data-dest') ?? '',
      url: new URL(a.getAttribute('href') ?? '', ATLAS_URL).href,
    };
  });
}

export function parseLeanHref(href: string): { path: string; line: number | null } | null {
  const m = /\/(?:blob|tree)\/[0-9a-f]{40}\/([^#?]*)(?:#L(\d+))?/.exec(href);
  if (!m) return null;
  return { path: decodeURIComponent(m[1]), line: m[2] ? Number(m[2]) : null };
}

function leanLinks(root: HTMLElement | null): LeanLink[] {
  if (!root) return [];
  const out: LeanLink[] = [];
  for (const a of root.querySelectorAll('a.lean-link')) {
    const href = a.getAttribute('href') ?? '';
    const loc = parseLeanHref(href);
    if (!loc) continue;
    out.push({
      name: squash(a.querySelector('code')?.text ?? ''),
      note: squash(a.querySelector('small')?.text ?? ''),
      path: loc.path,
      line: loc.line,
      url: href,
    });
  }
  return out;
}

function evidenceParts(aside: HTMLElement | null) {
  const moral = squash(aside?.querySelector('.moral p')?.text ?? '');
  const grid = aside?.querySelector('.source-grid') ?? null;
  const aria = grid?.getAttribute('aria-label') ?? '';
  const current = aside?.querySelector('.source-group.current') ?? null;
  const historical = aside?.querySelector('.source-group.historical') ?? null;
  const formal = aside?.querySelector('.source-group.formal') ?? null;
  const callouts: Callout[] = (aside?.querySelectorAll('.audit-notes aside.callout') ?? []).map((c) => {
    const type = (c.getAttribute('class') ?? '').split(/\s+/).filter((x) => x !== 'callout')[0] ?? 'note';
    return {
      type,
      title: squash(c.querySelector('strong')?.text ?? type),
      text: squash(c.querySelector('div')?.text ?? ''),
    };
  });
  return {
    moral,
    aria,
    paper: pdfLocations(current, 'new'),
    preAi: pdfLocations(historical, 'old'),
    preAiNone: !!historical && pdfLocations(historical, 'old').length === 0,
    lean: leanLinks(formal),
    callouts,
  };
}

function cites(el: HTMLElement | null): string[] {
  if (!el) return [];
  return el
    .querySelectorAll('[data-cites]')
    .flatMap((c) => (c.getAttribute('data-cites') ?? '').split(/\s+/))
    .filter(Boolean);
}

/** Parse a MathJax `macros:{…}` block into KaTeX macro definitions. */
export function parseMacros(html: string): Record<string, string> {
  const block = /macros:\{(.*?)\}\}/s.exec(html)?.[1] ?? '';
  const out: Record<string, string> = {};
  const unesc = (s: string) => s.replace(/\\\\/g, '\\');
  for (const m of block.matchAll(/(\w+):(?:\['((?:[^'\\]|\\.)*)',\d+\]|'((?:[^'\\]|\\.)*)')/g)) {
    out['\\' + m[1]] = unesc(m[2] ?? m[3]);
  }
  return out;
}

export function shortCitation(text: string): string {
  const year = /\b(?:19|20)\d\d[a-z]?\b/.exec(text)?.[0] ?? '';
  const authors = text.split(/\.\s+(?:19|20)\d\d[a-z]?\./)[0];
  const parts = authors.split(/,\s*(?:and\s+)?|\s+and\s+/).map((p) => p.trim()).filter(Boolean);
  const names = [parts[0] ?? '', ...parts.slice(2).map((p) => p.split(/\s+/).at(-1) ?? p)];
  const who = names.length > 2 ? `${names[0]} et al.` : names.join(' & ');
  return `${who} ${year}`.trim();
}

interface Region {
  sectionId: string;
  proves: string[];
  text: string[];
  cites: string[];
}

export function parseAtlas(html: string): AtlasData {
  const root = parse(html);
  const paper = root.querySelector('.paper') ?? root;

  const sections: Section[] = [];
  const statements: Statement[] = [];
  const statementText = new Map<string, string>();
  const proofText = new Map<string, string[]>();
  const proofCites = new Map<string, string[]>();
  const regions: Region[] = [];
  let heading: Section | null = null;
  let region: Region | null = null;
  /** Remarks between an article and the next heading/proof discuss that statement; their citations attach to it. */
  let lastArticle: Statement | null = null;
  let pendingSectionProof: { section: Section; headingText: string; overridden: boolean } | null = null;

  const skipForRegion = (el: HTMLElement) =>
    (el.tagName === 'ASIDE' && hasClass(el, 'evidence')) || (el.tagName === 'DETAILS' && hasClass(el, 'audit-notes'));

  const numberToLabel = new Map<string, string>();
  for (const art of paper.querySelectorAll('article.paper-unit')) {
    const strong = art.querySelector('strong');
    const num = /([A-E]\.\d+|\d+\.\d+)/.exec(strong?.text ?? '')?.[1];
    const label = (art.getAttribute('id') ?? '').replace(/^unit-/, '');
    if (num) numberToLabel.set(num, label);
  }

  const refsToLabels = (text: string, self?: string) =>
    [...new Set(findStatementRefs(text).map((n) => numberToLabel.get(n)))].filter(
      (l): l is string => !!l && l !== self,
    );

  const startRegion = (proves: string[]) => {
    region = { sectionId: heading?.id ?? '', proves, text: [], cites: [] };
    regions.push(region);
  };

  const handleArticle = (art: HTMLElement) => {
    const label = (art.getAttribute('id') ?? '').replace(/^unit-/, '');
    const body = art.querySelector('[data-label]');
    const kindClass = (body?.getAttribute('class') ?? 'statement').split(/\s+/)[0].replace(/\*$/, '');
    const strong = body?.querySelector('strong');
    const headText = squash(strong?.text ?? '');
    const number = /([A-E]\.\d+|\d+\.\d+)/.exec(headText)?.[1] ?? '';
    const kind = KIND_WORDS[kindClass] ?? headText.split(' ')[0] ?? kindClass;
    const evidence = evidenceParts(art.querySelector('aside.evidence'));
    const proof = art.querySelector('details.proof-toggle .proof');
    const full = squash(body ? body.text : '');
    const stmt = full.replace(/^\S+\s+[A-E0-9.]+\.?\s*/, '').replace(/^\((.*?)\)\.\s*/, '');
    const [ariaHead, ...ariaRest] = evidence.aria.replace(/^Sources for\s*/, '').split(' — ');
    const groupTitle = squash(ariaRest.join(' — '));
    const named = /^\(([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(full.replace(/^\S+\s+[A-E0-9.]+\.?\s*/, ''))?.[1];
    const ownAria = new RegExp(`\\b${number.replace('.', '\\.')}(?![.\\d])`).test(ariaHead ?? '');
    const title = named ? named.replace(/[()]/g, '') : ownAria ? groupTitle : '';
    const sec = heading;
    const secNum = sec?.number ?? '';
    statements.push({
      label,
      number,
      kind,
      title: squash(title) || `${kind} ${number}`,
      groupTitle,
      statement: stmt,
      section: secNum,
      sectionTitle: sec?.title ?? '',
      topSection: secNum.split('.')[0],
      phase: phaseOf(secNum.split('.')[0]),
      moral: evidence.moral,
      auditNode: art.getAttribute('data-audit-node') ?? '',
      atlasUrl: ATLAS_URL + '#unit-' + label,
      paper: evidence.paper,
      preAi: evidence.preAi,
      preAiNone: evidence.preAiNone,
      lean: evidence.lean,
      proofLean: [],
      cites: [...new Set([...cites(body), ...cites(proof)])],
      callouts: evidence.callouts,
      proofSource: proof ? 'toggle' : 'none',
      order: statements.length,
    });
    // The heading's parenthetical is a name or an external attribution, e.g. "([LW17], Theorem 1.4)".
    const bodyText = body ? textOf(body, true) : '';
    statementText.set(label, bodyText.replace(/^\s*\S+\s+[A-E0-9.]+\.?\s*\((?:[^()]|\([^()]*\))*\)/, ''));
    if (proof) proofText.set(label, [textOf(proof, true)]);
  };

  const walk = (n: Node) => {
    if (!isEl(n)) {
      if (region && n.nodeType === NodeType.TEXT_NODE) region.text.push(n.text);
      return;
    }
    const el = n;
    const secAttr = el.getAttribute('data-section');
    if (secAttr && /^H[1-6]$/.test(el.tagName)) {
      const id = el.getAttribute('id') ?? '';
      const page = el.getAttribute('data-page');
      const title = squash(el.text.replace(/^\s*(?:Appendix\s+)?[A-E0-9.]+\s*/, ''));
      heading = {
        id,
        number: secAttr,
        title,
        level: Number(el.tagName.slice(1)),
        page: page ? Number(page) : null,
        atlasUrl: ATLAS_URL + '#' + id,
      };
      sections.push(heading);
      region = null;
      lastArticle = null;
      const override = SECTION_PROOF_OVERRIDES[id];
      pendingSectionProof = { section: heading, headingText: title, overridden: !!override };
      const proves = override ? override.proves : /\bProofs? of\b/i.test(title) ? refsToLabels(title) : [];
      if (proves.length) {
        startRegion(proves);
        pendingSectionProof = { ...pendingSectionProof, overridden: true };
      }
      return;
    }
    if (el.tagName === 'ARTICLE' && hasClass(el, 'paper-unit')) {
      handleArticle(el);
      lastArticle = statements[statements.length - 1];
      return;
    }
    if (el.tagName === 'ASIDE' && hasClass(el, 'context-evidence')) {
      const ev = evidenceParts(el);
      if (heading) {
        heading.moral = ev.moral;
        heading.lean = ev.lean;
      }
      if (pendingSectionProof && !region) {
        const m = /\bproofs? of (.*)$/i.exec(ev.aria);
        const proves = m ? refsToLabels(m[1]) : [];
        if (proves.length) startRegion(proves);
      }
      const r: Region | null = region;
      if (r) {
        for (const label of r.proves) {
          const st = statements.find((s) => s.label === label);
          if (st) st.proofLean.push(...ev.lean);
        }
      }
      pendingSectionProof = null;
      return;
    }
    if (region && skipForRegion(el)) return;
    if (!region && lastArticle && el.tagName === 'SPAN' && hasClass(el, 'citation')) {
      const c = (el.getAttribute('data-cites') ?? '').split(/\s+/).filter(Boolean);
      lastArticle.cites = [...new Set([...lastArticle.cites, ...c])];
      return;
    }
    if (region && el.tagName === 'SPAN' && (hasClass(el, 'math') || hasClass(el, 'citation'))) {
      const c = el.getAttribute('data-cites');
      if (c) region.cites.push(...c.split(/\s+/).filter(Boolean));
      region.text.push(' ∎ ');
      return;
    }
    if (region && el.tagName === 'EM') {
      const m = /^Proofs? of (.*?)\.?$/.exec(squash(el.text));
      const proves = m ? refsToLabels(m[1]) : [];
      if (proves.length) {
        startRegion(proves);
        return;
      }
    }
    for (const c of el.childNodes) walk(c);
  };
  for (const c of paper.childNodes) walk(c);

  const byLabel = new Map(statements.map((s) => [s.label, s]));
  for (const r of regions) {
    for (const label of r.proves) {
      const st = byLabel.get(label);
      if (!st) continue;
      if (st.proofSource === 'none') st.proofSource = SECTION_PROOF_OVERRIDES[r.sectionId] ? 'override' : 'section';
      proofText.set(label, [...(proofText.get(label) ?? []), r.text.join('')]);
      proofCites.set(label, [...(proofCites.get(label) ?? []), ...r.cites]);
    }
  }
  const groupCounts = new Map<string, number>();
  for (const st of statements) groupCounts.set(st.title, (groupCounts.get(st.title) ?? 0) + 1);
  for (const st of statements) {
    if ((groupCounts.get(st.title) ?? 0) > 1) st.title = `${st.kind} ${st.number}`;
  }

  const edges: Edge[] = [];
  const unresolved: { source: string; ref: string }[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, via: Edge['via']) => {
    const key = source + '→' + target;
    if (source === target || seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, via });
  };
  for (const st of statements) {
    for (const t of proofText.get(st.label) ?? []) {
      for (const n of findStatementRefs(t)) {
        const target = numberToLabel.get(n);
        if (target) addEdge(st.label, target, 'proof');
        else unresolved.push({ source: st.label, ref: n });
      }
    }
    const pl = PROOF_BY_FOLLOWING_LEMMAS[st.label];
    if (pl) {
      for (const l of pl.lemmas) addEdge(st.label, l, 'proof');
      if (st.proofSource === 'none') st.proofSource = 'override';
    }
    for (const n of findStatementRefs(statementText.get(st.label) ?? '')) {
      const target = numberToLabel.get(n);
      const earlier = target !== undefined && (byLabel.get(target)?.order ?? Infinity) < st.order;
      if (target && earlier) addEdge(st.label, target, 'statement');
      else if (target) continue;
      else unresolved.push({ source: st.label, ref: n });
    }
    st.cites = [...new Set([...st.cites, ...(proofCites.get(st.label) ?? [])])];
  }

  let prevAuthors = '';
  const literature: LiteratureRef[] = root.querySelectorAll('#refs .csl-entry').map((e) => {
    let text = squash(e.text);
    if (/^[—–-]{2,}/.test(text)) text = text.replace(/^[—–-]+/, prevAuthors);
    else prevAuthors = text.split(/\.\s+(?:19|20)\d\d[a-z]?\./)[0];
    const link = e.querySelector('a[href]')?.getAttribute('href') ?? null;
    return { key: (e.getAttribute('id') ?? '').replace(/^ref-/, ''), text, short: shortCitation(text), url: link };
  });

  return { sections, statements, edges, literature, macros: parseMacros(html), unresolved };
}
