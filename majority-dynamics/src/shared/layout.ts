import './style.css';

export const ROUTES = [
  { href: 'index.html', label: 'Home' },
  { href: 'lab/index.html', label: 'Large-N lab' },
  { href: 'histories/index.html', label: 'Opinion histories' },
  { href: 'proof-map/index.html', label: 'Proof map' },
] as const;

export function mountLayout(depth: 0 | 1): HTMLElement {
  const prefix = depth === 0 ? './' : '../';
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  const nav = document.createElement('nav');
  nav.className = 'site';
  for (const r of ROUTES) {
    const a = document.createElement('a');
    a.href = prefix + r.href;
    a.textContent = r.label;
    nav.append(a);
  }
  const main = document.createElement('main');
  main.className = 'page';
  app.replaceChildren(nav, main);
  return main;
}
