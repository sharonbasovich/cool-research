import * as d3 from 'd3';
import { historyLabel, lastOpinion, mirror } from '../classes';
import { coherence } from '../stats';
import { MINUS, PLUS, fmtInt, fmtPct, historyHtml } from './format';
import { hideTip, showTip } from './tooltip';

export type TreeMode = 'proportional' | 'binary';

export interface TreeInput {
  sizes: Float64Array[];
  leads: number[];
  N: number;
  mode: TreeMode;
  /** Classes below this share of N are drawn as negligible. */
  negligible: number;
  /** A_t normalisation for ε̂ (the essay's τ√N (√pN)^{t−1}). */
  scale: (t: number) => number;
}

interface Node {
  t: number;
  code: number;
  x0: number;
  x1: number;
  n: number;
}

export function renderTree(host: HTMLElement, input: TreeInput): void {
  const { sizes, N, mode } = input;
  const k = sizes.length;
  const width = Math.max(560, host.clientWidth || 800);
  const rowH = 34;
  const gap = 6;
  const left = 58;
  const right = 190;
  const top = 8;
  const W = width - left - right;
  const height = top + k * (rowH + gap) + 8;

  const nodes: Node[] = [];
  const place = (t: number, code: number, x0: number, x1: number) => {
    const n = sizes[t - 1][code];
    nodes.push({ t, code, x0, x1, n });
    if (t === k) return;
    const plus = code;
    const minus = code | (1 << t);
    if (mode === 'proportional') {
      const np = sizes[t][plus];
      const mid = n > 0 ? x0 + ((x1 - x0) * np) / n : x0;
      if (n > 0) {
        place(t + 1, plus, x0, mid);
        place(t + 1, minus, mid, x1);
      }
    } else {
      const mid = (x0 + x1) / 2;
      place(t + 1, plus, x0, mid);
      place(t + 1, minus, mid, x1);
    }
  };
  if (mode === 'proportional') {
    const n0 = sizes[0][0];
    place(1, 0, 0, (W * n0) / N);
    place(1, 1, (W * n0) / N, W);
  } else {
    place(1, 0, 0, W / 2);
    place(1, 1, W / 2, W);
  }

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%')
    .attr('role', 'img')
    .attr('aria-label', 'Icicle diagram of opinion-history classes by day');
  const defs = svg.append('defs');
  defs
    .append('pattern')
    .attr('id', 'hx-hatch')
    .attr('width', 5)
    .attr('height', 5)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('patternTransform', 'rotate(45)')
    .append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', 5)
    .attr('stroke', '#c9c5bb')
    .attr('stroke-width', 1.5);

  const g = svg.append('g').attr('transform', `translate(${left},${top})`);
  const y = (t: number) => (t - 1) * (rowH + gap);
  const logShare = d3.scaleLinear().domain([-5, 0]).range([0.12, 1]).clamp(true);

  const visible = nodes.filter((d) => d.x1 - d.x0 >= (mode === 'binary' ? 0 : 0.35));
  g.selectAll('rect.node')
    .data(visible)
    .join('rect')
    .attr('class', 'node')
    .attr('x', (d) => d.x0)
    .attr('y', (d) => y(d.t))
    .attr('width', (d) => Math.max(0, d.x1 - d.x0 - (d.x1 - d.x0 > 3 ? 0.6 : 0)))
    .attr('height', rowH)
    .attr('fill', (d) => {
      if (d.n === 0) return 'url(#hx-hatch)';
      return lastOpinion(d.code, d.t) === 1 ? PLUS : MINUS;
    })
    .attr('fill-opacity', (d) => {
      if (d.n === 0) return 1;
      const share = d.n / N;
      if (mode === 'binary') return logShare(Math.log10(share));
      return share < input.negligible ? 0.35 : 0.9;
    })
    .attr('stroke', (d) => (d.n > 0 && d.n / N < input.negligible ? '#999' : 'none'))
    .attr('stroke-dasharray', '2 2')
    .on('mousemove', (ev: MouseEvent, d) => showTip(ev, tipHtml(d, input)))
    .on('mouseleave', hideTip);

  g.selectAll('text.lab')
    .data(visible.filter((d) => d.x1 - d.x0 > 12 * d.t + 8 && d.n > 0))
    .join('text')
    .attr('class', 'lab')
    .attr('x', (d) => (d.x0 + d.x1) / 2)
    .attr('y', (d) => y(d.t) + rowH / 2 + 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#fff')
    .attr('font-size', 11)
    .attr('pointer-events', 'none')
    .text((d) => historyLabel(d.code, d.t));

  const rows = d3.range(1, k + 1);
  g.selectAll('text.day')
    .data(rows)
    .join('text')
    .attr('class', 'day')
    .attr('x', -8)
    .attr('y', (t) => y(t) + rowH / 2 + 4)
    .attr('text-anchor', 'end')
    .attr('font-size', 12)
    .text((t) => `day ${t}`);

  g.selectAll('text.stat')
    .data(rows)
    .join('text')
    .attr('class', 'stat')
    .attr('x', W + 10)
    .attr('y', (t) => y(t) + rowH / 2 - 2)
    .attr('font-size', 11)
    .each(function (t) {
      const s = sizes[t - 1];
      let nonEmpty = 0;
      let big = 0;
      for (let c = 0; c < s.length; c++) {
        if (s[c] > 0) nonEmpty++;
        if (s[c] >= input.negligible * N) big++;
      }
      const el = d3.select(this);
      el.append('tspan').text(`Δ = ${fmtInt(input.leads[t - 1])}`);
      el.append('tspan')
        .attr('x', W + 10)
        .attr('dy', 13)
        .attr('fill', '#666')
        .text(`${nonEmpty}/${s.length} non-empty · ${big} ≥ ${fmtPct(input.negligible)}`);
    });

  host.replaceChildren(svg.node() as SVGSVGElement);
}

function tipHtml(d: Node, input: TreeInput): string {
  const { sizes, N, scale } = input;
  const label = historyLabel(d.code, d.t);
  const lines = [`<div class="hx-tip-h">${historyHtml(label)}</div>`, `|V<sub>s</sub>| = ${fmtInt(d.n)} (${fmtPct(d.n / N)} of N)`];
  if (d.n === 0) lines.push('<em>empty on this run</em>');
  const mb = mirror(d.code, d.t);
  const nm = sizes[d.t - 1][mb];
  lines.push(`mirror ${historyHtml(historyLabel(mb, d.t))}: ${fmtInt(nm)}`);
  if (d.n + nm > 0) {
    const eps = (d.n - nm) / (2 * scale(d.t));
    lines.push(`(|V<sub>s</sub>| − |V<sub>s̄</sub>|) / 2A<sub>${d.t}</sub> = ${eps.toFixed(3)}`);
  }
  if (d.t < sizes.length && d.n > 0) {
    const np = sizes[d.t][d.code];
    const nmn = sizes[d.t][d.code | (1 << d.t)];
    lines.push(`next day: ${fmtInt(np)} → +, ${fmtInt(nmn)} → − (lead within class ${fmtInt(np - nmn)})`);
  }
  return lines.join('<br>');
}

export function coherenceSummary(sizes: Float64Array[], minSize: number): string {
  const rows = sizes.slice(1).map((s, i) => coherence(s, i + 2, minSize));
  return rows
    .filter((r) => r.pairs > 0)
    .map(
      (r) =>
        `<tr><td>day ${r.day}</td><td>${r.coherent} / ${r.pairs}</td><td>${
          r.failures.length ? r.failures.map(historyHtml).join(', ') : 'none'
        }</td></tr>`,
    )
    .join('');
}
