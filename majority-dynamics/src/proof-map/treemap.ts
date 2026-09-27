import * as d3 from 'd3';
import type { LeanModule } from '../../scripts/proof-map/types';
import type { Ctx } from './context';
import { escapeHtml as esc } from './tex';

interface TNode {
  name: string;
  path: string;
  module?: LeanModule;
  children?: TNode[];
}

const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#86bcb6', '#bab0ac'];

export function buildTree(modules: LeanModule[]): TNode {
  const root: TNode = { name: 'sparse-majority-dynamics-lean', path: '', children: [] };
  for (const m of modules) {
    const parts = m.path.replace(/\.lean$/, '').split('/');
    let cur = root;
    parts.slice(0, -1).forEach((p, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let next = cur.children!.find((c) => c.children && c.path === path);
      if (!next) cur.children!.push((next = { name: p, path, children: [] }));
      cur = next;
    });
    cur.children!.push({ name: parts[parts.length - 1], path: m.path, module: m });
  }
  return root;
}

/** Top-level area a module belongs to: MajorityDynamics/<Area>/…, or the root file itself. */
export function areaOf(path: string): string {
  const p = path.split('/');
  if (p[0] === 'MajorityDynamics' && p.length > 2) return p[1];
  if (p[0] === 'MajorityDynamics') return 'MajorityDynamics (root)';
  return p[0].replace(/\.lean$/, '');
}

