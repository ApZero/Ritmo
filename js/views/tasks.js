// ritmo/js/views/tasks.js
import { el, openSheet, closeSheet, toast, escapeHtml, formatMinutes, todayISO, formatDateEs, buildDateQuickPicks } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import * as Push from '../push.js';
import { renderStepTree } from './stepTree.js';
import { taskStats } from './stats.js';

// ---------- estado de filtros (vive mientras la app esté abierta) ----------
const state = {
  type: 'all',           // all | every_after | once
  categoryIds: new Set(),
  hideCompleted: true,
  search: '',
};

export const fab = { label: 'Nueva tarea', onClick: () => openTaskForm(null) };

export function render(container, ctx) {
  state.hideCompleted = state.hideCompleted ?? Store.getSettings().hideCompletedDefault;
  container.appendChild(buildFiltersUI());
  sectionsContainer = el('div');
  container.appendChild(sectionsContainer);
  refreshSections();
}

let sectionsContainer = null;
function refreshSections() {
  if (!sectionsContainer) return;
  sectionsContainer.innerHTML = '';
  sectionsContainer.appendChild(buildSections());
}

// ---------- filtros ----------

function buildFiltersUI() {
  const wrap = el('div');

  const searchRow = el('div', { style: 'padding:0 18px 10px;' });
  const search = el('input', { type: 'text', placeholder: 'Buscar tareas…', value: state.search });
  search.addEventListener('input', () => { state.search = search.value; refreshSections(); });
  searchRow.appendChild(search);
  wrap.appendChild(searchRow);

  const typeChips = el('div', { class: 'chiprow' });
  const typeButtons = [];
  for (const [id, label] of [['all', 'Todas'], ['every_after', 'Recurrentes'], ['once', 'Tareas sueltas']]) {
    const chip = el('button', { class: 'chip' + (state.type === id ? ' active' : '') }, label);
    chip.addEventListener('click', () => {
      state.type = id;
      typeButtons.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      refreshSections();
    });
    typeButtons.push(chip);
    typeChips.appendChild(chip);
  }
  const hideChip = el('button', { class: 'chip' + (state.hideCompleted ? ' active' : ''), title: 'Mostrar/ocultar completadas' }, state.hideCompleted ? '🙈' : '👁️');
  hideChip.addEventListener('click', () => {
    state.hideCompleted = !state.hideCompleted;
    hideChip.className = 'chip' + (state.hideCompleted ? ' active' : '');
    hideChip.textContent = state.hideCompleted ? '🙈' : '👁️';
    refreshSections();
  });
  typeChips.appendChild(hideChip);
  wrap.appendChild(typeChips);

  const cats = Store.listCategories();
  if (cats.length) {
    const catChips = el('div', { class: 'chiprow' });
    for (const c of cats) {
      const chip = el('button', { class: 'chip' + (state.categoryIds.has(c.id) ? ' active' : '') }, [
        el('span', { class: 'swatch', style: `background:${c.color}` }), `${c.icon || ''} ${c.name}`,
      ]);
      chip.addEventListener('click', () => {
        state.categoryIds.has(c.id) ? state.categoryIds.delete(c.id) : state.categoryIds.add(c.id);
        chip.classList.toggle('active');
        refreshSections();
      });
      catChips.appendChild(chip);
    }
    wrap.appendChild(catChips);
  }
  return wrap;
}

// ---------- secciones / lista ----------

function passesFilters(t) {
  if (state.type === 'every_after' && t.type === 'once') return false;
  if (state.type === 'once' && t.type !== 'once') return false;
  if (state.categoryIds.size && !state.categoryIds.has(t.categoryId)) return false;
  if (state.search && !t.title.toLowerCase().includes(state.search.toLowerCase())) return false;
  return true;
}

function classify(t, proximoWindowDays, today) {
  if (t.type === 'once') {
    if (t.completed) return 'completadas';
    if (!t.dueDate) return 'sin_fecha';
    return R.classifyStatus(R.toDateOnly(t.dueDate), today, proximoWindowDays);
  }
  if (!t.currentDueDate) return 'sin_fecha';
  return R.classifyStatus(R.toDateOnly(t.currentDueDate), today, proximoWindowDays);
}

