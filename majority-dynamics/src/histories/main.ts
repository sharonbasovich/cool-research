import { mountLayout } from '../shared/layout';
import './style.css';
import { historyLabel, lastOpinion } from './classes';
import { SimClient } from './client';
import { expansionDays, theoremDays } from './dynamics';
import { heuristicFactor } from './fresh';
import { MAX_EXPECTED_EDGES, expectedEdges, type DegreeResult, type EnsembleResult, type MatrixResult, type SimParams, type SimResult, type Target } from './protocol';
import { meanSquaredZ } from './stats';
import { degreeSummaryHtml, renderDegrees } from './views/degrees';
import { fmt2, fmt3, fmtInt, fmtPct, fmtSig, historyHtml } from './views/format';
import { renderMatrix, type MatrixMetric, type MatrixSource } from './views/matrix';
import { renderTrajectories, stepTableHtml } from './views/trajectories';
import { coherenceSummary, renderTree, type TreeMode } from './views/tree';

const ESSAY = 'https://gopalkgoel.github.io/majority-dynamics/';
const ATLAS = 'https://gopalkgoel.github.io/majority-dynamics/atlas/';
const PAPER = 'https://gopalkgoel.github.io/majority-dynamics/atlas/new.pdf';
const ARXIV = 'https://arxiv.org/abs/2609.14957';
const LEAN = 'https://github.com/gopalkgoel/sparse-majority-dynamics-lean';

const essay = (id: string, text: string) => `<a href="${ESSAY}#${id}" target="_blank" rel="noopener">${text}</a>`;
const atlas = (id: string, text: string) => `<a href="${ATLAS}#unit-${id}" target="_blank" rel="noopener">${text}</a>`;
const paper = (page: number, text: string) => `<a href="${PAPER}#page=${page}" target="_blank" rel="noopener">${text}</a>`;

