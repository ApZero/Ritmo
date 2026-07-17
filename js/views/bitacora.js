// ritmo/js/views/bitacora.js
import { el, openSheet, closeSheet, toast } from '../ui.js';
import * as Store from '../store.js';

const UNITS = ['L', 'kg', 'g', 'ml', 'unidad', 'docena'];
const PALETTE = ['#748B5C','#BF5B3E','#3E6259','#C98F2A','#9C9277','#5B7A8C','#8C5B7A','#5B6B8C'];

// ---------- helpers ----------

function fmtGs(n) {
  if (!n) return '₲ 0';
  return '₲ ' + Math.round(n).toLocaleString('es-PY');
}
function fmtAmt(n, unit) {
  return `${(+n || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 })} ${unit}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('es-PY', { day:'numeric', month:'short', year:'numeric' });
}
function humanDays(n) {
  if (Math.abs(n) < 14) return `${Math.abs(n)} día${Math.abs(n)!==1?'s':''}`;
  if (Math.abs(n) < 60) return `${Math.round(Math.abs(n)/7)} semana${Math.round(Math.abs(n)/7)!==1?'s':''}`;
  return `${Math.round(Math.abs(n)/30)} mes${Math.round(Math.abs(n)/30)!==1?'es':''}`;
}

// ---------- stats engine ----------

function itemStats(item) {
  const today = todayISO();
  const batches = item.batches || [];
  const last = batches[0]; // already sorted newest-first

  // Shelf-life status
  let daysLeft = null, daysSince = null, pctUsed = 0, status = 'sin_datos';
  if (last) {
    daysSince = daysBetween(last.date, today);
    daysLeft = item.avgDurationDays - daysSince;
    pctUsed = Math.min(1, Math.max(0, daysSince / item.avgDurationDays));
    if (daysLeft > item.avgDurationDays * 0.3) status = 'ok';
    else if (daysLeft >= 0) status = 'poco';
    else status = 'agotado';
  }

  // Production totals
  const totalAmount = batches.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const totalCostActual = batches.reduce((s, b) => {
    const cost = b.costOverride != null ? b.costOverride : (Number(b.amount) || 0) * item.selfMadePrice;
    return s + cost;
  }, 0);

  // Last 12 months
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffISO = cutoff.toISOString().slice(0,10);
  const last12 = batches.filter(b => b.date >= cutoffISO);
  const totalLast12 = last12.reduce((s,b) => s + (Number(b.amount)||0), 0);

  // Savings
  const priceDelta = item.storePrice - item.selfMadePrice;
  const totalSavings = batches.reduce((s, b) => s + (Number(b.amount)||0) * priceDelta, 0);
  const savingsLast12 = last12.reduce((s, b) => s + (Number(b.amount)||0) * priceDelta, 0);
  const monthlySavings = savingsLast12 / 12;
  const yearlySavings = savingsLast12;

  // Average batch interval (days between batches)
  let avgIntervalDays = null;
  if (batches.length >= 2) {
    const sorted = [...batches].sort((a,b) => a.date.localeCompare(b.date));
    let gaps = 0;
    for (let i = 1; i < sorted.length; i++) gaps += daysBetween(sorted[i-1].date, sorted[i].date);
    avgIntervalDays = Math.round(gaps / (sorted.length - 1));
  }

  return { last, daysSince, daysLeft, pctUsed, status, totalAmount, totalCostActual, totalSavings, savingsLast12, monthlySavings, yearlySavings, totalLast12, avgIntervalDays, batchCount: batches.length };
}

const STATUS_COLOR = { ok: 'var(--olive)', poco: 'var(--ochre)', agotado: 'var(--terracotta)', sin_datos: 'var(--sand)' };
const STATUS_LABEL = { ok: 'Disponible', poco: 'Poco queda', agotado: 'Agotado', sin_datos: 'Sin registros' };

// ---------- main list ----------

export const fab = { label: 'Nueva entrada', onClick: () => openItemForm(null) };

export function renderBitacoraList(container) {
  const items = Store.listBitacora().filter(b => !b.archived);
  if (!items.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🫙'),
      el('div', {}, 'Todavía no hay entradas. Tocá + para agregar sauerkraut, yogurt, lo que quieras.'),
    ]));
    return;
  }
  const list = el('div', { class: 'list', style: 'padding-top:8px;' });
  for (const item of items) list.appendChild(renderCard(item));
  container.appendChild(list);
}

function renderCard(item) {
  const s = itemStats(item);
  const statusColor = STATUS_COLOR[s.status];
  const card = el('div', { class: 'card', style: 'cursor:pointer;' });
  card.appendChild(el('div', { style: `position:absolute;left:0;top:0;bottom:0;width:4px;background:${statusColor};border-radius:4px 0 0 4px;` }));

  // Header: icon + name + status pill
  const header = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;' });
  header.appendChild(el('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
    el('span', { style: 'font-size:20px;' }, item.icon),
    el('span', { style: 'font-size:15px;font-weight:600;' }, item.name),
  ]));
  header.appendChild(el('span', { class: 'tag-pill', style: `background:${statusColor};color:#fff;font-size:11px;` }, STATUS_LABEL[s.status]));
  card.appendChild(header);

  // Shelf-life progress bar
  if (s.last) {
    const bar = el('div', { class: 'progress-bar', style: 'margin-bottom:6px;' });
    bar.appendChild(el('div', { style: `width:${Math.round(s.pctUsed*100)}%;background:${statusColor};` }));
    card.appendChild(bar);

    const info = el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);margin-bottom:8px;' });
    info.appendChild(el('span', {}, `Hecho hace ${humanDays(s.daysSince)}`));
    if (s.daysLeft >= 0) info.appendChild(el('span', {}, `Queda ~${humanDays(s.daysLeft)}`));
    else info.appendChild(el('span', { style: 'color:var(--terracotta);' }, `Vencido hace ${humanDays(-s.daysLeft)}`));
    card.appendChild(info);
  }

  // Row: last batch amount + savings badge + log button
  const row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;' });
  if (s.last) {
    row.appendChild(el('span', { style: 'font-size:12.5px;color:var(--ink-soft);' }, `Último lote: ${fmtAmt(s.last.amount, item.unit)}`));
  } else {
    row.appendChild(el('span', { style: 'font-size:12.5px;color:var(--ink-soft);' }, 'Sin lotes aún'));
  }
  if (s.monthlySavings > 0) {
    row.appendChild(el('span', { class: 'tag-pill', style: 'background:var(--teal-soft);color:var(--teal);' }, `💚 ${fmtGs(s.monthlySavings)}/mes`));
  }
  const logBtn = el('button', { class: 'btn btn-secondary', style: 'width:auto;padding:6px 12px;font-size:12.5px;', onClick: (e) => { e.stopPropagation(); openLogBatch(item); } }, '+ Registrar lote');
  row.appendChild(logBtn);
  card.appendChild(row);

  card.addEventListener('click', () => openItemDetail(item));
  return card;
}

