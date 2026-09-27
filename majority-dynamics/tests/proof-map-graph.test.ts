import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AtlasFile, LeanData } from '../scripts/proof-map/types';
import { LEAN_REV } from '../scripts/proof-map/lean';
import { buildCrossIndex, comparePreAi } from '../src/proof-map/data';
import { assignLayers, buildGraph, dependencies, dependents, findCycle, layeredLayout, litId, searchNodes } from '../src/proof-map/graph';

const read = <T>(f: string) => JSON.parse(readFileSync(new URL(`../public/data/proof-map/${f}`, import.meta.url), 'utf8')) as T;
const { meta, atlas } = read<AtlasFile>('atlas.json');
const lean = read<LeanData>('lean.json');
const g = buildGraph(atlas);
const labels = new Set(atlas.statements.map((s) => s.label));
const MAIN = 'thm:succinct_main_result';

describe('committed dataset', () => {
  it('is pinned to the requested Lean revision', () => {
    expect(meta.leanRev).toBe(LEAN_REV);
    expect(LEAN_REV).toBe('4d607ff1d4ab468476bd7caa40d3c89199dde102');
  });
  it('has unique labels, no unresolved references, and no dangling edges', () => {
    expect(labels.size).toBe(atlas.statements.length);
    expect(atlas.unresolved).toEqual([]);
    for (const e of atlas.edges) {
      expect(labels.has(e.source), e.source).toBe(true);
      expect(labels.has(e.target), e.target).toBe(true);
      expect(e.source).not.toBe(e.target);
    }
    const keys = new Set(atlas.literature.map((l) => l.key));
    for (const s of atlas.statements) for (const c of s.cites) expect(keys.has(c), `${s.label} cites ${c}`).toBe(true);
  });
  it('links Lean declarations only at the pinned revision, to files that exist', () => {
    const paths = new Set(lean.modules.map((m) => m.path));
    for (const s of atlas.statements) {
      for (const l of [...s.lean, ...s.proofLean]) {
        expect(l.url).toContain(`/blob/${LEAN_REV}/`);
        expect(paths.has(l.path), l.path).toBe(true);
      }
    }
  });
  it('has consistent Lean line counts and an import graph closed over the development', () => {
    const names = new Set(lean.modules.map((m) => m.name));
    expect(lean.totalLines).toBe(lean.modules.reduce((s, m) => s + m.lines, 0));
    for (const m of lean.modules) for (const i of m.imports) expect(names.has(i), `${m.name} → ${i}`).toBe(true);
    expect(names.has('MajorityDynamics.Paper.Main') || [...names].some((n) => n.startsWith('MajorityDynamics.Paper.'))).toBe(true);
  });
});

describe('dependency DAG', () => {
  it('is acyclic', () => {
    expect(findCycle(g)).toBeNull();
  });
  it('has the three headline results on top: only other headline results depend on them', () => {
    const main = g.nodes.filter((n) => n.phase === 'main').map((n) => n.id);
    expect(main).toEqual(expect.arrayContaining([MAIN, 'thm:uniform-density', 'cor:random-opinions']));
    for (const id of main) for (const d of dependents(g, id)) expect(g.byId.get(d)!.phase).toBe('main');
  });
  it('lets the main theorem reach the enumeration literature and most of the paper', () => {
    const deps = dependencies(g, MAIN);
    for (const key of ['LW17', 'LW20', 'CKLT21']) expect(deps.has(litId(key)), key).toBe(true);
    expect([...deps].filter((d) => labels.has(d)).length).toBeGreaterThan(atlas.statements.length / 2);
  });
  it('treats literature as leaves', () => {
    for (const n of g.nodes.filter((x) => x.kind === 'literature')) {
      expect(g.out.get(n.id)).toEqual([]);
      expect(g.in.get(n.id)!.length).toBeGreaterThan(0);
    }
  });
  it('layers every edge downward', () => {
    const layer = assignLayers(g);
    for (const e of g.edges) expect(layer.get(e.target)!).toBeGreaterThan(layer.get(e.source)!);
    const mainLayers = g.nodes.filter((n) => n.phase === 'main').map((n) => layer.get(n.id)!);
    expect(Math.min(...mainLayers)).toBe(0);
    expect(Math.max(...mainLayers)).toBeLessThan(3);
  });
  it('routes every edge through consecutive layers in the layout', () => {
    const L = layeredLayout(g);
    expect(L.routes).toHaveLength(g.edges.length);
    for (const r of L.routes) {
      const ls = r.path.map((id) => L.nodes.get(id)!.layer);
      ls.slice(1).forEach((l, i) => expect(l).toBe(ls[i] + 1));
    }
    for (const layer of L.layers) {
      const xs = layer.map((id) => L.nodes.get(id)!.x);
      xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(xs[i]));
    }
  });
  it('can drop statement-level references', () => {
    const proofOnly = buildGraph(atlas, { statementEdges: false });
    expect(proofOnly.edges.every((e) => e.via !== 'statement')).toBe(true);
    expect(proofOnly.edges.length).toBeLessThan(g.edges.length);
  });
});

describe('search, cross-index, and pre-AI comparison', () => {
  it('finds statements by number and Lean name', () => {
    expect(searchNodes(g, '1.1')[0].id).toBe(MAIN);
    expect(searchNodes(g, 'Paper.main').some((n) => n.id === MAIN)).toBe(true);
    expect(searchNodes(g, '')).toEqual([]);
  });
  it('cross-links statements and Lean modules both ways', () => {
    const ix = buildCrossIndex(atlas, lean);
    const mods = ix.modulesOf.get(MAIN) ?? [];
    expect(mods.length).toBeGreaterThan(0);
    for (const m of mods) expect(ix.statementsOf.get(m)).toContain(MAIN);
  });
  it('maps every pre-AI location back to a current statement', () => {
    const cmp = comparePreAi(atlas);
    expect(cmp.current).toHaveLength(atlas.statements.length);
    for (const o of cmp.old) for (const t of o.targets) expect(labels.has(t)).toBe(true);
    expect(cmp.newStatements.every((s) => s.preAi.length === 0)).toBe(true);
  });
});
