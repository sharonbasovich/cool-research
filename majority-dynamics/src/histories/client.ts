import type {
  DegreeRequest,
  DegreeResult,
  EnsembleRequest,
  EnsembleResult,
  MatrixRequest,
  MatrixResult,
  SimParams,
  SimResult,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (d: number, t: number) => void };

/**
 * Two workers: one holds the explorer's graph (simulate / matrix / degrees),
 * the other runs the fresh-vs-reused ensemble so the two never block each other.
 */
export class SimClient {
  private next = 1;
  private pending = new Map<number, Pending>();
  private explorer = this.spawn();
  private batch = this.spawn();

  private spawn(): Worker {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') {
        p.progress?.(msg.done, msg.total);
        return;
      }
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(msg.result);
    };
    return w;
  }

  private call<T>(w: Worker, req: WorkerRequest, progress?: (d: number, t: number) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (v: unknown) => void, reject, progress });
      w.postMessage(req);
    });
  }

  simulate(params: SimParams): Promise<SimResult> {
    return this.call(this.explorer, { id: this.next++, type: 'simulate', params });
  }
  matrix(req: MatrixRequest): Promise<MatrixResult> {
    return this.call(this.explorer, { id: this.next++, type: 'matrix', req });
  }
  degrees(req: DegreeRequest): Promise<DegreeResult> {
    return this.call(this.explorer, { id: this.next++, type: 'degrees', req });
  }
  ensemble(req: EnsembleRequest, progress: (d: number, t: number) => void): Promise<EnsembleResult> {
    return this.call(this.batch, { id: this.next++, type: 'ensemble', req }, progress);
  }
}
