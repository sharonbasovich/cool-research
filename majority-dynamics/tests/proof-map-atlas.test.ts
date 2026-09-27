import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findStatementRefs, parseAtlas, parseLeanHref, parseMacros, shortCitation } from '../scripts/proof-map/atlas';
import { buildLeanData, parseLeanSource } from '../scripts/proof-map/lean';

const html = readFileSync(new URL('./proof-map-fixtures/mini-atlas.html', import.meta.url), 'utf8');
const atlas = parseAtlas(html);
const byLabel = new Map(atlas.statements.map((s) => [s.label, s]));

describe('findStatementRefs', () => {
  it('finds numbered references, including appendix numbers', () => {
    expect(findStatementRefs('By Lemma 2.1 and Theorem B.12, and (A.3).')).toEqual(expect.arrayContaining(['2.1', 'B.12']));
  });
  it('ignores dotted external numbering such as "Theorem 2.8.4 of Vershynin"', () => {
    expect(findStatementRefs('Theorem 2.8.4 of Vershynin')).not.toContain('2.8');
  });
});

describe('parseAtlas on a fixture', () => {
  it('extracts every paper-unit article with number, kind, section and anchor', () => {
    expect(atlas.statements.map((s) => s.label)).toEqual(['thm:main', 'def:hist', 'lem:enum']);
    const main = byLabel.get('thm:main')!;
    expect(main).toMatchObject({ number: '1.1', kind: 'Theorem', section: '1.1', phase: 'main', title: 'the main theorem' });
    expect(main.atlasUrl).toBe('https://gopalkgoel.github.io/majority-dynamics/atlas/#unit-thm:main');
    expect(byLabel.get('def:hist')).toMatchObject({ kind: 'Definition', phase: 'setup', section: '2' });
  });

  it('keeps moral text with TeX delimiters', () => {
    expect(byLabel.get('thm:main')!.moral).toContain('\\(\\sqrt{pN}\\)');
  });

  it('reads current and pre-AI locations, and the explicit "no counterpart" case', () => {
    const main = byLabel.get('thm:main')!;
    expect(main.paper).toEqual([expect.objectContaining({ text: 'Theorem 1.1', page: 3, dest: 'label/thm:main' })]);
    expect(main.paper[0].url).toMatch(/^https:\/\/gopalkgoel\.github\.io\/majority-dynamics\/atlas\/pdf-viewer\.html\?file=new\.pdf/);
    expect(main.preAi).toEqual([expect.objectContaining({ text: 'Theorem 5.1', page: 15 })]);
    expect(byLabel.get('def:hist')!).toMatchObject({ preAi: [], preAiNone: true });
  });

  it('reads Lean links at the pinned revision and audit callouts', () => {
    const main = byLabel.get('thm:main')!;
    expect(main.lean).toEqual([
      expect.objectContaining({ name: 'MajorityDynamics.Paper.main', note: 'headline', path: 'MajorityDynamics/Paper/Main.lean', line: 12 }),
    ]);
    expect(main.callouts).toEqual([{ type: 'gap', title: 'gap in old paper', text: 'The old proof skipped a step.' }]);
  });

  it('derives proof and statement edges but not attribution or external numbering', () => {
    expect(atlas.edges).toEqual(
      expect.arrayContaining([
        { source: 'thm:main', target: 'lem:enum', via: 'proof' },
        { source: 'lem:enum', target: 'def:hist', via: 'statement' },
      ]),
    );
    expect(atlas.edges).toHaveLength(2);
    expect(atlas.unresolved).toEqual([]);
  });

  it('collects literature citations from statements, proofs and trailing remarks', () => {
    expect(byLabel.get('thm:main')!.cites).toEqual(['Ver18']);
    expect(byLabel.get('lem:enum')!.cites).toEqual(expect.arrayContaining(['LW17', 'MW90']));
  });

  it('parses the bibliography, carrying repeated authors', () => {
    const refs = new Map(atlas.literature.map((l) => [l.key, l]));
    expect(refs.get('LW17')).toMatchObject({ short: 'Liebenau & Wormald 2024', url: 'https://doi.org/10.1002/rsa.21105' });
    expect(refs.get('MW97')!.text).toMatch(/^McKay, Brendan D\., and Nicholas C\. Wormald\. 1997/);
    expect(refs.get('MW97')!.short).toBe('McKay & Wormald 1997');
  });

  it('parses MathJax macros into KaTeX form', () => {
    expect(parseMacros(html)).toEqual({ '\\mb': '\\mathbb{#1}', '\\eps': '\\varepsilon' });
    expect(atlas.macros['\\mb']).toBe('\\mathbb{#1}');
  });
});

describe('helpers', () => {
  it('parses pinned GitHub Lean URLs', () => {
    expect(
      parseLeanHref('https://github.com/o/r/blob/4d607ff1d4ab468476bd7caa40d3c89199dde102/MajorityDynamics/A/B.lean#L37'),
    ).toEqual({ path: 'MajorityDynamics/A/B.lean', line: 37 });
    expect(parseLeanHref('https://example.com/x.lean')).toBeNull();
  });
  it('shortens citations', () => {
    expect(shortCitation('Benjamini, Itai, Siu-On Chan, Ryan O’Donnell, and Li-Yang Tan. 2016. “Title.”')).toBe('Benjamini et al. 2016');
  });
});

describe('Lean parsing', () => {
  const a = `import Mathlib.Data.Real.Basic\nimport MajorityDynamics.B\n\n/-- Formalizes thm:main. -/\ntheorem foo : True := trivial\nlemma bar : True := trivial\ndef baz := 1\n`;
  it('counts lines, declarations, imports and atlas-label mentions', () => {
    const m = parseLeanSource('MajorityDynamics/A.lean', a, new Set(['thm:main']));
    expect(m).toMatchObject({ name: 'MajorityDynamics.A', dir: 'MajorityDynamics', lines: 7, mentions: ['thm:main'] });
    expect(m.decls).toMatchObject({ theorem: 1, lemma: 1, def: 1 });
    expect(m.rawImports).toEqual(['Mathlib.Data.Real.Basic', 'MajorityDynamics.B']);
  });
  it('splits internal and external imports and aggregates directories', () => {
    const lean = buildLeanData(
      [
        { path: 'MajorityDynamics/A.lean', src: a },
        { path: 'MajorityDynamics/B.lean', src: 'def b := 2\n' },
        { path: 'Top.lean', src: 'import MajorityDynamics.A\n' },
      ],
      new Set(),
    );
    const A = lean.modules.find((m) => m.name === 'MajorityDynamics.A')!;
    expect(A.imports).toEqual(['MajorityDynamics.B']);
    expect(A.externalImports).toEqual(['Mathlib']);
    expect(lean.totalLines).toBe(lean.modules.reduce((s, m) => s + m.lines, 0));
    expect(lean.dirs.find((d) => d.path === 'MajorityDynamics')).toMatchObject({ modules: 2 });
  });
});
