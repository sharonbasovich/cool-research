import { historyLabel, lastOpinion, mirror } from './classes';

export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : NaN;
}

export function sd(xs: ArrayLike<number>): number {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return xs.length > 1 ? Math.sqrt(s / (xs.length - 1)) : NaN;
}

export function histogram(xs: ArrayLike<number>): Map<number, number> {
  const h = new Map<number, number>();
  for (let i = 0; i < xs.length; i++) h.set(xs[i], (h.get(xs[i]) ?? 0) + 1);
  return h;
}

export interface CellStat {
  observed: number;
  expected: number;
  ratio: number;
  z: number;
  slots: number;
}

/**
 * Compare a block-pair incidence count with G(N,p). Off the diagonal m = e(s,t);
 * on the diagonal m = 2e(s), and the comparison is made for e(s) against
 * C(n_s,2) available pairs.
 */
export function cellStat(m: number, ns: number, nt: number, same: boolean, p: number): CellStat {
  const observed = same ? m / 2 : m;
  const slots = same ? (ns * (ns - 1)) / 2 : ns * nt;
  const expected = p * slots;
  const variance = p * (1 - p) * slots;
  return {
    observed,
    expected,
    slots,
    ratio: expected > 0 ? observed / expected : NaN,
    z: variance > 0 ? (observed - expected) / Math.sqrt(variance) : NaN,
  };
}

/** Mean of z² over the upper triangle (incl. diagonal) of cells with ≥ minExpected expected edges. */
export function meanSquaredZ(m: Float64Array, sizes: number[], p: number, minExpected = 20): { value: number; cells: number } {
  const k = sizes.length;
  let s = 0;
  let c = 0;
  for (let a = 0; a < k; a++)
    for (let b = a; b < k; b++) {
      const st = cellStat(m[a * k + b], sizes[a], sizes[b], a === b, p);
      if (st.expected < minExpected || !Number.isFinite(st.z)) continue;
      s += st.z * st.z;
      c++;
    }
  return { value: c ? s / c : NaN, cells: c };
}

export interface CoherenceRow {
  day: number;
  pairs: number;
  coherent: number;
}

/**
 * Empirical check of the sign pattern in Theorem 4.9: for each mirror pair
 * {s, s̄} with s ending in +, is |V_s| > |V_s̄|? Only pairs with both classes of
 * size ≥ minSize are counted.
 */
export function coherence(sizes: Float64Array, t: number, minSize: number): CoherenceRow & { failures: string[] } {
  let pairs = 0;
  let coherent = 0;
  const failures: string[] = [];
  for (let s = 0; s < sizes.length; s++) {
    if (lastOpinion(s, t) !== 1) continue;
    const sb = mirror(s, t);
    if (sizes[s] < minSize || sizes[sb] < minSize) continue;
    pairs++;
    if (sizes[s] > sizes[sb]) coherent++;
    else failures.push(historyLabel(s, t));
  }
  return { day: t, pairs, coherent, failures };
}
