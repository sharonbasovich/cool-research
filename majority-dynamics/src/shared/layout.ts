import './style.css';

export const ROUTES = [
  { href: 'index.html', label: 'Home' },
  { href: 'lab/index.html', label: 'Large-N lab' },
  { href: 'histories/index.html', label: 'Opinion histories' },
  { href: 'proof-map/index.html', label: 'Proof map' },
] as const;

export function activeRoute(pathname: string): (typeof ROUTES)[number]['href'] {
  const m = /\/(lab|histories|proof-map)\/(?:index\.html)?$/.exec(pathname);
  return m ? (`${m[1]}/index.html` as (typeof ROUTES)[number]['href']) : 'index.html';
}

export function mountLayout(depth: 0 | 1): HTMLElement {
  const prefix = depth === 0 ? './' : '../';
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  const current = activeRoute(location.pathname);

  const header = document.createElement('header');
  header.className = 'site';
  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = prefix + 'index.html';
  brand.innerHTML = 'Majority dynamics <span>· a companion</span>';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Site');
  for (const r of ROUTES) {
    const a = document.createElement('a');
    a.href = prefix + r.href;
    a.textContent = r.label;
    if (r.href === current) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  header.append(brand, nav);

  const main = document.createElement('main');
  main.className = 'page';

  const footer = document.createElement('footer');
  footer.className = 'site';
  footer.innerHTML = `
    <p>An independent companion to Gopal Goel and Ashwin Sah,
    <em>Majority dynamics on sparse random graphs</em>
    (<a href="https://arxiv.org/abs/2609.14957">arXiv:2609.14957</a>).
    Mathematics and proofs are theirs; simulations here are empirical illustrations, not proofs.</p>
    <p><a href="https://gopalkgoel.github.io/majority-dynamics/">Essay</a> ·
    <a href="https://gopalkgoel.github.io/majority-dynamics/atlas/">Proof atlas</a> ·
    <a href="https://gopalkgoel.github.io/majority-dynamics/atlas/new.pdf">Paper</a> ·
    <a href="https://github.com/gopalkgoel/sparse-majority-dynamics-lean">Lean formalization</a> ·
    <a href="https://github.com/sharonbasovich/cool-research/tree/main/majority-dynamics">Source of this site</a></p>`;

  app.replaceChildren(header, main, footer);
  return main;
}
