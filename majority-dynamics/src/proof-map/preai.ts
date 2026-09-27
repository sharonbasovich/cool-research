import * as d3 from 'd3';
import type { Ctx } from './context';
import { comparePreAi } from './data';
import { PHASE_COLOR } from './phases';
import { escapeHtml as esc, stripTex } from './tex';

const ROW = 19;
const TOP = 36;

const TYPE_LABEL: Record<string, string> = {
  error: 'errors in the old paper',
  gap: 'gaps filled',
  misapplied: 'misapplications',
  strengthened: 'strengthened',
  split: 'split / merged',
  new: 'new statements',
  dropped: 'old material dropped',
  notation: 'notation changes',
};
const TYPE_ORDER = ['error', 'gap', 'misapplied', 'new', 'strengthened', 'split', 'dropped', 'notation'];

export function mountPreAi(ctx: Ctx, root: HTMLElement): { refresh(): void } {
  const cmp = comparePreAi(ctx.file.atlas);
  const byLabel = new Map(cmp.current.map((s) => [s.label, s]));
  const oldPdf = (cmp.old[0]?.url ?? ctx.file.meta.atlasUrl).replace(/pdf-viewer\.html\?file=([^#&]+).*$/, '$1');
  root.innerHTML = `
    <p class="pm-sub">The atlas maps every current statement to its place in the
      <a href="${esc(oldPdf)}" target="_blank" rel="noopener">August 2025 manuscript</a>
      (written without AI assistance) and flags what the audit changed. Left: old items in page order. Right: the current paper,
      restructured along logical dependencies. Crossing lines are material that moved.</p>
    <div class="pm-stats">${[
      [cmp.old.length, 'old items referenced'],
      [cmp.current.length - cmp.newStatements.length, 'current statements with an old counterpart'],
      [cmp.newStatements.length, 'without one'],
      ...TYPE_ORDER.filter((t) => cmp.calloutCounts[t]).map((t) => [cmp.calloutCounts[t], TYPE_LABEL[t]] as [number, string]),
    ]
      .map(([n, l]) => `<div><b>${n}</b><span>${esc(String(l))}</span></div>`)
      .join('')}</div>
    <div class="pm-bip"><svg></svg></div>`;
  const svg = d3.select(root.querySelector('svg')!);
  const box = root.querySelector<HTMLElement>('.pm-bip')!;
  const rows = Math.max(cmp.old.length, cmp.current.length);
  const height = TOP + rows * ROW + 20;

  function draw() {
    const width = box.clientWidth;
    if (!width) return;
    svg.attr('width', width).attr('height', height).selectAll('*').remove();
    const leftX = Math.min(260, width * 0.3);
    const rightX = width - Math.min(360, width * 0.4);
    const oldY = (i: number) => TOP + (i + 0.5) * ((rows * ROW) / cmp.old.length);
    const curY = (i: number) => TOP + i * ROW + ROW / 2;
    const curIndex = new Map(cmp.current.map((s, i) => [s.label, i]));
    svg.append('text').attr('class', 'pm-colhead').attr('x', leftX).attr('y', 16).attr('text-anchor', 'end').text('August 2025 manuscript');
    svg.append('text').attr('class', 'pm-colhead').attr('x', rightX).attr('y', 16).text('Current paper (September 2026)');
    const links = cmp.old.flatMap((o, i) => o.targets.map((t) => ({ i, t, o })));
    const sel = ctx.selection?.type === 'node' ? ctx.selection.id : null;
    svg
      .append('g')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('class', (d) => `pm-bilink${sel ? (d.t === sel ? ' is-on' : ' is-dim') : ''}`)
      .attr('stroke', (d) => PHASE_COLOR[byLabel.get(d.t)!.phase])
      .attr('d', (d) => {
        const y0 = oldY(d.i);
        const y1 = curY(curIndex.get(d.t)!);
        const mx = (leftX + rightX) / 2;
        return `M${leftX + 6},${y0} C${mx},${y0} ${mx},${y1} ${rightX - 6},${y1}`;
      });
    const og = svg
      .append('g')
      .selectAll('g')
      .data(cmp.old)
      .join('g')
      .attr('class', (d) => `pm-olditem${sel && d.targets.includes(sel) ? ' is-on' : ''}`)
      .attr('transform', (_d, i) => `translate(${leftX},${oldY(i)})`);
    og.append('circle').attr('r', 3.5).attr('cx', 3);
    og.append('a')
      .attr('href', (d) => d.url)
      .attr('target', '_blank')
      .append('text')
      .attr('x', -4)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text((d) => {
        const t = stripTex(d.text);
        return (t.length > 34 ? t.slice(0, 33) + '…' : t) + (d.page ? `  p.${d.page}` : '');
      })
      .append('title')
      .text((d) => stripTex(d.text));
    const cg = svg
      .append('g')
      .selectAll('g')
      .data(cmp.current)
      .join('g')
      .attr('class', (d) => `pm-curitem${d.label === sel ? ' is-on' : ''}`)
      .attr('transform', (_d, i) => `translate(${rightX},${curY(i)})`)
      .on('click', (_e, d) => ctx.select({ type: 'node', id: d.label }));
    cg.append('circle').attr('r', 4.5).attr('fill', (d) => PHASE_COLOR[d.phase]);
    cg.append('text')
      .attr('x', 10)
      .attr('dy', '0.35em')
      .text((d) => {
        const title = d.title !== `${d.kind} ${d.number}` ? ' ' + stripTex(d.title) : '';
        const s = `${d.kind} ${d.number}${title}`;
        return s.length > 44 ? s.slice(0, 43) + '…' : s;
      });
    cg.each(function (d) {
      const types = [...new Set(d.callouts.map((c) => c.type))].filter((t) => t !== 'notation');
      const x0 = Math.min(360, width * 0.4) - 12;
      d3.select(this)
        .selectAll('rect')
        .data(types)
        .join('rect')
        .attr('class', (t) => `pm-badge pm-badge-${t}`)
        .attr('x', (_t, i) => x0 - i * 11)
        .attr('y', -4.5)
        .attr('width', 9)
        .attr('height', 9)
        .attr('rx', 2)
        .append('title')
        .text((t) => TYPE_LABEL[t] ?? t);
    });
  }
  const legend = document.createElement('p');
  legend.className = 'pm-sub';
  legend.innerHTML =
    'Badges: ' +
    ['error', 'gap', 'misapplied', 'new', 'strengthened', 'split', 'dropped']
      .map((t) => `<span class="pm-badge-inline pm-badge-${t}"></span> ${esc(TYPE_LABEL[t])}`)
      .join(' &nbsp; ');
  root.insertBefore(legend, box);
  ctx.onSelect(() => draw());
  let lastW = 0;
  new ResizeObserver(() => {
    if (box.clientWidth && box.clientWidth !== lastW) {
      lastW = box.clientWidth;
      draw();
    }
  }).observe(box);
  return { refresh: draw };
}
