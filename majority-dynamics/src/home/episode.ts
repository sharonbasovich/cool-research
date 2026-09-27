import { type Csr, initialOpinions, makeRng, sampleGnp, step } from '../lab/sim';

export interface Episode {
  graph: Csr;
  /** Opinions at the start and after each daily update, ending at unanimity or after maxDays updates. */
  days: Int8Array[];
  /** Sign of the initial majority. */
  majority: 1 | -1;
  unanimous: boolean;
}

export const EPISODE_N = 1500;
export const EPISODE_PN = 12;

/**
 * One run of majority dynamics on a single G(n, p) that is reused every day. The initial lead is
 * about sqrt(n), and the majority color is chosen at random so both colors get to win.
 */
export function makeEpisode(seed: number, n = EPISODE_N, pn = EPISODE_PN, maxDays = 14): Episode {
  const rng = makeRng(seed);
  const graph = sampleGnp(n, pn / n, Math.floor(rng() * 2 ** 32));
  const majority: 1 | -1 = rng() < 0.5 ? 1 : -1;
  const start = initialOpinions(n, { init: 'fixed', tau: 0.5 }, rng);
  if (majority < 0) for (let v = 0; v < n; v++) start[v] = -start[v] as 1 | -1;
  const days = [start];
  let unanimous = false;
  for (let d = 0; d < maxDays && !unanimous; d++) {
    const next = new Int8Array(n);
    const total = step(graph, days[days.length - 1], next);
    days.push(next);
    unanimous = Math.abs(total) === n;
  }
  return { graph, days, majority, unanimous };
}

export function countPlus(op: Int8Array): number {
  let c = 0;
  for (let i = 0; i < op.length; i++) if (op[i] > 0) c++;
  return c;
}
