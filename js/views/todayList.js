// ritmo/js/views/todayList.js
// Lista de hoy: lista ordenable de tareas que el usuario quiere hacer hoy.
// No tiene concepto de "salida" — persiste hasta que la limpiás.
// Marcar una tarea la completa también en el store principal.

import { el, openSheet, closeSheet, toast, escapeHtml } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import { todayISO } from '../ui.js';
import { buildTaskPicker } from './taskPicker.js';

function swap(arr, i, j) { [arr[i], arr[j]] = [arr[j], arr[i]]; }

/** Renderiza el pill de la lista de hoy en el header. */
export function renderTodayListPill(container, onRefresh) {
  let list = Store.getTodayList();
  if (list) {
    const { items: synced, changed } = Store.syncListItems(list.items);
    if (changed) { Store.updateTodayListItems(synced); list = Store.getTodayList(); }
  }
  const hasItems = list && list.items.length > 0;
  const pending = hasItems ? list.items.filter(i => !i.done).length : 0;
  const pill = el('button', {
    class: 'header-pill today-list-pill' + (hasItems ? ' today-list-active' : ''),
    title: hasItems ? 'Lista de hoy' : 'Armar lista de hoy',
  });
  pill.innerHTML = hasItems
    ? `📋 <span>${pending} pendiente${pending !== 1 ? 's' : ''}</span>`
    : '📋';
  pill.addEventListener('click', () => openTodayListSheet(onRefresh));
  container.appendChild(pill);
}

export function openTodayListSheet(onRefresh) {
  const list = Store.getTodayList();
  if (!list) {
    openPickerSheet(onRefresh);
  } else {
    openActiveSheet(onRefresh);
  }
}

// ---------- initial picker ----------

function openPickerSheet(onRefresh) {
  const wrap = el('div');
  const selectedItems = []; // { taskId, stepId, title }
  const selectedIds = new Set();

  wrap.appendChild(el('p', { style: 'font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;' },
    'Elegí las tareas para tu lista de hoy. Podés reordenarlas después.'));

  // Selected preview
  const previewEl = el('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px;min-height:0;' });
  function refreshPreview() {
    previewEl.innerHTML = '';
    if (!selectedItems.length) {
      previewEl.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-soft);padding:4px 0;' }, 'Nada seleccionado todavía.'));
      return;
    }
    selectedItems.forEach((it, idx) => {
      const row = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--teal-soft);border-radius:8px;font-size:13px;' });
      row.appendChild(el('div', { style: 'flex:1;' }, it.title));
      if (idx > 0) {
        row.appendChild(el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--ink-soft);padding:0 3px;', onClick: () => { swap(selectedItems, idx, idx - 1); refreshPreview(); } }, '↑'));
      }
      if (idx < selectedItems.length - 1) {
        row.appendChild(el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--ink-soft);padding:0 3px;', onClick: () => { swap(selectedItems, idx, idx + 1); refreshPreview(); } }, '↓'));
      }
      row.appendChild(el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--terracotta);padding:0 4px;', onClick: () => {
        selectedIds.delete(it.taskId || ('_' + it.title));
        selectedItems.splice(idx, 1);
        refreshPreview();
        picker.innerHTML = '';
        picker.appendChild(buildTaskPicker({ excludeTaskIds: selectedIds, onPick, onNewTask }));
        picker.focusSearch?.();
      } }, '✕'));
      previewEl.appendChild(row);
    });
  }
  refreshPreview();
  wrap.appendChild(previewEl);

  function onPick(task) {
    if (selectedIds.has(task.id)) return;
    selectedIds.add(task.id);
    selectedItems.push({ taskId: task.id, stepId: null, title: task.title });
    refreshPreview();
  }
  function onNewTask(title) {
    const task = Store.createTask({ title, type: 'once', dueDate: todayISO() });
    selectedIds.add(task.id);
    selectedItems.push({ taskId: task.id, stepId: null, title });
    refreshPreview();
    toast(`"${title}" creada y agregada`);
    // Rebuild picker with the new exclusion
    picker.innerHTML = '';
    picker.appendChild(buildTaskPicker({ excludeTaskIds: selectedIds, onPick, onNewTask }));
  }

  const picker = el('div');
  picker.appendChild(buildTaskPicker({ excludeTaskIds: selectedIds, onPick, onNewTask }));
  wrap.appendChild(picker);

  const startBtn = el('button', { class: 'btn btn-primary', style: 'margin-top:14px;' }, '📋 Crear lista');
  startBtn.addEventListener('click', () => {
    if (!selectedItems.length) { toast('Elegí al menos una tarea.'); return; }
    Store.startTodayList(selectedItems);
    closeSheet();
    onRefresh();
    setTimeout(() => openActiveSheet(onRefresh), 80);
  });
  wrap.appendChild(startBtn);

  openSheet(wrap, { title: '📋 Lista de hoy' });
  picker.focusSearch?.();
}

// ---------- active checklist ----------

