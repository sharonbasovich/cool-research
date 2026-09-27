import * as d3 from 'd3';
import { mountLayout } from '../shared/layout';
import { amplificationPoints, pnOf, successPoint, thetaOf, type Dataset, type DatasetRun, type RunResult } from './analysis';
import { drawAmplificationChart, drawDaysChart, drawLeadChart, drawSuccessChart, fmtPow10, type AmpMode, type Series } from './charts';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { FRESH_CONST, theoremDays, type InitMode, type RunSpec } from './sim';
import './lab.css';

/** In-browser cap on adjacency entries (2|E| ≈ pN·N), ~240 MB of Int32. */
const MAX_ADJ = 6e7;
const DATA_URL = '../data/lab/sweep.json';
const PAPER = 'https://gopalkgoel.github.io/majority-dynamics/atlas/new.pdf';
const ATLAS = 'https://gopalkgoel.github.io/majority-dynamics/atlas/';
const ESSAY = 'https://gopalkgoel.github.io/majority-dynamics/';
const REPO_SCRIPT = 'https://github.com/sharonbasovich/cool-research/tree/main/majority-dynamics/scripts/lab';

type DensityMode = 'theta' | 'pn' | 'logn' | 'log2n';

interface Controls {
  n: number;
  mode: DensityMode;
  theta: number;
  pn: number;
  init: InitMode;
  tau: number;
  trials: number;
  seed: number;
  maxDays: number;
}

const DEFAULTS: Controls = { n: 100000, mode: 'theta', theta: 0.7, pn: 20, init: 'fixed', tau: 1, trials: 12, seed: 1, maxDays: 40 };

function readControlsFromUrl(): Controls {
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number): number => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? v : d;
  };
  const mode = q.get('mode');
  const init = q.get('init');
  return {
    n: num('n', DEFAULTS.n),
    mode: mode === 'pn' || mode === 'logn' || mode === 'log2n' || mode === 'theta' ? mode : DEFAULTS.mode,
    theta: num('theta', DEFAULTS.theta),
    pn: num('pn', DEFAULTS.pn),
    init: init === 'random' ? 'random' : 'fixed',
    tau: num('tau', DEFAULTS.tau),
    trials: num('trials', DEFAULTS.trials),
    seed: num('seed', DEFAULTS.seed),
    maxDays: num('maxDays', DEFAULTS.maxDays),
  };
}

function pnFor(c: Pick<Controls, 'n' | 'mode' | 'theta' | 'pn'>): number {
  const l = Math.log(c.n);
  switch (c.mode) {
    case 'theta':
      return c.n ** (1 - c.theta);
    case 'logn':
      return l;
    case 'log2n':
      return l * l;
    case 'pn':
      return c.pn;
  }
}

function specFor(c: Controls, pn: number, theta?: number): RunSpec {
  return { n: c.n, p: Math.min(1, pn / c.n), init: c.init, tau: c.tau, trials: c.trials, seed: c.seed, maxDays: c.maxDays, theta };
}

function pnSweepGrid(n: number): number[] {
  const l = Math.log(n);
  const grid = [1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, l, l * l];
  return [...new Set(grid.map((v) => +v.toFixed(4)))].filter((pn) => pn <= n / 4 && pn * n <= MAX_ADJ).sort((a, b) => a - b);
}

function thetaSweepGrid(n: number): number[] {
  return [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].filter((t) => n ** (1 - t) * n <= MAX_ADJ && n ** (1 - t) >= 1.5);
}

// ---------------------------------------------------------------------------------------------
// Worker runner

class Runner {
  private worker: Worker | null = null;
  private jobId = 0;

  run(specs: RunSpec[], onTrial: (m: Extract<WorkerResponse, { type: 'trial' }>) => void, onEnd: (err?: string) => void): void {
    this.cancel();
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    const jobId = ++this.jobId;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      if (m.jobId !== this.jobId) return;
      if (m.type === 'trial') onTrial(m);
      else {
        this.worker = null;
        worker.terminate();
        onEnd(m.type === 'error' ? m.message : undefined);
      }
    };
    worker.onerror = (e) => onEnd(e.message);
    worker.postMessage({ jobId, specs } satisfies WorkerRequest);
  }

  get busy(): boolean {
    return this.worker !== null;
  }

  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
    this.jobId++;
  }
}

