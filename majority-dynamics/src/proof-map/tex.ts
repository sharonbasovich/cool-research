import katex from 'katex';

let macros: Record<string, string> = {};

export function setMacros(m: Record<string, string>): void {
  macros = { ...m };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Render text with inline \( … \) and display \[ … \] TeX to HTML. */
export function renderTex(text: string): string {
  const re = /\\\((.+?)\\\)|\\\[(.+?)\\\]/gs;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += escapeHtml(text.slice(last, m.index));
    const display = m[2] !== undefined;
    try {
      out += katex.renderToString(display ? m[2] : m[1], {
        displayMode: display,
        throwOnError: false,
        macros: { ...macros },
        strict: 'ignore',
      });
    } catch {
      out += `<code>${escapeHtml(m[0])}</code>`;
    }
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', eps: 'ε', eta: 'η',
  theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ',
  Sigma: 'Σ', tau: 'τ', phi: 'φ', varphi: 'φ', Phi: 'Φ', chi: 'χ', psi: 'ψ', omega: 'ω', Omega: 'Ω',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', to: '→', infty: '∞', pm: '±', sim: '∼', cdot: '·', times: '×',
};

/** Plain-text approximation of TeX, for tooltips and SVG labels. */
export function stripTex(text: string): string {
  return text
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\(?:mathbb|mathcal|mathbf|mathrm|mathsf|mathfrak|mb|mc|mbf|mr|msf|mf|operatorname|wt|ol|widetilde|overline)\b\s*/g, '')
    .replace(/\\([a-zA-Z]+)\s*/g, (_m, name: string) => GREEK[name] ?? '')
    .replace(/\\[,;!: ]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
