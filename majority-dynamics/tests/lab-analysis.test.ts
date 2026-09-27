import { describe, expect, it } from 'vitest';
import { amplificationPoints, exactDay1Ratio, exactNextLead, lgamma, noIsolatedMinorityProb, successPoint, thetaOf, wilson, type RunResult } from '../src/lab/analysis';
import { FRESH_CONST, type RunSpec, type TrialResult } from '../src/lab/sim';

const spec: RunSpec = { n: 1000, p: 0.01, init: 'fixed', tau: 1, trials: 3, seed: 1, maxDays: 10 };
const trial = (lead: number[], outcome: TrialResult['outcome'] = 'majority'): TrialResult => ({ lead, outcome, unanimousDay: outcome === 'majority' ? lead.length : null, edges: 0, isolatedMinority: 0 });

describe('analysis', () => {
  it('lgamma matches factorials', () => {
    expect(lgamma(1)).toBeCloseTo(0, 12);
    expect(lgamma(11)).toBeCloseTo(Math.log(3628800), 10);
  });
  it('wilson interval contains the estimate', () => {
    const [lo, hi] = wilson(7, 10);
    expect(lo).toBeLessThan(0.7);
    expect(hi).toBeGreaterThan(0.7);
    expect(wilson(0, 10)[0]).toBe(0);
  });
  it('effective theta', () => {
    expect(thetaOf({ n: 1e6, p: 1e6 ** -0.7 })).toBeCloseTo(0.7, 12);
    expect(thetaOf({ n: 1e6, p: 1e-4, theta: 0.5 })).toBe(0.5);
  });
  it('amplification ignores saturated transitions', () => {
    const run: RunResult = { spec, trials: [trial([10, 30, 500, 1000]), trial([10, 40, 600, 1000]), trial([10, 35, 900, 1000])] };
    const pts = amplificationPoints(run);
    expect(pts).toHaveLength(1);
    expect(pts[0].day).toBe(1);
    expect(pts[0].ratio).toBeCloseTo(3.5, 12);
  });
  it('success counts only initial-majority unanimity', () => {
    const run: RunResult = { spec, trials: [trial([10, 1000]), trial([10, 20], 'stuck'), trial([10, -1000], 'minority')] };
    const s = successPoint(run);
    expect([s.successes, s.trials]).toEqual([1, 3]);
  });
  it('exact next lead: tiny case by enumeration', () => {
    // n+ = 2, n- = 1, p = 1/2: enumerate the 3 possible edges directly.
    const p = 0.5;
    let e = 0;
    for (let mask = 0; mask < 8; mask++) {
      const edges = [[0, 1], [0, 2], [1, 2]].filter((_, i) => mask & (1 << i));
      const op = [1, 1, -1];
      const w = 0.125;
      for (let v = 0; v < 3; v++) {
        let s = 0;
        for (const [a, b] of edges) if (a === v) s += op[b]; else if (b === v) s += op[a];
        e += w * (s > 0 ? 1 : s < 0 ? -1 : op[v]);
      }
    }
    expect(exactNextLead(2, 1, p)).toBeCloseTo(e, 10);
  });
  it('exact day-1 ratio approaches sqrt(2/pi) sqrt(pN) for large pN', () => {
    const pn = 400;
    expect(exactDay1Ratio(1e6, pn, 1) / (FRESH_CONST * Math.sqrt(pn))).toBeCloseTo(1, 2);
  });
  it('isolated-minority heuristic is ~exp(-1/2) at pN = log N with half the vertices in the minority', () => {
    const n = 1e6;
    expect(noIsolatedMinorityProb(n, Math.log(n), n / 2)).toBeCloseTo(Math.exp(-0.5), 3);
  });
});
