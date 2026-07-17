// ritmo/js/views/projects.js
import { el, openSheet, closeSheet, toast, formatDateEs } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import * as Push from '../push.js';
import { renderStepTree } from './stepTree.js';
import { openTaskFormExternal } from './tasks.js';
import { renderHabitList, fab as habitFab } from './habits.js';
import { renderBitacoraList, fab as bitacoraFab } from './bitacora.js';

// ─── sub-tab state ─────────────────────────────────────────────────────────
let activeTab = 'proyectos'; // 'proyectos' | 'habitos' | 'bitacora' | 'diaslibres'

export const fab = {
  label: 'Nuevo',
  onClick: () => {
    if (activeTab === 'proyectos') openProjectForm(null);
    else if (activeTab === 'habitos') habitFab.onClick();
    else if (activeTab === 'bitacora') bitacoraFab.onClick();
    else openNewTaskForDay(null);
  },
};

export function render(container) {
  // Sub-tab bar — two rows of two to avoid crowding on mobile
  const tabBar = el('div', { style: 'margin:0 18px 14px;display:flex;flex-direction:column;gap:4px;' });
  const row1 = el('div', { class: 'segmented' });
  const row2 = el('div', { class: 'segmented' });
  for (const [id, label, row] of [
    ['proyectos', '🗂️ Proyectos', row1],
    ['habitos', '🌱 Hábitos', row1],
    ['bitacora', '🫙 Bitácora', row2],
    ['diaslibres', '🌿 Días libres', row2],
  ]) {
    const b = el('button', { class: id === activeTab ? 'active' : '', style: 'font-size:12.5px;' }, label);
    b.addEventListener('click', () => {
      activeTab = id;
      const v = document.getElementById('view');
      v.innerHTML = '';
      render(v);
    });
    row.appendChild(b);
  }
  tabBar.appendChild(row1);
  tabBar.appendChild(row2);
  container.appendChild(tabBar);

  if (activeTab === 'proyectos') renderProyectos(container);
  else if (activeTab === 'habitos') renderHabitList(container);
  else if (activeTab === 'bitacora') renderBitacoraList(container);
  else renderDiasLibres(container);
}

// ─── Proyectos ──────────────────────────────────────────────────────────────

function renderProyectos(container) {
  const projects = Store.listProjects().filter(p => !p.archived);
  if (!projects.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🗂️'),
      el('div', {}, 'Todavía no hay proyectos. Tocá + para crear el primero.'),
    ]));
    return;
  }
  const list = el('div', { class: 'list' });
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
  const pct = Store.computeProgress(p.steps);
  const { total, done } = countSteps(p.steps);
  const card = el('div', { class: 'card', style: 'cursor:pointer;' });
  card.appendChild(el('div', { class: 'card-body' }, [
    el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:baseline;' }, [
      el('div', { class: 'card-title' }, p.title),
      el('div', { class: 'mono', style: 'font-size:13px;color:var(--teal);font-weight:700;' }, `${pct}%`),
    ]),
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
    el('div', { style: 'font-size:11.5px;color:var(--ink-soft);margin:-2px 0 8px;' }, 'Podés ponerle fecha a cada paso para que aparezca en Hoy / Vencido.'),
    renderStepTree(p.steps, { onMutate: () => { Store.save(); updateProgress(); }, showDates: true }),
  ]));
  const editBtn = el('button', { class: 'btn btn-secondary' }, 'Editar nombre / descripción');
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
  const saveBtn = el('button', { class: 'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Crear proyecto');
  saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { toast('Poné un nombre para el proyecto.'); return; }
    const patch = { title, description: descArea.value };
    if (isEdit) Store.updateProject(existing.id, patch);
    else Store.createProject({ ...patch, steps: [] });
    closeSheet();
    toast(isEdit ? 'Proyecto actualizado' : 'Proyecto creado');
  });
  openSheet(el('div', {}, [
    el('div', { class: 'field' }, [el('label', {}, 'Nombre'), titleInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Descripción'), descArea]),
    saveBtn,
  ]), { title: isEdit ? 'Editar proyecto' : 'Nuevo proyecto' });
}

// ─── Días libres ─────────────────────────────────────────────────────────────

function renderDiasLibres(container) {
  const upcoming = Store.getUpcomingSpecialDays({ days: 60, limit: 30 });
  if (!upcoming.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🌿'),
      el('div', {}, 'No hay días especiales próximos en los próximos 60 días.'),
    ]));
    return;
  }

  const today = R.toDateOnly(new Date().toISOString().slice(0, 10));
  const list = el('div', { class: 'list' });

  for (const d of upcoming) {
    const { tasks, steps } = Store.getItemsForDate(d.date);
    const total = tasks.length + steps.length;
    const emoji = d.type === 'feriado' ? '📌' : d.type === 'libre' ? '🌿' : '🌤️';
    const daysAway = Math.round((R.toDateOnly(d.date).getTime() - today.getTime()) / 86400000);
    const awayLabel = daysAway === 0 ? 'Hoy' : daysAway === 1 ? 'Mañana' : `En ${daysAway} días`;

    const card = el('div', { class: 'card', style: 'cursor:pointer;' });
    card.appendChild(el('div', { class: 'card-body' }, [
      el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:baseline;' }, [
        el('div', {}, [
          el('div', { class: 'card-title', style: 'font-size:15px;' }, `${emoji} ${formatDateEs(d.date)}`),
          el('div', { style: 'font-size:12px;color:var(--ink-soft);margin-top:2px;' }, d.label),
        ]),
        el('div', { class: 'mono', style: 'font-size:12px;color:var(--teal);' }, awayLabel),
      ]),
      total
        ? el('div', { style: 'font-size:12px;color:var(--ink-soft);margin-top:6px;' }, `${total} ${total === 1 ? 'tarea' : 'tareas'} asignadas`)
        : el('div', { style: 'font-size:12px;color:var(--line);margin-top:6px;' }, 'Sin tareas asignadas — tocá para agregar'),
    ]));
    card.addEventListener('click', () => openDayPlanner(d));
    list.appendChild(card);
  }
  container.appendChild(list);
}

