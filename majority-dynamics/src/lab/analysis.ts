import { FRESH_CONST, type RunSpec, type TrialResult } from './sim';

export interface RunResult {
  spec: RunSpec;
  trials: TrialResult[];
}

export type SweepGroup = 'pn' | 'theta';

export interface DatasetRun extends RunResult {
  group: SweepGroup;
  seconds: number;
}

export interface Dataset {
  generator: string;
  generatedAt: string;
  command: string;
  runs: DatasetRun[];
}

export const pnOf = (s: Pick<RunSpec, 'n' | 'p'>): number => s.p * s.n;

/** Effective exponent: p = N^{-theta}, i.e. theta = 1 - log(pN)/log N. */
export const thetaOf = (s: Pick<RunSpec, 'n' | 'p' | 'theta'>): number => s.theta ?? 1 - Math.log(pnOf(s)) / Math.log(s.n);

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Wilson score interval for a binomial proportion (z = 1.96). */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const ph = successes / n;
  const d = 1 + (z * z) / n;
  const c = (ph + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface AmplificationPoint {
  pn: number;
  n: number;
  /** Transition from day `day` to day `day + 1` (day 1 = initial colouring). */
  day: number;
  /** Mean of Delta_{t+1}/Delta_t over trials. */
  ratio: number;
  /** Standard error of that mean. */
  se: number;
  count: number;
}

/**
 * Measured one-day amplification ratios. A transition is kept only while the new lead is at most
 * `maxFrac * N`, so that saturation (the lead approaching N) does not masquerade as a smaller
 * amplification constant; in that range the fresh-graph recursion is within ~1% of linear.
 */
export function amplificationPoints(run: RunResult, maxDay = 4, maxFrac = 0.1): AmplificationPoint[] {
  const { n } = run.spec;
  const out: AmplificationPoint[] = [];
  for (let day = 1; day <= maxDay; day++) {
    const rs: number[] = [];
    for (const t of run.trials) {
      const a = t.lead[day - 1];
      const b = t.lead[day];
      if (a === undefined || b === undefined || a <= 0 || b > maxFrac * n) continue;
      rs.push(b / a);
    }
    if (rs.length < 2) continue;
    const m = mean(rs);
    const sd = Math.sqrt(rs.reduce((acc, r) => acc + (r - m) ** 2, 0) / (rs.length - 1));
    out.push({ pn: pnOf(run.spec), n, day, ratio: m, se: sd / Math.sqrt(rs.length), count: rs.length });
  }
  return out;
}

export interface SuccessPoint {
  pn: number;
  n: number;
  successes: number;
  trials: number;
  lo: number;
  hi: number;
  /** Trials that ended with isolated initial-minority vertices (which can never flip). */
  isolatedBlocked: number;
}

export function successPoint(run: RunResult): SuccessPoint {
  const trials = run.trials.filter((t) => t.outcome !== 'tie');
  const successes = trials.filter((t) => t.outcome === 'majority').length;
  const [lo, hi] = wilson(successes, trials.length);
  return {
    pn: pnOf(run.spec),
    n: run.spec.n,
    successes,
    trials: trials.length,
    lo,
    hi,
    isolatedBlocked: trials.filter((t) => t.isolatedMinority > 0).length,
  };
}

/**
 * Poisson heuristic for P(no isolated vertex holds the initial minority opinion), a necessary
 * condition for unanimity: exp(-m (1-p)^{N-1}) with m the initial minority size.
 */
export function noIsolatedMinorityProb(n: number, pn: number, minority: number): number {
  const p = pn / n;
  return Math.exp(-minority * Math.exp((n - 1) * Math.log1p(-p)));
}

export function initialMinority(spec: Pick<RunSpec, 'n' | 'init' | 'tau'>): number {
  const { n } = spec;
  return spec.init === 'fixed' ? n - (Math.floor(n / 2) + Math.floor(spec.tau * Math.sqrt(n))) : n / 2;
}

function logBinomPmf(n: number, p: number): (k: number) => number {
  const lp = Math.log(p);
  const lq = Math.log1p(-p);
  const lf = (m: number): number => lgamma(m + 1);
  const lfn = lf(n);
  return (k) => (k < 0 || k > n ? -Infinity : lfn - lf(k) - lf(n - k) + k * lp + (n - k) * lq);
}

/** Lanczos log-gamma (g = 7, n = 9); relative error ~1e-15 for x > 0. */
export function lgamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function pmfWindow(n: number, p: number): { k0: number; w: Float64Array } {
  const mu = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  const k0 = Math.max(0, Math.floor(mu - 12 * sd - 10));
  const k1 = Math.min(n, Math.ceil(mu + 12 * sd + 10));
  const f = logBinomPmf(n, p);
  const w = new Float64Array(k1 - k0 + 1);
  for (let k = k0; k <= k1; k++) w[k - k0] = Math.exp(f(k));
  return { k0, w };
}

/**
 * Exact expected lead after one update from a uniformly random colouring on a *fresh* G(N, p),
 * with the keep-on-tie rule: for a vertex of opinion s, X+ ~ Bin(n+ - [s=+], p), X- ~ Bin(n- - [s=-], p).
 * On day 1 -> 2 the graph really is fresh, so this is the exact E[Delta_2] (not an approximation).
 */
export function exactNextLead(nPlus: number, nMinus: number, p: number): number {
  const bias = (a: number, b: number, own: 1 | -1): number => {
    const A = pmfWindow(a, p);
    const B = pmfWindow(b, p);
    // P(X+ - X- = d) and the bias E[sign] with ties resolved to `own`.
    const cdfB = new Float64Array(B.w.length + 1);
    for (let j = 0; j < B.w.length; j++) cdfB[j + 1] = cdfB[j] + B.w[j];
    const totB = cdfB[B.w.length];
    let gt = 0;
    let eq = 0;
    for (let i = 0; i < A.w.length; i++) {
      const x = A.k0 + i;
      const jEq = x - B.k0;
      const below = Math.max(0, Math.min(B.w.length, jEq));
      gt += A.w[i] * cdfB[below];
      if (jEq >= 0 && jEq < B.w.length) eq += A.w[i] * B.w[jEq];
    }
    const lt = A.w.reduce((s, v) => s + v, 0) * totB - gt - eq;
    return gt - lt + own * eq;
  };
  return nPlus * bias(nPlus - 1, nMinus, 1) + nMinus * bias(nPlus, nMinus - 1, -1);
}

/** Exact one-day amplification Delta_2/Delta_1 on a fresh graph from a fixed lead (Theorem 1.1's colouring). */
export function exactDay1Ratio(n: number, pn: number, tau: number): number {
  const plus = Math.floor(n / 2) + Math.floor(tau * Math.sqrt(n));
  const minus = n - plus;
  return exactNextLead(plus, minus, pn / n) / (plus - minus);
}

export const freshRatio = (pn: number): number => FRESH_CONST * Math.sqrt(pn);