// ---------------------------------------------------------------------------------------------
// Page

const main = mountLayout(1);
main.classList.add('lab');
main.innerHTML = `
<header class="lab-head">
  <h1>Large-N lab</h1>
  <p class="lede">Exact simulations of synchronous majority dynamics on <i>G</i>(<i>N</i>,&thinsp;<i>p</i>), set against the
  predictions in Goel &amp; Sah, <a href="${PAPER}"><i>Majority dynamics on sparse random graphs</i></a>
  (<a href="https://arxiv.org/abs/2609.14957">arXiv:2609.14957</a>). Everything below runs in your browser (in a Web Worker) or comes from an
  offline script built on the same code. <strong>Simulations are evidence, not proofs.</strong> At any finite <i>N</i> you can't tell
  <i>pN</i> = <i>N</i><sup>ε</sup> from <i>pN</i> = log <i>N</i>.</p>
</header>

<section class="card rule">
  <h2>The rule and the theorem</h2>
  <p>Every vertex holds an opinion ±1. Each day, all vertices simultaneously adopt the strict majority of their neighbours' opinions.
  On a tie (which includes having no neighbours at all) a vertex keeps its current opinion. Day 1 is the initial colouring. The <em>lead</em>
  Δ is the number of vertices holding the initial majority opinion minus the number holding the other one, so the minority has (<i>N</i>−Δ)/2 vertices.</p>
  <blockquote><strong><a href="${ATLAS}#thm:succinct_main_result">Theorem 1.1</a>.</strong> Fix θ ∈ (½, 1) and <i>T</i> &gt; 1. For all large <i>N</i>,
  all <i>p</i> ∈ (<i>T</i><sup>−1</sup><i>N</i><sup>−θ</sup>, <i>TN</i><sup>−θ</sup>) and τ ∈ [<i>T</i><sup>−1</sup>, <i>T</i>], if exactly
  ⌊<i>N</i>/2⌋ + ⌊τ√<i>N</i>⌋ vertices start at +1 then, for <i>G</i> ~ <i>G</i>(<i>N</i>,&thinsp;<i>p</i>), every vertex holds +1 on day
  <i>k</i> = 2⌊1/(1−θ)⌋ + 3 with probability 1 − <i>o</i>(1).</blockquote>
  <p><a href="${ATLAS}#cor:random-opinions">Corollary 1.3</a> gives the same for fair-coin initial opinions, and
  <a href="${ATLAS}#thm:uniform-density">Theorem 1.2</a> extends it uniformly to all <i>p</i> ≥ <i>T</i><sup>−1</sup><i>N</i><sup>−θ</sup>.
  The part that's still open (from the conjecture of Benjamini, Chan, O'Donnell, Tamuz and Tan) is when the average degree grows more slowly than every power of <i>N</i>,
  for example <i>pN</i> = log <i>N</i>. See the <a href="${ESSAY}">essay</a> for the story and the <a href="${ATLAS}">proof atlas</a> for the details.</p>
</section>

<section class="card controls" aria-label="Simulation controls">
  <h2>Simulate</h2>
  <form id="controls" class="grid">
    <label>N (vertices)
      <input name="n" type="number" min="10" max="2000000" step="1" required />
      <span class="presets" data-for="n"><button type="button" data-v="10000">10⁴</button><button type="button" data-v="100000">10⁵</button><button type="button" data-v="1000000">10⁶</button></span>
    </label>
    <label>density
      <select name="mode">
        <option value="theta">p = N^(−θ)</option>
        <option value="pn">pN directly</option>
        <option value="logn">pN = log N (open)</option>
        <option value="log2n">pN = (log N)² (open)</option>
      </select>
    </label>
    <label data-show="theta">θ <output name="thetaOut"></output>
      <input name="theta" type="range" min="0.5" max="0.99" step="0.005" />
    </label>
    <label data-show="pn">pN
      <input name="pn" type="number" min="0.5" step="any" />
    </label>
    <label>initial opinions
      <select name="init">
        <option value="fixed">⌊N/2⌋+⌊τ√N⌋ at +1 (Thm 1.1)</option>
        <option value="random">fair coins (Cor 1.3)</option>
      </select>
    </label>
    <label data-show-init="fixed">τ
      <input name="tau" type="number" min="0" step="any" />
    </label>
    <label>trials <input name="trials" type="number" min="1" max="500" step="1" /></label>
    <label>seed <input name="seed" type="number" step="1" /></label>
    <label>max days <input name="maxDays" type="number" min="2" max="500" step="1" /></label>
  </form>
  <div id="derived" class="derived"></div>
  <div class="actions">
    <button id="run" class="primary">Run trials</button>
    <button id="sweepPn" title="Sweep pN at this N (feeds charts b and d)">Sweep pN</button>
    <button id="sweepTheta" title="Sweep θ at this N (feeds charts b and c)">Sweep θ</button>
    <button id="cancel" disabled>Cancel</button>
    <span id="status" class="status" role="status"></span>
  </div>
  <p class="small">Each trial samples a fresh graph and colouring from a seed derived from (seed, N, p, τ, trial index), so every result is reproducible and shareable via the URL.
  In-browser runs are capped at <i>pN</i>·<i>N</i> ≤ ${d3.format('.2~s')(MAX_ADJ)} adjacency entries. Bigger runs come from the offline sweep.</p>
</section>

<section class="card">
  <h2><span class="tag">a</span> The lead, day by day</h2>
  <div class="chart-head">
    <label>show <select id="leadSource"></select></label>
  </div>
  <div id="chartLead" class="chart-box"></div>
  <div id="leadSummary" class="summary"></div>
  <p>If the graph were resampled every day, a vertex would compare <i>X</i><sub>+</sub> ~ Bin((<i>N</i>+Δ)/2, <i>p</i>) with <i>X</i><sub>−</sub> ~ Bin((<i>N</i>−Δ)/2, <i>p</i>).
  The central limit theorem gives a vote bias of about √(2/π)·<i>p</i>Δ/√(<i>pN</i>), so Δ<sub>next</sub> ≈ √(2/π)·Δ·√(<i>pN</i>)
  (<a href="${ESSAY}">essay, “If the randomness were refreshed every day”</a>). The dashed grey line applies this day after day, starting from the median initial lead. The dotted line uses the
  saturating form <i>N</i>(2Φ(<i>p</i>Δ/√(<i>p</i>(1−<i>p</i>)<i>N</i>)) − 1). But the real graph is never resampled. After day 1 the opinions carry information about the edges, and the
  proof's opinion-history classes (<a href="${ATLAS}#iterative-degree-revelation">§1.2.1</a>) are how it deals with that. The paper proves Δ<sub><i>k</i>+1</sub> = (<i>c<sub>k</sub></i> + <i>o</i>(1))Δ<sub><i>k</i></sub>√(<i>pN</i>)
  with <i>c<sub>k</sub></i> &gt; 0 but not necessarily √(2/π) (<a href="${ATLAS}#the-lead">§5.4</a>). Once the lead passes the handoff scale ≈ <i>N</i>/√(<i>pN</i>) (up to logarithms),
  the pseudorandomness argument of Chakraborti–Kim–Lee–Tran takes over and the minority contracts by a factor <i>O</i>(1/(<i>pN</i>)) per day
  (<a href="${ATLAS}#contraction-phase">§1.2.4</a>, <a href="${ATLAS}#the-contraction-phase">§6.1</a>). The orange curves show that contraction, and an open dot on the “0” row marks unanimity.</p>
</section>

<section class="card">
  <h2><span class="tag">b</span> One-day amplification</h2>
  <div class="chart-head">
    <label>scale <select id="ampMode"><option value="normalized">normalised by √(pN)</option><option value="raw">raw ratio</option></select></label>
  </div>
  <div id="chartAmp" class="chart-box"></div>
  <p>Each point is the mean of Δ<sub><i>t</i>+1</sub>/Δ<sub><i>t</i></sub> over trials (bars: ±2 standard errors), kept only while Δ<sub><i>t</i>+1</sub> ≤ 0.1<i>N</i>
  so that saturation doesn't look like weaker amplification. On the first update the graph really is independent of the opinions, so the solid blue curve is the
  <em>exact</em> expectation 𝔼[Δ₂]/Δ₁ (binomial sums, with the keep-on-tie rule). It sits above √(2/π)√(<i>pN</i>) at small <i>pN</i> because ties are broken toward the
  vertex's own opinion. From day 2 on, the edges depend on the past, so the measured constant doesn't have to be √(2/π) ≈ ${FRESH_CONST.toFixed(4)}. The paper's
  <i>c<sub>k</sub></i> come from the linear response of a Gaussian recursion (<a href="${ATLAS}#sec:universal">§4</a>). These are finite-<i>N</i> estimates, not limits.</p>
</section>

<section class="card">
  <h2><span class="tag">c</span> Days to unanimity vs θ</h2>
  <div id="chartDays" class="chart-box"></div>
  <p>Dots are single trials (jittered) and diamonds are medians. “<i>k</i>✕” counts trials that didn't end unanimous for the initial majority. The red staircase is Theorem 1.1's
  <i>k</i>(θ) = 2⌊1/(1−θ)⌋ + 3. It's an <em>upper bound that holds with probability 1 − o(1) as N → ∞</em>, for fixed θ. That's roughly ⌊1/(1−θ)⌋ + 1 days
  to amplify a √<i>N</i> lead past the handoff scale, and at most ⌊1/(1−θ)⌋ + 1 more for contraction (<a href="${ATLAS}#contraction-phase">§1.2.4</a>).
  Nobody claims it's sharp, and at any fixed finite <i>N</i> neither the bound nor the success guarantee has to hold. Here θ is the effective exponent
  1 − log(<i>pN</i>)/log <i>N</i>.</p>
</section>

<section class="card">
  <h2><span class="tag">d</span> Does the initial majority win? <span class="open-badge">open regime: empirical exploration</span></h2>
  <div id="chartSuccess" class="chart-box"></div>
  <p>The fraction of trials ending with the initial majority unanimous (bars: 95% Wilson intervals). For every fixed θ &lt; 1 the paper proves this tends to 1.
  For sub-polynomial degree such as <i>pN</i> = log <i>N</i> or (log <i>N</i>)² <strong>the question is open</strong>, and the shaded region is only a finite-<i>N</i>
  exploration, not evidence about the limit. One obstacle is simple. An isolated vertex never changes its opinion, so unanimity needs no isolated vertex in the initial
  minority. The dotted curves show the Poisson estimate exp(−<i>m</i>(1−<i>p</i>)<sup><i>N</i>−1</sup>) for this event, where <i>m</i> is the minority size. It's an upper bound on
  success, and at <i>pN</i> = log <i>N</i> it's about <i>e</i><sup>−1/2</sup>. Degree-1 and other low-degree vertices cause more local trouble, which is one reason the
  conjecture is phrased with <i>pN</i> → ∞ and sometimes as near-unanimity.</p>
</section>

<section class="card">
  <h2>Data and reproducibility</h2>
  <div id="dataInfo" class="small"></div>
  <p class="small">The simulator (<code>src/lab/sim.ts</code>) samples <i>G</i>(<i>N</i>,&thinsp;<i>p</i>) by the geometric-skip method of Batagelj and Brandes (2005) into compressed sparse row
  arrays, with a seeded xoshiro128** generator, then applies the update rule exactly with integer neighbour sums. A run stops at unanimity, at a fixed point or
  2-cycle (synchronous majority dynamics with symmetric weights always reaches period ≤ 2, Goles–Olivos 1980), or at the day cap. Precomputed larger-<i>N</i> runs are produced by
  <a href="${REPO_SCRIPT}"><code>scripts/lab/sweep.ts</code></a> from the same code (<code>npm run lab:sweep</code>). Hollow markers are offline results and filled markers are yours.</p>
</section>
`;

