import katex from 'katex';
import 'katex/dist/katex.min.css';
import { mountLayout } from './shared/layout';
import type { HudState } from './home/background';
import { EPISODE_N, EPISODE_PN } from './home/episode';

const tex = (s: string, displayMode = false) => katex.renderToString(s, { displayMode, throwOnError: false });

const SOURCES = [
  { href: 'https://gopalkgoel.github.io/majority-dynamics/', label: 'Essay', note: 'How a small majority takes over a sparse network' },
  { href: 'https://gopalkgoel.github.io/majority-dynamics/atlas/new.pdf', label: 'Paper (PDF)', note: 'Current version, 86 pages' },
  { href: 'https://arxiv.org/abs/2609.14957', label: 'arXiv:2609.14957', note: 'Majority dynamics on sparse random graphs' },
  { href: 'https://gopalkgoel.github.io/majority-dynamics/atlas/', label: 'Proof atlas', note: 'Statement by statement, with morals and audit notes' },
  { href: 'https://github.com/gopalkgoel/sparse-majority-dynamics-lean', label: 'Lean formalization', note: 'Complete, no sorry, standard axioms only' },
];

const CARDS = [
  {
    href: './lab/index.html',
    title: 'Large-N lab',
    body: `Simulate majority dynamics on ${tex('\\mathbb G(N,p)')} at scale and compare the lead's growth with the
      ${tex('\\sqrt{2/\\pi}\\,\\sqrt{pN}')} amplification heuristic and the predicted day count. You can also try the open
      regime ${tex('pN\\sim\\log N')}, which the theorem doesn't cover.`,
  },
  {
    href: './histories/index.html',
    title: 'Opinion histories',
    body: `Watch the ${tex('2^k')} opinion-history classes and their block-pair degree counts evolve, and see why
      conditioning on yesterday's votes is what makes the proof hard.`,
  },
  {
    href: './proof-map/index.html',
    title: 'Proof map',
    body: `The proof's dependency graph from the main theorem down to the literature, the ${tex('121\\text{k}')}-line Lean
      development cross-linked to each statement, and what changed since the August 2025 manuscript.`,
  },
];

const main = mountLayout(0);
main.classList.add('home');
main.innerHTML = `
  <header class="home-hero">
    <p class="home-kicker">An interactive companion to</p>
    <h1>Majority dynamics on sparse random graphs</h1>
    <p class="home-authors">by <strong>Gopal Goel</strong> and <strong>Ashwin Sah</strong></p>
    <ul class="home-sources">${SOURCES.map(
      (s) => `<li><a href="${s.href}" target="_blank" rel="noopener"><b>${s.label}</b><span>${s.note}</span></a></li>`,
    ).join('')}</ul>
    <figure class="home-live" hidden>
      <div class="home-live-top">
        <span class="home-live-day">Start</span>
        <button type="button" class="home-live-toggle">Pause</button>
      </div>
      <div class="home-live-bar" aria-hidden="true"><span></span></div>
      <p class="home-live-caption" aria-live="polite"></p>
      <figcaption>The background is a live run: ${EPISODE_N.toLocaleString()} people, about ${EPISODE_PN} friends each,
      and the same friendships every day.</figcaption>
    </figure>
  </header>

  <section class="home-prose">
    <p>Give each of ${tex('N')} people an opinion ${tex('\\pm1')} by a fair coin, and connect each pair independently with
    probability ${tex('p')}. Every day, everyone simultaneously adopts the majority opinion among their neighbours, keeping
    their own on a tie. The initial majority starts ahead by only about ${tex('\\sqrt N')} people, a tiny sliver of the
    population. Goel and Sah prove that on ${tex('G\\sim\\mathbb G(N,p)')} with ${tex('pN\\ge N^{\\varepsilon}')} that tiny
    lead still takes over. Writing ${tex('p\\approx N^{-\\theta}')}, with high probability every vertex holds the
    initial majority opinion on day</p>
    ${tex('k = 2\\Bigl\\lfloor \\frac{1}{1-\\theta} \\Bigr\\rfloor + 3,', true)}
    <p>uniformly over the whole range up to ${tex('p=1')}. That settles the question for every fixed polynomial density.
    It builds on a line of work that began with the 2014 conjecture of Benjamini, Chan, O’Donnell, Tamuz, and Tan. The
    regime where ${tex('pN')} grows more slowly than every power of ${tex('N')}, such as ${tex('pN=\\log N')}, is still open.</p>
    <p>If you drew a new graph every day, the math would be easy. Each vertex would compare two nearly
    independent binomial counts, so one update would multiply the lead by roughly ${tex('\\sqrt{2pN/\\pi}')}, and about
    ${tex('1/(1-\\theta)')} updates turn ${tex('\\sqrt N')} into order ${tex('N')}. The catch is that the graph
    <em>stays the same</em>. Every vote leaks information about the edges that tomorrow's votes depend on.</p>
    <p>The proof's trick is to keep track of exactly the information that matters. After ${tex('k')} days it records the partition of vertices
    into ${tex('2^k')} opinion-history classes and every vertex's degree into every class. Given that record, the
    graph is uniformly random among graphs with those block-pair degrees. Asymptotic enumeration of graphs by degree sequence (McKay–Wormald,
    Canfield–Greenhill–McKay, Liebenau–Wormald) transfers the problem to a tilted binomial row model, whose Gaussian
    limit is an idealized recursion that amplifies the lead day by day. Once the lead is a real fraction of everyone, jumbledness and
    a contraction estimate drive the minority to zero.</p>
    <p>The paper comes with a complete Lean 4 formalization of about 121,000 lines. It covers the enumeration
    inputs too, with no <code>sorry</code> and no axioms beyond Lean's standard ones. There's also a proof atlas that maps every
    statement to the current paper, the August 2025 manuscript, and the Lean declarations. The pages below are an
    independent companion built from those sources. All of the math is the authors' work.</p>
  </section>

  <section class="home-cards">${CARDS.map(
    (c) => `<a class="home-card" href="${c.href}"><h2>${c.title} <span aria-hidden="true">→</span></h2><p>${c.body}</p></a>`,
  ).join('')}</section>
`;

