// ritmo/js/views/taskPicker.js
// Selector reutilizable de tareas con barra de búsqueda, lista scrolleable y
// campo de creación rápida. Se usa en el Trip y en la Lista de hoy para
// elegir y agregar tareas desde el mismo lugar.
//
// buildTaskPicker(opts) → Element
//   opts.excludeTaskIds : Set<string>   ids ya en la lista, no mostrar
//   opts.onPick(task)                   callback al elegir una existente
//   opts.onNewTask(title) → task|null   callback al crear una nueva (puede crear en store o no)
//   opts.placeholder                    texto del input de búsqueda
//   opts.emptyMsg                       mensaje cuando no hay resultados

import { el } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import { todayISO } from '../ui.js';

export function buildTaskPicker({
  excludeTaskIds = new Set(),
  onPick,
  onNewTask,
  placeholder = 'Buscar tarea…',
  emptyMsg = 'No hay tareas disponibles.',
} = {}) {
  const wrapper = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });

  // Search bar
  const searchInput = el('input', { type: 'text', placeholder });
  searchInput.style.cssText = 'width:100%;padding:9px 12px;border:1.5px solid var(--teal);border-radius:10px;font-size:14px;';
  wrapper.appendChild(searchInput);

  // Quick-add row (always visible, above the list)
  if (onNewTask) {
    const quickRow = el('div', { style: 'display:flex;gap:8px;' });
    const quickInput = el('input', { type: 'text', placeholder: 'Agregar tarea nueva…', style: 'flex:1;' });
    const quickBtn = el('button', {
      class: 'btn btn-primary', style: 'width:auto;padding:9px 14px;',
      onClick: () => {
        const title = (quickInput.value || searchInput.value).trim();
        if (!title) return;
        onNewTask(title);
        quickInput.value = '';
        searchInput.value = '';
        renderList('');
      },
    }, '+');
    quickRow.appendChild(quickInput);
    quickRow.appendChild(quickBtn);

    // Typing in search also fills quick-add input as a shortcut
    searchInput.addEventListener('input', () => { quickInput.value = searchInput.value; });
    wrapper.appendChild(quickRow);
  }

  // Scrollable task list
  const listEl = el('div', { style: 'max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:5px;' });
  wrapper.appendChild(listEl);

  function renderList(query) {
    listEl.innerHTML = '';
    const q = query.toLowerCase().trim();

    const today = R.toDateOnly(todayISO());
    const settings = Store.getSettings();

    const tasks = Store.listTasks()
      .filter(t => !t.archived && !(t.type === 'once' && t.completed) && !excludeTaskIds.has(t.id))
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const dueA = a.type === 'once' ? a.dueDate : a.currentDueDate;
        const dueB = b.type === 'once' ? b.dueDate : b.currentDueDate;
        const sA = dueA ? R.classifyStatus(R.toDateOnly(dueA), today, settings.proximoWindowDays) : 'z';
        const sB = dueB ? R.classifyStatus(R.toDateOnly(dueB), today, settings.proximoWindowDays) : 'z';
        const order = { vencido: 0, hoy: 1, proximo: 2, a_tiempo: 3, sin_fecha: 4, z: 5 };
        return (order[sA] ?? 5) - (order[sB] ?? 5);
      });

    if (!tasks.length) {
      listEl.appendChild(el('div', { style: 'padding:12px;text-align:center;color:var(--ink-soft);font-size:13px;' }, emptyMsg));
      return;
    }

    for (const t of tasks) {
      const due = t.type === 'once' ? t.dueDate : t.currentDueDate;
      const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--surface);border:1px solid var(--line);border-radius:9px;cursor:pointer;transition:background .12s;' });
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--teal-soft)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'var(--surface)'; });

      const info = el('div', { style: 'flex:1;min-width:0;' }, [
        el('div', { style: 'font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }, t.title),
        due ? el('div', { style: 'font-size:11px;color:var(--ink-soft);margin-top:1px;' },
          R.humanizeCountdown(R.toDateOnly(due), today)) : null,
      ]);
      const addBtn = el('button', { class: 'btn btn-secondary', style: 'width:auto;padding:5px 11px;font-size:12.5px;flex:0 0 auto;' }, 'Agregar');

      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(t);
        // Visually remove the row
        row.style.opacity = '0.35';
        row.style.pointerEvents = 'none';
        addBtn.textContent = '✓';
        // Refresh filter so it disappears after a beat
        setTimeout(() => renderList(searchInput.value), 500);
      });
      row.addEventListener('click', () => addBtn.click());

      row.appendChild(info);
      row.appendChild(addBtn);
      listEl.appendChild(row);
    }
  }

  searchInput.addEventListener('input', () => renderList(searchInput.value));
  renderList('');

  // Focus the search bar when mounted (call after appending to DOM)
  wrapper.focusSearch = () => { setTimeout(() => searchInput.focus(), 80); };
  return wrapper;
}
