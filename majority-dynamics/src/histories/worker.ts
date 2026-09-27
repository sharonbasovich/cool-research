/// <reference lib="webworker" />
import { Engine, ensemble } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

const engine = new Engine();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'simulate':
        post({ id: msg.id, type: 'simulate', result: engine.simulate(msg.params) });
        break;
      case 'matrix':
        post({ id: msg.id, type: 'matrix', result: engine.matrix(msg.req) });
        break;
      case 'degrees':
        post({ id: msg.id, type: 'degrees', result: engine.degrees(msg.req) });
        break;
      case 'ensemble':
        post({
          id: msg.id,
          type: 'ensemble',
          result: ensemble(msg.req, (done, total) => post({ id: msg.id, type: 'progress', done, total })),
        });
        break;
    }
  } catch (e) {
    post({ id: msg.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
