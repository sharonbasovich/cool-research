import type { Phase } from '../../scripts/proof-map/types';

export const PHASES: { id: Phase; label: string; detail: string; color: string }[] = [
  { id: 'main', label: 'Main theorems', detail: '§1: Theorems 1.1–1.2, Corollary 1.3', color: '#b3312c' },
  { id: 'setup', label: 'Setup & state chain', detail: '§2: histories, states, coarsening', color: '#5b6aa8' },
  {
    id: 'transference',
    label: 'Enumeration & tilted binomial',
    detail: '§3, App. B–C: fiber law, kernel, row model',
    color: '#1f8a8a',
  },
  {
    id: 'recursion',
    label: 'Idealized recursion',
    detail: '§4–5, App. D–E: Gaussian rows, faithful trajectory',
    color: '#5e9731',
  },
  { id: 'contraction', label: 'Contraction', detail: '§6: jumbledness and endgame', color: '#d38419' },
  { id: 'toolbox', label: 'Toolbox', detail: 'App. A: enumeration, graphicality, tails', color: '#8b5fb0' },
  { id: 'literature', label: 'Literature', detail: 'Cited external results', color: '#7d7a73' },
];

export const PHASE_COLOR = Object.fromEntries(PHASES.map((p) => [p.id, p.color])) as Record<Phase, string>;
export const PHASE_LABEL = Object.fromEntries(PHASES.map((p) => [p.id, p.label])) as Record<Phase, string>;