export function mountTreemap(ctx: Ctx, root: HTMLElement): { refresh(): void } {
  const mods = ctx.lean.modules;
  const areas = d3.rollups(mods, (v) => d3.sum(v, (m) => m.lines), (m) => areaOf(m.path)).sort((a, b) => b[1] - a[1]);
  const color = d3.scaleOrdinal<string, string>().domain(areas.map((a) => a[0])).range(PALETTE);
  const linked = new Set(ctx.index.statementsOf.keys());
  const total = ctx.lean.totalLines;
  root.innerHTML = `
    <div class="pm-toolbar">
      <nav class="pm-crumbs"></nav>
      <label class="pm-check"><input type="checkbox" data-opt="linked" /> only modules linked to paper statements</label>
    </div>
    <p class="pm-sub">${mods.length.toLocaleString()} modules, ${total.toLocaleString()} lines at
      <a href="${esc(ctx.file.meta.leanRepo)}/tree/${esc(ctx.file.meta.leanRev)}" target="_blank" rel="noopener"><code>${esc(ctx.file.meta.leanRev.slice(0, 7))}</code></a>.
      Area is proportional to lines, and outlined tiles are linked to atlas statements (${linked.size} modules). Click a directory header to zoom, a tile for details.</p>
    <div class="pm-tm"><svg></svg><div class="pm-tip" hidden></div></div>
    <div class="pm-areas"></div>`;
  const svg = d3.select(root.querySelector('svg')!);
  const box = root.querySelector<HTMLElement>('.pm-tm')!;
  const tip = root.querySelector<HTMLElement>('.pm-tip')!;
  const crumbs = root.querySelector<HTMLElement>('.pm-crumbs')!;
  let onlyLinked = false;
  let focusPath = '';

  root.querySelector<HTMLElement>('.pm-areas')!.innerHTML =
    '<h4>Lines by area</h4><table>' +
    areas
      .map(
        ([a, l]) =>
          `<tr><td><i style="background:${color(a)}"></i>${esc(a)}</td><td class="pm-num">${l.toLocaleString()}</td><td class="pm-bar"><span style="width:${((100 * l) / areas[0][1]).toFixed(1)}%;background:${color(a)}"></span></td></tr>`,
      )
      .join('') +
    '</table>';

  root.querySelector<HTMLInputElement>('[data-opt="linked"]')!.addEventListener('change', (e) => {
    onlyLinked = (e.target as HTMLInputElement).checked;
    draw();
  });
  crumbs.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-path]');
    if (t) {
      focusPath = t.dataset.path!;
      draw();
    }
  });

  function highlightSet(): Set<string> {
    const sel = ctx.selection;
    if (sel?.type === 'node') return new Set(ctx.index.modulesOf.get(sel.id) ?? []);
    if (sel?.type === 'module') return new Set([sel.id]);
    return new Set();
  }

  function draw() {
    const width = box.clientWidth;
    if (!width) return;
    const height = Math.max(520, Math.min(760, width * 0.62));
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    const full = buildTree(onlyLinked ? mods.filter((m) => linked.has(m.name)) : mods);
    let sub = full;
    for (const part of focusPath ? focusPath.split('/') : []) {
      const nxt = sub.children?.find((c) => c.name === part && c.children);
      if (!nxt) break;
      sub = nxt;
    }
    const segs = focusPath ? focusPath.split('/') : [];
    crumbs.innerHTML =
      `<button data-path="">lean</button>` +
      segs.map((s, i) => ` / <button data-path="${esc(segs.slice(0, i + 1).join('/'))}">${esc(s)}</button>`).join('');

    const h = d3
      .hierarchy<TNode>(sub, (d) => d.children)
      .sum((d) => d.module?.lines ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    d3.treemap<TNode>().size([width, height]).paddingOuter(3).paddingTop((d) => (d.depth > 0 && d.depth <= 3 ? 17 : 3)).paddingInner(1).round(true)(h);
    const hl = highlightSet();
    const nodes = h.descendants() as d3.HierarchyRectangularNode<TNode>[];
    svg.selectAll('*').remove();
    const g = svg.selectAll('g').data(nodes).join('g').attr('transform', (d) => `translate(${d.x0},${d.y0})`);
    g.append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('class', (d) =>
        d.data.module
          ? `pm-tile${linked.has(d.data.module.name) ? ' is-linked' : ''}${hl.has(d.data.module.name) ? ' is-hl' : ''}${hl.size && !hl.has(d.data.module.name) ? ' is-dim' : ''}`
          : `pm-dir pm-depth-${d.depth}`,
      )
      .attr('fill', (d) => (d.data.module ? color(areaOf(d.data.path)) : d.depth === 0 ? 'transparent' : '#00000008'));
    g.filter((d) => !d.data.module && d.depth > 0 && d.depth <= 3 && d.x1 - d.x0 > 40)
      .append('text')
      .attr('class', 'pm-dirlab')
      .attr('x', 4)
      .attr('y', 12)
      .text((d) => {
        const w = d.x1 - d.x0;
        const s = `${d.data.name} · ${(d.value ?? 0).toLocaleString()}`;
        return s.length * 6.2 > w - 6 ? d.data.name.slice(0, Math.max(1, Math.floor((w - 12) / 6.2))) : s;
      })
      .on('click', (_e, d) => {
        focusPath = d.data.path;
        draw();
      });
    g.filter((d) => !!d.data.module && d.x1 - d.x0 > 46 && d.y1 - d.y0 > 14)
      .append('text')
      .attr('class', 'pm-tilelab')
      .attr('x', 3)
      .attr('y', 11)
      .text((d) => {
        const w = d.x1 - d.x0;
        const s = d.data.name;
        return s.length * 5.6 > w - 4 ? s.slice(0, Math.max(1, Math.floor((w - 8) / 5.6))) + '…' : s;
      });
    g.filter((d) => !!d.data.module)
      .on('mouseenter', (ev: MouseEvent, d) => {
        const m = d.data.module!;
        const st = ctx.index.statementsOf.get(m.name) ?? [];
        tip.innerHTML = `<b>${esc(m.name)}</b><br>${m.lines.toLocaleString()} lines${st.length ? ` · ${st.length} statement${st.length > 1 ? 's' : ''}` : ''}`;
        tip.hidden = false;
        const r = box.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - 300) + 'px';
        tip.style.top = ev.clientY - r.top + 12 + 'px';
      })
      .on('mouseleave', () => (tip.hidden = true))
      .on('click', (_e, d) => ctx.select({ type: 'module', id: d.data.module!.name }));
  }

  ctx.onSelect((sel, recenter) => {
    if (recenter && sel?.type === 'module') {
      const m = ctx.index.moduleByName.get(sel.id);
      if (m) focusPath = m.path.split('/').slice(0, -1).slice(0, 2).join('/');
    }
    if (box.clientWidth) draw();
  });
  let lastW = 0;
  new ResizeObserver(() => {
    if (box.clientWidth && box.clientWidth !== lastW) {
      lastW = box.clientWidth;
      draw();
    }
  }).observe(box);
  return { refresh: draw };
}
