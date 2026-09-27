import * as d3 from 'd3';
import type { EnsembleResult } from '../protocol';
import { heuristicFactor } from '../fresh';
import { mean, sd } from '../stats';
import { FRESH, PLUS, fmt2, fmt3 } from './format';

export function renderTrajectories(host: HTMLElement, e: EnsembleResult): void {
  const { N } = e.params;
  const p = e.p;
  const k = e.days;
  const width = Math.max(460, host.clientWidth || 620);
  const height = 330;
  const margin = { top: 14, right: 150, bottom: 38, left: 58 };
  const x = d3
    .scaleLinear()
    .domain([1, k])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLog()
    .domain([Math.max(1, Math.sqrt(N) / 4), N * 1.4])
    .range([height - margin.bottom, margin.top])
    .clamp(true);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%');
  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(k).tickFormat(d3.format('d')));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6, '~s'));
  svg
    .append('text')
    .attr('x', (margin.left + width - margin.right) / 2)
    .attr('y', height - 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text('day');
  svg
    .append('text')
    .attr('transform', `translate(14,${(height - margin.bottom) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text('lead Δ_t (log scale)');

  const hline = (v: number, label: string, dash: string) => {
    svg
      .append('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', y(v))
      .attr('y2', y(v))
      .attr('stroke', '#999')
      .attr('stroke-dasharray', dash);
    svg
      .append('text')
      .attr('x', width - margin.right + 6)
      .attr('y', y(v) + 4)
      .attr('font-size', 11)
      .attr('fill', '#555')
      .text(label);
  };
  hline(N, 'N (unanimity)', '1 0');
  hline(N / Math.sqrt(p * N), 'N/√(pN) (handoff scale)', '5 4');

  const line = d3
    .line<number>()
    .defined((v) => v > 0)
    .x((_, i) => x(i + 1))
    .y((v) => y(v));
  const drawRuns = (runs: number[][], color: string, dash: string | null) => {
    for (const r of runs)
      svg
        .append('path')
        .attr('d', line(r))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-opacity', 0.28)
        .attr('stroke-dasharray', dash);
    const med = d3.range(k).map((t) => d3.median(runs, (r) => r[t]) ?? 0);
    svg
      .append('path')
      .attr('d', line(med))
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', dash);
  };
  drawRuns(e.fresh, FRESH, '5 3');
  drawRuns(e.reused, PLUS, null);

  const d1 = d3.median(e.reused, (r) => r[0]) ?? 1;
  const h = heuristicFactor(N, p);
  const heur = d3.range(k).map((t) => Math.min(N, d1 * h ** t));
  svg
    .append('path')
    .attr('d', line(heur))
    .attr('fill', 'none')
    .attr('stroke', '#111')
    .attr('stroke-width', 1.2)
    .attr('stroke-dasharray', '1 3');

  const legend = [
    { c: PLUS, dash: null, t: 'same graph every day' },
    { c: FRESH, dash: '5 3', t: 'new G(N,p) every day' },
    { c: '#111', dash: '1 3', t: 'Δ₁·(√(2/π)√(pN))^{t−1}' },
  ];
  const lg = svg.append('g').attr('transform', `translate(${margin.left + 10},${margin.top + 6})`);
  legend.forEach((l, i) => {
    lg.append('line')
      .attr('x1', 0)
      .attr('x2', 22)
      .attr('y1', i * 16)
      .attr('y2', i * 16)
      .attr('stroke', l.c)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', l.dash);
    lg.append('text')
      .attr('x', 28)
      .attr('y', i * 16 + 4)
      .attr('font-size', 11)
      .text(l.t);
  });
  host.replaceChildren(svg.node() as SVGSVGElement);
}

export interface StepRow {
  step: number;
  reused: { mean: number; se: number; n: number };
  fresh: { mean: number; se: number; n: number };
  relative: { mean: number; se: number; n: number };
}

function summary(xs: number[]): { mean: number; se: number; n: number } {
  return { mean: mean(xs), se: xs.length > 1 ? sd(xs) / Math.sqrt(xs.length) : NaN, n: xs.length };
}

/**
 * Per-step amplification Δ_{t+1}/Δ_t, restricted to runs still far from
 * saturation (Δ_t ≤ N/(2√pN)), so that the linear-response picture applies.
 */
export function stepTable(e: EnsembleResult): StepRow[] {
  const { N } = e.params;
  const cap = N / (2 * Math.sqrt(e.p * N));
  const rows: StepRow[] = [];
  for (let t = 0; t < e.days - 1; t++) {
    const rr: number[] = [];
    const ff: number[] = [];
    const rel: number[] = [];
    e.reused.forEach((r, i) => {
      if (r[t] > 0 && r[t] <= cap) {
        rr.push(r[t + 1] / r[t]);
        rel.push(r[t + 1] / e.freshExpected[i][t]);
      }
    });
    e.fresh.forEach((r) => {
      if (r[t] > 0 && r[t] <= cap) ff.push(r[t + 1] / r[t]);
    });
    if (!rr.length && !ff.length) continue;
    rows.push({ step: t + 1, reused: summary(rr), fresh: summary(ff), relative: summary(rel) });
  }
  return rows;
}

export function stepTableHtml(e: EnsembleResult): string {
  const h = heuristicFactor(e.params.N, e.p);
  const cell = (s: { mean: number; se: number; n: number }, digits = fmt2) =>
    s.n ? `${digits(s.mean)}${Number.isFinite(s.se) ? ` <span class="hx-se">± ${digits(s.se)}</span>` : ''}` : 'n/a';
  const rows = stepTable(e)
    .map(
      (r) =>
        `<tr><td>${r.step} → ${r.step + 1}</td><td>${cell(r.fresh)}</td><td>${cell(r.reused)}</td><td><b>${cell(r.relative, fmt3)}</b></td><td>${r.reused.n}</td></tr>`,
    )
    .join('');
  return `<table class="hx-table">
    <tr><th>step</th><th>Δ<sub>t+1</sub>/Δ<sub>t</sub>, new graph</th><th>Δ<sub>t+1</sub>/Δ<sub>t</sub>, same graph</th><th>same-graph Δ<sub>t+1</sub> ÷ exact fresh E[Δ<sub>t+1</sub> | Δ<sub>t</sub>]</th><th>runs</th></tr>
    ${rows}
  </table>
  <p class="hx-note">Heuristic factor √(2/π)·√(pN) = ${fmt2(h)}. Means ± standard errors over runs. Steps count only while Δ<sub>t</sub> ≤ N/(2√(pN)), i.e. before saturation.</p>`;
}
