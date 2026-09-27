import * as d3 from 'd3';
import {
  amplificationPoints,
  exactDay1Ratio,
  initialMinority,
  noIsolatedMinorityProb,
  pnOf,
  quantile,
  successPoint,
  thetaOf,
  type RunResult,
} from './analysis';
import { FRESH_CONST, freshLinear, freshSaturating, theoremDays } from './sim';

export interface Series {
  label: string;
  color: string;
  /** Precomputed (offline) results are drawn hollow; in-browser results filled. */
  hollow: boolean;
  runs: RunResult[];
}

const C = {
  lead: '#2c6fbb',
  minority: '#d9731f',
  fresh: '#555',
  handoff: '#7b3fa0',
  theorem: '#b8322a',
  grid: '#e6e3dc',
};
export const DAY_COLORS = ['#2c6fbb', '#2a9d6f', '#c78a12', '#8e44ad'];

type Svg = d3.Selection<SVGSVGElement, unknown, null, undefined>;
type G = d3.Selection<SVGGElement, unknown, null, undefined>;

interface Frame {
  el: HTMLElement;
  svg: Svg;
  g: G;
  w: number;
  h: number;
}

const M = { top: 16, right: 24, bottom: 46, left: 64 };

function frame(el: HTMLElement, height = 380): Frame {
  const width = Math.max(320, el.clientWidth || 720);
  el.replaceChildren();
  const svg = d3
    .select(el)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height)
    .attr('class', 'chart') as Svg;
  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`) as G;
  return { el, svg, g, w: width - M.left - M.right, h: height - M.top - M.bottom };
}

function axes(f: Frame, x: d3.AxisScale<number>, y: d3.AxisScale<number>, xl: string, yl: string, opts: { xTicks?: d3.Axis<number>; yTicks?: d3.Axis<number> } = {}): void {
  const xa = opts.xTicks ?? d3.axisBottom<number>(x);
  const ya = opts.yTicks ?? d3.axisLeft<number>(y);
  f.g.append('g').attr('transform', `translate(0,${f.h})`).call(xa.tickSize(6) as never);
  const yg = f.g.append('g').call(ya.tickSize(6) as never);
  yg.selectAll<SVGGElement, unknown>('.tick').insert('line', ':first-child').attr('class', 'gridline').attr('x1', 0).attr('x2', f.w);
  f.g.append('text').attr('class', 'axis-label').attr('x', f.w / 2).attr('y', f.h + 38).attr('text-anchor', 'middle').text(xl);
  f.g.append('text').attr('class', 'axis-label').attr('transform', 'rotate(-90)').attr('x', -f.h / 2).attr('y', -48).attr('text-anchor', 'middle').text(yl);
}

function legend(f: Frame, items: { label: string; color: string; dash?: string; kind?: 'line' | 'dot' | 'hollow' }[]): void {
  const box = d3.select(f.el).append('div').attr('class', 'legend-html');
  for (const it of items) {
    const row = box.append('span').attr('class', 'item');
    const sw = row.append('svg').attr('width', 20).attr('height', 10);
    if (it.kind === 'dot' || it.kind === 'hollow') {
      sw.append('circle').attr('cx', 10).attr('cy', 5).attr('r', 4).attr('fill', it.kind === 'dot' ? it.color : 'white').attr('stroke', it.color).attr('stroke-width', 1.5);
    } else {
      sw.append('line').attr('x1', 1).attr('x2', 19).attr('y1', 5).attr('y2', 5).attr('stroke', it.color).attr('stroke-width', 2).attr('stroke-dasharray', it.dash ?? null);
    }
    row.append('span').text(it.label);
  }
}

const sup = (e: number): string => String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c] ?? (c === '-' ? '⁻' : c)).join('');
export const fmtPow10 = (v: number): string => {
  const e = Math.log10(v);
  return Math.abs(e - Math.round(e)) < 1e-9 ? `10${sup(Math.round(e))}` : d3.format('.3~s')(v);
};

function logTicks(scale: d3.ScaleLogarithmic<number, number>, axis: d3.Axis<number>): d3.Axis<number> {
  const [lo, hi] = scale.domain();
  const decades = Math.log10(hi / lo);
  if (decades > 3) {
    const ticks: number[] = [];
    for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) ticks.push(10 ** e);
    return axis.tickValues(ticks).tickFormat((v) => fmtPow10(+v));
  }
  return axis.ticks(8, '~g');
}

export interface LeadChartOptions {
  title?: string;
}

/** (a) Lead and minority size per day on a log scale, with the fresh-graph prediction and handoff scale. */
export function drawLeadChart(el: HTMLElement, run: RunResult | null): void {
  const f = frame(el, 420);
  if (!run || run.trials.length === 0) {
    f.g.append('text').attr('x', f.w / 2).attr('y', f.h / 2).attr('text-anchor', 'middle').attr('class', 'muted').text('Run a simulation to see trajectories.');
    return;
  }
  const { n } = run.spec;
  const pn = pnOf(run.spec);
  const theta = thetaOf(run.spec);
  const maxLen = d3.max(run.trials, (t) => t.lead.length) ?? 1;
  const k = theta > 0.5 && theta < 1 ? theoremDays(theta) : null;
  const xMax = Math.max(maxLen, k ?? 0, 4) + 0.5;
  const x = d3.scaleLinear().domain([0.5, xMax]).range([0, f.w]);
  const y = d3.scaleLog().domain([0.5, n * 2.2]).range([f.h, 0]).clamp(true);
  axes(f, x, y, 'day (day 1 = initial colouring)', 'vertices (log scale)', {
    xTicks: d3.axisBottom<number>(x).ticks(Math.min(20, Math.ceil(xMax))).tickFormat(d3.format('d')),
    yTicks: logTicks(y, d3.axisLeft<number>(y)),
  });
  const zeroY = y(0.5);
  f.g.append('text').attr('x', -8).attr('y', zeroY + 4).attr('text-anchor', 'end').attr('class', 'tick-note').text('0');

  const handoff = n / Math.sqrt(pn);
  const hline = (v: number, color: string, label: string, dash: string): void => {
    f.g.append('line').attr('x1', 0).attr('x2', f.w).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', color).attr('stroke-dasharray', dash).attr('stroke-width', 1.4);
    f.g.append('text').attr('x', f.w - 4).attr('y', y(v) - 5).attr('text-anchor', 'end').attr('fill', color).attr('class', 'annot').text(label);
  };
  hline(n, '#222', `N = ${d3.format(',')(n)}`, '2 3');
  hline(handoff, C.handoff, `handoff scale N/√(pN) ≈ ${d3.format('.3~s')(handoff)}`, '6 4');
  if (k !== null) {
    f.g.append('line').attr('x1', x(k)).attr('x2', x(k)).attr('y1', 0).attr('y2', f.h).attr('stroke', C.theorem).attr('stroke-dasharray', '4 3');
    f.g.append('text').attr('x', x(k) - 4).attr('y', 44).attr('text-anchor', 'end').attr('fill', C.theorem).attr('class', 'annot').text(`k(θ) = ${k} for θ ≈ ${theta.toFixed(3)}`);
  }

  const lineGen = d3
    .line<[number, number]>()
    .defined((d) => d[1] > 0)
    .x((d) => x(d[0]))
    .y((d) => y(d[1]));
  const trials = f.g.append('g');
  const alpha = Math.max(0.12, Math.min(0.6, 3 / run.trials.length));
  for (const t of run.trials) {
    const lead = t.lead.map((v, i) => [i + 1, v] as [number, number]);
    const minority = t.lead.map((v, i) => [i + 1, (n - v) / 2] as [number, number]);
    trials.append('path').attr('d', lineGen(lead)).attr('fill', 'none').attr('stroke', C.lead).attr('stroke-opacity', alpha).attr('stroke-width', 1.5);
    trials.append('path').attr('d', lineGen(minority)).attr('fill', 'none').attr('stroke', C.minority).attr('stroke-opacity', alpha).attr('stroke-width', 1.5);
    const last = minority[minority.length - 1];
    if (last[1] === 0) trials.append('circle').attr('cx', x(last[0])).attr('cy', zeroY).attr('r', 3.5).attr('fill', 'white').attr('stroke', C.minority).attr('stroke-opacity', Math.min(1, alpha * 2));
  }
  // Median lead per day across trials (trials that already finished keep their final value).
  const med: [number, number][] = [];
  for (let d = 0; d < maxLen; d++) {
    const vals = run.trials.map((t) => t.lead[Math.min(d, t.lead.length - 1)]).sort((a, b) => a - b);
    med.push([d + 1, quantile(vals, 0.5)]);
  }
  f.g.append('path').attr('d', lineGen(med)).attr('fill', 'none').attr('stroke', C.lead).attr('stroke-width', 2.6);

  const d0 = med[0][1];
  const days = Math.ceil(xMax);
  const lin = freshLinear(d0, pn, days)
    .map((v, i) => [i + 1, v] as [number, number])
    .filter((_d, i, arr) => i === 0 || arr[i - 1][1] < n);
  f.g.append('path').attr('d', lineGen(lin)).attr('fill', 'none').attr('stroke', C.fresh).attr('stroke-width', 1.6).attr('stroke-dasharray', '7 4');
  const sat = freshSaturating(d0, n, run.spec.p, days).map((v, i) => [i + 1, v] as [number, number]);
  f.g.append('path').attr('d', lineGen(sat)).attr('fill', 'none').attr('stroke', C.fresh).attr('stroke-width', 1.2).attr('stroke-dasharray', '1.5 3');

  legend(f, [
    { label: 'lead Δ (each trial; bold = median)', color: C.lead },
    { label: 'minority size (N−Δ)/2', color: C.minority },
    { label: 'fresh graph: Δ·√(2/π)·√(pN) iterated', color: C.fresh, dash: '7 4' },
    { label: 'fresh graph, Gaussian with saturation', color: C.fresh, dash: '1.5 3' },
  ]);
}

export type AmpMode = 'normalized' | 'raw';

/** (b) Measured one-day amplification Delta_{t+1}/Delta_t against pN. */
export function drawAmplificationChart(el: HTMLElement, series: Series[], mode: AmpMode): void {
  const f = frame(el, 400);
  const pts = series.flatMap((s) => s.runs.flatMap((r) => amplificationPoints(r).map((p) => ({ ...p, s, tau: r.spec.init === 'fixed' ? r.spec.tau : null }))));
  if (pts.length === 0) {
    f.g.append('text').attr('x', f.w / 2).attr('y', f.h / 2).attr('text-anchor', 'middle').attr('class', 'muted').text('No sweep data yet.');
    return;
  }
  const [pMin, pMax] = d3.extent(pts, (p) => p.pn) as [number, number];
  const x = d3.scaleLog().domain([Math.max(1, pMin / 1.5), pMax * 1.5]).range([0, f.w]);
  const val = (r: number, pn: number): number => (mode === 'normalized' ? r / Math.sqrt(pn) : r);
  const yVals = pts.flatMap((p) => [val(p.ratio - 2 * p.se, p.pn), val(p.ratio + 2 * p.se, p.pn)]);
  const y =
    mode === 'normalized'
      ? d3.scaleLinear().domain([Math.min(0.4, d3.min(yVals) ?? 0.4), Math.max(1.1, d3.max(yVals) ?? 1)]).nice().range([f.h, 0])
      : d3.scaleLog().domain([Math.max(0.5, (d3.min(yVals) ?? 1) / 1.3), (d3.max(yVals) ?? 10) * 1.3]).range([f.h, 0]);
  axes(f, x, y as d3.AxisScale<number>, 'average degree pN (log scale)', mode === 'normalized' ? 'Δₜ₊₁ / (Δₜ · √(pN))' : 'Δₜ₊₁ / Δₜ (log scale)', {
    xTicks: logTicks(x, d3.axisBottom<number>(x)),
  });
  const grid = d3.range(0, 201).map((i) => x.invert((i / 200) * f.w));
  const line = d3
    .line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(d[1]));
  f.g.append('path').attr('d', line(grid.map((pn) => [pn, val(FRESH_CONST * Math.sqrt(pn), pn)]))).attr('fill', 'none').attr('stroke', C.fresh).attr('stroke-width', 1.6).attr('stroke-dasharray', '7 4');
  const exactNs = [...new Set(pts.map((p) => `${p.n}|${p.tau ?? 1}`))];
  for (const key of exactNs) {
    const [n, tau] = key.split('|').map(Number);
    const curve = grid.filter((pn) => pn <= n / 4).map((pn) => [pn, val(exactDay1Ratio(n, pn, tau), pn)] as [number, number]);
    f.g.append('path').attr('d', line(curve)).attr('fill', 'none').attr('stroke', DAY_COLORS[0]).attr('stroke-width', 1.1).attr('stroke-opacity', 0.7);
  }
  const jitter = (day: number): number => 1 + (day - 2.5) * 0.025;
  const gp = f.g.append('g');
  for (const p of pts) {
    const cx = x(p.pn * jitter(p.day));
    const color = DAY_COLORS[(p.day - 1) % DAY_COLORS.length];
    gp.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(val(p.ratio - 2 * p.se, p.pn))).attr('y2', y(val(p.ratio + 2 * p.se, p.pn))).attr('stroke', color).attr('stroke-opacity', 0.6);
    gp.append('circle')
      .attr('cx', cx)
      .attr('cy', y(val(p.ratio, p.pn)))
      .attr('r', 4)
      .attr('fill', p.s.hollow ? 'white' : color)
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .append('title')
      .text(`${p.s.label}\nN = ${d3.format(',')(p.n)}, pN = ${d3.format('.4~g')(p.pn)}\nday ${p.day} → ${p.day + 1}: ratio ${p.ratio.toFixed(3)} ± ${(2 * p.se).toFixed(3)} (2 s.e., ${p.count} trials)\nfresh-graph √(2/π)√(pN) = ${(FRESH_CONST * Math.sqrt(p.pn)).toFixed(3)}`);
  }
  const days = [...new Set(pts.map((p) => p.day))].sort();
  legend(f, [
    { label: 'fresh graph √(2/π)·√(pN)', color: C.fresh, dash: '7 4' },
    { label: 'exact E[Δ₂]/Δ₁ (fresh = true on day 1)', color: DAY_COLORS[0] },
    ...days.map((d) => ({ label: `day ${d}→${d + 1}`, color: DAY_COLORS[(d - 1) % DAY_COLORS.length], kind: 'dot' as const })),
    ...(series.some((s) => s.hollow) ? [{ label: 'hollow = offline precomputed', color: '#666', kind: 'hollow' as const }] : []),
  ]);
}

const nColor = d3.scaleOrdinal<string>().domain(['1000', '10000', '100000', '1000000', '10000000']).range(['#9aa9c9', '#6f86b8', '#2c6fbb', '#b8322a', '#2a9d6f']);
export const colorForN = (n: number): string => nColor(String(n));

/** (c) Day of unanimity against theta, with Theorem 1.1's k(theta). */
export function drawDaysChart(el: HTMLElement, series: Series[]): void {
  const f = frame(el, 400);
  const runs = series.flatMap((s) => s.runs.map((r) => ({ r, s, theta: thetaOf(r.spec) }))).filter((d) => d.theta > 0.5 && d.theta < 1);
  const maxDay = Math.max(12, d3.max(runs.flatMap((d) => d.r.trials.map((t) => t.unanimousDay ?? 0))) ?? 0);
  const thetaMax = Math.max(0.9, (d3.max(runs, (d) => d.theta) ?? 0.9) + 0.02);
  const x = d3.scaleLinear().domain([0.5, Math.min(0.999, thetaMax)]).range([0, f.w]);
  const yTop = Math.min(theoremDays(x.domain()[1]), Math.max(maxDay + 2, 12));
  const y = d3.scaleLinear().domain([0, yTop]).range([f.h, 40]);
  axes(f, x, y, 'θ, where p = N^(−θ)  (θ = 1 − log(pN)/log N)', 'first day of unanimity');
  // k(theta) = 2 floor(1/(1-theta)) + 3 is constant on [1 - 1/j, 1 - 1/(j+1)).
  const steps: [number, number][] = [];
  for (let j = 2; j < 200; j++) {
    const a = 1 - 1 / j;
    const b = 1 - 1 / (j + 1);
    if (a >= x.domain()[1]) break;
    steps.push([Math.max(0.5, a), 2 * j + 3], [Math.min(b, x.domain()[1]), 2 * j + 3]);
  }
  const line = d3
    .line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(Math.min(d[1], yTop)));
  f.g.append('path').attr('d', line(steps)).attr('fill', 'none').attr('stroke', C.theorem).attr('stroke-width', 2);
  f.g.append('text').attr('x', x(0.52)).attr('y', y(7) - 6).attr('fill', C.theorem).attr('class', 'annot').text('Theorem 1.1: k(θ) = 2⌊1/(1−θ)⌋ + 3');

  const gp = f.g.append('g');
  const nRow = [...new Set(runs.map((d) => d.r.spec.n))].sort((a, b) => a - b);
  const fails: { row: number; px: number; failed: number; total: number; color: string; note: string }[] = [];
  let seq = 0;
  for (const { r, s, theta } of runs) {
    const color = colorForN(r.spec.n);
    const days = r.trials.map((t) => t.unanimousDay).filter((d): d is number => d !== null);
    const failed = r.trials.length - days.length;
    for (const d of days) {
      const jx = (((seq++ * 0.618034) % 1) - 0.5) * 10;
      const jy = (((seq * 0.414214) % 1) - 0.5) * 0.35;
      gp.append('circle').attr('cx', x(theta) + jx).attr('cy', y(d + jy)).attr('r', 2.6).attr('fill', s.hollow ? 'white' : color).attr('stroke', color).attr('fill-opacity', 0.7);
    }
    if (days.length > 0) {
      const med = quantile([...days].sort((a, b) => a - b), 0.5);
      gp.append('path').attr('d', d3.symbol(d3.symbolDiamond, 90)()).attr('transform', `translate(${x(theta)},${y(med)})`).attr('fill', s.hollow ? 'white' : color).attr('stroke', '#222').append('title').text(`${s.label}\nN = ${d3.format(',')(r.spec.n)}, pN = ${d3.format('.4~g')(pnOf(r.spec))}, θ = ${theta.toFixed(3)}\nmedian day ${med}; ${days.length}/${r.trials.length} unanimous for the initial majority; k(θ) = ${theoremDays(theta)}`);
    }
    if (failed > 0) fails.push({ row: nRow.indexOf(r.spec.n), px: x(theta), failed, total: r.trials.length, color, note: `N = ${fmtPow10(r.spec.n)}, θ = ${theta.toFixed(3)}: ${failed}/${r.trials.length}` });
  }
  // Nearby failure counts in the same N row are merged so labels never collide.
  fails.sort((a, b) => a.row - b.row || a.px - b.px);
  const clusters: (typeof fails)[] = [];
  for (const fl of fails) {
    const last = clusters[clusters.length - 1];
    if (last && last[0].row === fl.row && fl.px - last[last.length - 1].px < 34) last.push(fl);
    else clusters.push([fl]);
  }
  for (const cl of clusters) {
    const px = d3.mean(cl, (c) => c.px) ?? 0;
    const failed = d3.sum(cl, (c) => c.failed);
    gp.append('text').attr('x', px).attr('y', 8 + cl[0].row * 12).attr('text-anchor', 'middle').attr('class', 'fail-mark').attr('fill', cl[0].color).text(`${failed}✕`).append('title').text(`Trials not ending unanimous for the initial majority:\n${cl.map((c) => c.note).join('\n')}`);
  }
  const ns = [...new Set(runs.map((d) => d.r.spec.n))].sort((a, b) => a - b);
  legend(f, [
    ...ns.map((n) => ({ label: `N = ${fmtPow10(n)}`, color: colorForN(n), kind: 'dot' as const })),
    { label: '◆ median', color: '#222', kind: 'hollow' as const },
    { label: 'k✕ = trials without unanimity', color: '#666', kind: 'line' as const, dash: '1 3' },
  ]);
}

/** (d) Probability the initial majority becomes unanimous, against pN (open regime at small pN). */
export function drawSuccessChart(el: HTMLElement, series: Series[]): void {
  const f = frame(el, 420);
  const pts = series.flatMap((s) => s.runs.map((r) => ({ p: successPoint(r), s, r })));
  if (pts.length === 0) {
    f.g.append('text').attr('x', f.w / 2).attr('y', f.h / 2).attr('text-anchor', 'middle').attr('class', 'muted').text('No sweep data yet.');
    return;
  }
  const [pMin, pMax] = d3.extent(pts, (d) => d.p.pn) as [number, number];
  const x = d3.scaleLog().domain([Math.max(0.5, pMin / 1.4), pMax * 1.4]).range([0, f.w]);
  const y = d3.scaleLinear().domain([0, 1]).range([f.h, 38]);
  axes(f, x, y, 'average degree pN (log scale)', 'P(initial majority unanimous)', { xTicks: logTicks(x, d3.axisBottom<number>(x)) });

  const ns = [...new Set(pts.map((d) => d.p.n))].sort((a, b) => a - b);
  const nMax = ns[ns.length - 1];
  const ln = Math.log(nMax);
  f.g.append('rect').attr('x', 0).attr('y', 38).attr('width', Math.max(0, x(ln * ln))).attr('height', f.h - 38).attr('fill', '#f4e9d8').attr('opacity', 0.55);
  f.g.append('text').attr('x', 6).attr('y', f.h - 8).attr('class', 'annot open').text(`OPEN regime (sub-polynomial degree): empirical only`);
  for (const [ni, n] of ns.entries()) {
    const l = Math.log(n);
    for (const [v, lab] of [
      [l, 'log N'],
      [l * l, '(log N)²'],
    ] as const) {
      if (v < x.domain()[0] || v > x.domain()[1]) continue;
      f.g.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 38).attr('y2', f.h).attr('stroke', colorForN(n)).attr('stroke-dasharray', '3 3').attr('stroke-opacity', 0.8);
      f.g.append('text').attr('x', x(v)).attr('y', 8 + ni * 12).attr('text-anchor', 'middle').attr('class', 'annot').attr('fill', colorForN(n)).text(lab).append('title').text(`${lab} for N = ${fmtPow10(n)}: pN = ${v.toFixed(1)}`);
    }
  }
  const grid = d3.range(0, 201).map((i) => x.invert((i / 200) * f.w));
  const line = d3
    .line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(d[1]));
  for (const s of series) {
    const byN = d3.group(s.runs, (r) => r.spec.n);
    for (const [n, runs] of byN) {
      const minority = initialMinority(runs[0].spec);
      f.g.append('path').attr('d', line(grid.map((pn) => [pn, noIsolatedMinorityProb(n, pn, minority)]))).attr('fill', 'none').attr('stroke', colorForN(n)).attr('stroke-width', 1).attr('stroke-dasharray', '2 3');
      const sorted = runs.map(successPoint).sort((a, b) => a.pn - b.pn);
      f.g.append('path').attr('d', line(sorted.map((p) => [p.pn, p.successes / Math.max(1, p.trials)]))).attr('fill', 'none').attr('stroke', colorForN(n)).attr('stroke-width', 1.4).attr('stroke-opacity', 0.7);
    }
  }
  const gp = f.g.append('g');
  for (const { p, s } of pts) {
    const color = colorForN(p.n);
    const cx = x(p.pn);
    gp.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(p.lo)).attr('y2', y(p.hi)).attr('stroke', color).attr('stroke-opacity', 0.7);
    gp.append('circle')
      .attr('cx', cx)
      .attr('cy', y(p.successes / Math.max(1, p.trials)))
      .attr('r', 4)
      .attr('fill', s.hollow ? 'white' : color)
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .append('title')
      .text(`${s.label}\nN = ${d3.format(',')(p.n)}, pN = ${d3.format('.4~g')(p.pn)}\n${p.successes}/${p.trials} unanimous for initial majority (95% Wilson CI ${p.lo.toFixed(2)}–${p.hi.toFixed(2)})\n${p.isolatedBlocked} trials had an isolated initial-minority vertex`);
  }
  legend(f, [
    ...ns.map((n) => ({ label: `N = ${fmtPow10(n)}`, color: colorForN(n), kind: 'dot' as const })),
    { label: 'P(no isolated minority vertex), Poisson heuristic', color: '#666', dash: '2 3' },
    ...(series.some((s) => s.hollow) ? [{ label: 'hollow = offline precomputed', color: '#666', kind: 'hollow' as const }] : []),
  ]);
}
