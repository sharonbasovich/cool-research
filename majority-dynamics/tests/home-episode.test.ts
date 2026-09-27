import { describe, expect, it } from 'vitest';
import { countPlus, makeEpisode } from '../src/home/episode';
import { step } from '../src/lab/sim';

describe('home background episode', () => {
  it('starts with a lead of about sqrt(N) for the chosen majority', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const e = makeEpisode(seed);
      const n = e.graph.n;
      const lead = e.majority * (2 * countPlus(e.days[0]) - n);
      expect(lead).toBeGreaterThan(0);
      expect(lead).toBeLessThanOrEqual(Math.sqrt(n) + 2);
    }
  });

  it('follows the exact majority rule on one reused graph', () => {
    const e = makeEpisode(7);
    for (let d = 1; d < e.days.length; d++) {
      const next = new Int8Array(e.graph.n);
      step(e.graph, e.days[d - 1], next);
      expect(next).toEqual(e.days[d]);
    }
  });

  it('stops at unanimity and is deterministic', () => {
    const a = makeEpisode(3);
    const b = makeEpisode(3);
    expect(a.days).toEqual(b.days);
    const last = a.days[a.days.length - 1];
    if (a.unanimous) expect(new Set(last).size).toBe(1);
    else expect(a.days.length).toBe(15);
  });

  it('shows both colors winning across seeds', () => {
    const winners = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const e = makeEpisode(seed);
      if (e.unanimous) winners.add(e.days[e.days.length - 1][0]);
    }
    expect(winners).toEqual(new Set([1, -1]));
  });
});