const main = mountLayout(1);
main.classList.add('hx');
main.innerHTML = `
<header>
  <h1>Opinion histories on one fixed graph</h1>
  <p class="hx-lede">Goel and Sah prove that on <i>G</i>(<i>N</i>, <i>p</i>) with <i>p</i> ≈ <i>N</i><sup>−θ</sup>, θ ∈ (1/2, 1),
  majority dynamics started from a lead of order √<i>N</i> reaches unanimity within
  <i>k</i> = 2⌊1/(1−θ)⌋ + 3 days with high probability (${paper(2, 'Theorem 1.1')}).
  This page runs the process on real sampled graphs, in your browser, and displays the objects the proof keeps track of:
  opinion-history classes, the edge counts between them, and the degree sequences those counts constrain.</p>
  <nav class="hx-toc" aria-label="Sections">
    <a href="#hx-tree">1 · History tree</a><a href="#hx-matrix">2 · Block pairs</a>
    <a href="#hx-degrees">3 · Degree conditioning</a><a href="#hx-fresh">4 · Same graph vs. new graph</a><a href="#hx-next">5 · What the proof does next</a>
  </nav>
</header>

<div class="hx-controls" role="group" aria-label="Simulation parameters">
  <label>N <select id="c-N"><option value="10000">10 000</option><option value="30000">30 000</option><option value="100000" selected>100 000</option></select></label>
  <label>θ <select id="c-theta"><option>0.55</option><option selected>0.6</option><option>0.65</option><option>0.7</option><option>0.75</option><option>0.8</option></select></label>
  <label title="Initial lead Δ₁ = 2⌊τ√N⌋ (approximately)">τ <input id="c-tau" type="number" step="0.1" min="0.1" max="5" value="0.5"></label>
  <label>seed <input id="c-seed" type="number" step="1" min="0" value="1"></label>
  <button id="c-run">Simulate</button>
  <span class="hx-derived" id="c-derived"></span>
  <span class="hx-status" id="c-status" aria-live="polite"></span>
</div>

<section class="hx-step wide">
  <div class="hx-prose">
    <p><b>The process.</b> Each vertex holds an opinion <span class="hx-p">+</span> or <span class="hx-m">−</span>. Day 1 is the initial coloring:
    exactly ⌊<i>N</i>/2⌋ + ⌊τ√<i>N</i>⌋ vertices hold <span class="hx-p">+</span>, placed uniformly at random, so the lead is
    Δ<sub>1</sub> ≈ 2τ√<i>N</i>. On every later day all vertices update simultaneously to the strict majority opinion among their neighbours;
    a tie (including an isolated vertex) keeps the current opinion. The graph is sampled once and reused every day.</p>
    <p><b>Why this is hard.</b> If a new graph were drawn every day, the day-(<i>t</i>+1) opinion of each vertex would be a comparison of two
    independent binomials, and the lead would grow by the factor √(2/π)·√(<i>pN</i>) per day (${essay('s3', 'essay: “If the randomness were refreshed every day”')}).
    On a fixed graph, the opinion a vertex adopted on day <i>t</i> is a statement about its own edges, so the next update is not a fresh draw
    (${essay('s4', '“The same graph, one day later”')}). The proof controls this by recording, after each day, exactly what has been revealed.</p>
    <div class="hx-callout">Everything below is computed from one concrete graph and coloring (and, for §4, an ensemble of them).
    These are illustrations of finite-<i>N</i> behaviour, not evidence for the asymptotic statement, and the classes you see are the
    exact combinatorial objects in the paper rather than an approximation.</div>
  </div>
</section>

<section class="hx-step" id="hx-tree">
  <div class="hx-prose">
    <h2><span class="hx-num">1</span>History classes</h2>
    <p>After <i>t</i> days, each vertex <i>x</i> has an <b>opinion history</b> (<i>c</i><sub>1</sub>(<i>x</i>), …, <i>c<sub>t</sub></i>(<i>x</i>)) ∈ {±1}<sup><i>t</i></sup>.
    Vertices with the same history form a <b>history class</b>, so the vertex set is partitioned into at most 2<sup><i>t</i></sup> classes, and the
    day-<i>t</i> partition refines the day-(<i>t</i>−1) one. The paper's state after <i>t</i> days is this partition together with the degree of every vertex
    into every class (${paper(8, '§2.2, state spaces')}; ${atlas('prop:state-chain', 'atlas: Prop. 2.3, state chain')}).
    </p>
    <p>Each row of the figure is one day. A bar is a class; its children on the next row are the vertices of that class that then chose
    <span class="hx-p">+</span> (left) or <span class="hx-m">−</span> (right). In <i>proportional</i> mode widths are class sizes, so you can watch mass
    concentrate on the all-<span class="hx-p">+</span> branch while the dynamics amplifies the lead. <i>Binary</i> mode gives every possible history
    the same width, which makes empty (hatched) and negligible classes visible.</p>
    <p>The ± split is almost even for several days: the lead is only a √<i>N</i>(√<i>pN</i>)<sup><i>t</i>−1</sup>-sized perturbation of <i>N</i>/2.
    What matters is the sign of the tiny bias inside every class. Hover a bar for its normalized response
    ε̂ = (|<i>C</i><sup>+</sup>| − |<i>C</i><sup>−</sup>|) / (τ√<i>N</i>(√<i>pN</i>)<sup><i>t</i>−1</sup>) per unit mass. The paper's idealized recursion predicts
    these responses (${atlas('thm:idealized-process', 'Theorem 5.2')}), and its coherence statement says mirror classes respond with opposite signs
    (${atlas('thm:coherence', 'coherence')}). The table under the figure checks the sign pattern empirically on large classes.</p>
    <p class="hx-src">Paper: ${paper(8, '§2.2')}, ${paper(31, '§5')}. Essay: ${essay('classes', 'history classes figure')}.
    Atlas: ${atlas('fact:state-reconstruction', 'state reconstruction')}.</p>
  </div>
  <div class="hx-figure">
    <div class="hx-toolbar">
      <label>layout <select id="t-mode"><option value="proportional">proportional</option><option value="binary">binary (all 2<sup>t</sup>)</option></select></label>
      <label>negligible below <select id="t-neg"><option value="0.001">0.1% of N</option><option value="0.0001" selected>0.01% of N</option><option value="0.00001">0.001% of N</option></select></label>
    </div>
    <div class="hx-card"><div id="t-host" role="img" aria-label="History tree"></div></div>
    <p class="hx-caption" id="t-caption"></p>
    <table class="hx-table"><thead><tr><th>day</th><th>mirror pairs with the predicted sign pattern</th><th>exceptions</th></tr></thead><tbody id="t-coh"></tbody></table>
    <p class="hx-note">A mirror pair is (<i>h</i>, −<i>h</i>) with both classes of size ≥ 2000; “predicted sign pattern” means the
    <span class="hx-p">+</span>-fraction of each child split lies on the side predicted by the class's last opinion.</p>
  </div>
</section>

<section class="hx-step" id="hx-matrix">
  <div class="hx-prose">
    <h2><span class="hx-num">2</span>Edges between classes are no longer uniform</h2>
    <p>For history classes <i>A</i>, <i>B</i> at day <i>t</i> the heatmap shows the normalized edge density
    <span class="hx-eq">ρ(<i>A</i>,<i>B</i>) = <i>e</i>(<i>A</i>,<i>B</i>) / (|<i>A</i>||<i>B</i>|<i>p</i>), &nbsp; ρ(<i>A</i>,<i>A</i>) = <i>e</i>(<i>A</i>) / (C(|<i>A</i>|,2)<i>p</i>).</span>
    In <i>G</i>(<i>N</i>,<i>p</i>) with a partition chosen independently of the graph, every ρ is 1 up to fluctuations of order
    1/√(|<i>A</i>||<i>B</i>|<i>p</i>). Switch the source to <b>resampled</b> to see exactly that: the same partition laid over an independent graph.</p>
    <p>On the real graph the partition is <i>not</i> independent of the edges. A vertex in class <span class="mono">−+</span> changed its mind because it
    had more day-1 <span class="hx-p">+</span> neighbours than <span class="hx-m">−</span> neighbours, so in total it is enriched towards the
    <span class="mono">+·</span> classes (§3). Individual cells mix in a second effect: a neighbour's day-2 vote also counted the vertex's own day-1
    opinion, which is why, e.g., <span class="mono">−+</span> is over-connected to <span class="mono">+−</span> but not to <span class="mono">++</span>. The deviations are of relative size about 1/√(<i>pN</i>), which is why the <i>z</i>-score view,
    (<i>e</i> − E<i>e</i>)/√Var, is the honest way to see them: they are many standard deviations of the fresh-graph fluctuation, although the ratios look close to 1.</p>
    <p>Conditioned on the whole state (partition plus degree arrays), the paper shows the graph is uniform on each block pair among graphs with the prescribed
    degrees, independently across pairs (${atlas('prop:state-chain', 'Prop. 2.3')}; ${atlas('prop:coarse-one-step', 'coarse one-step')}). So the heatmap is a coarse
    summary of the information the proof conditions on; the exact state is the degree array in §3.</p>
    <p class="hx-src">Essay: ${essay('s4', '“The same graph, one day later”')}. Paper: ${paper(10, 'Proposition 2.3')}, ${paper(12, 'Proposition 2.4')}.</p>
  </div>
  <div class="hx-figure">
    <div class="hx-toolbar">
      <label>after day <select id="m-day"></select></label>
      <label>graph <select id="m-src"><option value="real">real (reused) graph</option><option value="resampled">resampled, same partition</option></select></label>
      <label>show <select id="m-metric"><option value="z">z-score</option><option value="ratio">ratio ρ</option></select></label>
    </div>
    <div class="hx-card"><div id="m-host" role="img" aria-label="Block-pair density matrix"></div><div id="m-legend"></div></div>
    <div class="hx-kpi" id="m-kpi"></div>
    <p class="hx-caption">Rows and columns are the largest classes (up to 16, the rest pooled as “other”). Hover for <i>e</i>(<i>A</i>,<i>B</i>), its fresh expectation, ρ and <i>z</i>.</p>
  </div>
</section>

<section class="hx-step" id="hx-degrees">
  <div class="hx-prose">
    <h2><span class="hx-num">3</span>Prescribed degree sequences</h2>
    <p>Pick a source class <i>S</i> and a target set <i>T</i>. For each <i>x</i> ∈ <i>S</i> the figure plots <i>d</i>[<i>x</i>, <i>T</i>], the number of neighbours of
    <i>x</i> in <i>T</i>, against the unconditioned Bin(|<i>T</i>|, <i>p</i>) law (dotted). The default, class <span class="mono">−+</span> against
    “day-1 opinion <span class="hx-p">+</span>”, is the essay's example: switchers have more <span class="hx-p">+</span> neighbours.</p>
    <p>The lower panel shows the quantity that actually decided the last opinion, Σ<sub><i>y</i>∼<i>x</i></sub> <i>c</i><sub><i>t</i>−1</sub>(<i>y</i>).
    On the real graph it is truncated at 0 on the side forced by the class's history (a <span class="mono">−+</span> vertex must have a positive sum),
    whereas over a resampled graph it is the symmetric fresh law. The degree array is exactly what the state records and what the next day's
    graph is conditioned on.</p>
    <p>The proof does not work with this truncated picture directly. It passes from the uniform graph with these degree constraints to a
    tilted binomial model, using the enumeration asymptotics of McKay–Wormald, Canfield–Greenhill–McKay and Liebenau–Wormald
    (${atlas('thm:local-coarse-transition', 'Theorem 3.3, local coarse transition')}), and then to Gaussian rows
    (${atlas('def:gaussian-row', 'Gaussian row')}).</p>
    <p class="hx-src">Essay: ${essay('s5', '“Recovering randomness after conditioning”')}. Paper: ${paper(12, '§2.3')}, ${paper(15, '§3')}.</p>
  </div>
  <div class="hx-figure">
    <div class="hx-toolbar">
      <label>day <select id="d-day"></select></label>
      <label>source <i>S</i> <select id="d-src"></select></label>
      <label>target <i>T</i> <select id="d-tgt"></select></label>
    </div>
    <div class="hx-card"><div id="d-host" role="img" aria-label="Degree histogram"></div></div>
    <div class="hx-card" style="margin-top:0.5rem"><div id="d-dec" role="img" aria-label="Decision imbalance histogram"></div></div>
    <div id="d-sum"></div>
  </div>
</section>

<section class="hx-step" id="hx-fresh">
  <div class="hx-prose">
    <h2><span class="hx-num">4</span>Same graph vs. a new graph every day</h2>
    <p>Each run below starts from one coloring and evolves it twice: on a single fixed <i>G</i>(<i>N</i>,<i>p</i>) (solid) and with an independent
    <i>G</i>(<i>N</i>,<i>p</i>) drawn for every update (dashed). The black line is the exact fresh-graph expectation
    E[Δ<sub><i>t</i>+1</sub> | Δ<sub><i>t</i></sub>] computed from the reused run's own Δ<sub><i>t</i></sub> (binomial comparison with the tie rule),
    and the table compares each measured amplification with the heuristic factor √(2/π)·√(<i>pN</i>).</p>
    <p><b>The first step agrees.</b> The day-1 coloring is independent of the graph, so the day-2 update on the fixed graph really is a fresh
    draw: the ratio in the last column is 1 within error, and both processes amplify by about √(2/π)·√(<i>pN</i>).</p>
    <p><b>The second step does not.</b> At these sizes the same-graph amplification on day 2 → 3 is visibly below the fresh one, by a constant
    factor rather than a vanishing correction. Each individual edge carries only a small tilt: a neighbour <i>y</i> of <i>x</i> counted <i>x</i>'s
    day-1 opinion in its own day-2 vote, which biases <i>c</i><sub>2</sub>(<i>y</i>) towards <i>c</i><sub>1</sub>(<i>x</i>) by order 1/√(<i>pN</i>).
    But <i>x</i> has about <i>pN</i> neighbours, and <i>pN</i> small biases add up to a shift of order √(<i>pN</i>), the same order as the
    fluctuation of <i>x</i>'s day-3 vote. The echo rate below makes this concrete: vertices that flipped on day 2 flip back on day 3 far more
    often on the fixed graph than with a new graph.</p>
    <p>This is why the proof cannot iterate the fresh heuristic. It tracks the exact conditioned law of the state: the tilted row model builds in
    the previous majority decisions as linear constraints, and the resulting deterministic recursion for the class responses has different
    coefficients from the naive one (${essay('s6', 'essay: “Tracking the lead…”')}; ${atlas('thm:idealized-process', 'Theorem 5.2')};
    ${atlas('cor:lead', 'Corollary 5.9')}). What survives is the order of growth, a factor Θ(√(<i>pN</i>)) per day, which is what the
    day count <i>k</i> depends on.</p>
  </div>
  <div class="hx-figure">
    <div class="hx-toolbar">
      <label>runs <select id="f-runs"><option>4</option><option selected>8</option><option>16</option><option>32</option></select></label>
      <button id="f-run" class="secondary">Run ensemble</button>
      <span class="hx-note" id="f-status"></span>
    </div>
    <div class="hx-progress"><div id="f-bar"></div></div>
    <div class="hx-card"><div id="f-host" role="img" aria-label="Lead trajectories"></div></div>
    <div id="f-table"></div>
    <div class="hx-kpi" id="f-echo"></div>
  </div>
</section>

<section class="hx-step wide" id="hx-next">
  <div class="hx-prose">
    <h2><span class="hx-num">5</span>What the proof does next, and what these pictures do not show</h2>
    <p><b>Expansion phase.</b> For about ⌊1/(1−θ)⌋ + 1 days the degree-revelation state is tracked exactly: the lead grows by roughly √(<i>pN</i>) per day,
    and the idealized process of ${atlas('thm:idealized-process', 'Theorem 5.2')} keeps the class responses close to a deterministic recursion. Here that is
    <span id="n-exp"></span>. The first day is handled separately (${atlas('prop:day-one', 'day one')}).</p>
    <p><b>Handoff and contraction.</b> Once the lead is of order <i>N</i>/√(<i>pN</i>) (up to logarithms; dotted line in §4), the argument leaves the history
    bookkeeping and uses pseudorandomness of the graph and a contraction estimate to finish (${atlas('thm:edge-day', 'edge day')};
    ${atlas('lem:cklt-contraction', 'contraction lemma')}; ${essay('s7', 'essay: “From amplification to unanimity”')}).</p>
    <p><b>Limits of this page.</b> The simulations use finite <i>N</i> ≤ 10<sup>5</sup>, where √(<i>pN</i>) is only about 7–13, so the separation of scales in the
    proof is modest; logarithmic factors and “with high probability” statements are invisible at one seed. The block-pair view pools small
    classes. Nothing here checks the enumeration estimates or the Gaussian approximations; those are proved in the paper and, in part,
    formalized in <a href="${LEAN}" target="_blank" rel="noopener">Lean</a>.</p>
    <p class="hx-src">Sources: <a href="${ESSAY}" target="_blank" rel="noopener">essay</a> · <a href="${PAPER}" target="_blank" rel="noopener">paper (PDF)</a> ·
    <a href="${ARXIV}" target="_blank" rel="noopener">arXiv:2609.14957</a> · <a href="${ATLAS}" target="_blank" rel="noopener">proof atlas</a> ·
    <a href="${LEAN}" target="_blank" rel="noopener">Lean formalization</a>.</p>
  </div>
</section>

<footer>Simulator: xoshiro128** seeded from (seed, stream); <i>G</i>(<i>N</i>,<i>p</i>) sampled by geometric skipping into CSR adjacency; all work in Web Workers.
Every figure is reproducible from the parameters in the toolbar.</footer>
`;

