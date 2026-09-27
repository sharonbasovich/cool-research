import { describe, expect, it } from 'vitest';
import {
  csrFromEdges,
  freshLinear,
  freshSaturating,
  hashSeed,
  initialOpinions,
  makeRng,
  runDynamics,
  runTrial,
  sampleGnp,
  step,
  theoremDays,
  type RunSpec,
} from '../src/lab/sim';

const ops = (xs: number[]): Int8Array => Int8Array.from(xs);

describe('PRNG', () => {
  it('is deterministic and uniform-ish on [0,1)', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 20000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 0.5)).toBeLessThan(0.01);
    expect(makeRng(43)()).not.toBe(makeRng(42)());
  });
  it('hashSeed separates nearby inputs', () => {
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(1, 2, 4));
    expect(hashSeed(1, 2.5)).not.toBe(hashSeed(1, 2.6));
  });
});

describe('update rule on hand-checked graphs', () => {
  it('keeps the current opinion on a tie', () => {
    // Path 0-1-2: vertex 1 sees one +1 and one -1.
    const g = csrFromEdges(3, [[0, 1], [1, 2]]);
    for (const own of [1, -1]) {
      const next = new Int8Array(3);
      step(g, ops([1, own, -1]), next);
      expect(next[1]).toBe(own);
    }
  });
  it('isolated vertices never change', () => {
    const g = csrFromEdges(3, [[0, 1]]);
    const next = new Int8Array(3);
    step(g, ops([1, 1, -1]), next);
    expect([...next]).toEqual([1, 1, -1]);
  });
  it('star: centre follows leaves, leaves follow centre', () => {
    // Centre 0 with leaves 1..4; leaves are +,+,+,-; centre -.
    const g = csrFromEdges(5, [[0, 1], [0, 2], [0, 3], [0, 4]]);
    const next = new Int8Array(5);
    const total = step(g, ops([-1, 1, 1, 1, -1]), next);
    expect([...next]).toEqual([1, -1, -1, -1, -1]);
    expect(total).toBe(-3);
  });
  it('does not count a vertex as its own neighbour', () => {
    // Triangle 0,1,2 plus pendant 3 on 0. Vertex 0 sees 1:+, 2:-, 3:- -> -1 despite being +.
    const g = csrFromEdges(4, [[0, 1], [1, 2], [0, 2], [0, 3]]);
    const next = new Int8Array(4);
    step(g, ops([1, 1, -1, -1]), next);
    expect([...next]).toEqual([-1, 1, 1, 1]);
  });
  it('a zero initial lead is reported as a tie', () => {
    const c4 = csrFromEdges(4, [[0, 1], [1, 2], [2, 3], [3, 0]]);
    expect(runDynamics(c4, ops([1, -1, 1, -1]), 10).outcome).toBe('tie');
  });
  it('K_{3,3} with sides swapping is detected as a 2-cycle (stuck)', () => {
    const k33 = csrFromEdges(6, [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]]);
    // Side A = {0,1,2} all +; side B = {3,4,5} is (-,-,+). Day 2: A sees (-,-,+) -> all -, B sees all + -> all +.
    // Day 3: A -> +, B -> -. Day 4 repeats day 2.
    const r = runDynamics(k33, ops([1, 1, 1, -1, -1, 1]), 10);
    expect(r.lead).toEqual([2, 0, 0, 0]);
    expect(r.outcome).toBe('stuck');
  });
});

