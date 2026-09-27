import katex from 'katex';
import 'katex/dist/katex.min.css';
import { mountLayout } from './shared/layout';

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
