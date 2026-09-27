import { describe, expect, it } from 'vitest';
import { Rng, subSeed } from '../src/histories/rng';
import { csrFromEdges, edgeCount, forEachGnpEdge, sampleGnp } from '../src/histories/graph';
import { initialColoring, lead, runFixed, stepCsr, stepFresh, theoremDays, expansionDays } from '../src/histories/dynamics';
import {
  blockPairCounts,
  blockPairCountsFromStream,
  classSizes,
  degreesInto,
  historyCodes,
  historyLabel,
  imbalances,
  lastOpinion,
  mirror,
  parseHistory,
} from '../src/histories/classes';

function fromEdges(n: number, edges: [number, number][]) {
  return csrFromEdges(
    n,
    edges.map((e) => e[0]),
    edges.map((e) => e[1]),
    edges.length,
  );
}

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const xa = Array.from({ length: 5 }, () => a.next());
    const xb = Array.from({ length: 5 }, () => b.next());
    const xc = Array.from({ length: 5 }, () => c.next());
    expect(xa).toEqual(xb);
    expect(xa).not.toEqual(xc);
    for (const x of xa) expect(x >= 0 && x < 1).toBe(true);
  });
  it('sub-seeds separate streams', () => {
    expect(subSeed(1, 2)).not.toBe(subSeed(1, 3));
    expect(subSeed(1, 2)).toBe(subSeed(1, 2));
  });
});

