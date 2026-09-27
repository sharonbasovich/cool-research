/**
 * Reproducibly build public/data/proof-map/proof-map.json from
 *   1. the Goel–Sah proof atlas HTML, and
 *   2. the Lean formalization at the pinned revision.
 *
 * Usage: npm run extract:proof-map [-- --atlas <file.html>] [-- --lean <checkout>]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ATLAS_URL, parseAtlas } from './atlas';
import { LEAN_REPO, LEAN_REV, attachSignatures, buildLeanData } from './lean';
import type { ProofMapData } from './types';

const ROOT = resolve(import.meta.dirname, '../..');
const CACHE = join(ROOT, 'node_modules/.cache/proof-map');
const OUT_DIR = join(ROOT, 'public/data/proof-map');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadAtlas(): Promise<string> {
  const local = arg('atlas');
  if (local) return readFileSync(local, 'utf8');
  const res = await fetch(ATLAS_URL);
  if (!res.ok) throw new Error(`atlas fetch failed: ${res.status}`);
  return res.text();
}

function checkoutLean(): string {
  const local = arg('lean');
  if (local) return resolve(local);
  const dir = join(CACHE, 'lean');
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', LEAN_REPO + '.git']);
  }
  execFileSync('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin', LEAN_REV], { stdio: 'inherit' });
  execFileSync('git', ['-C', dir, 'checkout', '-q', '--detach', LEAN_REV]);
  return dir;
}

function leanFiles(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) rec(p);
      else if (name.endsWith('.lean')) out.push(relative(dir, p));
    }
  };
  rec(dir);
  return out.sort();
}

async function main() {
  const html = await loadAtlas();
  const atlas = parseAtlas(html);
  const leanDir = checkoutLean();
  const rev = execFileSync('git', ['-C', leanDir, 'rev-parse', 'HEAD']).toString().trim();
  if (rev !== LEAN_REV) throw new Error(`Lean checkout at ${rev}, expected ${LEAN_REV}`);

  const paths = leanFiles(leanDir);
  const files = paths.map((path) => ({ path, src: readFileSync(join(leanDir, path), 'utf8') }));
  const byPath = new Map(files.map((f) => [f.path, f.src]));
  const labels = new Set(atlas.statements.map((s) => s.label));
  const lean = buildLeanData(files, labels);

  for (const s of atlas.statements) {
    attachSignatures(s.lean, (p) => byPath.get(p));
    attachSignatures(s.proofLean, (p) => byPath.get(p));
  }
  for (const s of atlas.sections) if (s.lean) attachSignatures(s.lean, (p) => byPath.get(p));

  const missing = atlas.statements.flatMap((s) => [...s.lean, ...s.proofLean]).filter((l) => !byPath.has(l.path));
  if (missing.length) throw new Error(`Lean links to missing files: ${missing.map((m) => m.path).join(', ')}`);

  const leanLinks = new Set(atlas.statements.flatMap((s) => [...s.lean, ...s.proofLean].map((l) => l.url)));
  const data: ProofMapData = {
    meta: {
      generatedAt: new Date().toISOString(),
      atlasUrl: ATLAS_URL,
      atlasSha256: createHash('sha256').update(html).digest('hex'),
      leanRepo: LEAN_REPO,
      leanRev: LEAN_REV,
      counts: {
        statements: atlas.statements.length,
        edges: atlas.edges.length,
        citations: atlas.statements.reduce((n, s) => n + s.cites.length, 0),
        literature: atlas.literature.length,
        leanLinks: leanLinks.size,
        leanModules: lean.modules.length,
        leanLines: lean.totalLines,
        unresolvedRefs: atlas.unresolved.length,
      },
    },
    atlas,
    lean,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'atlas.json'), JSON.stringify({ meta: data.meta, atlas: data.atlas }, null, 1) + '\n');
  writeFileSync(join(OUT_DIR, 'lean.json'), JSON.stringify(data.lean) + '\n');
  console.log(`wrote ${relative(ROOT, OUT_DIR)}/{atlas,lean}.json`, data.meta.counts);
}

await main();
