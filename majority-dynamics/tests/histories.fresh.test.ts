import { describe, expect, it } from 'vitest';
import { binomialPmf, compareBinomials, freshExpectedNextLead, heuristicFactor, logGamma } from '../src/histories/fresh';

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

describe('binomial helpers', () => {
  it('logGamma matches factorials', () => {
    expect(Math.exp(logGamma(6))).toBeCloseTo(120, 8);
    expect(logGamma(101)).toBeCloseTo(363.73937555556347, 8);
  });
  it('pmf sums to one and matches the formula', () => {
    const { pmf } = binomialPmf(10, 0.3);
    expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(pmf[3]).toBeCloseTo(choose(10, 3) * 0.3 ** 3 * 0.7 ** 7, 12);
  });
  it('compareBinomials matches brute force', () => {
    const a = binomialPmf(7, 0.4).pmf;
    const b = binomialPmf(5, 0.4).pmf;
    let gt = 0;
    let eq = 0;
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) {
        if (i > j) gt += a[i] * b[j];
        if (i === j) eq += a[i] * b[j];
      }
    const r = compareBinomials(7, 5, 0.4);
    expect(r.greater).toBeCloseTo(gt, 12);
    expect(r.equal).toBeCloseTo(eq, 12);
  });
});

describe('fresh-graph prediction', () => {
  it('is antisymmetric and zero at a tie', () => {
    expect(freshExpectedNextLead(1000, 500, 0.05)).toBeCloseTo(0, 8);
    expect(freshExpectedNextLead(1000, 520, 0.05)).toBeCloseTo(-freshExpectedNextLead(1000, 480, 0.05), 8);
  });
  it('small n: matches enumeration over neighbourhoods', () => {
    // N = 4, two + and two −, p = 1/2: enumerate the 3 other vertices for one vertex.
    const N = 4;
    const p = 0.5;
    const probBecomePlus = (self: 1 | -1, others: number[]) => {
      let prob = 0;
      for (let mask = 0; mask < 1 << others.length; mask++) {
        let s = 0;
        let w = 1;
        for (let i = 0; i < others.length; i++) {
          const inN = (mask >> i) & 1;
          w *= inN ? p : 1 - p;
          if (inN) s += others[i];
        }
        if (s > 0 || (s === 0 && self === 1)) prob += w;
      }
      return prob;
    };
    const ePlus = 2 * probBecomePlus(1, [1, -1, -1]) + 2 * probBecomePlus(-1, [1, 1, -1]);
    expect(freshExpectedNextLead(N, 2, p)).toBeCloseTo(2 * ePlus - N, 12);
  });
  it('approaches the √(2/π)·√(pN) heuristic when the lead is small', () => {
    const N = 1_000_000;
    const p = 100 / N;
    const delta = 200;
    const ratio = freshExpectedNextLead(N, (N + delta) / 2, p) / delta;
    const h = heuristicFactor(N, p);
    // Ties add ≈ P(tie) ≈ 1/√(2π·pN) and finite-degree corrections are O(1/pN).
    expect(Math.abs(ratio - h) / h).toBeLessThan(0.03);
  });
});
