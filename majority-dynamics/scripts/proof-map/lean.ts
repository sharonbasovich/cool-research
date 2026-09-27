import type { LeanData, LeanLink, LeanModule } from './types';

export const LEAN_REPO = 'https://github.com/gopalkgoel/sparse-majority-dynamics-lean';
export const LEAN_REV = '4d607ff1d4ab468476bd7caa40d3c89199dde102';

const DECL_RE =
  /^\s*(?:@\[[^\]]*\]\s*)?(?:(?:private|protected|noncomputable|nonrec|partial|unsafe|scoped)\s+)*(theorem|lemma|def|abbrev|structure|inductive|instance|class)\b/;
const LABEL_RE = /\b(?:thm|lem|prop|cor|def|fact|conj):[A-Za-z0-9_-]+/g;

export function moduleName(path: string): string {
  return path.replace(/\.lean$/, '').split('/').join('.');
}

export function blobUrl(path: string, line?: number | null): string {
  return `${LEAN_REPO}/blob/${LEAN_REV}/${path}${line ? `#L${line}` : ''}`;
}

/** Parse one Lean source file: header imports, declaration counts and atlas label mentions. */
export function parseLeanSource(path: string, src: string, labels: ReadonlySet<string>): Omit<LeanModule, 'imports' | 'externalImports'> & { rawImports: string[] } {
  const lines = src.split('\n');
  const rawImports: string[] = [];
  const decls: Record<string, number> = {};
  for (const line of lines) {
    const im = /^\s*(?:public\s+|meta\s+|private\s+)*import\s+([\w.]+)/.exec(line);
    if (im) rawImports.push(im[1]);
    const d = DECL_RE.exec(line);
    if (d) decls[d[1]] = (decls[d[1]] ?? 0) + 1;
  }
  const mentions = [...new Set([...src.matchAll(LABEL_RE)].map((m) => m[0]).filter((l) => labels.has(l)))].sort();
  const count = src.endsWith('\n') ? lines.length - 1 : lines.length;
  const parts = path.split('/');
  return {
    name: moduleName(path),
    path,
    dir: parts.length > 1 ? parts.slice(0, -1).join('/') : '.',
    lines: count,
    decls,
    url: blobUrl(path),
    mentions,
    rawImports,
  };
}

export function buildLeanData(files: { path: string; src: string }[], labels: ReadonlySet<string>): LeanData {
  const parsed = files.map((f) => parseLeanSource(f.path, f.src, labels)).sort((a, b) => a.path.localeCompare(b.path));
  const internal = new Set(parsed.map((p) => p.name));
  const modules: LeanModule[] = parsed.map(({ rawImports, ...m }) => ({
    ...m,
    imports: rawImports.filter((i) => internal.has(i)),
    externalImports: [...new Set(rawImports.filter((i) => !internal.has(i)).map((i) => i.split('.')[0]))].sort(),
  }));
  const dirs = new Map<string, { lines: number; modules: number }>();
  for (const m of modules) {
    const parts = m.dir === '.' ? [] : m.dir.split('/');
    for (let i = 0; i <= parts.length; i++) {
      const key = i === 0 ? '.' : parts.slice(0, i).join('/');
      const d = dirs.get(key) ?? { lines: 0, modules: 0 };
      d.lines += m.lines;
      d.modules += 1;
      dirs.set(key, d);
    }
  }
  return {
    modules,
    dirs: [...dirs.entries()].map(([path, d]) => ({ path, ...d })).sort((a, b) => a.path.localeCompare(b.path)),
    totalLines: modules.reduce((s, m) => s + m.lines, 0),
  };
}

/** Declaration header starting at (or just after docstrings/attributes at) the linked line. */
export function signatureAt(src: string, line: number | null): string | undefined {
  if (!line) return undefined;
  const lines = src.split('\n');
  for (let i = line - 1; i < Math.min(lines.length, line + 12); i++) {
    if (DECL_RE.test(lines[i])) {
      const out: string[] = [];
      for (let j = i; j < Math.min(lines.length, i + 6); j++) {
        const l = lines[j];
        if (j > i && (l.trim() === '' || /^\s*(:=|where|by)\b/.test(l))) break;
        out.push(l.replace(/\s+$/, ''));
        if (/:=\s*(by)?\s*$/.test(l)) break;
      }
      return out.join('\n').replace(/\s*:=\s*(by)?\s*$/, '');
    }
  }
  return undefined;
}

export function attachSignatures(links: LeanLink[], read: (path: string) => string | undefined): void {
  for (const l of links) {
    const src = read(l.path);
    if (src) l.signature = signatureAt(src, l.line);
  }
}
