import { blockPairCounts, blockPairCountsFromStream, classSizes, historyCodes } from './classes';
import { initialColoring, lead, runFixed, stepFresh, theoremDays, type Opinions } from './dynamics';
import { forEachGnpEdge, sampleGnp, edgeCount, type Csr } from './graph';
import { freshExpectedNextLead } from './fresh';
import { Rng, subSeed } from './rng';
import type {
  DegreeRequest,
  DegreeResult,
  EnsembleRequest,
  EnsembleResult,
  MatrixRequest,
  MatrixResult,
  SimParams,
  SimResult,
  Target,
} from './protocol';

/** Seed streams, so every quantity is reproducible from (params, seed). */
const STREAM = { graph: 1, coloring: 2, fresh: 3, resample: 4 } as const;

export function densityP(N: number, theta: number): number {
  return N ** -theta;
}

function runFresh(N: number, p: number, initial: Opinions, days: number, rng: Rng): Opinions[] {
  const out: Opinions[] = [initial];
  for (let d = 1; d < days; d++) out.push(stepFresh(N, p, out[d - 1], rng));
  return out;
}

function allSizes(days: Opinions[]): Float64Array[] {
  return days.map((_, i) => classSizes(historyCodes(days, i + 1), i + 1));
}

function echoRate(days: Opinions[]): number {
  if (days.length < 3) return NaN;
  const [c1, c2, c3] = days;
  let flipped = 0;
  let back = 0;
  for (let v = 0; v < c1.length; v++) {
    if (c2[v] !== c1[v]) {
      flipped++;
      if (c3[v] === c1[v]) back++;
    }
  }
  return flipped ? back / flipped : NaN;
}

/** Holds one simulated graph so that matrix / degree queries can be answered later. */
export class Engine {
  private g: Csr | null = null;
  private days: Opinions[] = [];
  private params: SimParams | null = null;
  private p = 0;

  simulate(params: SimParams): SimResult {
    const t0 = performance.now();
    const { N, theta, tau, seed } = params;
    const p = densityP(N, theta);
    const k = theoremDays(theta);
    this.g = null;
    this.days = [];
    const g = sampleGnp(N, p, new Rng(subSeed(seed, STREAM.graph)));
    const initial = initialColoring(N, tau, new Rng(subSeed(seed, STREAM.coloring)));
    const days = runFixed(g, initial, k);
    const fresh = runFresh(N, p, initial, k, new Rng(subSeed(seed, STREAM.fresh)));
    this.g = g;
    this.days = days;
    this.params = params;
    this.p = p;
    return {
      params,
      p,
      days: k,
      edges: edgeCount(g),
      leads: days.map(lead),
      freshLeads: fresh.map(lead),
      sizes: allSizes(days),
      freshSizes: allSizes(fresh),
      elapsedMs: performance.now() - t0,
    };
  }

  private require(): { g: Csr; days: Opinions[]; params: SimParams; p: number } {
    if (!this.g || !this.params) throw new Error('simulate first');
    return { g: this.g, days: this.days, params: this.params, p: this.p };
  }

  private resampleStream(day: number): (visit: (v: number, w: number) => void) => void {
    const { params, p } = this.require();
    return (visit) => forEachGnpEdge(params.N, p, new Rng(subSeed(params.seed, STREAM.resample, day)), visit);
  }

  matrix(req: MatrixRequest): MatrixResult {
    const { g, days } = this.require();
    const t = Math.min(req.day, days.length);
    const codes = historyCodes(days, t);
    const sizes = classSizes(codes, t);
    const order = Array.from(sizes.keys())
      .filter((c) => sizes[c] > 0)
      .sort((a, b) => sizes[b] - sizes[a] || a - b);
    const kept = order.slice(0, req.maxClasses);
    const pooled = order.slice(req.maxClasses);
    kept.sort((a, b) => a - b);
    const index = new Map<number, number>(kept.map((c, i) => [c, i]));
    const k = kept.length + (pooled.length ? 1 : 0);
    const cls = new Int32Array(codes.length);
    for (let v = 0; v < codes.length; v++) cls[v] = index.get(codes[v]) ?? kept.length;
    const outCodes = [...kept, ...(pooled.length ? [-1] : [])];
    const outSizes = [...kept.map((c) => sizes[c]), ...(pooled.length ? [pooled.reduce((a, c) => a + sizes[c], 0)] : [])];
    return {
      day: t,
      codes: outCodes,
      sizes: outSizes,
      real: blockPairCounts(g, cls, k),
      resampled: blockPairCountsFromStream(cls, k, this.resampleStream(t)),
    };
  }

