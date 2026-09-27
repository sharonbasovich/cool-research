import type { AtlasData, LeanData, LeanModule, Statement } from '../../scripts/proof-map/types';

export interface CrossIndex {
  /** Statement label → module names (declaration links first, then docstring mentions). */
  modulesOf: Map<string, string[]>;
  /** Module name → statement labels. */
  statementsOf: Map<string, string[]>;
  moduleByName: Map<string, LeanModule>;
  moduleByPath: Map<string, LeanModule>;
  /** Module name → modules importing it. */
  importedBy: Map<string, string[]>;
}

export function buildCrossIndex(atlas: AtlasData, lean: LeanData): CrossIndex {
  const moduleByName = new Map(lean.modules.map((m) => [m.name, m]));
  const moduleByPath = new Map(lean.modules.map((m) => [m.path, m]));
  const modulesOf = new Map<string, string[]>();
  const statementsOf = new Map<string, string[]>();
  const add = (label: string, mod: string) => {
    const a = modulesOf.get(label) ?? [];
    if (!a.includes(mod)) a.push(mod);
    modulesOf.set(label, a);
    const b = statementsOf.get(mod) ?? [];
    if (!b.includes(label)) b.push(label);
    statementsOf.set(mod, b);
  };
  for (const s of atlas.statements) {
    for (const l of [...s.lean, ...s.proofLean]) {
      const m = moduleByPath.get(l.path);
      if (m) add(s.label, m.name);
    }
  }
  const labels = new Set(atlas.statements.map((s) => s.label));
  for (const m of lean.modules) for (const label of m.mentions) if (labels.has(label)) add(label, m.name);
  const importedBy = new Map<string, string[]>();
  for (const m of lean.modules) {
    for (const i of m.imports) importedBy.set(i, [...(importedBy.get(i) ?? []), m.name]);
  }
  return { modulesOf, statementsOf, moduleByName, moduleByPath, importedBy };
}

export interface PreAiComparison {
  /** Old-manuscript items, in page order, with the current statements they map to. */
  old: { text: string; page: number | null; url: string; targets: string[] }[];
  /** Current statements in paper order. */
  current: Statement[];
  newStatements: Statement[];
  /** Old items that map to several current statements. */
  split: number;
  /** Current statements drawing on several old items. */
  merged: number;
  calloutCounts: Record<string, number>;
}

export function comparePreAi(atlas: AtlasData): PreAiComparison {
  const old = new Map<string, PreAiComparison['old'][number]>();
  for (const s of atlas.statements) {
    for (const p of s.preAi) {
      const key = p.text + '@' + (p.page ?? '');
      const o = old.get(key) ?? { text: p.text, page: p.page, url: p.url, targets: [] };
      if (!o.targets.includes(s.label)) o.targets.push(s.label);
      old.set(key, o);
    }
  }
  const oldList = [...old.values()].sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || a.text.localeCompare(b.text));
  const calloutCounts: Record<string, number> = {};
  for (const s of atlas.statements) for (const c of s.callouts) calloutCounts[c.type] = (calloutCounts[c.type] ?? 0) + 1;
  return {
    old: oldList,
    current: [...atlas.statements].sort((a, b) => a.order - b.order),
    newStatements: atlas.statements.filter((s) => s.preAi.length === 0),
    split: oldList.filter((o) => o.targets.length > 1).length,
    merged: atlas.statements.filter((s) => s.preAi.length > 1).length,
    calloutCounts,
  };
}