function dueOf(t) { return t.type === 'once' ? t.dueDate : t.currentDueDate; }

const SECTION_LABELS = {
  vencido: 'Vencido', hoy: 'Hoy', proximo: 'Próximo', a_tiempo: 'A tiempo',
  sin_fecha: 'Sin fecha', completadas: 'Completadas',
};
const SECTION_ORDER = ['vencido', 'hoy', 'proximo', 'a_tiempo', 'sin_fecha', 'completadas'];

function buildSections() {
  const settings = Store.getSettings();
  const today = R.toDateOnly(todayISO());
  const tasks = Store.listTasks().filter(t => !t.archived).filter(passesFilters);

  const buckets = {};
  for (const id of SECTION_ORDER) buckets[id] = [];
  for (const t of tasks) buckets[classify(t, settings.proximoWindowDays, today)].push(t);
  for (const id of SECTION_ORDER) buckets[id].sort((a, b) => (dueOf(a) || '9999').localeCompare(dueOf(b) || '9999'));

  const wrap = el('div');
  let any = false;
  for (const sectionId of SECTION_ORDER) {
    if (sectionId === 'completadas' && state.hideCompleted) continue;
    const items = buckets[sectionId];
    if (!items.length) continue;
    any = true;
    wrap.appendChild(el('div', { class: 'section-label' }, `${SECTION_LABELS[sectionId]} · ${items.length}`));
    const list = el('div', { class: 'list' });
    for (const t of items) list.appendChild(renderCard(t, sectionId));
    wrap.appendChild(list);
  }
  if (!any) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🌿'),
      el('div', {}, 'No hay tareas con estos filtros.'),
    ]));
  }
  return wrap;
}

// ---------- tarjeta ----------

function renderCard(t, sectionId) {
  const cat = t.categoryId ? Store.getCategory(t.categoryId) : null;
  const isDone = t.type === 'once' && t.completed;
  const rail = sectionId === 'completadas' ? 'a_tiempo' : sectionId;
  const due = dueOf(t);

  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: `status-rail ${rail}` }));

  const check = el('div', { class: 'check' + (isDone ? ' done' : '') }, el('span', { html: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>' }).firstChild);
  check.addEventListener('click', (e) => { e.stopPropagation(); handleComplete(t); });

  const body = el('div', { class: 'card-body' });

  const titleRow = el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px;' }, [
    el('div', { class: 'card-title' + (isDone ? ' done' : ''), style: 'min-width:0;' }, t.title),
  ]);
  if (due && sectionId !== 'completadas') {
    titleRow.appendChild(el('span', { class: `countdown ${sectionId}`, style: 'flex:0 0 auto;white-space:nowrap;' }, R.humanizeCountdown(R.toDateOnly(due), R.toDateOnly(todayISO()))));
  }
  body.appendChild(titleRow);

  if (cat || (t.tags || []).length || t.estimatedMinutes) {
    const meta = el('div', { class: 'card-meta' });
    if (cat) meta.appendChild(el('span', { class: 'cat-pill', style: `background:${cat.color}` }, `${cat.icon || ''} ${cat.name}`));
    for (const tag of (t.tags || [])) meta.appendChild(el('span', { class: 'tag-pill' }, `#${tag}`));
    if (t.estimatedMinutes) meta.appendChild(el('span', { class: 'tag-pill' }, `⏱ ${formatMinutes(t.estimatedMinutes)}`));
    body.appendChild(meta);
  }

  if (t.type !== 'once') {
    const lastEntry = (t.history || [])[t.history.length - 1];
    const sinceText = lastEntry?.completedAt ? R.humanizeSince(R.toDateOnly(lastEntry.completedAt.slice(0, 10)), R.toDateOnly(todayISO())) : 'Sin historial aún';
    body.appendChild(el('div', { style: 'font-size:11.5px;color:var(--ink-soft);margin-top:4px;' }, `${sinceText} · ${R.humanizeRule(t.rule)}`));
    body.appendChild(renderFooterRow(t));
  }

  if (t.pendingComment) {
    body.appendChild(el('div', { class: 'card-comment' }, `💬 ${escapeHtml(t.pendingComment)}`));
  }

  card.appendChild(el('div', { class: 'card-row' }, [check, body]));
  card.addEventListener('click', (e) => { if (e.target !== check && !check.contains(e.target)) openTaskForm(t); });
  return card;
}