  degrees(req: DegreeRequest): DegreeResult {
    const { g, days } = this.require();
    const t = Math.min(req.day, days.length);
    const codes = historyCodes(days, t);
    const inTarget = targetPredicate(req.target);
    const n = codes.length;
    const isSource = new Uint8Array(n);
    const isTarget = new Uint8Array(n);
    let sourceSize = 0;
    let targetSize = 0;
    for (let v = 0; v < n; v++) {
      if (codes[v] === req.source) {
        isSource[v] = 1;
        sourceSize++;
      }
      if (inTarget(codes[v])) {
        isTarget[v] = 1;
        targetSize++;
      }
    }
    const overlap = inTarget(req.source);
    const prev = t >= 2 ? days[t - 2] : null;
    const real = new Int32Array(sourceSize);
    const decReal = prev ? new Int32Array(sourceSize) : null;
    const pos = new Int32Array(n).fill(-1);
    let j = 0;
    for (let v = 0; v < n; v++) {
      if (!isSource[v]) continue;
      pos[v] = j;
      let d = 0;
      let s = 0;
      for (let i = g.offsets[v]; i < g.offsets[v + 1]; i++) {
        const w = g.adj[i];
        d += isTarget[w];
        if (prev) s += prev[w];
      }
      real[j] = d;
      if (decReal) decReal[j] = s;
      j++;
    }
    const resampled = new Int32Array(sourceSize);
    const decRes = prev ? new Int32Array(sourceSize) : null;
    this.resampleStream(t)((v, w) => {
      if (isSource[v]) {
        resampled[pos[v]] += isTarget[w];
        if (decRes && prev) decRes[pos[v]] += prev[w];
      }
      if (isSource[w]) {
        resampled[pos[w]] += isTarget[v];
        if (decRes && prev) decRes[pos[w]] += prev[v];
      }
    });
    return {
      day: t,
      source: req.source,
      target: req.target,
      sourceSize,
      targetSize,
      overlap,
      real,
      resampled,
      lastDecisionReal: decReal,
      lastDecisionResampled: decRes,
    };
  }
}

export function targetPredicate(target: Target): (code: number) => boolean {
  if (target.kind === 'class') return (c) => c === target.code;
  const bit = 1 << (target.day - 1);
  return target.sign === 1 ? (c) => (c & bit) === 0 : (c) => (c & bit) !== 0;
}

export function ensemble(req: EnsembleRequest, onProgress: (done: number, total: number) => void): EnsembleResult {
  const { N, theta, tau, seed } = req.params;
  const p = densityP(N, theta);
  const k = theoremDays(theta);
  const out: EnsembleResult = {
    params: req.params,
    p,
    days: k,
    reused: [],
    fresh: [],
    freshExpected: [],
    echoReused: [],
    echoFresh: [],
  };
  for (let r = 0; r < req.runs; r++) {
    const g = sampleGnp(N, p, new Rng(subSeed(seed, 100 + r, STREAM.graph)));
    const initial = initialColoring(N, tau, new Rng(subSeed(seed, 100 + r, STREAM.coloring)));
    const reused = runFixed(g, initial, k);
    const fresh = runFresh(N, p, initial, k, new Rng(subSeed(seed, 100 + r, STREAM.fresh)));
    const leads = reused.map(lead);
    out.reused.push(leads);
    out.fresh.push(fresh.map(lead));
    out.freshExpected.push(leads.slice(0, -1).map((d) => freshExpectedNextLead(N, (N + d) / 2, p)));
    out.echoReused.push(echoRate(reused));
    out.echoFresh.push(echoRate(fresh));
    onProgress(r + 1, req.runs);
  }
  return out;
}
