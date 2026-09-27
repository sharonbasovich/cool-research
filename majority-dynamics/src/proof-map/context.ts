import type { AtlasFile, LeanData } from '../../scripts/proof-map/types';
import type { CrossIndex } from './data';
import type { ProofGraph } from './graph';

export type ViewId = 'map' | 'lean' | 'preai';

export type Selection = { type: 'node'; id: string } | { type: 'module'; id: string } | null;

export interface Ctx {
  file: AtlasFile;
  lean: LeanData;
  graph: ProofGraph;
  index: CrossIndex;
  selection: Selection;
  select(sel: Selection, opts?: { view?: ViewId; recenter?: boolean }): void;
  onSelect(fn: (sel: Selection, recenter: boolean) => void): void;
}
