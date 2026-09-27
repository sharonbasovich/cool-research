import 'katex/dist/katex.min.css';
import './style.css';
import type { AtlasFile, LeanData } from '../../scripts/proof-map/types';
import { mountLayout } from '../shared/layout';
import type { Ctx, Selection, ViewId } from './context';
import { mountDag } from './dag';
import { buildCrossIndex } from './data';
import { buildGraph } from './graph';
import { mountPanel } from './panel';
import { mountPreAi } from './preai';
import { escapeHtml as esc, renderTex, setMacros } from './tex';
import { mountTreemap } from './treemap';

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'map', label: 'Dependency map' },
  { id: 'lean', label: 'Lean development' },
  { id: 'preai', label: 'August 2025 → now' },
];

const main = mountLayout(1);
main.classList.add('pm-page');
main.innerHTML = '<p class="pm-loading">Loading the proof atlas…</p>';

async function load<T>(file: string): Promise<T> {
  const res = await fetch(new URL(`../data/proof-map/${file}`, document.baseURI));
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function parseHash(): { view: ViewId; sel: Selection } {
  const [v, ...rest] = decodeURIComponent(location.hash.slice(1)).split('/');
  const id = rest.join('/');
  const view = (VIEWS.some((x) => x.id === v) ? v : 'map') as ViewId;
  if (!id) return { view, sel: null };
  return { view, sel: view === 'lean' ? { type: 'module', id } : { type: 'node', id } };
}

async function start() {
  const [file, lean] = await Promise.all([load<AtlasFile>('atlas.json'), load<LeanData>('lean.json')]);
  setMacros(file.atlas.macros);
  const { meta, atlas } = file;
  const graph = buildGraph(atlas);
  const listeners: ((s: Selection, recenter: boolean) => void)[] = [];
  let view: ViewId = 'map';
  const views = new Map<ViewId, { el: HTMLElement; refresh(): void }>();

  const ctx: Ctx = {
    file,
    lean,
    graph,
    index: buildCrossIndex(atlas, lean),
    selection: null,
    select(sel, opts = {}) {
      ctx.selection = sel;
      if (opts.view && opts.view !== view) showView(opts.view);
      history.replaceState(null, '', `#${view}${sel ? '/' + encodeURIComponent(sel.id) : ''}`);
      for (const fn of listeners) fn(sel, !!opts.recenter);
    },
    onSelect(fn) {
      listeners.push(fn);
    },
  };

  const leanLinks = new Set(atlas.statements.flatMap((s) => [...s.lean, ...s.proofLean].map((l) => l.url))).size;
  main.innerHTML = `
    <header class="pm-hero">
      <h1>Proof map</h1>
      <p class="pm-lede">The dependency structure of Goel &amp; Sah’s proof that majority dynamics on
      ${renderTex('\\(\\mathbb G(N,p)\\)')} with ${renderTex('\\(pN\\ge N^{\\varepsilon}\\)')} reaches unanimity, read off the
      <a href="${esc(meta.atlasUrl)}" target="_blank" rel="noopener">proof atlas</a> and the
      <a href="${esc(meta.leanRepo)}" target="_blank" rel="noopener">Lean formalization</a>. An arrow from A down to B means
      the statement or proof of A cites B.</p>
      <dl class="pm-numbers">
        <div><dt>statements</dt><dd>${atlas.statements.length}</dd></div>
        <div><dt>dependencies</dt><dd>${atlas.edges.length}</dd></div>
        <div><dt>cited works</dt><dd>${graph.nodes.filter((n) => n.kind === 'literature').length}</dd></div>
        <div><dt>Lean links</dt><dd>${leanLinks}</dd></div>
        <div><dt>Lean modules</dt><dd>${lean.modules.length}</dd></div>
        <div><dt>Lean lines</dt><dd>${lean.totalLines.toLocaleString()}</dd></div>
      </dl>
    </header>
    <div class="pm-tabs" role="tablist">${VIEWS.map((v) => `<button role="tab" data-view="${v.id}">${esc(v.label)}</button>`).join('')}</div>
    <div class="pm-body">
      <div class="pm-views">${VIEWS.map((v) => `<section class="pm-view" data-view="${v.id}" hidden></section>`).join('')}</div>
      <aside class="pm-panel" aria-live="polite"></aside>
    </div>
    <footer class="pm-foot">
      Data extracted by <code>scripts/proof-map/extract.ts</code> from the atlas (sha256 <code>${esc(meta.atlasSha256.slice(0, 12))}</code>)
      and <a href="${esc(meta.leanRepo)}/tree/${esc(meta.leanRev)}" target="_blank" rel="noopener">Lean @ <code>${esc(meta.leanRev.slice(0, 7))}</code></a>
      on ${esc(meta.generatedAt.slice(0, 10))}. Dependency edges are inferred from the numbered cross-references in each statement and its proof;
      the atlas is the authority. All mathematics is due to Gopal Goel and Ashwin Sah.
    </footer>`;

  const viewEls = new Map([...main.querySelectorAll<HTMLElement>('.pm-view')].map((el) => [el.dataset.view as ViewId, el]));
  const mounts: Record<ViewId, (c: Ctx, el: HTMLElement) => { refresh(): void }> = { map: mountDag, lean: mountTreemap, preai: mountPreAi };

  function showView(v: ViewId) {
    view = v;
    main.querySelectorAll<HTMLButtonElement>('.pm-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    for (const [id, el] of viewEls) el.hidden = id !== v;
    if (!views.has(v)) views.set(v, { el: viewEls.get(v)!, ...mounts[v](ctx, viewEls.get(v)!) });
    views.get(v)!.refresh();
    const sel = ctx.selection;
    history.replaceState(null, '', `#${v}${sel ? '/' + encodeURIComponent(sel.id) : ''}`);
  }
  main.querySelector('.pm-tabs')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-view]');
    if (b) showView(b.dataset.view as ViewId);
  });

  mountPanel(ctx, main.querySelector('.pm-panel')!);
  const initial = parseHash();
  const valid =
    initial.sel &&
    (initial.sel.type === 'module' ? ctx.index.moduleByName.has(initial.sel.id) : graph.byId.has(initial.sel.id));
  ctx.selection = valid ? initial.sel : null;
  showView(initial.view);
  ctx.select(ctx.selection);
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (h.view !== view) showView(h.view);
    const ok = h.sel && (h.sel.type === 'module' ? ctx.index.moduleByName.has(h.sel.id) : graph.byId.has(h.sel.id));
    if (ok && h.sel?.id !== ctx.selection?.id) ctx.select(h.sel, { recenter: true });
  });
}

start().catch((err: unknown) => {
  main.innerHTML = `<p class="pm-error">Could not load the proof-map data: ${esc(String(err))}</p>`;
});
