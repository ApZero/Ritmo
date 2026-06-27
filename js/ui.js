// ritmo/js/ui.js
// Utilidades de UI compartidas: crear elementos, abrir/cerrar hojas (sheets),
// mostrar mensajes (toast), e iconos SVG inline para la barra de pestañas.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatMinutes(min) {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateEs(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('es-PY', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------- sheet (hoja modal inferior) ----------

let sheetBackdrop, sheetEl, onCloseCb;

function ensureSheetRoot() {
  if (sheetBackdrop) return;
  sheetBackdrop = el('div', { class: 'sheet-backdrop', onClick: closeSheet });
  sheetEl = el('div', { class: 'sheet' });
  document.body.appendChild(sheetBackdrop);
  document.body.appendChild(sheetEl);
}

export function openSheet(contentNode, { title, onClose } = {}) {
  ensureSheetRoot();
  onCloseCb = onClose;
  sheetEl.innerHTML = '';
  sheetEl.appendChild(el('div', { class: 'sheet-handle' }));
  sheetEl.appendChild(el('div', { class: 'sheet-header' }, [
    el('h2', {}, title || ''),
    el('button', { class: 'sheet-close', onClick: closeSheet, 'aria-label': 'Cerrar' }, '×'),
  ]));
  const body = el('div', { class: 'sheet-body' }, contentNode);
  sheetEl.appendChild(body);
  requestAnimationFrame(() => {
    sheetBackdrop.classList.add('open');
    sheetEl.classList.add('open');
  });
  return body;
}

export function closeSheet() {
  if (!sheetEl) return;
  sheetBackdrop.classList.remove('open');
  sheetEl.classList.remove('open');
  if (onCloseCb) { const cb = onCloseCb; onCloseCb = null; cb(); }
}

// ---------- toast ----------

let toastEl, toastTimer;
export function toast(msg, { actionLabel, onAction } = {}) {
  if (!toastEl) {
    toastEl = el('div', { class: 'toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = '';
  toastEl.appendChild(document.createTextNode(msg));
  if (actionLabel && onAction) {
    const btn = el('button', {
      style: 'margin-left:10px;background:none;border:none;color:#fff;font-weight:700;text-decoration:underline;cursor:pointer;font-size:13px;',
      onClick: (e) => { e.stopPropagation(); onAction(); toastEl.classList.remove('show'); },
    }, actionLabel);
    toastEl.appendChild(btn);
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

// ---------- iconos (barra inferior) ----------

export const ICONS = {
  hoy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 12H2M22 12h-2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19"/></svg>',
  tareas: '<svg viewBox="0 0 24 24"><path d="M4 6h2M4 12h2M4 18h2"/><path d="M9 6h11M9 12h11M9 18h11" stroke-linecap="round"/></svg>',
  proyectos: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="5" rx="1.5"/><rect x="14" y="15" width="7" height="5" rx="1.5"/></svg>',
  calendario: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  mas: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>',
};

export function icon(name) {
  const span = el('span', { html: ICONS[name] || '' });
  return span.firstChild;
}

/**
 * Fila de atajos de fecha (ej. próximos fines de semana / feriados). `items`
 * es [{date:'YYYY-MM-DD', label, type}]; al tocar uno se llama onPick(date).
 */
export function buildDateQuickPicks(items, onPick) {
  if (!items || !items.length) return el('div');
  const wrap = el('div', { class: 'chiprow', style: 'padding:0 0 10px;' });
  for (const it of items) {
    const emoji = it.type === 'weekend' ? '🌤️' : (it.type === 'libre' ? '🌿' : '📌');
    const chip = el('button', { class: 'chip', type: 'button' }, `${emoji} ${formatDateEs(it.date)} · ${it.label}`);
    chip.addEventListener('click', (e) => { e.preventDefault(); onPick(it.date); });
    wrap.appendChild(chip);
  }
  return wrap;
}
