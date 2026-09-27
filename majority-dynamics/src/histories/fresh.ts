/** Exact and asymptotic one-step predictions for a freshly sampled G(N, p). */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Binomial(n, p) pmf on [lo, hi] (clipped to [0, n]); returns {lo, pmf}. */
export function binomialPmf(n: number, p: number, lo = 0, hi = n): { lo: number; pmf: Float64Array } {
  lo = Math.max(0, Math.floor(lo));
  hi = Math.min(n, Math.ceil(hi));
  const pmf = new Float64Array(Math.max(0, hi - lo + 1));
  if (p <= 0 || p >= 1) {
    const k = p <= 0 ? 0 : n;
    if (k >= lo && k <= hi) pmf[k - lo] = 1;
    return { lo, pmf };
  }
  const lnC = logGamma(n + 1);
  const lp = Math.log(p);
  const lq = Math.log1p(-p);
  for (let k = lo; k <= hi; k++) {
    pmf[k - lo] = Math.exp(lnC - logGamma(k + 1) - logGamma(n - k + 1) + k * lp + (n - k) * lq);
  }
  return { lo, pmf };
}

function window(n: number, p: number): [number, number] {
  const mu = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  return [mu - 12 * sd - 5, mu + 12 * sd + 5];
}

/** P(X > Y), P(X = Y) for independent X ~ Bin(a, p), Y ~ Bin(b, p). */
export function compareBinomials(a: number, b: number, p: number): { greater: number; equal: number } {
  const [xl, xh] = window(a, p);
  const [yl, yh] = window(b, p);
  const X = binomialPmf(a, p, xl, xh);
  const Y = binomialPmf(b, p, yl, yh);
  const tail = new Float64Array(X.pmf.length + 1);
  for (let i = X.pmf.length - 1; i >= 0; i--) tail[i] = tail[i + 1] + X.pmf[i];
  let greater = 0;
  let equal = 0;
  for (let j = 0; j < Y.pmf.length; j++) {
    const y = Y.lo + j;
    const idxEq = y - X.lo;
    const idxGt = idxEq + 1;
    const pGt = idxGt <= 0 ? tail[0] : idxGt >= X.pmf.length ? 0 : tail[idxGt];
    const pEq = idxEq >= 0 && idxEq < X.pmf.length ? X.pmf[idxEq] : 0;
    greater += Y.pmf[j] * pGt;
    equal += Y.pmf[j] * pEq;
  }
  return { greater, equal };
}

/**
 * Expected next lead if the next update used a brand-new G(N, p), starting from
 * nPlus vertices of opinion +1. Exact, including the tie rule and the fact that
 * a vertex is not its own neighbour.
 */
export function freshExpectedNextLead(N: number, nPlus: number, p: number): number {
  const nMinus = N - nPlus;
  let ePlus = 0;
  if (nPlus > 0) {
    const r = compareBinomials(nPlus - 1, nMinus, p);
    ePlus += nPlus * (r.greater + r.equal);
  }
  if (nMinus > 0) {
    const r = compareBinomials(nPlus, nMinus - 1, p);
    ePlus += nMinus * r.greater;
  }
  return 2 * ePlus - N;
}

/** The essay's heuristic amplification factor √(2/π)·√(pN). */
export function heuristicFactor(N: number, p: number): number {
  return Math.sqrt(2 / Math.PI) * Math.sqrt(p * N);
}
