export interface SimParams {
  N: number;
  theta: number;
  tau: number;
  seed: number;
}

export interface SimResult {
  params: SimParams;
  p: number;
  days: number;
  edges: number;
  /** Lead Δ_t for t = 1..days on the fixed graph. */
  leads: number[];
  /** Lead when a fresh G(N,p) is drawn for every update (same initial coloring). */
  freshLeads: number[];
  /** sizes[t-1][code] for histories of length t on the fixed graph. */
  sizes: Float64Array[];
  /** Same for the fresh-graph process. */
  freshSizes: Float64Array[];
  elapsedMs: number;
}

export interface MatrixRequest {
  day: number;
  /** Keep at most this many classes (largest first); the rest are pooled as "other". */
  maxClasses: number;
}

export interface MatrixResult {
  day: number;
  /** Class codes in display order; −1 denotes the pooled "other" class. */
  codes: number[];
  sizes: number[];
  /** Incidence counts m[s,t] (row-major) on the real graph. */
  real: Float64Array;
  /** The same counts on an independent G(N,p) with the same partition. */
  resampled: Float64Array;
}

/** A single class at the query day, or every vertex whose day-`day` opinion is `sign`. */
export type Target = { kind: 'class'; code: number } | { kind: 'opinion'; sign: 1 | -1; day: number };

export interface DegreeRequest {
  day: number;
  source: number;
  target: Target;
}

export interface DegreeResult {
  day: number;
  source: number;
  target: Target;
  sourceSize: number;
  targetSize: number;
  /** Whether the source class is contained in the target set (then the binomial has one fewer trial). */
  overlap: boolean;
  real: Int32Array;
  resampled: Int32Array;
  /** Signed neighbour imbalance behind the source's last decision (day−1 opinions), on the real graph. */
  lastDecisionReal: Int32Array | null;
  lastDecisionResampled: Int32Array | null;
}

export interface EnsembleRequest {
  params: SimParams;
  runs: number;
}

export interface EnsembleResult {
  params: SimParams;
  p: number;
  days: number;
  reused: number[][];
  fresh: number[][];
  /** For each reused run and step t→t+1: E[Δ_{t+1}] under a fresh graph, given the reused Δ_t. */
  freshExpected: number[][];
  /** P(c_3 = c_1 | c_2 ≠ c_1), per run, for reused and fresh processes. */
  echoReused: number[];
  echoFresh: number[];
}

export type WorkerRequest =
  | { id: number; type: 'simulate'; params: SimParams }
  | { id: number; type: 'matrix'; req: MatrixRequest }
  | { id: number; type: 'degrees'; req: DegreeRequest }
  | { id: number; type: 'ensemble'; req: EnsembleRequest };

export type WorkerResponse =
  | { id: number; type: 'simulate'; result: SimResult }
  | { id: number; type: 'matrix'; result: MatrixResult }
  | { id: number; type: 'degrees'; result: DegreeResult }
  | { id: number; type: 'ensemble'; result: EnsembleResult }
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'error'; message: string };

/** Largest graph the page will build (edges); keeps memory well under ~200 MB. */
export const MAX_EXPECTED_EDGES = 20_000_000;

export function expectedEdges(N: number, theta: number): number {
  return ((N * (N - 1)) / 2) * N ** -theta;
}