const colorName = (o: 1 | -1) => (o > 0 ? '<b class="c-red">Red</b>' : '<b class="c-blue">Blue</b>');

function caption(s: HudState): string {
  const maj = s.majority > 0 ? s.plus : s.n - s.plus;
  const pct = ((100 * maj) / s.n).toFixed(1);
  const who = colorName(s.majority);
  switch (s.phase) {
    case 'start':
      return `Everyone starts with a coin flip. ${who} is ahead by just ${2 * maj - s.n} out of ${s.n.toLocaleString()} people.`;
    case 'running':
      return `Each person switched to the majority view of their friends. ${who} now holds ${pct}%.`;
    case 'done':
      if ((s.plus === s.n) !== s.majority > 0) return `The minority won this time. That's rare, and the theorem says it becomes vanishingly rare as N grows.`;
      return `Everyone agrees with the original majority. The friendships never changed, and that is what makes the proof hard.`;
    case 'stuck':
      return `This run stalled at ${pct}% before full agreement. At this small size that happens now and then.`;
  }
}

const canvas = document.createElement('canvas');
canvas.className = 'home-bg';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const live = main.querySelector<HTMLElement>('.home-live')!;
const dayEl = live.querySelector<HTMLElement>('.home-live-day')!;
const bar = live.querySelector<HTMLElement>('.home-live-bar span')!;
const capEl = live.querySelector<HTMLElement>('.home-live-caption')!;
const toggle = live.querySelector<HTMLButtonElement>('.home-live-toggle')!;
let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

void import('./home/background').then(({ startBackground }) => {
  const bg = startBackground(
  canvas,
  (s) => {
    dayEl.textContent = s.day === 0 ? 'Start' : `Day ${s.day}`;
    bar.style.width = `${(100 * s.plus) / s.n}%`;
    capEl.innerHTML = caption(s);
  },
  { playing },
);

if (bg) {
  live.hidden = false;
  const label = () => (toggle.textContent = playing ? 'Pause' : 'Play');
  label();
  toggle.addEventListener('click', () => {
    playing = !playing;
    bg.setPlaying(playing);
    label();
  });
  const fade = () => {
    const t = Math.min(1, window.scrollY / (window.innerHeight * 0.8));
    const base = window.innerWidth < 700 ? 0.55 : 1;
    canvas.style.opacity = String(base * (1 - 0.65 * t));
  };
  window.addEventListener('scroll', fade, { passive: true });
  fade();
} else {
  canvas.remove();
}
});