const controlsBar = main.querySelector<HTMLElement>('.hx-controls');
if (controlsBar) {
  const syncControlsHeight = () => main.style.setProperty('--hx-controls-h', `${controlsBar.offsetHeight + 16}px`);
  new ResizeObserver(syncControlsHeight).observe(controlsBar);
  syncControlsHeight();
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const client = new SimClient();
const ui = {
  N: el<HTMLSelectElement>('c-N'),
  theta: el<HTMLSelectElement>('c-theta'),
  tau: el<HTMLInputElement>('c-tau'),
  seed: el<HTMLInputElement>('c-seed'),
  run: el<HTMLButtonElement>('c-run'),
  derived: el('c-derived'),
  status: el('c-status'),
  tMode: el<HTMLSelectElement>('t-mode'),
  tNeg: el<HTMLSelectElement>('t-neg'),
  mDay: el<HTMLSelectElement>('m-day'),
  mSrc: el<HTMLSelectElement>('m-src'),
  mMetric: el<HTMLSelectElement>('m-metric'),
  dDay: el<HTMLSelectElement>('d-day'),
  dSrc: el<HTMLSelectElement>('d-src'),
  dTgt: el<HTMLSelectElement>('d-tgt'),
  fRuns: el<HTMLSelectElement>('f-runs'),
  fRun: el<HTMLButtonElement>('f-run'),
};

let sim: SimResult | null = null;
let mat: MatrixResult | null = null;
let deg: DegreeResult | null = null;
let ens: EnsembleResult | null = null;
let generation = 0;

function readParams(): SimParams {
  const N = Number(ui.N.value);
  const theta = Number(ui.theta.value);
  const tau = Math.min(5, Math.max(0.1, Number(ui.tau.value) || 0.5));
  const seed = Math.max(0, Math.floor(Number(ui.seed.value) || 0)) >>> 0;
  return { N, theta, tau, seed };
}

function updateDerived(): void {
  const { N, theta } = readParams();
  const p = N ** -theta;
  const m = expectedEdges(N, theta);
  ui.derived.innerHTML = `p = ${fmtSig(p)}, pN = ${fmt2(p * N)}, k = ${theoremDays(theta)} days, E|E| ≈ ${fmtSig(m)}`;
  ui.run.disabled = m > MAX_EXPECTED_EDGES;
  if (m > MAX_EXPECTED_EDGES) ui.status.textContent = 'too many edges for the browser; lower N or raise θ';
}

function options(sel: HTMLSelectElement, items: { value: string; label: string }[], keep?: string): void {
  sel.replaceChildren(
    ...items.map((it) => {
      const o = document.createElement('option');
      o.value = it.value;
      o.innerHTML = it.label;
      return o;
    }),
  );
  if (keep !== undefined && items.some((i) => i.value === keep)) sel.value = keep;
}

function drawTree(): void {
  if (!sim) return;
  const { N, tau } = sim.params;
  const s = Math.sqrt(sim.p * N);
  const neg = Number(ui.tNeg.value);
  renderTree(el('t-host'), {
    sizes: sim.sizes,
    leads: sim.leads,
    N,
    mode: ui.tMode.value as TreeMode,
    negligible: neg,
    scale: (t) => tau * Math.sqrt(N) * s ** (t - 1),
  });
  el('t-coh').innerHTML = coherenceSummary(sim.sizes, 2000) || '<tr><td colspan="3">no mirror pairs above the size cutoff</td></tr>';
  const last = sim.sizes[sim.days - 1];
  let nonEmpty = 0;
  for (const x of last) if (x > 0) nonEmpty++;
  el('t-caption').innerHTML = `N = ${fmtInt(N)}, ${fmtInt(sim.edges)} edges. Leads Δ<sub>t</sub>: ${sim.leads.map(fmtInt).join(' → ')}.
    ${nonEmpty} of 2<sup>${sim.days}</sup> histories are nonempty on day ${sim.days}. Simulated in ${fmtInt(sim.elapsedMs)} ms.`;
}

function drawMatrix(): void {
  if (!sim || !mat) return;
  const source = ui.mSrc.value as MatrixSource;
  const metric = ui.mMetric.value as MatrixMetric;
  renderMatrix(el('m-host'), el('m-legend'), { data: mat, p: sim.p, metric, source, limit: metric === 'z' ? 6 : 1.15 });
  const r = meanSquaredZ(mat.real, mat.sizes, sim.p);
  const f = meanSquaredZ(mat.resampled, mat.sizes, sim.p);
  el('m-kpi').innerHTML = `<span>mean z² over ${r.cells} block pairs: real <b>${fmt2(r.value)}</b></span>
    <span>resampled <b>${fmt2(f.value)}</b></span><span class="hx-note">(≈ 1 for a partition independent of the graph)</span>`;
}

async function loadMatrix(): Promise<void> {
  if (!sim) return;
  const gen = generation;
  el('m-kpi').textContent = 'counting edges…';
  const r = await client.matrix({ day: Number(ui.mDay.value), maxClasses: 16 });
  if (gen !== generation) return;
  mat = r;
  drawMatrix();
}

function targetName(t: Target, day: number): string {
  return t.kind === 'class' ? historyLabel(t.code, day) : `{c${t.day} = ${t.sign > 0 ? '+' : '−'}}`;
}

function parseTarget(v: string): Target {
  const [kind, a, b] = v.split(':');
  return kind === 'class' ? { kind: 'class', code: Number(a) } : { kind: 'opinion', sign: Number(a) > 0 ? 1 : -1, day: Number(b) };
}

function fillDegreeSelectors(preferDefault: boolean): void {
  if (!sim) return;
  const day = Number(ui.dDay.value);
  const sizes = sim.sizes[day - 1];
  const codes = Array.from(sizes.keys())
    .filter((c) => sizes[c] >= 20)
    .sort((a, b) => sizes[b] - sizes[a]);
  const prevSrc = ui.dSrc.value;
  options(
    ui.dSrc,
    codes.map((c) => ({ value: String(c), label: `${historyLabel(c, day)} (${fmtInt(sizes[c])})` })),
    preferDefault ? undefined : prevSrc,
  );
  let def = codes[0];
  if (day >= 2) {
    const flip = codes.find((c) => ((c >> (day - 1)) & 1) !== ((c >> (day - 2)) & 1) && lastOpinion(c, day) === 1);
    if (flip !== undefined) def = flip;
  }
  if (preferDefault || !codes.some((c) => String(c) === prevSrc)) ui.dSrc.value = String(def);
  const prevT = ui.dTgt.value;
  const tgts: { value: string; label: string }[] = [];
  for (let r = 1; r <= day; r++) {
    tgts.push({ value: `opinion:1:${r}`, label: `day-${r} opinion + (all)` });
    tgts.push({ value: `opinion:-1:${r}`, label: `day-${r} opinion − (all)` });
  }
  for (const c of codes) tgts.push({ value: `class:${c}`, label: `class ${historyLabel(c, day)}` });
  options(ui.dTgt, tgts, preferDefault ? undefined : prevT);
  if (preferDefault || !tgts.some((t) => t.value === prevT)) {
    const src = Number(ui.dSrc.value);
    ui.dTgt.value = day >= 2 ? `opinion:${lastOpinion(src, day)}:${day - 1}` : 'opinion:1:1';
  }
}

async function loadDegrees(): Promise<void> {
  if (!sim) return;
  const gen = generation;
  const day = Number(ui.dDay.value);
  const target = parseTarget(ui.dTgt.value);
  el('d-sum').textContent = 'reading degrees…';
  const r = await client.degrees({ day, source: Number(ui.dSrc.value), target });
  if (gen !== generation) return;
  deg = r;
  drawDegrees();
}

function drawDegrees(): void {
  if (!sim || !deg) return;
  const name = targetName(deg.target, deg.day);
  const s = renderDegrees(el('d-host'), el('d-dec'), deg, sim.p, name);
  el('d-sum').innerHTML = `<p class="hx-caption">|S| = ${fmtInt(deg.sourceSize)} vertices of class ${historyHtml(historyLabel(deg.source, deg.day))},
    |T| = ${fmtInt(deg.targetSize)}${deg.overlap ? ' (S ⊆ T, so the binomial has |T| − 1 trials)' : ''}.</p>${degreeSummaryHtml(s)}`;
}

function drawEnsemble(): void {
  if (!ens) return;
  renderTrajectories(el('f-host'), ens);
  el('f-table').innerHTML = stepTableHtml(ens);
  const ok = (xs: number[]) => xs.filter(Number.isFinite);
  const avg = (xs: number[]) => ok(xs).reduce((a, b) => a + b, 0) / Math.max(1, ok(xs).length);
  el('f-echo').innerHTML = `<span>echo rate P(c₃ = c₁ | c₂ ≠ c₁): same graph <b>${fmtPct(avg(ens.echoReused))}</b></span>
    <span>new graph each day <b>${fmtPct(avg(ens.echoFresh))}</b></span>`;
}

async function runEnsemble(): Promise<void> {
  const params = readParams();
  const runs = Number(ui.fRuns.value);
  ui.fRun.disabled = true;
  const bar = el('f-bar');
  const status = el('f-status');
  bar.style.width = '0';
  status.textContent = `0 / ${runs} runs`;
  try {
    ens = await client.ensemble({ params: { ...params, seed: params.seed }, runs }, (d, t) => {
      bar.style.width = `${(100 * d) / t}%`;
      status.textContent = `${d} / ${t} runs`;
    });
    status.textContent = `${runs} runs at N = ${fmtInt(params.N)}, θ = ${params.theta}`;
    drawEnsemble();
  } catch (e) {
    status.textContent = `failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    ui.fRun.disabled = false;
  }
}

async function simulate(): Promise<void> {
  const params = readParams();
  if (expectedEdges(params.N, params.theta) > MAX_EXPECTED_EDGES) return;
  const gen = ++generation;
  ui.run.disabled = true;
  ui.status.textContent = 'sampling graph and running…';
  try {
    const r = await client.simulate(params);
    if (gen !== generation) return;
    sim = r;
    const days = Array.from({ length: r.days }, (_, i) => ({ value: String(i + 1), label: `day ${i + 1}` }));
    options(ui.mDay, days, ui.mDay.value || '2');
    if (!ui.mDay.value || Number(ui.mDay.value) > r.days) ui.mDay.value = '2';
    options(ui.dDay, days, ui.dDay.value || '2');
    if (!ui.dDay.value) ui.dDay.value = '2';
    fillDegreeSelectors(true);
    const e = expansionDays(r.params.theta);
    el('n-exp').innerHTML = `${e} days for θ = ${r.params.theta}, out of k = ${r.days}; the heuristic factor is
      √(2/π)·√(pN) = ${fmt2(heuristicFactor(r.params.N, r.p))} and the handoff scale N/√(pN) = ${fmtInt(r.params.N / Math.sqrt(r.p * r.params.N))}`;
    drawTree();
    ui.status.textContent = `${fmtInt(r.edges)} edges, lead ${fmtInt(r.leads[0])} → ${fmtInt(r.leads[r.days - 1])} (ε ≈ ${fmt3(r.leads[0] / r.params.N)})`;
    await loadMatrix();
    await loadDegrees();
  } catch (e) {
    ui.status.textContent = `failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    ui.run.disabled = false;
  }
}

for (const c of [ui.N, ui.theta, ui.tau, ui.seed]) c.addEventListener('input', updateDerived);
ui.run.addEventListener('click', () => {
  void simulate();
  void runEnsemble();
});
ui.tMode.addEventListener('change', drawTree);
ui.tNeg.addEventListener('change', drawTree);
ui.mDay.addEventListener('change', () => void loadMatrix());
ui.mSrc.addEventListener('change', drawMatrix);
ui.mMetric.addEventListener('change', drawMatrix);
ui.dDay.addEventListener('change', () => {
  fillDegreeSelectors(true);
  void loadDegrees();
});
ui.dSrc.addEventListener('change', () => void loadDegrees());
ui.dTgt.addEventListener('change', () => void loadDegrees());
ui.fRun.addEventListener('click', () => void runEnsemble());

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    drawTree();
    drawMatrix();
    drawDegrees();
    drawEnsemble();
  }, 150);
});

const tocLinks = Array.from(main.querySelectorAll<HTMLAnchorElement>('.hx-toc a'));
const observer = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      for (const a of tocLinks) a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`);
    }
  },
  { rootMargin: '-40% 0px -55% 0px' },
);
for (const s of main.querySelectorAll('section[id]')) observer.observe(s);

updateDerived();
void simulate();
void runEnsemble();
