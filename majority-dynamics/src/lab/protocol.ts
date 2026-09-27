import type { RunSpec, TrialResult } from './sim';

export interface WorkerRequest {
  jobId: number;
  specs: RunSpec[];
}

export type WorkerResponse =
  | { type: 'trial'; jobId: number; specIndex: number; trialIndex: number; result: TrialResult; ms: number }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; message: string };
