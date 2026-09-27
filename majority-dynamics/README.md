# Majority dynamics companion

Live: https://sharonbasovich.github.io/cool-research/

Static site (Vite + TypeScript + D3) with interactive companions to Goel–Sah, *Majority dynamics on sparse random graphs*.

- `/lab` — large-N simulations vs. the theorem's predictions
- `/histories` — opinion-history classes and block-pair edge densities
- `/proof-map` — paper statements ↔ Lean modules ↔ literature

```sh
npm install
npm run dev
npm run lint && npm run typecheck && npm test && npm run build
```
