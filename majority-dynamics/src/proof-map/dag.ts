import * as d3 from 'd3';
import type { Ctx } from './context';
import { buildGraph, dependencies, dependents, layeredLayout, searchNodes, type MapNode, type ProofGraph } from './graph';
import { PHASES, PHASE_COLOR } from './phases';
import { escapeHtml as esc, stripTex } from './tex';

const DX = 46;
const DY = 62;
const MARGIN = 40;

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  layer: number;
  lx: number;
}

export function mountDag(ctx: Ctx, root: HTMLElement): { refresh(): void } {
  root.innerHTML = `
    <div class="pm-toolbar">
      <div class="pm-search">
        <input type="search" placeholder="Search: 5.4, lead, Liebenau, Paper.main…" aria-label="Search statements" />
        <ul class="pm-results" hidden></ul>
      </div>
      <div class="pm-seg" role="group" aria-label="Layout">
        <button data-layout="layered" class="on">Layered</button><button data-layout="force">Force</button>
      </div>
      <label class="pm-check"><input type="checkbox" data-opt="stmt" checked /> statement-level references</label>
      <button class="pm-btn" data-act="fit">Fit</button>
      <button class="pm-btn" data-act="clear">Clear focus</button>
    </div>
    <div class="pm-legend"></div>
    <div class="pm-canvas"><svg></svg><div class="pm-tip" hidden></div>
      <div class="pm-hint">Scroll to zoom · drag to pan · click a node to see what it uses (below, <span class="pm-k pm-k-dep"></span>) and what uses it (above, <span class="pm-k pm-k-anc"></span>)</div>
    </div>`;
  const svg = d3.select(root.querySelector('svg')!);
  const tip = root.querySelector<HTMLElement>('.pm-tip')!;
  const canvas = root.querySelector<HTMLElement>('.pm-canvas')!;
  const zoomLayer = svg.append('g');
  const edgeLayer = zoomLayer.append('g').attr('class', 'pm-edges');
  const nodeLayer = zoomLayer.append('g').attr('class', 'pm-nodes');
  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', (e) => zoomLayer.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);

  let mode: 'layered' | 'force' = 'layered';
  let statementEdges = true;
  let graph: ProofGraph = ctx.graph;
  let pos = new Map<string, { x: number; y: number }>();
  let routes: { key: string; source: string; target: string; via: string; pts: [number, number][] }[] = [];
  let sim: d3.Simulation<SimNode, undefined> | null = null;
  let hoverPhase: string | null = null;

  const legend = root.querySelector<HTMLElement>('.pm-legend')!;
  const counts = d3.rollup(ctx.graph.nodes, (v) => v.length, (n) => n.phase);
  legend.innerHTML = PHASES.map(
    (p) => `<span class="pm-leg" data-phase="${p.id}" title="${esc(p.detail)}"><i style="background:${p.color}"></i>${esc(p.label)} <b>${counts.get(p.id) ?? 0}</b></span>`,
  ).join('');
  legend.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-phase]');
    hoverPhase = t?.dataset.phase ?? null;
    applyFocus();
  });
  legend.addEventListener('mouseleave', () => {
    hoverPhase = null;
    applyFocus();
  });

  const line = d3.line().curve(d3.curveBasis);

  function computeLayered() {
    const L = layeredLayout(graph, 1);
    pos = new Map([...L.nodes.values()].map((n) => [n.id, { x: MARGIN + n.x * DX, y: MARGIN + n.layer * DY }]));
    routes = L.routes.map((r, i) => ({
      key: `${r.edge.source}>${r.edge.target}#${i}`,
      source: r.edge.source,
      target: r.edge.target,
      via: r.edge.via,
      pts: r.path.map((id) => [pos.get(id)!.x, pos.get(id)!.y] as [number, number]),
    }));
  }

  function computeForce() {
    const L = layeredLayout(graph, 1);
    const nodes: SimNode[] = graph.nodes.map((n) => {
      const ln = L.nodes.get(n.id)!;
      const p = pos.get(n.id);
      return { id: n.id, layer: ln.layer, lx: MARGIN + ln.x * DX, x: p?.x ?? MARGIN + ln.x * DX, y: p?.y ?? MARGIN + ln.layer * DY };
    });
    const links = graph.edges.map((e) => ({ source: e.source, target: e.target }));
    sim?.stop();
    sim = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(50).strength(0.25))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('collide', d3.forceCollide(16))
      .force('y', d3.forceY<SimNode>((d) => MARGIN + d.layer * DY * 0.8).strength(0.12))
      .force('x', d3.forceX<SimNode>((d) => d.lx).strength(0.03))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    pos = new Map(nodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
    routes = graph.edges.map((e, i) => ({
      key: `${e.source}>${e.target}#${i}`,
      source: e.source,
      target: e.target,
      via: e.via,
      pts: [
        [pos.get(e.source)!.x, pos.get(e.source)!.y],
        [pos.get(e.target)!.x, pos.get(e.target)!.y],
      ],
    }));
  }

  function draw(animate: boolean) {
    const ms = animate ? 600 : 0;
    edgeLayer
      .selectAll<SVGPathElement, (typeof routes)[number]>('path')
      .data(routes, (d) => d.source + '>' + d.target)
      .join(
        (enter) => enter.append('path').attr('d', (d) => line(d.pts)),
        (update) => update,
        (exit) => exit.remove(),
      )
      .attr('class', (d) => `pm-edge pm-via-${d.via}`)
      .transition()
      .duration(ms)
      .attr('d', (d) => line(d.pts));

    const sel = nodeLayer
      .selectAll<SVGGElement, MapNode>('g.pm-node')
      .data(graph.nodes, (d) => d.id)
      .join((enter) => {
        const g = enter
          .append('g')
          .attr('class', (d) => `pm-node pm-${d.kind}`)
          .attr('transform', (d) => `translate(${pos.get(d.id)!.x},${pos.get(d.id)!.y})`);
        g.each(function (d) {
          const el = d3.select(this);
          if (d.kind === 'literature') {
            const w = d.label.length * 6.4 + 12;
            el.append('rect').attr('x', -w / 2).attr('y', -9).attr('width', w).attr('height', 18).attr('rx', 4).attr('fill', PHASE_COLOR.literature);
            el.append('text').attr('class', 'pm-in').attr('dy', '0.35em').text(d.label);
          } else {
            el.append('circle').attr('r', d.phase === 'main' ? 12 : 8.5).attr('fill', PHASE_COLOR[d.phase]);
            el.append('text').attr('class', 'pm-lab').attr('x', d.phase === 'main' ? 15 : 11).attr('dy', '0.35em').text(d.label);
          }
        });
        return g;
      });
    sel.transition().duration(ms).attr('transform', (d) => `translate(${pos.get(d.id)!.x},${pos.get(d.id)!.y})`);
    sel
      .on('mouseenter', (ev: MouseEvent, d) => {
        const s = d.statement;
        tip.innerHTML = s
          ? `<b>${esc(s.kind)} ${esc(s.number)}</b> ${esc(stripTex(s.title !== `${s.kind} ${s.number}` ? s.title : ''))}<br><span>${esc(stripTex(s.moral).slice(0, 180))}${s.moral.length > 180 ? '…' : ''}</span>`
          : `<b>[${esc(d.label)}]</b> ${esc(d.literature?.text ?? '')}`;
        tip.hidden = false;
        moveTip(ev);
      })
      .on('mousemove', moveTip)
      .on('mouseleave', () => (tip.hidden = true))
      .on('click', (ev: MouseEvent, d) => {
        ev.stopPropagation();
        ctx.select({ type: 'node', id: d.id });
      });
    applyFocus();
  }

  function moveTip(ev: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left + 14;
    tip.style.left = Math.min(x, r.width - 300) + 'px';
    tip.style.top = ev.clientY - r.top + 14 + 'px';
  }

  function applyFocus() {
    const sel = ctx.selection?.type === 'node' ? ctx.selection.id : null;
    const modSel = ctx.selection?.type === 'module' ? ctx.selection.id : null;
    let deps = new Set<string>();
    let anc = new Set<string>();
    let lit = new Set<string>();
    if (sel && graph.byId.has(sel)) {
      deps = dependencies(graph, sel);
      anc = dependents(graph, sel);
    } else if (modSel) {
      lit = new Set(ctx.index.statementsOf.get(modSel) ?? []);
    }
    const focus = !!sel || lit.size > 0 || !!hoverPhase;
    nodeLayer
      .selectAll<SVGGElement, MapNode>('g.pm-node')
      .classed('is-sel', (d) => d.id === sel || lit.has(d.id))
      .classed('is-dep', (d) => deps.has(d.id))
      .classed('is-anc', (d) => anc.has(d.id))
      .classed('is-dim', (d) =>
        hoverPhase ? d.phase !== hoverPhase : focus && d.id !== sel && !deps.has(d.id) && !anc.has(d.id) && !lit.has(d.id),
      );
    const isDep = (d: (typeof routes)[number]) => (d.source === sel || deps.has(d.source)) && deps.has(d.target);
    const isAnc = (d: (typeof routes)[number]) => (d.target === sel || anc.has(d.target)) && anc.has(d.source);
    edgeLayer
      .selectAll<SVGPathElement, (typeof routes)[number]>('path')
      .classed('is-dep', isDep)
      .classed('is-anc', isAnc)
      .classed('is-dim', (d) => !!hoverPhase || (focus && !isDep(d) && !isAnc(d)));
  }

  function fit(animate = true) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const xs = [...pos.values()].map((p) => p.x);
    const ys = [...pos.values()].map((p) => p.y);
    const [x0, x1] = [Math.min(...xs) - MARGIN, Math.max(...xs) + MARGIN];
    const [y0, y1] = [Math.min(...ys) - MARGIN, Math.max(...ys) + MARGIN];
    const k = Math.min(w / (x1 - x0), h / (y1 - y0), 1.4);
    const tr = d3.zoomIdentity.translate((w - k * (x1 + x0)) / 2, (h - k * (y1 + y0)) / 2).scale(k);
    (animate ? svg.transition().duration(500) : svg).call(zoom.transform, tr);
  }

  function centerOn(id: string) {
    const p = pos.get(id);
    if (!p) return;
    const k = Math.max(d3.zoomTransform(svg.node()!).k, 0.9);
    const tr = d3.zoomIdentity.translate(canvas.clientWidth / 2 - k * p.x, canvas.clientHeight / 2 - k * p.y).scale(k);
    svg.transition().duration(500).call(zoom.transform, tr);
  }

  function relayout(animate: boolean) {
    if (mode === 'layered') computeLayered();
    else computeForce();
    draw(animate);
  }

  root.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.layout as typeof mode;
      root.querySelectorAll('[data-layout]').forEach((x) => x.classList.toggle('on', x === b));
      relayout(true);
      setTimeout(() => fit(), 620);
    }),
  );
  root.querySelector<HTMLInputElement>('[data-opt="stmt"]')!.addEventListener('change', (e) => {
    statementEdges = (e.target as HTMLInputElement).checked;
    graph = buildGraph(ctx.file.atlas, { statementEdges });
    relayout(true);
  });
  root.querySelector('[data-act="fit"]')!.addEventListener('click', () => fit());
  root.querySelector('[data-act="clear"]')!.addEventListener('click', () => ctx.select(null));
  svg.on('click', () => ctx.select(null));

  const input = root.querySelector<HTMLInputElement>('.pm-search input')!;
  const results = root.querySelector<HTMLUListElement>('.pm-results')!;
  let hits: MapNode[] = [];
  let active = 0;
  const renderHits = () => {
    results.hidden = hits.length === 0;
    results.innerHTML = hits
      .slice(0, 12)
      .map(
        (n, i) => `<li data-id="${esc(n.id)}" class="${i === active ? 'on' : ''}"><i style="background:${PHASE_COLOR[n.phase]}"></i><b>${esc(
          n.statement ? `${n.statement.kind} ${n.label}` : `[${n.label}]`,
        )}</b> ${esc(stripTex(n.title))}</li>`,
      )
      .join('');
  };
  const choose = (id: string) => {
    ctx.select({ type: 'node', id }, { recenter: true });
    results.hidden = true;
    input.blur();
  };
  input.addEventListener('input', () => {
    hits = searchNodes(graph, input.value);
    active = 0;
    renderHits();
    const ids = new Set(hits.map((h) => h.id));
    nodeLayer.selectAll<SVGGElement, MapNode>('g.pm-node').classed('is-hit', (d) => ids.has(d.id));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') active = Math.min(active + 1, Math.min(hits.length, 12) - 1);
    else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
    else if (e.key === 'Enter' && hits[active]) return choose(hits[active].id);
    else if (e.key === 'Escape') results.hidden = true;
    else return;
    e.preventDefault();
    renderHits();
  });
  results.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li');
    if (li?.dataset.id) choose(li.dataset.id);
  });
  input.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 150));

  ctx.onSelect((sel, recenter) => {
    applyFocus();
    if (recenter && sel?.type === 'node') centerOn(sel.id);
  });

  relayout(false);
  let fitted = false;
  return {
    refresh() {
      if (!fitted && canvas.clientWidth > 0) {
        fitted = true;
        fit(false);
        const sel = ctx.selection;
        if (sel?.type === 'node') centerOn(sel.id);
      }
    },
  };
}
