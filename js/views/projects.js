// ritmo/js/views/projects.js
import { el, openSheet, closeSheet, toast } from '../ui.js';
import * as Store from '../store.js';
import { renderStepTree } from './stepTree.js';

export const fab = { label: 'Nuevo proyecto', onClick: () => openProjectForm(null) };

export function render(container) {
  const projects = Store.listProjects().filter(p => !p.archived);
  if (!projects.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🗂️'),
      el('div', {}, 'Todavía no hay proyectos. Tocá + para crear el primero.'),
    ]));
    return;
  }
  const list = el('div', { class: 'list', style: 'padding-top:8px;' });
  for (const p of projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    list.appendChild(renderProjectCard(p));
  }
  container.appendChild(list);
}

function countSteps(steps) {
  let total = 0, done = 0;
  const walk = (list) => {
    for (const s of list) {
      if (s.children && s.children.length) walk(s.children);
      else { total++; if (s.completed) done++; }
    }
  };
  walk(steps);
  return { total, done };
}

function renderProjectCard(p) {
  const cat = p.categoryId ? Store.getCategory(p.categoryId) : null;
  const pct = Store.computeProgress(p.steps);
  const { total, done } = countSteps(p.steps);
  const card = el('div', { class: 'card', style: 'cursor:pointer;' });
  card.appendChild(el('div', { class: 'card-body' }, [
    el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:baseline;' }, [
      el('div', { class: 'card-title' }, p.title),
      el('div', { class: 'mono', style: 'font-size:13px;color:var(--teal);font-weight:700;' }, `${pct}%`),
    ]),
    cat ? el('div', { class: 'card-meta' }, el('span', { class: 'cat-pill', style: `background:${cat.color}` }, `${cat.icon || ''} ${cat.name}`)) : null,
    el('div', { class: 'progress-bar', style: 'margin-top:10px;' }, el('div', { style: `width:${pct}%` })),
    el('div', { style: 'font-size:12px;color:var(--ink-soft);margin-top:6px;' }, `${done}/${total} pasos completados`),
  ]));
  card.addEventListener('click', () => openProjectDetail(p));
  return card;
}

function openProjectDetail(p) {
  const wrap = el('div');
  const pctLabel = el('div', { class: 'mono', style: 'font-size:28px;font-weight:700;color:var(--teal);' }, '');
  const progressBar = el('div', { class: 'progress-bar' }, el('div', {}));
  function updateProgress() {
    const pct = Store.computeProgress(p.steps);
    pctLabel.textContent = `${pct}%`;
    progressBar.firstChild.style.width = `${pct}%`;
  }
  updateProgress();

  wrap.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;' }, [
    el('div', { style: 'color:var(--ink-soft);font-size:13px;' }, p.description || 'Sin descripción'),
    pctLabel,
  ]));
  wrap.appendChild(progressBar);

  wrap.appendChild(el('div', { class: 'field', style: 'margin-top:18px;' }, [
    el('label', {}, 'Pasos'),
    renderStepTree(p.steps, { onMutate: () => { Store.save(); updateProgress(); } }),
  ]));

  const editBtn = el('button', { class: 'btn btn-secondary' }, 'Editar título / descripción / categoría');
  editBtn.addEventListener('click', () => openProjectForm(p));
  const delBtn = el('button', { class: 'btn btn-danger' }, 'Eliminar proyecto');
  delBtn.addEventListener('click', () => {
    if (!confirm(`¿Eliminar el proyecto "${p.title}"?`)) return;
    Store.deleteProject(p.id);
    closeSheet();
    toast('Proyecto eliminado');
  });
  wrap.appendChild(el('div', { class: 'btn-row' }, [editBtn]));
  wrap.appendChild(el('div', { class: 'btn-row' }, [delBtn]));

  openSheet(wrap, { title: p.title });
}

function openProjectForm(existing) {
  const isEdit = !!existing;
  const titleInput = el('input', { type: 'text', placeholder: 'Nombre del proyecto', value: existing?.title || '' });
  const descArea = el('textarea', { placeholder: 'Detalles, objetivo, contexto…' }, existing?.description || '');
  const catSelect = el('select', {});
  catSelect.appendChild(el('option', { value: '' }, 'Sin categoría'));
  for (const c of Store.listCategories()) {
    const opt = el('option', { value: c.id }, `${c.icon || ''} ${c.name}`);
    if (existing?.categoryId === c.id) opt.selected = true;
    catSelect.appendChild(opt);
  }

  const saveBtn = el('button', { class: 'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Crear proyecto');
  saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { toast('Poné un nombre para el proyecto.'); return; }
    const patch = { title, description: descArea.value, categoryId: catSelect.value || null };
    if (isEdit) Store.updateProject(existing.id, patch);
    else Store.createProject({ ...patch, steps: [] });
    closeSheet();
    toast(isEdit ? 'Proyecto actualizado' : 'Proyecto creado');
  });

  openSheet(el('div', {}, [
    el('div', { class: 'field' }, [el('label', {}, 'Nombre'), titleInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Descripción'), descArea]),
    el('div', { class: 'field' }, [el('label', {}, 'Categoría'), catSelect]),
    saveBtn,
  ]), { title: isEdit ? 'Editar proyecto' : 'Nuevo proyecto' });
}
