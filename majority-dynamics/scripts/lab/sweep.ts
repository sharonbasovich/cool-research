// Offline sweep for the /lab page. Runs the exact same simulator as the browser (src/lab/sim.ts)
// across a worker-thread pool and writes public/data/lab/sweep.json.
//
//   npm run lab:sweep                 # full sweep (N = 1e5, 1e6, 1e7; ~15 min on 8 cores, ~10 GB RAM peak)
//   npm run lab:sweep -- --quick      # small smoke test, writes to /tmp unless --out is given
//   options: --workers <k>  --out <path>  --seed <s>
//
// Requires Node >= 22.18 (native TypeScript type stripping).
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runTrial, type RunSpec, type TrialResult } from '../../src/lab/sim.ts';

type Group = 'pn' | 'theta';
interface Plan {
  group: Group;
  spec: RunSpec;
}
interface Job {
  plan: number;
  trial: number;
}

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function buildPlans(quick: boolean, seed: number): Plan[] {
  const plans: Plan[] = [];
  const base = { init: 'fixed' as const, tau: 1, seed, maxDays: 60 };
  const pnRuns = (n: number, pns: number[], trials: (pn: number) => number): void => {
    for (const pn of pns) plans.push({ group: 'pn', spec: { ...base, n, p: pn / n, trials: trials(pn) } });
  };
  const thetaRuns = (n: number, thetas: number[], trials: number): void => {
    for (const theta of thetas) plans.push({ group: 'theta', spec: { ...base, n, p: n ** -theta, trials, theta } });
  };
  const ln = Math.log;
  if (quick) {
    pnRuns(1e4, [2, 4, ln(1e4), 16, ln(1e4) ** 2], () => 8);
    thetaRuns(1e4, [0.6, 0.7, 0.8], 6);
    return plans;
  }
  pnRuns(1e5, [1.5, 2, 3, 4, 6, 8, ln(1e5), 16, 24, 32, 48, 64, 96, ln(1e5) ** 2], () => 100);
  pnRuns(1e6, [1.5, 2, 3, 4, 6, 8, ln(1e6), 16, 24, 32, 48, 64, 96, 128, ln(1e6) ** 2], (pn) => (pn <= 16 ? 48 : 24));
  thetaRuns(1e6, [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95], 24);
  pnRuns(1e7, [3, 6, ln(1e7), 24, 32], () => 12);
  return plans;
}

if (isMainThread) {
  const quick = process.argv.includes('--quick');
  const seed = Number(arg('seed') ?? 20260927);
  const out = resolve(arg('out') ?? (quick ? '/tmp/lab-sweep-quick.json' : resolve(here, '../../public/data/lab/sweep.json')));
  const workers = Number(arg('workers') ?? Math.max(1, Math.min(8, cpus().length)));
  const plans = buildPlans(quick, seed);
  // Largest graphs first so the pool drains evenly.
  const jobs: Job[] = plans
    .flatMap((pl, plan) => Array.from({ length: pl.spec.trials }, (_, trial) => ({ plan, trial })))
    .sort((a, b) => plans[b.plan].spec.p * plans[b.plan].spec.n ** 2 - plans[a.plan].spec.p * plans[a.plan].spec.n ** 2);
  const results: TrialResult[][] = plans.map((p) => new Array<TrialResult>(p.spec.trials));
  const seconds = plans.map(() => 0);
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  console.log(`${plans.length} runs, ${jobs.length} trials, ${workers} workers -> ${out}`);
  await Promise.all(
    Array.from({ length: workers }, () => {
      return new Promise<void>((res, rej) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { plans } });
        const feed = (): void => {
          if (next >= jobs.length) {
            void w.terminate().then(() => res());
            return;
          }
          w.postMessage(jobs[next++]);
        };
        w.on('message', (m: { job: Job; result: TrialResult; ms: number }) => {
          results[m.job.plan][m.job.trial] = m.result;
          seconds[m.job.plan] += m.ms / 1000;
          done++;
          if (done % 25 === 0 || done === jobs.length) console.log(`${done}/${jobs.length} trials, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
          feed();
        });
        w.on('error', rej);
        feed();
      });
    }),
  );
  const dataset = {
    generator: `scripts/lab/sweep.ts (Node ${process.version})`,
    generatedAt: new Date().toISOString(),
    command: `npm run lab:sweep${quick ? ' -- --quick' : ''}${arg('seed') ? ` -- --seed ${seed}` : ''}`,
    runs: plans.map((pl, i) => ({ group: pl.group, spec: pl.spec, seconds: +seconds[i].toFixed(2), trials: results[i] })),
  };
  writeFileSync(out, JSON.stringify(dataset));
  console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else {
  const { plans } = workerData as { plans: Plan[] };
  parentPort?.on('message', (job: Job) => {
    const t = performance.now();
    const result = runTrial(plans[job.plan].spec, job.trial);
    parentPort?.postMessage({ job, result, ms: performance.now() - t });
  });
}
