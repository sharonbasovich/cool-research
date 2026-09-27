import type { LeanLink, LeanModule, PdfLocation, Statement } from '../../scripts/proof-map/types';
import type { Ctx } from './context';
import { dependencies, dependents, type MapNode } from './graph';
import { PHASE_COLOR, PHASE_LABEL } from './phases';
import { escapeHtml as esc, renderTex } from './tex';

const CALLOUT_LABEL: Record<string, string> = {
  error: 'Error in old paper',
  gap: 'Gap in old paper',
  misapplied: 'Misapplied in old paper',
  strengthened: 'Strengthened',
  split: 'Split / merged',
  new: 'New',
  dropped: 'Old material dropped',
  notation: 'Notation',
};

const shortRev = (rev: string) => rev.slice(0, 7);

function nodeChip(ctx: Ctx, id: string): string {
  const n = ctx.graph.byId.get(id);
  if (!n) return '';
  const title = n.kind === 'literature' ? n.title : `${n.statement?.kind ?? ''} ${n.label}`;
  const tip = n.kind === 'literature' ? n.literature?.text ?? '' : n.title;
  return `<button class="pm-chip" data-node="${esc(id)}" title="${esc(tip)}"><i style="background:${PHASE_COLOR[n.phase]}"></i>${esc(title)}</button>`;
}

function moduleChip(m: LeanModule): string {
  return `<button class="pm-chip pm-chip-mod" data-module="${esc(m.name)}" title="${m.lines} lines">${esc(m.name.replace(/^MajorityDynamics\./, ''))}</button>`;
}

function pdfLinks(locs: PdfLocation[]): string {
  return locs
    .map((p) => `<a class="pm-src" href="${esc(p.url)}" target="_blank" rel="noopener">${renderTex(p.text)}${p.page ? ` <span>p.&nbsp;${p.page}</span>` : ''}</a>`)
    .join('');
}

