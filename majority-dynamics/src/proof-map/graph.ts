import type { AtlasData, Phase, Statement, LiteratureRef } from '../../scripts/proof-map/types';

export type NodeKind = 'statement' | 'literature';

export interface MapNode {
  id: string;
  kind: NodeKind;
  phase: Phase;
  label: string;
  title: string;
  statement?: Statement;
  literature?: LiteratureRef;
}

export interface MapEdge {
  source: string;
  target: string;
  via: 'proof' | 'statement' | 'cite';
}

export interface ProofGraph {
  nodes: MapNode[];
  edges: MapEdge[];
  byId: Map<string, MapNode>;
  /** id → ids it uses directly. */
  out: Map<string, string[]>;
  /** id → ids that use it directly. */
  in: Map<string, string[]>;
}

export const litId = (key: string) => 'lit:' + key;

/** Statements, cited literature, and "uses" edges (source uses target). */
export function buildGraph(atlas: AtlasData, opts: { statementEdges?: boolean } = {}): ProofGraph {
  const includeStatementEdges = opts.statementEdges ?? true;
  const nodes: MapNode[] = atlas.statements.map((s) => ({
    id: s.label,
    kind: 'statement',
    phase: s.phase,
    label: s.number,
    title: s.title,
    statement: s,
  }));
  const cited = new Set(atlas.statements.flatMap((s) => s.cites));
  for (const lit of atlas.literature) {
    if (!cited.has(lit.key)) continue;
    nodes.push({ id: litId(lit.key), kind: 'literature', phase: 'literature', label: lit.key, title: lit.short, literature: lit });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: MapEdge[] = atlas.edges
    .filter((e) => includeStatementEdges || e.via === 'proof')
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ ...e }));
  for (const s of atlas.statements) {
    for (const key of s.cites) if (byId.has(litId(key))) edges.push({ source: s.label, target: litId(key), via: 'cite' });
  }
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const inn = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    out.get(e.source)!.push(e.target);
    inn.get(e.target)!.push(e.source);
  }
  return { nodes, edges, byId, out, in: inn };
}

function reach(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const v = stack.pop()!;
    if (seen.has(v)) continue;
    seen.add(v);
    stack.push(...(adj.get(v) ?? []));
  }
  seen.delete(start);
  return seen;
}

/** Everything `id` transitively depends on. */
export const dependencies = (g: ProofGraph, id: string) => reach(id, g.out);
/** Everything that transitively depends on `id`. */
export const dependents = (g: ProofGraph, id: string) => reach(id, g.in);

/** A cycle as a list of ids, or null if the graph is acyclic. */
export function findCycle(g: ProofGraph): string[] | null {
  const state = new Map<string, 1 | 2>();
  const path: string[] = [];
  const visit = (v: string): string[] | null => {
    state.set(v, 1);
    path.push(v);
    for (const w of g.out.get(v) ?? []) {
      if (state.get(w) === 1) return [...path.slice(path.indexOf(w)), w];
      if (!state.has(w)) {
        const c = visit(w);
        if (c) return c;
      }
    }
    path.pop();
    state.set(v, 2);
    return null;
  };
  for (const n of g.nodes) {
    if (!state.has(n.id)) {
      const c = visit(n.id);
      if (c) return c;
    }
  }
  return null;
}

/** Layer index per node: longest path from a source, with sinks-only literature pushed to the bottom. */
export function assignLayers(g: ProofGraph): Map<string, number> {
  const layer = new Map<string, number>();
  const order = topoOrder(g);
  for (const v of order) {
    const preds = g.in.get(v) ?? [];
    layer.set(v, preds.length ? Math.max(...preds.map((p) => layer.get(p)! + 1)) : 0);
  }
  // Pull sources other than the main theorems down to just above their highest child.
  for (const v of [...order].reverse()) {
    const node = g.byId.get(v)!;
    if ((g.in.get(v) ?? []).length || node.phase === 'main') continue;
    const kids = g.out.get(v) ?? [];
    if (kids.length) layer.set(v, Math.min(...kids.map((k) => layer.get(k)!)) - 1);
  }
  const statementMax = Math.max(0, ...g.nodes.filter((n) => n.kind === 'statement').map((n) => layer.get(n.id)!));
  for (const n of g.nodes) if (n.kind === 'literature') layer.set(n.id, statementMax + 1);
  return layer;
}

export function topoOrder(g: ProofGraph): string[] {
  const indeg = new Map(g.nodes.map((n) => [n.id, (g.in.get(n.id) ?? []).length]));
  const queue = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const out: string[] = [];
  while (queue.length) {
    const v = queue.shift()!;
    out.push(v);
    for (const w of g.out.get(v) ?? []) {
      indeg.set(w, indeg.get(w)! - 1);
      if (indeg.get(w) === 0) queue.push(w);
    }
  }
  if (out.length !== g.nodes.length) throw new Error('proof graph has a cycle');
  return out;
}

export interface LayoutNode {
  id: string;
  layer: number;
  x: number;
  dummy: boolean;
}