const $ = <T extends Element>(sel: string): T => {
  const el = main.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const form = $<HTMLFormElement>('#controls');
const status = $<HTMLSpanElement>('#status');
const runBtn = $<HTMLButtonElement>('#run');
const sweepPnBtn = $<HTMLButtonElement>('#sweepPn');
const sweepThetaBtn = $<HTMLButtonElement>('#sweepTheta');
const cancelBtn = $<HTMLButtonElement>('#cancel');
const leadSource = $<HTMLSelectElement>('#leadSource');
const ampMode = $<HTMLSelectElement>('#ampMode');

const field = (name: string): HTMLInputElement | HTMLSelectElement => {
  const el = form.elements.namedItem(name);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) throw new Error(`missing field ${name}`);
  return el;
};

function setControls(c: Controls): void {
  for (const [k, v] of Object.entries(c)) field(k).value = String(v);
}

function getControls(): Controls {
  const n = (k: string): number => Number(field(k).value);
  return {
    n: Math.min(2_000_000, Math.max(10, Math.round(n('n')))),
    mode: field('mode').value as DensityMode,
    theta: n('theta'),
    pn: n('pn'),
    init: field('init').value as InitMode,
    tau: n('tau'),
    trials: Math.min(500, Math.max(1, Math.round(n('trials')))),
    seed: Math.round(n('seed')),
    maxDays: Math.min(500, Math.max(2, Math.round(n('maxDays')))),
  };
}