function renderFooterRow(t) {
  const row = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:6px;' });
  row.appendChild(renderRhythmStrip(t));
  const actions = el('div', { style: 'display:flex;gap:4px;flex:0 0 auto;' });
  const commentBtn = el('button', {
    class: 'btn-ghost', style: 'padding:4px 6px;font-size:14px;line-height:1;',
    onClick: (e) => { e.stopPropagation(); openCommentSheet(t); },
  }, t.pendingComment ? '✏️' : '💬');
  const historyBtn = el('button', {
    class: 'btn-ghost', style: 'padding:4px 6px;font-size:13px;line-height:1;display:flex;align-items:center;gap:2px;',
    onClick: (e) => { e.stopPropagation(); openHistorySheet(t); },
  }, [el('span', { style: 'font-size:14px;' }, '🕓'), t.history?.length ? String(t.history.length) : '']);
  actions.appendChild(commentBtn);
  actions.appendChild(historyBtn);
  row.appendChild(actions);
  return row;
}

function renderRhythmStrip(t) {
  const wrap = el('div', { class: 'rhythm-strip', style: 'margin-top:0;' });
  const recent = (t.history || []).slice(-8);
  if (!recent.length) {
    wrap.appendChild(el('span', { class: 'rhythm-label' }, 'sin historial'));
    return wrap;
  }
  for (const h of recent) {
    const late = h.dueDate && h.completedAt && h.completedAt.slice(0, 10) > h.dueDate;
    wrap.appendChild(el('span', { class: 'rhythm-dot on' + (late ? ' late' : '') }));
  }
  return wrap;
}

// ---------- acciones ----------

function handleComplete(t) {
  if (t.type === 'once') {
    if (t.completed) {
      Store.uncompleteTask(t.id);
      Push.syncTaskReminder(t.id);
    } else {
      Store.completeTask(t.id);
      Push.syncTaskReminder(t.id);
      toast('Tarea completada', { actionLabel: 'Deshacer', onAction: () => { Store.uncompleteTask(t.id); Push.syncTaskReminder(t.id); } });
    }
    return;
  }
  const updated = Store.completeTask(t.id, { computeNextDueDate: R.computeNextDueDate });
  Push.syncTaskReminder(updated.id);
  const msg = updated.currentDueDate ? `Hecho. Próxima: ${formatDateEs(updated.currentDueDate)}` : 'Hecho.';
  toast(msg, { actionLabel: 'Deshacer', onAction: () => { Store.uncompleteTask(t.id); Push.syncTaskReminder(t.id); } });
}

function openCommentSheet(t) {
  const ta = el('textarea', { placeholder: 'Ej: limpiar solo la heladera y el horno…' }, t.pendingComment || '');
  const save = el('button', { class: 'btn btn-primary' }, 'Guardar comentario');
  save.addEventListener('click', () => {
    Store.updateTask(t.id, { pendingComment: ta.value });
    closeSheet();
    toast('Comentario guardado');
  });
  openSheet(el('div', {}, [
    el('p', { style: 'color:var(--ink-soft);font-size:13px;' }, '¿Algo específico para la próxima vez que toque esta tarea?'),
    el('div', { class: 'field' }, ta),
    save,
  ]), { title: t.title });
}

function handleDelete(t) {
  if (!confirm(`¿Eliminar "${t.title}"? Esta acción no se puede deshacer.`)) return;
  Store.deleteTask(t.id);
  Push.deleteTaskReminder(t.id);
  closeSheet();
  toast('Tarea eliminada');
}

// ---------- historial: ver, editar y registrar finalizaciones pasadas ----------