function openActiveSheet(onRefresh) {
  const wrap = el('div');

  function rebuild() {
    wrap.innerHTML = '';
    let list = Store.getTodayList();
    if (!list) return;
    // Sync with live task store
    const { items: synced, changed } = Store.syncListItems(list.items);
    if (changed) { Store.updateTodayListItems(synced); list = Store.getTodayList(); }
    const done = list.items.filter(i => i.done).length;
    const total = list.items.length;

    const progressLabel = el('div', { style: 'font-size:12.5px;color:var(--ink-soft);' }, `${done}/${total} listas`);
    const progressFill = el('div', { style: `width:${total ? Math.round(done / total * 100) : 0}%` });
    wrap.appendChild(el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px;' }, [
      progressLabel,
      el('div', { class: 'progress-bar', style: 'flex:1;' }, progressFill),
    ]));

    const listEl = el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
    list.items.forEach((item, idx) => {
      const card = el('div', { style: `display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1px solid var(--line);background:${item.done ? 'var(--surface-2)' : 'var(--surface)'};` });

      const chk = el('div', { style: `width:24px;height:24px;border-radius:50%;border:2px solid ${item.done ? 'var(--olive)' : 'var(--line)'};background:${item.done ? 'var(--olive)' : 'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto;color:#fff;font-size:13px;` }, item.done ? '✓' : '');
      chk.addEventListener('click', () => {
        const nowDone = !item.done;
        Store.setTodayListItemDone(item.id, nowDone);
        if (nowDone) {
          if (item.taskId) Store.completeTask(item.taskId, { computeNextDueDate: R.computeNextDueDate });
          else if (item.stepId) Store.completeStepById(item.stepId);
        } else {
          if (item.taskId) Store.uncompleteTask(item.taskId);
        }
        onRefresh();
        rebuild();
      });

      const lbl = el('div', { style: `flex:1;min-width:0;font-size:14px;font-weight:500;${item.done ? 'text-decoration:line-through;color:var(--ink-soft);' : ''}` }, escapeHtml(item.title));

      const reorder = el('div', { style: 'display:flex;flex-direction:column;gap:1px;' });
      if (idx > 0 && !item.done) {
        reorder.appendChild(el('button', { style: 'border:none;background:none;color:var(--ink-soft);padding:1px 4px;cursor:pointer;font-size:12px;', onClick: () => { const items = [...list.items]; swap(items, idx, idx - 1); Store.updateTodayListItems(items); rebuild(); } }, '↑'));
      }
      if (idx < list.items.length - 1 && !item.done) {
        reorder.appendChild(el('button', { style: 'border:none;background:none;color:var(--ink-soft);padding:1px 4px;cursor:pointer;font-size:12px;', onClick: () => { const items = [...list.items]; swap(items, idx, idx + 1); Store.updateTodayListItems(items); rebuild(); } }, '↓'));
      }

      card.appendChild(chk);
      card.appendChild(lbl);
      card.appendChild(reorder);
      listEl.appendChild(card);
    });
    wrap.appendChild(listEl);

    // Add more — collapsible
    const addSection = el('div', { style: 'margin-top:14px;' });
    let expanded = false;
    const toggleBtn = el('button', { class: 'btn btn-secondary' }, '+ Agregar más');
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      toggleBtn.textContent = expanded ? '− Cerrar' : '+ Agregar más';
      addPanel.style.display = expanded ? '' : 'none';
      if (expanded) pickerEl.focusSearch?.();
    });
    const addPanel = el('div', { style: 'display:none;margin-top:10px;' });
    const currentIds = new Set((list.items).map(i => i.taskId).filter(Boolean));
    const pickerEl = buildTaskPicker({
      excludeTaskIds: currentIds,
      onPick: (task) => {
        const cur = Store.getTodayList();
        Store.updateTodayListItems([...cur.items, { id: Store.uid(), taskId: task.id, stepId: null, title: task.title, done: false }]);
        onRefresh();
        rebuild();
        toast(`"${task.title}" agregada`);
      },
      onNewTask: (title) => {
        const task = Store.createTask({ title, type: 'once', dueDate: todayISO() });
        const cur = Store.getTodayList();
        Store.updateTodayListItems([...cur.items, { id: Store.uid(), taskId: task.id, stepId: null, title, done: false }]);
        onRefresh();
        rebuild();
        toast(`"${title}" creada y agregada`);
      },
    });
    addPanel.appendChild(pickerEl);
    addSection.appendChild(toggleBtn);
    addSection.appendChild(addPanel);
    wrap.appendChild(addSection);

    const clearBtn = el('button', { class: 'btn btn-danger', style: 'margin-top:8px;' }, 'Limpiar lista');
    clearBtn.addEventListener('click', () => {
      if (!confirm('¿Limpiar la lista de hoy? Las tareas sin marcar seguirán en tu lista normal.')) return;
      Store.clearTodayList();
      closeSheet();
      onRefresh();
      toast('Lista limpiada.');
    });
    wrap.appendChild(clearBtn);
  }

  rebuild();
  openSheet(wrap, { title: '📋 Lista de hoy' });
}