function updateDerived(): void {
  const c = getControls();
  const pn = pnFor(c);
  const theta = 1 - Math.log(pn) / Math.log(c.n);
  const out = form.elements.namedItem('thetaOut');
  if (out instanceof HTMLOutputElement) out.value = c.theta.toFixed(3);
  for (const el of form.querySelectorAll<HTMLElement>('[data-show]')) el.hidden = el.dataset.show !== c.mode;
  for (const el of form.querySelectorAll<HTMLElement>('[data-show-init]')) el.hidden = el.dataset.showInit !== c.init;
  const plus = Math.floor(c.n / 2) + Math.floor(c.tau * Math.sqrt(c.n));
  const d0 = c.init === 'fixed' ? `${d3.format(',')(2 * plus - c.n)}` : `≈ ±${d3.format(',.0f')(Math.sqrt(c.n))} (random)`;
  const adj = pn * c.n;
  const tooBig = adj > MAX_ADJ || pn > c.n / 2;
  $<HTMLDivElement>('#derived').innerHTML = `
    <span><i>pN</i> = ${d3.format('.4~g')(pn)}</span>
    <span><i>p</i> = ${d3.format('.3~e')(pn / c.n)}</span>
    <span>θ<sub>eff</sub> = ${theta.toFixed(3)}</span>
    <span><i>k</i>(θ) = ${theta > 0.5 && theta < 1 ? theoremDays(theta) : 'n/a'}</span>
    <span>Δ₁ = ${d0}</span>
    <span>amplification √(2/π)√(<i>pN</i>) ≈ ${(FRESH_CONST * Math.sqrt(pn)).toFixed(2)}</span>
    <span>handoff <i>N</i>/√(<i>pN</i>) ≈ ${d3.format('.3~s')(c.n / Math.sqrt(pn))}</span>
    <span>log <i>N</i> = ${Math.log(c.n).toFixed(2)}</span>
    <span class="${tooBig ? 'warn' : ''}">≈ ${d3.format('.3~s')(adj / 2)} edges, ${d3.format('.3~s')(adj * 4 + c.n * 10)}B${tooBig ? ' (too big for the browser, so lower N or pN)' : ''}</span>`;
  runBtn.disabled = tooBig || runner.busy;
}