function openHistorySheet(t) {
  const container = el('div');
  let showAddForm = false;

  function miniStat(num, label) {
    return el('div', { class: 'stat-box' }, [el('div', { class: 'num', style: 'font-size:17px;' }, String(num)), el('div', { class: 'label' }, label)]);
  }

  function rebuild() {
    container.innerHTML = '';
    const s = taskStats(t);
    container.appendChild(el('div', { class: 'stat-grid', style: 'padding:0;margin-bottom:14px;' }, [
      miniStat(s.count, 'Finalizaciones'),
      miniStat(s.onTimeRate !== null ? `${s.onTimeRate}%` : '—', 'A tiempo'),
      miniStat(s.streak, 'Racha actual'),
      miniStat(s.avgLatenessDays > 0 ? `${s.avgLatenessDays} d` : '—', 'Demora prom.'),
    ]));

    if (!showAddForm) {
      const addBtn = el('button', { class: 'btn btn-secondary', style: 'margin-bottom:14px;' }, '+ Registrar finalización');
      addBtn.addEventListener('click', () => { showAddForm = true; rebuild(); });
      container.appendChild(addBtn);
    } else {
      container.appendChild(buildAddForm());
    }

    const entries = t.history || [];
    if (!entries.length) {
      container.appendChild(el('div', { class: 'empty-state' }, 'Todavía no hay finalizaciones registradas.'));
    } else {
      entries.slice().reverse().forEach((h, revIdx) => container.appendChild(renderEntry(h, entries.length - 1 - revIdx)));
    }
  }

  function buildAddForm() {
    const wrap = el('div', { class: 'card', style: 'margin-bottom:14px;' });
    const dateInput = el('input', { type: 'date', value: todayISO() });
    const commentInput = el('textarea', { placeholder: 'Comentario (opcional)…' });
    let closesPending = true;
    const toggle = el('button', { class: 'chip active', type: 'button' }, '✓ Cierra la iteración pendiente');
    toggle.addEventListener('click', () => {
      closesPending = !closesPending;
      toggle.className = 'chip' + (closesPending ? ' active' : '');
      toggle.textContent = (closesPending ? '✓ ' : '') + 'Cierra la iteración pendiente';
    });
    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Guardar');
    saveBtn.addEventListener('click', () => {
      if (!dateInput.value) { toast('Elegí una fecha.'); return; }
      const [y, m, d] = dateInput.value.split('-').map(Number);
      const completionDate = new Date(y, m - 1, d, 12, 0, 0);
      if (closesPending) {
        const updated = Store.completeTask(t.id, { completionDate, comment: commentInput.value, computeNextDueDate: R.computeNextDueDate });
        Push.syncTaskReminder(updated.id);
      } else {
        Store.addManualHistoryEntry(t.id, { completedAt: `${dateInput.value}T12:00:00`, dueDate: t.currentDueDate, comment: commentInput.value });
      }
      showAddForm = false;
      toast('Finalización registrada');
      rebuild();
    });
    const cancelBtn = el('button', { class: 'btn btn-ghost' }, 'Cancelar');
    cancelBtn.addEventListener('click', () => { showAddForm = false; rebuild(); });

    wrap.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Fecha en que lo hiciste'), dateInput]));
    wrap.appendChild(buildDateQuickPicks(Store.getUpcomingSpecialDays({ from: new Date(Date.now() - 13 * 86400000), days: 21, limit: 6 }), (d) => { dateInput.value = d; }));
    wrap.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Comentario'), commentInput]));
    wrap.appendChild(toggle);
    wrap.appendChild(el('div', { style: 'font-size:11.5px;color:var(--ink-soft);margin:8px 0 0;' },
      'Si lo desmarcás, queda solo como registro para las estadísticas y no cambia tu próximo vencimiento.'));
    wrap.appendChild(el('div', { class: 'btn-row' }, [saveBtn, cancelBtn]));
    return wrap;
  }

  function renderEntry(h, idx) {
    const late = h.dueDate && h.completedAt && h.completedAt.slice(0, 10) > h.dueDate;
    const card = el('div', { class: 'card', style: 'margin-bottom:8px;' });
    let editing = false;

    function buildCard() {
      card.innerHTML = '';
      if (!editing) {
        card.appendChild(el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:flex-start;' }, [
          el('div', {}, [
            el('div', { style: 'font-size:13.5px;font-weight:600;' }, `Hecho: ${formatDateEs(h.completedAt ? h.completedAt.slice(0, 10) : null)}`),
            el('div', { style: 'font-size:12px;color:var(--ink-soft);' }, `Vencía: ${h.dueDate ? formatDateEs(h.dueDate) : '—'}`),
            h.comment ? el('div', { class: 'card-comment', style: 'margin-top:6px;' }, `💬 ${escapeHtml(h.comment)}`) : null,
          ]),
          el('span', { class: 'tag-pill', style: `color:#fff;background:${late ? 'var(--ochre)' : 'var(--olive)'}` }, late ? 'Tarde' : 'A tiempo'),
        ]));
        card.appendChild(el('div', { style: 'display:flex;gap:14px;margin-top:6px;' }, [
          el('button', { class: 'btn-ghost', style: 'padding:0;font-size:12px;', onClick: () => { editing = true; buildCard(); } }, '✏️ Editar'),
          el('button', { class: 'btn-ghost', style: 'padding:0;font-size:12px;color:var(--terracotta);', onClick: () => {
            if (!confirm('¿Eliminar esta entrada del historial?')) return;
            Store.deleteTaskHistoryEntry(t.id, idx);
            rebuild();
          } }, '🗑 Eliminar'),
        ]));
      } else {
        const completedInput = el('input', { type: 'date', value: h.completedAt ? h.completedAt.slice(0, 10) : '' });
        const dueInput = el('input', { type: 'date', value: h.dueDate || '' });
        const commentInput = el('textarea', {}, h.comment || '');
        const saveBtn = el('button', { class: 'btn btn-primary' }, 'Guardar');
        saveBtn.addEventListener('click', () => {
          Store.updateTaskHistoryEntry(t.id, idx, {
            completedAt: completedInput.value ? `${completedInput.value}T12:00:00` : h.completedAt,
            dueDate: dueInput.value || null,
            comment: commentInput.value,
          });
          rebuild();
        });
        const cancelBtn = el('button', { class: 'btn btn-ghost' }, 'Cancelar');
        cancelBtn.addEventListener('click', () => { editing = false; buildCard(); });
        card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Se hizo el'), completedInput]));
        card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Vencía el'), dueInput]));
        card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Comentario'), commentInput]));
        card.appendChild(el('div', { class: 'btn-row' }, [saveBtn, cancelBtn]));
      }
    }
    buildCard();
    return card;
  }

  rebuild();
  openSheet(container, { title: `Historial — ${t.title}` });
}

