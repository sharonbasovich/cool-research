let el: HTMLDivElement | null = null;

function node(): HTMLDivElement {
  if (!el) {
    el = document.createElement('div');
    el.className = 'hx-tooltip';
    document.body.append(el);
  }
  return el;
}

export function showTip(ev: MouseEvent, html: string): void {
  const t = node();
  t.innerHTML = html;
  t.style.display = 'block';
  const pad = 14;
  const r = t.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function hideTip(): void {
  if (el) el.style.display = 'none';
}
