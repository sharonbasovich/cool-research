// Exact synchronous majority dynamics on G(N, p).
// Self-contained (no imports) so the offline sweep in scripts/lab/ can run it directly under Node.

export type Rng = () => number;

function splitmix32(a: number): () => number {
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Deterministic 32-bit hash of a list of integers/floats, used to derive per-trial seeds. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const x of parts) {
    const lo = Math.floor(x) >>> 0;
    const hi = Math.floor(x / 4294967296) >>> 0;
    const frac = Math.round((x - Math.floor(x)) * 1e9) >>> 0;
    for (const w of [lo, hi, frac]) {
      h = Math.imul(h ^ w, 0x01000193);
      h ^= h >>> 15;
    }
  }
  return splitmix32(h)();
}

/** xoshiro128** seeded via splitmix32; returns uniform doubles in [0, 1) with 53 bits. */
export function makeRng(seed: number): Rng {
  const sm = splitmix32(seed | 0);
  let a = sm(), b = sm(), c = sm(), d = sm();
  if ((a | b | c | d) === 0) a = 1;
  const next = (): number => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9);
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return r >>> 0;
  };
  return () => ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Undirected simple graph in compressed sparse row form. */
export interface Csr {
  n: number;
  /** offsets[v]..offsets[v+1] indexes neighbours of v in `adj`; length n+1. */
  offsets: Float64Array;
  adj: Int32Array;
  edges: number;
}

/**
 * Visit every edge {v, w} (w < v) of G(n, p) using the geometric-skip method of
 * Batagelj & Brandes (2005): expected time O(n + pn^2/2).
 */
function forEachGnpEdge(n: number, p: number, rng: Rng, emit: (v: number, w: number) => void): void {
  if (n < 2 || p <= 0) return;
  if (p >= 1) {
    for (let v = 1; v < n; v++) for (let w = 0; w < v; w++) emit(v, w);
    return;
  }
  const logq = Math.log1p(-p);
  let v = 1;
  let w = -1;
  while (v < n) {
    const r = rng();
    w += 1 + Math.floor(Math.log1p(-r) / logq);
    while (w >= v && v < n) {
      w -= v;
      v++;
    }
    if (v < n) emit(v, w);
  }
}

export function csrFromEdges(n: number, edges: ReadonlyArray<readonly [number, number]>): Csr {
  const deg = new Float64Array(n + 1);
  for (const [u, v] of edges) {
    if (u === v) throw new Error('self-loop');
    deg[u + 1]++;
    deg[v + 1]++;
  }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const adj = new Int32Array(deg[n]);
  const fill = deg.slice(0, n);
  for (const [u, v] of edges) {
    adj[fill[u]++] = v;
    adj[fill[v]++] = u;
  }
  return { n, offsets: deg, adj, edges: edges.length };
}

/**
 * Sample G(n, p) into CSR without an intermediate edge list: the sampler is run twice from the
 * same seed (degree count, then fill), so peak memory is just the CSR arrays.
 */
export function sampleGnp(n: number, p: number, seed: number): Csr {
  const offsets = new Float64Array(n + 1);
  let edges = 0;
  forEachGnpEdge(n, p, makeRng(seed), (v, w) => {
    offsets[v + 1]++;
    offsets[w + 1]++;
    edges++;
  });
  for (let i = 0; i < n; i++) offsets[i + 1] += offsets[i];
  const adj = new Int32Array(offsets[n]);
  const fill = offsets.slice(0, n);
  forEachGnpEdge(n, p, makeRng(seed), (v, w) => {
    adj[fill[v]++] = w;
    adj[fill[w]++] = v;
  });
  return { n, offsets, adj, edges };
}

/**
 * One synchronous update: each vertex adopts the strict majority of its neighbours' opinions;
 * on a tie (including degree 0) it keeps its current opinion. Returns the new sum of opinions.
 */
export function step(g: Csr, cur: Int8Array, next: Int8Array): number {
  const { n, offsets, adj } = g;
  let total = 0;
  for (let v = 0; v < n; v++) {
    let s = 0;
    const end = offsets[v + 1];
    for (let i = offsets[v]; i < end; i++) s += cur[adj[i]];
    const o = s > 0 ? 1 : s < 0 ? -1 : cur[v];
    next[v] = o;
    total += o;
  }
  return total;
}

export type InitMode = 'fixed' | 'random';

export interface RunSpec {
  n: number;
  p: number;
  /** 'fixed': exactly floor(n/2)+floor(tau*sqrt(n)) vertices hold +1 (Theorem 1.1). 'random': fair coins (Corollary 1.3). */
  init: InitMode;
  tau: number;
  trials: number;
  seed: number;
  maxDays: number;
  /** Optional label, e.g. the theta used to pick p. */
  theta?: number;
}

export type Outcome = 'majority' | 'minority' | 'stuck' | 'maxdays' | 'tie';