describe('G(n,p) sampler', () => {
  it('produces a simple graph with about p·C(n,2) edges', () => {
    const n = 2000;
    const p = 0.01;
    const g = sampleGnp(n, p, new Rng(7));
    const seen = new Set<number>();
    for (let v = 0; v < n; v++) {
      for (let i = g.offsets[v]; i < g.offsets[v + 1]; i++) {
        const w = g.adj[i];
        expect(w).not.toBe(v);
        const key = v * n + w;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    for (const key of seen) expect(seen.has((key % n) * n + Math.floor(key / n))).toBe(true);
    const mean = (p * n * (n - 1)) / 2;
    expect(Math.abs(edgeCount(g) - mean)).toBeLessThan(5 * Math.sqrt(mean));
  });
  it('p = 1 gives the complete graph', () => {
    let m = 0;
    forEachGnpEdge(6, 1, new Rng(1), () => m++);
    expect(m).toBe(15);
  });
  it('is deterministic for a fixed seed', () => {
    const a = sampleGnp(500, 0.02, new Rng(9));
    const b = sampleGnp(500, 0.02, new Rng(9));
    expect(Array.from(a.adj)).toEqual(Array.from(b.adj));
  });
});

describe('majority step', () => {
  it('adopts the strict majority and keeps its opinion on ties', () => {
    // Star: 0 is joined to 1,2,3; 4 is joined to 5 and 6; 7 is isolated.
    const g = fromEdges(8, [
      [0, 1],
      [0, 2],
      [0, 3],
      [4, 5],
      [4, 6],
    ]);
    const cur = Int8Array.from([-1, 1, 1, -1, 1, 1, -1, -1]);
    const next = stepCsr(g, cur);
    expect(next[0]).toBe(1); // +,+,− → +
    expect(next[4]).toBe(1); // +,− tie → keeps +
    expect(next[7]).toBe(-1); // isolated: tie at 0, keeps −
    expect(next[1]).toBe(-1); // single neighbour 0 is −
    const cur2 = Int8Array.from([-1, 1, 1, -1, -1, 1, -1, 1]);
    expect(stepCsr(g, cur2)[4]).toBe(-1); // tie keeps −
    expect(stepCsr(g, cur2)[7]).toBe(1);
  });
  it('fresh step with p = 1 equals the step on the complete graph', () => {
    const n = 9;
    const edges: [number, number][] = [];
    for (let v = 1; v < n; v++) for (let w = 0; w < v; w++) edges.push([v, w]);
    const g = fromEdges(n, edges);
    const cur = Int8Array.from([1, 1, 1, 1, -1, -1, -1, -1, 1]);
    expect(Array.from(stepFresh(n, 1, cur, new Rng(0)))).toEqual(Array.from(stepCsr(g, cur)));
  });
  it('initial coloring has exactly ⌊N/2⌋+⌊τ√N⌋ plus vertices', () => {
    const c = initialColoring(1001, 0.7, new Rng(3));
    const plus = c.filter((x) => x === 1).length;
    expect(plus).toBe(500 + Math.floor(0.7 * Math.sqrt(1001)));
    expect(lead(c)).toBe(2 * plus - 1001);
  });
  it('the whole simulation is reproducible from its seed', () => {
    const run = () => {
      const g = sampleGnp(3000, 0.01, new Rng(subSeed(5, 1)));
      const c = initialColoring(3000, 0.5, new Rng(subSeed(5, 2)));
      return runFixed(g, c, 5).map(lead);
    };
    expect(run()).toEqual(run());
  });
  it("uses Theorem 1.1's day count", () => {
    expect(theoremDays(0.6)).toBe(7);
    expect(theoremDays(0.75)).toBe(11);
    expect(expansionDays(0.6)).toBe(3);
  });
});

describe('history classes', () => {
  it('encodes histories with day 1 as the first letter and 1 ↔ −1', () => {
    const days = [Int8Array.from([1, 1, -1, -1]), Int8Array.from([1, -1, 1, -1]), Int8Array.from([-1, -1, 1, 1])];
    const codes = historyCodes(days, 3);
    expect(Array.from(codes).map((c) => historyLabel(c, 3))).toEqual(['++−', '+−−', '−++', '−−+']);
    expect(parseHistory('+−−')).toBe(codes[1]);
    expect(parseHistory('-++')).toBe(codes[2]);
    expect(historyLabel(mirror(parseHistory('+−−'), 3), 3)).toBe('−++');
    expect(lastOpinion(parseHistory('+−'), 2)).toBe(-1);
    const sizes = classSizes(codes, 3);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(4);
    expect(sizes[parseHistory('++−')]).toBe(1);
    expect(sizes[parseHistory('+++')]).toBe(0);
  });
  it('coarser partitions are unions of finer ones (refinement)', () => {
    const g = sampleGnp(800, 0.02, new Rng(11));
    const days = runFixed(g, initialColoring(800, 0.5, new Rng(12)), 4);
    const c3 = historyCodes(days, 3);
    const c2 = historyCodes(days, 2);
    for (let v = 0; v < 800; v++) expect(c3[v] & 3).toBe(c2[v]);
  });
});

describe('block-pair edge counts', () => {
  // Hand-checked: classes A = {0,1,2}, B = {3,4}.
  // Edges: 0–1, 1–2 (inside A), 0–3, 2–3, 2–4 (A–B), 3–4 (inside B).
  const g = fromEdges(5, [
    [0, 1],
    [1, 2],
    [0, 3],
    [2, 3],
    [2, 4],
    [3, 4],
  ]);
  const cls = Int32Array.from([0, 0, 0, 1, 1]);
  it('counts incidences: m[s,t] = e(s,t), m[s,s] = 2e(s)', () => {
    const m = blockPairCounts(g, cls, 2);
    expect(Array.from(m)).toEqual([4, 3, 3, 2]);
  });
  it('agrees with the streamed count', () => {
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [0, 3],
      [2, 3],
      [2, 4],
      [3, 4],
    ];
    const m = blockPairCountsFromStream(cls, 2, (visit) => edges.forEach(([a, b]) => visit(a, b)));
    expect(Array.from(m)).toEqual([4, 3, 3, 2]);
  });
  it('ignores vertices with class −1', () => {
    const m = blockPairCounts(g, Int32Array.from([0, 0, -1, 1, 1]), 2);
    expect(Array.from(m)).toEqual([2, 1, 1, 2]);
  });
  it('row sums of m equal the per-vertex degree sums', () => {
    const G = sampleGnp(600, 0.03, new Rng(4));
    const days = runFixed(G, initialColoring(600, 0.5, new Rng(5)), 3);
    const codes = historyCodes(days, 3);
    const m = blockPairCounts(G, Int32Array.from(codes), 8);
    for (let s = 0; s < 8; s++) {
      let row = 0;
      let deg = 0;
      for (let t = 0; t < 8; t++) row += m[s * 8 + t];
      for (let v = 0; v < 600; v++) if (codes[v] === s) deg += G.offsets[v + 1] - G.offsets[v];
      expect(row).toBe(deg);
      for (let t = 0; t < 8; t++) expect(m[s * 8 + t]).toBe(m[t * 8 + s]);
      expect(m[s * 8 + s] % 2).toBe(0);
    }
  });
  it('degreesInto and imbalances match hand counts', () => {
    const codes = Uint32Array.from([0, 0, 0, 1, 1]);
    expect(Array.from(degreesInto(g, codes, 0, (c) => c === 1))).toEqual([1, 0, 2]);
    const op = Int8Array.from([1, 1, 1, -1, -1]);
    expect(Array.from(imbalances(g, codes, 1, op))).toEqual([1, 0]);
  });
});
