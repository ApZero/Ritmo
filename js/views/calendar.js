// ritmo/js/views/calendar.js
import { el, openSheet, formatDateEs } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';

export const fab = null;

const state = { year: new Date().getFullYear(), month: new Date().getMonth(), taskId: 'all' };

export function render(container) {
  const tasks = Store.listTasks().filter(t => !t.archived);
  const projects = Store.listProjects().filter(p => !p.archived);

  const filterRow = el('div', { style: 'padding:0 18px 12px;' });
  const select = el('select', {});
  select.appendChild(el('option', { value: 'all' }, 'Todas las tareas y proyectos'));
  for (const t of tasks.filter(t => t.type !== 'once')) {
    const o = el('option', { value: t.id }, t.title);
    if (state.taskId === t.id) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => { state.taskId = select.value; refresh(); });
  filterRow.appendChild(select);
  container.appendChild(filterRow);

  container.appendChild(buildNav());
  container.appendChild(buildGrid(tasks, projects));
}

function refresh() {
  const v = document.getElementById('view');
  v.innerHTML = '';
  render(v);
}

function buildNav() {
  const label = new Date(state.year, state.month, 1).toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
  const prev = el('button', {}, '‹');
  prev.addEventListener('click', () => { state.month--; if (state.month < 0) { state.month = 11; state.year--; } refresh(); });
  const next = el('button', {}, '›');
  next.addEventListener('click', () => { state.month++; if (state.month > 11) { state.month = 0; state.year++; } refresh(); });
  return el('div', { class: 'cal-nav' }, [prev, el('div', { class: 'display', style: 'font-size:16px;text-transform:capitalize;' }, label), next]);
}

function collectEventsByDay(tasks, projects) {
  // mapa 'YYYY-MM-DD' -> [{title, late, comment, dueDate}]
  const map = {};
  const add = (dateStr, entry) => { (map[dateStr] = map[dateStr] || []).push(entry); };
  for (const t of tasks) {
    if (state.taskId !== 'all' && t.id !== state.taskId) continue;
    if (t.type === 'once') {
      if (t.completed && t.completedAt) add(t.completedAt.slice(0, 10), { title: t.title, late: false });
    } else {
      for (const h of t.history || []) {
        if (!h.completedAt) continue;
        const late = h.dueDate && h.completedAt.slice(0, 10) > h.dueDate;
        add(h.completedAt.slice(0, 10), { title: t.title, late, comment: h.comment, dueDate: h.dueDate });
      }
    }
  }
  if (state.taskId === 'all') {
    for (const p of projects) {
      for (const { step } of Store.listAllStepsWithDates({ includeCompleted: true }).filter(e => e.project.id === p.id)) {
        if (step.completed && step.completedAt) add(step.completedAt.slice(0, 10), { title: `${step.title} (📁 ${p.title})`, late: false });
      }
    }
  }
  return map;
}

function buildGrid(tasks, projects) {
  const eventsByDay = collectEventsByDay(tasks, projects);
  const grid = el('div', { class: 'cal-grid' });
  for (const d of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) grid.appendChild(el('div', { class: 'cal-dow' }, d));

  const first = new Date(state.year, state.month, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < startOffset; i++) grid.appendChild(el('div', { class: 'cal-day empty' }));

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${state.year}-${String(state.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = eventsByDay[dateStr] || [];
    const isToday = dateStr === todayStr;
    const isWeekend = Store.isWeekend(dateStr);
    const special = Store.getSpecialDay(dateStr);
    let cls = 'cal-day' + (isToday ? ' today' : '') + (isWeekend ? ' weekend' : '') + (special ? ' special' : '');
    const cell = el('div', { class: cls });
    cell.appendChild(el('div', {}, String(day)));
    if (special) cell.appendChild(el('div', { style: 'position:absolute;top:3px;right:4px;font-size:9px;' }, special.type === 'feriado' ? '📌' : '🌿'));
    if (events.length) {
      const dots = el('div', { class: 'dots' });
      events.slice(0, 4).forEach(e => dots.appendChild(el('span', { style: e.late ? 'background:var(--ochre)' : '' })));
      cell.appendChild(dots);
    }
    cell.addEventListener('click', () => openDaySheet(dateStr, events, tasks, special));
    grid.appendChild(cell);
  }
  return grid;
}

function openDaySheet(dateStr, events, tasks, special) {
  const wrap = el('div');
  if (special) {
    wrap.appendChild(el('div', { class: 'tag-pill', style: 'background:var(--teal-soft);color:var(--teal);font-weight:600;margin-bottom:12px;' },
      `${special.type === 'feriado' ? '📌' : '🌿'} ${special.label}`));
  } else if (Store.isWeekend(dateStr)) {
    wrap.appendChild(el('div', { class: 'tag-pill', style: 'background:var(--teal-soft);color:var(--teal);font-weight:600;margin-bottom:12px;' }, '🌤️ Fin de semana'));
  }
  if (events.length) {
    wrap.appendChild(el('div', { class: 'section-label', style: 'padding-left:0;' }, 'Completado este día'));
    for (const e of events) {
      wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:8px;' }, [
        el('div', { class: 'card-title', style: 'font-size:14px;' }, e.title),
        e.late ? el('div', { style: 'font-size:12px;color:var(--ochre);' }, `Se hizo tarde (vencía ${formatDateEs(e.dueDate)})`) : null,
        e.comment ? el('div', { class: 'card-comment' }, `💬 ${e.comment}`) : null,
      ]));
    }
  }
  const dueTasks = tasks.filter(t => {
    const due = t.type === 'once' ? t.dueDate : t.currentDueDate;
    return due === dateStr && !(t.type === 'once' && t.completed);
  }).map(t => t.title);
  const dueSteps = Store.listAllStepsWithDates().filter(e => e.step.dueDate === dateStr).map(e => `${e.step.title} (📁 ${e.project.title})`);
  const dueThatDay = [...dueTasks, ...dueSteps];
  if (dueThatDay.length) {
    wrap.appendChild(el('div', { class: 'section-label', style: 'padding-left:0;' }, 'Vence este día'));
    for (const title of dueThatDay) wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:8px;' }, el('div', { class: 'card-title', style: 'font-size:14px;' }, title)));
  }
  if (!events.length && !dueThatDay.length) wrap.appendChild(el('div', { style: 'color:var(--ink-soft);padding:10px 0;' }, 'Sin actividad este día.'));
  openSheet(wrap, { title: formatDateEs(dateStr) });
}
