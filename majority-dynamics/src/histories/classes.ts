import type { Csr } from './graph';
import type { Opinions } from './dynamics';

/**
 * Opinion-history codes. A history through day t is encoded as a t-bit
 * integer whose bit r−1 is 1 iff the day-r opinion was −1, matching the
 * paper's convention (0 ↔ +1, 1 ↔ −1, first day = most significant letter).
 */
export function historyCodes(days: Opinions[], t: number): Uint32Array {
  const n = days[0].length;
  const codes = new Uint32Array(n);
  for (let r = 0; r < t; r++) {
    const c = days[r];
    const bit = 1 << r;
    for (let v = 0; v < n; v++) if (c[v] < 0) codes[v] |= bit;
  }
  return codes;
}

/** "+−+" style label for a code of length t (day 1 first). */
export function historyLabel(code: number, t: number): string {
  let s = '';
  for (let r = 0; r < t; r++) s += (code >> r) & 1 ? '−' : '+';
  return s;
}

export function parseHistory(label: string): number {
  let code = 0;
  for (let r = 0; r < label.length; r++) {
    const ch = label[r];
    if (ch === '-' || ch === '−') code |= 1 << r;
    else if (ch !== '+') throw new Error(`bad history letter ${ch}`);
  }
  return code;
}

/** The color-flipped history s̄. */
export function mirror(code: number, t: number): number {
  return (code ^ ((1 << t) - 1)) >>> 0;
}

/** Opinion (+1/−1) on the last recorded day of a history of length t. */
export function lastOpinion(code: number, t: number): 1 | -1 {
  return (code >> (t - 1)) & 1 ? -1 : 1;
}

/** Sizes of all 2^t classes (dense array indexed by code). */
export function classSizes(codes: Uint32Array, t: number): Float64Array {
  const sizes = new Float64Array(1 << t);
  for (let v = 0; v < codes.length; v++) sizes[codes[v]]++;
  return sizes;
}

/**
 * Block-pair incidence counts m[s,t] = Σ_{x∈V_s} deg_{V_t}(x) over the given
 * list of class indices (−1 = ignored vertex). Thus m[s,t] = e(V_s,V_t) for
 * s ≠ t and m[s,s] = 2 e(V_s). Returned row-major, size k×k.
 */
export function blockPairCounts(g: Csr, cls: Int32Array, k: number): Float64Array {
  const m = new Float64Array(k * k);
  const { offsets, adj } = g;
  for (let v = 0; v < g.n; v++) {
    const a = cls[v];
    if (a < 0) continue;
    const row = a * k;
    for (let i = offsets[v]; i < offsets[v + 1]; i++) {
      const b = cls[adj[i]];
      if (b >= 0) m[row + b]++;
    }
  }
  return m;
}

/** Same counts for an edge stream (used for a freshly resampled graph). */
export function blockPairCountsFromStream(
  cls: Int32Array,
  k: number,
  stream: (visit: (v: number, w: number) => void) => void,
): Float64Array {
  const m = new Float64Array(k * k);
  stream((v, w) => {
    const a = cls[v];
    const b = cls[w];
    if (a < 0 || b < 0) return;
    m[a * k + b]++;
    m[b * k + a]++;
  });
  return m;
}

/** Number of vertex pairs available to block pair (s,t): n_s n_t, or n_s(n_s−1) on the diagonal (ordered). */
export function pairSlots(ns: number, nt: number, same: boolean): number {
  return same ? ns * (ns - 1) : ns * nt;
}

/** Degrees d[x, B] for each x ∈ A, where A and B are sets of codes. */
export function degreesInto(g: Csr, codes: Uint32Array, a: number, bSet: (code: number) => boolean): Int32Array {
  const out: number[] = [];
  const { offsets, adj } = g;
  for (let v = 0; v < g.n; v++) {
    if (codes[v] !== a) continue;
    let d = 0;
    for (let i = offsets[v]; i < offsets[v + 1]; i++) if (bSet(codes[adj[i]])) d++;
    out.push(d);
  }
  return Int32Array.from(out);
}

/** Signed neighbour imbalance Σ_y c_r(y) for each x with code a, on day r (0-based). */
export function imbalances(g: Csr, codes: Uint32Array, a: number, opinions: Opinions): Int32Array {
  const out: number[] = [];
  const { offsets, adj } = g;
  for (let v = 0; v < g.n; v++) {
    if (codes[v] !== a) continue;
    let s = 0;
    for (let i = offsets[v]; i < offsets[v + 1]; i++) s += opinions[adj[i]];
    out.push(s);
  }
  return Int32Array.from(out);
}
