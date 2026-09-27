# /lab offline sweep

`sweep.ts` runs the same simulator as the browser (`src/lab/sim.ts`) over a `worker_threads` pool and writes
`public/data/lab/sweep.json`, which the `/lab` page loads and draws as hollow markers.

```sh
npm run lab:sweep                  # full sweep: N = 1e5, 1e6, 1e7 (~20 min on 8 cores, ~10 GB RAM peak)
npm run lab:sweep -- --quick       # smoke test at N = 1e4, written to /tmp/lab-sweep-quick.json
npm run lab:sweep -- --workers 4 --seed 7 --out /tmp/other.json
```

Requires Node >= 22.18 (native TypeScript type stripping; no build step).

What is swept (all with Theorem 1.1's colouring: exactly floor(N/2) + floor(tau sqrt N) vertices at +1, tau = 1, day cap 60):

| group   | N    | grid                                                                 | trials |
|---------|------|----------------------------------------------------------------------|--------|
| `pn`    | 1e5  | pN in {1.5, 2, 3, 4, 6, 8, log N, 16, 24, 32, 48, 64, 96, (log N)^2}  | 100    |
| `pn`    | 1e6  | pN in {1.5, 2, 3, 4, 6, 8, log N, 16, 24, 32, 48, 64, 96, 128, (log N)^2} | 48 (pN <= 16), else 24 |
| `theta` | 1e6  | p = N^-theta, theta in {0.6, 0.65, ..., 0.95}                         | 24     |
| `pn`    | 1e7  | pN in {3, 6, log N, 24, 32}                                           | 12     |

Every trial is reproducible: its graph and colouring come from `trialSeed(spec, trialIndex)` (a hash of seed, N, p, tau and
the trial index), so any single trial can be re-run in the browser or in Node with `runTrial(spec, i)`.