// ---------- log a batch ----------

function openLogBatch(item) {
  const dateInput = el('input', { type: 'date', value: todayISO() });
  const amountInput = el('input', { type: 'number', min: '0', step: '0.1', placeholder: `Cantidad en ${item.unit}` });
  const notesInput = el('input', { type: 'text', placeholder: 'Notas opcionales…' });
  const costInput = el('input', { type: 'number', min: '0', step: '100', placeholder: `Costo real (₲) — vacío = ${fmtGs(0)} por defecto` });

  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Guardar lote');
  saveBtn.addEventListener('click', () => {
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) { toast('Ingresá una cantidad mayor a 0.'); return; }
    Store.addBatch(item.id, {
      date: dateInput.value,
      amount,
      notes: notesInput.value.trim(),
      costOverride: costInput.value ? parseFloat(costInput.value) : null,
    });
    closeSheet();
    toast(`Lote de ${fmtAmt(amount, item.unit)} registrado ✓`);
  });

  const estimatedCost = el('div', { style: 'font-size:12px;color:var(--ink-soft);margin-top:4px;' });
  amountInput.addEventListener('input', () => {
    const amt = parseFloat(amountInput.value) || 0;
    estimatedCost.textContent = item.selfMadePrice ? `Costo estimado: ${fmtGs(amt * item.selfMadePrice)}` : '';
  });

  openSheet(el('div', {}, [
    el('div', { class: 'field' }, [el('label', {}, 'Fecha'), dateInput]),
    el('div', { class: 'field' }, [el('label', {}, `Cantidad (${item.unit})`), amountInput, estimatedCost]),
    el('div', { class: 'field' }, [el('label', {}, 'Notas'), notesInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Costo real (₲, opcional)'), costInput]),
    saveBtn,
  ]), { title: `${item.icon} Registrar lote — ${item.name}` });
}

// ---------- item detail sheet ----------

function openItemDetail(item) {
  const wrap = el('div');

  function rebuild() {
    wrap.innerHTML = '';
    const it = Store.getBitacoraItem(item.id);
    if (!it) return;
    const s = itemStats(it);

    // Big stats
    wrap.appendChild(el('div', { class: 'stat-grid', style: 'padding:0;margin-bottom:16px;' }, [
      statBox(`${s.batchCount}`, 'Lotes registrados'),
      statBox(fmtAmt(s.totalAmount, it.unit), 'Total producido'),
      statBox(fmtGs(s.monthlySavings), 'Ahorro/mes (est.)'),
      statBox(fmtGs(s.yearlySavings), 'Ahorro/año (est.)'),
    ]));

    // Savings breakdown
    if (it.storePrice > 0 || it.selfMadePrice > 0) {
      const priceDelta = it.storePrice - it.selfMadePrice;
      wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
        el('div', { style: 'font-size:13px;font-weight:600;margin-bottom:6px;' }, '💚 Comparación de precios'),
        el('div', { style: 'display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;' }, [el('span', {}, 'Precio tienda'), el('span', {}, `${fmtGs(it.storePrice)} / ${it.unit}`)]),
        el('div', { style: 'display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;' }, [el('span', {}, 'Costo casero'), el('span', {}, `${fmtGs(it.selfMadePrice)} / ${it.unit}`)]),
        el('div', { style: 'display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;border-top:1px solid var(--line);margin-top:4px;padding-top:6px;font-weight:600;color:var(--teal);' }, [
          el('span', {}, 'Ahorro por ' + it.unit),
          el('span', {}, fmtGs(priceDelta)),
        ]),
        s.totalSavings > 0 ? el('div', { style: 'font-size:11.5px;color:var(--ink-soft);margin-top:6px;' }, `Total ahorrado hasta hoy: ${fmtGs(s.totalSavings)}`) : null,
        s.avgIntervalDays ? el('div', { style: 'font-size:11.5px;color:var(--ink-soft);margin-top:2px;' }, `Frecuencia promedio: cada ${humanDays(s.avgIntervalDays)}`) : null,
      ]));
    }

    // Batch history
    wrap.appendChild(el('div', { class: 'section-label', style: 'padding:0 0 8px;' }, 'Historial de lotes'));
    if (!it.batches.length) {
      wrap.appendChild(el('div', { style: 'color:var(--ink-soft);font-size:13px;margin-bottom:14px;' }, 'Sin lotes aún. Usá "Registrar lote" para agregar el primero.'));
    } else {
      const batchList = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;' });
      for (const batch of it.batches) {
        const bCard = el('div', { class: 'card' });
        const bHeader = el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;' });
        bHeader.appendChild(el('div', { style: 'font-size:14px;font-weight:600;' }, `${fmtAmt(batch.amount, it.unit)}`));
        bHeader.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-soft);' }, formatDate(batch.date)));
        bCard.appendChild(bHeader);
        if (batch.costOverride != null) {
          bCard.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-soft);' }, `Costo real: ${fmtGs(batch.costOverride)}`));
        } else if (it.selfMadePrice) {
          bCard.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-soft);' }, `Costo est.: ${fmtGs(batch.amount * it.selfMadePrice)}`));
        }
        if (batch.notes) bCard.appendChild(el('div', { class: 'card-comment' }, `📝 ${batch.notes}`));

        const actions = el('div', { style: 'display:flex;gap:10px;margin-top:8px;' });
        const editBtn = el('button', { class: 'btn-ghost', style: 'padding:0;font-size:12px;', onClick: () => openEditBatch(it, batch, rebuild) }, '✏️ Editar');
        const delBtn = el('button', { class: 'btn-ghost', style: 'padding:0;font-size:12px;color:var(--terracotta);', onClick: () => {
          if (!confirm('¿Eliminar este lote?')) return;
          Store.deleteBatch(it.id, batch.id);
          rebuild();
          toast('Lote eliminado');
        } }, '🗑 Eliminar');
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        bCard.appendChild(actions);
        batchList.appendChild(bCard);
      }
      wrap.appendChild(batchList);
    }

    // Log + Edit buttons
    const logBtn = el('button', { class: 'btn btn-primary' }, '+ Registrar lote');
    logBtn.addEventListener('click', () => { closeSheet(); openLogBatch(it); });
    const editItemBtn = el('button', { class: 'btn btn-secondary', style: 'margin-top:8px;' }, 'Editar configuración');
    editItemBtn.addEventListener('click', () => { closeSheet(); openItemForm(it); });
    const delItemBtn = el('button', { class: 'btn btn-danger', style: 'margin-top:8px;' }, 'Eliminar entrada');
    delItemBtn.addEventListener('click', () => {
      if (!confirm(`¿Eliminar "${it.name}" y todo su historial?`)) return;
      Store.deleteBitacoraItem(it.id);
      closeSheet();
      toast('Entrada eliminada');
    });
    wrap.appendChild(logBtn);
    wrap.appendChild(editItemBtn);
    wrap.appendChild(delItemBtn);
  }

  rebuild();
  openSheet(wrap, { title: `${item.icon} ${item.name}` });
}

