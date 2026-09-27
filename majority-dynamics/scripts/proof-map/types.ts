/** Shared shape of the committed proof-map dataset (public/data/proof-map/). */

export type Phase =
  | 'main'
  | 'setup'
  | 'transference'
  | 'recursion'
  | 'contraction'
  | 'toolbox'
  | 'literature';

export interface PdfLocation {
  /** Label text as printed, e.g. "Theorem 5.1". */
  text: string;
  page: number | null;
  /** LaTeX destination, e.g. "label/thm:full_result". */
  dest: string;
  url: string;
}

export interface LeanLink {
  name: string;
  note: string;
  path: string;
  line: number | null;
  url: string;
  /** Declaration header found at `line` in the pinned source (if resolvable). */
  signature?: string;
}

export interface Callout {
  type: string;
  title: string;
  text: string;
}

export interface Statement {
  label: string;
  number: string;
  kind: string;
  title: string;
  /** Atlas evidence-group heading (may be shared by several statements). */
  groupTitle: string;
  /** Full statement text; inline TeX is kept as \( … \). */
  statement: string;
  section: string;
  sectionTitle: string;
  topSection: string;
  phase: Phase;
  moral: string;
  auditNode: string;
  atlasUrl: string;
  paper: PdfLocation[];
  preAi: PdfLocation[];
  /** True when the atlas says there is no direct pre-AI counterpart. */
  preAiNone: boolean;
  lean: LeanLink[];
  /** Lean links attached to a section-level proof of this statement. */
  proofLean: LeanLink[];
  cites: string[];
  callouts: Callout[];
  proofSource: 'toggle' | 'section' | 'override' | 'none';
  order: number;
}

export interface Edge {
  /** The statement whose proof/statement uses `target`. */
  source: string;
  target: string;
  via: 'proof' | 'statement';
}

export interface Section {
  id: string;
  number: string;
  title: string;
  level: number;
  page: number | null;
  atlasUrl: string;
  moral?: string;
  lean?: LeanLink[];
}

export interface LiteratureRef {
  key: string;
  text: string;
  short: string;
  url: string | null;
}

export interface AtlasData {
  sections: Section[];
  statements: Statement[];
  edges: Edge[];
  literature: LiteratureRef[];
  macros: Record<string, string>;
  unresolved: { source: string; ref: string }[];
}

export interface LeanModule {
  name: string;
  path: string;
  dir: string;
  lines: number;
  decls: Record<string, number>;
  imports: string[];
  externalImports: string[];
  url: string;
  /** Atlas labels mentioned in the module's comments/docstrings. */
  mentions: string[];
}

export interface LeanData {
  modules: LeanModule[];
  dirs: { path: string; lines: number; modules: number }[];
  totalLines: number;
}

export interface AtlasFile {
  meta: ProofMapData['meta'];
  atlas: AtlasData;
}

export interface ProofMapData {
  meta: {
    generatedAt: string;
    atlasUrl: string;
    atlasSha256: string;
    leanRepo: string;
    leanRev: string;
    counts: Record<string, number>;
  };
  atlas: AtlasData;
  lean: LeanData;
}
