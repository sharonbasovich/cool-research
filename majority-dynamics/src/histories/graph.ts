import type { Rng } from './rng';

/** Undirected simple graph in compressed sparse row form. */
export interface Csr {
  n: number;
  /** offsets[v]..offsets[v+1] indexes the neighbours of v in `adj`. */
  offsets: Int32Array;
  adj: Int32Array;
}

export function edgeCount(g: Csr): number {
  return g.adj.length / 2;
}

/**
 * Stream the edges of G(n, p) in the Batagelj–Brandes order, using geometric
 * skips so the cost is proportional to the number of edges. Each unordered
 * pair {v, w} with w < v is reported once.
 */
export function forEachGnpEdge(n: number, p: number, rng: Rng, visit: (v: number, w: number) => void): void {
  if (p <= 0 || n < 2) return;
  if (p >= 1) {
    for (let v = 1; v < n; v++) for (let w = 0; w < v; w++) visit(v, w);
    return;
  }
  const invLog = 1 / Math.log(1 - p);
  let v = 1;
  let w = -1;
  while (v < n) {
    const r = rng.next();
    w += 1 + Math.floor(Math.log(1 - r) * invLog);
    while (w >= v && v < n) {
      w -= v;
      v++;
    }
    if (v < n) visit(v, w);
  }
}

/** Build a CSR graph from an explicit edge list (pairs of endpoints). */
export function csrFromEdges(n: number, us: ArrayLike<number>, vs: ArrayLike<number>, m: number): Csr {
  const deg = new Int32Array(n + 1);
  for (let i = 0; i < m; i++) {
    if (us[i] === vs[i]) throw new Error('self-loop');
    deg[us[i]]++;
    deg[vs[i]]++;
  }
  const offsets = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) offsets[v + 1] = offsets[v] + deg[v];
  const fill = offsets.slice(0, n);
  const adj = new Int32Array(offsets[n]);
  for (let i = 0; i < m; i++) {
    const u = us[i];
    const v = vs[i];
    adj[fill[u]++] = v;
    adj[fill[v]++] = u;
  }
  return { n, offsets, adj };
}

/** Sample G(n, p) and return it as CSR. */
export function sampleGnp(n: number, p: number, rng: Rng): Csr {
  let cap = Math.max(16, Math.ceil(((n * (n - 1)) / 2) * p * 1.05 + 64));
  let us = new Int32Array(cap);
  let vs = new Int32Array(cap);
  let m = 0;
  forEachGnpEdge(n, p, rng, (v, w) => {
    if (m === cap) {
      cap *= 2;
      const nu = new Int32Array(cap);
      nu.set(us);
      us = nu;
      const nv = new Int32Array(cap);
      nv.set(vs);
      vs = nv;
    }
    us[m] = v;
    vs[m] = w;
    m++;
  });
  return csrFromEdges(n, us, vs, m);
}