function openEditBatch(item, batch, onDone) {
  const dateInput = el('input', { type: 'date', value: batch.date });
  const amountInput = el('input', { type: 'number', min: '0', step: '0.1', value: batch.amount });
  const notesInput = el('input', { type: 'text', value: batch.notes || '' });
  const costInput = el('input', { type: 'number', min: '0', step: '100', value: batch.costOverride ?? '' });
  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Guardar');
  saveBtn.addEventListener('click', () => {
    Store.updateBatch(item.id, batch.id, {
      date: dateInput.value,
      amount: parseFloat(amountInput.value) || 0,
      notes: notesInput.value.trim(),
      costOverride: costInput.value !== '' ? parseFloat(costInput.value) : null,
    });
    closeSheet();
    onDone();
    toast('Lote actualizado');
    // Re-open detail
    setTimeout(() => openItemDetail(Store.getBitacoraItem(item.id)), 80);
  });
  openSheet(el('div', {}, [
    el('div', { class: 'field' }, [el('label', {}, 'Fecha'), dateInput]),
    el('div', { class: 'field' }, [el('label', {}, `Cantidad (${item.unit})`), amountInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Notas'), notesInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Costo real (₲)'), costInput]),
    saveBtn,
  ]), { title: 'Editar lote' });
}

