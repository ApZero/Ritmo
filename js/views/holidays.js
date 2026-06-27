// ritmo/js/views/holidays.js
import { el, openSheet, closeSheet, toast, formatDateEs } from '../ui.js';
import * as Store from '../store.js';

export const fab = { label: 'Nuevo día especial', onClick: () => openForm(null) };

const TYPE_LABELS = { feriado: '📌 Feriado', libre: '🌿 Día libre', otro: '✏️ Otro' };

export function render(container) {
  container.appendChild(el('div', { style: 'padding:0 18px 14px;font-size:12.5px;color:var(--ink-soft);' },
    'Los fines de semana (sábado y domingo) ya se reconocen solos. Acá solo agregás fechas puntuales: feriados, días libres, etc. — se ofrecen como atajo al elegir fecha en una tarea.'));

  const upcoming = Store.getUpcomingSpecialDays({ days: 60, limit: 10 });
  if (upcoming.length) {
    container.appendChild(el('div', { class: 'section-label' }, 'Próximos'));
    const list = el('div', { class: 'list' });
    for (const u of upcoming) {
      list.appendChild(el('div', { class: 'card' }, el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:center;' }, [
        el('div', {}, formatDateEs(u.date)),
        el('div', { class: 'tag-pill' }, u.type === 'weekend' ? `🌤️ ${u.label}` : (TYPE_LABELS[u.type] || u.label)),
      ])));
    }
    container.appendChild(list);
  }

  const all = Store.listSpecialDays();
  container.appendChild(el('div', { class: 'section-label' }, 'Feriados y días libres guardados'));
  if (!all.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🗓️'),
      el('div', {}, 'Todavía no agregaste ninguno. Tocá + para el primero.'),
    ]));
    return;
  }
  const list = el('div', { class: 'list' });
  for (const d of all) {
    const card = el('div', { class: 'card', style: 'cursor:pointer;' });
    card.appendChild(el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:center;' }, [
      el('div', {}, [el('div', { class: 'card-title', style: 'font-size:14.5px;' }, formatDateEs(d.date)), el('div', { style: 'font-size:12.5px;color:var(--ink-soft);' }, d.label)]),
      el('div', { class: 'tag-pill' }, TYPE_LABELS[d.type] || d.type),
    ]));
    card.addEventListener('click', () => openForm(d));
    list.appendChild(card);
  }
  container.appendChild(list);
}

function openForm(existing) {
  const isEdit = !!existing;
  const dateInput = el('input', { type: 'date', value: existing?.date || '' });
  const labelInput = el('input', { type: 'text', placeholder: 'Ej: Fundación de Filadelfia', value: existing?.label || '' });
  let type = existing?.type || 'feriado';
  const seg = el('div', { class: 'segmented' });
  for (const [val, label] of Object.entries(TYPE_LABELS)) {
    const b = el('button', { class: val === type ? 'active' : '' }, label);
    b.addEventListener('click', () => { type = val; [...seg.children].forEach(c => c.classList.remove('active')); b.classList.add('active'); });
    seg.appendChild(b);
  }

  const saveBtn = el('button', { class: 'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Agregar');
  saveBtn.addEventListener('click', () => {
    if (!dateInput.value) { toast('Elegí una fecha.'); return; }
    const patch = { date: dateInput.value, label: labelInput.value.trim() || 'Día libre', type };
    if (isEdit) Store.updateSpecialDay(existing.id, patch);
    else Store.createSpecialDay(patch);
    closeSheet();
    toast(isEdit ? 'Actualizado' : 'Agregado');
  });

  const body = [
    el('div', { class: 'field' }, [el('label', {}, 'Fecha'), dateInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Etiqueta'), labelInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Tipo'), seg]),
    el('div', { class: 'btn-row' }, [saveBtn]),
  ];
  if (isEdit) {
    const delBtn = el('button', { class: 'btn btn-danger' }, 'Eliminar');
    delBtn.addEventListener('click', () => { Store.deleteSpecialDay(existing.id); closeSheet(); toast('Eliminado'); });
    body.push(el('div', { class: 'btn-row' }, [delBtn]));
  }
  openSheet(el('div', {}, body), { title: isEdit ? 'Editar día especial' : 'Nuevo día especial' });
}