// ---------------------------------------------------------------------------------------------
// State

const runner = new Runner();
let userRun: RunResult | null = null;
const userSweeps: RunResult[] = [];
let dataset: Dataset | null = null;

function offlineRuns(group?: DatasetRun['group']): DatasetRun[] {
  return (dataset?.runs ?? []).filter((r) => group === undefined || r.group === group);
}

function series(kind: 'amp' | 'days' | 'success'): Series[] {
  const out: Series[] = [];
  const mine = userSweeps.concat(userRun && kind !== 'success' ? [userRun] : []);
  if (mine.length) out.push({ label: 'this browser', color: '#2c6fbb', hollow: false, runs: mine });
  const off = kind === 'success' ? offlineRuns('pn') : offlineRuns();
  if (off.length) out.push({ label: 'offline precomputed', color: '#b8322a', hollow: true, runs: off });
  return out;
}

function selectedLeadRun(): RunResult | null {
  const v = leadSource.value;
  if (v === 'user' || v === '') return userRun;
  return offlineRuns()[Number(v)] ?? null;
}

function fillLeadSource(): void {
  const prev = leadSource.value;
  const opts = [`<option value="user">your in-browser run</option>`];
  offlineRuns().forEach((r, i) => {
    if (r.trials.length === 0) return;
    opts.push(`<option value="${i}">offline: N = ${fmtPow10(r.spec.n)}, pN = ${d3.format('.4~g')(pnOf(r.spec))} (θ = ${thetaOf(r.spec).toFixed(3)}), ${r.trials.length} trials</option>`);
  });
  leadSource.innerHTML = opts.join('');
  leadSource.value = [...leadSource.options].some((o) => o.value === prev) ? prev : 'user';
}