export interface TrialResult {
  /**
   * Lead on day 1, 2, ...: sum of opinions oriented so that the initial majority is positive.
   * Day 1 is the initial colouring (the paper's convention). Minority size is (n - lead)/2.
   */
  lead: number[];
  outcome: Outcome;
  /** First day (paper's indexing, day 1 = initial) on which the initial majority is unanimous. */
  unanimousDay: number | null;
  edges: number;
  /** Isolated vertices holding the initial minority opinion; they can never change. */
  isolatedMinority: number;
}

export function initialOpinions(n: number, spec: Pick<RunSpec, 'init' | 'tau'>, rng: Rng): Int8Array {
  const op = new Int8Array(n);
  if (spec.init === 'random') {
    for (let v = 0; v < n; v++) op[v] = rng() < 0.5 ? 1 : -1;
    return op;
  }
  const plus = Math.min(n, Math.floor(n / 2) + Math.floor(spec.tau * Math.sqrt(n)));
  op.fill(-1);
  // Partial Fisher-Yates: a uniformly random set of `plus` vertices gets +1.
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = 0; i < plus; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
    op[perm[i]] = 1;
  }
  return op;
}

function sum(op: Int8Array): number {
  let s = 0;
  for (let i = 0; i < op.length; i++) s += op[i];
  return s;
}

function equal(a: Int8Array, b: Int8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Run the dynamics from `op` until unanimity, a fixed point or 2-cycle (synchronous majority
 * dynamics with symmetric weights always reaches period <= 2; Goles-Olivos 1980), or maxDays.
 */
export function runDynamics(g: Csr, op0: Int8Array, maxDays: number): Omit<TrialResult, 'edges' | 'isolatedMinority'> {
  const n = g.n;
  const s0 = sum(op0);
  const sign = s0 >= 0 ? 1 : -1;
  const lead = [sign * s0];
  if (s0 === 0) return { lead, outcome: 'tie', unanimousDay: null };
  let prev2 = new Int8Array(n);
  let prev = Int8Array.from(op0);
  let cur = new Int8Array(n);
  let unanimousDay: number | null = Math.abs(s0) === n ? 1 : null;
  if (unanimousDay !== null) return { lead, outcome: 'majority', unanimousDay };
  for (let day = 2; day <= maxDays; day++) {
    const s = sign * step(g, prev, cur);
    lead.push(s);
    if (s === n) {
      unanimousDay = day;
      return { lead, outcome: 'majority', unanimousDay };
    }
    if (s === -n) return { lead, outcome: 'minority', unanimousDay: null };
    if (equal(cur, prev) || (day >= 3 && equal(cur, prev2))) return { lead, outcome: 'stuck', unanimousDay: null };
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return { lead, outcome: 'maxdays', unanimousDay: null };
}

export function trialSeed(spec: RunSpec, trial: number): number {
  return hashSeed(spec.seed, spec.n, spec.p * 1e6, spec.init === 'fixed' ? spec.tau * 1000 : -1, trial);
}

export function runTrial(spec: RunSpec, trial: number): TrialResult {
  const seed = trialSeed(spec, trial);
  const g = sampleGnp(spec.n, spec.p, seed);
  const op = initialOpinions(spec.n, spec, makeRng(seed ^ 0x5bd1e995));
  const s0 = sum(op);
  const minority = s0 >= 0 ? -1 : 1;
  let isolatedMinority = 0;
  for (let v = 0; v < spec.n; v++) if (g.offsets[v] === g.offsets[v + 1] && op[v] === minority) isolatedMinority++;
  return { ...runDynamics(g, op, spec.maxDays), edges: g.edges, isolatedMinority };
}

/** k(theta) = 2 floor(1/(1-theta)) + 3 from Theorem 1.1 (with a tolerance so that e.g. theta = 0.9 gives 23, not 21). */
export function theoremDays(theta: number): number {
  return 2 * Math.floor(1 / (1 - theta) + 1e-9) + 3;
}

export const FRESH_CONST = Math.sqrt(2 / Math.PI);

/** Linear fresh-graph heuristic: Delta_{t+1} = sqrt(2/pi) * Delta_t * sqrt(pN). */
export function freshLinear(delta0: number, pn: number, days: number): number[] {
  const out = [delta0];
  for (let t = 1; t < days; t++) out.push(out[t - 1] * FRESH_CONST * Math.sqrt(pn));
  return out;
}

function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7.
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}

/**
 * Saturating fresh-graph recursion (Gaussian approximation, graph resampled every day):
 * Delta_{t+1} = N * (2 Phi(p Delta_t / sqrt(p(1-p)N)) - 1). Its small-Delta linearisation is freshLinear.
 */
export function freshSaturating(delta0: number, n: number, p: number, days: number): number[] {
  const out = [delta0];
  const sd = Math.sqrt(p * (1 - p) * n);
  for (let t = 1; t < days; t++) out.push(n * erf((p * out[t - 1]) / sd / Math.SQRT2));
  return out;
}
