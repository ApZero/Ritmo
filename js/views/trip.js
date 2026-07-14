// ritmo/js/views/trip.js
// Planificador de salida: lista ordenable de tareas para una salida al centro.
// El viaje se cierra solo cuando todo está marcado, o manualmente.
// Las tareas sin marcar simplemente quedan como tareas normales.

import { el, openSheet, closeSheet, toast, escapeHtml } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import { todayISO, formatDateEs } from '../ui.js';
import { openTaskFormExternal } from './tasks.js';
import { buildTaskPicker } from './taskPicker.js';

function swap(arr, i, j) { [arr[i], arr[j]] = [arr[j], arr[i]]; }

/** Renderiza el pill/botón del viaje en el header de Hoy. */
export function renderTripPill(container, onRefreshHoy) {
  const trip = Store.getTrip();
  const hasTrip = trip && !trip.endedAt;
  const pill = el('button', {
    class: 'header-pill trip-pill' + (hasTrip ? ' trip-active' : ''),
    title: hasTrip ? 'Viaje en curso' : 'Planificar salida',
  });
  pill.innerHTML = hasTrip
    ? `🚗 <span>${trip.items.filter(i => !i.done).length} pendientes</span>`
    : '🚗';
  pill.addEventListener('click', () => openTripSheet(onRefreshHoy));
  container.appendChild(pill);
}

/** Abre el sheet principal del viaje. */
export function openTripSheet(onRefreshHoy) {
  const trip = Store.getTrip();
  if (trip && !trip.endedAt) {
    openActiveTripSheet(onRefreshHoy);
  } else {
    openNewTripSheet(onRefreshHoy);
  }
}

// ---------- nuevo viaje: elegir y ordenar tareas ----------

function openNewTripSheet(onRefreshHoy) {
  const wrap = el('div');
  const selectedItems = []; // { taskId, stepId, title }
    const selectedIds = new Set();

    wrap.appendChild(el('p', { style: 'font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;' },
      'Elegí las tareas que vas a hacer en esta salida. Podés reordenarlas después.'));

    // Selected preview with reorder
    const previewEl = el('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px;' });
    function refreshPreview() {
      previewEl.innerHTML = '';
      if (!selectedItems.length) {
        previewEl.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-soft);padding:4px 0;' }, 'Nada seleccionado todavía.'));
        return;
      }
      selectedItems.forEach((it, idx) => {
        const row = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--teal-soft);border-radius:8px;font-size:13px;' });
        row.appendChild(el('div', { style: 'flex:1;' }, it.title));
        if (idx > 0) row.appendChild(el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--ink-soft);padding:0 3px;', onClick: () => { swap(selectedItems, idx, idx - 1); refreshPreview(); } }, '↑'));
        if (idx < selectedItems.length - 1) row.appendChild(el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--ink-soft);padding:0 3px;', onClick: () => { swap(selectedItems, idx, idx + 1); refreshPreview(); } }, '↓'));
        row.appendChild(el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--terracotta);padding:0 4px;', onClick: () => {
          selectedIds.delete(it.taskId);
          selectedItems.splice(idx, 1);
          refreshPreview();
          pickerWrap.innerHTML = '';
          pickerWrap.appendChild(buildTaskPicker({ excludeTaskIds: selectedIds, onPick, onNewTask }));
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
      toast(`"${title}" creada y agregada al viaje`);
      pickerWrap.innerHTML = '';
      pickerWrap.appendChild(buildTaskPicker({ excludeTaskIds: selectedIds, onPick, onNewTask }));
    }

    const pickerWrap = el('div');
    pickerWrap.appendChild(buildTaskPicker({ excludeTaskIds: selectedIds, onPick, onNewTask, placeholder: 'Buscar tarea para la salida…' }));
    wrap.appendChild(pickerWrap);

    const startBtn = el('button', { class: 'btn btn-primary', style: 'margin-top:14px;' }, '🚗 Iniciar salida');
    startBtn.addEventListener('click', () => {
      if (!selectedItems.length) { toast('Elegí al menos una tarea.'); return; }
      Store.startTrip(selectedItems.map(it => ({ ...it, done: false })));
      closeSheet();
      onRefreshHoy();
      setTimeout(() => openActiveTripSheet(onRefreshHoy), 80);
    });
    wrap.appendChild(startBtn);

    openSheet(wrap, { title: '🚗 Planificar salida' });
}

// ---------- viaje activo: checklist reordenable ----------

