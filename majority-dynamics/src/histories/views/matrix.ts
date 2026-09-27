import * as d3 from 'd3';
import { historyLabel } from '../classes';
import type { MatrixResult } from '../protocol';
import { cellStat } from '../stats';
import { fmt3, fmtInt, historyHtml } from './format';
import { hideTip, showTip } from './tooltip';

export type MatrixMetric = 'ratio' | 'z';
export type MatrixSource = 'real' | 'resampled';

export interface MatrixInput {
  data: MatrixResult;
  p: number;
  metric: MatrixMetric;
  source: MatrixSource;
  /** Symmetric colour limit: ratio in [1/r, r] (log scale) or |z| ≤ r. */
  limit: number;
}

function label(code: number, t: number): string {
  return code < 0 ? 'other' : historyLabel(code, t);
}

export function renderMatrix(host: HTMLElement, legendHost: HTMLElement, input: MatrixInput): void {
  const { data, p, metric, source, limit } = input;
  const k = data.codes.length;
  const m = source === 'real' ? data.real : data.resampled;
  const t = data.day;
  const labW = 14 + 7.2 * t;
  const labH = 10 + 11 * t;
  const cell = Math.max(14, Math.min(64, Math.floor(((host.clientWidth || 560) - labW - 70) / k)));
  const size = cell * k;
  const width = labW + size + 70;
  const height = labH + size + 8;

  const color = d3.scaleDiverging(d3.interpolateRdBu).domain(metric === 'ratio' ? [Math.log(limit), 0, -Math.log(limit)] : [limit, 0, -limit]).clamp(true);
  const value = (a: number, b: number) => {
    const st = cellStat(m[a * k + b], data.sizes[a], data.sizes[b], a === b, p);
    return { st, v: metric === 'ratio' ? Math.log(st.ratio) : st.z };
  };

  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('style', `max-width:${width}px`);
  const g = svg.append('g').attr('transform', `translate(${labW},${labH})`);
  const cells: { a: number; b: number }[] = [];
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) cells.push({ a, b });
  g.selectAll('rect')
    .data(cells)
    .join('rect')
    .attr('x', (d) => d.b * cell)
    .attr('y', (d) => d.a * cell)
    .attr('width', cell - 1)
    .attr('height', cell - 1)
    .attr('fill', (d) => {
      const { st, v } = value(d.a, d.b);
      return st.expected < 1 || !Number.isFinite(v) ? '#eee' : color(v);
    })
    .on('mousemove', (ev: MouseEvent, d) => {
      const { st } = value(d.a, d.b);
      const la = label(data.codes[d.a], t);
      const lb = label(data.codes[d.b], t);
      const pair = d.a === d.b ? `inside ${historyHtml(la)}` : `${historyHtml(la)} – ${historyHtml(lb)}`;
      showTip(
        ev,
        `<div class="hx-tip-h">${pair}</div>` +
          `${source === 'real' ? 'real graph' : 'resampled G(N,p), same partition'}<br>` +
          `edges ${fmtInt(st.observed)} vs p·pairs ${fmtInt(Math.round(st.expected))}<br>` +
          `density ratio ${fmt3(st.ratio)} · z = ${st.z.toFixed(1)}<br>` +
          `|V<sub>s</sub>| = ${fmtInt(data.sizes[d.a])}, |V<sub>t</sub>| = ${fmtInt(data.sizes[d.b])}`,
      );
    })
    .on('mouseleave', hideTip);

  const labels = data.codes.map((c) => label(c, t));
  const letters = (sel: d3.Selection<SVGTextElement, string, SVGGElement, unknown>) =>
    sel.each(function (l) {
      const el = d3.select(this);
      if (l === 'other') {
        el.append('tspan').attr('fill', '#666').text('other');
        return;
      }
      for (const ch of l) el.append('tspan').attr('class', ch === '+' ? 'hx-p' : 'hx-m').text(ch);
    });
  g.append('g')
    .selectAll<SVGTextElement, string>('text')
    .data(labels)
    .join('text')
    .attr('x', -5)
    .attr('y', (_, i) => i * cell + cell / 2 + 4)
    .attr('text-anchor', 'end')
    .attr('font-size', 11)
    .attr('font-family', 'ui-monospace, monospace')
    .call(letters);
  g.append('g')
    .selectAll<SVGTextElement, string>('text')
    .data(labels)
    .join('text')
    .attr('x', (_, i) => i * cell + cell / 2)
    .attr('y', -labH + 12)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .attr('font-family', 'ui-monospace, monospace')
    .each(function (l) {
      const el = d3.select(this);
      const x = el.attr('x');
      if (l === 'other') {
        el.attr('y', -6).attr('font-size', 9).append('tspan').attr('fill', '#666').text('other');
        return;
      }
      [...l].forEach((ch, r) =>
        el
          .append('tspan')
          .attr('x', x)
          .attr('dy', r === 0 ? 0 : 11)
          .attr('class', ch === '+' ? 'hx-p' : 'hx-m')
          .text(ch),
      );
    });

  // Class-size marginal.
  const maxN = d3.max(data.sizes) ?? 1;
  g.append('g')
    .selectAll('rect')
    .data(data.sizes)
    .join('rect')
    .attr('x', size + 6)
    .attr('y', (_, i) => i * cell + 2)
    .attr('height', cell - 5)
    .attr('width', (n) => (50 * n) / maxN)
    .attr('fill', '#bbb');
  g.append('text').attr('x', size + 6).attr('y', -6).attr('font-size', 10).attr('fill', '#666').text('|V_s|');

  host.replaceChildren(svg.node() as SVGSVGElement);
  renderLegend(legendHost, color, metric, limit);
}

function renderLegend(
  host: HTMLElement,
  color: d3.ScaleDiverging<string>,
  metric: MatrixMetric,
  limit: number,
): void {
  const w = 260;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${w} 50`).attr('width', w);
  const id = `hx-grad-${metric}`;
  const grad = svg.append('defs').append('linearGradient').attr('id', id);
  const lo = metric === 'ratio' ? -Math.log(limit) : -limit;
  const hi = -lo;
  for (let i = 0; i <= 10; i++) {
    const v = lo + ((hi - lo) * i) / 10;
    grad.append('stop').attr('offset', `${i * 10}%`).attr('stop-color', color(v));
  }
  svg.append('rect').attr('x', 10).attr('y', 16).attr('width', w - 20).attr('height', 12).attr('fill', `url(#${id})`);
  const ticks = metric === 'ratio' ? [`${fmt3(1 / limit)}`, '1', `${fmt3(limit)}`] : [`−${limit}`, '0', `+${limit}`];
  [10, w / 2, w - 10].forEach((x, i) =>
    svg.append('text').attr('x', x).attr('y', 42).attr('text-anchor', 'middle').attr('font-size', 11).text(ticks[i]),
  );
  svg
    .append('text')
    .attr('x', 10)
    .attr('y', 11)
    .attr('font-size', 10)
    .attr('fill', '#666')
    .text(metric === 'ratio' ? 'e / (p·pairs), log scale' : 'z-score vs Bin(pairs, p)');
  host.replaceChildren(svg.node() as SVGSVGElement);
}