describe('dynamics', () => {
  it('unanimity is absorbing', () => {
    const g = sampleGnp(500, 0.02, 7);
    const all = new Int8Array(500).fill(1);
    const next = new Int8Array(500);
    expect(step(g, all, next)).toBe(500);
    expect([...next].every((x) => x === 1)).toBe(true);
    const minus = new Int8Array(500).fill(-1);
    expect(step(g, minus, next)).toBe(-500);
  });
  it('complete graph: the majority wins in one update', () => {
    const g = sampleGnp(51, 1, 1);
    expect(g.edges).toBe((51 * 50) / 2);
    const op = new Int8Array(51).fill(-1);
    op.fill(1, 0, 26);
    const r = runDynamics(g, op, 5);
    expect(r.outcome).toBe('majority');
    expect(r.unanimousDay).toBe(2);
    expect(r.lead).toEqual([1, 51]);
  });
  it('orients the lead toward the initial majority', () => {
    const g = sampleGnp(51, 1, 1);
    const op = new Int8Array(51).fill(1);
    op.fill(-1, 0, 30);
    const r = runDynamics(g, op, 5);
    expect(r.lead[0]).toBe(9);
    expect(r.outcome).toBe('majority');
  });
  it('fixed initial colouring has exactly floor(N/2)+floor(tau sqrt N) plus-vertices', () => {
    const op = initialOpinions(10001, { init: 'fixed', tau: 1.3 }, makeRng(3));
    expect(op.reduce((s, x) => s + (x === 1 ? 1 : 0), 0)).toBe(5000 + Math.floor(1.3 * Math.sqrt(10001)));
  });
  it('runTrial is deterministic under a seed and varies with it', () => {
    const spec: RunSpec = { n: 5000, p: 20 / 5000, init: 'fixed', tau: 1, trials: 1, seed: 11, maxDays: 30 };
    expect(runTrial(spec, 0)).toEqual(runTrial(spec, 0));
    expect(runTrial(spec, 0).lead).not.toEqual(runTrial(spec, 1).lead);
    expect(runTrial({ ...spec, seed: 12 }, 0).lead).not.toEqual(runTrial(spec, 0).lead);
  });
  it('denser graph at theta=0.6 reaches unanimity within k(theta)', () => {
    const n = 20000;
    const r = runTrial({ n, p: n ** -0.6, init: 'fixed', tau: 1, trials: 1, seed: 5, maxDays: 30 }, 0);
    expect(r.outcome).toBe('majority');
    expect(r.unanimousDay).toBeLessThanOrEqual(theoremDays(0.6));
  });
});

describe('G(N,p) sampler', () => {
  it('produces a simple symmetric graph', () => {
    const g = sampleGnp(2000, 0.01, 3);
    const seen = new Set<number>();
    for (let v = 0; v < g.n; v++) {
      for (let i = g.offsets[v]; i < g.offsets[v + 1]; i++) {
        const w = g.adj[i];
        expect(w).not.toBe(v);
        const key = v * g.n + w;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    for (const key of seen) {
      const v = Math.floor(key / g.n);
      const w = key % g.n;
      expect(seen.has(w * g.n + v)).toBe(true);
    }
    expect(g.adj.length).toBe(2 * g.edges);
  });
  it('edge count has mean p N(N-1)/2', () => {
    const n = 3000;
    const p = 0.004;
    const reps = 40;
    let total = 0;
    for (let s = 0; s < reps; s++) total += sampleGnp(n, p, 100 + s).edges;
    const mu = (p * n * (n - 1)) / 2;
    const sdOfMean = Math.sqrt(mu * (1 - p)) / Math.sqrt(reps);
    expect(Math.abs(total / reps - mu)).toBeLessThan(4 * sdOfMean);
  });
  it('every pair appears with probability p (small N, many samples)', () => {
    const n = 6;
    const p = 0.3;
    const counts = new Map<string, number>();
    const reps = 20000;
    for (let s = 0; s < reps; s++) {
      const g = sampleGnp(n, p, s);
      for (let v = 0; v < n; v++) for (let i = g.offsets[v]; i < g.offsets[v + 1]; i++) if (g.adj[i] < v) counts.set(`${v},${g.adj[i]}`, (counts.get(`${v},${g.adj[i]}`) ?? 0) + 1);
    }
    expect(counts.size).toBe(15);
    const sd = Math.sqrt((p * (1 - p)) / reps);
    for (const c of counts.values()) expect(Math.abs(c / reps - p)).toBeLessThan(5 * sd);
  });
  it('handles p = 0 and p = 1', () => {
    expect(sampleGnp(100, 0, 1).edges).toBe(0);
    expect(sampleGnp(10, 1, 1).edges).toBe(45);
  });
});

describe('theory helpers', () => {
  it('k(theta) matches 2 floor(1/(1-theta)) + 3', () => {
    expect(theoremDays(0.55)).toBe(7);
    expect(theoremDays(0.7)).toBe(9);
    expect(theoremDays(0.75)).toBe(11);
    expect(theoremDays(0.9)).toBe(23);
    expect(theoremDays(0.8)).toBe(13);
    expect(theoremDays(2 / 3)).toBe(9);
  });
  it('saturating fresh-graph recursion linearises to the sqrt(2/pi) sqrt(pN) law and caps at N', () => {
    const n = 1e8;
    const p = 100 / n;
    const [, d1] = freshSaturating(1000, n, p, 2);
    const [, l1] = freshLinear(1000, 100, 2);
    expect(d1 / l1).toBeCloseTo(1, 3);
    expect(Math.max(...freshSaturating(1e4, 1e6, 1e-4, 10))).toBeLessThanOrEqual(1e6);
  });
});