function leadSummary(run: RunResult | null): string {
  if (!run || run.trials.length === 0) return '';
  const counts = d3.rollup(run.trials, (v) => v.length, (t) => t.outcome);
  const days = run.trials.map((t) => t.unanimousDay).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const theta = thetaOf(run.spec);
  const amp = amplificationPoints(run)
    .map((p) => `day ${p.day}→${p.day + 1}: <b>${p.ratio.toFixed(2)}</b> (÷√(pN) = ${(p.ratio / Math.sqrt(p.pn)).toFixed(3)})`)
    .join(' · ');
  const label: Record<string, string> = { majority: 'initial majority unanimous', minority: 'minority unanimous', stuck: 'stuck (fixed point / 2-cycle)', maxdays: 'hit day cap', tie: 'initial tie' };
  const sp = successPoint(run);
  return `<p><b>N</b> = ${d3.format(',')(run.spec.n)}, <b>pN</b> = ${d3.format('.4~g')(pnOf(run.spec))}, θ<sub>eff</sub> = ${theta.toFixed(3)}${theta > 0.5 && theta < 1 ? `, k(θ) = ${theoremDays(theta)}` : ''}, ${run.trials.length} trials.
    Outcomes: ${[...counts].map(([k, v]) => `${v} ${label[k]}`).join(', ')}${sp.isolatedBlocked ? ` (${sp.isolatedBlocked} with an isolated minority vertex)` : ''}.
    ${days.length ? `Unanimity day: median ${d3.median(days)}, range ${days[0]}–${days[days.length - 1]}.` : ''}</p>
    ${amp ? `<p>Mean amplification ${amp}. The fresh-graph prediction √(2/π)√(pN) is ${(FRESH_CONST * Math.sqrt(pnOf(run.spec))).toFixed(2)}.</p>` : ''}`;
}

let raf = 0;
function redraw(): void {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const lr = selectedLeadRun();
    drawLeadChart($('#chartLead'), lr);
    $<HTMLDivElement>('#leadSummary').innerHTML = leadSummary(lr);
    drawAmplificationChart($('#chartAmp'), series('amp'), ampMode.value as AmpMode);
    drawDaysChart($('#chartDays'), series('days'));
    drawSuccessChart($('#chartSuccess'), series('success'));
  });
}

function setBusy(busy: boolean): void {
  runBtn.disabled = busy;
  sweepPnBtn.disabled = busy;
  sweepThetaBtn.disabled = busy;
  cancelBtn.disabled = !busy;
  if (!busy) updateDerived();
}

