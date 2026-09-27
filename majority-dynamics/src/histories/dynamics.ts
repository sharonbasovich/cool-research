import { forEachGnpEdge, type Csr } from './graph';
import type { Rng } from './rng';

/** Opinions are stored as +1 / -1 in an Int8Array. */
export type Opinions = Int8Array;

/**
 * Initial coloring with exactly floor(n/2) + floor(tau * sqrt(n)) vertices of
 * opinion +1, placed uniformly at random (the theorem allows any placement).
 */
export function initialColoring(n: number, tau: number, rng: Rng): Opinions {
  const plus = Math.min(n, Math.floor(n / 2) + Math.floor(tau * Math.sqrt(n)));
  const c = new Int8Array(n).fill(-1);
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = 0; i < plus; i++) {
    const j = i + rng.int(n - i);
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
    c[idx[i]] = 1;
  }
  return c;
}

/** One simultaneous majority update; a tied neighbourhood keeps its opinion. */
export function stepCsr(g: Csr, cur: Opinions): Opinions {
  const next = new Int8Array(g.n);
  const { offsets, adj } = g;
  for (let v = 0; v < g.n; v++) {
    let s = 0;
    for (let i = offsets[v]; i < offsets[v + 1]; i++) s += cur[adj[i]];
    next[v] = s > 0 ? 1 : s < 0 ? -1 : cur[v];
  }
  return next;
}

/** One update on a freshly sampled G(n, p), streamed without storing the graph. */
export function stepFresh(n: number, p: number, cur: Opinions, rng: Rng): Opinions {
  const sum = new Int32Array(n);
  forEachGnpEdge(n, p, rng, (v, w) => {
    sum[v] += cur[w];
    sum[w] += cur[v];
  });
  const next = new Int8Array(n);
  for (let v = 0; v < n; v++) next[v] = sum[v] > 0 ? 1 : sum[v] < 0 ? -1 : cur[v];
  return next;
}

/** Lead Δ = #(+1) − #(−1). */
export function lead(c: Opinions): number {
  let s = 0;
  for (let i = 0; i < c.length; i++) s += c[i];
  return s;
}

/** Days 1..days on a fixed graph; index 0 is day 1 (the initial coloring). */
export function runFixed(g: Csr, initial: Opinions, days: number): Opinions[] {
  const out: Opinions[] = [initial];
  for (let d = 1; d < days; d++) out.push(stepCsr(g, out[d - 1]));
  return out;
}

/** Theorem 1.1's day count k = 2⌊1/(1−θ)⌋ + 3. */
export function theoremDays(theta: number): number {
  return 2 * Math.floor(1 / (1 - theta) + 1e-12) + 3;
}

/** End of the expansion phase, K = ⌊1/(1−θ)⌋ + 1 (Corollary 5.9). */
export function expansionDays(theta: number): number {
  return Math.floor(1 / (1 - theta) + 1e-12) + 1;
}