// ─── Planificador de día ──────────────────────────────────────────────────────

function openDayPlanner(dayEntry) {
  const wrap = el('div');
  let dirty = false;

  function rebuild() {
    wrap.innerHTML = '';
    const { tasks, steps } = Store.getItemsForDate(dayEntry.date);

    // Steps from projects
    if (steps.length) {
      wrap.appendChild(el('div', { class: 'section-label', style: 'padding-left:0;margin-bottom:8px;' }, 'Pasos de proyectos'));
      for (const { project, step } of steps) {
        const row = el('div', { class: 'card', style: 'margin-bottom:8px;' });
        const check = el('div', { class: 'check' + (step.completed ? ' done' : '') });
        check.innerHTML = step.completed ? '✓' : '';
        check.style.cssText = 'font-size:11px;color:#fff;flex:0 0 auto;';
        check.addEventListener('click', () => {
          Store.toggleStepCompleted(project.steps, step.id, !step.completed);
          Store.save();
          rebuild();
        });
        row.appendChild(el('div', { class: 'card-row' }, [
          check,
          el('div', { class: 'card-body' }, [
            el('div', { class: 'card-title' + (step.completed ? ' done' : ''), style: 'font-size:14.5px;' }, step.title),
            el('div', { style: 'font-size:11.5px;color:var(--ink-soft);' }, `📁 ${project.title}`),
          ]),
        ]));
        wrap.appendChild(row);
      }
    }

    // Tasks
    if (tasks.length) {
      wrap.appendChild(el('div', { class: 'section-label', style: 'padding-left:0;margin-bottom:8px;' }, 'Tareas'));
      for (const t of tasks) {
        const isDone = t.type === 'once' && t.completed;
        const row = el('div', { class: 'card', style: 'margin-bottom:8px;' });
        const check = el('div', { class: 'check' + (isDone ? ' done' : '') });
        check.innerHTML = isDone ? '✓' : '';
        check.style.cssText = 'font-size:11px;color:#fff;flex:0 0 auto;';
        check.addEventListener('click', () => {
          if (t.type === 'once') { Store.completeTask(t.id); Push.syncTaskReminder(t.id); }
          else { const u = Store.completeTask(t.id, { computeNextDueDate: R.computeNextDueDate }); Push.syncTaskReminder(u.id); }
          rebuild();
        });
        row.appendChild(el('div', { class: 'card-row' }, [
          check,
          el('div', { class: 'card-body' }, [
            el('div', { class: 'card-title' + (isDone ? ' done' : ''), style: 'font-size:14.5px;' }, t.title),
            t.pendingComment ? el('div', { class: 'card-comment', style: 'margin-top:5px;' }, `💬 ${t.pendingComment}`) : null,
          ]),
        ]));
        wrap.appendChild(row);
      }
    }

    if (!tasks.length && !steps.length) {
      wrap.appendChild(el('div', { style: 'color:var(--ink-soft);font-size:13.5px;padding:8px 0 14px;' }, 'No hay tareas asignadas para este día todavía.'));
    }

    // Quick-add task button
    const addBtn = el('button', { class: 'btn btn-secondary', style: 'margin-top:10px;' }, '+ Agregar tarea para este día');
    addBtn.addEventListener('click', () => openNewTaskForDay(dayEntry.date));
    wrap.appendChild(addBtn);
  }

  rebuild();
  const emoji = dayEntry.type === 'feriado' ? '📌' : dayEntry.type === 'libre' ? '🌿' : '🌤️';
  openSheet(wrap, { title: `${emoji} ${formatDateEs(dayEntry.date)} · ${dayEntry.label}` });
}

function openNewTaskForDay(dateStr) {
  openTaskFormExternal(null, { prefill: { dueDate: dateStr || new Date().toISOString().slice(0, 10) } });
}