function launch(specs: RunSpec[], sink: RunResult[], what: string): void {
  const total = specs.reduce((a, s) => a + s.trials, 0);
  let done = 0;
  const t0 = performance.now();
  sink.push(...specs.map((spec) => ({ spec, trials: [] })));
  const base = sink.length - specs.length;
  setBusy(true);
  status.textContent = `${what}: 0 / ${total} trials…`;
  runner.run(
    specs,
    (m) => {
      sink[base + m.specIndex].trials.push(m.result);
      done++;
      status.textContent = `${what}: ${done} / ${total} trials (last ${d3.format(',.0f')(m.ms)} ms)…`;
      redraw();
    },
    (err) => {
      setBusy(false);
      status.textContent = err ? `Error: ${err}` : `${what}: ${total} trials in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
      redraw();
    },
  );
}

function syncUrl(c: Controls): void {
  setControls(c);
  updateDerived();
  const q = new URLSearchParams(Object.entries(c).map(([k, v]) => [k, String(v)]));
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

runBtn.addEventListener('click', () => {
  const c = getControls();
  syncUrl(c);
  const pn = pnFor(c);
  const holder: RunResult[] = [];
  launch([specFor(c, pn, c.mode === 'theta' ? c.theta : undefined)], holder, 'Trials');
  userRun = holder[0];
  leadSource.value = 'user';
});

sweepPnBtn.addEventListener('click', () => {
  const c = getControls();
  syncUrl(c);
  launch(pnSweepGrid(c.n).map((pn) => specFor(c, pn)), userSweeps, `pN sweep at N = ${fmtPow10(c.n)}`);
});

sweepThetaBtn.addEventListener('click', () => {
  const c = getControls();
  syncUrl(c);
  launch(thetaSweepGrid(c.n).map((t) => specFor(c, c.n ** (1 - t), t)), userSweeps, `θ sweep at N = ${fmtPow10(c.n)}`);
});

cancelBtn.addEventListener('click', () => {
  runner.cancel();
  setBusy(false);
  status.textContent = 'Cancelled (partial results kept).';
});

form.addEventListener('input', updateDerived);
form.addEventListener('submit', (e) => e.preventDefault());
for (const b of form.querySelectorAll<HTMLButtonElement>('.presets button')) {
  b.addEventListener('click', () => {
    field('n').value = b.dataset.v ?? '';
    updateDerived();
  });
}
leadSource.addEventListener('change', redraw);
ampMode.addEventListener('change', redraw);
let lastWidth = main.clientWidth;
new ResizeObserver(() => {
  if (Math.abs(main.clientWidth - lastWidth) > 4) {
    lastWidth = main.clientWidth;
    redraw();
  }
}).observe(main);

setControls(readControlsFromUrl());
updateDerived();
redraw();

fetch(DATA_URL)
  .then((r) => (r.ok ? (r.json() as Promise<Dataset>) : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((d) => {
    dataset = d;
    const trials = d.runs.reduce((a, r) => a + r.trials.length, 0);
    const ns = [...new Set(d.runs.map((r) => r.spec.n))].sort((a, b) => a - b);
    $<HTMLDivElement>('#dataInfo').innerHTML = `<p>Loaded <code>${DATA_URL.replace('../', '')}</code>: ${d.runs.length} runs, ${d3.format(',')(trials)} trials at N ∈ {${ns.map(fmtPow10).join(', ')}},
      generated ${d.generatedAt.slice(0, 10)} by <code>${d.command}</code> (${d.generator}), using ${d3.format(',.0f')(d3.sum(d.runs, (r) => r.seconds) / 60)} CPU-minutes.</p>`;
    fillLeadSource();
    if (!userRun) leadSource.value = String(offlineRuns().findIndex((r) => r.group === 'theta' && Math.abs(thetaOf(r.spec) - 0.7) < 1e-6));
    if (leadSource.value === '') leadSource.value = 'user';
    redraw();
  })
  .catch((e: unknown) => {
    $<HTMLDivElement>('#dataInfo').textContent = `Precomputed data not available (${e instanceof Error ? e.message : String(e)}). Run npm run lab:sweep to generate it.`;
    fillLeadSource();
  });

runBtn.click();
