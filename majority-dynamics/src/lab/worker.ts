/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './protocol';
import { runTrial } from './sim';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { jobId, specs } = e.data;
  const post = (m: WorkerResponse): void => ctx.postMessage(m);
  try {
    specs.forEach((spec, specIndex) => {
      for (let trialIndex = 0; trialIndex < spec.trials; trialIndex++) {
        const t0 = performance.now();
        const result = runTrial(spec, trialIndex);
        post({ type: 'trial', jobId, specIndex, trialIndex, result, ms: performance.now() - t0 });
      }
    });
    post({ type: 'done', jobId });
  } catch (err) {
    post({ type: 'error', jobId, message: err instanceof Error ? err.message : String(err) });
  }
};