// ---------- formulario crear/editar ----------

function defaultRule() {
  return { mode: 'every', unit: 'week', interval: 1, weekdays: [1], anchorDate: todayISO() };
}

function openTaskForm(existing) {
  const isEdit = !!existing;
  const t = existing ? JSON.parse(JSON.stringify(existing)) : {
    title: '', notes: '', type: 'once', categoryId: null, tags: [], estimatedMinutes: 0,
    priority: 'normal', subtasks: [], dueDate: null, rule: defaultRule(), currentDueDate: null,
    pendingComment: '', reminder: { enabled: false, time: Store.getSettings().reminderDefaultTime, offsetDays: 0 },
  };
  if (!t.reminder) t.reminder = { enabled: false, time: Store.getSettings().reminderDefaultTime, offsetDays: 0 };
  if (!t.rule) t.rule = defaultRule();

  const form = el('div');

  // Título
  const titleInput = el('input', { type: 'text', placeholder: 'Título de la tarea', value: t.title });
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Título'), titleInput]));

  // Tipo
  const typeSeg = el('div', { class: 'segmented' });
  const typeOptions = [['once', 'Única vez'], ['every', 'Cada (fija)'], ['after', 'Después de']];
  for (const [val, label] of typeOptions) {
    const btn = el('button', { class: val === t.type ? 'active' : '' }, label);
    btn.addEventListener('click', () => { t.type = val; t.rule.mode = val === 'after' ? 'after' : 'every'; rebuildDynamic(); });
    typeSeg.appendChild(btn);
  }
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Tipo de tarea'), typeSeg]));

  const dynamic = el('div');
  form.appendChild(dynamic);

  function rebuildDynamic() {
    dynamic.innerHTML = '';
    [...typeSeg.children].forEach((b, i) => b.className = typeOptions[i][0] === t.type ? 'active' : '');

    if (t.type === 'once') {
      const dateInput = el('input', { type: 'date', value: t.dueDate || '' });
      dateInput.addEventListener('change', () => { t.dueDate = dateInput.value || null; });
      dynamic.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Fecha (opcional)'), dateInput]));
      dynamic.appendChild(buildDateQuickPicks(Store.getUpcomingSpecialDays({ limit: 6 }), (d) => { dateInput.value = d; t.dueDate = d; }));

      const prioSeg = el('div', { class: 'segmented' });
      for (const [val, label] of [['low', 'Baja'], ['normal', 'Normal'], ['high', 'Alta']]) {
        const b = el('button', { class: t.priority === val ? 'active' : '' }, label);
        b.addEventListener('click', () => { t.priority = val; [...prioSeg.children].forEach(c => c.className = ''); b.className = 'active'; });
        prioSeg.appendChild(b);
      }
      dynamic.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Prioridad'), prioSeg]));
    } else {
      dynamic.appendChild(buildRuleBuilder(t));
      const commentArea = el('textarea', { placeholder: 'Idea específica para la próxima vez (opcional)…' }, t.pendingComment || '');
      commentArea.addEventListener('change', () => { t.pendingComment = commentArea.value; });
      dynamic.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Comentario para la próxima vez'), commentArea]));
      if (isEdit) {
        dynamic.appendChild(el('div', { style: 'font-size:12.5px;color:var(--ink-soft);margin:-6px 0 14px;' },
          `Próximo vencimiento actual: ${t.currentDueDate ? formatDateEs(t.currentDueDate) : '—'} (podés cambiarlo abajo en "Reprogramar")`));
        const reprogInput = el('input', { type: 'date', value: t.currentDueDate || '' });
        reprogInput.addEventListener('change', () => { t.currentDueDate = reprogInput.value || t.currentDueDate; });
        dynamic.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Reprogramar próximo vencimiento'), reprogInput]));
        dynamic.appendChild(buildDateQuickPicks(Store.getUpcomingSpecialDays({ limit: 6 }), (d) => { reprogInput.value = d; t.currentDueDate = d; }));
      }
    }
    dynamic.appendChild(buildReminderSection(t));
  }
  rebuildDynamic();

  // Categoría + etiquetas
  const catSelect = el('select', {});
  catSelect.appendChild(el('option', { value: '' }, 'Sin categoría'));
  for (const c of Store.listCategories()) {
    const opt = el('option', { value: c.id }, `${c.icon || ''} ${c.name}`);
    if (c.id === t.categoryId) opt.selected = true;
    catSelect.appendChild(opt);
  }
  catSelect.addEventListener('change', () => {
    t.categoryId = catSelect.value || null;
    const cat = Store.getCategory(t.categoryId);
    if (cat && !t.estimatedMinutes) { estInput.value = cat.estimatedMinutes || ''; t.estimatedMinutes = cat.estimatedMinutes || 0; }
  });
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Categoría'), catSelect]));

  const tagsInput = el('input', { type: 'text', placeholder: 'separadas por coma', value: (t.tags || []).join(', ') });
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Etiquetas'), tagsInput]));

  const estInput = el('input', { type: 'number', min: '0', step: '5', value: t.estimatedMinutes || '' });
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Tiempo estimado (minutos)'), estInput]));

  const notesArea = el('textarea', { placeholder: 'Notas…' }, t.notes || '');
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Notas'), notesArea]));

  // Subtareas
  form.appendChild(el('div', { class: 'field' }, [
    el('label', {}, 'Subtareas'),
    renderStepTree(t.subtasks, { onMutate: () => {} }),
  ]));

  // Botones
  const saveBtn = el('button', { class: 'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Crear tarea');
  saveBtn.addEventListener('click', () => {
    t.title = titleInput.value.trim();
    if (!t.title) { toast('Poné un título para la tarea.'); return; }
    t.tags = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    t.estimatedMinutes = Number(estInput.value) || 0;
    t.notes = notesArea.value;
    persistTask(t, isEdit);
  });
  const btnRow = el('div', { class: 'btn-row' }, [saveBtn]);
  if (isEdit) {
    const delBtn = el('button', { class: 'btn btn-danger' }, 'Eliminar');
    delBtn.addEventListener('click', () => handleDelete(t));
    btnRow.appendChild(delBtn);
  }
  form.appendChild(btnRow);

  openSheet(form, { title: isEdit ? 'Editar tarea' : 'Nueva tarea' });
}

function buildReminderSection(t) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, 'Recordatorio'));
  const row = el('div', { class: 'row2' });
  const toggle = el('button', { class: 'chip' + (t.reminder.enabled ? ' active' : '') }, t.reminder.enabled ? '🔔 Activado' : '🔕 Desactivado');
  toggle.addEventListener('click', () => { t.reminder.enabled = !t.reminder.enabled; toggle.className = 'chip' + (t.reminder.enabled ? ' active' : ''); toggle.textContent = t.reminder.enabled ? '🔔 Activado' : '🔕 Desactivado'; });
  row.appendChild(toggle);
  wrap.appendChild(row);

  const row2 = el('div', { class: 'row2', style: 'margin-top:8px;' });
  const timeInput = el('input', { type: 'time', value: t.reminder.time || '09:00' });
  timeInput.addEventListener('change', () => { t.reminder.time = timeInput.value; });
  const offsetInput = el('input', { type: 'number', min: '0', value: t.reminder.offsetDays || 0 });
  offsetInput.addEventListener('change', () => { t.reminder.offsetDays = Number(offsetInput.value) || 0; });
  row2.appendChild(el('div', {}, [el('label', { style: 'font-size:11px;color:var(--ink-soft);' }, 'Hora'), timeInput]));
  row2.appendChild(el('div', {}, [el('label', { style: 'font-size:11px;color:var(--ink-soft);' }, 'Días antes'), offsetInput]));
  wrap.appendChild(row2);
  return wrap;
}