export function openActiveTripSheet(onRefreshHoy) {
  const trip = Store.getTrip();
  if (!trip) return;

  const wrap = el('div');

  function rebuild() {
    wrap.innerHTML = '';
    const t = Store.getTrip();
    if (!t) return;
    const done = t.items.filter(i => i.done).length;
    const total = t.items.length;
    const progressLabel = el('div', { style: 'font-size:12.5px;color:var(--ink-soft);' }, `${done}/${total} completadas`);
    const progressFill = el('div', { style: `width:${Math.round(done/total*100)}%` });
    wrap.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;' }, [
      progressLabel,
      el('div', { class: 'progress-bar', style: 'flex:1;margin:0 12px;' }, progressFill),
    ]));

    const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
    t.items.forEach((item, idx) => {
      const card = el('div', { style: `display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;border:1px solid var(--line);background:${item.done ? 'var(--surface-2)' : 'var(--surface)'};` });

      const chk = el('div', { style: `width:24px;height:24px;border-radius:50%;border:2px solid ${item.done ? 'var(--olive)' : 'var(--line)'};background:${item.done ? 'var(--olive)' : 'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto;color:#fff;font-size:13px;` }, item.done ? '✓' : '');
      chk.addEventListener('click', () => {
        const nowDone = !item.done;
        Store.setTripItemDone(item.id, nowDone);

        // Also complete / uncomplete the real task or step
        if (nowDone) {
          if (item.taskId) {
            Store.completeTask(item.taskId, { computeNextDueDate: R.computeNextDueDate });
          } else if (item.stepId) {
            Store.completeStepById(item.stepId);
          }
        } else {
          if (item.taskId) Store.uncompleteTask(item.taskId);
        }

        const updatedTrip = Store.getTrip();
        // Auto-end when everything ticked
        if (updatedTrip && updatedTrip.items.every(i => i.done)) {
          Store.endTrip();
          closeSheet();
          toast('¡Salida completada! 🎉');
          onRefreshHoy();
          return;
        }
        rebuild();
      });

      const lbl = el('div', { style: `flex:1;min-width:0;font-size:14px;font-weight:500;${item.done ? 'text-decoration:line-through;color:var(--ink-soft);' : ''}` }, escapeHtml(item.title));

      const reorderBtns = el('div', { style: 'display:flex;flex-direction:column;gap:1px;flex:0 0 auto;' });
      if (idx > 0 && !item.done) {
        const up = el('button', { style: 'border:none;background:none;color:var(--ink-soft);padding:1px 4px;cursor:pointer;font-size:12px;', onClick: () => {
          const items = [...t.items];
          swap(items, idx, idx - 1);
          Store.updateTripItems(items);
          rebuild();
        } }, '↑');
        reorderBtns.appendChild(up);
      }
      if (idx < t.items.length - 1 && !item.done) {
        const dn = el('button', { style: 'border:none;background:none;color:var(--ink-soft);padding:1px 4px;cursor:pointer;font-size:12px;', onClick: () => {
          const items = [...t.items];
          swap(items, idx, idx + 1);
          Store.updateTripItems(items);
          rebuild();
        } }, '↓');
        reorderBtns.appendChild(dn);
      }

      card.appendChild(chk);
      card.appendChild(lbl);
      card.appendChild(reorderBtns);
      list.appendChild(card);
    });
    wrap.appendChild(list);

    // ---- Agregar más tareas ----
    const addSection = el('div', { style: 'margin-top:14px;' });
    let addExpanded = false;

    const toggleBtn = el('button', { class: 'btn btn-secondary' }, '+ Agregar tareas');
    toggleBtn.addEventListener('click', () => {
      addExpanded = !addExpanded;
      addPanel.style.display = addExpanded ? '' : 'none';
      toggleBtn.textContent = addExpanded ? '− Cerrar' : '+ Agregar tareas';
      if (addExpanded) pickerEl.focusSearch?.();
    });

    const addPanel = el('div', { style: 'display:none;margin-top:10px;' });
    const currentIds = new Set((t.items).map(i => i.taskId).filter(Boolean));

    const pickerEl = buildTaskPicker({
      excludeTaskIds: currentIds,
      onPick: (task) => {
        const cur = Store.getTrip();
        Store.updateTripItems([...cur.items, { id: Store.uid(), taskId: task.id, stepId: null, title: task.title, done: false }]);
        onRefreshHoy();
        rebuild();
        toast(`"${task.title}" agregada`);
      },
      onNewTask: (title) => {
        const task = Store.createTask({ title, type: 'once', dueDate: todayISO() });
        const cur = Store.getTrip();
        Store.updateTripItems([...cur.items, { id: Store.uid(), taskId: task.id, stepId: null, title, done: false }]);
        onRefreshHoy();
        rebuild();
        toast(`"${title}" creada y agregada`);
      },
      placeholder: 'Buscar tarea para agregar…',
    });

    addPanel.appendChild(pickerEl);
    addSection.appendChild(toggleBtn);
    addSection.appendChild(addPanel);
    wrap.appendChild(addSection);

    const endBtn = el('button', { class: 'btn btn-secondary', style: 'margin-top:10px;' }, 'Terminar salida');
    endBtn.addEventListener('click', () => {
      Store.endTrip();
      closeSheet();
      onRefreshHoy();
      toast('Salida terminada. Las tareas sin marcar siguen en tu lista.');
    });
    wrap.appendChild(endBtn);
  }

  rebuild();
  openSheet(wrap, { title: '🚗 Salida en curso' });
}