function statBox(num, label) {
  return el('div', { class: 'stat-box', style: 'padding:10px 12px;' }, [
    el('div', { class: 'num', style: 'font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }, String(num)),
    el('div', { class: 'label' }, label),
  ]);
}

// ---------- create / edit item form ----------

function openItemForm(existing) {
  const isEdit = !!existing;
  let color = existing?.color || PALETTE[0];

  const nameInput = el('input', { type: 'text', placeholder: 'Ej: Sauerkraut, Yogurt, Pickles…', value: existing?.name || '' });
  const iconInput = el('input', { type: 'text', placeholder: '🫙', value: existing?.icon || '', maxlength: '2', style: 'width:64px;' });
  const unitSel = el('select', {});
  for (const u of UNITS) {
    const o = el('option', { value: u }, u);
    if ((existing?.unit || 'L') === u) o.selected = true;
    unitSel.appendChild(o);
  }
  const customUnit = el('input', { type: 'text', placeholder: 'Otra unidad', value: UNITS.includes(existing?.unit) ? '' : (existing?.unit || '') });
  const durationInput = el('input', { type: 'number', min: '1', value: existing?.avgDurationDays || 30 });
  const storePriceInput = el('input', { type: 'number', min: '0', step: '100', placeholder: 'Precio en tienda por unidad', value: existing?.storePrice || '' });
  const selfPriceInput = el('input', { type: 'number', min: '0', step: '100', placeholder: 'Costo de hacerlo en casa por unidad', value: existing?.selfMadePrice || '' });
  const notesInput = el('textarea', { placeholder: 'Notas, receta, tips…' }, existing?.notes || '');

  // Live savings preview
  const savingsPreview = el('div', { style: 'font-size:12px;color:var(--teal);font-weight:600;margin-top:4px;' });
  function updateSavingsPreview() {
    const sp = parseFloat(storePriceInput.value) || 0;
    const hp = parseFloat(selfPriceInput.value) || 0;
    if (sp > 0 && hp >= 0) savingsPreview.textContent = `→ Ahorrás ${fmtGs(sp - hp)} por ${unitSel.value || customUnit.value || 'unidad'}`;
    else savingsPreview.textContent = '';
  }
  storePriceInput.addEventListener('input', updateSavingsPreview);
  selfPriceInput.addEventListener('input', updateSavingsPreview);
  if (existing) updateSavingsPreview();

  // Color picker
  const colorRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
  PALETTE.forEach(hex => {
    const dot = el('div', { style: `width:28px;height:28px;border-radius:50%;background:${hex};cursor:pointer;border:3px solid ${hex===color?'var(--ink)':'transparent'};` });
    dot.addEventListener('click', () => { color = hex; [...colorRow.children].forEach(d => d.style.border = '3px solid transparent'); dot.style.border = '3px solid var(--ink)'; });
    colorRow.appendChild(dot);
  });

  const saveBtn = el('button', { class: 'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Crear entrada');
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { toast('Poné un nombre.'); return; }
    const unit = customUnit.value.trim() || unitSel.value;
    const patch = {
      name, icon: iconInput.value.trim() || '🫙', unit, color,
      avgDurationDays: Number(durationInput.value) || 30,
      storePrice: parseFloat(storePriceInput.value) || 0,
      selfMadePrice: parseFloat(selfPriceInput.value) || 0,
      notes: notesInput.value,
    };
    if (isEdit) { Store.updateBitacoraItem(existing.id, patch); toast('Actualizado'); }
    else { Store.createBitacoraItem(patch); toast('Entrada creada'); }
    closeSheet();
  });

  openSheet(el('div', {}, [
    el('div', { class: 'field' }, [el('label', {}, 'Nombre'), nameInput]),
    el('div', { class: 'row2' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Ícono'), iconInput]),
      el('div', { class: 'field', style: 'flex:3;' }, [el('label', {}, 'Color'), colorRow]),
    ]),
    el('div', { class: 'row2' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Unidad'), unitSel]),
      el('div', { class: 'field' }, [el('label', {}, 'Otra unidad'), customUnit]),
    ]),
    el('div', { class: 'field' }, [el('label', {}, 'Duración estimada (días)'), durationInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Precio en tienda (₲ por unidad)'), storePriceInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Costo casero (₲ por unidad)'), selfPriceInput, savingsPreview]),
    el('div', { class: 'field' }, [el('label', {}, 'Notas / receta'), notesInput]),
    el('div', { class: 'btn-row' }, [saveBtn]),
  ]), { title: isEdit ? 'Editar entrada' : 'Nueva entrada en Bitácora' });
}
