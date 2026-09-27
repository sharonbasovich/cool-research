import * as d3 from 'd3';
import type { DegreeResult } from '../protocol';
import { binomialPmf } from '../fresh';
import { histogram, mean, sd } from '../stats';
import { FRESH, PLUS, fmt2 } from './format';

export interface DegreeSummary {
  meanReal: number;
  meanResampled: number;
  sdReal: number;
  sdResampled: number;
  binMean: number;
  binSd: number;
  trials: number;
}

export function summarizeDegrees(r: DegreeResult, p: number): DegreeSummary {
  const trials = r.targetSize - (r.overlap ? 1 : 0);
  return {
    meanReal: mean(r.real),
    meanResampled: mean(r.resampled),
    sdReal: sd(r.real),
    sdResampled: sd(r.resampled),
    binMean: trials * p,
    binSd: Math.sqrt(trials * p * (1 - p)),
    trials,
  };
}

interface Series {
  values: ArrayLike<number>;
  color: string;
  label: string;
  dashed?: boolean;
}

function renderHist(
  host: HTMLElement,
  series: Series[],
  opts: { xLabel: string; reference?: { lo: number; pmf: Float64Array; scale: number }; zeroLine?: boolean },
): void {
  const width = Math.max(420, host.clientWidth || 520);
  const height = 230;
  const margin = { top: 12, right: 12, bottom: 36, left: 46 };
  const all: number[] = [];
  for (const s of series) for (let i = 0; i < s.values.length; i++) all.push(s.values[i]);
  if (!all.length) {
    host.textContent = 'No vertices in this class on this run.';
    return;
  }
  let lo = d3.quantile(all.sort((a, b) => a - b), 0.0005) ?? 0;
  let hi = d3.quantile(all, 0.9995) ?? 1;
  if (opts.reference) {
    const r = opts.reference;
    let first = 0;
    let last = r.pmf.length - 1;
    const cut = 1e-4 * (d3.max(r.pmf) ?? 1);
    while (first < last && r.pmf[first] < cut) first++;
    while (last > first && r.pmf[last] < cut) last--;
    lo = Math.min(lo, r.lo + first);
    hi = Math.max(hi, r.lo + last);
  }
  const span = hi - lo + 1;
  const bin = Math.max(1, Math.ceil(span / 70));
  const binOf = (v: number) => Math.floor((v - lo) / bin);
  const nb = binOf(hi) + 1;
  const x = d3
    .scaleLinear()
    .domain([lo, lo + nb * bin])
    .range([margin.left, width - margin.right]);
  const curves = series.map((s) => {
    const counts = new Float64Array(nb);
    for (const [v, c] of histogram(s.values)) {
      const b = binOf(v);
      if (b >= 0 && b < nb) counts[b] += c;
    }
    const total = s.values.length || 1;
    return { s, dens: Array.from(counts, (c) => c / total / bin) };
  });
  let ref: { x: number; y: number }[] = [];
  if (opts.reference) {
    const r = opts.reference;
    ref = Array.from(r.pmf, (v, i) => ({ x: r.lo + i + 0.5, y: v }));
    ref = ref.filter((d) => d.x >= lo && d.x <= lo + nb * bin);
  }
  const ymax = Math.max(d3.max(curves.flatMap((c) => c.dens)) ?? 0, d3.max(ref, (d) => d.y) ?? 0) * 1.08 || 1;
  const y = d3
    .scaleLinear()
    .domain([0, ymax])
    .range([height - margin.bottom, margin.top]);

  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%');
  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4, '~g'));
  svg
    .append('text')
    .attr('x', (margin.left + width - margin.right) / 2)
    .attr('y', height - 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text(opts.xLabel);
  if (opts.zeroLine) {
    svg
      .append('line')
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#111')
      .attr('stroke-dasharray', '3 3');
  }
  curves.forEach(({ s, dens }, i) => {
    const pts: [number, number][] = [];
    dens.forEach((d, b) => {
      pts.push([x(lo + b * bin), y(d)]);
      pts.push([x(lo + (b + 1) * bin), y(d)]);
    });
    const line = d3.line();
    if (i === 0) {
      svg
        .append('path')
        .attr('d', d3.area().y0(y(0))(pts))
        .attr('fill', s.color)
        .attr('fill-opacity', 0.22);
    }
    svg
      .append('path')
      .attr('d', line(pts))
      .attr('fill', 'none')
      .attr('stroke', s.color)
      .attr('stroke-width', 1.6)
      .attr('stroke-dasharray', s.dashed ? '4 3' : null);
  });
  if (ref.length) {
    svg
      .append('g')
      .selectAll('circle')
      .data(ref.filter((_, i) => ref.length < 90 || i % Math.ceil(ref.length / 90) === 0))
      .join('circle')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', 1.8)
      .attr('fill', '#111');
  }
  host.replaceChildren(svg.node() as SVGSVGElement);
}

export function renderDegrees(host: HTMLElement, decisionHost: HTMLElement, r: DegreeResult, p: number, targetName: string): DegreeSummary {
  const s = summarizeDegrees(r, p);
  const ref = binomialPmf(s.trials, p, s.binMean - 8 * s.binSd - 3, s.binMean + 8 * s.binSd + 3);
  renderHist(
    host,
    [
      { values: r.real, color: PLUS, label: 'real graph' },
      { values: r.resampled, color: FRESH, label: 'resampled', dashed: true },
    ],
    { xLabel: `d[x, ${targetName}]`, reference: { ...ref, scale: 1 } },
  );
  if (r.lastDecisionReal && r.lastDecisionResampled) {
    renderHist(
      decisionHost,
      [
        { values: r.lastDecisionReal, color: PLUS, label: 'real graph' },
        { values: r.lastDecisionResampled, color: FRESH, label: 'resampled', dashed: true },
      ],
      { xLabel: `Σ_{y∼x} c_${r.day - 1}(y): the imbalance behind the day-${r.day} opinion`, zeroLine: true },
    );
  } else {
    decisionHost.textContent = 'Day 1 is the initial coloring, so there is no decision to show yet.';
  }
  return s;
}

export function degreeSummaryHtml(s: DegreeSummary): string {
  const shift = (s.meanReal - s.binMean) / s.binSd;
  const shiftRes = (s.meanResampled - s.binMean) / s.binSd;
  return `<table class="hx-table">
    <tr><th></th><th>mean</th><th>sd</th><th>(mean − np)/√(np(1−p))</th></tr>
    <tr><td><span class="hx-sw" style="background:${PLUS}"></span>real graph</td><td>${fmt2(s.meanReal)}</td><td>${fmt2(s.sdReal)}</td><td><b>${fmt2(shift)}</b></td></tr>
    <tr><td><span class="hx-sw hx-sw-dash" style="border-color:${FRESH}"></span>resampled G(N,p)</td><td>${fmt2(s.meanResampled)}</td><td>${fmt2(s.sdResampled)}</td><td>${fmt2(shiftRes)}</td></tr>
    <tr><td><span class="hx-sw hx-sw-dot"></span>Bin(${s.trials}, p)</td><td>${fmt2(s.binMean)}</td><td>${fmt2(s.binSd)}</td><td>0</td></tr>
  </table>`;
}