function persistTask(t, isEdit) {
  if (t.type !== 'once') {
    if (!isEdit || !t.currentDueDate) {
      t.currentDueDate = R.toISODate(R.computeInitialDueDate(t.rule, t.rule.anchorDate || todayISO()));
    }
  }
  let saved;
  if (isEdit) saved = Store.updateTask(t.id, t);
  else saved = Store.createTask(t);
  Push.syncTaskReminder(saved.id);
  closeSheet();
  toast(isEdit ? 'Tarea actualizada' : 'Tarea creada');
}

// ---------- constructor de la regla de recurrencia ----------

function buildRuleBuilder(t) {
  const wrap = el('div');
  const rule = t.rule;
  rule.mode = t.type === 'after' ? 'after' : 'every';

  const summaryEl = el('div', { style: 'font-size:12.5px;color:var(--teal);font-weight:600;margin:-2px 0 10px;' });
  function updateSummary() { summaryEl.textContent = '→ ' + R.humanizeRule(rule); }

  const unitSeg = el('div', { class: 'segmented' });
  const units = [['day', 'Días'], ['week', 'Semanas'], ['month', 'Meses'], ['year', 'Años']];
  for (const [val, label] of units) {
    const b = el('button', { class: rule.unit === val ? 'active' : '' }, label);
    b.addEventListener('click', () => { rule.unit = val; rebuild(); });
    unitSeg.appendChild(b);
  }

  const intervalInput = el('input', { type: 'number', min: '1', value: rule.interval || 1 });
  intervalInput.addEventListener('change', () => { rule.interval = Math.max(1, Number(intervalInput.value) || 1); updateSummary(); });
  intervalInput.addEventListener('input', () => { rule.interval = Math.max(1, Number(intervalInput.value) || 1); updateSummary(); });

  const sub = el('div');

  function rebuild() {
    [...unitSeg.children].forEach((b, i) => b.className = units[i][0] === rule.unit ? 'active' : '');
    sub.innerHTML = '';
    if (rule.mode === 'after') { updateSummary(); return; } // 'después de' solo necesita unidad + intervalo
    if (rule.unit === 'week') {
      rule.weekdays = rule.weekdays && rule.weekdays.length ? rule.weekdays : [1];
      const grid = el('div', { class: 'weekday-grid' });
      R.WEEKDAY_SHORT.forEach((label, idx) => {
        const b = el('button', { class: rule.weekdays.includes(idx) ? 'active' : '' }, label);
        b.addEventListener('click', () => {
          if (rule.weekdays.includes(idx)) rule.weekdays = rule.weekdays.filter(d => d !== idx);
          else rule.weekdays.push(idx);
          b.className = rule.weekdays.includes(idx) ? 'active' : '';
          updateSummary();
        });
        grid.appendChild(b);
      });
      sub.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Días de la semana'), grid]));
    } else if (rule.unit === 'month' || rule.unit === 'year') {
      rule.monthRule = rule.monthRule || { kind: 'dayOfMonth', day: 1 };
      const kindSeg = el('div', { class: 'segmented' });
      for (const [val, label] of [['dayOfMonth', 'Día del mes'], ['nthWeekday', 'Posición + día']]) {
        const b = el('button', { class: rule.monthRule.kind === val ? 'active' : '' }, label);
        b.addEventListener('click', () => { rule.monthRule.kind = val; rebuild(); });
        kindSeg.appendChild(b);
      }
      sub.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Patrón'), kindSeg]));

      if (rule.monthRule.kind === 'dayOfMonth') {
        const isLast = rule.monthRule.day === 'last';
        const dayInput = el('input', { type: 'number', min: '1', max: '31', value: isLast ? 31 : (rule.monthRule.day || 1), disabled: isLast ? 'disabled' : undefined });
        dayInput.addEventListener('change', () => { rule.monthRule.day = Number(dayInput.value) || 1; updateSummary(); });
        const lastChip = el('button', { class: 'chip' + (isLast ? ' active' : '') }, 'Último día del mes');
        lastChip.addEventListener('click', () => {
          rule.monthRule.day = isLast ? 1 : 'last';
          rebuild();
        });
        sub.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Día'), el('div', { class: 'row2' }, [dayInput, lastChip])]));
      } else {
        const nSel = el('select', {});
        for (const [val, label] of [[1, '1°'], [2, '2°'], [3, '3°'], [4, '4°'], [-1, 'Último']]) {
          const o = el('option', { value: val }, label);
          if (rule.monthRule.n === val) o.selected = true;
          nSel.appendChild(o);
        }
        nSel.addEventListener('change', () => { rule.monthRule.n = Number(nSel.value); updateSummary(); });
        const wSel = el('select', {});
        R.WEEKDAY_NAMES.forEach((name, idx) => {
          const o = el('option', { value: idx }, name);
          if ((rule.monthRule.weekday ?? 1) === idx) o.selected = true;
          wSel.appendChild(o);
        });
        wSel.addEventListener('change', () => { rule.monthRule.weekday = Number(wSel.value); updateSummary(); });
        sub.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Cuál'), el('div', { class: 'row2' }, [nSel, wSel])]));
      }
      if (rule.unit === 'year') {
        const mSel = el('select', {});
        R.MONTH_NAMES.forEach((name, idx) => {
          const o = el('option', { value: idx + 1 }, name);
          if ((rule.month || 1) === idx + 1) o.selected = true;
          mSel.appendChild(o);
        });
        mSel.addEventListener('change', () => { rule.month = Number(mSel.value); updateSummary(); });
        sub.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Mes'), mSel]));
      }
    }
    if (rule.mode === 'every') {
      const anchorInput = el('input', { type: 'date', value: rule.anchorDate || todayISO() });
      anchorInput.addEventListener('change', () => { rule.anchorDate = anchorInput.value; updateSummary(); });
      sub.appendChild(el('div', { class: 'field' }, [el('label', {}, 'A partir de'), anchorInput]));
      sub.appendChild(buildDateQuickPicks(Store.getUpcomingSpecialDays({ limit: 6 }), (d) => { anchorInput.value = d; rule.anchorDate = d; updateSummary(); }));
    }
    updateSummary();
  }
  rebuild();

  wrap.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Unidad'), unitSeg]));
  wrap.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Cada cuántas'), intervalInput]));
  wrap.appendChild(sub);
  if (!t.id && rule.mode === 'after') {
    const startInput = el('input', { type: 'date', value: rule.anchorDate || todayISO() });
    startInput.addEventListener('change', () => { rule.anchorDate = startInput.value; });
    wrap.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Primer vencimiento'), startInput]));
    wrap.appendChild(buildDateQuickPicks(Store.getUpcomingSpecialDays({ limit: 6 }), (d) => { startInput.value = d; rule.anchorDate = d; }));
  }
  wrap.appendChild(summaryEl);
  return wrap;
}