export interface Layout {
  nodes: Map<string, LayoutNode>;
  /** Each edge as a polyline of layout-node ids (endpoints plus dummies). */
  routes: { edge: MapEdge; path: string[] }[];
  layers: string[][];
  width: number;
}

/** Sugiyama-style layered layout: dummy nodes for long edges, barycentre ordering, then x relaxation. */
export function layeredLayout(g: ProofGraph, gap = 1): Layout {
  const layerOf = assignLayers(g);
  const depth = Math.max(0, ...layerOf.values()) + 1;
  const layers: string[][] = Array.from({ length: depth }, () => []);
  const nodes = new Map<string, LayoutNode>();
  const rank = (id: string) => {
    const s = g.byId.get(id)?.statement;
    return s ? s.order : 1000 + g.nodes.findIndex((n) => n.id === id);
  };
  for (const n of [...g.nodes].sort((a, b) => rank(a.id) - rank(b.id))) {
    const l = layerOf.get(n.id)!;
    layers[l].push(n.id);
    nodes.set(n.id, { id: n.id, layer: l, x: 0, dummy: false });
  }
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (down.get(a) ?? down.set(a, []).get(a)!).push(b);
    (up.get(b) ?? up.set(b, []).get(b)!).push(a);
  };
  const routes: Layout['routes'] = [];
  g.edges.forEach((edge, i) => {
    const la = layerOf.get(edge.source)!;
    const lb = layerOf.get(edge.target)!;
    const path = [edge.source];
    for (let l = la + 1; l < lb; l++) {
      const id = `~${i}:${l}`;
      nodes.set(id, { id, layer: l, x: 0, dummy: true });
      layers[l].push(id);
      path.push(id);
    }
    path.push(edge.target);
    for (let j = 0; j + 1 < path.length; j++) link(path[j], path[j + 1]);
    routes.push({ edge, path });
  });

  const pos = new Map<string, number>();
  const index = () => layers.forEach((L) => L.forEach((id, i) => pos.set(id, i)));
  index();
  const bary = (id: string, nb: Map<string, string[]>) => {
    const ns = nb.get(id) ?? [];
    return ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!;
  };
  for (let it = 0; it < 12; it++) {
    const downward = it % 2 === 0;
    const seq = downward ? layers.keys() : [...layers.keys()].reverse();
    for (const l of seq) {
      const nb = downward ? up : down;
      const b = new Map(layers[l].map((id) => [id, bary(id, nb)]));
      layers[l].sort((a, c) => b.get(a)! - b.get(c)!);
      layers[l].forEach((id, i) => pos.set(id, i));
    }
  }

  const sep = (a: string, b: string) => (nodes.get(a)!.dummy || nodes.get(b)!.dummy ? 0.45 : 1) * gap;
  for (const L of layers) {
    let x = 0;
    L.forEach((id, i) => {
      if (i) x += sep(L[i - 1], id);
      nodes.get(id)!.x = x;
    });
    const mid = x / 2;
    for (const id of L) nodes.get(id)!.x -= mid;
  }
  for (let it = 0; it < 30; it++) {
    for (const L of layers) {
      const want = L.map((id) => {
        const ns = [...(up.get(id) ?? []), ...(down.get(id) ?? [])];
        const cur = nodes.get(id)!.x;
        return ns.length ? 0.5 * cur + 0.5 * (ns.reduce((s, n) => s + nodes.get(n)!.x, 0) / ns.length) : cur;
      });
      for (let i = 1; i < L.length; i++) want[i] = Math.max(want[i], want[i - 1] + sep(L[i - 1], L[i]));
      for (let i = L.length - 2; i >= 0; i--) want[i] = Math.min(want[i], want[i + 1] - sep(L[i], L[i + 1]));
      L.forEach((id, i) => (nodes.get(id)!.x = want[i]));
    }
  }
  const xs = [...nodes.values()].map((n) => n.x);
  const min = Math.min(...xs);
  for (const n of nodes.values()) n.x -= min;
  return { nodes, routes, layers, width: Math.max(...xs) - min };
}

/** Case-insensitive search over number, label, title, moral, and Lean names. */
export function searchNodes(g: ProofGraph, query: string): MapNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (n: MapNode): number => {
    const s = n.statement;
    if (n.label.toLowerCase() === q || n.id.toLowerCase() === q) return 0;
    if (n.label.toLowerCase().startsWith(q)) return 1;
    if (n.title.toLowerCase().includes(q)) return 2;
    if (s && [...s.lean, ...s.proofLean].some((l) => l.name.toLowerCase().includes(q))) return 3;
    if (n.id.toLowerCase().includes(q)) return 3;
    if (s && (s.moral + ' ' + s.statement).toLowerCase().includes(q)) return 4;
    if (n.literature && n.literature.text.toLowerCase().includes(q)) return 4;
    return Infinity;
  };
  return g.nodes
    .map((n) => [n, score(n)] as const)
    .filter(([, s]) => s < Infinity)
    .sort((a, b) => a[1] - b[1])
    .map(([n]) => n);
}