function leanList(links: LeanLink[]): string {
  return links
    .map(
      (l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener"><code>${esc(l.name)}</code></a>${
        l.note ? `<span class="pm-note">${esc(l.note)}</span>` : ''
      }${l.signature ? `<pre>${esc(l.signature)}</pre>` : ''}<span class="pm-path">${esc(l.path)}${l.line ? ':' + l.line : ''}</span></li>`,
    )
    .join('');
}

function list(title: string, body: string, count?: number): string {
  if (!body) return '';
  return `<section><h4>${title}${count !== undefined ? ` <span class="pm-count">${count}</span>` : ''}</h4>${body}</section>`;
}

function statementPanel(ctx: Ctx, n: MapNode, s: Statement): string {
  const g = ctx.graph;
  const uses = g.out.get(n.id) ?? [];
  const usedBy = g.in.get(n.id) ?? [];
  const deps = dependencies(g, n.id);
  const above = dependents(g, n.id);
  const mods = (ctx.index.modulesOf.get(s.label) ?? []).map((m) => ctx.index.moduleByName.get(m)!).filter(Boolean);
  const preAi = s.preAi.length
    ? pdfLinks(s.preAi)
    : `<p class="pm-muted">${s.preAiNone ? 'No direct counterpart in the August 2025 manuscript.' : 'No pre-AI location recorded.'}</p>`;
  const callouts = s.callouts
    .map(
      (c) => `<div class="pm-callout pm-callout-${esc(c.type)}"><b>${esc(CALLOUT_LABEL[c.type] ?? c.title)}</b> ${renderTex(c.text)}</div>`,
    )
    .join('');
  return `
    <header>
      <div class="pm-kicker"><i style="background:${PHASE_COLOR[s.phase]}"></i>${esc(PHASE_LABEL[s.phase])} · §${esc(s.section)} ${esc(s.sectionTitle)}</div>
      <h3>${esc(s.kind)} ${esc(s.number)}</h3>
      ${s.title && s.title !== `${s.kind} ${s.number}` ? `<p class="pm-title">${renderTex(s.title)}</p>` : ''}
      <p class="pm-links"><a href="${esc(s.atlasUrl)}" target="_blank" rel="noopener">Open in atlas ↗</a></p>
    </header>
    ${s.moral ? `<section class="pm-moral"><h4>Moral</h4><p>${renderTex(s.moral)}</p></section>` : ''}
    <details class="pm-statement"><summary>Statement</summary><div>${renderTex(s.statement)}</div></details>
    ${list('Current paper', pdfLinks(s.paper))}
    ${list('August 2025 manuscript', preAi)}
    ${callouts ? list('What changed', callouts) : ''}
    ${list('Lean declarations', s.lean.length ? `<ul class="pm-lean">${leanList(s.lean)}</ul>` : '<p class="pm-muted">No declaration linked in the atlas.</p>')}
    ${s.proofLean.length ? list('Lean for the proof section', `<ul class="pm-lean">${leanList(s.proofLean)}</ul>`) : ''}
    ${list('Lean modules', mods.map(moduleChip).join(''), mods.length)}
    ${list(`Uses directly <span class="pm-muted">(${deps.size} transitively)</span>`, uses.map((u) => nodeChip(ctx, u)).join(''), uses.length)}
    ${list(`Used directly by <span class="pm-muted">(${above.size} transitively)</span>`, usedBy.map((u) => nodeChip(ctx, u)).join(''), usedBy.length)}
  `;
}

function literaturePanel(ctx: Ctx, n: MapNode): string {
  const lit = n.literature!;
  const citedBy = ctx.graph.in.get(n.id) ?? [];
  return `
    <header>
      <div class="pm-kicker"><i style="background:${PHASE_COLOR.literature}"></i>Literature · [${esc(lit.key)}]</div>
      <h3>${esc(lit.short)}</h3>
    </header>
    <section><p>${renderTex(lit.text)}</p>${lit.url ? `<p><a href="${esc(lit.url)}" target="_blank" rel="noopener">Source ↗</a></p>` : ''}</section>
    ${list('Cited by', citedBy.map((u) => nodeChip(ctx, u)).join(''), citedBy.length)}
    ${list('Transitively supports', [...dependents(ctx.graph, n.id)].filter((id) => ctx.graph.byId.get(id)?.phase === 'main').map((u) => nodeChip(ctx, u)).join(''))}
  `;
}

function modulePanel(ctx: Ctx, m: LeanModule): string {
  const stmts = ctx.index.statementsOf.get(m.name) ?? [];
  const imports = m.imports.map((i) => ctx.index.moduleByName.get(i)).filter((x): x is LeanModule => !!x);
  const importedBy = (ctx.index.importedBy.get(m.name) ?? []).map((i) => ctx.index.moduleByName.get(i)!);
  const decls = Object.entries(m.decls)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}${v === 1 ? '' : k.endsWith('s') ? 'es' : 's'}`)
    .join(' · ');
  return `
    <header>
      <div class="pm-kicker">Lean module · ${esc(m.dir)}</div>
      <h3 class="pm-modname">${esc(m.name)}</h3>
      <p class="pm-links"><a href="${esc(m.url)}" target="_blank" rel="noopener">View source @ ${shortRev(ctx.file.meta.leanRev)} ↗</a></p>
    </header>
    <section><p><b>${m.lines.toLocaleString()}</b> lines${decls ? ` · ${esc(decls)}` : ''}</p>
    ${m.externalImports.length ? `<p class="pm-muted">External: ${m.externalImports.map(esc).join(', ')}</p>` : ''}</section>
    ${list('Paper statements', stmts.map((l) => nodeChip(ctx, l)).join(''), stmts.length)}
    ${list('Imports', imports.map(moduleChip).join(''), imports.length)}
    ${list('Imported by', importedBy.map(moduleChip).join(''), importedBy.length)}
  `;
}

export function mountPanel(ctx: Ctx, el: HTMLElement): void {
  const empty = () => {
    const main = ctx.graph.nodes.filter((n) => n.phase === 'main');
    el.innerHTML = `
      <header><div class="pm-kicker">Nothing selected</div><h3>Pick a statement</h3></header>
      <section><p>Click a node in the map, a module in the treemap, or a row in the comparison. Search accepts statement numbers
      (<code>5.4</code>), atlas labels, titles, words from the moral, and Lean declaration names.</p></section>
      ${list('Start at the top', main.map((n) => nodeChip(ctx, n.id)).join(''))}`;
  };
  const render = () => {
    const sel = ctx.selection;
    if (!sel) return empty();
    if (sel.type === 'module') {
      const m = ctx.index.moduleByName.get(sel.id);
      el.innerHTML = m ? modulePanel(ctx, m) : '';
    } else {
      const n = ctx.graph.byId.get(sel.id);
      if (!n) return empty();
      el.innerHTML = n.statement ? statementPanel(ctx, n, n.statement) : literaturePanel(ctx, n);
    }
    el.scrollTop = 0;
  };
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-node],[data-module]');
    if (!t) return;
    if (t.dataset.node) ctx.select({ type: 'node', id: t.dataset.node }, { view: 'map', recenter: true });
    else if (t.dataset.module) ctx.select({ type: 'module', id: t.dataset.module }, { view: 'lean', recenter: true });
  });
  ctx.onSelect(render);
  render();
}
