import * as d3 from 'd3';

export const PLUS = '#2563a8';
export const MINUS = '#d9731e';
export const FRESH = '#6b7280';

export const fmtInt = d3.format(',d');
export const fmtPct = (x: number): string => (x >= 0.001 ? d3.format('.2~%')(x) : x > 0 ? d3.format('.1~e')(x * 100) + '%' : '0%');
export const fmt3 = d3.format('.3~f');
export const fmt2 = d3.format('.2f');
export const fmtSig = (x: number): string => (Math.abs(x) >= 1e4 ? d3.format('.3~s')(x) : d3.format('.3~r')(x));

/** Render a history as coloured letters. */
export function historyHtml(label: string): string {
  return [...label]
    .map((ch) => `<span class="${ch === '+' ? 'hx-p' : 'hx-m'}">${ch}</span>`)
    .join('');
}
