// ritmo/js/views/categories.js
import { el, openSheet, closeSheet, toast, formatMinutes } from '../ui.js';
import * as Store from '../store.js';

export const fab = { label: 'Nueva categoría', onClick: () => openForm(null) };

const PALETTE = ['#7C8B5B', '#BF5B3E', '#3E6259', '#D7A23A', '#9C9277', '#5B7A8C', '#8C5B7A', '#5B6B8C'];

export function render(container) {
  const cats = Store.listCategories();
  if (!cats.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🏷️'),
      el('div', {}, 'Todavía no creaste categorías.'),
    ]));
    return;
  }
  const list = el('div', { class: 'list', style: 'padding-top:8px;' });
  for (const c of cats) {
    const tasksUsing = Store.listTasks().filter(t => t.categoryId === c.id).length;
    const projectsUsing = Store.listProjects().filter(p => p.categoryId === c.id).length;
    const card = el('div', { class: 'card', style: 'cursor:pointer;' });
    card.appendChild(el('div', { class: 'card-row' }, [
      el('div', { style: `width:34px;height:34px;border-radius:10px;background:${c.color};display:flex;align-items:center;justify-content:center;font-size:17px;flex:0 0 auto;` }, c.icon || '•'),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'card-title' }, c.name),
        el('div', { class: 'card-meta' }, [
          c.estimatedMinutes ? el('span', { class: 'tag-pill' }, `⏱ ${formatMinutes(c.estimatedMinutes)} por defecto`) : null,
          el('span', { class: 'tag-pill' }, `${tasksUsing} tareas · ${projectsUsing} proyectos`),
        ]),
      ]),
    ]));
    card.addEventListener('click', () => openForm(c));
    list.appendChild(card);
  }
  container.appendChild(list);
}

function openForm(existing) {
  const isEdit = !!existing;
  const nameInput = el('input', { type: 'text', placeholder: 'Ej: Salud, Casa, Chacra…', value: existing?.name || '' });
  const iconInput = el('input', { type: 'text', placeholder: 'Un emoji, ej 🌱', value: existing?.icon || '', maxlength: '2' });
  const estInput = el('input', { type: 'number', min: '0', step: '5', value: existing?.estimatedMinutes || '' });

  let color = existing?.color || PALETTE[0];
  const swatches = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
  PALETTE.forEach(hex => {
    const dot = el('div', {
      style: `width:30px;height:30px;border-radius:50%;background:${hex};cursor:pointer;border:3px solid ${hex === color ? 'var(--ink)' : 'transparent'};`,
    });
    dot.addEventListener('click', () => { color = hex; [...swatches.children].forEach(d => d.style.border = '3px solid transparent'); dot.style.border = '3px solid var(--ink)'; });
    swatches.appendChild(dot);
  });

  const saveBtn = el('button', { class: 'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Crear categoría');
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { toast('Poné un nombre.'); return; }
    const patch = { name, icon: iconInput.value.trim(), color, estimatedMinutes: Number(estInput.value) || 0 };
    if (isEdit) Store.updateCategory(existing.id, patch);
    else Store.createCategory(patch);
    closeSheet();
    toast(isEdit ? 'Categoría actualizada' : 'Categoría creada');
  });

  const body = [
    el('div', { class: 'field' }, [el('label', {}, 'Nombre'), nameInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Ícono (emoji)'), iconInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Color'), swatches]),
    el('div', { class: 'field' }, [el('label', {}, 'Tiempo estimado por defecto (minutos)'), estInput]),
    el('div', { class: 'btn-row' }, [saveBtn]),
  ];
  if (isEdit) {
    const delBtn = el('button', { class: 'btn btn-danger' }, 'Eliminar categoría');
    delBtn.addEventListener('click', () => {
      if (!confirm(`¿Eliminar "${existing.name}"? Las tareas y proyectos que la usan quedarán sin categoría.`)) return;
      Store.deleteCategory(existing.id);
      closeSheet();
      toast('Categoría eliminada');
    });
    body.push(el('div', { class: 'btn-row' }, [delBtn]));
  }
  openSheet(el('div', {}, body), { title: isEdit ? 'Editar categoría' : 'Nueva categoría' });
}
